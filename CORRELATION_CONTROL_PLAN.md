# План реализации контроля корреляций между позициями

**Дата:** 2025-01-27  
**Приоритет:** Средний  
**Ожидаемый эффект:** Снижение риска портфеля на 20-30%  
**Сложность:** Средняя

---

## 📊 Текущее состояние

### Существующая реализация

1. **RiskManagementService.checkCorrelationRisk()** (строки 461-479)
   - ❌ Упрощенная проверка только по секторам
   - ❌ Хардкод списков тикеров (techSymbols, financeSymbols)
   - ❌ Не использует исторические данные
   - ⚠️ Только предупреждение, не блокирует сделки

2. **CapitalAllocationStrategy.calculateCorrelationRisk()** (строки 673-696)
   - ❌ Неправильный расчет корреляции (использует variance вместо корреляции)
   - ❌ Основан на PnL позиций, а не на исторических ценах
   - ❌ Не рассчитывает корреляцию между конкретными инструментами

3. **CapitalAllocationStrategy.getCorrelation()** (строки 812-819)
   - ❌ Заглушка, возвращает фиксированное значение 0.5
   - ❌ Не реализован расчет корреляции с рынком

### Проблемы текущей реализации

- Нет реального расчета корреляции Пирсона между инструментами
- Не используются исторические данные свечей
- Нет ограничения на суммарную корреляцию портфеля
- Нет приоритизации низкокоррелированных инструментов
- Нет кеширования результатов корреляций

---

## 🎯 Целевая архитектура

### Новый сервис: CorrelationService

**Основные функции:**
1. Расчет корреляции Пирсона между парами инструментов на основе исторических данных
2. Расчет суммарной корреляции портфеля
3. Кеширование результатов корреляций
4. Приоритизация инструментов по низкой корреляции
5. Интеграция с RiskManagementService и CapitalAllocationStrategy

### Формула корреляции Пирсона

```
r = Σ((Xi - X̄)(Yi - Ȳ)) / √(Σ(Xi - X̄)² × Σ(Yi - Ȳ)²)

где:
- Xi, Yi - доходности инструментов X и Y в момент i
- X̄, Ȳ - средние доходности инструментов X и Y
- r - коэффициент корреляции (-1 до +1)
```

---

## 📋 План реализации

### Фаза 1: Создание CorrelationService (1-2 дня)

#### 1.1. Создание базового сервиса
**Файл:** `server/src/services/CorrelationService.js`

**Методы:**
- `initialize()` - инициализация сервиса
- `calculateCorrelation(figi1, figi2, period = 30)` - расчет корреляции между двумя инструментами
- `calculatePortfolioCorrelation(portfolio, period = 30)` - расчет суммарной корреляции портфеля
- `getCorrelationMatrix(figis, period = 30)` - получение матрицы корреляций для набора инструментов

**Алгоритм расчета корреляции:**
```javascript
async calculateCorrelation(figi1, figi2, period = 30) {
    // 1. Получить исторические свечи для обоих инструментов
    const candles1 = await CacheService.getCandles(figi1, 'DAY', period);
    const candles2 = await CacheService.getCandles(figi2, 'DAY', period);
    
    // 2. Рассчитать доходности (returns) для каждого инструмента
    const returns1 = calculateReturns(candles1);
    const returns2 = calculateReturns(candles2);
    
    // 3. Выровнять массивы по датам (если есть пропуски)
    const alignedReturns = alignReturnsByDate(returns1, returns2);
    
    // 4. Рассчитать корреляцию Пирсона
    const correlation = calculatePearsonCorrelation(
        alignedReturns.returns1, 
        alignedReturns.returns2
    );
    
    // 5. Кешировать результат
    await this.cacheCorrelation(figi1, figi2, correlation);
    
    return correlation;
}
```

#### 1.2. Кеширование корреляций
**Модель:** `server/src/models/CorrelationCache.js`

