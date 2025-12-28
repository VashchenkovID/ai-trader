import TradingRequest from '../models/TradingRequest.js';
import SettingsService from './SettingsService.js';
import LoggerService from './LoggerService.js';
import { Op } from 'sequelize';

/**
 * Сервис для оптимизации комиссий и налогов
 * 
 * Функциональность:
 * - Расчет комиссий с учетом размера позиции
 * - Минимизация количества сделок
 * - Оптимизация налогов (ИИС, долгосрочные позиции > 3 лет)
 * - Учет комиссий в расчете размера позиции
 */
class TaxOptimizationService {
    constructor() {
        this.isInitialized = false;
        this.settings = {
            // Комиссии (Тинькофф Инвестиции)
            commissionRate: 0.003,   // 0.3% от суммы сделки (стандартная ставка Тинькофф)
            minCommission: 1.0,      // Минимальная комиссия 1 руб
            maxCommission: 0.01,     // Максимальная комиссия 1% от суммы
            
            // Налоговые настройки
            iisAccount: false,        // Используется ли ИИС
            taxRate: 0.13,            // Стандартная ставка НДФЛ 13%
            iisTaxRate: 0.0,          // Налог на ИИС (0% при выполнении условий)
            longTermThresholdDays: 1095, // 3 года для долгосрочных позиций
            longTermTaxRate: 0.0,     // Налог на долгосрочные позиции (0% при выполнении условий)
            
            // Оптимизация сделок
            minDealAmount: 1000,      // Минимальная сумма сделки для оптимизации
            minProfitAfterCommission: 0.01, // Минимальная прибыль после комиссий (1%)
            batchTradesThreshold: 5,  // Порог для батчинга сделок
            
            // Учет комиссий в расчете размера позиции
            includeCommissionInPositionSize: true, // Учитывать комиссию при расчете размера позиции
            commissionBuffer: 1.02     // Буфер для комиссии (2%)
        };
    }

    async initialize() {
        try {
            LoggerService.info('💰 Initializing Tax Optimization Service...');
            
            // Загружаем настройки
            await this.loadSettings();
            
            this.isInitialized = true;
            LoggerService.info('✅ Tax Optimization Service initialized');
        } catch (error) {
            LoggerService.error('❌ Failed to initialize Tax Optimization Service:', error);
            throw error;
        }
    }

    /**
     * Загрузка настроек из базы данных
     */
    async loadSettings() {
        try {
            const settings = await SettingsService.getAllSettings('tax_optimization');
            
            if (settings && settings.length > 0) {
                for (const setting of settings) {
                    const key = setting.key.replace('tax_optimization.', '');
                    const value = setting.value;
                    
                    if (key.includes('rate') || key.includes('percent') || key.includes('days') || key.includes('amount') || key.includes('buffer') || key.includes('threshold')) {
                        this.settings[key] = parseFloat(value) || this.settings[key];
                    } else if (key.includes('enabled') || key.includes('include') || key.includes('iis')) {
                        this.settings[key] = value === 'true' || value === true;
                    }
                }
            }
        } catch (error) {
            LoggerService.warn('⚠️ Failed to load tax optimization settings, using defaults:', error.message);
        }
    }

    /**
     * Расчет комиссии для сделки
     * @param {number} price - Цена за единицу
     * @param {number} quantity - Количество
     * @returns {Object} - Информация о комиссии
     */
    calculateCommission(price, quantity) {
        const dealAmount = price * quantity;
        const commission = Math.max(
            this.settings.minCommission,
            Math.min(dealAmount * this.settings.commissionRate, dealAmount * this.settings.maxCommission)
        );

        return {
            amount: commission,
            rate: this.settings.commissionRate,
            dealAmount,
            netAmount: dealAmount + commission, // С учетом комиссии
            commissionPercent: (commission / dealAmount) * 100
        };
    }

