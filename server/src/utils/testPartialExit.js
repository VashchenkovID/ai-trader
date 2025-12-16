/**
 * Тест-кейсы для проверки функционала частичного закрытия позиций
 * Запуск: node server/src/utils/testPartialExit.js
 */

import sequelize from '../config/database.js';
import TradingRequest from '../models/TradingRequest.js';
import PositionExit from '../models/PositionExit.js';
import Recommendation from '../models/Recommendation.js';
import CachedInstrument from '../models/CachedInstrument.js';
import PartialExitService from '../services/PartialExitService.js';
import TradingEngine from '../services/TradingEngine.js';

// Цвета для консоли
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testCase1_BasicPartialExit() {
    log('\n📋 Тест-кейс 1: Базовое частичное закрытие при +10% прибыли', 'cyan');
    
    try {
        // Создаем тестовую рекомендацию
        const testRecommendation = await Recommendation.findOrCreate({
            where: { figi: 'TEST_FIGI_1' },
            defaults: {
                figi: 'TEST_FIGI_1',
                ticker: 'TEST1',
                name: 'Тестовый инструмент 1',
                recommendation: 'BUY',
                confidence: 0.8,
                score: 0.8,
                priceAtAnalysis: 100.0
            }
        }).then(([rec]) => rec);

        // Создаем тестовую позицию
        const testPosition = await TradingRequest.create({
            recommendationId: 'TEST_FIGI_1',
            figi: 'TEST_FIGI_1',
            ticker: 'TEST1',
            name: 'Тестовый инструмент 1',
            action: 'BUY',
            quantity: 100,
            priceAtRequest: 100.0,
            actualPrice: 100.0,
            estimatedAmount: 10000,
            confidence: 0.8,
            score: 0.8,
            status: 'EXECUTED',
            tradingMode: 'paper',
            executedAt: new Date()
        });

        // Симулируем цену +10% (110.0)
        const currentPrice = 110.0;
        
        // Проверяем позицию на закрытие
        const exitResult = await PartialExitService.checkPositionForExit(testPosition, currentPrice);
        
        if (exitResult.shouldExit && exitResult.stage === 'STAGE_1_10PCT' && exitResult.exitQuantity === 50) {
            log('✅ Тест пройден: позиция корректно определена для закрытия 50% при +10%', 'green');
            return true;
        } else {
            log(`❌ Тест провален: ожидалось shouldExit=true, stage=STAGE_1_10PCT, exitQuantity=50, получено:`, 'red');
            log(`   shouldExit=${exitResult.shouldExit}, stage=${exitResult.stage}, exitQuantity=${exitResult.exitQuantity}`, 'red');
            return false;
        }
    } catch (error) {
        log(`❌ Ошибка в тесте: ${error.message}`, 'red');
        return false;
    }
}

