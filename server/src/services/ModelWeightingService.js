import ModelPerformance from '../models/ModelPerformance.js';
import SettingsService from './SettingsService.js';
import LoggerService from './LoggerService.js';
import { Op } from 'sequelize';

/**
 * Сервис для динамического взвешивания моделей
 * 
 * Функциональность:
 * - Отслеживание производительности каждой модели (скользящее окно 30 дней)
 * - Расчет динамических весов на основе актуальной точности
 * - Учет согласованности с другими моделями
 * - Учет производительности на конкретном инструменте
 * - Автоматическое отключение деградирующих моделей
 */
class ModelWeightingService {
    constructor() {
        this.isInitialized = false;
        this.settings = {
            // Период анализа производительности
            performanceWindowDays: 30, // Скользящее окно 30 дней
            
            // Минимальные пороги для активации модели
            minAccuracy: 0.5, // Минимальная точность 50%
            minF1Score: 0.4, // Минимальный F1 Score 40%
            minWinRate: 0.45, // Минимальный win rate 45%
            
            // Пороги для автоматического отключения
            degradationThreshold: 0.1, // Отключить, если производительность упала на 10%
            minTradesForEvaluation: 10, // Минимум сделок для оценки
            
            // Веса факторов при расчете веса модели
            accuracyWeight: 0.3, // Вес точности
            f1ScoreWeight: 0.25, // Вес F1 Score
            winRateWeight: 0.25, // Вес win rate
            agreementWeight: 0.1, // Вес согласованности
            instrumentSpecificWeight: 0.1, // Вес производительности на конкретном инструменте
            
            // Настройки согласованности
            agreementWindowDays: 7, // Окно для расчета согласованности (7 дней)
            minAgreement: 0.6, // Минимальная согласованность 60%
            
            // Автоматическое обновление весов
            autoUpdateWeights: true, // Автоматически обновлять веса
            updateIntervalHours: 24 // Обновлять веса каждые 24 часа
        };
        
        // Кэш весов моделей
        this.cachedWeights = {};
        this.lastWeightUpdate = null;
    }

    async initialize() {
        try {
            LoggerService.info('⚖️ Initializing Model Weighting Service...');
            
            // Загружаем настройки
            await this.loadSettings();
            
            // Загружаем текущие веса
            await this.loadCachedWeights();
            
            this.isInitialized = true;
            LoggerService.info('✅ Model Weighting Service initialized');
        } catch (error) {
            LoggerService.error('❌ Failed to initialize Model Weighting Service:', error);
            throw error;
        }
    }

    /**
     * Загрузка настроек из базы данных
     */
    async loadSettings() {
        try {
            const settings = await SettingsService.getAllSettings('model_weighting');
            
            if (settings && settings.length > 0) {
                for (const setting of settings) {
                    const key = setting.key.replace('model_weighting.', '');
                    const value = setting.value;
                    
                    if (key.includes('days') || key.includes('hours') || key.includes('weight') || key.includes('threshold') || key.includes('min') || key.includes('max')) {
                        this.settings[key] = parseFloat(value) || this.settings[key];
                    } else if (key.includes('auto') || key.includes('enabled')) {
                        this.settings[key] = value === 'true' || value === true;
                    }
                }
            }
        } catch (error) {
            LoggerService.warn('⚠️ Failed to load model weighting settings, using defaults:', error.message);
        }
    }

    /**
     * Загрузка кэшированных весов
     */
    async loadCachedWeights() {
        try {
            // Загружаем последние веса для всех моделей
            const modelTypes = ['lstm', 'cnn', 'transformer', 'ensemble', 'metaLearning', 'reinforcementLearning', 'traditional'];
            
            for (const modelType of modelTypes) {
                const latest = await ModelPerformance.getLatestPerformance(modelType);
                if (latest && latest.calculatedWeight) {
                    this.cachedWeights[modelType] = parseFloat(latest.calculatedWeight);
                }
            }
        } catch (error) {
            LoggerService.warn('⚠️ Failed to load cached weights:', error.message);
        }
    }

