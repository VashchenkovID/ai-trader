import Settings from '../models/Settings.js';
import MigrationStatus from '../models/MigrationStatus.js';
import OptimizedTelegramService from './OptimizedTelegramService.js';
import TradingEngine from './TradingEngine.js';
import sequelize from '../config/database.js';

/**
 * Сервис для отслеживания прибыльности системы
 * 
 * Основные функции:
 * - Отслеживание прибыли/убытков по дням, неделям, месяцам
 * - Расчет ключевых метрик производительности
 * - Анализ трендов и паттернов
 * - Генерация отчетов о прибыльности
 */
class ProfitabilityTracker {
    constructor() {
        this.isInitialized = false;
        this.trackingSettings = {};
        this.dailyStats = new Map();
        this.weeklyStats = new Map();
        this.monthlyStats = new Map();
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        try {
            console.log('🚀 Инициализация ProfitabilityTracker...');
            
            await this.loadTrackingSettings();
            await this.loadHistoricalData();
            
            this.isInitialized = true;
            console.log('✅ ProfitabilityTracker инициализирован');
            
        } catch (error) {
            console.error('❌ Ошибка инициализации ProfitabilityTracker:', error);
            throw error;
        }
    }

    /**
     * Загрузка настроек отслеживания
     */
    async loadTrackingSettings() {
        this.trackingSettings = {
            // Периоды отслеживания
            dailyTrackingEnabled: await Settings.getSetting('profit_daily_tracking', true),
            weeklyTrackingEnabled: await Settings.getSetting('profit_weekly_tracking', true),
            monthlyTrackingEnabled: await Settings.getSetting('profit_monthly_tracking', true),
            
            // Пороги для уведомлений
            profitThreshold: await Settings.getSetting('profit_threshold', 0.05), // 5%
            lossThreshold: await Settings.getSetting('loss_threshold', -0.03), // -3%
            drawdownThreshold: await Settings.getSetting('profit_drawdown_threshold', 0.08), // 8%
            
            // Параметры анализа
            movingAverageDays: await Settings.getSetting('profit_moving_average_days', 7),
            trendAnalysisDays: await Settings.getSetting('profit_trend_analysis_days', 30),
            volatilityWindow: await Settings.getSetting('profit_volatility_window', 14),
            
            // Уведомления
            notifyOnProfit: await Settings.getSetting('profit_notify_on_profit', true),
            notifyOnLoss: await Settings.getSetting('profit_notify_on_loss', true),
            notifyOnDrawdown: await Settings.getSetting('profit_notify_on_drawdown', true),
            notifyOnTrendChange: await Settings.getSetting('profit_notify_on_trend_change', true),
            
            // Отчеты
            dailyReportEnabled: await Settings.getSetting('profit_daily_report', false),
            weeklyReportEnabled: await Settings.getSetting('profit_weekly_report', true),
            monthlyReportEnabled: await Settings.getSetting('profit_monthly_report', true),
            
            // Анализ
            correlationAnalysis: await Settings.getSetting('profit_correlation_analysis', true),
            riskAdjustedReturns: await Settings.getSetting('profit_risk_adjusted_returns', true),
            benchmarkComparison: await Settings.getSetting('profit_benchmark_comparison', false)
        };
    }

    /**
     * Проверка существования таблицы
     */
    async checkTableExists(tableName) {
        try {
            const queryInterface = sequelize.getQueryInterface();
            const tables = await queryInterface.showAllTables();
            return tables.includes(tableName);
        } catch (error) {
            console.warn(`⚠️ Ошибка проверки таблицы ${tableName}:`, error.message);
            return false;
        }
    }

    /**
     * Загрузка исторических данных
     */
    async loadHistoricalData() {
        try {
            // Проверяем, существует ли таблица migration_status
            const tableExists = await this.checkTableExists('migration_status');
            if (!tableExists) {
                console.log('⚠️ Таблица migration_status не существует, пропускаем загрузку исторических данных');
                return;
            }

            // Загружаем данные из миграций
            const migrations = await MigrationStatus.findAll({
                where: {
                    status: 'completed'
                },
                order: [['endTime', 'ASC']]
            });

            // Обрабатываем данные миграций
            for (const migration of migrations) {
                const date = new Date(migration.endTime);
                const stats = migration.stats || {};
                
                await this.recordMigrationStats(date, stats);
            }

            // Загружаем данные из торговых операций
            if (TradingEngine.virtualPortfolio && TradingEngine.virtualPortfolio.trades) {
                const trades = TradingEngine.virtualPortfolio.trades;
                
                for (const trade of trades) {
                    const date = new Date(trade.timestamp);
                    await this.recordTradeStats(date, trade);
                }
            }

            console.log(`📊 Загружено ${migrations.length} миграций и ${TradingEngine.virtualPortfolio?.trades?.length || 0} сделок`);

        } catch (error) {
            console.error('❌ Ошибка загрузки исторических данных:', error);
        }
    }