async function testCase2_SecondStageExit() {
    log('\n📋 Тест-кейс 2: Второй этап закрытия при +15% прибыли', 'cyan');
    
    try {
        // Создаем тестовую рекомендацию
        await Recommendation.findOrCreate({
            where: { figi: 'TEST_FIGI_2' },
            defaults: {
                figi: 'TEST_FIGI_2',
                ticker: 'TEST2',
                name: 'Тестовый инструмент 2',
                recommendation: 'BUY',
                confidence: 0.8,
                score: 0.8,
                priceAtAnalysis: 100.0
            }
        });

        const testPosition = await TradingRequest.create({
            recommendationId: 'TEST_FIGI_2',
            figi: 'TEST_FIGI_2',
            ticker: 'TEST2',
            name: 'Тестовый инструмент 2',
            action: 'BUY',
            quantity: 100,
            priceAtRequest: 100.0,
            actualPrice: 100.0,
            estimatedAmount: 10000,
            confidence: 0.8,
            score: 0.8,
            status: 'EXECUTED',
            tradingMode: 'paper',
            executedAt: new Date()
        });

        // Создаем первое закрытие (50% при +10%)
        await PositionExit.create({
            tradingRequestId: testPosition.id,
            figi: 'TEST_FIGI_2',
            ticker: 'TEST2',
            name: 'Тестовый инструмент 2',
            entryPrice: 100.0,
            initialQuantity: 100,
            remainingQuantity: 50,
            exitStage: 'STAGE_1_10PCT',
            profitPercent: 10.0,
            exitPrice: 110.0,
            exitQuantity: 50,
            exitAmount: 5500,
            commission: 0,
            realizedProfit: 500,
            status: 'EXECUTED',
            tradingMode: 'paper',
            executedAt: new Date()
        });

        // Симулируем цену +15% (115.0)
        const currentPrice = 115.0;
        
        const exitResult = await PartialExitService.checkPositionForExit(testPosition, currentPrice);
        
        if (exitResult.shouldExit && exitResult.stage === 'STAGE_2_15PCT' && exitResult.exitQuantity === 25) {
            log('✅ Тест пройден: второй этап корректно определен (25% при +15%)', 'green');
            return true;
        } else {
            log(`❌ Тест провален: ожидалось stage=STAGE_2_15PCT, exitQuantity=25`, 'red');
            log(`   Получено: stage=${exitResult.stage}, exitQuantity=${exitResult.exitQuantity}`, 'red');
            return false;
        }
    } catch (error) {
        log(`❌ Ошибка в тесте: ${error.message}`, 'red');
        return false;
    }
}

async function testCase3_ThirdStageExit() {
    log('\n📋 Тест-кейс 3: Третий этап закрытия при +20% прибыли', 'cyan');
    
    try {
        // Создаем тестовую рекомендацию
        await Recommendation.findOrCreate({
            where: { figi: 'TEST_FIGI_3' },
            defaults: {
                figi: 'TEST_FIGI_3',
                ticker: 'TEST3',
                name: 'Тестовый инструмент 3',
                recommendation: 'BUY',
                confidence: 0.8,
                score: 0.8,
                priceAtAnalysis: 100.0
            }
        });

        const testPosition = await TradingRequest.create({
            recommendationId: 'TEST_FIGI_3',
            figi: 'TEST_FIGI_3',
            ticker: 'TEST3',
            name: 'Тестовый инструмент 3',
            action: 'BUY',
            quantity: 100,
            priceAtRequest: 100.0,
            actualPrice: 100.0,
            estimatedAmount: 10000,
            confidence: 0.8,
            score: 0.8,
            status: 'EXECUTED',
            tradingMode: 'paper',
            executedAt: new Date()
        });

        // Создаем первые два закрытия
        await PositionExit.create({
            tradingRequestId: testPosition.id,
            figi: 'TEST_FIGI_3',
            ticker: 'TEST3',
            name: 'Тестовый инструмент 3',
            entryPrice: 100.0,
            initialQuantity: 100,
            remainingQuantity: 50,
            exitStage: 'STAGE_1_10PCT',
            profitPercent: 10.0,
            exitPrice: 110.0,
            exitQuantity: 50,
            exitAmount: 5500,
            commission: 0,
            realizedProfit: 500,
            status: 'EXECUTED',
            tradingMode: 'paper',
            executedAt: new Date()
        });

        await PositionExit.create({
            tradingRequestId: testPosition.id,
            figi: 'TEST_FIGI_3',
            ticker: 'TEST3',
            name: 'Тестовый инструмент 3',
            entryPrice: 100.0,
            initialQuantity: 100,
            remainingQuantity: 25,
            exitStage: 'STAGE_2_15PCT',
            profitPercent: 15.0,
            exitPrice: 115.0,
            exitQuantity: 25,
            exitAmount: 2875,
            commission: 0,
            realizedProfit: 375,
            status: 'EXECUTED',
            tradingMode: 'paper',
            executedAt: new Date()
        });

        // Симулируем цену +20% (120.0)
        const currentPrice = 120.0;
        
        const exitResult = await PartialExitService.checkPositionForExit(testPosition, currentPrice);
        
        if (exitResult.shouldExit && exitResult.stage === 'STAGE_3_20PCT' && exitResult.exitQuantity === 25) {
            log('✅ Тест пройден: третий этап корректно определен (25% при +20%)', 'green');
            return true;
        } else {
            log(`❌ Тест провален: ожидалось stage=STAGE_3_20PCT, exitQuantity=25`, 'red');
            log(`   Получено: stage=${exitResult.stage}, exitQuantity=${exitResult.exitQuantity}`, 'red');
            return false;
        }
    } catch (error) {
        log(`❌ Ошибка в тесте: ${error.message}`, 'red');
        return false;
    }
}

