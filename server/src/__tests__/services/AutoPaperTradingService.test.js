/**
 * Unit тесты для AutoPaperTradingService
 */

import dotenv from 'dotenv';
import { describe, it } from '@jest/globals';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sequelize from '../../config/database.js';
import AutoPaperTradingService from '../../services/AutoPaperTradingService.js';
import TradingRequest from '../../models/TradingRequest.js';
import AutoPaperTradingStats from '../../models/AutoPaperTradingStats.js';
import TradingModeManager from '../../services/TradingModeManager.js';
import Recommendation from '../../models/Recommendation.js';
import { Op } from 'sequelize';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Пробуем несколько путей к .env файлу
const envPaths = [
    join(__dirname, '../../../../.env'),  // Корень проекта
    join(__dirname, '../../../.env'),    // server/.env
    join(process.cwd(), '.env'),          // Текущая рабочая директория
    join(process.cwd(), 'server', '.env') // server/.env из корня
];

for (const envPath of envPaths) {
    try {
        const result = dotenv.config({ path: envPath });
        if (!result.error) break;
    } catch (error) {
        // Игнорируем ошибки
    }
}

const TEST_FIGI = 'BBG000B9XRY4'; // SBER
const TEST_TICKER = 'SBER';
const TEST_NAME = 'Сбербанк';

describe.skip('AutoPaperTradingService manual scenario script', () => {
    it('manual script is excluded from jest unit run', () => {});
});

let testRecommendation = null;
let testTradingRequests = [];

// Вспомогательные функции
function log(message, color = 'reset') {
    const colors = {
        reset: '\x1b[0m',
        green: '\x1b[32m',
        red: '\x1b[31m',
        yellow: '\x1b[33m',
        blue: '\x1b[34m',
        cyan: '\x1b[36m'
    };
    console.log(`${colors[color]}${message}${colors.reset}`);
}

async function setupTestData() {
    try {
        testRecommendation = await Recommendation.findOrCreate({
            where: { figi: TEST_FIGI },
            defaults: {
                figi: TEST_FIGI,
                ticker: TEST_TICKER,
                name: TEST_NAME,
                recommendation: 'BUY',
                confidence: 0.85,
                score: 0.75,
                price: 250.0,
                priceAtAnalysis: 250.0,
                reasoning: 'Test recommendation',
                timestamp: new Date()
            }
        });
        testRecommendation = testRecommendation[0];
    } catch (error) {
        console.error('Ошибка создания тестовых данных:', error);
        throw error;
    }
}

async function cleanupTestData() {
    try {
        for (const request of testTradingRequests) {
            try {
                await request.destroy({ force: true });
            } catch (e) {
                // Игнорируем ошибки удаления
            }
        }
        testTradingRequests = [];
    } catch (error) {
        // Игнорируем ошибки очистки
    }
}

async function createTestTradingRequest(overrides = {}) {
    const defaults = {
        recommendationId: testRecommendation.figi,
        figi: TEST_FIGI,
        ticker: TEST_TICKER,
        name: TEST_NAME,
        action: 'BUY',
        quantity: 100,
        priceAtRequest: 250.0,
        estimatedAmount: 25000.0,
        confidence: 0.85,
        score: 0.75,
        status: 'PENDING',
        tradingMode: 'paper',
        reasoning: 'Test request'
    };
    
    const request = await TradingRequest.create({ ...defaults, ...overrides });
    testTradingRequests.push(request);
    return request;
}

// Тесты
async function testInitialization() {
    log('\n🧪 Тест 1: Инициализация AutoPaperTradingService', 'cyan');
    
    try {
        await AutoPaperTradingService.initialize();
        
        if (!AutoPaperTradingService.isInitialized) {
            throw new Error('Сервис должен быть инициализирован');
        }
        
        const status = AutoPaperTradingService.getStatus();
        if (!status.isInitialized) {
            throw new Error('Статус должен показывать инициализацию');
        }
        
        log('  ✅ Инициализация прошла успешно', 'green');
        return true;
    } catch (error) {
        log(`  ❌ Ошибка: ${error.message}`, 'red');
        return false;
    }
}

async function testGetCurrentSettings() {
    log('\n🧪 Тест 2: Получение текущих настроек', 'cyan');
    
    try {
        const settings = AutoPaperTradingService.getCurrentSettings();
        
        if (!settings.minConfidence) {
            throw new Error('minConfidence должен быть определен');
        }
        
        if (!settings.maxDailyTrades) {
            throw new Error('maxDailyTrades должен быть определен');
        }
        
        if (settings.minConfidence < 0 || settings.minConfidence > 1) {
            throw new Error('minConfidence должен быть в диапазоне 0-1');
        }
        
        log(`  ✅ Настройки получены: minConfidence=${settings.minConfidence}, maxDailyTrades=${settings.maxDailyTrades}`, 'green');
        return true;
    } catch (error) {
        log(`  ❌ Ошибка: ${error.message}`, 'red');
        return false;
    }
}

