# Варианты расчета прибыли/убыли для реального режима торговли

## Проблема

Текущая система расчета PnL основана на фиксированном `initialCapital`:
```javascript
totalPnL = totalValue - initialCapital
totalPnLPercent = (totalPnL / initialCapital) * 100
```

**Проблемы этого подхода для реального режима:**
1. ❌ Не учитывает вводы/выводы средств (депозиты/снятия)
2. ❌ При добавлении средств PnL искусственно увеличивается
3. ❌ При выводе средств PnL искусственно уменьшается
4. ❌ Не показывает реальную доходность от торговых операций
5. ❌ Нельзя сравнить эффективность торговли в разные периоды

---

## Варианты решения

### Вариант 1: Расчет на основе закрытых сделок (Trade-Based PnL) ⭐ Рекомендуется

**Принцип:** PnL рассчитывается только от фактически закрытых сделок.

**Преимущества:**
- ✅ Показывает реальную прибыльность торговли
- ✅ Не зависит от вводов/выводов средств
- ✅ Точный расчет для налоговой отчетности
- ✅ Легко реализовать (данные уже есть в TradingRequest)

**Недостатки:**
- ⚠️ Не показывает нереализованную прибыль/убыток
- ⚠️ Требует отдельного расчета для открытых позиций

**Реализация:**
```javascript
// Реализованная прибыль (от закрытых позиций)
realizedPnL = sum(closedTrades.map(trade => {
    const entryPrice = trade.actualPrice || trade.priceAtRequest;
    const exitPrice = trade.exitPrice;
    const quantity = trade.exitQuantity || trade.quantity;
    const commission = trade.commission || 0;
    
    return (exitPrice - entryPrice) * quantity - commission;
}));

// Нереализованная прибыль (от открытых позиций)
unrealizedPnL = sum(openPositions.map(position => {
    const entryPrice = position.averagePrice;
    const currentPrice = position.currentPrice;
    const quantity = position.quantity;
    
    return (currentPrice - entryPrice) * quantity;
}));

totalPnL = realizedPnL + unrealizedPnL;
```

**Метрики:**
- `realizedPnL` - реализованная прибыль/убыток
- `unrealizedPnL` - нереализованная прибыль/убыток
- `totalPnL` - общая прибыль/убыток
- `realizedPnLPercent` - процент реализованной прибыли от вложенного капитала
- `winRate` - процент прибыльных сделок
- `averageWin` - средняя прибыль от прибыльных сделок
- `averageLoss` - средний убыток от убыточных сделок

---

### Вариант 2: Скорректированный капитал с учетом вводов/выводов (Cash Flow Adjusted)

**Принцип:** Отслеживание всех вводов/выводов средств и корректировка `initialCapital`.

**Преимущества:**
- ✅ Учитывает изменения капитала
- ✅ Показывает эффективность использования капитала
- ✅ Можно рассчитать доходность с учетом времени (IRR, TWR)

**Недостатки:**
- ⚠️ Требует создания новой таблицы для учета вводов/выводов
- ⚠️ Сложнее реализация
- ⚠️ Нужно отслеживать все операции пополнения/снятия

**Реализация:**
```javascript
// Новая модель: CashFlow
// - type: 'DEPOSIT' | 'WITHDRAWAL'
// - amount: number
// - date: Date
// - description: string

// Скорректированный начальный капитал
adjustedInitialCapital = initialCapital + 
    sum(deposits) - 
    sum(withdrawals);

// PnL с учетом вводов/выводов
totalPnL = totalValue - adjustedInitialCapital;
totalPnLPercent = (totalPnL / adjustedInitialCapital) * 100;

// Взвешенная доходность (Time-Weighted Return)
// Учитывает время нахождения капитала в портфеле
```

**Метрики:**
- `adjustedInitialCapital` - скорректированный начальный капитал
- `totalDeposits` - сумма всех депозитов
- `totalWithdrawals` - сумма всех выводов
- `netCashFlow` - чистый денежный поток
- `timeWeightedReturn` - взвешенная по времени доходность

---

### Вариант 3: Метод на основе средней цены покупки (Average Cost Basis)

**Принцип:** Расчет PnL на основе средней цены покупки каждой позиции (FIFO/LIFO).

**Преимущества:**
- ✅ Точный расчет для каждой позиции
- ✅ Учитывает множественные покупки/продажи
- ✅ Подходит для налоговой отчетности (FIFO)
- ✅ Показывает эффективность каждой позиции

**Недостатки:**
- ⚠️ Сложнее расчет при множественных сделках
- ⚠️ Нужно правильно обрабатывать частичные продажи