    /**
     * Расчет размера позиции с учетом комиссии
     * @param {number} availableCapital - Доступный капитал
     * @param {number} price - Цена за единицу
     * @param {Object} options - Дополнительные опции
     * @returns {Object} - Рекомендуемый размер позиции
     */
    calculatePositionSizeWithCommission(availableCapital, price, options = {}) {
        if (!this.settings.includeCommissionInPositionSize) {
            // Если не учитываем комиссию, просто делим капитал на цену
            const quantity = Math.floor(availableCapital / price);
            const dealAmount = quantity * price;
            const commission = this.calculateCommission(price, quantity).amount;
            
            return {
                quantity,
                dealAmount,
                commission,
                totalCost: dealAmount + commission,
                availableAfter: availableCapital - (dealAmount + commission)
            };
        }

        // Учитываем комиссию при расчете размера позиции
        // Используем итеративный подход для точного расчета
        let quantity = Math.floor(availableCapital / (price * this.settings.commissionBuffer));
        let dealAmount = quantity * price;
        let commission = this.calculateCommission(price, quantity).amount;
        let totalCost = dealAmount + commission;

        // Корректируем количество, если превышаем доступный капитал
        while (totalCost > availableCapital && quantity > 0) {
            quantity--;
            dealAmount = quantity * price;
            commission = this.calculateCommission(price, quantity).amount;
            totalCost = dealAmount + commission;
        }

        return {
            quantity: Math.max(0, quantity),
            dealAmount,
            commission,
            totalCost,
            availableAfter: availableCapital - totalCost,
            commissionPercent: (commission / dealAmount) * 100
        };
    }

    /**
     * Проверка целесообразности сделки с учетом комиссий
     * @param {number} entryPrice - Цена входа
     * @param {number} exitPrice - Цена выхода
     * @param {number} quantity - Количество
     * @returns {Object} - Анализ целесообразности
     */
    analyzeTradeProfitability(entryPrice, exitPrice, quantity) {
        const entryCommission = this.calculateCommission(entryPrice, quantity);
        const exitCommission = this.calculateCommission(exitPrice, quantity);
        
        const totalCommission = entryCommission.amount + exitCommission.amount;
        const grossProfit = (exitPrice - entryPrice) * quantity;
        const netProfit = grossProfit - totalCommission;
        const profitPercent = (netProfit / (entryPrice * quantity + entryCommission.amount)) * 100;

        const isProfitable = netProfit > 0;
        const meetsMinimum = profitPercent >= (this.settings.minProfitAfterCommission * 100);
        const shouldExecute = isProfitable && meetsMinimum;

        return {
            isProfitable,
            meetsMinimum,
            shouldExecute,
            grossProfit,
            netProfit,
            totalCommission,
            profitPercent,
            entryCommission: entryCommission.amount,
            exitCommission: exitCommission.amount,
            recommendation: shouldExecute ? 'execute' : (isProfitable ? 'consider' : 'skip')
        };
    }

    /**
     * Расчет налогов для позиции
     * @param {Object} position - Позиция (TradingRequest)
     * @param {number} exitPrice - Цена выхода
     * @param {number} exitQuantity - Количество при выходе
     * @returns {Object} - Расчет налогов
     */
    calculateTax(position, exitPrice, exitQuantity) {
        const entryPrice = position.actualPrice || position.priceAtRequest;
        const entryQuantity = position.quantity;
        const entryDate = new Date(position.executedAt || position.createdAt);
        const exitDate = new Date();
        
        const daysHeld = Math.floor((exitDate - entryDate) / (1000 * 60 * 60 * 24));
        const isLongTerm = daysHeld >= this.settings.longTermThresholdDays;
        
        // Прибыль до налогов
        const grossProfit = (exitPrice - entryPrice) * exitQuantity;
        
        // Налоговая база
        let taxableAmount = grossProfit;
        let taxRate = this.settings.taxRate;
        
        // Применяем льготы
        if (this.settings.iisAccount) {
            // ИИС: налог 0% при выполнении условий (3 года, лимит 1 млн)
            taxRate = this.settings.iisTaxRate;
        } else if (isLongTerm) {
            // Долгосрочные позиции (> 3 лет): налог 0%
            taxRate = this.settings.longTermTaxRate;
        }
        
        const taxAmount = taxableAmount > 0 ? taxableAmount * taxRate : 0;
        const netProfit = grossProfit - taxAmount;
        
        return {
            grossProfit,
            taxableAmount,
            taxRate: taxRate * 100, // В процентах
            taxAmount,
            netProfit,
            daysHeld,
            isLongTerm,
            iisAccount: this.settings.iisAccount,
            taxExempt: taxAmount === 0,
            taxExemptReason: taxAmount === 0 
                ? (this.settings.iisAccount ? 'ИИС' : (isLongTerm ? 'Долгосрочная позиция (>3 лет)' : 'N/A'))
                : null
        };
    }

