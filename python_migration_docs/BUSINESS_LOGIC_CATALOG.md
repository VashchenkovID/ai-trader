# Каталог бизнес-логики (AS-IS)

Документ фиксирует назначение модулей старого Node-сервера как вход в FastAPI миграцию.

## Статус миграции (на 2026-02-26)

- Platform parity (`auth/settings/system/monitoring`) перенесен.
- Read-only группы (`market/news/performance/profitability`) перенесены.
- Write-критичные группы (Trading/Portfolio/Risk core pipelines) остаются целевыми для Фазы 3.

## Роуты (группы)

- Trading: `trading-requests`, `trading`, `trading-mode`, `auto-paper-trading`.
- Portfolio: `portfolio`, `portfolio-migrator`, `portfolio-optimizer`, `portfolio-rebalancing`.
- Risk: `risk-management`, `risk-adjustment`, `switch-validator`, `preflight-check`, `stage3-validator`.
- AI/ML: `ai`, `neural-network`, `training`, `ensemble`, `weekly-forecast`, `model-weighting`.
- Market/Data: `market`, `news`, `assets`, `fundamental-data`, `options-data`, `macro-data`.
- Analytics: `performance`, `performance-analyzer`, `profitability`, `advanced-metrics`, `backtest`.
- Ops: `monitoring`, `system`, `backup`, `retry`, `fallback`, `recovery`, `rate-limit`, `secret-management`.

## Сервисы (ядро)

- Торговый контур: `TradingRequestService`, `TradingEngine`, `AutoPaperTradingService`, `TradingModeManager`.
- Риск/капитал: `RiskManagementService`, `StrategyAllocationService`, `CapitalAllocationStrategy`, `CapitalScalingService`.
- AI/ML: `NeuralNetworkService`, `IntegratedAIService`, `EnsembleService`, `MetaLearningService`, `ReinforcementLearningService`.
- Backtest/forecast: `BacktestingService`, `WeeklyForecastService`, `RealisticExecutionSimulator`.
- Данные: `TinkoffApiService`, `NewsAnalysisService`, `MacroDataService`, `FundamentalDataService`, `OptionsDataService`.
- Платформа: `ServiceManager`, `SchedulerService`, `MonitoringService`, `RetryService`, `FallbackService`, `RecoveryService`.

## Модели (ключевые)

- Торговые: `TradingRequest`, `TradingStrategy`, `PositionExit`, `PositionPyramid`, `PositionStrategy`.
- Портфельные: `VirtualPortfolio`, `RealPortfolio`, `PortfolioAllocation`, `PortfolioRebalancing`.
- ML/аналитика: `Recommendation`, `BacktestResult`, `ModelPerformance`, `WeeklyForecast`.
- Кеш/рыночные: `CachedCandle`, `CachedInstrument`, `CachedNews`, `CachedSignal`, `MacroIndicator`, `OptionsData`.
- Системные: `Settings`, `MigrationStatus`, `DatabaseMigration`, `User`.

## Правило переноса

Для каждого модуля обязательно определить:

1. FastAPI target module.
2. Точные инварианты.
3. Ошибки и коды.
4. Обязательные тесты (unit/contract/integration).

