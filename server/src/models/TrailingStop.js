import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const TrailingStop = sequelize.define('TrailingStop', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    
    // Связь с торговым запросом или позицией
    tradingRequestId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
            model: 'trading_requests',
            key: 'id'
        },
        comment: 'ID торгового запроса, для которого установлен трейлинг-стоп'
    },
    
    // Инструмент
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
    
    // Параметры позиции
    entryPrice: {
        type: DataTypes.FLOAT,
        allowNull: false,
        comment: 'Цена входа в позицию'
    },
    quantity: {
        type: DataTypes.FLOAT,
        allowNull: false,
        comment: 'Количество акций в позиции'
    },
    direction: {
        type: DataTypes.ENUM('BUY', 'SELL'),
        allowNull: false,
        defaultValue: 'BUY',
        comment: 'Направление позиции'
    },
    
    // Параметры трейлинг-стопа
    activationProfitPercent: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 5.0,
        comment: 'Процент прибыли для активации трейлинг-стопа (по умолчанию 5%)'
    },
    trailingDistancePercent: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: 'Отступ трейлинг-стопа в процентах (если используется процентный метод)'
    },
    trailingDistanceATR: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: 'Отступ трейлинг-стопа в ATR (если используется ATR метод)'
    },
    useATR: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Использовать ли ATR для расчета отступа (true) или процент (false)'
    },
    
    // Текущее состояние
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Активирован ли трейлинг-стоп (достигнута ли прибыль для активации)'
    },
    currentStopPrice: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: 'Текущая цена трейлинг-стопа'
    },
    highestPrice: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: 'Максимальная цена после активации (для BUY позиций)'
    },
    lowestPrice: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: 'Минимальная цена после активации (для SELL позиций)'
    },
    
    // Статус
    status: {
        type: DataTypes.ENUM('pending', 'active', 'triggered', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
        comment: 'Статус трейлинг-стопа'
    },
    
    // Результат срабатывания
    triggeredAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Время срабатывания трейлинг-стопа'
    },
    triggerPrice: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: 'Цена при срабатывании трейлинг-стопа'
    },
    
    // Метаданные
    portfolioType: {
        type: DataTypes.ENUM('virtual', 'real'),
        allowNull: false,
        defaultValue: 'virtual',
        comment: 'Тип портфеля'
    },
    strategyId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: 'trading_strategies',
            key: 'id'
        },
        comment: 'ID стратегии торговли'
    }
}, {
    tableName: 'trailing_stops',
    timestamps: true,
    indexes: [
        {
            fields: ['figi', 'status']
        },
        {
            fields: ['tradingRequestId']
        },
        {
            fields: ['status', 'isActive']
        },
        {
            fields: ['portfolioType']
        }
    ]
});

export default TrailingStop;

