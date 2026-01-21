/**
 * Тестовый скрипт для проверки функционала Фазы 1, задача 1.1
 * Смягчение валидации
 * 
 * Запуск: node test-validation-phase1.js
 */

import TradingRequestService from './src/services/TradingRequestService.js';
import RiskManagementService from './src/services/RiskManagementService.js';
import TradingModeManager from './src/services/TradingModeManager.js';

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
    if (actual !== expected) {
        throw new Error(message || `Expected ${expected}, got ${actual}`);
    }
}

function assertContains(array, value, message) {
    if (!array.some(item => String(item).includes(value))) {
        throw new Error(message || `Expected array to contain "${value}"`);
    }
}

async function runTests() {
    log('\n🧪 Тестирование Фазы 1, задача 1.1: Смягчение валидации\n', 'cyan');

    // Инициализация сервисов
    try {
        if (!TradingModeManager.isInitialized) {
            await TradingModeManager.initialize();
        }
        if (!RiskManagementService.isInitialized) {
            await RiskManagementService.initialize();
        }
        log('✅ Сервисы инициализированы\n', 'green');
    } catch (error) {
        log(`❌ Ошибка инициализации: ${error.message}`, 'red');
        return;
    }

    // ============================================
    // 1.1.1. Снижение лимитов confidence
    // ============================================
    log('📋 1.1.1. Снижение лимитов confidence', 'blue');

    await test('Micro режим: confidence 60% должна проходить валидацию', async () => {
        // Устанавливаем режим micro для получения правильных настроек
        await TradingModeManager.switchMode('micro');
        const recommendation = {
            figi: 'test-figi',
            recommendation: 'BUY',
            confidence: 0.60,
            score: 0.7
        };
        const result = await TradingRequestService.validateTradingMode('micro', recommendation);
        assert(result.isValid === true, 'Валидация должна проходить');
        assertEqual(result.warnings.length, 0, 'Не должно быть предупреждений');
    });

    await test('Real режим: confidence 70% должна проходить валидацию', async () => {
        // Устанавливаем режим real для получения правильных настроек
        await TradingModeManager.switchMode('real');
        const recommendation = {
            figi: 'test-figi',
            recommendation: 'BUY',
            confidence: 0.70,
            score: 0.3 // Низкий score, но не требуется
        };
        const result = await TradingRequestService.validateTradingMode('real', recommendation);
        assert(result.isValid === true, 'Валидация должна проходить');
        assertEqual(result.warnings.length, 0, 'Не должно быть предупреждений');
    });

    await test('Real режим: не должен требовать score >= 0.7', async () => {
        const recommendation = {
            figi: 'test-figi',
            recommendation: 'BUY',
            confidence: 0.75,
            score: 0.3 // Низкий score
        };
        const result = await TradingRequestService.validateTradingMode('real', recommendation);
        assert(result.isValid === true, 'Валидация должна проходить без требования score');
    });

    await test('Micro режим: confidence < 40% должна блокировать', async () => {
        const recommendation = {
            figi: 'test-figi',
            recommendation: 'BUY',
            confidence: 0.35,
            score: 0.7
        };
        try {
            await TradingRequestService.validateTradingMode('micro', recommendation);
            throw new Error('Должна была быть ошибка');
        } catch (error) {
            assert(error.message.includes('слишком низкая'), 'Должна быть ошибка о низкой уверенности');
        }
    });

    // ============================================
    // 1.1.2. Превращение блокировок в предупреждения
    // ============================================
    log('\n📋 1.1.2. Превращение блокировок в предупреждения', 'blue');

    await test('Micro режим: confidence 50% должна возвращать warning', async () => {
        // Устанавливаем режим micro
        await TradingModeManager.switchMode('micro');
        const recommendation = {
            figi: 'test-figi',
            recommendation: 'BUY',
            confidence: 0.50, // 50% < 60%, но >= 40%
            score: 0.7
        };
        const result = await TradingRequestService.validateTradingMode('micro', recommendation);
        assert(result.isValid === true, 'Валидация должна проходить');
        assert(result.warnings.length > 0, 'Должно быть предупреждение');
        assertContains(result.warnings, 'ниже рекомендуемого минимума', 'Должно быть предупреждение о низкой уверенности');
    });

    await test('Real режим: confidence 65% должна возвращать warning', async () => {
        // Устанавливаем режим real
        await TradingModeManager.switchMode('real');
        const recommendation = {
            figi: 'test-figi',
            recommendation: 'BUY',
            confidence: 0.65, // 65% < 70%, но >= 40%
            score: 0.5
        };
        const result = await TradingRequestService.validateTradingMode('real', recommendation);
        assert(result.isValid === true, 'Валидация должна проходить');
        assert(result.warnings.length > 0, 'Должно быть предупреждение');
    });

    await test('SELL операции должны пропускать валидацию confidence', async () => {
        const recommendation = {
            figi: 'test-figi',
            recommendation: 'SELL',
            confidence: 0.20, // Очень низкая уверенность
            score: 0.3
        };
        const result = await TradingRequestService.validateTradingMode('real', recommendation);
        assert(result.isValid === true, 'Валидация должна проходить');
        assertEqual(result.warnings.length, 0, 'Не должно быть предупреждений для SELL');
    });

    // ============================================
    // 1.1.3. Увеличение лимитов размера позиций
    // ============================================
    log('\n📋 1.1.3. Увеличение лимитов размера позиций', 'blue');

    await test('maxPositionSize должна быть 5% вместо 2%', () => {
        assertEqual(RiskManagementService.limits.maxPositionSize, 0.05, 'maxPositionSize должна быть 0.05 (5%)');
    });

    await test('maxTotalExposure должна быть 40% вместо 20%', () => {
        assertEqual(RiskManagementService.limits.maxTotalExposure, 0.40, 'maxTotalExposure должна быть 0.40 (40%)');
    });

    // ============================================
    // 1.1.4. Смягчение лимитов убытков
    // ============================================
    log('\n📋 1.1.4. Смягчение лимитов убытков', 'blue');

    await test('maxConsecutiveLosses должна быть 10 вместо 5', () => {
        assertEqual(RiskManagementService.limits.maxConsecutiveLosses, 10, 'maxConsecutiveLosses должна быть 10');
    });

    await test('maxDailyLoss должна быть 10% вместо 5%', () => {
        assertEqual(RiskManagementService.limits.maxDailyLoss, 0.10, 'maxDailyLoss должна быть 0.10 (10%)');
    });

    await test('7 последовательных убытков должны возвращать warning', async () => {
        RiskManagementService.stats.consecutiveLosses = 7;
        const signal = {
            symbol: 'TEST',
            figi: 'test-figi',
            action: 'BUY',
            quantity: 10,
            price: 100,
            confidence: 0.7
        };
        const portfolio = { totalValue: 1000000, positions: {}, positionsValue: 0 };
        const validation = await RiskManagementService.validateOrder(signal, portfolio);
        assert(validation.isValid === true, 'Валидация должна проходить');
        assert(validation.warnings.length > 0, 'Должно быть предупреждение');
        assertContains(validation.warnings, 'убыточных сделок подряд', 'Должно быть предупреждение о последовательных убытках');
    });

    await test('10 последовательных убытков должны блокировать', async () => {
        RiskManagementService.stats.consecutiveLosses = 10;
        const signal = {
            symbol: 'TEST',
            figi: 'test-figi',
            action: 'BUY',
            quantity: 10,
            price: 100,
            confidence: 0.7
        };
        const portfolio = { totalValue: 1000000, positions: {}, positionsValue: 0 };
        const validation = await RiskManagementService.validateOrder(signal, portfolio);
        assert(validation.isValid === false, 'Валидация должна блокировать');
        assert(validation.errors.length > 0, 'Должна быть ошибка');
    });

    await test('Дневной убыток 7% должен возвращать warning', async () => {
        RiskManagementService.stats.dailyPnL = -70000; // -7% от 1,000,000
        RiskManagementService.stats.consecutiveLosses = 0; // Сбрасываем для чистоты теста
        const signal = {
            symbol: 'TEST',
            figi: 'test-figi',
            action: 'BUY',
            quantity: 10,
            price: 100,
            confidence: 0.7
        };
        const portfolio = { totalValue: 1000000, positions: {}, positionsValue: 0 };
        const validation = await RiskManagementService.validateOrder(signal, portfolio);
        assert(validation.isValid === true, 'Валидация должна проходить');
        assert(validation.warnings.length > 0, 'Должно быть предупреждение');
        assertContains(validation.warnings, 'Дневной убыток', 'Должно быть предупреждение о дневном убытке');
    });

    await test('Дневной убыток > 10% должен блокировать', async () => {
        RiskManagementService.stats.dailyPnL = -120000; // -12% от 1,000,000
        const signal = {
            symbol: 'TEST',
            figi: 'test-figi',
            action: 'BUY',
            quantity: 10,
            price: 100,
            confidence: 0.7
        };
        const portfolio = { totalValue: 1000000, positions: {}, positionsValue: 0 };
        const validation = await RiskManagementService.validateOrder(signal, portfolio);
        assert(validation.isValid === false, 'Валидация должна блокировать');
        assert(validation.errors.length > 0, 'Должна быть ошибка');
        assertContains(validation.errors, 'Дневной убыток', 'Должна быть ошибка о дневном убытке');
    });

    // ============================================
    // Тесты RiskManagementService - Confidence
    // ============================================
    log('\n📋 RiskManagementService - Confidence валидация', 'blue');

    await test('Confidence < 40% должна блокировать', async () => {
        RiskManagementService.stats.dailyPnL = 0; // Сбрасываем для чистоты теста
        RiskManagementService.stats.consecutiveLosses = 0;
        const signal = {
            symbol: 'TEST',
            figi: 'test-figi',
            action: 'BUY',
            quantity: 10,
            price: 100,
            confidence: 0.35 // 35% < 40%
        };
        const portfolio = { totalValue: 1000000, positions: {}, positionsValue: 0 };
        const validation = await RiskManagementService.validateOrder(signal, portfolio);
        assert(validation.isValid === false, 'Валидация должна блокировать');
        assertContains(validation.errors, 'слишком низкая', 'Должна быть ошибка о низкой уверенности');
    });

    await test('Confidence 50% должна возвращать warning', async () => {
        const signal = {
            symbol: 'TEST',
            figi: 'test-figi',
            action: 'BUY',
            quantity: 10,
            price: 100,
            confidence: 0.50 // 50% < 60%, но >= 40%
        };
        const portfolio = { totalValue: 1000000, positions: {}, positionsValue: 0 };
        const validation = await RiskManagementService.validateOrder(signal, portfolio);
        assert(validation.isValid === true, 'Валидация должна проходить');
        assert(validation.warnings.length > 0, 'Должно быть предупреждение');
        assertContains(validation.warnings, 'ниже рекомендуемого минимума', 'Должно быть предупреждение о низкой уверенности');
    });

    await test('Confidence >= 60% должна проходить без предупреждений', async () => {
        const signal = {
            symbol: 'TEST',
            figi: 'test-figi',
            action: 'BUY',
            quantity: 10,
            price: 100,
            confidence: 0.65 // 65% >= 60%
        };
        const portfolio = { totalValue: 1000000, positions: {}, positionsValue: 0 };
        const validation = await RiskManagementService.validateOrder(signal, portfolio);
        assert(validation.isValid === true, 'Валидация должна проходить');
        const confidenceWarnings = validation.warnings.filter(w => w.includes('уверенность'));
        assertEqual(confidenceWarnings.length, 0, 'Не должно быть предупреждений о confidence');
    });

    // ============================================
    // Итоги
    // ============================================
    log('\n' + '='.repeat(60), 'cyan');
    log(`\n📊 Результаты тестирования:`, 'cyan');
    log(`  ✅ Пройдено: ${passedTests}`, 'green');
    log(`  ❌ Провалено: ${failedTests}`, failedTests > 0 ? 'red' : 'green');
    log(`  📈 Всего: ${passedTests + failedTests}`, 'blue');
    
    if (failedTests > 0) {
        log('\n❌ Проваленные тесты:', 'red');
        testResults.filter(t => !t.passed).forEach(test => {
            log(`  - ${test.name}: ${test.error}`, 'red');
        });
    }

    log('\n' + '='.repeat(60) + '\n', 'cyan');

    // Возвращаем код выхода
    process.exit(failedTests > 0 ? 1 : 0);
}

// Запуск тестов
runTests().catch((error) => {
    log(`\n❌ Критическая ошибка при запуске тестов: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
});

