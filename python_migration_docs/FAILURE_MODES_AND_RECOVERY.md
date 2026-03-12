# Failure Modes And Recovery

## Статус миграции (на 2026-02-26)

- Базовые fail-safe подходы и мониторинг заложены в platform слое.
- Полный runbook-driven recovery для write-критичных флоу пока не завершен.
- Документ используется как рабочий чеклист для Фаз 3-5.

| Failure mode | Symptom | Detection | Degradation | Recovery |
|---|---|---|---|---|
| Broker API timeout | нет цены/ордера | timeout metric, error logs | skip trade | retry with backoff, fallback cache |
| Risk service unavailable | admission error | health check fail | block auto-exec | re-init service, safe deny |
| DB deadlock | failed transaction | DB error code | partial backlog | retry transaction |
| Gate calc failure | cannot evaluate WF/release | gate error logs | safety skip | cached gate result + alert |
| Migration step failure | status failed/cancelled | migration errors list | stop migration | manual resume/rollback |

## Recovery policy

- Fail-safe first: при сомнениях блокировать автоисполнение.
- Recovery процедуры должны быть runbook-driven.
- Все recovery действия логируются с traceId.

