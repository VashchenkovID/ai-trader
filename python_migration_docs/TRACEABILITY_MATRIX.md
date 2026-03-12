# Traceability Matrix

## Рабочая матрица миграции

## Статус документа (на 2026-02-26)

- Матрица актуализирована: закрытые потоки фаз 1-2 отмечены как `done`.
- Write-критичные и последующие потоки сохранены в `todo` до реализации соответствующих фаз.

| Flow | Legacy Routes | Legacy Services | Legacy Models | FastAPI Target | Owner | Priority | ETA | Dependencies | Tests Required | Status | DoD |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Platform parity (auth/settings/system/monitoring) | `auth-routes`, `system-routes`, `monitoring-routes` | auth/system/monitoring services | `User`, `Settings` | `app/api/v1/auth.py`, `settings.py`, `system.py`, `monitoring.py` | Backend Platform | P0 | done | Error model, middleware, metrics registry | Unit + Contract + Smoke | done | Legacy aliases работают, error envelope единый, smoke тесты green |
| Read-only compatibility (market/news/performance/profitability) | `market-routes`, `news-routes`, `performance`, `profitability-routes` | market/news/performance/profitability services | `CachedInstrument`, `CachedNews`, `TradingRequest`, `ModelPerformance` | `app/api/v1/market.py`, `news.py`, `performance.py`, `profitability.py` | Backend Core | P0 | done | DB schema mapping, SQL utils, API contracts | Unit + Contract | done | Формы ответов совместимы, fallback при отсутствии части данных, тесты green |
| Request lifecycle | `trading-requests-routes` | `TradingRequestService` | `TradingRequest` | `app/api/v1/trading_requests.py` + `app/services/trading_request_service.py` | Backend Core | P0 | done | Error model, DB schema | Unit + Contract | done | State machine покрыт, CRUD работает |
| Auto-paper | `auto-paper-trading-routes` | `AutoPaperTradingService` | `AutoPaperTradingStats`, `TradingRequest` | `app/api/v1/auto_paper.py` + `app/services/auto_paper_service.py` | Quant Backend | P0 | done | Request lifecycle | Unit + Contract | done | Status/enable/disable/stats, can-execute, execute, hard guard paper-only |
| Mode switch | `trading-mode-routes` | `TradingModeManager`, `SwitchValidator` | `Settings` | `app/api/v1/trading_mode.py` | Backend Platform | P0 | done | Error codes, settings service | Unit + Contract | done | current/switch/can-switch реализованы |
| Portfolio migration | `portfolio-migrator-routes` | `PortfolioMigrator` | `MigrationStatus` | `app/api/v1/portfolio_migration.py` | Trading Ops | P0 | 8d | Trading engine API, migration state machine, notifications | Unit + Integration + Recovery test | todo | Шаги миграции и cancel/fail сценарии детерминированы |
| Backtest/WF | `backtest-routes` | `BacktestingService` | `BacktestResult`, `CachedCandle`, `Recommendation` | `app/api/v1/backtesting.py` + `app/services/backtesting.py` | Quant Research | P1 | 9d | Market data repository, anti-lookahead rule | Unit + Integration + Statistical regression | todo | Anti-lookahead сохранен, метрики в допустимом дельта-пределе |
| Portfolio sync | `portfolio-routes` | `PortfolioSyncService`, `PnLCalculationService` | `VirtualPortfolio`, `RealPortfolio` | `app/api/v1/portfolio.py` + broker adapter `app/services/tinkoff_client.py` | Backend Core | P0 | 6d | Broker adapter (TinkoffApiClient), pnl service, cash flow rules | Unit + Contract + Integration | in-progress | GetPortfolio/GetPositions вызов и контракт (cash, totalValue, positionsValue); RealPortfolio sync в БД |
| Risk checks | `risk-management-routes` | `RiskManagementService` | `Settings`, `InstrumentStats` | `app/api/v1/risk.py` + `app/services/risk_service.py` | Risk Team | P0 | done | Settings, order DTO | Unit + Contract | done | status/limits/validate, лимиты enforce |
| Recommendation auto-create | `ai-routes`, `market-routes` | `NeuralNetworkService`, `TradingRequestService` | `Recommendation`, `TradingRequest` | `app/api/v1/recommendation_pipeline.py` + `app/services/recommendation_pipeline_service.py` | Quant Backend | P0 | done | Dedup policy, thresholds | Unit + Contract | done | run pipeline, created/skipped, пороги и дедупликация |
| Execution simulation | `trading-routes`, `trading-requests-routes` | `RealisticExecutionSimulator`, `TradingEngine` | `TradingRequest` | `app/services/execution_simulator.py` | Trading Ops | P1 | 4d | Commission/tax rules, liquidity inputs | Unit + Integration | todo | Spread/slippage/partial fill воспроизводятся консистентно |
| Daily reporting | `position-monitoring-routes`, `performance-routes` | `DailyReportService`, `PerformanceAnalyzer`, `ProfitabilityTracker` | `AutoPaperTradingStats`, `BacktestResult` | `app/api/v1/reports.py` | Analytics Team | P1 | 5d | Telemetry schema, report exporter | Unit + Contract | todo | Report payload стабилен, ключевые метрики совпадают |

## Риски по матрице (быстрый фокус)

- `P0`: Request lifecycle, Auto-paper, Mode switch, Portfolio migration, Portfolio sync, Risk checks, Recommendation auto-create.
- Самые рискованные зависимости: broker adapter, unified error model, gate metrics. (Idempotency не внедряется.)

## Правила статусов

- `todo`: не начато
- `in-progress`: есть активная реализация и тесты в работе
- `blocked`: зависимость не закрыта
- `done`: пройдены DoD + тесты + обновлена документация


