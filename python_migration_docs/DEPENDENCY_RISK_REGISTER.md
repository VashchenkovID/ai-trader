# Dependency Risk Register

## Статус миграции (на 2026-02-26)

- Регистр рисков актуален и используется как target для операционной готовности.
- Для реализованных фаз 0-2 настроены базовые проверки доступности и обработка ошибок.
- Полное покрытие mitigation-процедур (включая cutover период) остается задачей Фаз 3-5.

| Dependency | Risk | Mitigation | Owner |
|---|---|---|---|
| Tinkoff API | timeout/rate limit | retry (429/5xx), timeout 30–60s, см. `server_fastapi/app/services/tinkoff_client.py` | Trading backend |
| News API | 5xx, key issues | graceful skip, stale cache, alerts | Data backend |
| Telegram | send failures | best-effort delivery, queue, retry | Platform |
| PostgreSQL | lock/contention | indexes, retry tx, observability | Platform |
| Scheduler/workers | overlap/hang | singleton lock, watchdog, restart policy | Platform |

