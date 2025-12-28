import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const PositionPyramid = sequelize.define('PositionPyramid', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    
    // Связь с основной позицией (первый вход)
    basePositionId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'trading_requests',
            key: 'id'
        }
    },
    
    // Инструмент
    figi: {
        type: DataTypes.STRING,
        allowNull: false
    },
    ticker: {
        type: DataTypes.STRING,
        allowNull: false
    },
    
    // Стратегия
    strategyId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: 'trading_strategies',
            key: 'id'
        }
    },
    
    // Целевой размер позиции (100%)
    targetSize: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        comment: 'Целевой размер позиции в рублях (100%)'
    },
    
    // Текущий размер позиции (сумма всех входов)
    currentSize: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
        comment: 'Текущий размер позиции в рублях'
    },
    
    // Процент от целевого размера
    currentPercent: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
        comment: 'Текущий процент от целевого размера'
    },
    
    // Информация о входах (JSON)
    entries: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
        comment: 'Массив входов: [{level: 1, percent: 50, amount, price, quantity, requestId, stopLoss, entryDate}]'
    },
    
    // Статус пирамиды
    status: {
        type: DataTypes.ENUM('ACTIVE', 'COMPLETED', 'CANCELLED', 'CLOSED'),
        allowNull: false,
        defaultValue: 'ACTIVE',
        comment: 'Статус пирамиды'
    },
    
    // Условия для следующих входов
    nextEntryConditions: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: 'Условия для следующего входа: {priceIncrease: 0.03-0.05, confirmation: true}'
    },
    
    // Последняя проверка условий
    lastCheckDate: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Дата последней проверки условий для следующего входа'
    },
    
    // Метаданные
    metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Дополнительные метаданные'
    }
}, {
    tableName: 'position_pyramids',
    timestamps: true,
    indexes: [
        {
            fields: ['basePositionId']
        },
        {
            fields: ['figi', 'status']
        },
        {
            fields: ['strategyId', 'status']
        },
        {
            fields: ['status', 'lastCheckDate']
        }
    ]
});

// Методы экземпляра
PositionPyramid.prototype.addEntry = async function(entry) {
    const entries = this.entries || [];
    entries.push({
        ...entry,
        entryDate: new Date().toISOString()
    });
    
    // Обновляем текущий размер
    const newCurrentSize = parseFloat(this.currentSize) + parseFloat(entry.amount);
    const newCurrentPercent = (newCurrentSize / parseFloat(this.targetSize)) * 100;
    
    await this.update({
        entries,
        currentSize: newCurrentSize,
        currentPercent: newCurrentPercent,
        lastCheckDate: new Date()
    });
    
    return this;
};

PositionPyramid.prototype.getNextEntryLevel = function() {
    const entries = this.entries || [];
    if (entries.length === 0) return 1;
    return entries.length + 1;
};

PositionPyramid.prototype.getNextEntryPercent = function() {
    const entries = this.entries || [];
    const currentPercent = parseFloat(this.currentPercent);
    
    if (entries.length === 0) {
        return 50; // Первый вход: 50%
    } else if (entries.length === 1) {
        return 30; // Второй вход: +30%
    } else if (entries.length === 2) {
        return 20; // Третий вход: +20%
    }
    
    return 0; // Максимум 3 входа
};

PositionPyramid.prototype.isComplete = function() {
    return parseFloat(this.currentPercent) >= 100 || this.entries.length >= 3;
};

PositionPyramid.prototype.getTotalQuantity = function() {
    const entries = this.entries || [];
    return entries.reduce((sum, entry) => sum + (entry.quantity || 0), 0);
};

PositionPyramid.prototype.getAveragePrice = function() {
    const entries = this.entries || [];
    if (entries.length === 0) return 0;
    
    const totalAmount = entries.reduce((sum, entry) => sum + (entry.amount || 0), 0);
    const totalQuantity = this.getTotalQuantity();
    
    return totalQuantity > 0 ? totalAmount / totalQuantity : 0;
};

// Статические методы
PositionPyramid.findByBasePosition = async function(basePositionId) {
    return this.findOne({
        where: { basePositionId }
    });
};

PositionPyramid.findActiveByFigi = async function(figi) {
    return this.findOne({
        where: {
            figi,
            status: 'ACTIVE'
        }
    });
};

PositionPyramid.findActiveByStrategy = async function(strategyId) {
    return this.findAll({
        where: {
            strategyId,
            status: 'ACTIVE'
        }
    });
};

// Ассоциации
PositionPyramid.associate = function(models) {
    PositionPyramid.belongsTo(models.TradingRequest, {
        foreignKey: 'basePositionId',
        as: 'basePosition'
    });
    PositionPyramid.belongsTo(models.TradingStrategy, {
        foreignKey: 'strategyId',
        as: 'strategy'
    });
};

export default PositionPyramid;

