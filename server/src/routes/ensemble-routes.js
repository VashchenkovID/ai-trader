import express from 'express';
import EnsembleService from '../services/EnsembleService.js';
import ServiceManager from '../services/ServiceManager.js';
import OptimizedTelegramService from '../services/OptimizedTelegramService.js';
import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

/**
 * Статус ансамбля
 */
router.get('/status', async (req, res) => {
    try {
        const status = await EnsembleService.getEnsembleStats();
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('Ошибка получения статуса ансамбля:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статуса ансамбля',
            error: error.message
        });
    }
});

/**
 * Обучение ансамбля
 */
router.post('/train', async (req, res) => {
    try {
        const { figi, options = {} } = req.body;
        if (!figi) {
            return res.status(400).json({ success: false, message: 'FIGI is required' });
        }
        
        // Отправляем ответ сразу
        res.json({
            success: true,
            message: 'Обучение ансамбля запущено',
            data: { figi }
        });

        // Регистрируем воркер для мониторинга
        let workerId = null;
        try {
            const WorkerMonitoringService = (await import('../services/WorkerMonitoringService.js')).default;
            if (!WorkerMonitoringService.isInitialized) {
                await WorkerMonitoringService.initialize();
            }
            workerId = WorkerMonitoringService.registerWorker(
                'ensemble_training',
                `Обучение ансамбля для ${figi}`,
                { figi, options }
            );
        } catch (monitoringError) {
            console.warn('Failed to register ensemble worker:', monitoringError);
        }

        // Запускаем обучение в воркере
        const workerPath = path.join(__dirname, '../workers/ensembleWorker.js');
        const worker = new Worker(workerPath, {
            workerData: {
                figi,
                options
            }
        });

        // Обрабатываем сообщения от воркера
        worker.on('message', async (msg) => {
            if (msg.type === 'done') {
                const { result } = msg.data;
                console.log('Обучение ансамбля завершено:', result?.success ? 'Успешно' : 'Ошибка');
                
                // Завершаем воркер успешно
                if (workerId) {
                    try {
                        const WorkerMonitoringService = (await import('../services/WorkerMonitoringService.js')).default;
                        WorkerMonitoringService.completeWorker(workerId, result?.success || false, {
                            result: result
                        });
                    } catch (monitoringError) {
                        console.warn('Failed to complete ensemble worker:', monitoringError);
                    }
                }
                
                // Уведомляем через WebSocket
                const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
                if (WebSocketService && typeof WebSocketService.broadcast === 'function') {
                    WebSocketService.broadcast({
                        type: 'ensemble_training_completed',
                        data: { success: true, result }
                    });
                }
            } else if (msg.type === 'error') {
                const { error } = msg.data;
                console.error('Ошибка обучения ансамбля:', error);
                
                // Завершаем воркер с ошибкой
                if (workerId) {
                    try {
                        const WorkerMonitoringService = (await import('../services/WorkerMonitoringService.js')).default;
                        WorkerMonitoringService.reportWorkerError(workerId, new Error(error));
                        WorkerMonitoringService.completeWorker(workerId, false, { error });
                    } catch (monitoringError) {
                        console.warn('Failed to report ensemble worker error:', monitoringError);
                    }
                }
                
                // Отправляем ошибку в Telegram
                if (OptimizedTelegramService && OptimizedTelegramService.isInitialized) {
                    await OptimizedTelegramService.sendAlert(
                        'Ошибка обучения ансамбля',
                        `Ошибка: ${error}`
                    );
                }
                
                // Уведомляем через WebSocket
                const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
                if (WebSocketService && typeof WebSocketService.broadcast === 'function') {
                    WebSocketService.broadcast({
                        type: 'ensemble_training_error',
                        data: { success: false, error }
                    });
                }
            } else if (msg.type === 'progress' && workerId) {
                // Обновляем прогресс воркера
                try {
                    const WorkerMonitoringService = (await import('../services/WorkerMonitoringService.js')).default;
                    WorkerMonitoringService.updateWorkerStatus(workerId, {
                        progress: msg.data.progress || 0,
                        metadata: { stage: msg.data.stage || 'Обучение' }
                    });
                } catch (monitoringError) {
                    console.warn('Failed to update ensemble worker progress:', monitoringError);
                }
            }
        });

        worker.on('error', async (error) => {
            console.error('Ошибка воркера обучения ансамбля:', error);
            
            // Завершаем воркер с ошибкой
            if (workerId) {
                try {
                    const WorkerMonitoringService = (await import('../services/WorkerMonitoringService.js')).default;
                    WorkerMonitoringService.reportWorkerError(workerId, error);
                    WorkerMonitoringService.completeWorker(workerId, false, { error: error.message });
                } catch (monitoringError) {
                    console.warn('Failed to report ensemble worker error:', monitoringError);
                }
            }
            
            // Отправляем ошибку в Telegram
            if (OptimizedTelegramService && OptimizedTelegramService.isInitialized) {
                await OptimizedTelegramService.sendAlert(
                    'Ошибка воркера обучения ансамбля',
                    `Ошибка: ${error.message}\nСтек: ${error.stack}`
                );
            }
            
            // Уведомляем через WebSocket
            const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
            if (WebSocketService && typeof WebSocketService.broadcast === 'function') {
                WebSocketService.broadcast({
                    type: 'ensemble_training_error',
                    data: { success: false, error: error.message }
                });
            }
        });

        worker.on('exit', (code) => {
            if (code !== 0) {
                console.error(`Воркер обучения ансамбля завершился с кодом ${code}`);
            }
        });
    } catch (error) {
        console.error('Ошибка запуска обучения ансамбля:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка запуска обучения ансамбля',
            error: error.message
        });
    }
});

