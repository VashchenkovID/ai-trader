import express from 'express';
import NeuralNetworkService from '../services/NeuralNetworkService.js';
import TradingEngine from '../services/TradingEngine.js';
import ServiceManager from '../services/ServiceManager.js';
import { getGlobalServiceManager } from '../services/GlobalServiceManager.js';
import EnsembleService from '../services/EnsembleService.js';
import CacheService from '../services/CacheService.js';
import SettingsService from '../services/SettingsService.js';
import Settings from '../models/Settings.js';
import RiskManagementService from '../services/RiskManagementService.js';
import sequelize from '../config/database.js';

const router = express.Router();

/**
 * Статус системы
 */
router.get('/status', async (req, res) => {
    try {
        // Получаем статусы всех сервисов
        const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
        const [neuralNetworkStatus, websocketStatus, tradingEngineStatus, ensembleStatus, databaseStatus] = await Promise.allSettled([
            Promise.resolve(NeuralNetworkService.getModelStatus()),
            Promise.resolve(WebSocketService ? WebSocketService.getStatus() : { error: 'WebSocketService not available' }),
            Promise.resolve(TradingEngine.getStatus()),
            Promise.resolve(EnsembleService.getEnsembleStats()),
            Promise.resolve(sequelize.authenticate().then(() => ({ status: 'connected', lastQuery: new Date().toISOString() })).catch(() => ({ status: 'disconnected', error: 'Database connection failed' })))
        ]);

        const systemStatus = {
            neuralNetwork: neuralNetworkStatus.status === 'fulfilled' ? neuralNetworkStatus.value : { error: 'Failed to get status' },
            websocket: websocketStatus.status === 'fulfilled' ? websocketStatus.value : { error: 'Failed to get status' },
            trading: tradingEngineStatus.status === 'fulfilled' ? tradingEngineStatus.value : { error: 'Failed to get status' },
            tradingEngine: tradingEngineStatus.status === 'fulfilled' ? tradingEngineStatus.value : { error: 'Failed to get status' },
            database: databaseStatus.status === 'fulfilled' ? databaseStatus.value : { status: 'unknown', error: 'Failed to get status' },
            ensemble: ensembleStatus.status === 'fulfilled' ? ensembleStatus.value : { error: 'Failed to get status' },
            timestamp: new Date().toISOString()
        };

        res.json({
            success: true,
            data: systemStatus
        });
    } catch (error) {
        console.error('Ошибка получения статуса системы:', error);
        // Возвращаем безопасный статус вместо ошибки
        res.json({
            success: true,
            data: {
                neuralNetwork: { error: 'Failed to get status' },
                websocket: { error: 'Failed to get status' },
                trading: { error: 'Failed to get status' },
                tradingEngine: { error: 'Failed to get status' },
                database: { status: 'unknown', error: 'Failed to get status' },
                ensemble: { error: 'Failed to get status' },
                timestamp: new Date().toISOString()
            }
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
        const globalServiceManager = getGlobalServiceManager();
        const SchedulerService = globalServiceManager?.getServiceSafe('SchedulerService');
        if (!SchedulerService) {
            return res.status(503).json({
                success: false,
                message: 'SchedulerService недоступен'
            });
        }
        const cacheStatus = await SchedulerService.getCacheStatus();
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
 * Статистика кеша
 */
router.get('/cache/stats', async (req, res) => {
    try {
        const cacheStats = await CacheService.getCacheStats();
        res.json({
            success: true,
            data: cacheStats
        });
    } catch (error) {
        console.error('Ошибка получения статистики кеша:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статистики кеша',
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
            const globalServiceManager = getGlobalServiceManager();
            const SchedulerService = globalServiceManager?.getServiceSafe('SchedulerService');
            if (!SchedulerService) {
                console.error('SchedulerService недоступен для обновления кеша');
                return;
            }
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
            const globalServiceManager = getGlobalServiceManager();
            const SchedulerService = globalServiceManager?.getServiceSafe('SchedulerService');
            if (!SchedulerService) {
                console.error('SchedulerService недоступен для полного обновления кеша');
                return;
            }
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
        const globalServiceManager = getGlobalServiceManager();
        const SchedulerService = globalServiceManager?.getServiceSafe('SchedulerService');
        if (!SchedulerService) {
            return res.status(503).json({
                success: false,
                message: 'SchedulerService недоступен'
            });
        }
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
    // Всегда возвращаем успешный ответ, даже при ошибках
    let formattedSettings = [];
    
    // Проверяем доступность SettingsService
    if (!SettingsService) {
        console.warn('SettingsService не импортирован');
        return res.json({
            success: true,
            data: []
        });
    }
    
    try {
        let settings = [];
        
        // Уровень 1: Получение настроек из сервиса
        try {
            if (typeof SettingsService.getAllSettings === 'function') {
                const result = await Promise.resolve(SettingsService.getAllSettings());
                settings = result || [];
            } else {
                console.warn('SettingsService.getAllSettings не является функцией');
                settings = [];
            }
        } catch (serviceError) {
            console.error('Ошибка в SettingsService.getAllSettings:', serviceError);
            console.error('Stack:', serviceError.stack);
            settings = [];
        }
        
        // Уровень 2: Проверка типа
        if (!Array.isArray(settings)) {
            console.warn('Settings.getAllSettings вернул не массив:', typeof settings, settings);
            settings = [];
        }
        
        // Уровень 3: Форматирование
        try {
            formattedSettings = settings.map(setting => {
                try {
                    if (!setting || typeof setting !== 'object') {
                        return null;
                    }
                    return {
                        key: String(setting.key || ''),
                        value: setting.value !== undefined ? setting.value : '',
                        type: String(setting.dataType || 'string'),
                        module: String(setting.category || 'other'),
                        description: String(setting.description || ''),
                        min: setting.minValue !== null && setting.minValue !== undefined ? Number(setting.minValue) : undefined,
                        max: setting.maxValue !== null && setting.maxValue !== undefined ? Number(setting.maxValue) : undefined,
                        options: setting.options || undefined
                    };
                } catch (mapError) {
                    console.warn('Ошибка форматирования настройки:', mapError);
                    return null;
                }
            }).filter(setting => setting !== null);
        } catch (formatError) {
            console.error('Ошибка форматирования настроек:', formatError);
            formattedSettings = [];
        }
    } catch (error) {
        console.error('Критическая ошибка получения настроек:', error);
        console.error('Stack:', error.stack);
        formattedSettings = [];
    }
    
    // Всегда возвращаем успешный ответ
    return res.json({
        success: true,
        data: formattedSettings
    });
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

/**
 * Метрики производительности
 */
router.get('/performance/metrics', async (req, res) => {
    // Всегда возвращаем успешный ответ с метриками (по умолчанию нули)
    const defaultMetrics = {
        responseTime: 0,
        throughput: 0,
        errorRate: 0,
        cacheHitRate: 0
    };

    try {
        // Пытаемся получить метрики из PerformanceAnalyzer, если доступен
        try {
            let PerformanceAnalyzer;
            try {
                PerformanceAnalyzer = ServiceManager.getService('PerformanceAnalyzer');
            } catch (serviceError) {
                console.warn('ServiceManager.getService ошибка:', serviceError.message);
                PerformanceAnalyzer = null;
            }
            
            if (PerformanceAnalyzer && typeof PerformanceAnalyzer.getSystemMetrics === 'function') {
                try {
                    const metrics = await PerformanceAnalyzer.getSystemMetrics();
                    if (metrics && typeof metrics === 'object') {
                        return res.json({
                            success: true,
                            data: {
                                responseTime: Number(metrics.responseTime) || 0,
                                throughput: Number(metrics.throughput) || 0,
                                errorRate: Number(metrics.errorRate) || 0,
                                cacheHitRate: Number(metrics.cacheHitRate) || 0
                            }
                        });
                    }
                } catch (metricsError) {
                    console.warn('Ошибка получения метрик из PerformanceAnalyzer:', metricsError.message);
                }
            }
        } catch (analyzerError) {
            console.warn('PerformanceAnalyzer недоступен, используем значения по умолчанию:', analyzerError.message);
        }
        
        // Возвращаем значения по умолчанию
        return res.json({
            success: true,
            data: defaultMetrics
        });
    } catch (error) {
        console.error('Критическая ошибка получения метрик производительности:', error);
        // Всегда возвращаем успешный ответ с нулевыми метриками
        return res.json({
            success: true,
            data: defaultMetrics
        });
    }
});

/**
 * Получить настройки формулы Келли
 */
router.get('/settings/kelly', async (req, res) => {
    try {
        const settings = {
            enabled: await Settings.getSetting('kelly_enabled', true),
            conservativeFactor: await Settings.getSetting('kelly_conservative_factor', 0.25),
            minTrades: await Settings.getSetting('kelly_min_trades', 10),
            volatilityPeriod: await Settings.getSetting('kelly_volatility_period', 30)
        };
        
        res.json({
            success: true,
            data: settings
        });
    } catch (error) {
        console.error('Ошибка получения настроек Келли:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения настроек Келли',
            error: error.message
        });
    }
});

/**
 * Обновить настройки формулы Келли
 */
router.put('/settings/kelly', async (req, res) => {
    try {
        const { enabled, conservativeFactor, minTrades, volatilityPeriod } = req.body;
        
        const updates = {};
        if (enabled !== undefined) {
            await Settings.setSetting('kelly_enabled', enabled);
            updates.enabled = enabled;
        }
        if (conservativeFactor !== undefined) {
            if (conservativeFactor < 0 || conservativeFactor > 1) {
                return res.status(400).json({
                    success: false,
                    message: 'conservativeFactor должен быть между 0 и 1'
                });
            }
            await Settings.setSetting('kelly_conservative_factor', conservativeFactor);
            updates.conservativeFactor = conservativeFactor;
        }
        if (minTrades !== undefined) {
            if (minTrades < 1) {
                return res.status(400).json({
                    success: false,
                    message: 'minTrades должен быть больше 0'
                });
            }
            await Settings.setSetting('kelly_min_trades', minTrades);
            updates.minTrades = minTrades;
        }
        if (volatilityPeriod !== undefined) {
            if (volatilityPeriod < 7 || volatilityPeriod > 365) {
                return res.status(400).json({
                    success: false,
                    message: 'volatilityPeriod должен быть между 7 и 365 днями'
                });
            }
            await Settings.setSetting('kelly_volatility_period', volatilityPeriod);
            updates.volatilityPeriod = volatilityPeriod;
        }
        
        // Перезагружаем настройки в сервисе
        await RiskManagementService.loadKellySettings();
        
        res.json({
            success: true,
            message: 'Настройки Келли обновлены',
            data: updates
        });
    } catch (error) {
        console.error('Ошибка обновления настроек Келли:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка обновления настроек Келли',
            error: error.message
        });
    }
});

export default router;
