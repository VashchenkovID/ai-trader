# Руководство по использованию PortfolioOptimizer

## 📋 Обзор

`PortfolioOptimizer` - сервис для оптимизации портфеля ценных бумаг с использованием современных математических методов. Реализует три основных метода оптимизации:

1. **Mean-Variance Optimization (Markowitz)** - классическая оптимизация по соотношению доходность/риск
2. **Black-Litterman Model** - оптимизация с учетом прогнозов AI и рыночных ожиданий
3. **Risk Parity** - равномерное распределение риска между позициями

## 🚀 Быстрый старт

### Инициализация

```javascript
import PortfolioOptimizer from './services/PortfolioOptimizer.js';

// Инициализация (выполняется автоматически при первом использовании)
await PortfolioOptimizer.initialize();
```

### Базовое использование

```javascript
// Подготовка инструментов
const instruments = [
    { figi: 'BBG004S68614', ticker: 'SBER', name: 'Сбербанк' },
    { figi: 'BBG004730N88', ticker: 'GAZP', name: 'Газпром' },
    { figi: 'BBG004730ZJ9', ticker: 'LKOH', name: 'Лукойл' }
];

// Получение матрицы корреляций
const correlationMatrix = await CorrelationService.getCorrelationMatrix(
    instruments.map(i => i.figi)
);

// Mean-Variance оптимизация
const result = await PortfolioOptimizer.meanVarianceOptimization({
    instruments: instruments,
    correlationMatrix: correlationMatrix,
    totalCapital: 1000000, // 1 млн рублей
    riskAversion: 3.0
});

console.log('Оптимальные веса:', result.weights);
console.log('Sharpe Ratio:', result.sharpeRatio);
```

## 📚 API Методы

### 1. Mean-Variance Optimization

**Метод:** `meanVarianceOptimization(options)`

**Параметры:**
- `instruments` (Array, обязательный) - Массив инструментов с полями `figi`, `ticker`, `name`
- `correlationMatrix` (Object, обязательный) - Матрица корреляций между инструментами
- `totalCapital` (Number, опционально) - Общий капитал портфеля (по умолчанию: 1000000)
- `riskAversion` (Number, опционально) - Коэффициент неприятия риска (по умолчанию: 3.0)
- `targetReturn` (Number, опционально) - Целевая доходность в процентах
- `maxPositionSize` (Number, опционально) - Максимальный размер позиции (0-1, по умолчанию: 0.1)
- `minPositionSize` (Number, опционально) - Минимальный размер позиции (0-1, по умолчанию: 0.01)
- `constraints` (Object, опционально) - Дополнительные ограничения
- `expectedReturnsMethod` (String, опционально) - Метод расчета доходностей: 'historical', 'ai_forecast', 'blended' (по умолчанию: 'blended')
- `generateFrontier` (Boolean, опционально) - Генерировать эффективную границу (по умолчанию: false)

**Возвращает:**
```javascript
{
    weights: { figi: weight, ... }, // Веса портфеля
    expectedReturn: number,          // Ожидаемая доходность в %
    portfolioVolatility: number,      // Волатильность портфеля в %
    sharpeRatio: number,             // Коэффициент Шарпа
    optimizationMethod: 'mean_variance',
    constraints: {...},              // Примененные ограничения
    warnings: [...],                 // Предупреждения
    iterations: number,              // Количество итераций
    converged: boolean,              // Сошлась ли оптимизация
    efficientFrontier: [...],        // Эффективная граница (если запрошена)
    riskFreeRate: number,           // Безрисковая ставка в %
    riskAversion: number,           // Использованный коэффициент неприятия риска
    executionTime: number           // Время выполнения в мс
}
```

**Пример:**
```javascript
const result = await PortfolioOptimizer.meanVarianceOptimization({
    instruments: instruments,
    correlationMatrix: correlationMatrix,
    totalCapital: 1000000,
    riskAversion: 3.0,
    maxPositionSize: 0.15, // Максимум 15% на позицию
    constraints: {
        maxPositions: 10 // Максимум 10 позиций
    }
});
```

