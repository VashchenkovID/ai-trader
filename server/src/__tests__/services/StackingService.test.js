import StackingService from '../../services/StackingService.js';
import Recommendation from '../../models/Recommendation.js';
import * as tf from '@tensorflow/tfjs';

// Моки
jest.mock('../../models/Recommendation.js');
jest.mock('../../services/LoggerService.js', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
}));

describe('StackingService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        StackingService.metaModel = null;
        StackingService.isInitialized = false;
    });

    describe('initialize', () => {
        it('should initialize the service', async () => {
            await StackingService.initialize();
            expect(StackingService.isInitialized).toBe(true);
        });
    });

    describe('createMetaModel', () => {
        it('should create a meta model with correct architecture', () => {
            const model = StackingService.createMetaModel(10);
            expect(model).toBeDefined();
            expect(model.inputs.length).toBe(1);
            expect(model.inputs[0].shape).toEqual([null, 10]);
        });
    });

    describe('calculateVariance', () => {
        it('should calculate variance correctly', () => {
            const values = [0.5, 0.6, 0.7, 0.8, 0.9];
            const variance = StackingService.calculateVariance(values);
            expect(variance).toBeGreaterThan(0);
            expect(variance).toBeLessThan(1);
        });

        it('should return 0 for empty array', () => {
            const variance = StackingService.calculateVariance([]);
            expect(variance).toBe(0);
        });
    });

    describe('predict', () => {
        it('should return fallback prediction when model is not trained', async () => {
            StackingService.metaModel = null;
            const predictions = [
                { source: 'ensemble', score: 0.7, confidence: 0.8 },
                { source: 'traditional', score: 0.6, confidence: 0.7 }
            ];
            
            const result = await StackingService.predict(predictions);
            
            expect(result.method).toBe('weighted_average');
            expect(result.score).toBeGreaterThan(0);
            expect(result.score).toBeLessThan(1);
            expect(result.confidence).toBeGreaterThan(0);
            expect(result.confidence).toBeLessThan(1);
        });

        it('should use stacking model when available', async () => {
            // Создаем простую модель для теста
            const model = tf.sequential({
                layers: [
                    tf.layers.dense({
                        inputShape: [10],
                        units: 1,
                        activation: 'sigmoid'
                    })
                ]
            });
            model.compile({
                optimizer: 'adam',
                loss: 'binaryCrossentropy'
            });
            
            StackingService.metaModel = model;
            
            const predictions = [
                { source: 'ensemble', score: 0.7, confidence: 0.8 },
                { source: 'traditional', score: 0.6, confidence: 0.7 },
                { source: 'reinforcement', score: 0.5, confidence: 0.6 },
                { source: 'signals', score: 0.5, confidence: 0.5 },
                { source: 'news', score: 0.5, confidence: 0.5 }
            ];
            
            const result = await StackingService.predict(predictions);
            
            expect(result.method).toBe('stacking');
            expect(result.score).toBeGreaterThan(0);
            expect(result.score).toBeLessThan(1);
            expect(result.confidence).toBeGreaterThan(0);
            expect(result.confidence).toBeLessThan(1);
            
            // Очищаем
            model.dispose();
        });
    });
});

