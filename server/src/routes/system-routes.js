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
 * Запуск анализа рынка и портфеля
 */
router.post('/market-analysis', async (req, res) => {
    try {
        // Отдаём ответ сразу, анализ запускаем в фоне
        res.json({
            success: true,
            message: 'Анализ рынка и портфеля запущен'
        });

        setImmediate(async () => {
            try {
                await NeuralNetworkService.performMarketAnalysis();
            } catch (error) {
                console.error('Ошибка фонового анализа рынка:', error);
            }
        });
    } catch (error) {
        console.error('Ошибка запуска анализа рынка:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка запуска анализа рынка',
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
 * Инкрементальное обновление кеша (раз в сутки)
 */
router.post('/cache/update', async (req, res) => {
    try {
        // Отправляем ответ сразу
        res.json({
            success: true,
            message: 'Инкрементальное обновление кеша запущено'
        });

        // Запускаем инкрементальное обновление кеша в фоне
        try {
            const result = await SchedulerService.performCacheUpdate();
            console.log('Инкрементальное обновление кеша завершено:', result);
        } catch (updateError) {
            console.error('Ошибка инкрементального обновления кеша:', updateError);
        }
    } catch (error) {
        console.error('Ошибка запуска инкрементального обновления кеша:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка запуска инкрементального обновления кеша',
            error: error.message
        });
    }
});

/**
 * Полное обновление кеша (ТОЛЬКО РУЧНОЙ ЗАПУСК)
 * ВАЖНО: Это очень ресурсоемкая операция, которая:
 * - Приостанавливает ВСЕ процессы системы
 * - Может занять несколько часов
 * - Создает большую нагрузку на БД
 * - Должна выполняться только вручную пользователем
 * 
 * Инструменты - обновление списка
 * Свечи - за 1 год на каждый инструмент
 * Сигналы - 1000 сигналов на каждый инструмент
 */
router.post('/cache/full-update', async (req, res) => {
    try {
        // Отправляем ответ сразу
        res.json({
            success: true,
            message: 'Полное обновление кеша запущено'
        });

        // Запускаем полное обновление кеша в фоне
        // ВАЖНО: Не вызывать автоматически! Только по запросу пользователя.
        try {
            const result = await SchedulerService.performFullCacheUpdate(true); // force = true для ручного запуска
            console.log('✅ Полное обновление кеша завершено:', result);
        } catch (updateError) {
            console.error('❌ Ошибка полного обновления кеша:', updateError);
            // Ошибка уже обработана в performFullCacheUpdate, здесь просто логируем
        }
    } catch (error) {
        console.error('Ошибка запуска полного обновления кеша:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка запуска полного обновления кеша',
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
