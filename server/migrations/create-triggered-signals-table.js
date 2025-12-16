/**
 * Миграция для создания таблицы triggered_signals
 * Хранит историю сработавших сигналов для аналитики и связи с заявками
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
    
    await queryInterface.createTable('triggered_signals', {
        id: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        
        // Идентификаторы сигнала
        signalId: {
            type: Sequelize.STRING,
            allowNull: false,
            comment: 'Уникальный идентификатор сигнала от Tinkoff API'
        },
        strategyId: {
            type: Sequelize.STRING,
            allowNull: false,
            comment: 'Идентификатор стратегии'
        },
        strategyName: {
            type: Sequelize.STRING,
            allowNull: false,
            comment: 'Название стратегии'
        },
        
        // Информация об инструменте
        figi: {
            type: Sequelize.STRING,
            allowNull: false,
            comment: 'FIGI инструмента'
        },
        ticker: {
            type: Sequelize.STRING,
            allowNull: false,
            comment: 'Тикер инструмента'
        },
        name: {
            type: Sequelize.STRING,
            allowNull: false,
            comment: 'Название инструмента'
        },
        
        // Направление и тип срабатывания
        direction: {
            type: Sequelize.ENUM('SIGNAL_DIRECTION_BUY', 'SIGNAL_DIRECTION_SELL', 'SIGNAL_DIRECTION_UNSPECIFIED'),
            allowNull: false,
            comment: 'Направление сигнала'
        },
        triggerType: {
            type: Sequelize.ENUM('target_reached', 'stoploss_triggered'),
            allowNull: false,
            comment: 'Тип срабатывания: достижение цели или стоп-лосс'
        },
        
        // Цены на момент срабатывания
        initialPrice: {
            type: Sequelize.FLOAT,
            allowNull: true,
            comment: 'Начальная цена сигнала'
        },
        currentPrice: {
            type: Sequelize.FLOAT,
            allowNull: false,
            comment: 'Текущая цена на момент срабатывания'
        },
        targetPrice: {
            type: Sequelize.FLOAT,
            allowNull: true,
            comment: 'Целевая цена сигнала'
        },
        stoploss: {
            type: Sequelize.FLOAT,
            allowNull: true,
            comment: 'Стоп-лосс сигнала'
        },
        
        // Дополнительная информация
        signalName: {
            type: Sequelize.STRING,
            allowNull: true,
            comment: 'Название сигнала'
        },
        probability: {
            type: Sequelize.FLOAT,
            allowNull: true,
            comment: 'Вероятность сигнала'
        },
        
        // Статус и связь с заявкой
        status: {
            type: Sequelize.ENUM('triggered', 'executed', 'expired', 'ignored'),
            allowNull: false,
            defaultValue: 'triggered',
            comment: 'Статус сигнала: сработал, исполнен, истек, проигнорирован'
        },
        triggerCount: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 1,
            comment: 'Количество срабатываний этого сигнала (один сигнал может сработать несколько раз)'
        },
        lastTriggeredAt: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: literal('CURRENT_TIMESTAMP'),
            comment: 'Дата и время последнего срабатывания сигнала'
        },
        tradingRequestId: {
            type: Sequelize.UUID,
            allowNull: true,
            references: {
                model: 'trading_requests',
                key: 'id'
            },
            onDelete: 'SET NULL',
            comment: 'ID торговой заявки, созданной на основе этого сигнала (если есть)'
        },
        
        // Даты
        triggeredAt: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: literal('CURRENT_TIMESTAMP'),
            comment: 'Дата и время срабатывания сигнала'
        },
        signalCreateDt: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: 'Дата создания исходного сигнала'
        },
        signalEndDt: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: 'Дата окончания действия исходного сигнала'
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
    await queryInterface.addIndex('triggered_signals', ['signalId'], {
        name: 'idx_triggered_signals_signalId'
    });
    
    // Составной уникальный индекс: один сигнал может сработать дважды (цель и стоп-лосс)
    await queryInterface.addIndex('triggered_signals', ['signalId', 'triggerType'], {
        unique: true,
        name: 'unique_signal_trigger'
    });
    
    await queryInterface.addIndex('triggered_signals', ['figi'], {
        name: 'idx_triggered_signals_figi'
    });
    
    await queryInterface.addIndex('triggered_signals', ['triggeredAt'], {
        name: 'idx_triggered_signals_triggeredAt'
    });
    
    await queryInterface.addIndex('triggered_signals', ['status'], {
        name: 'idx_triggered_signals_status'
    });
    
    await queryInterface.addIndex('triggered_signals', ['tradingRequestId'], {
        name: 'idx_triggered_signals_tradingRequestId'
    });
}

export async function down(queryInterface, Sequelize) {
    await queryInterface.dropTable('triggered_signals');
}

// Позволяет запускать миграцию напрямую командой `node migrations/create-triggered-signals-table.js`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const run = async () => {
        const queryInterface = sequelize.getQueryInterface();
        try {
            await up(queryInterface, DataTypes);
            console.log('✅ Migration applied: triggered_signals');
        } catch (err) {
            console.error('❌ Migration failed:', err);
            process.exitCode = 1;
        } finally {
            await sequelize.close();
        }
    };
    run();
}

