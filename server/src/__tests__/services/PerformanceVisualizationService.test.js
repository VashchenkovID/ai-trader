import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import PerformanceVisualizationService from '../../services/PerformanceVisualizationService.js';
import TradingEngine from '../../services/TradingEngine.js';
import PerformanceAnalyzer from '../../services/PerformanceAnalyzer.js';

jest.mock('../../services/TradingEngine.js');
jest.mock('../../services/PerformanceAnalyzer.js');
jest.mock('../../services/LoggerService.js', () => ({
    default: {
        isInitialized: true,
        error: jest.fn(),
        log: jest.fn()
    }
}));

describe('PerformanceVisualizationService (Phase 4.3.2)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        PerformanceVisualizationService.clearCache();
    });

    describe('getReturnsChartData', () => {
        it('should return returns chart data', async () => {
            const mockTrades = [
                { pnl: 100, timestamp: new Date('2024-01-01'), price: 100 },
                { pnl: 200, timestamp: new Date('2024-01-02'), price: 200 }
            ];

            TradingEngine.getTradeHistory = jest.fn().mockResolvedValue(mockTrades);

            const result = await PerformanceVisualizationService.getReturnsChartData(30);

            expect(result).toHaveProperty('data');
            expect(result.data).toHaveProperty('labels');
            expect(result.data).toHaveProperty('dailyReturns');
            expect(result.data).toHaveProperty('cumulativeReturns');
        });

        it('should cache results', async () => {
            const mockTrades = [{ pnl: 100, timestamp: new Date(), price: 100 }];
            TradingEngine.getTradeHistory = jest.fn().mockResolvedValue(mockTrades);

            await PerformanceVisualizationService.getReturnsChartData(30);
            await PerformanceVisualizationService.getReturnsChartData(30);

            // Should only call once due to caching
            expect(TradingEngine.getTradeHistory).toHaveBeenCalledTimes(1);
        });
    });

    describe('getPnLDistributionData', () => {
        it('should return PnL distribution data', async () => {
            const mockTrades = [
                { pnl: 100, timestamp: new Date() },
                { pnl: -50, timestamp: new Date() },
                { pnl: 200, timestamp: new Date() }
            ];

            TradingEngine.getTradeHistory = jest.fn().mockResolvedValue(mockTrades);

            const result = await PerformanceVisualizationService.getPnLDistributionData(30);

            expect(result).toHaveProperty('bins');
            expect(result).toHaveProperty('summary');
            expect(result.summary).toHaveProperty('profitableTrades');
            expect(result.summary).toHaveProperty('losingTrades');
        });
    });

    describe('getDrawdownChartData', () => {
        it('should return drawdown chart data', async () => {
            const mockTrades = [
                { pnl: 100, timestamp: new Date(), price: 100 },
                { pnl: -50, timestamp: new Date(), price: 50 },
                { pnl: 200, timestamp: new Date(), price: 200 }
            ];

            TradingEngine.getTradeHistory = jest.fn().mockResolvedValue(mockTrades);

            // Mock getReturnsChartData
            PerformanceVisualizationService.getReturnsChartData = jest.fn().mockResolvedValue({
                data: {
                    labels: ['2024-01-01', '2024-01-02', '2024-01-03'],
                    cumulativeReturns: [100, 50, 250]
                },
                period: {}
            });

            const result = await PerformanceVisualizationService.getDrawdownChartData(30);

            expect(result).toHaveProperty('data');
            expect(result).toHaveProperty('summary');
            expect(result.summary).toHaveProperty('maxDrawdown');
        });
    });

    describe('getPerformanceHeatmapData', () => {
        it('should return performance heatmap data', async () => {
            PerformanceAnalyzer.analyzeSectorPerformance = jest.fn().mockResolvedValue({
                sectors: {
                    technology: { profit: 1000, sharpeRatio: 1.5, trades: 10 }
                }
            });

            TradingEngine.getTradeHistory = jest.fn().mockResolvedValue([
                { strategyId: 'strategy1', pnl: 100, timestamp: new Date() }
            ]);

            const result = await PerformanceVisualizationService.getPerformanceHeatmapData(30);

            expect(result).toHaveProperty('sectors');
            expect(result).toHaveProperty('strategies');
            expect(result).toHaveProperty('data');
        });
    });

    describe('getDashboardData', () => {
        it('should return dashboard data', async () => {
            PerformanceAnalyzer.analyzePerformance = jest.fn().mockResolvedValue({
                summary: { overallRating: 'good' },
                recommendations: [],
                alerts: []
            });

            PerformanceVisualizationService.getReturnsChartData = jest.fn().mockResolvedValue({});
            PerformanceVisualizationService.getPnLDistributionData = jest.fn().mockResolvedValue({});
            PerformanceVisualizationService.getDrawdownChartData = jest.fn().mockResolvedValue({});
            PerformanceVisualizationService.getPerformanceHeatmapData = jest.fn().mockResolvedValue({});
            PerformanceAnalyzer.analyzeSectorPerformance = jest.fn().mockResolvedValue({ sectors: {} });

            const result = await PerformanceVisualizationService.getDashboardData({ period: 30 });

            expect(result).toHaveProperty('summary');
            expect(result).toHaveProperty('charts');
            expect(result).toHaveProperty('sectorAnalysis');
        });
    });
});

