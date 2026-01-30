import * as tf from '@tensorflow/tfjs';
import OptimizedAnalysisService from './OptimizedAnalysisService.js';
import CacheService from './CacheService.js';
import LoggerService from './LoggerService.js';

/**
 * Фаза 4, задача 4.2: ML для Entry Optimization
 * 
 * Сервис для оптимизации точек входа в позиции с использованием машинного обучения.
 * Предсказывает оптимальное время входа, размер ордера и тип ордера.
 */
class EntryOptimizationService {
    constructor() {
        this.isInitialized = false;
        this.model = null;
        this.modelPath = './models/entry_optimization_model.json';
        this.isTraining = false;
        this.featureCache = new Map(); // Кеш для features
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        try {
            if (this.isInitialized) return;

            // Загружаем модель, если она существует
            await this.loadModel();

            this.isInitialized = true;

            if (LoggerService.isInitialized) {
                LoggerService.info('EntryOptimizationService initialized', {
                    service: 'EntryOptimizationService'
                });
            }
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Failed to initialize EntryOptimizationService', {
                    service: 'EntryOptimizationService',
                    error: { message: error.message, stack: error.stack }
                });
            }
            throw error;
        }
    }

    /**
     * Фаза 4, задача 4.2.1: ML-модель для предсказания оптимального времени входа
     * 
     * @param {string} figi - FIGI инструмента
     * @param {Object} options - Опции для предсказания
     * @returns {Promise<Object>} Предсказание оптимального времени входа
     */
    async predictOptimalEntryTime(figi, options = {}) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            const {
                lookbackPeriod = 30,
                predictionHorizon = 60 // минут
            } = options;

            // Получаем features
            const features = await this.prepareFeatures(figi, lookbackPeriod);

            if (!features || features.length === 0) {
                return {
                    success: false,
                    probability: 0,
                    optimalTime: null,
                    confidence: 0,
                    reason: 'Insufficient data for prediction'
                };
            }

            // Если модель не обучена, используем эвристический подход
            if (!this.model) {
                return this.heuristicEntryPrediction(features);
            }

            // Предсказание через ML-модель
            const tensorFeatures = tf.tensor2d([features]);
            const prediction = this.model.predict(tensorFeatures);
            const probability = (await prediction.data())[0];
            
            tensorFeatures.dispose();
            prediction.dispose();

            // Интерпретация результата
            const optimalTime = this.interpretPrediction(probability, features);
            const confidence = Math.abs(probability - 0.5) * 2; // 0-1, где 1 = максимальная уверенность

            return {
                success: true,
                probability: probability,
                optimalTime: optimalTime,
                confidence: confidence,
                predictionHorizon: predictionHorizon,
                features: {
                    rsi: features[0],
                    macd: features[1],
                    volatility: features[2],
                    volume: features[3]
                }
            };
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error predicting optimal entry time', {
                    service: 'EntryOptimizationService',
                    operation: 'predictOptimalEntryTime',
                    figi,
                    error: { message: error.message }
                });
            }
            return {
                success: false,
                probability: 0.5,
                optimalTime: null,
                confidence: 0,
                reason: error.message
            };
        }
    }

    /**
     * Подготовка features для ML-модели
     * @private
     */
    async prepareFeatures(figi, lookbackPeriod = 30) {
        try {
            // Получаем свечи
            const candles = await CacheService.getCandles(figi, 'DAY', lookbackPeriod);
            if (!candles || candles.length === 0 || candles.length < 10) {
                // Очищаем кеш для этого инструмента, если данных недостаточно
                const cacheKey = `${figi}_${lookbackPeriod}`;
                this.featureCache.delete(cacheKey);
                return null;
            }

            // Проверяем кеш только после проверки наличия данных
            const cacheKey = `${figi}_${lookbackPeriod}`;
            const cached = this.featureCache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp) < 5 * 60 * 1000) { // 5 минут TTL
                return cached.features;
            }

            // Получаем индикаторы
            const prices = candles.map(c => c.close);
            const volumes = candles.map(c => c.volume || 0);
            const highs = candles.map(c => c.high);
            const lows = candles.map(c => c.low);

            const indicators = OptimizedAnalysisService.getAllIndicators(
                prices, volumes, highs, lows, figi, 'DAY', lookbackPeriod
            );

            // Получаем текущую цену и spread
            const currentPrice = prices[prices.length - 1];
            const spread = await this.getCurrentSpread(figi);

            // Получаем волатильность
            const volatility = indicators.volatility || this.calculateVolatility(prices);

            // Время суток и день недели
            const now = new Date();
            const hour = now.getHours();
            const dayOfWeek = now.getDay();
            const isMarketHours = hour >= 10 && hour < 19; // Московское время торгов

            // Нормализуем features
            const features = [
                this.normalizeValue(indicators.rsi || 50, 0, 100), // RSI
                this.normalizeValue(indicators.macd || 0, -1, 1), // MACD
                this.normalizeValue(volatility, 0, 0.5), // Волатильность
                this.normalizeValue(volumes[volumes.length - 1] || 0, 0, 1000000), // Объем
                this.normalizeValue(spread, 0, 0.1), // Spread
                hour / 24, // Время суток (0-1)
                dayOfWeek / 7, // День недели (0-1)
                isMarketHours ? 1 : 0, // Торговые часы
                this.normalizeValue(indicators.bb_position || 0.5, 0, 1), // Позиция в Bollinger Bands
                this.normalizeValue(indicators.atr || 0, 0, currentPrice * 0.1) // ATR
            ];

            // Сохраняем в кеш
            this.featureCache.set(cacheKey, {
                features,
                timestamp: Date.now()
            });

            // Очищаем старый кеш
            if (this.featureCache.size > 100) {
                this._cleanupFeatureCache();
            }

            return features;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error preparing features', {
                    service: 'EntryOptimizationService',
                    figi,
                    error: { message: error.message }
                });
            }
            return null;
        }
    }

    /**
     * Фаза 4, задача 4.2.2: Динамический расчет размера лимитного ордера на основе ликвидности
     * 
     * @param {string} figi - FIGI инструмента
     * @param {number} baseQuantity - Базовое количество
     * @param {Object} options - Опции расчета
     * @returns {Promise<Object>} Оптимальный размер ордера
     */
    async calculateOptimalOrderSize(figi, baseQuantity, options = {}) {
        try {
            const {
                maxSizePercent = 0.05, // 5% от среднего объема
                lookbackPeriod = 20,
                volatilityAdjustment = true,
                timeOfDayAdjustment = true
            } = options;

            // Получаем исторические данные объема
            const candles = await CacheService.getCandles(figi, 'DAY', lookbackPeriod);
            if (!candles || candles.length === 0) {
                return {
                    optimalSize: baseQuantity,
                    adjustments: {},
                    reason: 'No historical data'
                };
            }

            const volumes = candles.map(c => c.volume || 0).filter(v => v > 0);
            if (volumes.length === 0) {
                return {
                    optimalSize: baseQuantity,
                    adjustments: {},
                    reason: 'No volume data'
                };
            }

            // Средний объем за период
            const avgVolume = volumes.reduce((sum, v) => sum + v, 0) / volumes.length;
            const maxSize = avgVolume * maxSizePercent;

            // Получаем волатильность
            const prices = candles.map(c => c.close);
            const volatility = this.calculateVolatility(prices);
            
            // Адаптация к волатильности
            let volatilityMultiplier = 1.0;
            if (volatilityAdjustment) {
                if (volatility > 0.15) {
                    volatilityMultiplier = 0.7; // Уменьшаем размер при высокой волатильности
                } else if (volatility < 0.05) {
                    volatilityMultiplier = 1.2; // Увеличиваем при низкой волатильности
                }
            }

            // Адаптация к времени суток
            let timeMultiplier = 1.0;
            if (timeOfDayAdjustment) {
                const now = new Date();
                const hour = now.getHours();
                
                // Периоды низкой ликвидности (начало и конец дня)
                if (hour < 11 || hour >= 18) {
                    timeMultiplier = 0.8; // Уменьшаем размер в периоды низкой ликвидности
                } else if (hour >= 12 && hour < 15) {
                    timeMultiplier = 1.1; // Увеличиваем в период высокой активности
                }
            }

            // Финальный размер ордера
            // Сначала применяем multipliers к maxSize, затем ограничиваем baseQuantity
            const adjustedMaxSize = maxSize * volatilityMultiplier * timeMultiplier;
            const optimalSize = Math.min(
                baseQuantity,
                adjustedMaxSize
            );

            return {
                optimalSize: Math.max(1, Math.floor(optimalSize)), // Минимум 1 лот
                baseQuantity: baseQuantity,
                maxSize: maxSize,
                avgVolume: avgVolume,
                adjustments: {
                    volatility: volatilityMultiplier,
                    timeOfDay: timeMultiplier,
                    combined: volatilityMultiplier * timeMultiplier
                },
                volatility: volatility,
                reason: 'Calculated based on liquidity and volatility'
            };
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error calculating optimal order size', {
                    service: 'EntryOptimizationService',
                    figi,
                    error: { message: error.message }
                });
            }
            return {
                optimalSize: baseQuantity,
                adjustments: {},
                reason: error.message
            };
        }
    }

    /**
     * Фаза 4, задача 4.2.3: Учет spread'а при выборе типа ордера
     * 
     * @param {string} figi - FIGI инструмента
     * @param {Object} signal - Торговый сигнал
     * @param {Object} options - Опции выбора
     * @returns {Promise<Object>} Рекомендация по типу ордера
     */
    async recommendOrderType(figi, signal, options = {}) {
        try {
            const {
                urgency = false, // Срочность операции
                lookbackPeriod = 30
            } = options;

            // Получаем текущий spread
            // Если ошибка при получении текущего spread, она будет обработана в основном catch блоке
            const currentSpread = await this.getCurrentSpread(figi);
            
            // Получаем исторический spread
            let historicalSpread;
            try {
                historicalSpread = await this.getHistoricalSpread(figi, lookbackPeriod);
            } catch (spreadError) {
                // Если ошибка при получении исторического spread, используем эвристику с низкой уверенностью
                return this.heuristicOrderType(currentSpread, urgency, signal, 0.5); // confidence: 0.5 для ошибок
            }
            
            if (historicalSpread.length === 0) {
                // Если нет исторических данных, используем эвристику с низкой уверенностью
                return this.heuristicOrderType(currentSpread, urgency, signal, 0.5);
            }

            // Рассчитываем процентили
            const sorted = historicalSpread.sort((a, b) => a - b);
            const p25 = sorted[Math.floor(sorted.length * 0.25)];
            const p50 = sorted[Math.floor(sorted.length * 0.5)];
            const p75 = sorted[Math.floor(sorted.length * 0.75)];

            // Определяем тип ордера на основе spread'а
            let orderType = 'LIMIT';
            let recommendedPrice = signal.price || 0;
            let confidence = 0.7;

            if (currentSpread <= p25) {
                // Низкий spread - можно использовать Market order
                if (urgency) {
                    orderType = 'MARKET';
                    confidence = 0.9;
                } else {
                    orderType = 'LIMIT';
                    // Устанавливаем цену немного лучше текущей
                    recommendedPrice = signal.action === 'BUY' 
                        ? signal.price * 0.9995  // На 0.05% ниже для покупки
                        : signal.price * 1.0005; // На 0.05% выше для продажи
                    confidence = 0.85;
                }
            } else if (currentSpread >= p75) {
                // Высокий spread - обязательно Limit order
                orderType = 'LIMIT';
                // Устанавливаем цену еще лучше
                recommendedPrice = signal.action === 'BUY'
                    ? signal.price * 0.998  // На 0.2% ниже для покупки
                    : signal.price * 1.002; // На 0.2% выше для продажи
                confidence = 0.95;
            } else {
                // Средний spread
                if (urgency) {
                    orderType = 'MARKET';
                    confidence = 0.75;
                } else {
                    orderType = 'LIMIT';
                    recommendedPrice = signal.action === 'BUY'
                        ? signal.price * 0.999  // На 0.1% ниже
                        : signal.price * 1.001; // На 0.1% выше
                    confidence = 0.8;
                }
            }

            // Для защиты от неблагоприятных движений используем Stop order
            if (signal.action === 'BUY' && currentSpread > p75) {
                // При высоком spread'е для покупки можно использовать Stop-Limit
                return {
                    orderType: 'STOP_LIMIT',
                    recommendedPrice: recommendedPrice,
                    stopPrice: signal.price * 0.995, // Stop на 0.5% ниже
                    limitPrice: recommendedPrice,
                    confidence: confidence,
                    spread: currentSpread,
                    spreadPercentile: 'high',
                    reasoning: 'High spread detected, using Stop-Limit for protection'
                };
            }

            return {
                orderType: orderType,
                recommendedPrice: recommendedPrice,
                confidence: confidence,
                spread: currentSpread,
                spreadPercentile: currentSpread <= p25 ? 'low' : 
                                 currentSpread >= p75 ? 'high' : 'medium',
                historicalSpread: {
                    p25: p25,
                    p50: p50,
                    p75: p75
                },
                reasoning: `Spread is ${currentSpread <= p25 ? 'low' : currentSpread >= p75 ? 'high' : 'medium'}, ${urgency ? 'urgent' : 'non-urgent'} order`
            };
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error recommending order type', {
                    service: 'EntryOptimizationService',
                    figi,
                    error: { message: error.message }
                });
            }
            return {
                orderType: 'LIMIT',
                recommendedPrice: (signal && signal.price) ? signal.price : 0,
                confidence: 0.5,
                reason: error.message
            };
        }
    }

    /**
     * Получение текущего spread'а для инструмента
     * @private
     */
    async getCurrentSpread(figi) {
        try {
            // Пытаемся получить из API (если доступен order book)
            // В противном случае используем эвристику на основе волатильности
            const candles = await CacheService.getCandles(figi, 'DAY', 5);
            if (candles && candles.length > 0) {
                const prices = candles.map(c => c.close);
                const volatility = this.calculateVolatility(prices);
                // Эвристика: spread примерно равен 0.1% от цены при нормальной волатильности
                const currentPrice = prices[prices.length - 1];
                return currentPrice * volatility * 0.1; // Примерный spread
            }
            return 0.001; // 0.1% по умолчанию
        } catch (error) {
            // При ошибке пробрасываем исключение, чтобы оно было обработано в recommendOrderType
            throw error;
        }
    }

    /**
     * Получение исторического spread'а
     * @private
     */
    async getHistoricalSpread(figi, period = 30) {
        try {
            // В реальной системе здесь был бы запрос к БД с историческими данными spread'а
            // Для упрощения используем эвристику на основе волатильности
            const candles = await CacheService.getCandles(figi, 'DAY', period);
            if (!candles || candles.length === 0) {
                return [];
            }

            const prices = candles.map(c => c.close);
            const spreads = [];

            // Рассчитываем "виртуальный" spread на основе волатильности
            for (let i = 1; i < prices.length; i++) {
                const priceChange = Math.abs(prices[i] - prices[i - 1]) / prices[i - 1];
                const spread = priceChange * 0.1; // Примерный spread
                spreads.push(spread);
            }

            return spreads;
        } catch (error) {
            // При ошибке пробрасываем исключение, чтобы оно было обработано в recommendOrderType
            throw error;
        }
    }

    /**
     * Эвристическое предсказание входа (fallback, если модель не обучена)
     * @private
     */
    heuristicEntryPrediction(features) {
        // Простая эвристика на основе индикаторов
        const [rsi, macd, volatility, volume] = features;
        
        let score = 0.5; // Нейтральный
        
        // RSI: oversold = хороший момент для входа
        if (rsi < 0.3) score += 0.2;
        else if (rsi > 0.7) score -= 0.2;
        
        // MACD: положительный = бычий сигнал
        if (macd > 0.1) score += 0.15;
        else if (macd < -0.1) score -= 0.15;
        
        // Низкая волатильность = более безопасный вход
        if (volatility < 0.1) score += 0.1;
        else if (volatility > 0.2) score -= 0.1;
        
        // Высокий объем = подтверждение
        if (volume > 0.7) score += 0.05;

        const probability = Math.max(0, Math.min(1, score));
        const confidence = Math.abs(probability - 0.5) * 2;

        return {
            success: true,
            probability: probability,
            optimalTime: probability > 0.6 ? 'now' : probability < 0.4 ? 'wait' : 'neutral',
            confidence: confidence,
            method: 'heuristic'
        };
    }

    /**
     * Эвристический выбор типа ордера (fallback)
     * @private
     */
    heuristicOrderType(spread, urgency, signal = null, defaultConfidence = 0.7) {
        const recommendedPrice = (signal && signal.price) ? signal.price : 0;
        
        if (urgency) {
            return {
                orderType: 'MARKET',
                recommendedPrice: recommendedPrice,
                confidence: defaultConfidence,
                reasoning: 'Urgent order, using Market'
            };
        }

        if (spread < 0.001) { // < 0.1%
            return {
                orderType: 'LIMIT',
                recommendedPrice: recommendedPrice,
                confidence: Math.max(defaultConfidence, 0.8),
                reasoning: 'Low spread, using Limit'
            };
        }

        return {
            orderType: 'LIMIT',
            recommendedPrice: recommendedPrice,
            confidence: defaultConfidence,
            reasoning: 'Default to Limit order'
        };
    }

    /**
     * Интерпретация предсказания модели
     * @private
     */
    interpretPrediction(probability, features) {
        if (probability > 0.7) {
            return 'now'; // Оптимальный момент для входа
        } else if (probability > 0.5) {
            return 'soon'; // Хороший момент в ближайшее время
        } else if (probability > 0.3) {
            return 'wait'; // Лучше подождать
        } else {
            return 'avoid'; // Избегать входа
        }
    }

    /**
     * Создание ML-модели (LSTM)
     * @private
     */
    createModel(inputShape) {
        console.log(`🧠 Создание модели оптимизации входа (EntryOptimizationService)...`);
        console.log(`   📊 Входной размер: ${inputShape}`);
        
        const model = tf.sequential({
            layers: [
                tf.layers.lstm({
                    units: 64,
                    returnSequences: true,
                    inputShape: inputShape
                }),
                tf.layers.dropout({ rate: 0.2 }),
                tf.layers.lstm({
                    units: 32,
                    returnSequences: false
                }),
                tf.layers.dropout({ rate: 0.2 }),
                tf.layers.dense({ units: 16, activation: 'relu' }),
                tf.layers.dense({ units: 1, activation: 'sigmoid' }) // Вероятность успешного входа
            ]
        });

        model.compile({
            optimizer: 'adam',
            loss: 'binaryCrossentropy',
            metrics: ['accuracy']
        });

        const totalParams = model.countParams();
        console.log(`   ✅ Модель оптимизации входа успешно создана: ${model.layers.length} слоев, ${totalParams.toLocaleString()} параметров`);
        console.log(`   📐 Архитектура: LSTM(64) -> LSTM(32) -> Dense(16) -> Dense(1)`);

        return model;
    }

    /**
     * Загрузка модели
     * @private
     */
    async loadModel() {
        try {
            // В реальной системе здесь была бы загрузка сохраненной модели
            // Для упрощения модель создается при первом обучении
            this.model = null;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.warn('Model not found, will train on first use', {
                    service: 'EntryOptimizationService'
                });
            }
            this.model = null;
        }
    }

    /**
     * Сохранение модели
     * @private
     */
    async saveModel() {
        try {
            if (this.model) {
                // В реальной системе здесь было бы сохранение модели
                // await this.model.save(`file://${this.modelPath}`);
            }
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error saving model', {
                    service: 'EntryOptimizationService',
                    error: { message: error.message }
                });
            }
        }
    }

    /**
     * Нормализация значения
     * @private
     */
    normalizeValue(value, min, max) {
        if (max === min) return 0.5;
        return Math.max(0, Math.min(1, (value - min) / (max - min)));
    }

    /**
     * Расчет волатильности
     * @private
     */
    calculateVolatility(prices) {
        if (prices.length < 2) return 0;
        
        const returns = [];
        for (let i = 1; i < prices.length; i++) {
            const ret = (prices[i] - prices[i - 1]) / prices[i - 1];
            returns.push(ret);
        }
        
        const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
        
        return Math.sqrt(variance);
    }

    /**
     * Очистка кеша features
     * @private
     */
    _cleanupFeatureCache() {
        const now = Date.now();
        const ttl = 10 * 60 * 1000; // 10 минут

        for (const [key, value] of this.featureCache.entries()) {
            if (now - value.timestamp > ttl) {
                this.featureCache.delete(key);
            }
        }
    }
}

export default new EntryOptimizationService();
