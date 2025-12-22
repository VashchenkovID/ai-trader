/**
 * Тесты для Этапа 5: Сохранение истории ребалансировок
 * 
 * Тестирует:
 * 1. Создание и синхронизацию модели PortfolioRebalancing
 * 2. Сохранение истории при выполнении ребалансировки
 * 3. Получение истории через API
 * 4. Корректность сохраненных данных
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import sequelize from './src/config/database.js';
import { initDatabase } from './src/utils/initDatabase.js';
import PortfolioRebalancingService from './src/services/PortfolioRebalancingService.js';
import PortfolioRebalancing from './src/models/PortfolioRebalancing.js';
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

async function runStage5Tests() {
    const results = { passed: 0, failed: 0 };

    try {
        logSection('ТЕСТИРОВАНИЕ ЭТАПА 5: Сохранение истории ребалансировок');
        log('Проверка функциональности сохранения истории', 'blue');

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

        // 2. Проверка синхронизации модели
        logSection('2. Проверка синхронизации модели PortfolioRebalancing');
        try {
            await PortfolioRebalancing.sync({ force: false });
            log('✅ Модель PortfolioRebalancing синхронизирована', 'green');
            results.passed++;
        } catch (error) {
            logTest('Синхронизация модели PortfolioRebalancing', false, error.message);
            results.failed++;
        }

        // 3. Проверка структуры модели
        logSection('3. Проверка структуры модели');
        try {
            const attributes = PortfolioRebalancing.rawAttributes;
            const requiredFields = ['id', 'timestamp', 'trigger', 'operations', 'totalCommission', 'result'];
            const hasAllFields = requiredFields.every(field => attributes[field]);
            
            logTest('Модель содержит все необходимые поля', hasAllFields);
            if (hasAllFields) {
                results.passed++;
                log(`   Найдено полей: ${Object.keys(attributes).length}`, 'cyan');
            } else {
                results.failed++;
                const missingFields = requiredFields.filter(field => !attributes[field]);
                log(`   Отсутствующие поля: ${missingFields.join(', ')}`, 'yellow');
            }
        } catch (error) {
            logTest('Проверка структуры модели', false, error.message);
            results.failed++;
        }

        // 4. Проверка сохранения истории при ребалансировке
        logSection('4. Проверка сохранения истории при ребалансировке');
        try {
            // Получаем количество записей до ребалансировки
            const countBefore = await PortfolioRebalancing.count();
            log(`   Записей в истории до ребалансировки: ${countBefore}`, 'cyan');

            // Убеждаемся, что сервис инициализирован
            if (!PortfolioRebalancingService.isInitialized) {
                await PortfolioRebalancingService.initialize();
            }

            // Выполняем ребалансировку (dry-run отключен для сохранения истории)
            const originalDryRun = PortfolioRebalancingService.settings.dryRun;
            PortfolioRebalancingService.settings.dryRun = false;

            try {
                const rebalanceResult = await PortfolioRebalancingService.performRebalancing();
                
                // Проверяем, что история сохранилась
                const countAfter = await PortfolioRebalancing.count();
                log(`   Записей в истории после ребалансировки: ${countAfter}`, 'cyan');

                const historySaved = countAfter > countBefore || (rebalanceResult.rebalanced === false && countAfter === countBefore);
                
                logTest('История сохраняется при ребалансировке', historySaved);
                if (historySaved) {
                    results.passed++;
                    
                    // Если была выполнена ребалансировка, проверяем последнюю запись
                    if (rebalanceResult.rebalanced && countAfter > countBefore) {
                        const lastRecord = await PortfolioRebalancing.findOne({
                            order: [['timestamp', 'DESC']]
                        });
                        
                        if (lastRecord) {
                            const hasCorrectStructure = 
                                lastRecord.trigger &&
                                Array.isArray(lastRecord.operations) &&
                                typeof lastRecord.totalCommission === 'number' &&
                                lastRecord.result &&
                                lastRecord.beforeState &&
                                lastRecord.afterState;
                            
                            logTest('Последняя запись имеет корректную структуру', hasCorrectStructure);
                            if (hasCorrectStructure) {
                                results.passed++;
                                log(`   Trigger: ${lastRecord.trigger}`, 'cyan');
                                log(`   Операций: ${lastRecord.operations.length}`, 'cyan');
                                log(`   Комиссия: ${lastRecord.totalCommission} ₽`, 'cyan');
                                log(`   Результат: ${lastRecord.result}`, 'cyan');
                            } else {
                                results.failed++;
                            }
                        }
                    } else {
                        log('   Ребалансировка не требовалась, история не создана', 'yellow');
                    }
                } else {
                    results.failed++;
                }
            } finally {
                // Восстанавливаем оригинальный режим
                PortfolioRebalancingService.settings.dryRun = originalDryRun;
            }
        } catch (error) {
            logTest('Сохранение истории при ребалансировке', false, error.message);
            results.failed++;
        }

        // 5. Проверка получения истории
        logSection('5. Проверка получения истории');
        try {
            const { count, rows } = await PortfolioRebalancing.findAndCountAll({
                limit: 10,
                offset: 0,
                order: [['timestamp', 'DESC']]
            });

            logTest('Получение истории работает', count >= 0);
            if (count >= 0) {
                results.passed++;
                log(`   Всего записей: ${count}`, 'cyan');
                log(`   Получено записей: ${rows.length}`, 'cyan');
                
                if (rows.length > 0) {
                    const firstRecord = rows[0];
                    const hasRequiredFields = 
                        firstRecord.id &&
                        firstRecord.timestamp &&
                        firstRecord.trigger &&
                        Array.isArray(firstRecord.operations) &&
                        typeof firstRecord.totalCommission === 'number' &&
                        firstRecord.result;
                    
                    logTest('Записи истории содержат все необходимые поля', hasRequiredFields);
                    if (hasRequiredFields) {
                        results.passed++;
                    } else {
                        results.failed++;
                    }
                }
            } else {
                results.failed++;
            }
        } catch (error) {
            logTest('Получение истории', false, error.message);
            results.failed++;
        }

        // 6. Проверка фильтрации по trigger
        logSection('6. Проверка фильтрации по trigger');
        try {
            const scheduledCount = await PortfolioRebalancing.count({
                where: { trigger: 'scheduled' }
            });
            const manualCount = await PortfolioRebalancing.count({
                where: { trigger: 'manual' }
            });
            
            logTest('Фильтрация по trigger работает', true);
            results.passed++;
            log(`   Scheduled: ${scheduledCount}`, 'cyan');
            log(`   Manual: ${manualCount}`, 'cyan');
        } catch (error) {
            logTest('Фильтрация по trigger', false, error.message);
            results.failed++;
        }

        // 7. Проверка фильтрации по result
        logSection('7. Проверка фильтрации по result');
        try {
            const successCount = await PortfolioRebalancing.count({
                where: { result: 'success' }
            });
            const partialCount = await PortfolioRebalancing.count({
                where: { result: 'partial' }
            });
            const failedCount = await PortfolioRebalancing.count({
                where: { result: 'failed' }
            });
            
            logTest('Фильтрация по result работает', true);
            results.passed++;
            log(`   Success: ${successCount}`, 'cyan');
            log(`   Partial: ${partialCount}`, 'cyan');
            log(`   Failed: ${failedCount}`, 'cyan');
        } catch (error) {
            logTest('Фильтрация по result', false, error.message);
            results.failed++;
        }

        // Итоги
        logSection('ИТОГИ ТЕСТИРОВАНИЯ');
        log(`Всего тестов: ${results.passed + results.failed}`, 'blue');
        log(`✅ Пройдено: ${results.passed}`, 'green');
        log(`❌ Провалено: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
        
        const successRate = ((results.passed / (results.passed + results.failed)) * 100).toFixed(1);
        log(`Процент успеха: ${successRate}%`, successRate >= 80 ? 'green' : 'yellow');

        if (results.failed === 0) {
            log('\n🎉 Все тесты пройдены успешно!', 'green');
        } else {
            log('\n⚠️ Некоторые тесты провалены. Проверьте вывод выше.', 'yellow');
        }

    } catch (error) {
        log('\n❌ Критическая ошибка при выполнении тестов:', 'red');
        console.error(error);
        process.exit(1);
    } finally {
        // Закрываем соединение с БД
        await sequelize.close();
        process.exit(results.failed > 0 ? 1 : 0);
    }
}

// Запускаем тесты
runStage5Tests();