async function testCase4_NoExitBelowThreshold() {
    log('\n📋 Тест-кейс 4: Нет закрытия при прибыли ниже порога', 'cyan');
    
    try {
        // Создаем тестовую рекомендацию
        await Recommendation.findOrCreate({
            where: { figi: 'TEST_FIGI_4' },
            defaults: {
                figi: 'TEST_FIGI_4',
                ticker: 'TEST4',
                name: 'Тестовый инструмент 4',
                recommendation: 'BUY',
                confidence: 0.8,
                score: 0.8,
                priceAtAnalysis: 100.0
            }
        });

        const testPosition = await TradingRequest.create({
            recommendationId: 'TEST_FIGI_4',
            figi: 'TEST_FIGI_4',
            ticker: 'TEST4',
            name: 'Тестовый инструмент 4',
            action: 'BUY',
            quantity: 100,
            priceAtRequest: 100.0,
            actualPrice: 100.0,
            estimatedAmount: 10000,
            confidence: 0.8,
            score: 0.8,
            status: 'EXECUTED',
            tradingMode: 'paper',
            executedAt: new Date()
        });

        // Симулируем цену +5% (105.0) - ниже порога +10%
        const currentPrice = 105.0;
        
        const exitResult = await PartialExitService.checkPositionForExit(testPosition, currentPrice);
        
        if (!exitResult.shouldExit) {
            log('✅ Тест пройден: позиция не закрывается при прибыли ниже порога', 'green');
            return true;
        } else {
            log(`❌ Тест провален: позиция не должна закрываться при +5%`, 'red');
            return false;
        }
    } catch (error) {
        log(`❌ Ошибка в тесте: ${error.message}`, 'red');
        return false;
    }
}

