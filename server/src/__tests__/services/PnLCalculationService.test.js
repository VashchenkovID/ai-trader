import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import PnLCalculationService from '../../services/PnLCalculationService.js';

describe('PnLCalculationService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('calculateRealizedPnL', () => {
        it('должен возвращать нулевой PnL для пустого массива', () => {
            const result = PnLCalculationService.calculateRealizedPnL([]);
            
            expect(result.total).toBe(0);
            expect(result.count).toBe(0);
            expect(result.profitable).toBe(0);
            expect(result.unprofitable).toBe(0);
            expect(result.trades).toEqual([]);
        });

        it('должен правильно рассчитывать прибыль от одной сделки', () => {
            const trades = [{
                figi: 'TEST_FIGI',
                ticker: 'TEST',
                name: 'Test Stock',
                entryPrice: 100,
                exitPrice: 110,
                quantity: 10,
                commission: 5,
                executedAt: new Date()
            }];

            const result = PnLCalculationService.calculateRealizedPnL(trades);
            
            expect(result.total).toBe(95); // (110 - 100) * 10 - 5
            expect(result.count).toBe(1);
            expect(result.profitable).toBe(1);
            expect(result.unprofitable).toBe(0);
            expect(result.winRate).toBe(1);
        });

        it('должен правильно рассчитывать убыток от одной сделки', () => {
            const trades = [{
                figi: 'TEST_FIGI',
                ticker: 'TEST',
                name: 'Test Stock',
                entryPrice: 100,
                exitPrice: 90,
                quantity: 10,
                commission: 5,
                executedAt: new Date()
            }];

            const result = PnLCalculationService.calculateRealizedPnL(trades);
            
            expect(result.total).toBe(-105); // (90 - 100) * 10 - 5
            expect(result.count).toBe(1);
            expect(result.profitable).toBe(0);
            expect(result.unprofitable).toBe(1);
            expect(result.winRate).toBe(0);
        });

        it('должен правильно рассчитывать PnL от множественных сделок', () => {
            const trades = [
                {
                    figi: 'TEST1',
                    ticker: 'TEST1',
                    name: 'Test Stock 1',
                    entryPrice: 100,
                    exitPrice: 110,
                    quantity: 10,
                    commission: 5,
                    executedAt: new Date()
                },
                {
                    figi: 'TEST2',
                    ticker: 'TEST2',
                    name: 'Test Stock 2',
                    entryPrice: 50,
                    exitPrice: 45,
                    quantity: 20,
                    commission: 3,
                    executedAt: new Date()
                },
                {
                    figi: 'TEST3',
                    ticker: 'TEST3',
                    name: 'Test Stock 3',
                    entryPrice: 200,
                    exitPrice: 220,
                    quantity: 5,
                    commission: 2,
                    executedAt: new Date()
                }
            ];

            const result = PnLCalculationService.calculateRealizedPnL(trades);
            
            // Trade 1: (110 - 100) * 10 - 5 = 95
            // Trade 2: (45 - 50) * 20 - 3 = -103
            // Trade 3: (220 - 200) * 5 - 2 = 98
            // Total: 95 - 103 + 98 = 90
            expect(result.total).toBe(90);
            expect(result.count).toBe(3);
            expect(result.profitable).toBe(2);
            expect(result.unprofitable).toBe(1);
            expect(result.winRate).toBeCloseTo(2 / 3, 4);
        });

        it('должен использовать realizedProfit если она есть', () => {
            const trades = [{
                figi: 'TEST_FIGI',
                ticker: 'TEST',
                name: 'Test Stock',
                entryPrice: 100,
                exitPrice: 110,
                quantity: 10,
                commission: 5,
                realizedProfit: 120, // Уже рассчитанная прибыль
                executedAt: new Date()
            }];

            const result = PnLCalculationService.calculateRealizedPnL(trades);
            
            expect(result.total).toBe(120); // Использует realizedProfit
        });
    });

    describe('calculateUnrealizedPnL', () => {
        it('должен возвращать нулевой PnL для пустого массива', () => {
            const result = PnLCalculationService.calculateUnrealizedPnL([], {});
            
            expect(result.total).toBe(0);
            expect(result.count).toBe(0);
            expect(result.positions).toEqual([]);
        });

        it('должен правильно рассчитывать нереализованную прибыль', () => {
            const positions = [{
                figi: 'TEST_FIGI',
                ticker: 'TEST',
                name: 'Test Stock',
                entryPrice: 100,
                quantity: 10
            }];

            const currentPrices = {
                'TEST_FIGI': 110
            };

            const result = PnLCalculationService.calculateUnrealizedPnL(positions, currentPrices);
            
            expect(result.total).toBe(100); // (110 - 100) * 10
            expect(result.count).toBe(1);
            expect(result.profitable).toBe(1);
            expect(result.unprofitable).toBe(0);
        });

        it('должен правильно рассчитывать нереализованный убыток', () => {
            const positions = [{
                figi: 'TEST_FIGI',
                ticker: 'TEST',
                name: 'Test Stock',
                entryPrice: 100,
                quantity: 10
            }];

            const currentPrices = {
                'TEST_FIGI': 90
            };

            const result = PnLCalculationService.calculateUnrealizedPnL(positions, currentPrices);
            
            expect(result.total).toBe(-100); // (90 - 100) * 10
            expect(result.count).toBe(1);
            expect(result.profitable).toBe(0);
            expect(result.unprofitable).toBe(1);
        });

        it('должен обрабатывать множественные позиции', () => {
            const positions = [
                {
                    figi: 'TEST1',
                    ticker: 'TEST1',
                    name: 'Test Stock 1',
                    entryPrice: 100,
                    quantity: 10
                },
                {
                    figi: 'TEST2',
                    ticker: 'TEST2',
                    name: 'Test Stock 2',
                    entryPrice: 50,
                    quantity: 20
                }
            ];

            const currentPrices = {
                'TEST1': 110,
                'TEST2': 45
            };

            const result = PnLCalculationService.calculateUnrealizedPnL(positions, currentPrices);
            
            // Position 1: (110 - 100) * 10 = 100
            // Position 2: (45 - 50) * 20 = -100
            // Total: 0
            expect(result.total).toBe(0);
            expect(result.count).toBe(2);
            expect(result.profitable).toBe(1);
            expect(result.unprofitable).toBe(1);
        });
    });

    describe('calculateTotalPnL', () => {
        it('должен обрабатывать ошибки gracefully', async () => {
            const portfolio = {
                mode: 'real',
                initialCapital: 1000000,
                totalValue: 1050000,
                cash: 500000,
                positionsValue: 550000,
                positions: {}
            };

            // Мокаем методы, которые могут выбросить ошибку
            jest.spyOn(PnLCalculationService, 'getClosedTrades').mockRejectedValue(new Error('DB error'));
            jest.spyOn(PnLCalculationService, 'getOpenPositions').mockResolvedValue([]);

            await expect(
                PnLCalculationService.calculateTotalPnL(portfolio, { includeTrades: true })
            ).rejects.toThrow();
        });
    });
});

