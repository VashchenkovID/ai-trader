import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const ModelPerformance = sequelize.define('ModelPerformance', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    
    // Тип модели: lstm, cnn, transformer, ensemble, metaLearning, reinforcementLearning, traditional
    modelType: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'Тип модели: lstm, cnn, transformer, ensemble, metaLearning, reinforcementLearning, traditional'
    },
    
    // FIGI инструмента (null для общей производительности)
    figi: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'FIGI инструмента (null для общей производительности модели)'
    },
    
    // Период анализа
    periodStart: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: 'Начало периода анализа'
    },
    periodEnd: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: 'Конец периода анализа'
    },
    
    // Метрики производительности
    accuracy: {
        type: DataTypes.DECIMAL(5, 4),
        allowNull: false,
        defaultValue: 0,
        comment: 'Точность модели (0-1)'
    },
    precision: {
        type: DataTypes.DECIMAL(5, 4),
        allowNull: false,
        defaultValue: 0,
        comment: 'Precision (0-1)'
    },
    recall: {
        type: DataTypes.DECIMAL(5, 4),
        allowNull: false,
        defaultValue: 0,
        comment: 'Recall (0-1)'
    },
    f1Score: {
        type: DataTypes.DECIMAL(5, 4),
        allowNull: false,
        defaultValue: 0,
        comment: 'F1 Score (0-1)'
    },
    
    // Торговые метрики
    winRate: {
        type: DataTypes.DECIMAL(5, 4),
        allowNull: false,
        defaultValue: 0,
        comment: 'Процент прибыльных сделок (0-1)'
    },
    averageReturn: {
        type: DataTypes.DECIMAL(10, 4),
        allowNull: false,
        defaultValue: 0,
        comment: 'Средняя доходность в %'
    },
    sharpeRatio: {
        type: DataTypes.DECIMAL(10, 4),
        allowNull: true,
        comment: 'Sharpe Ratio'
    },
    
    // Количество сделок
    totalTrades: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Общее количество сделок'
    },
    profitableTrades: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Количество прибыльных сделок'
    },
    
    // Согласованность с другими моделями
    agreement: {
        type: DataTypes.DECIMAL(5, 4),
        allowNull: true,
        comment: 'Согласованность с другими моделями (0-1)'
    },
    
    // Вес модели (вычисляемый)
    calculatedWeight: {
        type: DataTypes.DECIMAL(5, 4),
        allowNull: true,
        comment: 'Рассчитанный вес модели на основе производительности'
    },
    
    // Статус модели
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Активна ли модель (автоматически отключается при деградации)'
    },
    
    // Метаданные
    metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Дополнительные метаданные'
    }
}, {
    tableName: 'model_performances',
    timestamps: true,
    indexes: [
        {
            fields: ['modelType', 'figi', 'periodEnd']
        },
        {
            fields: ['modelType', 'isActive']
        },
        {
            fields: ['figi', 'periodEnd']
        },
        {
            fields: ['periodEnd']
        }
    ]
});

// Статические методы
ModelPerformance.getLatestPerformance = async function(modelType, figi = null) {
    const where = {
        modelType,
        isActive: true
    };
    
    if (figi) {
        where.figi = figi;
    } else {
        where.figi = null;
    }
    
    return this.findOne({
        where,
        order: [['periodEnd', 'DESC']]
    });
};

ModelPerformance.getPerformanceHistory = async function(modelType, figi = null, days = 30) {
    const where = {
        modelType,
        isActive: true
    };
    
    if (figi) {
        where.figi = figi;
    } else {
        where.figi = null;
    }
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    where.periodEnd = {
        [sequelize.Sequelize.Op.gte]: cutoffDate
    };
    
    return this.findAll({
        where,
        order: [['periodEnd', 'DESC']]
    });
};

ModelPerformance.getAveragePerformance = async function(modelType, figi = null, days = 30) {
    const history = await this.getPerformanceHistory(modelType, figi, days);
    
    if (history.length === 0) {
        return null;
    }
    
    const avg = {
        accuracy: 0,
        precision: 0,
        recall: 0,
        f1Score: 0,
        winRate: 0,
        averageReturn: 0,
        totalTrades: 0,
        profitableTrades: 0,
        agreement: 0
    };
    
    history.forEach(perf => {
        avg.accuracy += parseFloat(perf.accuracy);
        avg.precision += parseFloat(perf.precision);
        avg.recall += parseFloat(perf.recall);
        avg.f1Score += parseFloat(perf.f1Score);
        avg.winRate += parseFloat(perf.winRate);
        avg.averageReturn += parseFloat(perf.averageReturn);
        avg.totalTrades += perf.totalTrades;
        avg.profitableTrades += perf.profitableTrades;
        if (perf.agreement) {
            avg.agreement += parseFloat(perf.agreement);
        }
    });
    
    const count = history.length;
    return {
        accuracy: avg.accuracy / count,
        precision: avg.precision / count,
        recall: avg.recall / count,
        f1Score: avg.f1Score / count,
        winRate: avg.winRate / count,
        averageReturn: avg.averageReturn / count,
        totalTrades: avg.totalTrades,
        profitableTrades: avg.profitableTrades,
        agreement: avg.agreement / count,
        periodDays: days,
        samplesCount: count
    };
};

export default ModelPerformance;