async function testCase5_FullyClosedPosition() {
    log('\n📋 Тест-кейс 5: Позиция уже полностью закрыта', 'cyan');
    
    try {
        // Создаем тестовую рекомендацию
        await Recommendation.findOrCreate({
            where: { figi: 'TEST_FIGI_5' },
            defaults: {
                figi: 'TEST_FIGI_5',
                ticker: 'TEST5',
                name: 'Тестовый инструмент 5',
                recommendation: 'BUY',
                confidence: 0.8,
                score: 0.8,
                priceAtAnalysis: 100.0
            }
        });

        const testPosition = await TradingRequest.create({
            recommendationId: 'TEST_FIGI_5',
            figi: 'TEST_FIGI_5',
            ticker: 'TEST5',
            name: 'Тестовый инструмент 5',
            action: 'BUY',
            quantity: 100,
            priceAtRequest: 100.0,
            actualPrice: 100.0,
            estimatedAmount: 10000,
            confidence: 0.8,
            score: 0.8,
            status: 'EXECUTED',
            tradingMode: 'paper',
            executedAt: new Date()
        });

        // Создаем все три закрытия (50% + 25% + 25% = 100%)
        await PositionExit.create({
            tradingRequestId: testPosition.id,
            figi: 'TEST_FIGI_5',
            ticker: 'TEST5',
            name: 'Тестовый инструмент 5',
            entryPrice: 100.0,
            initialQuantity: 100,
            remainingQuantity: 50,
            exitStage: 'STAGE_1_10PCT',
            profitPercent: 10.0,
            exitPrice: 110.0,
            exitQuantity: 50,
            exitAmount: 5500,
            commission: 0,
            realizedProfit: 500,
            status: 'EXECUTED',
            tradingMode: 'paper',
            executedAt: new Date()
        });

        await PositionExit.create({
            tradingRequestId: testPosition.id,
            figi: 'TEST_FIGI_5',
            ticker: 'TEST5',
            name: 'Тестовый инструмент 5',
            entryPrice: 100.0,
            initialQuantity: 100,
            remainingQuantity: 25,
            exitStage: 'STAGE_2_15PCT',
            profitPercent: 15.0,
            exitPrice: 115.0,
            exitQuantity: 25,
            exitAmount: 2875,
            commission: 0,
            realizedProfit: 375,
            status: 'EXECUTED',
            tradingMode: 'paper',
            executedAt: new Date()
        });

        await PositionExit.create({
            tradingRequestId: testPosition.id,
            figi: 'TEST_FIGI_5',
            ticker: 'TEST5',
            name: 'Тестовый инструмент 5',
            entryPrice: 100.0,
            initialQuantity: 100,
            remainingQuantity: 0,
            exitStage: 'STAGE_3_20PCT',
            profitPercent: 20.0,
            exitPrice: 120.0,
            exitQuantity: 25,
            exitAmount: 3000,
            commission: 0,
            realizedProfit: 500,
            status: 'EXECUTED',
            tradingMode: 'paper',
            executedAt: new Date()
        });

        // Симулируем цену +25% (125.0)
        const currentPrice = 125.0;
        
        const exitResult = await PartialExitService.checkPositionForExit(testPosition, currentPrice);
        
        if (!exitResult.shouldExit && exitResult.reason === 'Position already fully closed') {
            log('✅ Тест пройден: полностью закрытая позиция не закрывается повторно', 'green');
            return true;
        } else {
            log(`❌ Тест провален: позиция должна быть полностью закрыта`, 'red');
            log(`   Получено: shouldExit=${exitResult.shouldExit}, reason=${exitResult.reason}`, 'red');
            return false;
        }
    } catch (error) {
        log(`❌ Ошибка в тесте: ${error.message}`, 'red');
        return false;
    }
}

async function testCase6_ExitStatistics() {
    log('\n📋 Тест-кейс 6: Статистика по закрытиям', 'cyan');
    
    try {
        // Создаем тестовую рекомендацию
        await Recommendation.findOrCreate({
            where: { figi: 'TEST_FIGI_6' },
            defaults: {
                figi: 'TEST_FIGI_6',
                ticker: 'TEST6',
                name: 'Тестовый инструмент 6',
                recommendation: 'BUY',
                confidence: 0.8,
                score: 0.8,
                priceAtAnalysis: 100.0
            }
        });

        const testPosition = await TradingRequest.create({
            recommendationId: 'TEST_FIGI_6',
            figi: 'TEST_FIGI_6',
            ticker: 'TEST6',
            name: 'Тестовый инструмент 6',
            action: 'BUY',
            quantity: 100,
            priceAtRequest: 100.0,
            actualPrice: 100.0,
            estimatedAmount: 10000,
            confidence: 0.8,
            score: 0.8,
            status: 'EXECUTED',
            tradingMode: 'paper',
            executedAt: new Date()
        });

        // Создаем несколько закрытий
        await PositionExit.create({
            tradingRequestId: testPosition.id,
            figi: 'TEST_FIGI_6',
            ticker: 'TEST6',
            name: 'Тестовый инструмент 6',
            entryPrice: 100.0,
            initialQuantity: 100,
            remainingQuantity: 50,
            exitStage: 'STAGE_1_10PCT',
            profitPercent: 10.0,
            exitPrice: 110.0,
            exitQuantity: 50,
            exitAmount: 5500,
            commission: 10,
            realizedProfit: 490,
            status: 'EXECUTED',
            tradingMode: 'paper',
            executedAt: new Date()
        });

        await PositionExit.create({
            tradingRequestId: testPosition.id,
            figi: 'TEST_FIGI_6',
            ticker: 'TEST6',
            name: 'Тестовый инструмент 6',
            entryPrice: 100.0,
            initialQuantity: 100,
            remainingQuantity: 25,
            exitStage: 'STAGE_2_15PCT',
            profitPercent: 15.0,
            exitPrice: 115.0,
            exitQuantity: 25,
            exitAmount: 2875,
            commission: 5,
            realizedProfit: 370,
            status: 'EXECUTED',
            tradingMode: 'paper',
            executedAt: new Date()
        });

        const stats = await PartialExitService.getExitStatistics('TEST_FIGI_6', testPosition.id);
        
        if (stats.totalExits === 2 && 
            stats.totalRealizedProfit === 860 && 
            stats.totalCommission === 15 &&
            stats.byStage.STAGE_1_10PCT.count === 1 &&
            stats.byStage.STAGE_2_15PCT.count === 1) {
            log('✅ Тест пройден: статистика корректно рассчитана', 'green');
            log(`   Всего закрытий: ${stats.totalExits}`, 'blue');
            log(`   Общая прибыль: ${stats.totalRealizedProfit}`, 'blue');
            log(`   Общая комиссия: ${stats.totalCommission}`, 'blue');
            return true;
        } else {
            log(`❌ Тест провален: некорректная статистика`, 'red');
            log(`   Ожидалось: totalExits=2, totalProfit=860, totalCommission=15`, 'red');
            log(`   Получено: totalExits=${stats.totalExits}, totalProfit=${stats.totalRealizedProfit}, totalCommission=${stats.totalCommission}`, 'red');
            return false;
        }
    } catch (error) {
        log(`❌ Ошибка в тесте: ${error.message}`, 'red');
        return false;
    }
}

