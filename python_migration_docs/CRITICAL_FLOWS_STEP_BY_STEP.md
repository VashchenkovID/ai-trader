# Critical Flows Step By Step

## Статус миграции (на 2026-02-26)

- Документ используется как целевая спецификация Фазы 3.
- Перечисленные write-критичные флоу пока не закрыты end-to-end в FastAPI.
- Приемка по этому документу будет идти вместе с integration/contract тестами для write P0.

## Flow 1: Recommendation -> Auto-create Request

- Проверка порогов recommendation.
- Проверка дубля активной заявки по FIGI.
- Admission gates (paper): meta-policy + walk-forward + release.
- При успехе создание `TradingRequest(PENDING)`.
- При `INSUFFICIENT_STRATEGY_BUDGET` — business skip.

## Flow 2: TradingRequest create

- Получение recommendation и валидной цены.
- Выбор action/strategy/quantity.
- Валидация лимитов и расчет estimatedAmount.
- Создание записи заявки.

## Flow 3: TradingRequest lifecycle

- `approve`: только из `PENDING`.
- `execute`: только из `APPROVED`.
- `reject`: только из `PENDING`.
- `cancel`: из `PENDING|APPROVED`.
- Side effects: websocket/telegram/feedback.

## Flow 4: Auto-paper admission + execute

- `canAutoExecute`: режим, лимиты, risk, gates.
- `autoExecuteRequest`: transaction + simulate + execute + persist + stats.
- rollback on failure.
- hard guard: non-paper forbidden.

## Flow 5: Trading mode switch

- `paper` always allowed.
- `real` only after validator pass.
- history record in settings.

## Flow 6: Portfolio migration

- create plan -> validate -> execute by steps.
- progress/status updates in `MigrationStatus`.
- stop/cancel support.
- no full compensating rollback in AS-IS.

## Flow 7: Backtest + walk-forward

- candle-by-candle simulation.
- anti-lookahead gating for recommendations.
- windows for walk-forward and degradation/stability checks.

