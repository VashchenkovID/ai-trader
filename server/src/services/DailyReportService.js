import TradingRequest from '../models/TradingRequest.js';
import SettingsService from './SettingsService.js';
import LoggerService from './LoggerService.js';
import ServiceManager from './ServiceManager.js';
import { Op } from 'sequelize';

/**
 * Сервис для генерации ежедневных отчетов
 * 
 * Функциональность:
 * - Ежедневные отчеты: P&L, топ-5 прибыльных/убыточных позиций
 * - Статистика по стратегиям
 * - Отправка отчетов в Telegram
 */
class DailyReportService {
    constructor() {
        this.isInitialized = false;
        this.settings = {
            // Настройки отчетов
            enableDailyReports: true,
            reportTime: '20:00',  // Время отправки отчета (20:00)
            enableTelegramReports: true,
            
            // Что включать в отчет
            includeTopPositions: true,
            topPositionsCount: 5,
            includeStrategyStats: true,
            includeDailyPnL: true,
            includeTotalPnL: true
        };
    }

    async initialize() {
        try {
            LoggerService.info('📊 Initializing Daily Report Service...');
            
            // Загружаем настройки
            await this.loadSettings();
            
            this.isInitialized = true;
            LoggerService.info('✅ Daily Report Service initialized');
        } catch (error) {
            LoggerService.error('❌ Failed to initialize Daily Report Service:', error);
            throw error;
        }
    }

    /**
     * Загрузка настроек из базы данных
     */
    async loadSettings() {
        try {
            const settings = await SettingsService.getAllSettings('daily_reports');
            
            if (settings && settings.length > 0) {
                for (const setting of settings) {
                    const key = setting.key.replace('daily_reports.', '');
                    const value = setting.value;
                    
                    if (key === 'reportTime') {
                        this.settings[key] = value;
                    } else if (key.includes('enable') || key.includes('include')) {
                        this.settings[key] = value === 'true' || value === true;
                    } else if (key.includes('Count')) {
                        this.settings[key] = parseInt(value) || this.settings[key];
                    }
                }
            }
        } catch (error) {
            LoggerService.warn('⚠️ Failed to load daily report settings, using defaults:', error.message);
        }
    }

    /**
     * Генерация ежедневного отчета
     */
    async generateDailyReport(options = {}) {
        try {
            if (!this.isInitialized) {
                throw new Error('DailyReportService не инициализирован');
            }

            const reportDate = options.date || new Date();
            const startOfDay = new Date(reportDate);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(reportDate);
            endOfDay.setHours(23, 59, 59, 999);

            LoggerService.info(`📊 Generating daily report for ${reportDate.toISOString().split('T')[0]}...`);

            const report = {
                date: reportDate.toISOString().split('T')[0],
                generatedAt: new Date().toISOString(),
                summary: {},
                topPositions: {
                    profitable: [],
                    unprofitable: []
                },
                strategyStats: {},
                dailyPnL: null,
                totalPnL: null
            };

            // 1. Получаем все открытые позиции
            const openPositions = await this.getOpenPositions();
            
            // 2. Получаем все закрытые позиции за день
            const closedPositions = await this.getClosedPositions(startOfDay, endOfDay);

            // 3. Получаем текущие цены для открытых позиций
            const figis = [...new Set(openPositions.map(p => p.figi))];
            const currentPrices = await this.getCurrentPrices(figis);

            // 4. Рассчитываем P&L
            if (this.settings.includeDailyPnL) {
                report.dailyPnL = this.calculateDailyPnL(closedPositions);
            }

            if (this.settings.includeTotalPnL) {
                report.totalPnL = this.calculateTotalPnL(openPositions, closedPositions, currentPrices);
            }

            // 5. Топ позиции
            if (this.settings.includeTopPositions) {
                report.topPositions = await this.getTopPositions(
                    openPositions, 
                    closedPositions, 
                    currentPrices,
                    this.settings.topPositionsCount
                );
            }

            // 6. Статистика по стратегиям
            if (this.settings.includeStrategyStats) {
                report.strategyStats = await this.getStrategyStats(openPositions, closedPositions);
            }

            // 7. Сводка
            report.summary = {
                openPositions: openPositions.length,
                closedToday: closedPositions.length,
                dailyPnL: report.dailyPnL,
                totalPnL: report.totalPnL
            };

            LoggerService.info('✅ Daily report generated successfully');

            return report;
        } catch (error) {
            LoggerService.error('❌ Error generating daily report:', error);
            throw error;
        }
    }

