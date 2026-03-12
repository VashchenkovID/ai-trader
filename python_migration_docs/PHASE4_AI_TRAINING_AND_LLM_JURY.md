# Phase 4: Data/AI контуры и LLM-жюри

Документ фиксирует целевое состояние Phase 4 миграции: контуры обучения на Python и контур LLM-жюри (замена NewsAPI). Детальный план стека и этапов — в плане **AI Training Python Stack** (`.cursor/plans/ai_training_python_stack_febcd9a2.plan.md`).

## Ключевые решения

### Отказ от NewsAPI

- В Python-ядре обучения **новости (NewsAPI) не используются**.
- Вместо 2 фичей из NewsAPI в векторе признаков используются **агрегаты мнений LLM-жюри**: консенсус, уверенность, дисперсия мнений (2–3 фичи).

### LLM-жюри

- **Провайдеры**: DeepSeek, Perplexity, Giga Chat, Алиса GPT (единый промпт → параллельные запросы → парсинг в `action` и `confidence`).
- **Вход промпта**: тикер, сектор, последние N дней цен и объём, опционально макро-сводка. **Без новостей.**
- **Выход**: структуры `{ model_id, action: BUY|SELL|HOLD, confidence, raw_text }` → нормализация в общий формат мнения (0–1 score, действие).
- **Использование**: агрегаты мнений LLM подставляются в пайплайн фичей вместо новостных фичей; опционально — вход в meta-learning и weekly forecast.

### Пайплайн фичей и сплит

- **Состав вектора**: как в текущем Node (свечи, макро, фундаментал, опционы, дивиденды, сектор и т.д.), но **вместо 2 фичей NewsAPI — 2–3 агрегата LLM** (консенсус, уверенность, дисперсия).
- **Запрет look-ahead**: в коде и тестах явный запрет использования будущих данных при построении фичей и меток.
- **Сплит**: только **time-based** (train/validation/test по датам), без shuffle по времени.

### Conditioning (стратегия и горизонт)

- Стратегия (aggressive / moderate / conservative) и горизонт (short / medium / long) — **входы модели** (conditioning), а не пост-обработка порогами.
- Одна модель: вход = (фичи, strategy_id, horizon_id), выход = (score, confidence) для запрошенной пары.

## Порядок этапов реализации (из плана AI Training Python Stack)

1. ~~Обновление документации~~ (отражение отказа от NewsAPI, LLM-жюри, состава фичей, conditioning).
2. ~~Общая инфраструктура~~: пакет `training`, подготовка данных, MLflow.
3. ~~Базовый контур NN с conditioning~~.
4. ~~Ансамбль и стекинг~~: EnsemblePredictor, веса из конфига/мета, StackingModel и run_stacking.
5. ~~Weekly forecast~~.
6. ~~Meta-learning~~: интерфейс get_meta_weights (адаптация весов по llm_consensus).
7. ~~RL~~: реализован базовый контур tabular Q-learning (`training.rl.train_agent`, API `POST /api/v1/training/run-rl`).
8. ~~Контур LLM-жюри~~ (промпты, провайдеры, API run-jury).
9. ~~Интеграция с FastAPI~~: run-nn, run-weekly, run-jury, run-backtest, run-stacking.

**Итог Phase 4:** контуры NN, ансамбль, стекинг, weekly, LLM-жюри, бэктест (walk-forward), RL и API реализованы; добавлен release-gate (policy + audit registry) для промоута моделей.

## Связанные документы

- `FASTAPI_MIGRATION_PLAN.md` — фаза 4 и критерии готовности.
- `CRITICAL_FLOWS_STEP_BY_STEP.md`, `FAILURE_MODES_AND_RECOVERY.md`, `DEPENDENCY_RISK_REGISTER.md` — при расширении Phase 4.
- План: `.cursor/plans/ai_training_python_stack_febcd9a2.plan.md`.
