import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const BacktestResult = sequelize.define('BacktestResult', {
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
        },
        comment: 'ID стратегии, для которой выполнен бэктестинг'
    },
    
    // Тип бэктестинга
    backtestType: {
        type: DataTypes.ENUM('full', 'walk_forward'),
        allowNull: false,
        defaultValue: 'full',
        comment: 'Тип бэктестинга: полный или walk-forward анализ'
    },
    
    // Период тестирования
    startDate: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: 'Дата начала периода тестирования'
    },
    endDate: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: 'Дата окончания периода тестирования'
    },
    
    // Капитал
    initialCapital: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 1000000,
        comment: 'Начальный капитал для бэктестинга'
    },
    finalCapital: {
        type: DataTypes.FLOAT,
        allowNull: false,
        comment: 'Финальный капитал после бэктестинга'
    },
    
    // Основные метрики (для быстрого доступа)
    totalReturn: {
        type: DataTypes.FLOAT,
        allowNull: false,
        comment: 'Общая доходность в процентах'
    },
    totalTrades: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Общее количество сделок'
    },
    winRate: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
        comment: 'Процент прибыльных сделок (0-100)'
    },
    sharpeRatio: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: 'Коэффициент Шарпа'
    },
    maxDrawdown: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
        comment: 'Максимальная просадка в процентах'
    },
    profitFactor: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: 'Профит-фактор (отношение прибыли к убыткам)'
    },
    calmarRatio: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: 'Коэффициент Кальмара'
    },
    sortinoRatio: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: 'Коэффициент Сортино'
    },
    
    // Полные метрики (JSON)
    metrics: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {},
        comment: 'Полный набор метрик производительности'
    },
    
    // Массив сделок (JSON)
    trades: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: [],
        comment: 'Массив всех сделок, выполненных в бэктестинге'
    },
    
    // Кривая капитала (JSON)
    equityCurve: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: [],
        comment: 'Кривая капитала: массив {date, value}'
    },
    
    // Месячные доходности (JSON)
    monthlyReturns: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: [],
        comment: 'Месячные доходности: массив {month, return}'
    },
    
    // Отчет (TEXT)
    report: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Сгенерированный текстовый отчет о бэктестинге'
    },
    
    // Предупреждения и рекомендации (JSON)
    alerts: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: [],
        comment: 'Массив предупреждений и рекомендаций'
    },
    
    // Статус бэктестинга
    status: {
        type: DataTypes.ENUM('completed', 'failed', 'in_progress'),
        allowNull: false,
        defaultValue: 'completed',
        comment: 'Статус выполнения бэктестинга'
    },
    
    // Ошибки (если были)
    error: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Текст ошибки, если бэктестинг завершился с ошибкой'
    },
    
    // Время выполнения (в миллисекундах)
    executionTime: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Время выполнения бэктестинга в миллисекундах'
    }
}, {
    tableName: 'backtest_results',
    timestamps: true,
    indexes: [
        {
            fields: ['strategyId']
        },
        {
            fields: ['backtestType']
        },
        {
            fields: ['startDate', 'endDate']
        },
        {
            fields: ['status']
        },
        {
            fields: ['createdAt']
        }
    ]
});

// Ассоциации
BacktestResult.associate = function(models) {
    BacktestResult.belongsTo(models.TradingStrategy, {
        foreignKey: 'strategyId',
        as: 'strategy'
    });
};

// Статические методы

/**
 * Получить последние результаты бэктестинга для стратегии
 */
BacktestResult.getLatestForStrategy = async function(strategyId, backtestType = 'full') {
    return await this.findOne({
        where: {
            strategyId,
            backtestType,
            status: 'completed'
        },
        order: [['createdAt', 'DESC']]
    });
};

/**
 * Получить все результаты бэктестинга для стратегии
 */
BacktestResult.getAllForStrategy = async function(strategyId, limit = 10) {
    return await this.findAll({
        where: {
            strategyId,
            status: 'completed'
        },
        order: [['createdAt', 'DESC']],
        limit
    });
};

/**
 * Получить результаты за период
 */
BacktestResult.getByPeriod = async function(startDate, endDate, strategyId = null) {
    const where = {
        startDate: { [require('sequelize').Op.gte]: startDate },
        endDate: { [require('sequelize').Op.lte]: endDate },
        status: 'completed'
    };
    
    if (strategyId) {
        where.strategyId = strategyId;
    }
    
    return await this.findAll({
        where,
        order: [['createdAt', 'DESC']]
    });
};

export default BacktestResult;

