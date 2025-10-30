import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const CachedTelegramSentiment = sequelize.define('CachedTelegramSentiment', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    figi: {
        type: DataTypes.STRING(50),
        allowNull: false,
        index: true
    },
    channelId: {
        type: DataTypes.STRING(100),
        allowNull: false,
        index: true
    },
    channelName: {
        type: DataTypes.STRING(200),
        allowNull: true
    },
    sentiment: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
        validate: {
            min: -1,
            max: 1
        }
    },
    confidence: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
        validate: {
            min: 0,
            max: 1
        }
    },
    messageCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    positiveMessages: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    negativeMessages: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    neutralMessages: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    keywords: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: []
    },
    // Временные метки
    analyzedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    periodStart: {
        type: DataTypes.DATE,
        allowNull: false
    },
    periodEnd: {
        type: DataTypes.DATE,
        allowNull: false
    },
    // Метаданные для кеширования
    cachedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => new Date(Date.now() + 6 * 60 * 60 * 1000) // 6 часов
    },
    isExpired: {
        type: DataTypes.VIRTUAL,
        get() {
            return this.expiresAt < new Date();
        }
    }
}, {
    tableName: 'cached_telegram_sentiment',
    timestamps: true,
    indexes: [
        {
            fields: ['figi', 'analyzedAt']
        },
        {
            fields: ['channelId', 'analyzedAt']
        },
        {
            fields: ['cachedAt']
        },
        {
            fields: ['expiresAt']
        },
        {
            fields: ['sentiment']
        },
        {
            fields: ['confidence']
        }
    ]
});

export default CachedTelegramSentiment;
