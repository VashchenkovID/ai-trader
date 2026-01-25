import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import sequelize from '../config/database.js';
import Settings from '../models/Settings.js';
import RealPortfolio from '../models/RealPortfolio.js';
import VirtualPortfolio from '../models/VirtualPortfolio.js';
import TradingRequest from '../models/TradingRequest.js';
import OptimizedTelegramService from './OptimizedTelegramService.js';
import LoggerService from './LoggerService.js';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Сервис для резервного копирования и восстановления данных
 */
class BackupService {
    constructor() {
        this.isInitialized = false;
        this.backupDir = path.resolve(__dirname, '../../backups');
        this.dbBackupDir = path.join(this.backupDir, 'database');
        this.settingsBackupDir = path.join(this.backupDir, 'settings');
        this.modelsBackupDir = path.join(this.backupDir, 'models');
        this.fullBackupDir = path.join(this.backupDir, 'full');
        this.exportDir = path.join(this.backupDir, 'exports');
        
        // Настройки ротации бэкапов
        this.retentionPolicy = {
            daily: 7,      // Хранить последние 7 ежедневных бэкапов
            weekly: 4,     // Хранить последние 4 еженедельных бэкапа
            monthly: 12    // Хранить последние 12 месячных бэкапов
        };
        
        // Расписание автоматических бэкапов
        this.schedule = {
            daily: null,   // Ежедневный бэкап в 2:00
            weekly: null,  // Еженедельный бэкап в воскресенье в 3:00
            monthly: null // Месячный бэкап 1-го числа в 4:00
        };
    }
    
