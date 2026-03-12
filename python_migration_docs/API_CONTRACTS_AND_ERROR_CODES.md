# API Contracts And Error Codes

## Статус миграции (на 2026-02-26)

- Целевой базовый контракт: только `/api/v1/*` без legacy aliases.
- Единый success/error envelope является обязательным для всех доменов.
- Любые breaking changes допускаются до фиксации финального `v1` контракта.

## Base

- Base: `/api/v1/*`
- Health: `/health`
- Legacy aliases не поддерживаются в целевом состоянии.

## Response envelopes

### Success

```json
{ "success": true, "data": {} }
```

### Error (target)

```json
{
  "success": false,
  "error": {
    "code": "SOME_CODE",
    "message": "Human readable message",
    "details": {},
    "traceId": "..."
  }
}
```

## Key HTTP mapping

- `400`: validation/input errors
- `401`: unauthorized
- `403`: forbidden
- `404`: not found
- `409`: invalid state transition / conflict
- `422`: business-rule violation
- `429`: rate limit
- `503`: dependency/service unavailable
- `500`: internal error

## Critical existing signals to keep

- `INSUFFICIENT_STRATEGY_BUDGET`
- `AUTO_EXECUTION_FORBIDDEN_NON_PAPER`
- `TRADING_REQUEST_NOT_FOUND` (нужно формализовать из message)
- `INVALID_STATE_TRANSITION` (нужно формализовать из message)

## Contract priorities

1. `trading-requests`
2. `auto-paper-trading`
3. `trading-mode`
4. `portfolio`
5. `portfolio-migrator`

