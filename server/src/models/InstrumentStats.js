import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class InstrumentStats extends Model {}

InstrumentStats.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    figi: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        comment: 'FIGI инструмента'
    },
    ticker: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'Тикер инструмента'
    },
    // Статистика торговли
    winRate: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
        validate: {
            min: 0,
            max: 1
        },
        comment: 'Процент прибыльных сделок (0-1)'
    },
    averageWin: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
        comment: 'Средняя прибыль в процентах'
    },
    averageLoss: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
        comment: 'Средний убыток в процентах (положительное число)'
    },
    totalTrades: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: {
            min: 0
        },
        comment: 'Общее количество сделок'
    },
    profitableTrades: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: {
            min: 0
        },
        comment: 'Количество прибыльных сделок'
    },
    losingTrades: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: {
            min: 0
        },
        comment: 'Количество убыточных сделок'
    },
    // Волатильность
    volatility: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: 'Текущая волатильность инструмента (стандартное отклонение доходности)'
    },
    volatilityPeriod: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 30,
        comment: 'Период расчета волатильности в днях'
    },
    // Расчетные метрики
    kellyFraction: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: 'Коэффициент Келли для инструмента'
    },
    conservativeKelly: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: 'Консервативный коэффициент Келли (1/4 от полного)'
    },
    // Метаданные
    lastUpdated: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: 'Дата последнего обновления статистики'
    },
    lastTradeDate: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Дата последней сделки по инструменту'
    },
    // Дополнительные данные
    metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Дополнительные метаданные (история, графики и т.д.)'
    }
}, {
    sequelize,
    modelName: 'InstrumentStats',
    tableName: 'instrument_stats',
    indexes: [
        {
            unique: true,
            fields: ['figi']
        },
        {
            fields: ['ticker']
        },
        {
            fields: ['winRate']
        },
        {
            fields: ['totalTrades']
        },
        {
            fields: ['lastUpdated']
        }
    ],
    timestamps: false // Используем lastUpdated вместо createdAt/updatedAt
});

/**
 * Статический метод для получения или создания статистики по инструменту
 */
InstrumentStats.getOrCreateStats = async function(figi, ticker = null) {
    try {
        let stats = await this.findOne({ where: { figi } });
        
        if (!stats) {
            stats = await this.create({
                figi,
                ticker: ticker || figi,
                winRate: 0,
                averageWin: 0,
                averageLoss: 0,
                totalTrades: 0,
                profitableTrades: 0,
                losingTrades: 0
            });
        }
        
        return stats;
    } catch (error) {
        console.error(`❌ Error getting/creating stats for ${figi}:`, error);
        throw error;
    }
};

/**
 * Обновление статистики на основе закрытой позиции
 */
InstrumentStats.updateFromPosition = async function(figi, resultPercent, isProfitable) {
    try {
        const stats = await this.getOrCreateStats(figi);
        
        // Обновляем счетчики
        stats.totalTrades += 1;
        if (isProfitable) {
            stats.profitableTrades += 1;
        } else {
            stats.losingTrades += 1;
        }
        
        // Пересчитываем Win Rate
        stats.winRate = stats.profitableTrades / stats.totalTrades;
        
        // Пересчитываем средние значения
        // Используем экспоненциальное скользящее среднее для более плавного обновления
        const alpha = 0.1; // Коэффициент сглаживания
        
        if (isProfitable) {
            stats.averageWin = stats.averageWin === 0 
                ? resultPercent 
                : stats.averageWin * (1 - alpha) + resultPercent * alpha;
        } else {
            const loss = Math.abs(resultPercent);
            stats.averageLoss = stats.averageLoss === 0 
                ? loss 
                : stats.averageLoss * (1 - alpha) + loss * alpha;
        }
        
        // Пересчитываем коэффициент Келли
        if (stats.averageWin > 0) {
            stats.kellyFraction = (stats.winRate * stats.averageWin - (1 - stats.winRate) * stats.averageLoss) / stats.averageWin;
            // Ограничиваем Келли максимум 25%
            stats.kellyFraction = Math.min(Math.max(stats.kellyFraction, 0), 0.25);
            // Консервативный Келли (1/4 от полного)
            stats.conservativeKelly = stats.kellyFraction * 0.25;
        }
        
        stats.lastTradeDate = new Date();
        stats.lastUpdated = new Date();
        
        await stats.save();
        
        return stats;
    } catch (error) {
        console.error(`❌ Error updating stats for ${figi}:`, error);
        throw error;
    }
};

/**
 * Обновление волатильности инструмента
 */
InstrumentStats.updateVolatility = async function(figi, volatility, period = 30) {
    try {
        const stats = await this.getOrCreateStats(figi);
        stats.volatility = volatility;
        stats.volatilityPeriod = period;
        stats.lastUpdated = new Date();
        await stats.save();
        return stats;
    } catch (error) {
        console.error(`❌ Error updating volatility for ${figi}:`, error);
        throw error;
    }
};

export default InstrumentStats;

