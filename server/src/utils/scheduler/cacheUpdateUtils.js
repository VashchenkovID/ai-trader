import { executeWorkerTask, createWorker, waitForWorkerCompletion } from './workerUtils.js';
import OptimizedTelegramService from '../../services/OptimizedTelegramService.js';
import { shouldUpdateCache } from './cacheManagementUtils.js';
import { saveLastCacheUpdateTime } from './cacheManagementUtils.js';

/**
 * Утилиты для обновления кеша
 */

/**
 * Выполняет инкрементальное обновление кеша
 * @param {Object} context - Контекст выполнения
 * @param {Function} context.getWebSocketService - Функция получения WebSocket сервиса
 * @param {Set} context.workersSet - Set для отслеживания workers
 * @param {Function} context.checkFullCacheUpdate - Функция проверки полного обновления кеша
 * @param {Function} context.shouldUpdateCacheFn - Функция проверки необходимости обновления
 * @param {Function} context.updateLastCacheUpdate - Функция обновления времени последнего обновления
 * @param {Function} context.performLimitedNewsUpdate - Функция ограниченного обновления новостей
 * @returns {Promise<Object>} Результат обновления
 */
export async function performCacheUpdate(context) {
    const {
        getWebSocketService,
        workersSet,
        checkFullCacheUpdate,
        shouldUpdateCacheFn,
        updateLastCacheUpdate,
        performLimitedNewsUpdate
    } = context;
    
    // Проверяем, не идет ли полное обновление кеша
    if (checkFullCacheUpdate && checkFullCacheUpdate()) {
        console.log('⏰ Skipping cache update - full cache update is running');
        return {
            success: true,
            message: 'Cache update skipped - full cache update is running',
            skipped: true
        };
    }

    // Проверяем, нужно ли обновлять кеш
    if (shouldUpdateCacheFn && !(await shouldUpdateCacheFn())) {
        console.log('⏰ Skipping cache update - too soon since last update');
        return {
            success: true,
            message: 'Cache update skipped - too soon since last update',
            skipped: true
        };
    }

    try {
        console.log('🔄 Starting cache update in worker...');
        
        const result = await executeWorkerTask(
            'cacheUpdateWorker.js',
            {
                updateInstruments: false, // Инструменты обновляем только при полном обновлении
                updateCandles: true,
                updateSignals: true,
                instrumentsLimit: null,
                candlesDays: 1, // Только за день (инкрементальное обновление само определит период)
                incrementalUpdate: true, // Используем инкрементальное обновление
                signalsLimit: null,
                signalsFrom: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Сигналы за последние 24 часа
                signalsTo: new Date().toISOString()
            },
            {
                getWebSocketService,
                workersSet,
                broadcastType: 'cache_update'
            }
        );
        
        console.log(`✅ Cache update completed in ${result.duration}s. ${result.message}`);

        // Обновляем новости для ограниченного количества инструментов
        if (performLimitedNewsUpdate) {
            try {
                console.log('📰 Starting news cache update (limited to avoid API limits)...');
                await performLimitedNewsUpdate(10); // Максимум 10 запросов за раз
            } catch (newsError) {
                console.warn('⚠️ News cache update failed (non-critical):', newsError.message);
            }
        }

        // Обновляем время последнего обновления кеша
        if (updateLastCacheUpdate) {
            const now = Date.now();
            updateLastCacheUpdate(now);
            await saveLastCacheUpdateTime(now);
        }

        // Отправляем уведомление в Telegram о завершении
        await OptimizedTelegramService.sendAlert(
            'Обновление Базы Данных',
            `Кеш обновлен успешно:\n• Время: ${result.duration}с\n• Обновлено: ${result.totalUpdated} элементов\n• Статус: ✅ Готов к работе`,
            'info'
        );

        return result;
    } catch (error) {
        console.error('❌ Cache update failed:', error);
        
        // Отправляем уведомление об ошибке в Telegram
        await OptimizedTelegramService.sendAlert(
            'CACHE_UPDATE_FAILED',
            `Ошибка обновления кеша:\n• Ошибка: ${error.message}\n• Время: ${new Date().toLocaleString('ru-RU')}`,
            'warning'
        );
        
        throw error;
    }
}

/**
 * Выполняет полное обновление кеша (ТОЛЬКО РУЧНОЙ ЗАПУСК)
 * 
 * ВАЖНО: Это очень ресурсоемкая операция, которая:
 * - Может занять несколько часов
 * - Создает большую нагрузку на БД
 * - Воркеры продолжают работать параллельно (не приостанавливаются)
 * 
 * @param {Object} context - Контекст выполнения
 * @param {boolean} force - Принудительное обновление
 * @returns {Promise<Object>} Результат обновления
 */
