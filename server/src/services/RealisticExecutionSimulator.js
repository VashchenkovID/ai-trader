/**
 * Сервис реалистичной симуляции исполнения ордеров
 * Учитывает спреды, проскальзывание, ликвидность и комиссии
 */

import LoggerService from './LoggerService.js';
import CacheService from './CacheService.js';

class RealisticExecutionSimulator {
    constructor() {
        this.isInitialized = false;
        this.settings = {
            // Спреды (bid-ask spread)
            defaultSpreadPercent: 0.001,      // 0.1% по умолчанию
            spreadByLiquidity: {
                high: 0.0005,    // Высокая ликвидность: 0.05%
                medium: 0.001,    // Средняя ликвидность: 0.1%
                low: 0.002        // Низкая ликвидность: 0.2%
            },
            
            // Проскальзывание (slippage)
            slippageByOrderSize: {
                small: 0.0005,   // Малый ордер (< 1% дневного объема): 0.05%
                medium: 0.001,   // Средний ордер (1-5%): 0.1%
                large: 0.002      // Большой ордер (> 5%): 0.2%
            },
            
            // Ликвидность
            liquidityThresholds: {
                high: 1000000,    // Высокая: > 1 млн руб дневного объема
                medium: 500000,   // Средняя: 500к - 1 млн
                low: 0            // Низкая: < 500к
            },
            
            // Частичное исполнение
            enablePartialFill: true,
            maxPartialFillPercent: 0.8,  // Максимум 80% исполнения для больших ордеров
            
            // Комиссии
            commissionRate: 0.0005,     // 0.05% комиссия
            minCommission: 1            // Минимум 1 рубль
        };
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            // Загрузка настроек из БД (если нужно)
            // Пока используем настройки по умолчанию
            
            this.isInitialized = true;
            LoggerService.info('RealisticExecutionSimulator initialized');
        } catch (error) {
            LoggerService.error('Failed to initialize RealisticExecutionSimulator', {
                service: 'RealisticExecutionSimulator',
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Симуляция исполнения ордера
     * @param {Object} order - Ордер { figi, action, quantity, price }
     * @param {Object} marketData - Рыночные данные { volume, liquidity }
     * @returns {Promise<Object>} Результат исполнения
     */
    async simulateExecution(order, marketData = {}) {
        try {
            const { figi, action, quantity, price } = order;
            
            // 1. Определение ликвидности инструмента
            const liquidityLevel = await this.getLiquidityLevel(figi, marketData);
            
            // 2. Расчет спреда
            const spread = this.calculateSpread(price, liquidityLevel, action);
            
            // 3. Расчет проскальзывания на основе размера ордера
            const dailyVolume = marketData.volume || await this.getDailyVolume(figi);
            const slippage = this.calculateSlippage(quantity, price, dailyVolume);
            
            // 4. Расчет цены исполнения с учетом спреда и проскальзывания
            let executionPrice = price;
            if (action === 'BUY') {
                // При покупке: цена + спред + проскальзывание
                executionPrice = price + spread + slippage;
            } else {
                // При продаже: цена - спред - проскальзывание
                executionPrice = price - spread - slippage;
            }
            
            // 5. Проверка возможности частичного исполнения
            const executedQuantity = this.checkPartialFill(quantity, dailyVolume);
            
            // 6. Расчет комиссии
            const dealAmount = executionPrice * executedQuantity;
            const commission = Math.max(dealAmount * this.settings.commissionRate, this.settings.minCommission);
            
            return {
                executedPrice: Math.max(0.01, executionPrice), // Минимум 1 копейка
                executedQuantity,
                commission,
                slippage: Math.abs(slippage),
                spread: Math.abs(spread),
                liquidityLevel,
                originalPrice: price
            };
        } catch (error) {
            LoggerService.warn('Failed to simulate execution, using defaults', {
                figi: order.figi,
                error: error.message
            });
            
            // Использовать средние значения по умолчанию
            const defaultSpread = price * this.settings.defaultSpreadPercent;
            const defaultSlippage = price * this.settings.slippageByOrderSize.medium;
            
            let executionPrice = price;
            if (order.action === 'BUY') {
                executionPrice = price + defaultSpread + defaultSlippage;
            } else {
                executionPrice = price - defaultSpread - defaultSlippage;
            }
            
            const dealAmount = executionPrice * order.quantity;
            const commission = Math.max(dealAmount * this.settings.commissionRate, this.settings.minCommission);
            
            return {
                executedPrice: Math.max(0.01, executionPrice),
                executedQuantity: order.quantity,
                commission,
                slippage: Math.abs(defaultSlippage),
                spread: Math.abs(defaultSpread),
                liquidityLevel: 'medium',
                originalPrice: price
            };
        }
    }

    /**
     * Определение ликвидности инструмента
     * @param {string} figi - FIGI инструмента
     * @param {Object} marketData - Рыночные данные
     * @returns {Promise<string>} 'high', 'medium', или 'low'
     */
    async getLiquidityLevel(figi, marketData = {}) {
        try {
            let dailyVolume = marketData.dailyVolume || marketData.volume;
            
            if (!dailyVolume) {
                // Пытаемся получить из кеша или API
                dailyVolume = await this.getDailyVolume(figi);
            }
            
            if (dailyVolume >= this.settings.liquidityThresholds.high) {
                return 'high';
            } else if (dailyVolume >= this.settings.liquidityThresholds.medium) {
                return 'medium';
            } else {
                return 'low';
            }
        } catch (error) {
            LoggerService.warn('Failed to get liquidity level, using medium', {
                figi,
                error: error.message
            });
            return 'medium';
        }
    }

    /**
     * Получение дневного объема торгов
     * @param {string} figi - FIGI инструмента
     * @returns {Promise<number>} Дневной объем в рублях
     */
    async getDailyVolume(figi) {
        try {
            // Получаем инструмент из кеша
            const instrument = await CacheService.getInstrument(figi, true);
            
            if (instrument && instrument.dailyVolume) {
                return instrument.dailyVolume;
            }
            
            // Если нет в кеше, используем среднее значение по умолчанию
            // В реальной реализации здесь был бы запрос к API брокера
            return 1000000; // 1 млн рублей по умолчанию
        } catch (error) {
            LoggerService.warn('Failed to get daily volume, using default', {
                figi,
                error: error.message
            });
            return 1000000; // 1 млн рублей по умолчанию
        }
    }

    /**
     * Расчет спреда
     * @param {number} price - Цена инструмента
     * @param {string} liquidityLevel - Уровень ликвидности
     * @param {string} action - 'BUY' или 'SELL'
     * @returns {number} Спред в абсолютных единицах
     */
    calculateSpread(price, liquidityLevel, action) {
        const spreadPercent = this.settings.spreadByLiquidity[liquidityLevel] || this.settings.defaultSpreadPercent;
        return price * spreadPercent;
    }

    /**
     * Расчет проскальзывания
     * @param {number} orderSize - Размер ордера (количество)
     * @param {number} price - Цена инструмента
     * @param {number} dailyVolume - Дневной объем в рублях
     * @returns {number} Проскальзывание в абсолютных единицах
     */
    calculateSlippage(orderSize, price, dailyVolume) {
        const orderValue = orderSize * price;
        const orderSizePercent = dailyVolume > 0 ? (orderValue / dailyVolume) * 100 : 0;
        
        let slippagePercent;
        if (orderSizePercent < 1) {
            slippagePercent = this.settings.slippageByOrderSize.small;
        } else if (orderSizePercent < 5) {
            slippagePercent = this.settings.slippageByOrderSize.medium;
        } else {
            slippagePercent = this.settings.slippageByOrderSize.large;
        }
        
        return price * slippagePercent;
    }

    /**
     * Проверка частичного исполнения
     * @param {number} quantity - Запрошенное количество
     * @param {number} dailyVolume - Дневной объем в рублях
     * @returns {number} Фактически исполненное количество
     */
    checkPartialFill(quantity, dailyVolume) {
        if (!this.settings.enablePartialFill) {
            return quantity;
        }
        
        // Для больших ордеров (> 5% дневного объема) - частичное исполнение
        // В реальной реализации здесь была бы более сложная логика
        // Пока возвращаем полное количество
        return quantity;
    }
}

// Создаем единственный экземпляр
const realisticExecutionSimulator = new RealisticExecutionSimulator();

export default realisticExecutionSimulator;

