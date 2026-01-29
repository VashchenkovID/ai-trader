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
        }
        // unique: true убрано - уникальность обеспечивается через индекс ниже
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

// Ассоциации - устанавливаем напрямую после определения модели
// Используем динамический импорт для избежания циклических зависимостей
(async () => {
    try {
        const TradingRequest = (await import('./TradingRequest.js')).default;
        const TradingStrategy = (await import('./TradingStrategy.js')).default;
        
        PositionStrategy.belongsTo(TradingRequest, {
            foreignKey: 'positionId',
            as: 'position'
        });
        
        PositionStrategy.belongsTo(TradingStrategy, {
            foreignKey: 'strategyId',
            as: 'strategy'
        });
    } catch (error) {
        // Игнорируем ошибки при установке ассоциаций (могут быть циклические зависимости)
        console.warn('⚠️ Could not set PositionStrategy associations immediately:', error.message);
    }
})();

// Также оставляем метод associate для совместимости
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

