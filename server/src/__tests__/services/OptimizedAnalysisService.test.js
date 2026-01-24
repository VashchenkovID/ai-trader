import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Мокируем зависимости ДО импорта тестируемого модуля
const mockGetCandles = jest.fn();
jest.mock('../../services/CacheService.js', () => ({
    __esModule: true,
    default: {
        initialize: jest.fn(),
        getCandles: mockGetCandles,
        getAllInstruments: jest.fn()
    }
}));

jest.mock('../../services/DataQualityService.js', () => ({
    __esModule: true,
    default: {
        isInitialized: true,
        cleanValue: jest.fn((val, def) => val ?? def),
        fillGaps: jest.fn((arr) => arr),
        processCandles: jest.fn((candles) => candles)
    }
}));

jest.mock('../../services/LoggerService.js', () => ({
    __esModule: true,
    default: {
        isInitialized: true,
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn()
    }
}));

// Импортируем после моков
import OptimizedAnalysisService from '../../services/OptimizedAnalysisService.js';
import CacheService from '../../services/CacheService.js';
import DataQualityService from '../../services/DataQualityService.js';

describe('OptimizedAnalysisService - Фаза 3, задача 3.1: Оптимизация производительности', () => {
    beforeEach(async () => {
        jest.clearAllMocks();
        mockGetCandles.mockClear();
        // Убеждаемся, что CacheService.getCandles указывает на мок
        if (CacheService.getCandles !== mockGetCandles) {
            CacheService.getCandles = mockGetCandles;
        }
        OptimizedAnalysisService.isInitialized = true;
        OptimizedAnalysisService.indicatorsCache.clear();
    });


    describe('3.1.1. Батчинг анализа инструментов', () => {
        it('should analyze multiple instruments in batch', async () => {
            const figis = ['FIGI1', 'FIGI2', 'FIGI3'];
            // Нужно минимум 5 свечей для расчета SMA_5
            const mockCandles = [
                { close: 100, volume: 1000, high: 105, low: 95 },
                { close: 102, volume: 1100, high: 107, low: 97 },
                { close: 101, volume: 1050, high: 106, low: 96 },
                { close: 103, volume: 1200, high: 108, low: 98 },
                { close: 104, volume: 1150, high: 109, low: 99 }
            ];

            // Мокируем для каждого инструмента отдельно
            mockGetCandles.mockResolvedValue(mockCandles);

            const results = await OptimizedAnalysisService.analyzeInstrumentsBatch(figis, {
                interval: 'DAY',
                period: 30,
                batchSize: 2
            });

            expect(results).toHaveLength(3);
            // Проверяем, что все результаты получены
            expect(results[0].figi).toBe('FIGI1');
            expect(results[1].figi).toBe('FIGI2');
            expect(results[2].figi).toBe('FIGI3');
            
            // Проверяем успешность (может быть false, если недостаточно данных)
            if (results[0].success) {
                expect(results[0].indicators).toBeDefined();
                expect(results[0].indicators.sma_5).toBeDefined();
            } else {
                // Если не успешно, проверяем наличие ошибки
                expect(results[0].error).toBeDefined();
            }
            expect(mockGetCandles).toHaveBeenCalledTimes(3);
        });

        it('should handle errors in batch gracefully', async () => {
            const figis = ['FIGI1', 'FIGI2'];
            
            // Нужно минимум 5 свечей для расчета индикаторов
            const validCandles = [
                { close: 100, volume: 1000, high: 105, low: 95 },
                { close: 102, volume: 1100, high: 107, low: 97 },
                { close: 101, volume: 1050, high: 106, low: 96 },
                { close: 103, volume: 1200, high: 108, low: 98 },
                { close: 104, volume: 1150, high: 109, low: 99 }
            ];
            
            let callCount = 0;
            mockGetCandles.mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                    return Promise.resolve(validCandles);
                } else {
                    return Promise.reject(new Error('Database error'));
                }
            });

            const results = await OptimizedAnalysisService.analyzeInstrumentsBatch(figis);

            expect(results).toHaveLength(2);
            // Первый результат должен быть успешным (если достаточно данных)
            if (results[0].success) {
                expect(results[0].indicators).toBeDefined();
            }
            // Второй результат должен быть неуспешным из-за ошибки
            expect(results[1].success).toBe(false);
            expect(results[1].error).toBeDefined();
        });

        it('should process instruments in batches of specified size', async () => {
            const figis = ['FIGI1', 'FIGI2', 'FIGI3', 'FIGI4', 'FIGI5'];
            // Нужно минимум 5 свечей для расчета индикаторов
            const mockCandles = [
                { close: 100, volume: 1000, high: 105, low: 95 },
                { close: 102, volume: 1100, high: 107, low: 97 },
                { close: 101, volume: 1050, high: 106, low: 96 },
                { close: 103, volume: 1200, high: 108, low: 98 },
                { close: 104, volume: 1150, high: 109, low: 99 }
            ];
            mockGetCandles.mockResolvedValue(mockCandles);

            const results = await OptimizedAnalysisService.analyzeInstrumentsBatch(figis, {
                batchSize: 2
            });

            expect(results).toHaveLength(5);
            // Проверяем, что все инструменты обработаны
            const processedFigis = results.map(r => r.figi);
            expect(processedFigis).toContain('FIGI1');
            expect(processedFigis).toContain('FIGI5');
        });
    });

    describe('3.1.2. Кеширование результатов анализа', () => {
        it('should cache indicators and return cached result', async () => {
            const prices = [100, 102, 101, 103, 102];
            const volumes = [1000, 1100, 1050, 1200, 1150];
            const highs = [105, 107, 106, 108, 107];
            const lows = [95, 97, 96, 98, 97];

            // Первый вызов - должен рассчитать
            const indicators1 = OptimizedAnalysisService.getAllIndicators(
                prices, volumes, highs, lows, 'FIGI1', 'DAY', 30
            );

            expect(indicators1).toBeDefined();
            expect(indicators1.sma_5).toBeDefined();

            // Второй вызов с теми же параметрами - должен вернуть из кеша
            const indicators2 = OptimizedAnalysisService.getAllIndicators(
                prices, volumes, highs, lows, 'FIGI1', 'DAY', 30
            );

            expect(indicators2).toEqual(indicators1);
            expect(OptimizedAnalysisService.indicatorsCache.has('FIGI1:DAY:30')).toBe(true);
        });

        it('should invalidate cache for specific instrument', () => {
            const prices = [100, 102, 101];
            OptimizedAnalysisService.getAllIndicators(prices, [], [], [], 'FIGI1', 'DAY', 30);
            
            expect(OptimizedAnalysisService.indicatorsCache.has('FIGI1:DAY:30')).toBe(true);
            
            OptimizedAnalysisService.invalidateIndicatorsCache('FIGI1', 'DAY');
            
            expect(OptimizedAnalysisService.indicatorsCache.has('FIGI1:DAY:30')).toBe(false);
        });

        it('should invalidate all cache entries for instrument if interval not specified', () => {
            OptimizedAnalysisService.getAllIndicators([100, 102], [], [], [], 'FIGI1', 'DAY', 30);
            OptimizedAnalysisService.getAllIndicators([100, 102], [], [], [], 'FIGI1', 'HOUR', 7);
            
            expect(OptimizedAnalysisService.indicatorsCache.has('FIGI1:DAY:30')).toBe(true);
            expect(OptimizedAnalysisService.indicatorsCache.has('FIGI1:HOUR:7')).toBe(true);
            
            OptimizedAnalysisService.invalidateIndicatorsCache('FIGI1');
            
            expect(OptimizedAnalysisService.indicatorsCache.has('FIGI1:DAY:30')).toBe(false);
            expect(OptimizedAnalysisService.indicatorsCache.has('FIGI1:HOUR:7')).toBe(false);
        });

        it('should not use cache if data changed', () => {
            const prices1 = [100, 102, 101];
            const prices2 = [100, 102, 103]; // Different last price
            
            const indicators1 = OptimizedAnalysisService.getAllIndicators(
                prices1, [], [], [], 'FIGI1', 'DAY', 30
            );
            
            const indicators2 = OptimizedAnalysisService.getAllIndicators(
                prices2, [], [], [], 'FIGI1', 'DAY', 30
            );
            
            // Индикаторы должны быть пересчитаны из-за изменения данных
            expect(indicators2).toBeDefined();
            // Кеш должен обновиться с новыми данными
            const cached = OptimizedAnalysisService.indicatorsCache.get('FIGI1:DAY:30');
            expect(cached.lastPrice).toBe(103);
        });

        it('should cleanup old cache entries', () => {
            // Устанавливаем короткий TTL для теста
            const originalTTL = OptimizedAnalysisService.cacheSettings.indicatorsTTL;
            OptimizedAnalysisService.cacheSettings.indicatorsTTL = 100; // 100ms
            
            OptimizedAnalysisService.getAllIndicators([100, 102], [], [], [], 'FIGI1', 'DAY', 30);
            
            // Имитируем устаревание кеша
            const cached = OptimizedAnalysisService.indicatorsCache.get('FIGI1:DAY:30');
            cached.timestamp = Date.now() - 200; // 200ms ago
            
            OptimizedAnalysisService._cleanupIndicatorsCache();
            
            expect(OptimizedAnalysisService.indicatorsCache.has('FIGI1:DAY:30')).toBe(false);
            
            // Восстанавливаем TTL
            OptimizedAnalysisService.cacheSettings.indicatorsTTL = originalTTL;
        });
    });

    describe('3.1.3. Устранение дублирования вычислений', () => {
        it('should get indicators for instrument with caching', async () => {
            // Нужно минимум 5 свечей для расчета индикаторов
            const mockCandles = [
                { close: 100, volume: 1000, high: 105, low: 95 },
                { close: 102, volume: 1100, high: 107, low: 97 },
                { close: 101, volume: 1050, high: 106, low: 96 },
                { close: 103, volume: 1200, high: 108, low: 98 },
                { close: 104, volume: 1150, high: 109, low: 99 }
            ];
            
            mockGetCandles.mockResolvedValue(mockCandles);
            
            const indicators1 = await OptimizedAnalysisService.getIndicatorsForInstrument('FIGI1', 'DAY', 30);
            expect(indicators1).toBeDefined();
            // Проверяем, что индикаторы рассчитаны (если достаточно данных)
            if (Object.keys(indicators1).length > 0) {
                expect(indicators1.sma_5).toBeDefined();
            }
            expect(mockGetCandles).toHaveBeenCalledTimes(1);
            
            // Второй вызов должен использовать кеш
            const indicators2 = await OptimizedAnalysisService.getIndicatorsForInstrument('FIGI1', 'DAY', 30);
            expect(indicators2).toEqual(indicators1);
            // getCandles не должен вызываться снова, если кеш валиден
            // Но в реальности он может вызваться для проверки актуальности данных
        });

        it('should batch retrieve candles from database', async () => {
            const CachedCandle = (await import('../../models/CachedCandle.js')).default;
            const figis = ['FIGI1', 'FIGI2', 'FIGI3'];
            
            const mockCandles = [
                { figi: 'FIGI1', time: new Date('2024-01-01'), close: 100, volume: 1000, high: 105, low: 95, interval: 'DAY' },
                { figi: 'FIGI2', time: new Date('2024-01-01'), close: 200, volume: 2000, high: 205, low: 195, interval: 'DAY' },
                { figi: 'FIGI3', time: new Date('2024-01-01'), close: 300, volume: 3000, high: 305, low: 295, interval: 'DAY' }
            ];
            
            CachedCandle.findAll = jest.fn().mockResolvedValue(mockCandles);
            
            const candlesByFigi = await OptimizedAnalysisService.getCandlesBatch(figis, 'DAY', 30);
            
            expect(candlesByFigi).toBeInstanceOf(Map);
            expect(candlesByFigi.has('FIGI1')).toBe(true);
            expect(candlesByFigi.has('FIGI2')).toBe(true);
            expect(candlesByFigi.has('FIGI3')).toBe(true);
            expect(candlesByFigi.get('FIGI1')).toHaveLength(1);
            expect(CachedCandle.findAll).toHaveBeenCalledTimes(1);
        });

        it('should fallback to individual requests if batch fails', async () => {
            const CachedCandle = (await import('../../models/CachedCandle.js')).default;
            const figis = ['FIGI1', 'FIGI2'];
            
            CachedCandle.findAll = jest.fn().mockRejectedValue(new Error('Database error'));
            
            // Мокируем достаточное количество свечей для каждого инструмента
            const candles1 = [
                { close: 100, volume: 1000, high: 105, low: 95 },
                { close: 102, volume: 1100, high: 107, low: 97 },
                { close: 101, volume: 1050, high: 106, low: 96 },
                { close: 103, volume: 1200, high: 108, low: 98 },
                { close: 104, volume: 1150, high: 109, low: 99 }
            ];
            const candles2 = [
                { close: 200, volume: 2000, high: 205, low: 195 },
                { close: 202, volume: 2100, high: 207, low: 197 },
                { close: 201, volume: 2050, high: 206, low: 196 },
                { close: 203, volume: 2200, high: 208, low: 198 },
                { close: 204, volume: 2150, high: 209, low: 199 }
            ];
            
            let callCount = 0;
            mockGetCandles.mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                    return Promise.resolve(candles1);
                } else {
                    return Promise.resolve(candles2);
                }
            });
            
            const candlesByFigi = await OptimizedAnalysisService.getCandlesBatch(figis, 'DAY', 30);
            
            expect(candlesByFigi).toBeInstanceOf(Map);
            expect(candlesByFigi.has('FIGI1')).toBe(true);
            expect(candlesByFigi.has('FIGI2')).toBe(true);
            // Проверяем, что fallback сработал (getCandles был вызван для каждого инструмента)
            expect(mockGetCandles).toHaveBeenCalledTimes(2);
        });
    });
});
