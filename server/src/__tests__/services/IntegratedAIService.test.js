import IntegratedAIService from '../../services/IntegratedAIService.js';

// Моки
jest.mock('../../services/StackingService.js', () => ({
    isInitialized: true,
    shouldRetrain: jest.fn(() => false),
    predict: jest.fn(async (predictions) => ({
        score: 0.65,
        confidence: 0.75,
        method: 'stacking'
    }))
}));

jest.mock('../../services/ModelWeightingService.js', () => ({
    isInitialized: true,
    adjustConfidenceForCorrelation: jest.fn((predictions, confidence) => confidence * 0.9)
}));

jest.mock('../../services/AdaptiveThresholdService.js', () => ({
    isInitialized: true,
    getAdaptiveThresholds: jest.fn(async () => ({
        buyScore: 0.65,
        buyConfidence: 0.6,
        sellScore: 0.35,
        sellConfidence: 0.6,
        marketMode: 'normal'
    }))
}));

jest.mock('../../services/LoggerService.js', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
}));

describe('IntegratedAIService - Consensus Mechanism', () => {
    describe('applyConsensusMechanism', () => {
        it('should handle contradictory signals in conservative mode', () => {
            const sourceRecommendations = [
                { source: 'ensemble', recommendation: 'BUY', weight: 0.3, confidence: 0.7 },
                { source: 'traditional', recommendation: 'SELL', weight: 0.3, confidence: 0.6 },
                { source: 'reinforcement', recommendation: 'HOLD', weight: 0.4, confidence: 0.5 }
            ];
            
            const result = IntegratedAIService.applyConsensusMechanism(
                sourceRecommendations,
                0.5,
                0.7,
                'conservative'
            );
            
            expect(result.confidence).toBeLessThan(0.7); // Снижена уверенность
            expect(result.score).toBeCloseTo(0.5, 1); // Смещено к нейтральному
        });

        it('should handle contradictory signals in aggressive mode', () => {
            const sourceRecommendations = [
                { source: 'ensemble', recommendation: 'BUY', weight: 0.4, confidence: 0.8 },
                { source: 'traditional', recommendation: 'SELL', weight: 0.3, confidence: 0.7 },
                { source: 'reinforcement', recommendation: 'BUY', weight: 0.3, confidence: 0.6 }
            ];
            
            const result = IntegratedAIService.applyConsensusMechanism(
                sourceRecommendations,
                0.6,
                0.75,
                'aggressive'
            );
            
            // В агрессивном режиме может быть усилен сигнал
            expect(result.score).toBeGreaterThan(0.5);
        });

        it('should strengthen signal when there is clear majority', () => {
            const sourceRecommendations = [
                { source: 'ensemble', recommendation: 'BUY', weight: 0.4, confidence: 0.8 },
                { source: 'traditional', recommendation: 'BUY', weight: 0.3, confidence: 0.7 },
                { source: 'reinforcement', recommendation: 'BUY', weight: 0.3, confidence: 0.6 }
            ];
            
            const result = IntegratedAIService.applyConsensusMechanism(
                sourceRecommendations,
                0.65,
                0.7,
                'moderate'
            );
            
            expect(result.score).toBeGreaterThan(0.65); // Усилен
            expect(result.confidence).toBeGreaterThan(0.7); // Увеличена уверенность
        });
    });

    describe('adjustThresholdsForConsensusMode', () => {
        it('should make thresholds stricter in conservative mode', () => {
            const baseThresholds = {
                buyScore: 0.65,
                buyConfidence: 0.6,
                sellScore: 0.35,
                sellConfidence: 0.6
            };
            
            const adjusted = IntegratedAIService.adjustThresholdsForConsensusMode(
                baseThresholds,
                'conservative'
            );
            
            expect(adjusted.buyScore).toBeGreaterThan(baseThresholds.buyScore);
            expect(adjusted.buyConfidence).toBeGreaterThan(baseThresholds.buyConfidence);
            expect(adjusted.sellScore).toBeLessThan(baseThresholds.sellScore);
            expect(adjusted.sellConfidence).toBeGreaterThan(baseThresholds.sellConfidence);
        });

        it('should make thresholds looser in aggressive mode', () => {
            const baseThresholds = {
                buyScore: 0.65,
                buyConfidence: 0.6,
                sellScore: 0.35,
                sellConfidence: 0.6
            };
            
            const adjusted = IntegratedAIService.adjustThresholdsForConsensusMode(
                baseThresholds,
                'aggressive'
            );
            
            expect(adjusted.buyScore).toBeLessThan(baseThresholds.buyScore);
            expect(adjusted.buyConfidence).toBeLessThan(baseThresholds.buyConfidence);
            expect(adjusted.sellScore).toBeGreaterThan(baseThresholds.sellScore);
            expect(adjusted.sellConfidence).toBeLessThan(baseThresholds.sellConfidence);
        });

        it('should keep thresholds unchanged in moderate mode', () => {
            const baseThresholds = {
                buyScore: 0.65,
                buyConfidence: 0.6,
                sellScore: 0.35,
                sellConfidence: 0.6
            };
            
            const adjusted = IntegratedAIService.adjustThresholdsForConsensusMode(
                baseThresholds,
                'moderate'
            );
            
            expect(adjusted.buyScore).toBe(baseThresholds.buyScore);
            expect(adjusted.buyConfidence).toBe(baseThresholds.buyConfidence);
            expect(adjusted.sellScore).toBe(baseThresholds.sellScore);
            expect(adjusted.sellConfidence).toBe(baseThresholds.sellConfidence);
        });
    });
});

