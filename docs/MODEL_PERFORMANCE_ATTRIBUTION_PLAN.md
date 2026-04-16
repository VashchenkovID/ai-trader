# Model Performance Attribution Plan

## 1) Цель и конечный результат

Собрать полноценный контур оценки качества моделей, который:

- связывает результат сделки с конкретной версией модели и конфигурацией инференса;
- считает OOS-метрики по временным срезам и рыночным режимам;
- строит корректные equity curve / drawdown метрики;
- использует эти метрики в обучении и runtime-решениях (веса, гейты, fallback).

Конечный артефакт: единая `model-performance attribution` подсистема, встроенная в pipeline `analysis -> signal -> request -> execution -> portfolio -> retraining`.

---

## 2) Проблема текущего состояния

Сейчас есть базовые KPI и post-trade proxy, но нет полного attribution-контура:

- нет обязательной привязки каждого сигнала/сделки к `model_version` и `inference_config_version`;
- нет канонического OOS-протокола с разбиением по периодам и режимам;
- нет нормализованной equity-кривой и максимальной просадки как first-class сущностей;
- ограниченная обратная связь в training loop (метрики не управляют весами/гейтингом в явном виде).

---

## 3) Область охвата

В scope:

- NN, weekly, stacking, fusion NN+LLM;
- paper и real (real может включаться поэтапно);
- offline backtest + online post-trade attribution;
- feature store для training feedback.

Out of scope (этап 1):

- сложные transaction cost models (market impact L2);
- RL policy replacement (оставляем как отдельный контур после стабилизации attribution).

---

## 4) Data Contract (что обязательно логируем)

### 4.1 Signal Attribution Event

Каждый сигнал должен сохранять:

- `signal_id`, `figi`, `timestamp`;
- `model_family` (`nn`, `stacking`, `weekly`, `fusion`);
- `model_version` (hash checkpoint / registry ref);
- `feature_schema_version`;
- `inference_config_version` (пороги, температуры, веса fusion);
- `input_window_meta` (lookback/horizon/seq_len);
- `prediction` (`action`, `score`, `confidence`, optional distribution);
- `llm_context_version` (если использовался LLM enrichment);
- `market_regime_tag` (bull/bear/sideways/high_vol/etc).

### 4.2 Execution Attribution Event

Каждое исполнение:

- `execution_id`, `request_id`, `signal_id`;
- `mode` (`paper`/`real`);
- `actual_price`, `actual_amount`, `quantity`, `fees`, `slippage_bps`;
- `execution_latency_ms`;
- `pre_portfolio_snapshot_id`, `post_portfolio_snapshot_id`.

### 4.3 Portfolio Snapshot Event

Снимок портфеля на timestamp:

- `cash`, `positions_value`, `total_value`;
- `exposure_gross`, `exposure_net`;
- `equity_curve_value` (канонический series point);
- `daily_return`, `rolling_vol`.

---

## 5) Модель данных и storage

### 5.1 Новые таблицы (минимум)

- `model_registry_versions`
  - `model_version_id`, `model_family`, `artifact_path`, `mlflow_run_id`, `created_at`, `status`.
- `signal_attribution_events`
  - ключи сигнала + версия модели + prediction payload.
- `execution_attribution_events`
  - исполнение и связь `signal_id -> execution`.
- `portfolio_equity_timeseries`
  - нормализованная equity series по профилю/режиму.
- `model_oos_metrics`
  - агрегированные OOS-метрики по `model_version`, `slice_key`, `window`.

### 5.2 Индексы

- (`model_version_id`, `timestamp`) для signal/execution;
- (`figi`, `timestamp`) для asset-level attribution;
- (`portfolio_scope`, `timestamp`) для equity curve retrieval;
- (`model_version_id`, `slice_key`, `window_start`) для OOS-аналитики.

---

## 6) Метрики attribution

### 6.1 Signal-level (краткосрочные)

- hit-rate по направлению;
- calibration (Brier / ECE);
- confidence decile reliability;
- latency-to-signal freshness.

### 6.2 Trade-level (post-trade)

- realized PnL per trade;
- win-rate, profit factor;
- expectancy;
- slippage-adjusted return.

### 6.3 Portfolio-level (обязательные)

- equity curve (normalized, base=1.0);
- max drawdown (absolute + duration);
- Sharpe, Sortino, Calmar;
- turnover, exposure utilization.

### 6.4 Attribution cuts

- by `model_version`;
- by `market_regime_tag`;
- by horizon bucket (short/medium/long);
- by asset class / sector;
- by confidence bucket.

