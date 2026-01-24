import OptimizedAnalysisService from './OptimizedAnalysisService.js';
import CacheService from './CacheService.js';
import LoggerService from './LoggerService.js';

/**
 * Фаза 4, задача 4.1.4: Мультитаймфреймовый анализ
 * 
 * Анализирует инструменты на разных таймфреймах (H1, D1, W1) одновременно
 * и определяет согласованность сигналов между таймфреймами.
 */
class MultiTimeframeService {
    constructor() {
        this.isInitialized = false;
        this.timeframeCache = new Map(); // Кеш для результатов анализа
        this.timeframeWeights = {
            'H1': 0.2,   // Час - наименьший вес
            'D1': 0.5,   // День - средний вес
            'W1': 0.3    // Неделя - высокий вес
        };
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        try {
            if (this.isInitialized) return;

            // Проверяем зависимости
            if (!OptimizedAnalysisService || !CacheService) {
                throw new Error('Required services not available');
            }

            // Инициализируем OptimizedAnalysisService, если еще не инициализирован
            if (!OptimizedAnalysisService.isInitialized) {
                await OptimizedAnalysisService.initialize();
            }

            this.isInitialized = true;

            if (LoggerService.isInitialized) {
                LoggerService.info('MultiTimeframeService initialized', {
                    service: 'MultiTimeframeService'
                });
            }
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Failed to initialize MultiTimeframeService', {
                    service: 'MultiTimeframeService',
                    error: { message: error.message, stack: error.stack }
                });
            }
            throw error;
        }
    }

    /**
     * Анализ инструмента на нескольких таймфреймах
     * 
     * @param {string} figi - FIGI инструмента
     * @param {Array<string>} timeframes - Массив таймфреймов ['H1', 'D1', 'W1']
     * @param {number} period - Период для каждого таймфрейма (по умолчанию 30)
     * @returns {Object} Результаты анализа по таймфреймам и согласованность
     */
    async analyzeMultiTimeframe(figi, timeframes = ['H1', 'D1', 'W1'], period = 30) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            // Проверяем кеш
            const cacheKey = `${figi}_${timeframes.join('_')}_${period}`;
            const cached = this.timeframeCache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp) < 5 * 60 * 1000) { // 5 минут TTL
                return cached.result;
            }

            const results = {};
            const indicatorsByTimeframe = {};

            // Параллельно получаем данные и индикаторы для каждого таймфрейма
            const promises = timeframes.map(async (timeframe) => {
                try {
                    // Получаем свечи для таймфрейма
                    const candles = await CacheService.getCandles(figi, timeframe, period);
                    
                    if (!candles || candles.length < 10) {
                        return { timeframe, error: 'Insufficient data' };
                    }

                    // Извлекаем данные
                    const prices = candles.map(c => c.close);
                    const volumes = candles.map(c => c.volume || 0);
                    const highs = candles.map(c => c.high);
                    const lows = candles.map(c => c.low);

                    // Рассчитываем индикаторы
                    const indicators = OptimizedAnalysisService.getAllIndicators(
                        prices, volumes, highs, lows, figi, timeframe, period
                    );

                    // Определяем сигнал на основе индикаторов
                    const signal = this._determineSignal(indicators);

                    return {
                        timeframe,
                        indicators,
                        signal,
                        candles: candles.length,
                        lastPrice: prices[prices.length - 1]
                    };
                } catch (error) {
                    if (LoggerService.isInitialized) {
                        LoggerService.error(`Error analyzing timeframe ${timeframe}`, {
                            service: 'MultiTimeframeService',
                            figi,
                            timeframe,
                            error: { message: error.message }
                        });
                    }
                    return { timeframe, error: error.message };
                }
            });

            const timeframeResults = await Promise.all(promises);

            // Группируем результаты
            for (const result of timeframeResults) {
                if (result.error) {
                    results[result.timeframe] = { error: result.error };
                } else {
                    results[result.timeframe] = {
                        signal: result.signal,
                        indicators: result.indicators,
                        candles: result.candles,
                        lastPrice: result.lastPrice
                    };
                    indicatorsByTimeframe[result.timeframe] = result.indicators;
                }
            }

            // Анализируем согласованность сигналов
            const consistency = this._analyzeConsistency(results, timeframes);

            // Вычисляем взвешенный сигнал
            const weightedSignal = this._calculateWeightedSignal(results, timeframes);

            // Определяем приоритетный таймфрейм (с наибольшим весом)
            const priorityTimeframe = this._getPriorityTimeframe(timeframes);

            const analysisResult = {
                figi,
                timeframes: results,
                consistency,
                weightedSignal,
                priorityTimeframe,
                timestamp: new Date().toISOString()
            };

            // Сохраняем в кеш
            this.timeframeCache.set(cacheKey, {
                result: analysisResult,
                timestamp: Date.now()
            });

            // Очищаем старый кеш
            if (this.timeframeCache.size > 100) {
                this._cleanupCache();
            }

            return analysisResult;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error in multi-timeframe analysis', {
                    service: 'MultiTimeframeService',
                    figi,
                    error: { message: error.message, stack: error.stack }
                });
            }
            return {
                figi,
                timeframes: {},
                consistency: { score: 0, agreement: 'none' },
                weightedSignal: { direction: 'HOLD', confidence: 0 },
                error: error.message
            };
        }
    }

    /**
     * Определение сигнала на основе индикаторов
     * @private
     */
    _determineSignal(indicators) {
        if (!indicators || Object.keys(indicators).length === 0) {
            return { direction: 'HOLD', confidence: 0, score: 0.5 };
        }

        let buyScore = 0;
        let sellScore = 0;
        let totalWeight = 0;

        // RSI
        if (indicators.rsi !== undefined && !isNaN(indicators.rsi)) {
            const weight = 0.2;
            totalWeight += weight;
            if (indicators.rsi < 30) {
                buyScore += weight;
            } else if (indicators.rsi > 70) {
                sellScore += weight;
            }
        }

        // MACD
        if (indicators.macd !== undefined && indicators.macd_signal !== undefined) {
            const weight = 0.25;
            totalWeight += weight;
            if (indicators.macd > indicators.macd_signal) {
                buyScore += weight;
            } else {
                sellScore += weight;
            }
        }

        // Bollinger Bands
        if (indicators.bb_position !== undefined && !isNaN(indicators.bb_position)) {
            const weight = 0.15;
            totalWeight += weight;
            if (indicators.bb_position < 0.2) {
                buyScore += weight; // Цена близко к нижней полосе
            } else if (indicators.bb_position > 0.8) {
                sellScore += weight; // Цена близко к верхней полосе
            }
        }

        // Ichimoku Cloud
        if (indicators.ichimoku_signal) {
            const weight = 0.2;
            totalWeight += weight;
            if (indicators.ichimoku_signal === 'buy') {
                buyScore += weight;
            } else if (indicators.ichimoku_signal === 'sell') {
                sellScore += weight;
            }
        }

        // SMA тренд
        if (indicators.sma_20 !== undefined && indicators.sma_50 !== undefined) {
            const weight = 0.2;
            totalWeight += weight;
            if (indicators.sma_20 > indicators.sma_50) {
                buyScore += weight;
            } else {
                sellScore += weight;
            }
        }

        // Нормализуем scores
        if (totalWeight > 0) {
            buyScore = buyScore / totalWeight;
            sellScore = sellScore / totalWeight;
        }

        const finalScore = buyScore - sellScore; // -1 (сильный SELL) до +1 (сильный BUY)
        const confidence = Math.abs(finalScore);

        let direction = 'HOLD';
        if (finalScore > 0.3) {
            direction = 'BUY';
        } else if (finalScore < -0.3) {
            direction = 'SELL';
        }

        return {
            direction,
            confidence: confidence * 100, // В процентах
            score: (finalScore + 1) / 2 // Нормализуем к 0-1
        };
    }

    /**
     * Анализ согласованности сигналов между таймфреймами
     * @private
     */
    _analyzeConsistency(timeframeResults, timeframes) {
        const signals = [];
        
        for (const tf of timeframes) {
            const result = timeframeResults[tf];
            if (result && result.signal && !result.error) {
                signals.push(result.signal.direction);
            }
        }

        if (signals.length === 0) {
            return { score: 0, agreement: 'none', signals: [] };
        }

        // Подсчитываем согласованность
        const buyCount = signals.filter(s => s === 'BUY').length;
        const sellCount = signals.filter(s => s === 'SELL').length;
        const holdCount = signals.filter(s => s === 'HOLD').length;

        let agreement = 'none';
        let score = 0;

        if (buyCount === signals.length) {
            agreement = 'strong_buy';
            score = 1.0;
        } else if (sellCount === signals.length) {
            agreement = 'strong_sell';
            score = 1.0;
        } else if (buyCount > sellCount && buyCount > holdCount) {
            agreement = 'buy';
            score = buyCount / signals.length;
        } else if (sellCount > buyCount && sellCount > holdCount) {
            agreement = 'sell';
            score = sellCount / signals.length;
        } else if (holdCount === signals.length) {
            agreement = 'hold';
            score = 0.5;
        } else {
            agreement = 'mixed';
            score = Math.max(buyCount, sellCount) / signals.length;
        }

        return {
            score,
            agreement,
            signals,
            buyCount,
            sellCount,
            holdCount
        };
    }

    /**
     * Вычисление взвешенного сигнала
     * @private
     */
    _calculateWeightedSignal(timeframeResults, timeframes) {
        let totalWeight = 0;
        let weightedBuyScore = 0;
        let weightedSellScore = 0;

        for (const tf of timeframes) {
            const result = timeframeResults[tf];
            if (result && result.signal && !result.error) {
                const weight = this.timeframeWeights[tf] || 0.33;
                totalWeight += weight;

                const signalScore = result.signal.score; // 0-1, где 0.5 = HOLD
                if (signalScore > 0.5) {
                    weightedBuyScore += weight * (signalScore - 0.5) * 2; // Нормализуем к 0-1
                } else {
                    weightedSellScore += weight * (0.5 - signalScore) * 2;
                }
            }
        }

        if (totalWeight === 0) {
            return { direction: 'HOLD', confidence: 0 };
        }

        const finalScore = (weightedBuyScore - weightedSellScore) / totalWeight;
        const confidence = Math.abs(finalScore) * 100;

        let direction = 'HOLD';
        if (finalScore > 0.3) {
            direction = 'BUY';
        } else if (finalScore < -0.3) {
            direction = 'SELL';
        }

        return {
            direction,
            confidence,
            score: (finalScore + 1) / 2
        };
    }

    /**
     * Определение приоритетного таймфрейма
     * @private
     */
    _getPriorityTimeframe(timeframes) {
        // Возвращаем таймфрейм с наибольшим весом
        let maxWeight = 0;
        let priority = 'D1';

        for (const tf of timeframes) {
            const weight = this.timeframeWeights[tf] || 0;
            if (weight > maxWeight) {
                maxWeight = weight;
                priority = tf;
            }
        }

        return priority;
    }

    /**
     * Очистка кеша
     * @private
     */
    _cleanupCache() {
        const now = Date.now();
        const ttl = 10 * 60 * 1000; // 10 минут

        for (const [key, value] of this.timeframeCache.entries()) {
            if (now - value.timestamp > ttl) {
                this.timeframeCache.delete(key);
            }
        }
    }

    /**
     * Инвалидация кеша для конкретного инструмента
     */
    invalidateCache(figi) {
        for (const key of this.timeframeCache.keys()) {
            if (key.startsWith(figi)) {
                this.timeframeCache.delete(key);
            }
        }
    }
}

export default new MultiTimeframeService();

