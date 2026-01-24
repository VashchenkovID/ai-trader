import PerformanceAnalyzer from './PerformanceAnalyzer.js';
import TradingEngine from './TradingEngine.js';
import CacheService from './CacheService.js';
import LoggerService from './LoggerService.js';

/**
 * Сервис для работы с бенчмарками (S&P 500, IMOEX и др.)
 * Фаза 4.3.3: Сравнение с бенчмарками
 */
class BenchmarkService {
    constructor() {
        this.isInitialized = false;
        this.benchmarks = {
            'SP500': {
                name: 'S&P 500',
                symbol: 'SPX',
                figi: null, // Можно добавить FIGI для S&P 500 если доступен
                type: 'index'
            },
            'IMOEX': {
                name: 'Индекс МосБиржи',
                symbol: 'IMOEX',
                figi: 'BBG004730N88', // Пример FIGI для IMOEX
                type: 'index'
            },
            'RTSI': {
                name: 'Индекс РТС',
                symbol: 'RTSI',
                figi: 'BBG004730ZJ9', // Пример FIGI для RTSI
                type: 'index'
            }
        };
        this.cache = new Map();
        this.cacheTTL = 60 * 60 * 1000; // 1 час для бенчмарков
    }

    async initialize() {
        if (this.isInitialized) return;
        LoggerService.log('📊 Initializing BenchmarkService...');
        this.isInitialized = true;
        LoggerService.log('✅ BenchmarkService initialized');
    }

    /**
     * Получение данных бенчмарка за период
     * @param {string} benchmarkId - ID бенчмарка (SP500, IMOEX, RTSI)
     * @param {number} days - Период в днях
     * @returns {Promise<Object>} Данные бенчмарка
     */
    async getBenchmarkData(benchmarkId, days = 30) {
        const benchmark = this.benchmarks[benchmarkId];
        if (!benchmark) {
            const error = new Error(`Unknown benchmark: ${benchmarkId}`);
            if (LoggerService.isInitialized) {
                LoggerService.error('Error getting benchmark data', {
                    service: 'BenchmarkService',
                    benchmarkId,
                    error: { message: error.message }
                });
            }
            return { error: error.message };
        }

        try {

            const cacheKey = `benchmark_${benchmarkId}_${days}`;
            const cached = this.cache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp) < this.cacheTTL) {
                return cached.data;
            }

            // Если есть FIGI, получаем данные через CacheService
            if (benchmark.figi) {
                const candles = await CacheService.getCandles(benchmark.figi, 'DAY', days);
                if (candles && candles.length > 0) {
                    const prices = candles.map(c => c.close);
                    const returns = this.calculateReturns(prices);
                    
                    const result = {
                        benchmark: benchmarkId,
                        name: benchmark.name,
                        period: { days },
                        prices: prices,
                        returns: returns,
                        totalReturn: this.calculateTotalReturn(prices),
                        volatility: this.calculateVolatility(returns),
                        sharpeRatio: this.calculateSharpeRatio(returns)
                    };

                    this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
                    return result;
                }
            }

