# План реализации автоматического ребалансирования портфеля

## 📋 Обзор

Реализация автоматической системы ребалансирования портфеля, которая будет проверять отклонения от целевых весов позиций и выполнять ребалансировку при необходимости. Система должна учитывать комиссии, минимизировать количество сделок и работать в автоматическом режиме.

## 🎯 Цели

1. **Автоматическое поддержание целевых весов:** Ребалансировка при отклонении > 5% от целевого веса
2. **Учет комиссий:** Оптимизация ребалансировки с учетом стоимости комиссий
3. **Минимизация сделок:** Группировка операций для снижения транзакционных издержек
4. **Периодическая проверка:** Автоматическая проверка каждые 24 часа
5. **Безопасность:** Валидация и проверки перед выполнением ребалансировки

## 🔍 Анализ существующего кода

### Существующие компоненты:

1. **`CapitalAllocationStrategy.js`**:
   - ✅ Метод `calculateRebalancing()` - расчет необходимых изменений
   - ✅ Метод `autoRebalance()` - выполнение ребалансировки (но не используется автоматически)
   - ✅ Метод `analyzePortfolio()` - анализ текущего портфеля
   - ✅ Метод `calculateTargetAllocation()` - расчет целевого распределения
   - ✅ Метод `optimizeAllocation()` - оптимизация распределения

2. **`SchedulerService.js`**:
   - ✅ Поддержка cron-задач
   - ✅ Задачи для ребалансировки стратегий (`strategyRebalanceTask`, `dynamicBudgetRebalanceTask`)
   - ❌ Нет задачи для ребалансировки позиций портфеля

3. **`TradingEngine.js`**:
   - ✅ Метод `getPortfolioValue()` - получение текущего портфеля
   - ✅ Метод `executeOrder()` - выполнение сделок
   - ✅ Расчет комиссий в `executePaperOrder()`

4. **`TinkoffApiService.js`**:
   - ✅ Метод `calculateCommission()` - расчет комиссий

### Что нужно добавить:

1. **Новый сервис `PortfolioRebalancingService.js`**:
   - Проверка отклонений от целевых весов
   - Расчет необходимых операций ребалансировки
   - Оптимизация операций с учетом комиссий
   - Выполнение ребалансировки

2. **Интеграция в `SchedulerService.js`**:
   - Новая cron-задача для периодической проверки

3. **Настройки в `Settings.js`**:
   - Порог отклонения для ребалансировки (по умолчанию 5%)
   - Интервал проверки (по умолчанию 24 часа)
   - Минимальная сумма сделки для ребалансировки
   - Включение/выключение автоматической ребалансировки

## 🏗️ Архитектура решения

### 1. Сервис `PortfolioRebalancingService.js`

**Основные методы:**

```javascript
class PortfolioRebalancingService {
    /**
     * Проверка необходимости ребалансировки
     * @returns {Object} { needsRebalancing: boolean, deviations: Array, summary: Object }
     */
    async checkRebalancingNeeded()

    /**
     * Расчет операций ребалансировки
     * @param {Object} deviations - Отклонения от целевых весов
     * @returns {Array} Массив операций для ребалансировки
     */
    async calculateRebalancingOperations(deviations)

    /**
     * Оптимизация операций с учетом комиссий
     * @param {Array} operations - Операции ребалансировки
     * @returns {Array} Оптимизированные операции
     */
    optimizeOperationsWithCommissions(operations)

    /**
     * Выполнение ребалансировки
     * @param {Array} operations - Операции для выполнения
     * @returns {Object} Результат ребалансировки
     */
    async executeRebalancing(operations)

    /**
     * Полная процедура ребалансировки
     * @returns {Object} Результат ребалансировки
     */
    async performRebalancing()
}
```

### 2. Логика расчета отклонений

```javascript
// Для каждой позиции:
const currentWeight = (position.marketValue / totalPortfolioValue) * 100;
const targetWeight = targetAllocation.find(t => t.symbol === position.figi)?.weight * 100 || 0;
const deviation = currentWeight - targetWeight;
const deviationPercent = targetWeight > 0 ? (deviation / targetWeight) * 100 : 0;

// Ребалансировка нужна, если:
// 1. |deviationPercent| > threshold (по умолчанию 5%)
// 2. Или |deviation| > minDeviationAbsolute (например, 1% от портфеля)
```

### 3. Оптимизация операций

