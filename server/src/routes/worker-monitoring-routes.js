import express from 'express';
import WorkerMonitoringService from '../services/WorkerMonitoringService.js';
import WorkerPriorityManager from '../utils/scheduler/WorkerPriorityManager.js';

const router = express.Router();

/**
 * GET /api/workers/status
 * Получить текущий статус всех активных воркеров
 */
router.get('/status', async (req, res) => {
    try {
        if (!WorkerMonitoringService.isInitialized) {
            await WorkerMonitoringService.initialize();
        }

        const activeWorkers = WorkerMonitoringService.getActiveWorkers();
        
        res.json({
            success: true,
            data: {
                workers: activeWorkers,
                count: activeWorkers.length
            }
        });
    } catch (error) {
        console.error('Error getting workers status:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статуса воркеров',
            error: error.message
        });
    }
});

/**
 * GET /api/workers/stats
 * Получить статистику воркеров за период
 * Query параметры: period (1h, 24h, 7d, 30d)
 */
router.get('/stats', async (req, res) => {
    try {
        if (!WorkerMonitoringService.isInitialized) {
            await WorkerMonitoringService.initialize();
        }

        const period = req.query.period || '24h';
        const stats = WorkerMonitoringService.getWorkerStats(period);
        
        // Добавляем статистику очереди воркеров
        const queueStats = WorkerPriorityManager.getStats();

        res.json({
            success: true,
            data: {
                ...stats,
                queue: queueStats
            }
        });
    } catch (error) {
        console.error('Error getting worker stats:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статистики воркеров',
            error: error.message
        });
    }
});

/**
 * GET /api/workers/timeline
 * Получить временную линию работы воркеров
 * Query параметры: startDate, endDate (ISO строки)
 */
router.get('/timeline', async (req, res) => {
    try {
        if (!WorkerMonitoringService.isInitialized) {
            await WorkerMonitoringService.initialize();
        }

        const startDate = req.query.startDate 
            ? new Date(req.query.startDate) 
            : new Date(Date.now() - 24 * 60 * 60 * 1000); // По умолчанию последние 24 часа
        
        const endDate = req.query.endDate 
            ? new Date(req.query.endDate) 
            : new Date();

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            return res.status(400).json({
                success: false,
                message: 'Неверный формат даты'
            });
        }

        const timeline = WorkerMonitoringService.getWorkerTimeline(startDate, endDate);

        res.json({
            success: true,
            data: {
                timeline,
                count: timeline.length,
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString()
            }
        });
    } catch (error) {
        console.error('Error getting worker timeline:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения временной линии воркеров',
            error: error.message
        });
    }
});

/**
 * GET /api/workers/history/:workerId?
 * Получить историю работы воркеров
 * Если workerId не указан, возвращает общую историю
 */
router.get('/history/:workerId?', async (req, res) => {
    try {
        if (!WorkerMonitoringService.isInitialized) {
            await WorkerMonitoringService.initialize();
        }

        const { workerId } = req.params;
        const limit = parseInt(req.query.limit) || 50;

        const history = WorkerMonitoringService.getWorkerHistory(workerId || null, limit);

        res.json({
            success: true,
            data: {
                history,
                count: history.length,
                workerId: workerId || null
            }
        });
    } catch (error) {
        console.error('Error getting worker history:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения истории воркеров',
            error: error.message
        });
    }
});

/**
 * GET /api/workers/type/:type
 * Получить воркеры по типу
 */
router.get('/type/:type', async (req, res) => {
    try {
        if (!WorkerMonitoringService.isInitialized) {
            await WorkerMonitoringService.initialize();
        }

        const { type } = req.params;
        const workers = WorkerMonitoringService.getWorkersByType(type);

        res.json({
            success: true,
            data: {
                workers,
                type,
                count: workers.length
            }
        });
    } catch (error) {
        console.error('Error getting workers by type:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения воркеров по типу',
            error: error.message
        });
    }
});

/**
 * GET /api/workers/:workerId
 * Получить детальную информацию о воркере
 * Должен быть ПОСЛЕДНИМ GET роутом, чтобы не перехватывать специфичные роуты
 */
router.get('/:workerId', async (req, res) => {
    try {
        if (!WorkerMonitoringService.isInitialized) {
            await WorkerMonitoringService.initialize();
        }

        const { workerId } = req.params;
        const worker = WorkerMonitoringService.getWorker(workerId);

        if (!worker) {
            return res.status(404).json({
                success: false,
                message: 'Воркер не найден'
            });
        }

        res.json({
            success: true,
            data: worker
        });
    } catch (error) {
        console.error('Error getting worker details:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения информации о воркере',
            error: error.message
        });
    }
});

/**
 * POST /api/workers/:workerId/pause
 * Поставить воркер на паузу
 */
router.post('/:workerId/pause', async (req, res) => {
    try {
        if (!WorkerMonitoringService.isInitialized) {
            await WorkerMonitoringService.initialize();
        }

        const { workerId } = req.params;
        
        WorkerMonitoringService.pauseWorker(workerId);

        res.json({
            success: true,
            message: 'Воркер поставлен на паузу',
            data: { workerId }
        });
    } catch (error) {
        console.error('Error pausing worker:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Ошибка постановки воркера на паузу',
            error: error.message
        });
    }
});

/**
 * POST /api/workers/:workerId/resume
 * Возобновить работу воркера
 */
router.post('/:workerId/resume', async (req, res) => {
    try {
        if (!WorkerMonitoringService.isInitialized) {
            await WorkerMonitoringService.initialize();
        }

        const { workerId } = req.params;
        
        WorkerMonitoringService.resumeWorker(workerId);

        res.json({
            success: true,
            message: 'Воркер возобновлен',
            data: { workerId }
        });
    } catch (error) {
        console.error('Error resuming worker:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Ошибка возобновления воркера',
            error: error.message
        });
    }
});

export default router;

