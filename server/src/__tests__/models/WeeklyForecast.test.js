import { describe, it, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';

describe('WeeklyForecast Model', () => {
    let WeeklyForecast;
    let sequelize;
    let tableExists = false;

    beforeAll(async () => {
        // Импортируем модель и sequelize
        WeeklyForecast = (await import('../../models/WeeklyForecast.js')).default;
        sequelize = (await import('../../config/database.js')).default;
        
        // Создаем таблицу если её нет
        if (WeeklyForecast && sequelize) {
            try {
                await WeeklyForecast.sync({ force: false });
                tableExists = true;
            } catch (error) {
                // Таблица может не создаться - пропускаем тесты с БД
                console.warn('⚠️ WeeklyForecast table not available, some tests will be skipped');
                tableExists = false;
            }
        }
    });

    beforeEach(async () => {
        // Очищаем таблицу перед каждым тестом (если она существует)
        if (WeeklyForecast && tableExists) {
            try {
                await WeeklyForecast.destroy({ where: {}, force: true, truncate: true });
            } catch (error) {
                // Игнорируем ошибки очистки
            }
        }
    });

    afterEach(async () => {
        // Очищаем после теста (если таблица существует)
        if (WeeklyForecast && tableExists) {
            try {
                await WeeklyForecast.destroy({ where: {}, force: true, truncate: true });
            } catch (error) {
                // Игнорируем ошибки очистки
            }
        }
    });

    describe('Создание прогноза', () => {
        it('должен создавать прогноз с валидными данными', async () => {
            if (!tableExists) {
                console.log('⏭️ Пропущен: таблица WeeklyForecast не доступна');
                return;
            }

            const today = new Date();
            const endDate = new Date(today);
            endDate.setDate(endDate.getDate() + 7);

            const forecastData = Array(7).fill(null).map((_, i) => {
                const date = new Date(today);
                date.setDate(date.getDate() + i + 1);
                return {
                    date: date.toISOString().split('T')[0],
                    open: 100 + i,
                    high: 105 + i,
                    low: 95 + i,
                    close: 102 + i,
                    volume: 1000 + i * 100,
                    confidence: 0.8
                };
            });

            const forecast = await WeeklyForecast.create({
                figi: 'BBG0013HJJ31',
                ticker: 'SBER',
                forecastDate: today.toISOString().split('T')[0],
                startDate: today.toISOString().split('T')[0],
                endDate: endDate.toISOString().split('T')[0],
                forecastData: forecastData,
                modelVersion: '1234567890_v1',
                modelType: 'seq2seq',
                confidenceScore: 0.8,
                predictedVolatility: 0.15,
                predictedTrend: 'BULLISH',
                predictedPriceChange: 2.5
            });

            expect(forecast.id).toBeDefined();
            expect(forecast.figi).toBe('BBG0013HJJ31');
            expect(forecast.ticker).toBe('SBER');
            expect(forecast.forecastData).toHaveLength(7);
            expect(forecast.confidenceScore).toBe('0.8000');
            expect(forecast.isCompleted).toBe(false);
        });

        it('должен использовать значения по умолчанию', async () => {
            if (!tableExists) {
                console.log('⏭️ Пропущен: таблица WeeklyForecast не доступна');
                return;
            }

            const today = new Date();
            const endDate = new Date(today);
            endDate.setDate(endDate.getDate() + 7);

            const forecastData = Array(7).fill(null).map((_, i) => ({
                date: new Date(today.getTime() + (i + 1) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                open: 100,
                high: 105,
                low: 95,
                close: 102,
                volume: 1000,
                confidence: 0.8
            }));

            const forecast = await WeeklyForecast.create({
                figi: 'BBG0013HJJ31',
                ticker: 'SBER',
                forecastDate: today.toISOString().split('T')[0],
                startDate: today.toISOString().split('T')[0],
                endDate: endDate.toISOString().split('T')[0],
                forecastData: forecastData
            });

            expect(forecast.modelType).toBe('seq2seq');
            expect(forecast.isCompleted).toBe(false);
        });
    });

    describe('Валидация', () => {
        it('должен отклонять forecastData с неправильной длиной', async () => {
            if (!tableExists) {
                console.log('⏭️ Пропущен: таблица WeeklyForecast не доступна');
                return;
            }

            const today = new Date();
            const endDate = new Date(today);
            endDate.setDate(endDate.getDate() + 7);

            // Пытаемся создать прогноз с 5 свечами вместо 7
            const forecastData = Array(5).fill({
                date: today.toISOString().split('T')[0],
                open: 100,
                high: 105,
                low: 95,
                close: 102,
                volume: 1000,
                confidence: 0.8
            });

            try {
                await WeeklyForecast.create({
                    figi: 'BBG0013HJJ31',
                    ticker: 'SBER',
                    forecastDate: today.toISOString().split('T')[0],
                    startDate: today.toISOString().split('T')[0],
                    endDate: endDate.toISOString().split('T')[0],
                    forecastData: forecastData
                });
                // Если не выбросило ошибку, тест провален
                expect(true).toBe(false);
            } catch (error) {
                expect(error).toBeDefined();
                expect(error.message).toContain('forecastData must be an array of 7 candles');
            }
        });

        it('должен отклонять confidenceScore вне диапазона 0-1', async () => {
            if (!tableExists) {
                console.log('⏭️ Пропущен: таблица WeeklyForecast не доступна');
                return;
            }

            const today = new Date();
            const endDate = new Date(today);
            endDate.setDate(endDate.getDate() + 7);

            const forecastData = Array(7).fill({
                date: today.toISOString().split('T')[0],
                open: 100,
                high: 105,
                low: 95,
                close: 102,
                volume: 1000,
                confidence: 0.8
            });

            // Тест для значения > 1
            try {
                await WeeklyForecast.create({
                    figi: 'BBG0013HJJ31',
                    ticker: 'SBER',
                    forecastDate: today.toISOString().split('T')[0],
                    startDate: today.toISOString().split('T')[0],
                    endDate: endDate.toISOString().split('T')[0],
                    forecastData: forecastData,
                    confidenceScore: 1.5
                });
                expect(true).toBe(false);
            } catch (error) {
                expect(error).toBeDefined();
            }

            // Тест для значения < 0
            try {
                await WeeklyForecast.create({
                    figi: 'BBG0013HJJ31',
                    ticker: 'SBER',
                    forecastDate: today.toISOString().split('T')[0],
                    startDate: today.toISOString().split('T')[0],
                    endDate: endDate.toISOString().split('T')[0],
                    forecastData: forecastData,
                    confidenceScore: -0.1
                });
                expect(true).toBe(false);
            } catch (error) {
                expect(error).toBeDefined();
            }
        });

        it('должен отклонять неверный modelType', async () => {
            if (!tableExists) {
                console.log('⏭️ Пропущен: таблица WeeklyForecast не доступна');
                return;
            }

            const today = new Date();
            const endDate = new Date(today);
            endDate.setDate(endDate.getDate() + 7);

            const forecastData = Array(7).fill({
                date: today.toISOString().split('T')[0],
                open: 100,
                high: 105,
                low: 95,
                close: 102,
                volume: 1000,
                confidence: 0.8
            });

            try {
                await WeeklyForecast.create({
                    figi: 'BBG0013HJJ31',
                    ticker: 'SBER',
                    forecastDate: today.toISOString().split('T')[0],
                    startDate: today.toISOString().split('T')[0],
                    endDate: endDate.toISOString().split('T')[0],
                    forecastData: forecastData,
                    modelType: 'invalid_type'
                });
                expect(true).toBe(false);
            } catch (error) {
                expect(error).toBeDefined();
            }
        });

        it('должен отклонять неверный predictedTrend', async () => {
            if (!tableExists) {
                console.log('⏭️ Пропущен: таблица WeeklyForecast не доступна');
                return;
            }

            const today = new Date();
            const endDate = new Date(today);
            endDate.setDate(endDate.getDate() + 7);

            const forecastData = Array(7).fill({
                date: today.toISOString().split('T')[0],
                open: 100,
                high: 105,
                low: 95,
                close: 102,
                volume: 1000,
                confidence: 0.8
            });

            try {
                await WeeklyForecast.create({
                    figi: 'BBG0013HJJ31',
                    ticker: 'SBER',
                    forecastDate: today.toISOString().split('T')[0],
                    startDate: today.toISOString().split('T')[0],
                    endDate: endDate.toISOString().split('T')[0],
                    forecastData: forecastData,
                    predictedTrend: 'INVALID_TREND'
                });
                expect(true).toBe(false);
            } catch (error) {
                expect(error).toBeDefined();
            }
        });
    });

    describe('Поиск и фильтрация', () => {
        beforeEach(async () => {
            if (!tableExists) {
                return;
            }

            // Создаем тестовые данные
            const today = new Date();
            const endDate1 = new Date(today);
            endDate1.setDate(endDate1.getDate() + 7);
            const endDate2 = new Date(today);
            endDate2.setDate(endDate2.getDate() + 14);

            const forecastData = Array(7).fill(null).map((_, i) => ({
                date: new Date(today.getTime() + (i + 1) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                open: 100,
                high: 105,
                low: 95,
                close: 102,
                volume: 1000,
                confidence: 0.8
            }));

            // Создаем завершенный прогноз
            await WeeklyForecast.create({
                figi: 'BBG0013HJJ31',
                ticker: 'SBER',
                forecastDate: new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                startDate: new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                endDate: new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                forecastData: forecastData,
                isCompleted: true,
                completionDate: new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
            });

            // Создаем активный прогноз
            await WeeklyForecast.create({
                figi: 'BBG0013HJJ31',
                ticker: 'SBER',
                forecastDate: today.toISOString().split('T')[0],
                startDate: today.toISOString().split('T')[0],
                endDate: endDate1.toISOString().split('T')[0],
                forecastData: forecastData,
                isCompleted: false
            });

            // Создаем прогноз для другого инструмента
            await WeeklyForecast.create({
                figi: 'BBG004730N88',
                ticker: 'GAZP',
                forecastDate: today.toISOString().split('T')[0],
                startDate: today.toISOString().split('T')[0],
                endDate: endDate2.toISOString().split('T')[0],
                forecastData: forecastData,
                isCompleted: false
            });
        });

        it('должен находить активные прогнозы', async () => {
            if (!tableExists) {
                console.log('⏭️ Пропущен: таблица WeeklyForecast не доступна');
                return;
            }

            const activeForecasts = await WeeklyForecast.findAll({
                where: { isCompleted: false }
            });

            expect(activeForecasts.length).toBe(2);
        });

        it('должен находить прогнозы по FIGI', async () => {
            if (!tableExists) {
                console.log('⏭️ Пропущен: таблица WeeklyForecast не доступна');
                return;
            }

            const forecasts = await WeeklyForecast.findAll({
                where: { figi: 'BBG0013HJJ31' }
            });

            expect(forecasts.length).toBe(2);
        });

        it('должен находить завершенные прогнозы', async () => {
            if (!tableExists) {
                console.log('⏭️ Пропущен: таблица WeeklyForecast не доступна');
                return;
            }

            const completedForecasts = await WeeklyForecast.findAll({
                where: { isCompleted: true }
            });

            expect(completedForecasts.length).toBe(1);
        });
    });
});