**Принципы:**
1. **Группировка операций:** Объединение покупок/продаж одного инструмента
2. **Минимизация комиссий:** Пропуск операций, где комиссия > выгода от ребалансировки
3. **Приоритизация:** Сначала крупные отклонения, затем мелкие
4. **Проверка ликвидности:** Учет доступных средств и возможности продажи

**Алгоритм:**
```javascript
1. Рассчитать все необходимые операции
2. Сгруппировать операции по инструментам
3. Для каждой группы:
   - Рассчитать чистую выгоду (исправление веса - комиссия)
   - Если выгода < 0, пропустить операцию
   - Если сумма операции < minRebalanceAmount, пропустить
4. Отсортировать операции по приоритету (крупные отклонения первыми)
5. Выполнить операции в порядке приоритета
```

### 4. Учет комиссий

**Расчет комиссии:**
```javascript
const commissionRate = 0.003; // 0.3% для Tinkoff
const minCommission = 1; // 1 рубль минимум
const dealAmount = price * quantity;
const commission = Math.max(dealAmount * commissionRate, minCommission);
```

**Проверка целесообразности:**
```javascript
const rebalanceBenefit = Math.abs(deviation) * portfolioValue / 100; // Выгода от исправления веса
const totalCommission = buyCommission + sellCommission; // Общая комиссия операций
const netBenefit = rebalanceBenefit - totalCommission;

if (netBenefit < 0) {
    // Ребалансировка нецелесообразна
    skipRebalancing = true;
}
```

## 🚀 Этапы реализации

### ✅ Этап 1: Создание сервиса PortfolioRebalancingService (2 дня)

**Задачи:**
1. Создать файл `server/src/services/PortfolioRebalancingService.js`
2. Реализовать метод `checkRebalancingNeeded()`:
   - Получение текущего портфеля через `TradingEngine.getPortfolioValue()`
   - Получение целевого распределения через `CapitalAllocationStrategy.optimizeAllocation()`
   - Расчет отклонений для каждой позиции
   - Определение необходимости ребалансировки
3. Реализовать метод `calculateRebalancingOperations()`:
   - Расчет необходимых операций покупки/продажи
   - Группировка операций по инструментам
   - Расчет количества для каждой операции
4. Реализовать метод `optimizeOperationsWithCommissions()`:
   - Расчет комиссий для каждой операции
   - Фильтрация нецелесообразных операций
   - Приоритизация операций
5. Реализовать метод `executeRebalancing()`:
   - Выполнение операций через `TradingEngine.executeOrder()`
   - Обработка ошибок
   - Логирование результатов
6. Реализовать метод `performRebalancing()`:
   - Полная процедура ребалансировки
   - Валидация перед выполнением
   - Возврат детального результата

**Критерии успеха:**
- Все методы реализованы и протестированы
- Корректный расчет отклонений
- Правильный учет комиссий
- Безопасное выполнение операций

**Файлы для создания:**
- `server/src/services/PortfolioRebalancingService.js`

**Файлы для изменения:**
- `server/src/services/ServiceManager.js` (добавить инициализацию сервиса)

### ✅ Этап 2: Добавление настроек (1 день)

**Задачи:**
1. Добавить настройки в `server/src/models/Settings.js`:
   - `portfolio_rebalancing_enabled` (boolean, default: true)
   - `portfolio_rebalancing_threshold` (number, default: 5) - порог отклонения в процентах
   - `portfolio_rebalancing_check_interval` (string, default: '0 2 * * *') - cron для проверки (каждый день в 2:00)
   - `portfolio_rebalancing_min_amount` (number, default: 1000) - минимальная сумма операции в рублях
   - `portfolio_rebalancing_min_benefit` (number, default: 50) - минимальная чистая выгода в рублях
2. Добавить методы загрузки настроек в `PortfolioRebalancingService`

**Критерии успеха:**
- Настройки добавлены и доступны через Settings API
- Настройки загружаются при инициализации сервиса

**Файлы для изменения:**
- `server/src/models/Settings.js`
- `server/src/services/PortfolioRebalancingService.js`

### ✅ Этап 3: Интеграция в SchedulerService (1 день)

**Задачи:**
1. Добавить задачу `portfolioRebalancingTask` в `SchedulerService.js`
2. Реализовать метод `performPortfolioRebalancing()`:
   - Проверка включена ли автоматическая ребалансировка
   - Вызов `PortfolioRebalancingService.performRebalancing()`
   - Обработка результатов
   - Отправка уведомлений через Telegram
