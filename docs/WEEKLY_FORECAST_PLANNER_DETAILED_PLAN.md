# Детальный план реализации: Проектировщик недельных прогнозов цен

## 📋 Содержание

1. [Обзор и цели](#обзор-и-цели)
2. [Архитектура данных](#архитектура-данных)
3. [Детальная бизнес-логика](#детальная-бизнес-логика)
4. [Модель машинного обучения](#модель-машинного-обучения)
5. [План реализации по этапам](#план-реализации-по-этапам)
6. [Тестирование](#тестирование)
7. [Мониторинг и метрики](#мониторинг-и-метрики)

---

## 🎯 Обзор и цели

### Цель проекта
Создать систему автоматической генерации недельных прогнозов цен с адаптивным обучением на основе реальных данных.

### Ключевые требования
- ✅ Генерация прогноза на 7 дней вперед
- ✅ Автоматическое обновление реальными данными
- ✅ Адаптивное обучение модели
- ✅ Метрики качества прогнозов
- ✅ Визуализация и API

### Технический стек
- **Backend:** Node.js, TensorFlow.js, Sequelize, PostgreSQL
- **Frontend:** React, Chart.js/Recharts
- **ML:** Seq2Seq (LSTM Encoder-Decoder), Attention Mechanism

---

## 🗄️ Архитектура данных

### 1. Модель `WeeklyForecast`

```javascript
// server/src/models/WeeklyForecast.js
import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const WeeklyForecast = sequelize.define('WeeklyForecast', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    figi: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: 'FIGI инструмента'
    },
    ticker: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment: 'Тикер инструмента'
    },
    forecastDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        field: 'forecast_date',
        comment: 'Дата создания прогноза'
    },
    startDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        field: 'start_date',
        comment: 'Начало прогноза (обычно сегодня)'
    },
    endDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        field: 'end_date',
        comment: 'Конец прогноза (start_date + 7 дней)'
    },
    
    // Прогнозируемые данные
    forecastData: {
        type: DataTypes.JSONB,
        allowNull: false,
        field: 'forecast_data',
        comment: 'Массив прогнозируемых свечей: [{date, open, high, low, close, volume, confidence}, ...]',
        validate: {
            isArray(value) {
                if (!Array.isArray(value) || value.length !== 7) {
                    throw new Error('forecastData must be an array of 7 candles');
                }
            }
        }
    },
    
    // Метаданные модели
    modelVersion: {
        type: DataTypes.STRING(50),
        field: 'model_version',
        comment: 'Версия модели (timestamp_version)'
    },
    modelType: {
        type: DataTypes.STRING(50),
        field: 'model_type',
        defaultValue: 'seq2seq',
        validate: {
            isIn: [['seq2seq', 'transformer', 'lstm', 'ensemble']]
        }
    },
    confidenceScore: {
        type: DataTypes.DECIMAL(5, 4),
        field: 'confidence_score',
        comment: 'Общая уверенность прогноза (0-1)',
        validate: {
            min: 0,
            max: 1
        }
    },
    
    // Статистика прогноза
    predictedVolatility: {
        type: DataTypes.DECIMAL(10, 6),
        field: 'predicted_volatility',
        comment: 'Прогнозируемая волатильность'
    },
    predictedTrend: {
        type: DataTypes.STRING(20),
        field: 'predicted_trend',
        validate: {
            isIn: [['BULLISH', 'BEARISH', 'SIDEWAYS', null]]
        }
    },
    predictedPriceChange: {
        type: DataTypes.DECIMAL(10, 4),
        field: 'predicted_price_change',
        comment: 'Процентное изменение цены за неделю'
    },
    
    // Реальные данные
    actualData: {
        type: DataTypes.JSONB,
        field: 'actual_data',
        comment: 'Массив реальных свечей: [{date, open, high, low, close, volume}, ...]'
    },
    
    // Метрики точности
    accuracyMetrics: {
        type: DataTypes.JSONB,
        field: 'accuracy_metrics',
        comment: '{mae, mse, rmse, mape, directionAccuracy, priceError, volumeError}'
    },
    isCompleted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'is_completed'
    },
    completionDate: {
        type: DataTypes.DATEONLY,
        field: 'completion_date'
    },
    
    // Временные метки
    createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        field: 'created_at'
    },
    updatedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        field: 'updated_at'
    }
}, {
    tableName: 'weekly_forecasts',
    indexes: [
        { fields: ['figi', 'forecast_date'] },
        { fields: ['start_date'] },
        { fields: ['is_completed'] },
        { fields: ['figi', 'is_completed'] }
    ]
});

export default WeeklyForecast;
```

### 2. Миграция БД

```javascript
// server/src/migrations/XXXXXX_create_weekly_forecasts.js
'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('weekly_forecasts', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            figi: {
                type: Sequelize.STRING(50),
                allowNull: false
            },
            ticker: {
                type: Sequelize.STRING(20),
                allowNull: false
            },
            forecast_date: {
                type: Sequelize.DATEONLY,
                allowNull: false
            },
            start_date: {
                type: Sequelize.DATEONLY,
                allowNull: false
            },
            end_date: {
                type: Sequelize.DATEONLY,
                allowNull: false
            },
            forecast_data: {
                type: Sequelize.JSONB,
                allowNull: false
            },
            model_version: {
                type: Sequelize.STRING(50)
            },
            model_type: {
                type: Sequelize.STRING(50),
                defaultValue: 'seq2seq'
            },
            confidence_score: {
                type: Sequelize.DECIMAL(5, 4)
            },
            predicted_volatility: {
                type: Sequelize.DECIMAL(10, 6)
            },
            predicted_trend: {
                type: Sequelize.STRING(20)
            },
            predicted_price_change: {
                type: Sequelize.DECIMAL(10, 4)
            },
            actual_data: {
                type: Sequelize.JSONB
            },
            accuracy_metrics: {
                type: Sequelize.JSONB
            },
            is_completed: {
                type: Sequelize.BOOLEAN,
                defaultValue: false
            },
            completion_date: {
                type: Sequelize.DATEONLY
            },
            created_at: {
                type: Sequelize.DATE,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            },
            updated_at: {
                type: Sequelize.DATE,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            }
        });
        
        // Индексы
        await queryInterface.addIndex('weekly_forecasts', ['figi', 'forecast_date'], {
            name: 'idx_figi_forecast_date'
        });
        await queryInterface.addIndex('weekly_forecasts', ['start_date'], {
            name: 'idx_start_date'
        });
        await queryInterface.addIndex('weekly_forecasts', ['is_completed'], {
            name: 'idx_is_completed'
        });
    },
    
    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('weekly_forecasts');
    }
};
```

---

## 💼 Детальная бизнес-логика

### 1. WeeklyForecastService - Основной сервис

#### 1.1. `generateForecast(figi, options = {})`

**Назначение:** Генерация недельного прогноза для инструмента

**Входные параметры:**
```javascript
{
    figi: string,              // Обязательно
    options: {
        modelType?: 'seq2seq' | 'transformer' | 'lstm',  // По умолчанию 'seq2seq'
        forceRegenerate?: boolean,                        // Принудительная регенерация
        historicalDays?: number,                         // Количество дней истории (60-90)
        includeMacro?: boolean,                          // Включить макро-данные
        includeNews?: boolean                            // Включить новости
    }
}
```

**Бизнес-логика:**

```javascript
async generateForecast(figi, options = {}) {
    // ШАГ 1: Валидация входных данных
    if (!figi || typeof figi !== 'string') {
        throw new Error('FIGI is required and must be a string');
    }
    
    const {
        modelType = 'seq2seq',
        forceRegenerate = false,
        historicalDays = 90,
        includeMacro = true,
        includeNews = true
    } = options;
    
    // Проверка существующего прогноза
    if (!forceRegenerate) {
        const existing = await this.getActiveForecast(figi);
        if (existing && this.isForecastFresh(existing)) {
            return {
                success: true,
                forecast: existing,
                cached: true
            };
        }
    }
    
    // ШАГ 2: Получение инструмента
    const instrument = await CacheService.getInstrument(figi, true);
    if (!instrument) {
        throw new Error(`Instrument not found: ${figi}`);
    }
    
    // ШАГ 3: Получение исторических данных
    const candles = await CacheService.getCandles(figi, 'DAY', historicalDays, true);
    if (candles.length < 60) {
        throw new Error(`Insufficient historical data: ${candles.length} candles (minimum 60)`);
    }
    
    // ШАГ 4: Подготовка features
    const features = await this.prepareForecastFeatures(figi, candles, {
        includeMacro,
        includeNews
    });
    
    // ШАГ 5: Загрузка/создание модели
    const model = await this.getOrCreateModel(figi, modelType);
    
    // ШАГ 6: Генерация прогноза
    const rawForecast = await this.generateModelForecast(model, features);
    
    // ШАГ 7: Постобработка прогноза
    const processedForecast = await this.postProcessForecast(
        rawForecast,
        candles,
        instrument
    );
    
    // ШАГ 8: Вычисление метаданных
    const metadata = this.calculateForecastMetadata(processedForecast);
    
    // ШАГ 9: Сохранение в БД
    const forecast = await WeeklyForecast.create({
        figi: instrument.figi,
        ticker: instrument.ticker,
        forecastDate: new Date(),
        startDate: new Date(),
        endDate: this.addDays(new Date(), 7),
        forecastData: processedForecast.candles,
        modelVersion: model.version || this.generateModelVersion(),
        modelType: modelType,
        confidenceScore: processedForecast.confidence,
        predictedVolatility: metadata.volatility,
        predictedTrend: metadata.trend,
        predictedPriceChange: metadata.priceChange
    });
    
    // ШАГ 10: WebSocket уведомление
    await this.notifyForecastGenerated(forecast);
    
    return {
        success: true,
        forecast: forecast.toJSON(),
        cached: false
    };
}
```

**Edge Cases:**
- Недостаточно исторических данных → выбрасываем ошибку с рекомендацией
- Инструмент не найден → выбрасываем ошибку
- Модель не обучена → используем fallback модель или обучаем на лету
- Ошибка генерации → логируем и возвращаем частичный прогноз

#### 1.2. `prepareForecastFeatures(figi, candles, options)`

**Назначение:** Подготовка features для модели

**Бизнес-логика:**

```javascript
async prepareForecastFeatures(figi, candles, options = {}) {
    const { includeMacro = true, includeNews = true } = options;
    
    // Базовые features из свечей
    const baseFeatures = candles.map(candle => ({
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        time: candle.time
    }));
    
    // Технические индикаторы
    const technicalIndicators = await OptimizedDataService.calculateTechnicalIndicators(
        candles,
        {
            rsi: { period: 14 },
            macd: { fast: 12, slow: 26, signal: 9 },
            bollinger: { period: 20, stdDev: 2 },
            ema: { periods: [9, 21, 50] },
            sma: { periods: [20, 50, 200] }
        }
    );
    
    // Макро-данные (если включены)
    let macroFeatures = null;
    if (includeMacro) {
        macroFeatures = await MacroDataService.getRecentMacroData(
            candles[candles.length - 1].time,
            30 // последние 30 дней
        );
    }
    
    // Новости и сентимент (если включены)
    let newsFeatures = null;
    if (includeNews) {
        newsFeatures = await NewsAnalysisService.getSentimentForPeriod(
            figi,
            candles[candles.length - 30].time,
            candles[candles.length - 1].time
        );
    }
    
    // Объединение features
    const features = baseFeatures.map((candle, index) => {
        const feature = {
            ...candle,
            ...technicalIndicators[index]
        };
        
        if (macroFeatures) {
            feature.macro = macroFeatures[index] || macroFeatures[macroFeatures.length - 1];
        }
        
        if (newsFeatures) {
            feature.news = newsFeatures[index] || newsFeatures[newsFeatures.length - 1];
        }
        
        return feature;
    });
    
    // Нормализация
    return this.normalizeFeatures(features);
}
```

#### 1.3. `getOrCreateModel(figi, modelType)`

**Назначение:** Загрузка существующей модели или создание новой

**Бизнес-логика:**

```javascript
async getOrCreateModel(figi, modelType = 'seq2seq') {
    // Попытка загрузить существующую модель
    const modelPath = `weekly_forecast/${figi}/${modelType}`;
    let model = await ModelManager.loadModel(modelPath);
    
    if (model) {
        // Проверка актуальности модели
        const modelAge = await this.getModelAge(figi, modelType);
        if (modelAge < 7) { // Модель свежая (меньше 7 дней)
            return {
                model,
                version: model.metadata?.version,
                isNew: false
            };
        }
    }
    
    // Создание новой модели
    model = await this.createSeq2SeqModel(figi, modelType);
    
    // Обучение модели на исторических данных
    await this.trainModel(figi, model, modelType);
    
    // Сохранение модели
    await ModelManager.saveModel(model, modelPath, {
        figi,
        modelType,
        version: this.generateModelVersion(),
        trainedAt: new Date().toISOString()
    });
    
    return {
        model,
        version: model.metadata?.version,
        isNew: true
    };
}
```

#### 1.4. `generateModelForecast(model, features)`

**Назначение:** Генерация прогноза моделью

**Бизнес-логика:**

```javascript
async generateModelForecast(model, features) {
    // Преобразование features в тензор
    const inputTensor = this.featuresToTensor(features);
    
    try {
        // Генерация прогноза
        const prediction = model.predict(inputTensor);
        const predictionArray = await prediction.array();
        
        // Очистка памяти
        inputTensor.dispose();
        prediction.dispose();
        
        // Преобразование в формат свечей
        return this.predictionToCandles(predictionArray[0], features);
    } catch (error) {
        // Очистка памяти при ошибке
        if (inputTensor) inputTensor.dispose();
        throw error;
    }
}
```

#### 1.5. `postProcessForecast(rawForecast, historicalCandles, instrument)`

**Назначение:** Постобработка сырого прогноза

**Бизнес-логика:**

```javascript
postProcessForecast(rawForecast, historicalCandles, instrument) {
    const lastPrice = historicalCandles[historicalCandles.length - 1].close;
    
    // Валидация и исправление свечей
    const processedCandles = rawForecast.map((candle, index) => {
        // Проверка на валидность цен
        if (candle.high < candle.low) {
            [candle.high, candle.low] = [candle.low, candle.high];
        }
        
        if (candle.close < candle.low || candle.close > candle.high) {
            candle.close = Math.max(candle.low, Math.min(candle.high, candle.close));
        }
        
        if (candle.open < candle.low || candle.open > candle.high) {
            candle.open = Math.max(candle.low, Math.min(candle.high, candle.open));
        }
        
        // Проверка на разумность изменений
        const maxChange = lastPrice * 0.1; // Максимум 10% изменение за день
        if (Math.abs(candle.close - lastPrice) > maxChange) {
            candle.close = lastPrice + Math.sign(candle.close - lastPrice) * maxChange;
        }
        
        // Вычисление уверенности
        candle.confidence = this.calculateCandleConfidence(candle, historicalCandles);
        
        // Дата свечи
        candle.date = this.addDays(new Date(), index + 1);
        
        return candle;
    });
    
    // Вычисление общей уверенности
    const confidence = processedCandles.reduce((sum, c) => sum + c.confidence, 0) / processedCandles.length;
    
    return {
        candles: processedCandles,
        confidence
    };
}
```

#### 1.6. `updateWithActualData(figi, forecastId = null)`

**Назначение:** Обновление прогноза реальными данными

**Бизнес-логика:**

```javascript
async updateWithActualData(figi, forecastId = null) {
    // Получение прогноза
    const forecast = forecastId 
        ? await WeeklyForecast.findByPk(forecastId)
        : await this.getActiveForecast(figi);
    
    if (!forecast) {
        throw new Error('Forecast not found');
    }
    
    // Получение реальных данных
    const actualCandles = await CacheService.getCandles(
        figi,
        'DAY',
        this.daysBetween(forecast.startDate, new Date()),
        true
    );
    
    if (actualCandles.length === 0) {
        return {
            success: false,
            reason: 'No actual data available yet'
        };
    }
    
    // Сопоставление прогноза с реальностью
    const matchedData = this.matchForecastWithActual(
        forecast.forecastData,
        actualCandles
    );
    
    // Вычисление метрик
    const metrics = this.calculateAccuracyMetrics(matchedData);
    
    // Обновление прогноза
    await forecast.update({
        actualData: matchedData.actual,
        accuracyMetrics: metrics,
        updatedAt: new Date()
    });
    
    // Проверка завершения прогноза
    if (new Date() >= new Date(forecast.endDate)) {
        await forecast.update({
            isCompleted: true,
            completionDate: new Date()
        });
        
        // Запуск адаптивного обучения
        await this.adaptModel(figi, forecast.id);
    }
    
    return {
        success: true,
        forecast: forecast.toJSON(),
        metrics
    };
}
```

#### 1.7. `calculateAccuracyMetrics(matchedData)`

**Назначение:** Вычисление метрик точности

**Бизнес-логика:**

```javascript
calculateAccuracyMetrics(matchedData) {
    const { predicted, actual } = matchedData;
    
    if (predicted.length === 0 || actual.length === 0) {
        return null;
    }
    
    const errors = [];
    const priceErrors = [];
    const volumeErrors = [];
    let directionCorrect = 0;
    
    for (let i = 0; i < Math.min(predicted.length, actual.length); i++) {
        const pred = predicted[i];
        const act = actual[i];
        
        // Ошибка цены закрытия
        const priceError = Math.abs(pred.close - act.close);
        const priceErrorPercent = (priceError / act.close) * 100;
        
        priceErrors.push(priceError);
        errors.push({
            date: act.date,
            priceError,
            priceErrorPercent,
            volumeError: Math.abs(pred.volume - act.volume)
        });
        
        // Точность направления
        const predDirection = pred.close > pred.open ? 1 : -1;
        const actDirection = act.close > act.open ? 1 : -1;
        if (predDirection === actDirection) {
            directionCorrect++;
        }
    }
    
    // Вычисление метрик
    const mae = priceErrors.reduce((sum, e) => sum + e, 0) / priceErrors.length;
    const mse = priceErrors.reduce((sum, e) => sum + e * e, 0) / priceErrors.length;
    const rmse = Math.sqrt(mse);
    const mape = errors.reduce((sum, e) => sum + e.priceErrorPercent, 0) / errors.length;
    const directionAccuracy = directionCorrect / errors.length;
    
    return {
        mae: parseFloat(mae.toFixed(4)),
        mse: parseFloat(mse.toFixed(4)),
        rmse: parseFloat(rmse.toFixed(4)),
        mape: parseFloat(mape.toFixed(4)),
        directionAccuracy: parseFloat(directionAccuracy.toFixed(4)),
        priceError: parseFloat(priceErrors.reduce((sum, e) => sum + e, 0).toFixed(4)),
        volumeError: parseFloat(volumeErrors.reduce((sum, e) => sum + e, 0).toFixed(4)),
        sampleSize: errors.length
    };
}
```

#### 1.8. `adaptModel(figi, forecastId)`

**Назначение:** Адаптивное обучение модели на основе ошибок прогноза

**Бизнес-логика:**

```javascript
async adaptModel(figi, forecastId) {
    // Получение завершенного прогноза
    const forecast = await WeeklyForecast.findByPk(forecastId);
    if (!forecast || !forecast.isCompleted) {
        throw new Error('Forecast must be completed for adaptation');
    }
    
    // Получение исторических данных, использованных для прогноза
    const historicalCandles = await CacheService.getCandles(
        figi,
        'DAY',
        90,
        true
    );
    
    // Создание обучающего примера
    const trainingExample = {
        input: historicalCandles.slice(-60), // Последние 60 дней как вход
        target: forecast.actualData,          // Реальные данные как цель
        errors: this.calculateDayErrors(forecast)
    };
    
    // Загрузка модели
    const model = await this.getOrCreateModel(figi, forecast.modelType);
    
    // Дообучение модели
    await this.fineTuneModel(model, trainingExample, {
        epochs: 5,
        learningRate: 0.0001, // Меньший LR для fine-tuning
        batchSize: 1
    });
    
    // Сохранение обновленной модели
    const newVersion = this.generateModelVersion();
    await ModelManager.saveModel(model, `weekly_forecast/${figi}/${forecast.modelType}`, {
        version: newVersion,
        previousVersion: forecast.modelVersion,
        adaptedFrom: forecastId,
        adaptedAt: new Date().toISOString()
    });
    
    return {
        success: true,
        newVersion,
        previousVersion: forecast.modelVersion
    };
}
```

---

## 🤖 Модель машинного обучения

### 2.1. Seq2Seq архитектура

```javascript
// server/src/services/WeeklyForecastModelService.js

class WeeklyForecastModelService {
    /**
     * Создание Seq2Seq модели
     */
    createSeq2SeqModel(inputSequenceLength = 60, featureSize = 70, outputDays = 7) {
        const encoderInput = tf.input({ shape: [inputSequenceLength, featureSize] });
        
        // Encoder LSTM
        const encoderLSTM1 = tf.layers.lstm({
            units: 128,
            returnSequences: true,
            name: 'encoder_lstm_1'
        }).apply(encoderInput);
        
        const encoderLSTM2 = tf.layers.lstm({
            units: 128,
            returnSequences: true,
            returnState: true,
            name: 'encoder_lstm_2'
        }).apply(encoderLSTM1);
        
        const [encoderOutput, stateH, stateC] = encoderLSTM2;
        
        // Attention Mechanism (упрощенный)
        const attention = this.createAttentionLayer(128);
        const context = attention.apply([encoderOutput, encoderOutput]);
        
        // Decoder LSTM
        const decoderInput = tf.input({ shape: [outputDays, featureSize] });
        
        const decoderLSTM1 = tf.layers.lstm({
            units: 128,
            returnSequences: true,
            name: 'decoder_lstm_1'
        }).apply(decoderInput, { initialState: [stateH, stateC] });
        
        const decoderLSTM2 = tf.layers.lstm({
            units: 128,
            returnSequences: true,
            name: 'decoder_lstm_2'
        }).apply(decoderLSTM1);
        
        // Dense layers для каждой свечи
        const timeDistributed = tf.layers.timeDistributed({
            layer: tf.layers.dense({ units: 5 }) // open, high, low, close, volume
        }).apply(decoderLSTM2);
        
        const model = tf.model({
            inputs: [encoderInput, decoderInput],
            outputs: timeDistributed
        });
        
        model.compile({
            optimizer: tf.train.adam(0.001),
            loss: 'meanSquaredError',
            metrics: ['mae']
        });
        
        return model;
    }
    
    /**
     * Упрощенный Attention механизм
     */
    createAttentionLayer(units) {
        // Реализация attention для TensorFlow.js
        // Используем dot-product attention
        return tf.layers.dense({ units, activation: 'tanh' });
    }
}
```

### 2.2. Подготовка данных для обучения

```javascript
prepareTrainingData(candles, lookbackDays = 60, forecastDays = 7) {
    const sequences = [];
    const targets = [];
    
    for (let i = lookbackDays; i < candles.length - forecastDays; i++) {
        // Входная последовательность
        const inputSequence = candles.slice(i - lookbackDays, i);
        
        // Целевая последовательность (следующие 7 дней)
        const targetSequence = candles.slice(i, i + forecastDays);
        
        sequences.push(inputSequence);
        targets.push(targetSequence);
    }
    
    return { sequences, targets };
}
```

---

## 📅 План реализации по этапам

### Этап 1: Инфраструктура (1-2 недели)

#### Задачи:
1. ✅ Создать модель `WeeklyForecast`
2. ✅ Создать миграцию БД
3. ✅ Создать базовый `WeeklyForecastService` с методами-заглушками
4. ✅ Интегрировать с существующими сервисами
5. ✅ Настроить логирование

#### Критерии готовности:
- [ ] Модель создана и миграция применена
- [ ] Базовый сервис инициализируется без ошибок
- [ ] Интеграция с CacheService, OptimizedDataService работает
- [ ] Unit тесты для модели и базовых методов проходят

---

### Этап 2: Модель машинного обучения (2-3 недели)

#### Задачи:
1. ✅ Реализовать Seq2Seq архитектуру
2. ✅ Создать метод подготовки данных для Seq2Seq
3. ✅ Реализовать обучение модели
4. ✅ Сохранение/загрузка модели
5. ✅ Тестирование на исторических данных

#### Критерии готовности:
- [ ] Модель создается и компилируется
- [ ] Обучение проходит без ошибок
- [ ] Модель сохраняется и загружается корректно
- [ ] Тесты на исторических данных показывают разумные результаты
- [ ] Loss уменьшается в процессе обучения

---

### Этап 3: Генерация прогнозов (1-2 недели)

#### Задачи:
1. ✅ Реализовать `generateForecast()` полностью
2. ✅ Интеграция с OptimizedDataService для features
3. ✅ Вычисление уверенности и метаданных
4. ✅ Сохранение в БД
5. ✅ WebSocket уведомления

#### Критерии готовности:
- [ ] Прогноз генерируется для любого инструмента
- [ ] Прогноз содержит 7 валидных свечей
- [ ] Метаданные вычисляются корректно
- [ ] Прогноз сохраняется в БД
- [ ] WebSocket уведомления отправляются

---

### Этап 4: Обратная связь и адаптация (2-3 недели)

#### Задачи:
1. ✅ Реализовать `updateWithActualData()`
2. ✅ Вычисление метрик точности
3. ✅ Реализовать адаптивное обучение
4. ✅ Автоматическое обновление прогнозов (scheduler)

#### Критерии готовности:
- [ ] Реальные данные сопоставляются с прогнозом
- [ ] Метрики вычисляются корректно
- [ ] Адаптивное обучение улучшает модель
- [ ] Scheduler обновляет прогнозы автоматически

---

### Этап 5: API и Frontend (2-3 недели)

#### Задачи:
1. ✅ Создать API endpoints
2. ✅ Реализовать компонент графика
3. ✅ Страница детального просмотра
4. ✅ Интеграция с существующим UI

#### Критерии готовности:
- [ ] Все API endpoints работают
- [ ] График отображает прогноз и реальность
- [ ] Страница детального просмотра показывает все метрики
- [ ] Интеграция с UI завершена

---

### Этап 6: Оптимизация и тестирование (1-2 недели)

#### Задачи:
1. ✅ Оптимизация производительности
2. ✅ Тестирование на разных инструментах
3. ✅ Настройка гиперпараметров
4. ✅ Документация

#### Критерии готовности:
- [ ] Генерация прогноза < 5 секунд
- [ ] Обновление реальными данными < 1 секунда
- [ ] Тесты проходят на разных инструментах
- [ ] Документация полная и актуальная

---

## 🧪 Тестирование

### 1. Unit тесты

#### 1.1. Тесты WeeklyForecastService

```javascript
// server/src/__tests__/services/WeeklyForecastService.test.js

describe('WeeklyForecastService', () => {
    describe('generateForecast', () => {
        it('should generate forecast for valid FIGI', async () => {
            const result = await WeeklyForecastService.generateForecast('BBG0013HJJ31');
            expect(result.success).toBe(true);
            expect(result.forecast.forecastData).toHaveLength(7);
            expect(result.forecast.confidenceScore).toBeGreaterThan(0);
            expect(result.forecast.confidenceScore).toBeLessThanOrEqual(1);
        });
        
        it('should throw error for invalid FIGI', async () => {
            await expect(
                WeeklyForecastService.generateForecast('INVALID_FIGI')
            ).rejects.toThrow('Instrument not found');
        });
        
        it('should throw error for insufficient data', async () => {
            // Мокируем CacheService для возврата малого количества данных
            await expect(
                WeeklyForecastService.generateForecast('FIGI_WITH_LITTLE_DATA')
            ).rejects.toThrow('Insufficient historical data');
        });
        
        it('should return cached forecast if fresh', async () => {
            // Создаем свежий прогноз
            const forecast = await WeeklyForecast.create({...});
            
            const result = await WeeklyForecastService.generateForecast('BBG0013HJJ31');
            expect(result.cached).toBe(true);
            expect(result.forecast.id).toBe(forecast.id);
        });
        
        it('should force regenerate when forceRegenerate=true', async () => {
            const result1 = await WeeklyForecastService.generateForecast('BBG0013HJJ31');
            const result2 = await WeeklyForecastService.generateForecast('BBG0013HJJ31', {
                forceRegenerate: true
            });
            
            expect(result2.cached).toBe(false);
            expect(result2.forecast.id).not.toBe(result1.forecast.id);
        });
    });
    
    describe('updateWithActualData', () => {
        it('should update forecast with actual data', async () => {
            const forecast = await WeeklyForecast.create({...});
            
            const result = await WeeklyForecastService.updateWithActualData(
                forecast.figi,
                forecast.id
            );
            
            expect(result.success).toBe(true);
            expect(result.forecast.actualData).toBeDefined();
            expect(result.metrics).toBeDefined();
        });
        
        it('should mark forecast as completed when end date passed', async () => {
            const forecast = await WeeklyForecast.create({
                ...,
                endDate: new Date(Date.now() - 86400000) // Вчера
            });
            
            await WeeklyForecastService.updateWithActualData(forecast.figi, forecast.id);
            
            const updated = await WeeklyForecast.findByPk(forecast.id);
            expect(updated.isCompleted).toBe(true);
        });
    });
    
    describe('calculateAccuracyMetrics', () => {
        it('should calculate metrics correctly', () => {
            const matchedData = {
                predicted: [
                    { close: 100, volume: 1000 },
                    { close: 105, volume: 1100 }
                ],
                actual: [
                    { close: 102, volume: 1050 },
                    { close: 103, volume: 1080 }
                ]
            };
            
            const metrics = WeeklyForecastService.calculateAccuracyMetrics(matchedData);
            
            expect(metrics.mae).toBeCloseTo(2.5, 1);
            expect(metrics.directionAccuracy).toBeGreaterThanOrEqual(0);
            expect(metrics.directionAccuracy).toBeLessThanOrEqual(1);
        });
    });
});
```

#### 1.2. Тесты модели данных

```javascript
// server/src/__tests__/models/WeeklyForecast.test.js

describe('WeeklyForecast Model', () => {
    it('should create forecast with valid data', async () => {
        const forecast = await WeeklyForecast.create({
            figi: 'BBG0013HJJ31',
            ticker: 'SBER',
            forecastDate: new Date(),
            startDate: new Date(),
            endDate: new Date(Date.now() + 7 * 86400000),
            forecastData: Array(7).fill(null).map((_, i) => ({
                date: new Date(Date.now() + i * 86400000),
                open: 100 + i,
                high: 105 + i,
                low: 95 + i,
                close: 102 + i,
                volume: 1000,
                confidence: 0.8
            })),
            confidenceScore: 0.8
        });
        
        expect(forecast.id).toBeDefined();
        expect(forecast.forecastData).toHaveLength(7);
    });
    
    it('should validate forecastData length', async () => {
        await expect(
            WeeklyForecast.create({
                ...,
                forecastData: Array(5).fill({...}) // Неправильная длина
            })
        ).rejects.toThrow();
    });
    
    it('should validate confidenceScore range', async () => {
        await expect(
            WeeklyForecast.create({
                ...,
                confidenceScore: 1.5 // Вне диапазона
            })
        ).rejects.toThrow();
    });
});
```

### 2. Integration тесты

```javascript
// server/src/__tests__/integration/weeklyForecast.integration.test.js

describe('Weekly Forecast Integration', () => {
    it('should complete full forecast cycle', async () => {
        // 1. Генерация прогноза
        const generateResult = await WeeklyForecastService.generateForecast('BBG0013HJJ31');
        expect(generateResult.success).toBe(true);
        
        const forecastId = generateResult.forecast.id;
        
        // 2. Симуляция прошедших дней
        // Мокируем реальные данные
        await simulateDaysPassed('BBG0013HJJ31', 3);
        
        // 3. Обновление реальными данными
        const updateResult = await WeeklyForecastService.updateWithActualData(
            'BBG0013HJJ31',
            forecastId
        );
        expect(updateResult.success).toBe(true);
        expect(updateResult.metrics).toBeDefined();
        
        // 4. Проверка завершения после 7 дней
        await simulateDaysPassed('BBG0013HJJ31', 4);
        
        await WeeklyForecastService.updateWithActualData('BBG0013HJJ31', forecastId);
        
        const forecast = await WeeklyForecast.findByPk(forecastId);
        expect(forecast.isCompleted).toBe(true);
        
        // 5. Проверка адаптивного обучения
        const adaptResult = await WeeklyForecastService.adaptModel('BBG0013HJJ31', forecastId);
        expect(adaptResult.success).toBe(true);
        expect(adaptResult.newVersion).not.toBe(forecast.modelVersion);
    });
});
```

### 3. Performance тесты

```javascript
// server/src/__tests__/performance/weeklyForecast.performance.test.js

describe('Weekly Forecast Performance', () => {
    it('should generate forecast in less than 5 seconds', async () => {
        const startTime = Date.now();
        await WeeklyForecastService.generateForecast('BBG0013HJJ31');
        const duration = Date.now() - startTime;
        
        expect(duration).toBeLessThan(5000);
    });
    
    it('should update with actual data in less than 1 second', async () => {
        const forecast = await createTestForecast();
        
        const startTime = Date.now();
        await WeeklyForecastService.updateWithActualData(forecast.figi, forecast.id);
        const duration = Date.now() - startTime;
        
        expect(duration).toBeLessThan(1000);
    });
});
```

### 4. Тесты модели ML

```javascript
// server/src/__tests__/ml/weeklyForecastModel.test.js

describe('Weekly Forecast Model', () => {
    it('should create Seq2Seq model', () => {
        const model = WeeklyForecastModelService.createSeq2SeqModel(60, 70, 7);
        expect(model).toBeDefined();
        expect(model.inputs).toHaveLength(2); // encoder + decoder
        expect(model.outputs).toHaveLength(1);
    });
    
    it('should train model on historical data', async () => {
        const candles = await getTestCandles(100);
        const { sequences, targets } = WeeklyForecastModelService.prepareTrainingData(candles);
        
        expect(sequences.length).toBeGreaterThan(0);
        expect(targets.length).toBe(sequences.length);
        
        const model = WeeklyForecastModelService.createSeq2SeqModel();
        const history = await model.fit(sequences, targets, {
            epochs: 1,
            batchSize: 1,
            verbose: 0
        });
        
        expect(history.history.loss).toBeDefined();
    });
    
    it('should generate valid forecast', async () => {
        const model = await loadTestModel();
        const features = await prepareTestFeatures();
        
        const forecast = await WeeklyForecastModelService.generateForecast(model, features);
        
        expect(forecast).toHaveLength(7);
        forecast.forEach(candle => {
            expect(candle.open).toBeGreaterThan(0);
            expect(candle.high).toBeGreaterThanOrEqual(candle.low);
            expect(candle.close).toBeGreaterThanOrEqual(candle.low);
            expect(candle.close).toBeLessThanOrEqual(candle.high);
        });
    });
});
```

---

## 📊 Мониторинг и метрики

### 1. Метрики качества прогнозов

```javascript
// Отслеживание в реальном времени
{
    averageMAPE: number,           // Средняя процентная ошибка
    averageDirectionAccuracy: number, // Точность направления
    forecastCount: number,          // Количество прогнозов
    completedForecasts: number,     // Завершенных прогнозов
    averageConfidence: number,      // Средняя уверенность
    modelVersions: string[]         // Активные версии моделей
}
```

### 2. Метрики производительности

```javascript
{
    averageGenerationTime: number,  // Среднее время генерации
    averageUpdateTime: number,      // Среднее время обновления
    modelTrainingTime: number,      // Время обучения модели
    cacheHitRate: number            // Процент использования кеша
}
```

### 3. Алерты

- MAPE > 10% для 3+ прогнозов подряд
- Direction Accuracy < 50% для 5+ прогнозов
- Время генерации > 10 секунд
- Ошибка при адаптивном обучении

---

## ✅ Критерии успеха

1. **Точность:**
   - MAPE < 5% для стабильных инструментов
   - Direction Accuracy > 60%
   - Confidence коррелирует с точностью

2. **Производительность:**
   - Генерация < 5 секунд
   - Обновление < 1 секунда
   - Обучение модели < 30 минут

3. **Надежность:**
   - 99.9% успешных генераций
   - Автоматическое восстановление при ошибках
   - Валидация всех входных данных

4. **Адаптивность:**
   - Модель улучшается после каждого цикла
   - Метрики растут со временем
   - Автоматическое переобучение при деградации

---

## 📝 Чеклист реализации

### Фаза 1: Инфраструктура
- [ ] Модель WeeklyForecast
- [ ] Миграция БД
- [ ] Базовый WeeklyForecastService
- [ ] Интеграция с существующими сервисами
- [ ] Unit тесты модели

### Фаза 2: ML модель
- [ ] Seq2Seq архитектура
- [ ] Подготовка данных
- [ ] Обучение модели
- [ ] Сохранение/загрузка
- [ ] ML тесты

### Фаза 3: Генерация
- [ ] generateForecast() полностью
- [ ] Подготовка features
- [ ] Постобработка
- [ ] Сохранение в БД
- [ ] WebSocket
- [ ] Integration тесты

### Фаза 4: Обратная связь
- [ ] updateWithActualData()
- [ ] Вычисление метрик
- [ ] Адаптивное обучение
- [ ] Scheduler
- [ ] Integration тесты

### Фаза 5: API и UI
- [ ] API endpoints
- [ ] Компонент графика
- [ ] Страница детального просмотра
- [ ] E2E тесты

### Фаза 6: Оптимизация
- [ ] Оптимизация производительности
- [ ] Настройка гиперпараметров
- [ ] Документация
- [ ] Performance тесты

---

## 🚀 Следующие шаги

1. Начать с Фазы 1 - создать инфраструктуру
2. Реализовать MVP с простой LSTM моделью
3. Итеративно улучшать точность и функциональность
4. Добавить мониторинг и алерты
5. Оптимизировать производительность

