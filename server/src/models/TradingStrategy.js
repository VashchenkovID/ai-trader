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
// Исправлено в Фазе 1, задача 1.3.1: устранены пропуски в диапазонах, добавлен fallback
TradingStrategy.getStrategyForRecommendation = async function(recommendation) {
    const { confidence = 0, score = 0 } = recommendation;
    
    // Валидация входных данных
    if (typeof confidence !== 'number' || !isFinite(confidence) || confidence < 0 || confidence > 1) {
        console.warn(`⚠️ Invalid confidence value: ${confidence}, using 0`);
        confidence = 0;
    }
    if (typeof score !== 'number' || !isFinite(score) || score < 0 || score > 1) {
        console.warn(`⚠️ Invalid score value: ${score}, using 0`);
        score = 0;
    }
    
    // Получаем все активные стратегии, отсортированные по приоритету
    const allStrategies = await this.findAll({
        where: { isActive: true },
        order: [['priority', 'DESC']]
    });
    
    if (allStrategies.length === 0) {
        console.warn('⚠️ No active strategies found');
        return null;
    }
    
    // Сначала пытаемся найти точное соответствие по minConfidence и minScore
    // Проверяем стратегии в порядке приоритета: aggressive -> moderate -> conservative
    const strategyTypes = ['aggressive', 'moderate', 'conservative'];
    
    for (const strategyType of strategyTypes) {
        const strategy = allStrategies.find(s => s.type === strategyType);
        if (strategy && confidence >= strategy.minConfidence && score >= strategy.minScore) {
            return strategy;
        }
    }
    
    // Если точного соответствия нет, используем fallback на ближайшую стратегию
    // Выбираем стратегию с минимальным "расстоянием" от требований
    let bestStrategy = null;
    let minDistance = Infinity;
    
    for (const strategy of allStrategies) {
        // Рассчитываем "расстояние" как сумму недостающих confidence и score
        const confidenceDeficit = Math.max(0, strategy.minConfidence - confidence);
        const scoreDeficit = Math.max(0, strategy.minScore - score);
        const distance = confidenceDeficit + scoreDeficit;
        
        // Если стратегия полностью подходит (distance = 0), возвращаем её сразу
        if (distance === 0) {
            return strategy;
        }
        
        // Иначе ищем стратегию с минимальным дефицитом
        if (distance < minDistance) {
            minDistance = distance;
            bestStrategy = strategy;
        }
    }
    
    // Если нашли стратегию с минимальным дефицитом, возвращаем её
    // Это позволяет выбрать ближайшую подходящую стратегию даже если требования не полностью выполнены
    if (bestStrategy) {
        const confidenceDeficit = Math.max(0, bestStrategy.minConfidence - confidence);
        const scoreDeficit = Math.max(0, bestStrategy.minScore - score);
        
        if (confidenceDeficit > 0 || scoreDeficit > 0) {
            console.warn(
                `⚠️ Using fallback strategy "${bestStrategy.name}" with deficits: ` +
                `confidence -${(confidenceDeficit * 100).toFixed(1)}%, score -${(scoreDeficit * 100).toFixed(1)}%`
            );
        }
        
        return bestStrategy;
    }
    
    // Если ничего не найдено, возвращаем null
    console.warn(`⚠️ No suitable strategy found for confidence=${confidence}, score=${score}`);
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
            stopLossPercent: 4, // Обновлено в Фазе 1, задача 1.3.2: было 3% → стало 4%
            takeProfitPercent: 8, // Обновлено в Фазе 1, задача 1.3.2: было 6% → стало 8% (Risk/Reward = 1:2)
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

