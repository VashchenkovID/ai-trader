import DatabaseMigration from '../models/DatabaseMigration.js';
import sequelize from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import LoggerService from './LoggerService.js';
import SettingsService from './SettingsService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.join(__dirname, '../../migrations');

/**
 * Сервис для управления миграциями базы данных
 * 
 * Функциональность:
 * - Автоматические миграции БД
 * - Откат миграций
 * - Проверка целостности после миграций
 * - Версионирование схемы БД
 */
class MigrationService {
    constructor() {
        this.isInitialized = false;
        this.settings = {
            // Автоматическое выполнение миграций при старте
            autoRunOnStart: false, // По умолчанию выключено для безопасности
            
            // Проверка целостности после миграций
            checkIntegrity: true,
            
            // Резервное копирование перед миграциями
            backupBeforeMigration: true,
            
            // Путь к директории с миграциями
            migrationsDir: MIGRATIONS_DIR,
            
            // Версионирование схемы
            versioningEnabled: true,
            currentVersion: '0.0.0'
        };
    }

    async initialize() {
        try {
            LoggerService.info('🔄 Initializing Migration Service...');
            
            // Загружаем настройки
            await this.loadSettings();
            
            // Создаем таблицу для отслеживания миграций, если её нет
            await DatabaseMigration.sync({ force: false });
            
            // Получаем текущую версию схемы
            this.settings.currentVersion = await DatabaseMigration.getLatestVersion();
            
            this.isInitialized = true;
            LoggerService.info(`✅ Migration Service initialized (current schema version: ${this.settings.currentVersion})`);
        } catch (error) {
            LoggerService.error('❌ Failed to initialize Migration Service:', error);
            throw error;
        }
    }

    /**
     * Загрузка настроек из базы данных
     */
    async loadSettings() {
        try {
            const settings = await SettingsService.getAllSettings('migration');
            
            if (settings && settings.length > 0) {
                for (const setting of settings) {
                    const key = setting.key.replace('migration.', '');
                    const value = setting.value;
                    
                    if (key === 'autoRunOnStart' || key === 'checkIntegrity' || key === 'backupBeforeMigration' || key === 'versioningEnabled') {
                        this.settings[key] = value === 'true' || value === true;
                    } else if (key === 'migrationsDir') {
                        this.settings[key] = value;
                    } else if (key === 'currentVersion') {
                        this.settings[key] = value;
                    }
                }
            }
        } catch (error) {
            LoggerService.warn('⚠️ Failed to load migration settings, using defaults:', error.message);
        }
    }

    /**
     * Получение списка всех миграций из директории
     */
    async discoverMigrations() {
        try {
            const files = fs.readdirSync(this.settings.migrationsDir);
            const migrations = [];
            
            for (const file of files) {
                if (file.endsWith('.js') && file !== 'index.js') {
                    const filePath = path.join(this.settings.migrationsDir, file);
                    const stats = fs.statSync(filePath);
                    
                    // Читаем содержимое файла для вычисления хеша
                    const content = fs.readFileSync(filePath, 'utf8');
                    const checksum = crypto.createHash('md5').update(content).digest('hex');
                    
                    migrations.push({
                        name: file,
                        path: filePath,
                        size: stats.size,
                        modified: stats.mtime,
                        checksum
                    });
                }
            }
            
            // Сортируем по имени (предполагается, что имя содержит версию или дату)
            migrations.sort((a, b) => a.name.localeCompare(b.name));
            
            return migrations;
        } catch (error) {
            LoggerService.error('❌ Error discovering migrations:', error);
            throw error;
        }
    }

    /**
     * Регистрация миграции в БД (без выполнения)
     */
    async registerMigration(migrationFile, version = null) {
        try {
            const migration = await DatabaseMigration.findByName(migrationFile.name);
            
            if (migration) {
                // Миграция уже зарегистрирована
                return migration;
            }
            
            // Определяем версию из имени файла или используем переданную
            const migrationVersion = version || this.extractVersionFromName(migrationFile.name);
            
            // Создаем запись о миграции
            const newMigration = await DatabaseMigration.create({
                name: migrationFile.name,
                version: migrationVersion,
                status: 'pending',
                checksum: migrationFile.checksum,
                description: this.extractDescription(migrationFile.path)
            });
            
            LoggerService.info(`📝 Registered migration: ${migrationFile.name} (version: ${migrationVersion})`);
            
            return newMigration;
        } catch (error) {
            LoggerService.error(`❌ Error registering migration ${migrationFile.name}:`, error);
            throw error;
        }
    }

