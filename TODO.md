# AI Trader - Recommended Improvements Backlog

This file collects all recommended features and improvements discussed in chat.
Focus: long-term robustness, measurable edge, and safe real trading.

## Priority Legend

- P0: Critical safety / correctness
- P1: High impact on performance and stability
- P2: Medium impact / scale-up
- P3: Nice-to-have / optimization

---

## P0 - Safety and Correctness

- [ ] Keep strict rule for `real`/`micro`: no auto execution without explicit user confirmation.
- [ ] Add pre-confirmation validation in `real` mode (fresh price, spread, liquidity, stale signal check).
- [ ] Add execution tolerance policy for real orders:
  - max slippage
  - max spread
  - max allowed quote staleness
- [ ] Add hard circuit breakers:
  - daily loss limit
  - max drawdown limit
  - consecutive losses limit
  - auto pause real mode until manual re-enable
- [ ] Ensure all gate failures are fail-safe (block trade by default when metrics unavailable).

---

## P1 - Model and Decision Quality

- [ ] Improve confidence calibration:
  - map raw model confidence to expected return after costs
  - include reliability metrics (Brier/calibration checks)
- [ ] Evolve meta-policy from static rules to adaptive policy learning:
  - regime-aware threshold tuning by rolling OOS results
- [ ] Add formal release gate policy for models:
  - enforce min trades, win rate, profit factor, sharpe/sortino, consistency, max DD
  - block model promotion when any criterion fails
- [ ] Add robust drift response:
  - detect degradation quickly
  - rollback to last stable model
  - optionally switch to signal-only mode

---

## P1 - Backtesting and Paper Realism

- [ ] Keep anti-lookahead protections and add more regression tests.
- [ ] Increase execution realism in paper/backtest:
  - dynamic spread/slippage by liquidity regime
  - partial fill behavior
  - reject/timeout simulation
- [ ] Add scenario tests for stress periods (high volatility, gaps, low liquidity).
- [ ] Add baseline comparisons everywhere:
  - buy & hold
  - simple momentum
  - AI excess return vs baseline

---

## P1 - Observability and Diagnostics

- [ ] Keep structured error context for each operation:
  - traceId, operation, step, figi, requestId, mode
- [ ] Extend admission telemetry:
  - gate pass/block counts
  - blocked by gate type
  - recent trace snapshots
- [ ] Add dedicated API for diagnostics:
  - `/auto-paper/admission-quality`
  - filters by gate/figi/traceId/time window
- [ ] Add dashboard widgets:
  - decision quality
  - admission gates
  - error tracking heatmap by operation

---

## P2 - Real Trading Execution Enhancements

- [ ] Implement two-step confirmation UX in real mode:
  - AI recommendation
  - final user approval after pre-trade checks
- [ ] Add smart confirmation payload:
  - expected edge
  - risk/reward
  - projected worst-case
  - reason flags when near risk limits
- [ ] Add post-trade attribution:
  - what generated PnL (model/regime/entry/exit/size/costs)
- [ ] Add execution quality analytics:
  - expected vs actual fill
  - slippage breakdown
  - rejected opportunities statistics

---

## P2 - Testing Roadmap

- [ ] Add unit tests for admission and release gates:
  - pass/fail boundary tests
  - fail-safe behavior when metrics source unavailable
- [ ] Add unit tests for meta-policy adaptation:
  - regime mapping and threshold adjustment boundaries
- [ ] Add integration tests:
  - end-to-end signal -> gate -> request -> execution flow
  - real-mode confirmation-only path
- [ ] Add regression tests for:
  - anti-lookahead logic
  - error tracking payload shape
  - daily report summaries with gate snapshots

---

## P3 - Governance and Long-Horizon Reliability

- [ ] Introduce stronger model governance:
  - versioned datasets
  - reproducible experiments
  - model registry with promotion history
- [ ] Add release audit trail:
  - who/what promoted model
  - metric evidence snapshot
  - rollback reason if reverted
- [ ] Add shadow-mode validation for new policies before activation.
- [ ] Add periodic retraining and review calendar with automated reports.

---

## Suggested Implementation Order (Pragmatic)

1. P0 safety hardening for real mode and execution tolerance.
2. P1 calibration + release gate hardening + drift rollback.
3. P1/P2 observability APIs and dashboards.
4. P2 integration tests and scenario testing.
5. P3 governance for long-term scaling.

---

## Notes for Decision-Making

- More ML complexity alone does not guarantee better returns.
- Biggest gains usually come from:
  - strict OOS discipline
  - realistic execution assumptions
  - robust risk controls
  - fast failure diagnostics

TODO фаза 4
План: AI-обучение на Python и контур LLM-жюри

1. Текущий флоу приложения (кратко)