**Реализация:**
```javascript
// Для каждой позиции рассчитываем среднюю цену покупки
positions.forEach(position => {
    const buyTrades = getBuyTradesForPosition(position.figi);
    const sellTrades = getSellTradesForPosition(position.figi);
    
    // FIFO: первая купленная, первая проданная
    let remainingQuantity = position.quantity;
    let totalCost = 0;
    let totalSoldCost = 0;
    
    // Рассчитываем стоимость покупок
    buyTrades.forEach(trade => {
        totalCost += trade.quantity * trade.actualPrice;
    });
    
    // Рассчитываем стоимость проданных акций (FIFO)
    sellTrades.forEach(sellTrade => {
        let remainingSellQty = sellTrade.quantity;
        for (const buyTrade of buyTrades) {
            if (remainingSellQty <= 0) break;
            const sellQty = Math.min(remainingSellQty, buyTrade.quantity);
            totalSoldCost += sellQty * buyTrade.actualPrice;
            remainingSellQty -= sellQty;
        }
    });
    
    // Средняя цена покупки для текущей позиции
    const averageCost = totalCost / sum(buyTrades.map(t => t.quantity));
    
    // Реализованная прибыль от проданных акций
    const realizedPnL = sum(sellTrades.map(t => {
        return (t.actualPrice - averageCost) * t.quantity - t.commission;
    }));
    
    // Нереализованная прибыль от текущей позиции
    const unrealizedPnL = (currentPrice - averageCost) * remainingQuantity;
    
    position.realizedPnL = realizedPnL;
    position.unrealizedPnL = unrealizedPnL;
    position.averageCost = averageCost;
});
```

**Метрики:**
- `averageCost` - средняя цена покупки
- `realizedPnL` - реализованная прибыль по позиции
- `unrealizedPnL` - нереализованная прибыль по позиции
- `totalPnL` - общая прибыль по позиции

---

### Вариант 4: Гибридный метод (Рекомендуется для продакшн) ⭐⭐⭐

**Принцип:** Комбинация всех методов для максимальной информативности.

**Преимущества:**
- ✅ Показывает полную картину
- ✅ Разные метрики для разных целей
- ✅ Гибкость в отображении данных

**Реализация:**
```javascript
class PnLCalculator {
    // 1. Реализованная прибыль от закрытых сделок
    calculateRealizedPnL(closedTrades) {
        return closedTrades.reduce((sum, trade) => {
            const entryPrice = trade.actualPrice || trade.priceAtRequest;
            const exitPrice = trade.exitPrice;
            const quantity = trade.exitQuantity || trade.quantity;
            const commission = trade.commission || 0;
            
            return sum + ((exitPrice - entryPrice) * quantity - commission);
        }, 0);
    }
    
    // 2. Нереализованная прибыль от открытых позиций
    calculateUnrealizedPnL(openPositions, currentPrices) {
        return openPositions.reduce((sum, position) => {
            const entryPrice = position.averagePrice;
            const currentPrice = currentPrices[position.figi] || 0;
            const quantity = position.quantity;
            
            if (entryPrice && currentPrice) {
                return sum + ((currentPrice - entryPrice) * quantity);
            }
            return sum;
        }, 0);
    }
    
    // 3. Скорректированный капитал (если есть вводы/выводы)
    calculateAdjustedCapital(initialCapital, cashFlows) {
        const deposits = cashFlows
            .filter(cf => cf.type === 'DEPOSIT')
            .reduce((sum, cf) => sum + cf.amount, 0);
        
        const withdrawals = cashFlows
            .filter(cf => cf.type === 'WITHDRAWAL')
            .reduce((sum, cf) => sum + cf.amount, 0);
        
        return initialCapital + deposits - withdrawals;
    }
    
    // 4. Общий расчет
    calculateTotalPnL(portfolio, closedTrades, cashFlows = []) {
        const realizedPnL = this.calculateRealizedPnL(closedTrades);
        const unrealizedPnL = this.calculateUnrealizedPnL(
            portfolio.openPositions,
            portfolio.currentPrices
        );
        
        const totalPnL = realizedPnL + unrealizedPnL;
        
        // Если есть вводы/выводы, рассчитываем скорректированный капитал
        const adjustedCapital = cashFlows.length > 0
            ? this.calculateAdjustedCapital(portfolio.initialCapital, cashFlows)
            : portfolio.initialCapital;
        
        // Доходность от скорректированного капитала
        const totalPnLPercent = adjustedCapital > 0
            ? (totalPnL / adjustedCapital) * 100
            : 0;
        
        // Доходность только от реализованной прибыли
        const realizedPnLPercent = adjustedCapital > 0
            ? (realizedPnL / adjustedCapital) * 100
            : 0;
        
        return {
            realizedPnL,
            unrealizedPnL,
            totalPnL,
            totalPnLPercent,
            realizedPnLPercent,
            adjustedCapital,
            initialCapital: portfolio.initialCapital,
            totalValue: portfolio.totalValue,
            cash: portfolio.cash,
            positionsValue: portfolio.positionsValue
        };
    }
}
```

**Метрики:**
- Все метрики из вариантов 1, 2, 3
- `totalPnL` - общая прибыль (реализованная + нереализованная)
- `realizedPnL` - только реализованная прибыль
- `unrealizedPnL` - только нереализованная прибыль
- `adjustedCapital` - скорректированный капитал
- `returnOnCapital` - доходность на капитал

---

## Рекомендации по реализации

