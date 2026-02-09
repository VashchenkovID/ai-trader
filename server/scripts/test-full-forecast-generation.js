/**
 * Полный тест генерации недельного прогноза
 * Требует доступ к БД и реальный FIGI инструмента
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем переменные окружения
dotenv.config({ path: join(__dirname, '../.env') });

async function testFullForecastGeneration() {
    console.log('🧪 Полный тест генерации недельного прогноза...\n');

    // Можно изменить FIGI для тестирования
    const testFigi = process.argv[2] || 'BBG0013HJJ31'; // SBER по умолчанию
    
    console.log(`📊 Тестируем генерацию прогноза для FIGI: ${testFigi}\n`);

    try {
        // Импортируем сервисы
        const WeeklyForecastService = (await import('../src/services/WeeklyForecastService.js')).default;
        const CacheService = (await import('../src/services/CacheService.js')).default;
        const WeeklyForecast = (await import('../src/models/WeeklyForecast.js')).default;

        // Инициализируем сервисы
        console.log('📦 Инициализация сервисов...');
        await CacheService.initialize();
        await WeeklyForecastService.initialize();
        console.log('   ✅ Сервисы инициализированы\n');

        // Проверяем доступность инструмента
        console.log('📦 Проверка доступности инструмента...');
        const instrument = await CacheService.getInstrument(testFigi, true);
        if (!instrument) {
            console.error(`   ❌ Инструмент не найден: ${testFigi}`);
            console.log('   💡 Попробуйте другой FIGI или обновите кеш инструментов');
            process.exit(1);
        }
        console.log(`   ✅ Инструмент найден: ${instrument.ticker} - ${instrument.name || 'N/A'}\n`);

        // Проверяем наличие исторических данных
        console.log('📦 Проверка исторических данных...');
        const candles = await CacheService.getCandles(testFigi, 'DAY', 90, true);
        if (candles.length < 60) {
            console.error(`   ❌ Недостаточно данных: ${candles.length} свечей (минимум 60)`);
            console.log('   💡 Попробуйте обновить кеш свечей');
            process.exit(1);
        }
        console.log(`   ✅ Исторических данных: ${candles.length} свечей\n`);

        // Генерируем прогноз
        console.log('📦 Генерация прогноза...');
        console.log('   ⏳ Это может занять некоторое время...\n');
        
        const startTime = Date.now();
        
        const result = await WeeklyForecastService.generateForecast(testFigi, {
            modelType: 'seq2seq',
            forceRegenerate: false,
            historicalDays: 90,
            includeMacro: false, // Упрощаем для первого теста
            includeNews: false
        });
        
        const duration = Date.now() - startTime;

        if (result.success) {
            console.log('   ✅ Прогноз успешно сгенерирован!\n');
            console.log('📊 Результаты:');
            console.log('='.repeat(50));
            console.log(`   FIGI: ${result.forecast.figi}`);
            console.log(`   Ticker: ${result.forecast.ticker}`);
            console.log(`   Дата создания: ${result.forecast.forecastDate}`);
            console.log(`   Период: ${result.forecast.startDate} - ${result.forecast.endDate}`);
            console.log(`   Уверенность: ${(parseFloat(result.forecast.confidenceScore || 0) * 100).toFixed(2)}%`);
            console.log(`   Тренд: ${result.forecast.predictedTrend || 'N/A'}`);
            
            // Обрабатываем predictedPriceChange (может быть строкой из БД)
            const priceChange = result.forecast.predictedPriceChange;
            const priceChangeValue = priceChange !== null && priceChange !== undefined 
                ? (typeof priceChange === 'string' ? parseFloat(priceChange) : priceChange)
                : null;
            console.log(`   Изменение цены: ${priceChangeValue !== null ? priceChangeValue.toFixed(2) : 'N/A'}%`);
            
            // Обрабатываем predictedVolatility (может быть строкой из БД)
            const volatility = result.forecast.predictedVolatility;
            const volatilityValue = volatility !== null && volatility !== undefined
                ? (typeof volatility === 'string' ? parseFloat(volatility) : volatility)
                : null;
            console.log(`   Волатильность: ${volatilityValue !== null ? volatilityValue.toFixed(6) : 'N/A'}`);
            console.log(`   Версия модели: ${result.forecast.modelVersion || 'N/A'}`);
            console.log(`   Тип модели: ${result.forecast.modelType}`);
            console.log(`   Кеширован: ${result.cached ? 'Да' : 'Нет'}`);
            console.log(`   Время генерации: ${(duration / 1000).toFixed(2)} сек\n`);

            // Показываем прогноз по дням
            if (result.forecast.forecastData && Array.isArray(result.forecast.forecastData)) {
                console.log('📈 Прогноз по дням:');
                console.log('='.repeat(50));
                result.forecast.forecastData.forEach((candle, index) => {
                    // Безопасное преобразование значений
                    const formatNumber = (value, decimals = 2) => {
                        if (value === null || value === undefined) return 'N/A';
                        const num = typeof value === 'string' ? parseFloat(value) : value;
                        return isNaN(num) ? 'N/A' : num.toFixed(decimals);
                    };
                    
                    console.log(`   День ${index + 1} (${candle.date || 'N/A'}):`);
                    console.log(`      Open: ${formatNumber(candle.open)}`);
                    console.log(`      High: ${formatNumber(candle.high)}`);
                    console.log(`      Low: ${formatNumber(candle.low)}`);
                    console.log(`      Close: ${formatNumber(candle.close)}`);
                    console.log(`      Volume: ${formatNumber(candle.volume, 0)}`);
                    
                    const confidence = candle.confidence;
                    const confidenceValue = confidence !== null && confidence !== undefined
                        ? (typeof confidence === 'string' ? parseFloat(confidence) : confidence)
                        : null;
                    console.log(`      Confidence: ${confidenceValue !== null ? (confidenceValue * 100).toFixed(2) : 'N/A'}%`);
                    console.log('');
                });
            }

            // Проверяем сохранение в БД
            const savedForecast = await WeeklyForecast.findByPk(result.forecast.id);
            if (savedForecast) {
                console.log('✅ Прогноз сохранен в БД');
                console.log(`   ID: ${savedForecast.id}`);
            } else {
                console.log('⚠️  Прогноз не найден в БД (возможно, проблема с сохранением)');
            }

            console.log('\n🎉 Тест завершен успешно!');
            process.exit(0);
        } else {
            console.error('   ❌ Ошибка генерации прогноза');
            process.exit(1);
        }

    } catch (error) {
        console.error('\n❌ Ошибка при генерации прогноза:');
        console.error(`   Сообщение: ${error.message}`);
        console.error(`   Stack: ${error.stack}`);
        
        // Полезные советы
        console.log('\n💡 Возможные причины:');
        console.log('   1. Инструмент не найден - проверьте FIGI или обновите кеш');
        console.log('   2. Недостаточно исторических данных - обновите кеш свечей');
        console.log('   3. Проблемы с БД - проверьте подключение');
        console.log('   4. Ошибка модели - проверьте логи');
        
        process.exit(1);
    }
}

// Запускаем тест
testFullForecastGeneration();

