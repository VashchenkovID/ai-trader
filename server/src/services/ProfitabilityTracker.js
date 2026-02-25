import Settings from '../models/Settings.js';
import MigrationStatus from '../models/MigrationStatus.js';
import OptimizedTelegramService from './OptimizedTelegramService.js';
import TradingEngine from './TradingEngine.js';
import sequelize from '../config/database.js';
import {
    calculateSortinoRatio,
    calculateCalmarRatio,
    calculateMAEandMFE,
    analyzeByDayOfWeek,
    analyzeByMonth
} from '../utils/advancedMetrics.js';

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
        this.maxDailyStatsEntries = 365; // Ограничение: последний год
        this.maxWeeklyStatsEntries = 52; // Ограничение: последний год
        this.maxMonthlyStatsEntries = 24; // Ограничение: последние 2 года
    }

    _trimStats() {
        if (this.dailyStats.size > this.maxDailyStatsEntries) {
            const entries = [...this.dailyStats.entries()].sort((a, b) => b[0].localeCompare(a[0]));
            for (let i = this.maxDailyStatsEntries; i < entries.length; i++) {
                this.dailyStats.delete(entries[i][0]);
            }
        }
        if (this.weeklyStats.size > this.maxWeeklyStatsEntries) {
            const entries = [...this.weeklyStats.entries()].sort((a, b) => b[0].localeCompare(a[0]));
            for (let i = this.maxWeeklyStatsEntries; i < entries.length; i++) {
                this.weeklyStats.delete(entries[i][0]);
            }
        }
        if (this.monthlyStats.size > this.maxMonthlyStatsEntries) {
            const entries = [...this.monthlyStats.entries()].sort((a, b) => b[0].localeCompare(a[0]));
            for (let i = this.maxMonthlyStatsEntries; i < entries.length; i++) {
                this.monthlyStats.delete(entries[i][0]);
            }
        }
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        try {
            
            await this.loadTrackingSettings();
            await this.loadHistoricalData();
            
            this.isInitialized = true;
            
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
            benchmarkComparison: await Settings.getSetting('profit_benchmark_comparison', false),
            
            // Продвинутые метрики
            riskFreeRate: await Settings.getSetting('profit_risk_free_rate', 8) // 8% годовых по умолчанию
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
        this._trimStats();
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
        this._trimStats();
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
        this._trimStats();
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
     * Получение даты из строки недели (формат: "2024-W01")
     */
    getDateFromWeek(weekString) {
        try {
            const [year, week] = weekString.split('-W');
            const firstDayOfYear = new Date(parseInt(year), 0, 1);
            const daysOffset = (parseInt(week) - 1) * 7;
            const weekStart = new Date(firstDayOfYear);
            weekStart.setDate(firstDayOfYear.getDate() + daysOffset - firstDayOfYear.getDay());
            return weekStart;
        } catch (error) {
            return new Date();
        }
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
            const metrics = await this.calculateMetrics(stats, period);
            
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
    async calculateMetrics(stats, period) {
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
        
        // Для расчета Sharpe Ratio используем относительные доходности, а не абсолютные прибыли
        // Разделяем расчет для реального и виртуального портфеля
        let volatility = 0;
        let sharpeRatio = 0;
        
        try {
            const TradingEngine = (await import('./TradingEngine.js')).default;
            const TradingModeManager = (await import('./TradingModeManager.js')).default;
            
            // Получаем текущий режим торговли
            const currentMode = TradingModeManager.getCurrentMode();
            const mode = currentMode?.mode || currentMode || 'paper';
            
            // Получаем портфель для текущего режима
            let portfolio;
            let initialCapital = 1000000; // Значение по умолчанию
            
            if (mode === 'paper') {
                // Виртуальный портфель
                portfolio = await TradingEngine.getVirtualPortfolioValue();
                initialCapital = portfolio?.initialCapital || initialCapital;
            } else {
                // Реальный портфель
                try {
                    portfolio = await TradingEngine.getRealPortfolioValue();
                    initialCapital = portfolio?.initialCapital || initialCapital;
                } catch (error) {
                    // Если не удалось получить реальный портфель, используем виртуальный
                    portfolio = await TradingEngine.getVirtualPortfolioValue();
                    initialCapital = portfolio?.initialCapital || initialCapital;
                }
            }
            
            // Получаем сделки для текущего режима
            let trades = [];
            if (mode === 'paper') {
                // Виртуальные сделки
                trades = TradingEngine.virtualPortfolio?.trades || [];
            } else {
                // Реальные сделки - получаем из БД
                try {
                    const PnLCalculationService = (await import('./PnLCalculationService.js')).default;
                    const closedTrades = await PnLCalculationService.getClosedTrades('real');
                    trades = closedTrades || [];
                } catch (error) {
                    // Если не удалось получить реальные сделки, используем виртуальные
                    trades = TradingEngine.virtualPortfolio?.trades || [];
                }
            }
            
            // Фильтруем сделки по периоду статистики и только закрытые сделки с PnL
            // Определяем даты начала и конца периода из stats
            let statsStartDate = new Date();
            let statsEndDate = new Date();
            
            if (stats.length > 0) {
                // Для дневной статистики используем date
                if (stats[0].date) {
                    statsStartDate = new Date(stats[0].date);
                    statsEndDate = new Date(stats[stats.length - 1].date);
                } 
                // Для недельной статистики используем week (формат: "2024-W01")
                else if (stats[0].week) {
                    const firstWeek = stats[0].week;
                    const lastWeek = stats[stats.length - 1].week;
                    // Преобразуем неделю в дату (первый день недели)
                    statsStartDate = this.getDateFromWeek(firstWeek);
                    statsEndDate = this.getDateFromWeek(lastWeek);
                    // Добавляем 6 дней к конечной дате, чтобы получить последний день недели
                    statsEndDate = new Date(statsEndDate.getTime() + 6 * 24 * 60 * 60 * 1000);
                }
                // Для месячной статистики используем month (формат: "2024-01")
                else if (stats[0].month) {
                    statsStartDate = new Date(stats[0].month + '-01');
                    const lastMonth = stats[stats.length - 1].month;
                    // Получаем последний день месяца
                    const lastMonthDate = new Date(lastMonth + '-01');
                    lastMonthDate.setMonth(lastMonthDate.getMonth() + 1);
                    lastMonthDate.setDate(0);
                    statsEndDate = lastMonthDate;
                }
            }
            
            const periodTrades = trades.filter(trade => {
                const tradeDate = new Date(trade.timestamp || trade.date || trade.createdAt);
                const hasValidPnL = trade.pnl !== null && 
                                    trade.pnl !== undefined && 
                                    !isNaN(trade.pnl) && 
                                    isFinite(trade.pnl);
                const isSell = (trade.action === 'SELL' || trade.type === 'SELL');
                const isNotBuy = (trade.action !== 'BUY' && trade.type !== 'BUY');
                
                return tradeDate >= statsStartDate && 
                       tradeDate <= statsEndDate &&
                       hasValidPnL &&
                       (isSell || isNotBuy);
            }).sort((a, b) => {
                const dateA = new Date(a.timestamp || a.date || a.createdAt);
                const dateB = new Date(b.timestamp || b.date || b.createdAt);
                return dateA - dateB;
            });
            
            // Рассчитываем относительные доходности (в процентах) от капитала
            const returns = [];
            let runningCapital = initialCapital;
            
            for (const trade of periodTrades) {
                if (runningCapital > 0) {
                    // Относительная доходность от текущего капитала
                    const returnPercent = (trade.pnl / runningCapital) * 100;
                    returns.push(returnPercent);
                    runningCapital += trade.pnl; // Обновляем капитал для следующей сделки
                }
            }
            
            // Расчет волатильности из относительных доходностей
            if (returns.length > 1) {
                const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
                const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
                volatility = Math.sqrt(variance);
                
                // Sharpe Ratio: (Average Return - Risk-Free Rate) / Volatility
                // Безрисковая ставка = 0 для упрощения
                sharpeRatio = volatility > 0 ? avgReturn / volatility : 0;
            } else if (returns.length === 1) {
                // Если только одна сделка, волатильность = 0, Sharpe Ratio = 0
                volatility = 0;
                sharpeRatio = 0;
            }
        } catch (error) {
            console.warn('⚠️ Ошибка расчета Sharpe Ratio:', error.message);
            // Используем значения по умолчанию
            volatility = 0;
            sharpeRatio = 0;
        }
        
        // Расчет фактора прибыли
        const grossProfit = stats.reduce((sum, stat) => sum + Math.max(0, stat.totalProfit), 0);
        const grossLoss = stats.reduce((sum, stat) => sum + Math.abs(Math.min(0, stat.totalProfit)), 0);
        const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 0;

        const baseMetrics = {
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

        const baselineComparison = this.calculateBaselineComparisonFromTrades(period, stats, totalProfit);

        // Добавляем продвинутые метрики
        const advancedMetrics = this.calculateAdvancedMetrics(stats, period, baseMetrics);
        
        return {
            ...baseMetrics,
            ...advancedMetrics,
            baselineComparison
        };
    }

    calculateBaselineComparisonFromTrades(period, stats, totalProfit) {
        try {
            const trades = TradingEngine.virtualPortfolio?.trades || [];
            const periodTrades = this.filterTradesByPeriod(trades, period, stats);
            const initialCapital = TradingEngine.virtualPortfolio?.initialCapital || 1;
            const aiReturnPct = initialCapital > 0 ? (totalProfit / initialCapital) * 100 : 0;

            if (!periodTrades || periodTrades.length === 0) {
                return {
                    aiReturnPct,
                    buyHoldReturnPct: 0,
                    momentumReturnPct: 0,
                    excessVsBuyHoldPct: aiReturnPct,
                    excessVsMomentumPct: aiReturnPct,
                    symbolsUsed: 0
                };
            }

            const bySymbol = new Map();
            for (const trade of periodTrades) {
                const symbol = trade.symbol || trade.ticker || trade.figi;
                const price = Number(trade.price);
                const ts = new Date(trade.timestamp || trade.date).getTime();
                if (!symbol || !Number.isFinite(price) || price <= 0 || !Number.isFinite(ts)) continue;
                if (!bySymbol.has(symbol)) bySymbol.set(symbol, []);
                bySymbol.get(symbol).push({ price, ts });
            }

            const average = (arr) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
            const buyHoldReturns = [];
            const momentumReturns = [];

            for (const points of bySymbol.values()) {
                points.sort((a, b) => a.ts - b.ts);
                if (points.length < 2) continue;
                const buyHold = ((points[points.length - 1].price - points[0].price) / points[0].price) * 100;
                buyHoldReturns.push(buyHold);

                if (points.length >= 3) {
                    let equity = 1.0;
                    for (let i = 2; i < points.length; i++) {
                        const prevMove = points[i - 1].price - points[i - 2].price;
                        const ret = (points[i].price - points[i - 1].price) / points[i - 1].price;
                        equity *= (1 + (prevMove >= 0 ? ret : -ret));
                    }
                    momentumReturns.push((equity - 1) * 100);
                }
            }

            const buyHoldReturnPct = average(buyHoldReturns);
            const momentumReturnPct = average(momentumReturns);
            return {
                aiReturnPct,
                buyHoldReturnPct,
                momentumReturnPct,
                excessVsBuyHoldPct: aiReturnPct - buyHoldReturnPct,
                excessVsMomentumPct: aiReturnPct - momentumReturnPct,
                symbolsUsed: bySymbol.size
            };
        } catch (error) {
            return {
                aiReturnPct: 0,
                buyHoldReturnPct: 0,
                momentumReturnPct: 0,
                excessVsBuyHoldPct: 0,
                excessVsMomentumPct: 0,
                symbolsUsed: 0,
                error: error.message
            };
        }
    }

    /**
     * Расчет продвинутых метрик производительности
     * @param {Array} stats - Статистика за период
     * @param {string} period - Период ('daily', 'weekly', 'monthly')
     * @param {Object} baseMetrics - Базовые метрики (для переиспользования расчетов)
     * @returns {Object} Продвинутые метрики
     */
    calculateAdvancedMetrics(stats, period, baseMetrics = {}) {
        if (stats.length === 0) {
            return {
                sortinoRatio: 0,
                calmarRatio: 0,
                informationRatio: null,
                mae: null,
                mfe: null,
                maeMfeAvailable: false,
                periodAnalysis: null
            };
        }

        const advancedMetrics = {};

        // 1. Sortino Ratio
        try {
            // Рассчитываем доходности из статистики
            const returns = stats.map(stat => {
                // Преобразуем прибыль в процентную доходность
                // Используем упрощенный подход: доходность = прибыль / средняя прибыль
                const avgProfit = baseMetrics.averageDailyProfit || 1;
                return avgProfit > 0 ? (stat.totalProfit / avgProfit) * 100 : 0; // Преобразуем в проценты
            });

            // Если есть достаточно данных, рассчитываем Sortino Ratio
            if (returns.length > 0) {
                const riskFreeRate = this.trackingSettings.riskFreeRate || 8; // 8% годовых по умолчанию
                advancedMetrics.sortinoRatio = calculateSortinoRatio(returns, riskFreeRate, 252);
            } else {
                advancedMetrics.sortinoRatio = 0;
            }
        } catch (error) {
            console.warn('⚠️ Ошибка расчета Sortino Ratio:', error.message);
            advancedMetrics.sortinoRatio = 0;
        }

        // 2. Calmar Ratio
        try {
            if (baseMetrics.maxDrawdown && baseMetrics.maxDrawdown > 0) {
                // Рассчитываем годовую доходность
                const daysInPeriod = stats.length;
                const tradingDaysPerYear = 252;
                
                // Преобразуем среднюю дневную прибыль в годовую доходность (в процентах)
                // Предполагаем, что averageDailyProfit - это процент от капитала
                const avgDailyReturn = baseMetrics.averageDailyProfit || 0;
                const annualReturnPercent = avgDailyReturn * tradingDaysPerYear;
                
                advancedMetrics.calmarRatio = calculateCalmarRatio(annualReturnPercent, baseMetrics.maxDrawdown);
            } else {
                advancedMetrics.calmarRatio = 0;
            }
        } catch (error) {
            console.warn('⚠️ Ошибка расчета Calmar Ratio:', error.message);
            advancedMetrics.calmarRatio = 0;
        }

        // 3. Information Ratio (требует бенчмарк)
        try {
            // Information Ratio рассчитывается только если есть бенчмарк
            // Проверяем настройку benchmarkComparison
            if (this.trackingSettings.benchmarkComparison) {
                // Здесь нужно получить доходности бенчмарка
                // Пока оставляем null, так как бенчмарк не определен
                advancedMetrics.informationRatio = null;
            } else {
                advancedMetrics.informationRatio = null; // null означает, что метрика не применима
            }
        } catch (error) {
            console.warn('⚠️ Ошибка расчета Information Ratio:', error.message);
            advancedMetrics.informationRatio = null;
        }

        // 4. MAE/MFE (требует данные о сделках со свечами)
        try {
            // Получаем сделки из TradingEngine
            const trades = TradingEngine.virtualPortfolio?.trades || [];
            
            if (trades.length > 0) {
                // Фильтруем сделки по периоду
                const periodTrades = this.filterTradesByPeriod(trades, period, stats);
                
                // Пытаемся рассчитать MAE/MFE из доступных данных сделок
                // Если у сделок есть entryPrice/exitPrice или price, используем их
                const tradesForMAEMFE = periodTrades.map(trade => {
                    // Преобразуем формат сделки для calculateMAEandMFE
                    const entryPrice = trade.entryPrice || trade.price || (trade.action === 'BUY' ? trade.price : null);
                    const exitPrice = trade.exitPrice || trade.price || (trade.action === 'SELL' ? trade.price : null);
                    const entryTime = trade.entryTime || trade.timestamp || trade.date;
                    const exitTime = trade.exitTime || trade.timestamp || trade.date;
                    
                    return {
                        ...trade,
                        entryPrice: entryPrice,
                        exitPrice: exitPrice,
                        entryTime: entryTime,
                        exitTime: exitTime,
                        historicalPrices: trade.historicalPrices || [] // Если есть исторические цены
                    };
                }).filter(trade => trade.entryPrice && trade.exitPrice);
                
                if (tradesForMAEMFE.length > 0) {
                    // Вызываем calculateMAEandMFE (без свечей, будет использован упрощенный расчет)
                    const { mae, mfe, maeMfeAvailable } = calculateMAEandMFE(tradesForMAEMFE, null);
                    advancedMetrics.mae = mae || 0;
                    advancedMetrics.mfe = mfe || 0;
                    advancedMetrics.maeMfeAvailable = maeMfeAvailable;
                } else {
                    advancedMetrics.mae = 0;
                    advancedMetrics.mfe = 0;
                    advancedMetrics.maeMfeAvailable = false;
                }
            } else {
                advancedMetrics.mae = 0;
                advancedMetrics.mfe = 0;
                advancedMetrics.maeMfeAvailable = false;
            }
        } catch (error) {
            console.warn('⚠️ Ошибка расчета MAE/MFE:', error.message);
            advancedMetrics.mae = 0;
            advancedMetrics.mfe = 0;
            advancedMetrics.maeMfeAvailable = false;
        }

        // 5. Анализ по периодам (дни недели, месяцы)
        try {
            const trades = TradingEngine.virtualPortfolio?.trades || [];
            
            if (trades.length > 0) {
                // Фильтруем сделки по периоду
                const periodTrades = this.filterTradesByPeriod(trades, period, stats);
                
                advancedMetrics.periodAnalysis = {
                    byDayOfWeek: analyzeByDayOfWeek(periodTrades),
                    byMonth: analyzeByMonth(periodTrades)
                };
            } else {
                advancedMetrics.periodAnalysis = null;
            }
        } catch (error) {
            console.warn('⚠️ Ошибка анализа по периодам:', error.message);
            advancedMetrics.periodAnalysis = null;
        }

        return advancedMetrics;
    }

    /**
     * Фильтрация сделок по периоду
     * @param {Array} trades - Массив сделок
     * @param {string} period - Период ('daily', 'weekly', 'monthly')
     * @param {Array} stats - Статистика за период
     * @returns {Array} Отфильтрованные сделки
     */
    filterTradesByPeriod(trades, period, stats) {
        if (!trades || trades.length === 0 || !stats || stats.length === 0) {
            return [];
        }

        // Определяем диапазон дат из статистики в зависимости от типа периода
        const dates = stats.map(stat => {
            // Для дневной статистики
            if (stat.date) {
                return new Date(stat.date);
            }
            // Для недельной статистики (используем первую дату недели)
            if (stat.week) {
                const [year, week] = stat.week.split('-W');
                const date = this.getDateFromWeek(year, parseInt(week));
                return date;
            }
            // Для месячной статистики (используем первое число месяца)
            if (stat.month) {
                const [year, month] = stat.month.split('-');
                return new Date(year, parseInt(month) - 1, 1);
            }
            // Fallback для других форматов
            if (stat.day) {
                return new Date(stat.day);
            }
            return null;
        }).filter(date => date !== null && !isNaN(date.getTime()));

        if (dates.length === 0) {
            return [];
        }

        const startDate = new Date(Math.min(...dates));
        let endDate = new Date(Math.max(...dates));
        
        // Устанавливаем время для корректного сравнения
        startDate.setHours(0, 0, 0, 0);
        
        // Для недельной и месячной статистики расширяем конечную дату
        if (period === 'weekly') {
            // Для weekly берем последнюю дату и добавляем 6 дней
            const lastWeekDate = new Date(Math.max(...dates));
            endDate = new Date(lastWeekDate);
            endDate.setDate(lastWeekDate.getDate() + 6); // Добавляем 6 дней к началу последней недели
        } else if (period === 'monthly') {
            // Для monthly берем последний месяц и устанавливаем последний день месяца
            const lastMonthDate = new Date(Math.max(...dates));
            endDate = new Date(lastMonthDate.getFullYear(), lastMonthDate.getMonth() + 1, 0); // Последний день месяца
        }
        endDate.setHours(23, 59, 59, 999);

        // Фильтруем сделки
        const filteredTrades = trades.filter(trade => {
            const tradeDate = trade.timestamp ? new Date(trade.timestamp) : 
                            trade.date ? new Date(trade.date) : null;
            
            if (!tradeDate || isNaN(tradeDate.getTime())) {
                return false;
            }

            // Нормализуем время для сравнения (только дата, без времени)
            const tradeDateOnly = new Date(tradeDate.getFullYear(), tradeDate.getMonth(), tradeDate.getDate());
            const startDateOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
            const endDateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

            return tradeDateOnly >= startDateOnly && tradeDateOnly <= endDateOnly;
        });

        return filteredTrades;
    }

    /**
     * Получение даты из номера недели
     * @param {number|string} year - Год
     * @param {number} week - Номер недели
     * @returns {Date} Дата начала недели
     */
    getDateFromWeek(year, week) {
        const simple = new Date(year, 0, 1 + (week - 1) * 7);
        const dow = simple.getDay();
        const ISOweekStart = simple;
        if (dow <= 4) {
            ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
        } else {
            ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
        }
        return ISOweekStart;
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
                totalTrades: totalPositions, // Алиас для совместимости
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
