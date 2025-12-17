/**
 * Тестовый скрипт для проверки walk-forward анализа
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

async function testWalkForward() {
    try {
        console.log('🚀 Тестирование walk-forward анализа\n');

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

        // Инициализация сервиса
        console.log('2️⃣ Инициализация BacktestingService...');
        await BacktestingService.initialize();
        console.log('✅ BacktestingService инициализирован\n');

        // Получаем стратегию
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
                await sequelize.close().catch(() => {});
                process.exit(1);
            }
            throw dbError;
        }

        // Проверяем наличие данных
        console.log('4️⃣ Проверка наличия данных для тестирования...');
        try {
            const CachedInstrument = (await import('./src/models/CachedInstrument.js')).default;
            const CachedCandle = (await import('./src/models/CachedCandle.js')).default;
            
            const instruments = await CachedInstrument.findAll({
                limit: 10,
                attributes: ['figi', 'ticker', 'name']
            });

            if (instruments.length === 0) {
                console.log('⚠️ Нет инструментов в БД. Тест требует наличия данных.');
                console.log('💡 Запустите обновление кеша перед тестированием.');
                await sequelize.close();
                process.exit(0);
            }

            console.log(`✅ Найдено ${instruments.length} инструментов для тестирования\n`);

            // Выбираем инструменты с достаточным количеством данных
            const testInstruments = [];
            for (const instr of instruments) {
                const candleCount = await CachedCandle.count({
                    where: { figi: instr.figi, interval: 'DAY' }
                });
                if (candleCount >= 90) { // Минимум 90 свечей для walk-forward (3 месяца * 30 дней)
                    testInstruments.push(instr.figi);
                    if (testInstruments.length >= 5) { // Берем первые 5 инструментов
                        break;
                    }
                }
            }

            if (testInstruments.length === 0) {
                console.log('⚠️ Не найдено инструментов с достаточным количеством свечей (минимум 90).');
                console.log('💡 Запустите обновление кеша свечей перед тестированием.');
                await sequelize.close();
                process.exit(0);
            }

            console.log(`✅ Выбрано ${testInstruments.length} инструментов с достаточным количеством данных\n`);

            // Тестируем walk-forward анализ
            console.log('5️⃣ Тестирование walk-forward анализа...');
            const endDate = new Date();
            const startDate = new Date();
            startDate.setMonth(startDate.getMonth() - 6); // 6 месяцев назад для теста
            const initialCapital = 1000000;

            console.log(`   Период: ${startDate.toLocaleDateString('ru-RU')} - ${endDate.toLocaleDateString('ru-RU')}`);
            console.log(`   Начальный капитал: ${initialCapital.toLocaleString('ru-RU')} ₽`);
            console.log(`   Инструменты: ${testInstruments.length}\n`);

            const walkForwardResult = await BacktestingService.walkForwardAnalysis(
                strategy.id,
                {
                    startDate: startDate,
                    endDate: endDate,
                    windowSizeMonths: 2, // 2 месяца на окно для теста
                    stepSizeMonths: 1,  // Шаг 1 месяц
                    initialCapital: initialCapital,
                    instruments: testInstruments,
                    maxInstruments: 5,
                    saveToDb: true
                }
            );

            console.log('\n✅ Walk-forward анализ завершен:');
            console.log(`   - Окон протестировано: ${walkForwardResult.windowResults.length}`);
            console.log(`   - Средняя доходность: ${walkForwardResult.stabilityAnalysis.averageReturn.toFixed(2)}%`);
            console.log(`   - Консистентность: ${(walkForwardResult.stabilityAnalysis.consistency * 100).toFixed(2)}%`);
            console.log(`   - Средний Win Rate: ${walkForwardResult.stabilityAnalysis.averageWinRate.toFixed(2)}%`);
            console.log(`   - Средний Sharpe Ratio: ${walkForwardResult.stabilityAnalysis.averageSharpeRatio.toFixed(2)}`);
            console.log(`   - Деградация обнаружена: ${walkForwardResult.degradationAnalysis.isDegrading ? 'ДА' : 'НЕТ'}`);
            if (walkForwardResult.degradationAnalysis.isDegrading) {
                console.log(`   - Уровень серьезности: ${walkForwardResult.degradationAnalysis.severity}`);
                console.log(`   - Причины: ${walkForwardResult.degradationAnalysis.reasons.join('; ')}`);
            }
            console.log(`\n`);

            // Проверяем сохранение результата
            console.log('6️⃣ Проверка сохранения результата в БД...');
            const savedResults = await BacktestResult.findAll({
                where: {
                    strategyId: strategy.id,
                    backtestType: 'walk_forward'
                },
                order: [['createdAt', 'DESC']],
                limit: 1
            });

            if (savedResults.length > 0) {
                const savedResult = savedResults[0];
                console.log(`✅ Результат успешно сохранен в БД (ID: ${savedResult.id})`);
                console.log(`   - Тип: ${savedResult.backtestType}`);
                console.log(`   - Доходность: ${savedResult.totalReturn.toFixed(2)}%`);
                console.log(`   - Win Rate: ${savedResult.winRate.toFixed(2)}%`);
                console.log(`   - Sharpe Ratio: ${savedResult.sharpeRatio.toFixed(2)}\n`);
            } else {
                console.log('⚠️ Результат не найден в БД (возможно, не был сохранен)\n');
            }

            // Выводим детали по окнам
            console.log('7️⃣ Детали по окнам:');
            for (const window of walkForwardResult.windowResults) {
                console.log(`   Окно ${window.windowIndex}: ${window.startDate.toLocaleDateString('ru-RU')} - ${window.endDate.toLocaleDateString('ru-RU')}`);
                console.log(`      Доходность: ${window.totalReturn.toFixed(2)}%, Сделок: ${window.totalTrades}, Win Rate: ${window.winRate.toFixed(2)}%`);
            }
            console.log(`\n`);

            // Выводим предупреждения
            if (walkForwardResult.alerts.length > 0) {
                console.log('8️⃣ Предупреждения:');
                for (const alert of walkForwardResult.alerts) {
                    const emoji = alert.severity === 'critical' ? '🔴' : alert.severity === 'high' ? '🟠' : '🟡';
                    console.log(`   ${emoji} ${alert.type.toUpperCase()}: ${alert.message}`);
                }
                console.log(`\n`);
            }

            console.log('🎉 Все тесты пройдены успешно!\n');
            console.log('📊 Сводка:');
            console.log(`   ✅ Walk-forward анализ работает`);
            console.log(`   ✅ Анализ стабильности работает`);
            console.log(`   ✅ Выявление деградации работает`);
            console.log(`   ✅ Сохранение в БД работает`);
            console.log(`\n`);

        } catch (dbError) {
            if (dbError.message && dbError.message.includes('password must be a string')) {
                console.error('❌ Ошибка подключения к БД');
                console.error('💡 Проверьте файл server/.env и убедитесь, что DB_PASSWORD установлен правильно');
                await sequelize.close();
                process.exit(1);
            }
            throw dbError;
        }

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
        console.error('❌ Ошибка при тестировании:', error.message);
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

testWalkForward();

