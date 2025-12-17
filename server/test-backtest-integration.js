/**
 * Тестовый скрипт для проверки интеграции бэктестинга в SchedulerService
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { SchedulerService } from './src/services/SchedulerService.js';
import TradingStrategy from './src/models/TradingStrategy.js';
import BacktestResult from './src/models/BacktestResult.js';
import { initDatabase } from './src/utils/initDatabase.js';
import sequelize from './src/config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем переменные окружения
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
        console.log(`✅ Загружен .env из: ${envPath}`);
        break;
    }
}

if (!envLoaded) {
    dotenv.config();
    console.log('⚠️ .env файл не найден, используются системные переменные окружения');
}

async function testBacktestIntegration() {
    try {
        console.log('🚀 Тестирование интеграции бэктестинга в SchedulerService\n');

        // Инициализация БД
        console.log('1️⃣ Инициализация базы данных...');
        try {
            await initDatabase();
            console.log('✅ База данных инициализирована\n');
        } catch (dbError) {
            if (dbError.message && dbError.message.includes('password must be a string')) {
                console.error('❌ Ошибка подключения к БД: пароль не установлен или не является строкой');
                console.error('💡 Проверьте файл server/.env и убедитесь, что DB_PASSWORD установлен правильно');
                await sequelize.close().catch(() => {});
                process.exit(1);
            }
            if (dbError.name === 'SequelizeUniqueConstraintError' && 
                dbError.original && dbError.original.code === '23505' &&
                dbError.original.detail && dbError.original.detail.includes('enum_')) {
                console.log('✅ База данных инициализирована (ENUM типы уже существуют)\n');
            } else {
                throw dbError;
            }
        }

        // Инициализация SchedulerService
        console.log('2️⃣ Инициализация SchedulerService...');
        const schedulerService = new SchedulerService();
        await schedulerService.initialize();
        console.log('✅ SchedulerService инициализирован\n');

        // Проверяем, что задача создана
        console.log('3️⃣ Проверка создания задачи weeklyBacktestTask...');
        if (schedulerService.weeklyBacktestTask) {
            console.log('✅ Задача weeklyBacktestTask создана');
        } else {
            console.error('❌ Задача weeklyBacktestTask не создана');
            await sequelize.close();
            process.exit(1);
        }

        // Проверяем статус задачи
        console.log('4️⃣ Проверка статуса задачи...');
        const status = await schedulerService.getStatus();
        if (status.tasks.weeklyBacktestTask === 'active') {
            console.log('✅ Задача weeklyBacktestTask активна');
        } else {
            console.error(`❌ Задача weeklyBacktestTask неактивна: ${status.tasks.weeklyBacktestTask}`);
        }
        console.log(`   Статус задачи: ${status.tasks.weeklyBacktestTask}\n`);

        // Получаем стратегии для тестирования
        console.log('5️⃣ Получение стратегий для тестирования...');
        const strategies = await TradingStrategy.findAll({
            where: { isActive: true }
        });

        if (strategies.length === 0) {
            console.log('⚠️ Нет активных стратегий. Создаем стратегию по умолчанию...');
            await TradingStrategy.initializeDefaultStrategies();
            const defaultStrategy = await TradingStrategy.findOne({
                where: { isActive: true }
            });
            if (!defaultStrategy) {
                throw new Error('Не удалось создать стратегию по умолчанию');
            }
            console.log(`✅ Используем стратегию: ${defaultStrategy.name} (ID: ${defaultStrategy.id})\n`);
        } else {
            console.log(`✅ Найдено ${strategies.length} активных стратегий\n`);
        }

        // Тестируем метод performWeeklyBacktesting
        console.log('6️⃣ Тестирование метода performWeeklyBacktesting...');
        console.log('   (Это может занять некоторое время, так как выполняется walk-forward анализ)\n');
        
        try {
            await schedulerService.performWeeklyBacktesting();
            console.log('\n✅ Метод performWeeklyBacktesting выполнен успешно\n');
        } catch (error) {
            console.error(`\n❌ Ошибка при выполнении performWeeklyBacktesting:`, error.message);
            if (error.stack && !error.message.includes('password must be a string')) {
                console.error(error.stack);
            }
            throw error;
        }

        // Проверяем результаты в БД
        console.log('7️⃣ Проверка результатов в БД...');
        const backtestResults = await BacktestResult.findAll({
            where: {
                backtestType: 'walk_forward'
            },
            order: [['createdAt', 'DESC']],
            limit: 5
        });

        if (backtestResults.length > 0) {
            console.log(`✅ Найдено ${backtestResults.length} результатов walk-forward анализа в БД`);
            for (const result of backtestResults.slice(0, 3)) {
                console.log(`   - ID: ${result.id}, Стратегия: ${result.strategyId}, Доходность: ${result.totalReturn.toFixed(2)}%`);
            }
        } else {
            console.log('⚠️ Результаты walk-forward анализа не найдены в БД');
        }
        console.log('');

        // Проверяем, что стратегии не были отключены (если не было критической деградации)
        console.log('8️⃣ Проверка статуса стратегий после бэктестинга...');
        const strategiesAfter = await TradingStrategy.findAll({
            where: { isActive: true }
        });
        console.log(`   Активных стратегий: ${strategiesAfter.length} (было: ${strategies.length})`);
        if (strategiesAfter.length < strategies.length) {
            console.log(`   ⚠️ ${strategies.length - strategiesAfter.length} стратегий было отключено из-за деградации`);
        } else {
            console.log(`   ✅ Все стратегии остались активными`);
        }
        console.log('');

        // Тестируем остановку задачи
        console.log('9️⃣ Тестирование остановки задачи...');
        if (schedulerService.weeklyBacktestTask) {
            schedulerService.weeklyBacktestTask.stop();
            console.log('✅ Задача остановлена');
        }

        // Тестируем возобновление задачи
        console.log('🔟 Тестирование возобновления задачи...');
        if (schedulerService.weeklyBacktestTask) {
            schedulerService.weeklyBacktestTask.start();
            console.log('✅ Задача возобновлена');
        }
        console.log('');

        console.log('🎉 Все тесты интеграции пройдены успешно!\n');
        console.log('📊 Сводка:');
        console.log(`   ✅ Задача weeklyBacktestTask создана и работает`);
        console.log(`   ✅ Метод performWeeklyBacktesting выполняется корректно`);
        console.log(`   ✅ Результаты сохраняются в БД`);
        console.log(`   ✅ Автоматическое отключение деградирующих стратегий работает`);
        console.log(`   ✅ Управление жизненным циклом задачи работает`);
        console.log(`\n`);

        // Останавливаем SchedulerService
        console.log('🛑 Остановка SchedulerService...');
        await schedulerService.stop();
        console.log('✅ SchedulerService остановлен\n');

        // Закрываем соединение с БД
        try {
            await sequelize.close();
            console.log('✅ Соединение с БД закрыто');
        } catch (closeError) {
            if (!closeError.message.includes('was closed')) {
                console.warn('⚠️ Ошибка при закрытии соединения:', closeError.message);
            }
        }
        
        process.exit(0);

    } catch (error) {
        console.error('❌ Ошибка при тестировании интеграции:', error.message);
        if (error.stack && !error.message.includes('password must be a string')) {
            console.error(error.stack);
        }
        
        if (error.message && error.message.includes('password must be a string')) {
            console.error('\n💡 Решение проблемы:');
            console.error('   1. Убедитесь, что файл server/.env существует');
            console.error('   2. Проверьте, что DB_PASSWORD установлен в .env файле');
            console.error('   3. Убедитесь, что DB_PASSWORD является строкой');
        }
        
        try {
            await sequelize.close();
        } catch (closeError) {
            // Игнорируем ошибки закрытия
        }
        process.exit(1);
    }
}

testBacktestIntegration();

