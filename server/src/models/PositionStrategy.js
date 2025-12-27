import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const PositionStrategy = sequelize.define('PositionStrategy', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    
    // Ссылка на торговую заявку/позицию (UUID)
    positionId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'trading_requests',
            key: 'id'
        },
        unique: true // Одна стратегия на позицию
    },
    
    // Ссылка на стратегию
    strategyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'trading_strategies',
            key: 'id'
        }
    },
    
    // Причина входа (JSON)
    entryReason: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {
            confidence: null,
            score: null,
            signalsMatch: false,
            aiRecommendation: null
        }
    },
    
    // Целевой срок удержания (в днях)
    targetTimeframe: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    
    // Дата входа
    entryDate: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    
    // Ожидаемая дата выхода
    expectedExitDate: {
        type: DataTypes.DATE,
        allowNull: true
    },
    
    // Фактическая дата выхода
    exitDate: {
        type: DataTypes.DATE,
        allowNull: true
    },
    
    // Результат позиции (прибыль/убыток в процентах)
    resultPercent: {
        type: DataTypes.FLOAT,
        allowNull: true
    }
}, {
    tableName: 'position_strategies',
    timestamps: true,
    indexes: [
        {
            name: 'idx_position_strategies_position_id',
            fields: ['positionId'],
            unique: true
        },
        {
            name: 'idx_position_strategies_strategy_id',
            fields: ['strategyId']
        },
        {
            fields: ['strategyId']
        },
        {
            fields: ['entryDate']
        },
        {
            fields: ['exitDate']
        }
    ]
});

// Ассоциации
PositionStrategy.associate = function(models) {
    PositionStrategy.belongsTo(models.TradingRequest, {
        foreignKey: 'positionId',
        as: 'position'
    });
    PositionStrategy.belongsTo(models.TradingStrategy, {
        foreignKey: 'strategyId',
        as: 'strategy'
    });
};

export default PositionStrategy;

