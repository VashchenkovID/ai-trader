# Test Coverage Map

## Текущий статус покрытия (на 2026-02-27)

| Domain | Migration status |
|---|---|
| TradingRequest lifecycle | planned (phase 3) |
| Auto-paper admission/execute | planned (phase 3) |
| Trading mode switch | planned (phase 3) |
| Portfolio migration | planned (phase 3/4) |
| Backtesting/walk-forward | planned (phase 4) |
| Market/news data APIs | done (phase 2, clean repositories) |
| Auth/system/monitoring | done (phase 1, v1-only routing) |

- Статус тестовой карты: актуализирована, текущий общий coverage ~91%, приоритет на integration для write P0 в Фазе 3.

| Domain | Unit | Contract | Integration | E2E |
|---|---|---|---|---|
| TradingRequest lifecycle | required | required | required | optional |
| Auto-paper admission/execute | required | required | required | optional |
| Trading mode switch | required | required | required | optional |
| Portfolio migration | required | optional | required | optional |
| Backtesting/walk-forward | required | optional | required | optional |
| Market/news data APIs | required | required | optional | optional |
| Auth/system/monitoring | required | required | optional | required |

## Coverage gate

- P0 use-case без integration test не может считаться migrated.
- Любой новый error code требует negative test.

