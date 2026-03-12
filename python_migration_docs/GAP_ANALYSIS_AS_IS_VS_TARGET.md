# Gap Analysis: AS-IS vs Target

## Статус закрытия gap'ов (на 2026-02-26)

- Закрыто частично: `Error model`, `Contract consistency` для реализованных фаз 0-2.
- Не закрыто (P0): `Migration rollback`.
- Не закрыто (P1): `Expiration logic`, `Admission telemetry` в полном объеме.

| Area | AS-IS | Target | Impact | Priority |
|---|---|---|---|---|
| Error model | Много `500` для бизнес-ошибок | Строгий `error.code` + корректный HTTP | Высокий | P0 |
| Trading mode | `micro` неполно поддержан | Явная поддержка или удаление | Высокий | P0 |
| Idempotency | Не внедряется | Решение: не внедрять (solo-usage) | — | — |
| Expiration logic | Side-effect в `afterFind` | Явный job/handler | Средний | P1 |
| Migration rollback | Частичный fail-fast без компенсации | Явная compensation strategy | Высокий | P0 |
| Admission telemetry | Частично структурирована | Полный machine-readable trace | Средний | P1 |
| Contract consistency | Разные envelope-ы | Единый schema contract | Высокий | P0 |

## Definition of closed gap

- Есть PR с реализацией.
- Есть тесты (unit + contract + integration).
- Обновлена документация в этой папке.