### 2. Black-Litterman Optimization

**Метод:** `blackLittermanOptimization(options)`

**Параметры:**
- Все параметры из Mean-Variance, плюс:
- `tau` (Number, опционально) - Масштабирующий параметр (по умолчанию: 0.05)
- `marketCapWeights` (Object, опционально) - Рыночные веса {figi: weight}
- `views` (Object, опционально) - Внешние views (если не указаны, формируются из AI прогнозов)

**Возвращает:**
```javascript
{
    weights: {...},
    expectedReturn: number,
    portfolioVolatility: number,
    sharpeRatio: number,
    optimizationMethod: 'black_litterman',
    tau: number,
    viewsCount: number,              // Количество views от AI
    impliedReturns: [...],           // Подразумеваемые доходности
    blExpectedReturns: [...],       // Black-Litterman доходности
    // ... остальные поля как в Mean-Variance
}
```

**Пример:**
```javascript
const result = await PortfolioOptimizer.blackLittermanOptimization({
    instruments: instruments,
    correlationMatrix: correlationMatrix,
    totalCapital: 1000000,
    tau: 0.05,
    riskAversion: 3.0
    // Views будут автоматически сформированы из прогнозов AI
});
```

### 3. Risk Parity Optimization

**Метод:** `riskParityOptimization(options)`

**Параметры:**
- Все параметры из Mean-Variance, плюс:
- `maxIterations` (Number, опционально) - Максимум итераций (по умолчанию: 200)
- `tolerance` (Number, опционально) - Точность сходимости (по умолчанию: 1e-3)

**Возвращает:**
```javascript
{
    weights: {...},
    expectedReturn: number,
    portfolioVolatility: number,
    sharpeRatio: number,
    optimizationMethod: 'risk_parity',
    riskContributions: [...],        // Вклады в риск для каждого инструмента
    targetContribution: number,      // Целевой вклад в риск
    uniformity: number,              // Равномерность распределения риска (0-1)
    maxDeviation: number,            // Максимальное отклонение от целевого вклада
    // ... остальные поля
}
```

**Пример:**
```javascript
const result = await PortfolioOptimizer.riskParityOptimization({
    instruments: instruments,
    correlationMatrix: correlationMatrix,
    totalCapital: 1000000,
    maxIterations: 200,
    tolerance: 1e-3
});
```

### 4. Генерация эффективной границы

**Метод:** `generateEfficientFrontier(instruments, correlationMatrix, steps)`

**Параметры:**
- `instruments` (Array) - Массив инструментов
- `correlationMatrix` (Object) - Матрица корреляций
- `steps` (Number, опционально) - Количество точек на границе (по умолчанию: 20)

**Возвращает:**
```javascript
[
    {
        return: number,      // Доходность в %
        risk: number,        // Риск в %
        sharpe: number,      // Sharpe Ratio
        weights: {...}       // Веса портфеля
    },
    ...
]
```

### 5. Утилиты

**Получение статуса:**
```javascript
const status = PortfolioOptimizer.getStatus();
// Возвращает: isInitialized, settings, cacheSize, performance
```

**Получение метрик производительности:**
```javascript
const metrics = PortfolioOptimizer.getPerformanceMetrics();
// Возвращает: optimizationCount, averageOptimizationTime, errors, cacheHitRate
```

**Очистка кеша:**
```javascript
PortfolioOptimizer.clearCache();
```

**Сброс метрик производительности:**
```javascript
PortfolioOptimizer.resetPerformanceMetrics();
```

## 🔌 Интеграция с CapitalAllocationStrategy

PortfolioOptimizer интегрирован с `CapitalAllocationStrategy` через стратегию `optimized`:

```javascript
import CapitalAllocationStrategy from './services/CapitalAllocationStrategy.js';

// Установить стратегию optimized
CapitalAllocationStrategy.currentStrategy = 'optimized';

// Выбрать метод оптимизации
CapitalAllocationStrategy.strategies.optimized.optimizationMethod = 'mean_variance';
// или 'black_litterman', 'risk_parity'

// Выполнить оптимизацию
const result = await CapitalAllocationStrategy.optimizeAllocation('optimized');
```

