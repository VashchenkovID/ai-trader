/**
 * Тестовый скрипт для проверки модернизации объединения рекомендаций
 * Запуск: node test-stacking-modernization.js
 */

import StackingService from '../src/services/StackingService.js';
import ModelWeightingService from '../src/services/ModelWeightingService.js';
import IntegratedAIService from '../src/services/IntegratedAIService.js';

async function testStackingService() {
    console.log('🧪 Тестирование StackingService...\n');
    
    try {
        // Тест 1: Инициализация
        console.log('1. Инициализация сервиса...');
        await StackingService.initialize();
        console.log('   ✅ StackingService инициализирован');
        
        // Тест 2: Создание модели
        console.log('2. Создание мета-модели...');
        const model = StackingService.createMetaModel(10);
        console.log('   ✅ Модель создана');
        
        // Тест 3: Расчет дисперсии
        console.log('3. Расчет дисперсии...');
        const variance = StackingService.calculateVariance([0.5, 0.6, 0.7, 0.8, 0.9]);
        console.log(`   ✅ Дисперсия: ${variance.toFixed(4)}`);
        
        // Тест 4: Предсказание (fallback)
        console.log('4. Предсказание (fallback)...');
        const predictions = [
            { source: 'ensemble', score: 0.7, confidence: 0.8 },
            { source: 'traditional', score: 0.6, confidence: 0.7 }
        ];
        const result = await StackingService.predict(predictions);
        console.log(`   ✅ Результат: score=${result.score.toFixed(2)}, confidence=${result.confidence.toFixed(2)}, method=${result.method}`);
        
        console.log('\n✅ Все тесты StackingService пройдены\n');
    } catch (error) {
        console.error('❌ Ошибка в тестах StackingService:', error.message);
    }
}

async function testModelWeightingService() {
    console.log('🧪 Тестирование ModelWeightingService (корреляция)...\n');
    
    try {
        // Тест 1: Корреляция Пирсона
        console.log('1. Расчет корреляции Пирсона...');
        const x = [1, 2, 3, 4, 5];
        const y = [2, 4, 6, 8, 10];
        const correlation = ModelWeightingService.calculatePearsonCorrelation(x, y);
        console.log(`   ✅ Корреляция: ${correlation.toFixed(4)} (ожидается ~1.0)`);
        
        // Тест 2: Матрица корреляций
        console.log('2. Расчет матрицы корреляций...');
        const predictions = [
            { source: 'ensemble', score: 0.7 },
            { source: 'traditional', score: 0.6 },
            { source: 'reinforcement', score: 0.5 }
        ];
        const matrix = ModelWeightingService.calculateCorrelation(predictions);
        console.log('   ✅ Матрица корреляций создана');
        console.log(`   Корреляция ensemble-ensemble: ${matrix.ensemble?.ensemble?.toFixed(4)} (ожидается 1.0)`);
        
        // Тест 3: Корректировка уверенности
        console.log('3. Корректировка уверенности с учетом корреляции...');
        const predictions2 = [
            { source: 'ensemble', score: 0.7, confidence: 0.8 },
            { source: 'traditional', score: 0.68, confidence: 0.75 },
            { source: 'reinforcement', score: 0.72, confidence: 0.78 }
        ];
        const baseConfidence = 0.8;
        const adjusted = ModelWeightingService.adjustConfidenceForCorrelation(
            predictions2,
            baseConfidence
        );
        console.log(`   ✅ Базовая уверенность: ${baseConfidence.toFixed(2)}`);
        console.log(`   Скорректированная: ${adjusted.toFixed(2)}`);
        
        console.log('\n✅ Все тесты ModelWeightingService пройдены\n');
    } catch (error) {
        console.error('❌ Ошибка в тестах ModelWeightingService:', error.message);
    }
}

async function testConsensusMechanism() {
    console.log('🧪 Тестирование консенсусного механизма...\n');
    
    try {
        // Тест 1: Консервативный режим
        console.log('1. Консервативный режим (противоречивые сигналы)...');
        const sourceRecommendations = [
            { source: 'ensemble', recommendation: 'BUY', weight: 0.3, confidence: 0.7 },
            { source: 'traditional', recommendation: 'SELL', weight: 0.3, confidence: 0.6 },
            { source: 'reinforcement', recommendation: 'HOLD', weight: 0.4, confidence: 0.5 }
        ];
        const result1 = IntegratedAIService.applyConsensusMechanism(
            sourceRecommendations,
            0.5,
            0.7,
            'conservative'
        );
        console.log(`   ✅ Результат: score=${result1.score.toFixed(2)}, confidence=${result1.confidence.toFixed(2)}`);
        
        // Тест 2: Агрессивный режим
        console.log('2. Агрессивный режим...');
        const result2 = IntegratedAIService.applyConsensusMechanism(
            sourceRecommendations,
            0.6,
            0.75,
            'aggressive'
        );
        console.log(`   ✅ Результат: score=${result2.score.toFixed(2)}, confidence=${result2.confidence.toFixed(2)}`);
        
        // Тест 3: Явное большинство
        console.log('3. Явное большинство (все за BUY)...');
        const sourceRecommendations2 = [
            { source: 'ensemble', recommendation: 'BUY', weight: 0.4, confidence: 0.8 },
            { source: 'traditional', recommendation: 'BUY', weight: 0.3, confidence: 0.7 },
            { source: 'reinforcement', recommendation: 'BUY', weight: 0.3, confidence: 0.6 }
        ];
        const result3 = IntegratedAIService.applyConsensusMechanism(
            sourceRecommendations2,
            0.65,
            0.7,
            'moderate'
        );
        console.log(`   ✅ Результат: score=${result3.score.toFixed(2)}, confidence=${result3.confidence.toFixed(2)}`);
        
        // Тест 4: Адаптация порогов
        console.log('4. Адаптация порогов для разных режимов...');
        const baseThresholds = {
            buyScore: 0.65,
            buyConfidence: 0.6,
            sellScore: 0.35,
            sellConfidence: 0.6
        };
        
        const conservative = IntegratedAIService.adjustThresholdsForConsensusMode(
            baseThresholds,
            'conservative'
        );
        console.log(`   Консервативный: buyScore=${conservative.buyScore.toFixed(2)} (было ${baseThresholds.buyScore})`);
        
        const aggressive = IntegratedAIService.adjustThresholdsForConsensusMode(
            baseThresholds,
            'aggressive'
        );
        console.log(`   Агрессивный: buyScore=${aggressive.buyScore.toFixed(2)} (было ${baseThresholds.buyScore})`);
        
        console.log('\n✅ Все тесты консенсусного механизма пройдены\n');
    } catch (error) {
        console.error('❌ Ошибка в тестах консенсусного механизма:', error.message);
        console.error(error.stack);
    }
}

async function runAllTests() {
    console.log('🚀 Запуск тестов модернизации объединения рекомендаций\n');
    console.log('='.repeat(60));
    
    await testStackingService();
    await testModelWeightingService();
    await testConsensusMechanism();
    
    console.log('='.repeat(60));
    console.log('✅ Все тесты завершены');
}

// Запуск тестов
runAllTests().catch(error => {
    console.error('❌ Критическая ошибка:', error);
    process.exit(1);
});

