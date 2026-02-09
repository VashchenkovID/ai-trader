# План реализации: Проектировщик недельных прогнозов цен

## 📋 Обзор

**Цель:** Создать систему, которая генерирует недельные прогнозы цен в виде графика, со временем адаптируется на основе реальных данных и улучшает точность предсказаний.

**Статус:** ✅ **Реализуемо** - система имеет все необходимые компоненты для реализации

---

## 🎯 Основные возможности

1. **Генерация недельного графика цен** - создание прогноза на 7 дней вперед
2. **Адаптивное обучение** - автоматическое обновление модели на основе реальных данных
3. **Визуализация** - отображение прогноза и сравнение с реальностью
4. **Метрики качества** - отслеживание точности прогнозов
5. **Обратная связь** - механизм сравнения прогнозов с реальными ценами

---

## 🏗️ Архитектура решения

### 1. Модель данных

#### 1.1. Таблица `WeeklyForecast` (новая)
```sql
CREATE TABLE weekly_forecasts (
    id SERIAL PRIMARY KEY,
    figi VARCHAR(50) NOT NULL,
    ticker VARCHAR(20) NOT NULL,
    forecast_date DATE NOT NULL,  -- Дата создания прогноза
    start_date DATE NOT NULL,     -- Начало прогноза (обычно сегодня)
    end_date DATE NOT NULL,       -- Конец прогноза (start_date + 7 дней)
    
    -- Прогнозируемые данные (JSON массив свечей)
    forecast_data JSONB NOT NULL, -- [{date, open, high, low, close, volume, confidence}, ...]
    
    -- Метаданные модели
    model_version VARCHAR(50),
    model_type VARCHAR(50),       -- 'seq2seq', 'transformer', 'lstm'
    confidence_score DECIMAL(5,4), -- Общая уверенность прогноза (0-1)
    
    -- Статистика прогноза
    predicted_volatility DECIMAL(10,6),
    predicted_trend VARCHAR(20),   -- 'BULLISH', 'BEARISH', 'SIDEWAYS'
    predicted_price_change DECIMAL(10,4), -- Процентное изменение
    
    -- Реальные данные (заполняется по мере поступления)
    actual_data JSONB,            -- [{date, open, high, low, close, volume}, ...]
    
    -- Метрики точности (вычисляются после завершения прогноза)
    accuracy_metrics JSONB,       -- {mae, mse, rmse, mape, direction_accuracy}
    is_completed BOOLEAN DEFAULT FALSE,
    completion_date DATE,
    
    -- Временные метки
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Индексы
    INDEX idx_figi_forecast_date (figi, forecast_date),
    INDEX idx_start_date (start_date),
    INDEX idx_is_completed (is_completed)
);
```

#### 1.2. Таблица `ForecastFeedback` (опционально, для детальной обратной связи)
```sql
CREATE TABLE forecast_feedback (
    id SERIAL PRIMARY KEY,
    forecast_id INTEGER REFERENCES weekly_forecasts(id),
    figi VARCHAR(50) NOT NULL,
    date DATE NOT NULL,
    
    -- Прогнозируемые значения
    predicted_price DECIMAL(15,4),
    predicted_high DECIMAL(15,4),
    predicted_low DECIMAL(15,4),
    
    -- Реальные значения
    actual_price DECIMAL(15,4),
    actual_high DECIMAL(15,4),
    actual_low DECIMAL(15,4),
    
    -- Ошибки
    price_error DECIMAL(15,4),
    price_error_percent DECIMAL(10,4),
    
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🤖 Модель машинного обучения

### 2.1. Архитектура: Sequence-to-Sequence (Seq2Seq) с Attention

**Тип модели:** LSTM Encoder-Decoder с механизмом внимания

**Входные данные:**
- Исторические свечи (60-90 дней)
- Технические индикаторы (RSI, MACD, Bollinger Bands, etc.)
- Макро-данные
- Фундаментальные показатели
- Новости и сентимент

**Выходные данные:**
- Последовательность из 7 свечей (open, high, low, close, volume)
- Уверенность для каждой свечи

**Архитектура:**
```
Input: [batch_size, 60-90, features_per_timestep]
  ↓
Encoder LSTM (2 слоя, 128 units)
  ↓
Attention Mechanism
  ↓
Decoder LSTM (2 слоя, 128 units)
  ↓
Dense Layers (для каждой свечи: open, high, low, close, volume)
  ↓
Output: [batch_size, 7, 5] (7 дней × 5 значений)
```

### 2.2. Альтернативные архитектуры (для экспериментов)

1. **Transformer** - для долгосрочных зависимостей
2. **TCN (Temporal Convolutional Network)** - для быстрого обучения
3. **GAN (Generative Adversarial Network)** - для генерации реалистичных свечей

---

## 📦 Компоненты системы

### 3.1. `WeeklyForecastService` (новый сервис)

**Основные методы:**

```javascript
class WeeklyForecastService {
    // Генерация прогноза
    async generateForecast(figi, options = {}) {
        // 1. Получить исторические данные
        // 2. Подготовить features
        // 3. Загрузить/создать модель
        // 4. Сгенерировать прогноз
        // 5. Сохранить в БД
        // 6. Вернуть прогноз
    }
    