    /**
     * Запись статистики миграции
     */
    async recordMigrationStats(date, stats) {
        const dayKey = this.getDayKey(date);
        const weekKey = this.getWeekKey(date);
        const monthKey = this.getMonthKey(date);

        const migrationData = {
            type: 'migration',
            date,
            profit: stats.totalProfit || 0,
            profitPercent: stats.profitPercent || 0,
            drawdown: stats.maxDrawdown || 0,
            winRate: stats.winRate || 0,
            trades: stats.totalTrades || 0,
            capital: stats.finalCapital || 0
        };

        // Обновляем дневную статистику
        this.updateDailyStats(dayKey, migrationData);
        
        // Обновляем недельную статистику
        this.updateWeeklyStats(weekKey, migrationData);
        
        // Обновляем месячную статистику
        this.updateMonthlyStats(monthKey, migrationData);
    }

    /**
     * Запись статистики сделки
     */
    async recordTradeStats(date, trade) {
        const dayKey = this.getDayKey(date);
        const weekKey = this.getWeekKey(date);
        const monthKey = this.getMonthKey(date);

        const tradeData = {
            type: 'trade',
            date,
            profit: trade.pnl || 0,
            symbol: trade.symbol,
            action: trade.action,
            quantity: trade.quantity,
            price: trade.price
        };

        // Обновляем дневную статистику
        this.updateDailyStats(dayKey, tradeData);
        
        // Обновляем недельную статистику
        this.updateWeeklyStats(weekKey, tradeData);
        
        // Обновляем месячную статистику
        this.updateMonthlyStats(monthKey, tradeData);
        
        // Обновляем статистику инструмента при закрытии позиции (SELL)
        // Примечание: Основное обновление происходит в TradingEngine.executePaperOrder,
        // здесь обновляем только если trade содержит resultPercent напрямую
        if (trade.action === 'SELL' && trade.resultPercent !== undefined && trade.resultPercent !== null) {
            try {
                const RiskManagementService = (await import('./RiskManagementService.js')).default;
                if (RiskManagementService.isInitialized) {
                    const figi = trade.figi || trade.symbol;
                    const ticker = trade.ticker || trade.symbol;
                    
                    await RiskManagementService.updateInstrumentStats(figi, ticker, trade.resultPercent);
                }
            } catch (error) {
                // Не прерываем запись статистики при ошибке обновления статистики инструмента
                console.warn(`⚠️ Не удалось обновить статистику инструмента для ${trade.symbol}:`, error.message);
            }
        }
    }

    /**
     * Обновление дневной статистики
     */
    updateDailyStats(dayKey, data) {
        if (!this.dailyStats.has(dayKey)) {
            this.dailyStats.set(dayKey, {
                date: new Date(dayKey),
                totalProfit: 0,
                totalTrades: 0,
                profitableTrades: 0,
                maxDrawdown: 0,
                trades: [],
                migrations: []
            });
        }

        const dayStats = this.dailyStats.get(dayKey);
        dayStats.totalProfit += data.profit || 0;
        
        if (data.type === 'trade') {
            dayStats.totalTrades++;
            if (data.profit > 0) dayStats.profitableTrades++;
            dayStats.trades.push(data);
        } else if (data.type === 'migration') {
            dayStats.migrations.push(data);
            dayStats.maxDrawdown = Math.max(dayStats.maxDrawdown, data.drawdown || 0);
        }
    }

    /**
     * Обновление недельной статистики
     */
    updateWeeklyStats(weekKey, data) {
        if (!this.weeklyStats.has(weekKey)) {
            this.weeklyStats.set(weekKey, {
                week: weekKey,
                totalProfit: 0,
                totalTrades: 0,
                profitableTrades: 0,
                maxDrawdown: 0,
                days: new Set()
            });
        }

        const weekStats = this.weeklyStats.get(weekKey);
        weekStats.totalProfit += data.profit || 0;
        
        if (data.type === 'trade') {
            weekStats.totalTrades++;
            if (data.profit > 0) weekStats.profitableTrades++;
        } else if (data.type === 'migration') {
            weekStats.maxDrawdown = Math.max(weekStats.maxDrawdown, data.drawdown || 0);
        }
        
        weekStats.days.add(this.getDayKey(data.date));
    }