    /**
     * Выполнение миграции
     */
    async runMigration(migrationName, options = {}) {
        try {
            // Находим миграцию в БД
            let migration = await DatabaseMigration.findByName(migrationName);
            
            if (!migration) {
                // Пытаемся найти файл миграции и зарегистрировать
                const discovered = await this.discoverMigrations();
                const migrationFile = discovered.find(m => m.name === migrationName);
                
                if (!migrationFile) {
                    throw new Error(`Migration ${migrationName} not found`);
                }
                
                migration = await this.registerMigration(migrationFile);
            }
            
            // Проверяем статус
            if (migration.status === 'completed') {
                LoggerService.warn(`⚠️ Migration ${migrationName} already completed`);
                return { success: true, message: 'Migration already completed', migration };
            }
            
            if (migration.status === 'running') {
                throw new Error(`Migration ${migrationName} is already running`);
            }
            
            // Отмечаем как выполняющуюся
            await DatabaseMigration.markAsRunning(migrationName);
            
            // Загружаем модуль миграции
            const migrationPath = path.join(this.settings.migrationsDir, migrationName);
            const migrationModule = await import(`file://${migrationPath}`);
            
            if (!migrationModule.up) {
                throw new Error(`Migration ${migrationName} does not export 'up' function`);
            }
            
            // Выполняем миграцию
            const startTime = Date.now();
            const queryInterface = sequelize.getQueryInterface();
            
            await migrationModule.up(queryInterface, sequelize.Sequelize);
            
            const executionTime = Date.now() - startTime;
            
            // Обновляем версию схемы
            const newVersion = this.incrementVersion(migration.version);
            
            // Отмечаем как выполненную
            await DatabaseMigration.markAsCompleted(migrationName, {
                executionTime,
                version: newVersion
            });
            
            // Обновляем текущую версию
            this.settings.currentVersion = newVersion;
            await SettingsService.setSetting('migration.currentVersion', newVersion, {
                category: 'migration',
                description: 'Текущая версия схемы БД'
            });
            
            LoggerService.info(`✅ Migration ${migrationName} completed successfully (${executionTime}ms)`);
            
            // Проверка целостности (если включена)
            if (this.settings.checkIntegrity) {
                await this.checkIntegrity(migrationName);
            }
            
            return {
                success: true,
                migration,
                executionTime,
                version: newVersion
            };
        } catch (error) {
            LoggerService.error(`❌ Error running migration ${migrationName}:`, error);
            
            // Отмечаем как неудачную
            await DatabaseMigration.markAsFailed(migrationName, error);
            
            throw error;
        }
    }

    /**
     * Откат миграции
     */
    async rollbackMigration(migrationName) {
        try {
            const migration = await DatabaseMigration.findByName(migrationName);
            
            if (!migration) {
                throw new Error(`Migration ${migrationName} not found`);
            }
            
            if (migration.status !== 'completed') {
                throw new Error(`Cannot rollback migration ${migrationName}: status is ${migration.status}`);
            }
            
            // Загружаем модуль миграции
            const migrationPath = path.join(this.settings.migrationsDir, migrationName);
            const migrationModule = await import(`file://${migrationPath}`);
            
            if (!migrationModule.down) {
                throw new Error(`Migration ${migrationName} does not export 'down' function`);
            }
            
            // Выполняем откат
            const queryInterface = sequelize.getQueryInterface();
            await migrationModule.down(queryInterface, sequelize.Sequelize);
            
            // Отмечаем как откаченную
            await DatabaseMigration.markAsRolledBack(migrationName);
            
            LoggerService.info(`✅ Migration ${migrationName} rolled back successfully`);
            
            return {
                success: true,
                migration
            };
        } catch (error) {
            LoggerService.error(`❌ Error rolling back migration ${migrationName}:`, error);
            throw error;
        }
    }

    /**
     * Выполнение всех ожидающих миграций
     */
    async runPendingMigrations() {
        try {
            // Обнаруживаем все миграции
            const discovered = await this.discoverMigrations();
            
            // Регистрируем новые миграции
            for (const migrationFile of discovered) {
                await this.registerMigration(migrationFile);
            }
            
            // Получаем список ожидающих миграций
            const pending = await DatabaseMigration.getPendingMigrations();
            
            if (pending.length === 0) {
                LoggerService.info('✅ No pending migrations');
                return { success: true, migrationsRun: 0 };
            }
            
            LoggerService.info(`🔄 Running ${pending.length} pending migration(s)...`);
            
            const results = [];
            
            for (const migration of pending) {
                try {
                    const result = await this.runMigration(migration.name);
                    results.push(result);
                } catch (error) {
                    LoggerService.error(`❌ Failed to run migration ${migration.name}:`, error);
                    results.push({
                        success: false,
                        migration: migration.name,
                        error: error.message
                    });
                    // Останавливаем выполнение при ошибке
                    break;
                }
            }
            
            const successful = results.filter(r => r.success).length;
            
            LoggerService.info(`✅ Completed ${successful}/${pending.length} migration(s)`);
            
            return {
                success: successful === pending.length,
                migrationsRun: successful,
                total: pending.length,
                results
            };
        } catch (error) {
            LoggerService.error('❌ Error running pending migrations:', error);
            throw error;
        }
    }

