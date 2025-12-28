import LoggerService from './LoggerService.js';
import SettingsService from './SettingsService.js';
import sequelize from '../config/database.js';
import { QueryTypes } from 'sequelize';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Сервис для автоматической очистки старых данных
 * 
 * Функциональность:
 * - Удаление старых логов
 * - Архивация старых данных
 * - Удаление неиспользуемых моделей
 * - Очистка временных файлов
 */
class DataCleanupService {
    constructor() {
        this.isInitialized = false;
        this.settings = {
            // Очистка логов
            cleanupLogs: true,
            logRetentionDays: 30, // Хранить логи 30 дней
            logArchiveBeforeDelete: true, // Архивировать перед удалением
            
            // Очистка старых данных из БД
            cleanupOldData: true,
            cleanupOldRecommendations: true,
            recommendationsRetentionDays: 90, // Хранить рекомендации 90 дней
            cleanupOldTradingRequests: true,
            tradingRequestsRetentionDays: 180, // Хранить заявки 180 дней
            cleanupOldCachedData: true,
            cachedDataRetentionDays: 7, // Хранить кеш 7 дней
            
            // Очистка неиспользуемых моделей
            cleanupUnusedModels: true,
            modelRetentionDays: 90, // Хранить модели 90 дней
            
            // Очистка временных файлов
            cleanupTempFiles: true,
            tempFilesRetentionHours: 24, // Хранить временные файлы 24 часа
            
            // Автоматическая очистка
            autoCleanup: true,
            cleanupSchedule: '0 2 * * *', // Каждый день в 2:00
            
            // Пути
            logsDir: path.join(__dirname, '../../logs'),
            tempDir: path.join(__dirname, '../../temp'),
            modelsDir: path.join(__dirname, '../../models_storage')
        };
    }

    async initialize() {
        try {
            LoggerService.info('🧹 Initializing Data Cleanup Service...');
            
            // Загружаем настройки
            await this.loadSettings();
            
            this.isInitialized = true;
            LoggerService.info('✅ Data Cleanup Service initialized');
        } catch (error) {
            LoggerService.error('❌ Failed to initialize Data Cleanup Service:', error);
            throw error;
        }
    }

    /**
     * Загрузка настроек из базы данных
     */
    async loadSettings() {
        try {
            const settings = await SettingsService.getAllSettings('data_cleanup');
            
            if (settings && settings.length > 0) {
                for (const setting of settings) {
                    const key = setting.key.replace('data_cleanup.', '');
                    const value = setting.value;
                    
                    if (key.includes('Days') || key.includes('Hours')) {
                        this.settings[key] = parseInt(value) || this.settings[key];
                    } else if (key.includes('enable') || key.includes('cleanup') || key.includes('auto') || key.includes('Archive')) {
                        this.settings[key] = value === 'true' || value === true;
                    } else if (key.includes('Dir') || key.includes('Schedule')) {
                        this.settings[key] = value || this.settings[key];
                    }
                }
            }
        } catch (error) {
            LoggerService.warn('⚠️ Failed to load data cleanup settings, using defaults:', error.message);
        }
    }

