import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const SyncSettings = sequelize.define('SyncSettings', {
    userId: {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey: true
        // unique: true убрано - primaryKey уже обеспечивает уникальность
    },
    tbankEnabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    tbankCredentials: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {}
    },
    syncSettings: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {
            autoSync: true,
            syncInterval: 300, // Интервал в секундах (5 минут по умолчанию)
            syncOnStartup: true,
            syncPositions: true,
            syncPrices: true,
            syncHistory: false,
            historyDays: 30
        }
    },
    lastSync: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {}
    },
    syncHistory: {
        type: DataTypes.JSON,
        defaultValue: []
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }
}, {
    tableName: 'SyncSettings',
    timestamps: true,
    indexes: [
        {
            fields: ['userId']
        },
        {
            fields: ['tbankEnabled', 'isActive']
        }
    ]
});

// Виртуальное поле для следующей синхронизации
SyncSettings.prototype.getNextSyncAt = function() {
    if (!this.syncSettings?.autoSync || !this.lastSync?.timestamp) {
        return null;
    }
    return new Date(new Date(this.lastSync.timestamp).getTime() + this.syncSettings.syncInterval * 1000);
};

// Метод для проверки необходимости синхронизации
SyncSettings.prototype.shouldSync = function() {
    if (!this.tbankEnabled || !this.syncSettings?.autoSync || !this.isActive) {
        return false;
    }
    
    if (!this.lastSync?.timestamp) {
        return true;
    }
    
    const nextSync = this.getNextSyncAt();
    return nextSync && new Date() >= nextSync;
};

// Метод для обновления статуса синхронизации
SyncSettings.prototype.updateSyncStatus = async function(status, data = {}) {
    this.lastSync = {
        timestamp: new Date(),
        status,
        ...data
    };
    
    // Добавляем в историю (оставляем только последние 50 записей)
    const historyEntry = {
        timestamp: this.lastSync.timestamp,
        status,
        ...data
    };
    
    this.syncHistory = [historyEntry, ...(this.syncHistory || [])];
    
    if (this.syncHistory.length > 50) {
        this.syncHistory = this.syncHistory.slice(0, 50);
    }
    
    return this.save();
};

export default SyncSettings;
