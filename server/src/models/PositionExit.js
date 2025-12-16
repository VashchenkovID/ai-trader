import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * Модель для отслеживания частичных закрытий позиций
 * Хранит информацию о каждом этапе закрытия позиции
 */
const PositionExit = sequelize.define('PositionExit', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    
    // Связь с торговой заявкой (TradingRequest)
    tradingRequestId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'trading_requests',
            key: 'id'
        },
        comment: 'ID торговой заявки, которая открыла позицию'
    },
    
    // Информация об инструменте
    figi: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'FIGI инструмента'
    },
    ticker: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'Тикер инструмента'
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'Название инструмента'
    },
    
    // Информация о позиции
    entryPrice: {
        type: DataTypes.FLOAT,
        allowNull: false,
        comment: 'Цена входа в позицию'
    },
    initialQuantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'Начальное количество акций в позиции'
    },
    remainingQuantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'Оставшееся количество акций в позиции'
    },
    
    // Этапы закрытия
    exitStage: {
        type: DataTypes.ENUM('STAGE_1_10PCT', 'STAGE_2_15PCT', 'STAGE_3_20PCT', 'FULL_CLOSE', 'TRAILING_STOP'),
        allowNull: false,
        comment: 'Этап закрытия позиции'
    },
    profitPercent: {
        type: DataTypes.FLOAT,
        allowNull: false,
        comment: 'Процент прибыли на момент закрытия'
    },
    exitPrice: {
        type: DataTypes.FLOAT,
        allowNull: false,
        comment: 'Цена закрытия части позиции'
    },
    exitQuantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'Количество акций, закрытых на этом этапе'
    },
    exitAmount: {
        type: DataTypes.FLOAT,
        allowNull: false,
        comment: 'Сумма закрытия (exitPrice * exitQuantity)'
    },
    commission: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
        comment: 'Комиссия за закрытие'
    },
    realizedProfit: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
        comment: 'Реализованная прибыль (после комиссий)'
    },
    
    // Статус
    status: {
        type: DataTypes.ENUM('PENDING', 'EXECUTED', 'FAILED', 'CANCELLED'),
        allowNull: false,
        defaultValue: 'PENDING',
        comment: 'Статус закрытия'
    },
    
    // Метаданные
    tradingMode: {
        type: DataTypes.ENUM('paper', 'micro', 'real'),
        allowNull: false,
        defaultValue: 'paper',
        comment: 'Режим торговли'
    },
    
    // Временные метки
    executedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Время исполнения закрытия'
    },
    
    // Дополнительная информация
    notes: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Дополнительные заметки'
    }
}, {
    tableName: 'position_exits',
    timestamps: true,
    indexes: [
        {
            fields: ['tradingRequestId']
        },
        {
            fields: ['figi', 'status']
        },
        {
            fields: ['exitStage', 'status']
        },
        {
            fields: ['executedAt']
        }
    ]
});

// Методы экземпляра
PositionExit.prototype.execute = async function(executionResult) {
    if (this.status !== 'PENDING') {
        throw new Error(`Cannot execute exit with status: ${this.status}`);
    }
    
    this.status = 'EXECUTED';
    this.executedAt = new Date();
    
    if (executionResult) {
        if (executionResult.exitPrice) this.exitPrice = executionResult.exitPrice;
        if (executionResult.commission !== undefined) this.commission = executionResult.commission;
        if (executionResult.realizedProfit !== undefined) this.realizedProfit = executionResult.realizedProfit;
        if (executionResult.notes) this.notes = executionResult.notes;
    }
    
    return this.save();
};

PositionExit.prototype.cancel = async function(reason = null) {
    if (this.status !== 'PENDING') {
        throw new Error(`Cannot cancel exit with status: ${this.status}`);
    }
    
    this.status = 'CANCELLED';
    if (reason) {
        this.notes = reason;
    }
    
    return this.save();
};

// Статические методы
PositionExit.getPendingExits = async function(limit = 50) {
    return this.findAll({
        where: { 
            status: 'PENDING'
        },
        order: [['createdAt', 'ASC']],
        limit
    });
};

PositionExit.getExitsByRequest = async function(tradingRequestId) {
    return this.findAll({
        where: { 
            tradingRequestId
        },
        order: [['exitStage', 'ASC'], ['createdAt', 'ASC']]
    });
};

PositionExit.getExitsByFigi = async function(figi, limit = 50) {
    return this.findAll({
        where: { 
            figi,
            status: 'EXECUTED'
        },
        order: [['executedAt', 'DESC']],
        limit
    });
};

export default PositionExit;

