import PerformanceAnalyzer from './PerformanceAnalyzer.js';
import TradingEngine from './TradingEngine.js';
import LoggerService from './LoggerService.js';

/**
 * Сервис для визуализации результатов производительности
 * Фаза 4.3.2: Визуализация результатов (графики, дашборды)
 */
class PerformanceVisualizationService {
    constructor() {
        this.isInitialized = false;
        this.cache = new Map();
        this.cacheTTL = 5 * 60 * 1000; // 5 минут
    }

    async initialize() {
        if (this.isInitialized) return;
        LoggerService.info('📊 Initializing PerformanceVisualizationService...');
        this.isInitialized = true;
        LoggerService.info('✅ PerformanceVisualizationService initialized');
    }

    /**
     * Получение данных для графика доходности по времени
     * @param {number} days - Период в днях
     * @returns {Promise<Object>} Данные для графика
     */
    async getReturnsChartData(days = 30) {
        try {
            const cacheKey = `returns_${days}`;
            const cached = this.cache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp) < this.cacheTTL) {
                return cached.data;
            }

            const trades = await TradingEngine.getTradeHistory(10000);
            const endDate = new Date();
            const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

            const periodTrades = trades.filter(trade => {
                const tradeDate = new Date(trade.timestamp || trade.date || trade.createdAt);
                return tradeDate >= startDate && tradeDate <= endDate;
            }).sort((a, b) => {
                const dateA = new Date(a.timestamp || a.date || a.createdAt);
                const dateB = new Date(b.timestamp || b.date || b.createdAt);
                return dateA - dateB;
            });

            // Группируем по дням
            const dailyReturns = {};
            let cumulativeReturn = 0;

            periodTrades.forEach(trade => {
                const date = new Date(trade.timestamp || trade.date || trade.createdAt);
                const dayKey = date.toISOString().split('T')[0];
                
                if (!dailyReturns[dayKey]) {
                    dailyReturns[dayKey] = {
                        date: dayKey,
                        dailyReturn: 0,
                        cumulativeReturn: 0,
                        trades: 0
                    };
                }

                const pnl = trade.pnl || trade.profit || 0;
                dailyReturns[dayKey].dailyReturn += pnl;
                dailyReturns[dayKey].trades++;
            });

            // Рассчитываем кумулятивную доходность
            const sortedDays = Object.keys(dailyReturns).sort();
            const chartData = {
                labels: [],
                dailyReturns: [],
                cumulativeReturns: [],
                trades: []
            };

            sortedDays.forEach(day => {
                const dayData = dailyReturns[day];
                cumulativeReturn += dayData.dailyReturn;
                
                chartData.labels.push(day);
                chartData.dailyReturns.push(dayData.dailyReturn);
                chartData.cumulativeReturns.push(cumulativeReturn);
                chartData.trades.push(dayData.trades);
            });

            const result = {
                period: { startDate, endDate, days },
                data: chartData,
                summary: {
                    totalReturn: cumulativeReturn,
                    avgDailyReturn: chartData.dailyReturns.length > 0
                        ? chartData.dailyReturns.reduce((sum, r) => sum + r, 0) / chartData.dailyReturns.length
                        : 0,
                    maxDailyReturn: Math.max(...chartData.dailyReturns, 0),
                    minDailyReturn: Math.min(...chartData.dailyReturns, 0)
                }
            };

