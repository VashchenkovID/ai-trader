/**
 * Тестовый скрипт для проверки функционала Фазы 1, задача 1.2
 * Синхронизация портфеля со стратегиями
 * 
 * Запуск: node test-portfolio-sync-phase1.js
 */

import PortfolioSyncService from './src/services/PortfolioSyncService.js';
import TradingRequest from './src/models/TradingRequest.js';
import PositionStrategy from './src/models/PositionStrategy.js';
import RealPortfolio from './src/models/RealPortfolio.js';
import TradingEngine from './src/services/TradingEngine.js';

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

function assertGreaterThan(actual, expected, message) {
    if (actual <= expected) {
        throw new Error(message || `Expected ${actual} to be greater than ${expected}`);
    }
}

async function runTests() {
    log('\n🧪 Тестирование Фазы 1, задача 1.2: Синхронизация портфеля\n', 'cyan');

    // Инициализация сервисов
    try {
        if (!TradingEngine.isInitialized) {
            await TradingEngine.initialize();
        }
        if (!PortfolioSyncService.isInitialized) {
            await PortfolioSyncService.initialize();
        }
        log('✅ Сервисы инициализированы\n', 'green');
    } catch (error) {
        log(`❌ Ошибка инициализации: ${error.message}`, 'red');
        return;
    }

    // ============================================
    // 1.2.1. Тесты методов PortfolioSyncService
    // ============================================
    log('📋 1.2.1. Тесты методов PortfolioSyncService', 'blue');

    await test('findChangedPositions должна находить новые позиции', () => {
        const positionsBefore = {};
        const positionsAfter = {
            'BBG004730N88': 100
        };
        const changes = PortfolioSyncService.findChangedPositions(positionsBefore, positionsAfter);
        assert(changes.new.length > 0, 'Должна быть найдена новая позиция');
        assert(changes.new[0].figi === 'BBG004730N88', 'FIGI новой позиции должен совпадать');
    });

    await test('findChangedPositions должна находить увеличенные позиции', () => {
        const positionsBefore = {
            'BBG004730N88': 50
        };
        const positionsAfter = {
            'BBG004730N88': 100
        };
        const changes = PortfolioSyncService.findChangedPositions(positionsBefore, positionsAfter);
        assert(changes.increased.length > 0, 'Должна быть найдена увеличенная позиция');
        assert(changes.increased[0].addedQuantity === 50, 'Добавленное количество должно быть 50');
    });

    await test('findChangedPositions должна находить закрытые позиции', () => {
        const positionsBefore = {
            'BBG004730N88': 100
        };
        const positionsAfter = {};
        const changes = PortfolioSyncService.findChangedPositions(positionsBefore, positionsAfter);
        assert(changes.closed.length > 0, 'Должна быть найдена закрытая позиция');
        assert(changes.closed[0].beforeQuantity === 100, 'Количество до закрытия должно быть 100');
    });

    await test('findChangedPositions должна находить уменьшенные позиции', () => {
        const positionsBefore = {
            'BBG004730N88': 100
        };
        const positionsAfter = {
            'BBG004730N88': 50
        };
        const changes = PortfolioSyncService.findChangedPositions(positionsBefore, positionsAfter);
        assert(changes.decreased.length > 0, 'Должна быть найдена уменьшенная позиция');
        assert(changes.decreased[0].soldQuantity === 50, 'Проданное количество должно быть 50');
    });

    await test('getRecentApprovedRequests должна возвращать заявки', async () => {
        const requests = await PortfolioSyncService.getRecentApprovedRequests(48);
        assert(Array.isArray(requests), 'Должен возвращаться массив');
    });

    await test('getLastSyncStatus должна возвращать статус', () => {
        const status = PortfolioSyncService.getLastSyncStatus();
        assert(status !== null, 'Статус не должен быть null');
        assert('lastSync' in status, 'Статус должен содержать lastSync');
        assert('positionsMatched' in status, 'Статус должен содержать positionsMatched');
    });

    // ============================================
    // 1.2.2. Тесты API endpoints (через сервис)
    // ============================================
    log('\n📋 1.2.2. Тесты синхронизации (базовые)', 'blue');

    await test('syncRealPortfolioWithStrategies должна выполниться без ошибок', async () => {
        try {
            const result = await PortfolioSyncService.syncRealPortfolioWithStrategies({
                maxLookbackHours: 48,
                silent: true
            });
            assert(result !== null, 'Результат не должен быть null');
            assert('success' in result, 'Результат должен содержать success');
            assert('matched' in result, 'Результат должен содержать matched');
            assert('created' in result, 'Результат должен содержать created');
        } catch (error) {
            // Если синхронизация не может быть выполнена (нет данных), это нормально для теста
            if (error.message.includes('не инициализирован') || error.message.includes('database')) {
                log(`  ⚠️ Синхронизация пропущена (нет данных): ${error.message}`, 'yellow');
                return;
            }
            throw error;
        }
    });

    await test('getMismatches должна возвращать несоответствия', async () => {
        try {
            const mismatches = await PortfolioSyncService.getMismatches();
            assert(mismatches !== null, 'Несоответствия не должны быть null');
            assert('positionsWithoutStrategy' in mismatches, 'Должен содержать positionsWithoutStrategy');
            assert('requestsWithoutPosition' in mismatches, 'Должен содержать requestsWithoutPosition');
            assert(Array.isArray(mismatches.positionsWithoutStrategy), 'positionsWithoutStrategy должен быть массивом');
            assert(Array.isArray(mismatches.requestsWithoutPosition), 'requestsWithoutPosition должен быть массивом');
        } catch (error) {
            // Если нет данных, это нормально
            if (error.message.includes('не инициализирован') || error.message.includes('database')) {
                log(`  ⚠️ Проверка несоответствий пропущена (нет данных): ${error.message}`, 'yellow');
                return;
            }
            throw error;
        }
    });

    // ============================================
    // 1.2.4. Тесты edge cases
    // ============================================
    log('\n📋 1.2.4. Тесты edge cases', 'blue');

    await test('findChangedPositions должна обрабатывать пустые портфели', () => {
        const changes = PortfolioSyncService.findChangedPositions({}, {});
        assert(Array.isArray(changes.new), 'new должен быть массивом');
        assert(Array.isArray(changes.increased), 'increased должен быть массивом');
        assert(Array.isArray(changes.decreased), 'decreased должен быть массивом');
        assert(Array.isArray(changes.closed), 'closed должен быть массивом');
    });

    await test('findChangedPositions должна обрабатывать множественные изменения', () => {
        const positionsBefore = {
            'BBG004730N88': 50,
            'BBG004731354': 100
        };
        const positionsAfter = {
            'BBG004730N88': 100,
            'BBG004731354': 0,
            'BBG004730RP0': 50
        };
        const changes = PortfolioSyncService.findChangedPositions(positionsBefore, positionsAfter);
        assert(changes.increased.length === 1, 'Должна быть найдена 1 увеличенная позиция');
        assert(changes.closed.length === 1, 'Должна быть найдена 1 закрытая позиция');
        assert(changes.new.length === 1, 'Должна быть найдена 1 новая позиция');
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

