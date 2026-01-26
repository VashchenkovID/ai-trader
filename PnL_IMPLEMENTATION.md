# Реализация расчета прибыли/убыли для реального режима торговли

## Выполненные этапы

### ✅ Этап 1: Расчет на основе сделок

#### Созданные файлы:
1. **`server/src/services/PnLCalculationService.js`**
   - Сервис для расчета реализованной и нереализованной прибыли/убытка
   - Методы:
     - `calculateRealizedPnL()` - расчет от закрытых сделок
     - `calculateUnrealizedPnL()` - расчет от открытых позиций
     - `getClosedTrades()` - получение закрытых сделок из БД
     - `getOpenPositions()` - получение открытых позиций
     - `calculateTotalPnL()` - полный расчет PnL

#### Обновленные файлы:
1. **`server/src/routes/portfolio-routes.js`**
   - Обновлен endpoint `GET /api/portfolio/real` - использует новый расчет PnL
   - Обновлен endpoint `GET /api/portfolio/` - использует новый расчет для виртуального портфеля
   - Добавлен endpoint `GET /api/portfolio/pnl/detailed` - детальный расчет PnL

2. **`server/src/services/WebSocketService.js`**
   - Обновлена отправка торговой статистики через WebSocket
   - Добавлены новые поля PnL в сообщения

3. **`server/src/services/ServiceManager.js`**
   - Добавлена инициализация `PnLCalculationService`

### ✅ Этап 2: Учет вводов/выводов средств

#### Созданные файлы:
1. **`server/src/models/CashFlow.js`**
   - Модель для учета вводов/выводов средств
   - Статические методы:
     - `getTotalDeposits()` - сумма всех депозитов
     - `getTotalWithdrawals()` - сумма всех выводов
     - `getNetCashFlow()` - чистый денежный поток
     - `getHistory()` - история операций

2. **`server/migrations/create-cash-flows-table.js`**
   - Миграция для создания таблицы `cash_flows`

#### Обновленные файлы:
1. **`server/src/routes/portfolio-routes.js`**
   - Добавлен endpoint `POST /api/portfolio/cash-flow` - регистрация ввода/вывода
   - Добавлен endpoint `GET /api/portfolio/cash-flow` - история вводов/выводов
   - Добавлен endpoint `DELETE /api/portfolio/cash-flow/:id` - удаление записи

2. **`server/src/services/PnLCalculationService.js`**
   - Интегрирован учет CashFlow в расчет PnL
   - Добавлен расчет скорректированного капитала (`adjustedCapital`)

## Новые API endpoints

### 1. Детальный расчет PnL
```
GET /api/portfolio/pnl/detailed
Query params:
  - tradingMode: 'paper'|'micro'|'real' (default: 'real')
  - startDate: Date (optional)
  - endDate: Date (optional)

Response:
{
  "success": true,
  "data": {
    "realized": {
      "total": 50000,
      "count": 10,
      "profitable": 7,
      "unprofitable": 3,
      "percent": 5.0,
      "winRate": 70.0,
      "trades": [...]
    },
    "unrealized": {
      "total": 20000,
      "count": 5,
      "profitable": 3,
      "unprofitable": 2,
      "positions": [...]
    },
    "total": {
      "pnl": 70000,
      "percent": 7.0,
      "count": 15
    },
    "portfolio": {
      "initialCapital": 1000000,
      "adjustedCapital": 1500000,
      "totalValue": 1070000,
      "cash": 500000,
      "positionsValue": 570000
    },
    "cashFlow": {
      "totalDeposits": 500000,
      "totalWithdrawals": 0,
      "netCashFlow": 500000,
      "adjustedCapital": 1500000
    },
    "summary": {
      "totalTrades": 10,
      "totalPositions": 5,
      "winRate": 70.0,
      "averageProfit": 10000,
      "averageLoss": -5000
    }
  }
}
```

### 2. Регистрация ввода/вывода средств
```
POST /api/portfolio/cash-flow
Body:
{
  "type": "DEPOSIT" | "WITHDRAWAL",
  "amount": 500000,
  "date": "2024-01-15T10:00:00Z", // optional
  "description": "Пополнение с карты", // optional
  "portfolioType": "real" // optional, default: "real"
}

Response:
{
  "success": true,
  "message": "Ввод средств зарегистрирован",
  "data": { ...cashFlow }
}
```

### 3. История вводов/выводов
```
GET /api/portfolio/cash-flow
Query params:
  - portfolioType: 'virtual'|'real' (default: 'real')
  - startDate: Date (optional)
  - endDate: Date (optional)
  - limit: number (default: 100)

Response:
{
  "success": true,
  "data": {
    "history": [...],
    "statistics": {
      "totalDeposits": 1000000,
      "totalWithdrawals": 200000,
      "netCashFlow": 800000,
      "count": 5
    }
  }
}
```

### 4. Удаление записи
```
DELETE /api/portfolio/cash-flow/:id

Response:
{
  "success": true,
  "message": "Запись удалена"
}
```

## Структура данных

### Обновленный ответ портфеля
```javascript
{
  "cash": 500000,
  "positions": {...},
  "positionsValue": 570000,
  "totalValue": 1070000,
  "pnl": {
    "total": 70000,
    "totalPercent": 7.0,
    "realized": 50000,
    "realizedPercent": 5.0,
    "unrealized": 20000,
    "winRate": 70.0,
    "totalTrades": 10
  },
  // Обратная совместимость (deprecated)
  "totalPnL": 70000,
  "totalPnLPercent": 7.0,
  "initialCapital": 1000000
}
```

## Миграция базы данных

Для создания таблицы `cash_flows` выполните:

```bash
cd server
node migrations/create-cash-flows-table.js
```

## Использование

### 1. Расчет PnL для портфеля
```javascript
import PnLCalculationService from './services/PnLCalculationService.js';

const portfolio = await TradingEngine.getRealPortfolioValue();
const pnlData = await PnLCalculationService.calculateTotalPnL(portfolio, {
    tradingMode: 'real',
    includeTrades: true,
    includePositions: true,
    includeCashFlow: true
});
```

### 2. Регистрация ввода средств
```javascript
import CashFlow from './models/CashFlow.js';

await CashFlow.create({
    type: 'DEPOSIT',
    amount: 500000,
    date: new Date(),
    description: 'Пополнение с карты',
    portfolioType: 'real'
});
```

### 3. Получение статистики CashFlow
```javascript
const totalDeposits = await CashFlow.getTotalDeposits('real');
const totalWithdrawals = await CashFlow.getTotalWithdrawals('real');
const netCashFlow = await CashFlow.getNetCashFlow('real');
```

## Преимущества новой системы

1. ✅ **Точный расчет** - PnL рассчитывается только от торговых операций
2. ✅ **Учет вводов/выводов** - корректный расчет при изменении капитала
3. ✅ **Детальная статистика** - разделение на реализованную и нереализованную прибыль
4. ✅ **Гибкость** - можно выбрать период для расчета
5. ✅ **Обратная совместимость** - старые поля остаются для совместимости

## Следующие шаги (опционально)

1. Добавить расчет средней цены покупки (FIFO/LIFO) для каждой позиции
2. Добавить расчет доходности с учетом времени (IRR, TWR)
3. Добавить экспорт отчетов по PnL
4. Добавить графики изменения PnL во времени


