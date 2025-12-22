# План реализации продвинутых метрик производительности

## 📋 Обзор

Добавление продвинутых метрик производительности для более точной оценки торговых результатов. Метрики будут интегрированы в существующие сервисы анализа и доступны через API и UI.

## 🎯 Цели

1. **Расширение набора метрик:**
   - Sortino Ratio (учитывает только негативную волатильность)
   - Calmar Ratio (доходность / Max Drawdown)
   - Information Ratio (активная доходность / tracking error)
   - Maximum Adverse Excursion (MAE) и Maximum Favorable Excursion (MFE)
   - Анализ по периодам (лучшие/худшие дни недели, месяцы)

2. **Интеграция в существующие сервисы:**
   - Обновление `ProfitabilityTracker` для расчета новых метрик
   - Расширение `OptimizedAnalysisService` для анализа по периодам
   - Добавление API endpoints для доступа к метрикам

3. **UI компонент:**
   - Создание компонента `AdvancedMetrics.tsx` для визуализации метрик

## 📊 Статус реализации

**Выполнено:** 100% ✅  
**В процессе:** Нет  
**Осталось:** Нет

### ✅ Все этапы завершены:
- ✅ Этап 1: Утилитный модуль `advancedMetrics.js`
- ✅ Этап 2: Интеграция в `ProfitabilityTracker`
- ✅ Этап 3: Расширение `OptimizedAnalysisService`
- ✅ Этап 4: API endpoints
- ✅ Этап 5: UI компонент
- ✅ Этап 6: Тестирование и документация

## 🔍 Анализ существующего кода

### Текущие метрики в `ProfitabilityTracker.js`:
- ✅ Total Profit
- ✅ Average Daily Profit
- ✅ Win Rate
- ✅ Max Drawdown
- ✅ Volatility
- ✅ Sharpe Ratio (упрощенный)
- ✅ Profit Factor

### Текущие метрики в `BacktestingService.js`:
- ✅ Calmar Ratio (уже реализован)
- ✅ Sortino Ratio (уже реализован)

### Текущие метрики в `OptimizedAnalysisService.js`:
- ✅ Sharpe Ratio
- ✅ Финансовые метрики (базовые)

### Что нужно добавить:
- ⚠️ Sortino Ratio в `ProfitabilityTracker` (есть в BacktestingService, нужно перенести)
- ⚠️ Calmar Ratio в `ProfitabilityTracker` (есть в BacktestingService, нужно перенести)
- ❌ Information Ratio (новый расчет)
- ❌ MAE/MFE (новый расчет)
- ⚠️ Анализ по периодам (частично есть, нужно расширить)

## 🏗️ Архитектура решения

### 1. Новый утилитный модуль: `server/src/utils/advancedMetrics.js`

Централизованный модуль для расчета всех продвинутых метрик:

```javascript
/**
 * Расчет Sortino Ratio
 * @param {Array<number>} returns - Массив доходностей
 * @param {number} riskFreeRate - Безрисковая ставка (по умолчанию 0)
 * @returns {number} Sortino Ratio
 */
calculateSortinoRatio(returns, riskFreeRate = 0)

/**
 * Расчет Calmar Ratio
 * @param {number} annualReturn - Годовая доходность (%)
 * @param {number} maxDrawdown - Максимальная просадка (%)
 * @returns {number} Calmar Ratio
 */
calculateCalmarRatio(annualReturn, maxDrawdown)

/**
 * Расчет Information Ratio
 * @param {Array<number>} portfolioReturns - Доходности портфеля
 * @param {Array<number>} benchmarkReturns - Доходности бенчмарка
 * @returns {number} Information Ratio
 */
calculateInformationRatio(portfolioReturns, benchmarkReturns)

/**
 * Расчет MAE и MFE для сделок
 * @param {Array<Object>} trades - Массив сделок с ценами входа/выхода
 * @param {Array<Object>} candles - Массив свечей за период сделки
 * @returns {Object} {mae: number, mfe: number, trades: Array}
 */
calculateMAEandMFE(trades, candles)

/**
 * Анализ производительности по дням недели
 * @param {Array<Object>} trades - Массив сделок
 * @returns {Object} Статистика по дням недели
 */
analyzeByDayOfWeek(trades)

/**
 * Анализ производительности по месяцам
 * @param {Array<Object>} trades - Массив сделок
 * @returns {Object} Статистика по месяцам
 */
analyzeByMonth(trades)
```

### 2. Обновление `ProfitabilityTracker.js`

Добавить методы для расчета новых метрик:

```javascript
/**
 * Расчет продвинутых метрик производительности
 * @param {Array} stats - Статистика за период
 * @param {Object} options - Опции расчета
 * @returns {Object} Продвинутые метрики
 */
calculateAdvancedMetrics(stats, options = {}) {
    // Sortino Ratio
    // Calmar Ratio
    // Information Ratio (если есть бенчмарк)
    // MAE/MFE (если есть данные о сделках)
}
```

### 3. Обновление `OptimizedAnalysisService.js`

Добавить анализ по периодам:

