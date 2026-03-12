# Python Migration Documentation Hub

Единая папка документации по переходу с Node.js на Python/FastAPI.

## Текущий статус миграции (на 2026-03-06)

- **Выполнено:** Фаза 0 (foundation), Фаза 1 (platform parity), Фаза 2 (read-only домены).
- **Фаза 3 (MVP):** Request lifecycle, Mode switch, Auto-paper (status/enable/disable/stats, can-execute, execute), Risk, Recommendation pipeline, Preflight-check — готовы.
- **Idempotency-Key:** Принято решение не внедрять (solo-usage).
- **Фаза 4 (Data/AI):** NN с conditioning, ансамбль (EnsemblePredictor, веса из конфига/мета), стекинг (StackingModel, run_stacking), weekly forecast, LLM-жюри, walk-forward бэктест (run_backtest), RL (tabular Q-learning), release-gate governance, API run-nn/run-weekly/run-jury/run-backtest/run-stacking/run-rl/release-gate.
- **Фаза 5 (Tinkoff API):** интеграция Tinkoff Invest API — клиент, эндпоинт портфеля, планировщик (portfolio sync, instruments, last prices).
- **Фаза 6 (Ops + cutover):** ops-режимы `normal/shadow/canary/rollback`, write-gates в middleware, cutover backup snapshot endpoint, runbook/checklist актуализированы.
- **Bootstrap/Init parity:** при старте FastAPI выполняется автоинициализация БД (проверка схемы, auto `alembic upgrade head`, seed `app_settings`, seed admin из `USER_PASSWORD`).
- **Error logging parity:** ошибки приложения агрегируются в файловом реестре `logs/error_registry.json` с инкрементом `count` и `last_seen_at`.
- **Moscow TZ parity:** серверные timestamp и scheduler timezone приведены к `Europe/Moscow`.
- **Bugfix hardening (2026-03):**
  - auth fail-open fallback удален (DB outage -> `503`);
  - training guardrails усилены (no silent synthetic fallback для `figi`, strict insufficient-data checks);
  - async I/O для Tinkoff/Telegram вынесен в thread-offload в async-контурах;
  - scheduler/telemetry улучшены (strict cron validation, task retention, route-template metrics).
- **Текущий фокус:** clean-rebuild трек (каноничная схема БД, repository-слой, API только `/api/v1/*`).

## Базовые документы миграции

- `FASTAPI_MIGRATION_PLAN.md`
- `BUSINESS_LOGIC_CATALOG.md`
- `DOMAIN_STATE_MACHINES.md`
- `API_CONTRACTS_AND_ERROR_CODES.md`
- `CRITICAL_FLOWS_STEP_BY_STEP.md`

## Контроль полноты переноса

- `TRACEABILITY_MATRIX.md`
- `GAP_ANALYSIS_AS_IS_VS_TARGET.md`
- `MIGRATION_ACCEPTANCE_CHECKLIST.md`

## Риски, отказоустойчивость, эксплуатация

- `FAILURE_MODES_AND_RECOVERY.md`
- `DEPENDENCY_RISK_REGISTER.md`
- `OBSERVABILITY_SPEC.md`
- `PERFORMANCE_AND_SCALABILITY_BUDGETS.md`
- `CUTOVER_AND_ROLLBACK_RUNBOOK.md`
- `KNOWN_BUGS_AND_TECH_DEBT.md`

## Бизнес-правила и данные

- `INVARIANTS_AND_BUSINESS_RULES.md`
- `DATA_CONTRACTS_AND_SCHEMAS.md`
- `IDEMPOTENCY_AND_CONCURRENCY.md`
- `PHASE4_AI_TRAINING_AND_LLM_JURY.md` — Phase 4: контуры обучения на Python, LLM-жюри (замена NewsAPI), пайплайн фичей, conditioning.

## Тестовое покрытие

- `TEST_COVERAGE_MAP.md`