**Структура таблицы:**
```sql
CREATE TABLE correlation_cache (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    figi1 VARCHAR(50) NOT NULL,
    figi2 VARCHAR(50) NOT NULL,
    correlation FLOAT NOT NULL,
    period INTEGER NOT NULL DEFAULT 30,
    calculated_at DATETIME NOT NULL,
    expires_at DATETIME NOT NULL,
    INDEX idx_figis (figi1, figi2),
    INDEX idx_expires (expires_at),
    UNIQUE KEY unique_pair (figi1, figi2, period)
);
```

**Логика кеширования:**
- Срок жизни кеша: 24 часа
- Автоматическая очистка устаревших записей
- Использование симметричности: correlation(figi1, figi2) = correlation(figi2, figi1)

#### 1.3. Оптимизация производительности
- Батчинг запросов свечей
- Параллельная обработка пар инструментов
- Использование индексов БД
- Ленивая загрузка корреляций (только при необходимости)

---

### Фаза 2: Интеграция с RiskManagementService (1 день)

#### 2.1. Обновление checkCorrelationRisk()
**Файл:** `server/src/services/RiskManagementService.js`

**Изменения:**
```javascript
async checkCorrelationRisk(signal, portfolio) {
    const CorrelationService = (await import('./CorrelationService.js')).default;
    
    const correlatedPositions = [];
    const correlationThreshold = 0.7; // Порог высокой корреляции
    
    // Получаем все открытые позиции
    const openPositions = Object.keys(portfolio.positions || {});
    
    for (const positionFigi of openPositions) {
        if (positionFigi === signal.figi) continue;
        
        // Рассчитываем корреляцию с новой позицией
        const correlation = await CorrelationService.calculateCorrelation(
            signal.figi,
            positionFigi,
            30 // период 30 дней
        );
        
        if (Math.abs(correlation) >= correlationThreshold) {
            correlatedPositions.push({
                figi: positionFigi,
                correlation: correlation,
                risk: correlation >= 0.8 ? 'HIGH' : 'MEDIUM'
            });
        }
    }
    
    // Рассчитываем суммарную корреляцию портфеля
    const portfolioCorrelation = await CorrelationService.calculatePortfolioCorrelation(
        portfolio,
        30
    );
    
    return {
        high: correlatedPositions.length > 2 || portfolioCorrelation >= 0.7,
        correlatedPositions: correlatedPositions.map(p => p.figi),
        correlationDetails: correlatedPositions,
        portfolioCorrelation: portfolioCorrelation,
        recommendation: portfolioCorrelation >= 0.7 
            ? 'BLOCK' 
            : correlatedPositions.length > 2 
                ? 'WARNING' 
                : 'OK'
    };
}
```

#### 2.2. Блокировка сделок при высокой корреляции
**Изменения в validateOrder():**
```javascript
// После проверки корреляции
if (correlationRisk.recommendation === 'BLOCK') {
    validation.isValid = false;
    validation.errors.push(
        `Высокая корреляция портфеля (${(correlationRisk.portfolioCorrelation * 100).toFixed(1)}%). ` +
        `Максимально допустимая корреляция: 70%`
    );
} else if (correlationRisk.recommendation === 'WARNING') {
    validation.warnings.push(
        `Высокая корреляция с ${correlationRisk.correlatedPositions.length} позициями: ` +
        correlationRisk.correlatedPositions.join(', ')
    );
}
```

---

### Фаза 3: Интеграция с CapitalAllocationStrategy (1 день)

#### 3.1. Приоритизация инструментов по низкой корреляции
**Файл:** `server/src/services/CapitalAllocationStrategy.js`

