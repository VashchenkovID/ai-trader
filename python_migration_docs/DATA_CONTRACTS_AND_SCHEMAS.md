# Data Contracts And Schemas

## Статус миграции (на 2026-02-26)

- Принята schema-first стратегия: каноничная БД-модель в FastAPI без оглядки на legacy-таблицы.
- DTO и ORM синхронизируются от целевой доменной модели.
- Временные адаптеры к неоднородным таблицам/колонкам исключаются.

## Каноничные сущности (target)

- `TradingRequestDTO`
- `TradingRequestStatus`
- `AutoPaperDecisionDTO`
- `MigrationStatusDTO`
- `ErrorDTO`
- `InstrumentDTO`
- `RecommendationDTO`
- `CandleDTO`
- `NewsItemDTO`
- `ModelPerformanceDTO`
- `AppSettingDTO`

## Требования

- Все enums фиксируются централизованно.
- Nullable/required поля должны быть документированы.
- Денежные поля: decimal, не float.
- Временные поля: UTC ISO8601.

## SQLAlchemy mapping правила

- UUID для внешних публичных идентификаторов.
- Индексы на status/created_at/figi/mode.
- Явные FK и каскады.

## Pydantic правила

- Request/Response модели раздельно.
- Валидация диапазонов (`confidence`, `score`).
- Общий `response envelope`.