            this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
            return result;
        } catch (error) {
            LoggerService.error('Error getting returns chart data', {
                service: 'PerformanceVisualizationService',
                error: { message: error.message }
            });
            return { error: error.message };
        }
    }

    /**
     * Получение данных для графика распределения прибылей/убытков
     * @param {number} days - Период в днях
     * @returns {Promise<Object>} Данные для гистограммы
     */
    async getPnLDistributionData(days = 30) {
        try {
            const cacheKey = `pnl_dist_${days}`;
            const cached = this.cache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp) < this.cacheTTL) {
                return cached.data;
            }

            const trades = await TradingEngine.getTradeHistory(10000);
            const endDate = new Date();
            const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

            const periodTrades = trades.filter(trade => {
                const tradeDate = new Date(trade.timestamp || trade.date || trade.createdAt);
                return tradeDate >= startDate && tradeDate <= endDate;
            });

            const pnls = periodTrades.map(trade => trade.pnl || trade.profit || 0);
            
            // Создаем bins для гистограммы
            const minPnL = Math.min(...pnls, 0);
            const maxPnL = Math.max(...pnls, 0);
            const binCount = 20;
            const binSize = (maxPnL - minPnL) / binCount;

            const bins = Array(binCount).fill(0).map((_, i) => ({
                range: [minPnL + i * binSize, minPnL + (i + 1) * binSize],
                count: 0,
                totalPnL: 0
            }));

            pnls.forEach(pnl => {
                const binIndex = Math.min(
                    Math.floor((pnl - minPnL) / binSize),
                    binCount - 1
                );
                bins[binIndex].count++;
                bins[binIndex].totalPnL += pnl;
            });

            const result = {
                period: { startDate, endDate, days },
                bins: bins.map(bin => ({
                    label: `${bin.range[0].toFixed(0)} - ${bin.range[1].toFixed(0)}`,
                    count: bin.count,
                    totalPnL: bin.totalPnL,
                    avgPnL: bin.count > 0 ? bin.totalPnL / bin.count : 0
                })),
                summary: {
                    totalTrades: pnls.length,
                    profitableTrades: pnls.filter(p => p > 0).length,
                    losingTrades: pnls.filter(p => p < 0).length,
                    totalProfit: pnls.filter(p => p > 0).reduce((sum, p) => sum + p, 0),
                    totalLoss: pnls.filter(p => p < 0).reduce((sum, p) => sum + p, 0)
                }
            };

            this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
            return result;
        } catch (error) {
            LoggerService.error('Error getting PnL distribution data', {
                service: 'PerformanceVisualizationService',
                error: { message: error.message }
            });
            return { error: error.message };
        }
    }

    /**
     * Получение данных для графика drawdown
     * @param {number} days - Период в днях
     * @returns {Promise<Object>} Данные для графика
     */
    async getDrawdownChartData(days = 30) {
        try {
            const cacheKey = `drawdown_${days}`;
            const cached = this.cache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp) < this.cacheTTL) {
                return cached.data;
            }

            const returnsData = await this.getReturnsChartData(days);
            const cumulativeReturns = returnsData.data?.cumulativeReturns || [];

            let peak = 0;
            const drawdowns = [];
            const dates = returnsData.data?.labels || [];

            cumulativeReturns.forEach((cumReturn, index) => {
                if (cumReturn > peak) {
                    peak = cumReturn;
                }
                const drawdown = peak - cumReturn;
                drawdowns.push({
                    date: dates[index],
                    drawdown: drawdown,
                    peak: peak,
                    current: cumReturn
                });
            });

            const maxDrawdown = Math.max(...drawdowns.map(d => d.drawdown), 0);

            const result = {
                period: returnsData.period,
                data: {
                    labels: dates,
                    drawdowns: drawdowns.map(d => d.drawdown),
                    peaks: drawdowns.map(d => d.peak),
                    current: drawdowns.map(d => d.current)
                },
                summary: {
                    maxDrawdown: maxDrawdown,
                    currentDrawdown: drawdowns[drawdowns.length - 1]?.drawdown || 0
                }
            };

            this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
            return result;
        } catch (error) {
            LoggerService.error('Error getting drawdown chart data', {
                service: 'PerformanceVisualizationService',
                error: { message: error.message }
            });
            return { error: error.message };
        }
    }

    /**
     * Получение данных для heatmap производительности по секторам и стратегиям
     * @param {number} days - Период в днях
     * @returns {Promise<Object>} Данные для heatmap
     */
    async getPerformanceHeatmapData(days = 30) {
        try {
            const cacheKey = `heatmap_${days}`;
            const cached = this.cache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp) < this.cacheTTL) {
                return cached.data;
            }

            // Получаем секторный анализ
            const sectorAnalysis = await PerformanceAnalyzer.analyzeSectorPerformance(days);

            // Получаем данные по стратегиям (упрощенная версия)
            const trades = await TradingEngine.getTradeHistory(10000);
            const endDate = new Date();
            const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

            const periodTrades = trades.filter(trade => {
                const tradeDate = new Date(trade.timestamp || trade.date || trade.createdAt);
                return tradeDate >= startDate && tradeDate <= endDate;
            });

            // Группируем по стратегиям
            const strategyPerformance = {};
            periodTrades.forEach(trade => {
                const strategy = trade.strategyId || trade.strategy || 'unknown';
                if (!strategyPerformance[strategy]) {
                    strategyPerformance[strategy] = {
                        profit: 0,
                        trades: 0,
                        wins: 0
                    };
                }
                const pnl = trade.pnl || trade.profit || 0;
                strategyPerformance[strategy].profit += pnl;
                strategyPerformance[strategy].trades++;
                if (pnl > 0) strategyPerformance[strategy].wins++;
            });

            // Создаем heatmap данные
            const sectors = Object.keys(sectorAnalysis.sectors || {});
            const strategies = Object.keys(strategyPerformance);
            
            const heatmapData = [];
            sectors.forEach(sector => {
                strategies.forEach(strategy => {
                    // Упрощенный расчет: используем средние значения
                    const sectorData = sectorAnalysis.sectors[sector];
                    const strategyData = strategyPerformance[strategy];
                    
                    // Комбинированный score (можно улучшить)
                    const score = (sectorData.sharpeRatio || 0) * (strategyData.wins / Math.max(strategyData.trades, 1));
                    
                    heatmapData.push({
                        sector,
                        strategy,
                        value: score,
                        profit: sectorData.profit * (strategyData.wins / Math.max(strategyData.trades, 1)),
                        trades: Math.min(sectorData.trades, strategyData.trades)
                    });
                });
            });

            const result = {
                period: { startDate, endDate, days },
                sectors,
                strategies,
                data: heatmapData,
                summary: {
                    totalSectors: sectors.length,
                    totalStrategies: strategies.length
                }
            };

            this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
            return result;
        } catch (error) {
            LoggerService.error('Error getting performance heatmap data', {
                service: 'PerformanceVisualizationService',
                error: { message: error.message }
            });
            return { error: error.message };
        }
    }

    /**
     * Получение данных для дашборда
     * @param {Object} filters - Фильтры: period, strategy, sector
     * @returns {Promise<Object>} Данные для дашборда
     */
    async getDashboardData(filters = {}) {
        try {
            const { period = 30, strategy = null, sector = null } = filters;
            const cacheKey = `dashboard_${period}_${strategy || 'all'}_${sector || 'all'}`;
            const cached = this.cache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp) < this.cacheTTL) {
                return cached.data;
            }

            const analysis = await PerformanceAnalyzer.analyzePerformance('medium', period);
            const returnsChart = await this.getReturnsChartData(period);
            const pnlDistribution = await this.getPnLDistributionData(period);
            const drawdownChart = await this.getDrawdownChartData(period);
            const heatmap = await this.getPerformanceHeatmapData(period);
            const sectorAnalysis = await PerformanceAnalyzer.analyzeSectorPerformance(period);

            const result = {
                period,
                filters: { strategy, sector },
                summary: analysis.summary,
                charts: {
                    returns: returnsChart,
                    pnlDistribution: pnlDistribution,
                    drawdown: drawdownChart,
                    heatmap: heatmap
                },
                sectorAnalysis: sectorAnalysis,
                recommendations: analysis.recommendations,
                alerts: analysis.alerts,
                timestamp: new Date().toISOString()
            };

            this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
            return result;
        } catch (error) {
            LoggerService.error('Error getting dashboard data', {
                service: 'PerformanceVisualizationService',
                error: { message: error.message }
            });
            return { error: error.message };
        }
    }

    /**
     * Очистка кеша
     */
    clearCache() {
        this.cache.clear();
    }
}

export default new PerformanceVisualizationService();

