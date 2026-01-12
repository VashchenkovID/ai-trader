import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * Модель для хранения данных об опционах
 * Используется для вычисления Implied Volatility (IV)
 */
class OptionsData extends Model {}

OptionsData.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    figi: {
        type: DataTypes.STRING,
        allowNull: true, // Может быть null, если не получен из API
        comment: 'FIGI опциона'
    },
    baseFigi: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'FIGI базового актива (акция)'
    },
    baseTicker: {
        type: DataTypes.STRING,
        allowNull: true, // Может быть null, если тикер не найден
        comment: 'Тикер базового актива (акция)'
    },
    ticker: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Тикер опциона'
    },
    name: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Название опциона'
    },
    optionType: {
        type: DataTypes.ENUM('call', 'put'),
        allowNull: false,
        comment: 'Тип опциона: call (колл) или put (пут)'
    },
    strikePrice: {
        type: DataTypes.DECIMAL(15, 4),
        allowNull: false,
        comment: 'Цена страйка опциона'
    },
    expirationDate: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: 'Дата экспирации опциона'
    },
    currentPrice: {
        type: DataTypes.DECIMAL(15, 4),
        allowNull: true,
        comment: 'Текущая цена опциона'
    },
    underlyingPrice: {
        type: DataTypes.DECIMAL(15, 4),
        allowNull: true,
        comment: 'Цена базового актива на момент расчета'
    },
    impliedVolatility: {
        type: DataTypes.DECIMAL(10, 6),
        allowNull: true,
        comment: 'Подразумеваемая волатильность (IV) в процентах (0-100)'
    },
    timeToExpiration: {
        type: DataTypes.DECIMAL(10, 4),
        allowNull: true,
        comment: 'Время до экспирации в годах'
    },
    riskFreeRate: {
        type: DataTypes.DECIMAL(10, 6),
        allowNull: true,
        comment: 'Безрисковая ставка, использованная для расчета IV'
    },
    timestamp: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: 'Время получения данных'
    },
    source: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'tinkoff',
        comment: 'Источник данных'
    },
    metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: 'Дополнительные метаданные из API (полный объект опциона)'
    }
}, {
    sequelize,
    modelName: 'OptionsData',
    tableName: 'options_data',
    indexes: [
        {
            unique: false,
            fields: ['baseFigi', 'timestamp']
        },
        {
            fields: ['baseFigi']
        },
        {
            fields: ['expirationDate']
        },
        {
            fields: ['timestamp']
        },
        {
            fields: ['optionType']
        },
        {
            fields: ['baseFigi', 'expirationDate', 'strikePrice', 'optionType'],
            unique: true,
            name: 'unique_option_identifier'
        }
    ],
    timestamps: true
});

export default OptionsData;

