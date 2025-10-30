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

export default Recommendation;
