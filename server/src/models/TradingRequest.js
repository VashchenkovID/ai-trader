import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const TradingRequest = sequelize.define('TradingRequest', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    
    // Связь с рекомендацией
    recommendationId: {
        type: DataTypes.STRING,
        allowNull: false,
        references: {
            model: 'Recommendations',
            key: 'figi'
        }
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
    
    // Основная информация об инструменте
    figi: {
        type: DataTypes.STRING,
        allowNull: false
    },
    ticker: {
        type: DataTypes.STRING,
        allowNull: false
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    
    // Торговая информация
    action: {
        type: DataTypes.ENUM('BUY', 'SELL'),
        allowNull: false
    },
    quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
            min: 1
        }
    },
    priceAtRequest: {
        type: DataTypes.FLOAT,
        allowNull: false
    },
    estimatedAmount: {
        type: DataTypes.FLOAT,
        allowNull: false
    },
    
    // Статус заявки
    status: {
        type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED', 'CANCELLED', 'EXPIRED'),
        allowNull: false,
        defaultValue: 'PENDING'
    },
    
    // Данные из рекомендации
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
    
    // Обоснование
    reasoning: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    aiExplanation: {
        type: DataTypes.JSON,
        allowNull: true
    },
    
    // Временные метки
    createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => new Date(Date.now() + 4 * 60 * 60 * 1000) // 4 часа
    },
    approvedAt: {
        type: DataTypes.DATE,
        allowNull: true
    },
    executedAt: {
        type: DataTypes.DATE,
        allowNull: true
    },
    
    // Результат исполнения
    executionResult: {
        type: DataTypes.JSON,
        allowNull: true
    },
    actualPrice: {
        type: DataTypes.FLOAT,
        allowNull: true
    },
    actualAmount: {
        type: DataTypes.FLOAT,
        allowNull: true
    },
    commission: {
        type: DataTypes.FLOAT,
        allowNull: true
    },
    
    // Комментарии пользователя
    userComment: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    rejectionReason: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    
    // Метаданные
    tradingMode: {
        type: DataTypes.ENUM('paper', 'micro', 'real'),
        allowNull: false,
        defaultValue: 'paper'
    },
    priority: {
        type: DataTypes.ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT'),
        allowNull: false,
        defaultValue: 'NORMAL'
    },
    
    // Риск-параметры
    riskLevel: {
        type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH'),
        allowNull: false,
        defaultValue: 'MEDIUM'
    },
    maxLoss: {
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
    
    // Информация об оптимизации входа
    entryOptimization: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Информация об анализе входа через EntryOptimizationService'
    }
}, {
    tableName: 'trading_requests',
    timestamps: true,
    indexes: [
        {
            name: 'idx_trading_requests_status_created_at',
            fields: ['status', 'createdAt']
        },
        {
            name: 'idx_trading_requests_figi_status',
            fields: ['figi', 'status']
        },
        {
            name: 'idx_trading_requests_figi',
            fields: ['figi']
        },
        {
            name: 'idx_trading_requests_action_status',
            fields: ['action', 'status']
        },
        {
            name: 'idx_trading_requests_executed_at',
            fields: ['executedAt']
        },
        {
            name: 'idx_trading_requests_created_at',
            fields: ['createdAt']
        },
        {
            name: 'idx_trading_requests_figi_action_status',
            fields: ['figi', 'action', 'status']
        },
        {
            name: 'idx_trading_requests_expires_at',
            fields: ['expiresAt']
        },
        {
            name: 'idx_trading_requests_trading_mode_status',
            fields: ['tradingMode', 'status']
        },
        {
            name: 'idx_trading_requests_priority_created_at',
            fields: ['priority', 'createdAt']
        }
    ]
});

// Виртуальные поля
TradingRequest.prototype.getIsExpired = function() {
    return new Date() > this.expiresAt;
};

TradingRequest.prototype.getTimeToExpiry = function() {
    const now = new Date();
    const expiry = new Date(this.expiresAt);
    return Math.max(0, expiry - now);
};

TradingRequest.prototype.getAgeInMinutes = function() {
    return Math.floor((Date.now() - this.createdAt) / (1000 * 60));
};

// Методы экземпляра
TradingRequest.prototype.approve = async function(userComment = null) {
    if (this.status !== 'PENDING') {
        throw new Error(`Cannot approve request with status: ${this.status}`);
    }
    
    if (this.getIsExpired()) {
        throw new Error('Cannot approve expired request');
    }
    
    this.status = 'APPROVED';
    this.approvedAt = new Date();
    if (userComment) {
        this.userComment = userComment;
    }
    
    return this.save();
};

