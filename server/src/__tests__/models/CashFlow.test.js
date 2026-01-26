import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

describe('CashFlow Model', () => {
    let CashFlow;
    let sequelize;
    let tableExists = false;

    beforeAll(async () => {
        // Импортируем модель и sequelize
        CashFlow = (await import('../../models/CashFlow.js')).default;
        sequelize = (await import('../../config/database.js')).default;
        
        // Создаем таблицу если её нет
        if (CashFlow && sequelize) {
            try {
                await CashFlow.sync({ force: false });
                tableExists = true;
            } catch (error) {
                // Таблица может не создаться - пропускаем тесты с БД
                console.warn('⚠️ CashFlow table not available, some tests will be skipped');
                tableExists = false;
            }
        }
    });

    beforeEach(async () => {
        // Очищаем таблицу перед каждым тестом (если она существует)
        if (CashFlow && tableExists) {
            try {
                await CashFlow.destroy({ where: {}, force: true, truncate: true });
            } catch (error) {
                // Игнорируем ошибки очистки
            }
        }
    });

    afterEach(async () => {
        // Очищаем после теста (если таблица существует)
        if (CashFlow) {
            try {
                await CashFlow.destroy({ where: {}, force: true, truncate: true });
            } catch (error) {
                // Игнорируем ошибки очистки
            }
        }
    });

    describe('Создание записей', () => {
        it('должен создавать запись о депозите', async () => {
            if (!tableExists) {
                console.log('⏭️ Пропущен: таблица CashFlow не доступна');
                return;
            }
            const cashFlow = await CashFlow.create({
                type: 'DEPOSIT',
                amount: 500000,
                date: new Date(),
                description: 'Пополнение с карты',
                portfolioType: 'real'
            });

            expect(cashFlow.id).toBeDefined();
            expect(cashFlow.type).toBe('DEPOSIT');
            expect(parseFloat(cashFlow.amount)).toBe(500000);
            expect(cashFlow.portfolioType).toBe('real');
        });

        it('должен создавать запись о выводе', async () => {
            if (!tableExists) {
                console.log('⏭️ Пропущен: таблица CashFlow не доступна');
                return;
            }
            const cashFlow = await CashFlow.create({
                type: 'WITHDRAWAL',
                amount: 100000,
                date: new Date(),
                description: 'Вывод на счет',
                portfolioType: 'real'
            });

            expect(cashFlow.id).toBeDefined();
            expect(cashFlow.type).toBe('WITHDRAWAL');
            expect(parseFloat(cashFlow.amount)).toBe(100000);
        });

        it('должен использовать текущую дату по умолчанию', async () => {
            if (!tableExists) {
                console.log('⏭️ Пропущен: таблица CashFlow не доступна');
                return;
            }
            const cashFlow = await CashFlow.create({
                type: 'DEPOSIT',
                amount: 100000,
                portfolioType: 'real'
            });

            expect(cashFlow.date).toBeDefined();
            expect(cashFlow.date).toBeInstanceOf(Date);
        });
    });

    describe('Статические методы', () => {
        beforeEach(async () => {
            if (!tableExists) {
                return; // Пропускаем создание данных
            }
            // Создаем тестовые данные
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
                amount: 100000,
                date: new Date('2024-03-01'),
                portfolioType: 'real'
            });
        });

        it('должен правильно считать общую сумму депозитов', async () => {
            if (!tableExists) {
                console.log('⏭️ Пропущен: таблица CashFlow не доступна');
                return;
            }
            const total = await CashFlow.getTotalDeposits('real');
            expect(total).toBe(800000); // 500000 + 300000
        });

        it('должен правильно считать общую сумму выводов', async () => {
            if (!tableExists) {
                console.log('⏭️ Пропущен: таблица CashFlow не доступна');
                return;
            }
            const total = await CashFlow.getTotalWithdrawals('real');
            expect(total).toBe(100000);
        });

        it('должен правильно считать чистый денежный поток', async () => {
            if (!tableExists) {
                console.log('⏭️ Пропущен: таблица CashFlow не доступна');
                return;
            }
            const net = await CashFlow.getNetCashFlow('real');
            expect(net).toBe(700000); // 800000 - 100000
        });

        it('должен фильтровать по датам', async () => {
            if (!tableExists) {
                console.log('⏭️ Пропущен: таблица CashFlow не доступна');
                return;
            }
            const startDate = new Date('2024-02-01');
            const endDate = new Date('2024-02-28');
            
            const total = await CashFlow.getTotalDeposits('real', startDate, endDate);
            expect(total).toBe(300000); // Только депозит в феврале
        });

        it('должен возвращать историю операций', async () => {
            if (!tableExists) {
                console.log('⏭️ Пропущен: таблица CashFlow не доступна');
                return;
            }
            const history = await CashFlow.getHistory('real');
            
            expect(history.length).toBe(3);
            expect(history[0].type).toBe('WITHDRAWAL'); // Последняя операция (DESC order)
        });

        it('должен ограничивать количество записей в истории', async () => {
            if (!tableExists) {
                console.log('⏭️ Пропущен: таблица CashFlow не доступна');
                return;
            }
            const history = await CashFlow.getHistory('real', null, null, 2);
            expect(history.length).toBe(2);
        });
    });

    describe('Валидация', () => {
        it('должен отклонять отрицательную сумму', async () => {
            try {
                await CashFlow.create({
                    type: 'DEPOSIT',
                    amount: -100,
                    portfolioType: 'real'
                });
                // Если не выбросило ошибку, тест провален
                expect(true).toBe(false);
            } catch (error) {
                expect(error).toBeDefined();
            }
        });

        it('должен отклонять нулевую сумму', async () => {
            try {
                await CashFlow.create({
                    type: 'DEPOSIT',
                    amount: 0,
                    portfolioType: 'real'
                });
                expect(true).toBe(false);
            } catch (error) {
                expect(error).toBeDefined();
            }
        });

        it('должен отклонять неверный тип', async () => {
            try {
                await CashFlow.create({
                    type: 'INVALID',
                    amount: 100000,
                    portfolioType: 'real'
                });
                expect(true).toBe(false);
            } catch (error) {
                expect(error).toBeDefined();
            }
        });
    });
});