---

## 7) OOS protocol (канонический)

### 7.1 Time split policy

- strict time-based split, без shuffle;
- rolling/expanding walk-forward окна;
- fixed holdout windows для релиза.

### 7.2 Leakage guardrails

- feature timestamp <= signal timestamp;
- execution/outcome недоступны для обучения до официального `label_ready_at`;
- контроль look-ahead в unit/integration тестах.

### 7.3 OOS отчет

Для каждого `model_version`:

- aggregate OOS metrics;
- confidence interval (bootstrap);
- worst-slice diagnostics;
- regression vs previous champion.

---

## 8) Runtime integration (как это учитывается нейросетью)

### 8.1 Training feedback loop

Использовать attribution-метрики для:

- sample weighting (понижать вес режимов/срезов с деградацией);
- focal/importance reweighting по confidence calibration error;
- dynamic class weighting по performance drift.

### 8.2 Inference feedback loop

Использовать online attribution для:

- динамического выбора `model_version` (champion/challenger routing);
- адаптации fusion weights (`w_nn`, `w_llm`) по последнему стабильному окну;
- risk gating: снижение агрессии при drawdown breach;
- fallback policy при деградации калибровки.

### 8.3 Governance rules

- auto-promote только при прохождении OOS + post-trade порогов;
- auto-demote при нарушении drawdown / hit-rate / calibration guardrails;
- ручной override с audit trail.

---

## 9) API и отчеты

### 9.1 Новые endpoints

- `GET /api/v1/system/model-attribution/summary?window=...`
- `GET /api/v1/system/model-attribution/equity-curve?modelVersion=...`
- `GET /api/v1/system/model-attribution/oos-slices?modelVersion=...`
- `GET /api/v1/system/model-attribution/drift?window=...`
- `POST /api/v1/training/model-selection/recompute` (пересчет champion/challenger scorecard)

### 9.2 Dashboard blocks

- model version leaderboard;
- equity curve + drawdown curve;
- OOS heatmap by regime/sector/horizon;
- calibration plot by confidence deciles;
- alert panel (degradation events).

---

## 10) Этапы внедрения

### Phase A: Instrumentation (1-2 недели)

- добавить `model_version` и `inference_config_version` во все сигналы;
- расширить execution/paper события до attribution-формата;
- миграции таблиц + индексы.

### Phase B: Attribution Engine (1-2 недели)

- сервис агрегации signal/trade/portfolio метрик;
- расчет equity/drawdown timeseries;
- расчет OOS slice metrics.

### Phase C: Governance & Model Selection (1 неделя)

- scorecard champion/challenger;
- пороги auto-promote/auto-demote;
- audit events + alerting.

### Phase D: Feedback into Training/Inference (1-2 недели)

- sample weighting по attribution drift;
- runtime reweighting fusion;
- safe rollout (canary + rollback).

---

## 11) Критерии приемки

- каждая `EXECUTED` сделка имеет ссылку на `signal_id` и `model_version`;
- есть воспроизводимый OOS отчет по любой версии модели;
- equity curve и max drawdown считаются консистентно для paper/real;
- модельный selection использует attribution scorecard, а не только proxy KPI;
- retraining принимает attribution-derived веса/фичи и демонстрирует улучшение OOS stability.

---

## 12) Риски и меры

- **Риск:** шум на малом числе сделок.  
  **Мера:** min sample gates + Bayesian smoothing + CI.

- **Риск:** data leakage при сборе post-trade label.  
  **Мера:** `label_ready_at`, строгие temporal constraints, тесты look-ahead.

- **Риск:** overfit на недавнем режиме.  
  **Мера:** rolling windows + regime diversification penalties.

- **Риск:** избыточная сложность rollout.  
  **Мера:** фазовый ввод через feature flags + canary.

---

## 13) Минимальный backlog задач

- [ ] DB migration: `model_registry_versions`, `signal_attribution_events`, `execution_attribution_events`, `portfolio_equity_timeseries`, `model_oos_metrics`
- [ ] Запись `model_version` в pipeline рекомендаций/анализа
- [ ] Связь `request -> signal_id` и `execution -> signal_id`
- [ ] Attribution aggregator service + cron job
- [ ] Equity/drawdown calculator + тесты
- [ ] OOS slice evaluator + regression report
- [ ] API endpoints для attribution dashboards
- [ ] Governance scorecard + release-gate extension
- [ ] Training sampler, использующий attribution weights
- [ ] Runtime fusion adapter, использующий attribution drift

