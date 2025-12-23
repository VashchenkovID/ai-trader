/**
 * Трекер инициализации сервисов
 * Отслеживает, какие сервисы уже инициализированы в основном процессе
 * Использует файловую систему для синхронизации между процессами
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Путь к файлу с информацией об инициализации
const INIT_TRACKER_FILE = path.join(__dirname, '../../.service-init-tracker.json');
const INIT_TIMEOUT = 30000; // 30 секунд - время жизни записи об инициализации

class ServiceInitializationTracker {
    constructor() {
        this.localInitialized = new Set(); // Локально инициализированные сервисы в текущем процессе
        this.initPromise = null;
    }

    /**
     * Инициализация трекера (создание файла если нужно)
     */
    async initialize() {
        try {
            await fs.mkdir(path.dirname(INIT_TRACKER_FILE), { recursive: true });
            // Проверяем существование файла
            try {
                await fs.access(INIT_TRACKER_FILE);
            } catch {
                // Файл не существует, создаем пустой
                await fs.writeFile(INIT_TRACKER_FILE, JSON.stringify({ services: {}, pid: process.pid }), 'utf8');
            }
        } catch (error) {
            console.warn('⚠️ Failed to initialize ServiceInitializationTracker:', error.message);
        }
    }

    /**
     * Безопасное чтение JSON файла с retry логикой
     */
    async safeReadJSON(maxRetries = 3, retryDelay = 50) {
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                // Проверяем существование файла
                try {
                    await fs.access(INIT_TRACKER_FILE);
                } catch {
                    // Файл не существует
                    return { services: {}, pid: process.pid };
                }

                // Читаем файл
                const data = await fs.readFile(INIT_TRACKER_FILE, 'utf8');
                
                // Проверяем, что файл не пустой
                if (!data || data.trim().length === 0) {
                    if (attempt < maxRetries - 1) {
                        await new Promise(resolve => setTimeout(resolve, retryDelay));
                        continue;
                    }
                    return { services: {}, pid: process.pid };
                }

                // Пытаемся распарсить JSON
                try {
                    const parsed = JSON.parse(data);
                    // Проверяем структуру
                    if (parsed && typeof parsed === 'object' && parsed.services) {
                        return parsed;
                    }
                    // Неправильная структура - возвращаем пустой объект
                    return { services: {}, pid: process.pid };
                } catch (parseError) {
                    // JSON поврежден
                    if (attempt < maxRetries - 1) {
                        // Ждем немного и пробуем снова (возможно файл еще пишется)
                        await new Promise(resolve => setTimeout(resolve, retryDelay));
                        continue;
                    }
                    // После всех попыток - восстанавливаем файл
                    console.warn(`⚠️ JSON file corrupted, recreating: ${parseError.message}`);
                    const freshTracker = { services: {}, pid: process.pid };
                    await fs.writeFile(INIT_TRACKER_FILE, JSON.stringify(freshTracker, null, 2), 'utf8');
                    return freshTracker;
                }
            } catch (error) {
                if (attempt < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    continue;
                }
                // После всех попыток возвращаем пустой объект
                console.warn(`⚠️ Failed to read tracker file after ${maxRetries} attempts:`, error.message);
                return { services: {}, pid: process.pid };
            }
        }
        return { services: {}, pid: process.pid };
    }

    /**
     * Проверяет, инициализирован ли сервис глобально (в основном процессе)
     */
    async isServiceInitializedGlobally(serviceName) {
        try {
            // Проверяем локальный кэш
            if (this.localInitialized.has(serviceName)) {
                return true;
            }

            // Безопасно читаем файл трекера
            const tracker = await this.safeReadJSON();
            
            const serviceInfo = tracker.services[serviceName];
            if (!serviceInfo) {
                return false;
            }

            // Проверяем, не истекло ли время жизни записи
            const now = Date.now();
            if (now - serviceInfo.timestamp > INIT_TIMEOUT) {
                // Запись устарела, удаляем её
                delete tracker.services[serviceName];
                await fs.writeFile(INIT_TRACKER_FILE, JSON.stringify(tracker, null, 2), 'utf8');
                return false;
            }

            // Проверяем, не завершился ли процесс, который инициализировал сервис
            // (простая проверка - если PID не совпадает с текущим, считаем что процесс может быть завершен)
            // В production можно добавить более сложную проверку через process list
            if (serviceInfo.pid !== process.pid) {
                // Это другой процесс, но запись еще свежая - считаем что сервис инициализирован
                return true;
            }

            return true;
        } catch (error) {
            // Если не удалось прочитать файл, считаем что сервис не инициализирован
            console.warn(`⚠️ Failed to check global initialization for ${serviceName}:`, error.message);
            return false;
        }
    }

    /**
     * Отмечает сервис как инициализированный глобально
     */
    async markServiceInitialized(serviceName) {
        try {
            // Добавляем в локальный кэш
            this.localInitialized.add(serviceName);

            // Безопасно читаем текущий трекер
            const tracker = await this.safeReadJSON();

            // Обновляем информацию о сервисе
            tracker.services[serviceName] = {
                timestamp: Date.now(),
                pid: process.pid
            };

            // Сохраняем обратно атомарно (создаем временный файл, затем переименовываем)
            const tempFile = INIT_TRACKER_FILE + '.tmp';
            await fs.writeFile(tempFile, JSON.stringify(tracker, null, 2), 'utf8');
            try {
                await fs.rename(tempFile, INIT_TRACKER_FILE);
            } catch (renameError) {
                // На Windows rename может не работать, если файл открыт - используем copy + delete
                try {
                    await fs.copyFile(tempFile, INIT_TRACKER_FILE);
                    await fs.unlink(tempFile);
                } catch (copyError) {
                    // Если и это не сработало, просто перезаписываем напрямую
                    await fs.writeFile(INIT_TRACKER_FILE, JSON.stringify(tracker, null, 2), 'utf8');
                    try {
                        await fs.unlink(tempFile);
                    } catch {
                        // Игнорируем ошибку удаления временного файла
                    }
                }
            }
        } catch (error) {
            console.warn(`⚠️ Failed to mark ${serviceName} as initialized:`, error.message);
        }
    }

    /**
     * Отмечает сервис как не инициализированный (при остановке)
     */
    async markServiceUninitialized(serviceName) {
        try {
            // Удаляем из локального кэша
            this.localInitialized.delete(serviceName);

            // Безопасно читаем текущий трекер
            const tracker = await this.safeReadJSON();
            
            // Удаляем информацию о сервисе
            delete tracker.services[serviceName];
            
            // Сохраняем обратно атомарно
            const tempFile = INIT_TRACKER_FILE + '.tmp';
            await fs.writeFile(tempFile, JSON.stringify(tracker, null, 2), 'utf8');
            try {
                await fs.rename(tempFile, INIT_TRACKER_FILE);
            } catch (renameError) {
                // На Windows rename может не работать, если файл открыт - используем copy + delete
                try {
                    await fs.copyFile(tempFile, INIT_TRACKER_FILE);
                    await fs.unlink(tempFile);
                } catch (copyError) {
                    // Если и это не сработало, просто перезаписываем напрямую
                    await fs.writeFile(INIT_TRACKER_FILE, JSON.stringify(tracker, null, 2), 'utf8');
                    try {
                        await fs.unlink(tempFile);
                    } catch {
                        // Игнорируем ошибку удаления временного файла
                    }
                }
            }
        } catch (error) {
            // Файл не существует или поврежден - это нормально
        }
    }

    /**
     * Очищает все записи об инициализации (при остановке процесса)
     */
    async clearAll() {
        try {
            this.localInitialized.clear();
            const tracker = { services: {}, pid: process.pid };
            await fs.writeFile(INIT_TRACKER_FILE, JSON.stringify(tracker, null, 2), 'utf8');
        } catch (error) {
            console.warn('⚠️ Failed to clear initialization tracker:', error.message);
        }
    }

    /**
     * Очищает устаревшие записи
     */
    async cleanup() {
        try {
            const tracker = await this.safeReadJSON();
            const now = Date.now();
            let hasChanges = false;

            for (const [serviceName, serviceInfo] of Object.entries(tracker.services)) {
                if (now - serviceInfo.timestamp > INIT_TIMEOUT) {
                    delete tracker.services[serviceName];
                    hasChanges = true;
                }
            }

            if (hasChanges) {
                const tempFile = INIT_TRACKER_FILE + '.tmp';
                await fs.writeFile(tempFile, JSON.stringify(tracker, null, 2), 'utf8');
                await fs.rename(tempFile, INIT_TRACKER_FILE);
            }
        } catch (error) {
            // Игнорируем ошибки при очистке
        }
    }
}

// Создаем единственный экземпляр
const tracker = new ServiceInitializationTracker();

// Инициализируем при загрузке модуля
tracker.initialize().catch(err => {
    console.warn('⚠️ Failed to initialize ServiceInitializationTracker:', err.message);
});

// Периодическая очистка устаревших записей
setInterval(() => {
    tracker.cleanup().catch(() => {});
}, 60000); // Каждую минуту

// Очистка при завершении процесса
process.on('exit', () => {
    tracker.clearAll().catch(() => {});
});

process.on('SIGINT', () => {
    tracker.clearAll().catch(() => {});
    process.exit(0);
});

process.on('SIGTERM', () => {
    tracker.clearAll().catch(() => {});
    process.exit(0);
});

export default tracker;