flowchart LR
subgraph data [Данные]
Candles[Свечи]
Macro[Макро]
Fund[Фундаментал]
Options[Опционы/IV]
Div[Дивиденды]
end
subgraph prep [Подготовка]
OptimizedData[OptimizedDataService]
prepareTrainingData[prepareTrainingData]
createFeatureVector[createFeatureVector]
end
subgraph models [Модели Node]
NN[NeuralNetworkService]
Ensemble[EnsembleService]
Meta[MetaLearningService]
RL[ReinforcementLearningService]
Stack[StackingService]
Weekly[WeeklyForecastService]
end
subgraph out [Выход]
Rec[Recommendation BUY/SELL/HOLD]
Weights[ModelWeightingService]
Integrated[IntegratedAIService]
end
Candles --> OptimizedData
Macro --> createFeatureVector
Fund --> createFeatureVector
Options --> createFeatureVector
Div --> createFeatureVector
OptimizedData --> prepareTrainingData
prepareTrainingData --> NN
prepareTrainingData --> Ensemble
NN --> Integrated
Ensemble --> Integrated
Meta --> Integrated
RL --> Integrated
Stack --> Integrated
Weekly --> Integrated
Integrated --> Weights
Weights --> Rec

Вход: свечи (DAY), макро, фундаментал, опционы, дивиденды → один общий пайплайн фичей (OptimizedDataService.prepareTrainingData + createFeatureVector).

Модели: LSTM/MLP (TensorFlow.js), ансамбль по горизонтам, мета-обучение, RL (Q-learning), стекинг, weekly forecast (encoder-decoder LSTM).

Выход: рекомендации с confidence/score в БД; взвешивание моделей; единая рекомендация через IntegratedAIService.

2. Рекомендуемый стек на Python

Назначение

Технология

Обоснование

Ядро обучения (LSTM, MLP, ансамбль)

PyTorch + PyTorch Lightning

Гибкость, нормальная работа с последовательностями и кастомными лоссами, удобные даталоадеры и чекпоинты. Lightning — меньше boilerplate, ранний стоп, логгирование.

Временные ряды / фичи

pandas, numpy, ta (или pandas-ta)

Таблицы и индикаторы. ta — RSI, MACD, Bollinger и т.д. Альтернатива: sktime для единого API рядов.

RL

Stable-Baselines3 (или кастом на PyTorch)

Готовые алгоритмы (PPO, DQN и т.д.), интеграция с Gym. Для точного воспроизведения текущего Q-learning можно обернуть своё окружение в Gym и взять DQN.

Эксперименты и артефакты

MLflow

Версионирование датасетов, параметров, метрик, чекпоинтов. Удобно для ансамбля и стекинга (какая модель какая версия).

Очереди обучения

Celery + Redis (или ARQ)

Долгие задачи (обучение по инструментам, батч). Не блокировать FastAPI. Альтернатива: отдельный воркер на FastAPI BackgroundTasks — проще, но без приоритетов и ретраев.

LLM-жюри

httpx (async) + единый слой промптов

Минимум зависимостей: один промпт → запросы к разным API (Qwen, DeepSeek, Алиса и т.д.) → парсинг ответа в структуру «мнение» (BUY/SELL/HOLD + confidence). Без LangChain, если не нужны цепочки.

Конфиг и секреты

pydantic-settings

Уже есть в FastAPI; те же настройки для воркеров обучения и ключей LLM.

Не брать: TensorFlow/Keras — ты переписываешь с нуля, PyTorch даёт больше гибкости для кастомных контуров и RL. JAX — избыточен на старте.

3. Архитектура: где что живёт

Сервис обучения (отдельный процесс или подпакет в server_fastapi):

Data: один модуль подготовки фичей (аналог OptimizedDataService): свечи из БД/кеша, макро, фундаментал, опционы, дивиденды → один пайплайн в pandas/numpy, затем тензоры для PyTorch.

Models: пакеты по контурам: nn (LSTM/MLP), ensemble, meta, rl, stacking, weekly_forecast, llm_jury.

Training jobs: Celery-таски (или аналог) по типам: train_nn, train_ensemble, train_weekly, train_meta, train_rl, run_llm_jury, run_stacking. Результат — артефакты в MLflow и/или сохранение весов/конфигов в хранилище (S3/локально + путь в БД).

Inference: тонкий слой «загрузка модели + predict» по запросу API (или по расписанию для пайплайна рекомендаций). FastAPI вызывает этот слой или читает уже записанные рекомендации из БД.

Контур LLM-жюри (новый):

Вход: один и тот же промпт (например: краткое описание инструмента, последние N дней цен, объём, новости) в едином формате.

Вызов: параллельные запросы к разным провайдерам (Qwen, DeepSeek, Алиса GPT и др.) через async httpx, таймауты и ретраи.

