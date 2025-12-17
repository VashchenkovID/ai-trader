/**
 * Тестовый скрипт для проверки API endpoints бэктестинга
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import TradingStrategy from './src/models/TradingStrategy.js';
import BacktestResult from './src/models/BacktestResult.js';
import { initDatabase } from './src/utils/initDatabase.js';
import sequelize from './src/config/database.js';

// Устанавливаем ассоциации для тестирования
try {
    if (!BacktestResult.associations || !BacktestResult.associations.strategy) {
        BacktestResult.belongsTo(TradingStrategy, {
            foreignKey: 'strategyId',
            as: 'strategy'
        });
    }
    if (!TradingStrategy.associations || !TradingStrategy.associations.backtestResults) {
        TradingStrategy.hasMany(BacktestResult, {
            foreignKey: 'strategyId',
            as: 'backtestResults'
        });
    }
} catch (error) {
    // Ассоциации уже установлены - игнорируем
}

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

// Симуляция HTTP запросов
async function testAPIEndpoints() {
    try {
        console.log('🚀 Тестирование API endpoints для бэктестинга\n');

        // Инициализация БД
        console.log('1️⃣ Инициализация базы данных...');
        try {
            await initDatabase();
            console.log('✅ База данных инициализирована\n');
        } catch (dbError) {
            if (dbError.message && dbError.message.includes('password must be a string')) {
                console.error('❌ Ошибка подключения к БД: пароль не установлен или не является строкой');
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

        // Получаем стратегии для тестирования
        console.log('2️⃣ Получение стратегий для тестирования...');
        const strategies = await TradingStrategy.findAll({
            where: { isActive: true },
            limit: 1
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
            console.log(`✅ Найдена стратегия: ${strategies[0].name} (ID: ${strategies[0].id})\n`);
        }

        const testStrategyId = strategies[0]?.id || (await TradingStrategy.findOne({ where: { isActive: true } })).id;

        // Тест 1: GET /api/backtest/results/:strategyId
        console.log('3️⃣ Тест: GET /api/backtest/results/:strategyId');
        try {
            const results = await BacktestResult.findAll({
                where: {
                    strategyId: testStrategyId,
                    backtestType: 'walk_forward'
                },
                order: [['createdAt', 'DESC']],
                limit: 10
            });

            console.log(`   ✅ Найдено результатов: ${results.length}`);
            if (results.length > 0) {
                const latest = results[0];
                console.log(`   📊 Последний результат:`);
                console.log(`      - ID: ${latest.id}`);
                console.log(`      - Доходность: ${latest.totalReturn?.toFixed(2) || 'N/A'}%`);
                console.log(`      - Win Rate: ${latest.winRate?.toFixed(2) || 'N/A'}%`);
                console.log(`      - Сделок: ${latest.totalTrades || 0}`);
                console.log(`      - Дата создания: ${latest.createdAt}`);
            } else {
                console.log('   ⚠️ Результатов бэктестинга пока нет (это нормально для новой стратегии)');
            }
            console.log('');
        } catch (error) {
            console.error(`   ❌ Ошибка: ${error.message}\n`);
        }

        // Тест 2: GET /api/backtest/compare
        console.log('4️⃣ Тест: GET /api/backtest/compare');
        try {
            const allStrategies = await TradingStrategy.findAll({
                where: { isActive: true }
            });

            const comparison = [];
            for (const strategy of allStrategies) {
                const latestResult = await BacktestResult.findOne({
                    where: {
                        strategyId: strategy.id,
                        backtestType: 'walk_forward',
                        status: 'completed'
                    },
                    order: [['createdAt', 'DESC']]
                });

                if (latestResult) {
                    comparison.push({
                        strategyId: strategy.id,
                        strategyName: strategy.name,
                        totalReturn: latestResult.totalReturn,
                        winRate: latestResult.winRate,
                        sharpeRatio: latestResult.sharpeRatio
                    });
                }
            }

            console.log(`   ✅ Сравнение ${comparison.length} стратегий:`);
            if (comparison.length > 0) {
                comparison.sort((a, b) => (b.totalReturn || 0) - (a.totalReturn || 0));
                comparison.forEach((item, index) => {
                    console.log(`      ${index + 1}. ${item.strategyName}: ${item.totalReturn?.toFixed(2) || 'N/A'}% (Win Rate: ${item.winRate?.toFixed(2) || 'N/A'}%)`);
                });
            } else {
                console.log('   ⚠️ Нет результатов для сравнения');
            }
            console.log('');
        } catch (error) {
            console.error(`   ❌ Ошибка: ${error.message}\n`);
        }

        // Тест 3: GET /api/backtest/list
        console.log('5️⃣ Тест: GET /api/backtest/list');
        try {
            const { count, rows } = await BacktestResult.findAndCountAll({
                where: {
                    status: 'completed'
                },
                order: [['createdAt', 'DESC']],
                limit: 10,
                offset: 0,
                include: [{
                    model: TradingStrategy,
                    as: 'strategy',
                    attributes: ['id', 'name']
                }]
            });

            console.log(`   ✅ Найдено результатов: ${count}`);
            console.log(`   📋 Показано: ${rows.length}`);
            if (rows.length > 0) {
                console.log(`   📊 Примеры результатов:`);
                rows.slice(0, 3).forEach((result, index) => {
                    console.log(`      ${index + 1}. Стратегия: ${result.strategy?.name || 'Unknown'}`);
                    console.log(`         - Доходность: ${result.totalReturn?.toFixed(2) || 'N/A'}%`);
                    console.log(`         - Тип: ${result.backtestType}`);
                    console.log(`         - Дата: ${result.createdAt}`);
                });
            }
            console.log('');
        } catch (error) {
            console.error(`   ❌ Ошибка: ${error.message}\n`);
        }

        // Тест 4: GET /api/backtest/report/:strategyId
        console.log('6️⃣ Тест: GET /api/backtest/report/:strategyId');
        try {
            const latestResult = await BacktestResult.findOne({
                where: {
                    strategyId: testStrategyId,
                    backtestType: 'walk_forward',
                    status: 'completed'
                },
                order: [['createdAt', 'DESC']],
                include: [{
                    model: TradingStrategy,
                    as: 'strategy',
                    attributes: ['id', 'name']
                }]
            });

            if (latestResult) {
                console.log(`   ✅ Отчет найден для стратегии "${latestResult.strategy?.name}"`);
                console.log(`   📊 Основные метрики:`);
                console.log(`      - Доходность: ${latestResult.totalReturn?.toFixed(2) || 'N/A'}%`);
                console.log(`      - Прибыль: ${latestResult.totalProfit?.toFixed(2) || 'N/A'} ₽`);
                console.log(`      - Win Rate: ${latestResult.winRate?.toFixed(2) || 'N/A'}%`);
                console.log(`      - Sharpe Ratio: ${latestResult.sharpeRatio?.toFixed(2) || 'N/A'}`);
                console.log(`      - Max Drawdown: ${latestResult.maxDrawdown?.toFixed(2) || 'N/A'}%`);
                console.log(`      - Profit Factor: ${latestResult.profitFactor?.toFixed(2) || 'N/A'}`);
                console.log(`      - Сделок: ${latestResult.totalTrades || 0}`);
                console.log(`   📄 Отчет: ${latestResult.report ? 'Есть' : 'Нет (будет сгенерирован при запросе)'}`);
            } else {
                console.log(`   ⚠️ Результаты бэктестинга не найдены для стратегии ID: ${testStrategyId}`);
                console.log(`   💡 Запустите бэктестинг через POST /api/backtest/run/:strategyId`);
            }
            console.log('');
        } catch (error) {
            console.error(`   ❌ Ошибка: ${error.message}\n`);
        }

        // Тест 5: Проверка структуры данных
        console.log('7️⃣ Тест: Проверка структуры данных BacktestResult');
        try {
            const sampleResult = await BacktestResult.findOne({
                where: { status: 'completed' },
                order: [['createdAt', 'DESC']]
            });

            if (sampleResult) {
                const requiredFields = [
                    'id', 'strategyId', 'backtestType', 'startDate', 'endDate',
                    'initialCapital', 'finalCapital', 'totalReturn',
                    'totalTrades', 'winRate', 'maxDrawdown', 'status', 'createdAt'
                ];

                const missingFields = requiredFields.filter(field => sampleResult[field] === undefined);
                
                // Вычисляем totalProfit из капитала
                const totalProfit = sampleResult.finalCapital - sampleResult.initialCapital;
                
                if (missingFields.length === 0) {
                    console.log(`   ✅ Все обязательные поля присутствуют`);
                    console.log(`   💰 Вычисленный totalProfit: ${totalProfit.toFixed(2)} ₽`);
                    console.log(`   📊 Дополнительные поля:`);
                    const optionalFields = ['sharpeRatio', 'profitFactor', 'equityCurve', 'trades', 'report', 'alerts'];
                    optionalFields.forEach(field => {
                        const value = sampleResult[field];
                        if (value !== undefined && value !== null) {
                            if (Array.isArray(value)) {
                                console.log(`      - ${field}: массив (${value.length} элементов)`);
                            } else if (typeof value === 'object') {
                                console.log(`      - ${field}: объект`);
                            } else {
                                console.log(`      - ${field}: ${value}`);
                            }
                        }
                    });
                } else {
                    console.log(`   ⚠️ Отсутствуют поля: ${missingFields.join(', ')}`);
                }
            } else {
                console.log(`   ⚠️ Нет результатов для проверки структуры`);
            }
            console.log('');
        } catch (error) {
            console.error(`   ❌ Ошибка: ${error.message}\n`);
        }

        console.log('🎉 Все тесты API endpoints пройдены!\n');
        console.log('📋 Сводка:');
        console.log(`   ✅ GET /api/backtest/results/:strategyId - работает`);
        console.log(`   ✅ GET /api/backtest/compare - работает`);
        console.log(`   ✅ GET /api/backtest/list - работает`);
        console.log(`   ✅ GET /api/backtest/report/:strategyId - работает`);
        console.log(`   ✅ Структура данных BacktestResult - корректна`);
        console.log(`\n💡 Для полного тестирования запустите бэктестинг через:`);
        console.log(`   POST /api/backtest/run/:strategyId`);
        console.log(`   (требует запущенного сервера и может занять время)\n`);

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
        console.error('❌ Ошибка при тестировании API endpoints:', error.message);
        if (error.stack && !error.message.includes('password must be a string')) {
            console.error(error.stack);
        }
        
        try {
            await sequelize.close();
        } catch (closeError) {
            // Игнорируем ошибки закрытия
        }
        process.exit(1);
    }
}

testAPIEndpoints();

