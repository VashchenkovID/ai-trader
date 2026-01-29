import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * Модель для отслеживания миграций базы данных
 * Хранит информацию о выполненных миграциях схемы БД
 */
const DatabaseMigration = sequelize.define('DatabaseMigration', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    
    // Имя миграции (имя файла)
    name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        // unique: true убрано - уникальность обеспечивается через индекс ниже
        comment: 'Имя миграции (имя файла)'
    },
    
    // Версия схемы БД
    version: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: 'Версия схемы БД после применения миграции'
    },
    
    // Статус миграции
    status: {
        type: DataTypes.ENUM('pending', 'running', 'completed', 'failed', 'rolled_back'),
        allowNull: false,
        defaultValue: 'pending',
        comment: 'Статус миграции'
    },
    
    // Время выполнения
    executedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Время выполнения миграции'
    },
    
    // Время отката
    rolledBackAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Время отката миграции'
    },
    
    // Информация о выполнении
    executionInfo: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Информация о выполнении миграции (время выполнения, ошибки и т.д.)'
    },
    
    // Хеш миграции для проверки целостности
    checksum: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: 'MD5 хеш содержимого миграции для проверки целостности'
    },
    
    // Описание миграции
    description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Описание миграции'
    }
}, {
    tableName: 'database_migrations',
    timestamps: true,
    indexes: [
        {
            fields: ['name'],
            unique: true
        },
        {
            fields: ['status']
        },
        {
            fields: ['version']
        },
        {
            fields: ['executedAt']
        }
    ]
});

// Статические методы
DatabaseMigration.getLatestVersion = async function() {
    const latest = await this.findOne({
        where: {
            status: 'completed'
        },
        order: [['executedAt', 'DESC']]
    });
    
    return latest ? latest.version : '0.0.0';
};

DatabaseMigration.getPendingMigrations = async function() {
    return this.findAll({
        where: {
            status: 'pending'
        },
        order: [['name', 'ASC']]
    });
};

DatabaseMigration.getCompletedMigrations = async function() {
    return this.findAll({
        where: {
            status: 'completed'
        },
        order: [['executedAt', 'ASC']]
    });
};

DatabaseMigration.findByName = async function(name) {
    return this.findOne({
        where: { name }
    });
};

DatabaseMigration.markAsRunning = async function(name) {
    const migration = await this.findByName(name);
    if (migration) {
        await migration.update({
            status: 'running',
            executedAt: new Date()
        });
    }
    return migration;
};

DatabaseMigration.markAsCompleted = async function(name, executionInfo = {}) {
    const migration = await this.findByName(name);
    if (migration) {
        await migration.update({
            status: 'completed',
            executedAt: new Date(),
            executionInfo: {
                ...migration.executionInfo,
                ...executionInfo,
                completedAt: new Date().toISOString()
            }
        });
    }
    return migration;
};

DatabaseMigration.markAsFailed = async function(name, error) {
    const migration = await this.findByName(name);
    if (migration) {
        await migration.update({
            status: 'failed',
            executionInfo: {
                ...migration.executionInfo,
                error: error.message,
                stack: error.stack,
                failedAt: new Date().toISOString()
            }
        });
    }
    return migration;
};

DatabaseMigration.markAsRolledBack = async function(name) {
    const migration = await this.findByName(name);
    if (migration) {
        await migration.update({
            status: 'rolled_back',
            rolledBackAt: new Date()
        });
    }
    return migration;
};

export default DatabaseMigration;