**Новый метод:**
```javascript
async prioritizeInstrumentsByCorrelation(instruments, portfolio, maxCorrelation = 0.7) {
    const CorrelationService = (await import('./CorrelationService.js')).default;
    
    const prioritized = [];
    
    for (const instrument of instruments) {
        // Рассчитываем среднюю корреляцию с существующими позициями
        const openPositions = Object.keys(portfolio.positions || {});
        
        if (openPositions.length === 0) {
            // Если портфель пуст, все инструменты имеют приоритет 1.0
            prioritized.push({
                ...instrument,
                correlationScore: 1.0,
                avgCorrelation: 0
            });
            continue;
        }
        
        const correlations = [];
        for (const positionFigi of openPositions) {
            const correlation = await CorrelationService.calculateCorrelation(
                instrument.figi,
                positionFigi,
                30
            );
            correlations.push(Math.abs(correlation));
        }
        
        const avgCorrelation = correlations.reduce((sum, c) => sum + c, 0) / correlations.length;
        
        // Приоритет обратно пропорционален корреляции
        // Инструменты с низкой корреляцией получают высокий приоритет
        const correlationScore = Math.max(0, 1 - (avgCorrelation / maxCorrelation));
        
        prioritized.push({
            ...instrument,
            correlationScore,
            avgCorrelation
        });
    }
    
    // Сортируем по приоритету (высокий приоритет = низкая корреляция)
    return prioritized.sort((a, b) => b.correlationScore - a.correlationScore);
}
```

#### 3.2. Обновление calculateCorrelationRisk()
**Замена текущей реализации на использование CorrelationService:**
```javascript
async calculateCorrelationRisk(positions) {
    if (positions.length < 2) return 0;
    
    const CorrelationService = (await import('./CorrelationService.js')).default;
    const figis = positions.map(p => p.figi || p.symbol).filter(Boolean);
    
    if (figis.length < 2) return 0;
    
    // Рассчитываем матрицу корреляций
    const correlationMatrix = await CorrelationService.getCorrelationMatrix(figis, 30);
    
    // Рассчитываем среднюю корреляцию портфеля
    let totalCorrelation = 0;
    let pairCount = 0;
    
    for (let i = 0; i < figis.length; i++) {
        for (let j = i + 1; j < figis.length; j++) {
            const correlation = correlationMatrix[figis[i]]?.[figis[j]] || 0;
            totalCorrelation += Math.abs(correlation);
            pairCount++;
        }
    }
    
    return pairCount > 0 ? totalCorrelation / pairCount : 0;
}
```

---

### Фаза 4: Оптимизация и мониторинг (1 день)

#### 4.1. Предварительный расчет корреляций
**Cron задача в SchedulerService:**
```javascript
// Еженедельный пересчет корреляций для популярных инструментов
this.correlationUpdateTask = cron.schedule('0 2 * * 0', async () => {
    // Получаем топ-50 инструментов по объему торгов
    const popularInstruments = await this.getPopularInstruments(50);
    
    // Рассчитываем корреляции между всеми парами
    const CorrelationService = (await import('./CorrelationService.js')).default;
    await CorrelationService.precalculateCorrelations(popularInstruments);
});
```

#### 4.2. Метрики и мониторинг
- Средняя корреляция портфеля
- Количество высококоррелированных пар
- Эффективность кеша (hit rate)
- Время расчета корреляций

#### 4.3. Настройки через Settings
- `correlation_threshold` - порог высокой корреляции (по умолчанию 0.7)
- `correlation_period` - период для расчета (по умолчанию 30 дней)
- `correlation_cache_ttl` - срок жизни кеша (по умолчанию 24 часа)
- `correlation_enabled` - включить/выключить контроль корреляций

---

## 📈 Анализ эффективности

### Ожидаемые преимущества

1. **Снижение риска портфеля на 20-30%**
   - Диверсификация по некоррелированным активам
   - Избежание концентрации риска в одном секторе/тренде
   - Более стабильная доходность

2. **Улучшение Sharpe Ratio**
   - Меньшая волатильность портфеля
   - Более предсказуемые результаты

3. **Защита от системных рисков**
   - Избежание одновременных падений всех позиций
   - Лучшая устойчивость к кризисам

### Потенциальные проблемы и решения

#### Проблема 1: Производительность
**Риск:** Расчет корреляций для большого портфеля может быть медленным

**Решение:**
- Кеширование результатов (TTL 24 часа)
- Предварительный расчет для популярных инструментов
- Батчинг запросов к БД
- Параллельная обработка пар инструментов
- Использование индексов БД

**Оценка производительности:**
- Расчет одной корреляции: ~50-100ms (с кешем: ~1-5ms)
- Для портфеля из 10 позиций: ~500-1000ms (с кешем: ~10-50ms)
- Приемлемо для валидации перед сделкой

