# server_fastapi

Краткая инструкция по запуску FastAPI-сервера на Windows (PowerShell).

## 1) Требования

- Python `3.14.x`
- PostgreSQL (доступен по `DATABASE_URL`)

## 2) Первый запуск

```powershell
cd "c:\Users\Фронтендер3000\projects\ai-trader\server_fastapi"
py -3.14 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -U pip setuptools wheel
python -m pip install -e ".[dev]"
Copy-Item .env.example .env
```

После создания `.env` заполни минимум:

- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `USER_PASSWORD` (обязателен для bootstrap admin)
- `SERVER_TIMEZONE` (рекомендуется `Europe/Moscow`)
- `ERROR_REGISTRY_PATH` (например `./logs/error_registry.json`)

## 3) Миграции БД

```powershell
alembic -c alembic.ini upgrade head
```

Проверка текущей ревизии:

```powershell
alembic -c alembic.ini current
```

Автоинициализация при старте:

- При запуске API выполняется bootstrap-проверка.
- Если в БД нет критичных таблиц (`users`, `app_settings`, `trading_requests`), приложение автоматически:
  - запускает `alembic upgrade head`,
  - заполняет базовые системные настройки,
  - создает/обновляет admin-пользователя из `USER_PASSWORD`.
- Ручной запуск Alembic остается доступным как fallback.
- Seed `app_settings` выполняется в режиме `insert-if-missing` (существующие значения не перетираются).

## 4) Запуск API

```powershell
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Проверка:

- `http://localhost:8000/health`
- `http://localhost:8000/api/v1/health`
- Маршруты поддерживаются только в `v1` формате (`/api/v1/*`).
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`
- OpenAPI JSON: `http://localhost:8000/openapi.json`

## 5) Как запускать тесты (PowerShell)

Всегда из `server_fastapi` и с активированным `.venv`:

```powershell
cd "c:\Users\Фронтендер3000\projects\ai-trader\server_fastapi"
.\.venv\Scripts\Activate.ps1
python -m pytest
```

Частые варианты:

```powershell
# Все тесты
python -m pytest

# Один файл
python -m pytest tests/test_health.py -q

# По имени теста
python -m pytest -k health -q

# Интеграционные тесты (repositories, trading-requests flow) требуют БД с миграциями
# После `alembic upgrade head` они выполняются; иначе пропускаются
```

Линтер:

```powershell
python -m ruff check .
```

Покрытие тестами (процент в терминале):

```powershell
python -m pytest --cov=app --cov-report=term-missing
```

Текущее покрытие проекта: `~87%` (ориентир по последнему прогону).

## 6) Обычный рабочий старт (каждый день)

```powershell
cd "c:\Users\Фронтендер3000\projects\ai-trader\server_fastapi"
.\.venv\Scripts\Activate.ps1
alembic -c alembic.ini upgrade head
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Готовый скрипт входа в `.venv`

```powershell
# scripts\enter-venv.ps1
cd "c:\Users\Фронтендер3000\projects\ai-trader\server_fastapi"
Set-ExecutionPolicy -Scope Process Bypass
.\.venv\Scripts\Activate.ps1
python --version
```

Запуск:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\enter-venv.ps1
```

## 7) Если команда не найдена

Если видишь `uvicorn`/`pytest` not found:

1. Убедись, что активировано окружение (`(.venv)` в начале строки).
2. Запускай через `python -m ...`, например:
   - `python -m uvicorn app.main:app --reload`
   - `python -m pytest`

## 8) Ops/Cutover (Фаза 6)

Операционные эндпоинты:

- `GET /api/v1/system/ops/status` — текущий режим.
- `POST /api/v1/system/ops/mode` с body `{ "mode": "normal|shadow|canary|rollback" }`.
- `POST /api/v1/system/ops/canary` с body `{ "percent": 10 }`.
- `POST /api/v1/system/ops/rollback` — экстренный rollback-режим.
- `POST /api/v1/system/ops/backup` — snapshot перед cutover/rollback.

Поведение write-операций:

- `shadow`/`rollback`: write-запросы (`POST/PUT/PATCH/DELETE`) возвращают `503`.
- `canary`: write-разрешение только для доли запросов по canary-проценту.
- `normal`: штатный режим.

Подробный пошаговый сценарий "день cutover":
- `python_migration_docs/CUTOVER_AND_ROLLBACK_RUNBOOK.md`

## 9) Файловый реестр ошибок

- Реестр ошибок хранится в файле `ERROR_REGISTRY_PATH` (по умолчанию `logs/error_registry.json`).
- Runtime-ошибки дополнительно пишутся в `RUNTIME_ERROR_LOG_PATH` (по умолчанию `logs/runtime_errors.jsonl`).
- Логика обновления:
  - новый тип ошибки -> новая запись (`count = 1`),
  - повторный тип -> `count += 1`, обновление `last_seen_at`.
- Тех-эндпоинт:
  - `GET /api/v1/system/errors/registry`

## 10) Guardrails после bugfix