    /**
     * Оптимизация количества сделок (батчинг)
     * @param {Array} pendingTrades - Массив ожидающих сделок
     * @returns {Array} - Оптимизированные сделки
     */
    optimizeTradeBatch(pendingTrades) {
        if (!pendingTrades || pendingTrades.length === 0) {
            return [];
        }

        // Группируем сделки по инструменту и действию
        const grouped = {};
        for (const trade of pendingTrades) {
            const key = `${trade.figi}_${trade.action}`;
            if (!grouped[key]) {
                grouped[key] = [];
            }
            grouped[key].push(trade);
        }

        const optimized = [];

        for (const [key, trades] of Object.entries(grouped)) {
            if (trades.length < this.settings.batchTradesThreshold) {
                // Если сделок мало, оставляем как есть
                optimized.push(...trades);
            } else {
                // Объединяем сделки в одну
                const [figi, action] = key.split('_');
                const totalQuantity = trades.reduce((sum, t) => sum + t.quantity, 0);
                const weightedPrice = trades.reduce((sum, t) => sum + (t.priceAtRequest * t.quantity), 0) / totalQuantity;
                const totalAmount = weightedPrice * totalQuantity;

                optimized.push({
                    ...trades[0],
                    quantity: totalQuantity,
                    priceAtRequest: weightedPrice,
                    estimatedAmount: totalAmount,
                    batched: true,
                    originalTradesCount: trades.length,
                    commissionSavings: this.calculateBatchCommissionSavings(trades)
                });
            }
        }

        return optimized;
    }

    /**
     * Расчет экономии комиссий при батчинге
     */
    calculateBatchCommissionSavings(trades) {
        const individualCommissions = trades.reduce((sum, t) => {
            const comm = this.calculateCommission(t.priceAtRequest, t.quantity);
            return sum + comm.amount;
        }, 0);

        const totalQuantity = trades.reduce((sum, t) => sum + t.quantity, 0);
        const weightedPrice = trades.reduce((sum, t) => sum + (t.priceAtRequest * t.quantity), 0) / totalQuantity;
        const batchedCommission = this.calculateCommission(weightedPrice, totalQuantity).amount;

        return {
            individualTotal: individualCommissions,
            batchedTotal: batchedCommission,
            savings: individualCommissions - batchedCommission,
            savingsPercent: ((individualCommissions - batchedCommission) / individualCommissions) * 100
        };
    }

    /**
     * Анализ позиции на предмет налоговой оптимизации
     * @param {Object} position - Позиция
     * @returns {Object} - Рекомендации по налоговой оптимизации
     */
    analyzeTaxOptimization(position) {
        const entryDate = new Date(position.executedAt || position.createdAt);
        const now = new Date();
        const daysHeld = Math.floor((now - entryDate) / (1000 * 60 * 60 * 24));
        const daysUntilLongTerm = this.settings.longTermThresholdDays - daysHeld;

        const recommendations = [];
        let shouldHold = false;
        let priority = 'low';

        // Проверяем приближение к долгосрочной позиции
        if (daysUntilLongTerm > 0 && daysUntilLongTerm <= 365) {
            recommendations.push({
                type: 'hold_for_tax_benefit',
                message: `До получения налоговых льгот осталось ${daysUntilLongTerm} дней`,
                daysUntilLongTerm,
                benefit: 'Налог 0% при удержании позиции более 3 лет'
            });
            shouldHold = daysUntilLongTerm <= 90; // Рекомендуем держать, если осталось меньше 3 месяцев
            priority = daysUntilLongTerm <= 30 ? 'high' : 'medium';
        } else if (daysHeld >= this.settings.longTermThresholdDays) {
            recommendations.push({
                type: 'tax_exempt',
                message: 'Позиция удерживается более 3 лет - налог 0%',
                daysHeld,
                benefit: 'Налоговые льготы применены'
            });
        }

        // Проверяем ИИС
        if (this.settings.iisAccount) {
            recommendations.push({
                type: 'iis_account',
                message: 'Используется ИИС - налог 0% при выполнении условий',
                benefit: 'Налоговые льготы ИИС'
            });
        }

        return {
            shouldHold,
            priority,
            recommendations,
            daysHeld,
            daysUntilLongTerm: daysUntilLongTerm > 0 ? daysUntilLongTerm : 0,
            isLongTerm: daysHeld >= this.settings.longTermThresholdDays,
            taxOptimized: shouldHold || daysHeld >= this.settings.longTermThresholdDays
        };
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
                await SettingsService.setSetting(`tax_optimization.${key}`, value, {
                    description: `Настройка оптимизации налогов и комиссий: ${key}`,
                    category: 'tax_optimization',
                    dataType: typeof value === 'number' ? 'number' : 'boolean'
                });
            }
            
            LoggerService.info('✅ Tax optimization settings updated');
            return true;
        } catch (error) {
            LoggerService.error('❌ Failed to update tax optimization settings:', error);
            throw error;
        }
    }
}

export default new TaxOptimizationService();

