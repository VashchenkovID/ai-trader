# Контракт данных для quant-пайплайна (REWRITE_CORE / Фаза A)

## OHLCV (свечи)

Источник: таблица `candles` / экспорт в `pandas`.

| Поле   | Тип            | Примечание                          |
|--------|----------------|-------------------------------------|
| index  | `DatetimeIndex`| Дата торгового дня (часовой пояс — `Europe/Moscow` или UTC, единообразно в проекте) |
| open   | float          |                                     |
| high   | float          |                                     |
| low    | float          |                                     |
| close  | float          | Обязательно для доходностей         |
| volume | int/float      | Опционально для объёма в фичах      |

Алиасы колонок в нижнем регистре: `open`, `high`, `low`, `close`, `volume`.

## Матрица доходностей

- **Ночной артефакт (планировщик):** при `len(risk.pypfopt_universe) ≥ 2` JSON пишется в `data/quant/returns_matrix_latest.json` (поля `matrix.index`, `matrix.columns`, `matrix.data`). Чтение без пересчёта: HTTP `GET /api/v1/quant/returns-matrix-artifact`, модуль `app.services.quant_artifact_service`.
- **Вход:** для каждого FIGI — `Series` цен закрытия с `DatetimeIndex`.
- **Выход:** `DataFrame`, индекс — даты, колонки — FIGI, значения — дневные простые доходности `pct_change()`, выравнивание по `inner` (общие даты) по умолчанию.
- **Look-ahead:** доходность на дату `t` использует только `close[t]` и `close[t-1]`; при построении **меток** для ML не подмешивать будущие бары (см. `pipeline.build_feature_pipeline`).

## Зависимости

Модули `returns_matrix.py` и downstream (PyPortfolioOpt, backtesting) требуют установки опциональной группы `quant` в `pyproject.toml`.
