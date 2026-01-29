import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../config/database.js';

class CachedSignal extends Model {}

CachedSignal.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    signalId: {
        type: DataTypes.STRING,
        allowNull: false,
        // unique: true убрано - уникальность обеспечивается через индекс ниже
        comment: 'Уникальный идентификатор сигнала от Tinkoff API'
    },
    strategyId: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'Идентификатор стратегии'
    },
    strategyName: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'Название стратегии (например, "Аналитики БКС")'
    },
    instrumentUid: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'UID инструмента от Tinkoff API'
    },
    figi: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'FIGI инструмента (для связи с CachedInstrument)'
    },
    createDt: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: 'Дата создания сигнала'
    },
    endDt: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: 'Дата окончания действия сигнала'
    },
    direction: {
        type: DataTypes.ENUM('SIGNAL_DIRECTION_BUY', 'SIGNAL_DIRECTION_SELL', 'SIGNAL_DIRECTION_UNSPECIFIED'),
        allowNull: false,
        defaultValue: 'SIGNAL_DIRECTION_UNSPECIFIED',
        comment: 'Направление сигнала'
    },
    initialPrice: {
        type: DataTypes.JSONB,
        allowNull: false,
        comment: 'Начальная цена в формате {units: string, nano: number}'
    },
    targetPrice: {
        type: DataTypes.JSONB,
        allowNull: false,
        comment: 'Целевая цена в формате {units: string, nano: number}'
    },
    stoploss: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: 'Цена стоп-лосса в формате {units: string, nano: number}'
    },
    probability: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'Вероятность успеха сигнала в процентах (0-100)'
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'Название сигнала'
    },
    info: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Дополнительная информация о сигнале'
    },
    telegramSent: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Отправлен ли сигнал в Telegram'
    },
    telegramSentAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Дата и время отправки сигнала в Telegram'
    },
    createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
    },
    updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
    },
}, {
    sequelize,
    modelName: 'CachedSignal',
    tableName: 'cached_signals',
    indexes: [
        {
            name: 'unique_cached_signals_signal_id',
            unique: true,
            fields: ['signalId']
        },
        {
            name: 'idx_cached_signals_figi',
            fields: ['figi']
        },
        {
            name: 'idx_cached_signals_instrument_uid',
            fields: ['instrumentUid']
        },
        {
            name: 'idx_cached_signals_create_dt',
            fields: ['createDt']
        },
        {
            name: 'idx_cached_signals_end_dt',
            fields: ['endDt']
        },
        {
            name: 'idx_cached_signals_direction',
            fields: ['direction']
        },
        {
            name: 'idx_cached_signals_strategy_id',
            fields: ['strategyId']
        },
        {
            name: 'idx_cached_signals_figi_create_dt',
            fields: ['figi', 'createDt']
        },
        {
            name: 'idx_cached_signals_figi_end_dt',
            fields: ['figi', 'endDt']
        }
    ],
    timestamps: true,
});

export default CachedSignal;

