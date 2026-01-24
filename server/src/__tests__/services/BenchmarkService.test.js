import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import BenchmarkService from '../../services/BenchmarkService.js';
import TradingEngine from '../../services/TradingEngine.js';
import CacheService from '../../services/CacheService.js';

jest.mock('../../services/TradingEngine.js');
jest.mock('../../services/CacheService.js');
jest.mock('../../services/LoggerService.js', () => ({
    default: {
        isInitialized: true,
        error: jest.fn(),
        log: jest.fn()
    }
}));

describe('BenchmarkService (Phase 4.3.3)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        BenchmarkService.cache.clear();
    });

    describe('getBenchmarkData', () => {
        it('should return benchmark data when FIGI is available', async () => {
            const mockCandles = [
                { close: 1000, date: new Date() },
                { close: 1050, date: new Date() },
                { close: 1100, date: new Date() }
            ];

            CacheService.getCandles = jest.fn().mockResolvedValue(mockCandles);

            const result = await BenchmarkService.getBenchmarkData('IMOEX', 30);

            expect(result).toHaveProperty('benchmark');
            expect(result).toHaveProperty('prices');
            expect(result).toHaveProperty('returns');
            expect(result).toHaveProperty('totalReturn');
            expect(result).toHaveProperty('volatility');
        });

        it('should return synthetic data when FIGI is not available', async () => {
            CacheService.getCandles = jest.fn().mockResolvedValue(null);

            const result = await BenchmarkService.getBenchmarkData('SP500', 30);

            expect(result).toHaveProperty('synthetic', true);
            expect(result).toHaveProperty('prices');
        });

        it('should return error object for unknown benchmark', async () => {
            const result = await BenchmarkService.getBenchmarkData('UNKNOWN', 30);
            expect(result).toHaveProperty('error');
            expect(result.error).toContain('Unknown benchmark');
        });
    });

    describe('compareWithBenchmark', () => {
        it('should compare portfolio with benchmark', async () => {
            const mockBenchmarkData = {
                name: 'IMOEX',
                totalReturn: 0.1,
                volatility: 0.15,
                sharpeRatio: 0.67,
                returns: [0.01, 0.02, -0.01, 0.03]
            };

            BenchmarkService.getBenchmarkData = jest.fn().mockResolvedValue(mockBenchmarkData);

            const mockTrades = [
                { pnl: 100, timestamp: new Date(), price: 100 },
                { pnl: 200, timestamp: new Date(), price: 200 }
            ];

            TradingEngine.getTradeHistory = jest.fn().mockResolvedValue(mockTrades);
            TradingEngine.getPortfolioValue = jest.fn().mockResolvedValue({ totalValue: 1000000 });

            const result = await BenchmarkService.compareWithBenchmark('IMOEX', 30);

            expect(result).toHaveProperty('benchmark');
            expect(result).toHaveProperty('portfolio');
            expect(result).toHaveProperty('comparison');
            expect(result.comparison).toHaveProperty('alpha');
            expect(result.comparison).toHaveProperty('beta');
            expect(result.comparison).toHaveProperty('trackingError');
        });

        it('should generate alerts for significant deviation', async () => {
            const mockBenchmarkData = {
                name: 'IMOEX',
                totalReturn: 0.1,
                volatility: 0.15,
                sharpeRatio: 0.67,
                returns: [0.01, 0.02, -0.01, 0.03]
            };

            BenchmarkService.getBenchmarkData = jest.fn().mockResolvedValue(mockBenchmarkData);

            // Mock poor performance (negative alpha)
            TradingEngine.getTradeHistory = jest.fn().mockResolvedValue([
                { pnl: -1000, timestamp: new Date(), price: 100 }
            ]);
            TradingEngine.getPortfolioValue = jest.fn().mockResolvedValue({ totalValue: 1000000 });

            const result = await BenchmarkService.compareWithBenchmark('IMOEX', 30);

            expect(result).toHaveProperty('alerts');
            expect(Array.isArray(result.alerts)).toBe(true);
        });
    });

    describe('getAvailableBenchmarks', () => {
        it('should return list of available benchmarks', () => {
            const benchmarks = BenchmarkService.getAvailableBenchmarks();

            expect(Array.isArray(benchmarks)).toBe(true);
            expect(benchmarks.length).toBeGreaterThan(0);
            expect(benchmarks.some(b => b.id === 'IMOEX')).toBe(true);
            expect(benchmarks.some(b => b.id === 'SP500')).toBe(true);
        });
    });

    describe('calculateBeta', () => {
        it('should calculate beta correctly', () => {
            const portfolioReturns = [0.01, 0.02, -0.01, 0.03];
            const benchmarkReturns = [0.005, 0.015, -0.005, 0.025];

            const beta = BenchmarkService.calculateBeta(portfolioReturns, benchmarkReturns);

            expect(typeof beta).toBe('number');
            expect(beta).toBeGreaterThan(0);
        });
    });

    describe('calculateTrackingError', () => {
        it('should calculate tracking error correctly', () => {
            const portfolioReturns = [0.01, 0.02, -0.01, 0.03];
            const benchmarkReturns = [0.005, 0.015, -0.005, 0.025];

            const trackingError = BenchmarkService.calculateTrackingError(portfolioReturns, benchmarkReturns);

            expect(typeof trackingError).toBe('number');
            expect(trackingError).toBeGreaterThanOrEqual(0);
        });
    });
});

