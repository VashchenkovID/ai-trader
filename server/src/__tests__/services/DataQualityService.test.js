import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import DataQualityService from '../../services/DataQualityService.js';

// Моки
jest.mock('../../services/LoggerService.js', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
}));

describe('DataQualityService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        DataQualityService.isInitialized = false;
    });

    describe('initialize', () => {
        it('should initialize the service', async () => {
            await DataQualityService.initialize();
            expect(DataQualityService.isInitialized).toBe(true);
        });
    });

    describe('validateCandles', () => {
        it('should validate correct candles', () => {
            const candles = [
                { time: '2024-01-01', open: 100, high: 105, low: 99, close: 103, volume: 1000 },
                { time: '2024-01-02', open: 103, high: 107, low: 102, close: 106, volume: 1200 }
            ];
            
            const result = DataQualityService.validateCandles(candles);
            
            expect(result.valid).toBe(true);
            expect(result.errors.length).toBe(0);
            expect(result.cleanedCandles.length).toBe(2);
        });

        it('should detect NaN values', () => {
            const candles = [
                { time: '2024-01-01', open: 100, high: 105, low: 99, close: NaN, volume: 1000 }
            ];
            
            const result = DataQualityService.validateCandles(candles);
            
            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors.some(e => e.includes('NaN'))).toBe(true);
        });

        it('should detect Infinity values', () => {
            const candles = [
                { time: '2024-01-01', open: 100, high: Infinity, low: 99, close: 103, volume: 1000 }
            ];
            
            const result = DataQualityService.validateCandles(candles);
            
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('Infinity'))).toBe(true);
        });

        it('should detect logical inconsistencies (high < low)', () => {
            const candles = [
                { time: '2024-01-01', open: 100, high: 99, low: 105, close: 103, volume: 1000 }
            ];
            
            const result = DataQualityService.validateCandles(candles);
            
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('high < low'))).toBe(true);
        });

        it('should warn about open/close outside [low, high]', () => {
            const candles = [
                { time: '2024-01-01', open: 110, high: 105, low: 99, close: 103, volume: 1000 }
            ];
            
            const result = DataQualityService.validateCandles(candles);
            
            expect(result.warnings.length).toBeGreaterThan(0);
            expect(result.warnings.some(w => w.includes('outside'))).toBe(true);
        });

        it('should handle empty array', () => {
            const result = DataQualityService.validateCandles([]);
            
            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });
    });

    describe('detectOutliers', () => {
        it('should detect outliers using IQR method', () => {
            const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 100]; // 100 is an outlier
            const result = DataQualityService.detectOutliers(values, 'iqr');
            
            expect(result.outliers.length).toBeGreaterThan(0);
            expect(result.outliers).toContain(100);
        });

        it('should detect outliers using Z-score method', () => {
            // Используем данные с множеством нормальных значений и явным выбросом
            // Большое количество нормальных значений уменьшит влияние выброса на среднее и stdDev
            const normalValues = Array.from({ length: 50 }, (_, i) => 10 + i * 0.5); // [10, 10.5, ..., 34.5]
            const values = [...normalValues, 200]; // Добавляем явный выброс 200
            const result = DataQualityService.detectOutliers(values, 'zscore');
            
            // Проверяем, что метод возвращает корректную статистику
            expect(result.stats).toBeDefined();
            expect(result.stats.method).toBe('zscore');
            expect(result.stats.mean).toBeGreaterThan(0);
            expect(result.stats.stdDev).toBeGreaterThan(0);
            expect(result.stats.threshold).toBe(3.0);
            
            // При большом количестве нормальных значений выброс должен быть обнаружен
            // Z-score для 200 должен быть значительно > 3.0
            expect(result.outliers.length).toBeGreaterThan(0);
            expect(result.outliers).toContain(200);
        });

        it('should handle empty array', () => {
            const result = DataQualityService.detectOutliers([]);
            
            expect(result.outliers.length).toBe(0);
            expect(result.indices.length).toBe(0);
        });

        it('should handle array with NaN values', () => {
            const values = [1, 2, 3, NaN, 5, 6, 7, 8, 9, 10];
            const result = DataQualityService.detectOutliers(values, 'iqr');
            
            // NaN values should be filtered out
            expect(result.outliers.length).toBeGreaterThanOrEqual(0);
        });
    });

    describe('fillGaps', () => {
        it('should fill gaps using linear interpolation', () => {
            const values = [1, 2, null, 4, 5];
            const filled = DataQualityService.fillGaps(values, 'linear');
            
            expect(filled[2]).toBeCloseTo(3, 1); // Interpolated between 2 and 4
        });

        it('should fill gaps using forward fill', () => {
            const values = [1, 2, null, null, 5];
            const filled = DataQualityService.fillGaps(values, 'forward');
            
            expect(filled[2]).toBe(2); // Forward filled from previous value
            expect(filled[3]).toBe(2);
        });

        it('should fill gaps using backward fill', () => {
            const values = [1, 2, null, null, 5];
            const filled = DataQualityService.fillGaps(values, 'backward');
            
            expect(filled[2]).toBe(5); // Backward filled from next value
            expect(filled[3]).toBe(5);
        });

        it('should fill gaps using mean', () => {
            const values = [1, 2, null, 4, 5];
            const filled = DataQualityService.fillGaps(values, 'mean');
            
            const mean = (1 + 2 + 4 + 5) / 4;
            expect(filled[2]).toBe(mean);
        });

        it('should handle array with all gaps', () => {
            const values = [null, null, null];
            const filled = DataQualityService.fillGaps(values, 'linear');
            
            // Should fill with 0 as fallback
            expect(filled.every(v => v === 0)).toBe(true);
        });

        it('should handle array without gaps', () => {
            const values = [1, 2, 3, 4, 5];
            const filled = DataQualityService.fillGaps(values, 'linear');
            
            expect(filled).toEqual(values);
        });
    });

    describe('normalizeData', () => {
        it('should normalize using minmax method', () => {
            const values = [10, 20, 30, 40, 50];
            const result = DataQualityService.normalizeData(values, 'minmax');
            
            expect(result.normalized[0]).toBe(0); // Min value -> 0
            expect(result.normalized[4]).toBe(1); // Max value -> 1
            expect(result.stats.method).toBe('minmax');
        });

        it('should normalize using zscore method', () => {
            const values = [10, 20, 30, 40, 50];
            const result = DataQualityService.normalizeData(values, 'zscore');
            
            expect(result.stats.method).toBe('zscore');
            expect(result.stats.mean).toBeDefined();
            expect(result.stats.stdDev).toBeDefined();
        });

        it('should normalize using robust method', () => {
            const values = [10, 20, 30, 40, 50];
            const result = DataQualityService.normalizeData(values, 'robust');
            
            expect(result.stats.method).toBe('robust');
            expect(result.stats.median).toBeDefined();
            expect(result.stats.iqr).toBeDefined();
        });

        it('should handle array with NaN values', () => {
            const values = [10, NaN, 30, 40, 50];
            const result = DataQualityService.normalizeData(values, 'minmax');
            
            // NaN should be replaced with 0
            expect(result.normalized[1]).toBe(0);
        });

        it('should handle empty array', () => {
            const result = DataQualityService.normalizeData([]);
            
            expect(result.normalized.length).toBe(0);
        });
    });

    describe('safeDivide', () => {
        it('should divide correctly', () => {
            const result = DataQualityService.safeDivide(10, 2, 0);
            expect(result).toBe(5);
        });

        it('should return default value on division by zero', () => {
            const result = DataQualityService.safeDivide(10, 0, 999);
            expect(result).toBe(999);
        });

        it('should return default value on NaN numerator', () => {
            const result = DataQualityService.safeDivide(NaN, 2, 0);
            expect(result).toBe(0);
        });

        it('should return default value on Infinity denominator', () => {
            const result = DataQualityService.safeDivide(10, Infinity, 0);
            expect(result).toBe(0);
        });
    });

    describe('cleanValue', () => {
        it('should return value if valid', () => {
            const result = DataQualityService.cleanValue(42, 0);
            expect(result).toBe(42);
        });

        it('should return default for NaN', () => {
            const result = DataQualityService.cleanValue(NaN, 999);
            expect(result).toBe(999);
        });

        it('should return default for Infinity', () => {
            const result = DataQualityService.cleanValue(Infinity, 0);
            expect(result).toBe(0);
        });

        it('should return default for null', () => {
            const result = DataQualityService.cleanValue(null, 0);
            expect(result).toBe(0);
        });

        it('should return default for undefined', () => {
            const result = DataQualityService.cleanValue(undefined, 0);
            expect(result).toBe(0);
        });
    });

    describe('processCandles', () => {
        it('should process valid candles', () => {
            const candles = [
                { time: '2024-01-01', open: 100, high: 105, low: 99, close: 103, volume: 1000 },
                { time: '2024-01-02', open: 103, high: 107, low: 102, close: 106, volume: 1200 }
            ];
            
            const result = DataQualityService.processCandles(candles);
            
            expect(result.processed).toBe(true);
            expect(result.candles.length).toBeGreaterThan(0);
            expect(result.validation.valid).toBe(true);
        });

        it('should detect outliers in processed candles', () => {
            const candles = [
                { time: '2024-01-01', open: 100, high: 105, low: 99, close: 103, volume: 1000 },
                { time: '2024-01-02', open: 103, high: 107, low: 102, close: 10000, volume: 1200 } // Outlier
            ];
            
            DataQualityService.updateSettings({ detectOutliers: true });
            const result = DataQualityService.processCandles(candles);
            
            expect(result.outliers).toBeDefined();
            expect(result.outliers.prices).toBeDefined();
        });

        it('should fill gaps in processed candles', () => {
            const candles = [
                { time: '2024-01-01', open: 100, high: 105, low: 99, close: 103, volume: 1000 },
                { time: '2024-01-02', open: null, high: 107, low: 102, close: 106, volume: 1200 }
            ];
            
            DataQualityService.updateSettings({ fillGaps: true });
            const result = DataQualityService.processCandles(candles);
            
            // Open should be filled
            expect(result.candles[1].open).toBeDefined();
            expect(result.candles[1].open).not.toBeNull();
        });
    });
});

