import { DataTypes, Op } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * Модель для учета вводов/выводов средств (депозитов/снятий)
 * Используется для корректного расчета PnL в реальном режиме торговли
 */
const CashFlow = sequelize.define('CashFlow', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    
    // Тип операции
    type: {
        type: DataTypes.ENUM('DEPOSIT', 'WITHDRAWAL'),
        allowNull: false,
        comment: 'Тип операции: DEPOSIT (ввод) или WITHDRAWAL (вывод)'
    },
    
    // Сумма операции
    amount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        validate: {
            min: 0.01
        },
        comment: 'Сумма операции в рублях'
    },
    
    // Дата операции
    date: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: 'Дата и время операции'
    },
    
    // Описание операции
    description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Описание операции (например, "Пополнение с карты", "Вывод на счет")'
    },
    
    // Тип портфеля
    portfolioType: {
        type: DataTypes.ENUM('virtual', 'real'),
        allowNull: false,
        defaultValue: 'real',
        comment: 'Тип портфеля: virtual (виртуальный) или real (реальный)'
    },
    
    // Метаданные (JSON)
    metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {},
        comment: 'Дополнительные метаданные (источник, категория и т.д.)'
    }
}, {
    tableName: 'cash_flows',
    timestamps: true,
    indexes: [
        {
            fields: ['portfolioType']
        },
        {
            fields: ['type']
        },
        {
            fields: ['date']
        },
        {
            fields: ['portfolioType', 'date']
        }
    ]
});

// Статические методы
CashFlow.getTotalDeposits = async function(portfolioType = 'real', startDate = null, endDate = null) {
    try {
        const whereClause = {
            portfolioType,
            type: 'DEPOSIT'
        };
        
        if (startDate || endDate) {
            whereClause.date = {};
            if (startDate) {
                whereClause.date[Op.gte] = startDate;
            }
            if (endDate) {
                whereClause.date[Op.lte] = endDate;
            }
        }
        
        const result = await this.sum('amount', { where: whereClause });
        return parseFloat(result || 0);
    } catch (error) {
        console.error('Error getting total deposits:', error);
        return 0;
    }
};

CashFlow.getTotalWithdrawals = async function(portfolioType = 'real', startDate = null, endDate = null) {
    try {
        const whereClause = {
            portfolioType,
            type: 'WITHDRAWAL'
        };
        
        if (startDate || endDate) {
            whereClause.date = {};
            if (startDate) {
                whereClause.date[Op.gte] = startDate;
            }
            if (endDate) {
                whereClause.date[Op.lte] = endDate;
            }
        }
        
        const result = await this.sum('amount', { where: whereClause });
        return parseFloat(result || 0);
    } catch (error) {
        console.error('Error getting total withdrawals:', error);
        return 0;
    }
};

CashFlow.getNetCashFlow = async function(portfolioType = 'real', startDate = null, endDate = null) {
    try {
        const deposits = await this.getTotalDeposits(portfolioType, startDate, endDate);
        const withdrawals = await this.getTotalWithdrawals(portfolioType, startDate, endDate);
        return deposits - withdrawals;
    } catch (error) {
        console.error('Error getting net cash flow:', error);
        return 0;
    }
};

CashFlow.getHistory = async function(portfolioType = 'real', startDate = null, endDate = null, limit = 100) {
    try {
        const whereClause = {
            portfolioType
        };
        
        if (startDate || endDate) {
            whereClause.date = {};
            if (startDate) {
                whereClause.date[Op.gte] = startDate;
            }
            if (endDate) {
                whereClause.date[Op.lte] = endDate;
            }
        }
        
        return await this.findAll({
            where: whereClause,
            order: [['date', 'DESC']],
            limit: limit
        });
    } catch (error) {
        console.error('Error getting cash flow history:', error);
        return [];
    }
};

export default CashFlow;

