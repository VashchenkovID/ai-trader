/**
 * Тестовый скрипт для проверки функционала Фазы 2, задача 2.1
 * Система обратной связи
 * 
 * Запуск: node test-feedback-system-phase2.js
 */

import FeedbackService from './src/services/FeedbackService.js';
import AdaptiveThresholdService from './src/services/AdaptiveThresholdService.js';
import ModelWeightingService from './src/services/ModelWeightingService.js';
import IntegratedAIService from './src/services/IntegratedAIService.js';
import TradingRequest from './src/models/TradingRequest.js';
import Recommendation from './src/models/Recommendation.js';
import ModelPerformance from './src/models/ModelPerformance.js';
import sequelize from './src/config/database.js';

// Подавляем вывод ошибок консоли для тестовых данных
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

function suppressTestErrors() {
    console.error = (...args) => {
        const message = args.join(' ');
        // Подавляем ошибки для тестовых данных
        if (message.includes('TEST-') || message.includes('test-')) {
            return;
        }
        originalConsoleError(...args);
    };
    
    console.warn = (...args) => {
        const message = args.join(' ');
        if (message.includes('TEST-') || message.includes('test-')) {
            return;
        }
        originalConsoleWarn(...args);
    };
}

function restoreConsole() {
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
}

// Цвета для консоли
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

let passedTests = 0;
let failedTests = 0;
const testResults = [];

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function test(name, fn) {
    return new Promise(async (resolve) => {
        try {
            await fn();
            passedTests++;
            testResults.push({ name, passed: true });
            log(`  ✅ ${name}`, 'green');
            resolve(true);
        } catch (error) {
            failedTests++;
            testResults.push({ name, passed: false, error: error.message });
            log(`  ❌ ${name}: ${error.message}`, 'red');
            resolve(false);
        }
    });
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
}

function assertNotNull(value, message) {
    if (value === null || value === undefined) {
        throw new Error(message || 'Expected non-null value');
    }
}

function assertEqual(actual, expected, message) {
    if (Math.abs(actual - expected) > 0.001) {
        throw new Error(message || `Expected ${expected}, got ${actual}`);
    }
}