export async function performFullCacheUpdate(context, force = false) {
    const {
        getWebSocketService,
        workersSet,
        checkFullCacheUpdate,
        setFullCacheUpdateRunning,
        setCurrentFullCacheUpdateWorker,
        shouldUpdateCacheFn,
        pauseAllProcesses,
        resumeAllProcesses,
        updateLastCacheUpdate
    } = context;
    
    const startTime = Date.now();
    const TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 часа
    
    // Объявляем worker в области видимости функции для доступа в блоке catch
    let worker = null;

    try {
        // Защита от параллельных запусков
        if (checkFullCacheUpdate && checkFullCacheUpdate()) {
            const error = new Error('Full cache update is already running');
            console.warn('⚠️', error.message);
            throw error;
        }

        // Проверка необходимости обновления (если не принудительное)
        if (!force && shouldUpdateCacheFn) {
            const shouldUpdate = await shouldUpdateCacheFn();
            if (!shouldUpdate) {
                console.log('⏰ Skipping full cache update - cache is fresh');
                return {
                    success: true,
                    skipped: true,
                    message: 'Cache is fresh',
                    timestamp: new Date().toISOString()
                };
            }
        }

        // Устанавливаем флаг выполнения
        if (setFullCacheUpdateRunning) {
            setFullCacheUpdateRunning(true);
        }
        if (setCurrentFullCacheUpdateWorker) {
            setCurrentFullCacheUpdateWorker(null);
        }

        // НЕ приостанавливаем процессы - воркеры могут работать параллельно
        // Это позволяет системе продолжать работу во время обновления кеша
        // if (pauseAllProcesses) {
        //     await pauseAllProcesses();
        // }

        console.log('🔄 Starting FULL cache update in worker...');
        
        // Отправляем уведомление о начале обновления через WebSocket
        const WebSocketService = await getWebSocketService();
        if (WebSocketService) {
            WebSocketService.broadcast({
                type: 'cache_update_started',
                data: {
                    message: 'Полное обновление кеша запущено',
                    fullUpdate: true,
                    timestamp: new Date().toISOString()
                }
            });
        }
        
        // Регистрируем воркер для мониторинга
        let workerId = null;
        try {
            const WorkerMonitoringService = (await import('../../services/WorkerMonitoringService.js')).default;
            if (!WorkerMonitoringService.isInitialized) {
                await WorkerMonitoringService.initialize();
            }
            workerId = WorkerMonitoringService.registerWorker(
                'cache_update',
                'Полное обновление кеша',
                { 
                    fullUpdate: true,
                    updateInstruments: true,
                    updateCandles: true,
                    updateSignals: true
                }
            );
        } catch (monitoringError) {
            console.warn('Failed to register cache update worker:', monitoringError);
        }

        // Создаем worker для полного обновления кеша
        worker = createWorker('cacheUpdateWorker.js', {
            updateInstruments: true, // Обновляем список инструментов
            updateCandles: true,
            updateSignals: true,
            instrumentsLimit: null, // Все инструменты
            candlesDays: 365, // 1 год свечей
            incrementalUpdate: false, // Полное обновление
            signalsLimit: 1000, // Максимум 1000 сигналов на инструмент
            signalsFrom: null, // Все сигналы
            signalsTo: null
        });
        
        // Сохраняем ссылку на worker для возможности отмены
        if (setCurrentFullCacheUpdateWorker) {
            setCurrentFullCacheUpdateWorker(worker);
        }
        
        // Обработчик прогресса с WebSocket
        const progressHandler = async (data) => {
            // Обновляем прогресс воркера
            if (workerId && data.progress !== undefined) {
                try {
                    const WorkerMonitoringService = (await import('../../services/WorkerMonitoringService.js')).default;
                    WorkerMonitoringService.updateWorkerStatus(workerId, {
                        progress: data.progress,
                        metadata: { 
                            stage: data.stage || 'Обновление кеша',
                            instrumentsProcessed: data.instrumentsProcessed || 0,
                            totalInstruments: data.totalInstruments || 0
                        }
                    });
                } catch (monitoringError) {
                    console.warn('Failed to update cache worker progress:', monitoringError);
                }
            }
            
            if (WebSocketService) {
                WebSocketService.broadcast({
                    type: 'cache_update_progress',
                    data: {
                        ...data,
                        fullUpdate: true
                    },
                    timestamp: new Date().toISOString()
                });
            }
        };
        
        // Таймаут для worker
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`Full cache update timeout after ${TIMEOUT_MS / 1000 / 60} minutes`));
            }, TIMEOUT_MS);
        });

        // Ожидаем завершения worker'а с таймаутом
        let result;
        try {
            result = await Promise.race([
                waitForWorkerCompletion(worker, {
                    onProgress: progressHandler,
                    workersSet
                }),
                timeoutPromise
            ]);
            
            // Завершаем воркер успешно
            if (workerId) {
                try {
                    const WorkerMonitoringService = (await import('../../services/WorkerMonitoringService.js')).default;
                    WorkerMonitoringService.completeWorker(workerId, true, {
                        result: result.message || 'Обновление кеша завершено успешно',
                        duration: Math.round((Date.now() - startTime) / 1000)
                    });
                } catch (monitoringError) {
                    console.warn('Failed to complete cache worker:', monitoringError);
                }
            }
        } catch (raceError) {
            // Завершаем воркер с ошибкой
            if (workerId) {
                try {
                    const WorkerMonitoringService = (await import('../../services/WorkerMonitoringService.js')).default;
                    WorkerMonitoringService.reportWorkerError(workerId, raceError);
                    WorkerMonitoringService.completeWorker(workerId, false, { 
                        error: raceError.message,
                        timeout: raceError.message?.includes('timeout')
                    });
                } catch (monitoringError) {
                    console.warn('Failed to report cache worker error:', monitoringError);
                }
            }
            
            // Если это таймаут, worker все еще может быть активен
            // Используем локальную переменную worker, а не context.currentFullCacheUpdateWorker
            if (raceError.message && raceError.message.includes('timeout')) {
                // Worker будет обработан в блоке catch ниже
                throw raceError;
            }
            throw raceError;
        }
        
        // Очищаем ссылку на worker
        if (setCurrentFullCacheUpdateWorker) {
            setCurrentFullCacheUpdateWorker(null);
        }

        const duration = Math.round((Date.now() - startTime) / 1000);
        console.log(`✅ Full cache update completed in ${duration}s. ${result.message}`);

        // Обновляем время последнего обновления кеша
        if (updateLastCacheUpdate) {
            const now = Date.now();
            updateLastCacheUpdate(now);
            await saveLastCacheUpdateTime(now);
        }

        // Отправляем уведомление о завершении через WebSocket
        if (WebSocketService) {
            WebSocketService.broadcast({
                type: 'cache_update_completed',
                data: {
                    message: `Полное обновление кеша завершено за ${duration}с`,
                    duration,
                    totalUpdated: result.totalUpdated,
                    totalCandlesCached: result.totalCandlesCached || 0,
                    totalSignalsCached: result.totalSignalsCached || 0,
                    fullUpdate: true,
                    timestamp: new Date().toISOString()
                }
            });
        }

        // Отправляем уведомление в Telegram о завершении
        await OptimizedTelegramService.sendAlert(
            'Полное обновление Базы Данных',
            `Полное обновление кеша завершено:\n• Время: ${duration}с\n• Обновлено: ${result.totalUpdated} элементов\n• Свечей: ${result.totalCandlesCached || 0}\n• Сигналов: ${result.totalSignalsCached || 0}\n• Статус: ✅ Готов к работе`,
            'info'
        );

        return result;

    } catch (error) {
        console.error('❌ Full cache update failed:', error);
        
        // Обработка таймаута - завершаем worker
        // Используем локальную переменную worker вместо context.currentFullCacheUpdateWorker,
        // так как context содержит снимок значения на момент создания контекста
        if (error.message && error.message.includes('timeout')) {
            console.warn('⏰ Full cache update timeout, terminating worker...');
            // worker объявлен в области видимости функции, поэтому доступен здесь
            if (typeof worker !== 'undefined' && worker) {
                try {
                    worker.terminate();
                    if (workersSet) {
                        workersSet.delete(worker);
                    }
                } catch (terminateError) {
                    console.error('❌ Error terminating worker:', terminateError);
                }
            }
            // Также очищаем ссылку через setter для синхронизации состояния
            if (setCurrentFullCacheUpdateWorker) {
                setCurrentFullCacheUpdateWorker(null);
            }
        }
        
        // Отправляем уведомление об ошибке через WebSocket
        const WebSocketService = await getWebSocketService();
        if (WebSocketService) {
            WebSocketService.broadcast({
                type: 'cache_update_failed',
                data: {
                    message: `Ошибка полного обновления кеша: ${error.message}`,
                    error: error.message,
                    fullUpdate: true,
                    timestamp: new Date().toISOString()
                }
            });
        }
        
        // Отправляем уведомление об ошибке в Telegram
        await OptimizedTelegramService.sendAlert(
            'CACHE_FULL_UPDATE_FAILED',
            `Ошибка полного обновления кеша:\n• Ошибка: ${error.message}\n• Время: ${new Date().toLocaleString('ru-RU')}`,
            'warning'
        );
        
        throw error;
    } finally {
        // Процессы не были приостановлены, поэтому не нужно возобновлять
        // if (resumeAllProcesses) {
        //     await resumeAllProcesses();
        // }
        
        // Сбрасываем флаг выполнения
        if (setFullCacheUpdateRunning) {
            setFullCacheUpdateRunning(false);
        }
    }
}

