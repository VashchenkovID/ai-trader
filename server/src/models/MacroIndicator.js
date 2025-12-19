import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class MacroIndicator extends Model {}

MacroIndicator.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    indicatorType: {
        type: DataTypes.ENUM(
            'inflation',
            'interest_rate',
            'gdp',
            'unemployment',
            'sentiment',
            'volatility_index',
            'oil_price',
            'industrial_production',
            'retail_sales',
            'investments',
            'exports',
            'imports',
            'other'
        ),
        allowNull: false,
        comment: 'Тип макроиндикатора'
    },
    source: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: 'Источник данных (cbr, rosstat, moex, investing, trading_economics, etc.)'
    },
    value: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: 'Значение индикатора (точность до сотых)'
    },
    period: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: 'Период данных (дата публикации)'
    },
    periodType: {
        type: DataTypes.ENUM('daily', 'monthly', 'quarterly', 'yearly'),
        allowNull: false,
        defaultValue: 'monthly',
        comment: 'Тип периода данных'
    },
    unit: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'percent',
        comment: 'Единица измерения (percent, absolute, index, etc.)'
    },
    metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: 'Дополнительные метаданные (изменение, прогноз, предыдущее значение и т.д.)'
    },
    country: {
        type: DataTypes.STRING(3),
        allowNull: true,
        defaultValue: 'RUS',
        comment: 'Код страны (RUS для России)'
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
    modelName: 'MacroIndicator',
    tableName: 'macro_indicators',
    indexes: [
        {
            unique: true,
            fields: ['indicatorType', 'period', 'source', 'country'],
            name: 'unique_indicator_period_source_country'
        },
        {
            fields: ['indicatorType']
        },
        {
            fields: ['period']
        },
        {
            fields: ['source']
        },
        {
            fields: ['country']
        },
        {
            fields: ['periodType']
        }
    ],
    timestamps: true
});

export default MacroIndicator;

