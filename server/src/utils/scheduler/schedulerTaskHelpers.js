import cron from 'node-cron';
import OptimizedTelegramService from '../../services/OptimizedTelegramService.js';

/**
 * Утилиты для создания и управления cron задачами
 */

/**
 * Проверяет, нужно ли пропустить первый запуск задачи
 * @param {number} startTime - Время старта сервиса (timestamp)
 * @param {number} minDelay - Минимальная задержка в миллисекундах
 * @returns {boolean} true если нужно пропустить запуск
 */
export function shouldSkipFirstRun(startTime, minDelay = 60 * 1000) {
    if (!startTime) {
        return false;
    }
    const timeSinceStart = Date.now() - startTime;
    return timeSinceStart < minDelay;
}

/**
 * Обертка для обработки ошибок в задачах
 * @param {Function} taskHandler - Функция-обработчик задачи
 * @param {string} taskName - Название задачи для логирования
 * @param {Object} options - Опции обработки ошибок
 * @param {boolean} options.sendAlerts - Отправлять ли уведомления в Telegram
 * @param {string} options.alertType - Тип уведомления (critical, warning, info)
 * @returns {Function} Обернутая функция с обработкой ошибок
 */
export function wrapTaskWithErrorHandling(taskHandler, taskName, options = {}) {
    const { sendAlerts = false, alertType = 'warning' } = options;
    
    return async (...args) => {
        try {
            await taskHandler(...args);
        } catch (error) {
            console.error(`Error in ${taskName}:`, error);
            
            if (sendAlerts) {
                try {
                    await OptimizedTelegramService.sendAlert(
                        `${taskName.toUpperCase()}_ERROR`,
                        error.message,
                        alertType
                    );
                } catch (alertError) {
                    console.error(`Failed to send alert for ${taskName}:`, alertError);
                }
            }
        }
    };
}

/**
 * Создает задачу с проверкой пропуска первого запуска
 * @param {Function} taskHandler - Функция-обработчик задачи
 * @param {number} startTime - Время старта сервиса
 * @param {number} minDelay - Минимальная задержка перед первым запуском
 * @returns {Function} Обернутая функция с проверкой
 */
export function createTaskWithSkipCheck(taskHandler, startTime, minDelay = 60 * 1000) {
    return async (...args) => {
        if (shouldSkipFirstRun(startTime, minDelay)) {
            return;
        }
        await taskHandler(...args);
    };
}

/**
 * Создает задачу с проверкой свежести кеша перед выполнением
 * @param {Function} taskHandler - Функция-обработчик задачи
 * @param {Function} isCacheStaleFn - Функция проверки свежести кеша
 * @param {Object} options - Опции
 * @param {number} options.maxWait - Максимальное время ожидания обновления кеша (мс)
 * @param {boolean} options.skipIfStale - Пропустить задачу если кеш устарел
 * @returns {Function} Обернутая функция с проверкой кеша
 */
export function createTaskWithStaleCheck(taskHandler, isCacheStaleFn, options = {}) {
    const { maxWait = 10 * 60 * 1000, skipIfStale = false } = options;
    
    return async (...args) => {
        const isStale = await isCacheStaleFn();
        
        if (isStale) {
            if (skipIfStale) {
                console.log('⚠️ Cache is stale, skipping task (will run after cache update)...');
                return;
            }
            
            console.log('⚠️ Cache is stale, waiting for cache update before task...');
            // Ждем обновления кеша
            let waitTime = 0;
            while (await isCacheStaleFn() && waitTime < maxWait) {
                await new Promise(resolve => setTimeout(resolve, 60000)); // Ждем 1 минуту
                waitTime += 60000;
            }
            
            if (await isCacheStaleFn()) {
                console.log('⚠️ Cache update timeout, proceeding with task anyway...');
            }
        }
        
        await taskHandler(...args);
    };
}

/**
 * Универсальный создатель cron задач
 * @param {string} schedule - Cron расписание
 * @param {Function} handler - Функция-обработчик
 * @param {Object} options - Опции задачи
 * @param {string} options.taskName - Название задачи
 * @param {boolean} options.sendAlerts - Отправлять ли уведомления об ошибках
 * @param {string} options.alertType - Тип уведомления
 * @param {number} options.startTime - Время старта сервиса для проверки пропуска
 * @param {number} options.minDelay - Минимальная задержка перед первым запуском
 * @param {Function} options.isCacheStaleFn - Функция проверки свежести кеша
 * @param {boolean} options.checkCacheStale - Проверять ли свежесть кеша
 * @param {boolean} options.skipIfStale - Пропускать ли задачу если кеш устарел
 * @param {Function} options.checkFlagFn - Функция проверки флага (должна возвращать boolean)
 * @param {string} options.flagName - Название флага для логирования
 * @param {string} options.timezone - Часовой пояс (по умолчанию "Europe/Moscow")
 * @returns {Object} Cron задача
 */
export function createScheduledTask(schedule, handler, options = {}) {
    const {
        taskName = 'scheduled-task',
        sendAlerts = false,
        alertType = 'warning',
        startTime = null,
        minDelay = 60 * 1000,
        isCacheStaleFn = null,
        checkCacheStale = false,
        skipIfStale = false,
        checkFlagFn = null,
        flagName = 'flag',
        timezone = 'Europe/Moscow'
    } = options;
    
    let wrappedHandler = handler;
    
    // Добавляем проверку флага
    if (checkFlagFn) {
        wrappedHandler = createTaskWithFlagCheck(wrappedHandler, checkFlagFn, flagName);
    }
    
    // Добавляем проверку пропуска первого запуска
    if (startTime !== null) {
        wrappedHandler = createTaskWithSkipCheck(wrappedHandler, startTime, minDelay);
    }
    
    // Добавляем проверку свежести кеша
    if (checkCacheStale && isCacheStaleFn) {
        wrappedHandler = createTaskWithStaleCheck(
            wrappedHandler,
            isCacheStaleFn,
            { skipIfStale }
        );
    }
    
    // Добавляем обработку ошибок
    wrappedHandler = wrapTaskWithErrorHandling(wrappedHandler, taskName, {
        sendAlerts,
        alertType
    });
    
    // Создаем cron задачу
    const task = cron.schedule(schedule, wrappedHandler, {
        scheduled: true,
        timezone
    });
    
    return task;
}

/**
 * Создает задачу с проверкой флага выполнения другой задачи
 * @param {Function} taskHandler - Функция-обработчик задачи
 * @param {Function} checkFlagFn - Функция проверки флага (должна возвращать boolean)
 * @param {string} flagName - Название флага для логирования
 * @returns {Function} Обернутая функция с проверкой флага
 */
export function createTaskWithFlagCheck(taskHandler, checkFlagFn, flagName = 'flag') {
    return async (...args) => {
        if (checkFlagFn()) {
            console.log(`⏭️ Skipping task - ${flagName} is active`);
            return;
        }
        await taskHandler(...args);
    };
}