```javascript
/**
 * Анализ производительности по периодам
 * @param {Array} trades - Массив сделок
 * @returns {Object} Анализ по дням недели и месяцам
 */
analyzePeriodPerformance(trades) {
    return {
        byDayOfWeek: analyzeByDayOfWeek(trades),
        byMonth: analyzeByMonth(trades),
        bestDay: {...},
        worstDay: {...},
        bestMonth: {...},
        worstMonth: {...}
    }
}
```

### 4. Новый API endpoint: `server/src/routes/advanced-metrics-routes.js`

```javascript
GET /api/advanced-metrics/period/:period
GET /api/advanced-metrics/sortino/:period
GET /api/advanced-metrics/calmar/:period
GET /api/advanced-metrics/information-ratio/:period
GET /api/advanced-metrics/mae-mfe/:period
GET /api/advanced-metrics/period-analysis/:period
```

### 5. UI компонент: `client/src/components/AdvancedMetrics.tsx`

Компонент для отображения:
- Таблицы с метриками
- Графики Sortino/Calmar/Information Ratio
- Графики MAE/MFE
- Визуализация анализа по периодам (heatmap дней недели/месяцев)

## 📝 Этапы реализации

### ✅ Этап 1: Создание утилитного модуля (1 день)

**Задачи:**
1. Создать `server/src/utils/advancedMetrics.js`
2. Реализовать `calculateSortinoRatio()`
3. Реализовать `calculateCalmarRatio()`
4. Реализовать `calculateInformationRatio()`
5. Реализовать `calculateMAEandMFE()`
6. Реализовать `analyzeByDayOfWeek()`
7. Реализовать `analyzeByMonth()`
8. Добавить unit-тесты для всех функций

**Критерии успеха:**
- Все функции реализованы и протестированы
- Функции корректно обрабатывают edge cases (пустые массивы, недостаточно данных)
- Документация для каждой функции

**Файлы для создания:**
- `server/src/utils/advancedMetrics.js`
- `server/test-advanced-metrics-utils.js`

### ✅ Этап 2: Интеграция в ProfitabilityTracker (1 день)

**Задачи:**
1. Импортировать функции из `advancedMetrics.js`
2. Добавить метод `calculateAdvancedMetrics()` в `ProfitabilityTracker`
3. Обновить метод `calculateMetrics()` для включения новых метрик
4. Добавить расчет Information Ratio (если есть бенчмарк)
5. Добавить расчет MAE/MFE (если есть данные о сделках)
6. Обновить кеширование метрик

**Критерии успеха:**
- Новые метрики рассчитываются корректно
- Метрики кешируются для производительности
- Обработка ошибок работает правильно

**Файлы для изменения:**
- `server/src/services/ProfitabilityTracker.js`

### ✅ Этап 3: Расширение OptimizedAnalysisService (1 день)

**Задачи:**
1. Добавить метод `analyzePeriodPerformance()` в `OptimizedAnalysisService`
2. Интегрировать анализ по дням недели
3. Интегрировать анализ по месяцам
4. Добавить определение лучших/худших периодов
5. Добавить статистику по периодам (средняя прибыль, количество сделок, win rate)

**Критерии успеха:**
- Анализ по периодам работает корректно
- Данные структурированы для удобного использования
- Производительность приемлемая

**Файлы для изменения:**
- `server/src/services/OptimizedAnalysisService.js`

### ✅ Этап 4: API endpoints (1 день)

**Задачи:**
1. Создать `server/src/routes/advanced-metrics-routes.js`
2. Добавить endpoint для получения всех продвинутых метрик
3. Добавить endpoint для Sortino Ratio
4. Добавить endpoint для Calmar Ratio
5. Добавить endpoint для Information Ratio
6. Добавить endpoint для MAE/MFE
7. Добавить endpoint для анализа по периодам
8. Добавить роуты в `optimized-routes.js`
9. Добавить валидацию параметров
10. Добавить обработку ошибок

**Критерии успеха:**
- Все endpoints работают корректно
- Валидация параметров работает
- Обработка ошибок правильная
- Документация endpoints создана

**Файлы для создания:**
- `server/src/routes/advanced-metrics-routes.js`

**Файлы для изменения:**
- `server/src/routes/optimized-routes.js`

### ✅ Этап 5: UI компонент (2 дня)

**Задачи:**
1. Создать `client/src/components/AdvancedMetrics.tsx`
2. Реализовать отображение таблицы метрик
3. Реализовать графики для Sortino/Calmar/Information Ratio
4. Реализовать визуализацию MAE/MFE
5. Реализовать heatmap для анализа по периодам
6. Добавить фильтры по периодам
7. Добавить экспорт данных
8. Добавить responsive дизайн

**Критерии успеха:**
- Компонент отображает все метрики корректно
- Графики интерактивны и информативны
- UI адаптивный и удобный
- Производительность приемлемая

**Файлы для создания:**
- `client/src/components/AdvancedMetrics.tsx`
- `client/src/components/AdvancedMetrics.module.css` (или styled-components)
- `client/src/types/advancedMetrics.ts` (TypeScript типы)

### ✅ Этап 6: Тестирование и документация (1 день) - ВЫПОЛНЕНО