    /**
     * Запись производительности модели
     * @param {string} modelType - Тип модели
     * @param {Object} metrics - Метрики производительности
     * @param {string} figi - FIGI инструмента (опционально)
     */
    async recordPerformance(modelType, metrics, figi = null) {
        try {
            const periodEnd = new Date();
            const periodStart = new Date();
            periodStart.setDate(periodStart.getDate() - this.settings.performanceWindowDays);
            
            // Проверяем, есть ли уже запись за этот период
            const existing = await ModelPerformance.findOne({
                where: {
                    modelType,
                    figi: figi || null,
                    periodEnd: {
                        [Op.gte]: periodStart
                    }
                },
                order: [['periodEnd', 'DESC']]
            });
            
            const performanceData = {
                modelType,
                figi: figi || null,
                periodStart,
                periodEnd,
                accuracy: metrics.accuracy || 0,
                precision: metrics.precision || 0,
                recall: metrics.recall || 0,
                f1Score: metrics.f1Score || 0,
                winRate: metrics.winRate || 0,
                averageReturn: metrics.averageReturn || 0,
                sharpeRatio: metrics.sharpeRatio || null,
                totalTrades: metrics.totalTrades || 0,
                profitableTrades: metrics.profitableTrades || 0,
                agreement: metrics.agreement || null,
                isActive: true,
                metadata: metrics.metadata || {}
            };
            
            if (existing) {
                // Обновляем существующую запись
                await existing.update(performanceData);
            } else {
                // Создаем новую запись
                await ModelPerformance.create(performanceData);
            }
            
            // Пересчитываем вес модели
            await this.calculateModelWeight(modelType, figi);
            
        } catch (error) {
            LoggerService.error(`❌ Failed to record performance for ${modelType}:`, error);
            throw error;
        }
    }

    /**
     * Расчет веса модели на основе производительности
     * @param {string} modelType - Тип модели
     * @param {string} figi - FIGI инструмента (опционально)
     * @returns {number} - Вес модели (0-1)
     */
    async calculateModelWeight(modelType, figi = null) {
        try {
            // Получаем среднюю производительность за период
            const avgPerformance = await ModelPerformance.getAveragePerformance(
                modelType,
                figi,
                this.settings.performanceWindowDays
            );
            
            if (!avgPerformance || avgPerformance.samplesCount === 0) {
                // Если нет данных, используем дефолтный вес
                const defaultWeight = 1.0 / 7; // Равномерное распределение между 7 типами моделей
                this.cachedWeights[modelType] = defaultWeight;
                return defaultWeight;
            }
            
            // Сначала проверяем количество сделок
            // Если сделок недостаточно, не проверяем пороги и не деактивируем модель
            if (avgPerformance.totalTrades < this.settings.minTradesForEvaluation) {
                // Недостаточно данных для оценки - используем дефолтный вес
                const defaultWeight = 1.0 / 7;
                this.cachedWeights[modelType] = defaultWeight;
                return defaultWeight;
            }
            
            // Только если сделок достаточно, проверяем минимальные пороги
            if (avgPerformance.accuracy < this.settings.minAccuracy ||
                avgPerformance.f1Score < this.settings.minF1Score ||
                avgPerformance.winRate < this.settings.minWinRate) {
                // Модель не проходит минимальные пороги
                this.cachedWeights[modelType] = 0;
                await this.deactivateModel(modelType, 'Below minimum thresholds');
                return 0;
            }
            
            // Рассчитываем вес на основе факторов
            let weight = 0;
            
            // Фактор точности
            weight += avgPerformance.accuracy * this.settings.accuracyWeight;
            
            // Фактор F1 Score
            weight += avgPerformance.f1Score * this.settings.f1ScoreWeight;
            
            // Фактор win rate
            weight += avgPerformance.winRate * this.settings.winRateWeight;
            
            // Фактор согласованности
            if (avgPerformance.agreement) {
                weight += avgPerformance.agreement * this.settings.agreementWeight;
            }
            
            // Фактор производительности на конкретном инструменте (если указан)
            if (figi) {
                const instrumentPerformance = await ModelPerformance.getAveragePerformance(
                    modelType,
                    figi,
                    this.settings.performanceWindowDays
                );
                if (instrumentPerformance && instrumentPerformance.f1Score > 0) {
                    weight += instrumentPerformance.f1Score * this.settings.instrumentSpecificWeight;
                }
            }
            
            // Нормализуем вес (0-1)
            weight = Math.max(0, Math.min(1, weight));
            
            // Сохраняем вес в кэш
            this.cachedWeights[modelType] = weight;
            
            // Обновляем запись производительности
            const latest = await ModelPerformance.getLatestPerformance(modelType, figi);
            if (latest) {
                await latest.update({ calculatedWeight: weight });
            }
            
            return weight;
        } catch (error) {
            LoggerService.error(`❌ Failed to calculate weight for ${modelType}:`, error);
            return this.cachedWeights[modelType] || (1.0 / 7);
        }
    }

