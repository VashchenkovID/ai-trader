import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Мокируем зависимости ДО импорта тестируемого модуля
jest.mock('../../services/CacheService.js', () => ({
    __esModule: true,
    default: {
        initialize: jest.fn(),
        getCandles: jest.fn(),
        getAllInstruments: jest.fn()
    }
}));

jest.mock('../../services/OptimizedAnalysisService.js', () => ({
    __esModule: true,
    default: {
        isInitialized: true,
        getAllIndicators: jest.fn()
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
import MarketRegimeService from '../../services/MarketRegimeService.js';
import CacheService from '../../services/CacheService.js';
import OptimizedAnalysisService from '../../services/OptimizedAnalysisService.js';

describe('MarketRegimeService - Фаза 3, задача 3.3: Учет рыночных режимов', () => {
    beforeEach(async () => {
        jest.clearAllMocks();
        MarketRegimeService.regimeCache.clear();
        
        // Настраиваем моки - убеждаемся, что они являются jest.fn()
        if (!jest.isMockFunction(CacheService.getCandles)) {
            CacheService.getCandles = jest.fn();
        }
        if (!jest.isMockFunction(OptimizedAnalysisService.getAllIndicators)) {
            OptimizedAnalysisService.getAllIndicators = jest.fn();
        }
        
        // Инициализируем сервис
        if (!MarketRegimeService.isInitialized) {
            await MarketRegimeService.initialize();
        }
    });

    describe('3.3.1. Классификация режимов и адаптивные пороги', () => {
        it('should detect trend regime', async () => {
            const figi = 'TEST_FIGI';
            const candles = Array.from({ length: 30 }, (_, i) => ({
                close: 100 + i * 2, // Восходящий тренд
                volume: 1000,
                high: 105 + i * 2,
                low: 95 + i * 2
            }));

            CacheService.getCandles.mockResolvedValue(candles);
            OptimizedAnalysisService.getAllIndicators.mockReturnValue({
                sma_20: 120,
                sma_50: 110,
                rsi: 65,
                macd: 0.001,
                bb_position: 0.6,
                atr: 2,
                volatility: 0.01
            });

            const regime = await MarketRegimeService.detectRegime(figi);

            expect(regime).toBeDefined();
            expect(regime.regime).toBe('trend');
            expect(regime.trendDirection).toBe('up');
            expect(regime.confidence).toBeGreaterThan(0);
            expect(regime.thresholds).toBeDefined();
            expect(regime.thresholds.buyScore).toBeLessThan(0.65); // Сниженный порог в тренде
        });

        it('should detect flat regime', async () => {
            const figi = 'TEST_FIGI';
            const candles = Array.from({ length: 30 }, (_, i) => ({
                close: 100 + Math.sin(i * 0.1) * 0.5, // Боковое движение
                volume: 1000,
                high: 101,
                low: 99
            }));

            CacheService.getCandles.mockResolvedValue(candles);
            OptimizedAnalysisService.getAllIndicators.mockReturnValue({
                sma_20: 100,
                sma_50: 100,
                rsi: 50,
                macd: 0,
                bb_position: 0.5,
                atr: 0.5,
                volatility: 0.003 // Низкая волатильность
            });

            const regime = await MarketRegimeService.detectRegime(figi);

            expect(regime.regime).toBe('flat');
            expect(regime.trendDirection).toBe('none');
            expect(regime.thresholds.buyScore).toBeGreaterThan(0.65); // Повышенный порог во флэте
        });

        it('should detect volatile regime', async () => {
            const figi = 'TEST_FIGI';
            const candles = Array.from({ length: 30 }, (_, i) => ({
                close: 100 + (Math.random() - 0.5) * 10, // Высокая волатильность
                volume: 1000,
                high: 110,
                low: 90
            }));

            CacheService.getCandles.mockResolvedValue(candles);
            OptimizedAnalysisService.getAllIndicators.mockReturnValue({
                sma_20: 100,
                sma_50: 100,
                rsi: 55,
                macd: 0,
                bb_position: 0.5,
                atr: 5,
                volatility: 0.03 // Высокая волатильность (> 2%)
            });

            const regime = await MarketRegimeService.detectRegime(figi);

            expect(regime.regime).toBe('volatile');
            expect(regime.volatility).toBeGreaterThan(0.02);
            expect(regime.thresholds.buyScore).toBeGreaterThan(0.70); // Значительно повышенный порог
        });

        it('should return adaptive thresholds for regime', () => {
            const trendThresholds = MarketRegimeService.getAdaptiveThresholds('trend');
            expect(trendThresholds.buyScore).toBe(0.60);
            expect(trendThresholds.buyConfidence).toBe(0.55);

            const flatThresholds = MarketRegimeService.getAdaptiveThresholds('flat');
            expect(flatThresholds.buyScore).toBe(0.70);
            expect(flatThresholds.buyConfidence).toBe(0.65);

            const volatileThresholds = MarketRegimeService.getAdaptiveThresholds('volatile');
            expect(volatileThresholds.buyScore).toBe(0.75);
            expect(volatileThresholds.buyConfidence).toBe(0.70);
        });

        it('should use cache for repeated requests', async () => {
            const figi = 'TEST_FIGI';
            const candles = Array.from({ length: 30 }, (_, i) => ({
                close: 100 + i,
                volume: 1000,
                high: 105,
                low: 95
            }));

            CacheService.getCandles.mockResolvedValue(candles);
            OptimizedAnalysisService.getAllIndicators.mockReturnValue({
                sma_20: 115,
                sma_50: 110,
                volatility: 0.01
            });

            const regime1 = await MarketRegimeService.detectRegime(figi);
            const regime2 = await MarketRegimeService.detectRegime(figi);

            expect(regime1).toEqual(regime2);
            // Второй вызов должен использовать кэш, поэтому getCandles вызывается только один раз
            expect(CacheService.getCandles).toHaveBeenCalledTimes(1);
        });
    });

    describe('3.3.2. Разные стратегии для разных режимов', () => {
        it('should return preferred strategies for trend regime', () => {
            const strategies = MarketRegimeService.getRegimeStrategies('trend');
            
            expect(strategies.preferredStrategies).toContain('momentum');
            expect(strategies.preferredStrategies).toContain('trend_following');
            expect(strategies.avoidStrategies).toContain('mean_reversion');
            expect(strategies.positionSizeMultiplier).toBe(1.1);
            expect(strategies.stopLossMultiplier).toBe(1.2);
        });

        it('should return preferred strategies for flat regime', () => {
            const strategies = MarketRegimeService.getRegimeStrategies('flat');
            
            expect(strategies.preferredStrategies).toContain('mean_reversion');
            expect(strategies.preferredStrategies).toContain('range_trading');
            expect(strategies.avoidStrategies).toContain('momentum');
            expect(strategies.positionSizeMultiplier).toBe(0.9);
            expect(strategies.stopLossMultiplier).toBe(0.8);
        });

        it('should return preferred strategies for volatile regime', () => {
            const strategies = MarketRegimeService.getRegimeStrategies('volatile');
            
            expect(strategies.preferredStrategies).toContain('conservative');
            expect(strategies.preferredStrategies).toContain('risk_management');
            expect(strategies.avoidStrategies).toContain('aggressive');
            expect(strategies.positionSizeMultiplier).toBe(0.7);
            expect(strategies.stopLossMultiplier).toBe(1.5);
        });

        it('should return position adjustments for regime', () => {
            const trendAdjustments = MarketRegimeService.getPositionAdjustments('trend');
            expect(trendAdjustments.positionSizeMultiplier).toBe(1.1);
            expect(trendAdjustments.stopLossMultiplier).toBe(1.2);

            const volatileAdjustments = MarketRegimeService.getPositionAdjustments('volatile');
            expect(volatileAdjustments.positionSizeMultiplier).toBe(0.7);
            expect(volatileAdjustments.stopLossMultiplier).toBe(1.5);
        });
    });

    describe('3.3.3. Учет макроэкономических циклов', () => {
        it('should account for seasonality in regime detection', async () => {
            const figi = 'TEST_FIGI';
            const candles = Array.from({ length: 30 }, (_, i) => ({
                close: 100 + i,
                volume: 1000,
                high: 105,
                low: 95
            }));

            CacheService.getCandles.mockResolvedValue(candles);
            OptimizedAnalysisService.getAllIndicators.mockReturnValue({
                sma_20: 115,
                sma_50: 110,
                volatility: 0.01
            });

            const regime = await MarketRegimeService.detectRegime(figi);

            expect(regime.seasonality).toBeDefined();
            expect(regime.seasonality).toHaveProperty('volatilityAdjustment');
            expect(regime.seasonality).toHaveProperty('confidenceAdjustment');
            expect(regime.seasonality).toHaveProperty('factors');
            expect(regime.seasonality).toHaveProperty('month');
            expect(regime.seasonality).toHaveProperty('dayOfWeek');
        });

        it('should adjust for high volatility months', async () => {
            // Мокируем сентябрь (месяц 9)
            const originalDate = Date;
            const mockDate = new originalDate('2024-09-15');
            global.Date = jest.fn(() => mockDate);
            global.Date.now = originalDate.now;
            global.Date.prototype = originalDate.prototype;

            const figi = 'TEST_FIGI';
            const candles = Array.from({ length: 30 }, (_, i) => ({
                close: 100 + i,
                volume: 1000,
                high: 105,
                low: 95
            }));

            CacheService.getCandles.mockResolvedValue(candles);
            OptimizedAnalysisService.getAllIndicators.mockReturnValue({
                sma_20: 115,
                sma_50: 110,
                volatility: 0.01
            });

            const regime = await MarketRegimeService.detectRegime(figi);

            expect(regime.seasonality.volatilityAdjustment).toBeGreaterThan(1.0);
            expect(regime.seasonality.factors.some(f => f.includes('High volatility month'))).toBe(true);

            // Восстанавливаем Date
            global.Date = originalDate;
        });

        it('should account for Friday effect', async () => {
            // Мокируем пятницу
            const originalDate = Date;
            const fridayDate = new originalDate('2024-09-13'); // Пятница
            global.Date = jest.fn(() => fridayDate);
            global.Date.now = originalDate.now;
            global.Date.prototype = originalDate.prototype;

            const figi = 'TEST_FIGI';
            const candles = Array.from({ length: 30 }, (_, i) => ({
                close: 100 + i,
                volume: 1000,
                high: 105,
                low: 95
            }));

            CacheService.getCandles.mockResolvedValue(candles);
            OptimizedAnalysisService.getAllIndicators.mockReturnValue({
                sma_20: 115,
                sma_50: 110,
                volatility: 0.01
            });

            const regime = await MarketRegimeService.detectRegime(figi);

            expect(regime.seasonality.confidenceAdjustment).toBeLessThan(1.0);
            expect(regime.seasonality.factors.some(f => f.includes('Friday'))).toBe(true);

            // Восстанавливаем Date
            global.Date = originalDate;
        });
    });

    describe('Batch operations', () => {
        it('should detect regimes for multiple instruments', async () => {
            const figis = ['FIGI1', 'FIGI2', 'FIGI3'];
            const candles = Array.from({ length: 30 }, (_, i) => ({
                close: 100 + i,
                volume: 1000,
                high: 105,
                low: 95
            }));

            CacheService.getCandles.mockResolvedValue(candles);
            OptimizedAnalysisService.getAllIndicators.mockReturnValue({
                sma_20: 115,
                sma_50: 110,
                volatility: 0.01
            });

            const regimes = await MarketRegimeService.detectRegimesBatch(figis);

            expect(regimes).toBeInstanceOf(Map);
            expect(regimes.size).toBe(3);
            expect(regimes.has('FIGI1')).toBe(true);
            expect(regimes.has('FIGI2')).toBe(true);
            expect(regimes.has('FIGI3')).toBe(true);
        });

        it('should handle errors in batch gracefully', async () => {
            const figis = ['FIGI1', 'FIGI2'];
            
            // Очищаем кэш перед тестом
            MarketRegimeService.regimeCache.clear();
            
            CacheService.getCandles.mockImplementation((figi) => {
                if (figi === 'FIGI1') {
                    return Promise.resolve(Array.from({ length: 30 }, (_, i) => ({
                        close: 100 + i,
                        volume: 1000,
                        high: 105,
                        low: 95
                    })));
                } else {
                    return Promise.reject(new Error('Database error'));
                }
            });
            
            OptimizedAnalysisService.getAllIndicators.mockReturnValue({
                sma_20: 115,
                sma_50: 110,
                volatility: 0.01
            });

            const regimes = await MarketRegimeService.detectRegimesBatch(figis);

            expect(regimes.size).toBe(1);
            expect(regimes.has('FIGI1')).toBe(true);
            expect(regimes.has('FIGI2')).toBe(false);
        });
    });

    describe('Cache management', () => {
        it('should invalidate cache for specific instrument', () => {
            MarketRegimeService.regimeCache.set('FIGI1', { regime: { regime: 'trend' }, timestamp: Date.now() });
            MarketRegimeService.regimeCache.set('FIGI2', { regime: { regime: 'flat' }, timestamp: Date.now() });

            expect(MarketRegimeService.regimeCache.has('FIGI1')).toBe(true);
            expect(MarketRegimeService.regimeCache.has('FIGI2')).toBe(true);

            MarketRegimeService.invalidateCache('FIGI1');

            expect(MarketRegimeService.regimeCache.has('FIGI1')).toBe(false);
            expect(MarketRegimeService.regimeCache.has('FIGI2')).toBe(true);
        });

        it('should clear all cache when no figi provided', () => {
            MarketRegimeService.regimeCache.set('FIGI1', { regime: { regime: 'trend' }, timestamp: Date.now() });
            MarketRegimeService.regimeCache.set('FIGI2', { regime: { regime: 'flat' }, timestamp: Date.now() });

            MarketRegimeService.invalidateCache();

            expect(MarketRegimeService.regimeCache.size).toBe(0);
        });
    });

    describe('Edge cases', () => {
        it('should handle insufficient data', async () => {
            const figi = 'TEST_FIGI';
            const candles = Array.from({ length: 5 }, (_, i) => ({
                close: 100 + i,
                volume: 1000,
                high: 105,
                low: 95
            }));

            CacheService.getCandles.mockResolvedValue(candles);

            const regime = await MarketRegimeService.detectRegime(figi);

            expect(regime.regime).toBe('normal');
            expect(regime.reason).toBe('Insufficient data');
        });

        it('should handle empty candles array', async () => {
            const figi = 'TEST_FIGI';
            CacheService.getCandles.mockResolvedValue([]);

            const regime = await MarketRegimeService.detectRegime(figi);

            expect(regime.regime).toBe('normal');
            expect(regime.reason).toBe('Insufficient data');
        });

        it('should handle errors gracefully', async () => {
            const figi = 'TEST_FIGI';
            CacheService.getCandles.mockRejectedValue(new Error('Database error'));

            const regime = await MarketRegimeService.detectRegime(figi);

            expect(regime.regime).toBe('normal');
            expect(regime.reason).toContain('Error');
        });
    });
});

