import express from 'express';
import NeuralNetworkService from '../services/NeuralNetworkService.js';
import TradingEngine from '../services/TradingEngine.js';
import ServiceManager from '../services/ServiceManager.js';
import EnsembleService from '../services/EnsembleService.js';
import CacheService from '../services/CacheService.js';
import SettingsService from '../services/SettingsService.js';
import SchedulerService from '../services/SchedulerService.js';

const router = express.Router();

/**
 * Статус системы
 */
router.get('/status', async (req, res) => {
    try {
        // Получаем статусы всех сервисов
        const WebSocketService = ServiceManager.getService('WebSocketService');
        const [neuralNetworkStatus, websocketStatus, tradingEngineStatus, ensembleStatus] = await Promise.allSettled([
            Promise.resolve(NeuralNetworkService.getModelStatus()),
            Promise.resolve(WebSocketService ? WebSocketService.getStatus() : { error: 'WebSocketService not available' }),
            Promise.resolve(TradingEngine.getStatus()),
            Promise.resolve(EnsembleService.getEnsembleStats())
        ]);

        const systemStatus = {
            neuralNetwork: neuralNetworkStatus.status === 'fulfilled' ? neuralNetworkStatus.value : { error: 'Failed to get status' },
            websocket: websocketStatus.status === 'fulfilled' ? websocketStatus.value : { error: 'Failed to get status' },
            tradingEngine: tradingEngineStatus.status === 'fulfilled' ? tradingEngineStatus.value : { error: 'Failed to get status' },
            ensemble: ensembleStatus.status === 'fulfilled' ? ensembleStatus.value : { error: 'Failed to get status' },
            timestamp: new Date().toISOString()
        };

        res.json({
            success: true,
            data: systemStatus
        });
    } catch (error) {
        console.error('Ошибка получения статуса системы:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статуса системы',
            error: error.message
        });
    }
});

/**
 * Health check
 */
router.get('/health', async (req, res) => {
    try {
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            version: '1.0.0'
        };

        res.json({
            success: true,
            data: health
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Health check failed',
            error: error.message
        });
    }
});

/**
 * Статус кеша
 */
router.get('/cache/status', async (req, res) => {
    try {
        const cacheStatus = await CacheService.getCacheStatus();
        res.json({
            success: true,
            data: cacheStatus
        });
    } catch (error) {
        console.error('Ошибка получения статуса кеша:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статуса кеша',
            error: error.message
        });
    }
});

/**
 * Обновление кеша
 */
router.post('/cache/update', async (req, res) => {
    try {
        // Отправляем ответ сразу
        res.json({
            success: true,
            message: 'Обновление кеша запущено'
        });

        // Запускаем обновление кеша в фоне
        try {
            const result = await CacheService.updateCache();
            console.log('Обновление кеша завершено:', result);
            
            // Уведомляем через WebSocket
            const WebSocketService = ServiceManager.getService('WebSocketService');
            if (WebSocketService) {
                WebSocketService.broadcast('cache_update_completed', {
                    success: true,
                    result: result
                });
            }
        } catch (updateError) {
            console.error('Ошибка обновления кеша:', updateError);
            
            // Уведомляем через WebSocket
            const WebSocketService = ServiceManager.getService('WebSocketService');
            if (WebSocketService) {
                WebSocketService.broadcast('cache_update_error', {
                    success: false,
                    error: updateError.message
                });
            }
        }
    } catch (error) {
        console.error('Ошибка запуска обновления кеша:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка запуска обновления кеша',
            error: error.message
        });
    }
});

/**
 * Статус планировщика
 */
router.get('/scheduler/status', async (req, res) => {
    try {
        const schedulerStatus = await SchedulerService.getStatus();
        res.json({
            success: true,
            data: schedulerStatus
        });
    } catch (error) {
        console.error('Ошибка получения статуса планировщика:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статуса планировщика',
            error: error.message
        });
    }
});

/**
 * Настройки системы
 */
router.get('/settings', async (req, res) => {
    try {
        const settings = await SettingsService.getAllSettings();
        res.json({
            success: true,
            data: settings
        });
    } catch (error) {
        console.error('Ошибка получения настроек:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения настроек',
            error: error.message
        });
    }
});

/**
 * Обновление настроек
 */
router.put('/settings', async (req, res) => {
    try {
        const { key, value } = req.body;
        const result = await SettingsService.updateSetting(key, value);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка обновления настроек:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка обновления настроек',
            error: error.message
        });
    }
});

export default router;