    /**
     * Получение весов для всех моделей
     * @param {string} figi - FIGI инструмента (опционально, для инструмент-специфичных весов)
     * @returns {Object} - Веса моделей
     */
    async getModelWeights(figi = null) {
        try {
            const modelTypes = ['lstm', 'cnn', 'transformer', 'ensemble', 'metaLearning', 'reinforcementLearning', 'traditional'];
            const weights = {};
            
            // Проверяем, нужно ли обновить веса
            const shouldUpdate = !this.lastWeightUpdate || 
                (Date.now() - this.lastWeightUpdate) > (this.settings.updateIntervalHours * 60 * 60 * 1000);
            
            if (shouldUpdate && this.settings.autoUpdateWeights) {
                // Пересчитываем веса для всех моделей
                for (const modelType of modelTypes) {
                    await this.calculateModelWeight(modelType, figi);
                }
                this.lastWeightUpdate = Date.now();
            }
            
            // Собираем веса
            let totalWeight = 0;
            for (const modelType of modelTypes) {
                const weight = await this.calculateModelWeight(modelType, figi);
                if (weight > 0) {
                    weights[modelType] = weight;
                    totalWeight += weight;
                }
            }
            
            // Нормализуем веса, чтобы сумма была равна 1
            if (totalWeight > 0) {
                for (const modelType in weights) {
                    weights[modelType] = weights[modelType] / totalWeight;
                }
            } else {
                // Если все веса равны 0, используем равномерное распределение
                const equalWeight = 1.0 / modelTypes.length;
                modelTypes.forEach(type => {
                    weights[type] = equalWeight;
                });
            }
            
            return weights;
        } catch (error) {
            LoggerService.error('❌ Failed to get model weights:', error);
            // Возвращаем равномерное распределение в случае ошибки
            const modelTypes = ['lstm', 'cnn', 'transformer', 'ensemble', 'metaLearning', 'reinforcementLearning', 'traditional'];
            const equalWeight = 1.0 / modelTypes.length;
            const weights = {};
            modelTypes.forEach(type => {
                weights[type] = equalWeight;
            });
            return weights;
        }
    }

    /**
     * Расчет согласованности моделей
     * @param {Array} recommendations - Массив рекомендаций от разных моделей
     * @returns {number} - Согласованность (0-1)
     */
    calculateAgreement(recommendations) {
        if (!recommendations || recommendations.length < 2) {
            return 1.0; // Если одна рекомендация, согласованность 100%
        }
        
        // Подсчитываем количество совпадений рекомендаций
        const recommendationCounts = {};
        recommendations.forEach(rec => {
            const recType = rec.recommendation || rec.action || 'HOLD';
            recommendationCounts[recType] = (recommendationCounts[recType] || 0) + 1;
        });
        
        // Находим наиболее частую рекомендацию
        const maxCount = Math.max(...Object.values(recommendationCounts));
        const agreement = maxCount / recommendations.length;
        
        return agreement;
    }

