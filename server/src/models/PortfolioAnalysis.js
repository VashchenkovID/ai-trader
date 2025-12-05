import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class PortfolioAnalysis extends Model {}

PortfolioAnalysis.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    portfolioType: {
        type: DataTypes.ENUM('real', 'virtual', 'paper'),
        allowNull: false,
        comment: 'Тип портфеля: real, virtual, paper'
    },
    analysisDate: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: 'Дата и время анализа'
    },
    portfolioValue: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
        comment: 'Общая стоимость портфеля на момент анализа'
    },
    availableBudget: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: 'Доступный бюджет'
    },
    totalPositions: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Общее количество позиций в портфеле'
    },
    // Рекомендации на продажу (JSON массив)
    sellRecommendations: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Рекомендации на продажу позиций из портфеля'
    },
    // Рекомендации на покупку (JSON массив)
    buyRecommendations: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Рекомендации на покупку новых инструментов'
    },
    // Статистика анализа
    sellRecommendationsCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Количество рекомендаций на продажу'
    },
    buyRecommendationsCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Количество рекомендаций на покупку'
    },
    // Метаданные
    status: {
        type: DataTypes.ENUM('pending', 'completed', 'failed'),
        allowNull: false,
        defaultValue: 'pending',
        comment: 'Статус анализа'
    },
    error: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Ошибка, если анализ не удался'
    },
    processingTime: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Время обработки в миллисекундах'
    },
    // Дополнительные данные анализа
    metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: 'Дополнительные метаданные анализа'
    }
}, {
    sequelize,
    modelName: 'PortfolioAnalysis',
    tableName: 'portfolio_analyses',
    indexes: [
        {
            fields: ['portfolioType']
        },
        {
            fields: ['analysisDate']
        },
        {
            fields: ['status']
        },
        {
            fields: ['portfolioType', 'analysisDate']
        }
    ],
    timestamps: true,
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
});

export default PortfolioAnalysis;

