import SignalCacheService from './SignalCacheService.js';
import TinkoffApiService from './TinkoffApiService.js';
import { Op } from 'sequelize';

class SignalValidationService {
    constructor() {
        this.isInitialized = false;
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        try {
            console.log('🚀 Инициализация SignalValidationService...');
            this.isInitialized = true;
            console.log('✅ SignalValidationService инициализирован');
        } catch (error) {
            console.error('❌ Ошибка инициализации SignalValidationService:', error);
            throw error;
        }
    }

    /**
     * Конвертация направления предсказания модели в формат сигналов
     * @param {number} score - Score модели (0-1)
     * @returns {string} - Направление в формате SIGNAL_DIRECTION_*
     */
    modelScoreToDirection(score) {
        if (score >= 0.6) {
            return 'SIGNAL_DIRECTION_BUY';
        } else if (score <= 0.4) {
            return 'SIGNAL_DIRECTION_SELL';
        } else {
            return 'SIGNAL_DIRECTION_UNSPECIFIED'; // HOLD
        }
    }

    /**
     * Конвертация направления сигнала в числовое значение для сравнения
     * @param {string} direction - Направление сигнала
     * @returns {number} - Числовое значение (-1 для SELL, 0 для HOLD, 1 для BUY)
     */
    directionToNumber(direction) {
        if (direction === 'SIGNAL_DIRECTION_BUY') return 1;
        if (direction === 'SIGNAL_DIRECTION_SELL') return -1;
        return 0; // SIGNAL_DIRECTION_UNSPECIFIED или HOLD
    }

