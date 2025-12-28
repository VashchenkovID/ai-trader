import PositionPyramid from '../models/PositionPyramid.js';
import TradingRequest from '../models/TradingRequest.js';
import Recommendation from '../models/Recommendation.js';
import SettingsService from './SettingsService.js';
import LoggerService from './LoggerService.js';
import { Op } from 'sequelize';

/**
 * Сервис для управления пирамидингом позиций
 * 
 * Пирамидинг - постепенное наращивание позиции:
 * - Первый вход: 50% от целевого размера
 * - Второй вход: +30% при подтверждении тренда (+3-5%)
 * - Третий вход: +20% при сильном тренде (+7-10%)
 * - Все входы с отдельными стоп-лоссами
 */
class PyramidingService {
    constructor() {
        this.isInitialized = false;
        this.settings = {
            // Проценты для каждого уровня входа
            entryPercentages: [50, 30, 20], // Первый, второй, третий вход
            maxEntries: 3, // Максимальное количество входов
            
            // Условия для второго входа
            secondEntryPriceIncrease: 0.03, // +3% от цены первого входа
            secondEntryPriceIncreaseMax: 0.05, // Максимум +5%
            secondEntryConfirmationRequired: true, // Требуется подтверждение тренда
            
            // Условия для третьего входа
            thirdEntryPriceIncrease: 0.07, // +7% от цены первого входа
            thirdEntryPriceIncreaseMax: 0.10, // Максимум +10%
            thirdEntryConfirmationRequired: true, // Требуется подтверждение сильного тренда
            
            // Стоп-лоссы для каждого входа
            stopLossPercent: 0.05, // 5% от цены входа
            useATRForStopLoss: true, // Использовать ATR для расчета стоп-лосса
            
            // Проверка условий
            checkIntervalMinutes: 60, // Проверять условия каждые 60 минут
            maxWaitDays: 7, // Максимальное время ожидания следующего входа (7 дней)
            
            // Минимальные требования
            minConfidenceForSecondEntry: 0.7, // Минимальная уверенность для второго входа
            minConfidenceForThirdEntry: 0.8, // Минимальная уверенность для третьего входа
            minVolumeIncrease: 1.2 // Минимальное увеличение объема (20%)
        };
    }

    async initialize() {
        try {
            LoggerService.info('📊 Initializing Pyramiding Service...');
            
            // Загружаем настройки
            await this.loadSettings();
            
            this.isInitialized = true;
            LoggerService.info('✅ Pyramiding Service initialized');
        } catch (error) {
            LoggerService.error('❌ Failed to initialize Pyramiding Service:', error);
            throw error;
        }
    }

    /**
     * Загрузка настроек из базы данных
     */
    async loadSettings() {
        try {
            const settings = await SettingsService.getAllSettings('pyramiding');
            
            if (settings && settings.length > 0) {
                for (const setting of settings) {
                    const key = setting.key.replace('pyramiding.', '');
                    const value = setting.value;
                    
                    if (key.includes('percent') || key.includes('increase') || key.includes('interval') || key.includes('days') || key.includes('volume')) {
                        this.settings[key] = parseFloat(value) || this.settings[key];
                    } else if (key.includes('max') || key.includes('min')) {
                        this.settings[key] = parseInt(value) || this.settings[key];
                    } else if (key.includes('required') || key.includes('use') || key.includes('enabled')) {
                        this.settings[key] = value === 'true' || value === true;
                    } else if (key === 'entryPercentages') {
                        try {
                            this.settings[key] = JSON.parse(value);
                        } catch (e) {
                            // Оставляем значение по умолчанию
                        }
                    }
                }
            }
        } catch (error) {
            LoggerService.warn('⚠️ Failed to load pyramiding settings, using defaults:', error.message);
        }
    }

