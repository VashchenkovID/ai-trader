# Автоматическое одобрение и исполнение заявок

## Как это работает

### 1. Создание заявки
- `NeuralNetworkService` создает заявку через `TradingRequestService.createTradingRequest()`
- Заявка создается со статусом `PENDING`

### 2. Автоматическая обработка
После создания заявки `TradingRequestService` автоматически вызывает `AutoPaperTradingService.processNewRequest()`, если:
- ✅ `tradingMode === 'paper'` (режим виртуальной торговли)
- ✅ `AutoPaperTradingService.isInitialized === true`
- ✅ `AutoPaperTradingService.isEnabled === true`

### 3. Проверка условий (`canAutoExecute()`)
Заявка будет автоматически одобрена и исполнена, если выполняются **все** условия:

#### Обязательные условия:
- ✅ Режим торговли: `paper`
- ✅ Сервис включен: `isEnabled === true`
- ✅ Статус заявки: `PENDING`
- ✅ Заявка не истекла

#### Условия по confidence и score:
- ✅ `confidence >= minConfidence` (по умолчанию 0.7, зависит от фазы)
- ✅ `confidence <= maxConfidence` (0.95, защита от переобучения)
- ✅ Для BUY: `score >= minScore` (по умолчанию 0.65)
- ✅ Для SELL: `score <= maxScore` (по умолчанию 0.35)

#### Лимиты:
- ✅ `dailyTrades < maxDailyTrades` (5-15 в зависимости от фазы)
- ✅ `timeSinceLastTrade >= minTimeBetweenTrades` (5 минут)
- ✅ `dailyPnL > -maxDailyLoss` (максимум 5% дневного убытка)

#### Размер позиции:
- ✅ Размер позиции <= `maxPositionSize` (3-5% капитала в зависимости от фазы)

#### Риски:
- ✅ Валидация через `RiskManagementService.validateOrder()` проходит успешно

### 4. Автоматическое одобрение и исполнение
Если все условия выполнены:
1. **Одобрение**: `tradingRequest.approve()` - статус меняется на `APPROVED`
2. **Симуляция**: `RealisticExecutionSimulator.simulateExecution()` - расчет спреда, проскальзывания, комиссии
3. **Исполнение**: `TradingEngine.executePaperOrder()` - обновление виртуального портфеля
4. **Завершение**: Статус меняется на `EXECUTED`

## Как включить автоматическое одобрение

### 1. Включить AutoPaperTradingService через API

```bash
curl -X POST http://your-server:3001/api/auto-paper-trading/enable
```

Или через фронтенд в настройках автоторговли.

### 2. Проверить статус

```bash
curl http://your-server:3001/api/auto-paper-trading/status
```

Должен вернуть:
```json
{
  "enabled": true,
  "initialized": true,
  "currentPhase": "phase1",
  "dailyTrades": 0,
  ...
}
```

### 3. Проверить настройки в БД

```bash
docker exec ai-trader-db psql -U postgres -d postgres -c "SELECT key, value FROM settings WHERE key LIKE 'auto_trade%';"
```

## Важные моменты

### Пороги для автоматического исполнения
Пороги для **автоматического исполнения** (`AutoPaperTradingService`) **отличаются** от порогов для **создания заявок** (`NeuralNetworkService`):

| Настройка | Создание заявок | Авто-исполнение |
|-----------|----------------|-----------------|
| `minConfidence` | 0.7 (или из БД) | 0.7-0.8 (зависит от фазы) |
| `minScore` (BUY) | 0.6 (или из БД) | 0.65 |
| `minAgreement` | 0.6 (или из БД) | Не проверяется |

**Важно**: Заявка может быть создана, но не исполнена автоматически, если не выполняются условия `canAutoExecute()`.

### Фазы автоматической торговли

Система работает в 3 фазах с разными лимитами:

| Фаза | maxDailyTrades | minConfidence | maxPositionSize |
|------|----------------|---------------|------------------|
| phase1 | 5 | 0.8 | 3% |
| phase2 | 10 | 0.75 | 4% |
| phase3 | 15 | 0.7 | 5% |

### Что происходит, если заявка не проходит проверку

Если заявка не проходит проверку `canAutoExecute()`:
- Заявка остается в статусе `PENDING`
- В логах появляется сообщение с причиной отказа
- Заявку можно одобрить вручную через UI или API

## Примеры причин отказа

- `"Confidence too low: 0.65 < 0.7"` - уверенность слишком низкая
- `"Score too low for BUY: 0.6 < 0.65"` - score слишком низкий для BUY
- `"Daily trades limit reached: 5 >= 5"` - достигнут дневной лимит сделок
- `"Too soon after last trade: 120s < 300s"` - прошло слишком мало времени с последней сделки
- `"Position size too large: 6.5% > 5.0%"` - размер позиции слишком большой
- `"Risk validation failed: ..."` - не прошла проверка рисков

## Рекомендации

1. **Включите AutoPaperTradingService** через API после создания заявок
2. **Мониторьте логи** на наличие сообщений о причинах отказа
3. **Проверьте настройки** - убедитесь, что пороги для создания и исполнения согласованы
4. **Начните с phase1** - более строгие условия для безопасности