    /**
     * Расчет корреляции между предсказаниями моделей
     * @param {Array} predictions - Массив предсказаний от разных моделей [{source, score, confidence}, ...]
     * @returns {Object} - Матрица корреляций {source1: {source2: correlation, ...}, ...}
     */
    calculateCorrelation(predictions) {
        if (!predictions || predictions.length < 2) {
            return {};
        }
        
        const correlationMatrix = {};
        
        // Извлекаем scores для каждой модели
        const scoresBySource = {};
        predictions.forEach(pred => {
            const source = pred.source || 'unknown';
            if (!scoresBySource[source]) {
                scoresBySource[source] = [];
            }
            scoresBySource[source].push(pred.score || 0.5);
        });
        
        // Рассчитываем корреляцию между каждой парой моделей
        const sources = Object.keys(scoresBySource);
        
        for (let i = 0; i < sources.length; i++) {
            const source1 = sources[i];
            if (!correlationMatrix[source1]) {
                correlationMatrix[source1] = {};
            }
            
            for (let j = 0; j < sources.length; j++) {
                const source2 = sources[j];
                
                if (source1 === source2) {
                    correlationMatrix[source1][source2] = 1.0; // Корреляция с собой = 1
                } else {
                    const scores1 = scoresBySource[source1];
                    const scores2 = scoresBySource[source2];
                    
                    // Выравниваем длины (берем минимум)
                    const minLength = Math.min(scores1.length, scores2.length);
                    const alignedScores1 = scores1.slice(0, minLength);
                    const alignedScores2 = scores2.slice(0, minLength);
                    
                    // Рассчитываем корреляцию Пирсона
                    const correlation = this.calculatePearsonCorrelation(alignedScores1, alignedScores2);
                    correlationMatrix[source1][source2] = correlation;
                }
            }
        }
        
        return correlationMatrix;
    }

    /**
     * Расчет корреляции Пирсона
     * @param {Array} x - Первый массив значений
     * @param {Array} y - Второй массив значений
     * @returns {number} - Корреляция (-1 до 1)
     */
    calculatePearsonCorrelation(x, y) {
        if (x.length !== y.length || x.length === 0) {
            return 0;
        }
        
        const n = x.length;
        const sumX = x.reduce((sum, val) => sum + val, 0);
        const sumY = y.reduce((sum, val) => sum + val, 0);
        const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
        const sumX2 = x.reduce((sum, val) => sum + val * val, 0);
        const sumY2 = y.reduce((sum, val) => sum + val * val, 0);
        
        const numerator = n * sumXY - sumX * sumY;
        const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
        
        if (denominator === 0) {
            return 0;
        }
        
        return numerator / denominator;
    }

    /**
     * Корректировка уверенности с учетом корреляции между моделями
     * Высокая корреляция означает, что модели дают похожие предсказания,
     * что снижает общую уверенность (меньше разнообразия)
     * @param {Array} predictions - Предсказания от разных моделей
     * @param {number} baseConfidence - Базовая уверенность
     * @returns {number} - Скорректированная уверенность
     */
    adjustConfidenceForCorrelation(predictions, baseConfidence) {
        if (!predictions || predictions.length < 2) {
            return baseConfidence;
        }
        
        // Рассчитываем среднюю корреляцию между всеми парами моделей
        const correlationMatrix = this.calculateCorrelation(predictions);
        const sources = Object.keys(correlationMatrix);
        
        if (sources.length < 2) {
            return baseConfidence;
        }
        
        let totalCorrelation = 0;
        let pairCount = 0;
        
        for (let i = 0; i < sources.length; i++) {
            for (let j = i + 1; j < sources.length; j++) {
                const source1 = sources[i];
                const source2 = sources[j];
                const correlation = correlationMatrix[source1][source2] || 0;
                totalCorrelation += Math.abs(correlation); // Используем абсолютное значение
                pairCount++;
            }
        }
        
        const avgCorrelation = pairCount > 0 ? totalCorrelation / pairCount : 0;
        
        // Высокая корреляция (> 0.7) снижает уверенность
        // Низкая корреляция (< 0.3) повышает уверенность (разнообразие мнений)
        let adjustmentFactor = 1.0;
        
        if (avgCorrelation > 0.7) {
            // Высокая корреляция - снижаем уверенность на 20-40%
            adjustmentFactor = 1.0 - (avgCorrelation - 0.7) * 1.33; // От 1.0 до 0.6
        } else if (avgCorrelation < 0.3) {
            // Низкая корреляция - повышаем уверенность на 10-20%
            adjustmentFactor = 1.0 + (0.3 - avgCorrelation) * 0.67; // От 1.0 до 1.2
        }
        
        return Math.max(0, Math.min(1, baseConfidence * adjustmentFactor));
    }

