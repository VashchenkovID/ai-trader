import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * Фаза 4, задача 4.2: Модель для хранения предсказаний оптимального времени входа
 */
const EntryOptimizationModel = sequelize.define('EntryOptimization', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    figi: {
        type: DataTypes.STRING,
        allowNull: false,
        index: true
    },
    prediction: {
        type: DataTypes.FLOAT,
        allowNull: false,
        comment: 'Вероятность успешного входа (0-1)'
    },
    optimalTime: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Оптимальное время входа: now, soon, wait, avoid'
    },
    confidence: {
        type: DataTypes.FLOAT,
        allowNull: false,
        comment: 'Уверенность в предсказании (0-1)'
    },
    features: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Features, использованные для предсказания'
    },
    orderType: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Рекомендуемый тип ордера: MARKET, LIMIT, STOP_LIMIT'
    },
    recommendedPrice: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: 'Рекомендуемая цена для лимитного ордера'
    },
    optimalSize: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Оптимальный размер ордера'
    },
    spread: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: 'Текущий spread'
    },
    actualResult: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        comment: 'Фактический результат (для обучения модели)'
    },
    createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'entry_optimizations',
    timestamps: true,
    updatedAt: false,
    indexes: [
        {
            fields: ['figi', 'createdAt']
        },
        {
            fields: ['createdAt']
        }
    ]
});

export default EntryOptimizationModel;

