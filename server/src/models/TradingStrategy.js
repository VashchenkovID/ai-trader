import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const TradingStrategy = sequelize.define('TradingStrategy', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    
    // Название стратегии
    name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    
    // Тип стратегии: conservative, moderate, aggressive
    type: {
        type: DataTypes.ENUM('conservative', 'moderate', 'aggressive'),
        allowNull: false
    },
    
    // Временной горизонт: long, medium, short
    timeframe: {
        type: DataTypes.ENUM('long', 'medium', 'short'),
        allowNull: false
    },
    
    // Процент бюджета (0-100)
    budgetAllocation: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
        validate: {
            min: 0,
            max: 100
        }
    },
    
    // Минимальный confidence для входа
    minConfidence: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0.5,
        validate: {
            min: 0,
            max: 1
        }
    },
    
    // Минимальный score для входа
    minScore: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0.5,
        validate: {
            min: 0,
            max: 1
        }
    },
    
    // Процент стоп-лосса (используется как fallback, если ATR недоступен)
    stopLossPercent: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 5.0,
        validate: {
            min: 0,
            max: 50
        }
    },
    
    // Множитель ATR для расчета динамического стоп-лосса
    // Стоп-лосс = текущая цена - (ATR × atrMultiplier)
    // Для консервативных: 1.5-2.0, для умеренных: 2.0-2.5, для агрессивных: 2.5-3.0
    atrMultiplier: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: null, // null = использовать фиксированный процент
        validate: {
            min: 0.5,
            max: 5.0
        },
        comment: 'Множитель ATR для динамического стоп-лосса. Если null, используется stopLossPercent'
    },
    
    // Процент тейк-профита
    takeProfitPercent: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 10.0,
        validate: {
            min: 0,
            max: 100
        }
    },
    
    // Максимальное количество позиций
    maxPositions: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null // null = без ограничений
    },
    
    // Активна ли стратегия
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
    },
    
    // Приоритет (для сортировки)
    priority: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    
    // Дополнительные параметры (JSON)
    metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {}
    }
}, {
    tableName: 'trading_strategies',
    timestamps: true,
    indexes: [
        {
            fields: ['type']
        },
        {
            fields: ['timeframe']
        },
        {
            fields: ['isActive']
        },
        {
            fields: ['priority']
        }
    ]
});

// Метод для получения стратегии по типу рекомендации
TradingStrategy.getStrategyForRecommendation = async function(recommendation) {
    const { confidence, score } = recommendation;
    
    // Определяем подходящую стратегию на основе confidence и score
    if (confidence > 0.8 && score > 0.75) {
        // Агрессивная стратегия для высоких показателей
        return await this.findOne({
            where: { type: 'aggressive', isActive: true },
            order: [['priority', 'DESC']]
        });
    } else if (confidence >= 0.6 && confidence <= 0.8 && score >= 0.6 && score <= 0.75) {
        // Умеренная стратегия для средних показателей
        return await this.findOne({
            where: { type: 'moderate', isActive: true },
            order: [['priority', 'DESC']]
        });
    } else if (confidence >= 0.5 && confidence < 0.6 && score >= 0.5 && score < 0.6) {
        // Консервативная стратегия для низких показателей
        return await this.findOne({
            where: { type: 'conservative', isActive: true },
            order: [['priority', 'DESC']]
        });
    }
    
    // Если не подходит ни одна стратегия, возвращаем null
    return null;
};

// Метод для инициализации стратегий по умолчанию
TradingStrategy.initializeDefaultStrategies = async function() {
    const defaultStrategies = [
        {
            name: 'Консервативная',
            type: 'conservative',
            timeframe: 'long',
            budgetAllocation: 40,
            minConfidence: 0.5,
            minScore: 0.5,
            stopLossPercent: 12,
            takeProfitPercent: 25,
            atrMultiplier: 1.8, // Консервативный множитель ATR
            maxPositions: null,
            isActive: true,
            priority: 1,
            metadata: {
                description: 'Долгосрочная стратегия для стабильного роста',
                riskLevel: 'low'
            }
        },
        {
            name: 'Умеренная',
            type: 'moderate',
            timeframe: 'medium',
            budgetAllocation: 35,
            minConfidence: 0.6,
            minScore: 0.6,
            stopLossPercent: 6,
            takeProfitPercent: 12,
            atrMultiplier: 2.2, // Умеренный множитель ATR
            maxPositions: null,
            isActive: true,
            priority: 2,
            metadata: {
                description: 'Среднесрочная стратегия для баланса риска и доходности',
                riskLevel: 'medium'
            }
        },
        {
            name: 'Агрессивная',
            type: 'aggressive',
            timeframe: 'short',
            budgetAllocation: 25,
            minConfidence: 0.8,
            minScore: 0.75,
            stopLossPercent: 3,
            takeProfitPercent: 6,
            atrMultiplier: 2.7, // Агрессивный множитель ATR
            maxPositions: null,
            isActive: true,
            priority: 3,
            metadata: {
                description: 'Краткосрочная стратегия для быстрого роста',
                riskLevel: 'high'
            }
        }
    ];
    
    for (const strategyData of defaultStrategies) {
        const [strategy, created] = await this.findOrCreate({
            where: { name: strategyData.name },
            defaults: strategyData
        });
        
        if (!created) {
            // Обновляем существующую стратегию, если нужно
            await strategy.update(strategyData);
        }
    }
    
    console.log('✅ Default trading strategies initialized');
};

// Ассоциации - устанавливаем напрямую после определения модели
// Используем динамический импорт для избежания циклических зависимостей
(async () => {
    try {
        const Recommendation = (await import('./Recommendation.js')).default;
        const PortfolioAllocation = (await import('./PortfolioAllocation.js')).default;
        const PositionStrategy = (await import('./PositionStrategy.js')).default;
        
        TradingStrategy.hasMany(Recommendation, {
            foreignKey: 'strategyId',
            as: 'recommendations'
        });
        TradingStrategy.hasMany(PortfolioAllocation, {
            foreignKey: 'strategyId',
            as: 'allocation'
        });
        TradingStrategy.hasMany(PositionStrategy, {
            foreignKey: 'strategyId',
            as: 'positions'
        });
    } catch (error) {
        // Игнорируем ошибки при установке ассоциаций
        console.warn('⚠️ Could not set TradingStrategy associations immediately:', error.message);
    }
})();

export default TradingStrategy;

