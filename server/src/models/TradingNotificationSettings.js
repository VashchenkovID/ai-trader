import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const TradingNotificationSettings = sequelize.define('TradingNotificationSettings', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    userId: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'default',
        comment: 'ID пользователя (для будущей многопользовательской системы)'
    },
    // Настройки уведомлений об открытии торгов
    openingNotificationsEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Включены ли уведомления об открытии торгов'
    },
    openingNotificationMinutes: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 15,
        comment: 'За сколько минут до открытия отправлять уведомление'
    },
    // Настройки уведомлений о закрытии торгов
    closingNotificationsEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Включены ли уведомления о закрытии торгов'
    },
    closingNotificationMinutes: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 15,
        comment: 'За сколько минут до закрытия отправлять уведомление'
    },
    // Настройки Telegram уведомлений
    telegramEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Включены ли Telegram уведомления'
    },
    // Настройки WebSocket уведомлений
    websocketEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Включены ли WebSocket уведомления'
    },
    // Настройки звуковых уведомлений (для фронтенда)
    soundEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Включены ли звуковые уведомления'
    },
    // Настройки push уведомлений (для браузера)
    pushEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Включены ли push уведомления браузера'
    },
    // Время последнего обновления настроек
    lastUpdated: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'trading_notification_settings',
    timestamps: true,
    indexes: [
        {
            fields: ['userId']
        }
    ]
});

export default TradingNotificationSettings;
