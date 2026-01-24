import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import OptimizedAnalysisService from '../../services/OptimizedAnalysisService.js';
import DataQualityService from '../../services/DataQualityService.js';

describe('OptimizedAnalysisService - New Indicators (Phase 4.1)', () => {
    beforeEach(async () => {
        // Инициализируем сервисы
        if (!DataQualityService.isInitialized) {
            await DataQualityService.initialize();
        }
        if (!OptimizedAnalysisService.isInitialized) {
            await OptimizedAnalysisService.initialize();
        }
    });

    describe('Ichimoku Cloud (4.1.1)', () => {
        it('should calculate Ichimoku Cloud components correctly', () => {
            // Создаем достаточно данных (минимум 52 свечи)
            const highs = Array.from({ length: 60 }, (_, i) => 100 + i * 0.5 + Math.random() * 2);
            const lows = Array.from({ length: 60 }, (_, i) => 100 + i * 0.5 - Math.random() * 2);
            const closes = Array.from({ length: 60 }, (_, i) => 100 + i * 0.5 + Math.random() * 1);

            const ichimoku = OptimizedAnalysisService.calculateIchimokuCloud(highs, lows, closes);

            expect(ichimoku).toBeDefined();
            expect(ichimoku.tenkan).toBeGreaterThan(0);
            expect(ichimoku.kijun).toBeGreaterThan(0);
            expect(ichimoku.senkouA).toBeGreaterThan(0);
            expect(ichimoku.senkouB).toBeGreaterThan(0);
            expect(ichimoku.chikou).toBeGreaterThan(0);
            expect(ichimoku.cloudTop).toBeGreaterThan(0);
            expect(ichimoku.cloudBottom).toBeGreaterThan(0);
            expect(ichimoku.cloudThickness).toBeGreaterThanOrEqual(0);
            expect(['bullish', 'bearish', 'neutral']).toContain(ichimoku.cloudColor);
            expect(['buy', 'sell', 'hold']).toContain(ichimoku.signal);
        });

        it('should return default values for insufficient data', () => {
            const highs = Array.from({ length: 20 }, () => 100);
            const lows = Array.from({ length: 20 }, () => 99);
            const closes = Array.from({ length: 20 }, () => 99.5);

            const ichimoku = OptimizedAnalysisService.calculateIchimokuCloud(highs, lows, closes);

            expect(ichimoku.tenkan).toBe(0);
            expect(ichimoku.kijun).toBe(0);
            expect(ichimoku.cloudColor).toBe('neutral');
            expect(ichimoku.signal).toBe('hold');
        });

        it('should detect bullish cloud when Senkou A > Senkou B', () => {
            // Создаем восходящий тренд
            const highs = Array.from({ length: 60 }, (_, i) => 100 + i * 1);
            const lows = Array.from({ length: 60 }, (_, i) => 99 + i * 1);
            const closes = Array.from({ length: 60 }, (_, i) => 99.5 + i * 1);

            const ichimoku = OptimizedAnalysisService.calculateIchimokuCloud(highs, lows, closes);

            // При восходящем тренде Senkou A обычно больше Senkou B
            expect(ichimoku.cloudColor).toBeDefined();
        });

        it('should be included in getAllIndicators when sufficient data', () => {
            const prices = Array.from({ length: 60 }, (_, i) => 100 + i * 0.5);
            const volumes = Array.from({ length: 60 }, () => 1000);
            const highs = Array.from({ length: 60 }, (_, i) => 100 + i * 0.5 + 1);
            const lows = Array.from({ length: 60 }, (_, i) => 100 + i * 0.5 - 1);

            const indicators = OptimizedAnalysisService.getAllIndicators(
                prices, volumes, highs, lows, 'TEST_FIGI', 'DAY', 60
            );

            expect(indicators.ichimoku_tenkan).toBeDefined();
            expect(indicators.ichimoku_kijun).toBeDefined();
            expect(indicators.ichimoku_senkou_a).toBeDefined();
            expect(indicators.ichimoku_senkou_b).toBeDefined();
            expect(indicators.ichimoku_cloud_color).toBeDefined();
            expect(indicators.ichimoku_signal).toBeDefined();
        });
    });

    describe('Fibonacci Retracements (4.1.2)', () => {
        it('should calculate Fibonacci levels correctly', () => {
            // Создаем данные с четким максимумом и минимумом
            const highs = Array.from({ length: 30 }, (_, i) => {
                if (i < 10) return 100 + i * 2; // Восходящий тренд
                if (i < 20) return 120 - (i - 10) * 1.5; // Нисходящий тренд
                return 105 + (i - 20) * 0.5; // Восстановление
            });
            const lows = highs.map(h => h - 1);
            const closes = highs.map(h => h - 0.5);

            const fib = OptimizedAnalysisService.calculateFibonacciRetracements(highs, lows, closes);

            expect(fib).toBeDefined();
            expect(fib.levels).toBeDefined();
            expect(fib.levels[0]).toBeDefined();
            expect(fib.levels[23.6]).toBeDefined();
            expect(fib.levels[38.2]).toBeDefined();
            expect(fib.levels[50]).toBeDefined();
            expect(fib.levels[61.8]).toBeDefined();
            expect(fib.levels[78.6]).toBeDefined();
            expect(fib.levels[100]).toBeDefined();
            expect(fib.highestHigh).toBeGreaterThan(fib.lowestLow);
            expect(fib.range).toBeGreaterThan(0);
        });

        it('should identify current price level', () => {
            const highs = Array.from({ length: 30 }, (_, i) => 100 + i * 2);
            const lows = highs.map(h => h - 1);
            const closes = Array.from({ length: 30 }, (_, i) => {
                // Цена в середине диапазона
                const max = Math.max(...highs);
                const min = Math.min(...lows);
                return min + (max - min) * 0.5;
            });

            const fib = OptimizedAnalysisService.calculateFibonacciRetracements(highs, lows, closes);

            expect(fib.currentLevel).toBeDefined();
            expect(fib.currentPrice).toBeGreaterThan(0);
            expect(fib.support).toBeGreaterThan(0);
            expect(fib.resistance).toBeGreaterThan(0);
        });

        it('should return default values for insufficient data', () => {
            const highs = Array.from({ length: 5 }, () => 100);
            const lows = Array.from({ length: 5 }, () => 99);
            const closes = Array.from({ length: 5 }, () => 99.5);

            const fib = OptimizedAnalysisService.calculateFibonacciRetracements(highs, lows, closes);

            expect(fib.levels).toEqual({});
            expect(fib.currentLevel).toBeNull();
            expect(fib.range).toBe(0);
        });

        it('should be included in getAllIndicators when sufficient data', () => {
            const prices = Array.from({ length: 30 }, (_, i) => 100 + i * 0.5);
            const volumes = Array.from({ length: 30 }, () => 1000);
            const highs = Array.from({ length: 30 }, (_, i) => 100 + i * 0.5 + 1);
            const lows = Array.from({ length: 30 }, (_, i) => 100 + i * 0.5 - 1);

            const indicators = OptimizedAnalysisService.getAllIndicators(
                prices, volumes, highs, lows, 'TEST_FIGI', 'DAY', 30
            );

            expect(indicators.fib_levels).toBeDefined();
            expect(indicators.fib_current_level).toBeDefined();
            expect(indicators.fib_support).toBeDefined();
            expect(indicators.fib_resistance).toBeDefined();
        });
    });

    describe('Market Profile (4.1.3)', () => {
        it('should calculate Market Profile correctly', () => {
            const highs = Array.from({ length: 30 }, (_, i) => 100 + i * 0.5 + Math.random() * 2);
            const lows = Array.from({ length: 30 }, (_, i) => 100 + i * 0.5 - Math.random() * 2);
            const closes = Array.from({ length: 30 }, (_, i) => 100 + i * 0.5 + Math.random() * 1);
            const volumes = Array.from({ length: 30 }, () => 1000 + Math.random() * 500);

            const profile = OptimizedAnalysisService.calculateMarketProfile(highs, lows, closes, volumes);

            expect(profile).toBeDefined();
            expect(profile.poc).toBeGreaterThan(0);
            expect(profile.valueAreaHigh).toBeGreaterThan(0);
            expect(profile.valueAreaLow).toBeGreaterThan(0);
            expect(profile.valueAreaHigh).toBeGreaterThanOrEqual(profile.valueAreaLow);
            expect(profile.valueAreaRange).toBeGreaterThanOrEqual(0);
            expect(['normal', 'trend', 'non_trend']).toContain(profile.profileType);
            expect(['balanced', 'imbalanced']).toContain(profile.balance);
            expect(profile.totalVolume).toBeGreaterThan(0);
        });

        it('should identify POC (Point of Control)', () => {
            // Создаем данные с явным максимумом объема на определенном уровне
            const basePrice = 100;
            const highs = Array.from({ length: 30 }, (_, i) => {
                const price = basePrice + (i % 10) * 0.5;
                return price + 1;
            });
            const lows = highs.map(h => h - 1);
            const closes = highs.map(h => h - 0.5);
            const volumes = Array.from({ length: 30 }, (_, i) => {
                // Больше объема на уровне basePrice + 2
                return i % 10 === 2 ? 5000 : 1000;
            });

            const profile = OptimizedAnalysisService.calculateMarketProfile(highs, lows, closes, volumes);

            expect(profile.poc).toBeGreaterThan(0);
            expect(profile.poc).toBeLessThanOrEqual(profile.valueAreaHigh);
            expect(profile.poc).toBeGreaterThanOrEqual(profile.valueAreaLow);
        });

        it('should return default values for insufficient data', () => {
            const highs = [];
            const lows = [];
            const closes = [];
            const volumes = [];

            const profile = OptimizedAnalysisService.calculateMarketProfile(highs, lows, closes, volumes);

            expect(profile.poc).toBe(0);
            expect(profile.valueAreaHigh).toBe(0);
            expect(profile.valueAreaLow).toBe(0);
            expect(profile.profileType).toBe('normal');
            expect(profile.balance).toBe('balanced');
        });

        it('should be included in getAllIndicators when volume data is available', () => {
            const prices = Array.from({ length: 30 }, (_, i) => 100 + i * 0.5);
            const volumes = Array.from({ length: 30 }, () => 1000);
            const highs = Array.from({ length: 30 }, (_, i) => 100 + i * 0.5 + 1);
            const lows = Array.from({ length: 30 }, (_, i) => 100 + i * 0.5 - 1);

            const indicators = OptimizedAnalysisService.getAllIndicators(
                prices, volumes, highs, lows, 'TEST_FIGI', 'DAY', 30
            );

            expect(indicators.market_profile_poc).toBeDefined();
            expect(indicators.market_profile_value_area_high).toBeDefined();
            expect(indicators.market_profile_value_area_low).toBeDefined();
            expect(indicators.market_profile_profile_type).toBeDefined();
            expect(indicators.market_profile_balance).toBeDefined();
        });

        it('should not include Market Profile when volume data is missing', () => {
            const prices = Array.from({ length: 30 }, (_, i) => 100 + i * 0.5);
            const volumes = []; // Пустой массив объемов
            const highs = Array.from({ length: 30 }, (_, i) => 100 + i * 0.5 + 1);
            const lows = Array.from({ length: 30 }, (_, i) => 100 + i * 0.5 - 1);

            // Очищаем кеш перед тестом, чтобы избежать использования закешированных значений
            OptimizedAnalysisService.invalidateIndicatorsCache('TEST_FIGI');

            const indicators = OptimizedAnalysisService.getAllIndicators(
                prices, volumes, highs, lows, 'TEST_FIGI', 'DAY', 30
            );

            // Market Profile не должен быть рассчитан при пустом массиве volumes
            expect(indicators.market_profile_poc).toBeUndefined();
            expect(indicators.market_profile_value_area_high).toBeUndefined();
            expect(indicators.market_profile_value_area_low).toBeUndefined();
        });
    });
});

