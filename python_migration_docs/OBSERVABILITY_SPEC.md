# Observability Spec

## Статус миграции (на 2026-02-26)

- В FastAPI реализованы базовые structured logs, trace/request id и route-level метрики.
- Часть алертов и SLO-мониторинга доступна для platform/read-only контуров.
- Полное покрытие write-критичных операций и внешних зависимостей будет расширяться в Фазах 3-5.

## Logs (mandatory fields)

- `timestamp`
- `level`
- `service`
- `operation`
- `traceId` / `requestId`
- `entityId` (if applicable)
- `error.code` (for failures)

## Metrics (minimum)

- HTTP latency p50/p95/p99 by route
- HTTP error rate by route/code
- Admission pass/block rate by gate
- Auto-exec success/failure rate
- Migration step duration/failure count
- External API timeout/error counters

## Alerts

- P0: auto-exec in non-paper attempted
- P0: sustained 5xx on trading endpoints
- P1: gate failure spike
- P1: migration failed/cancelled unexpectedly