    /**
     * Валидация предсказания модели против сигналов аналитиков
     * @param {string} figi - FIGI инструмента
     * @param {Object} modelPrediction - Предсказание модели {score, confidence, recommendation}
     * @param {Date} timestamp - Временная метка предсказания
     * @returns {Object} - Результат валидации
     */
    async validatePredictionAgainstSignals(figi, modelPrediction, timestamp = new Date()) {
        try {
            if (!figi || !modelPrediction) {
                return {
                    success: false,
                    error: 'Missing required parameters'
                };
            }

            // Получаем активные сигналы на дату предсказания
            const signals = await SignalCacheService.getSignalsByDate(figi, timestamp);

            if (signals.length === 0) {
                return {
                    success: true,
                    hasSignals: false,
                    message: 'No signals available for comparison',
                    metrics: {
                        directionMatch: null,
                        averageProbability: null,
                        signalsCount: 0
                    }
                };
            }

            // Определяем направление модели
            const modelDirection = modelPrediction.recommendation 
                ? (modelPrediction.recommendation === 'BUY' ? 'SIGNAL_DIRECTION_BUY' : 
                   modelPrediction.recommendation === 'SELL' ? 'SIGNAL_DIRECTION_SELL' : 
                   'SIGNAL_DIRECTION_UNSPECIFIED')
                : this.modelScoreToDirection(modelPrediction.score || 0);

            const modelDirectionNum = this.directionToNumber(modelDirection);
            const modelScore = modelPrediction.score || 0;
            const modelConfidence = modelPrediction.confidence || 0;

            // Анализируем сигналы
            let buySignalsCount = 0;
            let sellSignalsCount = 0;
            let holdSignalsCount = 0;
            let totalProbability = 0;
            let buyProbability = 0;
            let sellProbability = 0;
            let buyCount = 0;
            let sellCount = 0;

            for (const signal of signals) {
                const signalDirection = signal.direction;
                const signalProbability = (signal.probability || 0) / 100; // Нормализуем от 0-100 к 0-1

                if (signalDirection === 'SIGNAL_DIRECTION_BUY') {
                    buySignalsCount++;
                    buyProbability += signalProbability;
                    buyCount++;
                } else if (signalDirection === 'SIGNAL_DIRECTION_SELL') {
                    sellSignalsCount++;
                    sellProbability += signalProbability;
                    sellCount++;
                } else {
                    holdSignalsCount++;
                }

                totalProbability += signalProbability;
            }

            const avgProbability = signals.length > 0 ? totalProbability / signals.length : 0;
            const avgBuyProbability = buyCount > 0 ? buyProbability / buyCount : 0;
            const avgSellProbability = sellCount > 0 ? sellProbability / sellCount : 0;

            // Определяем преобладающее направление сигналов
            let dominantDirection = 'SIGNAL_DIRECTION_UNSPECIFIED';
            let dominantDirectionNum = 0;
            if (buySignalsCount > sellSignalsCount && buySignalsCount > 0) {
                dominantDirection = 'SIGNAL_DIRECTION_BUY';
                dominantDirectionNum = 1;
            } else if (sellSignalsCount > buySignalsCount && sellSignalsCount > 0) {
                dominantDirection = 'SIGNAL_DIRECTION_SELL';
                dominantDirectionNum = -1;
            }

            // Сравниваем направления
            const directionMatch = modelDirectionNum === dominantDirectionNum;
            const directionAgreement = this.calculateDirectionAgreement(modelDirectionNum, signals);

            // Сравниваем вероятности
            const probabilityCorrelation = this.calculateProbabilityCorrelation(
                modelScore,
                modelConfidence,
                avgProbability,
                dominantDirectionNum === 1 ? avgBuyProbability : dominantDirectionNum === -1 ? avgSellProbability : avgProbability
            );

            // Общая оценка согласованности
            const overallAgreement = this.calculateOverallAgreement(
                directionMatch,
                directionAgreement,
                probabilityCorrelation
            );

            return {
                success: true,
                hasSignals: true,
                modelPrediction: {
                    direction: modelDirection,
                    score: modelScore,
                    confidence: modelConfidence
                },
                signalsSummary: {
                    total: signals.length,
                    buy: buySignalsCount,
                    sell: sellSignalsCount,
                    hold: holdSignalsCount,
                    dominantDirection: dominantDirection,
                    averageProbability: avgProbability,
                    averageBuyProbability: avgBuyProbability,
                    averageSellProbability: avgSellProbability
                },
                metrics: {
                    directionMatch: directionMatch,
                    directionAgreement: directionAgreement,
                    probabilityCorrelation: probabilityCorrelation,
                    overallAgreement: overallAgreement
                },
                signals: signals.map(s => ({
                    strategyName: s.strategyName,
                    direction: s.direction,
                    probability: s.probability,
                    name: s.name
                }))
            };
        } catch (error) {
            console.error('❌ Ошибка валидации предсказания против сигналов:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Расчет согласованности направления с сигналами
     * @param {number} modelDirectionNum - Направление модели (-1, 0, 1)
     * @param {Array} signals - Массив сигналов
     * @returns {number} - Согласованность (0-1)
     */
    calculateDirectionAgreement(modelDirectionNum, signals) {
        if (signals.length === 0) return 0;

        let matchingCount = 0;
        for (const signal of signals) {
            const signalDirectionNum = this.directionToNumber(signal.direction);
            // Считаем совпадение, если направления совпадают или оба нейтральные
            if (modelDirectionNum === signalDirectionNum) {
                matchingCount++;
            } else if (modelDirectionNum === 0 && signalDirectionNum === 0) {
                matchingCount++;
            }
        }

        return matchingCount / signals.length;
    }

    /**
     * Расчет корреляции вероятностей
     * @param {number} modelScore - Score модели (0-1)
     * @param {number} modelConfidence - Confidence модели (0-1)
     * @param {number} avgSignalProbability - Средняя вероятность сигналов (0-1)
     * @param {number} dominantSignalProbability - Вероятность доминирующего направления (0-1)
     * @returns {number} - Корреляция (0-1)
     */
    calculateProbabilityCorrelation(modelScore, modelConfidence, avgSignalProbability, dominantSignalProbability) {
        // Используем среднее между score и confidence как общую уверенность модели
        const modelCertainty = (modelScore + modelConfidence) / 2;

        // Сравниваем с вероятностью сигналов
        const diff = Math.abs(modelCertainty - dominantSignalProbability);
        // Чем меньше разница, тем выше корреляция
        return Math.max(0, 1 - diff);
    }

    /**
     * Расчет общей согласованности
     * @param {boolean} directionMatch - Совпадение направления
     * @param {number} directionAgreement - Согласованность направления (0-1)
     * @param {number} probabilityCorrelation - Корреляция вероятностей (0-1)
     * @returns {number} - Общая согласованность (0-1)
     */
    calculateOverallAgreement(directionMatch, directionAgreement, probabilityCorrelation) {
        // Взвешенное среднее: направление важнее (50%), согласованность (30%), корреляция (20%)
        const directionWeight = directionMatch ? 0.5 : 0;
        const agreementWeight = directionAgreement * 0.3;
        const correlationWeight = probabilityCorrelation * 0.2;

        return directionWeight + agreementWeight + correlationWeight;
    }

    /**
     * Получение метрик качества для всех предсказаний модели
     * @param {string} figi - FIGI инструмента (опционально, если не указан - для всех)
     * @param {Date} from - Дата начала периода
     * @param {Date} to - Дата окончания периода
     * @returns {Promise<Object>} - Метрики качества
     */
    async getQualityMetrics(figi = null, from = null, to = null) {
        try {
            const Recommendation = (await import('../models/Recommendation.js')).default;
            
            // Получаем рекомендации за период
            const where = {};
            if (figi) where.figi = figi;
            if (from) where.analysisDate = { [Op.gte]: from };
            if (to) where.analysisDate = { [Op.lte]: to };

            const recommendations = await Recommendation.findAll({
                where: where,
                order: [['analysisDate', 'DESC']],
                limit: 1000
            });

            if (recommendations.length === 0) {
                return {
                    success: false,
                    message: 'No recommendations found for the period'
                };
            }

            let totalComparisons = 0;
            let directionMatches = 0;
            let totalDirectionAgreement = 0;
            let totalProbabilityCorrelation = 0;
            let totalOverallAgreement = 0;

            const comparisons = [];

            for (const recommendation of recommendations) {
                const validation = await this.validatePredictionAgainstSignals(
                    recommendation.figi,
                    {
                        score: recommendation.score || 0,
                        confidence: recommendation.confidence || 0,
                        recommendation: recommendation.recommendation
                    },
                    recommendation.analysisDate
                );

                if (validation.success && validation.hasSignals) {
                    totalComparisons++;
                    if (validation.metrics.directionMatch) directionMatches++;
                    totalDirectionAgreement += validation.metrics.directionAgreement || 0;
                    totalProbabilityCorrelation += validation.metrics.probabilityCorrelation || 0;
                    totalOverallAgreement += validation.metrics.overallAgreement || 0;

                    comparisons.push({
                        figi: recommendation.figi,
                        date: recommendation.analysisDate,
                        metrics: validation.metrics
                    });
                }
            }

            if (totalComparisons === 0) {
                return {
                    success: false,
                    message: 'No signals available for comparison'
                };
            }

            return {
                success: true,
                period: {
                    from: from || 'all',
                    to: to || 'all'
                },
                totalRecommendations: recommendations.length,
                totalComparisons: totalComparisons,
                metrics: {
                    directionMatchRate: directionMatches / totalComparisons,
                    averageDirectionAgreement: totalDirectionAgreement / totalComparisons,
                    averageProbabilityCorrelation: totalProbabilityCorrelation / totalComparisons,
                    averageOverallAgreement: totalOverallAgreement / totalComparisons
                },
                comparisons: comparisons.slice(0, 100) // Ограничиваем для размера ответа
            };
        } catch (error) {
            console.error('❌ Ошибка получения метрик качества:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Оценка исторических сигналов: проверка, достигли ли цены targetPrice
     * @param {string} figi - FIGI инструмента (опционально)
     * @param {Date} from - Дата начала периода
     * @param {Date} to - Дата окончания периода
     * @returns {Promise<Object>} - Результаты оценки исторических сигналов
     */
    async evaluateHistoricalSignals(figi = null, from = null, to = null) {
        try {
            const CachedSignal = (await import('../models/CachedSignal.js')).default;
            const CacheService = (await import('./CacheService.js')).default;
            const { Op } = await import('sequelize');

            // Получаем завершенные сигналы за период
            const where = {
                endDt: { [Op.lt]: to || new Date() } // Сигналы, которые уже завершились
            };
            if (figi) where.figi = figi;
            if (from) where.createDt = { [Op.gte]: from };

            const completedSignals = await CachedSignal.findAll({
                where: where,
                order: [['endDt', 'DESC']],
                limit: 1000
            });

            if (completedSignals.length === 0) {
                return {
                    success: false,
                    message: 'No completed signals found for the period'
                };
            }

            let totalSignals = 0;
            let successfulSignals = 0;
            let failedSignals = 0;
            let buySignalsSuccess = 0;
            let buySignalsTotal = 0;
            let sellSignalsSuccess = 0;
            let sellSignalsTotal = 0;
            const signalResults = [];

            for (const signal of completedSignals) {
                try {
                    // Получаем цену на момент окончания сигнала
                    const candles = await CacheService.getCandles(signal.figi, 'DAY', 365);
                    if (!candles || candles.length === 0) {
                        continue;
                    }

                    // Находим цену на дату окончания сигнала
                    const endDate = new Date(signal.endDt);
                    const relevantCandles = candles.filter(c => {
                        const candleDate = new Date(c.time);
                        return candleDate <= endDate;
                    });

                    if (relevantCandles.length === 0) {
                        continue;
                    }

                    const endPrice = relevantCandles[relevantCandles.length - 1].close;
                    const initialPrice = signal.initialPrice || 0;
                    const targetPrice = signal.targetPrice || 0;
                    const stoploss = signal.stoploss || 0;

                    if (initialPrice === 0 || targetPrice === 0) {
                        continue;
                    }

                    totalSignals++;
                    let isSuccessful = false;
                    let priceChange = 0;

                    if (signal.direction === 'SIGNAL_DIRECTION_BUY') {
                        buySignalsTotal++;
                        // Для BUY: цена должна достичь targetPrice или выше
                        if (endPrice >= targetPrice) {
                            isSuccessful = true;
                            successfulSignals++;
                            buySignalsSuccess++;
                        } else if (stoploss > 0 && endPrice <= stoploss) {
                            // Сработал стоп-лосс
                            failedSignals++;
                        } else {
                            failedSignals++;
                        }
                        priceChange = ((endPrice - initialPrice) / initialPrice) * 100;
                    } else if (signal.direction === 'SIGNAL_DIRECTION_SELL') {
                        sellSignalsTotal++;
                        // Для SELL: цена должна достичь targetPrice или ниже
                        if (endPrice <= targetPrice) {
                            isSuccessful = true;
                            successfulSignals++;
                            sellSignalsSuccess++;
                        } else if (stoploss > 0 && endPrice >= stoploss) {
                            // Сработал стоп-лосс
                            failedSignals++;
                        } else {
                            failedSignals++;
                        }
                        priceChange = ((initialPrice - endPrice) / initialPrice) * 100;
                    }

                    signalResults.push({
                        signalId: signal.signalId,
                        strategyName: signal.strategyName,
                        direction: signal.direction,
                        createDt: signal.createDt,
                        endDt: signal.endDt,
                        initialPrice: initialPrice,
                        targetPrice: targetPrice,
                        endPrice: endPrice,
                        stoploss: stoploss,
                        probability: signal.probability,
                        isSuccessful: isSuccessful,
                        priceChange: priceChange,
                        targetReached: signal.direction === 'SIGNAL_DIRECTION_BUY' 
                            ? endPrice >= targetPrice 
                            : endPrice <= targetPrice
                    });
                } catch (error) {
                    console.warn(`⚠️ Ошибка оценки сигнала ${signal.signalId}:`, error.message);
                }
            }

            const successRate = totalSignals > 0 ? successfulSignals / totalSignals : 0;
            const buySuccessRate = buySignalsTotal > 0 ? buySignalsSuccess / buySignalsTotal : 0;
            const sellSuccessRate = sellSignalsTotal > 0 ? sellSignalsSuccess / sellSignalsTotal : 0;

            // Рассчитываем среднюю доходность успешных сигналов
            const successfulResults = signalResults.filter(r => r.isSuccessful);
            const avgReturn = successfulResults.length > 0
                ? successfulResults.reduce((sum, r) => sum + r.priceChange, 0) / successfulResults.length
                : 0;

            return {
                success: true,
                period: {
                    from: from || 'all',
                    to: to || new Date()
                },
                summary: {
                    totalSignals: totalSignals,
                    successfulSignals: successfulSignals,
                    failedSignals: failedSignals,
                    successRate: successRate,
                    buySignalsTotal: buySignalsTotal,
                    buySignalsSuccess: buySignalsSuccess,
                    buySuccessRate: buySuccessRate,
                    sellSignalsTotal: sellSignalsTotal,
                    sellSignalsSuccess: sellSignalsSuccess,
                    sellSuccessRate: sellSuccessRate,
                    averageReturn: avgReturn
                },
                signals: signalResults.slice(0, 100) // Ограничиваем для размера ответа
            };
        } catch (error) {
            console.error('❌ Ошибка оценки исторических сигналов:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

export default new SignalValidationService();

