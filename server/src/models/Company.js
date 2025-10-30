import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class Company extends Model {}

Company.init({
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
    fullName: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    sector: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    industry: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    currency: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    country: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    exchange: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    marketCap: {
        type: DataTypes.BIGINT,
        allowNull: true,
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    // Дополнительные поля для новостного анализа
    newsKeywords: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: true,
    },
    aliases: {
        type: DataTypes.ARRAY(DataTypes.STRING), // Альтернативные названия для поиска новостей
        allowNull: true,
    },
    lastNewsUpdate: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    // Полные данные от Тинькофф API
    apiData: {
        type: DataTypes.JSONB,
        allowNull: true,
    },
    lastUpdated: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
    },
}, {
    sequelize,
    modelName: 'Company',
    tableName: 'companies',
    indexes: [
        {
            unique: true,
            fields: ['figi']
        },
        {
            fields: ['ticker']
        },
        {
            fields: ['sector']
        },
        {
            fields: ['isActive']
        },
        {
            fields: ['lastUpdated']
        }
    ]
});

export default Company;