    /**
     * Создание новой пирамиды позиции
     * @param {Object} basePosition - Базовая позиция (TradingRequest)
     * @param {Object} recommendation - Рекомендация
     * @param {number} targetSize - Целевой размер позиции в рублях
     * @returns {Object} - Созданная пирамида
     */
    async createPyramid(basePosition, recommendation, targetSize) {
        try {
            // Проверяем, нет ли уже активной пирамиды для этого инструмента
            const existingPyramid = await PositionPyramid.findActiveByFigi(basePosition.figi);
            if (existingPyramid) {
                throw new Error(`Active pyramid already exists for ${basePosition.figi}`);
            }

            // Рассчитываем размер первого входа (50% от целевого)
            const firstEntryPercent = this.settings.entryPercentages[0] || 50;
            const firstEntryAmount = targetSize * (firstEntryPercent / 100);
            const firstEntryPrice = basePosition.actualPrice || basePosition.priceAtRequest;
            const firstEntryQuantity = basePosition.quantity;

            // Создаем пирамиду
            const pyramid = await PositionPyramid.create({
                basePositionId: basePosition.id,
                figi: basePosition.figi,
                ticker: basePosition.ticker,
                strategyId: basePosition.strategyId,
                targetSize: targetSize,
                currentSize: firstEntryAmount,
                currentPercent: firstEntryPercent,
                entries: [{
                    level: 1,
                    percent: firstEntryPercent,
                    amount: firstEntryAmount,
                    price: firstEntryPrice,
                    quantity: firstEntryQuantity,
                    requestId: basePosition.id,
                    stopLoss: basePosition.stopLoss,
                    entryDate: basePosition.executedAt || basePosition.createdAt
                }],
                status: 'ACTIVE',
                nextEntryConditions: this.calculateNextEntryConditions(1, firstEntryPrice),
                lastCheckDate: new Date()
            });

            LoggerService.info(`📊 Pyramid created for ${basePosition.ticker}: target ${targetSize}₽, first entry ${firstEntryPercent}%`);
            
            return pyramid;
        } catch (error) {
            LoggerService.error(`❌ Failed to create pyramid for ${basePosition.figi}:`, error);
            throw error;
        }
    }

    /**
     * Расчет условий для следующего входа
     */
    calculateNextEntryConditions(level, basePrice) {
        if (level === 1) {
            // Условия для второго входа
            return {
                level: 2,
                priceIncrease: this.settings.secondEntryPriceIncrease,
                priceIncreaseMax: this.settings.secondEntryPriceIncreaseMax,
                targetPrice: basePrice * (1 + this.settings.secondEntryPriceIncrease),
                targetPriceMax: basePrice * (1 + this.settings.secondEntryPriceIncreaseMax),
                confirmationRequired: this.settings.secondEntryConfirmationRequired,
                minConfidence: this.settings.minConfidenceForSecondEntry
            };
        } else if (level === 2) {
            // Условия для третьего входа
            return {
                level: 3,
                priceIncrease: this.settings.thirdEntryPriceIncrease,
                priceIncreaseMax: this.settings.thirdEntryPriceIncreaseMax,
                targetPrice: basePrice * (1 + this.settings.thirdEntryPriceIncrease),
                targetPriceMax: basePrice * (1 + this.settings.thirdEntryPriceIncreaseMax),
                confirmationRequired: this.settings.thirdEntryConfirmationRequired,
                minConfidence: this.settings.minConfidenceForThirdEntry
            };
        }
        
        return null; // Больше входов нет
    }