## 🌐 REST API Endpoints

### Получение статуса
```
GET /api/portfolio-optimizer/status
```

### Получение метрик производительности
```
GET /api/portfolio-optimizer/performance
```

### Mean-Variance оптимизация
```
POST /api/portfolio-optimizer/optimize/mean-variance
Body: {
    instruments: [{figi: '...', ticker: '...'}],
    totalCapital: 1000000,
    riskAversion: 3.0,
    ...
}
```

### Black-Litterman оптимизация
```
POST /api/portfolio-optimizer/optimize/black-litterman
Body: {
    instruments: [...],
    tau: 0.05,
    ...
}
```

### Risk Parity оптимизация
```
POST /api/portfolio-optimizer/optimize/risk-parity
Body: {
    instruments: [...],
    maxIterations: 200,
    ...
}
```

### Генерация эффективной границы
```
POST /api/portfolio-optimizer/efficient-frontier
Body: {
    instruments: [...],
    steps: 20
}
```

### Оптимизация через CapitalAllocationStrategy
```
POST /api/portfolio-optimizer/optimize-allocation
Body: {
    strategy: 'optimized',
    optimizationMethod: 'mean_variance'
}
```

### Очистка кеша
```
POST /api/portfolio-optimizer/clear-cache
```

### Сброс метрик производительности
```
POST /api/portfolio-optimizer/performance/reset
```

## ⚙️ Настройки

Настройки загружаются из модели `Settings`:

- `portfolio_opt_period_days` - Период для исторических данных (по умолчанию: 90 дней)
- `portfolio_opt_risk_free_rate` - Безрисковая ставка (по умолчанию: 0.05 = 5%)
- `portfolio_opt_expected_return_method` - Метод расчета доходностей: 'historical', 'ai_forecast', 'blended' (по умолчанию: 'blended')
- `portfolio_opt_regularization_factor` - Фактор регуляризации для матрицы ковариаций (по умолчанию: 0.001)
- `portfolio_opt_cache_ttl_hours` - TTL кеша в часах (по умолчанию: 1 час)

## 📊 Ограничения

### Поддерживаемые ограничения:

1. **Long-only** - только длинные позиции (w_i >= 0)
2. **Максимальный размер позиции** - `maxPositionSize` (по умолчанию: 10%)
3. **Минимальный размер позиции** - `minPositionSize` (по умолчанию: 1%)
4. **Максимальное количество позиций** - `maxPositions`
5. **Максимальная экспозиция на сектор** - `maxSectorExposure`

### Пример с ограничениями:

```javascript
const result = await PortfolioOptimizer.meanVarianceOptimization({
    instruments: instruments,
    correlationMatrix: correlationMatrix,
    constraints: {
        maxPositionSize: 0.15,      // Максимум 15% на позицию
        minPositionSize: 0.02,      // Минимум 2% на позицию
        maxPositions: 10,           // Максимум 10 позиций
        maxSectorExposure: 0.30     // Максимум 30% на сектор
    }
});
```

## ⚠️ Обработка ошибок

Все методы оптимизации выбрасывают исключения при ошибках. Рекомендуется использовать try-catch:

```javascript
try {
    const result = await PortfolioOptimizer.meanVarianceOptimization({
        instruments: instruments,
        correlationMatrix: correlationMatrix
    });
    // Использовать результат
} catch (error) {
    console.error('Ошибка оптимизации:', error.message);
    // Fallback на стандартный метод распределения
}
```

### Типичные ошибки:

- `Необходимо предоставить массив инструментов` - пустой или невалидный массив инструментов
- `Необходимо минимум 2 инструмента для оптимизации` - недостаточно инструментов
- `Обнаружены дубликаты FIGI` - повторяющиеся инструменты в списке
- `Не удалось получить матрицу корреляций` - проблема с CorrelationService
- `Оптимизация не сошлась` - алгоритм не нашел решение (проверьте `result.converged`)

