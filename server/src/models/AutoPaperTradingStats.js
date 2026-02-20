import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const AutoPaperTradingStats = sequelize.define('AutoPaperTradingStats', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        unique: true,
        comment: 'Дата статистики'
    },
    dailyTrades: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Количество сделок за день'
    },
    dailyPnL: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
        comment: 'Прибыль/убыток за день'
    },
    totalTrades: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Общее количество сделок'
    },
    currentPhase: {
        type: DataTypes.ENUM('phase1', 'phase2', 'phase3'),
        allowNull: false,
        defaultValue: 'phase1',
        comment: 'Текущая фаза автоматической торговли'
    },
    settings: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Сохранение настроек на дату'
    }
}, {
    tableName: 'auto_paper_trading_stats',
    timestamps: true,
    indexes: [
        {
            name: 'idx_auto_paper_trading_stats_date',
            fields: ['date'],
            unique: true
        },
        {
            name: 'idx_auto_paper_trading_stats_phase',
            fields: ['currentPhase']
        }
    ]
});

// Статические методы
AutoPaperTradingStats.getTodayStats = async function() {
    const today = new Date().toISOString().split('T')[0];
    let stats = await this.findOne({
        where: { date: today }
    });
    
    if (!stats) {
        // Создаем новую запись за сегодня
        const lastStats = await this.findOne({
            order: [['date', 'DESC']]
        });
        
        stats = await this.create({
            date: today,
            dailyTrades: 0,
            dailyPnL: 0,
            totalTrades: lastStats ? lastStats.totalTrades : 0,
            currentPhase: lastStats ? lastStats.currentPhase : 'phase1',
            settings: null
        });
    }
    
    return stats;
};

AutoPaperTradingStats.getStatsForPeriod = async function(startDate, endDate) {
    return this.findAll({
        where: {
            date: {
                [sequelize.Sequelize.Op.between]: [startDate, endDate]
            }
        },
        order: [['date', 'ASC']]
    });
};

export default AutoPaperTradingStats;

