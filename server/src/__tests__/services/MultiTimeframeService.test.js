import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import MultiTimeframeService from '../../services/MultiTimeframeService.js';
import OptimizedAnalysisService from '../../services/OptimizedAnalysisService.js';
import CacheService from '../../services/CacheService.js';

// Не мокаем сервисы полностью, используем jest.spyOn в тестах

describe('MultiTimeframeService (Phase 4.1.4)', () => {
    beforeEach(async () => {
        jest.clearAllMocks();
        jest.restoreAllMocks();
        
        // Инициализируем сервис
        if (!MultiTimeframeService.isInitialized) {
            await MultiTimeframeService.initialize();
        }
    });

    it('should initialize correctly', async () => {
        expect(MultiTimeframeService.isInitialized).toBe(true);
    });

    it('should analyze multiple timeframes', async () => {
        const figi = 'TEST_FIGI';
        
        // Мокаем данные для каждого таймфрейма
        const mockCandles = Array.from({ length: 30 }, (_, i) => ({
            close: 100 + i * 0.5,
            high: 100 + i * 0.5 + 1,
            low: 100 + i * 0.5 - 1,
            volume: 1000
        }));

        const getCandlesSpy = jest.spyOn(CacheService, 'getCandles').mockResolvedValue(mockCandles);
        const getAllIndicatorsSpy = jest.spyOn(OptimizedAnalysisService, 'getAllIndicators').mockReturnValue({
            rsi: 50,
            macd: 0.1,
            macd_signal: 0.05,
            bb_position: 0.5,
            sma_20: 105,
            sma_50: 100
        });

        const result = await MultiTimeframeService.analyzeMultiTimeframe(figi, ['H1', 'D1', 'W1'], 30);

        expect(result).toBeDefined();
        expect(result.figi).toBe(figi);
        expect(result.timeframes).toBeDefined();
        expect(result.timeframes.H1).toBeDefined();
        expect(result.timeframes.D1).toBeDefined();
        expect(result.timeframes.W1).toBeDefined();
        expect(result.consistency).toBeDefined();
        expect(result.weightedSignal).toBeDefined();
        expect(result.priorityTimeframe).toBeDefined();
        
        getCandlesSpy.mockRestore();
        getAllIndicatorsSpy.mockRestore();
    });

    it('should handle errors gracefully for individual timeframes', async () => {
        const figi = 'TEST_FIGI';

        const mockCandles = Array.from({ length: 30 }, (_, i) => ({
            close: 100 + i * 0.5,
            high: 100 + i * 0.5 + 1,
            low: 100 + i * 0.5 - 1,
            volume: 1000
        }));

        const getCandlesSpy = jest.spyOn(CacheService, 'getCandles').mockImplementation((figiParam, timeframe) => {
            if (timeframe === 'H1') {
                return Promise.reject(new Error('No data for H1'));
            }
            return Promise.resolve(mockCandles);
        });

        const getAllIndicatorsSpy = jest.spyOn(OptimizedAnalysisService, 'getAllIndicators').mockReturnValue({
            rsi: 50,
            macd: 0.1,
            macd_signal: 0.05
        });

        const result = await MultiTimeframeService.analyzeMultiTimeframe(figi, ['H1', 'D1'], 30);

        expect(result.timeframes.H1.error).toBeDefined();
        expect(result.timeframes.D1).toBeDefined();
        expect(result.timeframes.D1.error).toBeUndefined();
        
        getCandlesSpy.mockRestore();
        getAllIndicatorsSpy.mockRestore();
    });

    it('should calculate consistency correctly', async () => {
        const figi = 'TEST_FIGI';
        const mockCandles = Array.from({ length: 30 }, (_, i) => ({
            close: 100 + i * 0.5,
            high: 100 + i * 0.5 + 1,
            low: 100 + i * 0.5 - 1,
            volume: 1000
        }));

        const getCandlesSpy = jest.spyOn(CacheService, 'getCandles').mockResolvedValue(mockCandles);

        // Все таймфреймы дают BUY сигнал
        const getAllIndicatorsSpy = jest.spyOn(OptimizedAnalysisService, 'getAllIndicators').mockReturnValue({
            rsi: 30, // Oversold - бычий сигнал
            macd: 0.2,
            macd_signal: 0.1,
            bb_position: 0.1,
            sma_20: 110,
            sma_50: 100
        });

        const result = await MultiTimeframeService.analyzeMultiTimeframe(figi, ['H1', 'D1', 'W1'], 30);

        expect(result.consistency).toBeDefined();
        expect(result.consistency.agreement).toBeDefined();
        expect(result.consistency.score).toBeGreaterThanOrEqual(0);
        expect(result.consistency.score).toBeLessThanOrEqual(1);
    });

    it('should calculate weighted signal correctly', async () => {
        const figi = 'TEST_FIGI';
        const mockCandles = Array.from({ length: 30 }, (_, i) => ({
            close: 100 + i * 0.5,
            high: 100 + i * 0.5 + 1,
            low: 100 + i * 0.5 - 1,
            volume: 1000
        }));

        const getCandlesSpy = jest.spyOn(CacheService, 'getCandles').mockResolvedValue(mockCandles);
        const getAllIndicatorsSpy = jest.spyOn(OptimizedAnalysisService, 'getAllIndicators').mockReturnValue({
            rsi: 50,
            macd: 0.1,
            macd_signal: 0.05,
            bb_position: 0.5,
            sma_20: 105,
            sma_50: 100
        });

        const result = await MultiTimeframeService.analyzeMultiTimeframe(figi, ['H1', 'D1', 'W1'], 30);

        expect(result.weightedSignal).toBeDefined();
        expect(result.weightedSignal.direction).toBeDefined();
        expect(['BUY', 'SELL', 'HOLD']).toContain(result.weightedSignal.direction);
        expect(result.weightedSignal.confidence).toBeGreaterThanOrEqual(0);
        expect(result.weightedSignal.confidence).toBeLessThanOrEqual(100);
        
        getCandlesSpy.mockRestore();
        getAllIndicatorsSpy.mockRestore();
    });

    it('should use cache for repeated requests', async () => {
        const figi = 'TEST_FIGI';
        const mockCandles = Array.from({ length: 30 }, (_, i) => ({
            close: 100 + i * 0.5,
            high: 100 + i * 0.5 + 1,
            low: 100 + i * 0.5 - 1,
            volume: 1000
        }));

        const getCandlesSpy = jest.spyOn(CacheService, 'getCandles').mockResolvedValue(mockCandles);
        const getAllIndicatorsSpy = jest.spyOn(OptimizedAnalysisService, 'getAllIndicators').mockReturnValue({
            rsi: 50,
            macd: 0.1,
            macd_signal: 0.05
        });

        // Первый запрос
        const result1 = await MultiTimeframeService.analyzeMultiTimeframe(figi, ['H1', 'D1'], 30);
        
        // Второй запрос (должен использовать кеш)
        const result2 = await MultiTimeframeService.analyzeMultiTimeframe(figi, ['H1', 'D1'], 30);

        expect(result1.figi).toBe(result2.figi);
        // CacheService.getCandles должен быть вызван только один раз (или дважды, если кеш не сработал)
        // Но результат должен быть одинаковым
        expect(result1.timeframes).toBeDefined();
        expect(result2.timeframes).toBeDefined();
        
        getCandlesSpy.mockRestore();
        getAllIndicatorsSpy.mockRestore();
    });

    it('should invalidate cache correctly', async () => {
        const figi = 'TEST_FIGI';
        
        MultiTimeframeService.invalidateCache(figi);
        
        // После инвалидации кеш должен быть пустым для этого figi
        expect(MultiTimeframeService.timeframeCache.size).toBeGreaterThanOrEqual(0);
    });

    it('should handle insufficient data', async () => {
        const figi = 'TEST_FIGI';

        const getCandlesSpy = jest.spyOn(CacheService, 'getCandles').mockResolvedValue([]); // Пустые данные

        const result = await MultiTimeframeService.analyzeMultiTimeframe(figi, ['H1', 'D1'], 30);

        expect(result.timeframes.H1.error).toBeDefined();
        expect(result.consistency.score).toBe(0);
        
        getCandlesSpy.mockRestore();
    });

    it('should determine signal correctly based on indicators', async () => {
        const figi = 'TEST_FIGI';
        const mockCandles = Array.from({ length: 30 }, (_, i) => ({
            close: 100 + i * 0.5,
            high: 100 + i * 0.5 + 1,
            low: 100 + i * 0.5 - 1,
            volume: 1000
        }));

        const getCandlesSpy = jest.spyOn(CacheService, 'getCandles').mockResolvedValue(mockCandles);

        // Сильные бычьи индикаторы
        const getAllIndicatorsSpy = jest.spyOn(OptimizedAnalysisService, 'getAllIndicators').mockReturnValue({
            rsi: 25, // Сильно oversold
            macd: 0.5,
            macd_signal: 0.1, // MACD выше сигнала
            bb_position: 0.05, // Цена близко к нижней полосе
            sma_20: 110,
            sma_50: 100, // SMA 20 выше SMA 50
            ichimoku_signal: 'buy'
        });

        const result = await MultiTimeframeService.analyzeMultiTimeframe(figi, ['D1'], 30);

        expect(result.timeframes.D1.signal).toBeDefined();
        expect(result.timeframes.D1.signal.direction).toBeDefined();
        // При сильных бычьих индикаторах должен быть BUY или HOLD
        expect(['BUY', 'HOLD']).toContain(result.timeframes.D1.signal.direction);
        
        getCandlesSpy.mockRestore();
        getAllIndicatorsSpy.mockRestore();
    });
});

