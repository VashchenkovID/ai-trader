# Зависимости между таблицами базы данных

## Граф зависимостей

```
Settings (нет зависимостей)
  ↓
TradingStrategy (нет зависимостей)
  ↓
Recommendation (зависит от TradingStrategy: strategyId)
  ↓
TradingRequest (зависит от Recommendation: recommendationId, TradingStrategy: strategyId)
  ↓
├─ PositionExit (зависит от TradingRequest: tradingRequestId)
├─ TriggeredSignal (зависит от TradingRequest: tradingRequestId)
├─ PositionStrategy (зависит от TradingRequest: positionId, TradingStrategy: strategyId)
├─ TrailingStop (зависит от TradingRequest: tradingRequestId, TradingStrategy: strategyId)
└─ PositionPyramid (зависит от TradingRequest: basePositionId, TradingStrategy: strategyId)

PortfolioAllocation (зависит от TradingStrategy: strategyId)
BacktestResult (зависит от TradingStrategy: strategyId)
```

## Правильный порядок создания таблиц

1. **Settings** - критическая таблица, создается первой
2. **TradingStrategy** - используется многими таблицами
3. **Recommendation** - зависит от TradingStrategy (strategyId)
4. **TradingRequest** - зависит от Recommendation (recommendationId) и TradingStrategy (strategyId)
5. **Таблицы, зависящие от TradingRequest** (создаются после TradingRequest):
   - PositionExit
   - TriggeredSignal
   - PositionStrategy
   - TrailingStop
   - PositionPyramid
6. **Таблицы, зависящие только от TradingStrategy** (могут создаваться после TradingStrategy):
   - PortfolioAllocation
   - BacktestResult

## Проверка зависимостей

### TradingRequest
- `recommendationId` → `Recommendations.figi` (Recommendation)
- `strategyId` → `trading_strategies.id` (TradingStrategy)

### PositionStrategy
- `positionId` → `trading_requests.id` (TradingRequest)
- `strategyId` → `trading_strategies.id` (TradingStrategy)

### PositionExit
- `tradingRequestId` → `trading_requests.id` (TradingRequest)

### TriggeredSignal
- `tradingRequestId` → `trading_requests.id` (TradingRequest)

### TrailingStop
- `tradingRequestId` → `trading_requests.id` (TradingRequest)
- `strategyId` → `trading_strategies.id` (TradingStrategy)

### PositionPyramid
- `basePositionId` → `trading_requests.id` (TradingRequest)
- `strategyId` → `trading_strategies.id` (TradingStrategy)

### PortfolioAllocation
- `strategyId` → `trading_strategies.id` (TradingStrategy)

### BacktestResult
- `strategyId` → `trading_strategies.id` (TradingStrategy)

### Recommendation
- `strategyId` → `trading_strategies.id` (TradingStrategy)

## Текущий порядок в initDatabase.js

1. Settings (строка ~806)
2. TradingStrategy (строка ~814)
3. CachedInstrument (строка ~827)
4. CachedNews, CachedTelegramSentiment, CachedTradingHours (строка ~853)
5. **Recommendation** (строка ~862) ✓ - после TradingStrategy
6. **TradingRequest** (строка ~871) ✓ - после Recommendation
7. **PositionExit** (строка ~1028) ✓ - после TradingRequest
8. **TriggeredSignal** (строка ~1042) ✓ - после TradingRequest
9. **PositionStrategy** (строка ~1049) ✓ - после TradingRequest
10. **TrailingStop** (строка ~1098) ✓ - после TradingRequest
11. VirtualPortfolio (строка ~1105)
12. RealPortfolio (строка ~1153)
13. CachedSignal (строка ~1160)
14. TrainingState (строка ~1167)
15. **PortfolioAllocation** (строка ~1176) ✓ - после TradingStrategy
16. **BacktestResult** (строка ~1186) ✓ - после TradingStrategy
17. MacroIndicator (строка ~1268)
18. ... (остальные таблицы)
19. **PositionPyramid** (строка ~1595) ✓ - после TradingRequest (с проверкой существования)

## Вывод

✅ Все зависимости учтены правильно!
✅ Порядок создания таблиц соответствует графу зависимостей
✅ Нет циклических зависимостей
✅ Нет дубликатов создания таблиц

