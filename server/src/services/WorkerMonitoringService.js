import LoggerService from './LoggerService.js';
import { getService } from './GlobalServiceManager.js';

/**
 * Сервис мониторинга воркеров
 * Отслеживает статус, прогресс и историю работы всех воркеров в системе
 */
class WorkerMonitoringService {
    constructor() {
        this.isInitialized = false;
        // Активные воркеры: Map<workerId, workerData>
        this.activeWorkers = new Map();
        // История воркеров: массив для хранения завершенных воркеров
        this.workerHistory = [];
        // Максимальный размер истории в памяти
        this.maxHistorySize = 1000;
        // Счетчик для генерации уникальных ID
        this.workerIdCounter = 0;
        // WebSocket сервис для отправки событий
        this.webSocketService = null;
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            // Получаем WebSocketService для отправки событий (опционально)
            // WebSocketService может быть недоступен при инициализации, получаем его лениво
            this.webSocketService = null;
            this.tryGetWebSocketService();
            
            this.isInitialized = true;
            
            if (LoggerService.isInitialized) {
                LoggerService.info('WorkerMonitoringService initialized', {
                    service: 'WorkerMonitoringService'
                });
            } else {
                console.log('✅ WorkerMonitoringService initialized');
            }
        } catch (error) {
            console.error('Error initializing WorkerMonitoringService:', error);
            throw error;
        }
    }

    /**
     * Попытка получить WebSocketService (ленивая загрузка)
     * @private
     */
    tryGetWebSocketService() {
        if (this.webSocketService) {
            return this.webSocketService;
        }
        
        try {
            this.webSocketService = getService('WebSocketService');
            return this.webSocketService;
        } catch (error) {
            // WebSocketService может быть недоступен - это нормально
            return null;
        }
    }

    /**
     * Генерация уникального ID воркера
     */
    generateWorkerId(type) {
        const timestamp = Date.now();
        const counter = this.workerIdCounter++;
        return `${type}_${timestamp}_${counter}`;
    }

    /**
     * Регистрация нового воркера
     * @param {string} type - Тип воркера (training, analysis, price-update, etc.)
     * @param {string} name - Человекочитаемое имя воркера
     * @param {Object} metadata - Дополнительные метаданные
     * @returns {string} workerId - Уникальный ID воркера
     */
    registerWorker(type, name, metadata = {}) {
        const workerId = this.generateWorkerId(type);
        const now = new Date();

        const workerData = {
            workerId,
            type,
            name,
            status: 'running',
            startTime: now,
            endTime: null,
            duration: 0,
            progress: 0,
            metadata: {
                ...metadata
            },
            resourceUsage: {
                cpu: null,
                memory: null
            },
            createdAt: now,
            updatedAt: now
        };

        this.activeWorkers.set(workerId, workerData);

        // Отправляем событие через WebSocket
        this.broadcastEvent('worker_started', {
            workerId,
            type,
            name,
            metadata
        });

        if (LoggerService.isInitialized) {
            LoggerService.info('Worker registered', {
                service: 'WorkerMonitoringService',
                workerId,
                type,
                name
            });
        }

        return workerId;
    }

    /**
     * Обновление статуса воркера
     * @param {string} workerId - ID воркера
     * @param {Object} updates - Обновления (status, progress, metadata, resourceUsage)
     */
    updateWorkerStatus(workerId, updates = {}) {
        const worker = this.activeWorkers.get(workerId);
        if (!worker) {
            console.warn(`Worker ${workerId} not found for status update`);
            return;
        }

        const previousStatus = worker.status;
        
        // Обновляем данные
        if (updates.status) {
            worker.status = updates.status;
        }
        if (updates.progress !== undefined) {
            worker.progress = Math.max(0, Math.min(100, updates.progress));
        }
        if (updates.metadata) {
            worker.metadata = { ...worker.metadata, ...updates.metadata };
        }
        if (updates.resourceUsage) {
            worker.resourceUsage = { ...worker.resourceUsage, ...updates.resourceUsage };
        }
        
        worker.updatedAt = new Date();
        
        // Если статус изменился, отправляем событие
        if (updates.status && updates.status !== previousStatus) {
            this.broadcastEvent('worker_status_update', {
                workerId,
                status: updates.status,
                previousStatus
            });
        }

        // Отправляем событие прогресса
        if (updates.progress !== undefined) {
            this.broadcastEvent('worker_progress', {
                workerId,
                progress: worker.progress,
                metadata: worker.metadata
            });
        }
    }

    /**
     * Завершение воркера
     * @param {string} workerId - ID воркера
     * @param {boolean} success - Успешность выполнения
     * @param {Object} result - Результат выполнения
     */
    completeWorker(workerId, success = true, result = {}) {
        const worker = this.activeWorkers.get(workerId);
        if (!worker) {
            console.warn(`Worker ${workerId} not found for completion`);
            return;
        }

        const now = new Date();
        worker.status = success ? 'completed' : 'error';
        worker.endTime = now;
        worker.duration = now - worker.startTime;
        worker.progress = 100;
        
        if (result.error) {
            worker.metadata.error = result.error;
        }
        if (result.result) {
            worker.metadata.result = result.result;
        }

        // Перемещаем в историю
        const historyEntry = { ...worker };
        this.workerHistory.unshift(historyEntry);
        
        // Ограничиваем размер истории
        if (this.workerHistory.length > this.maxHistorySize) {
            this.workerHistory = this.workerHistory.slice(0, this.maxHistorySize);
        }

        // Удаляем из активных
        this.activeWorkers.delete(workerId);

        // Отправляем событие
        this.broadcastEvent('worker_completed', {
            workerId,
            success,
            duration: worker.duration,
            result
        });

        if (LoggerService.isInitialized) {
            LoggerService.info('Worker completed', {
                service: 'WorkerMonitoringService',
                workerId,
                type: worker.type,
                name: worker.name,
                success,
                duration: worker.duration
            });
        }
    }

    /**
     * Пауза воркера
     * @param {string} workerId - ID воркера
     */
    pauseWorker(workerId) {
        const worker = this.activeWorkers.get(workerId);
        if (!worker) {
            throw new Error(`Worker ${workerId} not found`);
        }

        if (worker.status !== 'running') {
            throw new Error(`Worker ${workerId} is not running (current status: ${worker.status})`);
        }

        worker.status = 'paused';
        worker.updatedAt = new Date();

        this.broadcastEvent('worker_paused', {
            workerId,
            type: worker.type,
            name: worker.name
        });

        if (LoggerService.isInitialized) {
            LoggerService.info('Worker paused', {
                service: 'WorkerMonitoringService',
                workerId,
                type: worker.type,
                name: worker.name
            });
        }
    }

    /**
     * Возобновление воркера
     * @param {string} workerId - ID воркера
     */
    resumeWorker(workerId) {
        const worker = this.activeWorkers.get(workerId);
        if (!worker) {
            throw new Error(`Worker ${workerId} not found`);
        }

        if (worker.status !== 'paused') {
            throw new Error(`Worker ${workerId} is not paused (current status: ${worker.status})`);
        }

        worker.status = 'running';
        worker.updatedAt = new Date();

        this.broadcastEvent('worker_resumed', {
            workerId,
            type: worker.type,
            name: worker.name
        });

        if (LoggerService.isInitialized) {
            LoggerService.info('Worker resumed', {
                service: 'WorkerMonitoringService',
                workerId,
                type: worker.type,
                name: worker.name
            });
        }
    }

    /**
     * Ошибка воркера
     * @param {string} workerId - ID воркера
     * @param {Error|string} error - Ошибка
     */
    reportWorkerError(workerId, error) {
        const worker = this.activeWorkers.get(workerId);
        if (!worker) {
            console.warn(`Worker ${workerId} not found for error report`);
            return;
        }

        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;

        worker.metadata.error = errorMessage;
        worker.metadata.errorStack = errorStack;
        worker.status = 'error';
        worker.updatedAt = new Date();

        this.broadcastEvent('worker_error', {
            workerId,
            type: worker.type,
            name: worker.name,
            error: errorMessage,
            errorStack
        });

        if (LoggerService.isInitialized) {
            LoggerService.error('Worker error', {
                service: 'WorkerMonitoringService',
                workerId,
                type: worker.type,
                name: worker.name,
                error: errorMessage
            });
        }
    }

    /**
     * Получить все активные воркеры
     * @returns {Array} Массив активных воркеров
     */
    getActiveWorkers() {
        return Array.from(this.activeWorkers.values()).map(worker => {
            const startTime = worker.startTime instanceof Date ? worker.startTime : new Date(worker.startTime);
            const endTime = worker.endTime 
                ? (worker.endTime instanceof Date ? worker.endTime : new Date(worker.endTime))
                : null;
            
            return {
                ...worker,
                startTime: startTime.toISOString(),
                endTime: endTime ? endTime.toISOString() : null,
                createdAt: worker.createdAt instanceof Date ? worker.createdAt.toISOString() : (worker.createdAt || new Date().toISOString()),
                updatedAt: worker.updatedAt instanceof Date ? worker.updatedAt.toISOString() : (worker.updatedAt || new Date().toISOString()),
                // Вычисляем текущую длительность для активных воркеров
                duration: worker.endTime 
                    ? worker.duration 
                    : Date.now() - startTime.getTime()
            };
        });
    }

    /**
     * Получить воркер по ID
     * @param {string} workerId - ID воркера
     * @returns {Object|null} Данные воркера или null
     */
    getWorker(workerId) {
        const worker = this.activeWorkers.get(workerId);
        if (worker) {
            const startTime = worker.startTime instanceof Date ? worker.startTime : new Date(worker.startTime);
            const endTime = worker.endTime 
                ? (worker.endTime instanceof Date ? worker.endTime : new Date(worker.endTime))
                : null;
            
            return {
                ...worker,
                startTime: startTime.toISOString(),
                endTime: endTime ? endTime.toISOString() : null,
                createdAt: worker.createdAt instanceof Date ? worker.createdAt.toISOString() : (worker.createdAt || new Date().toISOString()),
                updatedAt: worker.updatedAt instanceof Date ? worker.updatedAt.toISOString() : (worker.updatedAt || new Date().toISOString()),
                duration: worker.endTime 
                    ? worker.duration 
                    : Date.now() - startTime.getTime()
            };
        }

        // Ищем в истории
        const historyWorker = this.workerHistory.find(w => w.workerId === workerId);
        if (historyWorker) {
            const startTime = historyWorker.startTime instanceof Date ? historyWorker.startTime : new Date(historyWorker.startTime);
            const endTime = historyWorker.endTime 
                ? (historyWorker.endTime instanceof Date ? historyWorker.endTime : new Date(historyWorker.endTime))
                : null;
            
            return {
                ...historyWorker,
                startTime: startTime.toISOString(),
                endTime: endTime ? endTime.toISOString() : null,
                createdAt: historyWorker.createdAt instanceof Date ? historyWorker.createdAt.toISOString() : (historyWorker.createdAt || new Date().toISOString()),
                updatedAt: historyWorker.updatedAt instanceof Date ? historyWorker.updatedAt.toISOString() : (historyWorker.updatedAt || new Date().toISOString())
            };
        }
        
        return null;
    }

    /**
     * Получить историю воркера
     * @param {string} workerId - ID воркера (опционально, если не указан - вся история)
     * @param {number} limit - Лимит записей
     * @returns {Array} История воркеров
     */
    getWorkerHistory(workerId = null, limit = 50) {
        let history = workerId
            ? this.workerHistory.filter(w => w.workerId === workerId)
            : this.workerHistory;

        return history.slice(0, limit).map(worker => {
            const startTime = worker.startTime instanceof Date ? worker.startTime : new Date(worker.startTime);
            const endTime = worker.endTime 
                ? (worker.endTime instanceof Date ? worker.endTime : new Date(worker.endTime))
                : null;
            
            return {
                ...worker,
                startTime: startTime.toISOString(),
                endTime: endTime ? endTime.toISOString() : null,
                createdAt: worker.createdAt instanceof Date ? worker.createdAt.toISOString() : (worker.createdAt || new Date().toISOString()),
                updatedAt: worker.updatedAt instanceof Date ? worker.updatedAt.toISOString() : (worker.updatedAt || new Date().toISOString())
            };
        });
    }

    /**
     * Получить воркеры по типу
     * @param {string} type - Тип воркера
     * @returns {Array} Массив воркеров
     */
    getWorkersByType(type) {
        return this.getActiveWorkers().filter(w => w.type === type);
    }

    /**
     * Получить статистику воркеров
     * @param {string} period - Период ('1h', '24h', '7d', '30d')
     * @returns {Object} Статистика
     */
    getWorkerStats(period = '24h') {
        const now = Date.now();
        const periodMs = this.parsePeriod(period);
        const cutoffTime = new Date(now - periodMs);

        // Фильтруем историю по периоду
        const recentHistory = this.workerHistory.filter(
            w => w.startTime >= cutoffTime
        );

        const activeWorkers = this.getActiveWorkers();
        const byType = {};
        const byStatus = {
            running: 0,
            paused: 0,
            completed: 0,
            error: 0,
            idle: 0
        };

        // Статистика по активным воркерам
        activeWorkers.forEach(worker => {
            byStatus[worker.status] = (byStatus[worker.status] || 0) + 1;
            byType[worker.type] = (byType[worker.type] || 0) + 1;
        });

        // Статистика по завершенным воркерам
        const completed = recentHistory.filter(w => w.status === 'completed');
        const errors = recentHistory.filter(w => w.status === 'error');
        const totalCompleted = completed.length + errors.length;
        const successRate = totalCompleted > 0 
            ? (completed.length / totalCompleted) * 100 
            : 0;

        const avgDuration = completed.length > 0
            ? completed.reduce((sum, w) => sum + w.duration, 0) / completed.length
            : 0;

        return {
            period,
            active: {
                total: activeWorkers.length,
                byType,
                byStatus
            },
            completed: {
                total: totalCompleted,
                successful: completed.length,
                failed: errors.length,
                successRate: Math.round(successRate * 100) / 100,
                avgDuration: Math.round(avgDuration)
            },
            timeline: {
                startTime: cutoffTime.toISOString(),
                endTime: new Date(now).toISOString()
            }
        };
    }

    /**
     * Получить временную линию воркеров
     * @param {Date} startDate - Начальная дата
     * @param {Date} endDate - Конечная дата
     * @returns {Array} Временная линия
     */
    getWorkerTimeline(startDate, endDate) {
        const timeline = [];

        // Добавляем активные воркеры
        this.getActiveWorkers().forEach(worker => {
            const workerStartTime = worker.startTime instanceof Date ? worker.startTime : new Date(worker.startTime);
            if (workerStartTime >= startDate && workerStartTime <= endDate) {
                const endTime = worker.endTime 
                    ? (worker.endTime instanceof Date ? worker.endTime : new Date(worker.endTime))
                    : new Date();
                timeline.push({
                    workerId: worker.workerId,
                    type: worker.type,
                    name: worker.name,
                    status: worker.status,
                    startTime: workerStartTime.toISOString(),
                    endTime: endTime.toISOString(),
                    duration: worker.duration || (Date.now() - workerStartTime.getTime())
                });
            }
        });

        // Добавляем историю
        this.workerHistory.forEach(worker => {
            const workerStartTime = worker.startTime instanceof Date ? worker.startTime : new Date(worker.startTime);
            if (workerStartTime >= startDate && workerStartTime <= endDate) {
                const endTime = worker.endTime 
                    ? (worker.endTime instanceof Date ? worker.endTime : new Date(worker.endTime))
                    : null;
                timeline.push({
                    workerId: worker.workerId,
                    type: worker.type,
                    name: worker.name,
                    status: worker.status,
                    startTime: workerStartTime.toISOString(),
                    endTime: endTime ? endTime.toISOString() : null,
                    duration: worker.duration || 0
                });
            }
        });

        // Сортируем по времени начала
        timeline.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

        return timeline;
    }

    /**
     * Парсинг периода в миллисекунды
     * @private
     */
    parsePeriod(period) {
        const match = period.match(/^(\d+)([hd])$/);
        if (!match) {
            return 24 * 60 * 60 * 1000; // По умолчанию 24 часа
        }

        const value = parseInt(match[1]);
        const unit = match[2];

        switch (unit) {
            case 'h':
                return value * 60 * 60 * 1000;
            case 'd':
                return value * 24 * 60 * 60 * 1000;
            default:
                return 24 * 60 * 60 * 1000;
        }
    }

    /**
     * Отправка события через WebSocket
     * @private
     */
    broadcastEvent(eventType, data) {
        // Пытаемся получить WebSocketService, если еще не получен
        const wsService = this.tryGetWebSocketService();
        
        if (wsService && typeof wsService.broadcast === 'function') {
            try {
                wsService.broadcast({
                    type: eventType,
                    data: {
                        ...data,
                        timestamp: new Date().toISOString()
                    }
                });
                return; // Успешно отправлено
            } catch (error) {
                // Не критично, если WebSocket недоступен
                console.warn('Error broadcasting worker event:', error.message);
            }
        }
        
        // В тестовом режиме выводим в консоль, если WebSocket недоступен
        if (process.env.NODE_ENV !== 'production' && !wsService) {
            console.log(`[Worker Event] ${eventType}:`, JSON.stringify(data, null, 2));
        }
    }

    /**
     * Очистка старых записей из истории
     */
    cleanupHistory(maxAge = 7 * 24 * 60 * 60 * 1000) { // 7 дней по умолчанию
        const cutoffTime = new Date(Date.now() - maxAge);
        const initialLength = this.workerHistory.length;
        
        this.workerHistory = this.workerHistory.filter(
            w => w.startTime >= cutoffTime
        );

        const removed = initialLength - this.workerHistory.length;
        if (removed > 0 && LoggerService.isInitialized) {
            LoggerService.info('Worker history cleaned up', {
                service: 'WorkerMonitoringService',
                removed,
                remaining: this.workerHistory.length
            });
        }
    }
}

// Экспортируем singleton
const workerMonitoringService = new WorkerMonitoringService();
export default workerMonitoringService;