**Задачи:**
1. ✅ Интеграционное тестирование всех компонентов
2. ✅ Тестирование API endpoints
3. ✅ Тестирование UI компонента
4. ✅ Создание документации по использованию
5. ✅ Обновление README с примерами

**Критерии успеха:**
- ✅ Все тесты пройдены
- ✅ Документация полная и понятная
- ✅ Примеры использования работают

**Файлы для создания:**
- ✅ `server/test-advanced-metrics-integration.js`
- ✅ `server/docs/ADVANCED_METRICS_GUIDE.md`

## 🔧 Технические детали

### Формулы метрик

#### Sortino Ratio
```
Sortino Ratio = (Average Return - Risk-Free Rate) / Downside Deviation

где:
- Downside Deviation = sqrt(sum((min(return - riskFreeRate, 0))^2) / n)
```

#### Calmar Ratio
```
Calmar Ratio = Annual Return / Max Drawdown

где:
- Annual Return = (Total Return / Years) * 100
- Max Drawdown = максимальная просадка в процентах
```

#### Information Ratio
```
Information Ratio = (Portfolio Return - Benchmark Return) / Tracking Error

где:
- Tracking Error = стандартное отклонение разности доходностей
```

#### MAE (Maximum Adverse Excursion)
```
MAE = максимальное неблагоприятное отклонение цены от точки входа
до момента выхода (в убытке)
```

#### MFE (Maximum Favorable Excursion)
```
MFE = максимальное благоприятное отклонение цены от точки входа
до момента выхода (в прибыли)
```

### Структура данных для анализа по периодам

```javascript
{
    byDayOfWeek: {
        monday: { profit: 0, trades: 0, winRate: 0, avgProfit: 0 },
        tuesday: { ... },
        // ...
    },
    byMonth: {
        january: { profit: 0, trades: 0, winRate: 0, avgProfit: 0 },
        february: { ... },
        // ...
    },
    bestDay: { day: 'monday', profit: 0 },
    worstDay: { day: 'friday', profit: 0 },
    bestMonth: { month: 'march', profit: 0 },
    worstMonth: { month: 'september', profit: 0 }
}
```

## 📊 Ожидаемые результаты

### Метрики производительности:
- **Sortino Ratio:** Более точная оценка риска (учитывает только негативную волатильность)
- **Calmar Ratio:** Оценка доходности относительно максимальной просадки
- **Information Ratio:** Оценка активной доходности относительно бенчмарка
- **MAE/MFE:** Анализ эффективности точек входа/выхода

### Анализ по периодам:
- Выявление лучших/худших дней недели для торговли
- Выявление лучших/худших месяцев для торговли
- Оптимизация стратегии на основе временных паттернов

## ⚠️ Риски и ограничения

1. **Недостаток данных:**
   - Для некоторых метрик требуется достаточно данных (минимум 30-60 дней)
   - MAE/MFE требуют данные о свечах за период каждой сделки

2. **Бенчмарк для Information Ratio:**
   - Требуется определение бенчмарка (индекс, среднерыночная доходность)
   - Если бенчмарк не определен, метрика не рассчитывается

3. **Производительность:**
   - Расчет MAE/MFE может быть ресурсоемким для большого количества сделок
   - Необходимо кеширование результатов

4. **Точность расчетов:**
   - Зависит от качества данных о сделках
   - Необходима валидация входных данных

## 📝 Следующие шаги (приоритеты)

### 🔴 Приоритет 1: Утилитный модуль (Этап 1)
**Оценка:** 1 день

**Задачи:**
1. Создать `server/src/utils/advancedMetrics.js`
2. Реализовать все функции расчета метрик
3. Добавить unit-тесты

**Файлы для создания:**
- `server/src/utils/advancedMetrics.js`
- `server/test-advanced-metrics-utils.js`

### 🟡 Приоритет 2: Интеграция в сервисы (Этапы 2-3)
**Оценка:** 2 дня

**Задачи:**
1. Интегрировать метрики в `ProfitabilityTracker`
2. Добавить анализ по периодам в `OptimizedAnalysisService`

**Файлы для изменения:**
- `server/src/services/ProfitabilityTracker.js`
- `server/src/services/OptimizedAnalysisService.js`

### 🟢 Приоритет 3: API и UI (Этапы 4-5)
**Оценка:** 3 дня

**Задачи:**
1. Создать API endpoints
2. Создать UI компонент

**Файлы для создания:**
- `server/src/routes/advanced-metrics-routes.js`
- `client/src/components/AdvancedMetrics.tsx`

## 🚀 Дальнейшие улучшения

1. **Дополнительные метрики:**
   - Ulcer Index
   - Sterling Ratio
   - Burke Ratio
   - Tail Ratio

2. **Расширенный анализ:**
   - Анализ по часам дня
   - Анализ по дням месяца
   - Сезонный анализ

3. **Визуализация:**
   - Интерактивные графики с drill-down
   - Сравнение метрик по периодам
   - Экспорт отчетов в PDF/Excel

4. **Автоматизация:**
   - Автоматический расчет метрик при закрытии сделок
   - Алерты при ухудшении метрик
   - Рекомендации на основе анализа периодов