async function cleanup() {
    log('\n🧹 Очистка тестовых данных...', 'yellow');
    try {
        const { Op } = await import('sequelize');
        
        // Удаляем все тестовые данные (в правильном порядке из-за внешних ключей)
        await PositionExit.destroy({
            where: {
                figi: {
                    [Op.like]: 'TEST_FIGI_%'
                }
            }
        });
        
        await TradingRequest.destroy({
            where: {
                figi: {
                    [Op.like]: 'TEST_FIGI_%'
                }
            }
        });
        
        await Recommendation.destroy({
            where: {
                figi: {
                    [Op.like]: 'TEST_FIGI_%'
                }
            }
        });
        
        log('✅ Тестовые данные очищены', 'green');
    } catch (error) {
        log(`⚠️ Ошибка очистки: ${error.message}`, 'yellow');
    }
}

async function runTests() {
    log('\n🧪 ЗАПУСК ТЕСТОВ ЧАСТИЧНОГО ЗАКРЫТИЯ ПОЗИЦИЙ\n', 'cyan');
    
    try {
        // Подключаемся к БД
        await sequelize.authenticate();
        log('✅ Подключение к БД успешно\n', 'green');
        
        // Инициализируем сервис
        await PartialExitService.initialize();
        log('✅ PartialExitService инициализирован\n', 'green');
        
        const results = [];
        
        // Запускаем тесты
        results.push(await testCase1_BasicPartialExit());
        results.push(await testCase2_SecondStageExit());
        results.push(await testCase3_ThirdStageExit());
        results.push(await testCase4_NoExitBelowThreshold());
        results.push(await testCase5_FullyClosedPosition());
        results.push(await testCase6_ExitStatistics());
        
        // Очистка
        await cleanup();
        
        // Итоги
        const passed = results.filter(r => r).length;
        const total = results.length;
        
        log('\n' + '='.repeat(50), 'cyan');
        log(`📊 РЕЗУЛЬТАТЫ ТЕСТИРОВАНИЯ`, 'cyan');
        log('='.repeat(50), 'cyan');
        log(`✅ Пройдено: ${passed}/${total}`, passed === total ? 'green' : 'yellow');
        log(`❌ Провалено: ${total - passed}/${total}`, total - passed > 0 ? 'red' : 'green');
        log('='.repeat(50) + '\n', 'cyan');
        
        process.exit(passed === total ? 0 : 1);
    } catch (error) {
        log(`\n❌ Критическая ошибка: ${error.message}`, 'red');
        log(error.stack, 'red');
        await cleanup();
        process.exit(1);
    }
}

runTests();

