import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const PortfolioRebalancing = sequelize.define('PortfolioRebalancing', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    timestamp: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: 'Время ребалансировки'
    },
    trigger: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'scheduled',
        comment: 'Причина ребалансировки (scheduled, manual, threshold)',
        validate: {
            isIn: {
                args: [['scheduled', 'manual', 'threshold']],
                msg: 'trigger must be one of: scheduled, manual, threshold'
            }
        }
    },
    operations: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: [],
        comment: 'Массив операций ребалансировки'
    },
    totalCommission: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        comment: 'Общая комиссия по операциям'
    },
    beforeState: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Состояние портфеля до ребалансировки'
    },
    afterState: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Состояние портфеля после ребалансировки'
    },
    result: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'pending',
        comment: 'Результат ребалансировки (success, partial, failed, pending)',
        validate: {
            isIn: {
                args: [['success', 'partial', 'failed', 'pending']],
                msg: 'result must be one of: success, partial, failed, pending'
            }
        }
    },
    metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Дополнительные данные (ошибки, предупреждения, статистика)'
    }
}, {
    tableName: 'portfolio_rebalancings',
    timestamps: true,
    indexes: [
        {
            fields: ['timestamp']
        },
        {
            fields: ['trigger']
        },
        {
            fields: ['result']
        }
    ]
});

export default PortfolioRebalancing;

