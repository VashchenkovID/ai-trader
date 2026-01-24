import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Мокируем зависимости
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

describe('OptimizedAnalysisService - Фаза 3, задача 3.2: Прозрачность решений (Explainability)', () => {
    beforeEach(() => {
        OptimizedAnalysisService.isInitialized = true;
    });

    describe('3.2.1. Интеграция SHAP-like подхода для расчета feature importance', () => {
        it('should calculate feature importance with SHAP-like approach', async () => {
            const features = [0.5, 0.7, 0.3, 0.9, 0.1];
            const prediction = 0.75;

            const importance = await OptimizedAnalysisService.analyzeFeatureImportance(features, prediction);

            expect(importance).toBeInstanceOf(Array);
            expect(importance.length).toBeGreaterThan(0);
            expect(importance.length).toBeLessThanOrEqual(10);
            
            // Проверяем структуру результата
            importance.forEach(item => {
                expect(item).toHaveProperty('index');
                expect(item).toHaveProperty('name');
                expect(item).toHaveProperty('value');
                expect(item).toHaveProperty('importance');
                expect(item).toHaveProperty('explanation');
                expect(item).toHaveProperty('normalizedValue');
                expect(item).toHaveProperty('deviation');
                expect(item).toHaveProperty('marginalContribution');
            });

            // Проверяем, что важность отсортирована
            for (let i = 1; i < importance.length; i++) {
                expect(importance[i].importance).toBeLessThanOrEqual(importance[i - 1].importance);
            }
        });

        it('should normalize importance to percentages', async () => {
            const features = [0.5, 0.7, 0.3, 0.9, 0.1];
            const prediction = 0.75;

            const importance = await OptimizedAnalysisService.analyzeFeatureImportance(features, prediction);

            if (importance.length > 0) {
                const totalPercent = importance.reduce((sum, item) => sum + (item.importancePercent || 0), 0);
                // Сумма процентов должна быть близка к 100 (с учетом округления)
                expect(totalPercent).toBeGreaterThan(90);
                expect(totalPercent).toBeLessThanOrEqual(100);
            }
        });

        it('should handle empty features array', async () => {
            const importance = await OptimizedAnalysisService.analyzeFeatureImportance([]);
            expect(importance).toEqual([]);
        });

        it('should use baseline features when provided', async () => {
            const features = [0.5, 0.7, 0.3];
            const baseline = [0.4, 0.6, 0.2];
            const prediction = 0.75;

            const importance = await OptimizedAnalysisService.analyzeFeatureImportance(features, prediction, baseline);

            expect(importance).toBeInstanceOf(Array);
            importance.forEach(item => {
                expect(item.deviation).toBeGreaterThanOrEqual(0);
            });
        });

        it('should assign weights to different indicators', async () => {
            const features = new Array(21).fill(0.5);
            const prediction = 0.75;

            const importance = await OptimizedAnalysisService.analyzeFeatureImportance(features, prediction);

            // RSI должен иметь больший вес, чем Volume_SMA
            const rsiItem = importance.find(item => item.name === 'RSI');
            const volumeItem = importance.find(item => item.name === 'Volume_SMA');

            if (rsiItem && volumeItem) {
                // RSI должен иметь больший вес (1.5 vs 0.9)
                expect(rsiItem.importance).toBeGreaterThan(volumeItem.importance);
            }
        });
    });

    describe('3.2.2. Детальные объяснения рекомендаций', () => {
        it('should explain RSI impact on recommendation', () => {
            const features = [0.5, 0.7, 0.3];
            const prediction = 0.75; // BUY
            const indicators = {
                rsi: 75, // Перекупленность
                macd: 0.001,
                bb_position: 0.5
            };

            const reasoning = OptimizedAnalysisService.generateReasoning(features, prediction, indicators);

            expect(reasoning).toHaveProperty('base');
            expect(reasoning).toHaveProperty('confidence');
            expect(reasoning).toHaveProperty('direction');
            expect(reasoning).toHaveProperty('factors');
            expect(reasoning).toHaveProperty('summary');

            // Проверяем, что RSI объяснен
            const rsiFactor = reasoning.factors.find(f => f.indicator === 'RSI');
            expect(rsiFactor).toBeDefined();
            expect(rsiFactor.value).toBe(75);
            expect(rsiFactor.explanation).toContain('перекупленности');
            expect(rsiFactor.impact).toBe('negative'); // RSI 75 противоречит BUY
        });

        it('should explain MACD confirmation', () => {
            const features = [0.5, 0.7, 0.3];
            const prediction = 0.75; // BUY
            const indicators = {
                rsi: 55,
                macd: 0.002,
                macd_signal: 0.001,
                macd_histogram: 0.001
            };

            const reasoning = OptimizedAnalysisService.generateReasoning(features, prediction, indicators);

            const macdFactor = reasoning.factors.find(f => f.indicator === 'MACD');
            expect(macdFactor).toBeDefined();
            expect(macdFactor.explanation).toContain('MACD');
            expect(macdFactor.impact).toBe('high'); // MACD выше сигнала подтверждает BUY
        });

        it('should explain Bollinger Bands position', () => {
            const features = [0.5, 0.7, 0.3];
            const prediction = 0.25; // SELL
            const indicators = {
                rsi: 55,
                macd: -0.001,
                bb_position: 0.85, // Верхняя часть
                bb_width: 0.05
            };

            const reasoning = OptimizedAnalysisService.generateReasoning(features, prediction, indicators);

            const bbFactor = reasoning.factors.find(f => f.indicator === 'Bollinger Bands');
            expect(bbFactor).toBeDefined();
            expect(bbFactor.position).toBe(0.85);
            expect(bbFactor.explanation).toContain('верхней части');
            expect(bbFactor.impact).toBe('high'); // BB в верхней части подтверждает SELL
        });

        it('should explain trend indicators', () => {
            const features = [0.5, 0.7, 0.3];
            const prediction = 0.75; // BUY
            const indicators = {
                rsi: 55,
                macd: 0.001,
                sma_20: 100,
                sma_50: 95
            };

            const reasoning = OptimizedAnalysisService.generateReasoning(features, prediction, indicators);

            const trendFactor = reasoning.factors.find(f => f.indicator === 'Trend');
            expect(trendFactor).toBeDefined();
            expect(trendFactor.sma20).toBe(100);
            expect(trendFactor.sma50).toBe(95);
            expect(trendFactor.explanation).toContain('восходящий тренд');
            expect(trendFactor.impact).toBe('high'); // Восходящий тренд подтверждает BUY
        });

        it('should generate summary with confirming and contradicting factors', () => {
            const features = [0.5, 0.7, 0.3];
            const prediction = 0.75; // BUY
            const indicators = {
                rsi: 75, // Противоречит (перекупленность)
                macd: 0.002, // Подтверждает (MACD > signal)
                macd_signal: 0.001,
                sma_20: 100, // Подтверждает (восходящий тренд)
                sma_50: 95,
                bb_position: 0.85 // Противоречит (верхняя часть)
            };

            const reasoning = OptimizedAnalysisService.generateReasoning(features, prediction, indicators);

            expect(reasoning.summary).toBeDefined();
            expect(reasoning.summary).toContain('покупка');
            expect(reasoning.summary).toContain('подтверждают');
            expect(reasoning.summary).toContain('противоречат');
        });
    });

    describe('3.2.3. Улучшенный generateReasoning()', () => {
        it('should return detailed reasoning object', () => {
            const features = [0.5, 0.7, 0.3];
            const prediction = 0.75;

            const reasoning = OptimizedAnalysisService.generateReasoning(features, prediction);

            expect(reasoning).toHaveProperty('base');
            expect(reasoning).toHaveProperty('confidence');
            expect(reasoning).toHaveProperty('direction');
            expect(reasoning).toHaveProperty('prediction');
            expect(reasoning).toHaveProperty('factors');
            expect(reasoning).toHaveProperty('summary');
            expect(reasoning.direction).toBe('BUY');
            expect(reasoning.confidence).toBeGreaterThan(0);
        });

        it('should include specific values and thresholds in explanations', () => {
            const features = [0.5, 0.7, 0.3];
            const prediction = 0.75;
            const indicators = {
                rsi: 72.5,
                macd: 0.0015,
                macd_signal: 0.001,
                bb_position: 0.82
            };

            const reasoning = OptimizedAnalysisService.generateReasoning(features, prediction, indicators);

            // Проверяем, что объяснения содержат конкретные значения
            const rsiFactor = reasoning.factors.find(f => f.indicator === 'RSI');
            expect(rsiFactor.explanation).toContain('72.50');
            expect(rsiFactor.explanation).toContain('70');

            const bbFactor = reasoning.factors.find(f => f.indicator === 'Bollinger Bands');
            expect(bbFactor.explanation).toContain('82.0');
        });

        it('should handle missing indicators gracefully', () => {
            const features = [0.5, 0.7, 0.3];
            const prediction = 0.75;
            const indicators = {
                rsi: 55
                // MACD и другие отсутствуют
            };

            const reasoning = OptimizedAnalysisService.generateReasoning(features, prediction, indicators);

            expect(reasoning.factors.length).toBeGreaterThan(0);
            // Должен быть хотя бы RSI
            const rsiFactor = reasoning.factors.find(f => f.indicator === 'RSI');
            expect(rsiFactor).toBeDefined();
        });

        it('should calculate confidence correctly', () => {
            const features = [0.5, 0.7, 0.3];
            
            const highConfidence = OptimizedAnalysisService.generateReasoning(features, 0.9);
            expect(highConfidence.confidence).toBeGreaterThanOrEqual(80); // confidence в процентах (0.9 -> 80%)

            const lowConfidence = OptimizedAnalysisService.generateReasoning(features, 0.52);
            expect(lowConfidence.confidence).toBeLessThan(10); // confidence в процентах (0.52 -> 4%)
        });
    });

    describe('explainPrediction() integration', () => {
        it('should generate complete explanation with feature importance and reasoning', async () => {
            const figi = 'TEST_FIGI';
            const features = [0.5, 0.7, 0.3, 0.9, 0.1];
            const prediction = 0.75;
            const indicators = {
                rsi: 65,
                macd: 0.001,
                macd_signal: 0.0005,
                bb_position: 0.6
            };

            const explanation = await OptimizedAnalysisService.explainPrediction(figi, features, prediction, indicators);

            expect(explanation).toHaveProperty('prediction');
            expect(explanation).toHaveProperty('confidence');
            expect(explanation).toHaveProperty('direction');
            expect(explanation).toHaveProperty('featureImportance');
            expect(explanation).toHaveProperty('reasoning');
            expect(explanation).toHaveProperty('topFactors');
            expect(explanation).toHaveProperty('timestamp');

            expect(explanation.featureImportance).toBeInstanceOf(Array);
            expect(explanation.topFactors).toBeInstanceOf(Array);
            expect(explanation.topFactors.length).toBeLessThanOrEqual(5);
        });

        it('should work without indicators', async () => {
            const figi = 'TEST_FIGI';
            const features = [0.5, 0.7, 0.3];
            const prediction = 0.75;

            const explanation = await OptimizedAnalysisService.explainPrediction(figi, features, prediction);

            expect(explanation).toHaveProperty('reasoning');
            expect(explanation.reasoning.factors).toBeInstanceOf(Array);
        });

        it('should handle errors gracefully', async () => {
            const figi = 'TEST_FIGI';
            const features = null; // Invalid input
            const prediction = 0.75;

            const explanation = await OptimizedAnalysisService.explainPrediction(figi, features, prediction);

            expect(explanation).toHaveProperty('prediction');
            expect(explanation).toHaveProperty('reasoning');
            // При null features analyzeFeatureImportance возвращает [], а generateReasoning работает нормально
            // Проверяем, что структура правильная
            expect(explanation.reasoning).toHaveProperty('base');
            expect(explanation.reasoning).toHaveProperty('factors');
            expect(Array.isArray(explanation.reasoning.factors)).toBe(true);
        });
    });
});

