# План миграции Node.js -> Python/FastAPI

## Цель

Перенести серверную часть в `server_fastapi/` без потери бизнес-функционала, с улучшением архитектуры, наблюдаемости и надежности.

## Навигация по доп. документации

- Общий хаб: `python_migration_docs/README.md`
- Каталог бизнес-логики: `python_migration_docs/BUSINESS_LOGIC_CATALOG.md`
- State machines: `python_migration_docs/DOMAIN_STATE_MACHINES.md`
- API и ошибки: `python_migration_docs/API_CONTRACTS_AND_ERROR_CODES.md`
- Критичные флоу: `python_migration_docs/CRITICAL_FLOWS_STEP_BY_STEP.md`
- Traceability matrix: `python_migration_docs/TRACEABILITY_MATRIX.md`
- Gap analysis: `python_migration_docs/GAP_ANALYSIS_AS_IS_VS_TARGET.md`
- Инварианты: `python_migration_docs/INVARIANTS_AND_BUSINESS_RULES.md`
- Схемы и контракты данных: `python_migration_docs/DATA_CONTRACTS_AND_SCHEMAS.md`
- Идемпотентность и конкурентность: `python_migration_docs/IDEMPOTENCY_AND_CONCURRENCY.md`
- Failure modes: `python_migration_docs/FAILURE_MODES_AND_RECOVERY.md`
- Риски внешних зависимостей: `python_migration_docs/DEPENDENCY_RISK_REGISTER.md`
- Observability: `python_migration_docs/OBSERVABILITY_SPEC.md`
- Performance/SLO: `python_migration_docs/PERFORMANCE_AND_SCALABILITY_BUDGETS.md`
- Известные баги/долг: `python_migration_docs/KNOWN_BUGS_AND_TECH_DEBT.md`
- Карта тест-покрытия: `python_migration_docs/TEST_COVERAGE_MAP.md`
- Cutover/Rollback: `python_migration_docs/CUTOVER_AND_ROLLBACK_RUNBOOK.md`
- Чеклист приемки: `python_migration_docs/MIGRATION_ACCEPTANCE_CHECKLIST.md`

## Принципы

- Поэтапная миграция (strangler), без big-bang.
- Совместимость API на время перехода.
- Явные state machines и инварианты.
- Идемпотентность для write-операций (для данного проекта не внедряется).
- Контрактные тесты до cutover.

## Фазы

## Текущий прогресс (на 2026-02-27, обновлено вручную)

- [x] Фаза 0: Foundation
- [x] Фаза 1: Platform parity (auth/settings/system/monitoring, platform contracts)
- [x] Фаза 2: Read-only домены (market/news/performance/profitability endpoints + contract tests)
- [x] Фаза 3 (MVP): Request lifecycle, Mode switch, Auto-paper (включая can-execute, execute), Risk, Recommendation pipeline, Preflight-check (Idempotency убран)
- [x] Фаза 4: Data/AI контуры (NN, ансамбль, стекинг, weekly, LLM-жюри, бэктест, RL, release-gate)
- [x] Фаза 5: Интеграция Tinkoff Invest API
- [x] Фаза 6: Ops + Cutover
- Статус плана: активный, запущен clean-rebuild трек (без legacy aliases и dynamic schema adapters).

### Фаза 0: Foundation

- Каркас FastAPI, `/health`, конфиг, логгер, DI.
- SQLAlchemy + Alembic + базовые миграции.
- Базовые middleware: tracing, errors, security.
- Документы фазы:
  - `python_migration_docs/DATA_CONTRACTS_AND_SCHEMAS.md`
  - `python_migration_docs/API_CONTRACTS_AND_ERROR_CODES.md`
  - `python_migration_docs/OBSERVABILITY_SPEC.md`

### Фаза 1: Platform parity

- Совместимость auth/settings/system/monitoring.
- Единый error envelope + error codes.
- Настройка observability (metrics/logs/traces).
- Документы фазы:
  - `python_migration_docs/GAP_ANALYSIS_AS_IS_VS_TARGET.md`
  - `python_migration_docs/API_CONTRACTS_AND_ERROR_CODES.md`
  - `python_migration_docs/PERFORMANCE_AND_SCALABILITY_BUDGETS.md`

