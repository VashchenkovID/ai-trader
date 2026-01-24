import ModelPerformance from '../models/ModelPerformance.js';
import Recommendation from '../models/Recommendation.js';
import LoggerService from './LoggerService.js';
import { Op } from 'sequelize';

/**
 * Сервис для мониторинга и валидации моделей
 * 
 * Функциональность:
 * - Отслеживание дрейфа моделей (data drift, concept drift)
 * - Автоматическое обнаружение деградации
 * - Алерты при обнаружении проблем
 * - Рекомендации по переобучению
 */
class ModelMonitoringService {
    constructor() {
        this.isInitialized = false;
        this.settings = {
            // Пороги для обнаружения дрейфа
            accuracyDropThreshold: 0.1, // Падение точности на 10%
            f1ScoreDropThreshold: 0.1, // Падение F1 Score на 10%
            winRateDropThreshold: 0.1, // Падение win rate на 10%
            
            // Пороги для обнаружения дрейфа данных
            predictionDistributionThreshold: 0.15, // Изменение распределения предсказаний на 15%
            confidenceDropThreshold: 0.2, // Падение средней уверенности на 20%
            
            // Окна для анализа
            baselineWindowDays: 30, // Окно для базовой линии (30 дней)
            comparisonWindowDays: 7, // Окно для сравнения (7 дней)
            minSamplesForDetection: 20, // Минимум образцов для детекции
            
            // Настройки алертов
            alertOnDrift: true,
            alertOnDegradation: true,
            autoRetrainOnDrift: false, // Автоматическое переобучение (по умолчанию выключено)
            
            // Интервалы проверки
            checkIntervalHours: 24, // Проверка раз в день
            lastCheckTime: null
        };
        
        // Кэш для быстрого доступа
        this.baselineMetrics = new Map(); // figi -> {accuracy, f1Score, winRate, ...}
        this.driftHistory = new Map(); // figi -> [{date, type, severity, metrics}, ...]
    }

    async initialize() {
        try {
            LoggerService.info('📊 Initializing Model Monitoring Service...');
            
            // Загружаем базовые метрики для всех моделей
            await this.loadBaselineMetrics();
            
            this.isInitialized = true;
            LoggerService.info('✅ Model Monitoring Service initialized');
        } catch (error) {
            LoggerService.error('❌ Failed to initialize Model Monitoring Service:', error);
            throw error;
        }
    }

    /**
     * Загрузка базовых метрик для всех моделей
     */
    async loadBaselineMetrics() {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - this.settings.baselineWindowDays);
            
            // Получаем средние метрики за базовый период
            const modelTypes = ['lstm', 'cnn', 'transformer', 'ensemble', 'metaLearning', 'reinforcementLearning', 'traditional'];
            
