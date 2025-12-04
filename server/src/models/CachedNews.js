import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const CachedNews = sequelize.define('CachedNews', {
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
    title: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    url: {
        type: DataTypes.STRING(500),
        allowNull: true
    },
    source: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    publishedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        index: true
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
    relevance: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
        validate: {
            min: 0,
            max: 1
        }
    },
    impact: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
        validate: {
            min: 0,
            max: 1
        }
    },
    keywords: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: []
    },
    language: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'ru'
    },
    category: {
        type: DataTypes.STRING(50),
        allowNull: true
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
        defaultValue: () => new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 часа
    },
    isExpired: {
        type: DataTypes.VIRTUAL,
        get() {
            return this.expiresAt < new Date();
        }
    }
}, {
    tableName: 'cached_news',
    timestamps: true,
    indexes: [
        {
            fields: ['figi', 'publishedAt']
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
            fields: ['relevance']
        },
        {
            // Уникальный индекс для предотвращения дубликатов по figi + url
            unique: true,
            fields: ['figi', 'url'],
            name: 'cached_news_figi_url_unique'
        }
    ]
});

export default CachedNews;
