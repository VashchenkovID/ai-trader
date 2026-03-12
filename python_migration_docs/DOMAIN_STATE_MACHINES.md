# Domain State Machines (AS-IS)

## Статус миграции (на 2026-02-26)

- Документ зафиксирован как источник правил переходов для write-доменов.
- Формальная реализация state machine переходов в FastAPI запланирована на Фазу 3.
- Текущий статус: спецификация готова, полное enforcement-покрытие еще не завершено.

## 1) TradingRequest

### States

- `PENDING`, `APPROVED`, `REJECTED`, `EXECUTED`, `CANCELLED`, `EXPIRED`

### Allowed transitions

- `PENDING -> APPROVED`
- `PENDING -> REJECTED`
- `APPROVED -> EXECUTED`
- `PENDING|APPROVED -> CANCELLED`
- `PENDING -> EXPIRED` (по TTL)

### Invariants

- `quantity >= 1`
- `action in {BUY, SELL}`
- `confidence, score in [0..1]`

## 2) AutoPaperTrading

### Axes

- Service state: `enabled|disabled`
- Phase state: `phase1 -> phase2 -> phase3`

### Admission checks

- paper mode only
- request is pending and not expired
- thresholds confidence/score
- limits (daily trades/time between/loss)
- position size
- walk-forward gate
- release gate
- risk validation

### Hard guard

- Автоисполнение запрещено вне `paper`.

## 3) TradingMode

### AS-IS mismatch

- Публично фигурируют `paper|micro|real`, но switch-функции фактически валидируют `paper|real`.

### Transitions

- `* -> paper`: всегда
- `* -> real`: только через validation

## 4) MigrationStatus

### States

- `pending -> active -> completed|failed|cancelled`

### Notes

- Прогресс шагов обновляется инкрементально.
- Для FastAPI нужна строгая update-семантика (различать `0` и `unset`).