## 🔍 Мониторинг производительности

### Метрики производительности:

```javascript
const metrics = PortfolioOptimizer.getPerformanceMetrics();
// {
//     optimizationCount: 10,
//     totalOptimizationTime: 5000,
//     averageOptimizationTime: 500,
//     lastOptimizationTime: 450,
//     errors: [...],
//     cacheHitRate: 75.5
// }
```

### Критерии производительности:

- Оптимизация должна выполняться за **< 5 секунд** для 50 инструментов
- Среднее время оптимизации должно быть **< 1 секунды** для типичных случаев
- Кеш должен обеспечивать **> 50%** попаданий при повторных запросах

## 💡 Рекомендации по использованию

1. **Выбор метода оптимизации:**
   - **Mean-Variance** - для базовой оптимизации, когда нет прогнозов AI
   - **Black-Litterman** - когда есть качественные прогнозы AI, нужно учесть мнения экспертов
   - **Risk Parity** - для консервативных портфелей с равномерным распределением риска

2. **Настройка параметров:**
   - `riskAversion`: выше значение = более консервативный портфель (меньше риск)
   - `maxPositionSize`: рекомендуется 5-15% для диверсификации
   - `minPositionSize`: рекомендуется 1-2% для избежания микро-позиций

3. **Кеширование:**
   - Матрицы корреляций и ковариаций кешируются автоматически
   - Очищайте кеш при обновлении данных: `PortfolioOptimizer.clearCache()`

4. **Обработка предупреждений:**
   - Проверяйте `result.warnings` для получения информации о проблемах
   - Если `result.converged === false`, рассмотрите изменение параметров

## 📝 Примеры использования

### Пример 1: Базовая оптимизация

```javascript
const instruments = await getInstruments(); // Получить инструменты
const correlationMatrix = await CorrelationService.getCorrelationMatrix(
    instruments.map(i => i.figi)
);

const result = await PortfolioOptimizer.meanVarianceOptimization({
    instruments: instruments,
    correlationMatrix: correlationMatrix,
    totalCapital: 1000000
});

// Применить веса к портфелю
for (const [figi, weight] of Object.entries(result.weights)) {
    const positionValue = 1000000 * weight;
    // Создать позицию
}
```

### Пример 2: Оптимизация с учетом AI прогнозов

```javascript
const result = await PortfolioOptimizer.blackLittermanOptimization({
    instruments: instruments,
    correlationMatrix: correlationMatrix,
    totalCapital: 1000000,
    tau: 0.05
});

// Результат учитывает прогнозы AI из модели Recommendation
```

### Пример 3: Консервативный портфель (Risk Parity)

```javascript
const result = await PortfolioOptimizer.riskParityOptimization({
    instruments: instruments,
    correlationMatrix: correlationMatrix,
    totalCapital: 1000000,
    maxPositionSize: 0.10 // Максимум 10% на позицию
});

// Проверить равномерность распределения риска
console.log('Равномерность:', result.uniformity); // Должно быть > 0.8
```

### Пример 4: Генерация эффективной границы

```javascript
const frontier = await PortfolioOptimizer.generateEfficientFrontier(
    instruments,
    correlationMatrix,
    20 // 20 точек
);

// Найти точку с максимальным Sharpe Ratio
const maxSharpePoint = frontier.reduce((max, point) => 
    point.sharpe > max.sharpe ? point : max
);

console.log('Оптимальная точка:', maxSharpePoint);
```

## 🔗 Связанные сервисы

- `CorrelationService` - расчет корреляций между инструментами
- `CacheService` - получение исторических данных
- `CapitalAllocationStrategy` - интеграция с системой распределения капитала
- `Recommendation` (модель) - получение прогнозов AI для Black-Litterman

## 📚 Дополнительные ресурсы

- [План оптимизации портфеля](./PORTFOLIO_OPTIMIZATION_PLAN.md)
- [Документация по корреляциям](../services/CorrelationService.js)
- [Документация по распределению капитала](../services/CapitalAllocationStrategy.js)