    /**
     * Обновление месячной статистики
     */
    updateMonthlyStats(monthKey, data) {
        if (!this.monthlyStats.has(monthKey)) {
            this.monthlyStats.set(monthKey, {
                month: monthKey,
                totalProfit: 0,
                totalTrades: 0,
                profitableTrades: 0,
                maxDrawdown: 0,
                weeks: new Set()
            });
        }

        const monthStats = this.monthlyStats.get(monthKey);
        monthStats.totalProfit += data.profit || 0;
        
        if (data.type === 'trade') {
            monthStats.totalTrades++;
            if (data.profit > 0) monthStats.profitableTrades++;
        } else if (data.type === 'migration') {
            monthStats.maxDrawdown = Math.max(monthStats.maxDrawdown, data.drawdown || 0);
        }
        
        monthStats.weeks.add(this.getWeekKey(data.date));
    }

    /**
     * Получение ключа дня
     */
    getDayKey(date) {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString().split('T')[0];
    }

    /**
     * Получение ключа недели
     */
    getWeekKey(date) {
        const year = date.getFullYear();
        const week = this.getWeekNumber(date);
        return `${year}-W${week.toString().padStart(2, '0')}`;
    }

    /**
     * Получение ключа месяца
     */
    getMonthKey(date) {
        return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
    }

    /**
     * Получение номера недели
     */
    getWeekNumber(date) {
        const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
        const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
        return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
    }

    /**
     * Анализ прибыльности за период
     */
    async analyzeProfitability(period = 'month', days = 30) {
        try {
            const endDate = new Date();
            const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
            
            let stats;
            switch (period) {
                case 'day':
                    stats = this.getDailyStatsForPeriod(startDate, endDate);
                    break;
                case 'week':
                    stats = this.getWeeklyStatsForPeriod(startDate, endDate);
                    break;
                case 'month':
                    stats = this.getMonthlyStatsForPeriod(startDate, endDate);
                    break;
                default:
                    throw new Error(`Неизвестный период: ${period}`);
            }

            // Рассчитываем метрики
            const metrics = this.calculateMetrics(stats, period);
            
            // Анализируем тренды
            const trends = this.analyzeTrends(stats, period);
            
            // Проверяем пороги
            const alerts = this.checkThresholds(metrics);

            return {
                period,
                days,
                startDate,
                endDate,
                stats,
                metrics,
                trends,
                alerts,
                timestamp: new Date()
            };

        } catch (error) {
            console.error('❌ Ошибка анализа прибыльности:', error);
            throw error;
        }
    }

    /**
     * Получение дневной статистики за период
     */
    getDailyStatsForPeriod(startDate, endDate) {
        const stats = [];
        
        for (const [dayKey, dayStats] of this.dailyStats) {
            const date = new Date(dayKey);
            if (date >= startDate && date <= endDate) {
                stats.push({
                    ...dayStats,
                    winRate: dayStats.totalTrades > 0 ? dayStats.profitableTrades / dayStats.totalTrades : 0
                });
            }
        }
        
        return stats.sort((a, b) => new Date(a.date) - new Date(b.date));
    }

    /**
     * Получение недельной статистики за период
     */
    getWeeklyStatsForPeriod(startDate, endDate) {
        const stats = [];
        
        for (const [weekKey, weekStats] of this.weeklyStats) {
            const weekDate = new Date(weekKey);
            if (weekDate >= startDate && weekDate <= endDate) {
                stats.push({
                    ...weekStats,
                    winRate: weekStats.totalTrades > 0 ? weekStats.profitableTrades / weekStats.totalTrades : 0,
                    daysCount: weekStats.days.size
                });
            }
        }
        
        return stats.sort((a, b) => a.week.localeCompare(b.week));
    }

    /**
     * Получение месячной статистики за период
     */
    getMonthlyStatsForPeriod(startDate, endDate) {
        const stats = [];
        
        for (const [monthKey, monthStats] of this.monthlyStats) {
            const monthDate = new Date(monthKey + '-01');
            if (monthDate >= startDate && monthDate <= endDate) {
                stats.push({
                    ...monthStats,
                    winRate: monthStats.totalTrades > 0 ? monthStats.profitableTrades / monthStats.totalTrades : 0,
                    weeksCount: monthStats.weeks.size
                });
            }
        }
        
        return stats.sort((a, b) => a.month.localeCompare(b.month));
    }

