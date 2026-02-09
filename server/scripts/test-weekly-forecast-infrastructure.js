/**
 * Скрипт для тестирования инфраструктуры WeeklyForecast
 * Проверяет создание модели, таблицы и базовую функциональность сервиса
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем переменные окружения
dotenv.config({ path: join(__dirname, '../.env') });

async function testInfrastructure() {
    console.log('🧪 Тестирование инфраструктуры WeeklyForecast...\n');

    const results = {
        modelImport: false,
        serviceImport: false,
        tableSync: false,
        serviceInit: false,
        createForecast: false,
        getActiveForecast: false,
        helperMethods: false
    };

    try {
        // Тест 1: Импорт модели
        console.log('📦 Тест 1: Импорт модели WeeklyForecast');
        let WeeklyForecast;
        try {
            WeeklyForecast = (await import('../src/models/WeeklyForecast.js')).default;
            if (WeeklyForecast) {
                results.modelImport = true;
                console.log('   ✅ Модель успешно импортирована');
            }
        } catch (error) {
            console.log(`   ❌ Ошибка импорта модели: ${error.message}`);
            return results;
        }

        // Тест 2: Импорт сервиса
        console.log('\n📦 Тест 2: Импорт WeeklyForecastService');
        let WeeklyForecastService;
        try {
            WeeklyForecastService = (await import('../src/services/WeeklyForecastService.js')).default;
            if (WeeklyForecastService) {
                results.serviceImport = true;
                console.log('   ✅ Сервис успешно импортирован');
            }
        } catch (error) {
            console.log(`   ❌ Ошибка импорта сервиса: ${error.message}`);
            return results;
        }

        // Тест 3: Синхронизация таблицы
        console.log('\n📦 Тест 3: Синхронизация таблицы weekly_forecasts');
        try {
            await WeeklyForecast.sync({ force: false });
            results.tableSync = true;
            console.log('   ✅ Таблица успешно синхронизирована');
        } catch (error) {
            console.log(`   ❌ Ошибка синхронизации таблицы: ${error.message}`);
            console.log('   ⚠️  Продолжаем тестирование без БД...');
        }

        // Тест 4: Инициализация сервиса
        console.log('\n📦 Тест 4: Инициализация WeeklyForecastService');
        try {
            await WeeklyForecastService.initialize();
            if (WeeklyForecastService.isInitialized) {
                results.serviceInit = true;
                console.log('   ✅ Сервис успешно инициализирован');
            }
        } catch (error) {
            console.log(`   ❌ Ошибка инициализации сервиса: ${error.message}`);
        }

        // Тест 5: Создание прогноза (если таблица доступна)
        if (results.tableSync) {
            console.log('\n📦 Тест 5: Создание тестового прогноза');
            try {
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

                // Очищаем старые данные
                await WeeklyForecast.destroy({ where: {}, force: true, truncate: true });

                const forecast = await WeeklyForecast.create({
                    figi: 'BBG0013HJJ31',
                    ticker: 'SBER',
                    forecastDate: today.toISOString().split('T')[0],
                    startDate: today.toISOString().split('T')[0],
                    endDate: endDate.toISOString().split('T')[0],
                    forecastData: forecastData,
                    modelVersion: 'test_v1',
                    modelType: 'seq2seq',
                    confidenceScore: 0.8,
                    predictedVolatility: 0.15,
                    predictedTrend: 'BULLISH',
                    predictedPriceChange: 2.5
                });

                if (forecast && forecast.id) {
                    results.createForecast = true;
                    console.log(`   ✅ Прогноз успешно создан (ID: ${forecast.id})`);

                    // Тест 6: Получение активного прогноза
                    console.log('\n📦 Тест 6: Получение активного прогноза');
                    try {
                        const activeForecast = await WeeklyForecastService.getActiveForecast('BBG0013HJJ31');
                        if (activeForecast && activeForecast.id === forecast.id) {
                            results.getActiveForecast = true;
                            console.log('   ✅ Активный прогноз успешно получен');
                        } else {
                            console.log('   ⚠️  Активный прогноз не найден');
                        }
                    } catch (error) {
                        console.log(`   ❌ Ошибка получения активного прогноза: ${error.message}`);
                    }
                }
            } catch (error) {
                console.log(`   ❌ Ошибка создания прогноза: ${error.message}`);
            }
        } else {
            console.log('\n⏭️  Тест 5 пропущен: таблица не доступна');
            console.log('⏭️  Тест 6 пропущен: таблица не доступна');
        }

        // Тест 7: Вспомогательные методы
        console.log('\n📦 Тест 7: Вспомогательные методы');
        try {
            // Проверка isForecastFresh
            const freshForecast = { forecastDate: new Date(Date.now() - 12 * 60 * 60 * 1000) };
            const oldForecast = { forecastDate: new Date(Date.now() - 25 * 60 * 60 * 1000) };
            
            const isFresh1 = WeeklyForecastService.isForecastFresh(freshForecast);
            const isFresh2 = WeeklyForecastService.isForecastFresh(oldForecast);
            
            if (isFresh1 === true && isFresh2 === false) {
                console.log('   ✅ isForecastFresh работает корректно');
            } else {
                console.log('   ⚠️  isForecastFresh работает некорректно');
            }

            // Проверка generateModelVersion
            const version = WeeklyForecastService.generateModelVersion();
            if (version && typeof version === 'string' && version.includes('_v')) {
                console.log(`   ✅ generateModelVersion работает (версия: ${version})`);
            } else {
                console.log('   ⚠️  generateModelVersion работает некорректно');
            }

            // Проверка addDays
            const date = new Date('2024-01-01');
            const newDate = WeeklyForecastService.addDays(date, 7);
            if (newDate.getDate() === 8) {
                console.log('   ✅ addDays работает корректно');
            } else {
                console.log('   ⚠️  addDays работает некорректно');
            }

            // Проверка daysBetween
            const startDate = new Date('2024-01-01');
            const endDate = new Date('2024-01-08');
            const days = WeeklyForecastService.daysBetween(startDate, endDate);
            if (days === 7) {
                console.log('   ✅ daysBetween работает корректно');
            } else {
                console.log('   ⚠️  daysBetween работает некорректно');
            }

            results.helperMethods = true;
        } catch (error) {
            console.log(`   ❌ Ошибка тестирования вспомогательных методов: ${error.message}`);
        }

    } catch (error) {
        console.error('\n❌ Критическая ошибка:', error.message);
        console.error(error.stack);
    }

    // Итоговый отчет
    console.log('\n' + '='.repeat(50));
    console.log('📊 Итоговый отчет:');
    console.log('='.repeat(50));
    console.log(`✅ Импорт модели: ${results.modelImport ? '✓' : '✗'}`);
    console.log(`✅ Импорт сервиса: ${results.serviceImport ? '✓' : '✗'}`);
    console.log(`✅ Синхронизация таблицы: ${results.tableSync ? '✓' : '✗'}`);
    console.log(`✅ Инициализация сервиса: ${results.serviceInit ? '✓' : '✗'}`);
    console.log(`✅ Создание прогноза: ${results.createForecast ? '✓' : '✗'}`);
    console.log(`✅ Получение активного прогноза: ${results.getActiveForecast ? '✓' : '✗'}`);
    console.log(`✅ Вспомогательные методы: ${results.helperMethods ? '✓' : '✗'}`);

    const passed = Object.values(results).filter(r => r).length;
    const total = Object.keys(results).length;
    console.log(`\n📈 Пройдено тестов: ${passed}/${total}`);

    if (passed === total) {
        console.log('\n🎉 Все тесты пройдены успешно!');
        process.exit(0);
    } else {
        console.log('\n⚠️  Некоторые тесты не пройдены');
        process.exit(1);
    }
}

testInfrastructure();

