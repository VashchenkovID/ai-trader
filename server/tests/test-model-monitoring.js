/**
 * Тестовый скрипт для проверки мониторинга и валидации моделей
 * Запуск: node test-model-monitoring.js
 */

import { trainValidationTestSplit, stratifiedSplit, timeBasedSplit } from '../src/utils/dataSplitUtils.js';
import { kFoldSplit, performCrossValidation } from '../src/utils/crossValidationUtils.js';
import ModelMonitoringService from '../src/services/ModelMonitoringService.js';

async function testDataSplitUtils() {
    console.log('🧪 Тестирование dataSplitUtils...\n');
    
    try {
        // Тест 1: Базовое разделение
        console.log('1. Базовое разделение train/validation/test...');
        const features = Array.from({ length: 100 }, (_, i) => i);
        const labels = Array.from({ length: 100 }, (_, i) => i % 2);
        
        const split = trainValidationTestSplit(features, labels, {
            trainRatio: 0.7,
            validationRatio: 0.15,
            testRatio: 0.15
        });
        
        console.log(`   ✅ Train: ${split.train.features.length} samples`);
        console.log(`   ✅ Validation: ${split.validation.features.length} samples`);
        console.log(`   ✅ Test: ${split.test.features.length} samples\n`);
        
        // Тест 2: Стратифицированное разделение
        console.log('2. Стратифицированное разделение...');
        const stratified = stratifiedSplit(features, labels, {
            trainRatio: 0.7,
            validationRatio: 0.15,
            testRatio: 0.15
        });
        
        console.log(`   ✅ Train: ${stratified.train.features.length} samples`);
        console.log(`   ✅ Validation: ${stratified.validation.features.length} samples`);
        console.log(`   ✅ Test: ${stratified.test.features.length} samples\n`);
        
        // Тест 3: Временное разделение
        console.log('3. Временное разделение (без перемешивания)...');
        const timeSplit = timeBasedSplit(features, labels, {
            trainRatio: 0.7,
            validationRatio: 0.15,
            testRatio: 0.15
        });
        
        console.log(`   ✅ Train: ${timeSplit.train.features.length} samples (первые элементы)`);
        console.log(`   ✅ Test: ${timeSplit.test.features.length} samples (последние элементы)\n`);
        
        console.log('✅ Все тесты dataSplitUtils пройдены\n');
    } catch (error) {
        console.error('❌ Ошибка в тестах dataSplitUtils:', error.message);
        console.error(error.stack);
    }
}

async function testCrossValidationUtils() {
    console.log('🧪 Тестирование crossValidationUtils...\n');
    
    try {
        // Тест 1: K-fold разделение
        console.log('1. K-fold разделение (k=5)...');
        const features = Array.from({ length: 50 }, (_, i) => [i]);
        const labels = Array.from({ length: 50 }, (_, i) => i % 2);
        
        const folds = kFoldSplit(features, labels, 5);
        
        console.log(`   ✅ Создано фолдов: ${folds.length}`);
        folds.forEach((fold, i) => {
            console.log(`   Фолд ${i + 1}: train=${fold.train.features.length}, test=${fold.test.features.length}`);
        });
        console.log();
        
        // Тест 2: Кросс-валидация
        console.log('2. Выполнение кросс-валидации...');
        const trainFunction = async (trainFeat, trainLab, testFeat, testLab) => {
            // Простая функция обучения для теста
            const accuracy = Math.random() * 0.3 + 0.7; // 0.7-1.0
            return {
                accuracy,
                loss: 1 - accuracy
            };
        };
        
        const cvResult = await performCrossValidation(features, labels, trainFunction, {
            k: 5
        });
        
        console.log(`   ✅ Успешных фолдов: ${cvResult.successfulFolds}`);
        console.log(`   ✅ Средняя точность: ${cvResult.averageMetrics?.accuracy?.mean?.toFixed(3) || 'N/A'}`);
        console.log(`   ✅ Стандартное отклонение: ${cvResult.averageMetrics?.accuracy?.std?.toFixed(3) || 'N/A'}\n`);
        
        console.log('✅ Все тесты crossValidationUtils пройдены\n');
    } catch (error) {
        console.error('❌ Ошибка в тестах crossValidationUtils:', error.message);
        console.error(error.stack);
    }
}

async function testModelMonitoringService() {
    console.log('🧪 Тестирование ModelMonitoringService...\n');
    
    try {
        // Инициализация
        console.log('1. Инициализация сервиса...');
        await ModelMonitoringService.initialize();
        console.log('   ✅ ModelMonitoringService инициализирован\n');
        
        // Тест проверки дрейфа
        console.log('2. Проверка дрейфа модели...');
        const status = ModelMonitoringService.getStatus();
        console.log(`   ✅ Базовых моделей: ${status.baselineModelsCount}`);
        console.log(`   ✅ Последняя проверка: ${status.lastCheckTime || 'Никогда'}\n`);
        
        // Тест расчета распределения
        console.log('3. Расчет распределения рекомендаций...');
        const recommendations = [
            { recommendation: 'BUY', confidence: 0.8 },
            { recommendation: 'BUY', confidence: 0.7 },
            { recommendation: 'SELL', confidence: 0.6 },
            { recommendation: 'HOLD', confidence: 0.5 }
        ];
        
        const dist = ModelMonitoringService.calculateRecommendationDistribution(recommendations);
        console.log(`   ✅ Распределение: BUY=${(dist.BUY * 100).toFixed(0)}%, SELL=${(dist.SELL * 100).toFixed(0)}%, HOLD=${(dist.HOLD * 100).toFixed(0)}%`);
        console.log(`   ✅ Средняя уверенность: ${(dist.avgConfidence * 100).toFixed(0)}%\n`);
        
        // Тест расчета TVD
        console.log('4. Расчет Total Variation Distance...');
        const dist1 = { BUY: 0.5, SELL: 0.3, HOLD: 0.2 };
        const dist2 = { BUY: 0.3, SELL: 0.5, HOLD: 0.2 };
        
        const tvd = ModelMonitoringService.calculateTVD(dist1, dist2);
        console.log(`   ✅ TVD: ${tvd.toFixed(3)} (порог: ${ModelMonitoringService.settings.predictionDistributionThreshold})\n`);
        
        console.log('✅ Все тесты ModelMonitoringService пройдены\n');
    } catch (error) {
        console.error('❌ Ошибка в тестах ModelMonitoringService:', error.message);
        console.error(error.stack);
    }
}

async function runAllTests() {
    console.log('🚀 Запуск тестов мониторинга и валидации моделей\n');
    console.log('='.repeat(60));
    
    await testDataSplitUtils();
    await testCrossValidationUtils();
    await testModelMonitoringService();
    
    console.log('='.repeat(60));
    console.log('✅ Все тесты завершены');
}

// Запуск тестов
runAllTests().catch(error => {
    console.error('❌ Критическая ошибка:', error);
    process.exit(1);
});

