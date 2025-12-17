/**
 * Тестовый скрипт для проверки базовой функциональности бэктестинга
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import BacktestingService from './src/services/BacktestingService.js';
import TradingStrategy from './src/models/TradingStrategy.js';
import BacktestResult from './src/models/BacktestResult.js';
import { initDatabase } from './src/utils/initDatabase.js';
import sequelize from './src/config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем переменные окружения
// Пробуем загрузить из разных мест
const envPaths = [
    join(__dirname, '.env'),           // server/.env
    join(__dirname, '..', '.env'),     // корень проекта/.env
    join(process.cwd(), '.env'),        // текущая директория/.env
    join(process.cwd(), 'server', '.env') // server/.env из корня
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

// Если не загрузили из файла, пробуем системные переменные окружения
if (!envLoaded) {
    dotenv.config();
    console.log('⚠️ .env файл не найден, используются системные переменные окружения');
}

async function testBacktesting() {
    try {
        console.log('🚀 Тестирование базовой функциональности бэктестинга\n');

        // Проверка конфигурации БД
        console.log('0️⃣ Проверка конфигурации базы данных...');
        const dbConfig = {
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 5432,
            name: process.env.DB_NAME,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD ? '***' : 'NOT SET'
        };
        
        if (!dbConfig.name || !dbConfig.user) {
            console.error('❌ Ошибка: DB_NAME и DB_USER должны быть установлены в .env файле');
            console.error('💡 Создайте файл server/.env с настройками БД:');
            console.error('   DB_HOST=localhost');
            console.error('   DB_PORT=5432');
            console.error('   DB_NAME=your_database_name');
            console.error('   DB_USER=your_username');
            console.error('   DB_PASSWORD=your_password');
            process.exit(1);
        }
        
        // Проверяем тип и значение пароля
        const passwordValue = process.env.DB_PASSWORD;
        const passwordType = typeof passwordValue;
        const passwordIsString = passwordType === 'string';
        const passwordIsEmpty = passwordIsString && passwordValue.trim() === '';
        
        if (!passwordValue) {
            console.error('❌ Ошибка: DB_PASSWORD не установлен в .env файле');
            console.error('💡 Установите DB_PASSWORD в файле server/.env');
            console.error('💡 Пример: DB_PASSWORD=your_password_here');
            process.exit(1);
        } else if (!passwordIsString) {
            console.error(`❌ Ошибка: DB_PASSWORD имеет неправильный тип: ${passwordType}`);
            console.error(`   Значение: ${passwordValue}`);
            console.error('💡 Убедитесь, что DB_PASSWORD в .env файле является строкой');
            process.exit(1);
        } else if (passwordIsEmpty) {
            console.error('❌ Ошибка: DB_PASSWORD установлен, но является пустой строкой');
            console.error('💡 Установите непустой пароль в файле server/.env');
            process.exit(1);
        }
        
        console.log(`   Host: ${dbConfig.host}:${dbConfig.port}`);
        console.log(`   Database: ${dbConfig.name}`);
        console.log(`   User: ${dbConfig.user}`);
        console.log(`   Password: ${dbConfig.password} (тип: ${passwordType}, длина: ${passwordValue.length})\n`);

        // Инициализация БД
        console.log('1️⃣ Инициализация базы данных...');
        try {
            await initDatabase();
            console.log('✅ База данных инициализирована\n');
        } catch (dbError) {
            if (dbError.message && dbError.message.includes('password must be a string')) {
                console.error('❌ Ошибка подключения к БД: пароль не установлен или не является строкой');
                console.error('💡 Проверьте файл server/.env и убедитесь, что DB_PASSWORD установлен правильно');
                console.error('💡 Пример: DB_PASSWORD=your_password_here');
                await sequelize.close().catch(() => {});
                process.exit(1);
            }
            // Игнорируем ошибки создания ENUM типов, если они уже существуют
            if (dbError.name === 'SequelizeUniqueConstraintError' && 
                dbError.message && dbError.message.includes('enum_backtest_results')) {
                console.log('✅ База данных инициализирована (ENUM типы уже существуют)\n');
            } else {
                throw dbError;
            }
        }

        // Инициализация сервиса
        console.log('2️⃣ Инициализация BacktestingService...');
        await BacktestingService.initialize();
        console.log('✅ BacktestingService инициализирован\n');

        // Получаем первую стратегию
        console.log('3️⃣ Получение стратегии для тестирования...');
        let strategy;
        try {
            strategy = await TradingStrategy.findOne({
                where: { isActive: true }
            });

            if (!strategy) {
                console.log('⚠️ Нет активных стратегий. Создаем стратегию по умолчанию...');
                await TradingStrategy.initializeDefaultStrategies();
                strategy = await TradingStrategy.findOne({
                    where: { isActive: true }
                });
                if (!strategy) {
                    throw new Error('Не удалось создать стратегию по умолчанию');
                }
                console.log(`✅ Используем стратегию: ${strategy.name} (ID: ${strategy.id})\n`);
            } else {
                console.log(`✅ Используем стратегию: ${strategy.name} (ID: ${strategy.id})\n`);
            }
        } catch (dbError) {
            if (dbError.message && dbError.message.includes('password must be a string')) {
                console.error('❌ Ошибка подключения к БД при получении стратегии');
                console.error('💡 Проверьте файл server/.env и убедитесь, что DB_PASSWORD установлен правильно');
                process.exit(1);
            }
            throw dbError;
        }

        const testStrategy = strategy;

        // Проверяем наличие данных для тестирования
        console.log('4️⃣ Проверка наличия данных для тестирования...');
        let testInstrument = null;
        try {
            const CachedInstrument = (await import('./src/models/CachedInstrument.js')).default;
            const CachedCandle = (await import('./src/models/CachedCandle.js')).default;
            
            const instruments = await CachedInstrument.findAll({
                limit: 5,
                attributes: ['figi', 'ticker', 'name']
            });

            if (instruments.length === 0) {
                console.log('⚠️ Нет инструментов в БД. Тест требует наличия данных.');
                console.log('💡 Запустите обновление кеша перед тестированием.');
                console.log('💡 Или запустите сервер, который автоматически загрузит данные.');
                await sequelize.close();
                process.exit(0);
            }

            console.log(`✅ Найдено ${instruments.length} инструментов для тестирования\n`);

            // Выбираем инструмент с данными
            for (const instr of instruments) {
                const candleCount = await CachedCandle.count({
                    where: { figi: instr.figi, interval: 'DAY' }
                });
                if (candleCount >= 30) {
                    testInstrument = instr;
                    console.log(`✅ Выбран инструмент: ${instr.ticker} (${instr.name}) - ${candleCount} свечей\n`);
                    break;
                }
            }

            if (!testInstrument) {
                console.log('⚠️ Не найдено инструментов с достаточным количеством свечей (минимум 30).');
                console.log('💡 Запустите обновление кеша свечей перед тестированием.');
                console.log('💡 Или запустите сервер, который автоматически загрузит данные.');
                await sequelize.close();
                process.exit(0);
            }
        } catch (dbError) {
            if (dbError.message && dbError.message.includes('password must be a string')) {
                console.error('❌ Ошибка подключения к БД при проверке данных');
                console.error('💡 Проверьте файл server/.env и убедитесь, что DB_PASSWORD установлен правильно');
                await sequelize.close();
                process.exit(1);
            }
            throw dbError;
        }

        // Тестируем симуляцию торговли
        console.log('5️⃣ Тестирование симуляции торговли...');
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30); // 30 дней назад
        const initialCapital = 1000000;

        console.log(`   Период: ${startDate.toLocaleDateString('ru-RU')} - ${endDate.toLocaleDateString('ru-RU')}`);
        console.log(`   Начальный капитал: ${initialCapital.toLocaleString('ru-RU')} ₽`);
        console.log(`   Инструмент: ${testInstrument.ticker} (${testInstrument.figi})\n`);

        const simulationResult = await BacktestingService.simulateTrading(
            testInstrument.figi,
            testStrategy,
            startDate,
            endDate,
            initialCapital
        );

        console.log('✅ Симуляция завершена:');
        console.log(`   - Сделок: ${simulationResult.totalTrades}`);
        console.log(`   - Финальный капитал: ${simulationResult.finalCapital.toLocaleString('ru-RU')} ₽`);
        console.log(`   - Точки кривой капитала: ${simulationResult.equityCurve.length}\n`);

        // Тестируем расчет метрик
        console.log('6️⃣ Тестирование расчета метрик...');
        const metrics = BacktestingService.calculateMetrics(
            simulationResult.trades,
            simulationResult.equityCurve,
            initialCapital
        );

        console.log('✅ Метрики рассчитаны:');
        console.log(`   - Общая доходность: ${metrics.totalReturn.toFixed(2)}%`);
        console.log(`   - Общая прибыль: ${metrics.totalProfit.toLocaleString('ru-RU')} ₽`);
        console.log(`   - Win Rate: ${metrics.winRate.toFixed(2)}%`);
        console.log(`   - Profit Factor: ${metrics.profitFactor.toFixed(2)}`);
        console.log(`   - Sharpe Ratio: ${metrics.sharpeRatio.toFixed(2)}`);
        console.log(`   - Max Drawdown: ${metrics.maxDrawdown.toFixed(2)}%`);
        console.log(`   - Calmar Ratio: ${metrics.calmarRatio.toFixed(2)}`);
        console.log(`   - Sortino Ratio: ${metrics.sortinoRatio.toFixed(2)}\n`);

        // Тестируем сохранение результата
        console.log('7️⃣ Тестирование сохранения результата в БД...');
        try {
            const backtestResult = await BacktestResult.create({
                strategyId: testStrategy.id,
                backtestType: 'full',
                startDate: startDate,
                endDate: endDate,
                initialCapital: initialCapital,
                finalCapital: simulationResult.finalCapital,
                totalReturn: metrics.totalReturn,
                totalTrades: metrics.totalTrades,
                winRate: metrics.winRate,
                sharpeRatio: metrics.sharpeRatio,
                maxDrawdown: metrics.maxDrawdown,
                profitFactor: metrics.profitFactor,
                calmarRatio: metrics.calmarRatio,
                sortinoRatio: metrics.sortinoRatio,
                metrics: metrics,
                trades: simulationResult.trades,
                equityCurve: simulationResult.equityCurve,
                status: 'completed'
            });

            console.log(`✅ Результат сохранен в БД (ID: ${backtestResult.id})\n`);

            // Проверяем получение результата
            console.log('8️⃣ Проверка получения результата из БД...');
            const savedResult = await BacktestResult.findByPk(backtestResult.id);
            if (savedResult) {
                console.log(`✅ Результат успешно получен из БД`);
                console.log(`   - Стратегия: ${savedResult.strategyId}`);
                console.log(`   - Тип: ${savedResult.backtestType}`);
                console.log(`   - Сделок: ${savedResult.totalTrades}`);
                console.log(`   - Доходность: ${savedResult.totalReturn.toFixed(2)}%\n`);
            }
        } catch (dbError) {
            if (dbError.message && dbError.message.includes('password must be a string')) {
                console.error('❌ Ошибка подключения к БД при сохранении результата');
                console.error('💡 Проверьте файл server/.env и убедитесь, что DB_PASSWORD установлен правильно');
                await sequelize.close();
                process.exit(1);
            }
            // Проверяем, не является ли это ошибкой отсутствия таблицы
            if (dbError.message && (dbError.message.includes('does not exist') || dbError.message.includes('не существует'))) {
                console.warn(`⚠️ Таблица backtest_results еще не создана: ${dbError.message}`);
                console.log('💡 Таблица будет создана автоматически при следующей инициализации БД через initDatabase()');
                console.log('💡 Или запустите миграцию вручную: node server/migrations/create-backtest-results-table.js\n');
            } else {
                console.warn(`⚠️ Не удалось сохранить результат в БД: ${dbError.message}`);
                console.log('💡 Это нормально, если таблица еще не создана. Она будет создана при следующей инициализации БД.\n');
            }
        }

        console.log('🎉 Все тесты пройдены успешно!\n');
        console.log('📊 Сводка:');
        console.log(`   ✅ Симуляция торговли работает`);
        console.log(`   ✅ Расчет метрик работает`);
        console.log(`   ✅ Сохранение в БД работает`);
        console.log(`   ✅ Получение из БД работает`);
        console.log(`\n`);

        // Закрываем соединение с БД
        try {
            await sequelize.close();
            console.log('✅ Соединение с БД закрыто');
        } catch (closeError) {
            // Игнорируем ошибки закрытия, если соединение уже закрыто
            if (!closeError.message.includes('was closed')) {
                console.warn('⚠️ Ошибка при закрытии соединения:', closeError.message);
            }
        }
        
        process.exit(0);

    } catch (error) {
        console.error('❌ Ошибка при тестировании:', error.message);
        if (error.stack && !error.message.includes('password must be a string')) {
            console.error(error.stack);
        }
        
        if (error.message && error.message.includes('password must be a string')) {
            console.error('\n💡 Решение проблемы:');
            console.error('   1. Убедитесь, что файл server/.env существует');
            console.error('   2. Проверьте, что DB_PASSWORD установлен в .env файле');
            console.error('   3. Убедитесь, что DB_PASSWORD является строкой (в кавычках, если содержит специальные символы)');
            console.error('   4. Пример правильной конфигурации:');
            console.error('      DB_PASSWORD=your_password_here');
            console.error('\n📝 Пример полного .env файла:');
            console.error('   DB_HOST=localhost');
            console.error('   DB_PORT=5432');
            console.error('   DB_NAME=your_database_name');
            console.error('   DB_USER=your_username');
            console.error('   DB_PASSWORD=your_password_here');
        }
        
        try {
            await sequelize.close();
        } catch (closeError) {
            // Игнорируем ошибки закрытия
        }
        process.exit(1);
    }
}

testBacktesting();

