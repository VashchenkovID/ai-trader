# Performance And Scalability Budgets

## Статус миграции (на 2026-02-26)

- Бюджеты зафиксированы и используются как целевые SLO.
- Для реализованных фаз есть базовый сбор latency/error-rate.
- Формальная валидация всех целевых бюджетов под write-нагрузкой и cutover нагрузкой еще не завершена.

## API latency SLO (target)

- P0 write endpoints: p95 < 300ms, p99 < 800ms
- P0 read endpoints: p95 < 200ms, p99 < 500ms
- Heavy analytics endpoints: p95 < 2s

## Error budgets

- 5xx rate < 0.5% (monthly)
- Timeout rate external dependencies < 2%

## Capacity assumptions

- Concurrent API users: 100+
- Background jobs: 20+ active tasks
- Burst requests: x3 from baseline

## Optimization priorities

1. DB indexes for hot queries.
2. Async external IO with timeout budgets.
3. Cache layer for market/news read paths.
4. Queue isolation for heavy training tasks.

