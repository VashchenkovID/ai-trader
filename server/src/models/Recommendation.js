import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const Recommendation = sequelize.define('Recommendation', {
    // Основная информация
    figi: {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey: true
    },
    ticker: {
        type: DataTypes.STRING,
        allowNull: false
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    
    // Рекомендация
    recommendation: {
        type: DataTypes.ENUM('BUY', 'SELL', 'HOLD'),
        allowNull: false
    },
    confidence: {
        type: DataTypes.FLOAT,
        allowNull: false,
        validate: {
            min: 0,
            max: 1
        }
    },
    score: {
        type: DataTypes.FLOAT,
        allowNull: false,
        validate: {
            min: 0,
            max: 1
        }
    },
    
    // Детали анализа (JSON)
    analysis: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {}
    },
    
    // Объяснение рекомендации (JSON)
    explanation: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {}
    },
    
    // Метаданные
    modelVersion: {
        type: DataTypes.STRING,
        allowNull: true
    },
    analysisDate: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    validUntil: {
        type: DataTypes.DATE,
        allowNull: true
    },
    
    // Статистика
    views: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    
    // Дополнительные данные
    priceAtAnalysis: {
        type: DataTypes.FLOAT,
        allowNull: true
    },
    targetPrice: {
        type: DataTypes.FLOAT,
        allowNull: true
    },
    stopLoss: {
        type: DataTypes.FLOAT,
        allowNull: true
    },
    takeProfit: {
        type: DataTypes.FLOAT,
        allowNull: true
    },
    
    // Связь со стратегией торговли
    strategyId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: 'trading_strategies',
            key: 'id'
        }
    },
    
    // Теги для категоризации (JSON array)
    tags: {
        type: DataTypes.JSON,
        defaultValue: []
    },
    sector: {
        type: DataTypes.STRING,
        allowNull: true
    },
    marketCap: {
        type: DataTypes.STRING,
        allowNull: true
    },
    
    // Связи с портфелем
    portfolioId: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    
    // История изменений (JSON array)
    history: {
        type: DataTypes.JSON,
        defaultValue: []
    }
}, {
    tableName: 'Recommendations',
    timestamps: true,
    indexes: [
        {
            fields: ['figi', 'analysisDate']
        },
        {
            fields: ['recommendation', 'confidence']
        },
        {
            fields: ['isActive', 'analysisDate']
        },
        {
            fields: ['sector', 'recommendation']
        }
    ]
});

// Виртуальные поля
Recommendation.prototype.getAgeInHours = function() {
    return Math.floor((Date.now() - this.analysisDate) / (1000 * 60 * 60));
};

Recommendation.prototype.getIsExpired = function() {
    return this.validUntil && new Date() > this.validUntil;
};

// Методы экземпляра
Recommendation.prototype.updateRecommendation = async function(newRecommendation, reason) {
    const historyEntry = {
        recommendation: this.recommendation,
        confidence: this.confidence,
        score: this.score,
        changedAt: new Date(),
        reason: reason
    };
    
    this.history = [...(this.history || []), historyEntry];
    this.recommendation = newRecommendation.recommendation;
    this.confidence = newRecommendation.confidence;
    this.score = newRecommendation.score;
    this.analysis = { ...this.analysis, ...newRecommendation.analysis };
    this.explanation = { ...this.explanation, ...newRecommendation.explanation };
    
    return this.save();
};

Recommendation.prototype.incrementViews = async function() {
    this.views += 1;
    return this.save();
};

// Статические методы
Recommendation.getTopRecommendations = async function(limit = 10, recommendation = null) {
    const where = { isActive: true };
    if (recommendation) {
        where.recommendation = recommendation;
    }
    
    return this.findAll({
        where,
        order: [['confidence', 'DESC'], ['score', 'DESC']],
        limit
    });
};

/**
 * Получить топ-3 рекомендации BUY - по одной для каждой стратегии (агрессивная, умеренная, консервативная)
 * Ищет рекомендации, где в горизонтах есть BUY для соответствующей стратегии
 */
