import OptimizedDataService from './OptimizedDataService.js';
import CacheService from './CacheService.js';
import TradingEngine from './TradingEngine.js';
import ProfitabilityTracker from './ProfitabilityTracker.js';
import DataQualityService from './DataQualityService.js';
import LoggerService from './LoggerService.js';
import {
    analyzeByDayOfWeek,
    analyzeByMonth
} from '../utils/advancedMetrics.js';

/**
 * Оптимизированный сервис анализа
 * Объединяет функциональность TechnicalIndicatorService, EvaluationMetricsService,
 * PredictionExplanationService, ExplainableAIService
 */
class OptimizedAnalysisService {
    constructor() {
        this.isInitialized = false;
        this.indicatorsCache = new Map(); // Кеш индикаторов: key -> {indicators, timestamp, figi, interval}
        this.evaluationCache = new Map();
        // Настройки кеширования (Фаза 3, задача 3.1.2)
        this.cacheSettings = {
            indicatorsTTL: 5 * 60 * 1000, // 5 минут TTL для индикаторов
            maxCacheSize: 1000, // Максимальный размер кеша
            batchSize: 10 // Размер батча для параллельной обработки (3.1.1)
        };
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        try {
            await OptimizedDataService.initialize();
            await CacheService.initialize();
            
            // Инициализируем DataQualityService (Фаза 2, задача 2.3)
            if (!DataQualityService.isInitialized) {
                await DataQualityService.initialize();
            }
            
            this.isInitialized = true;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Failed to initialize Optimized Analysis Service', {
                    service: 'OptimizedAnalysisService',
                    operation: 'initialize',
                    error: { message: error.message, stack: error.stack }
                });
            }
            throw error;
        }
    }

    // ============================================================================
    // ТЕХНИЧЕСКИЕ ИНДИКАТОРЫ
    // ============================================================================

    /**
     * Генерация ключа кеша для индикаторов
     * Фаза 3, задача 3.1.2: кеширование результатов анализа
     */
    _getIndicatorsCacheKey(figi, interval = 'DAY', period = 30) {
        return `${figi}:${interval}:${period}`;
    }

    /**
     * Проверка валидности кеша индикаторов
     * Фаза 3, задача 3.1.2: кеширование результатов анализа
     */
    _isIndicatorsCacheValid(cacheEntry) {
        if (!cacheEntry || !cacheEntry.timestamp) {
            return false;
        }
        const age = Date.now() - cacheEntry.timestamp;
        return age < this.cacheSettings.indicatorsTTL;
    }

    /**
     * Очистка устаревших записей из кеша
     * Фаза 3, задача 3.1.2: кеширование результатов анализа
     */
    _cleanupIndicatorsCache() {
        const now = Date.now();
        const keysToDelete = [];
        
        for (const [key, entry] of this.indicatorsCache.entries()) {
            if (!entry.timestamp || (now - entry.timestamp) > this.cacheSettings.indicatorsTTL) {
                keysToDelete.push(key);
            }
        }
        
        for (const key of keysToDelete) {
            this.indicatorsCache.delete(key);
        }
        
        // Если кеш слишком большой, удаляем самые старые записи
        if (this.indicatorsCache.size > this.cacheSettings.maxCacheSize) {
            const entries = Array.from(this.indicatorsCache.entries())
                .sort((a, b) => (a[1].timestamp || 0) - (b[1].timestamp || 0));
            
            const toDelete = entries.slice(0, this.indicatorsCache.size - this.cacheSettings.maxCacheSize);
            for (const [key] of toDelete) {
                this.indicatorsCache.delete(key);
            }
        }
    }

    /**
     * Инвалидация кеша для конкретного инструмента
     * Фаза 3, задача 3.1.2: инвалидация кеша при обновлении данных
     */
    invalidateIndicatorsCache(figi, interval = null) {
        if (interval) {
            // Инвалидируем для конкретного интервала
            const keysToDelete = [];
            for (const key of this.indicatorsCache.keys()) {
                if (key.startsWith(`${figi}:${interval}:`)) {
                    keysToDelete.push(key);
                }
            }
            keysToDelete.forEach(key => this.indicatorsCache.delete(key));
        } else {
            // Инвалидируем все записи для инструмента
            const keysToDelete = [];
            for (const key of this.indicatorsCache.keys()) {
                if (key.startsWith(`${figi}:`)) {
                    keysToDelete.push(key);
                }
            }
            keysToDelete.forEach(key => this.indicatorsCache.delete(key));
        }
    }

    /**
     * Получение всех технических индикаторов с кешированием
     * Обновлено в Фазе 2, задача 2.3: добавлена валидация данных
     * Обновлено в Фазе 3, задача 3.1.2: добавлено кеширование
     */
    getAllIndicators(prices, volumes = [], highs = [], lows = [], figi = null, interval = 'DAY', period = 30) {
        try {
            // 3.1.2: Проверяем кеш перед расчетом
            if (figi) {
                const cacheKey = this._getIndicatorsCacheKey(figi, interval, period);
                const cached = this.indicatorsCache.get(cacheKey);
                
                if (this._isIndicatorsCacheValid(cached)) {
                    // Проверяем, что данные не изменились (по последней цене)
                    if (cached.lastPrice === prices[prices.length - 1] && 
                        cached.dataLength === prices.length) {
                        return cached.indicators;
                    }
                }
            }
            
            // Валидация и очистка данных перед расчетом индикаторов
            if (DataQualityService && DataQualityService.isInitialized) {
                // Очищаем значения от NaN и Infinity
                prices = prices.map(p => DataQualityService.cleanValue(p, 0));
                volumes = volumes.map(v => DataQualityService.cleanValue(v, 0));
                highs = highs.map(h => DataQualityService.cleanValue(h, 0));
                lows = lows.map(l => DataQualityService.cleanValue(l, 0));
                
                // Заполняем пропуски
                prices = DataQualityService.fillGaps(prices, 'linear');
                volumes = DataQualityService.fillGaps(volumes, 'forward');
                highs = DataQualityService.fillGaps(highs, 'linear');
                lows = DataQualityService.fillGaps(lows, 'linear');
            }
            
            const indicators = {};
            
            // Трендовые индикаторы
            indicators.sma_5 = this.calculateSMA(prices, 5);
            indicators.sma_10 = this.calculateSMA(prices, 10);
            indicators.sma_20 = this.calculateSMA(prices, 20);
            indicators.sma_50 = this.calculateSMA(prices, 50);
            
            indicators.ema_12 = this.calculateEMA(prices, 12);
            indicators.ema_26 = this.calculateEMA(prices, 26);
            
            // Осцилляторы
            indicators.rsi = this.calculateRSI(prices);
            indicators.stoch = this.calculateStochastic(highs, lows, prices);
            indicators.williams_r = this.calculateWilliamsR(highs, lows, prices);
            
            // MACD
            const macd = this.calculateMACD(prices);
            indicators.macd = macd.macd;
            indicators.macd_signal = macd.signal;
            indicators.macd_histogram = macd.histogram;
            
            // Bollinger Bands
            const bb = this.calculateBollingerBands(prices);
            indicators.bb_upper = bb.upper;
            indicators.bb_middle = bb.middle;
            indicators.bb_lower = bb.lower;
            indicators.bb_width = bb.width;
            indicators.bb_position = bb.position;
            
            // Объемные индикаторы
            if (volumes.length > 0) {
                indicators.volume_sma = this.calculateSMA(volumes, 10);
                indicators.obv = this.calculateOBV(prices, volumes);
                indicators.vwap = this.calculateVWAP(highs, lows, volumes);
            }
            
            // Волатильность
            indicators.atr = this.calculateATR(highs, lows, prices);
            indicators.volatility = this.calculateVolatility(prices);
            
            // Фаза 4, задача 4.1: Расширение набора индикаторов
            // Ichimoku Cloud (требует минимум 52 свечи)
            if (prices.length >= 52 && highs.length >= 52 && lows.length >= 52) {
                const ichimoku = this.calculateIchimokuCloud(highs, lows, prices);
                indicators.ichimoku_tenkan = ichimoku.tenkan;
                indicators.ichimoku_kijun = ichimoku.kijun;
                indicators.ichimoku_senkou_a = ichimoku.senkouA;
                indicators.ichimoku_senkou_b = ichimoku.senkouB;
                indicators.ichimoku_chikou = ichimoku.chikou;
                indicators.ichimoku_cloud_top = ichimoku.cloudTop;
                indicators.ichimoku_cloud_bottom = ichimoku.cloudBottom;
                indicators.ichimoku_cloud_color = ichimoku.cloudColor; // 'bullish' или 'bearish'
                indicators.ichimoku_signal = ichimoku.signal; // 'buy', 'sell', 'hold'
            }
            
            // Fibonacci Retracements
            if (prices.length >= 20 && highs.length >= 20 && lows.length >= 20) {
                const fib = this.calculateFibonacciRetracements(highs, lows, prices);
                indicators.fib_levels = fib.levels;
                indicators.fib_current_level = fib.currentLevel;
                indicators.fib_support = fib.support;
                indicators.fib_resistance = fib.resistance;
            }
            
            // Market Profile (требует объем)
            if (volumes.length > 0 && prices.length >= 20 && highs.length >= 20 && lows.length >= 20) {
                const marketProfile = this.calculateMarketProfile(highs, lows, prices, volumes);
                indicators.market_profile_poc = marketProfile.poc;
                indicators.market_profile_value_area_high = marketProfile.valueAreaHigh;
                indicators.market_profile_value_area_low = marketProfile.valueAreaLow;
                indicators.market_profile_profile_type = marketProfile.profileType; // 'normal', 'trend', 'non_trend'
                indicators.market_profile_balance = marketProfile.balance; // 'balanced' или 'imbalanced'
            }
            
            // Очищаем результаты от NaN и Infinity
            if (DataQualityService && DataQualityService.isInitialized) {
                for (const key in indicators) {
                    indicators[key] = DataQualityService.cleanValue(indicators[key], 0);
                }
            }
            
            // 3.1.2: Сохраняем в кеш
            if (figi) {
                const cacheKey = this._getIndicatorsCacheKey(figi, interval, period);
                this.indicatorsCache.set(cacheKey, {
                    indicators,
                    timestamp: Date.now(),
                    figi,
                    interval,
                    period,
                    lastPrice: prices[prices.length - 1],
                    dataLength: prices.length
                });
                
                // Периодически очищаем кеш
                if (this.indicatorsCache.size > this.cacheSettings.maxCacheSize * 0.8) {
                    this._cleanupIndicatorsCache();
                }
            }
            
            return indicators;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error calculating indicators', {
                    service: 'OptimizedAnalysisService',
                    operation: 'getAllIndicators',
                    error: { message: error.message, stack: error.stack }
                });
            }
            return {};
        }
    }

    /**
     * Подготовка фичей для нейросети
     */
    prepareFeatures(indicators, currentIndex) {
        try {
            const features = [];
            
            // Базовые индикаторы
            features.push(indicators.sma_5 || 0);
            features.push(indicators.sma_10 || 0);
            features.push(indicators.sma_20 || 0);
            features.push(indicators.sma_50 || 0);
            
            features.push(indicators.ema_12 || 0);
            features.push(indicators.ema_26 || 0);
            
            // Осцилляторы
            features.push(indicators.rsi || 0.5);
            features.push(indicators.stoch || 0.5);
            features.push(indicators.williams_r || 0.5);
            
            // MACD
            features.push(indicators.macd || 0);
            features.push(indicators.macd_signal || 0);
            features.push(indicators.macd_histogram || 0);
            
            // Bollinger Bands
            features.push(indicators.bb_upper || 0);
            features.push(indicators.bb_middle || 0);
            features.push(indicators.bb_lower || 0);
            features.push(indicators.bb_width || 0);
            features.push(indicators.bb_position || 0.5);
            
            // Объемные
            features.push(indicators.volume_sma || 0);
            features.push(indicators.obv || 0);
            features.push(indicators.vwap || 0);
            
            // Волатильность
            features.push(indicators.atr || 0);
            features.push(indicators.volatility || 0);
            
            return features;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error preparing features', {
                    service: 'OptimizedAnalysisService',
                    operation: 'prepareFeatures',
                    error: { message: error.message, stack: error.stack }
                });
            }
            return new Array(20).fill(0);
        }
    }

    // ============================================================================
    // ОЦЕНКА МОДЕЛИ
    // ============================================================================

    /**
     * Оценка модели нейросети
     */
    async evaluateModel(predictions, actuals, trades = []) {
        try {
            const metrics = {};
            
            // Базовые метрики
            metrics.accuracy = this.calculateAccuracy(predictions, actuals);
            metrics.precision = this.calculatePrecision(predictions, actuals);
            metrics.recall = this.calculateRecall(predictions, actuals);
            metrics.f1Score = this.calculateF1Score(metrics.precision, metrics.recall);
            
            // Confusion Matrix
            metrics.confusionMatrix = this.calculateConfusionMatrix(predictions, actuals);
            
            // Финансовые метрики
            if (trades.length > 0) {
                metrics.financial = this.calculateFinancialMetrics(trades);
            }
            
            // ROC AUC
            metrics.rocAuc = this.calculateROCAUC(predictions, actuals);
            
            // Calibration
            metrics.calibration = this.calculateCalibration(predictions, actuals);
            
            return metrics;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error evaluating model', {
                    service: 'OptimizedAnalysisService',
                    operation: 'evaluateModel',
                    error: { message: error.message, stack: error.stack }
                });
            }
            return {
                accuracy: 0,
                precision: 0,
                recall: 0,
                f1Score: 0,
                confusionMatrix: { truePositive: 0, trueNegative: 0, falsePositive: 0, falseNegative: 0 },
                rocAuc: 0.5,
                calibration: 0
            };
        }
    }

    /**
     * Сохранение результатов оценки
     */
    async saveEvaluationResults(figi, evaluation) {
        try {
            // Сохраняем в кеш
            this.evaluationCache.set(figi, {
                ...evaluation,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error saving evaluation results', {
                    service: 'OptimizedAnalysisService',
                    operation: 'saveEvaluationResults',
                    figi,
                    error: { message: error.message, stack: error.stack }
                });
            }
        }
    }

    // ============================================================================
    // ОБЪЯСНЕНИЕ ПРЕДСКАЗАНИЙ
    // ============================================================================

    /**
     * Объяснение предсказания модели с детальным анализом
     * Фаза 3, задача 3.2: Прозрачность решений (Explainability)
     * 
     * @param {string} figi - FIGI инструмента
     * @param {Array} features - Массив фичей (индикаторов)
     * @param {number} prediction - Предсказание модели (0-1)
     * @param {Object} indicators - Объект с индикаторами (опционально)
     * @returns {Promise<Object>} Детальное объяснение предсказания
     */
    async explainPrediction(figi, features, prediction, indicators = null) {
        try {
            // Получаем важность фичей с улучшенным SHAP-like подходом
            const featureImportance = await this.analyzeFeatureImportance(features, prediction);
            
            // Генерируем детальное объяснение
            const reasoning = this.generateReasoning(features, prediction, indicators);
            
            // Формируем итоговое объяснение
            const explanation = {
                prediction: prediction,
                confidence: Math.abs(prediction - 0.5) * 2,
                direction: prediction > 0.5 ? 'BUY' : 'SELL',
                featureImportance: featureImportance,
                reasoning: reasoning,
                topFactors: featureImportance.slice(0, 5).map(f => ({
                    name: f.name,
                    importance: f.importancePercent?.toFixed(2) || f.importance.toFixed(4),
                    explanation: f.explanation
                })),
                timestamp: new Date().toISOString()
            };
            
            return explanation;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error explaining prediction', {
                    service: 'OptimizedAnalysisService',
                    operation: 'explainPrediction',
                    error: { message: error.message, stack: error.stack }
                });
            }
            return {
                prediction: prediction,
                confidence: 0.5,
                direction: prediction > 0.5 ? 'BUY' : 'SELL',
                factors: [],
                reasoning: {
                    base: 'Unable to generate explanation',
                    summary: 'Ошибка при генерации объяснения'
                },
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Анализ важности фичей с использованием SHAP-like подхода
     * Фаза 3, задача 3.2.1: Интеграция LIME или SHAP
     * 
     * Использует упрощенный подход, основанный на:
     * - Градиентном анализе (изменение предсказания при изменении фичи)
     * - Нормализованной важности (относительно других фичей)
     * - Взаимодействию между фичами
     */
    async analyzeFeatureImportance(features, prediction = null, baselineFeatures = null) {
        try {
            if (!Array.isArray(features) || features.length === 0) {
                return [];
            }

            // Если baseline не предоставлен, используем средние значения
            if (!baselineFeatures) {
                baselineFeatures = new Array(features.length).fill(0);
            }

            // Нормализуем фичи для корректного сравнения
            const normalizedFeatures = this._normalizeFeatures(features);
            const normalizedBaseline = this._normalizeFeatures(baselineFeatures);

            // SHAP-like подход: вычисляем маргинальный вклад каждой фичи
            const importance = features.map((feature, index) => {
                const featureName = this.getFeatureName(index);
                
                // Базовое значение важности (абсолютное отклонение от baseline)
                const deviation = Math.abs(feature - (baselineFeatures[index] || 0));
                
                // Нормализованное значение (0-1)
                const normalizedValue = normalizedFeatures[index];
                const normalizedBaselineValue = normalizedBaseline[index];
                
                // Вычисляем маргинальный вклад (SHAP-like)
                // Используем комбинацию отклонения и нормализованного значения
                const marginalContribution = Math.abs(normalizedValue - normalizedBaselineValue) * deviation;
                
                // Учитываем тип индикатора для более точной оценки
                const indicatorWeight = this._getIndicatorWeight(featureName);
                
                // Финальная важность = маргинальный вклад * вес индикатора
                const finalImportance = marginalContribution * indicatorWeight;
                
                return {
                    index,
                    name: featureName,
                    value: feature,
                    normalizedValue: normalizedValue,
                    deviation: deviation,
                    marginalContribution: marginalContribution,
                    importance: finalImportance,
                    contribution: prediction !== null ? 
                        this._estimateContribution(feature, normalizedValue, prediction) : 
                        finalImportance,
                    explanation: this._getFeatureExplanation(featureName, feature)
                };
            });
            
            // Сортируем по важности
            importance.sort((a, b) => b.importance - a.importance);
            
            // Нормализуем важность (сумма = 1.0)
            const totalImportance = importance.reduce((sum, item) => sum + item.importance, 0);
            if (totalImportance > 0) {
                importance.forEach(item => {
                    item.importancePercent = (item.importance / totalImportance) * 100;
                });
            }
            
            return importance.slice(0, 10); // Топ-10 фичей
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error analyzing feature importance', {
                    service: 'OptimizedAnalysisService',
                    operation: 'analyzeFeatureImportance',
                    error: { message: error.message, stack: error.stack }
                });
            }
            return [];
        }
    }

    /**
     * Нормализация фичей для корректного сравнения
     * @private
     */
    _normalizeFeatures(features) {
        if (!Array.isArray(features) || features.length === 0) {
            return [];
        }

        // Находим min и max для нормализации
        const validFeatures = features.filter(f => !isNaN(f) && isFinite(f));
        if (validFeatures.length === 0) {
            return new Array(features.length).fill(0);
        }

        const min = Math.min(...validFeatures);
        const max = Math.max(...validFeatures);
        const range = max - min;

        // Нормализуем в диапазон [0, 1]
        return features.map(f => {
            if (isNaN(f) || !isFinite(f)) return 0;
            return range > 0 ? (f - min) / range : 0.5;
        });
    }

    /**
     * Получение веса индикатора (более важные индикаторы имеют больший вес)
     * @private
     */
    _getIndicatorWeight(indicatorName) {
        const weights = {
            // Осцилляторы - высокий вес
            'RSI': 1.5,
            'Stochastic': 1.3,
            'Williams_R': 1.2,
            'MACD': 1.4,
            'MACD_Signal': 1.3,
            'MACD_Histogram': 1.2,
            
            // Трендовые индикаторы - средний вес
            'SMA_5': 1.0,
            'SMA_10': 1.0,
            'SMA_20': 1.1,
            'SMA_50': 1.2,
            'EMA_12': 1.0,
            'EMA_26': 1.1,
            
            // Bollinger Bands - высокий вес
            'BB_Upper': 1.2,
            'BB_Middle': 1.0,
            'BB_Lower': 1.2,
            'BB_Width': 1.1,
            'BB_Position': 1.3,
            
            // Объемные индикаторы - средний вес
            'Volume_SMA': 0.9,
            'OBV': 1.0,
            'VWAP': 1.1,
            
            // Волатильность - средний вес
            'ATR': 1.0,
            'Volatility': 1.0
        };
        
        return weights[indicatorName] || 1.0;
    }

    /**
     * Оценка вклада фичи в предсказание
     * @private
     */
    _estimateContribution(featureValue, normalizedValue, prediction) {
        // Простая оценка: чем больше отклонение от среднего, тем больше вклад
        const deviation = Math.abs(normalizedValue - 0.5);
        return deviation * Math.abs(prediction - 0.5);
    }

    /**
     * Получение объяснения для фичи
     * @private
     */
    _getFeatureExplanation(featureName, value) {
        if (isNaN(value) || !isFinite(value)) {
            return 'Значение недоступно';
        }

        const explanations = {
            'RSI': () => {
                if (value > 70) return `RSI ${value.toFixed(2)} - Перекупленность, возможна коррекция вниз`;
                if (value < 30) return `RSI ${value.toFixed(2)} - Перепроданность, возможен отскок вверх`;
                if (value > 50) return `RSI ${value.toFixed(2)} - Бычий импульс, поддержка роста`;
                return `RSI ${value.toFixed(2)} - Медвежий импульс, давление на снижение`;
            },
            'MACD': () => {
                if (value > 0) return `MACD ${value.toFixed(4)} - Бычий сигнал, восходящий тренд`;
                return `MACD ${value.toFixed(4)} - Медвежий сигнал, нисходящий тренд`;
            },
            'MACD_Histogram': () => {
                if (value > 0) return `MACD Histogram ${value.toFixed(4)} - Усиление бычьего импульса`;
                return `MACD Histogram ${value.toFixed(4)} - Усиление медвежьего импульса`;
            },
            'BB_Position': () => {
                if (value > 0.8) return `Цена в верхней части Bollinger Bands (${(value * 100).toFixed(1)}%) - Возможна перекупленность`;
                if (value < 0.2) return `Цена в нижней части Bollinger Bands (${(value * 100).toFixed(1)}%) - Возможна перепроданность`;
                return `Цена в средней части Bollinger Bands (${(value * 100).toFixed(1)}%) - Нейтральная зона`;
            },
            'Stochastic': () => {
                if (value > 80) return `Stochastic ${value.toFixed(2)} - Сильная перекупленность`;
                if (value < 20) return `Stochastic ${value.toFixed(2)} - Сильная перепроданность`;
                return `Stochastic ${value.toFixed(2)} - Нейтральная зона`;
            },
            'Volatility': () => {
                if (value > 0.03) return `Высокая волатильность ${(value * 100).toFixed(2)}% - Повышенный риск`;
                if (value < 0.01) return `Низкая волатильность ${(value * 100).toFixed(2)}% - Стабильный рынок`;
                return `Средняя волатильность ${(value * 100).toFixed(2)}%`;
            }
        };

        const explainer = explanations[featureName];
        if (explainer) {
            return explainer();
        }

        // Общее объяснение для остальных индикаторов
        return `${featureName}: ${value.toFixed(4)}`;
    }

    // ============================================================================
    // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
    // ============================================================================

    /**
     * Расчет SMA
     * Обновлено в Фазе 2, задача 2.3: обработка edge cases
     */
    calculateSMA(data, period) {
        if (!Array.isArray(data) || data.length === 0) return 0;
        if (data.length < period) {
            const lastValue = data[data.length - 1];
            return DataQualityService.cleanValue(lastValue, 0);
        }
        
        const slice = data.slice(-period);
        const sum = slice.reduce((sum, value) => {
            const cleanVal = DataQualityService.cleanValue(value, 0);
            return sum + cleanVal;
        }, 0);
        
        return DataQualityService.safeDivide(sum, period, 0);
    }

    /**
     * Расчет EMA
     */
    calculateEMA(data, period) {
        if (data.length === 0) return 0;
        if (data.length === 1) return data[0];
        
        const multiplier = 2 / (period + 1);
        let ema = data[0];
        
        for (let i = 1; i < data.length; i++) {
            ema = (data[i] * multiplier) + (ema * (1 - multiplier));
        }
        
        return ema;
    }

    /**
     * Расчет RSI
     * Обновлено в Фазе 2, задача 2.3: обработка edge cases
     */
    calculateRSI(prices, period = 14) {
        if (!Array.isArray(prices) || prices.length < period + 1) return 0.5;
        
        let gains = 0;
        let losses = 0;
        
        for (let i = 1; i <= period; i++) {
            const prevPrice = DataQualityService.cleanValue(prices[i - 1], 0);
            const currPrice = DataQualityService.cleanValue(prices[i], 0);
            const change = currPrice - prevPrice;
            
            if (change > 0) gains += change;
            else losses -= change;
        }
        
        const avgGain = DataQualityService.safeDivide(gains, period, 0);
        const avgLoss = DataQualityService.safeDivide(losses, period, 0);
        
        if (avgLoss === 0) return 1;
        
        const rs = DataQualityService.safeDivide(avgGain, avgLoss, 0);
        const rsi = 1 - DataQualityService.safeDivide(1, 1 + rs, 0.5);
        
        return DataQualityService.cleanValue(rsi, 0.5);
    }

    /**
     * Расчет Stochastic
     */
    calculateStochastic(highs, lows, closes, period = 14) {
        if (highs.length < period || lows.length < period || closes.length < period) return 0.5;
        
        const currentClose = closes[closes.length - 1];
        const highestHigh = Math.max(...highs.slice(-period));
        const lowestLow = Math.min(...lows.slice(-period));
        
        if (highestHigh === lowestLow) return 0.5;
        
        return (currentClose - lowestLow) / (highestHigh - lowestLow);
    }

    /**
     * Расчет Williams %R
     */
    calculateWilliamsR(highs, lows, closes, period = 14) {
        if (highs.length < period || lows.length < period || closes.length < period) return -0.5;
        
        const currentClose = closes[closes.length - 1];
        const highestHigh = Math.max(...highs.slice(-period));
        const lowestLow = Math.min(...lows.slice(-period));
        
        if (highestHigh === lowestLow) return -0.5;
        
        return (highestHigh - currentClose) / (highestHigh - lowestLow) - 1;
    }

    /**
     * Расчет MACD
     */
    calculateMACD(prices) {
        if (prices.length < 26) return { macd: 0, signal: 0, histogram: 0 };
        
        const ema12 = this.calculateEMA(prices, 12);
        const ema26 = this.calculateEMA(prices, 26);
        const macd = ema12 - ema26;
        
        // Для сигнальной линии нужна история MACD, упрощаем
        const signal = macd * 0.9; // Упрощенная сигнальная линия
        const histogram = macd - signal;
        
        return { macd, signal, histogram };
    }

    /**
     * Расчет Bollinger Bands
     * Обновлено в Фазе 2, задача 2.3: обработка edge cases
     */
    calculateBollingerBands(prices, period = 20) {
        if (!Array.isArray(prices) || prices.length < period) {
            return { upper: 0, middle: 0, lower: 0, width: 0, position: 0.5 };
        }
        
        const sma = this.calculateSMA(prices, period);
        const cleanSMA = DataQualityService.cleanValue(sma, 0);
        
        const slice = prices.slice(-period);
        const variance = slice.reduce((sum, price) => {
            const cleanPrice = DataQualityService.cleanValue(price, cleanSMA);
            return sum + Math.pow(cleanPrice - cleanSMA, 2);
        }, 0) / period;
        
        const stdDev = Math.sqrt(DataQualityService.cleanValue(variance, 0));
        
        const upper = cleanSMA + 2 * stdDev;
        const lower = cleanSMA - 2 * stdDev;
        const width = DataQualityService.safeDivide(upper - lower, cleanSMA, 0);
        const currentPrice = DataQualityService.cleanValue(prices[prices.length - 1], cleanSMA);
        const position = DataQualityService.safeDivide(
            currentPrice - lower,
            upper - lower,
            0.5
        );
        
        return {
            upper: DataQualityService.cleanValue(upper, 0),
            middle: cleanSMA,
            lower: DataQualityService.cleanValue(lower, 0),
            width: DataQualityService.cleanValue(width, 0),
            position: DataQualityService.cleanValue(position, 0.5)
        };
    }

    /**
     * Расчет OBV
     */
    calculateOBV(prices, volumes) {
        if (prices.length !== volumes.length || prices.length < 2) return 0;
        
        let obv = 0;
        for (let i = 1; i < prices.length; i++) {
            if (prices[i] > prices[i - 1]) {
                obv += volumes[i];
            } else if (prices[i] < prices[i - 1]) {
                obv -= volumes[i];
            }
        }
        
        return obv;
    }

    /**
     * Расчет VWAP
     */
    calculateVWAP(highs, lows, volumes) {
        if (highs.length !== volumes.length || highs.length === 0) return 0;
        
        let totalVolume = 0;
        let totalValue = 0;
        
        for (let i = 0; i < highs.length; i++) {
            const typicalPrice = (highs[i] + lows[i]) / 2;
            totalValue += typicalPrice * volumes[i];
            totalVolume += volumes[i];
        }
        
        return totalVolume > 0 ? totalValue / totalVolume : 0;
    }

    /**
     * Расчет ATR
     */
    calculateATR(highs, lows, closes, period = 14) {
        if (highs.length < period || lows.length < period || closes.length < period) return 0;
        
        let atr = 0;
        for (let i = 1; i < period; i++) {
            const tr = Math.max(
                highs[i] - lows[i],
                Math.abs(highs[i] - closes[i - 1]),
                Math.abs(lows[i] - closes[i - 1])
            );
            atr += tr;
        }
        
        return atr / (period - 1);
    }

    /**
     * Расчет волатильности
     * Обновлено в Фазе 2, задача 2.3: обработка edge cases
     */
    calculateVolatility(prices, period = 20) {
        if (!Array.isArray(prices) || prices.length < period) return 0;
        
        const returns = [];
        for (let i = 1; i < period; i++) {
            const prevPrice = DataQualityService.cleanValue(prices[i - 1], 0);
            const currPrice = DataQualityService.cleanValue(prices[i], 0);
            const ret = DataQualityService.safeDivide(currPrice - prevPrice, prevPrice, 0);
            if (isFinite(ret)) {
                returns.push(ret);
            }
        }
        
        if (returns.length === 0) return 0;
        
        const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
        const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
        
        return DataQualityService.cleanValue(Math.sqrt(variance), 0);
    }

    /**
     * Фаза 4, задача 4.1.1: Расчет Ichimoku Cloud
     * 
     * @param {Array<number>} highs - Массив максимальных цен
     * @param {Array<number>} lows - Массив минимальных цен
     * @param {Array<number>} closes - Массив цен закрытия
     * @returns {Object} Компоненты Ichimoku Cloud
     */
    calculateIchimokuCloud(highs, lows, closes) {
        try {
            if (!Array.isArray(highs) || !Array.isArray(lows) || !Array.isArray(closes)) {
                return this._getDefaultIchimoku();
            }
            
            if (highs.length < 52 || lows.length < 52 || closes.length < 52) {
                return this._getDefaultIchimoku();
            }

            const tenkanPeriod = 9;
            const kijunPeriod = 26;
            const senkouBPeriod = 52;
            const chikouOffset = 26;

            // Tenkan-sen (Conversion Line): (highest high + lowest low) / 2 за 9 периодов
            const tenkanHighs = highs.slice(-tenkanPeriod);
            const tenkanLows = lows.slice(-tenkanPeriod);
            const tenkan = (Math.max(...tenkanHighs) + Math.min(...tenkanLows)) / 2;

            // Kijun-sen (Base Line): (highest high + lowest low) / 2 за 26 периодов
            const kijunHighs = highs.slice(-kijunPeriod);
            const kijunLows = lows.slice(-kijunPeriod);
            const kijun = (Math.max(...kijunHighs) + Math.min(...kijunLows)) / 2;

            // Senkou Span A (Leading Span A): (Tenkan + Kijun) / 2, сдвинуто на 26 периодов вперед
            const senkouA = (tenkan + kijun) / 2;

            // Senkou Span B (Leading Span B): (highest high + lowest low) / 2 за 52 периода, сдвинуто на 26 периодов вперед
            const senkouBHighs = highs.slice(-senkouBPeriod);
            const senkouBLows = lows.slice(-senkouBPeriod);
            const senkouB = (Math.max(...senkouBHighs) + Math.min(...senkouBLows)) / 2;

            // Chikou Span (Lagging Span): цена закрытия, сдвинутая на 26 периодов назад
            const chikou = closes.length >= chikouOffset ? closes[closes.length - chikouOffset] : closes[closes.length - 1];

            // Облако (Kumo): область между Senkou Span A и B
            const cloudTop = Math.max(senkouA, senkouB);
            const cloudBottom = Math.min(senkouA, senkouB);
            const cloudColor = senkouA > senkouB ? 'bullish' : 'bearish';
            const cloudThickness = cloudTop - cloudBottom;

            // Текущая цена относительно облака
            const currentPrice = closes[closes.length - 1];
            let signal = 'hold';
            
            if (currentPrice > cloudTop) {
                signal = 'buy'; // Цена выше облака - бычий сигнал
            } else if (currentPrice < cloudBottom) {
                signal = 'sell'; // Цена ниже облака - медвежий сигнал
            } else {
                // Цена внутри облака
                if (cloudColor === 'bullish' && currentPrice > senkouA) {
                    signal = 'buy';
                } else if (cloudColor === 'bearish' && currentPrice < senkouA) {
                    signal = 'sell';
                }
            }

            // Дополнительные сигналы: пересечение линий
            if (tenkan > kijun && closes[closes.length - 2] <= closes[closes.length - 1]) {
                signal = 'buy'; // Tenkan пересекает Kijun снизу вверх
            } else if (tenkan < kijun && closes[closes.length - 2] >= closes[closes.length - 1]) {
                signal = 'sell'; // Tenkan пересекает Kijun сверху вниз
            }

            return {
                tenkan: DataQualityService.cleanValue(tenkan, 0),
                kijun: DataQualityService.cleanValue(kijun, 0),
                senkouA: DataQualityService.cleanValue(senkouA, 0),
                senkouB: DataQualityService.cleanValue(senkouB, 0),
                chikou: DataQualityService.cleanValue(chikou, 0),
                cloudTop: DataQualityService.cleanValue(cloudTop, 0),
                cloudBottom: DataQualityService.cleanValue(cloudBottom, 0),
                cloudThickness: DataQualityService.cleanValue(cloudThickness, 0),
                cloudColor: cloudColor,
                signal: signal
            };
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error calculating Ichimoku Cloud', {
                    service: 'OptimizedAnalysisService',
                    operation: 'calculateIchimokuCloud',
                    error: { message: error.message }
                });
            }
            return this._getDefaultIchimoku();
        }
    }

    /**
     * Значения по умолчанию для Ichimoku Cloud
     * @private
     */
    _getDefaultIchimoku() {
        return {
            tenkan: 0,
            kijun: 0,
            senkouA: 0,
            senkouB: 0,
            chikou: 0,
            cloudTop: 0,
            cloudBottom: 0,
            cloudThickness: 0,
            cloudColor: 'neutral',
            signal: 'hold'
        };
    }

    /**
     * Фаза 4, задача 4.1.2: Расчет Fibonacci Retracements
     * 
     * @param {Array<number>} highs - Массив максимальных цен
     * @param {Array<number>} lows - Массив минимальных цен
     * @param {Array<number>} closes - Массив цен закрытия
     * @param {number} lookbackPeriod - Период для поиска экстремумов (по умолчанию 20)
     * @returns {Object} Уровни Fibonacci и текущая позиция
     */
    calculateFibonacciRetracements(highs, lows, closes, lookbackPeriod = 20) {
        try {
            if (!Array.isArray(highs) || !Array.isArray(lows) || !Array.isArray(closes)) {
                return this._getDefaultFibonacci();
            }

            if (highs.length < lookbackPeriod || lows.length < lookbackPeriod) {
                return this._getDefaultFibonacci();
            }

            // Находим локальные максимумы и минимумы за период
            const periodHighs = highs.slice(-lookbackPeriod);
            const periodLows = lows.slice(-lookbackPeriod);
            
            const highestHigh = Math.max(...periodHighs);
            const lowestLow = Math.min(...periodLows);
            const range = highestHigh - lowestLow;

            if (range === 0) {
                return this._getDefaultFibonacci();
            }

            // Стандартные уровни Fibonacci
            const fibLevels = {
                0: highestHigh,
                23.6: highestHigh - (range * 0.236),
                38.2: highestHigh - (range * 0.382),
                50: highestHigh - (range * 0.5),
                61.8: highestHigh - (range * 0.618),
                78.6: highestHigh - (range * 0.786),
                100: lowestLow
            };

            // Определяем текущую позицию цены относительно уровней
            const currentPrice = closes[closes.length - 1];
            let currentLevel = null;
            let support = null;
            let resistance = null;

            const sortedLevels = Object.entries(fibLevels)
                .map(([level, price]) => ({ level: parseFloat(level), price }))
                .sort((a, b) => b.price - a.price);

            // Находим ближайшие уровни поддержки и сопротивления
            for (let i = 0; i < sortedLevels.length; i++) {
                const level = sortedLevels[i];
                
                if (currentPrice >= level.price) {
                    currentLevel = level.level;
                    resistance = level.price;
                    support = i < sortedLevels.length - 1 ? sortedLevels[i + 1].price : lowestLow;
                    break;
                }
            }

            // Если цена ниже всех уровней
            if (currentLevel === null) {
                currentLevel = 100;
                support = lowestLow;
                resistance = sortedLevels[sortedLevels.length - 1].price;
            }

            return {
                levels: fibLevels,
                currentLevel: currentLevel,
                currentPrice: currentPrice,
                support: DataQualityService.cleanValue(support, 0),
                resistance: DataQualityService.cleanValue(resistance, 0),
                highestHigh: highestHigh,
                lowestLow: lowestLow,
                range: range
            };
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error calculating Fibonacci Retracements', {
                    service: 'OptimizedAnalysisService',
                    operation: 'calculateFibonacciRetracements',
                    error: { message: error.message }
                });
            }
            return this._getDefaultFibonacci();
        }
    }

    /**
     * Значения по умолчанию для Fibonacci Retracements
     * @private
     */
    _getDefaultFibonacci() {
        return {
            levels: {},
            currentLevel: null,
            currentPrice: 0,
            support: 0,
            resistance: 0,
            highestHigh: 0,
            lowestLow: 0,
            range: 0
        };
    }

    /**
     * Фаза 4, задача 4.1.3: Расчет Market Profile
     * 
     * @param {Array<number>} highs - Массив максимальных цен
     * @param {Array<number>} lows - Массив минимальных цен
     * @param {Array<number>} closes - Массив цен закрытия
     * @param {Array<number>} volumes - Массив объемов
     * @param {number} priceLevels - Количество ценовых уровней (по умолчанию 30)
     * @returns {Object} Market Profile данные
     */
    calculateMarketProfile(highs, lows, closes, volumes, priceLevels = 30) {
        try {
            if (!Array.isArray(highs) || !Array.isArray(lows) || !Array.isArray(volumes)) {
                return this._getDefaultMarketProfile();
            }

            // Market Profile требует объемы, поэтому если volumes пустой или все значения 0, возвращаем значения по умолчанию
            if (highs.length === 0 || volumes.length === 0 || volumes.every(v => !v || v === 0)) {
                return this._getDefaultMarketProfile();
            }

            // Определяем диапазон цен
            const highestHigh = Math.max(...highs);
            const lowestLow = Math.min(...lows);
            const priceRange = highestHigh - lowestLow;

            if (priceRange === 0) {
                return this._getDefaultMarketProfile();
            }

            // Создаем ценовые уровни (buckets)
            const levelSize = priceRange / priceLevels;
            const profile = new Map(); // priceLevel -> { volume, tpoCount }

            // Распределяем объем по ценовым уровням
            for (let i = 0; i < highs.length; i++) {
                const high = highs[i];
                const low = lows[i];
                const volume = volumes[i] || 0;
                const typicalPrice = (high + low + closes[i]) / 3;

                // Определяем, к какому уровню относится типичная цена
                const levelIndex = Math.floor((typicalPrice - lowestLow) / levelSize);
                const levelPrice = lowestLow + (levelIndex * levelSize);

                if (!profile.has(levelPrice)) {
                    profile.set(levelPrice, { volume: 0, tpoCount: 0 });
                }

                const levelData = profile.get(levelPrice);
                levelData.volume += volume;
                levelData.tpoCount += 1; // Упрощенный TPO (Time Price Opportunity)
            }

            // Находим POC (Point of Control) - уровень с максимальным объемом
            let poc = lowestLow;
            let maxVolume = 0;
            for (const [price, data] of profile.entries()) {
                if (data.volume > maxVolume) {
                    maxVolume = data.volume;
                    poc = price;
                }
            }

            // Вычисляем Value Area (VA) - 70% объема
            const sortedProfile = Array.from(profile.entries())
                .sort((a, b) => b[1].volume - a[1].volume);

            const totalVolume = Array.from(profile.values())
                .reduce((sum, data) => sum + data.volume, 0);

            const valueAreaVolume = totalVolume * 0.7;
            let accumulatedVolume = 0;
            let valueAreaHigh = poc;
            let valueAreaLow = poc;

            for (const [price, data] of sortedProfile) {
                accumulatedVolume += data.volume;
                if (price > valueAreaHigh) valueAreaHigh = price;
                if (price < valueAreaLow) valueAreaLow = price;
                if (accumulatedVolume >= valueAreaVolume) {
                    break;
                }
            }

            // Определяем тип профиля рынка
            const currentPrice = closes[closes.length - 1];
            const pricePosition = (currentPrice - lowestLow) / priceRange;
            
            let profileType = 'normal';
            if (pricePosition > 0.7 || pricePosition < 0.3) {
                profileType = 'trend'; // Трендовый день
            } else if (valueAreaHigh - valueAreaLow < priceRange * 0.2) {
                profileType = 'non_trend'; // Неактивный день
            }

            // Определяем баланс рынка
            const upperVolume = Array.from(profile.entries())
                .filter(([price]) => price > poc)
                .reduce((sum, [, data]) => sum + data.volume, 0);
            
            const lowerVolume = Array.from(profile.entries())
                .filter(([price]) => price < poc)
                .reduce((sum, [, data]) => sum + data.volume, 0);

            const balance = Math.abs(upperVolume - lowerVolume) / totalVolume < 0.2 ? 'balanced' : 'imbalanced';

            return {
                poc: DataQualityService.cleanValue(poc, 0),
                valueAreaHigh: DataQualityService.cleanValue(valueAreaHigh, 0),
                valueAreaLow: DataQualityService.cleanValue(valueAreaLow, 0),
                valueAreaRange: DataQualityService.cleanValue(valueAreaHigh - valueAreaLow, 0),
                profileType: profileType,
                balance: balance,
                totalVolume: totalVolume,
                currentPrice: currentPrice,
                highestHigh: highestHigh,
                lowestLow: lowestLow
            };
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error calculating Market Profile', {
                    service: 'OptimizedAnalysisService',
                    operation: 'calculateMarketProfile',
                    error: { message: error.message }
                });
            }
            return this._getDefaultMarketProfile();
        }
    }

    /**
     * Значения по умолчанию для Market Profile
     * @private
     */
    _getDefaultMarketProfile() {
        return {
            poc: 0,
            valueAreaHigh: 0,
            valueAreaLow: 0,
            valueAreaRange: 0,
            profileType: 'normal',
            balance: 'balanced',
            totalVolume: 0,
            currentPrice: 0,
            highestHigh: 0,
            lowestLow: 0
        };
    }

    /**
     * Расчет точности
     */
    calculateAccuracy(predictions, actuals) {
        if (predictions.length !== actuals.length) return 0;
        
        const correct = predictions.reduce((count, pred, i) => {
            return count + (Math.round(pred) === actuals[i] ? 1 : 0);
        }, 0);
        
        return correct / predictions.length;
    }

    /**
     * Расчет precision
     */
    calculatePrecision(predictions, actuals) {
        const confusionMatrix = this.calculateConfusionMatrix(predictions, actuals);
        const tp = confusionMatrix.truePositive;
        const fp = confusionMatrix.falsePositive;
        
        return tp + fp > 0 ? tp / (tp + fp) : 0;
    }

    /**
     * Расчет recall
     */
    calculateRecall(predictions, actuals) {
        const confusionMatrix = this.calculateConfusionMatrix(predictions, actuals);
        const tp = confusionMatrix.truePositive;
        const fn = confusionMatrix.falseNegative;
        
        return tp + fn > 0 ? tp / (tp + fn) : 0;
    }

    /**
     * Расчет F1 Score
     */
    calculateF1Score(precision, recall) {
        return precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;
    }

    /**
     * Расчет Confusion Matrix
     */
    calculateConfusionMatrix(predictions, actuals) {
        let tp = 0, tn = 0, fp = 0, fn = 0;
        
        for (let i = 0; i < predictions.length; i++) {
            const pred = Math.round(predictions[i]);
            const actual = actuals[i];
            
            if (pred === 1 && actual === 1) tp++;
            else if (pred === 0 && actual === 0) tn++;
            else if (pred === 1 && actual === 0) fp++;
            else if (pred === 0 && actual === 1) fn++;
        }
        
        return { truePositive: tp, trueNegative: tn, falsePositive: fp, falseNegative: fn };
    }

    /**
     * Расчет финансовых метрик
     */
    calculateFinancialMetrics(trades) {
        try {
            const returns = trades.map(trade => trade.return || 0);
            const totalReturn = returns.reduce((sum, ret) => sum + ret, 0);
            const winRate = trades.filter(trade => trade.return > 0).length / trades.length;
            const avgWin = returns.filter(ret => ret > 0).reduce((sum, ret) => sum + ret, 0) / (returns.filter(ret => ret > 0).length || 1);
            const avgLoss = returns.filter(ret => ret < 0).reduce((sum, ret) => sum + ret, 0) / (returns.filter(ret => ret < 0).length || 1);
            
            return {
                totalReturn,
                winRate,
                avgWin,
                avgLoss,
                profitFactor: Math.abs(avgWin / avgLoss) || 0,
                sharpeRatio: this.calculateSharpeRatio(returns),
                maxDrawdown: this.calculateMaxDrawdown(returns)
            };
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error calculating financial metrics', {
                    service: 'OptimizedAnalysisService',
                    operation: 'calculateFinancialMetrics',
                    error: { message: error.message, stack: error.stack }
                });
            }
            return {};
        }
    }

    /**
     * Расчет Sharpe Ratio
     */
    calculateSharpeRatio(returns) {
        if (returns.length === 0) return 0;
        
        const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
        const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
        const stdDev = Math.sqrt(variance);
        
        return stdDev > 0 ? mean / stdDev : 0;
    }

    /**
     * Расчет максимальной просадки
     */
    calculateMaxDrawdown(returns) {
        let maxDrawdown = 0;
        let peak = 0;
        let runningSum = 0;
        
        for (const ret of returns) {
            runningSum += ret;
            if (runningSum > peak) peak = runningSum;
            const drawdown = peak - runningSum;
            if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        }
        
        return maxDrawdown;
    }

    /**
     * Расчет ROC AUC
     */
    calculateROCAUC(predictions, actuals) {
        // Упрощенный расчет ROC AUC
        const sorted = predictions.map((pred, i) => ({ pred, actual: actuals[i] }))
            .sort((a, b) => b.pred - a.pred);
        
        let auc = 0;
        let truePositives = 0;
        let falsePositives = 0;
        const totalPositives = actuals.filter(a => a === 1).length;
        const totalNegatives = actuals.filter(a => a === 0).length;
        
        for (const item of sorted) {
            if (item.actual === 1) {
                truePositives++;
            } else {
                falsePositives++;
                auc += truePositives;
            }
        }
        
        return totalPositives > 0 && totalNegatives > 0 ? auc / (totalPositives * totalNegatives) : 0.5;
    }

    /**
     * Расчет калибровки
     */
    calculateCalibration(predictions, actuals) {
        // Упрощенный расчет калибровки
        const bins = 10;
        const binSize = 1.0 / bins;
        let calibration = 0;
        
        for (let i = 0; i < bins; i++) {
            const binStart = i * binSize;
            const binEnd = (i + 1) * binSize;
            
            const binPredictions = predictions.filter(p => p >= binStart && p < binEnd);
            const binActuals = binPredictions.map((_, idx) => actuals[predictions.indexOf(binPredictions[idx])]);
            
            if (binPredictions.length > 0) {
                const avgPrediction = binPredictions.reduce((sum, p) => sum + p, 0) / binPredictions.length;
                const avgActual = binActuals.reduce((sum, a) => sum + a, 0) / binActuals.length;
                calibration += Math.abs(avgPrediction - avgActual);
            }
        }
        
        return 1 - (calibration / bins);
    }

    /**
     * Генерация детального объяснения с конкретными значениями и порогами
     * Фаза 3, задача 3.2.3: Улучшить generateReasoning()
     * 
     * @param {Array} features - Массив фичей (индикаторов)
     * @param {number} prediction - Предсказание модели (0-1)
     * @param {Object} indicators - Объект с индикаторами (опционально, для детальных объяснений)
     * @returns {Object} Детальное объяснение с разбивкой по факторам
     */
    generateReasoning(features, prediction, indicators = null) {
        const confidence = Math.abs(prediction - 0.5) * 2;
        const direction = prediction > 0.5 ? 'BUY' : 'SELL';
        
        // Базовое объяснение
        let baseExplanation = '';
        if (confidence > 0.8) {
            baseExplanation = direction === 'BUY' ? 
                'Высокая уверенность в росте цены' : 
                'Высокая уверенность в падении цены';
        } else if (confidence > 0.6) {
            baseExplanation = direction === 'BUY' ? 
                'Умеренная уверенность в росте цены' : 
                'Умеренная уверенность в падении цены';
        } else {
            baseExplanation = 'Низкая уверенность в прогнозе';
        }

        // Если индикаторы предоставлены, добавляем детальные объяснения
        const detailedFactors = [];
        if (indicators && typeof indicators === 'object') {
            // Объяснение RSI
            if (indicators.rsi !== undefined && !isNaN(indicators.rsi)) {
                const rsiExplanation = this._explainRSI(indicators.rsi, direction);
                if (rsiExplanation) {
                    detailedFactors.push({
                        indicator: 'RSI',
                        value: indicators.rsi,
                        explanation: rsiExplanation,
                        impact: this._getRSIImpact(indicators.rsi, direction)
                    });
                }
            }

            // Объяснение MACD
            if (indicators.macd !== undefined && !isNaN(indicators.macd)) {
                const macdExplanation = this._explainMACD(indicators.macd, indicators.macd_signal, indicators.macd_histogram, direction);
                if (macdExplanation) {
                    detailedFactors.push({
                        indicator: 'MACD',
                        value: indicators.macd,
                        signal: indicators.macd_signal,
                        histogram: indicators.macd_histogram,
                        explanation: macdExplanation,
                        impact: this._getMACDImpact(indicators.macd, indicators.macd_signal, direction)
                    });
                }
            }

            // Объяснение Bollinger Bands
            if (indicators.bb_position !== undefined && !isNaN(indicators.bb_position)) {
                const bbExplanation = this._explainBollingerBands(indicators.bb_position, indicators.bb_width, direction);
                if (bbExplanation) {
                    detailedFactors.push({
                        indicator: 'Bollinger Bands',
                        position: indicators.bb_position,
                        width: indicators.bb_width,
                        explanation: bbExplanation,
                        impact: this._getBBImpact(indicators.bb_position, direction)
                    });
                }
            }

            // Объяснение трендовых индикаторов
            if (indicators.sma_20 !== undefined && indicators.sma_50 !== undefined) {
                const trendExplanation = this._explainTrend(indicators.sma_20, indicators.sma_50, direction);
                if (trendExplanation) {
                    detailedFactors.push({
                        indicator: 'Trend',
                        sma20: indicators.sma_20,
                        sma50: indicators.sma_50,
                        explanation: trendExplanation,
                        impact: this._getTrendImpact(indicators.sma_20, indicators.sma_50, direction)
                    });
                }
            }

            // Объяснение объема
            if (indicators.volume_sma !== undefined) {
                const volumeExplanation = this._explainVolume(indicators.volume_sma, direction);
                if (volumeExplanation) {
                    detailedFactors.push({
                        indicator: 'Volume',
                        value: indicators.volume_sma,
                        explanation: volumeExplanation,
                        impact: 'medium'
                    });
                }
            }
        }

        // Формируем итоговое объяснение
        const reasoning = {
            base: baseExplanation,
            confidence: Math.round(confidence * 100),
            direction: direction,
            prediction: prediction,
            factors: detailedFactors,
            summary: this._generateSummary(detailedFactors, direction, confidence)
        };

        return reasoning;
    }

    /**
     * Объяснение RSI
     * Фаза 3, задача 3.2.2: Детальные объяснения рекомендаций
     * @private
     */
    _explainRSI(rsi, direction) {
        if (isNaN(rsi) || !isFinite(rsi)) return null;

        if (rsi > 70) {
            return direction === 'SELL' ? 
                `RSI ${rsi.toFixed(2)} превышает порог перекупленности (70) - подтверждает сигнал на продажу` :
                `RSI ${rsi.toFixed(2)} в зоне перекупленности (70+) - противоречит сигналу на покупку`;
        } else if (rsi < 30) {
            return direction === 'BUY' ? 
                `RSI ${rsi.toFixed(2)} ниже порога перепроданности (30) - подтверждает сигнал на покупку` :
                `RSI ${rsi.toFixed(2)} в зоне перепроданности (30-) - противоречит сигналу на продажу`;
        } else if (rsi > 50) {
            return direction === 'BUY' ? 
                `RSI ${rsi.toFixed(2)} выше нейтральной линии (50) - поддерживает бычий тренд` :
                `RSI ${rsi.toFixed(2)} выше нейтральной линии (50) - ослабляет медвежий сигнал`;
        } else {
            return direction === 'SELL' ? 
                `RSI ${rsi.toFixed(2)} ниже нейтральной линии (50) - поддерживает медвежий тренд` :
                `RSI ${rsi.toFixed(2)} ниже нейтральной линии (50) - ослабляет бычий сигнал`;
        }
    }

    /**
     * Объяснение MACD
     * Фаза 3, задача 3.2.2: Детальные объяснения рекомендаций
     * @private
     */
    _explainMACD(macd, signal, histogram, direction) {
        if (isNaN(macd) || !isFinite(macd)) return null;

        const parts = [];
        
        // Основной MACD
        if (macd > 0 && signal !== undefined && macd > signal) {
            parts.push(direction === 'BUY' ? 
                `MACD ${macd.toFixed(4)} выше сигнальной линии (${signal?.toFixed(4) || 'N/A'}) - бычий сигнал` :
                `MACD ${macd.toFixed(4)} выше сигнальной линии - противоречит медвежьему сигналу`);
        } else if (macd < 0 && signal !== undefined && macd < signal) {
            parts.push(direction === 'SELL' ? 
                `MACD ${macd.toFixed(4)} ниже сигнальной линии (${signal?.toFixed(4) || 'N/A'}) - медвежий сигнал` :
                `MACD ${macd.toFixed(4)} ниже сигнальной линии - противоречит бычьему сигналу`);
        }

        // Histogram
        if (histogram !== undefined && !isNaN(histogram)) {
            if (histogram > 0) {
                parts.push(direction === 'BUY' ? 
                    `MACD Histogram ${histogram.toFixed(4)} положительный - усиление бычьего импульса` :
                    `MACD Histogram ${histogram.toFixed(4)} положительный - ослабление медвежьего импульса`);
            } else {
                parts.push(direction === 'SELL' ? 
                    `MACD Histogram ${histogram.toFixed(4)} отрицательный - усиление медвежьего импульса` :
                    `MACD Histogram ${histogram.toFixed(4)} отрицательный - ослабление бычьего импульса`);
            }
        }

        return parts.length > 0 ? parts.join('. ') : null;
    }

    /**
     * Объяснение Bollinger Bands
     * Фаза 3, задача 3.2.2: Детальные объяснения рекомендаций
     * @private
     */
    _explainBollingerBands(position, width, direction) {
        if (isNaN(position) || !isFinite(position)) return null;

        const positionPercent = (position * 100).toFixed(1);
        
        if (position > 0.8) {
            return direction === 'SELL' ? 
                `Цена в верхней части Bollinger Bands (${positionPercent}%) - зона перекупленности, подтверждает продажу` :
                `Цена в верхней части Bollinger Bands (${positionPercent}%) - зона перекупленности, противоречит покупке`;
        } else if (position < 0.2) {
            return direction === 'BUY' ? 
                `Цена в нижней части Bollinger Bands (${positionPercent}%) - зона перепроданности, подтверждает покупку` :
                `Цена в нижней части Bollinger Bands (${positionPercent}%) - зона перепроданности, противоречит продаже`;
        } else {
            const widthInfo = width !== undefined && !isNaN(width) ? 
                `, ширина ${width.toFixed(4)}` : '';
            return `Цена в средней части Bollinger Bands (${positionPercent}%)${widthInfo} - нейтральная зона`;
        }
    }

    /**
     * Объяснение тренда
     * @private
     */
    _explainTrend(sma20, sma50, direction) {
        if (isNaN(sma20) || isNaN(sma50) || !isFinite(sma20) || !isFinite(sma50)) return null;

        if (sma20 > sma50) {
            return direction === 'BUY' ? 
                `SMA(20) ${sma20.toFixed(2)} выше SMA(50) ${sma50.toFixed(2)} - восходящий тренд, подтверждает покупку` :
                `SMA(20) ${sma20.toFixed(2)} выше SMA(50) ${sma50.toFixed(2)} - восходящий тренд, противоречит продаже`;
        } else if (sma20 < sma50) {
            return direction === 'SELL' ? 
                `SMA(20) ${sma20.toFixed(2)} ниже SMA(50) ${sma50.toFixed(2)} - нисходящий тренд, подтверждает продажу` :
                `SMA(20) ${sma20.toFixed(2)} ниже SMA(50) ${sma50.toFixed(2)} - нисходящий тренд, противоречит покупке`;
        } else {
            return 'Тренд нейтральный - SMA(20) и SMA(50) близки';
        }
    }

    /**
     * Объяснение объема
     * @private
     */
    _explainVolume(volumeSMA, direction) {
        if (isNaN(volumeSMA) || !isFinite(volumeSMA)) return null;

        // Предполагаем, что высокий объем подтверждает сигнал
        return `Объем торгов: ${volumeSMA.toFixed(0)} - ${volumeSMA > 1000000 ? 'высокий объем подтверждает сигнал' : 'низкий объем ослабляет сигнал'}`;
    }

    /**
     * Получение влияния RSI на решение
     * @private
     */
    _getRSIImpact(rsi, direction) {
        if (rsi > 70 && direction === 'SELL') return 'high';
        if (rsi < 30 && direction === 'BUY') return 'high';
        if (rsi > 70 && direction === 'BUY') return 'negative';
        if (rsi < 30 && direction === 'SELL') return 'negative';
        return 'medium';
    }

    /**
     * Получение влияния MACD на решение
     * @private
     */
    _getMACDImpact(macd, signal, direction) {
        if (signal === undefined || isNaN(signal)) return 'medium';
        
        if (macd > signal && direction === 'BUY') return 'high';
        if (macd < signal && direction === 'SELL') return 'high';
        if (macd > signal && direction === 'SELL') return 'negative';
        if (macd < signal && direction === 'BUY') return 'negative';
        return 'medium';
    }

    /**
     * Получение влияния Bollinger Bands на решение
     * @private
     */
    _getBBImpact(position, direction) {
        if (position > 0.8 && direction === 'SELL') return 'high';
        if (position < 0.2 && direction === 'BUY') return 'high';
        if (position > 0.8 && direction === 'BUY') return 'negative';
        if (position < 0.2 && direction === 'SELL') return 'negative';
        return 'medium';
    }

    /**
     * Получение влияния тренда на решение
     * @private
     */
    _getTrendImpact(sma20, sma50, direction) {
        if (sma20 > sma50 && direction === 'BUY') return 'high';
        if (sma20 < sma50 && direction === 'SELL') return 'high';
        if (sma20 > sma50 && direction === 'SELL') return 'negative';
        if (sma20 < sma50 && direction === 'BUY') return 'negative';
        return 'medium';
    }

    /**
     * Генерация итогового резюме
     * @private
     */
    _generateSummary(factors, direction, confidence) {
        if (factors.length === 0) {
            return `Прогноз: ${direction === 'BUY' ? 'покупка' : 'продажа'} с уверенностью ${Math.round(confidence * 100)}%`;
        }

        const confirming = factors.filter(f => f.impact === 'high').length;
        const contradicting = factors.filter(f => f.impact === 'negative').length;
        const neutral = factors.filter(f => f.impact === 'medium').length;

        const parts = [];
        parts.push(`Прогноз: ${direction === 'BUY' ? 'покупка' : 'продажа'} с уверенностью ${Math.round(confidence * 100)}%`);
        
        if (confirming > 0) {
            parts.push(`${confirming} индикатор${confirming > 1 ? 'ов' : ''} подтверждают сигнал`);
        }
        if (contradicting > 0) {
            parts.push(`${contradicting} индикатор${contradicting > 1 ? 'ов' : ''} противоречат сигналу`);
        }
        if (neutral > 0) {
            parts.push(`${neutral} индикатор${neutral > 1 ? 'ов' : ''} нейтральны`);
        }

        return parts.join('. ');
    }

    /**
     * Получение имени фичи
     */
    getFeatureName(index) {
        const names = [
            'SMA_5', 'SMA_10', 'SMA_20', 'SMA_50',
            'EMA_12', 'EMA_26', 'RSI', 'Stochastic',
            'Williams_R', 'MACD', 'MACD_Signal', 'MACD_Histogram',
            'BB_Upper', 'BB_Middle', 'BB_Lower', 'BB_Width', 'BB_Position',
            'Volume_SMA', 'OBV', 'VWAP', 'ATR', 'Volatility'
        ];
        
        return names[index] || `Feature_${index}`;
    }

    // ============================================================================
    // АНАЛИЗ ПРОИЗВОДИТЕЛЬНОСТИ ПО ПЕРИОДАМ
    // ============================================================================

    /**
     * Анализ производительности по периодам (дни недели, месяцы)
     * @param {string} period - Период анализа ('daily', 'weekly', 'monthly')
     * @param {Date} startDate - Начальная дата (опционально)
     * @param {Date} endDate - Конечная дата (опционально)
     * @returns {Object} Результаты анализа по периодам
     */
    async analyzePeriodPerformance(period = 'daily', startDate = null, endDate = null) {
        try {
            // Получаем сделки из TradingEngine
            const trades = TradingEngine.virtualPortfolio?.trades || [];
            
            if (trades.length === 0) {
                return {
                    success: false,
                    message: 'Нет данных о сделках для анализа',
                    byDayOfWeek: null,
                    byMonth: null,
                    bestDay: null,
                    worstDay: null,
                    bestMonth: null,
                    worstMonth: null,
                    summary: null
                };
            }

            // Фильтруем сделки по датам, если указаны
            let filteredTrades = trades;
            if (startDate || endDate) {
                // Нормализуем даты для сравнения (только дата, без времени)
                const normalizedStartDate = startDate ? new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()) : null;
                const normalizedEndDate = endDate ? new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59, 999) : null;
                
                filteredTrades = trades.filter(trade => {
                    const tradeDate = trade.timestamp ? new Date(trade.timestamp) : 
                                   trade.date ? new Date(trade.date) : null;
                    
                    if (!tradeDate || isNaN(tradeDate.getTime())) {
                        return false;
                    }

                    // Нормализуем дату сделки для сравнения
                    const normalizedTradeDate = new Date(tradeDate.getFullYear(), tradeDate.getMonth(), tradeDate.getDate());

                    if (normalizedStartDate && normalizedTradeDate < normalizedStartDate) {
                        return false;
                    }
                    if (normalizedEndDate && normalizedTradeDate > normalizedEndDate) {
                        return false;
                    }
                    return true;
                });
            }

            // Если указаны даты и нет сделок в периоде, возвращаем ошибку
            // Но если даты не указаны, используем все сделки
            if ((startDate || endDate) && filteredTrades.length === 0) {
                return {
                    success: false,
                    message: 'Нет сделок в указанном периоде',
                    byDayOfWeek: null,
                    byMonth: null,
                    bestDay: null,
                    worstDay: null,
                    bestMonth: null,
                    worstMonth: null,
                    summary: null
                };
            }
            
            // Если нет сделок вообще, возвращаем ошибку
            if (filteredTrades.length === 0) {
                return {
                    success: false,
                    message: 'Нет данных о сделках для анализа',
                    byDayOfWeek: null,
                    byMonth: null,
                    bestDay: null,
                    worstDay: null,
                    bestMonth: null,
                    worstMonth: null,
                    summary: null
                };
            }

            // Получаем статистику из ProfitabilityTracker для фильтрации по периоду
            let stats = [];
            try {
                const periodStartDate = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
                const periodEndDate = endDate || new Date();
                
                // Пытаемся получить статистику за период
                if (period === 'daily') {
                    stats = ProfitabilityTracker.getDailyStatsForPeriod(periodStartDate, periodEndDate);
                } else if (period === 'weekly') {
                    stats = ProfitabilityTracker.getWeeklyStatsForPeriod(periodStartDate, periodEndDate);
                } else if (period === 'monthly') {
                    stats = ProfitabilityTracker.getMonthlyStatsForPeriod(periodStartDate, periodEndDate);
                }
            } catch (error) {
                if (LoggerService.isInitialized) {
                    LoggerService.error('Failed to get statistics from ProfitabilityTracker', {
                        service: 'OptimizedAnalysisService',
                        operation: 'analyzePerformance',
                        error: { message: error.message, stack: error.stack }
                    });
                }
                // Продолжаем без статистики
            }

            // Фильтруем сделки по периоду статистики, если статистика доступна
            let periodTrades = filteredTrades;
            if (stats && stats.length > 0) {
                periodTrades = ProfitabilityTracker.filterTradesByPeriod(filteredTrades, period, stats);
            }

            // Анализ по дням недели
            const dayOfWeekAnalysis = analyzeByDayOfWeek(periodTrades);
            
            // Анализ по месяцам
            const monthAnalysisRaw = analyzeByMonth(periodTrades);
            
            // Преобразуем объект месяцев в массив для удобства работы
            const monthAnalysis = this.formatMonthResults(monthAnalysisRaw);

            // Определяем лучший и худший день недели (используем уже вычисленные значения)
            const bestDay = dayOfWeekAnalysis.bestDay ? {
                period: dayOfWeekAnalysis.bestDay.day,
                profit: dayOfWeekAnalysis.bestDay.profit,
                trades: dayOfWeekAnalysis[dayOfWeekAnalysis.bestDay.day]?.trades || 0,
                winRate: dayOfWeekAnalysis[dayOfWeekAnalysis.bestDay.day]?.winRate || 0,
                avgProfit: dayOfWeekAnalysis[dayOfWeekAnalysis.bestDay.day]?.avgProfit || 0
            } : null;
            
            const worstDay = dayOfWeekAnalysis.worstDay ? {
                period: dayOfWeekAnalysis.worstDay.day,
                profit: dayOfWeekAnalysis.worstDay.profit,
                trades: dayOfWeekAnalysis[dayOfWeekAnalysis.worstDay.day]?.trades || 0,
                winRate: dayOfWeekAnalysis[dayOfWeekAnalysis.worstDay.day]?.winRate || 0,
                avgProfit: dayOfWeekAnalysis[dayOfWeekAnalysis.worstDay.day]?.avgProfit || 0
            } : null;

            // Определяем лучший и худший месяц (месяцы - это массив)
            const bestMonth = this.findBestPeriod(monthAnalysis, 'month');
            const worstMonth = this.findWorstPeriod(monthAnalysis, 'month');

            // Формируем сводку
            const summary = this.generatePeriodSummary(periodTrades, dayOfWeekAnalysis, monthAnalysis);

            const result = {
                success: true,
                period: period,
                totalTrades: periodTrades.length,
                byDayOfWeek: this.formatDayOfWeekResults(dayOfWeekAnalysis),
                byMonth: monthAnalysis,
                bestDay: bestDay,
                worstDay: worstDay,
                bestMonth: bestMonth,
                worstMonth: worstMonth,
                summary: summary
            };
            
            // Добавляем даты только если они были переданы
            if (startDate) {
                result.startDate = startDate;
            }
            if (endDate) {
                result.endDate = endDate;
            }
            
            return result;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error analyzing performance by periods', {
                    service: 'OptimizedAnalysisService',
                    operation: 'analyzePerformanceByPeriods',
                    error: { message: error.message, stack: error.stack }
                });
            }
            return {
                success: false,
                message: `Ошибка анализа: ${error.message}`,
                byDayOfWeek: null,
                byMonth: null,
                bestDay: null,
                worstDay: null,
                bestMonth: null,
                worstMonth: null,
                summary: null
            };
        }
    }

    /**
     * Поиск лучшего периода (для массивов, например месяцев)
     */
    findBestPeriod(analysis, type) {
        if (!analysis || !Array.isArray(analysis) || analysis.length === 0) return null;

        let best = null;
        let bestProfit = -Infinity;

        for (const item of analysis) {
            const profit = item.totalProfit || 0;
            const trades = item.totalTrades || 0;
            if (profit > bestProfit && trades > 0) {
                bestProfit = profit;
                best = {
                    period: `${item.month} ${item.year}`,
                    profit: profit,
                    trades: trades,
                    winRate: item.winRate || 0,
                    avgProfit: trades > 0 ? profit / trades : 0
                };
            }
        }

        return best;
    }

    /**
     * Поиск худшего периода (для массивов, например месяцев)
     */
    findWorstPeriod(analysis, type) {
        if (!analysis || !Array.isArray(analysis) || analysis.length === 0) return null;

        let worst = null;
        let worstProfit = Infinity;

        for (const item of analysis) {
            const profit = item.totalProfit || 0;
            const trades = item.totalTrades || 0;
            if (profit < worstProfit && trades > 0) {
                worstProfit = profit;
                worst = {
                    period: `${item.month} ${item.year}`,
                    profit: profit,
                    trades: trades,
                    winRate: item.winRate || 0,
                    avgProfit: trades > 0 ? profit / trades : 0
                };
            }
        }

        return worst;
    }

    /**
     * Форматирование результатов по месяцам (преобразование объекта в массив)
     */
    formatMonthResults(monthAnalysisRaw) {
        if (!monthAnalysisRaw || typeof monthAnalysisRaw !== 'object') {
            return [];
        }

        // Если это уже массив, возвращаем как есть
        if (Array.isArray(monthAnalysisRaw)) {
            return monthAnalysisRaw;
        }

        // Преобразуем объект в массив
        const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                           'july', 'august', 'september', 'october', 'november', 'december'];
        const monthNamesRu = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
                             'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
        
        const result = [];
        
        // Собираем все месяцы с данными
        const monthsWithData = new Map();
        
        for (const [monthName, monthData] of Object.entries(monthAnalysisRaw)) {
            if (monthNames.includes(monthName) && monthData && typeof monthData === 'object') {
                const monthIndex = monthNames.indexOf(monthName);
                const year = new Date().getFullYear(); // Можно улучшить, определяя год из сделок
                
                monthsWithData.set(`${year}-${monthIndex.toString().padStart(2, '0')}`, {
                    year: year,
                    month: monthNamesRu[monthIndex],
                    monthIndex: monthIndex,
                    totalProfit: monthData.profit || 0,
                    totalTrades: monthData.trades || 0,
                    winTrades: monthData.profitableTrades || 0,
                    winRate: monthData.winRate || 0,
                    avgProfit: monthData.avgProfit || 0
                });
            }
        }
        
        // Сортируем по году и месяцу
        const sortedKeys = Array.from(monthsWithData.keys()).sort();
        for (const key of sortedKeys) {
            result.push(monthsWithData.get(key));
        }
        
        return result;
    }

    // ============================================================================
    // БАТЧИНГ И ПАРАЛЛЕЛИЗАЦИЯ (Фаза 3, задача 3.1.1)
    // ============================================================================

    /**
     * Батчинг анализа инструментов - обработка нескольких инструментов одновременно
     * Фаза 3, задача 3.1.1: Батчинг анализа инструментов
     * 
     * @param {Array<string>} figis - Массив FIGI инструментов для анализа
     * @param {Object} options - Опции анализа
     * @param {string} options.interval - Интервал свечей ('DAY', 'HOUR', etc.)
     * @param {number} options.period - Период в днях
     * @param {number} options.batchSize - Размер батча для параллельной обработки
     * @returns {Promise<Array>} Массив результатов анализа для каждого инструмента
     */
    async analyzeInstrumentsBatch(figis, options = {}) {
        try {
            const {
                interval = 'DAY',
                period = 30,
                batchSize = this.cacheSettings.batchSize
            } = options;

            if (!Array.isArray(figis) || figis.length === 0) {
                return [];
            }

            const results = [];
            const errors = [];

            // Обрабатываем инструменты батчами
            for (let i = 0; i < figis.length; i += batchSize) {
                const batch = figis.slice(i, i + batchSize);
                
                // Параллельная обработка батча
                const batchPromises = batch.map(async (figi) => {
                    try {
                        // Получаем свечи для инструмента
                        const candles = await CacheService.getCandles(figi, interval, period, true);
                        
                        if (!candles || candles.length === 0) {
                            return {
                                figi,
                                success: false,
                                error: 'No candles available',
                                indicators: {}
                            };
                        }

                        // Извлекаем данные из свечей
                        const prices = candles.map(c => c.close);
                        const volumes = candles.map(c => c.volume || 0);
                        const highs = candles.map(c => c.high);
                        const lows = candles.map(c => c.low);

                        // Рассчитываем индикаторы с кешированием
                        const indicators = this.getAllIndicators(
                            prices, volumes, highs, lows, 
                            figi, interval, period
                        );

                        return {
                            figi,
                            success: true,
                            indicators,
                            candlesCount: candles.length
                        };
                    } catch (error) {
                        if (LoggerService.isInitialized) {
                            LoggerService.error('Error analyzing instrument in batch', {
                                service: 'OptimizedAnalysisService',
                                operation: 'analyzeInstrumentsBatch',
                                figi,
                                error: { message: error.message }
                            });
                        }
                        return {
                            figi,
                            success: false,
                            error: error.message,
                            indicators: {}
                        };
                    }
                });

                // Ждем завершения батча
                const batchResults = await Promise.all(batchPromises);
                results.push(...batchResults);

                // Небольшая задержка между батчами для снижения нагрузки
                if (i + batchSize < figis.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            return results;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error in batch analysis', {
                    service: 'OptimizedAnalysisService',
                    operation: 'analyzeInstrumentsBatch',
                    error: { message: error.message, stack: error.stack }
                });
            }
            throw error;
        }
    }

    /**
     * Оптимизированное получение индикаторов для инструмента с кешированием
     * Фаза 3, задача 3.1.2: кеширование результатов анализа
     * Фаза 3, задача 3.1.3: переиспользование индикаторов
     * 
     * @param {string} figi - FIGI инструмента
     * @param {string} interval - Интервал свечей
     * @param {number} period - Период в днях
     * @returns {Promise<Object>} Индикаторы для инструмента
     */
    async getIndicatorsForInstrument(figi, interval = 'DAY', period = 30) {
        try {
            // Проверяем кеш
            const cacheKey = this._getIndicatorsCacheKey(figi, interval, period);
            const cached = this.indicatorsCache.get(cacheKey);
            
            if (this._isIndicatorsCacheValid(cached)) {
                return cached.indicators;
            }

            // Получаем свечи
            const candles = await CacheService.getCandles(figi, interval, period, true);
            
            if (!candles || candles.length === 0) {
                return {};
            }

            // Извлекаем данные
            const prices = candles.map(c => c.close);
            const volumes = candles.map(c => c.volume || 0);
            const highs = candles.map(c => c.high);
            const lows = candles.map(c => c.low);

            // Рассчитываем индикаторы (с автоматическим кешированием)
            const indicators = this.getAllIndicators(
                prices, volumes, highs, lows,
                figi, interval, period
            );

            return indicators;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error getting indicators for instrument', {
                    service: 'OptimizedAnalysisService',
                    operation: 'getIndicatorsForInstrument',
                    figi,
                    error: { message: error.message }
                });
            }
            return {};
        }
    }

    /**
     * Батчинг запросов к БД для получения свечей
     * Фаза 3, задача 3.1.3: оптимизация запросов к БД
     * 
     * @param {Array<string>} figis - Массив FIGI инструментов
     * @param {string} interval - Интервал свечей
     * @param {number} period - Период в днях
     * @returns {Promise<Map>} Map: figi -> candles[]
     */
    async getCandlesBatch(figis, interval = 'DAY', period = 30) {
        try {
            const CachedCandle = (await import('../models/CachedCandle.js')).default;
            const { Op } = await import('sequelize');
            
            const fromDate = new Date();
            fromDate.setDate(fromDate.getDate() - period);
            
            // Оптимизированный запрос: получаем все свечи одним запросом
            const candles = await CachedCandle.findAll({
                where: {
                    figi: { [Op.in]: figis },
                    interval: interval,
                    time: { [Op.gte]: fromDate }
                },
                order: [['figi', 'ASC'], ['time', 'ASC']]
            });

            // Группируем по FIGI
            const candlesByFigi = new Map();
            for (const candle of candles) {
                if (!candlesByFigi.has(candle.figi)) {
                    candlesByFigi.set(candle.figi, []);
                }
                candlesByFigi.get(candle.figi).push(candle);
            }

            // Сортируем свечи по времени для каждого инструмента
            for (const [figi, figiCandles] of candlesByFigi.entries()) {
                figiCandles.sort((a, b) => new Date(a.time) - new Date(b.time));
            }

            return candlesByFigi;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error in batch candles retrieval', {
                    service: 'OptimizedAnalysisService',
                    operation: 'getCandlesBatch',
                    error: { message: error.message, stack: error.stack }
                });
            }
            // Fallback: получаем свечи по одному
            const candlesByFigi = new Map();
            for (const figi of figis) {
                try {
                    const candles = await CacheService.getCandles(figi, interval, period, true);
                    candlesByFigi.set(figi, candles || []);
                } catch (err) {
                    candlesByFigi.set(figi, []);
                }
            }
            return candlesByFigi;
        }
    }

    /**
     * Форматирование результатов по дням недели
     */
    formatDayOfWeekResults(dayOfWeekAnalysis) {
        if (!dayOfWeekAnalysis || typeof dayOfWeekAnalysis !== 'object') {
            return null;
        }

        // Если это массив (старая версия), преобразуем в объект
        if (Array.isArray(dayOfWeekAnalysis)) {
            const result = {};
            const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            dayOfWeekAnalysis.forEach((item, index) => {
                if (index < dayNames.length) {
                    result[dayNames[index]] = {
                        profit: item.totalProfit || item.profit || 0,
                        trades: item.totalTrades || item.trades || 0,
                        winRate: item.winRate || 0,
                        avgProfit: item.avgProfit || 0
                    };
                }
            });
            return result;
        }

        // Если это объект (новая версия), удаляем bestDay и worstDay, оставляем только дни
        const result = {};
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        for (const dayName of dayNames) {
            if (dayOfWeekAnalysis[dayName]) {
                result[dayName] = {
                    profit: dayOfWeekAnalysis[dayName].profit || 0,
                    trades: dayOfWeekAnalysis[dayName].trades || 0,
                    winRate: dayOfWeekAnalysis[dayName].winRate || 0,
                    avgProfit: dayOfWeekAnalysis[dayName].avgProfit || 0
                };
            }
        }
        return result;
    }

    /**
     * Генерация сводки по периодам
     */
    generatePeriodSummary(trades, dayOfWeekAnalysis, monthAnalysis) {
        const totalProfit = trades.reduce((sum, trade) => sum + (trade.pnl || trade.profit || 0), 0);
        const totalTrades = trades.length;
        const profitableTrades = trades.filter(t => (t.pnl || t.profit || 0) > 0).length;
        const winRate = totalTrades > 0 ? (profitableTrades / totalTrades) * 100 : 0;
        const avgProfit = totalTrades > 0 ? totalProfit / totalTrades : 0;

        // Статистика по дням недели
        let dayStats = null;
        if (dayOfWeekAnalysis) {
            const formatted = this.formatDayOfWeekResults(dayOfWeekAnalysis);
            if (formatted && typeof formatted === 'object' && !Array.isArray(formatted)) {
                const days = Object.values(formatted);
                const totalDayTrades = days.reduce((sum, d) => sum + (d.trades || 0), 0);
                const totalDayProfit = days.reduce((sum, d) => sum + (d.profit || 0), 0);
                
                // Находим самый активный и самый прибыльный день
                let mostActiveDay = null;
                let mostProfitableDay = null;
                let maxTrades = 0;
                let maxProfit = -Infinity;
                
                for (const [dayName, dayData] of Object.entries(formatted)) {
                    if (dayData.trades > maxTrades) {
                        maxTrades = dayData.trades;
                        mostActiveDay = { day: dayName, ...dayData };
                    }
                    if (dayData.profit > maxProfit) {
                        maxProfit = dayData.profit;
                        mostProfitableDay = { day: dayName, ...dayData };
                    }
                }
                
                dayStats = {
                    totalTrades: totalDayTrades,
                    totalProfit: totalDayProfit,
                    avgProfitPerDay: totalDayTrades > 0 ? totalDayProfit / totalDayTrades : 0,
                    mostActiveDay: mostActiveDay,
                    mostProfitableDay: mostProfitableDay
                };
            }
        }

        // Статистика по месяцам
        let monthStats = null;
        if (monthAnalysis && monthAnalysis.length > 0) {
            const totalMonthTrades = monthAnalysis.reduce((sum, m) => sum + m.totalTrades, 0);
            const totalMonthProfit = monthAnalysis.reduce((sum, m) => sum + m.totalProfit, 0);
            monthStats = {
                totalTrades: totalMonthTrades,
                totalProfit: totalMonthProfit,
                avgProfitPerMonth: monthAnalysis.length > 0 ? totalMonthProfit / monthAnalysis.length : 0,
                mostActiveMonth: monthAnalysis.reduce((best, m) => m.totalTrades > (best?.totalTrades || 0) ? m : best, null),
                mostProfitableMonth: monthAnalysis.reduce((best, m) => m.totalProfit > (best?.totalProfit || -Infinity) ? m : best, null)
            };
        }

        return {
            totalProfit: totalProfit,
            totalTrades: totalTrades,
            profitableTrades: profitableTrades,
            winRate: winRate,
            avgProfit: avgProfit,
            dayOfWeek: dayStats,
            month: monthStats
        };
    }

    /**
     * Получение статуса сервиса
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            indicatorsCache: this.indicatorsCache.size,
            evaluationCache: this.evaluationCache.size
        };
    }
}

export default new OptimizedAnalysisService();
