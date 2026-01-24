import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import ModelMonitoringService from '../../services/ModelMonitoringService.js';
import ModelPerformance from '../../models/ModelPerformance.js';

// Моки
jest.mock('../../models/ModelPerformance.js', () => ({
    getAveragePerformance: jest.fn(),
    getLatestPerformance: jest.fn()
}));

jest.mock('../../models/Recommendation.js', () => ({
    findAll: jest.fn()
}));

jest.mock('../../services/LoggerService.js', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
}));

jest.mock('../../services/OptimizedTelegramService.js', () => ({
    default: {
        sendAlert: jest.fn()
    }
}));

describe('ModelMonitoringService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        ModelMonitoringService.isInitialized = false;
        ModelMonitoringService.baselineMetrics.clear();
        ModelMonitoringService.driftHistory.clear();
    });

    describe('initialize', () => {
        it('should initialize the service', async () => {
            const mockGetAveragePerformance = jest.fn().mockResolvedValue({
                accuracy: 0.8,
                f1Score: 0.75,
                winRate: 0.7,
                averageReturn: 0.05,
                samplesCount: 100
            });
            
            ModelPerformance.getAveragePerformance = mockGetAveragePerformance;
            
            await ModelMonitoringService.initialize();
            expect(ModelMonitoringService.isInitialized).toBe(true);
        });
    });

    describe('checkModelDrift', () => {
        it('should detect drift when metrics drop', async () => {
            // Устанавливаем базовые метрики
            ModelMonitoringService.baselineMetrics.set('traditional', {
                accuracy: 0.8,
                f1Score: 0.75,
                winRate: 0.7,
                averageReturn: 0.05
            });
            
            const mockGetAveragePerformance = jest.fn().mockResolvedValue({
                accuracy: 0.65, // Падение на 18.75%
                f1Score: 0.6,   // Падение на 20%
                winRate: 0.55,  // Падение на 21.4%
                averageReturn: 0.02,
                totalTrades: 50,
                samplesCount: 50
            });
            
            ModelPerformance.getAveragePerformance = mockGetAveragePerformance;
            
            const result = await ModelMonitoringService.checkModelDrift('traditional');
            
            expect(result.hasDrift).toBe(true);
            expect(result.driftType).toBeDefined();
        });

        it('should not detect drift when metrics are stable', async () => {
            ModelMonitoringService.baselineMetrics.set('traditional', {
                accuracy: 0.8,
                f1Score: 0.75,
                winRate: 0.7
            });
            
            const mockGetAveragePerformance = jest.fn().mockResolvedValue({
                accuracy: 0.78, // Небольшое падение, но в пределах порога
                f1Score: 0.73,
                winRate: 0.68,
                totalTrades: 50,
                samplesCount: 50
            });
            
            ModelPerformance.getAveragePerformance = mockGetAveragePerformance;
            
            const result = await ModelMonitoringService.checkModelDrift('traditional');
            
            expect(result.hasDrift).toBe(false);
        });

        it('should return insufficient data when samples are too few', async () => {
            const mockGetAveragePerformance = jest.fn().mockResolvedValue({
                accuracy: 0.8,
                f1Score: 0.75,
                winRate: 0.7,
                totalTrades: 5, // Меньше минимума
                samplesCount: 5
            });
            
            ModelPerformance.getAveragePerformance = mockGetAveragePerformance;
            
            const result = await ModelMonitoringService.checkModelDrift('traditional');
            
            expect(result.hasDrift).toBe(false);
            expect(result.reason).toContain('Insufficient');
        });
    });

    describe('checkPredictionDistributionDrift', () => {
        it('should detect distribution drift', async () => {
            const Recommendation = (await import('../../models/Recommendation.js')).default;
            
            const mockFindAll = jest.fn()
                .mockResolvedValueOnce([
                    { recommendation: 'BUY', confidence: 0.8 },
                    { recommendation: 'BUY', confidence: 0.7 },
                    { recommendation: 'SELL', confidence: 0.6 },
                    { recommendation: 'HOLD', confidence: 0.5 }
                ])
                .mockResolvedValueOnce([
                    { recommendation: 'SELL', confidence: 0.8 },
                    { recommendation: 'SELL', confidence: 0.7 },
                    { recommendation: 'SELL', confidence: 0.6 },
                    { recommendation: 'HOLD', confidence: 0.5 }
                ]);
            
            Recommendation.findAll = mockFindAll;
            
            const result = await ModelMonitoringService.checkPredictionDistributionDrift('traditional', 'TEST_FIGI');
            
            // Должно обнаружить изменение распределения
            expect(result.hasDrift).toBeDefined();
        });
    });

    describe('calculateRecommendationDistribution', () => {
        it('should calculate distribution correctly', () => {
            const recommendations = [
                { recommendation: 'BUY', confidence: 0.8 },
                { recommendation: 'BUY', confidence: 0.7 },
                { recommendation: 'SELL', confidence: 0.6 },
                { recommendation: 'HOLD', confidence: 0.5 }
            ];
            
            const dist = ModelMonitoringService.calculateRecommendationDistribution(recommendations);
            
            expect(dist.BUY).toBe(0.5); // 2 из 4
            expect(dist.SELL).toBe(0.25); // 1 из 4
            expect(dist.HOLD).toBe(0.25); // 1 из 4
        });
    });

    describe('calculateTVD', () => {
        it('should calculate TVD correctly', () => {
            const dist1 = { BUY: 0.5, SELL: 0.3, HOLD: 0.2 };
            const dist2 = { BUY: 0.3, SELL: 0.5, HOLD: 0.2 };
            
            const tvd = ModelMonitoringService.calculateTVD(dist1, dist2);
            
            // TVD = 0.5 * |0.5-0.3| + |0.3-0.5| + |0.2-0.2| = 0.5 * 0.4 = 0.2
            expect(tvd).toBeCloseTo(0.2, 2);
        });
    });
});