TradingRequest.prototype.reject = async function(reason) {
    if (this.status !== 'PENDING') {
        throw new Error(`Cannot reject request with status: ${this.status}`);
    }
    
    this.status = 'REJECTED';
    this.rejectionReason = reason;
    
    return this.save();
};

TradingRequest.prototype.execute = async function(executionResult) {
    if (this.status !== 'APPROVED') {
        throw new Error(`Cannot execute request with status: ${this.status}`);
    }
    
    this.status = 'EXECUTED';
    this.executedAt = new Date();
    this.executionResult = executionResult;
    
    if (executionResult.trade) {
        this.actualPrice = executionResult.trade.price;
        this.actualAmount = executionResult.trade.price * executionResult.trade.quantity;
        this.commission = executionResult.trade.commission;
    }
    
    return this.save();
};

TradingRequest.prototype.cancel = async function(reason = null) {
    if (!['PENDING', 'APPROVED'].includes(this.status)) {
        throw new Error(`Cannot cancel request with status: ${this.status}`);
    }
    
    this.status = 'CANCELLED';
    if (reason) {
        this.rejectionReason = reason;
    }
    
    return this.save();
};

// Статические методы
TradingRequest.getPendingRequests = async function(limit = 50) {
    return this.findAll({
        where: { 
            status: 'PENDING',
            expiresAt: { [sequelize.Sequelize.Op.gt]: new Date() }
        },
        order: [['priority', 'DESC'], ['createdAt', 'ASC']],
        limit
    });
};

TradingRequest.getApprovedRequests = async function(limit = 50) {
    return this.findAll({
        where: { status: 'APPROVED' },
        order: [['approvedAt', 'ASC']],
        limit
    });
};

TradingRequest.getExpiredRequests = async function() {
    return this.findAll({
        where: {
            status: 'PENDING',
            expiresAt: { [sequelize.Sequelize.Op.lt]: new Date() }
        }
    });
};

TradingRequest.getRequestHistory = async function(limit = 100) {
    return this.findAll({
        order: [['createdAt', 'DESC']],
        limit
    });
};

TradingRequest.getRequestsByStatus = async function(status, limit = 50) {
    return this.findAll({
        where: { status },
        order: [['createdAt', 'DESC']],
        limit
    });
};

// Hooks
TradingRequest.beforeCreate((request) => {
    // Автоматическое определение приоритета на основе confidence
    if (request.confidence >= 0.9) {
        request.priority = 'URGENT';
    } else if (request.confidence >= 0.8) {
        request.priority = 'HIGH';
    } else if (request.confidence >= 0.6) {
        request.priority = 'NORMAL';
    } else {
        request.priority = 'LOW';
    }
    
    // Автоматическое определение уровня риска
    if (request.confidence >= 0.8 && request.score >= 0.8) {
        request.riskLevel = 'LOW';
    } else if (request.confidence >= 0.6 && request.score >= 0.6) {
        request.riskLevel = 'MEDIUM';
    } else {
        request.riskLevel = 'HIGH';
    }
});

// Автоматическое истечение заявок
TradingRequest.addHook('afterFind', (instances) => {
    if (!instances) return;
    
    const requests = Array.isArray(instances) ? instances : [instances];
    
    requests.forEach(async (request) => {
        if (!request || request.status !== 'PENDING') return;
        
        // Проверяем, что это экземпляр модели и метод доступен
        if (typeof request.getIsExpired === 'function' && typeof request.save === 'function') {
            // Это экземпляр модели - используем метод
            if (request.getIsExpired()) {
                request.status = 'EXPIRED';
                await request.save();
            }
        } else if (request.expiresAt) {
            // Это plain object (raw: true) - проверяем напрямую
            // Не сохраняем, так как это plain object и save() недоступен
            // Это нормально для бэкапов и экспорта
            const isExpired = new Date() > new Date(request.expiresAt);
            if (isExpired) {
                request.status = 'EXPIRED';
                // Не вызываем save() для plain objects
            }
        }
    });
});

// Ассоциации - устанавливаем напрямую после определения модели
// Используем динамический импорт для избежания циклических зависимостей
(async () => {
    try {
        const TradingStrategy = (await import('./TradingStrategy.js')).default;
        const PositionStrategy = (await import('./PositionStrategy.js')).default;
        
        TradingRequest.belongsTo(TradingStrategy, {
            foreignKey: 'strategyId',
            as: 'strategy'
        });
        
        TradingRequest.hasOne(PositionStrategy, {
            foreignKey: 'positionId',
            as: 'positionStrategy'
        });
    } catch (error) {
        // Игнорируем ошибки при установке ассоциаций (могут быть циклические зависимости)
        console.warn('⚠️ Could not set TradingRequest associations immediately:', error.message);
    }
})();

export default TradingRequest;