    /**
     * Выполнение полной очистки
     */
    async performCleanup(options = {}) {
        try {
            LoggerService.info('🧹 Starting data cleanup...');
            
            const results = {
                logs: { deleted: 0, archived: 0, errors: [] },
                database: { deleted: 0, errors: [] },
                models: { deleted: 0, errors: [] },
                tempFiles: { deleted: 0, errors: [] },
                totalDeleted: 0,
                startTime: new Date(),
                endTime: null
            };
            
            // Очистка логов
            if (options.cleanupLogs !== false && this.settings.cleanupLogs) {
                try {
                    const logResult = await this.cleanupLogs();
                    results.logs = logResult;
                    results.totalDeleted += logResult.deleted;
                } catch (error) {
                    results.logs.errors.push(error.message);
                    LoggerService.error('❌ Error cleaning up logs:', error);
                }
            }
            
            // Очистка старых данных из БД
            if (options.cleanupDatabase !== false && this.settings.cleanupOldData) {
                try {
                    const dbResult = await this.cleanupDatabase();
                    results.database = dbResult;
                    results.totalDeleted += dbResult.deleted;
                } catch (error) {
                    results.database.errors.push(error.message);
                    LoggerService.error('❌ Error cleaning up database:', error);
                }
            }
            
            // Очистка неиспользуемых моделей
            if (options.cleanupModels !== false && this.settings.cleanupUnusedModels) {
                try {
                    const modelResult = await this.cleanupUnusedModels();
                    results.models = modelResult;
                    results.totalDeleted += modelResult.deleted;
                } catch (error) {
                    results.models.errors.push(error.message);
                    LoggerService.error('❌ Error cleaning up models:', error);
                }
            }
            
            // Очистка временных файлов
            if (options.cleanupTempFiles !== false && this.settings.cleanupTempFiles) {
                try {
                    const tempResult = await this.cleanupTempFiles();
                    results.tempFiles = tempResult;
                    results.totalDeleted += tempResult.deleted;
                } catch (error) {
                    results.tempFiles.errors.push(error.message);
                    LoggerService.error('❌ Error cleaning up temp files:', error);
                }
            }
            
            results.endTime = new Date();
            const duration = results.endTime - results.startTime;
            
            LoggerService.info(`✅ Data cleanup completed: ${results.totalDeleted} items deleted in ${duration}ms`);
            
            return results;
        } catch (error) {
            LoggerService.error('❌ Error performing cleanup:', error);
            throw error;
        }
    }

