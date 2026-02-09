/**
 * Скрипт для тестирования генерации прогнозов на разных инструментах
 * Используется для проверки производительности и качества прогнозов
 */

import WeeklyForecastService from '../src/services/WeeklyForecastService.js';
import CacheService from '../src/services/CacheService.js';
import LoggerService from '../src/services/LoggerService.js';

// Список инструментов для тестирования
const TEST_INSTRUMENTS = [
    { figi: 'BBG0013HJJ31', ticker: 'SBER' }, // Сбербанк
    { figi: 'BBG004730N88', ticker: 'GAZP' }, // Газпром
    { figi: 'BBG004730ZJ9', ticker: 'LKOH' }, // Лукойл
    { figi: 'BBG004730RP0', ticker: 'YNDX' }, // Яндекс
    { figi: 'BBG004S681W4', ticker: 'VTBR' }, // ВТБ
];

async function testForecastGeneration() {
    try {
        console.log('🚀 Инициализация сервисов...');
        
        // Инициализация сервисов
        if (!LoggerService.isInitialized) {
            await LoggerService.initialize();
        }
        
        if (!CacheService.isInitialized) {
            await CacheService.initialize();
        }
        
        if (!WeeklyForecastService.isInitialized) {
            await WeeklyForecastService.initialize();
        }
        
        console.log('✅ Сервисы инициализированы\n');
        
        const results = [];
        const startTime = Date.now();
        
        // Тестируем каждый инструмент
        for (const instrument of TEST_INSTRUMENTS) {
            console.log(`\n📊 Тестирование ${instrument.ticker} (${instrument.figi})...`);
            
            try {
                const instrumentStartTime = Date.now();
                
                // Проверяем наличие данных
                const candles = await CacheService.getCandles(instrument.figi, 'DAY', 90, true);
                
                if (!candles || candles.length < 60) {
                    console.log(`⚠️  Недостаточно данных для ${instrument.ticker} (${candles?.length || 0} свечей)`);
                    results.push({
                        instrument: instrument.ticker,
                        figi: instrument.figi,
                        success: false,
                        error: 'Insufficient data',
                        executionTime: Date.now() - instrumentStartTime
                    });
                    continue;
                }
                
                // Генерируем прогноз
                const result = await WeeklyForecastService.generateForecast(instrument.figi, {
                    forceRegenerate: true
                });
                
                const executionTime = Date.now() - instrumentStartTime;
                
                if (result.success) {
                    console.log(`✅ Прогноз успешно сгенерирован за ${executionTime}ms`);
                    console.log(`   Уверенность: ${(result.forecast.confidenceScore * 100).toFixed(1)}%`);
                    console.log(`   Тренд: ${result.forecast.predictedTrend || 'Не определен'}`);
                    console.log(`   Изменение цены: ${result.forecast.predictedPriceChange !== null && result.forecast.predictedPriceChange !== undefined ? result.forecast.predictedPriceChange.toFixed(2) + '%' : 'Не определено'}`);
                    
                    results.push({
                        instrument: instrument.ticker,
                        figi: instrument.figi,
                        success: true,
                        executionTime,
                        confidence: result.forecast.confidenceScore,
                        trend: result.forecast.predictedTrend,
                        priceChange: result.forecast.predictedPriceChange
                    });
                } else {
                    console.log(`❌ Ошибка генерации прогноза: ${result.error || 'Unknown error'}`);
                    results.push({
                        instrument: instrument.ticker,
                        figi: instrument.figi,
                        success: false,
                        error: result.error || 'Unknown error',
                        executionTime
                    });
                }
            } catch (error) {
                const executionTime = Date.now() - instrumentStartTime;
                console.log(`❌ Ошибка для ${instrument.ticker}: ${error.message}`);
                results.push({
                    instrument: instrument.ticker,
                    figi: instrument.figi,
                    success: false,
                    error: error.message,
                    executionTime
                });
            }
        }
        
        const totalTime = Date.now() - startTime;
        
        // Выводим статистику
        console.log('\n' + '='.repeat(60));
        console.log('📈 ИТОГОВАЯ СТАТИСТИКА');
        console.log('='.repeat(60));
        
        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);
        
        console.log(`\n✅ Успешно: ${successful.length}/${results.length}`);
        console.log(`❌ Ошибок: ${failed.length}/${results.length}`);
        console.log(`⏱️  Общее время: ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`);
        
        if (successful.length > 0) {
            const avgTime = successful.reduce((sum, r) => sum + r.executionTime, 0) / successful.length;
            const minTime = Math.min(...successful.map(r => r.executionTime));
            const maxTime = Math.max(...successful.map(r => r.executionTime));
            
            console.log(`\n⏱️  Время выполнения:`);
            console.log(`   Среднее: ${avgTime.toFixed(0)}ms`);
            console.log(`   Минимальное: ${minTime}ms`);
            console.log(`   Максимальное: ${maxTime}ms`);
            
            const avgConfidence = successful.reduce((sum, r) => sum + (r.confidence || 0), 0) / successful.length;
            console.log(`\n📊 Средняя уверенность: ${(avgConfidence * 100).toFixed(1)}%`);
        }
        
        // Выводим метрики производительности
        const perfMetrics = WeeklyForecastService.getPerformanceMetrics();
        console.log(`\n📊 Метрики производительности:`);
        console.log(`   Генерация прогнозов:`);
        console.log(`     Всего: ${perfMetrics.generateForecast.count}`);
        console.log(`     Среднее время: ${perfMetrics.generateForecast.averageTime.toFixed(0)}ms`);
        console.log(`     Минимум: ${perfMetrics.generateForecast.minTime === Infinity ? 'N/A' : perfMetrics.generateForecast.minTime + 'ms'}`);
        console.log(`     Максимум: ${perfMetrics.generateForecast.maxTime}ms`);
        console.log(`     Ошибок: ${perfMetrics.generateForecast.errors}`);
        console.log(`   Кэш моделей: ${perfMetrics.cacheStats.modelCacheSize} моделей`);
        console.log(`   Кэш features: ${perfMetrics.cacheStats.featuresCacheSize} записей`);
        
        if (failed.length > 0) {
            console.log(`\n❌ Ошибки:`);
            failed.forEach(r => {
                console.log(`   ${r.instrument}: ${r.error}`);
            });
        }
        
        console.log('\n' + '='.repeat(60));
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Критическая ошибка:', error);
        process.exit(1);
    }
}

// Запуск тестирования
testForecastGeneration();

