import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class CachedInstrument extends Model {}

CachedInstrument.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    figi: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
    },
    ticker: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    currency: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    lot: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    minPriceIncrement: {
        type: DataTypes.JSONB, // { units: "0", nano: 10000000 }
        allowNull: true,
    },
    sector: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    lastPrice: {
        type: DataTypes.FLOAT,
        allowNull: true,
    },
    lastPriceTime: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    dividendYield: {
        type: DataTypes.FLOAT,
        allowNull: true,
    },
    // ... другие поля из API ответа
    apiData: {
        type: DataTypes.JSONB, // Полный ответ от API для гибкости
        allowNull: false,
    },
    lastUpdated: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    instrumentType: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Тип инструмента (share, bond, etf, currency, future, option)'
    },
}, {
    sequelize,
    modelName: 'CachedInstrument',
    tableName: 'cached_instruments',
    indexes: [
        {
            name: 'idx_cached_instruments_figi',
            unique: true,
            fields: ['figi']
        },
        {
            name: 'idx_cached_instruments_ticker',
            fields: ['ticker']
        },
        {
            name: 'idx_cached_instruments_last_updated',
            fields: ['lastUpdated']
        },
        {
            name: 'idx_cached_instruments_is_active',
            fields: ['isActive']
        },
        {
            name: 'idx_cached_instruments_sector',
            fields: ['sector']
        }
    ]
});

export default CachedInstrument;