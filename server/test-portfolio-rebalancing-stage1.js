/**
 * Тесты для Этапа 1: PortfolioRebalancingService
 * 
 * Тестирует:
 * 1. Инициализацию сервиса
 * 2. Проверку необходимости ребалансировки
 * 3. Расчет операций ребалансировки
 * 4. Оптимизацию операций с учетом комиссий
 * 5. Полную процедуру ребалансировки (dry-run)
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import sequelize from './src/config/database.js';
import { initDatabase } from './src/utils/initDatabase.js';
import PortfolioRebalancingService from './src/services/PortfolioRebalancingService.js';
import TradingEngine from './src/services/TradingEngine.js';
import CapitalAllocationStrategy from './src/services/CapitalAllocationStrategy.js';
import ServiceManager from './src/services/ServiceManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загрузка переменных окружения
dotenv.config({ path: join(__dirname, '.env') });

// Helper для цветного вывода
const log = (message, color = 'white') => {
    const colors = {
        red: '\x1b[31m',
        green: '\x1b[32m',
        yellow: '\x1b[33m',
        blue: '\x1b[34m',
        magenta: '\x1b[35m',
        cyan: '\x1b[36m',
        white: '\x1b[37m',
        reset: '\x1b[0m'
    };
    console.log(`${colors[color]}${message}${colors.reset}`);
};

const logSection = (title) => {
    log('\n' + '='.repeat(60), 'cyan');
    log(title, 'cyan');
    log('='.repeat(60), 'cyan');
};

const logTest = (name, passed, details = '') => {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    const color = passed ? 'green' : 'red';
    log(`${status}: ${name} ${details ? `- ${details}` : ''}`, color);
};

async function runStage1Tests() {
    const results = { passed: 0, failed: 0 };

    try {
        logSection('ТЕСТИРОВАНИЕ ЭТАПА 1: PortfolioRebalancingService');
        log('Проверка функциональности сервиса ребалансировки портфеля', 'blue');

        // 1. Инициализация
        logSection('1. Инициализация базы данных и сервисов');
        try {
            await initDatabase();
            await ServiceManager.initializeSystem(null, sequelize);
            log('✅ База данных и сервисы инициализированы', 'green');
            results.passed++;
        } catch (error) {
            logTest('Инициализация базы данных и сервисов', false, error.message);
            results.failed++;
            return; // Прерываем, если инициализация не удалась
        }

        // 2. Проверка инициализации PortfolioRebalancingService
        logSection('2. Проверка инициализации PortfolioRebalancingService');
        try {
            const status = PortfolioRebalancingService.getStatus();
            const isInitialized = status.initialized === true;
            logTest('PortfolioRebalancingService инициализирован', isInitialized);
            if (isInitialized) {
                results.passed++;
                log(`   Настройки: enabled=${status.enabled}, threshold=${status.settings.threshold}%`, 'cyan');
            } else {
                results.failed++;
            }
        } catch (error) {
            logTest('Проверка инициализации PortfolioRebalancingService', false, error.message);
            results.failed++;
        }

        // 3. Проверка необходимости ребалансировки (вызываем один раз и сохраняем результат)
        logSection('3. Проверка необходимости ребалансировки');
        let checkResult = null;
        try {
            checkResult = await PortfolioRebalancingService.checkRebalancingNeeded();
            
            const hasCorrectStructure = checkResult.hasOwnProperty('needsRebalancing') &&
                                       checkResult.hasOwnProperty('deviations') &&
                                       checkResult.hasOwnProperty('summary');
            
            logTest('checkRebalancingNeeded() возвращает корректную структуру', hasCorrectStructure);
            if (hasCorrectStructure) {
                results.passed++;
                
                log(`   Нужна ребалансировка: ${checkResult.needsRebalancing}`, 'cyan');
                log(`   Всего позиций: ${checkResult.summary.positionsCount || 0}`, 'cyan');
                log(`   Отклонений: ${checkResult.summary.deviationsCount || 0}`, 'cyan');
                log(`   Максимальное отклонение: ${checkResult.summary.maxDeviation?.toFixed(2) || 0}%`, 'cyan');
                
                if (checkResult.deviations && checkResult.deviations.length > 0) {
                    log('   Примеры отклонений:', 'cyan');
                    checkResult.deviations.slice(0, 3).forEach(dev => {
                        log(`     - ${dev.ticker}: ${dev.currentWeight.toFixed(2)}% → ${dev.targetWeight.toFixed(2)}% (отклонение: ${dev.deviation.toFixed(2)}%)`, 'cyan');
                    });
                } else {
                    log('   ℹ️ Отклонений не найдено (это нормально, если портфель пуст или уже сбалансирован)', 'yellow');
                }
            } else {
                results.failed++;
            }
        } catch (error) {
            logTest('Проверка необходимости ребалансировки', false, error.message);
            console.error(error);
            results.failed++;
        }

        // 4. Расчет операций ребалансировки (используем сохраненный результат)
        logSection('4. Расчет операций ребалансировки');
        try {
            if (!checkResult) {
                log('   ⚠️ Пропущено: нет результата проверки', 'yellow');
                results.passed++; // Не считаем это ошибкой
            } else if (checkResult.needsRebalancing && checkResult.deviations.length > 0) {
                const operations = await PortfolioRebalancingService.calculateRebalancingOperations(checkResult.deviations);
                
                const isArray = Array.isArray(operations);
                const hasOperations = operations.length > 0;
                
                logTest('calculateRebalancingOperations() возвращает массив', isArray);
                if (isArray) {
                    results.passed++;
                } else {
                    results.failed++;
                }
                
                if (hasOperations) {
                    logTest('Найдены операции для ребалансировки', true);
                    results.passed++;
                    
                    log(`   Найдено операций: ${operations.length}`, 'cyan');
                    log('   Примеры операций:', 'cyan');
                    operations.slice(0, 3).forEach(op => {
                        log(`     - ${op.ticker} ${op.action} ${op.quantity} шт. по ${op.currentPrice.toFixed(2)} руб (приоритет: ${op.priority.toFixed(2)})`, 'cyan');
                    });
                    
                    // Сохраняем операции для следующего шага
                    checkResult.operations = operations;
                } else {
                    log('   ℹ️ Операции не найдены (возможно, суммы меньше минимума)', 'yellow');
                    results.passed++; // Не считаем это ошибкой
                }
            } else {
                log('   ℹ️ Ребалансировка не требуется, пропускаем расчет операций', 'yellow');
                results.passed++; // Не считаем это ошибкой
            }
        } catch (error) {
            logTest('Расчет операций ребалансировки', false, error.message);
            console.error(error);
            results.failed++;
        }

        // 5. Оптимизация операций с учетом комиссий (используем сохраненные операции)
        logSection('5. Оптимизация операций с учетом комиссий');
        try {
            if (!checkResult || !checkResult.operations || checkResult.operations.length === 0) {
                log('   ℹ️ Нет операций для оптимизации', 'yellow');
                results.passed++; // Не считаем это ошибкой
            } else {
                const optimized = await PortfolioRebalancingService.optimizeOperationsWithCommissions(checkResult.operations);
                
                const isArray = Array.isArray(optimized);
                const optimizedCount = optimized.length;
                
                logTest('optimizeOperationsWithCommissions() возвращает массив', isArray);
                if (isArray) {
                    results.passed++;
                } else {
                    results.failed++;
                }
                
                log(`   Операций до оптимизации: ${checkResult.operations.length}`, 'cyan');
                log(`   Операций после оптимизации: ${optimizedCount}`, 'cyan');
                
                if (optimizedCount > 0) {
                    log('   Примеры оптимизированных операций:', 'cyan');
                    optimized.slice(0, 3).forEach(op => {
                        log(`     - ${op.ticker} ${op.action}: выгода ${op.rebalanceBenefit?.toFixed(2) || 0} руб, комиссия ${op.estimatedCommission?.toFixed(2) || 0} руб, чистая выгода ${op.netBenefit?.toFixed(2) || 0} руб`, 'cyan');
                    });
                    results.passed++;
                } else {
                    log('   ℹ️ После оптимизации не осталось целесообразных операций', 'yellow');
                    results.passed++; // Не считаем это ошибкой
                }
            }
        } catch (error) {
            logTest('Оптимизация операций с учетом комиссий', false, error.message);
            console.error(error);
            results.failed++;
        }

        // 6. Полная процедура ребалансировки (dry-run)
        logSection('6. Полная процедура ребалансировки (dry-run)');
        try {
            // Включаем dry-run режим
            const originalDryRun = PortfolioRebalancingService.settings.dryRun;
            PortfolioRebalancingService.settings.dryRun = true;
            
            const result = await PortfolioRebalancingService.performRebalancing();
            
            // Восстанавливаем настройку
            PortfolioRebalancingService.settings.dryRun = originalDryRun;
            
            const hasCorrectStructure = result.hasOwnProperty('success') &&
                                       result.hasOwnProperty('rebalanced');
            
            logTest('performRebalancing() возвращает корректную структуру', hasCorrectStructure);
            if (hasCorrectStructure) {
                results.passed++;
                
                log(`   Успешно: ${result.success}`, 'cyan');
                log(`   Ребалансировано: ${result.rebalanced}`, 'cyan');
                
                if (result.rebalanced) {
                    log(`   Операций запланировано: ${result.operationsPlanned || 0}`, 'cyan');
                    log(`   Операций выполнено: ${result.operationsExecuted || 0}`, 'cyan');
                    log(`   Комиссия: ${result.totalCommission?.toFixed(2) || 0} руб`, 'cyan');
                } else {
                    log(`   Причина: ${result.reason || 'не указана'}`, 'cyan');
                }
            } else {
                results.failed++;
            }
        } catch (error) {
            logTest('Полная процедура ребалансировки', false, error.message);
            console.error(error);
            results.failed++;
        }

        // 7. Проверка статуса сервиса
        logSection('7. Проверка статуса сервиса');
        try {
            const status = PortfolioRebalancingService.getStatus();
            
            const hasRequiredFields = status.hasOwnProperty('initialized') &&
                                    status.hasOwnProperty('enabled') &&
                                    status.hasOwnProperty('settings');
            
            logTest('getStatus() возвращает корректную структуру', hasRequiredFields);
            if (hasRequiredFields) {
                results.passed++;
                log(`   Инициализирован: ${status.initialized}`, 'cyan');
                log(`   Включен: ${status.enabled}`, 'cyan');
                log(`   Последняя проверка: ${status.lastCheck ? new Date(status.lastCheck).toLocaleString('ru-RU') : 'никогда'}`, 'cyan');
                log(`   Последняя ребалансировка: ${status.lastRebalance ? new Date(status.lastRebalance).toLocaleString('ru-RU') : 'никогда'}`, 'cyan');
            } else {
                results.failed++;
            }
        } catch (error) {
            logTest('Проверка статуса сервиса', false, error.message);
            results.failed++;
        }

        // Итоги
        log('\n' + '='.repeat(60), 'cyan');
        log('ИТОГИ ТЕСТИРОВАНИЯ ЭТАПА 1', 'cyan');
        log('='.repeat(60), 'cyan');
        log(`✅ Пройдено тестов: ${results.passed}`, 'green');
        log(`❌ Провалено тестов: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
        log(`📊 Всего тестов: ${results.passed + results.failed}`, 'cyan');
        log(`📈 Успешность: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`, 'cyan');
        log('='.repeat(60) + '\n', 'cyan');

        if (results.failed === 0) {
            log('🎉 Все тесты этапа 1 пройдены успешно!', 'green');
        } else {
            log('⚠️ Некоторые тесты провалены. Проверьте логи выше.', 'yellow');
        }

    } catch (error) {
        log('❌ Критическая ошибка во время тестов:', 'red');
        console.error(error);
        results.failed++;
    } finally {
        await sequelize.close().catch(() => {});
        log('✅ Соединение с базой данных закрыто.', 'green');
        process.exit(results.failed > 0 ? 1 : 0);
    }
}

// Запуск тестов
runStage1Tests();

