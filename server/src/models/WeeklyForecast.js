import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const WeeklyForecast = sequelize.define('WeeklyForecast', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    figi: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: 'FIGI инструмента'
    },
    ticker: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment: 'Тикер инструмента'
    },
    forecastDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        field: 'forecast_date',
        comment: 'Дата создания прогноза'
    },
    startDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        field: 'start_date',
        comment: 'Начало прогноза (обычно сегодня)'
    },
    endDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        field: 'end_date',
        comment: 'Конец прогноза (start_date + 7 дней)'
    },
    
    // Прогнозируемые данные
    forecastData: {
        type: DataTypes.JSONB,
        allowNull: false,
        field: 'forecast_data',
        comment: 'Массив прогнозируемых свечей: [{date, open, high, low, close, volume, confidence}, ...]',
        validate: {
            isArray(value) {
                if (!Array.isArray(value) || value.length !== 7) {
                    throw new Error('forecastData must be an array of 7 candles');
                }
            }
        }
    },
    
    // Метаданные модели
    modelVersion: {
        type: DataTypes.STRING(50),
        field: 'model_version',
        comment: 'Версия модели (timestamp_version)'
    },
    modelType: {
        type: DataTypes.STRING(50),
        field: 'model_type',
        defaultValue: 'seq2seq',
        validate: {
            isIn: [['seq2seq', 'transformer', 'lstm', 'ensemble']]
        }
    },
    confidenceScore: {
        type: DataTypes.DECIMAL(5, 4),
        field: 'confidence_score',
        comment: 'Общая уверенность прогноза (0-1)',
        validate: {
            min: 0,
            max: 1
        }
    },
    
    // Статистика прогноза
    predictedVolatility: {
        type: DataTypes.DECIMAL(10, 6),
        field: 'predicted_volatility',
        comment: 'Прогнозируемая волатильность'
    },
    predictedTrend: {
        type: DataTypes.STRING(20),
        field: 'predicted_trend',
        validate: {
            isIn: [['BULLISH', 'BEARISH', 'SIDEWAYS', null]]
        }
    },
    predictedPriceChange: {
        type: DataTypes.DECIMAL(10, 4),
        field: 'predicted_price_change',
        comment: 'Процентное изменение цены за неделю'
    },
    
    // Реальные данные
    actualData: {
        type: DataTypes.JSONB,
        field: 'actual_data',
        comment: 'Массив реальных свечей: [{date, open, high, low, close, volume}, ...]'
    },
    
    // Метрики точности
    accuracyMetrics: {
        type: DataTypes.JSONB,
        field: 'accuracy_metrics',
        comment: '{mae, mse, rmse, mape, directionAccuracy, priceError, volumeError}'
    },
    isCompleted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'is_completed'
    },
    completionDate: {
        type: DataTypes.DATEONLY,
        field: 'completion_date'
    },
    
    // Временные метки
    createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        field: 'created_at'
    },
    updatedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        field: 'updated_at'
    }
}, {
    tableName: 'weekly_forecasts',
    timestamps: true,
    indexes: [
        { fields: ['figi', 'forecast_date'] },
        { fields: ['start_date'] },
        { fields: ['is_completed'] },
        { fields: ['figi', 'is_completed'] }
    ]
});

export default WeeklyForecast;

