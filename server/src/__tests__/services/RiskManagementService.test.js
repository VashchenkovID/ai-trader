/**
 * Тесты для RiskManagementService
 * Фаза 1, задача 1.1: Смягчение валидации
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import RiskManagementService from '../../services/RiskManagementService.js';

describe('RiskManagementService - Фаза 1, задача 1.1: Смягчение валидации', () => {
    
    let mockPortfolio;

    beforeEach(async () => {
        // Инициализация сервиса
        if (!RiskManagementService.isInitialized) {
            await RiskManagementService.initialize();
        }

        // Мок портфеля
        mockPortfolio = {
            totalValue: 1000000, // 1 млн рублей
            positions: {},
            positionsValue: 0
        };

        // Сброс статистики
        RiskManagementService.stats = {
            totalTrades: 0,
            winningTrades: 0,
            losingTrades: 0,
            consecutiveLosses: 0,
            maxConsecutiveLosses: 0,
            currentDrawdown: 0,
            maxDrawdown: 0,
            dailyPnL: 0,
            totalPnL: 0,
            winRate: 0,
            averageWin: 0,
            averageLoss: 0,
            profitFactor: 0
        };
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('1.1.2. Превращение блокировок в предупреждения - Confidence', () => {
        
        it('должен блокировать при confidence < 40%', async () => {
            const signal = {
                symbol: 'TEST',
                figi: 'test-figi',
                action: 'BUY',
                quantity: 10,
                price: 100,
                confidence: 0.35 // 35% < 40%
            };

            const validation = await RiskManagementService.validateOrder(signal, mockPortfolio);
            
            expect(validation.isValid).toBe(false);
            expect(validation.errors.length).toBeGreaterThan(0);
            expect(validation.errors[0]).toContain('слишком низкая');
        });

        it('должен возвращать warning при confidence 50% (между 40% и 60%)', async () => {
            const signal = {
                symbol: 'TEST',
                figi: 'test-figi',
                action: 'BUY',
                quantity: 10,
                price: 100,
                confidence: 0.50 // 50% < 60% (минимум), но >= 40%
            };

            const validation = await RiskManagementService.validateOrder(signal, mockPortfolio);
            
            expect(validation.isValid).toBe(true);
            expect(validation.warnings.length).toBeGreaterThan(0);
            expect(validation.warnings.some(w => w.includes('ниже рекомендуемого минимума'))).toBe(true);
        });

        it('должен проходить валидацию с confidence >= 60%', async () => {
            const signal = {
                symbol: 'TEST',
                figi: 'test-figi',
                action: 'BUY',
                quantity: 10,
                price: 100,
                confidence: 0.65 // 65% >= 60%
            };

            const validation = await RiskManagementService.validateOrder(signal, mockPortfolio);
            
            expect(validation.isValid).toBe(true);
            expect(validation.warnings.filter(w => w.includes('уверенность')).length).toBe(0);
        });
    });

    describe('1.1.3. Увеличение лимитов размера позиций', () => {
        
        it('должен использовать maxPositionSize = 5% вместо 2%', () => {
            expect(RiskManagementService.limits.maxPositionSize).toBe(0.05); // 5%
        });

        it('должен использовать maxTotalExposure = 60% (актуальная конфигурация)', () => {
            expect(RiskManagementService.limits.maxTotalExposure).toBe(0.60); // 60%
        });

        it('должен позволять позицию размером 4% от капитала', async () => {
            const signal = {
                symbol: 'TEST',
                figi: 'test-figi',
                action: 'BUY',
                quantity: 400, // 400 * 100 = 40,000 = 4% от 1,000,000
                price: 100,
                confidence: 0.7
            };

            const currentPrices = { 'TEST': 100 };
            const validation = await RiskManagementService.validateOrder(signal, mockPortfolio, currentPrices);
            
            // Позиция 4% должна проходить (лимит теперь 5%)
            expect(validation.isValid).toBe(true);
        });

        it('должен предупреждать при позиции > 5%', async () => {
            const signal = {
                symbol: 'TEST',
                figi: 'test-figi',
                action: 'BUY',
                quantity: 600, // 600 * 100 = 60,000 = 6% от 1,000,000
                price: 100,
                confidence: 0.7
            };

            const currentPrices = { 'TEST': 100 };
            const validation = await RiskManagementService.validateOrder(signal, mockPortfolio, currentPrices);
            
            // Должно быть предупреждение о превышении лимита
            expect(validation.warnings.some(w => w.includes('превышает рекомендуемый лимит'))).toBe(true);
        });
    });

    describe('1.1.4. Смягчение лимитов убытков', () => {
        
        it('должен использовать maxConsecutiveLosses = 10 вместо 5', () => {
            expect(RiskManagementService.limits.maxConsecutiveLosses).toBe(10);
        });

        it('должен использовать maxDailyLoss = 10% вместо 5%', () => {
            expect(RiskManagementService.limits.maxDailyLoss).toBe(0.10); // 10%
        });

        it('должен возвращать warning при 7 последовательных убытках', async () => {
            RiskManagementService.stats.consecutiveLosses = 7;

            const signal = {
                symbol: 'TEST',
                figi: 'test-figi',
                action: 'BUY',
                quantity: 10,
                price: 100,
                confidence: 0.7
            };

            const validation = await RiskManagementService.validateOrder(signal, mockPortfolio);
            
            expect(validation.isValid).toBe(true);
            expect(validation.warnings.length).toBeGreaterThan(0);
            expect(validation.warnings.some(w => w.includes('убыточных сделок подряд'))).toBe(true);
        });

        it('должен блокировать при 10 последовательных убытках', async () => {
            RiskManagementService.stats.consecutiveLosses = 10;

            const signal = {
                symbol: 'TEST',
                figi: 'test-figi',
                action: 'BUY',
                quantity: 10,
                price: 100,
                confidence: 0.7
            };

            const validation = await RiskManagementService.validateOrder(signal, mockPortfolio);
            
            expect(validation.isValid).toBe(false);
            expect(validation.errors.some(e => e.includes('убыточных сделок подряд'))).toBe(true);
        });

        it('должен возвращать warning при дневном убытке 7%', async () => {
            // Дневной убыток 7% от капитала
            RiskManagementService.stats.dailyPnL = -70000; // -7% от 1,000,000

            const signal = {
                symbol: 'TEST',
                figi: 'test-figi',
                action: 'BUY',
                quantity: 10,
                price: 100,
                confidence: 0.7
            };

            const validation = await RiskManagementService.validateOrder(signal, mockPortfolio);
            
            expect(validation.isValid).toBe(true);
            expect(validation.warnings.length).toBeGreaterThan(0);
            expect(validation.warnings.some(w => w.includes('Дневной убыток'))).toBe(true);
        });

        it('должен блокировать при дневном убытке > 10%', async () => {
            // Дневной убыток 12% от капитала
            RiskManagementService.stats.dailyPnL = -120000; // -12% от 1,000,000

            const signal = {
                symbol: 'TEST',
                figi: 'test-figi',
                action: 'BUY',
                quantity: 10,
                price: 100,
                confidence: 0.7
            };

            const validation = await RiskManagementService.validateOrder(signal, mockPortfolio);
            
            expect(validation.isValid).toBe(false);
            expect(validation.errors.some(e => e.includes('Дневной убыток'))).toBe(true);
        });
    });

    describe('1.1.2. Превращение блокировок в предупреждения - Корреляция', () => {
        
        it('должен возвращать warning при корреляции 75% (между 70% и 90%)', async () => {
            // Мокируем checkCorrelationRisk для возврата корреляции 75%
            const originalCheckCorrelationRisk = RiskManagementService.checkCorrelationRisk;
            RiskManagementService.checkCorrelationRisk = jest.fn().mockResolvedValue({
                high: false,
                correlatedPositions: ['FIGI1', 'FIGI2'],
                correlationDetails: [],
                portfolioCorrelation: 0.75, // 75%
                recommendation: 'WARNING',
                threshold: 0.7,
                portfolioThreshold: 0.7
            });

            const signal = {
                symbol: 'TEST',
                figi: 'test-figi',
                action: 'BUY',
                quantity: 10,
                price: 100,
                confidence: 0.7
            };

            const portfolio = {
                ...mockPortfolio,
                positions: { 'FIGI1': 10, 'FIGI2': 20 }
            };

            const validation = await RiskManagementService.validateOrder(signal, portfolio);
            
            expect(validation.isValid).toBe(true);
            expect(validation.warnings.length).toBeGreaterThan(0);
            expect(validation.warnings.some(w => w.includes('корреляция'))).toBe(true);

            // Восстанавливаем оригинальный метод
            RiskManagementService.checkCorrelationRisk = originalCheckCorrelationRisk;
        });

        it('должен блокировать при корреляции > 90%', async () => {
            // Мокируем checkCorrelationRisk для возврата корреляции 95%
            const originalCheckCorrelationRisk = RiskManagementService.checkCorrelationRisk;
            RiskManagementService.checkCorrelationRisk = jest.fn().mockResolvedValue({
                high: true,
                correlatedPositions: ['FIGI1', 'FIGI2', 'FIGI3'],
                correlationDetails: [],
                portfolioCorrelation: 0.95, // 95%
                recommendation: 'BLOCK',
                threshold: 0.7,
                portfolioThreshold: 0.7
            });

            const signal = {
                symbol: 'TEST',
                figi: 'test-figi',
                action: 'BUY',
                quantity: 10,
                price: 100,
                confidence: 0.7
            };

            const portfolio = {
                ...mockPortfolio,
                positions: { 'FIGI1': 10, 'FIGI2': 20, 'FIGI3': 30 }
            };

            const validation = await RiskManagementService.validateOrder(signal, portfolio);
            
            expect(validation.isValid).toBe(false);
            expect(validation.errors.length).toBeGreaterThan(0);
            expect(validation.errors.some(e => e.includes('корреляция'))).toBe(true);

            // Восстанавливаем оригинальный метод
            RiskManagementService.checkCorrelationRisk = originalCheckCorrelationRisk;
        });
    });

    describe('Граничные значения', () => {
        
        it('должен проходить валидацию с confidence ровно 40%', async () => {
            const signal = {
                symbol: 'TEST',
                figi: 'test-figi',
                action: 'BUY',
                quantity: 10,
                price: 100,
                confidence: 0.40 // Ровно 40%
            };

            const validation = await RiskManagementService.validateOrder(signal, mockPortfolio);
            
            expect(validation.isValid).toBe(true);
            // Может быть warning, но не ошибка
        });

        it('должен проходить валидацию с confidence ровно 60%', async () => {
            const signal = {
                symbol: 'TEST',
                figi: 'test-figi',
                action: 'BUY',
                quantity: 10,
                price: 100,
                confidence: 0.60 // Ровно 60%
            };

            const validation = await RiskManagementService.validateOrder(signal, mockPortfolio);
            
            expect(validation.isValid).toBe(true);
            expect(validation.warnings.filter(w => w.includes('уверенность')).length).toBe(0);
        });

        it('должен блокировать при confidence 39.9%', async () => {
            const signal = {
                symbol: 'TEST',
                figi: 'test-figi',
                action: 'BUY',
                quantity: 10,
                price: 100,
                confidence: 0.399 // 39.9% < 40%
            };

            const validation = await RiskManagementService.validateOrder(signal, mockPortfolio);
            
            expect(validation.isValid).toBe(false);
            expect(validation.errors.length).toBeGreaterThan(0);
        });
    });
});