    /**
     * Проверка условий для следующего входа
     * @param {Object} pyramid - Пирамида позиции
     * @param {Object} currentRecommendation - Текущая рекомендация
     * @param {number} currentPrice - Текущая цена
     * @returns {Object} - Результат проверки
     */
    async checkNextEntryConditions(pyramid, currentRecommendation, currentPrice) {
        try {
            if (pyramid.isComplete()) {
                return {
                    canEnter: false,
                    reason: 'Pyramid is complete'
                };
            }

            const nextLevel = pyramid.getNextEntryLevel();
            const conditions = pyramid.nextEntryConditions;

            if (!conditions) {
                return {
                    canEnter: false,
                    reason: 'No conditions for next entry'
                };
            }

            // Проверяем цену
            const priceIncrease = (currentPrice - conditions.targetPrice) / conditions.targetPrice;
            const isPriceInRange = currentPrice >= conditions.targetPrice && 
                                  currentPrice <= conditions.targetPriceMax;

            if (!isPriceInRange) {
                return {
                    canEnter: false,
                    reason: `Price ${currentPrice} not in range [${conditions.targetPrice.toFixed(2)}, ${conditions.targetPriceMax.toFixed(2)}]`,
                    currentPrice,
                    targetPrice: conditions.targetPrice,
                    targetPriceMax: conditions.targetPriceMax
                };
            }

            // Проверяем уверенность
            if (currentRecommendation && currentRecommendation.confidence < conditions.minConfidence) {
                return {
                    canEnter: false,
                    reason: `Confidence ${currentRecommendation.confidence} below minimum ${conditions.minConfidence}`,
                    confidence: currentRecommendation.confidence,
                    minConfidence: conditions.minConfidence
                };
            }

            // Проверяем подтверждение тренда (если требуется)
            if (conditions.confirmationRequired) {
                const confirmation = await this.checkTrendConfirmation(pyramid, currentPrice, currentRecommendation);
                if (!confirmation.confirmed) {
                    return {
                        canEnter: false,
                        reason: confirmation.reason || 'Trend confirmation failed',
                        ...confirmation
                    };
                }
            }

            // Все условия выполнены
            return {
                canEnter: true,
                level: nextLevel,
                percent: pyramid.getNextEntryPercent(),
                conditions
            };
        } catch (error) {
            LoggerService.error(`❌ Error checking next entry conditions for pyramid ${pyramid.id}:`, error);
            return {
                canEnter: false,
                reason: `Error: ${error.message}`
            };
        }
    }

    /**
     * Проверка подтверждения тренда
     */
    async checkTrendConfirmation(pyramid, currentPrice, recommendation) {
        try {
            const firstEntry = pyramid.entries[0];
            const firstPrice = firstEntry.price;
            const priceIncrease = (currentPrice - firstPrice) / firstPrice;

            // Проверяем, что цена действительно выросла
            if (priceIncrease < 0) {
                return {
                    confirmed: false,
                    reason: 'Price decreased from first entry'
                };
            }

            // Проверяем рекомендацию
            if (recommendation && recommendation.recommendation !== 'BUY') {
                return {
                    confirmed: false,
                    reason: `Recommendation is ${recommendation.recommendation}, not BUY`
                };
            }

            // Проверяем объем (если доступен)
            if (recommendation && recommendation.volume) {
                // Можно добавить проверку увеличения объема
                // Пока просто проверяем наличие данных
            }

            return {
                confirmed: true,
                priceIncrease,
                recommendation: recommendation?.recommendation
            };
        } catch (error) {
            LoggerService.warn(`⚠️ Error checking trend confirmation: ${error.message}`);
            return {
                confirmed: false,
                reason: `Error: ${error.message}`
            };
        }
    }

    /**
     * Добавление следующего входа в пирамиду
     * @param {Object} pyramid - Пирамида позиции
     * @param {Object} newPosition - Новая позиция (TradingRequest)
     * @returns {Object} - Обновленная пирамида
     */
    async addNextEntry(pyramid, newPosition) {
        try {
            const nextLevel = pyramid.getNextEntryLevel();
            const nextPercent = pyramid.getNextEntryPercent();
            const targetSize = parseFloat(pyramid.targetSize);
            const entryAmount = targetSize * (nextPercent / 100);
            const entryPrice = newPosition.actualPrice || newPosition.priceAtRequest;
            const entryQuantity = newPosition.quantity;

            // Добавляем вход
            await pyramid.addEntry({
                level: nextLevel,
                percent: nextPercent,
                amount: entryAmount,
                price: entryPrice,
                quantity: entryQuantity,
                requestId: newPosition.id,
                stopLoss: newPosition.stopLoss,
                entryDate: newPosition.executedAt || newPosition.createdAt
            });

            // Обновляем условия для следующего входа (если есть)
            const nextConditions = this.calculateNextEntryConditions(nextLevel, entryPrice);
            await pyramid.update({
                nextEntryConditions: nextConditions,
                status: pyramid.isComplete() ? 'COMPLETED' : 'ACTIVE'
            });

            LoggerService.info(`📊 Added entry level ${nextLevel} to pyramid ${pyramid.ticker}: ${nextPercent}%`);
            
            return pyramid;
        } catch (error) {
            LoggerService.error(`❌ Failed to add next entry to pyramid ${pyramid.id}:`, error);
            throw error;
        }
    }