    /**
     * Расчет метрик прибыльности
     */
    calculateMetrics(stats, period) {
        if (stats.length === 0) {
            return {
                totalProfit: 0,
                averageDailyProfit: 0,
                totalTrades: 0,
                winRate: 0,
                maxDrawdown: 0,
                volatility: 0,
                sharpeRatio: 0,
                profitFactor: 0
            };
        }

        const totalProfit = stats.reduce((sum, stat) => sum + stat.totalProfit, 0);
        const totalTrades = stats.reduce((sum, stat) => sum + stat.totalTrades, 0);
        const profitableTrades = stats.reduce((sum, stat) => sum + stat.profitableTrades, 0);
        const maxDrawdown = Math.max(...stats.map(stat => stat.maxDrawdown));
        
        const winRate = totalTrades > 0 ? profitableTrades / totalTrades : 0;
        const averageDailyProfit = totalProfit / stats.length;
        
        // Расчет волатильности
        const profits = stats.map(stat => stat.totalProfit);
        const avgProfit = profits.reduce((sum, p) => sum + p, 0) / profits.length;
        const variance = profits.reduce((sum, p) => sum + Math.pow(p - avgProfit, 2), 0) / profits.length;
        const volatility = Math.sqrt(variance);
        
        // Расчет коэффициента Шарпа (упрощенный)
        const sharpeRatio = volatility > 0 ? averageDailyProfit / volatility : 0;
        
        // Расчет фактора прибыли
        const grossProfit = stats.reduce((sum, stat) => sum + Math.max(0, stat.totalProfit), 0);
        const grossLoss = stats.reduce((sum, stat) => sum + Math.abs(Math.min(0, stat.totalProfit)), 0);
        const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 0;

        return {
            totalProfit,
            averageDailyProfit,
            totalTrades,
            winRate,
            maxDrawdown,
            volatility,
            sharpeRatio,
            profitFactor,
            grossProfit,
            grossLoss
        };
    }

    /**
     * Анализ трендов
     */
    analyzeTrends(stats, period) {
        if (stats.length < 2) {
            return { trend: 'insufficient_data', direction: 'neutral' };
        }

        const profits = stats.map(stat => stat.totalProfit);
        const recent = profits.slice(-Math.min(7, profits.length));
        const older = profits.slice(0, -Math.min(7, profits.length));
        
        const recentAvg = recent.reduce((sum, p) => sum + p, 0) / recent.length;
        const olderAvg = older.length > 0 ? older.reduce((sum, p) => sum + p, 0) / older.length : recentAvg;
        
        const trend = recentAvg > olderAvg ? 'improving' : recentAvg < olderAvg ? 'declining' : 'stable';
        const direction = recentAvg > 0 ? 'positive' : recentAvg < 0 ? 'negative' : 'neutral';
        
        return { trend, direction, recentAvg, olderAvg };
    }

    /**
     * Проверка порогов для уведомлений
     */
    checkThresholds(metrics) {
        const alerts = [];
        
        if (metrics.totalProfit > this.trackingSettings.profitThreshold) {
            alerts.push({
                type: 'profit',
                message: `Прибыль превысила порог: ${(metrics.totalProfit * 100).toFixed(2)}%`,
                level: 'info'
            });
        }
        
        if (metrics.totalProfit < this.trackingSettings.lossThreshold) {
            alerts.push({
                type: 'loss',
                message: `Убыток превысил порог: ${(metrics.totalProfit * 100).toFixed(2)}%`,
                level: 'warning'
            });
        }
        
        if (metrics.maxDrawdown > this.trackingSettings.drawdownThreshold) {
            alerts.push({
                type: 'drawdown',
                message: `Просадка превысила порог: ${(metrics.maxDrawdown * 100).toFixed(2)}%`,
                level: 'error'
            });
        }
        
        return alerts;
    }