    /**
     * Инициализация сервиса
     */
    async initialize() {
        try {
            // Создаем директории для бэкапов
            await this.ensureDirectories();
            
            // Запускаем автоматические бэкапы
            this.startScheduledBackups();
            
            this.isInitialized = true;
        } catch (error) {
            LoggerService.error('Ошибка инициализации BackupService', {
                service: 'BackupService',
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
            throw error;
        }
    }
    
    /**
     * Создание директорий для бэкапов
     */
    async ensureDirectories() {
        const dirs = [
            this.backupDir,
            this.dbBackupDir,
            this.settingsBackupDir,
            this.modelsBackupDir,
            this.fullBackupDir,
            this.exportDir
        ];
        
        for (const dir of dirs) {
            try {
                await fs.mkdir(dir, { recursive: true });
            } catch (error) {
                LoggerService.warn('Не удалось создать директорию для бэкапов', {
                    service: 'BackupService',
                    directory: dir,
                    error: {
                        message: error.message
                    }
                });
            }
        }
    }
    
    /**
     * Создание полного бэкапа
     */
    async createFullBackup(options = {}) {
        const { type = 'manual', description = '' } = options;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupId = `full_${timestamp}`;
        const backupPath = path.join(this.fullBackupDir, backupId);
        
        try {
            await fs.mkdir(backupPath, { recursive: true });
            
            const results = {
                id: backupId,
                type,
                timestamp: new Date().toISOString(),
                description,
                path: backupPath,
                components: {}
            };
            
            // 1. Бэкап базы данных
            const dbBackup = await this.backupDatabase(backupId);
            results.components.database = dbBackup;
            
            // Если бэкап БД не удался, продолжаем с другими компонентами
            if (!dbBackup.success) {
                console.warn('⚠️ Бэкап БД не удался, но продолжаем с другими компонентами');
            }
            
            // 2. Бэкап настроек
            try {
                const settingsBackup = await this.backupSettings(backupId);
                results.components.settings = settingsBackup;
            } catch (error) {
                console.error('❌ Ошибка бэкапа настроек:', error);
                results.components.settings = { error: error.message };
            }
            
            // 3. Бэкап моделей нейросетей
            try {
                const modelsBackup = await this.backupModels(backupId);
                results.components.models = modelsBackup;
            } catch (error) {
                console.error('❌ Ошибка бэкапа моделей:', error);
                results.components.models = { error: error.message };
            }
            
            // Сохраняем метаданные бэкапа
            const metadataPath = path.join(backupPath, 'metadata.json');
            await fs.writeFile(metadataPath, JSON.stringify(results, null, 2));
            
            // Вычисляем хеш для проверки целостности
            const checksum = await this.calculateChecksum(backupPath);
            results.checksum = checksum;
            
            // Обновляем метаданные с checksum
            await fs.writeFile(metadataPath, JSON.stringify(results, null, 2));
            
            console.log(`✅ Полный бэкап создан: ${backupId}`);
            
            // Отправляем уведомление
            await this.sendBackupNotification(results, 'success');
            
            return results;
            
        } catch (error) {
            console.error('❌ Ошибка создания полного бэкапа:', error);
            await this.sendBackupNotification({ id: backupId, error: error.message }, 'error');
            throw error;
        }
    }
    
    /**
     * Бэкап базы данных
     * Пытается использовать pg_dump, если недоступен - использует Sequelize экспорт
     */
    async backupDatabase(backupId) {
        const dbConfig = sequelize.config;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFileName = `db_${timestamp}.json`;
        const backupPath = path.join(this.dbBackupDir, backupFileName);
        
        try {
            // Используем pg_dump для PostgreSQL (если доступен)
            if (dbConfig.dialect === 'postgres') {
                // Сначала проверяем наличие pg_dump
                let pgDumpAvailable = false;
                try {
                    await execAsync('pg_dump --version');
                    pgDumpAvailable = true;
                } catch (checkError) {
                    // pg_dump не доступен, используем альтернативный метод
                }
                
                if (pgDumpAvailable) {
                    // Используем pg_dump (более быстрый и надежный метод)
                    const sqlBackupFileName = `db_${timestamp}.sql`;
                    const sqlBackupPath = path.join(this.dbBackupDir, sqlBackupFileName);
                    const pgDumpCommand = `pg_dump -h ${dbConfig.host} -p ${dbConfig.port || 5432} -U ${dbConfig.username} -d ${dbConfig.database} -F c -f "${sqlBackupPath}"`;
                    
                    const env = { ...process.env, PGPASSWORD: dbConfig.password };
                    
                    try {
                        await execAsync(pgDumpCommand, { env, timeout: 300000 });
                        const stats = await fs.stat(sqlBackupPath);
                        
                        return {
                            success: true,
                            file: sqlBackupFileName,
                            path: sqlBackupPath,
                            size: stats.size,
                            timestamp: new Date().toISOString(),
                            method: 'pg_dump'
                        };
                    } catch (execError) {
                        console.warn('⚠️ pg_dump не удался, используем альтернативный метод:', execError.message);
                        // Продолжаем с альтернативным методом
                    }
                }
                
                // Альтернативный метод: экспорт через Sequelize
                return await this.backupDatabaseViaSequelize(backupPath, backupFileName);
            } else {
                // Для других БД используем экспорт через Sequelize
                return await this.backupDatabaseViaSequelize(backupPath, backupFileName);
            }
        } catch (error) {
            console.error('❌ Ошибка бэкапа БД:', error);
            return {
                success: false,
                error: error.message,
                file: backupFileName,
                path: null,
                size: 0,
                timestamp: new Date().toISOString()
            };
        }
    }
    
    /**
     * Альтернативный метод бэкапа БД через Sequelize (работает без pg_dump)
     */
    async backupDatabaseViaSequelize(backupPath, backupFileName) {
        try {
            // Динамически импортируем все модели
            const models = await this.getAllModels();
            const backupData = {
                timestamp: new Date().toISOString(),
                version: '1.0',
                tables: {}
            };
            
            let totalRecords = 0;
            
            // Экспортируем данные из каждой модели
            for (const [modelName, Model] of Object.entries(models)) {
                try {
                    const records = await Model.findAll({ raw: true });
                    backupData.tables[modelName] = {
                        count: records.length,
                        data: records
                    };
                    totalRecords += records.length;
                } catch (error) {
                    LoggerService.warn('Ошибка экспорта модели при бэкапе', {
                        service: 'BackupService',
                        modelName,
                        error: {
                            message: error.message
                        }
                    });
                    backupData.tables[modelName] = {
                        count: 0,
                        data: [],
                        error: error.message
                    };
                }
            }
            
            // Сохраняем в JSON файл
            await fs.writeFile(backupPath, JSON.stringify(backupData, null, 2));
            
            const stats = await fs.stat(backupPath);
            
            return {
                success: true,
                file: backupFileName,
                path: backupPath,
                size: stats.size,
                timestamp: new Date().toISOString(),
                method: 'sequelize',
                recordsCount: totalRecords,
                tablesCount: Object.keys(models).length
            };
        } catch (error) {
            console.error('❌ Ошибка бэкапа БД через Sequelize:', error);
            throw error;
        }
    }
    
    /**
     * Получение всех моделей Sequelize
     */
    async getAllModels() {
        const models = {};
        
        try {
            // Импортируем все модели (список из initDatabase.js)
            const modelFiles = [
                'Settings',
                'MigrationStatus',
                'CachedInstrument',
                'CachedCandle',
                'CachedNews',
                'CachedTelegramSentiment',
                'CachedTradingHours',
                'Company',
                'PortfolioItem',
                'Recommendation',
                'TradingRequest',
                'VirtualPortfolio',
                'RealPortfolio',
                'CachedSignal',
                'TrainingState',
                'TradingStrategy',
                'PortfolioAllocation',
                'PositionStrategy',
                'PositionExit',
                'TriggeredSignal',
                'InstrumentStats',
                'BacktestResult',
                'MacroIndicator',
                'PortfolioRebalancing',
                'CorrelationCache',
                'PortfolioAnalysis',
                'TrailingStop',
                'TradingNotificationSettings',
                'SyncSettings'
            ];
            
            for (const modelName of modelFiles) {
                try {
                    const modelModule = await import(`../models/${modelName}.js`);
                    const Model = modelModule.default;
                    if (Model && Model.tableName) {
                        models[modelName] = Model;
                    }
                } catch (error) {
                    // Игнорируем модели, которые не найдены
                    console.warn(`⚠️ Модель ${modelName} не найдена, пропускаем`);
                }
            }
        } catch (error) {
            console.warn('⚠️ Ошибка загрузки моделей:', error.message);
        }
        
        return models;
    }
    
    /**
     * Бэкап настроек
     */
    async backupSettings(backupId) {
        try {
            const settings = await Settings.findAll();
            const settingsData = settings.map(s => ({
                key: s.key,
                value: s.value,
                category: s.category,
                description: s.description
            }));
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFileName = `settings_${timestamp}.json`;
            const backupPath = path.join(this.settingsBackupDir, backupFileName);
            
            await fs.writeFile(backupPath, JSON.stringify(settingsData, null, 2));
            
            const stats = await fs.stat(backupPath);
            
            return {
                success: true,
                file: backupFileName,
                path: backupPath,
                size: stats.size,
                count: settingsData.length,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('❌ Ошибка бэкапа настроек:', error);
            throw error;
        }
    }
    
    /**
     * Бэкап моделей нейросетей
     */
    async backupModels(backupId) {
        try {
            const modelsDir = path.resolve(__dirname, '../../models');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupDirName = `models_${timestamp}`;
            const backupPath = path.join(this.modelsBackupDir, backupDirName);
            
            await fs.mkdir(backupPath, { recursive: true });
            
            // Копируем все файлы моделей
            let filesCopied = 0;
            try {
                const files = await fs.readdir(modelsDir);
                for (const file of files) {
                    if (file.endsWith('.json') || file.endsWith('.h5') || file.endsWith('.pb')) {
                        const sourcePath = path.join(modelsDir, file);
                        const destPath = path.join(backupPath, file);
                        await fs.copyFile(sourcePath, destPath);
                        filesCopied++;
                    }
                }
            } catch (error) {
                // Если директория models не существует, это нормально
                if (error.code !== 'ENOENT') {
                    throw error;
                }
            }
            
            const stats = await fs.stat(backupPath);
            
            return {
                success: true,
                directory: backupDirName,
                path: backupPath,
                size: stats.size,
                filesCount: filesCopied,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('❌ Ошибка бэкапа моделей:', error);
            throw error;
        }
    }
    
    /**
     * Вычисление checksum для проверки целостности
     */
    async calculateChecksum(directory) {
        try {
            const files = await this.getAllFiles(directory);
            const hash = createHash('sha256');
            
            for (const file of files) {
                const content = await fs.readFile(file);
                hash.update(content);
            }
            
            return hash.digest('hex');
        } catch (error) {
            console.warn('⚠️ Не удалось вычислить checksum:', error.message);
            return null;
        }
    }
    
    /**
     * Получение всех файлов в директории рекурсивно
     */
    async getAllFiles(dir, fileList = []) {
        const files = await fs.readdir(dir);
        
        for (const file of files) {
            const filePath = path.join(dir, file);
            const stat = await fs.stat(filePath);
            
            if (stat.isDirectory()) {
                await this.getAllFiles(filePath, fileList);
            } else {
                fileList.push(filePath);
            }
        }
        
        return fileList;
    }
    
    /**
     * Получение списка всех бэкапов
     */
    async listBackups(type = 'all') {
        try {
            const backups = [];
            
            if (type === 'all' || type === 'full') {
                const fullBackups = await this.listBackupsInDir(this.fullBackupDir);
                backups.push(...fullBackups.map(b => ({ ...b, type: 'full' })));
            }
            
            if (type === 'all' || type === 'database') {
                const dbBackups = await this.listBackupsInDir(this.dbBackupDir);
                backups.push(...dbBackups.map(b => ({ ...b, type: 'database' })));
            }
            
            if (type === 'all' || type === 'settings') {
                const settingsBackups = await this.listBackupsInDir(this.settingsBackupDir);
                backups.push(...settingsBackups.map(b => ({ ...b, type: 'settings' })));
            }
            
            if (type === 'all' || type === 'models') {
                const modelsBackups = await this.listBackupsInDir(this.modelsBackupDir);
                backups.push(...modelsBackups.map(b => ({ ...b, type: 'models' })));
            }
            
            // Сортируем по дате (новые первые)
            backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            return backups;
        } catch (error) {
            console.error('❌ Ошибка получения списка бэкапов:', error);
            throw error;
        }
    }
    
    /**
     * Получение списка бэкапов в директории
     */
    async listBackupsInDir(dir) {
        try {
            const items = await fs.readdir(dir);
            const backups = [];
            
            for (const item of items) {
                const itemPath = path.join(dir, item);
                const stat = await fs.stat(itemPath);
                
                if (stat.isDirectory()) {
                    // Пытаемся прочитать metadata.json
                    const metadataPath = path.join(itemPath, 'metadata.json');
                    try {
                        const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
                        backups.push({
                            id: item,
                            ...metadata,
                            path: itemPath
                        });
                    } catch {
                        // Если нет metadata, создаем базовую информацию
                        backups.push({
                            id: item,
                            timestamp: stat.mtime.toISOString(),
                            path: itemPath,
                            size: await this.getDirectorySize(itemPath)
                        });
                    }
                } else {
                    backups.push({
                        id: item,
                        timestamp: stat.mtime.toISOString(),
                        path: itemPath,
                        size: stat.size
                    });
                }
            }
            
            return backups;
        } catch (error) {
            if (error.code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }
    
    /**
     * Получение размера директории
     */
    async getDirectorySize(dir) {
        let size = 0;
        try {
            const files = await this.getAllFiles(dir);
            for (const file of files) {
                const stat = await fs.stat(file);
                size += stat.size;
            }
        } catch (error) {
            console.warn(`⚠️ Не удалось вычислить размер ${dir}:`, error.message);
        }
        return size;
    }
    
    /**
     * Получение информации о бэкапе
     */
    async getBackupInfo(backupId) {
        try {
            // Ищем в полных бэкапах
            const fullBackupPath = path.join(this.fullBackupDir, backupId);
            try {
                const metadataPath = path.join(fullBackupPath, 'metadata.json');
                const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
                return metadata;
            } catch {
                // Не найден в полных бэкапах, ищем в других директориях
            }
            
            // Ищем в других директориях
            const dirs = [this.dbBackupDir, this.settingsBackupDir, this.modelsBackupDir];
            for (const dir of dirs) {
                const backupPath = path.join(dir, backupId);
                try {
                    const stat = await fs.stat(backupPath);
                    return {
                        id: backupId,
                        path: backupPath,
                        timestamp: stat.mtime.toISOString(),
                        size: stat.isDirectory() ? await this.getDirectorySize(backupPath) : stat.size
                    };
                } catch {
                    continue;
                }
            }
            
            throw new Error(`Backup ${backupId} not found`);
        } catch (error) {
            console.error('❌ Ошибка получения информации о бэкапе:', error);
            throw error;
        }
    }
    
    /**
     * Восстановление из бэкапа
     */
    async restoreBackup(backupId, options = {}) {
        const { components = ['database', 'settings', 'models'], verify = true } = options;
        
        try {
            const backupInfo = await this.getBackupInfo(backupId);
            const backupPath = backupInfo.path || path.join(this.fullBackupDir, backupId);
            
            // Проверка целостности
            if (verify && backupInfo.checksum) {
                const currentChecksum = await this.calculateChecksum(backupPath);
                if (currentChecksum !== backupInfo.checksum) {
                    throw new Error('Backup integrity check failed: checksum mismatch');
                }
            }
            
            const results = {
                backupId,
                timestamp: new Date().toISOString(),
                components: {}
            };
            
            // Восстановление компонентов
            if (components.includes('database') && backupInfo.components?.database) {
                try {
                    await this.restoreDatabase(backupInfo.components.database.path);
                    results.components.database = { success: true };
                } catch (error) {
                    results.components.database = { success: false, error: error.message };
                }
            }
            
            if (components.includes('settings') && backupInfo.components?.settings) {
                try {
                    await this.restoreSettings(backupInfo.components.settings.path);
                    results.components.settings = { success: true };
                } catch (error) {
                    results.components.settings = { success: false, error: error.message };
                }
            }
            
            if (components.includes('models') && backupInfo.components?.models) {
                try {
                    await this.restoreModels(backupInfo.components.models.path);
                    results.components.models = { success: true };
                } catch (error) {
                    results.components.models = { success: false, error: error.message };
                }
            }
            
            return results;
            
        } catch (error) {
            console.error('❌ Ошибка восстановления из бэкапа:', error);
            throw error;
        }
    }
    
    /**
     * Восстановление базы данных
     * Поддерживает как SQL (pg_restore), так и JSON (Sequelize) форматы
     */
    async restoreDatabase(backupPath) {
        const dbConfig = sequelize.config;
        
        try {
            // Определяем формат бэкапа по расширению
            const isSQL = backupPath.endsWith('.sql');
            const isJSON = backupPath.endsWith('.json');
            
            if (isSQL && dbConfig.dialect === 'postgres') {
                // Восстановление из SQL бэкапа (pg_dump)
                try {
                    await execAsync('pg_restore --version');
                } catch (checkError) {
                    throw new Error('pg_restore не установлен. Для восстановления SQL бэкапа требуется pg_restore. Используйте JSON бэкап для восстановления без pg_restore.');
                }
                
                const pgRestoreCommand = `pg_restore -h ${dbConfig.host} -p ${dbConfig.port || 5432} -U ${dbConfig.username} -d ${dbConfig.database} -c "${backupPath}"`;
                
                const env = { ...process.env, PGPASSWORD: dbConfig.password };
                await execAsync(pgRestoreCommand, { env, timeout: 300000 });
                
            } else if (isJSON) {
                // Восстановление из JSON бэкапа (Sequelize)
                await this.restoreDatabaseFromJSON(backupPath);
            } else {
                throw new Error(`Unsupported backup format. Expected .sql or .json, got: ${path.extname(backupPath)}`);
            }
        } catch (error) {
            console.error('❌ Ошибка восстановления БД:', error);
            throw error;
        }
    }
    
    /**
     * Восстановление БД из JSON бэкапа
     */
    async restoreDatabaseFromJSON(backupPath) {
        try {
            const backupData = JSON.parse(await fs.readFile(backupPath, 'utf-8'));
            const models = await this.getAllModels();
            
            let totalRestored = 0;
            
            // Восстанавливаем данные в каждую таблицу
            for (const [tableName, tableData] of Object.entries(backupData.tables || {})) {
                if (!models[tableName]) {
                    console.warn(`   ⚠️ Модель ${tableName} не найдена, пропускаем`);
                    continue;
                }
                
                const Model = models[tableName];
                
                try {
                    // Очищаем таблицу перед восстановлением
                    await Model.destroy({ where: {}, truncate: true, cascade: true });
                    
                    // Восстанавливаем данные
                    if (tableData.data && tableData.data.length > 0) {
                        // Используем bulkCreate для эффективной вставки
                        await Model.bulkCreate(tableData.data, {
                            validate: true,
                            individualHooks: false
                        });
                        totalRestored += tableData.data.length;
                        console.log(`   ✅ ${tableName}: восстановлено ${tableData.data.length} записей`);
                    }
                } catch (error) {
                    console.error(`   ❌ Ошибка восстановления ${tableName}:`, error.message);
                    throw error;
                }
            }
            
            console.log(`✅ БД восстановлена из JSON: ${totalRestored} записей`);
        } catch (error) {
            console.error('❌ Ошибка восстановления из JSON:', error);
            throw error;
        }
    }
    
    /**
     * Восстановление настроек
     */
    async restoreSettings(backupPath) {
        try {
            const settingsData = JSON.parse(await fs.readFile(backupPath, 'utf-8'));
            
            // Удаляем все существующие настройки
            await Settings.destroy({ where: {} });
            
            // Восстанавливаем настройки
            for (const setting of settingsData) {
                await Settings.create(setting);
            }
            
            console.log(`✅ Настройки восстановлены (${settingsData.length} записей)`);
        } catch (error) {
            console.error('❌ Ошибка восстановления настроек:', error);
            throw error;
        }
    }
    
    /**
     * Восстановление моделей
     */
    async restoreModels(backupPath) {
        try {
            const modelsDir = path.resolve(__dirname, '../../models');
            await fs.mkdir(modelsDir, { recursive: true });
            
            const files = await fs.readdir(backupPath);
            for (const file of files) {
                if (file.endsWith('.json') || file.endsWith('.h5') || file.endsWith('.pb')) {
                    const sourcePath = path.join(backupPath, file);
                    const destPath = path.join(modelsDir, file);
                    await fs.copyFile(sourcePath, destPath);
                }
            }
            
            console.log('✅ Модели восстановлены');
        } catch (error) {
            console.error('❌ Ошибка восстановления моделей:', error);
            throw error;
        }
    }
    
    /**
     * Удаление бэкапа
     */
    async deleteBackup(backupId) {
        try {
            const backupInfo = await this.getBackupInfo(backupId);
            const backupPath = backupInfo.path;
            
            const stat = await fs.stat(backupPath);
            if (stat.isDirectory()) {
                await fs.rm(backupPath, { recursive: true });
            } else {
                await fs.unlink(backupPath);
            }
            
            return { success: true };
        } catch (error) {
            console.error('❌ Ошибка удаления бэкапа:', error);
            throw error;
        }
    }
    
    /**
     * Очистка старых бэкапов (ротация)
     */
    async cleanupOldBackups() {
        try {
            const backups = await this.listBackups('full');
            const now = new Date();
            
            // Группируем по типу (daily, weekly, monthly)
            const daily = [];
            const weekly = [];
            const monthly = [];
            
            for (const backup of backups) {
                const backupDate = new Date(backup.timestamp);
                const daysDiff = (now - backupDate) / (1000 * 60 * 60 * 24);
                
                if (daysDiff < 7) {
                    daily.push(backup);
                } else if (daysDiff < 30) {
                    weekly.push(backup);
                } else {
                    monthly.push(backup);
                }
            }
            
            // Удаляем лишние бэкапы
            let deleted = 0;
            
            // Ежедневные (оставляем последние 7)
            if (daily.length > this.retentionPolicy.daily) {
                daily.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                const toDelete = daily.slice(this.retentionPolicy.daily);
                for (const backup of toDelete) {
                    await this.deleteBackup(backup.id);
                    deleted++;
                }
            }
            
            // Еженедельные (оставляем последние 4)
            if (weekly.length > this.retentionPolicy.weekly) {
                weekly.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                const toDelete = weekly.slice(this.retentionPolicy.weekly);
                for (const backup of toDelete) {
                    await this.deleteBackup(backup.id);
                    deleted++;
                }
            }
            
            // Месячные (оставляем последние 12)
            if (monthly.length > this.retentionPolicy.monthly) {
                monthly.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                const toDelete = monthly.slice(this.retentionPolicy.monthly);
                for (const backup of toDelete) {
                    await this.deleteBackup(backup.id);
                    deleted++;
                }
            }
            
            return { deleted };
            
        } catch (error) {
            console.error('❌ Ошибка очистки старых бэкапов:', error);
            throw error;
        }
    }
    
    /**
     * Запуск автоматических бэкапов
     */
    startScheduledBackups() {
        // Ежедневный бэкап в 2:00
        this.schedule.daily = setInterval(async () => {
            const hour = new Date().getHours();
            if (hour === 2) {
                try {
                    await this.createFullBackup({ type: 'daily', description: 'Автоматический ежедневный бэкап' });
                } catch (error) {
                    console.error('❌ Ошибка ежедневного бэкапа:', error);
                }
            }
        }, 60 * 60 * 1000); // Проверяем каждый час
        
        // Еженедельный бэкап в воскресенье в 3:00
        this.schedule.weekly = setInterval(async () => {
            const now = new Date();
            if (now.getDay() === 0 && now.getHours() === 3) {
                try {
                    await this.createFullBackup({ type: 'weekly', description: 'Автоматический еженедельный бэкап' });
                } catch (error) {
                    console.error('❌ Ошибка еженедельного бэкапа:', error);
                }
            }
        }, 60 * 60 * 1000);
        
        // Месячный бэкап 1-го числа в 4:00
        this.schedule.monthly = setInterval(async () => {
            const now = new Date();
            if (now.getDate() === 1 && now.getHours() === 4) {
                try {
                    await this.createFullBackup({ type: 'monthly', description: 'Автоматический месячный бэкап' });
                } catch (error) {
                    console.error('❌ Ошибка месячного бэкапа:', error);
                }
            }
        }, 60 * 60 * 1000);
        
    }
    
    /**
     * Остановка автоматических бэкапов
     */
    stopScheduledBackups() {
        if (this.schedule.daily) {
            clearInterval(this.schedule.daily);
            this.schedule.daily = null;
        }
        if (this.schedule.weekly) {
            clearInterval(this.schedule.weekly);
            this.schedule.weekly = null;
        }
        if (this.schedule.monthly) {
            clearInterval(this.schedule.monthly);
            this.schedule.monthly = null;
        }
    }
    
    /**
     * Отправка уведомления о бэкапе
     */
    async sendBackupNotification(backupInfo, status) {
        try {
            if (OptimizedTelegramService && OptimizedTelegramService.isInitialized) {
                const emoji = status === 'success' ? '✅' : '❌';
                const message = status === 'success' 
                    ? `${emoji} <b>БЭКАП СОЗДАН</b>\n\n📦 ID: ${backupInfo.id}\n⏰ Время: ${new Date(backupInfo.timestamp).toLocaleString('ru-RU')}\n📊 Тип: ${backupInfo.type || 'manual'}`
                    : `${emoji} <b>ОШИБКА БЭКАПА</b>\n\n📦 ID: ${backupInfo.id}\n❌ Ошибка: ${backupInfo.error}`;
                
                await OptimizedTelegramService.sendAlert('BACKUP', message, status === 'success' ? 'info' : 'error');
            }
        } catch (error) {
            LoggerService.warn('Не удалось отправить уведомление о бэкапе', {
                service: 'BackupService',
                error: {
                    message: error.message
                }
            });
        }
    }
    
    /**
     * Экспорт данных в различных форматах
     */
    
    /**
     * Экспорт настроек в JSON
     */
    async exportSettings(format = 'json') {
        try {
            const settings = await Settings.findAll({ raw: true });
            const exportData = {
                version: '1.0',
                exportDate: new Date().toISOString(),
                count: settings.length,
                settings: settings.map(s => ({
                    key: s.key,
                    value: s.value,
                    description: s.description,
                    category: s.category,
                    isEditable: s.isEditable,
                    dataType: s.dataType,
                    minValue: s.minValue,
                    maxValue: s.maxValue,
                    options: s.options
                }))
            };
            
            if (format === 'json') {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const fileName = `settings_export_${timestamp}.json`;
                const filePath = path.join(this.exportDir, fileName);
                
                await fs.mkdir(this.exportDir, { recursive: true });
                await fs.writeFile(filePath, JSON.stringify(exportData, null, 2), 'utf-8');
                
                const stats = await fs.stat(filePath);
                return {
                    success: true,
                    file: fileName,
                    path: filePath,
                    size: stats.size,
                    format: 'json',
                    count: settings.length,
                    timestamp: new Date().toISOString()
                };
            }
            
            throw new Error(`Неподдерживаемый формат экспорта: ${format}`);
        } catch (error) {
            LoggerService.error('Ошибка экспорта настроек', {
                service: 'BackupService',
                operation: 'exportSettings',
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
            throw error;
        }
    }
    
    /**
     * Экспорт портфеля в JSON или CSV
     */
    async exportPortfolio(portfolioType = 'virtual', format = 'json') {
        try {
            const Portfolio = portfolioType === 'real' ? RealPortfolio : VirtualPortfolio;
            const portfolio = await Portfolio.findOne({ order: [['lastUpdated', 'DESC']] });
            
            if (!portfolio) {
                throw new Error(`Портфель типа ${portfolioType} не найден`);
            }
            
            const portfolioData = portfolio.toJSON();
            const exportData = {
                version: '1.0',
                exportDate: new Date().toISOString(),
                portfolioType,
                portfolio: {
                    cash: portfolioData.cash,
                    positions: portfolioData.positions,
                    totalValue: portfolioData.totalValue,
                    positionsValue: portfolioData.positionsValue,
                    initialCapital: portfolioData.initialCapital,
                    trades: portfolioData.trades || [],
                    lastUpdated: portfolioData.lastUpdated
                }
            };
            
            if (format === 'json') {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const fileName = `portfolio_${portfolioType}_export_${timestamp}.json`;
                const filePath = path.join(this.exportDir, fileName);
                
                await fs.mkdir(this.exportDir, { recursive: true });
                await fs.writeFile(filePath, JSON.stringify(exportData, null, 2), 'utf-8');
                
                const stats = await fs.stat(filePath);
                return {
                    success: true,
                    file: fileName,
                    path: filePath,
                    size: stats.size,
                    format: 'json',
                    portfolioType,
                    timestamp: new Date().toISOString()
                };
            } else if (format === 'csv') {
                // Экспорт позиций в CSV
                const positions = portfolioData.positions || {};
                const csvRows = ['FIGI,Quantity'];
                
                for (const [figi, quantity] of Object.entries(positions)) {
                    csvRows.push(`${figi},${quantity}`);
                }
                
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const fileName = `portfolio_${portfolioType}_positions_${timestamp}.csv`;
                const filePath = path.join(this.exportDir, fileName);
                
                await fs.mkdir(this.exportDir, { recursive: true });
                await fs.writeFile(filePath, csvRows.join('\n'), 'utf-8');
                
                const stats = await fs.stat(filePath);
                return {
                    success: true,
                    file: fileName,
                    path: filePath,
                    size: stats.size,
                    format: 'csv',
                    portfolioType,
                    positionsCount: Object.keys(positions).length,
                    timestamp: new Date().toISOString()
                };
            }
            
            throw new Error(`Неподдерживаемый формат экспорта: ${format}`);
        } catch (error) {
            LoggerService.error('Ошибка экспорта портфеля', {
                service: 'BackupService',
                operation: 'exportPortfolio',
                portfolioType,
                format,
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
            throw error;
        }
    }
    
    /**
     * Экспорт истории сделок
     */
    async exportTrades(format = 'json', filters = {}) {
        try {
            const { Op } = await import('sequelize');
            const where = {};
            if (filters.startDate) {
                where.createdAt = { ...where.createdAt, [Op.gte]: new Date(filters.startDate) };
            }
            if (filters.endDate) {
                where.createdAt = { ...where.createdAt, [Op.lte]: new Date(filters.endDate) };
            }
            if (filters.action) {
                where.action = filters.action;
            }
            
            const trades = await TradingRequest.findAll({
                where,
                order: [['createdAt', 'DESC']],
                raw: true
            });
            
            const exportData = {
                version: '1.0',
                exportDate: new Date().toISOString(),
                count: trades.length,
                filters,
                trades: trades.map(t => ({
                    id: t.id,
                    recommendationId: t.recommendationId,
                    strategyId: t.strategyId,
                    figi: t.figi,
                    ticker: t.ticker,
                    name: t.name,
                    action: t.action,
                    quantity: t.quantity,
                    price: t.price,
                    totalAmount: t.totalAmount,
                    status: t.status,
                    executedAt: t.executedAt,
                    createdAt: t.createdAt,
                    updatedAt: t.updatedAt
                }))
            };
            
            if (format === 'json') {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const fileName = `trades_export_${timestamp}.json`;
                const filePath = path.join(this.exportDir, fileName);
                
                await fs.mkdir(this.exportDir, { recursive: true });
                await fs.writeFile(filePath, JSON.stringify(exportData, null, 2), 'utf-8');
                
                const stats = await fs.stat(filePath);
                return {
                    success: true,
                    file: fileName,
                    path: filePath,
                    size: stats.size,
                    format: 'json',
                    count: trades.length,
                    timestamp: new Date().toISOString()
                };
            } else if (format === 'csv') {
                const csvRows = ['ID,FIGI,Ticker,Name,Action,Quantity,Price,TotalAmount,Status,ExecutedAt,CreatedAt'];
                
                for (const trade of trades) {
                    csvRows.push([
                        trade.id,
                        trade.figi,
                        trade.ticker,
                        `"${trade.name}"`,
                        trade.action,
                        trade.quantity,
                        trade.price,
                        trade.totalAmount,
                        trade.status,
                        trade.executedAt || '',
                        trade.createdAt
                    ].join(','));
                }
                
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const fileName = `trades_export_${timestamp}.csv`;
                const filePath = path.join(this.exportDir, fileName);
                
                await fs.mkdir(this.exportDir, { recursive: true });
                await fs.writeFile(filePath, csvRows.join('\n'), 'utf-8');
                
                const stats = await fs.stat(filePath);
                return {
                    success: true,
                    file: fileName,
                    path: filePath,
                    size: stats.size,
                    format: 'csv',
                    count: trades.length,
                    timestamp: new Date().toISOString()
                };
            }
            
            throw new Error(`Неподдерживаемый формат экспорта: ${format}`);
        } catch (error) {
            LoggerService.error('Ошибка экспорта сделок', {
                service: 'BackupService',
                operation: 'exportTrades',
                format,
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
            throw error;
        }
    }
    
    /**
     * Экспорт метрик и статистики
     */
    async exportMetrics(format = 'json') {
        try {
            const MonitoringService = (await import('./MonitoringService.js')).default;
            const metrics = MonitoringService.getMetrics();
            const performance = MonitoringService.getPerformanceStats();
            const health = MonitoringService.getHealthStatus();
            
            const exportData = {
                version: '1.0',
                exportDate: new Date().toISOString(),
                metrics: {
                    application: metrics.application,
                    database: metrics.database,
                    neuralNetwork: metrics.neuralNetwork,
                    cache: metrics.cache,
                    system: metrics.system
                },
                performance,
                health
            };
            
            if (format === 'json') {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const fileName = `metrics_export_${timestamp}.json`;
                const filePath = path.join(this.exportDir, fileName);
                
                await fs.mkdir(this.exportDir, { recursive: true });
                await fs.writeFile(filePath, JSON.stringify(exportData, null, 2), 'utf-8');
                
                const stats = await fs.stat(filePath);
                return {
                    success: true,
                    file: fileName,
                    path: filePath,
                    size: stats.size,
                    format: 'json',
                    timestamp: new Date().toISOString()
                };
            }
            
            throw new Error(`Неподдерживаемый формат экспорта: ${format}`);
        } catch (error) {
            LoggerService.error('Ошибка экспорта метрик', {
                service: 'BackupService',
                operation: 'exportMetrics',
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
            throw error;
        }
    }
    
    /**
     * Импорт данных с валидацией
     */
    
    /**
     * Предпросмотр импортируемых данных
     */
    async previewImport(filePath, dataType) {
        try {
            const fileContent = await fs.readFile(filePath, 'utf-8');
            let data;
            
            if (filePath.endsWith('.json')) {
                data = JSON.parse(fileContent);
            } else if (filePath.endsWith('.csv')) {
                // Парсинг CSV для предпросмотра
                const lines = fileContent.split('\n').filter(line => line.trim());
                const headers = lines[0].split(',');
                const rows = lines.slice(1).map(line => {
                    const values = line.split(',');
                    const obj = {};
                    headers.forEach((header, index) => {
                        obj[header.trim()] = values[index]?.trim().replace(/^"|"$/g, '') || '';
                    });
                    return obj;
                });
                data = { rows, count: rows.length };
            } else {
                throw new Error('Неподдерживаемый формат файла');
            }
            
            // Валидация структуры данных
            const validation = this.validateImportData(data, dataType);
            
            return {
                success: true,
                dataType,
                preview: {
                    count: data.count || data.rows?.length || 0,
                    sample: dataType === 'settings' ? data.settings?.slice(0, 5) : 
                           dataType === 'portfolio' ? { positionsCount: Object.keys(data.portfolio?.positions || {}).length } :
                           dataType === 'trades' ? data.trades?.slice(0, 5) : data.rows?.slice(0, 5),
                    structure: this.getDataStructure(data, dataType)
                },
                validation
            };
        } catch (error) {
            LoggerService.error('Ошибка предпросмотра импорта', {
                service: 'BackupService',
                operation: 'previewImport',
                filePath,
                dataType,
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
            throw error;
        }
    }
    
    /**
     * Валидация импортируемых данных
     */
    validateImportData(data, dataType) {
        const errors = [];
        const warnings = [];
        
        if (dataType === 'settings') {
            if (!data.settings || !Array.isArray(data.settings)) {
                errors.push('Отсутствует массив settings');
            } else {
                data.settings.forEach((setting, index) => {
                    if (!setting.key) {
                        errors.push(`Настройка ${index}: отсутствует ключ`);
                    }
                    if (!setting.value) {
                        warnings.push(`Настройка ${index}: отсутствует значение`);
                    }
                    if (setting.dataType && !['string', 'number', 'boolean', 'json', 'array'].includes(setting.dataType)) {
                        errors.push(`Настройка ${index}: неверный dataType`);
                    }
                });
            }
        } else if (dataType === 'portfolio') {
            if (!data.portfolio) {
                errors.push('Отсутствует объект portfolio');
            } else {
                if (typeof data.portfolio.cash !== 'number') {
                    errors.push('portfolio.cash должен быть числом');
                }
                if (!data.portfolio.positions || typeof data.portfolio.positions !== 'object') {
                    errors.push('portfolio.positions должен быть объектом');
                }
            }
        } else if (dataType === 'trades') {
            if (!data.trades || !Array.isArray(data.trades)) {
                errors.push('Отсутствует массив trades');
            } else {
                data.trades.forEach((trade, index) => {
                    if (!trade.figi) {
                        errors.push(`Сделка ${index}: отсутствует figi`);
                    }
                    if (!trade.action || !['BUY', 'SELL'].includes(trade.action)) {
                        errors.push(`Сделка ${index}: неверный action`);
                    }
                    if (!trade.quantity || trade.quantity <= 0) {
                        errors.push(`Сделка ${index}: неверный quantity`);
                    }
                });
            }
        }
        
        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }
    
    /**
     * Получение структуры данных для предпросмотра
     */
    getDataStructure(data, dataType) {
        if (dataType === 'settings' && data.settings && data.settings.length > 0) {
            return Object.keys(data.settings[0]);
        } else if (dataType === 'portfolio' && data.portfolio) {
            return Object.keys(data.portfolio);
        } else if (dataType === 'trades' && data.trades && data.trades.length > 0) {
            return Object.keys(data.trades[0]);
        } else if (data.rows && data.rows.length > 0) {
            return Object.keys(data.rows[0]);
        }
        return [];
    }
    
    /**
     * Импорт настроек из JSON
     */
    async importSettings(filePath, options = {}) {
        try {
            const { preview = false, overwrite = false } = options;
            
            const fileContent = await fs.readFile(filePath, 'utf-8');
            const data = JSON.parse(fileContent);
            
            // Валидация
            const validation = this.validateImportData(data, 'settings');
            if (!validation.valid) {
                throw new Error(`Ошибки валидации: ${validation.errors.join(', ')}`);
            }
            
            if (preview) {
                return {
                    success: true,
                    preview: true,
                    count: data.settings.length,
                    validation
                };
            }
            
            // Импорт
            let imported = 0;
            let updated = 0;
            let skipped = 0;
            
            for (const setting of data.settings) {
                const existing = await Settings.findOne({ where: { key: setting.key } });
                
                if (existing) {
                    if (overwrite) {
                        await existing.update({
                            value: setting.value,
                            description: setting.description,
                            category: setting.category,
                            isEditable: setting.isEditable,
                            dataType: setting.dataType,
                            minValue: setting.minValue,
                            maxValue: setting.maxValue,
                            options: setting.options
                        });
                        updated++;
                    } else {
                        skipped++;
                    }
                } else {
                    await Settings.create({
                        key: setting.key,
                        value: setting.value,
                        description: setting.description,
                        category: setting.category,
                        isEditable: setting.isEditable,
                        dataType: setting.dataType,
                        minValue: setting.minValue,
                        maxValue: setting.maxValue,
                        options: setting.options
                    });
                    imported++;
                }
            }
            
            return {
                success: true,
                imported,
                updated,
                skipped,
                total: data.settings.length
            };
        } catch (error) {
            LoggerService.error('Ошибка импорта настроек', {
                service: 'BackupService',
                operation: 'importSettings',
                filePath,
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
            throw error;
        }
    }
    
    /**
     * Импорт портфеля из CSV
     */
    async importPortfolio(filePath, portfolioType = 'virtual', options = {}) {
        try {
            const { preview = false } = options;
            
            const fileContent = await fs.readFile(filePath, 'utf-8');
            const lines = fileContent.split('\n').filter(line => line.trim());
            
            if (lines.length < 2) {
                throw new Error('CSV файл должен содержать заголовок и хотя бы одну строку данных');
            }
            
            const headers = lines[0].split(',').map(h => h.trim());
            const positions = {};
            
            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',');
                const row = {};
                headers.forEach((header, index) => {
                    row[header] = values[index]?.trim().replace(/^"|"$/g, '') || '';
                });
                
                if (row.FIGI && row.Quantity) {
                    positions[row.FIGI] = parseFloat(row.Quantity) || 0;
                }
            }
            
            if (preview) {
                return {
                    success: true,
                    preview: true,
                    positionsCount: Object.keys(positions).length,
                    sample: Object.entries(positions).slice(0, 5)
                };
            }
            
            // Импорт в портфель
            const Portfolio = portfolioType === 'real' ? RealPortfolio : VirtualPortfolio;
            const portfolio = await Portfolio.findOne({ order: [['lastUpdated', 'DESC']] });
            
            if (!portfolio) {
                throw new Error(`Портфель типа ${portfolioType} не найден`);
            }
            
            // Обновляем позиции
            await portfolio.update({
                positions: { ...portfolio.positions, ...positions }
            });
            
            return {
                success: true,
                imported: Object.keys(positions).length,
                portfolioType
            };
        } catch (error) {
            LoggerService.error('Ошибка импорта портфеля', {
                service: 'BackupService',
                operation: 'importPortfolio',
                filePath,
                portfolioType,
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
            throw error;
        }
    }
    
    /**
     * Скачивание бэкапа (создание ZIP архива)
     * @param {string} backupId - ID бэкапа
     * @returns {Promise<Object>} Информация о созданном архиве
     */
    async downloadBackup(backupId) {
        try {
            const backupInfo = await this.getBackupInfo(backupId);
            const backupPath = backupInfo.path;
            
            // Проверяем, что бэкап существует
            const stat = await fs.stat(backupPath);
            if (!stat.isDirectory() && !stat.isFile()) {
                throw new Error(`Backup ${backupId} is not a valid file or directory`);
            }
            
            // Создаем ZIP архив
            const archiverModule = await import('archiver');
            const archiver = archiverModule.default;
            const fsModule = await import('fs');
            const { createWriteStream } = fsModule;
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const zipFileName = `backup_${backupId}_${timestamp}.zip`;
            const zipPath = path.join(this.exportDir, zipFileName);
            
            await fs.mkdir(this.exportDir, { recursive: true });
            
            // Вычисляем оригинальный размер заранее
            const originalSize = stat.isDirectory() ? await this.getDirectorySize(backupPath) : stat.size;
            
            return new Promise((resolve, reject) => {
                const output = createWriteStream(zipPath);
                const archive = archiver('zip', {
                    zlib: { level: 9 } // Максимальное сжатие
                });
                
                output.on('close', async () => {
                    try {
                        const stats = await fs.stat(zipPath);
                        const compressionRatio = originalSize > 0 
                            ? (((originalSize - stats.size) / originalSize) * 100).toFixed(2)
                            : '0.00';
                        
                        resolve({
                            success: true,
                            file: zipFileName,
                            path: zipPath,
                            size: stats.size,
                            originalSize,
                            compressionRatio: `${compressionRatio}%`,
                            timestamp: new Date().toISOString(),
                            backupId
                        });
                    } catch (error) {
                        reject(error);
                    }
                });
                
                archive.on('error', (err) => {
                    reject(err);
                });
                
                archive.pipe(output);
                
                if (stat.isDirectory()) {
                    // Добавляем всю директорию в архив
                    archive.directory(backupPath, false);
                } else {
                    // Добавляем файл в архив
                    archive.file(backupPath, { name: path.basename(backupPath) });
                }
                
                archive.finalize();
            });
        } catch (error) {
            LoggerService.error('Ошибка создания архива бэкапа', {
                service: 'BackupService',
                operation: 'downloadBackup',
                backupId,
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
            throw error;
        }
    }
    
    /**
     * Загрузка бэкапа из ZIP архива
     * @param {string} zipFilePath - Путь к ZIP файлу
     * @param {Object} options - Опции восстановления
     * @returns {Promise<Object>} Результат загрузки и восстановления
     */
    async uploadBackup(zipFilePath, options = {}) {
        const { extractTo = null, restore = true, components = ['database', 'settings', 'models'] } = options;
        
        try {
            // Проверяем, что файл существует
            await fs.access(zipFilePath);
            
            // Создаем временную директорию для распаковки
            const extractDir = extractTo || path.join(this.backupDir, 'uploads', `extracted_${Date.now()}`);
            await fs.mkdir(extractDir, { recursive: true });
            
            // Распаковываем ZIP архив
            const yauzl = (await import('yauzl')).default;
            
            // Сохраняем extractDir в переменную для использования в замыкании
            const extractDirectory = extractDir;
            
            return new Promise((resolve, reject) => {
                yauzl.open(zipFilePath, { lazyEntries: true }, async (err, zipfile) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    const extractedFiles = [];
                    
                    zipfile.readEntry();
                    
                    zipfile.on('entry', (entry) => {
                        if (/\/$/.test(entry.fileName)) {
                            // Директория - создаем её
                            const dirPath = path.join(extractDirectory, entry.fileName);
                            fs.mkdir(dirPath, { recursive: true }).then(() => {
                                zipfile.readEntry();
                            }).catch(reject);
                        } else {
                            // Файл - извлекаем
                            zipfile.openReadStream(entry, (err, readStream) => {
                                if (err) {
                                    reject(err);
                                    return;
                                }
                                
                                const filePath = path.join(extractDirectory, entry.fileName);
                                
                                // Создаем директорию для файла
                                fs.mkdir(path.dirname(filePath), { recursive: true }).then(() => {
                                    // Импортируем fs синхронно для создания потока записи
                                    import('fs').then(fsModule => {
                                        const writeStream = fsModule.createWriteStream(filePath);
                                        readStream.pipe(writeStream);
                                        
                                        writeStream.on('close', () => {
                                            extractedFiles.push(filePath);
                                            zipfile.readEntry();
                                        });
                                        
                                        writeStream.on('error', reject);
                                    }).catch(reject);
                                }).catch(reject);
                            });
                        }
                    });
                    
                    zipfile.on('end', async () => {
                        try {
                            // Ищем metadata.json для определения типа бэкапа
                            const metadataPath = path.join(extractDirectory, 'metadata.json');
                            let backupInfo = null;
                            
                            try {
                                const metadataContent = await fs.readFile(metadataPath, 'utf-8');
                                backupInfo = JSON.parse(metadataContent);
                            } catch {
                                // Если нет metadata.json, ищем файлы бэкапа
                                const files = await fs.readdir(extractDirectory);
                                const dbBackup = files.find(f => f.startsWith('db_') && f.endsWith('.json'));
                                const settingsBackup = files.find(f => f.startsWith('settings_') && f.endsWith('.json'));
                                
                                if (dbBackup || settingsBackup) {
                                    backupInfo = {
                                        id: `uploaded_${Date.now()}`,
                                        type: 'uploaded',
                                        timestamp: new Date().toISOString(),
                                        components: {}
                                    };
                                    
                                    if (dbBackup) {
                                        backupInfo.components.database = {
                                            path: path.join(extractDirectory, dbBackup),
                                            file: dbBackup
                                        };
                                    }
                                    
                                    if (settingsBackup) {
                                        backupInfo.components.settings = {
                                            path: path.join(extractDirectory, settingsBackup),
                                            file: settingsBackup
                                        };
                                    }
                                }
                            }
                            
                            const result = {
                                success: true,
                                extractedDir: extractDirectory,
                                extractedFiles: extractedFiles.length,
                                backupInfo,
                                timestamp: new Date().toISOString()
                            };
                            
                            // Если нужно восстановить бэкап
                            if (restore && backupInfo) {
                                try {
                                    const restoreResult = await this.restoreBackupFromPath(extractDirectory, backupInfo, { components });
                                    result.restore = restoreResult;
                                } catch (restoreError) {
                                    result.restore = {
                                        success: false,
                                        error: restoreError.message
                                    };
                                }
                            }
                            
                            resolve(result);
                        } catch (error) {
                            reject(error);
                        }
                    });
                    
                    zipfile.on('error', reject);
                });
            });
        } catch (error) {
            LoggerService.error('Ошибка загрузки бэкапа', {
                service: 'BackupService',
                operation: 'uploadBackup',
                zipFilePath,
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
            throw error;
        }
    }
    
    /**
     * Восстановление бэкапа из распакованной директории
     * @param {string} extractDir - Директория с распакованными файлами
     * @param {Object} backupInfo - Информация о бэкапе
     * @param {Object} options - Опции восстановления
     * @returns {Promise<Object>} Результат восстановления
     */
    async restoreBackupFromPath(extractDir, backupInfo, options = {}) {
        const { components = ['database', 'settings', 'models'] } = options;
        
        const results = {
            timestamp: new Date().toISOString(),
            components: {}
        };
        
        // Восстановление компонентов
        if (components.includes('database') && backupInfo.components?.database) {
            try {
                const dbPath = backupInfo.components.database.path || path.join(extractDir, backupInfo.components.database.file);
                await this.restoreDatabase(dbPath);
                results.components.database = { success: true };
            } catch (error) {
                results.components.database = { success: false, error: error.message };
            }
        }
        
        if (components.includes('settings') && backupInfo.components?.settings) {
            try {
                const settingsPath = backupInfo.components.settings.path || path.join(extractDir, backupInfo.components.settings.file);
                await this.restoreSettings(settingsPath);
                results.components.settings = { success: true };
            } catch (error) {
                results.components.settings = { success: false, error: error.message };
            }
        }
        
        if (components.includes('models') && backupInfo.components?.models) {
            try {
                const modelsPath = backupInfo.components.models.path || path.join(extractDir, backupInfo.components.models.directory);
                await this.restoreModels(modelsPath);
                results.components.models = { success: true };
            } catch (error) {
                results.components.models = { success: false, error: error.message };
            }
        }
        
        return results;
    }
}

export default new BackupService();

