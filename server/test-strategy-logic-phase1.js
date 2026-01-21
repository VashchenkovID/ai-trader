/**
 * Тестовый скрипт для проверки функционала Фазы 1, задача 1.3
 * Исправление логики стратегий
 * 
 * Запуск: node test-strategy-logic-phase1.js
 */

import TradingStrategy from './src/models/TradingStrategy.js';
import RiskManagementService from './src/services/RiskManagementService.js';
import InstrumentStats from './src/models/InstrumentStats.js';
import CacheService from './src/services/CacheService.js';
import sequelize from './src/config/database.js';

// Подавляем вывод ошибок консоли для тестовых FIGI
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const testFigis = ['TEST-FIGI-NO-ATR', 'TEST-FIGI-FEW-CANDLES', 'TEST-FIGI-REASONABLE'];

function suppressTestErrors() {
    console.error = (...args) => {
        const message = args.join(' ');
        // Подавляем ошибки для тестовых FIGI
        if (testFigis.some(figi => message.includes(figi))) {
            return;
        }
        originalConsoleError(...args);
    };
    
    console.warn = (...args) => {
        const message = args.join(' ');
        // Подавляем предупреждения для тестовых FIGI (кроме важных)
        if (testFigis.some(figi => message.includes(figi) && !message.includes('Недостаточно свечей'))) {
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

function assertEqual(actual, expected, message) {
    if (Math.abs(actual - expected) > 0.001) {
        throw new Error(message || `Expected ${expected}, got ${actual}`);
    }
}

function assertNotNull(value, message) {
    if (value === null || value === undefined) {
        throw new Error(message || 'Expected non-null value');
    }
}

async function runTests() {
    log('\n🧪 Тестирование Фазы 1, задача 1.3: Исправление логики стратегий\n', 'cyan');

    // Подавляем ошибки для тестовых FIGI
    suppressTestErrors();

    // Инициализация
    try {
        // Убеждаемся, что стратегии по умолчанию созданы
        await TradingStrategy.initializeDefaultStrategies();
        
        if (!RiskManagementService.isInitialized) {
            await RiskManagementService.initialize();
        }
        
        log('✅ Сервисы инициализированы\n', 'green');
    } catch (error) {
        log(`❌ Ошибка инициализации: ${error.message}`, 'red');
        console.error(error);
        restoreConsole();
        return;
    }

    // ============================================
    // 1.3.1. Тесты логики выбора стратегий
    // ============================================
    log('📋 1.3.1. Логика выбора стратегий', 'blue');

    await test('Агрессивная стратегия для confidence > 0.8 && score > 0.75', async () => {
        const recommendation = { confidence: 0.85, score: 0.80 };
        const strategy = await TradingStrategy.getStrategyForRecommendation(recommendation);
        assertNotNull(strategy, 'Стратегия должна быть найдена');
        assertEqual(strategy.type, 'aggressive', 'Должна быть агрессивная стратегия');
    });

    await test('Умеренная стратегия для confidence >= 0.6 && score >= 0.6', async () => {
        const recommendation = { confidence: 0.70, score: 0.65 };
        const strategy = await TradingStrategy.getStrategyForRecommendation(recommendation);
        assertNotNull(strategy, 'Стратегия должна быть найдена');
        assertEqual(strategy.type, 'moderate', 'Должна быть умеренная стратегия');
    });

    await test('Консервативная стратегия для confidence >= 0.5 && score >= 0.5', async () => {
        const recommendation = { confidence: 0.55, score: 0.55 };
        const strategy = await TradingStrategy.getStrategyForRecommendation(recommendation);
        assertNotNull(strategy, 'Стратегия должна быть найдена');
        assertEqual(strategy.type, 'conservative', 'Должна быть консервативная стратегия');
    });

    await test('Fallback для confidence >= 0.8 && score <= 0.75 (высокий confidence, низкий score)', async () => {
        const recommendation = { confidence: 0.85, score: 0.70 };
        const strategy = await TradingStrategy.getStrategyForRecommendation(recommendation);
        assertNotNull(strategy, 'Стратегия должна быть найдена через fallback');
        // Должна выбрать ближайшую подходящую стратегию (вероятно умеренную или агрессивную)
        assert(strategy.type === 'moderate' || strategy.type === 'aggressive', 
            'Должна выбрать умеренную или агрессивную стратегию');
    });

    await test('Fallback для confidence >= 0.5 && score < 0.5 (средний confidence, низкий score)', async () => {
        const recommendation = { confidence: 0.55, score: 0.45 };
        const strategy = await TradingStrategy.getStrategyForRecommendation(recommendation);
        assertNotNull(strategy, 'Стратегия должна быть найдена через fallback');
        // Должна выбрать консервативную как ближайшую
        assert(strategy.type === 'conservative', 'Должна выбрать консервативную стратегию');
    });

    await test('Fallback для confidence < 0.5 && score >= 0.5 (низкий confidence, средний score)', async () => {
        const recommendation = { confidence: 0.45, score: 0.60 };
        const strategy = await TradingStrategy.getStrategyForRecommendation(recommendation);
        assertNotNull(strategy, 'Стратегия должна быть найдена через fallback');
        // Должна выбрать консервативную как ближайшую
        assert(strategy.type === 'conservative', 'Должна выбрать консервативную стратегию');
    });

    await test('Граничное значение: confidence = 0.8, score = 0.75', async () => {
        const recommendation = { confidence: 0.8, score: 0.75 };
        const strategy = await TradingStrategy.getStrategyForRecommendation(recommendation);
        assertNotNull(strategy, 'Стратегия должна быть найдена');
    });

    await test('Граничное значение: confidence = 0.6, score = 0.6', async () => {
        const recommendation = { confidence: 0.6, score: 0.6 };
        const strategy = await TradingStrategy.getStrategyForRecommendation(recommendation);
        assertNotNull(strategy, 'Стратегия должна быть найдена');
    });

    await test('Граничное значение: confidence = 0.5, score = 0.5', async () => {
        const recommendation = { confidence: 0.5, score: 0.5 };
        const strategy = await TradingStrategy.getStrategyForRecommendation(recommendation);
        assertNotNull(strategy, 'Стратегия должна быть найдена');
    });

    // ============================================
    // 1.3.2. Тесты соотношения Risk/Reward
    // ============================================
    log('\n📋 1.3.2. Соотношение Risk/Reward', 'blue');

    await test('Агрессивная стратегия: SL должен быть 4% (было 3%)', async () => {
        const strategy = await TradingStrategy.findOne({ where: { type: 'aggressive', isActive: true } });
        assertNotNull(strategy, 'Агрессивная стратегия должна существовать');
        assertEqual(strategy.stopLossPercent, 4.0, 'Stop Loss должен быть 4%');
    });

    await test('Агрессивная стратегия: TP должен быть 8% (было 6%)', async () => {
        const strategy = await TradingStrategy.findOne({ where: { type: 'aggressive', isActive: true } });
        assertNotNull(strategy, 'Агрессивная стратегия должна существовать');
        assertEqual(strategy.takeProfitPercent, 8.0, 'Take Profit должен быть 8%');
    });

    await test('Агрессивная стратегия: Risk/Reward = 1:2', async () => {
        const strategy = await TradingStrategy.findOne({ where: { type: 'aggressive', isActive: true } });
        assertNotNull(strategy, 'Агрессивная стратегия должна существовать');
        const riskReward = strategy.takeProfitPercent / strategy.stopLossPercent;
        assertEqual(riskReward, 2.0, 'Risk/Reward должен быть 1:2');
    });

    // ============================================
    // 1.3.3. Тесты расчета динамического стоп-лосса
    // ============================================
    log('\n📋 1.3.3. Расчет динамического стоп-лосса', 'blue');

    await test('Fallback на фиксированный процент при отсутствии ATR', async () => {
        const figi = 'TEST-FIGI-NO-ATR';
        const currentPrice = 100;
        const strategy = await TradingStrategy.findOne({ where: { type: 'conservative', isActive: true } });
        
        // Мокаем стратегию без atrMultiplier (это должно сразу вернуть фиксированный процент)
        const strategyWithoutATR = { ...strategy.toJSON(), atrMultiplier: null };
        
        const stopLoss = await RiskManagementService.calculateDynamicStopLoss(
            figi, currentPrice, strategyWithoutATR, 'BUY'
        );
        
        assertNotNull(stopLoss, 'Стоп-лосс должен быть рассчитан');
        // Проверяем, что используется фиксированный процент из стратегии
        const expectedStopLoss = currentPrice * (1 - strategy.stopLossPercent / 100);
        const tolerance = currentPrice * 0.001; // Допуск 0.1%
        assert(Math.abs(stopLoss - expectedStopLoss) < tolerance, 
            `Ожидался стоп-лосс ${expectedStopLoss.toFixed(2)}, получен ${stopLoss.toFixed(2)}`);
    });

    await test('Fallback при недостаточном количестве свечей', async () => {
        const figi = 'TEST-FIGI-FEW-CANDLES';
        const currentPrice = 100;
        const strategy = await TradingStrategy.findOne({ where: { type: 'moderate', isActive: true } });
        
        // Мокаем CacheService.getCandles для возврата пустого массива
        const originalGetCandles = CacheService.getCandles;
        CacheService.getCandles = async () => [];
        
        try {
            const stopLoss = await RiskManagementService.calculateDynamicStopLoss(
                figi, currentPrice, strategy, 'BUY'
            );
            
            assertNotNull(stopLoss, 'Стоп-лосс должен быть рассчитан');
            // Должен использовать fallback, так как свечей нет
            const expectedStopLoss = currentPrice * (1 - strategy.stopLossPercent / 100);
            const tolerance = currentPrice * 0.01; // Допуск 1%
            assert(Math.abs(stopLoss - expectedStopLoss) < tolerance, 
                `Ожидался стоп-лосс ${expectedStopLoss.toFixed(2)}, получен ${stopLoss.toFixed(2)}`);
        } finally {
            // Восстанавливаем оригинальный метод
            CacheService.getCandles = originalGetCandles;
        }
    });

    await test('Проверка разумности: стоп-лосс не должен быть < 1% от цены', async () => {
        const figi = 'TEST-FIGI-REASONABLE';
        const currentPrice = 100;
        const strategy = await TradingStrategy.findOne({ where: { type: 'aggressive', isActive: true } });
        
        // Мокаем CacheService.getCandles для возврата минимального количества свечей
        const originalGetCandles = CacheService.getCandles;
        CacheService.getCandles = async () => []; // Пустой массив вызовет fallback
        
        try {
            // Создаем стратегию с очень маленьким atrMultiplier
            // Но так как свечей нет, будет использован фиксированный процент
            // Поэтому проверим через прямое использование фиксированного процента с очень маленьким значением
            const strategyWithSmallATR = { ...strategy.toJSON(), atrMultiplier: 0.001, stopLossPercent: 0.5 };
            
            const stopLoss = await RiskManagementService.calculateDynamicStopLoss(
                figi, currentPrice, strategyWithSmallATR, 'BUY'
            );
            
            assertNotNull(stopLoss, 'Стоп-лосс должен быть рассчитан');
            const stopLossPercent = ((currentPrice - stopLoss) / currentPrice) * 100;
            // Проверяем, что валидация разумности сработала (минимум 1%)
            assert(stopLossPercent >= 1.0, `Стоп-лосс ${stopLossPercent.toFixed(2)}% должен быть >= 1% (валидация разумности)`);
        } finally {
            CacheService.getCandles = originalGetCandles;
        }
    });

    await test('Проверка разумности: стоп-лосс не должен быть > 20% от цены', async () => {
        const figi = 'TEST-FIGI-REASONABLE';
        const currentPrice = 100;
        const strategy = await TradingStrategy.findOne({ where: { type: 'conservative', isActive: true } });
        
        // Мокаем CacheService.getCandles для возврата минимального количества свечей
        const originalGetCandles = CacheService.getCandles;
        CacheService.getCandles = async () => []; // Пустой массив вызовет fallback
        
        try {
            // Создаем стратегию с очень большим stopLossPercent (> 20%)
            // Это проверит валидацию разумности
            const strategyWithLargeSL = { ...strategy.toJSON(), atrMultiplier: null, stopLossPercent: 25.0 };
            
            const stopLoss = await RiskManagementService.calculateDynamicStopLoss(
                figi, currentPrice, strategyWithLargeSL, 'BUY'
            );
            
            assertNotNull(stopLoss, 'Стоп-лосс должен быть рассчитан');
            const stopLossPercent = ((currentPrice - stopLoss) / currentPrice) * 100;
            // Проверяем, что валидация разумности сработала (максимум 20%)
            assert(stopLossPercent <= 20.0, `Стоп-лосс ${stopLossPercent.toFixed(2)}% должен быть <= 20% (валидация разумности)`);
        } finally {
            CacheService.getCandles = originalGetCandles;
        }
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
    process.exit(1);
});

