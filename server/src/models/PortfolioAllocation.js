import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const PortfolioAllocation = sequelize.define('PortfolioAllocation', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    
    // Ссылка на стратегию
    strategyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'trading_strategies',
            key: 'id'
        }
        // unique: true убрано - уникальность обеспечивается через индекс ниже
    },
    
    // Выделенная сумма (в рублях)
    allocatedAmount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
    },
    
    // Использованная сумма (в рублях)
    usedAmount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
    },
    
    // Доступная сумма (в рублях) - вычисляемое поле
    availableAmount: {
        type: DataTypes.VIRTUAL,
        get() {
            return parseFloat(this.allocatedAmount) - parseFloat(this.usedAmount);
        }
    },
    
    // Время последнего обновления
    lastUpdated: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    
    // История изменений (JSON array)
    metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {
            history: [],
            lastRebalance: null
        }
    }
}, {
    tableName: 'portfolio_allocations',
    timestamps: true,
    indexes: [
        {
            fields: ['strategyId'],
            unique: true,
            name: 'unique_portfolio_allocation_strategy_id'
        },
        {
            fields: ['lastUpdated']
        }
    ]
});

// Метод для получения или создания распределения для стратегии
PortfolioAllocation.getOrCreateAllocation = async function(strategyId) {
    let allocation = await this.findOne({
        where: { strategyId }
    });
    
    if (!allocation) {
        allocation = await this.create({
            strategyId,
            allocatedAmount: 0,
            usedAmount: 0
        });
    }
    
    return allocation;
};

// Метод для обновления распределения
PortfolioAllocation.updateAllocation = async function(strategyId, allocatedAmount) {
    const allocation = await this.getOrCreateAllocation(strategyId);
    
    const oldAmount = parseFloat(allocation.allocatedAmount);
    const change = allocatedAmount - oldAmount;
    
    // Добавляем запись в историю
    const history = allocation.metadata?.history || [];
    history.push({
        date: new Date().toISOString(),
        oldAmount,
        newAmount: allocatedAmount,
        change
    });
    
    // Ограничиваем историю последними 50 записями
    if (history.length > 50) {
        history.shift();
    }
    
    await allocation.update({
        allocatedAmount,
        lastUpdated: new Date(),
        metadata: {
            ...allocation.metadata,
            history
        }
    });
    
    return allocation;
};

// Метод для использования бюджета
PortfolioAllocation.useBudget = async function(strategyId, amount) {
    const allocation = await this.getOrCreateAllocation(strategyId);
    
    const newUsedAmount = parseFloat(allocation.usedAmount) + amount;
    
    if (newUsedAmount > parseFloat(allocation.allocatedAmount)) {
        throw new Error(`Insufficient budget for strategy ${strategyId}. Available: ${allocation.availableAmount}, Requested: ${amount}`);
    }
    
    await allocation.update({
        usedAmount: newUsedAmount,
        lastUpdated: new Date()
    });
    
    return allocation;
};

// Метод для освобождения бюджета (при закрытии позиции)
PortfolioAllocation.releaseBudget = async function(strategyId, amount) {
    const allocation = await this.getOrCreateAllocation(strategyId);
    
    const newUsedAmount = Math.max(0, parseFloat(allocation.usedAmount) - amount);
    
    await allocation.update({
        usedAmount: newUsedAmount,
        lastUpdated: new Date()
    });
    
    return allocation;
};

export default PortfolioAllocation;