async function runTests() {
    log('\n🧪 Тестирование Фазы 2, задача 2.1: Система обратной связи\n', 'cyan');

    // Подавляем ошибки для тестовых данных
    suppressTestErrors();

    // Инициализация
    try {
        if (!FeedbackService.isInitialized) {
            await FeedbackService.initialize();
        }
        
        if (!AdaptiveThresholdService.isInitialized) {
            await AdaptiveThresholdService.initialize();
        }
        
        if (!ModelWeightingService.isInitialized) {
            await ModelWeightingService.initialize();
        }
        
        log('✅ Сервисы инициализированы\n', 'green');
    } catch (error) {
        log(`❌ Ошибка инициализации: ${error.message}`, 'red');
        console.error(error);
        restoreConsole();
        return;
    }

    // ============================================
    // 2.1.1. Тесты FeedbackService
    // ============================================
    log('📋 2.1.1. FeedbackService', 'blue');

    await test('Запись результата сделки (recordTradeResult)', async () => {
        // Создаем тестовую рекомендацию
        const testFigi = 'TEST-FIGI-1';
        const [recommendation, created] = await Recommendation.findOrCreate({
            where: { figi: testFigi },
            defaults: {
                figi: testFigi,
                ticker: 'TEST1',
                name: 'Test Instrument 1',
                recommendation: 'BUY',
                confidence: 0.7,
                score: 0.75,
                analysisDate: new Date()
            }
        });
        
        const result = await FeedbackService.recordTradeResult(
            testFigi,
            100,
            5.5, // 5.5% прибыль
            {
                modelType: 'ensemble',
                figi: testFigi
            }
        );
        
        assertNotNull(result, 'Результат должен быть возвращен');
        assert(result.success === true, 'Операция должна быть успешной');
        assertEqual(result.modelType, 'ensemble', 'Тип модели должен совпадать');
        
        // Очищаем тестовые данные
        if (created) {
            await recommendation.destroy();
        }
    });

    await test('Расчет эффективности моделей (calculateModelEffectiveness)', async () => {
        const effectiveness = await FeedbackService.calculateModelEffectiveness('ensemble');
        
        assertNotNull(effectiveness, 'Результат должен быть возвращен');
        assert(effectiveness.success === true, 'Операция должна быть успешной');
        assertNotNull(effectiveness.models, 'Метрики моделей должны быть возвращены');
    });

    await test('Обновление весов на основе результатов (updateModelWeightsFromResults)', async () => {
        const result = await FeedbackService.updateModelWeightsFromResults();
        
        assertNotNull(result, 'Результат должен быть возвращен');
        // Может быть success: false если нет данных, это нормально
    });

    await test('Обработка edge case: отрицательный PnL', async () => {
        // Создаем тестовую рекомендацию
        const testFigi = 'TEST-FIGI-2';
        const [recommendation, created] = await Recommendation.findOrCreate({
            where: { figi: testFigi },
            defaults: {
                figi: testFigi,
                ticker: 'TEST2',
                name: 'Test Instrument 2',
                recommendation: 'BUY',
                confidence: 0.6,
                score: 0.65,
                analysisDate: new Date()
            }
        });
        
        const result = await FeedbackService.recordTradeResult(
            testFigi,
            100,
            -3.2, // -3.2% убыток
            {
                modelType: 'traditional',
                figi: testFigi
            }
        );
        
        assertNotNull(result, 'Результат должен быть возвращен');
        assert(result.success === true, 'Операция должна быть успешной даже при убытке');
        
        // Очищаем тестовые данные
        if (created) {
            await recommendation.destroy();
        }
    });

    await test('Обработка edge case: нулевой PnL', async () => {
        // Создаем тестовую рекомендацию
        const testFigi = 'TEST-FIGI-3';
        const [recommendation, created] = await Recommendation.findOrCreate({
            where: { figi: testFigi },
            defaults: {
                figi: testFigi,
                ticker: 'TEST3',
                name: 'Test Instrument 3',
                recommendation: 'HOLD',
                confidence: 0.5,
                score: 0.5,
                analysisDate: new Date()
            }
        });
        
        const result = await FeedbackService.recordTradeResult(
            testFigi,
            100,
            0, // 0% (без прибыли/убытка)
            {
                modelType: 'metaLearning',
                figi: testFigi
            }
        );
        
        assertNotNull(result, 'Результат должен быть возвращен');
        assert(result.success === true, 'Операция должна быть успешной даже при нулевом PnL');
        
        // Очищаем тестовые данные
        if (created) {
            await recommendation.destroy();
        }
    });

    // ============================================
    // 2.1.2. Тесты интеграции с ModelWeightingService
    // ============================================
    log('\n📋 2.1.2. Интеграция с ModelWeightingService', 'blue');

    await test('Обновление весов на основе win rate', async () => {
        // Создаем тестовые данные производительности
        await ModelWeightingService.recordPerformance('ensemble', {
            winRate: 0.65,
            averageReturn: 2.5,
            sharpeRatio: 1.2,
            accuracy: 0.7,
            f1Score: 0.68,
            totalTrades: 20,
            profitableTrades: 13,
            losingTrades: 7
        }, 'TEST-FIGI-WEIGHT');
        
        // Обновляем веса
        const weight = await ModelWeightingService.calculateModelWeight('ensemble', 'TEST-FIGI-WEIGHT');
        assertNotNull(weight, 'Вес должен быть рассчитан');
        assert(weight >= 0 && weight <= 1, 'Вес должен быть в диапазоне 0-1');
    });

    await test('Обновление весов на основе Sharpe Ratio', async () => {
        await ModelWeightingService.recordPerformance('traditional', {
            winRate: 0.55,
            averageReturn: 1.8,
            sharpeRatio: 1.5, // Высокий Sharpe Ratio
            accuracy: 0.65,
            f1Score: 0.62,
            totalTrades: 15,
            profitableTrades: 8,
            losingTrades: 7
        }, 'TEST-FIGI-SHARPE');
        
        const weight = await ModelWeightingService.calculateModelWeight('traditional', 'TEST-FIGI-SHARPE');
        assertNotNull(weight, 'Вес должен быть рассчитан');
    });

    // ============================================
    // 2.1.3. Тесты AdaptiveThresholdService
    // ============================================
    log('\n📋 2.1.3. AdaptiveThresholdService', 'blue');

    await test('Определение рыночного режима (detectMarketMode)', async () => {
        const mode = await AdaptiveThresholdService.detectMarketMode('BBG004730N88'); // SBER
        
        assertNotNull(mode, 'Режим должен быть определен');
        assert(['trend', 'flat', 'volatile', 'normal'].includes(mode), 
            `Режим должен быть одним из: trend, flat, volatile, normal, получен: ${mode}`);
    });

    await test('Получение адаптивных порогов (getAdaptiveThresholds)', async () => {
        const thresholds = await AdaptiveThresholdService.getAdaptiveThresholds('BBG004730N88');
        
        assertNotNull(thresholds, 'Пороги должны быть возвращены');
        assertNotNull(thresholds.buyScore, 'buyScore должен быть определен');
        assertNotNull(thresholds.buyConfidence, 'buyConfidence должен быть определен');
        assertNotNull(thresholds.sellScore, 'sellScore должен быть определен');
        assertNotNull(thresholds.sellConfidence, 'sellConfidence должен быть определен');
        assertNotNull(thresholds.marketMode, 'marketMode должен быть определен');
        
        // Проверяем разумность порогов
        assert(thresholds.buyScore >= 0.3 && thresholds.buyScore <= 0.95, 
            `buyScore должен быть в диапазоне 0.3-0.95, получен: ${thresholds.buyScore}`);
        assert(thresholds.buyConfidence >= 0.4 && thresholds.buyConfidence <= 0.95,
            `buyConfidence должен быть в диапазоне 0.4-0.95, получен: ${thresholds.buyConfidence}`);
    });

    await test('Адаптация порогов для трендового рынка', async () => {
        // Мокаем режим 'trend'
        const originalDetect = AdaptiveThresholdService.detectMarketMode;
        AdaptiveThresholdService.detectMarketMode = async () => 'trend';
        
        try {
            const thresholds = await AdaptiveThresholdService.getAdaptiveThresholds('TEST-FIGI-TREND');
            
            // В тренде пороги покупки должны быть ниже (легче купить)
            assert(thresholds.buyScore < 0.70, 
                'В тренде buyScore должен быть снижен');
            assert(thresholds.marketMode === 'trend', 'Режим должен быть trend');
        } finally {
            AdaptiveThresholdService.detectMarketMode = originalDetect;
        }
    });

    await test('Адаптация порогов для флэтового рынка', async () => {
        const originalDetect = AdaptiveThresholdService.detectMarketMode;
        AdaptiveThresholdService.detectMarketMode = async () => 'flat';
        
        try {
            const thresholds = await AdaptiveThresholdService.getAdaptiveThresholds('TEST-FIGI-FLAT');
            
            // Во флэте пороги покупки должны быть выше (осторожнее)
            assert(thresholds.buyScore > 0.60, 
                'Во флэте buyScore должен быть повышен');
            assert(thresholds.marketMode === 'flat', 'Режим должен быть flat');
        } finally {
            AdaptiveThresholdService.detectMarketMode = originalDetect;
        }
    });

    await test('Адаптация порогов для волатильного рынка', async () => {
        const originalDetect = AdaptiveThresholdService.detectMarketMode;
        AdaptiveThresholdService.detectMarketMode = async () => 'volatile';
        
        try {
            const thresholds = await AdaptiveThresholdService.getAdaptiveThresholds('TEST-FIGI-VOLATILE');
            
            // При волатильности пороги должны быть значительно повышены
            assert(thresholds.buyScore > 0.70, 
                'При волатильности buyScore должен быть значительно повышен');
            assert(thresholds.marketMode === 'volatile', 'Режим должен быть volatile');
        } finally {
            AdaptiveThresholdService.detectMarketMode = originalDetect;
        }
    });

    // ============================================
    // 2.1.4. Тесты A/B тестирования
    // ============================================
    log('\n📋 2.1.4. A/B тестирование', 'blue');

    await test('Сравнение комбинаций моделей (compareModelCombinations)', async () => {
        const combinationA = ['ensemble', 'traditional'];
        const combinationB = ['metaLearning', 'reinforcementLearning'];
        
        const comparison = await FeedbackService.compareModelCombinations(
            combinationA,
            combinationB,
            30
        );
        
        assertNotNull(comparison, 'Результат сравнения должен быть возвращен');
        assert(comparison.success === true, 'Операция должна быть успешной');
        assertNotNull(comparison.combinationA, 'Данные комбинации A должны быть возвращены');
        assertNotNull(comparison.combinationB, 'Данные комбинации B должны быть возвращены');
        assertNotNull(comparison.winner, 'Победитель должен быть определен');
        assert(['A', 'B'].includes(comparison.winner), 'Победитель должен быть A или B');
    });

    // Итоги
    log('\n' + '='.repeat(60), 'cyan');
    log(`\n📊 Результаты тестирования:`, 'cyan');
    log(`  ✅ Пройдено: ${passedTests}`, 'green');
    log(`  ❌ Провалено: ${failedTests}`, failedTests > 0 ? 'red' : 'green');
    log(`  📈 Всего: ${passedTests + failedTests}\n`, 'cyan');

    if (failedTests > 0) {
        log('❌ Детали проваленных тестов:', 'red');
        testResults
            .filter(t => !t.passed)
            .forEach(t => {
                log(`  - ${t.name}: ${t.error}`, 'red');
            });
    }

    // Восстанавливаем консоль
    restoreConsole();

    // Закрываем соединение с БД
    try {
        await sequelize.close();
    } catch (error) {
        // Игнорируем ошибки закрытия
    }

    process.exit(failedTests > 0 ? 1 : 0);
}

// Запуск тестов
runTests().catch(error => {
    log(`\n❌ Критическая ошибка: ${error.message}`, 'red');
    console.error(error);
    restoreConsole();
    process.exit(1);
});

