import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Утилиты для работы с worker'ами
 */

/**
 * Создает worker для выполнения задачи
 * @param {string} workerFileName - Имя файла worker'а (например, 'priceUpdateWorker.js')
 * @param {Object} workerData - Данные для передачи в worker
 * @returns {Worker} Экземпляр worker'а
 */
export function createWorker(workerFileName, workerData = {}) {
    const workerPath = join(__dirname, '../../workers', workerFileName);
    return new Worker(workerPath, { workerData });
}

/**
 * Ожидает завершения worker'а и обрабатывает результаты
 * @param {Worker} worker - Экземпляр worker'а
 * @param {Object} options - Опции обработки
 * @param {Function} options.onProgress - Callback для обработки прогресса
 * @param {Function} options.onMessage - Callback для обработки сообщений
 * @param {Set} workersSet - Set для отслеживания активных workers (опционально)
 * @returns {Promise<Object>} Результат выполнения worker'а
 */
export function waitForWorkerCompletion(worker, options = {}) {
    const { onProgress, onMessage, workersSet } = options;
    
    // Добавляем worker в set для отслеживания
    if (workersSet) {
        workersSet.add(worker);
    }
    
    return new Promise((resolve, reject) => {
        worker.on('message', (msg) => {
            if (msg.type === 'done') {
                resolve(msg.data);
            } else if (msg.type === 'error') {
                reject(new Error(msg.data.error));
            } else if (msg.type === 'progress' && onProgress) {
                onProgress(msg.data);
            } else if (onMessage) {
                onMessage(msg);
            }
        });
        
        worker.on('error', reject);
        
        worker.on('exit', (code) => {
            if (workersSet) {
                workersSet.delete(worker);
            }
            if (code !== 0) {
                reject(new Error(`Worker stopped with exit code ${code}`));
            }
        });
    }).finally(() => {
        // Удаляем worker из set и завершаем
        if (workersSet) {
            workersSet.delete(worker);
        }
        if (worker.terminate) {
            worker.terminate();
        }
    });
}

/**
 * Выполняет задачу через worker с обработкой ошибок и WebSocket уведомлениями
 * @param {string} workerFileName - Имя файла worker'а
 * @param {Object} workerData - Данные для worker'а
 * @param {Object} options - Опции выполнения
 * @param {Function} options.getWebSocketService - Функция получения WebSocket сервиса
 * @param {Function} options.onProgress - Callback для прогресса
 * @param {Set} options.workersSet - Set для отслеживания workers
 * @param {string} options.broadcastType - Тип события для WebSocket (например, 'price_update_started')
 * @returns {Promise<Object>} Результат выполнения
 */
export async function executeWorkerTask(workerFileName, workerData, options = {}) {
    const {
        getWebSocketService,
        onProgress,
        workersSet,
        broadcastType
    } = options;
    
    const startTime = Date.now();
    
    // Отправляем уведомление о начале через WebSocket
    if (getWebSocketService && broadcastType) {
        const WebSocketService = await getWebSocketService();
        if (WebSocketService) {
            WebSocketService.broadcast({
                type: `${broadcastType}_started`,
                data: {
                    message: `Задача запущена`,
                    timestamp: new Date().toISOString()
                }
            });
        }
    }
    
    // Регистрируем воркер для мониторинга
    let workerId = null;
    try {
        const WorkerMonitoringService = (await import('../../services/WorkerMonitoringService.js')).default;
        if (!WorkerMonitoringService.isInitialized) {
            await WorkerMonitoringService.initialize();
        }
        
        // Определяем тип воркера по имени файла
        // Убираем расширение и суффикс Worker
        let workerType = workerFileName.replace(/Worker\.js$/, '').replace(/\.js$/, '');
        // Преобразуем camelCase в snake_case для единообразия
        workerType = workerType.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
        const workerName = workerType.split(/[_-]/).map(word => 
            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' ');
        
        workerId = WorkerMonitoringService.registerWorker(
            workerType,
            workerName,
            { workerFileName, ...workerData }
        );
    } catch (monitoringError) {
        console.warn('Failed to register worker in monitoring service:', monitoringError);
    }

    // Создаем worker
    const worker = createWorker(workerFileName, workerData);
    
    // Обработчик прогресса с WebSocket
    const progressHandler = async (data) => {
        // Обновляем прогресс воркера
        if (workerId && data.progress !== undefined) {
            try {
                const WorkerMonitoringService = (await import('../../services/WorkerMonitoringService.js')).default;
                WorkerMonitoringService.updateWorkerStatus(workerId, {
                    progress: data.progress,
                    metadata: { 
                        stage: data.stage || 'Обработка',
                        ...data
                    }
                });
            } catch (monitoringError) {
                console.warn('Failed to update worker progress:', monitoringError);
            }
        }
        
        if (onProgress) {
            onProgress(data);
        }
        
        if (getWebSocketService && broadcastType) {
            try {
                const WebSocketService = await getWebSocketService();
                if (WebSocketService) {
                    WebSocketService.broadcast({
                        type: `${broadcastType}_progress`,
                        data: {
                            ...data,
                            timestamp: new Date().toISOString()
                        }
                    });
                }
            } catch (error) {
                // Игнорируем ошибки WebSocket в обработчике прогресса, чтобы не прерывать выполнение
                console.warn('Failed to broadcast progress via WebSocket:', error.message);
            }
        }
    };
    
    try {
        // Ожидаем завершения worker'а
        const result = await waitForWorkerCompletion(worker, {
            onProgress: progressHandler,
            workersSet
        });
        
        const duration = Math.round((Date.now() - startTime) / 1000);
        
        // Завершаем воркер успешно
        if (workerId) {
            try {
                const WorkerMonitoringService = (await import('../../services/WorkerMonitoringService.js')).default;
                WorkerMonitoringService.completeWorker(workerId, true, {
                    result: result.message || 'Задача завершена успешно',
                    duration,
                    totalUpdated: result.totalUpdated || 0
                });
            } catch (monitoringError) {
                console.warn('Failed to complete worker:', monitoringError);
            }
        }
        
        // Отправляем уведомление о завершении через WebSocket
        if (getWebSocketService && broadcastType) {
            const WebSocketService = await getWebSocketService();
            if (WebSocketService) {
                WebSocketService.broadcast({
                    type: `${broadcastType}_completed`,
                    data: {
                        message: `Задача завершена успешно за ${duration}с`,
                        duration,
                        ...result,
                        timestamp: new Date().toISOString()
                    }
                });
            }
        }
        
        return {
            ...result,
            duration,
            success: true
        };
    } catch (error) {
        // Завершаем воркер с ошибкой
        if (workerId) {
            try {
                const WorkerMonitoringService = (await import('../../services/WorkerMonitoringService.js')).default;
                WorkerMonitoringService.reportWorkerError(workerId, error);
                WorkerMonitoringService.completeWorker(workerId, false, { 
                    error: error.message 
                });
            } catch (monitoringError) {
                console.warn('Failed to report worker error:', monitoringError);
            }
        }
        
        // Отправляем уведомление об ошибке через WebSocket
        if (getWebSocketService && broadcastType) {
            const WebSocketService = await getWebSocketService();
            if (WebSocketService) {
                WebSocketService.broadcast({
                    type: `${broadcastType}_failed`,
                    data: {
                        error: error.message,
                        timestamp: new Date().toISOString()
                    }
                });
            }
        }
        
        throw error;
    }
}