    /**
     * Обновление согласованности для модели
     * @param {string} modelType - Тип модели
     * @param {Array} otherRecommendations - Рекомендации от других моделей
     */
    async updateAgreement(modelType, otherRecommendations) {
        try {
            const agreement = this.calculateAgreement(otherRecommendations);
            
            // Обновляем последнюю запись производительности
            const latest = await ModelPerformance.getLatestPerformance(modelType);
            if (latest) {
                await latest.update({ agreement });
            }
        } catch (error) {
            LoggerService.warn(`⚠️ Failed to update agreement for ${modelType}:`, error.message);
        }
    }

    /**
     * Автоматическое отключение деградирующих моделей
     * @param {string} modelType - Тип модели
     */
    async deactivateModel(modelType, reason) {
        try {
            // Обновляем все активные записи производительности
            await ModelPerformance.update(
                { isActive: false },
                {
                    where: {
                        modelType,
                        isActive: true
                    }
                }
            );
            
            // Обнуляем вес
            this.cachedWeights[modelType] = 0;
            
            LoggerService.warn(`⚠️ Model ${modelType} deactivated: ${reason}`);
        } catch (error) {
            LoggerService.error(`❌ Failed to deactivate model ${modelType}:`, error);
        }
    }

    /**
     * Проверка деградации модели
     * @param {string} modelType - Тип модели
     * @returns {Object} - Результат проверки
     */
    async checkModelDegradation(modelType) {
        try {
            const history = await ModelPerformance.getPerformanceHistory(modelType, null, this.settings.performanceWindowDays);
            
            if (history.length < 2) {
                return {
                    isDegrading: false,
                    reason: 'Insufficient data'
                };
            }
            
            // Сравниваем последнюю производительность с предыдущей
            const latest = history[0];
            const previous = history[1];
            
            const latestF1 = parseFloat(latest.f1Score);
            const previousF1 = parseFloat(previous.f1Score);
            
            const degradation = (previousF1 - latestF1) / previousF1;
            
            if (degradation > this.settings.degradationThreshold) {
                return {
                    isDegrading: true,
                    degradation: degradation,
                    latestF1: latestF1,
                    previousF1: previousF1,
                    reason: `F1 Score decreased by ${(degradation * 100).toFixed(2)}%`
                };
            }
            
            return {
                isDegrading: false,
                degradation: degradation
            };
        } catch (error) {
            LoggerService.error(`❌ Failed to check degradation for ${modelType}:`, error);
            return {
                isDegrading: false,
                reason: `Error: ${error.message}`
            };
        }
    }

    /**
     * Получение информации о производительности модели
     */
    async getModelPerformanceInfo(modelType, figi = null) {
        try {
            const latest = await ModelPerformance.getLatestPerformance(modelType, figi);
            const average = await ModelPerformance.getAveragePerformance(modelType, figi, this.settings.performanceWindowDays);
            const degradation = await this.checkModelDegradation(modelType);
            
            return {
                modelType,
                figi,
                latest: latest ? {
                    accuracy: parseFloat(latest.accuracy),
                    f1Score: parseFloat(latest.f1Score),
                    winRate: parseFloat(latest.winRate),
                    totalTrades: latest.totalTrades,
                    calculatedWeight: latest.calculatedWeight ? parseFloat(latest.calculatedWeight) : null,
                    isActive: latest.isActive,
                    periodEnd: latest.periodEnd
                } : null,
                average: average,
                degradation: degradation,
                currentWeight: this.cachedWeights[modelType] || 0
            };
        } catch (error) {
            LoggerService.error(`❌ Failed to get performance info for ${modelType}:`, error);
            return null;
        }
    }

    /**
     * Получение настроек
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
                await SettingsService.setSetting(`model_weighting.${key}`, value, {
                    description: `Настройка взвешивания моделей: ${key}`,
                    category: 'model_weighting',
                    dataType: typeof value === 'number' ? 'number' : 'boolean'
                });
            }
            
            LoggerService.info('✅ Model weighting settings updated');
            return true;
        } catch (error) {
            LoggerService.error('❌ Failed to update model weighting settings:', error);
            throw error;
        }
    }
}

export default new ModelWeightingService();