    /**
     * Получение открытых позиций
     */
    async getOpenPositions() {
        try {
            return await TradingRequest.findAll({
                where: {
                    status: 'EXECUTED',
                    action: 'BUY'
                },
                order: [['executedAt', 'ASC']]
            });
        } catch (error) {
            LoggerService.error('❌ Error getting open positions:', error);
            return [];
        }
    }

    /**
     * Получение закрытых позиций за период
     */
    async getClosedPositions(startDate, endDate) {
        try {
            // Ищем позиции, которые были закрыты в указанный период
            // Закрытие может быть через PositionExit или изменение статуса
            const PositionExit = (await import('../models/PositionExit.js')).default;
            
            const exits = await PositionExit.findAll({
                where: {
                    status: 'EXECUTED',
                    executedAt: {
                        [Op.between]: [startDate, endDate]
                    }
                }
            });

            // Получаем связанные TradingRequest для каждого exit
            const tradingRequestIds = [...new Set(exits.map(e => e.tradingRequestId))];
            const tradingRequests = await TradingRequest.findAll({
                where: {
                    id: {
                        [Op.in]: tradingRequestIds
                    }
                }
            });

            const tradingRequestsMap = new Map(tradingRequests.map(tr => [tr.id, tr]));

            return exits.map(exit => {
                const tradingRequest = tradingRequestsMap.get(exit.tradingRequestId);
                return {
                    ...(tradingRequest ? tradingRequest.toJSON() : {}),
                    exitPrice: exit.exitPrice,
                    exitQuantity: exit.exitQuantity,
                    exitDate: exit.executedAt,
                    profit: exit.realizedProfit || (exit.profitPercent * exit.exitAmount / 100),
                    profitPercent: exit.profitPercent
                };
            });
        } catch (error) {
            LoggerService.warn('⚠️ Error getting closed positions:', error.message);
            return [];
        }
    }

    /**
     * Получение текущих цен
     */
    async getCurrentPrices(figis) {
        try {
            if (!figis || figis.length === 0) {
                return {};
            }

            const TinkoffApiService = (await import('./TinkoffApiService.js')).default;
            const lastPrices = await TinkoffApiService.getLastPrices(figis);
            return lastPrices || {};
        } catch (error) {
            LoggerService.warn('⚠️ Failed to get current prices:', error.message);
            return {};
        }
    }

    /**
     * Расчет дневного P&L
     */
    calculateDailyPnL(closedPositions) {
        if (!closedPositions || closedPositions.length === 0) {
            return {
                total: 0,
                count: 0,
                profitable: 0,
                unprofitable: 0
            };
        }

        let totalPnL = 0;
        let profitableCount = 0;
        let unprofitableCount = 0;

        for (const position of closedPositions) {
            const entryPrice = position.actualPrice || position.priceAtRequest;
            const exitPrice = position.exitPrice;
            const quantity = position.exitQuantity || position.quantity;

            if (entryPrice && exitPrice && quantity) {
                const profit = (exitPrice - entryPrice) * quantity;
                totalPnL += profit;

                if (profit > 0) {
                    profitableCount++;
                } else if (profit < 0) {
                    unprofitableCount++;
                }
            }
        }

        return {
            total: totalPnL,
            count: closedPositions.length,
            profitable: profitableCount,
            unprofitable: unprofitableCount
        };
    }

