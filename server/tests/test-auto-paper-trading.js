/**
 * Базовые тесты для автоматической торговли в paper режиме
 * 
 * Для более полного покрытия запустите:
 * - npm run test:auto-paper-trading:unit - Unit тесты AutoPaperTradingService
 * - npm run test:auto-paper-trading:simulator - Unit тесты RealisticExecutionSimulator
 * - npm run test:auto-paper-trading:integration - Интеграционные тесты
 * - npm run test:auto-paper-trading:routes - Тесты API endpoints
 * - npm run test:auto-paper-trading:models - Тесты моделей
 * - npm run test:auto-paper-trading:all - Все тесты
 */

import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sequelize from '../src/config/database.js';
import AutoPaperTradingService from '../src/services/AutoPaperTradingService.js';
import RealisticExecutionSimulator from '../src/services/RealisticExecutionSimulator.js';
import TradingRequest from '../src/models/TradingRequest.js';
import AutoPaperTradingStats from '../src/models/AutoPaperTradingStats.js';
import TradingEngine from '../src/services/TradingEngine.js';
import TradingModeManager from '../src/services/TradingModeManager.js';
import Recommendation from '../src/models/Recommendation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

// Тестовые данные
const TEST_FIGI = 'BBG000B9XRY4'; // SBER
const TEST_TICKER = 'SBER';
const TEST_NAME = 'Сбербанк';

let testRecommendation = null;
let testTradingRequest = null;

async function setupTestData() {
    try {
        // Создаем тестовую рекомендацию
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
                reasoning: 'Test recommendation for auto-paper trading',
                timestamp: new Date()
            }
        });
        
        testRecommendation = testRecommendation[0];
        console.log('✅ Тестовая рекомендация создана');
    } catch (error) {
        console.error('❌ Ошибка создания тестовых данных:', error);
        throw error;
    }
}

async function cleanupTestData() {
    try {
        if (testTradingRequest) {
            await testTradingRequest.destroy({ force: true });
        }
        console.log('✅ Тестовые данные очищены');
    } catch (error) {
        console.warn('⚠️ Ошибка очистки тестовых данных:', error.message);
    }
}

async function testRealisticExecutionSimulator() {
    console.log('\n🧪 Тест 1: RealisticExecutionSimulator');
    
    try {
        await RealisticExecutionSimulator.initialize();
        console.log('✅ RealisticExecutionSimulator инициализирован');
        
        const order = {
            figi: TEST_FIGI,
            action: 'BUY',
            quantity: 100,
            price: 250.0
        };
        
        const executionResult = await RealisticExecutionSimulator.simulateExecution(order);
        
        console.log('📊 Результат симуляции:', {
            executedPrice: executionResult.executedPrice,
            executedQuantity: executionResult.executedQuantity,
            commission: executionResult.commission,
            slippage: executionResult.slippage,
            spread: executionResult.spread,
            liquidityLevel: executionResult.liquidityLevel
        });
        
        // Проверки
        if (executionResult.executedPrice <= 0) {
            throw new Error('executedPrice должен быть положительным');
        }
        
        if (executionResult.executedQuantity !== order.quantity) {
            throw new Error('executedQuantity должен совпадать с quantity');
        }
        
        if (executionResult.commission <= 0) {
            throw new Error('commission должен быть положительным');
        }
        
        if (executionResult.executedPrice > order.price * 1.01) {
            throw new Error('executedPrice не должен быть слишком высоким (более 1% от исходной цены)');
        }
        
        console.log('✅ Тест RealisticExecutionSimulator пройден');
        return true;
    } catch (error) {
        console.error('❌ Тест RealisticExecutionSimulator провален:', error);
        return false;
    }
}

async function testAutoPaperTradingServiceInitialization() {
    console.log('\n🧪 Тест 2: Инициализация AutoPaperTradingService');
    
    try {
        await AutoPaperTradingService.initialize();
        console.log('✅ AutoPaperTradingService инициализирован');
        
        const status = AutoPaperTradingService.getStatus();
        console.log('📊 Статус сервиса:', {
            isInitialized: status.isInitialized,
            isEnabled: status.isEnabled,
            currentPhase: status.currentPhase,
            dailyTrades: status.stats.dailyTrades
        });
        
        if (!status.isInitialized) {
            throw new Error('Сервис должен быть инициализирован');
        }
        
        if (status.currentPhase !== 'phase1' && status.currentPhase !== 'phase2' && status.currentPhase !== 'phase3') {
            throw new Error('currentPhase должен быть phase1, phase2 или phase3');
        }
        
        console.log('✅ Тест инициализации пройден');
        return true;
    } catch (error) {
        console.error('❌ Тест инициализации провален:', error);
        return false;
    }
}

async function testCanAutoExecute() {
    console.log('\n🧪 Тест 3: Проверка canAutoExecute');
    
    try {
        // Убеждаемся, что режим торговли - paper
        const currentMode = TradingModeManager.getCurrentMode().mode;
        if (currentMode !== 'paper') {
            console.log(`⚠️ Текущий режим: ${currentMode}, переключаем на paper`);
            await TradingModeManager.switchMode('paper');
        }
        
        // Включаем автоматическую торговлю
        await AutoPaperTradingService.enable();
        
        // Создаем тестовую заявку
        testTradingRequest = await TradingRequest.create({
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
            reasoning: 'Test request for auto-execution'
        });
        
        const canExecute = await AutoPaperTradingService.canAutoExecute(testTradingRequest);
        
        console.log('📊 Результат canAutoExecute:', canExecute);
        
        if (canExecute.canAutoExecute === undefined) {
            throw new Error('canAutoExecute должен возвращать объект с полем canAutoExecute');
        }
        
        if (canExecute.reason === undefined && !canExecute.canAutoExecute) {
            throw new Error('Если canAutoExecute = false, должна быть указана причина');
        }
        
        console.log('✅ Тест canAutoExecute пройден');
        return true;
    } catch (error) {
        console.error('❌ Тест canAutoExecute провален:', error);
        return false;
    }
}