3. Добавить задачу в `start()` метод
4. Добавить управление задачей в `stop()`, `pauseAllProcesses()`, `resumeAllProcesses()`
5. Добавить статус задачи в `getStatus()`

**Критерии успеха:**
- Задача запускается по расписанию
- Корректная обработка ошибок
- Уведомления отправляются при успехе/ошибке

**Файлы для изменения:**
- `server/src/services/SchedulerService.js`

### ✅ Этап 4: API endpoints (1 день)

**Задачи:**
1. Создать файл `server/src/routes/portfolio-rebalancing-routes.js`
2. Добавить endpoints:
   - `GET /api/portfolio-rebalancing/status` - статус ребалансировки
   - `GET /api/portfolio-rebalancing/check` - проверка необходимости ребалансировки
   - `POST /api/portfolio-rebalancing/execute` - выполнение ребалансировки
   - `GET /api/portfolio-rebalancing/history` - история ребалансировок
3. Добавить роуты в `server/src/routes/optimized-routes.js`

**Критерии успеха:**
- Все endpoints работают корректно
- Валидация параметров
- Обработка ошибок

**Файлы для создания:**
- `server/src/routes/portfolio-rebalancing-routes.js`

**Файлы для изменения:**
- `server/src/routes/optimized-routes.js`

### ✅ Этап 5: Сохранение истории ребалансировок (1 день)

**Задачи:**
1. Создать модель `PortfolioRebalancing.js`:
   - `id` - ID записи
   - `timestamp` - время ребалансировки
   - `trigger` - причина ребалансировки (scheduled, manual, threshold)
   - `operations` - JSON массив операций
   - `totalCommission` - общая комиссия
   - `beforeState` - состояние портфеля до ребалансировки (JSON)
   - `afterState` - состояние портфеля после ребалансировки (JSON)
   - `result` - результат (success, partial, failed)
   - `metadata` - дополнительные данные (JSON)
2. Сохранять историю в `PortfolioRebalancingService.executeRebalancing()`

**Критерии успеха:**
- Модель создана и синхронизирована с БД
- История сохраняется при каждой ребалансировке
- Доступ к истории через API

**Файлы для создания:**
- `server/src/models/PortfolioRebalancing.js`

**Файлы для изменения:**
- `server/src/models/index.js`
- `server/src/services/PortfolioRebalancingService.js`
- `server/src/utils/initDatabase.js` (синхронизация модели)
- `server/src/utils/clearDatabase.js` (очистка при необходимости)

### ✅ Этап 6: Тестирование и документация (1 день)

**Задачи:**
1. Создать unit-тесты для `PortfolioRebalancingService`
2. Создать интеграционные тесты для API endpoints
3. Создать документацию `server/docs/PORTFOLIO_REBALANCING_GUIDE.md`
4. Обновить README с примерами использования

**Критерии успеха:**
- Все тесты пройдены
- Документация полная и понятная
- Примеры работают

**Файлы для создания:**
- `server/test-portfolio-rebalancing.js`
- `server/docs/PORTFOLIO_REBALANCING_GUIDE.md`

## 📊 Структура данных

### Отклонение от целевого веса:
```javascript
{
    figi: 'BBG004730N88',
    ticker: 'GAZP',
    currentWeight: 12.5,      // Текущий вес в %
    targetWeight: 10.0,       // Целевой вес в %
    deviation: 2.5,           // Абсолютное отклонение в %
    deviationPercent: 25.0,   // Относительное отклонение в %
    currentValue: 125000,     // Текущая стоимость в рублях
    targetValue: 100000,       // Целевая стоимость в рублях
    needsRebalancing: true    // Нужна ли ребалансировка
}
```

### Операция ребалансировки:
```javascript
{
    figi: 'BBG004730N88',
    ticker: 'GAZP',
    action: 'SELL',           // BUY или SELL
    quantity: 10,             // Количество акций
    currentPrice: 250.0,      // Текущая цена
    estimatedCommission: 7.5, // Ожидаемая комиссия
    rebalanceBenefit: 2500,   // Выгода от ребалансировки
    netBenefit: 2492.5,       // Чистая выгода (выгода - комиссия)
    priority: 1               // Приоритет (1 - высший)
}
```

