import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем переменные окружения
dotenv.config({ path: resolve(__dirname, '../../.env') });

import sequelize from '../config/database.js';
import SchedulerService from '../services/SchedulerService.js';
import DatabaseConnectionManager from './DatabaseConnectionManager.js';
import cron from 'node-cron';

/**
 * Тестирование инициализации cron задач (без реальных запросов к API)
 */
async function testCronInitialization() {
    console.log('🧪 ТЕСТИРОВАНИЕ ИНИЦИАЛИЗАЦИИ CRON ЗАДАЧ\n');
    console.log('=' .repeat(70));
    console.log('Проверяем правильность инициализации всех автоматических задач');
    console.log('(без выполнения реальных запросов к API)');
    console.log('=' .repeat(70));
    console.log('');

    const results = {
        initialized: [],
        missing: [],
        errors: []
    };

    try {
        // Подключаемся к БД
        await sequelize.authenticate();
        console.log('✅ Подключение к БД успешно\n');

        // Инициализируем менеджер соединений
        try {
            await DatabaseConnectionManager.initialize();
        } catch (e) {
            console.warn('⚠️ Не удалось инициализировать менеджер соединений:', e.message);
        }

        // Инициализируем SchedulerService
        console.log('🔧 Инициализация SchedulerService...');
        const schedulerService = new SchedulerService();
        await schedulerService.initialize();
        console.log('✅ SchedulerService инициализирован\n');

        // Проверяем наличие всех cron задач
        console.log('📋 Проверка наличия cron задач:');
        console.log('─'.repeat(70));

        const tasksToCheck = [
            { name: 'Обновление кеша', property: 'cacheTask', schedule: '0 2 * * *' },
            { name: 'Обновление цен', property: 'priceUpdateTask', schedule: '*/20 * * * *' },
            { name: 'Обновление цен портфеля', property: 'portfolioPricesUpdateTask', schedule: '*/2 * * * *' },
            { name: 'Обновление цен сигналов', property: 'activeSignalsPricesUpdateTask', schedule: '*/5 * * * *' },
            { name: 'Обновление цен заявок', property: 'tradingRequestsPricesUpdateTask', schedule: '*/1 * * * *' },
            { name: 'Очистка данных', property: 'cleanupTask', schedule: '0 2 * * *' },
            { name: 'Полное обучение', property: 'trainingTask', schedule: '0 3 * * *' },
            { name: 'Быстрое обучение', property: 'quickTrainingTask', schedule: '0 8,10,12,14,16,18 * * *' },
            { name: 'Торговые часы', property: 'tradingHoursTask', schedule: '*/5 * * * *' },
            { name: 'Кеш торговых часов', property: 'tradingHoursCacheTask', schedule: '*/15 * * * *' },
            { name: 'Очистка новостей', property: 'newsCleanupTask', schedule: '0 3 * * 0' },
            { name: 'Ежедневное обновление новостей', property: 'newsDailyUpdateTask', schedule: '0 9 * * *' },
            { name: 'Кеш Telegram', property: 'telegramCacheTask', schedule: '0 */6 * * *' },
            { name: 'Проверка деградации', property: 'degradationCheckTask', schedule: '0 */6 * * *' },
            { name: 'Анализ портфеля', property: 'portfolioAnalysisTask', schedule: '0 * * * *' },
            { name: 'Обновление предсказаний', property: 'predictionsUpdateTask', schedule: '*/20 * * * *' },
            { name: 'Обновление сигналов', property: 'signalsUpdateTask', schedule: '0 6 * * *' },
            { name: 'Проверка трейлинг-стопов', property: 'trailingStopsCheckTask', schedule: '*/5 * * * *' },
            { name: 'Перебалансировка стратегий', property: 'strategyRebalanceTask', schedule: '0 3 * * 0' }
        ];

        for (const task of tasksToCheck) {
            try {
                const taskInstance = schedulerService[task.property];
                
                if (taskInstance) {
                    // Проверяем, что это cron задача
                    const isValid = taskInstance && typeof taskInstance.stop === 'function';
                    
                    if (isValid) {
                        // Получаем расписание из задачи (если доступно)
                        const schedule = task.schedule;
                        const isValidSchedule = cron.validate(schedule);
                        
                        console.log(`✅ ${task.name}`);
                        console.log(`   Свойство: ${task.property}`);
                        console.log(`   Расписание: ${schedule} ${isValidSchedule ? '✓' : '✗'}`);
                        console.log(`   Тип: cron задача`);
                        
                        results.initialized.push({
                            name: task.name,
                            property: task.property,
                            schedule: schedule,
                            valid: isValidSchedule
                        });
                    } else {
                        console.log(`⚠️  ${task.name}`);
                        console.log(`   Свойство: ${task.property}`);
                        console.log(`   Статус: инициализировано, но не является cron задачей`);
                        results.initialized.push({
                            name: task.name,
                            property: task.property,
                            schedule: task.schedule,
                            valid: false,
                            warning: 'Not a cron task'
                        });
                    }
                } else {
                    console.log(`❌ ${task.name}`);
                    console.log(`   Свойство: ${task.property}`);
                    console.log(`   Статус: не инициализировано`);
                    results.missing.push({
                        name: task.name,
                        property: task.property,
                        schedule: task.schedule
                    });
                }
                console.log('');
            } catch (error) {
                console.log(`❌ ${task.name}`);
                console.log(`   Ошибка: ${error.message}`);
                results.errors.push({
                    name: task.name,
                    property: task.property,
                    error: error.message
                });
                console.log('');
            }
        }

        // Проверяем WebSocket broadcast задачи
        console.log('📡 Проверка WebSocket broadcast задач:');
        console.log('─'.repeat(70));
        
        const intervals = schedulerService.intervals;
        if (intervals && intervals.size > 0) {
            console.log(`✅ Найдено ${intervals.size} WebSocket broadcast задач`);
            let index = 1;
            intervals.forEach(task => {
                if (task && typeof task.stop === 'function') {
                    console.log(`   ${index}. WebSocket broadcast задача (тип: cron)`);
                    index++;
                }
            });
        } else {
            console.log(`⚠️  WebSocket broadcast задачи не найдены`);
        }
        console.log('');

        // Проверяем методы выполнения задач
        console.log('🔧 Проверка методов выполнения задач:');
        console.log('─'.repeat(70));

        const methodsToCheck = [
            { name: 'performCacheUpdate', required: true },
            { name: 'performPriceUpdate', required: true },
            { name: 'performPortfolioPricesUpdate', required: true },
            { name: 'performActiveSignalsPricesUpdate', required: true },
            { name: 'performTradingRequestsPricesUpdate', required: true },
            { name: 'performCleanup', required: true },
            { name: 'performScheduledTraining', required: false }, // Не проверяем, так как это обучение
            { name: 'performDailyNewsUpdate', required: true },
            { name: 'performTelegramCacheUpdate', required: true },
            { name: 'performSignalsUpdate', required: true },
            { name: 'updateRecommendationsPredictions', required: true },
            { name: 'checkDegradationAndRestoreAll', required: true },
            { name: 'performNewsCacheCleanup', required: true },
            { name: 'checkTrailingStops', required: true },
            { name: 'performPortfolioAnalysis', required: false }, // Не проверяем, так как это анализ
            { name: 'isCacheStale', required: true },
            { name: 'shouldUpdateCache', required: true },
            { name: 'getCacheStatus', required: true }
        ];

        for (const method of methodsToCheck) {
            try {
                if (typeof schedulerService[method.name] === 'function') {
                    console.log(`✅ ${method.name}()`);
                    results.initialized.push({
                        name: `Метод: ${method.name}`,
                        type: 'method',
                        exists: true
                    });
                } else {
                    if (method.required) {
                        console.log(`❌ ${method.name}() - отсутствует`);
                        results.missing.push({
                            name: `Метод: ${method.name}`,
                            type: 'method'
                        });
                    } else {
                        console.log(`⏭️  ${method.name}() - не требуется для проверки`);
                    }
                }
            } catch (error) {
                console.log(`❌ ${method.name}() - ошибка проверки: ${error.message}`);
                results.errors.push({
                    name: `Метод: ${method.name}`,
                    error: error.message
                });
            }
        }
        console.log('');

        // Проверяем настройки расписания
        console.log('⚙️  Проверка настроек расписания:');
        console.log('─'.repeat(70));

        try {
            const SettingsService = (await import('../services/SettingsService.js')).default;
            const schedulerSettings = await SettingsService.getSchedulerSettings();
            
            const settingsToCheck = [
                { key: 'cache_update_interval', default: '0 2 * * *', description: 'Обновление кеша' },
                { key: 'nn_training_schedule', default: '0 3 * * *', description: 'Полное обучение' },
                { key: 'nn_training_interval', default: '0 8,10,12,14,16,18 * * *', description: 'Быстрое обучение' },
                { key: 'price_update_interval_minutes', default: 20, description: 'Интервал обновления цен (мин)' },
                { key: 'portfolio_prices_update_interval_minutes', default: 2, description: 'Интервал обновления цен портфеля (мин)' },
                { key: 'active_signals_prices_update_interval_minutes', default: 5, description: 'Интервал обновления цен сигналов (мин)' },
                { key: 'trading_requests_prices_update_interval_seconds', default: 60, description: 'Интервал обновления цен заявок (сек)' },
                { key: 'trading_hours_update_interval', default: '*/15 * * * *', description: 'Обновление торговых часов' },
                { key: 'degradation_check_interval', default: '0 */6 * * *', description: 'Проверка деградации' }
            ];

            for (const setting of settingsToCheck) {
                const value = schedulerSettings[setting.key] || setting.default;
                const isValid = setting.key.includes('interval') && typeof value === 'string' 
                    ? cron.validate(value) 
                    : (typeof value === 'number' || typeof value === 'string');
                
                console.log(`   ${setting.key}: ${value} ${isValid ? '✓' : '✗'}`);
                console.log(`      ${setting.description}`);
            }
        } catch (error) {
            console.log(`⚠️  Ошибка при проверке настроек: ${error.message}`);
        }
        console.log('');

        // Итоговая статистика
        console.log('=' .repeat(70));
        console.log('📊 ИТОГОВАЯ СТАТИСТИКА');
        console.log('=' .repeat(70));
        
        const totalTasks = results.initialized.length + results.missing.length + results.errors.length;
        const validTasks = results.initialized.filter(t => t.valid !== false).length;
        const invalidTasks = results.initialized.filter(t => t.valid === false).length;
        
        console.log(`✅ Инициализировано задач: ${results.initialized.length}`);
        console.log(`   Валидных: ${validTasks}`);
        if (invalidTasks > 0) {
            console.log(`   С предупреждениями: ${invalidTasks}`);
        }
        
        if (results.missing.length > 0) {
            console.log(`\n❌ Отсутствует задач: ${results.missing.length}`);
            results.missing.forEach(item => {
                console.log(`   • ${item.name} (${item.property || 'N/A'})`);
            });
        }
        
        if (results.errors.length > 0) {
            console.log(`\n⚠️  Ошибок: ${results.errors.length}`);
            results.errors.forEach(item => {
                console.log(`   • ${item.name}: ${item.error}`);
            });
        }
        
        console.log('\n' + '=' .repeat(70));
        console.log(`🎉 Проверка инициализации завершена!`);
        console.log(`   Всего проверено: ${totalTasks}`);
        console.log(`   Успешно: ${validTasks}`);
        console.log(`   Проблем: ${results.missing.length + results.errors.length}`);
        console.log('=' .repeat(70));

        // Проверяем статус инициализации
        if (schedulerService.isInitialized) {
            console.log('\n✅ SchedulerService полностью инициализирован');
        } else {
            console.log('\n⚠️  SchedulerService не полностью инициализирован');
        }

    } catch (error) {
        console.error('❌ Критическая ошибка при тестировании:', error);
        console.error(error.stack);
        process.exit(1);
    } finally {
        // Закрываем соединение с БД
        try {
            await sequelize.close();
            console.log('\n✅ Соединение с БД закрыто');
        } catch (e) {
            console.warn('⚠️ Ошибка при закрытии соединения:', e.message);
        }
        process.exit(0);
    }
}

// Запускаем тестирование
testCronInitialization();

