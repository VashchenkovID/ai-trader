import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';

describe('WeeklyForecastService - generateForecast', () => {
    let WeeklyForecastService;
    let WeeklyForecast;
    let WeeklyForecastModelService;
    let CacheService;
    let OptimizedDataService;
    let LoggerService;
    let tableExists = false;

    beforeAll(async () => {
        // Импортируем сервисы и модели
        WeeklyForecastService = (await import('../../services/WeeklyForecastService.js')).default;
        WeeklyForecast = (await import('../../models/WeeklyForecast.js')).default;
        WeeklyForecastModelService = (await import('../../services/WeeklyForecastModelService.js')).default;
        CacheService = (await import('../../services/CacheService.js')).default;
        OptimizedDataService = (await import('../../services/OptimizedDataService.js')).default;
        LoggerService = (await import('../../services/LoggerService.js')).default;

        // Проверяем доступность таблицы
        if (WeeklyForecast) {
            try {
                await WeeklyForecast.sync({ force: false });
                tableExists = true;
            } catch (error) {
                console.warn('⚠️ WeeklyForecast table not available, some tests will be skipped');
                tableExists = false;
            }
        }
    });

    beforeEach(async () => {
        // Очищаем таблицу перед каждым тестом
        if (WeeklyForecast && tableExists) {
            try {
                await WeeklyForecast.destroy({ where: {}, force: true, truncate: true });
            } catch (error) {
                // Игнорируем ошибки очистки
            }
        }

        // Сбрасываем флаг инициализации сервиса
        if (WeeklyForecastService) {
            WeeklyForecastService.isInitialized = false;
        }
    });

    describe('postProcessForecast', () => {
        beforeEach(async () => {
            await WeeklyForecastService.initialize();
        });

        it('должен обрабатывать сырой прогноз', () => {
            const rawForecast = Array(7).fill(null).map((_, i) => ({
                open: 100 + i,
                high: 105 + i,
                low: 95 + i,
                close: 102 + i,
                volume: 1000 + i * 100
            }));

            const historicalCandles = Array(60).fill(null).map((_, i) => ({
                open: 100,
                high: 105,
                low: 95,
                close: 100,
                volume: 1000
            }));

            const instrument = { figi: 'TEST_FIGI', ticker: 'TEST' };

            const result = WeeklyForecastService.postProcessForecast(
                rawForecast,
                historicalCandles,
                instrument
            );

            expect(result).toBeDefined();
            expect(result.candles).toHaveLength(7);
            expect(result.confidence).toBeGreaterThanOrEqual(0);
            expect(result.confidence).toBeLessThanOrEqual(1);

            // Проверяем структуру свечей
            result.candles.forEach((candle, index) => {
                expect(candle).toHaveProperty('open');
                expect(candle).toHaveProperty('high');
                expect(candle).toHaveProperty('low');
                expect(candle).toHaveProperty('close');
                expect(candle).toHaveProperty('volume');
                expect(candle).toHaveProperty('confidence');
                expect(candle).toHaveProperty('date');
                
                // Проверяем валидность цен
                expect(candle.high).toBeGreaterThanOrEqual(candle.low);
                expect(candle.close).toBeGreaterThanOrEqual(candle.low);
                expect(candle.close).toBeLessThanOrEqual(candle.high);
                expect(candle.open).toBeGreaterThanOrEqual(candle.low);
                expect(candle.open).toBeLessThanOrEqual(candle.high);
                expect(candle.volume).toBeGreaterThanOrEqual(0);
            });
        });

        it('должен исправлять невалидные цены', () => {
            const rawForecast = [{
                open: 100,
                high: 95, // Неправильно: high < low
                low: 105,
                close: 110, // Вне диапазона
                volume: 1000
            }];

            const historicalCandles = Array(60).fill({
                open: 100,
                high: 105,
                low: 95,
                close: 100,
                volume: 1000
            });

            const instrument = { figi: 'TEST_FIGI', ticker: 'TEST' };

            const result = WeeklyForecastService.postProcessForecast(
                rawForecast,
                historicalCandles,
                instrument
            );

            const candle = result.candles[0];
            expect(candle.high).toBeGreaterThanOrEqual(candle.low);
            expect(candle.close).toBeGreaterThanOrEqual(candle.low);
            expect(candle.close).toBeLessThanOrEqual(candle.high);
        });

        it('должен ограничивать изменения цен (максимум 10%)', () => {
            const lastPrice = 100;
            const rawForecast = [{
                open: lastPrice,
                high: lastPrice * 1.2, // 20% изменение
                low: lastPrice * 0.8,
                close: lastPrice * 1.15, // 15% изменение
                volume: 1000
            }];

            const historicalCandles = Array(60).fill({
                open: lastPrice,
                high: lastPrice * 1.05,
                low: lastPrice * 0.95,
                close: lastPrice,
                volume: 1000
            });

            const instrument = { figi: 'TEST_FIGI', ticker: 'TEST' };

            const result = WeeklyForecastService.postProcessForecast(
                rawForecast,
                historicalCandles,
                instrument
            );

            const candle = result.candles[0];
            const maxChange = lastPrice * 0.1;
            expect(Math.abs(candle.close - lastPrice)).toBeLessThanOrEqual(maxChange + 0.01); // Небольшая погрешность
        });

        it('должен выбрасывать ошибку для пустого прогноза', () => {
            const historicalCandles = Array(60).fill({
                open: 100,
                high: 105,
                low: 95,
                close: 100,
                volume: 1000
            });

            expect(() => {
                WeeklyForecastService.postProcessForecast([], historicalCandles, {});
            }).toThrow('Raw forecast is empty');
        });
    });

    describe('calculateForecastMetadata', () => {
        beforeEach(async () => {
            await WeeklyForecastService.initialize();
        });

        it('должен вычислять метаданные для восходящего тренда', () => {
            const processedForecast = {
                candles: Array(7).fill(null).map((_, i) => ({
                    open: 100 + i * 2,
                    high: 105 + i * 2,
                    low: 95 + i * 2,
                    close: 102 + i * 2,
                    volume: 1000
                }))
            };

            const metadata = WeeklyForecastService.calculateForecastMetadata(processedForecast);

            expect(metadata).toBeDefined();
            expect(metadata.volatility).toBeGreaterThanOrEqual(0);
            expect(metadata.trend).toBe('BULLISH');
            expect(metadata.priceChange).toBeGreaterThan(0);
        });

        it('должен вычислять метаданные для нисходящего тренда', () => {
            const processedForecast = {
                candles: Array(7).fill(null).map((_, i) => ({
                    open: 100 - i * 2,
                    high: 105 - i * 2,
                    low: 95 - i * 2,
                    close: 102 - i * 2,
                    volume: 1000
                }))
            };

            const metadata = WeeklyForecastService.calculateForecastMetadata(processedForecast);

            expect(metadata).toBeDefined();
            expect(metadata.trend).toBe('BEARISH');
            expect(metadata.priceChange).toBeLessThan(0);
        });

        it('должен вычислять метаданные для бокового тренда', () => {
            const processedForecast = {
                candles: Array(7).fill(null).map(() => ({
                    open: 100,
                    high: 101,
                    low: 99,
                    close: 100,
                    volume: 1000
                }))
            };

            const metadata = WeeklyForecastService.calculateForecastMetadata(processedForecast);

            expect(metadata).toBeDefined();
            expect(metadata.trend).toBe('SIDEWAYS');
            expect(Math.abs(metadata.priceChange)).toBeLessThan(2);
        });

        it('должен возвращать нулевые метаданные для пустого прогноза', () => {
            const metadata = WeeklyForecastService.calculateForecastMetadata({ candles: [] });

            expect(metadata).toBeDefined();
            expect(metadata.volatility).toBe(0);
            expect(metadata.trend).toBeNull();
            expect(metadata.priceChange).toBe(0);
        });
    });

    describe('calculateCandleConfidence', () => {
        beforeEach(async () => {
            await WeeklyForecastService.initialize();
        });

        it('должен вычислять уверенность для валидной свечи', () => {
            const candle = {
                open: 100,
                high: 105,
                low: 95,
                close: 102,
                volume: 1000
            };

            const historicalCandles = Array(60).fill({
                open: 100,
                high: 105,
                low: 95,
                close: 100,
                volume: 1000
            });

            const confidence = WeeklyForecastService.calculateCandleConfidence(candle, historicalCandles, 0);

            expect(confidence).toBeGreaterThanOrEqual(0);
            expect(confidence).toBeLessThanOrEqual(1);
        });

        it('должен снижать уверенность для невалидной свечи', () => {
            const candle = {
                open: 100,
                high: 95, // Неправильно
                low: 105,
                close: 110,
                volume: 1000
            };

            const historicalCandles = Array(60).fill({
                open: 100,
                high: 105,
                low: 95,
                close: 100,
                volume: 1000
            });

            const confidence = WeeklyForecastService.calculateCandleConfidence(candle, historicalCandles, 0);

            expect(confidence).toBeLessThan(1);
        });

        it('должен снижать уверенность с каждым днем', () => {
            const candle = {
                open: 100,
                high: 105,
                low: 95,
                close: 102,
                volume: 1000
            };

            const historicalCandles = Array(60).fill({
                open: 100,
                high: 105,
                low: 95,
                close: 100,
                volume: 1000
            });

            const confidence1 = WeeklyForecastService.calculateCandleConfidence(candle, historicalCandles, 0);
            const confidence2 = WeeklyForecastService.calculateCandleConfidence(candle, historicalCandles, 3);
            const confidence3 = WeeklyForecastService.calculateCandleConfidence(candle, historicalCandles, 6);

            expect(confidence1).toBeGreaterThan(confidence2);
            expect(confidence2).toBeGreaterThan(confidence3);
        });
    });

    describe('generateForecast - интеграционные тесты', () => {
        beforeEach(async () => {
            await WeeklyForecastService.initialize();
        });

        it('должен выбрасывать ошибку для невалидного FIGI', async () => {
            await expect(
                WeeklyForecastService.generateForecast(null)
            ).rejects.toThrow('FIGI is required');
        });

        it('должен выбрасывать ошибку для несуществующего инструмента', async () => {
            // Мокируем CacheService.getInstrument
            const originalGetInstrument = CacheService.getInstrument;
            CacheService.getInstrument = jest.fn(async () => null);

            await expect(
                WeeklyForecastService.generateForecast('NONEXISTENT_FIGI')
            ).rejects.toThrow('Instrument not found');

            // Восстанавливаем оригинальный метод
            CacheService.getInstrument = originalGetInstrument;
        });

        it('должен возвращать кешированный прогноз если он свежий', async () => {
            if (!tableExists) {
                console.log('⏭️ Пропущен: таблица WeeklyForecast не доступна');
                return;
            }

            // Создаем свежий прогноз
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

            // Используем строки дат для DATEONLY полей
            const todayStr = today.toISOString().split('T')[0];
            const endDateStr = endDate.toISOString().split('T')[0];
            
            const existingForecast = await WeeklyForecast.create({
                figi: 'TEST_FIGI_CACHE',
                ticker: 'TEST',
                forecastDate: todayStr,
                startDate: todayStr,
                endDate: endDateStr,
                forecastData: forecastData,
                confidenceScore: 0.8,
                isCompleted: false
            });

            // Убеждаемся, что прогноз создан
            expect(existingForecast.id).toBeDefined();
            expect(existingForecast.figi).toBe('TEST_FIGI_CACHE');
            expect(existingForecast.isCompleted).toBe(false);
            
            // Проверяем, что объект создан правильно
            expect(existingForecast.id).toBeDefined();
            expect(existingForecast.figi).toBe('TEST_FIGI_CACHE');
            expect(existingForecast.isCompleted).toBe(false);
            
            // Преобразуем объект в JSON для использования в моке
            const forecastJson = existingForecast.toJSON ? existingForecast.toJSON() : {
                id: existingForecast.id,
                figi: existingForecast.figi,
                ticker: existingForecast.ticker,
                forecastDate: existingForecast.forecastDate,
                startDate: existingForecast.startDate,
                endDate: existingForecast.endDate,
                forecastData: existingForecast.forecastData,
                confidenceScore: existingForecast.confidenceScore,
                isCompleted: existingForecast.isCompleted
            };
            
            // Проверяем, что прогноз считается свежим
            const isFresh = WeeklyForecastService.isForecastFresh(forecastJson);
            expect(isFresh).toBe(true);
            
            // Мокируем getActiveForecast чтобы вернуть созданный прогноз
            await WeeklyForecastService.initialize();
            WeeklyForecastService.getActiveForecast = jest.fn().mockResolvedValue(forecastJson);

            // Мокируем CacheService чтобы не делать реальные запросы
            const originalGetInstrument = CacheService.getInstrument;
            const originalGetCandles = CacheService.getCandles;
            
            CacheService.getInstrument = jest.fn(async () => ({
                figi: 'TEST_FIGI_CACHE',
                ticker: 'TEST'
            }));
            
            // Мокируем getCandles чтобы возвращать достаточно данных для проверки кеша
            // Но метод должен вернуть кешированный прогноз до проверки данных
            CacheService.getCandles = jest.fn().mockResolvedValue(
                Array(60).fill(null).map((_, i) => ({
                    time: new Date(Date.now() - (60 - i) * 24 * 60 * 60 * 1000).toISOString(),
                    open: 100,
                    high: 105,
                    low: 95,
                    close: 100,
                    volume: 1000
                }))
            );

            const result = await WeeklyForecastService.generateForecast('TEST_FIGI_CACHE');

            expect(result.success).toBe(true);
            expect(result.cached).toBe(true);
            expect(result.forecast.id).toBe(existingForecast.id);

            // Восстанавливаем
            CacheService.getInstrument = originalGetInstrument;
            CacheService.getCandles = originalGetCandles;
        });
    });
});