    /**
     * Расчет общего P&L
     */
    calculateTotalPnL(openPositions, closedPositions, currentPrices) {
        let totalPnL = 0;
        let openPnL = 0;
        let closedPnL = 0;

        // P&L от закрытых позиций
        for (const position of closedPositions) {
            const entryPrice = position.actualPrice || position.priceAtRequest;
            const exitPrice = position.exitPrice;
            const quantity = position.exitQuantity || position.quantity;

            if (entryPrice && exitPrice && quantity) {
                const profit = (exitPrice - entryPrice) * quantity;
                closedPnL += profit;
            }
        }

        // P&L от открытых позиций (нереализованная прибыль)
        for (const position of openPositions) {
            const entryPrice = position.actualPrice || position.priceAtRequest;
            const currentPrice = currentPrices[position.figi];
            const quantity = position.quantity;

            if (entryPrice && currentPrice && quantity) {
                const profit = (currentPrice - entryPrice) * quantity;
                openPnL += profit;
            }
        }

        totalPnL = closedPnL + openPnL;

        return {
            total: totalPnL,
            realized: closedPnL,
            unrealized: openPnL,
            openPositions: openPositions.length,
            closedPositions: closedPositions.length
        };
    }

    /**
     * Получение топ позиций
     */
    async getTopPositions(openPositions, closedPositions, currentPrices, count = 5) {
        const allPositions = [];

        // Открытые позиции
        for (const position of openPositions) {
            const entryPrice = position.actualPrice || position.priceAtRequest;
            const currentPrice = currentPrices[position.figi];
            const quantity = position.quantity;

            if (entryPrice && currentPrice && quantity) {
                const profit = (currentPrice - entryPrice) * quantity;
                const profitPercent = ((currentPrice - entryPrice) / entryPrice) * 100;

                allPositions.push({
                    ...position.toJSON(),
                    currentPrice,
                    profit,
                    profitPercent,
                    isOpen: true
                });
            }
        }

        // Закрытые позиции за день
        for (const position of closedPositions) {
            const entryPrice = position.actualPrice || position.priceAtRequest;
            const exitPrice = position.exitPrice;
            const quantity = position.exitQuantity || position.quantity;

            if (entryPrice && exitPrice && quantity) {
                const profit = (exitPrice - entryPrice) * quantity;
                const profitPercent = ((exitPrice - entryPrice) / entryPrice) * 100;

                allPositions.push({
                    ...position,
                    currentPrice: exitPrice,
                    profit,
                    profitPercent,
                    isOpen: false
                });
            }
        }

        // Сортируем по прибыли
        allPositions.sort((a, b) => b.profit - a.profit);

        const profitable = allPositions
            .filter(p => p.profit > 0)
            .slice(0, count)
            .map(p => ({
                ticker: p.ticker,
                name: p.name,
                profit: p.profit,
                profitPercent: p.profitPercent.toFixed(2),
                isOpen: p.isOpen
            }));

        const unprofitable = allPositions
            .filter(p => p.profit < 0)
            .slice(-count)
            .reverse()
            .map(p => ({
                ticker: p.ticker,
                name: p.name,
                profit: p.profit,
                profitPercent: p.profitPercent.toFixed(2),
                isOpen: p.isOpen
            }));

        return {
            profitable,
            unprofitable
        };
    }

    /**
     * Получение статистики по стратегиям
     */
    async getStrategyStats(openPositions, closedPositions) {
        const stats = {};

        // Обрабатываем открытые позиции
        for (const position of openPositions) {
            const strategyId = position.strategyId || 'no_strategy';
            if (!stats[strategyId]) {
                stats[strategyId] = {
                    open: 0,
                    closed: 0,
                    totalPnL: 0
                };
            }
            stats[strategyId].open++;
        }

        // Обрабатываем закрытые позиции
        for (const position of closedPositions) {
            const strategyId = position.strategyId || 'no_strategy';
            if (!stats[strategyId]) {
                stats[strategyId] = {
                    open: 0,
                    closed: 0,
                    totalPnL: 0
                };
            }
            stats[strategyId].closed++;

            if (position.profit) {
                stats[strategyId].totalPnL += position.profit;
            }
        }

        return stats;
    }

