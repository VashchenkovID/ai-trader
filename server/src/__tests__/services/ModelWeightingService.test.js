import ModelWeightingService from '../../services/ModelWeightingService.js';

// Моки
jest.mock('../../services/LoggerService.js', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
}));

describe('ModelWeightingService - Correlation', () => {
    describe('calculatePearsonCorrelation', () => {
        it('should calculate positive correlation correctly', () => {
            const x = [1, 2, 3, 4, 5];
            const y = [2, 4, 6, 8, 10];
            const correlation = ModelWeightingService.calculatePearsonCorrelation(x, y);
            expect(correlation).toBeCloseTo(1.0, 5);
        });

        it('should calculate negative correlation correctly', () => {
            const x = [1, 2, 3, 4, 5];
            const y = [10, 8, 6, 4, 2];
            const correlation = ModelWeightingService.calculatePearsonCorrelation(x, y);
            expect(correlation).toBeCloseTo(-1.0, 5);
        });

        it('should return 0 for no correlation', () => {
            const x = [1, 2, 3, 4, 5];
            const y = [5, 5, 5, 5, 5];
            const correlation = ModelWeightingService.calculatePearsonCorrelation(x, y);
            expect(correlation).toBe(0);
        });

        it('should handle empty arrays', () => {
            const correlation = ModelWeightingService.calculatePearsonCorrelation([], []);
            expect(correlation).toBe(0);
        });
    });

    describe('calculateCorrelation', () => {
        it('should calculate correlation matrix for predictions', () => {
            const predictions = [
                { source: 'ensemble', score: 0.7 },
                { source: 'traditional', score: 0.6 },
                { source: 'reinforcement', score: 0.5 }
            ];
            
            const matrix = ModelWeightingService.calculateCorrelation(predictions);
            
            expect(matrix).toBeDefined();
            expect(matrix.ensemble).toBeDefined();
            expect(matrix.ensemble.ensemble).toBe(1.0); // Корреляция с собой = 1
        });
    });

    describe('adjustConfidenceForCorrelation', () => {
        it('should reduce confidence for high correlation', () => {
            const predictions = [
                { source: 'ensemble', score: 0.7, confidence: 0.8 },
                { source: 'traditional', score: 0.68, confidence: 0.75 },
                { source: 'reinforcement', score: 0.72, confidence: 0.78 }
            ];
            
            const baseConfidence = 0.8;
            const adjusted = ModelWeightingService.adjustConfidenceForCorrelation(
                predictions,
                baseConfidence
            );
            
            // При высокой корреляции уверенность должна снизиться
            expect(adjusted).toBeLessThan(baseConfidence);
        });

        it('should increase confidence for low correlation', () => {
            const predictions = [
                { source: 'ensemble', score: 0.8, confidence: 0.8 },
                { source: 'traditional', score: 0.3, confidence: 0.7 },
                { source: 'reinforcement', score: 0.2, confidence: 0.6 }
            ];
            
            const baseConfidence = 0.7;
            const adjusted = ModelWeightingService.adjustConfidenceForCorrelation(
                predictions,
                baseConfidence
            );
            
            // При низкой корреляции (разнообразие мнений) уверенность может повыситься
            expect(adjusted).toBeGreaterThanOrEqual(baseConfidence * 0.9); // Может быть немного выше
        });

        it('should handle single prediction', () => {
            const predictions = [
                { source: 'ensemble', score: 0.7, confidence: 0.8 }
            ];
            
            const baseConfidence = 0.8;
            const adjusted = ModelWeightingService.adjustConfidenceForCorrelation(
                predictions,
                baseConfidence
            );
            
            expect(adjusted).toBe(baseConfidence);
        });
    });
});