#### Проблема 2: Недостаточность исторических данных
**Риск:** Для новых инструментов может не быть достаточно данных

**Решение:**
- Минимум 20 дней данных для расчета корреляции
- Fallback на секторную корреляцию при недостатке данных
- Использование индекса рынка как proxy при отсутствии данных

#### Проблема 3: Изменение корреляций во времени
**Риск:** Корреляции могут меняться (особенно во время кризисов)

**Решение:**
- Использование скользящего окна (30 дней)
- Обновление кеша каждые 24 часа
- Мониторинг изменений корреляций
- Возможность ручного пересчета

#### Проблема 4: Ложные срабатывания
**Риск:** Блокировка потенциально прибыльных сделок из-за высокой корреляции

**Решение:**
- Порог корреляции 0.7 (не слишком строгий)
- Предупреждения вместо блокировки для корреляции 0.7-0.8
- Блокировка только при корреляции > 0.8
- Возможность переопределения через настройки

### Метрики успеха

1. **Снижение волатильности портфеля**
   - Цель: снижение на 15-25%
   - Измерение: стандартное отклонение доходности портфеля

2. **Улучшение Sharpe Ratio**
   - Цель: улучшение на 0.2-0.4
   - Измерение: (доходность - безрисковая ставка) / волатильность

3. **Снижение максимальной просадки**
   - Цель: снижение на 20-30%
   - Измерение: максимальная просадка портфеля

4. **Производительность**
   - Цель: время валидации < 1 секунды
   - Измерение: время выполнения checkCorrelationRisk()

---

## 🔧 Технические детали

### Зависимости

- **CacheService** - для получения исторических свечей
- **Settings** - для хранения настроек
- **Sequelize** - для работы с БД (кеш корреляций)

### Новые модели БД

**CorrelationCache:**
```javascript
{
    figi1: STRING(50),
    figi2: STRING(50),
    correlation: FLOAT,
    period: INTEGER,
    calculatedAt: DATE,
    expiresAt: DATE
}
```

### API методы

**CorrelationService:**
- `calculateCorrelation(figi1, figi2, period)` - расчет корреляции между двумя инструментами
- `calculatePortfolioCorrelation(portfolio, period)` - расчет суммарной корреляции портфеля
- `getCorrelationMatrix(figis, period)` - получение матрицы корреляций
- `precalculateCorrelations(figis)` - предварительный расчет корреляций
- `getCorrelationScore(figi, portfolio)` - получение оценки корреляции для инструмента

---

## 📅 Временная оценка

| Фаза | Задачи | Время | Приоритет |
|------|--------|-------|-----------|
| Фаза 1 | Создание CorrelationService | 1-2 дня | Высокий |
| Фаза 2 | Интеграция с RiskManagementService | 1 день | Высокий |
| Фаза 3 | Интеграция с CapitalAllocationStrategy | 1 день | Средний |
| Фаза 4 | Оптимизация и мониторинг | 1 день | Средний |
| **Итого** | | **4-5 дней** | |

---

## ✅ Критерии готовности

- [ ] CorrelationService создан и протестирован
- [ ] Модель CorrelationCache создана и мигрирована
- [ ] Интеграция с RiskManagementService завершена
- [ ] Интеграция с CapitalAllocationStrategy завершена
- [ ] Кеширование работает корректно
- [ ] Производительность соответствует требованиям (< 1 сек)
- [ ] Настройки доступны через Settings
- [ ] Добавлены метрики и мониторинг
- [ ] Документация обновлена

---

## 🎯 Ожидаемый результат

После реализации:
- ✅ Активный контроль корреляций между позициями
- ✅ Блокировка сделок при высокой корреляции портфеля (> 0.7)
- ✅ Приоритизация низкокоррелированных инструментов
- ✅ Использование исторических данных для расчета корреляций
- ✅ Кеширование результатов для производительности
- ✅ Снижение риска портфеля на 20-30%

---

**Последнее обновление:** 2025-01-27

