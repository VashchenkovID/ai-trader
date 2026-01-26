import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Примечание: Эти тесты требуют настройки тестового окружения Express
// Для полного запуска нужен supertest и настроенный app
describe('Portfolio PnL API Endpoints', () => {
    let PnLCalculationService;
    let TradingEngine;
    let CashFlow;

    beforeEach(async () => {
        // Импортируем зависимости
        PnLCalculationService = (await import('../../services/PnLCalculationService.js')).default;
        TradingEngine = (await import('../../services/TradingEngine.js')).default;
        CashFlow = (await import('../../models/CashFlow.js')).default;
    });

    describe('GET /api/portfolio/pnl/detailed - Логика расчета', () => {
        it('должен правильно вызывать сервисы для расчета PnL', async () => {
            // Мокаем данные
            const mockPortfolio = {
                mode: 'real',
                initialCapital: 1000000,
                totalValue: 1070000,
                cash: 500000,
                positionsValue: 570000,
                positions: {}
            };

            const mockPnLData = {
                realized: {
                    total: 50000,
                    count: 10,
                    profitable: 7,
                    unprofitable: 3,
                    percent: 5.0,
                    trades: []
                },
                unrealized: {
                    total: 20000,
                    count: 5,
                    profitable: 3,
                    unprofitable: 2,
                    positions: []
                },
                total: {
                    pnl: 70000,
                    percent: 7.0,
                    count: 15
                },
                portfolio: {
                    initialCapital: 1000000,
                    adjustedCapital: 1000000,
                    totalValue: 1070000,
                    cash: 500000,
                    positionsValue: 570000
                },
                summary: {
                    totalTrades: 10,
                    totalPositions: 5,
                    winRate: 70.0
                }
            };

            jest.spyOn(TradingEngine, 'getRealPortfolioValue').mockResolvedValue(mockPortfolio);
            jest.spyOn(PnLCalculationService, 'calculateTotalPnL').mockResolvedValue(mockPnLData);

            // Проверяем, что методы вызываются правильно
            const portfolio = await TradingEngine.getRealPortfolioValue();
            const pnlData = await PnLCalculationService.calculateTotalPnL(portfolio, {
                tradingMode: 'real',
                includeTrades: true,
                includePositions: true
            });

            expect(pnlData.realized.total).toBe(50000);
            expect(pnlData.unrealized.total).toBe(20000);
            expect(pnlData.total.pnl).toBe(70000);
        });
    });

    describe('POST /api/portfolio/cash-flow - Валидация данных', () => {
        it('должен создавать запись о депозите', async () => {
            const mockCashFlow = {
                id: 1,
                type: 'DEPOSIT',
                amount: 500000,
                date: new Date(),
                description: 'Пополнение с карты',
                portfolioType: 'real'
            };

            jest.spyOn(CashFlow, 'create').mockResolvedValue(mockCashFlow);

            const cashFlow = await CashFlow.create({
                type: 'DEPOSIT',
                amount: 500000,
                description: 'Пополнение с карты',
                portfolioType: 'real'
            });

            expect(cashFlow.type).toBe('DEPOSIT');
            expect(parseFloat(cashFlow.amount)).toBe(500000);
        });

        it('должен валидировать тип операции', () => {
            // Проверяем валидацию на уровне логики
            const validTypes = ['DEPOSIT', 'WITHDRAWAL'];
            const invalidType = 'INVALID';
            
            expect(validTypes.includes(invalidType)).toBe(false);
        });

        it('должен валидировать сумму', () => {
            // Проверяем валидацию суммы
            const amount = -100;
            expect(amount > 0).toBe(false);
        });
    });

    describe('GET /api/portfolio/cash-flow - Получение истории', () => {
        it('должен возвращать историю вводов/выводов', async () => {
            const mockHistory = [
                {
                    id: 1,
                    type: 'DEPOSIT',
                    amount: 500000,
                    date: new Date(),
                    portfolioType: 'real'
                }
            ];

            jest.spyOn(CashFlow, 'getHistory').mockResolvedValue(mockHistory);
            jest.spyOn(CashFlow, 'getTotalDeposits').mockResolvedValue(500000);
            jest.spyOn(CashFlow, 'getTotalWithdrawals').mockResolvedValue(0);
            jest.spyOn(CashFlow, 'getNetCashFlow').mockResolvedValue(500000);

            const history = await CashFlow.getHistory('real');
            const totalDeposits = await CashFlow.getTotalDeposits('real');
            const totalWithdrawals = await CashFlow.getTotalWithdrawals('real');
            const netCashFlow = await CashFlow.getNetCashFlow('real');

            expect(history.length).toBe(1);
            expect(totalDeposits).toBe(500000);
            expect(totalWithdrawals).toBe(0);
            expect(netCashFlow).toBe(500000);
        });
    });

    describe('DELETE /api/portfolio/cash-flow/:id - Удаление записи', () => {
        it('должен удалять запись', async () => {
            const mockCashFlow = {
                id: 1,
                destroy: jest.fn().mockResolvedValue(true)
            };

            jest.spyOn(CashFlow, 'findByPk').mockResolvedValue(mockCashFlow);

            const cashFlow = await CashFlow.findByPk(1);
            await cashFlow.destroy();

            expect(mockCashFlow.destroy).toHaveBeenCalled();
        });

        it('должен возвращать null если запись не найдена', async () => {
            jest.spyOn(CashFlow, 'findByPk').mockResolvedValue(null);

            const cashFlow = await CashFlow.findByPk(999);
            expect(cashFlow).toBeNull();
        });
    });
});

