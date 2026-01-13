import CacheService from './CacheService.js';
import Recommendation from '../models/Recommendation.js';
import PositionStrategy from '../models/PositionStrategy.js';
import TradingRequest from '../models/TradingRequest.js';
import SettingsService from './SettingsService.js';
import LoggerService from './LoggerService.js';
import { Op } from 'sequelize';

/**
 * Сервис для оптимизации выходов из позиций
 * 
 * Функциональность:
 * - Выход при изменении фундаментальных факторов
 * - Выход при достижении временного горизонта стратегии
 * - Выход при снижении confidence ниже порога
 * - Учет налоговых последствий (ИИС, долгосрочные позиции > 3 лет)
 */
class ExitOptimizationService {
    constructor() {
        this.isInitialized = false;
        this.settings = {
            // Пороги для выхода
            minConfidenceThreshold: 0.5,  // Минимальная уверенность для удержания позиции
            confidenceDropThreshold: 0.2,  // Падение уверенности на 20% от исходной
            
            // Временные горизонты
            checkTimeHorizon: true,        // Проверять временной горизонт стратегии
            timeHorizonWarningDays: 7,     // Предупреждение за 7 дней до окончания горизонта
            
            // Фундаментальные факторы
            checkFundamentalChanges: true, // Проверять изменения фундаментальных факторов
            fundamentalChangeThreshold: 0.15, // Изменение на 15% считается значимым
            
            // Налоговые последствия
            considerTaxOptimization: true, // Учитывать налоговые последствия
            iisAccount: false,             // Используется ли ИИС
            longTermThresholdDays: 1095,   // 3 года для долгосрочных позиций (налоговые льготы)
            
            // Дополнительные проверки
            checkRecommendationChange: true, // Проверять изменение рекомендации AI
            checkStopLossProximity: true,    // Проверять близость к стоп-лоссу
            stopLossProximityPercent: 2.0    // Предупреждение при приближении к стоп-лоссу на 2%
        };
    }

    async initialize() {
        try {
            // Загружаем настройки
            await this.loadSettings();
            
            this.isInitialized = true;
        } catch (error) {
            LoggerService.error('❌ Failed to initialize Exit Optimization Service:', error);
            throw error;
        }
    }

