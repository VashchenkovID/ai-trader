import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class CachedCandle extends Model {}

CachedCandle.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    figi: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    interval: {
        type: DataTypes.STRING, // 'DAY', 'HOUR', etc.
        allowNull: false,
    },
    open: {
        type: DataTypes.FLOAT,
        allowNull: false,
    },
    close: {
        type: DataTypes.FLOAT,
        allowNull: false,
    },
    high: {
        type: DataTypes.FLOAT,
        allowNull: false,
    },
    low: {
        type: DataTypes.FLOAT,
        allowNull: false,
    },
    volume: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    time: {
        type: DataTypes.DATE,
        allowNull: false,
    },
}, {
    sequelize,
    modelName: 'CachedCandle',
    tableName: 'cached_candles',
    indexes: [
        {
            name: 'idx_cached_candles_figi_interval_time',
            fields: ['figi', 'interval', 'time'],
            unique: true
        },
        {
            name: 'idx_cached_candles_figi_interval',
            fields: ['figi', 'interval']
        },
        {
            name: 'idx_cached_candles_time',
            fields: ['time']
        },
        {
            name: 'idx_cached_candles_figi',
            fields: ['figi']
        }
    ]
});

export default CachedCandle;