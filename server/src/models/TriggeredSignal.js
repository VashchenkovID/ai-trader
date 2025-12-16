import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * Модель для хранения истории сработавших сигналов
 * Хранит информацию о каждом сработавшем сигнале для аналитики и связи с заявками
 */
const TriggeredSignal = sequelize.define('TriggeredSignal', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    
    // Идентификаторы сигнала
    signalId: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'Идентификатор сигнала от Tinkoff API (не уникальный, т.к. один сигнал может сработать дважды: цель и стоп-лосс)'
    },
    strategyId: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'Идентификатор стратегии'
    },
    strategyName: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'Название стратегии'
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
    
    // Направление и тип срабатывания
    direction: {
        type: DataTypes.ENUM('SIGNAL_DIRECTION_BUY', 'SIGNAL_DIRECTION_SELL', 'SIGNAL_DIRECTION_UNSPECIFIED'),
        allowNull: false,
        comment: 'Направление сигнала'
    },
    triggerType: {
        type: DataTypes.ENUM('target_reached', 'stoploss_triggered'),
        allowNull: false,
        comment: 'Тип срабатывания: достижение цели или стоп-лосс'
    },
    
    // Цены на момент срабатывания
    initialPrice: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: 'Начальная цена сигнала'
    },
    currentPrice: {
        type: DataTypes.FLOAT,
        allowNull: false,
        comment: 'Текущая цена на момент срабатывания'
    },
    targetPrice: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: 'Целевая цена сигнала'
    },
    stoploss: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: 'Стоп-лосс сигнала'
    },
    
    // Дополнительная информация
    signalName: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Название сигнала'
    },
    probability: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: 'Вероятность сигнала'
    },
    
    // Статус и связь с заявкой
    status: {
        type: DataTypes.ENUM('triggered', 'executed', 'expired', 'ignored'),
        allowNull: false,
        defaultValue: 'triggered',
        comment: 'Статус сигнала: сработал, исполнен, истек, проигнорирован'
    },
    triggerCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: 'Количество срабатываний этого сигнала (один сигнал может сработать несколько раз)'
    },
    lastTriggeredAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: 'Дата и время последнего срабатывания сигнала'
    },
    tradingRequestId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
            model: 'trading_requests',
            key: 'id'
        },
        comment: 'ID торговой заявки, созданной на основе этого сигнала (если есть)'
    },
    
    // Даты
    triggeredAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: 'Дата и время срабатывания сигнала'
    },
    signalCreateDt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Дата создания исходного сигнала'
    },
    signalEndDt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Дата окончания действия исходного сигнала'
    }
}, {
    tableName: 'triggered_signals',
    timestamps: true,
    indexes: [
        {
            fields: ['signalId'],
            unique: false
        },
        {
            fields: ['signalId', 'triggerType'],
            unique: true,
            name: 'unique_signal_trigger'
        },
        {
            fields: ['figi']
        },
        {
            fields: ['triggeredAt']
        },
        {
            fields: ['status']
        },
        {
            fields: ['tradingRequestId']
        }
    ]
});

export default TriggeredSignal;