- Аутентификация больше не использует fail-open fallback при ошибках БД: при недоступной БД логин/verify возвращают `503`.
- Training API с `figi`:
  - `run-backtest` и `run-stacking` теперь возвращают `NOT_FOUND` при отсутствии свечей,
  - возвращают `BAD_REQUEST` при недостатке данных,
  - не переходят на synthetic fallback в этих сценариях.
- Парсинг свечей в `training.data.loaders` стал устойчивым к грязным строкам: невалидные свечи отбрасываются.
- `auto_paper_enabled` корректно интерпретирует строковые значения (`"false"` больше не считается `True`).
- В async-эндпоинтах Tinkoff/Telegram и в scheduler синхронные внешние вызовы вынесены в `asyncio.to_thread`.
- Cron-конфиги валидируются строго: невалидный cron вызывает ошибку конфигурации, а не тихий fallback.

## 11) Docker (FastAPI + Postgres)

В корне проекта обновлен `docker-compose.yml` под новый стек:

- `postgres` (PostgreSQL 15)
- `fastapi` (сборка из `server_fastapi/Dockerfile`)
- `frontend` (сборка из `frontend/Dockerfile`, раздача через Nginx)
  - домен: `vashchenkovaitrader.ru` / `www.vashchenkovaitrader.ru`
  - HTTP редиректится на HTTPS
  - SSL сертификаты читаются из `/etc/letsencrypt` (монтируется в контейнер)

Быстрый старт:

```powershell
cd "c:\Users\Фронтендер3000\projects\ai-trader"
docker compose up -d --build
```

Что происходит:

- перед стартом приложения создаются рабочие каталоги (`/app/logs`, `/app/models`, `/app/data`, `/app/mlruns`, `/app/lightning_logs`) и для них выставляются права `chmod -R 777`;
- контейнер `fastapi` на старте выполняет `alembic upgrade head`;
- после миграций поднимается `uvicorn app.main:app` на `8000`;
- healthcheck FastAPI: `GET /health`.
- frontend доступен на `${FRONTEND_PORT:-80}`.
- HTTPS frontend доступен на `${FRONTEND_PORT_HTTPS:-443}`.

Для фронта можно задать API base URL через build-arg:

- `VITE_API_BASE_URL` (по умолчанию `http://localhost:8000`)

Для `fastapi` в compose включен `env_file`:

- `server_fastapi/.env` (для parity со старым server-контуром и LLM/Telegram ключей),
- при этом значения из блока `environment` в `docker-compose.yml` имеют приоритет.

Полезные команды:

```powershell
# Остановить
docker compose down

# Логи FastAPI
docker compose logs -f fastapi
```

## 12) KPI анализа NN+LLM

Для контроля эффективности гибридного контура доступен endpoint:

- `GET /api/v1/system/analysis/kpi?window=24h|7d|30d`

Что возвращает:

- `definitions`: словарь KPI и формулы расчета.
- `thresholds`: целевые пороги SLO (`good/warn`) для основных метрик.
- `report`: ежедневный/оконный отчет `NN vs LLM vs Fusion`:
  - `summary` (покрытие, задачи, latency p95),
  - `quality` (accuracy/brier/ece proxy),
  - `fusion` (mode share, fallback rate, marginal gain),
  - `operability` (coverage/success/skipped rate).
- `alerts`: список предупреждений/критичных деградаций по правилам SLO.
- `ui`: рекомендуемый минимальный набор карточек для Settings/Dashboard.

Замечание:

- Метрики `directionAccuracy/brier/ece/lift` сейчас являются operational proxy на основе
  доступного telemetry из задач анализа. Для полноценной бизнес-оценки (`PnL/signal`,
  `ProfitFactor`, `MaxDrawdown`) требуется post-trade контур в отдельном слое аналитики.

## 13) Улучшенный analysis v2 (feature flags + canary)

`analysis_market_portfolio` поддерживает поэтапный rollout улучшений через настройки:

- `analysis_v2_enabled` — общий флаг включения улучшений.
- `analysis_v2_canary_percent` — процент FIGI, попадающих в v2 (0..100).
- `analysis_v2_llm_uncertainty_margin` — порог пограничной зоны NN для условного вызова LLM.
- `analysis_v2_llm_cache_ttl_hours` — TTL кэша LLM-обогащения.
- `analysis_v2_quality_gates_enabled` — quality gates (freshness/NaN/checkpoint compatibility).
- `analysis_v2_conf_temp_nn_only`
- `analysis_v2_conf_temp_llm_only`
- `analysis_v2_conf_temp_nn_llm`

Что добавлено в v2:

- Адаптивные веса fusion NN/LLM по market regime.
- Динамические BUY/SELL пороги по market regime.
- Temperature scaling confidence для режимов `nn_only/llm_only/nn_llm`.
- Conditional LLM + cache для снижения latency/cost.
- Canary telemetry в результате задачи (`canaryProcessed/canarySkipped`, `llmCacheHits`, `llmCallsSaved`).