### Этап 1: Базовый расчет (Вариант 1)
1. ✅ Реализовать расчет на основе закрытых сделок
2. ✅ Добавить расчет нереализованной прибыли
3. ✅ Обновить API endpoints для отображения новых метрик

### Этап 2: Учет вводов/выводов (Вариант 2)
1. ✅ Создать модель `CashFlow` для учета депозитов/снятий
2. ✅ Добавить API для регистрации вводов/выводов
3. ✅ Реализовать расчет скорректированного капитала

### Этап 3: Детальный расчет по позициям (Вариант 3)
1. ✅ Реализовать FIFO/LIFO расчет средней цены
2. ✅ Добавить расчет прибыли по каждой позиции
3. ✅ Обновить интерфейс для отображения детальной информации

### Этап 4: Гибридный метод (Вариант 4)
1. ✅ Объединить все методы
2. ✅ Добавить выбор метода расчета в настройках
3. ✅ Реализовать различные отчеты

---

## Структура данных

### Новая модель: CashFlow
```javascript
const CashFlow = sequelize.define('CashFlow', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    type: {
        type: DataTypes.ENUM('DEPOSIT', 'WITHDRAWAL'),
        allowNull: false
    },
    amount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false
    },
    date: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    portfolioType: {
        type: DataTypes.ENUM('virtual', 'real'),
        allowNull: false,
        defaultValue: 'real'
    }
});
```

### Обновление модели RealPortfolio
```javascript
// Добавить поля:
cashFlows: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'История вводов/выводов средств (JSON массив)'
},
// Или использовать отдельную таблицу CashFlow
```

---

## API изменения

### Новые endpoints:
```javascript
// Регистрация ввода/вывода средств
POST /api/portfolio/cash-flow
Body: {
    type: 'DEPOSIT' | 'WITHDRAWAL',
    amount: number,
    date: Date,
    description: string
}

// Получение истории вводов/выводов
GET /api/portfolio/cash-flow

// Получение детального PnL
GET /api/portfolio/pnl/detailed
Response: {
    realizedPnL: number,
    unrealizedPnL: number,
    totalPnL: number,
    adjustedCapital: number,
    initialCapital: number,
    totalDeposits: number,
    totalWithdrawals: number,
    byPosition: [...],
    byTrade: [...]
}
```

### Обновление существующих endpoints:
```javascript
// GET /api/portfolio/real
// Добавить новые поля в ответ:
{
    ...existingFields,
    pnl: {
        realized: number,
        unrealized: number,
        total: number,
        realizedPercent: number,
        totalPercent: number,
        adjustedCapital: number
    },
    cashFlows: {
        totalDeposits: number,
        totalWithdrawals: number,
        netCashFlow: number
    }
}
```

---

## Миграция данных

### Для существующих портфелей:
1. Рассчитать `initialCapital` на основе первой синхронизации
2. Если `initialCapital` не установлен, использовать текущий `totalValue`
3. Создать записи `CashFlow` для известных вводов/выводов (если есть)
4. Пересчитать PnL по новому методу

---

## Примеры использования

### Пример 1: Базовый расчет (Вариант 1)
```javascript
// Пользователь начал с 1,000,000 руб
// Закрыл 10 сделок с прибылью +50,000 руб
// Имеет открытые позиции с нереализованной прибылью +20,000 руб

const pnl = calculateTotalPnL(portfolio, closedTrades, []);
// {
//     realizedPnL: 50000,
//     unrealizedPnL: 20000,
//     totalPnL: 70000,
//     totalPnLPercent: 7.0, // от initialCapital
//     realizedPnLPercent: 5.0
// }
```

### Пример 2: С учетом вводов/выводов (Вариант 2)
```javascript
// Пользователь начал с 1,000,000 руб
// Добавил 500,000 руб через месяц
// Закрыл сделки с прибылью +100,000 руб

const cashFlows = [
    { type: 'DEPOSIT', amount: 500000, date: '2024-02-01' }
];

const pnl = calculateTotalPnL(portfolio, closedTrades, cashFlows);
// {
//     realizedPnL: 100000,
//     unrealizedPnL: 0,
//     totalPnL: 100000,
//     adjustedCapital: 1500000, // 1,000,000 + 500,000
//     totalPnLPercent: 6.67, // 100,000 / 1,500,000
//     initialCapital: 1000000
// }
```

---

## Выводы

**Рекомендуемый подход:** Начать с **Варианта 1** (расчет на основе сделок), затем добавить **Вариант 2** (учет вводов/выводов) для полной картины.

**Приоритеты:**
1. 🔴 Высокий: Реализовать расчет на основе закрытых сделок
2. 🟡 Средний: Добавить учет вводов/выводов средств
3. 🟢 Низкий: Детальный расчет по позициям (FIFO/LIFO)

Это позволит:
- ✅ Показывать реальную прибыльность торговли
- ✅ Не зависеть от изменений капитала
- ✅ Сравнивать эффективность в разные периоды
- ✅ Готовить точные отчеты для налоговой

