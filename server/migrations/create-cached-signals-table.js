'use strict';

/**
 * Миграция для создания таблицы cached_signals
 * Хранит торговые сигналы от Tinkoff API
 */
export async function up(queryInterface, Sequelize) {
    await queryInterface.createTable('cached_signals', {
        id: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        signalId: {
            type: Sequelize.STRING,
            allowNull: false,
            unique: true,
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
            comment: 'Название стратегии (например, "Аналитики БКС")'
        },
        instrumentUid: {
            type: Sequelize.STRING,
            allowNull: false,
            comment: 'UID инструмента от Tinkoff API'
        },
        figi: {
            type: Sequelize.STRING,
            allowNull: true,
            comment: 'FIGI инструмента (для связи с CachedInstrument)'
        },
        createDt: {
            type: Sequelize.DATE,
            allowNull: false,
            comment: 'Дата создания сигнала'
        },
        endDt: {
            type: Sequelize.DATE,
            allowNull: false,
            comment: 'Дата окончания действия сигнала'
        },
        direction: {
            type: Sequelize.ENUM('SIGNAL_DIRECTION_BUY', 'SIGNAL_DIRECTION_SELL', 'SIGNAL_DIRECTION_UNSPECIFIED'),
            allowNull: false,
            defaultValue: 'SIGNAL_DIRECTION_UNSPECIFIED',
            comment: 'Направление сигнала'
        },
        initialPrice: {
            type: Sequelize.JSONB,
            allowNull: false,
            comment: 'Начальная цена в формате {units: string, nano: number}'
        },
        targetPrice: {
            type: Sequelize.JSONB,
            allowNull: false,
            comment: 'Целевая цена в формате {units: string, nano: number}'
        },
        stoploss: {
            type: Sequelize.JSONB,
            allowNull: true,
            comment: 'Цена стоп-лосса в формате {units: string, nano: number}'
        },
        probability: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: 'Вероятность успеха сигнала в процентах (0-100)'
        },
        name: {
            type: Sequelize.STRING,
            allowNull: false,
            comment: 'Название сигнала'
        },
        info: {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: 'Дополнительная информация о сигнале'
        },
        createdAt: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: queryInterface.sequelize.literal('CURRENT_TIMESTAMP'),
        },
        updatedAt: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: queryInterface.sequelize.literal('CURRENT_TIMESTAMP'),
        },
    });

    // Создаем индексы
    await queryInterface.addIndex('cached_signals', ['figi'], {
        name: 'idx_cached_signals_figi'
    });

    await queryInterface.addIndex('cached_signals', ['instrumentUid'], {
        name: 'idx_cached_signals_instrument_uid'
    });

    await queryInterface.addIndex('cached_signals', ['createDt'], {
        name: 'idx_cached_signals_create_dt'
    });

    await queryInterface.addIndex('cached_signals', ['endDt'], {
        name: 'idx_cached_signals_end_dt'
    });

    await queryInterface.addIndex('cached_signals', ['direction'], {
        name: 'idx_cached_signals_direction'
    });

    await queryInterface.addIndex('cached_signals', ['strategyId'], {
        name: 'idx_cached_signals_strategy_id'
    });

    await queryInterface.addIndex('cached_signals', ['figi', 'createDt'], {
        name: 'idx_cached_signals_figi_create_dt'
    });
}

export async function down(queryInterface, Sequelize) {
    await queryInterface.dropTable('cached_signals');
}