### Фаза 2: Read-only домены

- Market/news/performance/profitability read endpoints.
- Contract tests: Node vs FastAPI response shape.
- Документы фазы:
  - `python_migration_docs/BUSINESS_LOGIC_CATALOG.md`
  - `python_migration_docs/TRACEABILITY_MATRIX.md`
  - `python_migration_docs/TEST_COVERAGE_MAP.md`

### Фаза 3: Write-критичные флоу

- [x] TradingRequest lifecycle (create, approve, reject, execute, cancel).
- [x] Trading modes + validation (current, switch, can-switch).
- [x] Auto-paper status/enable/disable/stats.
- [x] Risk checks и ограничения.
- [x] Recommendation pipeline (`run` с порогами, дедупликация, skip-причины).
- [x] Preflight-check (run, status, results).
- [x] Auto-paper full pipeline: `canAutoExecute`, `autoExecuteRequest` (авто approve+execute для PENDING в paper).
- **Idempotency-Key:** не внедряется (solo-usage).
- Документы фазы:
  - `python_migration_docs/DOMAIN_STATE_MACHINES.md`
  - `python_migration_docs/CRITICAL_FLOWS_STEP_BY_STEP.md`
  - `python_migration_docs/IDEMPOTENCY_AND_CONCURRENCY.md`
  - `python_migration_docs/INVARIANTS_AND_BUSINESS_RULES.md`

### Фаза 4: Data/AI контуры

- [x] Контуры обучения на Python (NN с conditioning, ансамбль, стекинг, weekly forecast, LLM-жюри).
- [x] **Отказ от NewsAPI** в ядре обучения; вместо новостных фичей — **LLM-жюри** (DeepSeek, Perplexity, Giga Chat, Алиса GPT).
- [x] Backtesting + walk-forward (run_backtest, API run-backtest).
- [x] Weekly forecast (LSTM, run_weekly, API run-weekly/run-weekly-from-figi).
- [x] Model weighting/monitoring/release governance (release-gate policy + audit registry).
- [x] RL-контур (tabular Q-learning в `training.rl`, API `POST /api/v1/training/run-rl`).
- Документы фазы:
  - `python_migration_docs/PHASE4_AI_TRAINING_AND_LLM_JURY.md`
  - `python_migration_docs/CRITICAL_FLOWS_STEP_BY_STEP.md`
  - `python_migration_docs/FAILURE_MODES_AND_RECOVERY.md`
  - `python_migration_docs/DEPENDENCY_RISK_REGISTER.md`

### Фаза 5: Интеграция Tinkoff Invest API

- Конфиг: TINKOFF_API_URL, TINKOFF_TOKEN, TINKOFF_ACCOUNT_ID, опции планировщика (cron).
- Клиент: TinkoffApiClient (app/services/tinkoff_client.py) — _request, get_last_prices, get_candles, get_instrument_by_figi, get_portfolio, get_positions, place_order, calculate_commission.
- Эндпоинт портфеля: GET /api/v1/portfolio, GET /api/v1/portfolio/sync.
- Планировщик (APScheduler): периодическая синхронизация портфеля, обновление инструментов (Shares), обновление последних цен; подключение в lifespan приложения.
- Опционально: подтягивание last prices/candles через market_service, assets sync (POST /api/v1/assets/sync).

### Фаза 6: Ops + Cutover

- [x] Retry/fallback/recovery/backup.
- [x] Shadow traffic.
- [x] Canary + final cutover + rollback window.
- Документы фазы:
  - `python_migration_docs/CUTOVER_AND_ROLLBACK_RUNBOOK.md`
  - `python_migration_docs/MIGRATION_ACCEPTANCE_CHECKLIST.md`
  - `python_migration_docs/KNOWN_BUGS_AND_TECH_DEBT.md`

## Критерии готовности

- Функциональный паритет критичных флоу.
- Все критичные переходы статусов покрыты тестами.
- Нет P0/P1 расхождений в контрактных тестах.
- SLO по латентности и error rate соблюдены.

