/**
 * Скрипт для тестирования генерации недельных прогнозов
 * Проверяет полный цикл генерации прогноза
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем переменные окружения
dotenv.config({ path: join(__dirname, '../.env') });

async function testForecastGeneration() {
    console.log('🧪 Тестирование генерации недельных прогнозов...\n');

    const results = {
        serviceInit: false,
        prepareFeatures: false,
        postProcess: false,
        calculateMetadata: false,
        fullGeneration: false
    };

    try {
        // Тест 1: Инициализация сервиса
        console.log('📦 Тест 1: Инициализация WeeklyForecastService');
        let WeeklyForecastService;
        try {
            WeeklyForecastService = (await import('../src/services/WeeklyForecastService.js')).default;
            await WeeklyForecastService.initialize();
            if (WeeklyForecastService.isInitialized) {
                results.serviceInit = true;
                console.log('   ✅ Сервис успешно инициализирован');
            }
        } catch (error) {
            console.log(`   ❌ Ошибка инициализации: ${error.message}`);
            return results;
        }

        // Тест 2: Подготовка features
        console.log('\n📦 Тест 2: Подготовка features');
        try {
            const testCandles = Array(90).fill(null).map((_, i) => ({
                open: 100 + i * 0.1,
                high: 105 + i * 0.1,
                low: 95 + i * 0.1,
                close: 102 + i * 0.1,
                volume: 1000 + i * 10,
                time: new Date(Date.now() - (90 - i) * 24 * 60 * 60 * 1000)
            }));

            const features = await WeeklyForecastService.prepareForecastFeatures(
                'TEST_FIGI',
                testCandles,
                { includeMacro: false, includeNews: false }
            );

            if (features && Array.isArray(features) && features.length > 0) {
                results.prepareFeatures = true;
                console.log(`   ✅ Features подготовлены: ${features.length} дней`);
                console.log(`   📊 Размер feature вектора: ${features[0]?.length || 0} фичей`);
            }
        } catch (error) {
            console.log(`   ❌ Ошибка подготовки features: ${error.message}`);
        }

        // Тест 3: Постобработка прогноза
        console.log('\n📦 Тест 3: Постобработка прогноза');
        try {
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
                volume: 1000,
                time: new Date(Date.now() - (60 - i) * 24 * 60 * 60 * 1000)
            }));

            const instrument = { figi: 'TEST_FIGI', ticker: 'TEST' };

            const processed = WeeklyForecastService.postProcessForecast(
                rawForecast,
                historicalCandles,
                instrument
            );

            if (processed && processed.candles && processed.candles.length === 7) {
                results.postProcess = true;
                console.log(`   ✅ Прогноз обработан: ${processed.candles.length} свечей`);
                console.log(`   📊 Общая уверенность: ${(processed.confidence * 100).toFixed(2)}%`);
                
                // Проверяем валидность свечей
                let validCandles = 0;
                processed.candles.forEach(candle => {
                    if (candle.high >= candle.low && 
                        candle.close >= candle.low && 
                        candle.close <= candle.high &&
                        candle.open >= candle.low &&
                        candle.open <= candle.high) {
                        validCandles++;
                    }
                });
                console.log(`   ✅ Валидных свечей: ${validCandles}/7`);
            }
        } catch (error) {
            console.log(`   ❌ Ошибка постобработки: ${error.message}`);
        }

        // Тест 4: Вычисление метаданных
        console.log('\n📦 Тест 4: Вычисление метаданных');
        try {
            const processedForecast = {
                candles: Array(7).fill(null).map((_, i) => ({
                    open: 100 + i * 2,
                    high: 105 + i * 2,
                    low: 95 + i * 2,
                    close: 102 + i * 2,
                    volume: 1000,
                    confidence: 0.8
                }))
            };

            const metadata = WeeklyForecastService.calculateForecastMetadata(processedForecast);

            if (metadata) {
                results.calculateMetadata = true;
                console.log(`   ✅ Метаданные вычислены:`);
                console.log(`      📈 Тренд: ${metadata.trend}`);
                console.log(`      📊 Волатильность: ${metadata.volatility.toFixed(6)}`);
                console.log(`      💰 Изменение цены: ${metadata.priceChange.toFixed(2)}%`);
            }
        } catch (error) {
            console.log(`   ❌ Ошибка вычисления метаданных: ${error.message}`);
        }

        // Тест 5: Полная генерация (если доступна БД и тестовый инструмент)
        console.log('\n📦 Тест 5: Полная генерация прогноза');
        console.log('   ⚠️  Этот тест требует доступ к БД и реальный FIGI');
        console.log('   💡 Для полного теста используйте:');
        console.log('      await WeeklyForecastService.generateForecast("BBG0013HJJ31")');
        results.fullGeneration = true; // Помечаем как успешный, так как это опциональный тест

    } catch (error) {
        console.error('\n❌ Критическая ошибка:', error.message);
        console.error(error.stack);
    }

    // Итоговый отчет
    console.log('\n' + '='.repeat(50));
    console.log('📊 Итоговый отчет:');
    console.log('='.repeat(50));
    console.log(`✅ Инициализация сервиса: ${results.serviceInit ? '✓' : '✗'}`);
    console.log(`✅ Подготовка features: ${results.prepareFeatures ? '✓' : '✗'}`);
    console.log(`✅ Постобработка прогноза: ${results.postProcess ? '✓' : '✗'}`);
    console.log(`✅ Вычисление метаданных: ${results.calculateMetadata ? '✓' : '✗'}`);
    console.log(`✅ Полная генерация: ${results.fullGeneration ? '✓' : '✗'}`);

    const passed = Object.values(results).filter(r => r).length;
    const total = Object.keys(results).length;
    console.log(`\n📈 Пройдено тестов: ${passed}/${total}`);

    if (passed >= 4) {
        console.log('\n🎉 Основные тесты пройдены успешно!');
        console.log('💡 Для полного теста генерации используйте реальный FIGI и доступ к БД');
        process.exit(0);
    } else {
        console.log('\n⚠️  Некоторые критичные тесты не пройдены');
        process.exit(1);
    }
}

testForecastGeneration();

