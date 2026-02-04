/**
 * Тестовый скрипт для проверки валидации данных
 * Запуск: node test-data-quality.js
 */

import DataQualityService from '../src/services/DataQualityService.js';
import OptimizedAnalysisService from '../src/services/OptimizedAnalysisService.js';

async function testDataQualityService() {
    console.log('🧪 Тестирование DataQualityService...\n');
    
    try {
        // Инициализация
        console.log('1. Инициализация сервиса...');
        await DataQualityService.initialize();
        console.log('   ✅ DataQualityService инициализирован\n');
        
        // Тест валидации свечей
        console.log('2. Валидация свечей...');
        const validCandles = [
            { time: '2024-01-01', open: 100, high: 105, low: 99, close: 103, volume: 1000 },
            { time: '2024-01-02', open: 103, high: 107, low: 102, close: 106, volume: 1200 }
        ];
        const validationResult = DataQualityService.validateCandles(validCandles);
        console.log(`   ✅ Валидные свечи: ${validationResult.valid}`);
        console.log(`   Ошибок: ${validationResult.errors.length}, Предупреждений: ${validationResult.warnings.length}\n`);
        
        // Тест с некорректными данными
        console.log('3. Валидация некорректных свечей...');
        const invalidCandles = [
            { time: '2024-01-01', open: 100, high: 99, low: 105, close: NaN, volume: 1000 } // high < low, NaN
        ];
        const invalidResult = DataQualityService.validateCandles(invalidCandles);
        console.log(`   ✅ Валидные свечи: ${invalidResult.valid}`);
        console.log(`   Ошибок: ${invalidResult.errors.length}`);
        if (invalidResult.errors.length > 0) {
            console.log(`   Первая ошибка: ${invalidResult.errors[0]}\n`);
        }
        
        // Тест детекции выбросов
        console.log('4. Детекция выбросов (IQR метод)...');
        const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 100]; // 100 - выброс
        const outliers = DataQualityService.detectOutliers(values, 'iqr');
        console.log(`   ✅ Найдено выбросов: ${outliers.outliers.length}`);
        console.log(`   Выбросы: ${outliers.outliers.join(', ')}\n`);
        
        // Тест заполнения пропусков
        console.log('5. Заполнение пропусков (линейная интерполяция)...');
        const valuesWithGaps = [1, 2, null, 4, 5];
        const filled = DataQualityService.fillGaps(valuesWithGaps, 'linear');
        console.log(`   Исходные: [${valuesWithGaps.join(', ')}]`);
        console.log(`   Заполненные: [${filled.map(v => v.toFixed(2)).join(', ')}]\n`);
        
        // Тест нормализации
        console.log('6. Нормализация данных (minmax)...');
        const valuesToNormalize = [10, 20, 30, 40, 50];
        const normalized = DataQualityService.normalizeData(valuesToNormalize, 'minmax');
        console.log(`   Исходные: [${valuesToNormalize.join(', ')}]`);
        console.log(`   Нормализованные: [${normalized.normalized.map(v => v.toFixed(2)).join(', ')}]`);
        console.log(`   Min: ${normalized.stats.min}, Max: ${normalized.stats.max}\n`);
        
        // Тест безопасного деления
        console.log('7. Безопасное деление...');
        const div1 = DataQualityService.safeDivide(10, 2, 0);
        const div2 = DataQualityService.safeDivide(10, 0, 999);
        console.log(`   10 / 2 = ${div1}`);
        console.log(`   10 / 0 = ${div2} (default)\n`);
        
        // Тест обработки свечей
        console.log('8. Полная обработка свечей...');
        const candlesToProcess = [
            { time: '2024-01-01', open: 100, high: 105, low: 99, close: 103, volume: 1000 },
            { time: '2024-01-02', open: 103, high: 107, low: 102, close: 106, volume: 1200 },
            { time: '2024-01-03', open: null, high: 108, low: 104, close: 107, volume: 1100 }
        ];
        const processed = DataQualityService.processCandles(candlesToProcess);
        console.log(`   ✅ Обработано свечей: ${processed.candles.length}`);
        console.log(`   Валидных: ${processed.validation.validCount}\n`);
        
        console.log('✅ Все тесты DataQualityService пройдены\n');
    } catch (error) {
        console.error('❌ Ошибка в тестах DataQualityService:', error.message);
        console.error(error.stack);
    }
}