Выход: список структур { model_id, action: BUY|SELL|HOLD, confidence, raw_text }. Нормализация в общий формат «мнения» (например 0–1 score и действие).

Интеграция:

Meta-learning: мнения LLM как дополнительные фичи или как «внешний эксперт» при определении режима/адаптации весов.

Weekly forecast: мнения LLM как доп. вход в модель (фича «консенсус LLM») или как пост-обработка (коррекция прогноза по порогу согласия).

Детали интеграции (фича vs пост-обработка) можно зафиксировать в инвариантах и тестах после первого прототипа LLM-жюри.

4. Этапы реализации (логический порядок)

Общая инфраструктура

Репозиторий/пакет training в server_fastapi (или отдельный репо): конфиг (pydantic-settings), логирование, подключение к той же БД и при необходимости кешу свечей.

Подготовка данных: модуль «фичи из свечей + макро + фундаментал + опционы + дивиденды» (аналог prepareTrainingData + createFeatureVector), вывод в таблицы/файлы или в датасет для PyTorch.

MLflow: проект(ы) по контурам, логирование датасета (путь/версия), параметров и метрик.

Базовый контур (NN)

Модель LSTM/MLP на PyTorch Lightning, обучение на подготовленных фичах и метках (аналог текущего NeuralNetworkService).

Сохранение чекпоинтов и конфига, регистрация в MLflow. Инференс: загрузка модели по версии/алиасу и предсказание score/confidence.

Ансамбль и стекинг

Несколько моделей с разными горизонтами/гиперпараметрами, обучение через те же данные (или подвыборки). Стекинг: мета-модель на предсказаниях базовых (как сейчас в Node).

Версионирование ансамбля в MLflow.

Weekly forecast

Модель типа encoder-decoder (LSTM/Transformer) для прогноза на неделю; данные — те же фичи + скользящие окна. Обучение и сохранение аналогично NN.

Опционально: вызов LLM-жюри по тому же инструменту/периоду и добавление фичи «консенсус LLM» или пост-коррекция.

Meta-learning

Реализация «базы паттернов» и адаптации весов/параметров под режим рынка. Вход может включать агрегированные мнения LLM (например, средний score по жюри) как признак режима или доверия.

RL

Окружение (Gym): состояние = портфель + фичи инструмента, действия = HOLD/BUY/SELL, награда = PnL/риск. Обучение через Stable-Baselines3 или свой DQN на PyTorch. Сохранение политики в MLflow.

Контур LLM-жюри

Модуль промптов: шаблон + подстановка инструмента, цен, объёмов, опционально новостей.

Модуль провайдеров: адаптеры под API Qwen, DeepSeek, Алиса (и др.): один интерфейс «запрос-ответ» → нормализованное мнение.

Планировщик/таск: по расписанию или по событию запрос ко всем провайдерам, сохранение результатов в БД (новая таблица или расширение существующей «рекомендаций»).

Интеграция в meta-learning и weekly forecast (фичи или пост-обработка — по решению выше).

Интеграция с FastAPI

Запуск обучения по API (запуск Celery-таски или фоновых задач), статус и логи через существующий мониторинг.

Пайплайн рекомендаций (аналог RecommendationPipelineService): при генерации рекомендаций читать предсказания всех контуров (включая LLM-жюри) и веса из ModelWeightingService; писать в таблицу recommendations в текущем формате.

5. Ключевые файлы и места

Текущий пайплайн фичей (Node): server/src/services/OptimizedDataService.js — prepareTrainingData, createFeatureVector (свечи, индикаторы, макро, фундаментал, опционы, дивиденды).

Текущее обучение NN: server/src/workers/neuralNetworkWorker.js, server/src/services/NeuralNetworkService.js.

Weekly forecast: server/src/workers/weeklyForecastTrainingWorker.js, server/src/utils/scheduler/weeklyForecastTrainingUtils.js.

Рекомендации и ансамбль: server/src/services/IntegratedAIService.js, server/src/services/EnsembleService.js.

FastAPI: рекомендации только потребляют БД — server_fastapi/app/services/recommendation_pipeline_service.py; модели обучения в Phase 4 пока не переносились.

6. Риски и упрощения

Данные: макро, фундаментал, опционы сейчас могут быть в Node-специфичном кеше/БД — нужен общий доступ (БД/API/файлы) для Python-воркеров.

LLM: лимиты и стоимость API; необходимо единообразно парсить ответы (например, один формат JSON или помеченные блоки в тексте).

Уместно сначала довести один контур (NN + подготовка данных) до конца, затем подключать ансамбль, weekly, meta, RL и в конце — LLM-жюри и его интеграцию в meta/weekly.

Если нужно, следующий шаг — разбить один из этапов (например, «Подготовка данных» или «Контур LLM-жюри») в конкретные задачи по файлам и сигнатурам функций.
