import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import PerformanceAnalyzer from '../../services/PerformanceAnalyzer.js';
import TradingEngine from '../../services/TradingEngine.js';
import SectorClassifier from '../../utils/sectorClassifier.js';
import CorrelationService from '../../services/CorrelationService.js';

jest.mock('../../services/TradingEngine.js');
jest.mock('../../utils/sectorClassifier.js');
jest.mock('../../services/CorrelationService.js');
jest.mock('../../models/CachedInstrument.js', () => ({
    default: {
        findOne: jest.fn()
    }
}));

describe('PerformanceAnalyzer - Sector Analysis (Phase 4.3.1)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('analyzeSectorPerformance', () => {
        it('should analyze performance by sectors', async () => {
            const mockTrades = [
                { figi: 'FIGI1', pnl: 100, timestamp: new Date(), price: 100 },
                { figi: 'FIGI2', pnl: -50, timestamp: new Date(), price: 50 },
                { figi: 'FIGI1', pnl: 200, timestamp: new Date(), price: 200 }
            ];

            TradingEngine.getTradeHistory = jest.fn().mockResolvedValue(mockTrades);
            TradingEngine.getPortfolioValue = jest.fn().mockResolvedValue({ totalValue: 1000000, positions: {} });

            SectorClassifier.groupBySector = jest.fn().mockResolvedValue({
                technology: ['FIGI1'],
                finance: ['FIGI2']
            });

            const CachedInstrument = await import('../../models/CachedInstrument.js');
            CachedInstrument.default.findOne = jest.fn().mockResolvedValue({ lastPrice: 100 });

            const result = await PerformanceAnalyzer.analyzeSectorPerformance(30);

            expect(result).toHaveProperty('sectors');
            expect(result).toHaveProperty('correlations');
            expect(result).toHaveProperty('diversification');
            expect(result.sectors).toHaveProperty('technology');
            expect(result.sectors).toHaveProperty('finance');
        });

        it('should calculate sector metrics correctly', async () => {
            const mockTrades = [
                { figi: 'FIGI1', pnl: 100, timestamp: new Date(), price: 100 },
                { figi: 'FIGI1', pnl: 200, timestamp: new Date(), price: 200 }
            ];

            TradingEngine.getTradeHistory = jest.fn().mockResolvedValue(mockTrades);
            TradingEngine.getPortfolioValue = jest.fn().mockResolvedValue({ totalValue: 1000000, positions: {} });

            SectorClassifier.groupBySector = jest.fn().mockResolvedValue({
                technology: ['FIGI1']
            });

            const CachedInstrument = await import('../../models/CachedInstrument.js');
            CachedInstrument.default.findOne = jest.fn().mockResolvedValue({ lastPrice: 100 });

            const result = await PerformanceAnalyzer.analyzeSectorPerformance(30);

            const techSector = result.sectors.technology;
            expect(techSector).toHaveProperty('profit');
            expect(techSector).toHaveProperty('winRate');
            expect(techSector).toHaveProperty('sharpeRatio');
            expect(techSector).toHaveProperty('portfolioWeight');
        });

        it('should handle empty trades gracefully', async () => {
            TradingEngine.getTradeHistory = jest.fn().mockResolvedValue([]);
            TradingEngine.getPortfolioValue = jest.fn().mockResolvedValue({ totalValue: 1000000, positions: {} });

            SectorClassifier.groupBySector = jest.fn().mockResolvedValue({});

            const result = await PerformanceAnalyzer.analyzeSectorPerformance(30);

            expect(result).toHaveProperty('sectors');
            expect(Object.keys(result.sectors).length).toBe(0);
        });
    });

    describe('analyzeSectorCorrelations', () => {
        it('should analyze correlations within sectors', async () => {
            const sectorGroups = {
                technology: ['FIGI1', 'FIGI2', 'FIGI3']
            };

            CorrelationService.calculateCorrelation = jest.fn()
                .mockResolvedValue(0.8) // High correlation
                .mockResolvedValue(0.6)
                .mockResolvedValue(0.7);

            const result = await PerformanceAnalyzer.analyzeSectorCorrelations(sectorGroups, CorrelationService);

            expect(result).toHaveProperty('technology');
            expect(result.technology).toHaveProperty('correlationPairs');
            expect(result.technology).toHaveProperty('riskLevel');
        });

        it('should handle sectors with insufficient instruments', async () => {
            const sectorGroups = {
                technology: ['FIGI1'] // Only one instrument
            };

            const result = await PerformanceAnalyzer.analyzeSectorCorrelations(sectorGroups, CorrelationService);

            expect(result.technology).toHaveProperty('message');
        });
    });

    describe('generateSectorRecommendations', () => {
        it('should generate recommendations for overexposure', () => {
            const recommendations = PerformanceAnalyzer.generateSectorRecommendations('technology', {
                portfolioWeight: 0.5, // 50% - overexposure
                winRate: 0.6,
                sharpeRatio: 1.0
            });

            expect(recommendations.length).toBeGreaterThan(0);
            expect(recommendations.some(r => r.type === 'overexposure')).toBe(true);
        });

        it('should generate recommendations for underexposure', () => {
            const recommendations = PerformanceAnalyzer.generateSectorRecommendations('technology', {
                portfolioWeight: 0.03, // 3% - underexposure
                winRate: 0.7, // Good performance
                sharpeRatio: 1.5 // Good Sharpe
            });

            expect(recommendations.some(r => r.type === 'underexposure')).toBe(true);
        });

        it('should generate recommendations for poor performance', () => {
            const recommendations = PerformanceAnalyzer.generateSectorRecommendations('technology', {
                portfolioWeight: 0.1,
                winRate: 0.4, // Poor win rate
                sharpeRatio: 0.3 // Poor Sharpe
            });

            expect(recommendations.some(r => r.type === 'poor_performance')).toBe(true);
        });
    });

    describe('generateDiversificationRecommendations', () => {
        it('should recommend diversification for high concentration', () => {
            const sectorAnalysis = {
                technology: { portfolioWeight: 0.5, sector: 'technology' },
                finance: { portfolioWeight: 0.3, sector: 'finance' }
            };

            const sectorCorrelations = {};

            const recommendations = PerformanceAnalyzer.generateDiversificationRecommendations(
                sectorAnalysis,
                sectorCorrelations
            );

            expect(recommendations.some(r => r.type === 'concentration')).toBe(true);
        });
    });
});