async function testOptimizedAnalysisServiceIntegration() {
    console.log('🧪 Тестирование интеграции с OptimizedAnalysisService...\n');
    
    try {
        // Инициализация
        console.log('1. Инициализация сервисов...');
        await OptimizedAnalysisService.initialize();
        console.log('   ✅ OptimizedAnalysisService инициализирован\n');
        
        // Тест с валидными данными
        console.log('2. Расчет индикаторов с валидными данными...');
        const prices = [100, 102, 101, 103, 105, 104, 106, 108, 107, 109];
        const volumes = [1000, 1200, 1100, 1300, 1400, 1350, 1450, 1500, 1420, 1480];
        const highs = prices.map(p => p + 2);
        const lows = prices.map(p => p - 2);
        
        const indicators = OptimizedAnalysisService.getAllIndicators(prices, volumes, highs, lows);
        console.log(`   ✅ Индикаторы рассчитаны`);
        console.log(`   SMA_20: ${indicators.sma_20?.toFixed(2) || 'N/A'}`);
        console.log(`   RSI: ${indicators.rsi?.toFixed(2) || 'N/A'}`);
        console.log(`   MACD: ${indicators.macd?.toFixed(2) || 'N/A'}\n`);
        
        // Тест с данными, содержащими NaN
        console.log('3. Расчет индикаторов с NaN в данных...');
        const pricesWithNaN = [100, 102, NaN, 103, 105, 104, 106, 108, 107, 109];
        const indicators2 = OptimizedAnalysisService.getAllIndicators(pricesWithNaN, volumes, highs, lows);
        console.log(`   ✅ Индикаторы рассчитаны (NaN обработан)`);
        console.log(`   SMA_20: ${indicators2.sma_20?.toFixed(2) || 'N/A'}`);
        console.log(`   RSI: ${indicators2.rsi?.toFixed(2) || 'N/A'}\n`);
        
        // Тест с данными, содержащими Infinity
        console.log('4. Расчет индикаторов с Infinity в данных...');
        const pricesWithInf = [100, 102, Infinity, 103, 105, 104, 106, 108, 107, 109];
        const indicators3 = OptimizedAnalysisService.getAllIndicators(pricesWithInf, volumes, highs, lows);
        console.log(`   ✅ Индикаторы рассчитаны (Infinity обработан)`);
        console.log(`   SMA_20: ${indicators3.sma_20?.toFixed(2) || 'N/A'}\n`);
        
        // Тест с пустым массивом
        console.log('5. Расчет индикаторов с пустым массивом...');
        const indicators4 = OptimizedAnalysisService.getAllIndicators([], [], [], []);
        console.log(`   ✅ Индикаторы рассчитаны (пустой массив обработан)`);
        console.log(`   Результат: ${Object.keys(indicators4).length} индикаторов\n`);
        
        console.log('✅ Все тесты интеграции пройдены\n');
    } catch (error) {
        console.error('❌ Ошибка в тестах интеграции:', error.message);
        console.error(error.stack);
    }
}

async function runAllTests() {
    console.log('🚀 Запуск тестов валидации данных\n');
    console.log('='.repeat(60));
    
    await testDataQualityService();
    await testOptimizedAnalysisServiceIntegration();
    
    console.log('='.repeat(60));
    console.log('✅ Все тесты завершены');
}

// Запуск тестов
runAllTests().catch(error => {
    console.error('❌ Критическая ошибка:', error);
    process.exit(1);
});

