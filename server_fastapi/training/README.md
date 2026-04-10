# Training package (Phase 4)

Контуры обучения на Python: подготовка данных, MLflow, NN с conditioning, далее ensemble/weekly/meta/RL/LLM-jury.

## Установка зависимостей

```bash
pip install -e ".[training]"
```

Опциональная группа `training`: pandas, numpy, mlflow, torch, pytorch-lightning, httpx (для LLM-провайдеров).

## Модули

- **config** — настройки (MLflow URI, каталоги данных).
- **data** — пайплайн фичей: `build_feature_pipeline`, `build_weekly_sequences`, `time_based_split` (без look-ahead).
- **experiments** — инициализация MLflow, логирование run/артефактов.
- **models** — CondMLP (NN с conditioning), CondMLPLightning; EnsemblePredictor, aggregate_predictions; get_meta_weights (meta); StackingModel; WeeklyForecastLSTM, WeeklyForecastLightning.
- **run_nn** — обучение базового контура: `python -m training.run_nn [--epochs 20] [--csv path/to/candles.csv]`. Без `--csv` используется синтетика; с `--csv` — реальные свечи (колонки candle_time/date, close, volume).
- **run_weekly** — обучение контура Weekly forecast: `python -m training.run_weekly [--epochs 20] [--csv path]`. Строит последовательности через `build_weekly_sequences`, чекпоинты в `TRAINING_MODELS_ROOT/weekly/`.
- **run_stacking** — обучение мета-модели стекинга поверх CondMLP: `python -m training.run_stacking --base-checkpoint path/to/cond_mlp.ckpt [--epochs 20] [--csv path]`. Чекпоинт в `TRAINING_MODELS_ROOT/stacking/`.
- **run_backtest** — walk-forward бэктест: `python -m training.run_backtest --checkpoint path/to/cond_mlp.ckpt [--splits 5] [--csv path]`. Метрики в консоль и MLflow.
- **inference_nn** — загрузка чекпоинта и предсказание: `load_model_and_predict(ckpt, x, strategy_id, horizon_id)`; ансамбль по всем 9 парам: `load_ensemble_and_predict(ckpt, x, weights_path=None, llm_consensus=None)`.
- **rl** — базовый RL-контур на tabular Q-learning (`train_agent`), сохранение артефактов в `TRAINING_MODELS_ROOT/rl/`.
- **governance** — release-gate policy (пороги метрик) и JSONL-аудит решений промоута моделей.
- **data.loaders** — `load_candles_from_csv(path)`, `candles_to_dataframe(rows)` для подачи свечей из БД или CSV в пайплайн.

## Экспорт строки для обучения (REWRITE_CORE §7 MVP)

- Склейка `mu` (PyPortfolioOpt) и метрик бэктеста: `training.data.targets_risk.build_training_alignment_row`.
- CLI без БД: `python -m training.tools.export_alignment_row --out data/training/alignment_sample.json` (из каталога `server_fastapi`).

## Базовый контур NN (conditioning)

- Вход: фичи (X), strategy_id (0=aggressive, 1=moderate, 2=conservative), horizon_id (0=short, 1=medium, 2=long).
- Выход: score [0, 1], confidence [0, 1].
- Чекпоинты в `TRAINING_MODELS_ROOT/python_nn/` (по аналогии с Node `server/models`), логи в MLflow.
- После обучения на тестовой выборке (time-based split) вызывается **бэктест**: метрики `test_mse`, `test_mae`, `test_direction_accuracy` логируются в MLflow. Отдельный скрипт walk-forward: `python -m training.run_backtest --checkpoint path [--splits 5]`. Оценка вручную: `training.backtest.evaluate_model_on_test(ckpt_path, X_test, y_test)`; разбиение: `training.backtest.walk_forward_split(X, y, n_splits=5)`.
- Дисбаланс «плоских» vs сильных движений по forward return: флаги `python -m training.run_nn ... --imbalance-weighted [--flat-threshold 0.0005] [--focal-gamma 0]` (см. `training/sample_weights.py`).
- **Метрики успеха:** что относится к качеству прогноза и что к paper-PnL — см. **[METRICS.md](METRICS.md)**. Сдвиг paper→real и мониторинг — **[REAL_TRANSFER.md](REAL_TRANSFER.md)**.

