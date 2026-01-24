import { describe, it, expect } from '@jest/globals';
import { kFoldSplit, performCrossValidation } from '../../utils/crossValidationUtils.js';

describe('crossValidationUtils', () => {
    describe('kFoldSplit', () => {
        it('should create k folds', () => {
            const features = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            const labels = [0, 1, 0, 1, 0, 1, 0, 1, 0, 1];
            
            const folds = kFoldSplit(features, labels, 5);
            
            expect(folds.length).toBe(5);
            folds.forEach(fold => {
                expect(fold.train.features.length).toBeGreaterThan(0);
                expect(fold.test.features.length).toBeGreaterThan(0);
            });
        });

        it('should handle empty arrays', () => {
            const folds = kFoldSplit([], [], 5);
            expect(folds.length).toBe(0);
        });

        it('should throw error for invalid k', () => {
            expect(() => {
                kFoldSplit([1, 2, 3], [0, 1, 0], 10); // k > data length
            }).toThrow();
        });
    });

    describe('performCrossValidation', () => {
        it('should perform cross validation', async () => {
            const features = [[1], [2], [3], [4], [5], [6], [7], [8], [9], [10]];
            const labels = [0, 1, 0, 1, 0, 1, 0, 1, 0, 1];
            
            const trainFunction = async (trainFeat, trainLab, testFeat, testLab) => {
                // Простая функция обучения для теста
                return {
                    accuracy: 0.8,
                    loss: 0.2
                };
            };
            
            const result = await performCrossValidation(features, labels, trainFunction, {
                k: 3
            });
            
            expect(result.success).toBe(true);
            expect(result.k).toBe(3);
            expect(result.results.length).toBe(3);
            expect(result.averageMetrics).toBeDefined();
        });
    });
});