async function testCanAutoExecute() {
    log('\n🧪 Тест 3: Проверка canAutoExecute', 'cyan');
    
    try {
        // Убеждаемся, что режим - paper
        const currentMode = TradingModeManager.getCurrentMode().mode;
        if (currentMode !== 'paper') {
            await TradingModeManager.switchMode('paper');
        }
        
        // Включаем автоматическую торговлю
        await AutoPaperTradingService.enable();
        
        // Создаем заявку с высоким confidence
        const request = await createTestTradingRequest({
            confidence: 0.85,
            score: 0.75
        });
        
        const result = await AutoPaperTradingService.canAutoExecute(request);
        
        if (result.canAutoExecute === undefined) {
            throw new Error('Результат должен содержать canAutoExecute');
        }
        
        if (!result.canAutoExecute && !result.reason) {
            throw new Error('Если canAutoExecute = false, должна быть указана причина');
        }
        
        log(`  ✅ canAutoExecute вернул: ${result.canAutoExecute}, причина: ${result.reason || 'нет'}`, 'green');
        return true;
    } catch (error) {
        log(`  ❌ Ошибка: ${error.message}`, 'red');
        return false;
    }
}

async function testCanAutoExecuteWithLowConfidence() {
    log('\n🧪 Тест 4: canAutoExecute с низким confidence', 'cyan');
    
    try {
        await AutoPaperTradingService.enable();
        
        const request = await createTestTradingRequest({
            confidence: 0.5, // Низкий confidence
            score: 0.5
        });
        
        const result = await AutoPaperTradingService.canAutoExecute(request);
        
        if (result.canAutoExecute && result.reason && !result.reason.includes('Confidence')) {
            throw new Error('Должна быть причина, связанная с confidence');
        }
        
        log(`  ✅ Низкий confidence правильно обработан: ${result.canAutoExecute}`, 'green');
        return true;
    } catch (error) {
        log(`  ❌ Ошибка: ${error.message}`, 'red');
        return false;
    }
}

async function testCanAutoExecuteWithWrongMode() {
    log('\n🧪 Тест 5: canAutoExecute в неправильном режиме', 'cyan');
    
    try {
        // Переключаем на real режим
        await TradingModeManager.switchMode('real');
        
        const request = await createTestTradingRequest({
            tradingMode: 'real'
        });
        
        const result = await AutoPaperTradingService.canAutoExecute(request);
        
        if (result.canAutoExecute) {
            throw new Error('Автоматическое исполнение не должно быть доступно в real режиме');
        }
        
        if (!result.reason || !result.reason.includes('paper')) {
            throw new Error('Должна быть указана причина, связанная с режимом');
        }
        
        // Возвращаемся в paper режим
        await TradingModeManager.switchMode('paper');
        
        log('  ✅ Режим торговли правильно проверяется', 'green');
        return true;
    } catch (error) {
        // Возвращаемся в paper режим в любом случае
        await TradingModeManager.switchMode('paper').catch(() => {});
        log(`  ❌ Ошибка: ${error.message}`, 'red');
        return false;
    }
}

async function testEnableDisable() {
    log('\n🧪 Тест 6: Включение/выключение автоматической торговли', 'cyan');
    
    try {
        // Выключаем
        await AutoPaperTradingService.disable();
        if (AutoPaperTradingService.isEnabled) {
            throw new Error('Сервис должен быть выключен');
        }
        
        // Включаем
        await AutoPaperTradingService.enable();
        if (!AutoPaperTradingService.isEnabled) {
            throw new Error('Сервис должен быть включен');
        }
        
        log('  ✅ Включение/выключение работает корректно', 'green');
        return true;
    } catch (error) {
        log(`  ❌ Ошибка: ${error.message}`, 'red');
        return false;
    }
}

async function testValidateSettings() {
    log('\n🧪 Тест 7: Валидация настроек', 'cyan');
    
    try {
        // Валидные настройки
        const validSettings = {
            minConfidence: 0.7,
            maxDailyTrades: 10,
            maxPositionSize: 0.05
        };
        
        const validation1 = AutoPaperTradingService.validateSettings(validSettings);
        if (!validation1.isValid) {
            throw new Error('Валидные настройки должны проходить валидацию');
        }
        
        // Невалидные настройки
        const invalidSettings = {
            minConfidence: 1.5, // Слишком высокое
            maxDailyTrades: -1, // Отрицательное
            maxPositionSize: 0.5 // Слишком большое
        };
        
        const validation2 = AutoPaperTradingService.validateSettings(invalidSettings);
        if (validation2.isValid) {
            throw new Error('Невалидные настройки не должны проходить валидацию');
        }
        
        if (validation2.errors.length === 0) {
            throw new Error('Должны быть указаны ошибки валидации');
        }
        
        log(`  ✅ Валидация работает: найдено ${validation2.errors.length} ошибок`, 'green');
        return true;
    } catch (error) {
        log(`  ❌ Ошибка: ${error.message}`, 'red');
        return false;
    }
}