    /**
     * Форматирование отчета для Telegram
     */
    formatReportForTelegram(report) {
        let message = `📊 ЕЖЕДНЕВНЫЙ ОТЧЕТ\n`;
        message += `Дата: ${report.date}\n\n`;

        // Сводка
        message += `📈 СВОДКА:\n`;
        message += `Открытых позиций: ${report.summary.openPositions}\n`;
        message += `Закрыто сегодня: ${report.summary.closedToday}\n`;
        
        if (report.dailyPnL) {
            const dailyPnL = report.dailyPnL.total;
            const emoji = dailyPnL >= 0 ? '📈' : '📉';
            message += `${emoji} P&L за день: ${dailyPnL >= 0 ? '+' : ''}${dailyPnL.toFixed(2)}₽\n`;
            message += `  Прибыльных: ${report.dailyPnL.profitable}\n`;
            message += `  Убыточных: ${report.dailyPnL.unprofitable}\n`;
        }

        if (report.totalPnL) {
            const totalPnL = report.totalPnL.total;
            const emoji = totalPnL >= 0 ? '📈' : '📉';
            message += `${emoji} Общий P&L: ${totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}₽\n`;
            message += `  Реализовано: ${report.totalPnL.realized.toFixed(2)}₽\n`;
            message += `  Нереализовано: ${report.totalPnL.unrealized.toFixed(2)}₽\n`;
        }

        message += `\n`;

        // Топ позиции
        if (report.topPositions.profitable.length > 0) {
            message += `🏆 ТОП-${report.topPositions.profitable.length} ПРИБЫЛЬНЫХ:\n`;
            report.topPositions.profitable.forEach((pos, index) => {
                const status = pos.isOpen ? '🟢' : '🔴';
                message += `${index + 1}. ${status} ${pos.ticker}: ${pos.profit >= 0 ? '+' : ''}${pos.profit.toFixed(2)}₽ (${pos.profitPercent >= 0 ? '+' : ''}${pos.profitPercent}%)\n`;
            });
            message += `\n`;
        }

        if (report.topPositions.unprofitable.length > 0) {
            message += `📉 ТОП-${report.topPositions.unprofitable.length} УБЫТОЧНЫХ:\n`;
            report.topPositions.unprofitable.forEach((pos, index) => {
                const status = pos.isOpen ? '🟢' : '🔴';
                message += `${index + 1}. ${status} ${pos.ticker}: ${pos.profit.toFixed(2)}₽ (${pos.profitPercent}%)\n`;
            });
            message += `\n`;
        }

        // Статистика по стратегиям
        if (Object.keys(report.strategyStats).length > 0) {
            message += `📊 ПО СТРАТЕГИЯМ:\n`;
            for (const [strategyId, stats] of Object.entries(report.strategyStats)) {
                const strategyName = strategyId === 'no_strategy' ? 'Без стратегии' : `Стратегия ${strategyId}`;
                message += `${strategyName}:\n`;
                message += `  Открыто: ${stats.open}\n`;
                message += `  Закрыто: ${stats.closed}\n`;
                if (stats.totalPnL !== 0) {
                    message += `  P&L: ${stats.totalPnL >= 0 ? '+' : ''}${stats.totalPnL.toFixed(2)}₽\n`;
                }
            }
        }

        return message;
    }

    /**
     * Отправка отчета в Telegram
     */
    async sendReportToTelegram(report) {
        try {
            if (!this.settings.enableTelegramReports) {
                return;
            }

            const message = this.formatReportForTelegram(report);

            const OptimizedTelegramService = ServiceManager.getServiceSafe('OptimizedTelegramService');
            if (OptimizedTelegramService && OptimizedTelegramService.isInitialized) {
                await OptimizedTelegramService.sendAlert(
                    'DAILY_REPORT',
                    message,
                    'info'
                );
                LoggerService.info('✅ Daily report sent to Telegram');
            }
        } catch (error) {
            LoggerService.error('❌ Error sending report to Telegram:', error);
        }
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
                await SettingsService.setSetting(`daily_reports.${key}`, value, {
                    description: `Настройка ежедневных отчетов: ${key}`,
                    category: 'daily_reports',
                    dataType: typeof value === 'number' ? 'number' : (typeof value === 'boolean' ? 'boolean' : 'string')
                });
            }
            
            LoggerService.info('✅ Daily report settings updated');
            return true;
        } catch (error) {
            LoggerService.error('❌ Failed to update daily report settings:', error);
            throw error;
        }
    }
}

export default new DailyReportService();

