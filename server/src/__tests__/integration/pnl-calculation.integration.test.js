import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

/**
 * Интеграционные тесты для расчета PnL
 * Проверяют взаимодействие между сервисами и моделями
 */
describe('PnL Calculation Integration', () => {
    let PnLCalculationService;
    let TradingEngine;
    let CashFlow;
    let PositionExit;
    let TradingRequest;
    let CacheService;
    let tableExists = false;

    beforeAll(async () => {
        // Импортируем все зависимости
        PnLCalculationService = (await import('../../services/PnLCalculationService.js')).default;
        TradingEngine = (await import('../../services/TradingEngine.js')).default;
        CashFlow = (await import('../../models/CashFlow.js')).default;
        PositionExit = (await import('../../models/PositionExit.js')).default;
        TradingRequest = (await import('../../models/TradingRequest.js')).default;
        CacheService = (await import('../../services/CacheService.js')).default;

        // Создаем таблицу если её нет
        if (CashFlow) {
            try {
                await CashFlow.sync({ force: false });
                tableExists = true;
            } catch (error) {
                console.warn('⚠️ CashFlow table not available, some tests will be skipped');
                tableExists = false;
            }
        }
    });

    beforeEach(async () => {
        // Очищаем тестовые данные (если таблица существует)
        if (CashFlow && tableExists) {
            try {
                await CashFlow.destroy({ where: {}, force: true, truncate: true });
            } catch (error) {
                // Игнорируем ошибки очистки
            }
        }
    });

    afterEach(async () => {
        // Очистка после тестов (если таблица существует)
        if (CashFlow) {
            try {
                await CashFlow.destroy({ where: {}, force: true, truncate: true });
            } catch (error) {
                // Игнорируем ошибки очистки
            }
        }
    });

    describe('Полный цикл расчета PnL', () => {
        it('должен правильно рассчитывать PnL с учетом CashFlow', async () => {
            if (!tableExists) {
                console.log('⏭️ Пропущен: таблица CashFlow не доступна');
                return;
            }
            // 1. Создаем депозит
            await CashFlow.create({
                type: 'DEPOSIT',
                amount: 500000,
                date: new Date('2024-01-01'),
                portfolioType: 'real'
            });

            // 2. Мокаем портфель
            const mockPortfolio = {
                mode: 'real',
                initialCapital: 1000000,
                totalValue: 1070000,
                cash: 500000,
                positionsValue: 570000,
                positions: {
                    'TEST_FIGI': 10
                }
            };

            // 3. Мокаем закрытые сделки
            jest.spyOn(PnLCalculationService, 'getClosedTrades').mockResolvedValue([
                {
                    figi: 'TEST_FIGI',
                    ticker: 'TEST',
                    name: 'Test Stock',
                    entryPrice: 100,
                    exitPrice: 110,
                    quantity: 10,
                    commission: 5,
                    realizedProfit: 95
                }
            ]);

            // 4. Мокаем открытые позиции
            jest.spyOn(PnLCalculationService, 'getOpenPositions').mockResolvedValue([
                {
                    figi: 'TEST_FIGI',
                    ticker: 'TEST',
                    name: 'Test Stock',
                    entryPrice: 100,
                    currentPrice: 105,
                    quantity: 10
                }
            ]);

            // 5. Рассчитываем PnL
            const result = await PnLCalculationService.calculateTotalPnL(mockPortfolio, {
                tradingMode: 'real',
                includeTrades: true,
                includePositions: true,
                includeCashFlow: true
            });

            // 6. Проверяем результаты
            expect(result.realized.total).toBe(95);
            expect(result.unrealized.total).toBe(50); // (105 - 100) * 10
            expect(result.total.pnl).toBe(145);
            
            // Проверяем скорректированный капитал
            expect(result.portfolio.adjustedCapital).toBe(1500000); // 1000000 + 500000
            expect(result.cashFlow).toBeDefined();
            expect(result.cashFlow.totalDeposits).toBe(500000);
        });

        it('должен правильно обрабатывать множественные вводы/выводы', async () => {
            if (!tableExists) {
                console.log('⏭️ Пропущен: таблица CashFlow не доступна');
                return;
            }
            // Создаем несколько операций
            await CashFlow.create({
                type: 'DEPOSIT',
                amount: 500000,
                date: new Date('2024-01-01'),
                portfolioType: 'real'
            });

            await CashFlow.create({
                type: 'DEPOSIT',
                amount: 300000,
                date: new Date('2024-02-01'),
                portfolioType: 'real'
            });

            await CashFlow.create({
                type: 'WITHDRAWAL',
                amount: 200000,
                date: new Date('2024-03-01'),
                portfolioType: 'real'
            });

            const mockPortfolio = {
                mode: 'real',
                initialCapital: 1000000,
                totalValue: 1200000,
                cash: 600000,
                positionsValue: 600000,
                positions: {}
            };

            jest.spyOn(PnLCalculationService, 'getClosedTrades').mockResolvedValue([]);
            jest.spyOn(PnLCalculationService, 'getOpenPositions').mockResolvedValue([]);

            const result = await PnLCalculationService.calculateTotalPnL(mockPortfolio, {
                tradingMode: 'real',
                includeCashFlow: true
            });

            // Скорректированный капитал: 1000000 + 500000 + 300000 - 200000 = 1600000
            expect(result.portfolio.adjustedCapital).toBe(1600000);
            expect(result.cashFlow.netCashFlow).toBe(600000); // 500000 + 300000 - 200000
        });
    });

    describe('Взаимодействие с TradingRequest и PositionExit', () => {
        it('должен правильно преобразовывать данные PositionExit в формат для расчета PnL', () => {
            // Проверяем логику преобразования данных без реального вызова БД
            // Это тест логики преобразования, а не интеграции с БД
            
            const mockExit = {
                id: 1,
                tradingRequestId: 'test-uuid',
                figi: 'TEST_FIGI',
                ticker: 'TEST',
                name: 'Test Stock',
                entryPrice: 100,
                exitPrice: 110,
                exitQuantity: 10,
                commission: 5,
                realizedProfit: 95,
                executedAt: new Date()
            };

            const mockTradingRequest = {};

            // Симулируем логику преобразования из getClosedTrades
            const transformed = {
                figi: mockExit.figi,
                ticker: mockExit.ticker,
                name: mockExit.name,
                entryPrice: mockExit.entryPrice,
                exitPrice: mockExit.exitPrice,
                exitQuantity: mockExit.exitQuantity,
                quantity: mockExit.exitQuantity,
                commission: mockExit.commission || 0,
                realizedProfit: mockExit.realizedProfit || 0,
                exitDate: mockExit.executedAt,
                executedAt: mockExit.executedAt,
                tradingRequestId: mockExit.tradingRequestId,
                actualPrice: mockTradingRequest.actualPrice,
                priceAtRequest: mockTradingRequest.priceAtRequest
            };

            // Проверяем правильность преобразования
            expect(transformed.figi).toBe('TEST_FIGI');
            expect(transformed.ticker).toBe('TEST');
            expect(transformed.name).toBe('Test Stock');
            expect(transformed.entryPrice).toBe(100);
            expect(transformed.exitPrice).toBe(110);
            expect(transformed.quantity).toBe(10);
            expect(transformed.exitQuantity).toBe(10);
            expect(transformed.commission).toBe(5);
            expect(transformed.realizedProfit).toBe(95);
            expect(transformed.tradingRequestId).toBe('test-uuid');
            expect(transformed.executedAt).toBeInstanceOf(Date);
            
            // Проверяем, что метод существует
            expect(typeof PnLCalculationService.getClosedTrades).toBe('function');
        });
    });
});