/**
 * Пакетное обучение ансамбля
 */
router.post('/batch-train', async (req, res) => {
    try {
        const { epochs = 50, days = 180, limit = null } = req.body;
        
        // Отправляем ответ сразу
        res.json({
            success: true,
            message: 'Пакетное обучение ансамбля запущено',
            data: { epochs, days, limit }
        });

        // Запускаем пакетное обучение в фоне
        try {
            // Получаем все инструменты для обучения
            const CacheService = ServiceManager.getService('CacheService');
            let instruments = await CacheService.getAllInstruments();
            
            if (!instruments || instruments.length === 0) {
                throw new Error('No instruments available for ensemble training');
            }
            
            // Ограничиваем количество инструментов, если указан лимит
            if (limit && limit > 0) {
                instruments = instruments.slice(0, limit);
            }
            
            const results = {
                total: instruments.length,
                success: [],
                failed: []
            };
            
            // Обучаем ансамбль для каждого инструмента
            for (const instrument of instruments) {
                try {
                    const figi = instrument.figi || instrument;
                    const result = await EnsembleService.trainEnsemble(figi, {
                        days: days,
                        epochs: epochs
                    });
                    
                    if (result && result.success) {
                        results.success.push({
                            figi: figi,
                            ticker: instrument.ticker || instrument.name,
                            result: result
                        });
                    } else if (result && result.skipped) {
                        // Пропущенные инструменты не считаем ошибкой
                        results.success.push({
                            figi: figi,
                            ticker: instrument.ticker || instrument.name,
                            skipped: true,
                            message: result.message || 'insufficient data'
                        });
                    } else {
                        results.failed.push({
                            figi: figi,
                            ticker: instrument.ticker || instrument.name,
                            error: result?.message || 'unknown error'
                        });
                    }
                } catch (error) {
                    results.failed.push({
                        figi: instrument.figi || instrument,
                        ticker: instrument.ticker || instrument.name,
                        error: error.message
                    });
                }
            }
            
            console.log('Пакетное обучение ансамбля завершено:', {
                total: results.total,
                success: results.success.length,
                failed: results.failed.length
            });
            
            // Уведомляем через WebSocket
            const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
            if (WebSocketService) {
                WebSocketService.broadcast({
                    type: 'ensemble_batch_training_completed',
                    data: {
                        success: true,
                        result: results
                    },
                    timestamp: new Date().toISOString()
                });
            }
        } catch (trainingError) {
            console.error('Ошибка пакетного обучения ансамбля:', trainingError);
            
            // Отправляем ошибку в Telegram
            if (OptimizedTelegramService && OptimizedTelegramService.isInitialized) {
                await OptimizedTelegramService.sendAlert(
                    'Ошибка пакетного обучения ансамбля',
                    `Ошибка: ${trainingError.message}\nСтек: ${trainingError.stack}`
                );
            }
            
            // Уведомляем через WebSocket
            const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
            if (WebSocketService) {
                WebSocketService.broadcast({
                    type: 'ensemble_batch_training_error',
                    data: {
                        success: false,
                        error: trainingError.message
                    },
                    timestamp: new Date().toISOString()
                });
            }
        }
    } catch (error) {
        console.error('Ошибка запуска пакетного обучения ансамбля:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка запуска пакетного обучения ансамбля',
            error: error.message
        });
    }
});

export default router;