### Результат ребалансировки:
```javascript
{
    success: true,
    timestamp: '2024-01-15T10:30:00.000Z',
    trigger: 'scheduled',      // scheduled, manual, threshold
    operationsPlanned: 5,      // Запланировано операций
    operationsExecuted: 5,    // Выполнено операций
    operationsSkipped: 0,     // Пропущено операций
    totalCommission: 150.0,   // Общая комиссия
    beforeState: {
        totalValue: 1000000,
        positions: [...],
        weights: {...}
    },
    afterState: {
        totalValue: 999850,   // После комиссий
        positions: [...],
        weights: {...}
    },
    deviations: [...],         // Отклонения до ребалансировки
    operations: [...],         // Выполненные операции
    errors: []                 // Ошибки (если были)
}
```

## ⚙️ Настройки

### Настройки по умолчанию:

```javascript
{
    portfolio_rebalancing_enabled: true,
    portfolio_rebalancing_threshold: 5,              // 5% отклонение
    portfolio_rebalancing_check_interval: '0 2 * * *', // Каждый день в 2:00
    portfolio_rebalancing_min_amount: 1000,         // Минимум 1000 руб на операцию
    portfolio_rebalancing_min_benefit: 50,          // Минимум 50 руб чистой выгоды
    portfolio_rebalancing_max_operations: 20,       // Максимум операций за раз
    portfolio_rebalancing_dry_run: false            // Режим тестирования (без выполнения)
}
```

## 🔒 Безопасность и валидация

### Проверки перед ребалансировкой:

1. **Проверка режима торговли:**
   - Ребалансировка только в режимах `paper` и `micro`
   - В режиме `real` требуется ручное подтверждение

2. **Проверка достаточности средств:**
   - Для покупок проверять наличие наличных
   - Для продаж проверять наличие позиций

3. **Проверка ликвидности:**
   - Проверка доступности инструментов
   - Проверка минимального лота

4. **Проверка рисков:**
   - Не превышать максимальный размер позиции
   - Не нарушать ограничения по секторам

5. **Проверка целесообразности:**
   - Чистая выгода должна быть положительной
   - Сумма операции должна быть достаточной

## 📈 Ожидаемые результаты

1. **Поддержание оптимального распределения:** Портфель будет автоматически поддерживаться в оптимальном состоянии
2. **Снижение рисков:** Своевременная ребалансировка снижает концентрацию рисков
3. **Улучшение производительности:** Оптимальное распределение капитала улучшает общую доходность
4. **Автоматизация:** Уменьшение ручной работы по управлению портфелем

## ⚠️ Риски и ограничения

1. **Комиссии:** Частая ребалансировка может съесть прибыль из-за комиссий
2. **Проскальзывание:** Реальные цены могут отличаться от расчетных
3. **Ликвидность:** Некоторые инструменты могут быть недостаточно ликвидны
4. **Волатильность:** Во время высокой волатильности ребалансировка может быть нецелесообразна

## 🚀 Дальнейшие улучшения

1. **Адаптивный порог:** Динамическое изменение порога в зависимости от волатильности
2. **Умная группировка:** Оптимизация последовательности операций
3. **Tax-loss harvesting:** Учет налоговых последствий при ребалансировке
4. **ML-оптимизация:** Использование машинного обучения для оптимизации времени ребалансировки
5. **Интеграция с PortfolioOptimizer:** Использование оптимизатора для расчета целевых весов

## 📝 Примеры использования

### Проверка необходимости ребалансировки:
```javascript
const PortfolioRebalancingService = await import('./services/PortfolioRebalancingService.js');
const check = await PortfolioRebalancingService.checkRebalancingNeeded();
console.log('Нужна ребалансировка:', check.needsRebalancing);
console.log('Отклонения:', check.deviations);
```

### Выполнение ребалансировки:
```javascript
const result = await PortfolioRebalancingService.performRebalancing();
console.log('Результат:', result.success);
console.log('Операций выполнено:', result.operationsExecuted);
console.log('Комиссия:', result.totalCommission);
```

### API запрос:
```bash
# Проверка необходимости ребалансировки
curl http://localhost:3001/api/portfolio-rebalancing/check

# Выполнение ребалансировки
curl -X POST http://localhost:3001/api/portfolio-rebalancing/execute

# История ребалансировок
curl http://localhost:3001/api/portfolio-rebalancing/history
```