## Переменные окружения

- `TRAINING_MLFLOW_TRACKING_URI` — URI MLflow (по умолчанию `file:./mlruns`).
- `TRAINING_MLFLOW_EXPERIMENT_NAME` — имя эксперимента (по умолчанию `ai-trader-training`).
- `TRAINING_DATA_CACHE_DIR` — кеш сырых данных.
- `TRAINING_ARTIFACTS_DIR` — артефакты (датасеты).
- `TRAINING_MODELS_ROOT` — корень каталога моделей (по умолчанию `./models`); чекпоинты NN — `python_nn/`, weekly — `weekly/`, стекинг — `stacking/`.
- `TRAINING_ENSEMBLE_WEIGHTS_PATH` — (опционально) путь к JSON с весами ансамбля `horizon_weights`, `strategy_weights`; при инференсе ансамбля используются иначе равные веса или `get_meta_weights(llm_consensus)`.

## Weekly forecast (LSTM на последовательностях)

- **Пайплайн**: `build_weekly_sequences(candles, llm_aggregates=None, seq_len=30, n_forecast=5)` — скользящие окна фичей `(n_samples, seq_len, n_features)` и метка forward return за n_forecast дней. Запрет look-ahead.
- **Обучение**: `python -m training.run_weekly [--epochs 20] [--csv path] [--seq-len 30] [--n-forecast 5]`. Чекпоинты в `TRAINING_MODELS_ROOT/weekly/`, логи в MLflow.
- **API**: `POST /api/v1/training/run-weekly` и `POST /api/v1/training/run-weekly-from-figi` (загрузка свечей по FIGI и запуск в executor).

## Ансамбль и мета-обучение

- **Ансамбль**: одна CondMLP вызывается для всех 9 пар (strategy_id, horizon_id), результаты агрегируются. Инференс: `load_ensemble_and_predict(ckpt, x, weights_path=None, llm_consensus=None)`. Веса можно задать JSON-файлом (`TRAINING_ENSEMBLE_WEIGHTS_PATH`) или через мета-веса по консенсусу LLM.
- **Мета-веса**: `get_meta_weights(llm_consensus=None)` возвращает (horizon_weights, strategy_weights); при низком/высоком консенсусе — сдвиг в сторону moderate или aggressive/conservative.
- **Стекинг**: мета-модель (StackingModel) обучается на векторе из 9×2 предсказаний базовой CondMLP. CLI: `python -m training.run_stacking --base-checkpoint path`. API: `POST /api/v1/training/run-stacking`.

## Бэктест, RL и release-gate

- **Walk-forward бэктест**: `python -m training.run_backtest --checkpoint path [--splits 5]`. API: `POST /api/v1/training/run-backtest` (query: checkpoint, n_splits, опционально figi).
- **RL**: `training.rl.train_agent(env_name="paper", total_steps=10000)`; API: `POST /api/v1/training/run-rl`.
- **Release-gate**: API `POST /api/v1/training/release-gate` (метрики кандидата -> approve/reject + список проваленных критериев), audit в `TRAINING_RELEASE_REGISTRY_PATH`.

## LLM-жюри (контур замены NewsAPI)

- Провайдеры: **Mock** (тесты), **DeepSeek**, **Perplexity**, **Giga Chat**, **Алиса GPT** (YandexGPT).
- **Где и как получить API-ключи:** [docs/LLM_JURY_API_KEYS.md](../docs/LLM_JURY_API_KEYS.md).
- Переменные окружения (кратко): **DeepSeek** `DEEPSEEK_API_KEY`; **Perplexity** `PERPLEXITY_API_KEY`; **Giga Chat** `GIGACHAT_CLIENT_ID`, `GIGACHAT_CLIENT_SECRET`; **Алиса GPT** `YANDEX_API_KEY` или `YANDEX_IAM_TOKEN`, `YANDEX_FOLDER_ID`.
- Модули: `llm_jury.prompts`, `llm_jury.run`, `llm_jury.parse_verdict`, `llm_jury.providers` (base, mock, deepseek, perplexity, gigachat, alisa_gpt).