    // Получение прогноза
    async getForecast(figi, forecastDate = null) {
        // Получить последний или конкретный прогноз
    }
    
    // Обновление реальными данными
    async updateWithActualData(figi, forecastId = null) {
        // Сравнить прогноз с реальными ценами
        // Вычислить метрики
        // Обновить запись в БД
    }
    
    // Адаптивное обучение
    async adaptModel(figi, forecastId) {
        // Использовать ошибки прогноза для дообучения модели
    }
    
    // Получение метрик качества
    async getForecastAccuracy(figi, days = 30) {
        // Статистика точности за период
    }
    
    // Создание/загрузка модели
    async getOrCreateModel(figi) {
        // Загрузить существующую или создать новую Seq2Seq модель
    }
}
```

### 3.2. Интеграция с существующими сервисами

- **OptimizedDataService** - для подготовки features
- **OptimizedTrainingService** - для обучения базовой модели
- **CacheService** - для получения исторических данных
- **LoggerService** - для логирования

---

## 🔄 Процесс работы

### 4.1. Генерация прогноза (ежедневно)

```
1. Получить исторические данные (60-90 дней)
   ↓
2. Подготовить features (технические индикаторы, макро, новости)
   ↓
3. Загрузить Seq2Seq модель для инструмента
   ↓
4. Сгенерировать прогноз на 7 дней
   ↓
5. Вычислить уверенность и метаданные
   ↓
6. Сохранить в БД (weekly_forecasts)
   ↓
7. Отправить через WebSocket клиентам
```

### 4.2. Обновление реальными данными (ежедневно)

```
1. Найти активные прогнозы (is_completed = false)
   ↓
2. Для каждого прогноза:
   - Получить реальные цены за прошедшие дни
   - Сравнить с прогнозом
   - Вычислить ошибки (MAE, MSE, MAPE)
   - Обновить actual_data и accuracy_metrics
   ↓
3. Если прогноз завершен (end_date < today):
   - Установить is_completed = true
   - Запустить адаптивное обучение
```

### 4.3. Адаптивное обучение (после завершения прогноза)

```
1. Загрузить завершенный прогноз
   ↓
2. Вычислить ошибки для каждого дня
   ↓
3. Создать обучающий набор:
   - Исторические данные (input)
   - Реальные цены (target)
   ↓
4. Дообучить модель на новых данных
   ↓
5. Сохранить обновленную модель
   ↓
6. Обновить метаданные (model_version)
```

---

## 📊 API Endpoints

### 5.1. Генерация прогноза

```javascript
POST /api/weekly-forecast/generate
Body: { figi: string, options?: { modelType?: string } }
Response: {
    success: true,
    forecast: {
        id: number,
        figi: string,
        forecastData: [...],
        confidenceScore: number,
        predictedTrend: string,
        ...
    }
}
```

### 5.2. Получение прогноза

```javascript
GET /api/weekly-forecast/:figi
Query: { forecastDate?: string }
Response: {
    success: true,
    forecast: {...},
    actualData: [...], // если есть
    accuracyMetrics: {...} // если прогноз завершен
}
```

### 5.3. Список прогнозов

```javascript
GET /api/weekly-forecast/list
Query: { figi?: string, isCompleted?: boolean, limit?: number }
Response: {
    success: true,
    forecasts: [...]
}
```

### 5.4. Метрики качества

```javascript
GET /api/weekly-forecast/accuracy/:figi
Query: { days?: number }
Response: {
    success: true,
    metrics: {
        averageMAE: number,
        averageMAPE: number,
        directionAccuracy: number,
        recentForecasts: [...]
    }
}
```

---

## 🎨 Визуализация (Frontend)

### 6.1. Компонент графика

**Библиотека:** Chart.js или Recharts

**Элементы:**
- Линия реальных цен (синяя)
- Линия прогноза (зеленая/красная в зависимости от тренда)
- Область уверенности (полупрозрачная зона вокруг прогноза)
- Вертикальная линия разделения (сегодня)
- Легенда с метриками

### 6.2. Страница детального просмотра

- График прогноза vs реальность
- Таблица метрик точности
- История прогнозов
- Настройки модели

---

## 🔧 Технические детали

### 7.1. Подготовка данных для Seq2Seq

```javascript
// Входные данные: [batch_size, sequence_length, features]
// sequence_length = 60-90 дней
// features = 70+ (цены, объемы, индикаторы, макро, новости)

// Выходные данные: [batch_size, 7, 5]
// 7 дней × 5 значений (open, high, low, close, volume)
```

### 7.2. Нормализация данных

- **Min-Max Scaling** для цен и объемов
- **Z-score Normalization** для индикаторов
- **Log transformation** для объемов (если нужно)

### 7.3. Loss Function

```javascript
// Комбинированная функция потерь:
loss = α * price_loss + β * volume_loss + γ * confidence_loss

