import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const CachedTradingHours = sequelize.define('CachedTradingHours', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    figi: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: 'FIGI инструмента'
    },
    ticker: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment: 'Тикер инструмента'
    },
    tradingStatus: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: 'Статус торгов (TRADING_STATUS_NORMAL_TRADING, etc.)'
    },
    isTrading: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Активны ли торги'
    },
    lastPrice: {
        type: DataTypes.DECIMAL(15, 4),
        allowNull: true,
        comment: 'Последняя цена инструмента'
    },
    lastPriceTime: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Время последней цены'
    },
    apiData: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Полные данные от API'
    },
    lastUpdated: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: 'Время последнего обновления'
    },
    source: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'tinkoff_api',
        comment: 'Источник данных'
    }
}, {
    tableName: 'cached_trading_hours',
    timestamps: false,
    indexes: [
        {
            fields: ['figi']
        },
        {
            fields: ['ticker']
        },
        {
            fields: ['isTrading']
        },
        {
            fields: ['lastUpdated']
        }
    ]
});

export default CachedTradingHours;