            for (const modelType of modelTypes) {
                const avgPerformance = await ModelPerformance.getAveragePerformance(
                    modelType,
                    null,
                    this.settings.baselineWindowDays
                );
                
                if (avgPerformance && avgPerformance.samplesCount > 0) {
                    this.baselineMetrics.set(modelType, {
                        accuracy: avgPerformance.accuracy,
                        f1Score: avgPerformance.f1Score,
                        winRate: avgPerformance.winRate,
                        averageReturn: avgPerformance.averageReturn,
                        periodStart: cutoffDate,
                        periodEnd: new Date(),
                        samplesCount: avgPerformance.samplesCount
                    });
                }
            }
        } catch (error) {
            LoggerService.warn('⚠️ Failed to load baseline metrics:', error.message);
        }
    }

    /**
     * Проверка дрейфа модели
     * @param {string} modelType - Тип модели
     * @param {string} figi - FIGI инструмента (опционально)
     * @returns {Promise<Object>} - Результат проверки
     */
    async checkModelDrift(modelType, figi = null) {
        try {
            // Получаем текущие метрики
            const currentMetrics = await this.getCurrentMetrics(modelType, figi);
            
            if (!currentMetrics || currentMetrics.samplesCount < this.settings.minSamplesForDetection) {
                return {
                    hasDrift: false,
                    reason: 'Insufficient data for drift detection',
                    currentMetrics,
                    baselineMetrics: null
                };
            }

            // Получаем базовые метрики
            const baseline = this.baselineMetrics.get(modelType);
            if (!baseline) {
                // Если нет базовой линии, устанавливаем текущие метрики как базовые
                this.baselineMetrics.set(modelType, {
                    accuracy: currentMetrics.accuracy,
                    f1Score: currentMetrics.f1Score,
                    winRate: currentMetrics.winRate,
                    averageReturn: currentMetrics.averageReturn,
                    periodStart: new Date(Date.now() - this.settings.baselineWindowDays * 24 * 60 * 60 * 1000),
                    periodEnd: new Date(),
                    samplesCount: currentMetrics.samplesCount
                });
                
                return {
                    hasDrift: false,
                    reason: 'Baseline not established yet',
                    currentMetrics,
                    baselineMetrics: this.baselineMetrics.get(modelType)
                };
            }

            // Проверяем деградацию метрик
            const accuracyDrop = (baseline.accuracy - currentMetrics.accuracy) / baseline.accuracy;
            const f1ScoreDrop = (baseline.f1Score - currentMetrics.f1Score) / baseline.f1Score;
            const winRateDrop = (baseline.winRate - currentMetrics.winRate) / baseline.winRate;

            const hasAccuracyDrift = accuracyDrop > this.settings.accuracyDropThreshold;
            const hasF1Drift = f1ScoreDrop > this.settings.f1ScoreDropThreshold;
            const hasWinRateDrift = winRateDrop > this.settings.winRateDropThreshold;

            const hasDrift = hasAccuracyDrift || hasF1Drift || hasWinRateDrift;

            // Определяем тип дрейфа
            let driftType = null;
            let severity = 'low';
            
            if (hasDrift) {
                if (hasAccuracyDrift && hasF1Drift && hasWinRateDrift) {
                    driftType = 'concept_drift'; // Полная деградация модели
                    severity = 'high';
                } else if (hasAccuracyDrift || hasF1Drift) {
                    driftType = 'performance_drift'; // Деградация производительности
                    severity = 'medium';
                } else if (hasWinRateDrift) {
                    driftType = 'trading_drift'; // Деградация торговых результатов
                    severity = 'medium';
                }
            }

            const result = {
                hasDrift,
                driftType,
                severity,
                currentMetrics,
                baselineMetrics: baseline,
                drops: {
                    accuracy: accuracyDrop,
                    f1Score: f1ScoreDrop,
                    winRate: winRateDrop
                },
                timestamp: new Date()
            };

            // Сохраняем в историю дрейфа
            if (hasDrift) {
                await this.recordDrift(modelType, figi, result);
                
                // Отправляем алерт, если включено
                if (this.settings.alertOnDrift) {
                    await this.sendDriftAlert(modelType, figi, result);
                }
            }

            return result;
        } catch (error) {
            LoggerService.error(`❌ Failed to check drift for ${modelType}:`, error);
            return {
                hasDrift: false,
                error: error.message,
                timestamp: new Date()
            };
        }
    }

    /**
     * Получение текущих метрик модели
     */
    async getCurrentMetrics(modelType, figi = null) {
        try {
            const avgPerformance = await ModelPerformance.getAveragePerformance(
                modelType,
                figi,
                this.settings.comparisonWindowDays
            );
            
            if (!avgPerformance || avgPerformance.samplesCount === 0) {
                return null;
            }

            return {
                accuracy: avgPerformance.accuracy,
                f1Score: avgPerformance.f1Score,
                winRate: avgPerformance.winRate,
                averageReturn: avgPerformance.averageReturn,
                totalTrades: avgPerformance.totalTrades,
                samplesCount: avgPerformance.samplesCount
            };
        } catch (error) {
            LoggerService.error(`❌ Failed to get current metrics for ${modelType}:`, error);
            return null;
        }
    }

    /**
     * Проверка дрейфа распределения предсказаний
     * @param {string} modelType - Тип модели
     * @param {string} figi - FIGI инструмента
     * @returns {Promise<Object>} - Результат проверки
     */
    async checkPredictionDistributionDrift(modelType, figi) {
        try {
            const baselineDate = new Date();
            baselineDate.setDate(baselineDate.getDate() - this.settings.baselineWindowDays);
            
            const comparisonDate = new Date();
            comparisonDate.setDate(comparisonDate.getDate() - this.settings.comparisonWindowDays);

            // Получаем рекомендации за базовый период
            const baselineRecs = await Recommendation.findAll({
                where: {
                    figi,
                    analysisDate: {
                        [Op.gte]: baselineDate,
                        [Op.lt]: comparisonDate
                    },
                    isActive: true
                }
            });

            // Получаем рекомендации за период сравнения
            const currentRecs = await Recommendation.findAll({
                where: {
                    figi,
                    analysisDate: {
                        [Op.gte]: comparisonDate
                    },
                    isActive: true
                }
            });

            if (baselineRecs.length < this.settings.minSamplesForDetection || 
                currentRecs.length < this.settings.minSamplesForDetection) {
                return {
                    hasDrift: false,
                    reason: 'Insufficient samples for distribution comparison'
                };
            }

            // Сравниваем распределение рекомендаций
            const baselineDist = this.calculateRecommendationDistribution(baselineRecs);
            const currentDist = this.calculateRecommendationDistribution(currentRecs);

            // Вычисляем расстояние между распределениями (Total Variation Distance)
            const tvd = this.calculateTVD(baselineDist, currentDist);

            const hasDrift = tvd > this.settings.predictionDistributionThreshold;

            return {
                hasDrift,
                tvd,
                baselineDistribution: baselineDist,
                currentDistribution: currentDist,
                threshold: this.settings.predictionDistributionThreshold
            };
        } catch (error) {
            LoggerService.error(`❌ Failed to check prediction distribution drift:`, error);
            return {
                hasDrift: false,
                error: error.message
            };
        }
    }

    /**
     * Расчет распределения рекомендаций
     */
    calculateRecommendationDistribution(recommendations) {
        const total = recommendations.length;
        if (total === 0) {
            return { BUY: 0, SELL: 0, HOLD: 0 };
        }

        const counts = { BUY: 0, SELL: 0, HOLD: 0 };
        let totalConfidence = 0;

        for (const rec of recommendations) {
            counts[rec.recommendation] = (counts[rec.recommendation] || 0) + 1;
            totalConfidence += rec.confidence || 0;
        }

        return {
            BUY: counts.BUY / total,
            SELL: counts.SELL / total,
            HOLD: counts.HOLD / total,
            avgConfidence: totalConfidence / total
        };
    }

    /**
     * Расчет Total Variation Distance между распределениями
     */
    calculateTVD(dist1, dist2) {
        const keys = ['BUY', 'SELL', 'HOLD'];
        let tvd = 0;
        
        for (const key of keys) {
            tvd += Math.abs((dist1[key] || 0) - (dist2[key] || 0));
        }
        
        return tvd / 2; // Нормализация
    }

    /**
     * Запись дрейфа в историю
     */
    async recordDrift(modelType, figi, driftResult) {
        try {
            const key = figi ? `${modelType}_${figi}` : modelType;
            const history = this.driftHistory.get(key) || [];
            
            history.push({
                date: new Date(),
                type: driftResult.driftType,
                severity: driftResult.severity,
                metrics: driftResult.currentMetrics,
                drops: driftResult.drops
            });

            // Ограничиваем историю последними 100 записями
            if (history.length > 100) {
                history.shift();
            }

            this.driftHistory.set(key, history);
        } catch (error) {
            LoggerService.warn(`⚠️ Failed to record drift:`, error.message);
        }
    }

    /**
     * Отправка алерта о дрейфе
     */
    async sendDriftAlert(modelType, figi, driftResult) {
        try {
            const OptimizedTelegramService = (await import('./OptimizedTelegramService.js')).default;
            
            const message = `⚠️ Model Drift Detected\n\n` +
                `Model: ${modelType}\n` +
                `FIGI: ${figi || 'All'}\n` +
                `Type: ${driftResult.driftType}\n` +
                `Severity: ${driftResult.severity}\n\n` +
                `Drops:\n` +
                `- Accuracy: ${(driftResult.drops.accuracy * 100).toFixed(2)}%\n` +
                `- F1 Score: ${(driftResult.drops.f1Score * 100).toFixed(2)}%\n` +
                `- Win Rate: ${(driftResult.drops.winRate * 100).toFixed(2)}%`;

            await OptimizedTelegramService.sendAlert('MODEL_DRIFT', {
                modelType,
                figi,
                driftType: driftResult.driftType,
                severity: driftResult.severity,
                message
            });
        } catch (error) {
            LoggerService.warn(`⚠️ Failed to send drift alert:`, error.message);
        }
    }

    /**
     * Проверка всех моделей на дрейф
     */
    async checkAllModels() {
        try {
            const modelTypes = ['lstm', 'cnn', 'transformer', 'ensemble', 'metaLearning', 'reinforcementLearning', 'traditional'];
            const results = {};

            for (const modelType of modelTypes) {
                results[modelType] = await this.checkModelDrift(modelType);
            }

            this.settings.lastCheckTime = new Date();
            return results;
        } catch (error) {
            LoggerService.error('❌ Failed to check all models:', error);
            return {};
        }
    }

    /**
     * Получение истории дрейфа
     */
    getDriftHistory(modelType, figi = null) {
        const key = figi ? `${modelType}_${figi}` : modelType;
        return this.driftHistory.get(key) || [];
    }

    /**
     * Получение статуса мониторинга
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            baselineModelsCount: this.baselineMetrics.size,
            lastCheckTime: this.settings.lastCheckTime,
            settings: { ...this.settings }
        };
    }

    /**
     * Обновление базовых метрик (после переобучения)
     */
    async updateBaseline(modelType, figi = null) {
        try {
            const currentMetrics = await this.getCurrentMetrics(modelType, figi);
            if (currentMetrics) {
                const key = figi ? `${modelType}_${figi}` : modelType;
                this.baselineMetrics.set(key, {
                    ...currentMetrics,
                    periodStart: new Date(Date.now() - this.settings.baselineWindowDays * 24 * 60 * 60 * 1000),
                    periodEnd: new Date()
                });
                
                LoggerService.info(`✅ Baseline updated for ${modelType}${figi ? ` (${figi})` : ''}`);
            }
        } catch (error) {
            LoggerService.error(`❌ Failed to update baseline for ${modelType}:`, error);
        }
    }
}

export default new ModelMonitoringService();