            // Fallback: используем синтетические данные или внешний API
            // В реальной системе здесь был бы запрос к внешнему API
            return this.getSyntheticBenchmarkData(benchmark, days);
        } catch (error) {
            LoggerService.error('Error getting benchmark data', {
                service: 'BenchmarkService',
                benchmarkId,
                error: { message: error.message }
            });
            return { error: error.message };
        }
    }

    /**
     * Сравнение производительности портфеля с бенчмарком
     * @param {string} benchmarkId - ID бенчмарка
     * @param {number} days - Период в днях
     * @returns {Promise<Object>} Результаты сравнения
     */
    async compareWithBenchmark(benchmarkId, days = 30) {
        try {
            const benchmarkData = await this.getBenchmarkData(benchmarkId, days);
            if (benchmarkData.error) {
                return benchmarkData;
            }

            // Получаем данные портфеля
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

            // Рассчитываем доходность портфеля
            const portfolioReturns = await this.calculatePortfolioReturns(periodTrades);
            const portfolioTotalReturn = await this.calculateTotalReturnFromTrades(periodTrades);
            const portfolioVolatility = this.calculateVolatility(portfolioReturns);
            const portfolioSharpeRatio = this.calculateSharpeRatio(portfolioReturns);

            // Рассчитываем метрики сравнения
            const alpha = portfolioTotalReturn - benchmarkData.totalReturn;
            const beta = this.calculateBeta(portfolioReturns, benchmarkData.returns);
            const trackingError = this.calculateTrackingError(portfolioReturns, benchmarkData.returns);

            // Рассчитываем информационный коэффициент (IC)
            const informationRatio = trackingError > 0 ? alpha / trackingError : 0;

            const result = {
                period: { startDate, endDate, days },
                benchmark: {
                    id: benchmarkId,
                    name: benchmarkData.name,
                    totalReturn: benchmarkData.totalReturn,
                    volatility: benchmarkData.volatility,
                    sharpeRatio: benchmarkData.sharpeRatio
                },
                portfolio: {
                    totalReturn: portfolioTotalReturn,
                    volatility: portfolioVolatility,
                    sharpeRatio: portfolioSharpeRatio
                },
                comparison: {
                    alpha: alpha,
                    beta: beta,
                    trackingError: trackingError,
                    informationRatio: informationRatio,
                    outperformance: alpha > 0,
                    relativeVolatility: portfolioVolatility / (benchmarkData.volatility || 1)
                },
                alerts: this.generateBenchmarkAlerts(alpha, trackingError, beta)
            };

            return result;
        } catch (error) {
            LoggerService.error('Error comparing with benchmark', {
                service: 'BenchmarkService',
                benchmarkId,
                error: { message: error.message }
            });
            return { error: error.message };
        }
    }

    /**
     * Расчет доходностей из цен
     * @private
     */
    calculateReturns(prices) {
        const returns = [];
        for (let i = 1; i < prices.length; i++) {
            if (prices[i - 1] > 0) {
                returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
            }
        }
        return returns;
    }

    /**
     * Расчет общей доходности
     * @private
     */
    calculateTotalReturn(prices) {
        if (prices.length < 2) return 0;
        const firstPrice = prices[0];
        const lastPrice = prices[prices.length - 1];
        return firstPrice > 0 ? (lastPrice - firstPrice) / firstPrice : 0;
    }

    /**
     * Расчет волатильности
     * @private
     */
    calculateVolatility(returns) {
        if (returns.length < 2) return 0;
        const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
        return Math.sqrt(variance);
    }

    /**
     * Расчет Sharpe Ratio (упрощенный)
     * @private
     */
    calculateSharpeRatio(returns) {
        const volatility = this.calculateVolatility(returns);
        if (volatility === 0) return 0;
        const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        return meanReturn / volatility;
    }

    /**
     * Расчет доходностей портфеля из сделок
     * @private
     */
    async calculatePortfolioReturns(trades) {
        // Группируем по дням
        const dailyPnL = {};
        trades.forEach(trade => {
            const date = new Date(trade.timestamp || trade.date || trade.createdAt);
            const dayKey = date.toISOString().split('T')[0];
            if (!dailyPnL[dayKey]) {
                dailyPnL[dayKey] = 0;
            }
            dailyPnL[dayKey] += trade.pnl || trade.profit || 0;
        });

        // Получаем начальную стоимость портфеля
        const portfolio = await TradingEngine.getPortfolioValue().catch(() => ({ totalValue: 1000000 }));
        const initialValue = portfolio.totalValue || 1000000;

        // Рассчитываем доходности
        const sortedDays = Object.keys(dailyPnL).sort();
        const returns = [];
        let cumulativeValue = initialValue;

        sortedDays.forEach(day => {
            const dailyPnLValue = dailyPnL[day];
            const returnValue = cumulativeValue > 0 ? dailyPnLValue / cumulativeValue : 0;
            returns.push(returnValue);
            cumulativeValue += dailyPnLValue;
        });

        return returns;
    }

    /**
     * Расчет общей доходности из сделок
     * @private
     */
    async calculateTotalReturnFromTrades(trades) {
        const totalPnL = trades.reduce((sum, trade) => sum + (trade.pnl || trade.profit || 0), 0);
        const portfolio = await TradingEngine.getPortfolioValue().catch(() => ({ totalValue: 1000000 }));
        const initialValue = portfolio.totalValue || 1000000;
        return initialValue > 0 ? totalPnL / initialValue : 0;
    }

    /**
     * Расчет Beta
     * @private
     */
    calculateBeta(portfolioReturns, benchmarkReturns) {
        if (portfolioReturns.length !== benchmarkReturns.length || portfolioReturns.length < 2) {
            return 1; // Default beta
        }

        const portfolioMean = portfolioReturns.reduce((sum, r) => sum + r, 0) / portfolioReturns.length;
        const benchmarkMean = benchmarkReturns.reduce((sum, r) => sum + r, 0) / benchmarkReturns.length;

        let covariance = 0;
        let benchmarkVariance = 0;

        for (let i = 0; i < portfolioReturns.length; i++) {
            covariance += (portfolioReturns[i] - portfolioMean) * (benchmarkReturns[i] - benchmarkMean);
            benchmarkVariance += Math.pow(benchmarkReturns[i] - benchmarkMean, 2);
        }

        return benchmarkVariance > 0 ? covariance / benchmarkVariance : 1;
    }

    /**
     * Расчет Tracking Error
     * @private
     */
    calculateTrackingError(portfolioReturns, benchmarkReturns) {
        if (portfolioReturns.length !== benchmarkReturns.length || portfolioReturns.length < 2) {
            return 0;
        }

        const differences = portfolioReturns.map((pr, i) => pr - benchmarkReturns[i]);
        return this.calculateVolatility(differences);
    }

    /**
     * Генерация алертов при отклонении от бенчмарка
     * @private
     */
    generateBenchmarkAlerts(alpha, trackingError, beta) {
        const alerts = [];

        // Значительное отставание (alpha < -0.1)
        if (alpha < -0.1) {
            alerts.push({
                type: 'critical',
                message: `Значительное отставание от бенчмарка: ${(alpha * 100).toFixed(2)}%`,
                action: 'review_strategy'
            });
        }

        // Высокий tracking error (> 0.15)
        if (trackingError > 0.15) {
            alerts.push({
                type: 'warning',
                message: `Высокий tracking error: ${(trackingError * 100).toFixed(2)}%`,
                action: 'reduce_volatility'
            });
        }

        // Высокий beta (> 1.5)
        if (beta > 1.5) {
            alerts.push({
                type: 'warning',
                message: `Высокая чувствительность к рынку (beta = ${beta.toFixed(2)})`,
                action: 'reduce_market_exposure'
            });
        }

        return alerts;
    }

    /**
     * Получение синтетических данных бенчмарка (fallback)
     * @private
     */
    getSyntheticBenchmarkData(benchmark, days) {
        // Генерируем синтетические данные для тестирования
        const basePrice = 1000;
        const prices = [basePrice];
        const volatility = 0.02; // 2% дневная волатильность

        for (let i = 1; i < days; i++) {
            const randomChange = (Math.random() - 0.5) * 2 * volatility;
            prices.push(prices[i - 1] * (1 + randomChange));
        }

        const returns = this.calculateReturns(prices);

        return {
            benchmark: benchmark.symbol,
            name: benchmark.name,
            period: { days },
            prices: prices,
            returns: returns,
            totalReturn: this.calculateTotalReturn(prices),
            volatility: this.calculateVolatility(returns),
            sharpeRatio: this.calculateSharpeRatio(returns),
            synthetic: true // Флаг синтетических данных
        };
    }

    /**
     * Получение списка доступных бенчмарков
     */
    getAvailableBenchmarks() {
        return Object.keys(this.benchmarks).map(id => ({
            id,
            name: this.benchmarks[id].name,
            symbol: this.benchmarks[id].symbol,
            type: this.benchmarks[id].type
        }));
    }
}

export default new BenchmarkService();