async function testResetDailyStats() {
    log('\n🧪 Тест 8: Сброс дневной статистики', 'cyan');
    
    try {
        // Устанавливаем тестовые значения
        AutoPaperTradingService.stats.dailyTrades = 5;
        AutoPaperTradingService.stats.dailyPnL = 1000;
        
        await AutoPaperTradingService.resetDailyStats();
        
        if (AutoPaperTradingService.stats.dailyTrades !== 0) {
            throw new Error('dailyTrades должен быть сброшен в 0');
        }
        
        if (AutoPaperTradingService.stats.dailyPnL !== 0) {
            throw new Error('dailyPnL должен быть сброшен в 0');
        }
        
        log('  ✅ Статистика успешно сброшена', 'green');
        return true;
    } catch (error) {
        log(`  ❌ Ошибка: ${error.message}`, 'red');
        return false;
    }
}

async function testAdvancePhase() {
    log('\n🧪 Тест 9: Переход на следующую фазу', 'cyan');
    
    try {
        const initialPhase = AutoPaperTradingService.stats.currentPhase;
        
        await AutoPaperTradingService.advancePhase();
        
        const newPhase = AutoPaperTradingService.stats.currentPhase;
        
        // Проверяем, что фаза изменилась (если не была последней)
        if (initialPhase === 'phase1' && newPhase !== 'phase2') {
            throw new Error('Фаза должна перейти с phase1 на phase2');
        }
        
        if (initialPhase === 'phase2' && newPhase !== 'phase3') {
            throw new Error('Фаза должна перейти с phase2 на phase3');
        }
        
        if (initialPhase === 'phase3' && newPhase !== 'phase3') {
            throw new Error('Фаза phase3 должна остаться phase3');
        }
        
        log(`  ✅ Переход фазы: ${initialPhase} -> ${newPhase}`, 'green');
        return true;
    } catch (error) {
        log(`  ❌ Ошибка: ${error.message}`, 'red');
        return false;
    }
}

async function testGetStatus() {
    log('\n🧪 Тест 10: Получение статуса', 'cyan');
    
    try {
        const status = AutoPaperTradingService.getStatus();
        
        if (status.isInitialized === undefined) {
            throw new Error('Статус должен содержать isInitialized');
        }
        
        if (status.isEnabled === undefined) {
            throw new Error('Статус должен содержать isEnabled');
        }
        
        if (status.currentPhase === undefined) {
            throw new Error('Статус должен содержать currentPhase');
        }
        
        if (!status.stats) {
            throw new Error('Статус должен содержать stats');
        }
        
        if (!status.settings) {
            throw new Error('Статус должен содержать settings');
        }
        
        log('  ✅ Статус содержит все необходимые поля', 'green');
        return true;
    } catch (error) {
        log(`  ❌ Ошибка: ${error.message}`, 'red');
        return false;
    }
}

async function runAllTests() {
    log('\n🚀 Запуск unit тестов для AutoPaperTradingService\n', 'cyan');
    
    try {
        await sequelize.authenticate();
        log('✅ Подключение к БД установлено\n', 'green');
        
        await setupTestData();
        
        const results = [];
        
        results.push(await testInitialization());
        results.push(await testGetCurrentSettings());
        results.push(await testCanAutoExecute());
        results.push(await testCanAutoExecuteWithLowConfidence());
        results.push(await testCanAutoExecuteWithWrongMode());
        results.push(await testEnableDisable());
        results.push(await testValidateSettings());
        results.push(await testResetDailyStats());
        results.push(await testAdvancePhase());
        results.push(await testGetStatus());
        
        const passed = results.filter(r => r === true).length;
        const total = results.length;
        
        log(`\n📊 Результаты: ${passed}/${total} тестов пройдено\n`, passed === total ? 'green' : 'yellow');
        
        await cleanupTestData();
        await sequelize.close();
        
        process.exit(passed === total ? 0 : 1);
    } catch (error) {
        log(`\n❌ Критическая ошибка: ${error.message}`, 'red');
        console.error(error.stack);
        await cleanupTestData();
        if (sequelize) {
            await sequelize.close();
        }
        process.exit(1);
    }
}

if (process.env.RUN_MANUAL_AUTO_PAPER_TESTS === 'true') {
    runAllTests();
}

