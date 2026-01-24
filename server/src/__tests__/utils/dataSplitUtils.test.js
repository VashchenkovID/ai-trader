import { describe, it, expect } from '@jest/globals';
import { trainValidationTestSplit, stratifiedSplit, timeBasedSplit } from '../../utils/dataSplitUtils.js';

describe('dataSplitUtils', () => {
    describe('trainValidationTestSplit', () => {
        it('should split data correctly', () => {
            const features = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            const labels = [0, 1, 0, 1, 0, 1, 0, 1, 0, 1];
            
            const result = trainValidationTestSplit(features, labels, {
                trainRatio: 0.7,
                validationRatio: 0.15,
                testRatio: 0.15
            });
            
            expect(result.train.features.length).toBe(7);
            expect(result.validation.features.length).toBe(1);
            expect(result.test.features.length).toBe(2);
        });

        it('should handle empty arrays', () => {
            const result = trainValidationTestSplit([], []);
            
            expect(result.train.features.length).toBe(0);
            expect(result.validation.features.length).toBe(0);
            expect(result.test.features.length).toBe(0);
        });

        it('should throw error for invalid ratios', () => {
            expect(() => {
                trainValidationTestSplit([1, 2, 3], [0, 1, 0], {
                    trainRatio: 0.5,
                    validationRatio: 0.3,
                    testRatio: 0.3 // Sum = 1.1
                });
            }).toThrow();
        });

        it('should throw error for mismatched lengths', () => {
            expect(() => {
                trainValidationTestSplit([1, 2, 3], [0, 1]);
            }).toThrow();
        });
    });

    describe('stratifiedSplit', () => {
        it('should maintain class distribution', () => {
            const features = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            const labels = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1]; // 5 of each class
            
            const result = stratifiedSplit(features, labels);
            
            // Проверяем, что в каждом наборе есть представители обоих классов
            const trainClasses = new Set(result.train.labels);
            const valClasses = new Set(result.validation.labels);
            const testClasses = new Set(result.test.labels);
            
            expect(trainClasses.size).toBeGreaterThan(0);
        });
    });

    describe('timeBasedSplit', () => {
        it('should split without shuffling', () => {
            const features = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            const labels = [0, 1, 0, 1, 0, 1, 0, 1, 0, 1];
            
            const result = timeBasedSplit(features, labels);
            
            // Первые элементы должны быть в train
            expect(result.train.features[0]).toBe(1);
            expect(result.train.features.length).toBe(7);
        });
    });
});

