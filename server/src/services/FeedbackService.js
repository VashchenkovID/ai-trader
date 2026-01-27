/**
 * Сервис обратной связи для сбора результатов торгов
 * Фаза 2, задача 2.1: Система обратной связи
 * 
 * Функциональность:
 * - Запись результатов торгов по рекомендациям
 * - Расчет эффективности моделей
 * - Обновление весов моделей на основе реальных результатов
 */

import TradingRequest from '../models/TradingRequest.js';
import Recommendation from '../models/Recommendation.js';
import ModelPerformance from '../models/ModelPerformance.js';
import ModelWeightingService from './ModelWeightingService.js';
import LoggerService from './LoggerService.js';
import { Op } from 'sequelize';

class FeedbackService {
    constructor() {
        this.isInitialized = false;
        this.settings = {
            // Минимальное количество сделок для оценки модели
            minTradesForEvaluation: 10,
            
            // Период анализа производительности (дни)
            performanceWindowDays: 30,
            
            // Автоматическое обновление весов
            autoUpdateWeights: true,
            
            // Пороги для автоматического отключения модели
            minWinRate: 0.45,
            minSharpeRatio: 0.5,
            maxDrawdown: 0.20
        };
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        try {
            if (this.isInitialized) {
                return;
            }

            // Загружаем настройки
            await this.loadSettings();

            this.isInitialized = true;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('❌ Failed to initialize FeedbackService:', error);
            } else {
                console.error('❌ Failed to initialize FeedbackService:', error);
            }
            throw error;
        }
    }

    /**
     * Загрузка настроек из базы данных
     */
    async loadSettings() {
        try {
            const SettingsService = (await import('./SettingsService.js')).default;
            const settings = await SettingsService.getAllSettings('feedback');
            
            if (settings && settings.length > 0) {
                for (const setting of settings) {
                    const key = setting.key.replace('feedback.', '');
                    const value = setting.value;
                    
                    if (key.includes('days') || key.includes('min') || key.includes('max') || key.includes('ratio')) {
                        this.settings[key] = parseFloat(value) || this.settings[key];
                    } else if (key.includes('auto')) {
                        this.settings[key] = value === 'true' || value === true;
                    }
                }
            }
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.warn('⚠️ Failed to load feedback settings, using defaults:', error.message);
            }
        }
    }

    /**
     * Запись результата сделки
     * @param {string} recommendationId - ID рекомендации (FIGI)
     * @param {number} executedPrice - Цена исполнения
     * @param {number} actualPnL - Фактическая прибыль/убыток (в процентах или абсолютных единицах)
     * @param {Object} options - Дополнительные опции
     * @returns {Promise<Object>} Результат записи
     */
    async recordTradeResult(recommendationId, executedPrice, actualPnL, options = {}) {
        try {
            if (!this.isInitialized) {
                throw new Error('FeedbackService not initialized');
            }

            const {
                tradingRequestId = null,
                positionStrategyId = null,
                modelType = null,
                figi = recommendationId
            } = options;

            // Получаем рекомендацию
            const recommendation = await Recommendation.findOne({
                where: { figi: recommendationId }
            });

            if (!recommendation) {
                throw new Error(`Recommendation not found for ${recommendationId}`);
            }

            // Определяем тип модели из рекомендации
            const detectedModelType = modelType || this._detectModelType(recommendation);

            // Получаем торговую заявку, если указана
            let tradingRequest = null;
            if (tradingRequestId) {
                tradingRequest = await TradingRequest.findByPk(tradingRequestId);
            } else {
                // Пытаемся найти заявку по recommendationId
                tradingRequest = await TradingRequest.findOne({
                    where: {
                        recommendationId: recommendationId,
                        status: 'EXECUTED'
                    },
                    order: [['executedAt', 'DESC']]
                });
            }

            // Рассчитываем метрики
            const metrics = this._calculateMetrics(actualPnL, executedPrice, recommendation);

            // Записываем производительность модели
            await ModelWeightingService.recordPerformance(
                detectedModelType,
                {
                    ...metrics,
                    figi: figi,
                    totalTrades: 1,
                    profitableTrades: actualPnL > 0 ? 1 : 0,
                    losingTrades: actualPnL <= 0 ? 1 : 0
                },
                figi
            );

            // Если автоматическое обновление весов включено, обновляем веса
            if (this.settings.autoUpdateWeights) {
                await this.updateModelWeightsFromResults();
            }

            if (LoggerService.isInitialized) {
                LoggerService.info('Trade result recorded', {
                    service: 'FeedbackService',
                    recommendationId,
                    modelType: detectedModelType,
                    actualPnL,
                    metrics
                });
            }

            return {
                success: true,
                modelType: detectedModelType,
                metrics
            };
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Failed to record trade result', {
                    service: 'FeedbackService',
                    recommendationId,
                    error: { message: error.message, stack: error.stack }
                });
            } else {
                console.error('❌ Failed to record trade result:', error);
            }
            throw error;
        }
    }

    /**
     * Расчет эффективности моделей
     * @param {string} modelType - Тип модели (опционально, если не указан - для всех)
     * @param {string} figi - FIGI инструмента (опционально)
     * @returns {Promise<Object>} Метрики эффективности
     */
    async calculateModelEffectiveness(modelType = null, figi = null) {
        try {
            if (!this.isInitialized) {
                throw new Error('FeedbackService not initialized');
            }

            const periodStart = new Date();
            periodStart.setDate(periodStart.getDate() - this.settings.performanceWindowDays);

            // Получаем производительность моделей
            const whereClause = {
                periodEnd: {
                    [Op.gte]: periodStart
                },
                isActive: true
            };

            if (modelType) {
                whereClause.modelType = modelType;
            }

            if (figi) {
                whereClause.figi = figi;
            }

            const performances = await ModelPerformance.findAll({
                where: whereClause,
                order: [['periodEnd', 'DESC']]
            });

            if (performances.length === 0) {
                return {
                    success: true,
                    models: {},
                    message: 'No performance data available'
                };
            }

            // Группируем по типам моделей
            const modelStats = {};
            for (const perf of performances) {
                if (!modelStats[perf.modelType]) {
                    modelStats[perf.modelType] = {
                        totalTrades: 0,
                        profitableTrades: 0,
                        losingTrades: 0,
                        totalPnL: 0,
                        winRate: 0,
                        averageReturn: 0,
                        sharpeRatio: 0,
                        maxDrawdown: 0,
                        accuracy: 0,
                        f1Score: 0,
                        samples: []
                    };
                }

                const stats = modelStats[perf.modelType];
                stats.totalTrades += perf.totalTrades || 0;
                stats.profitableTrades += perf.profitableTrades || 0;
                stats.losingTrades += perf.losingTrades || 0;
                stats.samples.push(perf);
            }

            // Рассчитываем средние метрики
            const results = {};
            for (const [modelType, stats] of Object.entries(modelStats)) {
                const sampleCount = stats.samples.length;
                if (sampleCount === 0) continue;

                // Средние значения
                stats.winRate = stats.totalTrades > 0 
                    ? stats.profitableTrades / stats.totalTrades 
                    : 0;
                
                stats.averageReturn = stats.samples.reduce((sum, s) => sum + (s.averageReturn || 0), 0) / sampleCount;
                stats.sharpeRatio = stats.samples.reduce((sum, s) => sum + (s.sharpeRatio || 0), 0) / sampleCount;
                stats.accuracy = stats.samples.reduce((sum, s) => sum + (s.accuracy || 0), 0) / sampleCount;
                stats.f1Score = stats.samples.reduce((sum, s) => sum + (s.f1Score || 0), 0) / sampleCount;

                // Максимальная просадка
                stats.maxDrawdown = Math.max(...stats.samples.map(s => {
                    // Если есть maxDrawdown в метаданных
                    return s.metadata?.maxDrawdown || 0;
                }));

                results[modelType] = {
                    winRate: stats.winRate,
                    averageReturn: stats.averageReturn,
                    sharpeRatio: stats.sharpeRatio,
                    maxDrawdown: stats.maxDrawdown,
                    accuracy: stats.accuracy,
                    f1Score: stats.f1Score,
                    totalTrades: stats.totalTrades,
                    profitableTrades: stats.profitableTrades,
                    losingTrades: stats.losingTrades
                };
            }

            return {
                success: true,
                models: results,
                period: {
                    start: periodStart,
                    end: new Date()
                }
            };
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Failed to calculate model effectiveness', {
                    service: 'FeedbackService',
                    modelType,
                    figi,
                    error: { message: error.message, stack: error.stack }
                });
            } else {
                console.error('❌ Failed to calculate model effectiveness:', error);
            }
            throw error;
        }
    }

    /**
     * Обновление весов моделей на основе результатов
     * @returns {Promise<Object>} Результат обновления
     */
    async updateModelWeightsFromResults() {
        try {
            if (!this.isInitialized) {
                throw new Error('FeedbackService not initialized');
            }

            if (!ModelWeightingService.isInitialized) {
                if (LoggerService.isInitialized) {
                    LoggerService.warn('ModelWeightingService not initialized, skipping weight update');
                }
                return { success: false, message: 'ModelWeightingService not initialized' };
            }

            // Получаем эффективность всех моделей
            const effectiveness = await this.calculateModelEffectiveness();

            if (!effectiveness.success || Object.keys(effectiveness.models).length === 0) {
                return {
                    success: false,
                    message: 'No model effectiveness data available'
                };
            }

            // Обновляем веса для каждой модели
            const updatedWeights = {};
            for (const [modelType, metrics] of Object.entries(effectiveness.models)) {
                // Проверяем минимальные пороги
                if (metrics.totalTrades < this.settings.minTradesForEvaluation) {
                    continue; // Пропускаем модели с недостаточным количеством сделок
                }

                // Рассчитываем новый вес на основе метрик
                const weight = this._calculateWeightFromMetrics(metrics);

                // Обновляем вес через ModelWeightingService
                try {
                    await ModelWeightingService.calculateModelWeight(modelType);
                    updatedWeights[modelType] = weight;
                } catch (error) {
                    if (LoggerService.isInitialized) {
                        LoggerService.warn(`Failed to update weight for ${modelType}:`, error.message);
                    }
                }
            }

            if (LoggerService.isInitialized) {
                LoggerService.info('Model weights updated from results', {
                    service: 'FeedbackService',
                    updatedWeights
                });
            }

            return {
                success: true,
                updatedWeights,
                timestamp: new Date()
            };
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Failed to update model weights from results', {
                    service: 'FeedbackService',
                    error: { message: error.message, stack: error.stack }
                });
            } else {
                console.error('❌ Failed to update model weights from results:', error);
            }
            throw error;
        }
    }

    /**
     * Определение типа модели из рекомендации
     * @private
     */
    _detectModelType(recommendation) {
        // Пытаемся определить тип модели из метаданных рекомендации
        if (recommendation.metadata?.modelType) {
            return recommendation.metadata.modelType;
        }

        // Определяем по source из aiExplanation
        if (recommendation.aiExplanation?.source) {
            const source = recommendation.aiExplanation.source.toLowerCase();
            if (source.includes('ensemble')) return 'ensemble';
            if (source.includes('meta')) return 'metaLearning';
            if (source.includes('reinforcement') || source.includes('rl')) return 'reinforcementLearning';
            if (source.includes('traditional') || source.includes('neural')) return 'traditional';
        }

        // По умолчанию - ensemble
        return 'ensemble';
    }

    /**
     * Расчет метрик из результата сделки
     * @private
     */
    _calculateMetrics(actualPnL, executedPrice, recommendation) {
        const isProfitable = actualPnL > 0;
        const pnLPercent = typeof actualPnL === 'number' && actualPnL <= 1 && actualPnL >= -1
            ? actualPnL * 100 // Если в долях, конвертируем в проценты
            : (actualPnL / executedPrice) * 100; // Если в абсолютных единицах

        return {
            winRate: isProfitable ? 1.0 : 0.0,
            averageReturn: pnLPercent,
            accuracy: isProfitable ? 1.0 : 0.0, // Упрощенная метрика для одной сделки
            precision: isProfitable ? 1.0 : 0.0,
            recall: isProfitable ? 1.0 : 0.0,
            f1Score: isProfitable ? 1.0 : 0.0,
            sharpeRatio: null, // Будет рассчитан при агрегации
            averageWin: isProfitable ? pnLPercent : 0,
            averageLoss: !isProfitable ? Math.abs(pnLPercent) : 0
        };
    }

    /**
     * Сравнение комбинаций моделей (A/B тестирование)
     * Фаза 2, задача 2.1.4
     * @param {Array<string>} combinationA - Первая комбинация моделей
     * @param {Array<string>} combinationB - Вторая комбинация моделей
     * @param {number} periodDays - Период сравнения в днях
     * @returns {Promise<Object>} Результат сравнения
     */
    async compareModelCombinations(combinationA, combinationB, periodDays = 30) {
        try {
            if (!this.isInitialized) {
                throw new Error('FeedbackService not initialized');
            }

            const periodStart = new Date();
            periodStart.setDate(periodStart.getDate() - periodDays);

            // Получаем эффективность для каждой комбинации
            const effectivenessA = await this._calculateCombinationEffectiveness(combinationA, periodStart);
            const effectivenessB = await this._calculateCombinationEffectiveness(combinationB, periodStart);

            // Сравниваем метрики
            const comparison = {
                combinationA: {
                    models: combinationA,
                    metrics: effectivenessA
                },
                combinationB: {
                    models: combinationB,
                    metrics: effectivenessB
                },
                winner: null,
                comparison: {}
            };

            // Сравниваем ключевые метрики
            const metricsToCompare = ['winRate', 'averageReturn', 'sharpeRatio', 'totalTrades'];
            let scoreA = 0;
            let scoreB = 0;

            for (const metric of metricsToCompare) {
                const valueA = effectivenessA[metric] || 0;
                const valueB = effectivenessB[metric] || 0;
                
                comparison.comparison[metric] = {
                    A: valueA,
                    B: valueB,
                    difference: valueA - valueB,
                    winner: valueA > valueB ? 'A' : valueB > valueA ? 'B' : 'tie'
                };

                if (valueA > valueB) scoreA++;
                else if (valueB > valueA) scoreB++;
            }

            // Определяем победителя
            if (scoreA > scoreB) {
                comparison.winner = 'A';
            } else if (scoreB > scoreA) {
                comparison.winner = 'B';
            } else {
                // При равенстве выбираем по Sharpe Ratio
                comparison.winner = effectivenessA.sharpeRatio > effectivenessB.sharpeRatio ? 'A' : 'B';
            }

            return {
                success: true,
                ...comparison,
                period: {
                    start: periodStart,
                    end: new Date(),
                    days: periodDays
                }
            };
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Failed to compare model combinations', {
                    service: 'FeedbackService',
                    error: { message: error.message, stack: error.stack }
                });
            }
            throw error;
        }
    }

    /**
     * Расчет эффективности комбинации моделей
     * @private
     */
    async _calculateCombinationEffectiveness(combination, periodStart) {
        const whereClause = {
            modelType: { [Op.in]: combination },
            periodEnd: { [Op.gte]: periodStart },
            isActive: true
        };

        const performances = await ModelPerformance.findAll({
            where: whereClause,
            order: [['periodEnd', 'DESC']]
        });

        if (performances.length === 0) {
            return {
                winRate: 0,
                averageReturn: 0,
                sharpeRatio: 0,
                totalTrades: 0,
                profitableTrades: 0,
                losingTrades: 0
            };
        }

        // Агрегируем метрики по комбинации
        const aggregated = {
            totalTrades: 0,
            profitableTrades: 0,
            losingTrades: 0,
            totalReturn: 0,
            sharpeRatios: [],
            samples: 0
        };

        for (const perf of performances) {
            aggregated.totalTrades += perf.totalTrades || 0;
            aggregated.profitableTrades += perf.profitableTrades || 0;
            aggregated.losingTrades += perf.losingTrades || 0;
            aggregated.totalReturn += (perf.averageReturn || 0) * (perf.totalTrades || 0);
            if (perf.sharpeRatio) {
                aggregated.sharpeRatios.push(perf.sharpeRatio);
            }
            aggregated.samples++;
        }

        return {
            winRate: aggregated.totalTrades > 0 
                ? aggregated.profitableTrades / aggregated.totalTrades 
                : 0,
            averageReturn: aggregated.totalTrades > 0
                ? aggregated.totalReturn / aggregated.totalTrades
                : 0,
            sharpeRatio: aggregated.sharpeRatios.length > 0
                ? aggregated.sharpeRatios.reduce((sum, r) => sum + r, 0) / aggregated.sharpeRatios.length
                : 0,
            totalTrades: aggregated.totalTrades,
            profitableTrades: aggregated.profitableTrades,
            losingTrades: aggregated.losingTrades
        };
    }

    /**
     * Расчет веса модели на основе метрик
     * @private
     */
    _calculateWeightFromMetrics(metrics) {
        // Нормализуем метрики в диапазон 0-1
        const normalizedWinRate = Math.max(0, Math.min(1, metrics.winRate));
        const normalizedSharpe = metrics.sharpeRatio > 0 
            ? Math.max(0, Math.min(1, metrics.sharpeRatio / 2)) // Sharpe обычно в диапазоне 0-2
            : 0;
        const normalizedReturn = Math.max(0, Math.min(1, (metrics.averageReturn + 10) / 20)); // Нормализуем -10% до +10%
        const normalizedAccuracy = metrics.accuracy || 0;

        // Взвешенная сумма метрик
        const weight = (
            normalizedWinRate * 0.3 +
            normalizedSharpe * 0.25 +
            normalizedReturn * 0.25 +
            normalizedAccuracy * 0.2
        );

        // Применяем штраф за высокую просадку
        const drawdownPenalty = metrics.maxDrawdown > this.settings.maxDrawdown
            ? 0.5 // Снижаем вес на 50% при превышении лимита просадки
            : 1.0;

        return Math.max(0, Math.min(1, weight * drawdownPenalty));
    }
}

export default new FeedbackService();