Recommendation.getTopRecommendationsByStrategies = async function() {
    try {
        // Получаем все активные рекомендации с анализом (не только BUY, т.к. BUY может быть в стратегиях)
        const allRecommendations = await this.findAll({
            where: {
                isActive: true
                // Не фильтруем по recommendation, т.к. BUY может быть в стратегиях горизонтов
            },
            order: [['confidence', 'DESC'], ['score', 'DESC']],
            limit: 100 // Берем больше, чтобы найти лучшие по стратегиям
        });

        const result = {
            aggressive: null,
            moderate: null,
            conservative: null
        };

        // Проходим по всем рекомендациям и ищем лучшие для каждой стратегии
        // Проверяем ВСЕ рекомендации независимо от общей рекомендации (BUY/SELL/HOLD)
        for (const rec of allRecommendations) {
            // Получаем analysis - может быть объектом или JSONB строкой
            let analysis = rec.analysis;
            if (typeof analysis === 'string') {
                try {
                    analysis = JSON.parse(analysis);
                } catch (e) {
                    console.warn(`⚠️ Failed to parse analysis for ${rec.figi}:`, e.message);
                    analysis = {};
                }
            }
            analysis = analysis || {};
            
            const horizons = analysis.horizons || {};

            // Проверяем все горизонты (shortTerm, mediumTerm, longTerm)
            const horizonKeys = ['shortTerm', 'mediumTerm', 'longTerm'];
            
            // Проверяем все горизонты (shortTerm, mediumTerm, longTerm)
            for (const horizonKey of horizonKeys) {
                const horizon = horizons[horizonKey];
                if (!horizon || !horizon.strategies) {
                    continue;
                }

                const strategies = horizon.strategies;

                // Проверяем агрессивную стратегию - ищем BUY независимо от общей рекомендации
                if (strategies.aggressive && strategies.aggressive.recommendation === 'BUY') {
                    const strategyConfidence = strategies.aggressive.strategyConfidence || strategies.aggressive.confidence || 0;
                    const currentConfidence = result.aggressive?.strategyData?.strategyConfidence || 
                                             result.aggressive?.strategyData?.confidence || 0;
                    
                    // Если еще нет рекомендации или текущая лучше (по уверенности стратегии)
                    if (!result.aggressive || strategyConfidence > currentConfidence) {
                        result.aggressive = {
                            ...rec.toJSON(),
                            strategyType: 'aggressive',
                            strategyData: strategies.aggressive,
                            horizon: horizonKey
                        };
                    }
                }

                // Проверяем умеренную стратегию - ищем BUY независимо от общей рекомендации
                if (strategies.moderate && strategies.moderate.recommendation === 'BUY') {
                    const strategyConfidence = strategies.moderate.strategyConfidence || strategies.moderate.confidence || 0;
                    const currentConfidence = result.moderate?.strategyData?.strategyConfidence || 
                                             result.moderate?.strategyData?.confidence || 0;
                    
                    if (!result.moderate || strategyConfidence > currentConfidence) {
                        result.moderate = {
                            ...rec.toJSON(),
                            strategyType: 'moderate',
                            strategyData: strategies.moderate,
                            horizon: horizonKey
                        };
                    }
                }

                // Проверяем консервативную стратегию - ищем BUY независимо от общей рекомендации
                if (strategies.conservative && strategies.conservative.recommendation === 'BUY') {
                    const strategyConfidence = strategies.conservative.strategyConfidence || strategies.conservative.confidence || 0;
                    const currentConfidence = result.conservative?.strategyData?.strategyConfidence || 
                                             result.conservative?.strategyData?.confidence || 0;
                    
                    if (!result.conservative || strategyConfidence > currentConfidence) {
                        result.conservative = {
                            ...rec.toJSON(),
                            strategyType: 'conservative',
                            strategyData: strategies.conservative,
                            horizon: horizonKey
                        };
                    }
                }
            }

            // Продолжаем поиск по всем рекомендациям, чтобы найти лучшие для каждой стратегии
        }

        // Возвращаем массив из найденных рекомендаций (может быть меньше 3, если не все найдены)
        const recommendations = [];
        if (result.aggressive) recommendations.push(result.aggressive);
        if (result.moderate) recommendations.push(result.moderate);
        if (result.conservative) recommendations.push(result.conservative);


        return recommendations;
    } catch (error) {
        console.error('❌ Error getting top recommendations by strategies:', error);
        // В случае ошибки возвращаем пустой массив или fallback на старый метод
        return this.getTopRecommendations(3, 'BUY');
    }
};

Recommendation.getRecentRecommendations = async function(limit = 20) {
    return this.findAll({
        where: { isActive: true },
        order: [['analysisDate', 'DESC']],
        limit
    });
};

Recommendation.getRecommendationsBySector = async function(sector) {
    return this.findAll({
        where: { 
            isActive: true, 
            sector: sector 
        },
        order: [['confidence', 'DESC']]
    });
};

Recommendation.getExpiredRecommendations = async function() {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    return this.findAll({
        where: {
            [sequelize.Sequelize.Op.or]: [
                { validUntil: { [sequelize.Sequelize.Op.lt]: new Date() } },
                { analysisDate: { [sequelize.Sequelize.Op.lt]: oneDayAgo } }
            ]
        }
    });
};

// Hooks
Recommendation.beforeCreate((recommendation) => {
    // Устанавливаем дату истечения по умолчанию (24 часа)
    if (!recommendation.validUntil) {
        recommendation.validUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
    }
    
    // Генерируем теги на основе анализа
    if (recommendation.analysis) {
        recommendation.tags = [];
        
        if (recommendation.analysis.volatility > 0.7) recommendation.tags.push('high-volatility');
        if (recommendation.analysis.volatility < 0.3) recommendation.tags.push('low-volatility');
        if (recommendation.analysis.dividendImpact > 0.1) recommendation.tags.push('dividend-focused');
        if (recommendation.confidence > 0.8) recommendation.tags.push('high-confidence');
        if (recommendation.score > 0.8) recommendation.tags.push('strong-buy');
    }
});

// Ассоциации - устанавливаем напрямую после определения модели
// Используем асинхронную функцию для избежания циклических зависимостей
(async () => {
    try {
        const TradingStrategy = (await import('./TradingStrategy.js')).default;
        Recommendation.belongsTo(TradingStrategy, {
            foreignKey: 'strategyId',
            as: 'strategy'
        });
    } catch (error) {
        // Игнорируем ошибки при установке ассоциаций
        console.warn('⚠️ Could not set Recommendation associations immediately:', error.message);
    }
})();

export default Recommendation;