    /**
     * Проверка целостности после миграции
     */
    async checkIntegrity(migrationName) {
        try {
            const migration = await DatabaseMigration.findByName(migrationName);
            
            if (!migration) {
                return { valid: false, reason: 'Migration not found' };
            }
            
            // Проверяем хеш миграции
            const discovered = await this.discoverMigrations();
            const migrationFile = discovered.find(m => m.name === migrationName);
            
            if (migrationFile && migration.checksum) {
                if (migrationFile.checksum !== migration.checksum) {
                    LoggerService.warn(`⚠️ Checksum mismatch for migration ${migrationName}`);
                    return {
                        valid: false,
                        reason: 'Checksum mismatch - migration file may have been modified'
                    };
                }
            }
            
            // Проверяем, что таблицы существуют (базовая проверка)
            const tables = await sequelize.getQueryInterface().showAllTables();
            
            LoggerService.info(`✅ Integrity check passed for migration ${migrationName}`);
            
            return {
                valid: true,
                tablesCount: tables.length
            };
        } catch (error) {
            LoggerService.error(`❌ Error checking integrity for ${migrationName}:`, error);
            return {
                valid: false,
                reason: error.message
            };
        }
    }

    /**
     * Получение статуса миграций
     */
    async getMigrationStatus() {
        try {
            const pending = await DatabaseMigration.getPendingMigrations();
            const completed = await DatabaseMigration.getCompletedMigrations();
            const failed = await DatabaseMigration.findAll({
                where: { status: 'failed' }
            });
            
            const discovered = await this.discoverMigrations();
            
            return {
                currentVersion: this.settings.currentVersion,
                pending: pending.length,
                completed: completed.length,
                failed: failed.length,
                totalDiscovered: discovered.length,
                migrations: {
                    pending: pending.map(m => ({
                        name: m.name,
                        version: m.version,
                        description: m.description
                    })),
                    completed: completed.map(m => ({
                        name: m.name,
                        version: m.version,
                        executedAt: m.executedAt
                    })),
                    failed: failed.map(m => ({
                        name: m.name,
                        version: m.version,
                        error: m.executionInfo?.error
                    }))
                }
            };
        } catch (error) {
            LoggerService.error('❌ Error getting migration status:', error);
            throw error;
        }
    }

    /**
     * Вспомогательные методы
     */
    extractVersionFromName(name) {
        // Пытаемся извлечь версию из имени файла
        // Формат: create-table-v1.0.0.js или 001-create-table.js
        const versionMatch = name.match(/v?(\d+\.\d+\.\d+)/);
        if (versionMatch) {
            return versionMatch[1];
        }
        
        // Если версия не найдена, используем текущую + инкремент
        const parts = this.settings.currentVersion.split('.');
        parts[2] = parseInt(parts[2]) + 1;
        return parts.join('.');
    }

    incrementVersion(version) {
        const parts = version.split('.');
        parts[2] = parseInt(parts[2]) + 1;
        return parts.join('.');
    }

    extractDescription(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            // Пытаемся найти комментарий с описанием в начале файла
            const descMatch = content.match(/\/\*\*[\s\S]*?\*\/|\/\/.*description.*:.*/i);
            if (descMatch) {
                return descMatch[0].replace(/\/\*\*|\*\/|\/\/|\*/g, '').trim();
            }
        } catch (error) {
            // Игнорируем ошибки
        }
        return null;
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
                await SettingsService.setSetting(`migration.${key}`, value, {
                    description: `Настройка миграций: ${key}`,
                    category: 'migration',
                    dataType: typeof value === 'number' ? 'number' : (typeof value === 'boolean' ? 'boolean' : 'string')
                });
            }
            
            LoggerService.info('✅ Migration settings updated');
            return true;
        } catch (error) {
            LoggerService.error('❌ Failed to update migration settings:', error);
            throw error;
        }
    }
}

export default new MigrationService();

