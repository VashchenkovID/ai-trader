import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * Модель статуса миграции портфеля
 * Хранит состояние и прогресс миграции между торговыми режимами
 */
const MigrationStatus = sequelize.define('MigrationStatus', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    
    // Основная информация о миграции
    migrationId: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        comment: 'Уникальный идентификатор миграции'
    },
    
    status: {
        type: DataTypes.ENUM('pending', 'active', 'completed', 'failed', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
        comment: 'Статус миграции'
    },
    
    migrationType: {
        type: DataTypes.ENUM('paper_to_micro', 'micro_to_full', 'full_to_paper'),
        allowNull: false,
        comment: 'Тип миграции'
    },
    
    // Прогресс миграции
    currentStep: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Текущий шаг миграции'
    },
    
    totalSteps: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Общее количество шагов'
    },
    
    progress: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0.00,
        comment: 'Прогресс миграции в процентах'
    },
    
    // Временные метки
    startTime: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Время начала миграции'
    },
    
    endTime: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Время завершения миграции'
    },
    
    estimatedEndTime: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Ожидаемое время завершения'
    },
    
    // Портфели
    virtualPortfolio: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Состояние виртуального портфеля на момент миграции'
    },
    
    realPortfolio: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Состояние реального портфеля после миграции'
    },
    
    // План миграции
    migrationPlan: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Детальный план миграции'
    },
    
    // Выполненные сделки
    executedTrades: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Список выполненных торговых операций'
    },
    
    // Ошибки и предупреждения
    errors: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Список ошибок, возникших во время миграции'
    },
    
    warnings: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Список предупреждений'
    },
    
    // Статистика миграции
    totalTrades: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Общее количество сделок'
    },
    
    successfulTrades: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Количество успешных сделок'
    },
    
    failedTrades: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Количество неудачных сделок'
    },
    
    totalValue: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0.00,
        comment: 'Общая стоимость мигрированных позиций'
    },
    
    totalCommission: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0.00,
        comment: 'Общая комиссия по сделкам'
    },
    
    // Настройки миграции
    migrationSettings: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Настройки, использованные для миграции'
    },
    
    // Метаданные
    description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Описание миграции'
    },
    
    createdBy: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: 'Пользователь, инициировавший миграцию'
    },
    
    lastActivity: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: 'Время последней активности'
    }
}, {
    tableName: 'migration_status',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        {
            fields: ['migrationId']
        },
        {
            fields: ['status']
        },
        {
            fields: ['migrationType']
        },
        {
            fields: ['startTime']
        },
        {
            fields: ['lastActivity']
        }
    ]
});

// Статические методы для работы с миграциями
MigrationStatus.createMigration = async function(migrationData) {
    try {
        const migrationId = `migration_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const migration = await this.create({
            migrationId,
            migrationType: migrationData.type || 'paper_to_micro',
            virtualPortfolio: migrationData.virtualPortfolio,
            migrationPlan: migrationData.plan,
            migrationSettings: migrationData.settings,
            description: migrationData.description,
            createdBy: migrationData.createdBy || 'system',
            status: 'pending'
        });
        
        return migration;
    } catch (error) {
        console.error('Error creating migration:', error);
        throw error;
    }
};

MigrationStatus.updateProgress = async function(migrationId, progressData) {
    try {
        const migration = await this.findOne({ where: { migrationId } });
        if (!migration) {
            throw new Error(`Migration ${migrationId} not found`);
        }
        
        const updateData = {
            currentStep: progressData.currentStep || migration.currentStep,
            totalSteps: progressData.totalSteps || migration.totalSteps,
            progress: progressData.progress || migration.progress,
            lastActivity: new Date()
        };
        
        // Обновляем статус если указан
        if (progressData.status) {
            updateData.status = progressData.status;
        }
        
        // Обновляем время начала если миграция активируется
        if (progressData.status === 'active' && !migration.startTime) {
            updateData.startTime = new Date();
        }
        
        // Обновляем время завершения если миграция завершается
        if (['completed', 'failed', 'cancelled'].includes(progressData.status)) {
            updateData.endTime = new Date();
        }
        
        // Обновляем статистику
        if (progressData.stats) {
            updateData.totalTrades = progressData.stats.totalTrades || migration.totalTrades;
            updateData.successfulTrades = progressData.stats.successfulTrades || migration.successfulTrades;
            updateData.failedTrades = progressData.stats.failedTrades || migration.failedTrades;
            updateData.totalValue = progressData.stats.totalValue || migration.totalValue;
            updateData.totalCommission = progressData.stats.totalCommission || migration.totalCommission;
        }
        
        // Обновляем портфели
        if (progressData.virtualPortfolio) {
            updateData.virtualPortfolio = progressData.virtualPortfolio;
        }
        if (progressData.realPortfolio) {
            updateData.realPortfolio = progressData.realPortfolio;
        }
        
        // Обновляем сделки
        if (progressData.executedTrades) {
            updateData.executedTrades = progressData.executedTrades;
        }
        
        // Обновляем ошибки
        if (progressData.errors) {
            updateData.errors = progressData.errors;
        }
        
        // Обновляем предупреждения
        if (progressData.warnings) {
            updateData.warnings = progressData.warnings;
        }
        
        await migration.update(updateData);
        
        return migration;
    } catch (error) {
        console.error('Error updating migration progress:', error);
        throw error;
    }
};

MigrationStatus.getActiveMigrations = async function() {
    try {
        return await this.findAll({
            where: { status: 'active' },
            order: [['lastActivity', 'DESC']]
        });
    } catch (error) {
        console.error('Error getting active migrations:', error);
        return [];
    }
};

MigrationStatus.getMigrationHistory = async function(limit = 50) {
    try {
        return await this.findAll({
            order: [['createdAt', 'DESC']],
            limit
        });
    } catch (error) {
        console.error('Error getting migration history:', error);
        return [];
    }
};

MigrationStatus.cleanupOldMigrations = async function(daysOld = 30) {
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);
        
        const deletedCount = await this.destroy({
            where: {
                status: ['completed', 'failed', 'cancelled'],
                createdAt: {
                    [sequelize.Sequelize.Op.lt]: cutoffDate
                }
            }
        });
        
        console.log(`Cleaned up ${deletedCount} old migrations`);
        return deletedCount;
    } catch (error) {
        console.error('Error cleaning up old migrations:', error);
        return 0;
    }
};

export default MigrationStatus;
