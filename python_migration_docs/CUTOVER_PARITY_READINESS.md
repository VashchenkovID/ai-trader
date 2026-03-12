# CUTOVER PARITY READINESS

## Домены и веса

- Scheduler/jobs parity: 25%
- Tinkoff API surface parity: 20%
- Telegram subsystem parity: 15%
- Training orchestration parity: 15%
- WebSocket/system telemetry parity: 10%
- Integration tests parity: 15%

## Фактический статус (текущий срез)

- Scheduler/jobs parity: 90%
  - закрыты stub jobs, добавлены price loops/governance/risk jobs,
  - для job-ов есть cron + trigger + task state + WS events.
- Tinkoff API surface parity: 85%
  - добавлены accounts/user-info/operations/orders/trading status/currencies/bonds/etfs/dividends/find.
- Telegram subsystem parity: 80%
  - добавлены сервис, `/telegram/*`, `/notifications/*`, DB-настройки.
- Training orchestration parity: 85%
  - разведены full/quick контуры, добавлен resume/continual режим для NN/weekly/RL.
- WebSocket/system telemetry parity: 80%
  - `system/status` переведен на фактический snapshot scheduler/resources.
- Integration tests parity: 85%
  - добавлены parity endpoint tests и live LLM provider contract tests (opt-in marker).
- Bootstrap/init parity: 100%
  - startup auto-bootstrap (schema check + alembic + seed app_settings/admin) включен в lifespan.
- Error logging parity: 100%
  - файловый реестр ошибок с инкрементальным учетом (`logs/error_registry.json`) и тех-эндпоинтом чтения.
- Moscow timezone parity: 100%
  - серверные timestamp и scheduler timezone переведены на `Europe/Moscow`.
- Stability hardening: 95%
  - устранен auth fail-open при ошибках БД,
  - добавлены strict guardrails на insufficient/dirty data в training API,
  - в scheduler введены task retention и strict cron validation,
  - снижен риск event-loop blocking в async endpoints/jobs за счет thread offload.

## Сводный parity %

- Взвешенный readiness: **85%**.

## Cutover gate (обязательные условия)

- `python -m pytest` проходит green на CI/локально.
- Маркер live-тестов запускается вручную:
  - `python -m pytest -m live_llm tests/test_llm_live_providers.py -q`
- Выполнен dry-run shadow/canary по runbook.
- Проверены env-контракты:
  - Tinkoff: `TINKOFF_*`,
  - Telegram: `TELEGRAM_*`,
  - LLM: `DEEPSEEK_*`, `PERPLEXITY_*`, `GIGACHAT_*`, `YANDEX_*`.