// price_loss = MSE(predicted_prices, actual_prices)
// volume_loss = MAE(predicted_volumes, actual_volumes)
// confidence_loss = BinaryCrossentropy(predicted_confidence, actual_confidence)
```

### 7.4. Метрики качества

- **MAE (Mean Absolute Error)** - средняя абсолютная ошибка
- **MSE (Mean Squared Error)** - средняя квадратичная ошибка
- **RMSE (Root Mean Squared Error)** - корень из MSE
- **MAPE (Mean Absolute Percentage Error)** - средняя процентная ошибка
- **Direction Accuracy** - точность направления (вверх/вниз)

---

## 📅 План реализации (по этапам)

### Этап 1: Инфраструктура (1-2 недели)

- [ ] Создать модель `WeeklyForecast` в БД
- [ ] Создать миграцию БД
- [ ] Создать базовый `WeeklyForecastService`
- [ ] Интегрировать с существующими сервисами

### Этап 2: Модель машинного обучения (2-3 недели)

- [ ] Реализовать Seq2Seq архитектуру (TensorFlow.js)
- [ ] Создать метод подготовки данных для Seq2Seq
- [ ] Реализовать обучение модели
- [ ] Сохранение/загрузка модели
- [ ] Тестирование на исторических данных

### Этап 3: Генерация прогнозов (1-2 недели)

- [ ] Реализовать `generateForecast()`
- [ ] Интеграция с OptimizedDataService для features
- [ ] Вычисление уверенности и метаданных
- [ ] Сохранение в БД
- [ ] WebSocket уведомления

### Этап 4: Обратная связь и адаптация (2-3 недели)

- [ ] Реализовать `updateWithActualData()`
- [ ] Вычисление метрик точности
- [ ] Реализовать адаптивное обучение
- [ ] Автоматическое обновление прогнозов (scheduler)

### Этап 5: API и Frontend (2-3 недели)

- [ ] Создать API endpoints
- [ ] Реализовать компонент графика
- [ ] Страница детального просмотра
- [ ] Интеграция с существующим UI

### Этап 6: Оптимизация и тестирование (1-2 недели)

- [ ] Оптимизация производительности
- [ ] Тестирование на разных инструментах
- [ ] Настройка гиперпараметров
- [ ] Документация

**Общее время:** 9-15 недель (2-4 месяца)

---

## ⚠️ Потенциальные проблемы и решения

### Проблема 1: Недостаток данных для обучения
**Решение:** 
- Использовать transfer learning (предобученная модель)
- Data augmentation (синтетические данные)
- Использовать данные похожих инструментов

### Проблема 2: Низкая точность прогнозов
**Решение:**
- Экспериментировать с архитектурами (Transformer, TCN)
- Улучшить features (больше индикаторов, макро-данных)
- Ensemble подход (несколько моделей)

### Проблема 3: Вычислительная сложность
**Решение:**
- Использовать worker'ы для обучения
- Кеширование моделей
- Batch processing прогнозов

### Проблема 4: Адаптация к изменяющимся условиям
**Решение:**
- Регулярное переобучение (еженедельно)
- Online learning (инкрементальное обучение)
- Детекция data drift

---

## 🎯 Критерии успеха

1. **Точность прогнозов:**
   - MAPE < 5% для стабильных инструментов
   - Direction Accuracy > 60%

2. **Производительность:**
   - Генерация прогноза < 5 секунд
   - Обновление реальными данными < 1 секунда

3. **Адаптивность:**
   - Модель улучшается после каждого цикла обратной связи
   - Метрики качества растут со временем

4. **Пользовательский опыт:**
   - Визуализация понятна и информативна
   - Прогнозы доступны в реальном времени

---

## 📚 Дополнительные возможности (будущее)

1. **Мультитаймфреймовые прогнозы** - не только неделя, но и день, месяц
2. **Ансамбль моделей** - комбинация разных архитектур
3. **Неопределенность** - показ диапазонов возможных цен (confidence intervals)
4. **Сценарии** - оптимистичный, пессимистичный, базовый
5. **Интеграция с торговлей** - автоматические сигналы на основе прогнозов

---

## ✅ Заключение

**Реализуемость:** ✅ **ВЫСОКАЯ**

Система имеет все необходимые компоненты:
- ✅ Исторические данные (CachedCandle)
- ✅ Подготовка features (OptimizedDataService)
- ✅ Инфраструктура обучения (OptimizedTrainingService)
- ✅ Хранение моделей (ModelManager)
- ✅ API и WebSocket для уведомлений

**Основные вызовы:**
- Создание Seq2Seq архитектуры (новое, но стандартное)
- Адаптивное обучение (требует аккуратной реализации)
- Визуализация (стандартные библиотеки)

**Рекомендация:** Начать с MVP (минимально жизнеспособный продукт):
1. Простая LSTM модель для генерации 7 дней
2. Базовое сохранение и сравнение с реальностью
3. Простая визуализация

Затем итеративно улучшать:
- Добавить Attention механизм
- Улучшить features
- Добавить адаптивное обучение
- Улучшить визуализацию