    /**
     * Очистка старых логов
     */
    async cleanupLogs() {
        try {
            const result = { deleted: 0, archived: 0, errors: [] };
            
            if (!fs.existsSync(this.settings.logsDir)) {
                return result;
            }
            
            const files = fs.readdirSync(this.settings.logsDir);
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - this.settings.logRetentionDays);
            
            for (const file of files) {
                try {
                    const filePath = path.join(this.settings.logsDir, file);
                    const stats = fs.statSync(filePath);
                    
                    if (stats.mtime < cutoffDate) {
                        // Архивируем перед удалением (если включено)
                        if (this.settings.logArchiveBeforeDelete) {
                            await this.archiveFile(filePath);
                            result.archived++;
                        }
                        
                        fs.unlinkSync(filePath);
                        result.deleted++;
                    }
                } catch (error) {
                    result.errors.push(`Error processing ${file}: ${error.message}`);
                }
            }
            
            LoggerService.info(`🧹 Cleaned up ${result.deleted} log files (${result.archived} archived)`);
            
            return result;
        } catch (error) {
            LoggerService.error('❌ Error cleaning up logs:', error);
            throw error;
        }
    }

    /**
     * Очистка старых данных из БД
     */
    async cleanupDatabase() {
        try {
            const result = { deleted: 0, errors: [] };
            const cutoffDate = new Date();
            
            // Очистка старых рекомендаций
            if (this.settings.cleanupOldRecommendations) {
                cutoffDate.setDate(cutoffDate.getDate() - this.settings.recommendationsRetentionDays);
                
                const deletedRecommendations = await sequelize.query(
                    `DELETE FROM "Recommendations" WHERE "analysisDate" < :cutoffDate`,
                    {
                        replacements: { cutoffDate },
                        type: QueryTypes.DELETE
                    }
                );
                
                result.deleted += deletedRecommendations[1] || 0;
                LoggerService.info(`🧹 Deleted ${deletedRecommendations[1] || 0} old recommendations`);
            }
            
            // Очистка старых торговых заявок
            if (this.settings.cleanupOldTradingRequests) {
                cutoffDate.setDate(cutoffDate.getDate() - this.settings.tradingRequestsRetentionDays);
                
                const deletedRequests = await sequelize.query(
                    `DELETE FROM "trading_requests" WHERE "createdAt" < :cutoffDate AND "status" IN ('REJECTED', 'CANCELLED')`,
                    {
                        replacements: { cutoffDate },
                        type: QueryTypes.DELETE
                    }
                );
                
                result.deleted += deletedRequests[1] || 0;
                LoggerService.info(`🧹 Deleted ${deletedRequests[1] || 0} old trading requests`);
            }
            
            // Очистка старого кеша
            if (this.settings.cleanupOldCachedData) {
                cutoffDate.setDate(cutoffDate.getDate() - this.settings.cachedDataRetentionDays);
                
                const deletedCache = await sequelize.query(
                    `DELETE FROM "cached_instruments" WHERE "lastUpdated" < :cutoffDate`,
                    {
                        replacements: { cutoffDate },
                        type: QueryTypes.DELETE
                    }
                );
                
                result.deleted += deletedCache[1] || 0;
                LoggerService.info(`🧹 Deleted ${deletedCache[1] || 0} old cached items`);
            }
            
            return result;
        } catch (error) {
            LoggerService.error('❌ Error cleaning up database:', error);
            throw error;
        }
    }

    /**
     * Очистка неиспользуемых моделей
     */
    async cleanupUnusedModels() {
        try {
            const result = { deleted: 0, errors: [] };
            
            if (!fs.existsSync(this.settings.modelsDir)) {
                return result;
            }
            
            const files = fs.readdirSync(this.settings.modelsDir);
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - this.settings.modelRetentionDays);
            
            for (const file of files) {
                try {
                    const filePath = path.join(this.settings.modelsDir, file);
                    const stats = fs.statSync(filePath);
                    
                    if (stats.mtime < cutoffDate) {
                        // Проверяем, используется ли модель (можно добавить проверку в БД)
                        // Пока просто удаляем старые файлы
                        fs.unlinkSync(filePath);
                        result.deleted++;
                    }
                } catch (error) {
                    result.errors.push(`Error processing ${file}: ${error.message}`);
                }
            }
            
            LoggerService.info(`🧹 Cleaned up ${result.deleted} unused model files`);
            
            return result;
        } catch (error) {
            LoggerService.error('❌ Error cleaning up models:', error);
            throw error;
        }
    }

    /**
     * Очистка временных файлов
     */
    async cleanupTempFiles() {
        try {
            const result = { deleted: 0, errors: [] };
            
            if (!fs.existsSync(this.settings.tempDir)) {
                return result;
            }
            
            const files = fs.readdirSync(this.settings.tempDir);
            const cutoffDate = new Date();
            cutoffDate.setHours(cutoffDate.getHours() - this.settings.tempFilesRetentionHours);
            
            for (const file of files) {
                try {
                    const filePath = path.join(this.settings.tempDir, file);
                    const stats = fs.statSync(filePath);
                    
                    if (stats.mtime < cutoffDate) {
                        if (stats.isFile()) {
                            fs.unlinkSync(filePath);
                        } else if (stats.isDirectory()) {
                            fs.rmSync(filePath, { recursive: true, force: true });
                        }
                        result.deleted++;
                    }
                } catch (error) {
                    result.errors.push(`Error processing ${file}: ${error.message}`);
                }
            }
            
            LoggerService.info(`🧹 Cleaned up ${result.deleted} temp files`);
            
            return result;
        } catch (error) {
            LoggerService.error('❌ Error cleaning up temp files:', error);
            throw error;
        }
    }

    /**
     * Архивирование файла
     */
    async archiveFile(filePath) {
        try {
            // Создаем директорию для архивов, если её нет
            const archiveDir = path.join(path.dirname(filePath), 'archive');
            if (!fs.existsSync(archiveDir)) {
                fs.mkdirSync(archiveDir, { recursive: true });
            }
            
            const fileName = path.basename(filePath);
            const archivePath = path.join(archiveDir, `${fileName}.${Date.now()}.archive`);
            
            // Копируем файл в архив
            fs.copyFileSync(filePath, archivePath);
            
            return archivePath;
        } catch (error) {
            LoggerService.warn(`⚠️ Failed to archive file ${filePath}:`, error.message);
            // Не бросаем ошибку, чтобы не прерывать процесс очистки
        }
    }

    /**
     * Получение статистики очистки
     */
    async getCleanupStats() {
        try {
            const stats = {
                logs: { count: 0, oldest: null, newest: null },
                database: {
                    recommendations: 0,
                    tradingRequests: 0,
                    cachedItems: 0
                },
                models: { count: 0, totalSize: 0 },
                tempFiles: { count: 0, totalSize: 0 }
            };
            
            // Статистика логов
            if (fs.existsSync(this.settings.logsDir)) {
                const logFiles = fs.readdirSync(this.settings.logsDir)
                    .map(file => {
                        const filePath = path.join(this.settings.logsDir, file);
                        return {
                            name: file,
                            mtime: fs.statSync(filePath).mtime
                        };
                    })
                    .sort((a, b) => a.mtime - b.mtime);
                
                stats.logs.count = logFiles.length;
                if (logFiles.length > 0) {
                    stats.logs.oldest = logFiles[0].mtime;
                    stats.logs.newest = logFiles[logFiles.length - 1].mtime;
                }
            }
            
            // Статистика БД
            const recommendationsCount = await sequelize.query(
                'SELECT COUNT(*) as count FROM "Recommendations"',
                { type: QueryTypes.SELECT }
            );
            stats.database.recommendations = parseInt(recommendationsCount[0]?.count || 0);
            
            const requestsCount = await sequelize.query(
                'SELECT COUNT(*) as count FROM "trading_requests" WHERE "status" IN (\'REJECTED\', \'CANCELLED\')',
                { type: QueryTypes.SELECT }
            );
            stats.database.tradingRequests = parseInt(requestsCount[0]?.count || 0);
            
            const cacheCount = await sequelize.query(
                'SELECT COUNT(*) as count FROM "cached_instruments"',
                { type: QueryTypes.SELECT }
            );
            stats.database.cachedItems = parseInt(cacheCount[0]?.count || 0);
            
            // Статистика моделей
            if (fs.existsSync(this.settings.modelsDir)) {
                const modelFiles = fs.readdirSync(this.settings.modelsDir);
                stats.models.count = modelFiles.length;
                stats.models.totalSize = modelFiles.reduce((sum, file) => {
                    try {
                        return sum + fs.statSync(path.join(this.settings.modelsDir, file)).size;
                    } catch {
                        return sum;
                    }
                }, 0);
            }
            
            // Статистика временных файлов
            if (fs.existsSync(this.settings.tempDir)) {
                const tempFiles = fs.readdirSync(this.settings.tempDir);
                stats.tempFiles.count = tempFiles.length;
                stats.tempFiles.totalSize = tempFiles.reduce((sum, file) => {
                    try {
                        const filePath = path.join(this.settings.tempDir, file);
                        const stats = fs.statSync(filePath);
                        return sum + (stats.isFile() ? stats.size : 0);
                    } catch {
                        return sum;
                    }
                }, 0);
            }
            
            return stats;
        } catch (error) {
            LoggerService.error('❌ Error getting cleanup stats:', error);
            throw error;
        }
    }

    /**
     * Получение настроек
     */
    getSettings() {
        return { ...this.settings };
    }

    /**
     * Обновление настроек
     */
    async updateSettings(newSettings) {
        try {
            this.settings = { ...this.settings, ...newSettings };
            
            for (const [key, value] of Object.entries(newSettings)) {
                await SettingsService.setSetting(`data_cleanup.${key}`, value, {
                    description: `Настройка очистки данных: ${key}`,
                    category: 'data_cleanup',
                    dataType: typeof value === 'number' ? 'number' : (typeof value === 'boolean' ? 'boolean' : 'string')
                });
            }
            
            LoggerService.info('✅ Data cleanup settings updated');
            return true;
        } catch (error) {
            LoggerService.error('❌ Failed to update data cleanup settings:', error);
            throw error;
        }
    }
}

export default new DataCleanupService();

