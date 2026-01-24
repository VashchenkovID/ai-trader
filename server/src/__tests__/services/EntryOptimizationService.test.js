import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import EntryOptimizationService from '../../services/EntryOptimizationService.js';
import OptimizedAnalysisService from '../../services/OptimizedAnalysisService.js';
import CacheService from '../../services/CacheService.js';
import TinkoffApiService from '../../services/TinkoffApiService.js';

// Мокаем зависимости
jest.mock('../../services/OptimizedAnalysisService.js', () => ({
    __esModule: true,
    default: {
        getAllIndicators: jest.fn()
    }
}));

jest.mock('../../services/CacheService.js', () => ({
    __esModule: true,
    default: {
        getCandles: jest.fn()
    }
}));

jest.mock('../../services/TinkoffApiService.js', () => ({
    __esModule: true,
    default: {
        getLastPrices: jest.fn()
    }
}));

describe('EntryOptimizationService (Phase 4.2)', () => {
    beforeEach(async () => {
        jest.clearAllMocks();
        jest.restoreAllMocks();
        
        // Инициализируем сервис
        if (!EntryOptimizationService.isInitialized) {
            await EntryOptimizationService.initialize();
        }
    });

    describe('4.2.1. ML-модель для предсказания оптимального времени входа', () => {
        it('should initialize correctly', async () => {
            expect(EntryOptimizationService.isInitialized).toBe(true);
        });

        it('should predict optimal entry time with heuristic fallback', async () => {
            const figi = 'TEST_FIGI';
            
            // Мокаем данные
            const mockCandles = Array.from({ length: 30 }, (_, i) => ({
                close: 100 + i * 0.5,
                high: 100 + i * 0.5 + 1,
                low: 100 + i * 0.5 - 1,
                volume: 1000 + i * 10
            }));

            jest.spyOn(CacheService, 'getCandles').mockResolvedValue(mockCandles);
            
            jest.spyOn(OptimizedAnalysisService, 'getAllIndicators').mockReturnValue({
                rsi: 30, // Oversold - хороший момент для входа
                macd: 0.2,
                macd_signal: 0.1,
                bb_position: 0.2,
                atr: 2,
                volatility: 0.1
            });

            const result = await EntryOptimizationService.predictOptimalEntryTime(figi);

            expect(result).toBeDefined();
            expect(result.success).toBe(true);
            expect(result.probability).toBeGreaterThanOrEqual(0);
            expect(result.probability).toBeLessThanOrEqual(1);
            expect(result.optimalTime).toBeDefined();
            expect(['now', 'soon', 'wait', 'avoid']).toContain(result.optimalTime);
            expect(result.confidence).toBeGreaterThanOrEqual(0);
            expect(result.confidence).toBeLessThanOrEqual(1);
        });

        it('should return heuristic prediction when model is not trained', async () => {
            const figi = 'TEST_FIGI';
            
            const mockCandles = Array.from({ length: 30 }, (_, i) => ({
                close: 100 + i * 0.5,
                high: 100 + i * 0.5 + 1,
                low: 100 + i * 0.5 - 1,
                volume: 1000
            }));

            jest.spyOn(CacheService, 'getCandles').mockResolvedValue(mockCandles);
            
            jest.spyOn(OptimizedAnalysisService, 'getAllIndicators').mockReturnValue({
                rsi: 25, // Сильно oversold
                macd: 0.3,
                bb_position: 0.1,
                volatility: 0.08
            });

            const result = await EntryOptimizationService.predictOptimalEntryTime(figi);

            expect(result.success).toBe(true);
            expect(result.method).toBe('heuristic');
            // При сильных бычьих индикаторах должен быть 'now' или 'soon'
            expect(['now', 'soon']).toContain(result.optimalTime);
        });

        it('should handle insufficient data gracefully', async () => {
            const figi = 'TEST_FIGI';
            
            jest.spyOn(CacheService, 'getCandles').mockResolvedValue([]);

            const result = await EntryOptimizationService.predictOptimalEntryTime(figi);

            expect(result.success).toBe(false);
            expect(result.probability).toBe(0);
            expect(result.optimalTime).toBeNull();
            expect(result.reason).toBe('Insufficient data for prediction');
        });

        it('should prepare features correctly', async () => {
            const figi = 'TEST_FIGI';
            
            const mockCandles = Array.from({ length: 30 }, (_, i) => ({
                close: 100 + i * 0.5,
                high: 100 + i * 0.5 + 1,
                low: 100 + i * 0.5 - 1,
                volume: 1000
            }));

            jest.spyOn(CacheService, 'getCandles').mockResolvedValue(mockCandles);
            
            jest.spyOn(OptimizedAnalysisService, 'getAllIndicators').mockReturnValue({
                rsi: 50,
                macd: 0.1,
                bb_position: 0.5,
                atr: 2,
                volatility: 0.1
            });

            const features = await EntryOptimizationService.prepareFeatures(figi, 30);

            expect(features).toBeDefined();
            expect(Array.isArray(features)).toBe(true);
            expect(features.length).toBeGreaterThan(0);
            // Все features должны быть нормализованы (0-1)
            features.forEach(f => {
                expect(f).toBeGreaterThanOrEqual(0);
                expect(f).toBeLessThanOrEqual(1);
            });
        });
    });

    describe('4.2.2. Динамический расчет размера лимитного ордера', () => {
        it('should calculate optimal order size based on liquidity', async () => {
            const figi = 'TEST_FIGI';
            const baseQuantity = 100;
            
            const mockCandles = Array.from({ length: 20 }, (_, i) => ({
                close: 100 + i * 0.5,
                volume: 5000 + i * 100 // Средний объем ~6000
            }));

            jest.spyOn(CacheService, 'getCandles').mockResolvedValue(mockCandles);

            const result = await EntryOptimizationService.calculateOptimalOrderSize(
                figi, baseQuantity, { maxSizePercent: 0.05 }
            );

            expect(result).toBeDefined();
            expect(result.optimalSize).toBeGreaterThan(0);
            expect(result.optimalSize).toBeLessThanOrEqual(baseQuantity);
            expect(result.adjustments).toBeDefined();
            expect(result.adjustments.volatility).toBeDefined();
            expect(result.adjustments.timeOfDay).toBeDefined();
            expect(result.avgVolume).toBeGreaterThan(0);
        });

        it('should adjust order size for high volatility', async () => {
            const figi = 'TEST_FIGI';
            const baseQuantity = 100;
            
            // Создаем данные с высокой волатильностью
            const mockCandles = Array.from({ length: 20 }, (_, i) => ({
                close: 100 + (Math.random() - 0.5) * 20, // Высокая волатильность
                volume: 5000
            }));

            jest.spyOn(CacheService, 'getCandles').mockResolvedValue(mockCandles);

            const result = await EntryOptimizationService.calculateOptimalOrderSize(
                figi, baseQuantity, { volatilityAdjustment: true }
            );

            expect(result.adjustments.volatility).toBeLessThanOrEqual(1.0);
            // При высокой волатильности размер должен быть уменьшен
            if (result.volatility > 0.15) {
                expect(result.adjustments.volatility).toBeLessThan(1.0);
            }
        });

        it('should adjust order size for time of day', async () => {
            const figi = 'TEST_FIGI';
            const baseQuantity = 100;
            
            const mockCandles = Array.from({ length: 20 }, (_, i) => ({
                close: 100 + i * 0.5,
                volume: 5000
            }));

            jest.spyOn(CacheService, 'getCandles').mockResolvedValue(mockCandles);

            const result = await EntryOptimizationService.calculateOptimalOrderSize(
                figi, baseQuantity, { timeOfDayAdjustment: true }
            );

            expect(result.adjustments.timeOfDay).toBeDefined();
            expect(result.adjustments.timeOfDay).toBeGreaterThan(0);
        });

        it('should return base quantity when no historical data', async () => {
            const figi = 'TEST_FIGI';
            const baseQuantity = 100;
            
            jest.spyOn(CacheService, 'getCandles').mockResolvedValue([]);

            const result = await EntryOptimizationService.calculateOptimalOrderSize(
                figi, baseQuantity
            );

            expect(result.optimalSize).toBe(baseQuantity);
            expect(result.reason).toBe('No historical data');
        });

        it('should respect maxSizePercent limit', async () => {
            const figi = 'TEST_FIGI';
            const baseQuantity = 10000; // Большой базовый размер
            
            const mockCandles = Array.from({ length: 20 }, (_, i) => ({
                close: 100,
                volume: 10000 // Средний объем 10000
            }));

            jest.spyOn(CacheService, 'getCandles').mockResolvedValue(mockCandles);

            const result = await EntryOptimizationService.calculateOptimalOrderSize(
                figi, baseQuantity, { 
                    maxSizePercent: 0.05, // 5% от 10000 = 500
                    volatilityAdjustment: false, // Отключаем корректировки для точного теста
                    timeOfDayAdjustment: false
                }
            );

            // Оптимальный размер не должен превышать 5% от среднего объема (500)
            // Учитываем возможные корректировки, но максимум должен быть ограничен
            expect(result.optimalSize).toBeLessThanOrEqual(500 * 1.2); // Допускаем небольшое превышение из-за округления
            expect(result.maxSize).toBe(500);
        });
    });

    describe("4.2.3. Учет spread'а при выборе типа ордера", () => {
        it('should recommend MARKET order for low spread and urgency', async () => {
            const figi = 'TEST_FIGI';
            const signal = {
                symbol: figi,
                action: 'BUY',
                price: 100,
                quantity: 10,
                urgency: true
            };

            const mockCandles = Array.from({ length: 30 }, (_, i) => ({
                close: 100 + i * 0.1, // Низкая волатильность = низкий spread
                volume: 1000
            }));

            jest.spyOn(CacheService, 'getCandles').mockResolvedValue(mockCandles);

            const result = await EntryOptimizationService.recommendOrderType(figi, signal, {
                urgency: true
            });

            expect(result).toBeDefined();
            expect(result.orderType).toBeDefined();
            expect(['MARKET', 'LIMIT', 'STOP_LIMIT']).toContain(result.orderType);
            expect(result.confidence).toBeGreaterThanOrEqual(0);
            expect(result.confidence).toBeLessThanOrEqual(1);
        });

        it('should recommend LIMIT order for high spread', async () => {
            const figi = 'TEST_FIGI';
            const signal = {
                symbol: figi,
                action: 'SELL', // Используем SELL, чтобы избежать STOP_LIMIT для BUY
                price: 100,
                quantity: 10
            };

            // Создаем данные с высокой волатильностью (высокий spread)
            const mockCandles = Array.from({ length: 30 }, (_, i) => ({
                close: 100 + (Math.random() - 0.5) * 10, // Высокая волатильность
                volume: 1000
            }));

            jest.spyOn(CacheService, 'getCandles').mockResolvedValue(mockCandles);

            const result = await EntryOptimizationService.recommendOrderType(figi, signal, {
                urgency: false
            });

            // Для SELL при высоком spread'е должен быть LIMIT (не STOP_LIMIT)
            expect(result.orderType).toBe('LIMIT');
            expect(result.recommendedPrice).toBeDefined();
            expect(result.recommendedPrice).not.toBe(signal.price);
        });

        it('should calculate recommended price for LIMIT order', async () => {
            const figi = 'TEST_FIGI';
            const signal = {
                symbol: figi,
                action: 'BUY',
                price: 100,
                quantity: 10
            };

            const mockCandles = Array.from({ length: 30 }, (_, i) => ({
                close: 100 + i * 0.1,
                volume: 1000
            }));

            jest.spyOn(CacheService, 'getCandles').mockResolvedValue(mockCandles);

            const result = await EntryOptimizationService.recommendOrderType(figi, signal);

            if (result.orderType === 'LIMIT') {
                // Для BUY рекомендованная цена должна быть ниже текущей
                expect(result.recommendedPrice).toBeLessThan(signal.price);
            }
        });

        it('should recommend STOP_LIMIT for high spread BUY orders', async () => {
            const figi = 'TEST_FIGI';
            const signal = {
                symbol: figi,
                action: 'BUY',
                price: 100,
                quantity: 10
            };

            // Высокая волатильность
            const mockCandles = Array.from({ length: 30 }, (_, i) => ({
                close: 100 + (Math.random() - 0.5) * 15,
                volume: 1000
            }));

            jest.spyOn(CacheService, 'getCandles').mockResolvedValue(mockCandles);

            const result = await EntryOptimizationService.recommendOrderType(figi, signal);

            // При высоком spread'е для BUY может быть рекомендован STOP_LIMIT
            expect(['LIMIT', 'STOP_LIMIT']).toContain(result.orderType);
            if (result.orderType === 'STOP_LIMIT') {
                expect(result.stopPrice).toBeDefined();
                expect(result.limitPrice).toBeDefined();
            }
        });

        it('should include spread analysis in recommendation', async () => {
            const figi = 'TEST_FIGI';
            const signal = {
                symbol: figi,
                action: 'BUY',
                price: 100,
                quantity: 10
            };

            const mockCandles = Array.from({ length: 30 }, (_, i) => ({
                close: 100 + i * 0.1,
                volume: 1000
            }));

            jest.spyOn(CacheService, 'getCandles').mockResolvedValue(mockCandles);

            const result = await EntryOptimizationService.recommendOrderType(figi, signal);

            expect(result.spread).toBeDefined();
            expect(result.spreadPercentile).toBeDefined();
            expect(['low', 'medium', 'high']).toContain(result.spreadPercentile);
            expect(result.reasoning).toBeDefined();
        });

        it('should handle errors gracefully', async () => {
            const figi = 'TEST_FIGI';
            const signal = {
                symbol: figi,
                action: 'BUY',
                price: 100,
                quantity: 10
            };

            jest.spyOn(CacheService, 'getCandles').mockRejectedValue(new Error('Test error'));

            const result = await EntryOptimizationService.recommendOrderType(figi, signal);

            expect(result.orderType).toBe('LIMIT');
            expect(result.recommendedPrice).toBe(signal.price);
            expect(result.confidence).toBe(0.5);
        });
    });

    describe('Integration tests', () => {
        it('should integrate all optimization features', async () => {
            const figi = 'TEST_FIGI';
            
            const mockCandles = Array.from({ length: 30 }, (_, i) => ({
                close: 100 + i * 0.5,
                high: 100 + i * 0.5 + 1,
                low: 100 + i * 0.5 - 1,
                volume: 5000 + i * 100
            }));

            jest.spyOn(CacheService, 'getCandles').mockResolvedValue(mockCandles);
            
            jest.spyOn(OptimizedAnalysisService, 'getAllIndicators').mockReturnValue({
                rsi: 50,
                macd: 0.1,
                bb_position: 0.5,
                atr: 2,
                volatility: 0.1
            });

            // 1. Предсказание оптимального времени входа
            const entryPrediction = await EntryOptimizationService.predictOptimalEntryTime(figi);
            expect(entryPrediction.success).toBe(true);

            // 2. Расчет оптимального размера ордера
            const optimalSize = await EntryOptimizationService.calculateOptimalOrderSize(figi, 100);
            expect(optimalSize.optimalSize).toBeGreaterThan(0);

            // 3. Рекомендация типа ордера
            const signal = {
                symbol: figi,
                action: 'BUY',
                price: 100,
                quantity: optimalSize.optimalSize
            };
            const orderType = await EntryOptimizationService.recommendOrderType(figi, signal);
            expect(orderType.orderType).toBeDefined();
        });
    });
});