async function testAutoPaperTradingStats() {
    console.log('\n🧪 Тест 4: AutoPaperTradingStats модель');
    
    try {
        const todayStats = await AutoPaperTradingStats.getTodayStats();
        console.log('📊 Статистика за сегодня:', {
            date: todayStats.date,
            dailyTrades: todayStats.dailyTrades,
            dailyPnL: todayStats.dailyPnL,
            totalTrades: todayStats.totalTrades,
            currentPhase: todayStats.currentPhase
        });
        
        if (!todayStats.date) {
            throw new Error('date должен быть установлен');
        }
        
        if (todayStats.dailyTrades < 0) {
            throw new Error('dailyTrades не может быть отрицательным');
        }
        
        if (todayStats.currentPhase !== 'phase1' && todayStats.currentPhase !== 'phase2' && todayStats.currentPhase !== 'phase3') {
            throw new Error('currentPhase должен быть phase1, phase2 или phase3');
        }
        
        console.log('✅ Тест AutoPaperTradingStats пройден');
        return true;
    } catch (error) {
        console.error('❌ Тест AutoPaperTradingStats провален:', error);
        return false;
    }
}

async function testTradingRequestNewFields() {
    console.log('\n🧪 Тест 5: Новые поля в TradingRequest');
    
    try {
        if (!testTradingRequest) {
            testTradingRequest = await TradingRequest.create({
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
            });
        }
        
        // Проверяем наличие новых полей
        const fields = ['autoExecuted', 'executionSimulation', 'autoExecutionPhase', 'actualQuantity', 'autoExecutionFailed', 'executionError'];
        
        for (const field of fields) {
            if (testTradingRequest[field] === undefined) {
                throw new Error(`Поле ${field} отсутствует в модели`);
            }
        }
        
        // Тестируем установку значений
        testTradingRequest.autoExecuted = true;
        testTradingRequest.autoExecutionPhase = 'phase1';
        testTradingRequest.executionSimulation = {
            spread: 0.001,
            slippage: 0.001,
            liquidityLevel: 'medium'
        };
        
        await testTradingRequest.save();
        
        // Перезагружаем из БД
        const reloaded = await TradingRequest.findByPk(testTradingRequest.id);
        
        if (reloaded.autoExecuted !== true) {
            throw new Error('autoExecuted не сохранился');
        }
        
        if (reloaded.autoExecutionPhase !== 'phase1') {
            throw new Error('autoExecutionPhase не сохранился');
        }
        
        if (!reloaded.executionSimulation || reloaded.executionSimulation.spread !== 0.001) {
            throw new Error('executionSimulation не сохранился');
        }
        
        console.log('✅ Тест новых полей пройден');
        return true;
    } catch (error) {
        console.error('❌ Тест новых полей провален:', error);
        return false;
    }
}

async function testSettingsValidation() {
    console.log('\n🧪 Тест 6: Валидация настроек');
    
    try {
        // Тест валидных настроек
        const validSettings = {
            minConfidence: 0.7,
            maxDailyTrades: 10,
            maxPositionSize: 0.05
        };
        
        const validation1 = AutoPaperTradingService.validateSettings(validSettings);
        if (!validation1.isValid) {
            throw new Error('Валидные настройки должны проходить валидацию');
        }
        
        // Тест невалидных настроек
        const invalidSettings = {
            minConfidence: 1.5, // Слишком высокое значение
            maxDailyTrades: -1, // Отрицательное значение
            maxPositionSize: 0.5 // Слишком большое значение
        };
        
        const validation2 = AutoPaperTradingService.validateSettings(invalidSettings);
        if (validation2.isValid) {
            throw new Error('Невалидные настройки не должны проходить валидацию');
        }
        
        if (validation2.errors.length === 0) {
            throw new Error('Должны быть указаны ошибки валидации');
        }
        
        console.log('✅ Тест валидации настроек пройден');
        return true;
    } catch (error) {
        console.error('❌ Тест валидации настроек провален:', error);
        return false;
    }
}

async function runAllTests() {
    console.log('🚀 Запуск тестов для автоматической торговли...\n');
    
    try {
        await sequelize.authenticate();
        console.log('✅ Подключение к БД установлено\n');
        
        await setupTestData();
        
        const results = [];
        
        results.push(await testRealisticExecutionSimulator());
        results.push(await testAutoPaperTradingServiceInitialization());
        results.push(await testCanAutoExecute());
        results.push(await testAutoPaperTradingStats());
        results.push(await testTradingRequestNewFields());
        results.push(await testSettingsValidation());
        
        const passed = results.filter(r => r === true).length;
        const total = results.length;
        
        console.log(`\n📊 Результаты тестов: ${passed}/${total} пройдено`);
        
        if (passed === total) {
            console.log('✅ Все тесты пройдены успешно!');
        } else {
            console.log('⚠️ Некоторые тесты провалены');
        }
        
        await cleanupTestData();
        await sequelize.close();
        
        process.exit(passed === total ? 0 : 1);
    } catch (error) {
        console.error('❌ Критическая ошибка при выполнении тестов:', error);
        await cleanupTestData();
        if (sequelize) {
            await sequelize.close();
        }
        process.exit(1);
    }
}

// Запускаем тесты
runAllTests();

