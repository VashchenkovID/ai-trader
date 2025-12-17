/**
 * Миграция для создания таблицы backtest_results
 * Хранит результаты бэктестинга торговых стратегий
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import { Sequelize, DataTypes } from 'sequelize';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем переменные окружения
dotenv.config({ path: join(__dirname, '../.env') });

// Создаем подключение для миграции
const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    String(process.env.DB_PASSWORD || ''),
    {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        dialect: 'postgres',
        logging: false
    }
);

export async function up(queryInterface, Sequelize) {
    const literal = (value) => queryInterface.sequelize.literal(value);
    
    await queryInterface.createTable('backtest_results', {
        id: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        
        // Ссылка на стратегию
        strategyId: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
                model: 'trading_strategies',
                key: 'id'
            },
            onDelete: 'CASCADE',
            comment: 'ID стратегии, для которой выполнен бэктестинг'
        },
        
        // Тип бэктестинга
        backtestType: {
            type: Sequelize.ENUM('full', 'walk_forward'),
            allowNull: false,
            defaultValue: 'full',
            comment: 'Тип бэктестинга: полный или walk-forward анализ'
        },
        
        // Период тестирования
        startDate: {
            type: Sequelize.DATE,
            allowNull: false,
            comment: 'Дата начала периода тестирования'
        },
        endDate: {
            type: Sequelize.DATE,
            allowNull: false,
            comment: 'Дата окончания периода тестирования'
        },
        
        // Капитал
        initialCapital: {
            type: Sequelize.FLOAT,
            allowNull: false,
            defaultValue: 1000000,
            comment: 'Начальный капитал для бэктестинга'
        },
        finalCapital: {
            type: Sequelize.FLOAT,
            allowNull: false,
            comment: 'Финальный капитал после бэктестинга'
        },
        
        // Основные метрики (для быстрого доступа)
        totalReturn: {
            type: Sequelize.FLOAT,
            allowNull: false,
            comment: 'Общая доходность в процентах'
        },
        totalTrades: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: 'Общее количество сделок'
        },
        winRate: {
            type: Sequelize.FLOAT,
            allowNull: false,
            defaultValue: 0,
            comment: 'Процент прибыльных сделок (0-100)'
        },
        sharpeRatio: {
            type: Sequelize.FLOAT,
            allowNull: true,
            comment: 'Коэффициент Шарпа'
        },
        maxDrawdown: {
            type: Sequelize.FLOAT,
            allowNull: false,
            defaultValue: 0,
            comment: 'Максимальная просадка в процентах'
        },
        profitFactor: {
            type: Sequelize.FLOAT,
            allowNull: true,
            comment: 'Профит-фактор (отношение прибыли к убыткам)'
        },
        calmarRatio: {
            type: Sequelize.FLOAT,
            allowNull: true,
            comment: 'Коэффициент Кальмара'
        },
        sortinoRatio: {
            type: Sequelize.FLOAT,
            allowNull: true,
            comment: 'Коэффициент Сортино'
        },
        
        // Полные метрики (JSON)
        metrics: {
            type: Sequelize.JSONB,
            allowNull: true,
            defaultValue: {},
            comment: 'Полный набор метрик производительности'
        },
        
        // Массив сделок (JSON)
        trades: {
            type: Sequelize.JSONB,
            allowNull: true,
            defaultValue: [],
            comment: 'Массив всех сделок, выполненных в бэктестинге'
        },
        
        // Кривая капитала (JSON)
        equityCurve: {
            type: Sequelize.JSONB,
            allowNull: true,
            defaultValue: [],
            comment: 'Кривая капитала: массив {date, value}'
        },
        
        // Месячные доходности (JSON)
        monthlyReturns: {
            type: Sequelize.JSONB,
            allowNull: true,
            defaultValue: [],
            comment: 'Месячные доходности: массив {month, return}'
        },
        
        // Отчет (TEXT)
        report: {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: 'Сгенерированный текстовый отчет о бэктестинге'
        },
        
        // Предупреждения и рекомендации (JSON)
        alerts: {
            type: Sequelize.JSONB,
            allowNull: true,
            defaultValue: [],
            comment: 'Массив предупреждений и рекомендаций'
        },
        
        // Статус бэктестинга
        status: {
            type: Sequelize.ENUM('completed', 'failed', 'in_progress'),
            allowNull: false,
            defaultValue: 'completed',
            comment: 'Статус выполнения бэктестинга'
        },
        
        // Ошибки (если были)
        error: {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: 'Текст ошибки, если бэктестинг завершился с ошибкой'
        },
        
        // Время выполнения (в миллисекундах)
        executionTime: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: 'Время выполнения бэктестинга в миллисекундах'
        },
        
        createdAt: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: literal('CURRENT_TIMESTAMP')
        },
        updatedAt: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: literal('CURRENT_TIMESTAMP')
        }
    });
    
    // Индексы для быстрого поиска
    await queryInterface.addIndex('backtest_results', ['strategyId'], {
        name: 'idx_backtest_results_strategyId'
    });
    
    await queryInterface.addIndex('backtest_results', ['backtestType'], {
        name: 'idx_backtest_results_backtestType'
    });
    
    await queryInterface.addIndex('backtest_results', ['startDate', 'endDate'], {
        name: 'idx_backtest_results_period'
    });
    
    await queryInterface.addIndex('backtest_results', ['status'], {
        name: 'idx_backtest_results_status'
    });
    
    await queryInterface.addIndex('backtest_results', ['createdAt'], {
        name: 'idx_backtest_results_createdAt'
    });
}

export async function down(queryInterface, Sequelize) {
    await queryInterface.dropTable('backtest_results');
}

// Позволяет запускать миграцию напрямую командой `node migrations/create-backtest-results-table.js`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const run = async () => {
        const queryInterface = sequelize.getQueryInterface();
        try {
            await up(queryInterface, DataTypes);
            console.log('✅ Migration applied: backtest_results');
        } catch (err) {
            console.error('❌ Migration failed:', err);
            process.exitCode = 1;
        } finally {
            await sequelize.close();
        }
    };
    run();
}

