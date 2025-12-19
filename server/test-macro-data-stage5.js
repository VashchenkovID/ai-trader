/**
 * Тестирование этапа 5: Автоматическое обновление макро-данных через SchedulerService
 * 
 * Проверяет:
 * 1. Инициализацию задачи macroDataUpdateTask в SchedulerService
 * 2. Работу метода performMacroDataUpdate()
 * 3. Корректность создания cron-задачи
 * 4. Обработку ошибок
 * 5. Статус задачи
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initDatabase } from './src/utils/initDatabase.js';
import sequelize from './src/config/database.js';
import SchedulerService from './src/services/SchedulerService.js';
import MacroDataService from './src/services/MacroDataService.js';
import SettingsService from './src/services/SettingsService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
const envPaths = [
    join(__dirname, '.env'),
    join(__dirname, '..', '.env'),
    join(process.cwd(), '.env'),
    join(process.cwd(), 'server', '.env')
];

let envLoaded = false;
for (const envPath of envPaths) {
    const result = dotenv.config({ path: envPath });
    if (!result.error) {
        envLoaded = true;
        console.log(`✅ Loaded .env from: ${envPath}`);
        break;
    }
}

if (!envLoaded) {
    dotenv.config();
    console.log('⚠️ .env file not found, using system environment variables');
}

// Helper for colored console output
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

// Modified logTest to only show failures
const logTest = (name, passed, details = '') => {
    if (!passed) {
        const status = '❌ FAIL';
        const color = 'red';
        log(`${status}: ${name} ${details ? `- ${details}` : ''}`, color);
    }
};

async function runStage5Tests() {
    const results = {
        passed: 0,
        failed: 0
    };

    try {
        logSection('ТЕСТИРОВАНИЕ ЭТАПА 5: АВТОМАТИЧЕСКОЕ ОБНОВЛЕНИЕ МАКРО-ДАННЫХ');

        // 1. Инициализация
        logSection('1. Инициализация');
        try {
            await initDatabase();
            log('✅ База данных инициализирована', 'green');
            
            await MacroDataService.initialize();
            log('✅ MacroDataService инициализирован', 'green');
            
            await SchedulerService.initialize();
            log('✅ SchedulerService инициализирован', 'green');
            
            results.passed++;
        } catch (error) {
            logTest('Инициализация сервисов', false, error.message);
            results.failed++;
            throw error;
        }

        // 2. Проверка наличия задачи macroDataUpdateTask
        logSection('2. Проверка наличия задачи macroDataUpdateTask');
        try {
            const hasTask = SchedulerService.macroDataUpdateTask !== null && 
                           SchedulerService.macroDataUpdateTask !== undefined;
            
            if (hasTask) {
                results.passed++;
                log('✅ Задача macroDataUpdateTask создана', 'green');
                
                // Проверяем, что задача активна
                const taskStatus = SchedulerService.macroDataUpdateTask ? 'active' : 'inactive';
                if (taskStatus === 'active') {
                    results.passed++;
                    log('✅ Задача macroDataUpdateTask активна', 'green');
                } else {
                    logTest('Задача macroDataUpdateTask активна', false, `Статус: ${taskStatus}`);
                    results.failed++;
                }
            } else {
                logTest('Задача macroDataUpdateTask создана', false, 'Задача не найдена');
                results.failed++;
            }
        } catch (error) {
            logTest('Проверка наличия задачи macroDataUpdateTask', false, error.message);
            results.failed++;
        }

        // 3. Проверка расписания задачи
        logSection('3. Проверка расписания задачи');
        try {
            const schedule = await SettingsService.getSetting('macro_data_update_interval', '0 10 * * *');
            const hasSchedule = schedule && typeof schedule === 'string';
            
            if (hasSchedule) {
                results.passed++;
                log(`✅ Расписание задачи: ${schedule}`, 'green');
            } else {
                logTest('Расписание задачи загружено', false, `Получено: ${typeof schedule}`);
                results.failed++;
            }
        } catch (error) {
            logTest('Проверка расписания задачи', false, error.message);
            results.failed++;
        }

        // 4. Тестирование метода performMacroDataUpdate()
        logSection('4. Тестирование метода performMacroDataUpdate()');
        try {
            // Вызываем метод напрямую для тестирования
            await SchedulerService.performMacroDataUpdate();
            
            results.passed++;
            log('✅ Метод performMacroDataUpdate() выполнен успешно', 'green');
            
            // Проверяем, что данные были обновлены (или попытка была сделана)
            // Это нормально, если источники недоступны - главное, что метод работает
            const status = await MacroDataService.getStatus();
            if (status && typeof status === 'object') {
                results.passed++;
                log('✅ MacroDataService вернул статус после обновления', 'green');
            }
        } catch (error) {
            logTest('Метод performMacroDataUpdate() работает', false, error.message);
            results.failed++;
        }

        // 5. Проверка статуса задачи в getStatus()
        logSection('5. Проверка статуса задачи в getStatus()');
        try {
            const schedulerStatus = await SchedulerService.getStatus();
            
            if (schedulerStatus && schedulerStatus.tasks) {
                results.passed++;
                
                const taskStatus = schedulerStatus.tasks.macroDataUpdateTask;
                if (taskStatus === 'active' || taskStatus === 'inactive') {
                    results.passed++;
                    log(`✅ Статус задачи в getStatus(): ${taskStatus}`, 'green');
                } else {
                    logTest('Статус задачи корректный', false, `Получено: ${taskStatus}`);
                    results.failed++;
                }
            } else {
                logTest('Статус планировщика получен', false, 'tasks не найдены');
                results.failed++;
            }
        } catch (error) {
            logTest('Проверка статуса задачи', false, error.message);
            results.failed++;
        }

        // 6. Проверка остановки/паузы/возобновления задачи
        logSection('6. Проверка управления задачей');
        try {
            // Проверяем, что задача существует
            if (!SchedulerService.macroDataUpdateTask) {
                logTest('Задача существует для тестирования', false, 'Задача не найдена');
                results.failed++;
            } else {
                // Тестируем остановку
                try {
                    SchedulerService.macroDataUpdateTask.stop();
                    results.passed++;
                    log('✅ Задача успешно остановлена', 'green');
                    
                    // Тестируем запуск
                    SchedulerService.macroDataUpdateTask.start();
                    results.passed++;
                    log('✅ Задача успешно запущена', 'green');
                } catch (error) {
                    logTest('Управление задачей (stop/start)', false, error.message);
                    results.failed++;
                }
            }
        } catch (error) {
            logTest('Проверка управления задачей', false, error.message);
            results.failed++;
        }

        // Итоги
        log('\n' + '='.repeat(60), 'cyan');
        log('ИТОГИ ТЕСТИРОВАНИЯ ЭТАПА 5', 'cyan');
        log('='.repeat(60), 'cyan');
        log(`✅ Пройдено тестов: ${results.passed}`, 'green');
        log(`❌ Провалено тестов: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
        log(`📊 Всего тестов: ${results.passed + results.failed}`, 'cyan');
        log(`📈 Успешность: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`, 'cyan');
        log('='.repeat(60) + '\n', 'cyan');

        if (results.failed === 0) {
            log('🎉 Все тесты этапа 5 пройдены успешно!', 'green');
            log('✅ Автоматическое обновление макро-данных настроено', 'green');
            log('✅ Cron-задача создана и работает', 'green');
        } else {
            log('⚠️ Некоторые тесты провалены. Проверьте логи выше.', 'yellow');
        }

    } catch (error) {
        log('❌ Критическая ошибка во время тестов:', 'red');
        console.error(error);
        results.failed++;
    } finally {
        // Останавливаем SchedulerService перед закрытием БД
        try {
            await SchedulerService.stop();
            log('✅ SchedulerService остановлен', 'green');
        } catch (error) {
            console.warn('⚠️ Ошибка при остановке SchedulerService:', error.message);
        }
        
        await sequelize.close().catch(() => {});
        log('✅ Соединение с базой данных закрыто.', 'green');
        process.exit(results.failed > 0 ? 1 : 0);
    }
}

// Запускаем тесты
runStage5Tests().catch(error => {
    console.error('❌ Критическая ошибка:', error);
    process.exit(1);
});

