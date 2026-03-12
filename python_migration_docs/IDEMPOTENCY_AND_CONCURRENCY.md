# Idempotency And Concurrency

## Статус миграции (на 2026-02-27)

**Idempotency-Key не внедряется.** Принято решение убрать: сервисом пользуется один пользователь (solo-usage), in-memory хранилище не имело смысла, хранение в БД не планировалось.

## Операции (ранее планировались с Idempotency-Key)

Следующие write-операции работают без заголовка `Idempotency-Key`:

- `POST /trading-requests/create`
- `POST /trading-requests/:id/approve`
- `POST /trading-requests/:id/execute`
- `POST /auto-paper-trading/enable|disable`
- `POST /portfolio-migrator/execute|stop`

## Правила (если позже потребуется)

- Входной `Idempotency-Key` — опционально.
- Хранить ключ + hash payload + result (БД или Redis).
- Повтор с тем же ключом и payload -> тот же ответ.
- Повтор с тем же ключом и другим payload -> `409`.

## Конкурентность

- Row-level locks для критичных счетчиков/лимитов.
- Optimistic lock для конкурентных update заявки.
- Single-flight lock для `processNewRequest`.