    /**
     * Проверка всех активных пирамид на возможность следующего входа
     */
    async checkAllActivePyramids() {
        try {
            // Проверяем, существует ли таблица
            try {
                await PositionPyramid.findOne({ limit: 1 });
            } catch (tableError) {
                if (tableError.name === 'SequelizeDatabaseError' && tableError.message.includes('does not exist')) {
                    LoggerService.warn('⚠️ Table position_pyramids does not exist yet');
                    return [];
                }
                throw tableError;
            }
            
            const activePyramids = await PositionPyramid.findAll({
                where: {
                    status: 'ACTIVE'
                }
            });

            const results = [];

            for (const pyramid of activePyramids) {
                try {
                    // Получаем текущую рекомендацию
                    const recommendation = await Recommendation.findByPk(pyramid.figi);
                    if (!recommendation) {
                        continue;
                    }

                    // Получаем текущую цену
                    let currentPrice = null;
                    try {
                        const TinkoffApiService = (await import('./TinkoffApiService.js')).default;
                        const priceData = await TinkoffApiService.getCurrentPrice(pyramid.figi);
                        currentPrice = typeof priceData === 'number' ? priceData : (priceData?.price || priceData?.lastPrice);
                    } catch (priceError) {
                        LoggerService.warn(`⚠️ Could not get current price for ${pyramid.figi}:`, priceError.message);
                        continue;
                    }
                    
                    if (!currentPrice || currentPrice <= 0) {
                        continue;
                    }

                    // Проверяем условия
                    const checkResult = await this.checkNextEntryConditions(pyramid, recommendation, currentPrice);
                    
                    results.push({
                        pyramidId: pyramid.id,
                        figi: pyramid.figi,
                        ticker: pyramid.ticker,
                        currentLevel: pyramid.entries.length,
                        checkResult
                    });

                    // Обновляем дату последней проверки
                    await pyramid.update({
                        lastCheckDate: new Date()
                    });
                } catch (error) {
                    LoggerService.error(`❌ Error checking pyramid ${pyramid.id}:`, error);
                }
            }

            return results;
        } catch (error) {
            LoggerService.error('❌ Error checking all active pyramids:', error);
            throw error;
        }
    }

    /**
     * Получение информации о пирамиде
     */
    async getPyramidInfo(pyramidId) {
        try {
            const pyramid = await PositionPyramid.findByPk(pyramidId);
            if (!pyramid) {
                return null;
            }

            return {
                id: pyramid.id,
                figi: pyramid.figi,
                ticker: pyramid.ticker,
                targetSize: parseFloat(pyramid.targetSize),
                currentSize: parseFloat(pyramid.currentSize),
                currentPercent: parseFloat(pyramid.currentPercent),
                entries: pyramid.entries,
                status: pyramid.status,
                nextEntryConditions: pyramid.nextEntryConditions,
                totalQuantity: pyramid.getTotalQuantity(),
                averagePrice: pyramid.getAveragePrice(),
                isComplete: pyramid.isComplete()
            };
        } catch (error) {
            LoggerService.error(`❌ Error getting pyramid info ${pyramidId}:`, error);
            throw error;
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
                await SettingsService.setSetting(`pyramiding.${key}`, value, {
                    description: `Настройка пирамидинга: ${key}`,
                    category: 'pyramiding',
                    dataType: typeof value === 'number' ? 'number' : (typeof value === 'boolean' ? 'boolean' : 'string')
                });
            }
            
            LoggerService.info('✅ Pyramiding settings updated');
            return true;
        } catch (error) {
            LoggerService.error('❌ Failed to update pyramiding settings:', error);
            throw error;
        }
    }
}

export default new PyramidingService();