    /**
     * Загрузка настроек из базы данных
     */
    async loadSettings() {
        try {
            const settings = await SettingsService.getAllSettings('exit_optimization');
            
            if (settings && settings.length > 0) {
                for (const setting of settings) {
                    const key = setting.key.replace('exit_optimization.', '');
                    const value = setting.value;
                    
                    if (key.includes('threshold') || key.includes('percent') || key.includes('days')) {
                        this.settings[key] = parseFloat(value) || this.settings[key];
                    } else if (key.includes('enabled') || key.includes('check') || key.includes('consider')) {
                        this.settings[key] = value === 'true' || value === true;
                    }
                }
            }
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Failed to load exit optimization settings', {
                    service: 'ExitOptimizationService',
                    operation: 'loadSettings',
                    error: { message: error.message, stack: error.stack }
                });
            }
        }
    }

    /**
     * Анализ позиции для определения необходимости выхода
     * @param {Object} position - Позиция (TradingRequest)
     * @param {Object} options - Дополнительные опции
     * @returns {Object} - Результат анализа с рекомендациями
     */
    async analyzeExit(position, options = {}) {
        try {
            if (!this.isInitialized) {
                throw new Error('ExitOptimizationService не инициализирован');
            }

            if (!position || !position.id || !position.figi) {
                throw new Error('Недостаточно данных для анализа выхода');
            }

            const currentPrice = options.currentPrice || await this.getCurrentPrice(position.figi);
            if (!currentPrice || currentPrice <= 0) {
                return {
                    shouldExit: false,
                    reason: 'Не удалось получить текущую цену',
                    recommendation: 'hold',
                    analysis: null
                };
            }

            // Получаем связанную стратегию
            const positionStrategy = await PositionStrategy.findOne({
                where: { positionId: position.id }
            });

            // Получаем текущую рекомендацию AI
            const currentRecommendation = await Recommendation.findOne({
                where: { figi: position.figi },
                order: [['analysisDate', 'DESC']]
            });

            // Анализируем различные факторы
            const analysis = {
                timeHorizon: this.analyzeTimeHorizon(position, positionStrategy),
                confidence: this.analyzeConfidence(position, currentRecommendation),
                fundamental: await this.analyzeFundamentalChanges(position, currentRecommendation),
                recommendation: this.analyzeRecommendationChange(position, currentRecommendation),
                stopLoss: this.analyzeStopLossProximity(position, currentPrice),
                tax: this.analyzeTaxOptimization(position, positionStrategy)
            };

            // Определяем, нужно ли выходить
            const exitReasons = [];
            let exitPriority = 'low';

            // Критические причины для выхода
            if (analysis.confidence.shouldExit) {
                exitReasons.push(analysis.confidence.reason);
                exitPriority = 'high';
            }

            if (analysis.timeHorizon.shouldExit) {
                exitReasons.push(analysis.timeHorizon.reason);
                if (analysis.timeHorizon.isExpired) {
                    exitPriority = 'high';
                }
            }

            if (analysis.recommendation.shouldExit) {
                exitReasons.push(analysis.recommendation.reason);
                exitPriority = 'medium';
            }

            if (analysis.stopLoss.shouldExit) {
                exitReasons.push(analysis.stopLoss.reason);
                exitPriority = 'high';
            }

            // Предупреждающие причины (не критичные, но важные)
            const warnings = [];
            if (analysis.fundamental.shouldExit) {
                warnings.push(analysis.fundamental.reason);
            }

            if (analysis.tax.shouldConsiderExit) {
                warnings.push(analysis.tax.reason);
            }

            const shouldExit = exitReasons.length > 0;
            const shouldConsiderExit = warnings.length > 0 && !shouldExit;

            return {
                shouldExit,
                shouldConsiderExit,
                reason: shouldExit 
                    ? exitReasons.join('; ') 
                    : (shouldConsiderExit ? warnings.join('; ') : 'Позиция соответствует критериям удержания'),
                recommendation: shouldExit ? 'exit' : (shouldConsiderExit ? 'consider_exit' : 'hold'),
                priority: exitPriority,
                analysis,
                exitReasons,
                warnings,
                suggestedExitPrice: currentPrice,
                suggestedExitPercent: this.calculateExitPercent(position, currentPrice)
            };
        } catch (error) {
            LoggerService.error('❌ Error analyzing exit:', error);
            return {
                shouldExit: false,
                reason: `Ошибка анализа: ${error.message}`,
                recommendation: 'error',
                analysis: null
            };
        }
    }

    /**
     * Анализ временного горизонта стратегии
     */
    analyzeTimeHorizon(position, positionStrategy) {
        if (!this.settings.checkTimeHorizon || !positionStrategy) {
            return { shouldExit: false, reason: 'Временной горизонт не проверяется', isExpired: false };
        }

        const now = new Date();
        const entryDate = new Date(positionStrategy.entryDate);
        const expectedExitDate = new Date(positionStrategy.expectedExitDate);
        const daysSinceEntry = Math.floor((now - entryDate) / (1000 * 60 * 60 * 24));
        const daysUntilExit = Math.floor((expectedExitDate - now) / (1000 * 60 * 60 * 24));

        if (daysUntilExit < 0) {
            return {
                shouldExit: true,
                reason: `Временной горизонт стратегии истек (${Math.abs(daysUntilExit)} дней назад)`,
                isExpired: true,
                daysSinceEntry,
                daysUntilExit
            };
        }

        if (daysUntilExit <= this.settings.timeHorizonWarningDays) {
            return {
                shouldExit: true,
                reason: `Приближается окончание временного горизонта стратегии (осталось ${daysUntilExit} дней)`,
                isExpired: false,
                daysSinceEntry,
                daysUntilExit
            };
        }

        return {
            shouldExit: false,
            reason: `Временной горизонт в норме (осталось ${daysUntilExit} дней)`,
            isExpired: false,
            daysSinceEntry,
            daysUntilExit
        };
    }

    /**
     * Анализ уверенности (confidence)
     */
    analyzeConfidence(position, currentRecommendation) {
        if (!currentRecommendation) {
            return { shouldExit: false, reason: 'Текущая рекомендация недоступна', currentConfidence: null };
        }

        const originalConfidence = position.confidence || 0.7;
        const currentConfidence = currentRecommendation.confidence || 0.5;
        const confidenceDrop = originalConfidence - currentConfidence;
        const confidenceDropPercent = (confidenceDrop / originalConfidence) * 100;

        // Проверяем абсолютный порог
        if (currentConfidence < this.settings.minConfidenceThreshold) {
            return {
                shouldExit: true,
                reason: `Уверенность упала ниже минимума (${(currentConfidence * 100).toFixed(1)}% < ${(this.settings.minConfidenceThreshold * 100)}%)`,
                currentConfidence,
                originalConfidence,
                confidenceDrop,
                confidenceDropPercent
            };
        }

        // Проверяем относительное падение
        if (confidenceDropPercent >= (this.settings.confidenceDropThreshold * 100)) {
            return {
                shouldExit: true,
                reason: `Уверенность упала на ${confidenceDropPercent.toFixed(1)}% от исходной (${(originalConfidence * 100).toFixed(1)}% → ${(currentConfidence * 100).toFixed(1)}%)`,
                currentConfidence,
                originalConfidence,
                confidenceDrop,
                confidenceDropPercent
            };
        }

        return {
            shouldExit: false,
            reason: `Уверенность в норме (${(currentConfidence * 100).toFixed(1)}%)`,
            currentConfidence,
            originalConfidence,
            confidenceDrop,
            confidenceDropPercent
        };
    }

    /**
     * Анализ изменения фундаментальных факторов
     */
    async analyzeFundamentalChanges(position, currentRecommendation) {
        if (!this.settings.checkFundamentalChanges || !currentRecommendation) {
            return { shouldExit: false, reason: 'Проверка фундаментальных факторов отключена' };
        }

        // Получаем исходную рекомендацию (при входе)
        const originalRecommendation = await Recommendation.findOne({
            where: { figi: position.figi },
            order: [['analysisDate', 'ASC']]
        });

        if (!originalRecommendation) {
            return { shouldExit: false, reason: 'Исходная рекомендация недоступна' };
        }

        // Сравниваем score (оценку) как индикатор фундаментальных факторов
        const originalScore = originalRecommendation.score || 0.5;
        const currentScore = currentRecommendation.score || 0.5;
        const scoreChange = currentScore - originalScore;
        const scoreChangePercent = (scoreChange / originalScore) * 100;

        if (Math.abs(scoreChangePercent) >= (this.settings.fundamentalChangeThreshold * 100)) {
            const direction = scoreChangePercent < 0 ? 'ухудшилась' : 'улучшилась';
            return {
                shouldExit: scoreChangePercent < 0, // Выходим только если ухудшилась
                reason: `Фундаментальная оценка ${direction} на ${Math.abs(scoreChangePercent).toFixed(1)}% (${(originalScore * 100).toFixed(1)}% → ${(currentScore * 100).toFixed(1)}%)`,
                originalScore,
                currentScore,
                scoreChange,
                scoreChangePercent
            };
        }

        return {
            shouldExit: false,
            reason: `Фундаментальная оценка стабильна (${(currentScore * 100).toFixed(1)}%)`,
            originalScore,
            currentScore,
            scoreChange,
            scoreChangePercent
        };
    }

    /**
     * Анализ изменения рекомендации AI
     */
    analyzeRecommendationChange(position, currentRecommendation) {
        if (!this.settings.checkRecommendationChange || !currentRecommendation) {
            return { shouldExit: false, reason: 'Проверка изменения рекомендации отключена' };
        }

        const originalAction = position.action; // BUY или SELL
        const currentRecommendationType = currentRecommendation.recommendation; // BUY, SELL, HOLD

        // Если позиция BUY, а рекомендация стала SELL - нужно выходить
        if (originalAction === 'BUY' && currentRecommendationType === 'SELL') {
            return {
                shouldExit: true,
                reason: 'Рекомендация AI изменилась с BUY на SELL',
                originalAction,
                currentRecommendation: currentRecommendationType
            };
        }

        // Если позиция SELL, а рекомендация стала BUY - нужно выходить (закрывать короткую позицию)
        if (originalAction === 'SELL' && currentRecommendationType === 'BUY') {
            return {
                shouldExit: true,
                reason: 'Рекомендация AI изменилась с SELL на BUY (закрытие короткой позиции)',
                originalAction,
                currentRecommendation: currentRecommendationType
            };
        }

        // Если рекомендация стала HOLD - предупреждение, но не обязательно выходить
        if (currentRecommendationType === 'HOLD') {
            return {
                shouldExit: false,
                reason: 'Рекомендация AI изменилась на HOLD (рассмотреть выход)',
                originalAction,
                currentRecommendation: currentRecommendationType
            };
        }

        return {
            shouldExit: false,
            reason: `Рекомендация AI соответствует позиции (${currentRecommendationType})`,
            originalAction,
            currentRecommendation: currentRecommendationType
        };
    }

    /**
     * Анализ близости к стоп-лоссу
     */
    analyzeStopLossProximity(position, currentPrice) {
        if (!this.settings.checkStopLossProximity || !position.stopLoss) {
            return { shouldExit: false, reason: 'Стоп-лосс не установлен или проверка отключена' };
        }

        const stopLoss = position.stopLoss;
        const entryPrice = position.actualPrice || position.priceAtRequest;
        const distanceToStopLoss = Math.abs(currentPrice - stopLoss);
        const distancePercent = (distanceToStopLoss / entryPrice) * 100;

        if (distancePercent <= this.settings.stopLossProximityPercent) {
            return {
                shouldExit: true,
                reason: `Цена приблизилась к стоп-лоссу (${distancePercent.toFixed(2)}% до стоп-лосса)`,
                stopLoss,
                currentPrice,
                distanceToStopLoss,
                distancePercent
            };
        }

        return {
            shouldExit: false,
            reason: `Расстояние до стоп-лосса безопасное (${distancePercent.toFixed(2)}%)`,
            stopLoss,
            currentPrice,
            distanceToStopLoss,
            distancePercent
        };
    }

    /**
     * Анализ налоговых последствий
     */
    analyzeTaxOptimization(position, positionStrategy) {
        if (!this.settings.considerTaxOptimization) {
            return { shouldConsiderExit: false, reason: 'Учет налоговых последствий отключен' };
        }

        const now = new Date();
        const entryDate = new Date(position.createdAt || positionStrategy?.entryDate || now);
        const daysSinceEntry = Math.floor((now - entryDate) / (1000 * 60 * 60 * 24));

        // Проверяем долгосрочную позицию (более 3 лет для налоговых льгот)
        if (daysSinceEntry >= this.settings.longTermThresholdDays) {
            return {
                shouldConsiderExit: true,
                reason: `Позиция удерживается более 3 лет - возможны налоговые льготы при выходе`,
                daysSinceEntry,
                isLongTerm: true
            };
        }

        // Если используется ИИС, учитываем особенности
        if (this.settings.iisAccount) {
            const daysUntilLongTerm = this.settings.longTermThresholdDays - daysSinceEntry;
            if (daysUntilLongTerm <= 365) {
                return {
                    shouldConsiderExit: true,
                    reason: `До получения налоговых льгот осталось ${daysUntilLongTerm} дней (ИИС)`,
                    daysSinceEntry,
                    daysUntilLongTerm,
                    isLongTerm: false
                };
            }
        }

        return {
            shouldConsiderExit: false,
            reason: `Налоговые последствия в норме (${daysSinceEntry} дней с момента входа)`,
            daysSinceEntry,
            isLongTerm: false
        };
    }

    /**
     * Получение текущей цены
     */
    async getCurrentPrice(figi) {
        try {
            const TinkoffApiService = (await import('./TinkoffApiService.js')).default;
            const lastPrices = await TinkoffApiService.getLastPrices([figi]);
            if (lastPrices && lastPrices[figi] && typeof lastPrices[figi] === 'number' && lastPrices[figi] > 0) {
                return lastPrices[figi];
            }
            return null;
        } catch (error) {
            LoggerService.warn(`⚠️ Failed to get current price for ${figi}:`, error.message);
            return null;
        }
    }

    /**
     * Расчет процента прибыли/убытка
     */
    calculateExitPercent(position, currentPrice) {
        const entryPrice = position.actualPrice || position.priceAtRequest;
        if (!entryPrice || entryPrice <= 0) {
            return null;
        }

        const profitPercent = position.action === 'BUY'
            ? ((currentPrice - entryPrice) / entryPrice) * 100
            : ((entryPrice - currentPrice) / entryPrice) * 100;

        return profitPercent;
    }

    /**
     * Получение текущих настроек
     */
    getSettings() {
        return { ...this.settings };
    }

    /**
     * Обновление настроек
     */
    async updateSettings(newSettings) {
        try {
            this.settings = { ...this.settings, ...newSettings };
            
            for (const [key, value] of Object.entries(newSettings)) {
                await SettingsService.updateSetting(`exit_optimization.${key}`, value);
            }
            
            return true;
        } catch (error) {
            LoggerService.error('❌ Failed to update exit optimization settings:', error);
            throw error;
        }
    }
}

export default new ExitOptimizationService();