    /**
     * Генерация отчета о прибыльности
     */
    async generateReport(period = 'month', days = 30) {
        try {
            const analysis = await this.analyzeProfitability(period, days);
            const { metrics, trends, alerts } = analysis;
            
            const report = {
                title: `Отчет о прибыльности за ${days} дней`,
                period,
                summary: {
                    totalProfit: metrics.totalProfit,
                    totalTrades: metrics.totalTrades,
                    winRate: (metrics.winRate * 100).toFixed(2) + '%',
                    maxDrawdown: (metrics.maxDrawdown * 100).toFixed(2) + '%',
                    volatility: metrics.volatility.toFixed(4),
                    sharpeRatio: metrics.sharpeRatio.toFixed(2),
                    profitFactor: metrics.profitFactor.toFixed(2)
                },
                trends: {
                    direction: trends.direction,
                    trend: trends.trend,
                    recentAverage: trends.recentAvg,
                    olderAverage: trends.olderAvg
                },
                alerts: alerts.map(alert => ({
                    type: alert.type,
                    message: alert.message,
                    level: alert.level
                })),
                recommendations: this.generateRecommendations(metrics, trends),
                timestamp: new Date()
            };

            return report;

        } catch (error) {
            console.error('❌ Ошибка генерации отчета:', error);
            throw error;
        }
    }

    /**
     * Генерация рекомендаций
     */
    generateRecommendations(metrics, trends) {
        const recommendations = [];
        
        if (metrics.winRate < 0.5) {
            recommendations.push('Низкий win rate. Рекомендуется пересмотреть стратегию входа.');
        }
        
        if (metrics.maxDrawdown > 0.1) {
            recommendations.push('Высокая просадка. Рекомендуется усилить риск-менеджмент.');
        }
        
        if (metrics.sharpeRatio < 0.5) {
            recommendations.push('Низкий коэффициент Шарпа. Рекомендуется оптимизировать соотношение риск/доходность.');
        }
        
        if (trends.trend === 'declining') {
            recommendations.push('Отрицательный тренд. Рекомендуется временно снизить активность торговли.');
        }
        
        if (metrics.profitFactor < 1.0) {
            recommendations.push('Фактор прибыли меньше 1. Рекомендуется пересмотреть стратегию выхода.');
        }
        
        return recommendations;
    }

    /**
     * Отправка уведомлений о прибыльности
     */
    async sendProfitabilityNotification(analysis) {
        try {
            const { metrics, trends, alerts } = analysis;
            
            if (alerts.length === 0) return;
            
            let message = '📊 УВЕДОМЛЕНИЕ О ПРИБЫЛЬНОСТИ\n\n';
            
            // Добавляем основные метрики
            message += `💰 Общая прибыль: ${metrics.totalProfit.toFixed(2)} руб.\n`;
            message += `📈 Win Rate: ${(metrics.winRate * 100).toFixed(2)}%\n`;
            message += `📉 Макс. просадка: ${(metrics.maxDrawdown * 100).toFixed(2)}%\n`;
            message += `📊 Торгов: ${metrics.totalTrades}\n\n`;
            
            // Добавляем тренды
            message += `📈 Тренд: ${trends.trend}\n`;
            message += `🎯 Направление: ${trends.direction}\n\n`;
            
            // Добавляем алерты
            if (alerts.length > 0) {
                message += '⚠️ АЛЕРТЫ:\n';
                alerts.forEach(alert => {
                    message += `• ${alert.message}\n`;
                });
            }
            
            await OptimizedTelegramService.sendAlert('📊 ПРИБЫЛЬНОСТЬ', message);
            
        } catch (error) {
            console.error('❌ Ошибка отправки уведомления:', error);
        }
    }

    /**
     * Получение статуса сервиса
     */
    async getStatus() {
        try {
            const analysis = await this.analyzeProfitability('month', 30);
            
            return {
                isInitialized: this.isInitialized,
                dailyStatsCount: this.dailyStats.size,
                weeklyStatsCount: this.weeklyStats.size,
                monthlyStatsCount: this.monthlyStats.size,
                currentMetrics: analysis.metrics,
                currentTrends: analysis.trends,
                alerts: analysis.alerts,
                settings: this.trackingSettings
            };

        } catch (error) {
            console.error('❌ Ошибка получения статуса:', error);
            return {
                isInitialized: this.isInitialized,
                error: error.message
            };
        }
    }

