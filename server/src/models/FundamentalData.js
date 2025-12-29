import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class FundamentalData extends Model {}

FundamentalData.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    figi: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'FIGI инструмента'
    },
    ticker: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Тикер инструмента (для удобства поиска)'
    },
    period: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: 'Период отчетности (дата окончания квартала/года)'
    },
    periodType: {
        type: DataTypes.ENUM('quarterly', 'yearly'),
        allowNull: false,
        defaultValue: 'quarterly',
        comment: 'Тип периода: квартальный или годовой'
    },
    // Фундаментальные показатели
    pe: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: 'P/E (Price-to-Earnings) - отношение цены к прибыли'
    },
    pb: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: 'P/B (Price-to-Book) - отношение цены к балансовой стоимости'
    },
    evEbitda: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: 'EV/EBITDA - отношение стоимости компании к EBITDA'
    },
    roe: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: 'ROE (Return on Equity) - рентабельность собственного капитала (%)'
    },
    debtEbitda: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: 'Долг/EBITDA - отношение долга к EBITDA'
    },
    operatingMargin: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: 'Операционная маржа (%)'
    },
    netMargin: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: 'Чистая маржа (%)'
    },
    // Метаданные
    source: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'unknown',
        comment: 'Источник данных (tinkoff, smartlab, investing, etc.)'
    },
    metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: 'Дополнительные метаданные (roic, roa, beta, marketCap и т.д.)'
    },
    createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
    },
    updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
    }
}, {
    sequelize,
    modelName: 'FundamentalData',
    tableName: 'fundamental_data',
    indexes: [
        {
            unique: true,
            fields: ['figi', 'period', 'periodType'],
            name: 'unique_figi_period_type'
        },
        {
            fields: ['figi']
        },
        {
            fields: ['ticker']
        },
        {
            fields: ['period']
        },
        {
            fields: ['periodType']
        },
        {
            fields: ['source']
        }
    ],
    timestamps: true
});

export default FundamentalData;