    /**
     * Расчет метрик производительности для стратегии за последние N дней
     * @param {number} strategyId - ID стратегии
     * @param {number} days - Количество дней для анализа (по умолчанию 30)
     * @returns {Object} Объект с метриками: sharpeRatio, winRate, maxDrawdown, totalReturn, avgReturn, volatility
     */
    async calculateStrategyMetrics(strategyId, days = 30) {
        try {
            const PositionStrategy = (await import('../models/PositionStrategy.js')).default;
            const TradingRequest = (await import('../models/TradingRequest.js')).default;
            const { Op } = await import('sequelize');

            // Вычисляем дату начала периода
            const endDate = new Date();
            const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

            // Получаем все закрытые позиции стратегии за период
            const closedPositions = await PositionStrategy.findAll({
                where: {
                    strategyId,
                    exitDate: {
                        [Op.not]: null,
                        [Op.gte]: startDate,
                        [Op.lte]: endDate
                    }
                },
                order: [['exitDate', 'ASC']]
            });

            if (closedPositions.length === 0) {
                // Если нет закрытых позиций, возвращаем нулевые метрики
                return {
                    strategyId,
                    days,
                    sharpeRatio: 0,
                    winRate: 0,
                    maxDrawdown: 0,
                    totalReturn: 0,
                    avgReturn: 0,
                    volatility: 0,
                    totalPositions: 0,
                    profitablePositions: 0,
                    losingPositions: 0,
                    insufficientData: true
                };
            }

            // Извлекаем результаты позиций (в процентах)
            const returns = closedPositions
                .map(pos => parseFloat(pos.resultPercent || 0))
                .filter(ret => !isNaN(ret));

            if (returns.length === 0) {
                return {
                    strategyId,
                    days,
                    sharpeRatio: 0,
                    winRate: 0,
                    maxDrawdown: 0,
                    totalReturn: 0,
                    avgReturn: 0,
                    volatility: 0,
                    totalPositions: 0,
                    profitablePositions: 0,
                    losingPositions: 0,
                    insufficientData: true
                };
            }

            // Рассчитываем базовые метрики
            const totalPositions = returns.length;
            const profitablePositions = returns.filter(r => r > 0).length;
            const losingPositions = returns.filter(r => r < 0).length;
            const winRate = totalPositions > 0 ? profitablePositions / totalPositions : 0;

            // Средняя доходность
            const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;

            // Общая доходность (сумма всех возвратов)
            const totalReturn = returns.reduce((sum, r) => sum + r, 0);

            // Волатильность (стандартное отклонение)
            const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
            const volatility = Math.sqrt(variance);

            // Sharpe Ratio (упрощенный: средняя доходность / волатильность)
            // Безрисковая ставка принимается равной 0 для упрощения
            const sharpeRatio = volatility > 0 ? avgReturn / volatility : 0;

            // Максимальная просадка (Max Drawdown)
            // Рассчитываем кумулятивную доходность и находим максимальную просадку от пика
            let cumulativeReturn = 0;
            let peak = 0;
            let maxDrawdown = 0;

            for (const ret of returns) {
                cumulativeReturn += ret;
                if (cumulativeReturn > peak) {
                    peak = cumulativeReturn;
                }
                const drawdown = peak - cumulativeReturn;
                if (drawdown > maxDrawdown) {
                    maxDrawdown = drawdown;
                }
            }

            return {
                strategyId,
                days,
                sharpeRatio: sharpeRatio || 0,
                winRate: winRate || 0,
                maxDrawdown: maxDrawdown || 0,
                totalReturn: totalReturn || 0,
                avgReturn: avgReturn || 0,
                volatility: volatility || 0,
                totalPositions,
                profitablePositions,
                losingPositions,
                insufficientData: false
            };

        } catch (error) {
            console.error(`❌ Ошибка расчета метрик для стратегии ${strategyId}:`, error);
            return {
                strategyId,
                days,
                sharpeRatio: 0,
                winRate: 0,
                maxDrawdown: 0,
                totalReturn: 0,
                avgReturn: 0,
                volatility: 0,
                totalPositions: 0,
                profitablePositions: 0,
                losingPositions: 0,
                insufficientData: true,
                error: error.message
            };
        }
    }

    /**
     * Расчет метрик для всех активных стратегий
     * @param {number} days - Количество дней для анализа (по умолчанию 30)
     * @returns {Array} Массив объектов с метриками для каждой стратегии
     */
    async calculateAllStrategiesMetrics(days = 30) {
        try {
            const TradingStrategy = (await import('../models/TradingStrategy.js')).default;

            const strategies = await TradingStrategy.findAll({
                where: { isActive: true }
            });

            const metricsPromises = strategies.map(strategy => 
                this.calculateStrategyMetrics(strategy.id, days)
            );

            const metrics = await Promise.all(metricsPromises);

            return metrics.map((metric, index) => ({
                ...metric,
                strategyName: strategies[index].name,
                strategyType: strategies[index].type
            }));

        } catch (error) {
            console.error('❌ Ошибка расчета метрик для всех стратегий:', error);
            return [];
        }
    }
}

export default new ProfitabilityTracker();
