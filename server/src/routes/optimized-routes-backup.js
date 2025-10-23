import express from 'express';
import OptimizedTrainingService from '../services/OptimizedTrainingService.js';
import NeuralNetworkService from '../services/NeuralNetworkService.js';
import TradingEngine from '../services/TradingEngine.js';
import ServiceManager from '../services/ServiceManager.js';
import CacheService from '../services/CacheService.js';
import SettingsService from '../services/SettingsService.js';
import PerformanceAnalyzer from '../services/PerformanceAnalyzer.js';
import EnsembleService from '../services/EnsembleService.js';
import MetaLearningService from '../services/MetaLearningService.js';
import ReinforcementLearningService from '../services/ReinforcementLearningService.js';
import IntegratedAIService from '../services/IntegratedAIService.js';
import TinkoffApiService from '../services/TinkoffApiService.js';
import TradingModeManager from '../services/TradingModeManager.js';
import RiskManagementService from '../services/RiskManagementService.js';
import SchedulerService from '../services/SchedulerService.js';
import TrainingStatusService from '../services/TrainingStatusService.js';
import OptimizedDataService from '../services/OptimizedDataService.js';
import OptimizedTelegramService from '../services/OptimizedTelegramService.js';
import { Op } from 'sequelize';

const router = express.Router();

// ============================================================================
// СИСТЕМНЫЕ РОУТЫ
// ============================================================================

/**
 * Статус системы
 */
router.get('/system/status', async (req, res) => {
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
    }
});

/**
 * Health check
 */
router.get('/system/health', async (req, res) => {
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
    }
});

// ============================================================================
// ОБУЧЕНИЕ НЕЙРОСЕТЕЙ
// ============================================================================

/**
 * Статус нейросети
 */
router.get('/neural-network/status', async (req, res) => {
    try {
        const status = NeuralNetworkService.getModelStatus();
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статуса нейросети',
            error: error.message
        });
        }
    }
});

/**
 * Запуск обучения одного инструмента
 */
router.post('/neural-network/train', async (req, res) => {
    try {
        const { figi, options = {} } = req.body;
        
        if (!figi) {
            return res.status(400).json({
                success: false,
                message: 'FIGI is required'
            });
        }

        const result = await runOptimizedTrainingWorker('single', { figi, options });
        
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка обучения нейросети:', error);
        
        // Отправляем алерт в Telegram об ошибке обучения
        try {
            const OptimizedTelegramService = (await import('../services/OptimizedTelegramService.js')).default;
            await OptimizedTelegramService.sendAlert(
                'NEURAL_NETWORK_TRAINING_ERROR',
                `❌ <b>ОШИБКА ОБУЧЕНИЯ НЕЙРОСЕТИ</b>\n\n📈 Инструмент: <b>${figi}</b>\n🔍 Ошибка: ${error.message}\n⏰ Время: ${new Date().toLocaleString('ru-RU')}`,
                'error'
            );
        } catch (telegramError) {
            console.warn('Failed to send training error alert:', telegramError.message);
        }
        
        res.status(500).json({
            success: false,
            message: 'Ошибка обучения нейросети',
            error: error.message
        });
        }
    }
});

/**
 * Запуск пакетного обучения
 */
router.post('/neural-network/train-batch', async (req, res) => {
    try {
        const { instruments, options = {} } = req.body;
        
        console.log('📨 Received batch training request:');
        console.log(`   Instruments: ${instruments?.length || 0} items`);
        console.log(`   Options:`, options);
        
        if (!instruments || !Array.isArray(instruments)) {
            console.error('❌ Invalid instruments array');
            return res.status(400).json({
                success: false,
                message: 'Instruments array is required'
            });
        }

        console.log('🚀 Starting batch training (async)...');
        
        // Сразу возвращаем 200
        res.json({
            success: true,
            message: 'Batch training started',
            data: {
                instrumentsCount: instruments.length,
                status: 'started'
            }
        });
        
        // Обновляем статус обучения
        TrainingStatusService.startTraining('neuralNetwork', instruments.length);
        
        // Отправляем уведомление о начале обучения
        const WebSocketService = ServiceManager.getService('WebSocketService');
        if (WebSocketService) {
            WebSocketService.broadcast('batch_training_started', {
            success: true,
            instrumentsCount: instruments.length,
            timestamp: new Date().toISOString()
        });
        
        // Отправляем текущий статус обучения
        if (WebSocketService) {
            WebSocketService.broadcast('training_status_update', TrainingStatusService.getStatus());
        }
        
        // Запускаем обучение в фоне
        runOptimizedTrainingWorker('batch', { instruments, options })
            .then(async result => {
                console.log('✅ Batch training completed:', result);
                
                // Обновляем статус обучения
                TrainingStatusService.completeTraining('neuralNetwork', true);
                
                // Отправляем уведомление через WebSocket
                const WebSocketService = ServiceManager.getService('WebSocketService');
                if (WebSocketService) {
                    WebSocketService.broadcast('batch_training_completed', {
                    success: true,
                    results: result.results,
                    summary: result.summary,
                    timestamp: new Date().toISOString()
                });
                
                // Отправляем обновленный статус обучения
                if (WebSocketService) {
                    WebSocketService.broadcast('training_status_update', TrainingStatusService.getStatus());
                }
            }
            })
            .catch(async error => {
                console.error('❌ Batch training failed:', error);
                
                // Обновляем статус обучения
                TrainingStatusService.completeTraining('neuralNetwork', false);
                
                // Отправляем алерт в Telegram об ошибке пакетного обучения
                try {
                    const OptimizedTelegramService = (await import('../services/OptimizedTelegramService.js')).default;
                    await OptimizedTelegramService.sendAlert(
                        'NEURAL_NETWORK_BATCH_TRAINING_ERROR',
                        `❌ <b>ОШИБКА ПАКЕТНОГО ОБУЧЕНИЯ НЕЙРОСЕТИ</b>\n\n📊 Инструментов: <b>${instruments.length}</b>\n🔍 Ошибка: ${error.message}\n⏰ Время: ${new Date().toLocaleString('ru-RU')}`,
                        'error'
                    );
                } catch (telegramError) {
                    console.warn('Failed to send batch training error alert:', telegramError.message);
                }
                
                // Отправляем уведомление об ошибке через WebSocket
                const WebSocketService = ServiceManager.getService('WebSocketService');
                if (WebSocketService) {
                    WebSocketService.broadcast('batch_training_failed', {
                    success: false,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
                
                // Отправляем обновленный статус обучения
                if (WebSocketService) {
                    WebSocketService.broadcast('training_status_update', TrainingStatusService.getStatus());
                }
            }
            })
            .catch(async error => {
                console.error('❌ Batch training failed:', error);
                
                // Обновляем статус обучения
                TrainingStatusService.completeTraining('neuralNetwork', false);
                
                // Отправляем алерт в Telegram об ошибке пакетного обучения
                try {
                    await OptimizedTelegramService.sendAlert(
                        'BATCH_TRAINING_ERROR',
                        `Ошибка пакетного обучения нейросети:\n• Ошибка: ${error.message}\n• Время: ${new Date().toISOString()}\n• Статус: ❌ Обучение прервано`,
                        'critical'
                    );
                } catch (telegramError) {
                    console.warn('Failed to send batch training error alert:', telegramError.message);
                }
                
                // Отправляем уведомление об ошибке через WebSocket
                const WebSocketService = ServiceManager.getService('WebSocketService');
                if (WebSocketService) {
                    WebSocketService.broadcast('batch_training_failed', {
                        success: false,
                        error: error.message,
                        timestamp: new Date().toISOString()
                    });
                }
                
                // Отправляем обновленный статус обучения
                if (WebSocketService) {
                    WebSocketService.broadcast('training_status_update', TrainingStatusService.getStatus());
                }
            })
            .catch(async error => {
                console.error('❌ Batch training failed:', error);
                
                // Обновляем статус обучения
                TrainingStatusService.completeTraining('neuralNetwork', false);
                
                // Отправляем алерт в Telegram об ошибке пакетного обучения
                try {
                    await OptimizedTelegramService.sendAlert(
                        'BATCH_TRAINING_ERROR',
                        `Ошибка пакетного обучения нейросети:\n• Ошибка: ${error.message}\n• Время: ${new Date().toISOString()}\n• Статус: ❌ Обучение прервано`,
                        'critical'
                    );
                } catch (telegramError) {
                    console.warn('Failed to send batch training error alert:', telegramError.message);
                }
                
                // Отправляем уведомление об ошибке через WebSocket
                const WebSocketService = ServiceManager.getService('WebSocketService');
                if (WebSocketService) {
                    WebSocketService.broadcast('batch_training_failed', {
                        success: false,
                        error: error.message,
                        timestamp: new Date().toISOString()
                    });
                }
                
                // Отправляем обновленный статус обучения
                if (WebSocketService) {
                    WebSocketService.broadcast('training_status_update', TrainingStatusService.getStatus());
                }
            });
    } catch (error) {
        console.error('❌ Ошибка пакетного обучения:', error);
        // Не отправляем ответ, так как он уже отправлен выше
        // Просто логируем ошибку
    }
});

/**
 * Получение доступных инструментов для обучения
 */
router.get('/neural-network/instruments', async (req, res) => {
    try {
        console.log('📋 API: Getting neural network instruments...');
        const instruments = await OptimizedTrainingService.getAvailableInstruments();
        console.log(`📊 API: Returning ${instruments.length} instruments`);
        res.json({
            success: true,
            data: instruments
        });
    } catch (error) {
        console.error('❌ API: Error getting instruments:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения инструментов',
            error: error.message
        });
        }
    }
});

/**
 * Проверка состояния кеша (отладочный эндпоинт)
 */
router.get('/debug/cache-status', async (req, res) => {
    try {
        const CachedInstrument = (await import('../models/CachedInstrument.js')).default;
        const CachedCandle = (await import('../models/CachedCandle.js')).default;
        const SchedulerService = (await import('../services/SchedulerService.js')).default;
        
        const totalInstruments = await CachedInstrument.count();
        const activeInstruments = await CachedInstrument.count({ where: { isActive: true } });
        const totalCandles = await CachedCandle.count();
        
        // Получаем статус кеша из планировщика
        const cacheStatus = await SchedulerService.getCacheStatus();
        
        // Получаем несколько примеров инструментов
        const sampleInstruments = await CachedInstrument.findAll({
            where: { isActive: true },
            limit: 5,
            order: [['name', 'ASC']]
        });
        
        const sampleData = [];
        for (const instrument of sampleInstruments) {
            const candleCount = await CachedCandle.count({
                where: { figi: instrument.figi }
            });
            sampleData.push({
                ticker: instrument.ticker,
                name: instrument.name,
                figi: instrument.figi,
                candleCount,
                lastUpdated: instrument.lastUpdated
            });
        }
        
        res.json({
            success: true,
            data: {
                totalInstruments,
                activeInstruments,
                totalCandles,
                sampleData,
                cacheStatus: {
                    lastUpdate: cacheStatus.lastUpdate,
                    timeSinceLastUpdate: cacheStatus.timeSinceLastUpdate,
                    updateInterval: cacheStatus.updateInterval,
                    needsUpdate: cacheStatus.needsUpdate,
                    nextUpdateIn: cacheStatus.nextUpdateIn
                }
            }
        });
    } catch (error) {
        console.error('❌ Debug cache status error:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка проверки кеша',
            error: error.message
        });
        }
    }
});

/**
 * Получение системных ресурсов (CPU, Memory)
 */
router.get('/system/resources', async (req, res) => {
    try {
        const os = await import('os');
        
        // CPU информация
        const cpus = os.default.cpus();
        const cpuUsage = process.cpuUsage();
        const cpuUsagePercent = (cpuUsage.user + cpuUsage.system) / 1000000; // конвертируем в секунды
        
        // Memory информация
        const totalMemory = os.default.totalmem();
        const freeMemory = os.default.freemem();
        const usedMemory = totalMemory - freeMemory;
        const memoryUsagePercent = (usedMemory / totalMemory) * 100;
        
        // Load average
        const loadAverage = os.default.loadavg();
        
        res.json({
            success: true,
            data: {
                cpu: {
                    usage: Math.min(cpuUsagePercent, 100), // ограничиваем до 100%
                    cores: cpus.length,
                    loadAverage: loadAverage
                },
                memory: {
                    used: Math.round(usedMemory / 1024 / 1024), // MB
                    total: Math.round(totalMemory / 1024 / 1024), // MB
                    free: Math.round(freeMemory / 1024 / 1024), // MB
                    usage: Math.round(memoryUsagePercent)
                },
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('❌ System resources error:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения системных ресурсов',
            error: error.message
        });
        }
    }
});

/**
 * Принудительно обновить время последнего обновления кеша
 */
router.post('/cache/force-update-time', async (req, res) => {
    try {
        const SchedulerService = (await import('../services/SchedulerService.js')).default;
        const success = await SchedulerService.forceUpdateCacheTime();
        
        if (success) {
            res.json({
                success: true,
                message: 'Время последнего обновления кеша обновлено',
                timestamp: new Date().toISOString()
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Ошибка обновления времени кеша'
            });
        }
    } catch (error) {
        console.error('❌ Force update cache time error:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка обновления времени кеша',
            error: error.message
        });
        }
    }
});

// Остановить обучение нейронной сети
router.post('/neural-network/stop-training', async (req, res) => {
    try {
        const { figi } = req.body;
        const result = await NeuralNetworkService.stopTraining(figi);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('❌ Error stopping neural network training:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
        }
    }
});

// ============================================================================
// ТОРГОВЫЕ РОУТЫ
// ============================================================================

/**
 * Портфель
 */
router.get('/trading/portfolio', async (req, res) => {
    try {
        const TradingEngine = (await import('../services/TradingEngine.js')).default;
        
        // Получаем данные портфеля из TradingEngine
        const portfolioData = await TradingEngine.getPortfolioValue();
        
        // Рассчитываем дополнительные метрики
        const totalValue = portfolioData.totalValue || 0;
        const cash = portfolioData.cash || 0;
        const investedAmount = totalValue - cash;
        const positionsCount = portfolioData.positions ? 
            Object.values(portfolioData.positions).filter(qty => qty > 0).length : 0;
        
        // Рассчитываем P&L из истории сделок
        let totalPnL = 0;
        let totalPnLPercent = 0;
        let dayChange = 0;
        let dayChangePercent = 0;
        
        try {
            const trades = portfolioData.trades || [];
            if (trades.length > 0) {
                // Простой расчет общего P&L
                const totalBought = trades
                    .filter(t => t.action === 'BUY')
                    .reduce((sum, t) => sum + (t.price * t.quantity), 0);
                const totalSold = trades
                    .filter(t => t.action === 'SELL')
                    .reduce((sum, t) => sum + (t.price * t.quantity), 0);
                
                totalPnL = totalSold - totalBought;
                totalPnLPercent = totalBought > 0 ? (totalPnL / totalBought) * 100 : 0;
                
                // Дневное изменение (упрощенно - последние сделки)
                const todayTrades = trades.filter(t => {
                    const tradeDate = new Date(t.timestamp);
                    const today = new Date();
                    return tradeDate.toDateString() === today.toDateString();
                });
                
                if (todayTrades.length > 0) {
                    dayChange = todayTrades.reduce((sum, t) => {
                        return sum + (t.action === 'BUY' ? -t.price * t.quantity : t.price * t.quantity);
                    }, 0);
                    dayChangePercent = investedAmount > 0 ? (dayChange / investedAmount) * 100 : 0;
                }
            }
        } catch (error) {
            console.warn('Could not calculate P&L metrics:', error.message);
        }
        
        const portfolio = {
            totalValue,
            cash,
            investedAmount,
            totalPnL,
            totalPnLPercent,
            positionsCount,
            dayChange,
            dayChangePercent,
            mode: portfolioData.mode || 'paper',
            lastUpdate: new Date().toISOString()
        };
        
        res.json({
            success: true,
            data: portfolio
        });
    } catch (error) {
        console.error('❌ Ошибка получения портфеля:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения портфеля',
            error: error.message
        });
        }
    }
});

/**
 * Статистика торговли
 */
router.get('/trading/stats', async (req, res) => {
    try {
        const stats = await TradingEngine.calculateTradingStats();
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статистики торговли',
            error: error.message
        });
        }
    }
});

/**
 * История сделок
 */
router.get('/trading/trades', async (req, res) => {
    try {
        const trades = await TradingEngine.getTradeHistory();
        res.json({
            success: true,
            data: trades
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка получения истории сделок',
            error: error.message
        });
        }
    }
});

/**
 * Выполнение сделки
 */
router.post('/trading/execute', async (req, res) => {
    try {
        const { action, figi, quantity, price } = req.body;
        
        if (!action || !figi || !quantity) {
            return res.status(400).json({
                success: false,
                message: 'Action, FIGI and quantity are required'
            });
        }

        const result = await TradingEngine.executeOrder({
            action,
            figi,
            quantity,
            price
        });
        
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка выполнения сделки',
            error: error.message
        });
        }
    }
});

// ============================================================================
// РЕКОМЕНДАЦИИ
// ============================================================================

/**
 * Торговые рекомендации
 */
router.get('/recommendations', async (req, res) => {
    try {
        const recommendations = await NeuralNetworkService.getRecommendations();
        res.json({
            success: true,
            data: recommendations
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка получения рекомендаций',
            error: error.message
        });
        }
    }
});

/**
 * Доступные инструменты
 */
router.get('/instruments', async (req, res) => {
    try {
        const instruments = await CacheService.getAllInstruments();
        res.json({
            success: true,
            data: instruments
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка получения инструментов',
            error: error.message
        });
        }
    }
});

/**
 * Обновление кеша данных
 */
router.post('/market/refresh', async (req, res) => {
    try {
        console.log('🔄 API: Starting cache refresh in worker...');
        
        // Сразу возвращаем ответ, чтобы фронтенд не ждал
        res.json({
            success: true,
            message: 'Обновление кеша запущено в фоновом режиме. Прогресс будет отправлен через WebSocket.',
            timestamp: new Date().toISOString()
        });
        
        // Запускаем обновление кеша асинхронно (не ждем завершения)
        SchedulerService.performCacheUpdate().catch(error => {
            console.error('❌ Background cache update failed:', error);
        });
        
    } catch (error) {
        console.error('❌ API: Cache refresh failed:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка запуска обновления кеша',
            error: error.message
        });
        }
    }
});

// ============================================================================
// ТОРГОВЫЕ ОПЕРАЦИИ
// ============================================================================

/**
 * Получение статуса торгового движка
 */
router.get('/trading/status', async (req, res) => {
    try {
        const status = TradingEngine.getStatus();
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статуса торговли',
            error: error.message
        });
        }
    }
});

/**
 * Получение текущего режима торговли
 */
router.get('/trading/mode', async (req, res) => {
    try {
        const mode = TradingModeManager.getCurrentMode();
        const settings = await TradingModeManager.getModeSettings();
        
        res.json({
            success: true,
            data: {
                mode,
                settings
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка получения режима торговли',
            error: error.message
        });
        }
    }
});

/**
 * Переключение режима торговли
 */
router.post('/trading/mode/switch', async (req, res) => {
    try {
        const { mode } = req.body;
        
        if (!mode || !['paper', 'micro', 'real'].includes(mode)) {
            return res.status(400).json({
                success: false,
                message: 'Недопустимый режим торговли'
            });
        }

        const result = await TradingModeManager.switchMode(mode);
        
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка переключения режима торговли',
            error: error.message
        });
        }
    }
});

/**
 * Исполнение торгового сигнала
 */
router.post('/trading/execute', async (req, res) => {
    try {
        const { symbol, action, quantity, price, confidence } = req.body;
        
        if (!symbol || !action || !quantity || !price) {
            return res.status(400).json({
                success: false,
                message: 'Отсутствуют обязательные параметры'
            });
        }

        const signal = {
            symbol,
            action,
            quantity,
            price,
            confidence: confidence || 0.5
        };

        const result = await TradingEngine.executeOrder(signal);
        
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка исполнения торгового сигнала',
            error: error.message
        });
        }
    }
});

/**
 * Получение портфеля
 */
router.get('/trading/portfolio', async (req, res) => {
    try {
        const portfolio = await TradingEngine.getPortfolioValue();
        
        res.json({
            success: true,
            data: portfolio
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка получения портфеля',
            error: error.message
        });
        }
    }
});

/**
 * Получение истории сделок
 */
router.get('/trading/history', async (req, res) => {
    try {
        const { limit = 100 } = req.query;
        const history = TradingEngine.getTradeHistory(parseInt(limit));
        
        res.json({
            success: true,
            data: history
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка получения истории сделок',
            error: error.message
        });
        }
    }
});

/**
 * Получение статистики торговли
 */
router.get('/trading/stats', async (req, res) => {
    try {
        const stats = await TradingEngine.calculateTradingStats();
        
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статистики торговли',
            error: error.message
        });
        }
    }
});

/**
 * Получение активных ордеров
 */
router.get('/trading/orders/active', async (req, res) => {
    try {
        const orders = await TinkoffApiService.getActiveOrders();
        
        res.json({
            success: true,
            data: orders
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка получения активных ордеров',
            error: error.message
        });
        }
    }
});

/**
 * Отмена ордера
 */
router.post('/trading/orders/cancel', async (req, res) => {
    try {
        const { orderId } = req.body;
        
        if (!orderId) {
            return res.status(400).json({
                success: false,
                message: 'Отсутствует ID ордера'
            });
        }

        const result = await TinkoffApiService.cancelOrder(orderId);
        
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка отмены ордера',
            error: error.message
        });
        }
    }
});

/**
 * Получение статуса риск-менеджмента
 */
router.get('/trading/risk/status', async (req, res) => {
    try {
        const status = RiskManagementService.getStatus();
        
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статуса риск-менеджмента',
            error: error.message
        });
        }
    }
});

/**
 * Сброс экстренной остановки
 */
router.post('/trading/risk/reset-emergency', async (req, res) => {
    try {
        RiskManagementService.resetEmergencyStop();
        
        res.json({
            success: true,
            message: 'Экстренная остановка снята'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка сброса экстренной остановки',
            error: error.message
        });
        }
    }
});

/**
 * Проверка доступности торговли
 */
router.get('/trading/availability', async (req, res) => {
    try {
        const isAvailable = await TinkoffApiService.isTradingAvailable();
        const tradingHours = await TinkoffApiService.getTradingHours('BBG004730N88');
        
        res.json({
            success: true,
            data: {
                isAvailable,
                tradingHours
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка проверки доступности торговли',
            error: error.message
        });
        }
    }
});

// ============================================================================
// МОНИТОРИНГ ПРОИЗВОДИТЕЛЬНОСТИ
// ============================================================================

/**
 * Метрики производительности
 */
router.get('/performance/metrics', async (req, res) => {
    try {
        const metrics = await PerformanceAnalyzer.getMetrics();
        res.json({
            success: true,
            data: metrics
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка получения метрик производительности',
            error: error.message
        });
        }
    }
});

/**
 * Статус ансамбля
 */
router.get('/ensemble/status', async (req, res) => {
    try {
        const status = EnsembleService.getEnsembleStats();
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статуса ансамбля',
            error: error.message
        });
        }
    }
});

// ============================================================================
// НАСТРОЙКИ
// ============================================================================

/**
 * Получение настроек
 */
router.get('/settings', async (req, res) => {
    try {
        const settings = await SettingsService.getAllSettings();
        res.json({
            success: true,
            data: settings
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка получения настроек',
            error: error.message
        });
        }
    }
});

/**
 * Обновление настроек
 */
router.put('/settings', async (req, res) => {
    try {
        const { settings } = req.body;
        const result = await SettingsService.updateSettings(settings);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка обновления настроек',
            error: error.message
        });
        }
    }
});

// ============================================================================
// УПРАВЛЕНИЕ РЕЖИМАМИ ТОРГОВЛИ
// ============================================================================

// Получить текущий режим торговли
router.get('/trading-mode/current', async (req, res) => {
    try {
        const TradingModeManager = (await import('../services/TradingModeManager.js')).default;
        const mode = TradingModeManager.getCurrentMode();
        const settings = TradingModeManager.getModeSettings();
        
        res.json({
            success: true,
            mode,
            settings,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Ошибка получения режима торговли:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
        }
    }
});

// Переключить режим торговли
router.post('/trading-mode/switch', async (req, res) => {
    try {
        const { mode } = req.body;
        const TradingModeManager = (await import('../services/TradingModeManager.js')).default;
        
        if (!['paper', 'micro', 'real'].includes(mode)) {
            return res.status(400).json({
                success: false,
                error: 'Неверный режим торговли. Доступные: paper, micro, real'
            });
        }
        
        await TradingModeManager.setMode(mode);
        
        res.json({
            success: true,
            message: `Режим торговли изменен на ${mode.toUpperCase()}`,
            mode,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Ошибка переключения режима:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
        }
    }
});

// Получить статус риск-менеджмента
router.get('/risk-management/status', async (req, res) => {
    try {
        const RiskManagementService = (await import('../services/RiskManagementService.js')).default;
        const status = RiskManagementService.getStatus();
        
        res.json({
            success: true,
            status,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Ошибка получения статуса риск-менеджмента:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
        }
    }
});

// Получить детальную статистику риск-менеджмента
router.get('/risk-management/stats', async (req, res) => {
    try {
        const RiskManagementService = (await import('../services/RiskManagementService.js')).default;
        const stats = RiskManagementService.getDetailedStats();
        
        res.json({
            success: true,
            stats,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Ошибка получения статистики риск-менеджмента:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
        }
    }
});

// Обновить лимиты риск-менеджмента
router.post('/risk-management/limits', async (req, res) => {
    try {
        const { limits } = req.body;
        const RiskManagementService = (await import('../services/RiskManagementService.js')).default;
        
        RiskManagementService.updateLimits(limits);
        
        res.json({
            success: true,
            message: 'Лимиты риск-менеджмента обновлены',
            limits,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Ошибка обновления лимитов:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
        }
    }
});

// Сбросить экстренную остановку
router.post('/risk-management/reset-emergency', async (req, res) => {
    try {
        const RiskManagementService = (await import('../services/RiskManagementService.js')).default;
        RiskManagementService.resetEmergencyStop();
        
        res.json({
            success: true,
            message: 'Экстренная остановка снята',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Ошибка сброса экстренной остановки:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
        }
    }
});

// Проверить готовность к переходу к микро-капиталу
router.get('/switch-validator/micro', async (req, res) => {
    try {
        const SwitchValidator = (await import('../services/SwitchValidator.js')).default;
        const validation = await SwitchValidator.canSwitchToMicro();
        
        res.json({
            success: true,
            validation,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Ошибка проверки готовности к микро-капиталу:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
        }
    }
});

// Проверить готовность к переходу к полной торговле
router.get('/switch-validator/full', async (req, res) => {
    try {
        const SwitchValidator = (await import('../services/SwitchValidator.js')).default;
        const validation = await SwitchValidator.canSwitchToFull();
        
        res.json({
            success: true,
            validation,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Ошибка проверки готовности к полной торговле:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
        }
    }
});

// Получить историю валидаций
router.get('/switch-validator/history', async (req, res) => {
    try {
        const SwitchValidator = (await import('../services/SwitchValidator.js')).default;
        const history = SwitchValidator.getValidationHistory();
        
        res.json({
            success: true,
            history,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Ошибка получения истории валидаций:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
        }
    }
});

// ============================================================================
// TRADING MODE DASHBOARD API ENDPOINTS
// ============================================================================

// Получить историю переходов между режимами торговли
router.get('/trading-mode/history', async (req, res) => {
    try {
        // Заглушка для истории переходов
        const history = [
            {
                id: '1',
                fromMode: 'paper',
                toMode: 'micro',
                timestamp: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
                status: 'completed',
                reason: 'Достигнута стабильная прибыльность в течение 3 месяцев',
                metrics: {
                    profitability: 0.15,
                    sharpeRatio: 1.2,
                    maxDrawdown: 0.08,
                    winRate: 0.65
                }
            },
            {
                id: '2',
                fromMode: 'micro',
                toMode: 'real',
                timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
                status: 'in_progress',
                reason: 'Проверка готовности к полной торговле',
                metrics: {
                    profitability: 0.22,
                    sharpeRatio: 1.5,
                    maxDrawdown: 0.05,
                    winRate: 0.72
                }
            }
        ];
        
        res.json({
            success: true,
            data: history,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Ошибка получения истории режимов торговли:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
        }
    }
});

// Получить настройки режима торговли
router.get('/trading-mode/settings', async (req, res) => {
    try {
        // Заглушка для настроек режима
        const settings = {
            maxPositionSize: 5,
            stopLossPercent: 2,
            takeProfitPercent: 6,
            maxDailyLoss: 5000,
            maxConcurrentPositions: 10,
            emergencyStopEnabled: true
        };
        
        res.json({
            success: true,
            data: settings,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Ошибка получения настроек режима торговли:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
        }
    }
});

// Обновить настройки режима торговли
router.put('/trading-mode/settings', async (req, res) => {
    try {
        const settings = req.body;
        
        // Здесь будет логика сохранения настроек
        console.log('📝 Обновление настроек режима торговли:', settings);
        
        res.json({
            success: true,
            message: 'Настройки режима торговли обновлены',
            data: settings,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Ошибка обновления настроек режима торговли:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
        }
    }
});

// Получить результаты валидации для переходов между режимами
router.get('/trading-mode/validation', async (req, res) => {
    try {
        // Заглушка для результатов валидации
        const validation = {
            canSwitchToMicro: true,
            canSwitchToReal: false,
            microScore: 85,
            realScore: 65,
            overallScore: 75,
            requirements: [
                {
                    name: 'Стабильная прибыльность',
                    status: 'passed',
                    value: '15.2%',
                    threshold: '10%'
                },
                {
                    name: 'Коэффициент Шарпа',
                    status: 'passed',
                    value: '1.2',
                    threshold: '1.0'
                },
                {
                    name: 'Максимальная просадка',
                    status: 'warning',
                    value: '8.5%',
                    threshold: '5%'
                },
                {
                    name: 'Время работы',
                    status: 'failed',
                    value: '4 месяца',
                    threshold: '6 месяцев'
                }
            ]
        };
        
        res.json({
            success: true,
            data: validation,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Ошибка получения валидации режимов торговли:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
        }
    }
});

// Получить данные производительности по режимам торговли
router.get('/trading-mode/performance', async (req, res) => {
    try {
        // Заглушка для данных производительности
        const performance = {
            labels: ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн'],
            profitData: [0, 2.5, 5.1, 3.8, 7.2, 9.1],
            drawdownData: [0, -1.2, -0.8, -2.1, -1.5, -0.9],
            modeStats: {
                paper: {
                    totalTrades: 245,
                    winRate: 0.68,
                    avgProfit: 1200,
                    maxDrawdown: 0.12
                },
                micro: {
                    totalTrades: 89,
                    winRate: 0.72,
                    avgProfit: 850,
                    maxDrawdown: 0.08
                },
                real: {
                    totalTrades: 0,
                    winRate: 0,
                    avgProfit: 0,
                    maxDrawdown: 0
                }
            }
        };
        
        res.json({
            success: true,
            data: performance,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Ошибка получения данных производительности:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
        }
    }
});

// Запустить миграцию портфеля между режимами
router.post('/trading-mode/migrate', async (req, res) => {
    try {
        const { fromMode, toMode, options } = req.body;
        
        console.log(`🔄 Запуск миграции портфеля: ${fromMode} → ${toMode}`, options);
        
        // Здесь будет логика миграции портфеля
        const migrationId = `migration_${Date.now()}`;
        
        res.json({
            success: true,
            message: `Миграция портфеля запущена: ${fromMode} → ${toMode}`,
            migrationId,
            estimatedTime: '5-10 минут',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Ошибка запуска миграции портфеля:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
        }
    }
});

// Получить статус миграции портфеля
router.get('/trading-mode/migration-status', async (req, res) => {
    try {
        // Заглушка для статуса миграции
        const migrationStatus = {
            isActive: false,
            progress: 0,
            currentStep: null,
            estimatedTimeRemaining: null,
            lastMigration: {
                id: 'migration_1696234567890',
                fromMode: 'paper',
                toMode: 'micro',
                status: 'completed',
                completedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
                duration: '7 минут'
            }
        };
        
        res.json({
            success: true,
            data: migrationStatus,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Ошибка получения статуса миграции:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
        }
    }
});

// ============================================================================
// PORTFOLIO VISUALIZATION API ENDPOINTS
// ============================================================================

// Получить позиции портфеля
router.get('/portfolio/positions', async (req, res) => {
    try {
        const TradingEngine = (await import('../services/TradingEngine.js')).default;
        const TinkoffApiService = (await import('../services/TinkoffApiService.js')).default;
        const CacheService = (await import('../services/CacheService.js')).default;
        
        // Получаем данные портфеля из TradingEngine
        const portfolioData = await TradingEngine.getPortfolioValue();
        
        const positions = [];
        let totalValue = portfolioData.cash || 0;
        
        // Обрабатываем позиции из виртуального портфеля (paper mode) или реального
        if (portfolioData.positions && Object.keys(portfolioData.positions).length > 0) {
            for (const [figi, quantity] of Object.entries(portfolioData.positions)) {
                if (quantity > 0) {
                    try {
                        // Получаем информацию об инструменте
                        const instrument = await TinkoffApiService.getInstrumentByFigi(figi);
                        if (!instrument) continue;
                        
                        // Получаем текущую цену
                        const currentPrice = await TinkoffApiService.getLastPrice(figi);
                        if (!currentPrice) continue;
                        
                        // Получаем среднюю цену покупки из истории сделок
                        let averagePrice = currentPrice; // Fallback
                        try {
                            const trades = portfolioData.trades || [];
                            const buyTrades = trades.filter(t => t.symbol === figi && t.action === 'BUY');
                            if (buyTrades.length > 0) {
                                const totalCost = buyTrades.reduce((sum, trade) => sum + (trade.price * trade.quantity), 0);
                                const totalQuantity = buyTrades.reduce((sum, trade) => sum + trade.quantity, 0);
                                averagePrice = totalCost / totalQuantity;
                            }
                        } catch (e) {
                            console.warn('Could not calculate average price for', instrument.ticker);
                        }
                        
                        const marketValue = currentPrice * quantity;
                        const unrealizedPnL = (currentPrice - averagePrice) * quantity;
                        const unrealizedPnLPercent = ((currentPrice - averagePrice) / averagePrice) * 100;
                        
                        totalValue += marketValue;
                        
                        // Определяем сектор (упрощенно по тикеру)
                        let sector = 'Неизвестно';
                        const ticker = instrument.ticker.toUpperCase();
                        if (['SBER', 'VTBR', 'GAZS'].includes(ticker)) {
                            sector = 'Финансы';
                        } else if (['GAZP', 'LKOH', 'ROSN', 'NVTK'].includes(ticker)) {
                            sector = 'Энергетика';
                        } else if (['YNDX', 'OZON', 'VKCO'].includes(ticker)) {
                            sector = 'IT';
                        } else if (['MGNT', 'FIVE', 'FIXP'].includes(ticker)) {
                            sector = 'Ритейл';
                        }
                        
                        positions.push({
                            figi,
                            ticker: instrument.ticker,
                            name: instrument.name,
                            quantity,
                            averagePrice,
                            currentPrice,
                            marketValue,
                            unrealizedPnL,
                            unrealizedPnLPercent,
                            weight: 0, // Будет рассчитан после получения всех позиций
                            sector,
                            currency: instrument.currency || 'RUB',
                            lastUpdate: new Date().toISOString()
                        });
                    } catch (error) {
                        console.warn(`Could not process position for ${figi}:`, error.message);
                    }
                }
            }
        }
        
        // Рассчитываем веса позиций
        positions.forEach(position => {
            position.weight = totalValue > 0 ? (position.marketValue / totalValue) * 100 : 0;
        });
        
        res.json({
            success: true,
            data: positions,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Ошибка получения позиций портфеля:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
        }
    }
});

// Получить детальную информацию о позиции
router.get('/portfolio/positions/:figi', async (req, res) => {
    try {
        const { figi } = req.params;
        const TradingEngine = (await import('../services/TradingEngine.js')).default;
        const TinkoffApiService = (await import('../services/TinkoffApiService.js')).default;
        
        // Получаем данные портфеля
        const portfolioData = await TradingEngine.getPortfolioValue();
        
        // Проверяем, есть ли позиция
        const quantity = portfolioData.positions?.[figi] || 0;
        if (quantity <= 0) {
            return res.status(404).json({
                success: false,
                error: 'Позиция не найдена в портфеле'
            });
        }
        
        // Получаем информацию об инструменте
        const instrument = await TinkoffApiService.getInstrumentByFigi(figi);
        if (!instrument) {
            return res.status(404).json({
                success: false,
                error: 'Инструмент не найден'
            });
        }
        
        // Получаем текущую цену
        const currentPrice = await TinkoffApiService.getLastPrice(figi);
        if (!currentPrice) {
            return res.status(500).json({
                success: false,
                error: 'Не удалось получить текущую цену'
            });
        }
        
        // Анализируем историю сделок для этой позиции
        const trades = (portfolioData.trades || []).filter(t => t.symbol === figi);
        const buyTrades = trades.filter(t => t.action === 'BUY');
        const sellTrades = trades.filter(t => t.action === 'SELL');
        
        // Рассчитываем среднюю цену покупки
        let averagePrice = currentPrice;
        if (buyTrades.length > 0) {
            const totalCost = buyTrades.reduce((sum, trade) => sum + (trade.price * trade.quantity), 0);
            const totalQuantity = buyTrades.reduce((sum, trade) => sum + trade.quantity, 0);
            averagePrice = totalQuantity > 0 ? totalCost / totalQuantity : currentPrice;
        }
        
        // Рассчитываем метрики
        const marketValue = currentPrice * quantity;
        const unrealizedPnL = (currentPrice - averagePrice) * quantity;
        const unrealizedPnLPercent = ((currentPrice - averagePrice) / averagePrice) * 100;
        
        // Определяем сектор
        let sector = 'Неизвестно';
        const ticker = instrument.ticker.toUpperCase();
        if (['SBER', 'VTBR', 'GAZS'].includes(ticker)) {
            sector = 'Финансы';
        } else if (['GAZP', 'LKOH', 'ROSN', 'NVTK'].includes(ticker)) {
            sector = 'Энергетика';
        } else if (['YNDX', 'OZON', 'VKCO'].includes(ticker)) {
            sector = 'IT';
        } else if (['MGNT', 'FIVE', 'FIXP'].includes(ticker)) {
            sector = 'Потребительские товары';
        }
        
        // Рассчитываем вес в портфеле
        const totalPortfolioValue = portfolioData.totalValue || 0;
        const weight = totalPortfolioValue > 0 ? (marketValue / totalPortfolioValue) * 100 : 0;
        
        // Формируем историю сделок
        const history = trades.map(trade => ({
            date: new Date(trade.timestamp).toISOString().split('T')[0],
            action: trade.action,
            price: trade.price,
            quantity: trade.quantity,
            amount: trade.price * trade.quantity,
            commission: trade.commission || 0
        })).sort((a, b) => new Date(b.date) - new Date(a.date));
        
        // Получаем информацию о дивидендах (заглушка, так как у нас нет DividendService)
        const dividends = [];
        
        // Рассчитываем реализованную прибыль/убыток
        let realizedPnL = 0;
        if (sellTrades.length > 0) {
            const totalSold = sellTrades.reduce((sum, t) => sum + (t.price * t.quantity), 0);
            const avgBuyPrice = buyTrades.length > 0 ? 
                buyTrades.reduce((sum, t) => sum + (t.price * t.quantity), 0) / 
                buyTrades.reduce((sum, t) => sum + t.quantity, 0) : 0;
            const soldQuantity = sellTrades.reduce((sum, t) => sum + t.quantity, 0);
            realizedPnL = totalSold - (avgBuyPrice * soldQuantity);
        }
        
        const positionDetails = {
            figi,
            ticker: instrument.ticker,
            name: instrument.name,
            quantity,
            averagePrice: Math.round(averagePrice * 100) / 100,
            currentPrice: Math.round(currentPrice * 100) / 100,
            marketValue: Math.round(marketValue),
            unrealizedPnL: Math.round(unrealizedPnL),
            unrealizedPnLPercent: Math.round(unrealizedPnLPercent * 100) / 100,
            realizedPnL: Math.round(realizedPnL),
            weight: Math.round(weight * 100) / 100,
            sector,
            currency: instrument.currency || 'RUB',
            history,
            dividends,
            statistics: {
                totalTrades: trades.length,
                buyTrades: buyTrades.length,
                sellTrades: sellTrades.length,
                totalInvested: buyTrades.reduce((sum, t) => sum + (t.price * t.quantity), 0),
                totalCommissions: trades.reduce((sum, t) => sum + (t.commission || 0), 0)
            },
            lastUpdate: new Date().toISOString()
        };
        
        res.json({
            success: true,
            data: positionDetails,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Ошибка получения деталей позиции:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
        }
    }
});

// Получить историю портфеля
router.get('/portfolio/history', async (req, res) => {
    try {
        const { period = '1M' } = req.query;
        const TradingEngine = (await import('../services/TradingEngine.js')).default;
        
        // Получаем данные портфеля
        const portfolioData = await TradingEngine.getPortfolioValue();
        const trades = portfolioData.trades || [];
        
        // Группируем сделки по датам для построения истории
        const tradesByDate = {};
        const currentValue = portfolioData.totalValue || 0;
        const initialValue = portfolioData.cash || 1000000; // Начальная сумма
        
        // Обрабатываем сделки
        trades.forEach(trade => {
            const date = new Date(trade.timestamp).toISOString().split('T')[0];
            if (!tradesByDate[date]) {
                tradesByDate[date] = { trades: [], netFlow: 0 };
            }
            tradesByDate[date].trades.push(trade);
            
            // Рассчитываем денежный поток
            const amount = trade.price * trade.quantity;
            tradesByDate[date].netFlow += trade.action === 'BUY' ? -amount : amount;
        });
        
        // Генерируем историю за указанный период
        const endDate = new Date();
        let startDate = new Date();
        
        switch (period) {
            case '1W':
                startDate.setDate(endDate.getDate() - 7);
                break;
            case '1M':
                startDate.setMonth(endDate.getMonth() - 1);
                break;
            case '3M':
                startDate.setMonth(endDate.getMonth() - 3);
                break;
            case '6M':
                startDate.setMonth(endDate.getMonth() - 6);
                break;
            case '1Y':
                startDate.setFullYear(endDate.getFullYear() - 1);
                break;
            default:
                startDate.setMonth(endDate.getMonth() - 1);
        }
        
        const historyData = [];
        let runningValue = initialValue;
        let runningPnL = 0;
        
        // Генерируем точки данных
        const daysBetween = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
        const step = Math.max(1, Math.floor(daysBetween / 20)); // Максимум 20 точек
        
        for (let i = 0; i <= daysBetween; i += step) {
            const date = new Date(startDate);
            date.setDate(startDate.getDate() + i);
            const dateStr = date.toISOString().split('T')[0];
            
            // Применяем сделки до этой даты
            if (tradesByDate[dateStr]) {
                runningValue += tradesByDate[dateStr].netFlow;
                runningPnL += tradesByDate[dateStr].netFlow;
            }
            
            // Для последней точки используем текущую стоимость
            const value = (i === daysBetween || date >= endDate) ? currentValue : runningValue;
            const pnl = value - initialValue;
            
            historyData.push({
                date: dateStr,
                value: Math.round(value),
                pnl: Math.round(pnl)
            });
        }
        
        // Если нет сделок, создаем простую историю на основе реальных данных
        if (historyData.length === 0) {
            const points = 10;
            for (let i = 0; i < points; i++) {
                const date = new Date(startDate);
                date.setDate(startDate.getDate() + (i * daysBetween / points));
                
                // Линейная интерполяция между начальным и текущим значением (более реалистично)
                const progress = i / (points - 1);
                const value = initialValue + (currentValue - initialValue) * progress;
                
                historyData.push({
                    date: date.toISOString().split('T')[0],
                    value: Math.round(value),
                    pnl: Math.round(value - initialValue)
                });
            }
        }
        
        const history = {
            period,
            data: historyData.sort((a, b) => new Date(a.date) - new Date(b.date))
        };
        
        res.json({
            success: true,
            data: history,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Ошибка получения истории портфеля:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
        }
    }
});

// Получить аналитику портфеля
router.get('/portfolio/analytics', async (req, res) => {
    try {
        const TradingEngine = (await import('../services/TradingEngine.js')).default;
        const TinkoffApiService = (await import('../services/TinkoffApiService.js')).default;
        
        // Получаем данные портфеля
        const portfolioData = await TradingEngine.getPortfolioValue();
        const totalValue = portfolioData.totalValue || 0;
        const trades = portfolioData.trades || [];
        
        // Анализ диверсификации
        const sectorData = {};
        let positionsCount = 0;
        
        if (portfolioData.positions && Object.keys(portfolioData.positions).length > 0) {
            for (const [figi, quantity] of Object.entries(portfolioData.positions)) {
                if (quantity > 0) {
                    positionsCount++;
                    try {
                        const instrument = await TinkoffApiService.getInstrumentByFigi(figi);
                        const currentPrice = await TinkoffApiService.getLastPrice(figi);
                        
                        if (instrument && currentPrice) {
                            const marketValue = currentPrice * quantity;
                            
                            // Определяем сектор
                            let sector = 'Неизвестно';
                            const ticker = instrument.ticker.toUpperCase();
                            if (['SBER', 'VTBR', 'GAZS'].includes(ticker)) {
                                sector = 'Финансы';
                            } else if (['GAZP', 'LKOH', 'ROSN', 'NVTK'].includes(ticker)) {
                                sector = 'Энергетика';
                            } else if (['YNDX', 'OZON', 'VKCO'].includes(ticker)) {
                                sector = 'IT';
                            } else if (['MGNT', 'FIVE', 'FIXP'].includes(ticker)) {
                                sector = 'Потребительские товары';
                            }
                            
                            if (!sectorData[sector]) {
                                sectorData[sector] = 0;
                            }
                            sectorData[sector] += marketValue;
                        }
                    } catch (error) {
                        console.warn(`Could not analyze ${figi}:`, error.message);
                    }
                }
            }
        }
        
        // Рассчитываем веса секторов
        const sectorWeights = Object.entries(sectorData).map(([sector, value]) => ({
            name: sector,
            weight: totalValue > 0 ? (value / totalValue) * 100 : 0,
            target: sector === 'Финансы' ? 30 : 
                   sector === 'Энергетика' ? 25 :
                   sector === 'IT' ? 20 :
                   sector === 'Потребительские товары' ? 15 : 10
        }));
        
        // Оценка диверсификации
        const diversificationScore = Math.min(100, 
            (positionsCount / 15) * 50 + // 50% за количество позиций (оптимум 15+)
            (Object.keys(sectorData).length / 5) * 50 // 50% за количество секторов (оптимум 5+)
        );
        
        // Рекомендации по диверсификации
        const diversificationRecommendations = [];
        if (positionsCount < 10) {
            diversificationRecommendations.push('Увеличьте количество позиций до 10-15');
        }
        if (Object.keys(sectorData).length < 3) {
            diversificationRecommendations.push('Добавьте позиции из других секторов');
        }
        
        const maxSectorWeight = Math.max(...sectorWeights.map(s => s.weight));
        if (maxSectorWeight > 50) {
            const dominantSector = sectorWeights.find(s => s.weight === maxSectorWeight);
            diversificationRecommendations.push(`Снизьте долю сектора "${dominantSector.name}" (${maxSectorWeight.toFixed(1)}%)`);
        }
        
        // Анализ производительности
        let ytdReturn = 0;
        let monthlyReturn = 0;
        let weeklyReturn = 0;
        let sharpeRatio = 0;
        let maxDrawdown = 0;
        
        if (trades.length > 0) {
            // Упрощенный расчет доходности
            const initialValue = 1000000; // Начальная сумма
            const currentReturn = (totalValue - initialValue) / initialValue;
            
            // Примерные расчеты на основе текущей доходности
            ytdReturn = currentReturn;
            monthlyReturn = currentReturn / 12; // Упрощенно
            weeklyReturn = currentReturn / 52; // Упрощенно
            
            // Sharpe ratio (упрощенно)
            const riskFreeRate = 0.08; // 8% годовых
            const volatility = 0.15; // Примерная волатильность
            sharpeRatio = (ytdReturn - riskFreeRate) / volatility;
            
            // Max drawdown (упрощенно)
            maxDrawdown = Math.abs(Math.min(0, currentReturn * 0.3)); // Примерно 30% от текущего убытка
        }
        
        // Риск-метрики
        const beta = 1.0; // Базовая бета
        const volatility = 0.15 + (maxSectorWeight / 100) * 0.1; // Волатильность увеличивается с концентрацией
        
        const analytics = {
            diversification: {
                score: Math.round(diversificationScore),
                recommendations: diversificationRecommendations
            },
            riskMetrics: {
                beta: Math.round(beta * 100) / 100,
                volatility: Math.round(volatility * 100) / 100,
                sharpeRatio: Math.round(sharpeRatio * 100) / 100,
                maxDrawdown: Math.round(maxDrawdown * 100) / 100
            },
            performance: {
                ytdReturn: Math.round(ytdReturn * 10000) / 100, // В процентах
                monthlyReturn: Math.round(monthlyReturn * 10000) / 100,
                weeklyReturn: Math.round(weeklyReturn * 10000) / 100
            },
            allocation: {
                sectors: sectorWeights
            },
            summary: {
                totalPositions: positionsCount,
                totalSectors: Object.keys(sectorData).length,
                cashRatio: totalValue > 0 ? ((portfolioData.cash || 0) / totalValue) * 100 : 0,
                lastUpdate: new Date().toISOString()
            }
        };
        
        res.json({
            success: true,
            data: analytics,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Ошибка получения аналитики портфеля:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
        }
    }
});

// Получить распределение портфеля по секторам
router.get('/portfolio/sector-allocation', async (req, res) => {
    try {
        const TradingEngine = (await import('../services/TradingEngine.js')).default;
        const TinkoffApiService = (await import('../services/TinkoffApiService.js')).default;
        
        // Получаем данные портфеля
        const portfolioData = await TradingEngine.getPortfolioValue();
        const sectorData = {};
        let totalValue = portfolioData.cash || 0;
        
        // Обрабатываем позиции
        if (portfolioData.positions && Object.keys(portfolioData.positions).length > 0) {
            for (const [figi, quantity] of Object.entries(portfolioData.positions)) {
                if (quantity > 0) {
                    try {
                        const instrument = await TinkoffApiService.getInstrumentByFigi(figi);
                        const currentPrice = await TinkoffApiService.getLastPrice(figi);
                        
                        if (instrument && currentPrice) {
                            const marketValue = currentPrice * quantity;
                            totalValue += marketValue;
                            
                            // Определяем сектор
                            let sector = 'Неизвестно';
                            const ticker = instrument.ticker.toUpperCase();
                            if (['SBER', 'VTBR', 'GAZS'].includes(ticker)) {
                                sector = 'Финансы';
                            } else if (['GAZP', 'LKOH', 'ROSN', 'NVTK'].includes(ticker)) {
                                sector = 'Энергетика';
                            } else if (['YNDX', 'OZON', 'VKCO'].includes(ticker)) {
                                sector = 'IT';
                            } else if (['MGNT', 'FIVE', 'FIXP'].includes(ticker)) {
                                sector = 'Ритейл';
                            }
                            
                            if (!sectorData[sector]) {
                                sectorData[sector] = { value: 0, count: 0 };
                            }
                            sectorData[sector].value += marketValue;
                            sectorData[sector].count += 1;
                        }
                    } catch (error) {
                        console.warn(`Could not process sector for ${figi}:`, error.message);
                    }
                }
            }
        }
        
        // Добавляем наличные как отдельный "сектор"
        if (portfolioData.cash > 0) {
            sectorData['Наличные'] = {
                value: portfolioData.cash,
                count: 1
            };
        }
        
        // Формируем результат
        const sectorAllocation = Object.entries(sectorData).map(([sector, data]) => ({
            sector,
            value: data.value,
            weight: totalValue > 0 ? (data.value / totalValue) * 100 : 0,
            count: data.count
        }));
        
        res.json({
            success: true,
            data: sectorAllocation,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Ошибка получения распределения по секторам:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
        }
    }
});

// Получить риск-метрики портфеля
router.get('/portfolio/risk-metrics', async (req, res) => {
    try {
        const TradingEngine = (await import('../services/TradingEngine.js')).default;
        const RiskManagementService = (await import('../services/RiskManagementService.js')).default;
        
        // Получаем данные портфеля
        const portfolioData = await TradingEngine.getPortfolioValue();
        const totalValue = portfolioData.totalValue || 0;
        
        // Рассчитываем базовые риск-метрики
        let var95 = 0;
        let expectedShortfall = 0;
        let beta = 1.0;
        let volatility = 0.15; // Базовая волатильность
        let herfindahlIndex = 0;
        let topPositionsWeight = 0;
        
        if (portfolioData.positions && Object.keys(portfolioData.positions).length > 0) {
            const positions = Object.entries(portfolioData.positions).filter(([_, qty]) => qty > 0);
            
            // Рассчитываем индекс Херфиндаля (концентрация)
            let sumSquaredWeights = 0;
            const positionWeights = [];
            
            for (const [figi, quantity] of positions) {
                try {
                    const TinkoffApiService = (await import('../services/TinkoffApiService.js')).default;
                    const currentPrice = await TinkoffApiService.getLastPrice(figi);
                    if (currentPrice) {
                        const marketValue = currentPrice * quantity;
                        const weight = totalValue > 0 ? marketValue / totalValue : 0;
                        positionWeights.push(weight);
                        sumSquaredWeights += weight * weight;
                    }
                } catch (error) {
                    console.warn(`Could not calculate risk for ${figi}:`, error.message);
                }
            }
            
            herfindahlIndex = sumSquaredWeights;
            
            // Топ позиции (3 крупнейшие)
            positionWeights.sort((a, b) => b - a);
            topPositionsWeight = positionWeights.slice(0, 3).reduce((sum, w) => sum + w, 0) * 100;
            
            // Упрощенный расчет VaR (5% от портфеля при волатильности 15%)
            var95 = totalValue * 0.15 * 1.645; // 95% VaR
            expectedShortfall = var95 * 1.3; // Expected Shortfall обычно больше VaR
            
            // Бета портфеля (упрощенно - средневзвешенная бета позиций)
            // Для российских акций используем примерные значения
            const estimatedBetas = {
                'SBER': 1.2, 'VTBR': 1.4, 'GAZP': 0.9, 'LKOH': 0.8,
                'YNDX': 1.6, 'OZON': 2.0, 'MGNT': 0.7
            };
            
            let weightedBeta = 0;
            let totalWeight = 0;
            
            for (let i = 0; i < positions.length && i < positionWeights.length; i++) {
                const [figi] = positions[i];
                const weight = positionWeights[i];
                
                try {
                    const TinkoffApiService = (await import('../services/TinkoffApiService.js')).default;
                    const instrument = await TinkoffApiService.getInstrumentByFigi(figi);
                    if (instrument) {
                        const ticker = instrument.ticker.toUpperCase();
                        const instrumentBeta = estimatedBetas[ticker] || 1.0;
                        weightedBeta += instrumentBeta * weight;
                        totalWeight += weight;
                    }
                } catch (error) {
                    // Используем бету по умолчанию
                    weightedBeta += 1.0 * weight;
                    totalWeight += weight;
                }
            }
            
            beta = totalWeight > 0 ? weightedBeta / totalWeight : 1.0;
            
            // Волатильность портфеля (упрощенно)
            volatility = Math.min(0.4, Math.max(0.1, beta * 0.15 + herfindahlIndex * 0.1));
        }
        
        // Получаем статистику риск-менеджмента
        let riskStats = {};
        try {
            riskStats = RiskManagementService.getDetailedStats();
        } catch (error) {
            console.warn('Could not get risk management stats:', error.message);
        }
        
        // Формируем рекомендации
        const recommendations = [];
        if (herfindahlIndex > 0.25) {
            recommendations.push('Высокая концентрация портфеля - рассмотрите диверсификацию');
        }
        if (topPositionsWeight > 60) {
            recommendations.push('Топ-3 позиции составляют более 60% портфеля');
        }
        if (beta > 1.3) {
            recommendations.push('Высокая бета портфеля - повышенный рыночный риск');
        }
        if (volatility > 0.25) {
            recommendations.push('Высокая волатильность портфеля');
        }
        
        const riskMetrics = {
            var95: Math.round(var95),
            expectedShortfall: Math.round(expectedShortfall),
            beta: Math.round(beta * 100) / 100,
            volatility: Math.round(volatility * 100) / 100,
            concentrationRisk: {
                herfindahlIndex: Math.round(herfindahlIndex * 100) / 100,
                topPositionsWeight: Math.round(topPositionsWeight * 100) / 100,
                recommendation: recommendations.length > 0 ? recommendations[0] : 'Риски в пределах нормы'
            },
            riskManagementStats: riskStats,
            recommendations
        };
        
        res.json({
            success: true,
            data: riskMetrics,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Ошибка получения риск-метрик портфеля:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
        }
    }
});

// ============================================================================
// МАСШТАБИРОВАНИЕ КАПИТАЛА (ЭТАП 3)
// ============================================================================

// Получить статус масштабирования капитала
router.get('/capital-scaling/status', async (req, res) => {
    try {
        const CapitalScalingService = (await import('../services/CapitalScalingService.js')).default;
        const status = await CapitalScalingService.getStatus();
        res.json({ success: true, data: status });
    } catch (error) {
        console.error('❌ Ошибка получения статуса масштабирования:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Анализ производительности
router.get('/capital-scaling/performance', async (req, res) => {
    try {
        const CapitalScalingService = (await import('../services/CapitalScalingService.js')).default;
        const { period = 'month', days = 30 } = req.query;
        const analysis = await CapitalScalingService.analyzePerformance(period, parseInt(days));
        res.json({ success: true, data: analysis });
    } catch (error) {
        console.error('❌ Ошибка анализа производительности:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Проверка готовности к увеличению капитала
router.get('/capital-scaling/can-increase', async (req, res) => {
    try {
        const CapitalScalingService = (await import('../services/CapitalScalingService.js')).default;
        const validation = await CapitalScalingService.canIncreaseCapital();
        res.json({ success: true, data: validation });
    } catch (error) {
        console.error('❌ Ошибка проверки готовности:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Увеличить капитал
router.post('/capital-scaling/increase', async (req, res) => {
    try {
        const CapitalScalingService = (await import('../services/CapitalScalingService.js')).default;
        const { amount, reason } = req.body;
        const result = await CapitalScalingService.increaseCapital(amount, reason);
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('❌ Ошибка увеличения капитала:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Снизить капитал
router.post('/capital-scaling/decrease', async (req, res) => {
    try {
        const CapitalScalingService = (await import('../services/CapitalScalingService.js')).default;
        const { amount, reason } = req.body;
        const result = await CapitalScalingService.decreaseCapital(amount, reason);
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('❌ Ошибка снижения капитала:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Автоматическая корректировка капитала
router.post('/capital-scaling/auto-adjust', async (req, res) => {
    try {
        const CapitalScalingService = (await import('../services/CapitalScalingService.js')).default;
        const result = await CapitalScalingService.autoAdjustCapital();
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('❌ Ошибка автоматической корректировки:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Получить историю изменений капитала
router.get('/capital-scaling/history', async (req, res) => {
    try {
        const CapitalScalingService = (await import('../services/CapitalScalingService.js')).default;
        const { limit = 50 } = req.query;
        const history = await CapitalScalingService.getCapitalHistory(parseInt(limit));
        res.json({ success: true, data: history });
    } catch (error) {
        console.error('❌ Ошибка получения истории:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Получить информацию об уровнях капитала
router.get('/capital-scaling/levels', async (req, res) => {
    try {
        const CapitalScalingService = (await import('../services/CapitalScalingService.js')).default;
        const levels = CapitalScalingService.getCapitalLevelsInfo();
        res.json({ success: true, data: levels });
    } catch (error) {
        console.error('❌ Ошибка получения уровней капитала:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Обновить уровни капитала
router.post('/capital-scaling/levels', async (req, res) => {
    try {
        const CapitalScalingService = (await import('../services/CapitalScalingService.js')).default;
        const { levels } = req.body;
        const result = await CapitalScalingService.updateCapitalLevels(levels);
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('❌ Ошибка обновления уровней капитала:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Обновить настройки масштабирования
router.post('/capital-scaling/settings', async (req, res) => {
    try {
        const CapitalScalingService = (await import('../services/CapitalScalingService.js')).default;
        const settings = req.body;
        const result = await CapitalScalingService.updateScalingSettings(settings);
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('❌ Ошибка обновления настроек:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// КОРРЕКТИРОВКА РИСКОВ
// ============================================================================

// Получить статус корректировки рисков
router.get('/risk-adjustment/status', async (req, res) => {
    try {
        const RiskAdjustmentService = (await import('../services/RiskAdjustmentService.js')).default;
        const status = await RiskAdjustmentService.getStatus();
        res.json({ success: true, data: status });
    } catch (error) {
        console.error('❌ Ошибка получения статуса корректировки рисков:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Анализ состояния рисков
router.get('/risk-adjustment/analysis', async (req, res) => {
    try {
        const RiskAdjustmentService = (await import('../services/RiskAdjustmentService.js')).default;
        const analysis = await RiskAdjustmentService.analyzeRiskStatus();
        res.json({ success: true, data: analysis });
    } catch (error) {
        console.error('❌ Ошибка анализа рисков:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Автоматическая корректировка рисков
router.post('/risk-adjustment/auto-adjust', async (req, res) => {
    try {
        const RiskAdjustmentService = (await import('../services/RiskAdjustmentService.js')).default;
        const result = await RiskAdjustmentService.autoAdjustRisk();
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('❌ Ошибка автоматической корректировки:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Получить историю корректировок
router.get('/risk-adjustment/history', async (req, res) => {
    try {
        const RiskAdjustmentService = (await import('../services/RiskAdjustmentService.js')).default;
        const { limit = 50 } = req.query;
        const history = RiskAdjustmentService.getAdjustmentHistory(parseInt(limit));
        res.json({ success: true, data: history });
    } catch (error) {
        console.error('❌ Ошибка получения истории корректировок:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Обновить настройки корректировки
router.post('/risk-adjustment/settings', async (req, res) => {
    try {
        const RiskAdjustmentService = (await import('../services/RiskAdjustmentService.js')).default;
        const settings = req.body;
        const result = await RiskAdjustmentService.updateAdjustmentSettings(settings);
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('❌ Ошибка обновления настроек:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// АНАЛИЗ ПРОИЗВОДИТЕЛЬНОСТИ
// ============================================================================

// Получить статус анализа производительности
router.get('/performance-analyzer/status', async (req, res) => {
    try {
        const PerformanceAnalyzer = (await import('../services/PerformanceAnalyzer.js')).default;
        const status = await PerformanceAnalyzer.getStatus();
        res.json({ success: true, data: status });
    } catch (error) {
        console.error('❌ Ошибка получения статуса анализа:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Комплексный анализ производительности
router.get('/performance-analyzer/analysis', async (req, res) => {
    try {
        const PerformanceAnalyzer = (await import('../services/PerformanceAnalyzer.js')).default;
        const { period = 'medium', days = null } = req.query;
        const analysis = await PerformanceAnalyzer.analyzePerformance(period, days ? parseInt(days) : null);
        res.json({ success: true, data: analysis });
    } catch (error) {
        console.error('❌ Ошибка анализа производительности:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Генерация отчета о производительности
router.get('/performance-analyzer/report', async (req, res) => {
    try {
        const PerformanceAnalyzer = (await import('../services/PerformanceAnalyzer.js')).default;
        const { period = 'medium', days = null } = req.query;
        const report = await PerformanceAnalyzer.generateReport(period, days ? parseInt(days) : null);
        res.json({ success: true, data: report });
    } catch (error) {
        console.error('❌ Ошибка генерации отчета:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Очистить кеш анализа
router.post('/performance-analyzer/clear-cache', async (req, res) => {
    try {
        const PerformanceAnalyzer = (await import('../services/PerformanceAnalyzer.js')).default;
        PerformanceAnalyzer.clearCache();
        res.json({ success: true, message: 'Кеш очищен' });
    } catch (error) {
        console.error('❌ Ошибка очистки кеша:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// СТРАТЕГИЯ РАСПРЕДЕЛЕНИЯ КАПИТАЛА
// ============================================================================

// Получить статус стратегии распределения
router.get('/capital-allocation/status', async (req, res) => {
    try {
        const CapitalAllocationStrategy = (await import('../services/CapitalAllocationStrategy.js')).default;
        const status = await CapitalAllocationStrategy.getStatus();
        res.json({ success: true, data: status });
    } catch (error) {
        console.error('❌ Ошибка получения статуса распределения:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Анализ портфеля
router.get('/capital-allocation/portfolio-analysis', async (req, res) => {
    try {
        const CapitalAllocationStrategy = (await import('../services/CapitalAllocationStrategy.js')).default;
        const analysis = await CapitalAllocationStrategy.analyzePortfolio();
        res.json({ success: true, data: analysis });
    } catch (error) {
        console.error('❌ Ошибка анализа портфеля:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Оптимизация распределения
router.post('/capital-allocation/optimize', async (req, res) => {
    try {
        const CapitalAllocationStrategy = (await import('../services/CapitalAllocationStrategy.js')).default;
        const { strategy } = req.body;
        const optimization = await CapitalAllocationStrategy.optimizeAllocation(strategy);
        res.json({ success: true, data: optimization });
    } catch (error) {
        console.error('❌ Ошибка оптимизации распределения:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Автоматическая ребалансировка
router.post('/capital-allocation/auto-rebalance', async (req, res) => {
    try {
        const CapitalAllocationStrategy = (await import('../services/CapitalAllocationStrategy.js')).default;
        const result = await CapitalAllocationStrategy.autoRebalance();
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('❌ Ошибка ребалансировки:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Получить доступные инструменты
router.get('/capital-allocation/instruments', async (req, res) => {
    try {
        const CapitalAllocationStrategy = (await import('../services/CapitalAllocationStrategy.js')).default;
        const instruments = await CapitalAllocationStrategy.getAvailableInstruments();
        res.json({ success: true, data: instruments });
    } catch (error) {
        console.error('❌ Ошибка получения инструментов:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Получить историю ребалансировки
router.get('/capital-allocation/history', async (req, res) => {
    try {
        const CapitalAllocationStrategy = (await import('../services/CapitalAllocationStrategy.js')).default;
        const { limit = 50 } = req.query;
        const history = CapitalAllocationStrategy.getRebalancingHistory(parseInt(limit));
        res.json({ success: true, data: history });
    } catch (error) {
        console.error('❌ Ошибка получения истории:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Обновить настройки распределения
router.post('/capital-allocation/settings', async (req, res) => {
    try {
        const CapitalAllocationStrategy = (await import('../services/CapitalAllocationStrategy.js')).default;
        const settings = req.body;
        const result = await CapitalAllocationStrategy.updateAllocationSettings(settings);
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('❌ Ошибка обновления настроек:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// ВАЛИДАЦИЯ ЭТАПА 3
// ============================================================================

// Получить статус валидации
router.get('/stage3-validator/status', async (req, res) => {
    try {
        const Stage3Validator = (await import('../services/Stage3Validator.js')).default;
        const status = await Stage3Validator.getStatus();
        res.json({ success: true, data: status });
    } catch (error) {
        console.error('❌ Ошибка получения статуса валидации:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Выполнить валидацию готовности к Этапу 3
router.post('/stage3-validator/validate', async (req, res) => {
    try {
        const Stage3Validator = (await import('../services/Stage3Validator.js')).default;
        const validation = await Stage3Validator.validateStage3Readiness();
        res.json({ success: true, data: validation });
    } catch (error) {
        console.error('❌ Ошибка валидации Этапа 3:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Получить историю валидации
router.get('/stage3-validator/history', async (req, res) => {
    try {
        const Stage3Validator = (await import('../services/Stage3Validator.js')).default;
        const { limit = 20 } = req.query;
        const history = Stage3Validator.getValidationHistory(parseInt(limit));
        res.json({ success: true, data: history });
    } catch (error) {
        console.error('❌ Ошибка получения истории валидации:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// АНАЛИЗ НОВОСТЕЙ
// ============================================================================

// Получить новости для инструмента
router.get('/news/:figi', async (req, res) => {
    try {
        const NewsAnalysisService = (await import('../services/NewsAnalysisService.js')).default;
        const { figi } = req.params;
        const { limit = 10, days = 7 } = req.query;
        
        const news = await NewsAnalysisService.fetchNews(figi, { limit: parseInt(limit), days: parseInt(days) });
        res.json({ success: true, data: news });
    } catch (error) {
        console.error('❌ Ошибка получения новостей:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Анализ влияния новостей
router.get('/news/:figi/impact', async (req, res) => {
    try {
        const NewsAnalysisService = (await import('../services/NewsAnalysisService.js')).default;
        const { figi } = req.params;
        const { days = 30 } = req.query;
        
        const impact = await NewsAnalysisService.analyzeNewsImpact(figi, parseInt(days));
        res.json({ success: true, data: impact });
    } catch (error) {
        console.error('❌ Ошибка анализа влияния новостей:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Получить статус сервиса новостей
router.get('/news/status', async (req, res) => {
    try {
        const NewsAnalysisService = (await import('../services/NewsAnalysisService.js')).default;
        const status = NewsAnalysisService.getStatus();
        res.json({ success: true, data: status });
    } catch (error) {
        console.error('❌ Ошибка получения статуса новостей:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// АНАЛИЗ TELEGRAM КАНАЛОВ
// ============================================================================

// Анализ настроений в Telegram каналах
router.get('/telegram/sentiment/:figi', async (req, res) => {
    try {
        const TelegramSentimentService = (await import('../services/TelegramSentimentService.js')).default;
        const { figi } = req.params;
        const { days = 7, limit = 100 } = req.query;
        
        const sentiment = await TelegramSentimentService.analyzeTelegramSentiment(figi, {
            days: parseInt(days),
            limit: parseInt(limit)
        });
        res.json({ success: true, data: sentiment });
    } catch (error) {
        console.error('❌ Ошибка анализа настроений Telegram:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Добавить канал для мониторинга
router.post('/telegram/channels', async (req, res) => {
    try {
        const TelegramSentimentService = (await import('../services/TelegramSentimentService.js')).default;
        const { channel } = req.body;
        
        TelegramSentimentService.addChannel(channel);
        res.json({ success: true, message: `Канал ${channel} добавлен` });
    } catch (error) {
        console.error('❌ Ошибка добавления канала:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Удалить канал
router.delete('/telegram/channels/:channel', async (req, res) => {
    try {
        const TelegramSentimentService = (await import('../services/TelegramSentimentService.js')).default;
        const { channel } = req.params;
        
        TelegramSentimentService.removeChannel(channel);
        res.json({ success: true, message: `Канал ${channel} удален` });
    } catch (error) {
        console.error('❌ Ошибка удаления канала:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Получить список каналов
router.get('/telegram/channels', async (req, res) => {
    try {
        const TelegramSentimentService = (await import('../services/TelegramSentimentService.js')).default;
        const channels = TelegramSentimentService.getAddedChannels();
        res.json({ success: true, data: channels });
    } catch (error) {
        console.error('❌ Ошибка получения каналов:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Проверить доступность канала
router.get('/telegram/channels/:channel/check', async (req, res) => {
    try {
        const TelegramSentimentService = (await import('../services/TelegramSentimentService.js')).default;
        const { channel } = req.params;
        
        const status = await TelegramSentimentService.checkChannelAvailability(channel);
        res.json({ success: true, data: status });
    } catch (error) {
        console.error('❌ Ошибка проверки канала:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Получить статус сервиса Telegram
router.get('/telegram/status', async (req, res) => {
    try {
        const TelegramSentimentService = (await import('../services/TelegramSentimentService.js')).default;
        const status = TelegramSentimentService.getStatus();
        res.json({ success: true, data: status });
    } catch (error) {
        console.error('❌ Ошибка получения статуса Telegram:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// ОТСЛЕЖИВАНИЕ ПРИБЫЛЬНОСТИ
// ============================================================================

// Получить статус отслеживания прибыльности
router.get('/profitability/status', async (req, res) => {
    try {
        const ProfitabilityTracker = (await import('../services/ProfitabilityTracker.js')).default;
        const status = await ProfitabilityTracker.getStatus();
        res.json({ success: true, data: status });
    } catch (error) {
        console.error('❌ Ошибка получения статуса прибыльности:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Анализ прибыльности
router.get('/profitability/analysis', async (req, res) => {
    try {
        const ProfitabilityTracker = (await import('../services/ProfitabilityTracker.js')).default;
        const { period = 'month', days = 30 } = req.query;
        const analysis = await ProfitabilityTracker.analyzeProfitability(period, parseInt(days));
        res.json({ success: true, data: analysis });
    } catch (error) {
        console.error('❌ Ошибка анализа прибыльности:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Генерация отчета о прибыльности
router.get('/profitability/report', async (req, res) => {
    try {
        const ProfitabilityTracker = (await import('../services/ProfitabilityTracker.js')).default;
        const { period = 'month', days = 30 } = req.query;
        const report = await ProfitabilityTracker.generateReport(period, parseInt(days));
        res.json({ success: true, data: report });
    } catch (error) {
        console.error('❌ Ошибка генерации отчета:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// МИГРАЦИЯ ПОРТФЕЛЯ И ПРЕДВАРИТЕЛЬНЫЕ ПРОВЕРКИ
// ============================================================================

// Создать план миграции портфеля
router.post('/portfolio-migrator/create-plan', async (req, res) => {
    try {
        const { realCapital } = req.body;
        const PortfolioMigrator = (await import('../services/PortfolioMigrator.js')).default;
        const TradingEngine = (await import('../services/TradingEngine.js')).default;
        
        if (!realCapital || realCapital <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Неверная сумма реального капитала'
            });
        }
        
        const virtualPortfolio = TradingEngine.virtualPortfolio;
        const result = await PortfolioMigrator.createMigrationPlan(virtualPortfolio, realCapital);
        
        res.json({
            success: true,
            result,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Ошибка создания плана миграции:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
        }
    }
});

// Выполнить миграцию портфеля
router.post('/portfolio-migrator/execute', async (req, res) => {
    try {
        const { migrationPlan } = req.body;
        const PortfolioMigrator = (await import('../services/PortfolioMigrator.js')).default;
        
        if (!migrationPlan || !Array.isArray(migrationPlan)) {
            return res.status(400).json({
                success: false,
                error: 'Неверный план миграции'
            });
        }
        
        const result = await PortfolioMigrator.executeMigration(migrationPlan);
        
        res.json({
            success: true,
            result,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Ошибка выполнения миграции:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
        }
    }
});

// Получить статус миграции
router.get('/portfolio-migrator/status', async (req, res) => {
    try {
        const PortfolioMigrator = (await import('../services/PortfolioMigrator.js')).default;
        const status = await PortfolioMigrator.getStatus();
        
        res.json({
            success: true,
            status,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Ошибка получения статуса миграции:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
        }
    }
});

// Получить историю миграций
router.get('/portfolio-migrator/history', async (req, res) => {
    try {
        const { limit = 50 } = req.query;
        const PortfolioMigrator = (await import('../services/PortfolioMigrator.js')).default;
        const history = await PortfolioMigrator.getMigrationHistory(parseInt(limit));
        
        res.json({
            success: true,
            history,
            count: history.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Ошибка получения истории миграций:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
        }
    }
});

// Получить активные миграции
router.get('/portfolio-migrator/active', async (req, res) => {
    try {
        const PortfolioMigrator = (await import('../services/PortfolioMigrator.js')).default;
        const activeMigrations = await PortfolioMigrator.getActiveMigrations();
        
        res.json({
            success: true,
            activeMigrations,
            count: activeMigrations.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Ошибка получения активных миграций:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
        }
    }
});

// Очистить старые миграции
router.post('/portfolio-migrator/cleanup', async (req, res) => {
    try {
        const { daysOld = 30 } = req.body;
        const PortfolioMigrator = (await import('../services/PortfolioMigrator.js')).default;
        const deletedCount = await PortfolioMigrator.cleanupOldMigrations(parseInt(daysOld));
        
        res.json({
            success: true,
            message: `Удалено ${deletedCount} старых миграций`,
            deletedCount,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Ошибка очистки старых миграций:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
        }
    }
});

// Остановить миграцию
router.post('/portfolio-migrator/stop', async (req, res) => {
    try {
        const PortfolioMigrator = (await import('../services/PortfolioMigrator.js')).default;
        await PortfolioMigrator.stopMigration();
        
        res.json({
            success: true,
            message: 'Миграция остановлена',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Ошибка остановки миграции:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
        }
    }
});

// Получить настройки миграции
router.get('/portfolio-migrator/settings', async (req, res) => {
    try {
        const PortfolioMigrator = (await import('../services/PortfolioMigrator.js')).default;
        const settings = PortfolioMigrator.getMigrationSettings();
        
        res.json({
            success: true,
            settings,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Ошибка получения настроек миграции:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
        }
    }
});

// Обновить настройки миграции
router.post('/portfolio-migrator/settings', async (req, res) => {
    try {
        const { settings } = req.body;
        const PortfolioMigrator = (await import('../services/PortfolioMigrator.js')).default;
        
        if (!settings || typeof settings !== 'object') {
            return res.status(400).json({
                success: false,
                error: 'Неверные настройки миграции'
            });
        }
        
        await PortfolioMigrator.updateMigrationSettings(settings);
        
        res.json({
            success: true,
            message: 'Настройки миграции обновлены',
            settings: PortfolioMigrator.getMigrationSettings(),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Ошибка обновления настроек миграции:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
        }
    }
});

// Выполнить предварительную проверку системы
router.post('/preflight-check/run', async (req, res) => {
    try {
        const PreflightCheckService = (await import('../services/PreflightCheckService.js')).default;
        const results = await PreflightCheckService.runPreflightChecks();
        
        res.json({
            success: true,
            results,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Ошибка предварительной проверки:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
        }
    }
});

// Получить статус предварительной проверки
router.get('/preflight-check/status', async (req, res) => {
    try {
        const PreflightCheckService = (await import('../services/PreflightCheckService.js')).default;
        const status = PreflightCheckService.getStatus();
        
        res.json({
            success: true,
            status,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Ошибка получения статуса проверки:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
        }
    }
});

// Получить детальные результаты проверки
router.get('/preflight-check/results', async (req, res) => {
    try {
        const PreflightCheckService = (await import('../services/PreflightCheckService.js')).default;
        const results = PreflightCheckService.getDetailedResults();
        
        res.json({
            success: true,
            results,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Ошибка получения результатов проверки:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
        }
    }
});

// ============================================================================
// ИНТЕГРИРОВАННЫЕ AI СЕРВИСЫ
// ============================================================================

/**
 * Инициализация интегрированного AI сервиса
 */
router.post('/ai/initialize', async (req, res) => {
    try {
        // Проверяем, инициализирован ли уже сервис
        if (IntegratedAIService.isInitialized) {
            res.json({
                success: true,
                message: 'Integrated AI Service already initialized',
                data: IntegratedAIService.getStatus()
            });
            return;
        }
        
        await IntegratedAIService.initialize();
        res.json({
            success: true,
            message: 'Integrated AI Service initialized',
            data: IntegratedAIService.getStatus()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка инициализации AI сервиса',
            error: error.message
        });
        }
    }
});

/**
 * Получение интегрированной рекомендации
 */
router.post('/ai/recommendation', async (req, res) => {
    try {
        const { figi, portfolio } = req.body;
        
        if (!figi) {
            return res.status(400).json({
                success: false,
                message: 'FIGI is required'
            });
        }

        const recommendation = await IntegratedAIService.getIntegratedRecommendation(figi, portfolio);
        
        res.json({
            success: true,
            data: recommendation
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка получения рекомендации',
            error: error.message
        });
        }
    }
});

/**
 * Обучение всех AI сетей (полное)
 */
router.post('/ai/train', async (req, res) => {
    try {
        const { figi, options = {} } = req.body;
        
        if (!figi) {
            return res.status(400).json({
                success: false,
                message: 'FIGI is required'
            });
        }

        const results = await IntegratedAIService.trainAllNetworks(figi, options);
        
        res.json({
            success: true,
            data: results
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка обучения AI сетей',
            error: error.message
        });
        }
    }
});

/**
 * Полное обучение (evaluation)
 */
router.post('/evaluation/run-full-training', async (req, res) => {
    try {
        const { figi, options = {} } = req.body;
        
        if (!figi) {
            return res.status(400).json({
                success: false,
                message: 'FIGI is required'
            });
        }

        console.log(`🚀 Starting full training evaluation for ${figi}...`);
        
        // Запускаем полное обучение всех сетей
        const results = await IntegratedAIService.trainAllNetworks(figi, {
            ...options,
            fullTraining: true,
            evaluation: true
        });
        
        res.json({
            success: true,
            message: 'Полное обучение завершено',
            data: results,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Ошибка полного обучения:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка полного обучения',
            error: error.message
        });
        }
    }
});

/**
 * Частичное обучение (дообучение)
 */
router.post('/ai/partial-train', async (req, res) => {
    try {
        const { figi, options = {} } = req.body;
        
        if (!figi) {
            return res.status(400).json({
                success: false,
                message: 'FIGI is required'
            });
        }

        const results = await IntegratedAIService.partialTraining(figi, options);
        
        // Отправляем уведомление о завершении дообучения для одного инструмента
        await OptimizedTelegramService.sendPartialTrainingComplete(figi, options, results);
        
        res.json({
            success: true,
            data: results
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка частичного обучения',
            error: error.message
        });
        }
    }
});

/**
 * Статус интегрированного AI сервиса
 */
router.get('/ai/status', async (req, res) => {
    try {
        const status = IntegratedAIService.getDetailedStats();
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статуса AI',
            error: error.message
        });
        }
    }
});

/**
 * Загрузка всех моделей
 */
router.post('/ai/load-models', async (req, res) => {
    try {
        const results = await IntegratedAIService.loadAllModels();
        res.json({
            success: true,
            message: 'All models loaded',
            data: results
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка загрузки моделей',
            error: error.message
        });
        }
    }
});

/**
 * Сохранение всех моделей
 */
router.post('/ai/save-models', async (req, res) => {
    try {
        const results = await IntegratedAIService.saveAllModels();
        res.json({
            success: true,
            message: 'All models saved',
            data: results
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка сохранения моделей',
            error: error.message
        });
        }
    }
});

// ============================================================================
// АНСАМБЛЬ НЕЙРОСЕТЕЙ
// ============================================================================

/**
 * Инициализация ансамбля
 */
router.post('/ensemble/initialize', async (req, res) => {
    try {
        // Проверяем, инициализирован ли уже сервис
        if (EnsembleService.isInitialized) {
            res.json({
                success: true,
                message: 'Ensemble already initialized',
                data: EnsembleService.getStatus()
            });
            return;
        }
        
        await EnsembleService.initialize();
        res.json({
            success: true,
            message: 'Ensemble initialized',
            data: EnsembleService.getStatus()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка инициализации ансамбля',
            error: error.message
        });
        }
    }
});

// Helper: run optimized training worker (single/batch)
function runOptimizedTrainingWorker(mode, payload) {
    return new Promise((resolve, reject) => {
        const workerPath = path.join(__dirname, '../workers/optimizedTrainingWorker.js');
        
        // Передаем инициализированные сервисы в воркер
        const workerData = {
            mode,
            payload,
            services: {
                // Передаем необходимые сервисы для обучения
                OptimizedDataService: OptimizedDataService,
                CacheService: CacheService,
                OptimizedTelegramService: OptimizedTelegramService,
                NeuralNetworkService: NeuralNetworkService
            }
        };
        
        const worker = new Worker(workerPath, { workerData });

        worker.on('message', (msg) => {
            if (msg?.type === 'done') {
                resolve(msg.data);
            } else if (msg?.type === 'error') {
                reject(new Error(msg.data.error));
            }
        });
        worker.on('error', reject);
        worker.on('exit', (code) => {
            if (code !== 0) {
                reject(new Error(`Worker stopped with exit code ${code}`));
            }
        });
    });
}

/**
 * Обучение ансамбля
 */
import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function runEnsembleWorker(figi, options) {
    return new Promise((resolve, reject) => {
        const workerPath = path.join(__dirname, '../workers/ensembleWorker.js');
        
        // Передаем инициализированные сервисы в воркер
        const workerData = {
            figi,
            options,
            services: {
                // Передаем только необходимые сервисы
                EnsembleService: EnsembleService,
                CacheService: CacheService,
                OptimizedTelegramService: OptimizedTelegramService
            }
        };
        
        const worker = new Worker(workerPath, { workerData });

        worker.on('message', (msg) => {
            if (msg?.type === 'done') {
                resolve(msg.data.result);
            } else if (msg?.type === 'error') {
                reject(new Error(msg.data.error));
            }
        });
        worker.on('error', reject);
        worker.on('exit', (code) => {
            if (code !== 0) {
                reject(new Error(`Worker stopped with exit code ${code}`));
            }
        });
    });
}

router.post('/ensemble/train', async (req, res) => {
    try {
        const { figi, options = {} } = req.body;
        
        if (!figi) {
            return res.status(400).json({
                success: false,
                message: 'FIGI is required'
            });
        }

        const result = await runEnsembleWorker(figi, options);
        
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка обучения ансамбля:', error);
        
        // Отправляем алерт в Telegram об ошибке обучения ансамбля
        try {
            const OptimizedTelegramService = (await import('../services/OptimizedTelegramService.js')).default;
            await OptimizedTelegramService.sendAlert(
                'ENSEMBLE_TRAINING_ERROR',
                `❌ <b>ОШИБКА ОБУЧЕНИЯ АНСАМБЛЯ</b>\n\n📈 Инструмент: <b>${figi}</b>\n🔍 Ошибка: ${error.message}\n⏰ Время: ${new Date().toLocaleString('ru-RU')}`,
                'error'
            );
        } catch (telegramError) {
            console.warn('Failed to send ensemble training error alert:', telegramError.message);
        }
        
        res.status(500).json({
            success: false,
            message: 'Ошибка обучения ансамбля',
            error: error.message
        });
        }
    }
});

/**
 * Пакетное обучение ансамбля для множества инструментов
 */
router.post('/ensemble/train-batch', async (req, res) => {
    try {
        const { instruments, options = {} } = req.body;

        if (!Array.isArray(instruments) || instruments.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Instruments array is required'
            });
        }

        const results = [];
        const errors = [];

        for (const instrument of instruments) {
            const figi = typeof instrument === 'string' ? instrument : instrument?.figi;
            const name = typeof instrument === 'string' ? instrument : instrument?.name || figi;
            if (!figi) {
                errors.push({ instrument, error: 'Invalid instrument: missing figi' });
                continue;
            }
            try {
                const result = await runEnsembleWorker(figi, options);
                results.push({ figi, name, result });
            } catch (e) {
                errors.push({ figi, name, error: e.message });
            }
        }

        const summary = {
            total: instruments.length,
            successful: results.length,
            failed: errors.length,
            results,
            errors
        };

        res.json({ success: true, data: summary });
    } catch (error) {
        console.error('Ошибка пакетного обучения ансамбля:', error);
        
        // Отправляем алерт в Telegram об ошибке пакетного обучения ансамбля
        try {
            const OptimizedTelegramService = (await import('../services/OptimizedTelegramService.js')).default;
            await OptimizedTelegramService.sendAlert(
                'ENSEMBLE_BATCH_TRAINING_ERROR',
                `❌ <b>ОШИБКА ПАКЕТНОГО ОБУЧЕНИЯ АНСАМБЛЯ</b>\n\n📊 Инструментов: <b>${instruments.length}</b>\n🔍 Ошибка: ${error.message}\n⏰ Время: ${new Date().toLocaleString('ru-RU')}`,
                'error'
            );
        } catch (telegramError) {
            console.warn('Failed to send ensemble batch training error alert:', telegramError.message);
        }
        
        res.status(500).json({
            success: false,
            message: 'Ошибка пакетного обучения ансамбля',
            error: error.message
        });
        }
    }
});

/**
 * Предсказание ансамбля
 */
router.post('/ensemble/predict', async (req, res) => {
    try {
        const { figi, portfolio } = req.body;
        
        if (!figi) {
            return res.status(400).json({
                success: false,
                message: 'FIGI is required'
            });
        }

        const prediction = await EnsembleService.predict(figi, portfolio);
        
        res.json({
            success: true,
            data: prediction
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка предсказания ансамбля',
            error: error.message
        });
        }
    }
});

/**
 * Статус ансамбля (дублирующий роут удален)
 */

// ============================================================================
// META-LEARNING
// ============================================================================

/**
 * Инициализация Meta-Learning
 */
router.post('/meta-learning/initialize', async (req, res) => {
    try {
        // Проверяем, инициализирован ли уже сервис
        if (MetaLearningService.isInitialized) {
            res.json({
                success: true,
                message: 'Meta-Learning already initialized',
                data: MetaLearningService.getStatus()
            });
            return;
        }
        
        await MetaLearningService.initialize();
        res.json({
            success: true,
            message: 'Meta-Learning initialized',
            data: MetaLearningService.getStatus()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка инициализации Meta-Learning',
            error: error.message
        });
        }
    }
});

/**
 * Адаптация к задаче
 */
router.post('/meta-learning/adapt', async (req, res) => {
    try {
        const { taskData, targetModel, adaptationSteps = 5 } = req.body;
        
        if (!taskData) {
            return res.status(400).json({
                success: false,
                message: 'Task data is required'
            });
        }

        const result = await MetaLearningService.adaptToTask(taskData, targetModel, adaptationSteps);
        
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка адаптации к задаче',
            error: error.message
        });
        }
    }
});

/**
 * Поиск похожих задач
 */
router.post('/meta-learning/find-similar', async (req, res) => {
    try {
        const { marketData, taskType, performance, limit = 10 } = req.body;
        
        if (!marketData || !taskType) {
            return res.status(400).json({
                success: false,
                message: 'Market data and task type are required'
            });
        }

        const similarTasks = await MetaLearningService.findSimilarTasks(marketData, taskType, performance, limit);
        
        res.json({
            success: true,
            data: {
                similarTasks,
                count: similarTasks.length
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка поиска похожих задач',
            error: error.message
        });
        }
    }
});

/**
 * Статистика Meta-Learning
 */
router.get('/meta-learning/stats', async (req, res) => {
    try {
        const stats = MetaLearningService.getStats();
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статистики Meta-Learning',
            error: error.message
        });
        }
    }
});

// Остановить адаптацию мета-обучения
router.post('/meta-learning/stop', async (req, res) => {
    try {
        const result = await MetaLearningService.stopAdaptation();
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('❌ Error stopping meta-learning adaptation:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
        }
    }
});

// ============================================================================
// REINFORCEMENT LEARNING
// ============================================================================

/**
 * Инициализация RL агента
 */
router.post('/reinforcement-learning/initialize', async (req, res) => {
    try {
        // Проверяем, инициализирован ли уже сервис
        if (ReinforcementLearningService.isInitialized) {
            res.json({
                success: true,
                message: 'RL agent already initialized',
                data: ReinforcementLearningService.getStats()
            });
            return;
        }
        
        await ReinforcementLearningService.initialize();
        res.json({
            success: true,
            message: 'RL agent initialized',
            data: ReinforcementLearningService.getStats()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка инициализации RL агента',
            error: error.message
        });
        }
    }
});

/**
 * Обучение RL агента
 */
router.post('/reinforcement-learning/train', async (req, res) => {
    try {
        const { figi, episodes = 50, days = 30, initialPortfolio } = req.body;
        
        if (!figi) {
            return res.status(400).json({
                success: false,
                message: 'FIGI is required'
            });
        }

        // Запуск обучения RL в воркере
        const rlWorkerPath = path.join(__dirname, '../workers/rlTrainingWorker.js');
        const result = await new Promise((resolve, reject) => {
            const worker = new Worker(rlWorkerPath, {
                workerData: { figi, options: { episodes, days, initialPortfolio } }
            });
            worker.on('message', (msg) => {
                if (msg?.type === 'done') resolve(msg.data);
                else if (msg?.type === 'error') reject(new Error(msg.data.error));
            });
            worker.on('error', reject);
            worker.on('exit', (code) => {
                if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
            });
        });
        
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка обучения RL агента:', error);
        
        // Отправляем алерт в Telegram об ошибке обучения RL
        try {
            const OptimizedTelegramService = (await import('../services/OptimizedTelegramService.js')).default;
            await OptimizedTelegramService.sendAlert(
                'REINFORCEMENT_LEARNING_TRAINING_ERROR',
                `❌ <b>ОШИБКА ОБУЧЕНИЯ RL АГЕНТА</b>\n\n📈 Инструмент: <b>${figi}</b>\n🔍 Ошибка: ${error.message}\n⏰ Время: ${new Date().toLocaleString('ru-RU')}`,
                'error'
            );
        } catch (telegramError) {
            console.warn('Failed to send RL training error alert:', telegramError.message);
        }
        
        res.status(500).json({
            success: false,
            message: 'Ошибка обучения RL агента',
            error: error.message
        });
        }
    }
});

/**
 * Получение рекомендации RL агента
 */
router.post('/reinforcement-learning/recommendation', async (req, res) => {
    try {
        const { figi, portfolio } = req.body;
        
        if (!figi || !portfolio) {
            return res.status(400).json({
                success: false,
                message: 'FIGI and portfolio are required'
            });
        }

        const recommendation = await ReinforcementLearningService.getTradingRecommendation(figi, portfolio);
        
        res.json({
            success: true,
            data: recommendation
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка получения рекомендации RL агента',
            error: error.message
        });
        }
    }
});

/**
 * Статистика RL агента
 */
router.get('/reinforcement-learning/stats', async (req, res) => {
    try {
        const stats = ReinforcementLearningService.getStats();
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статистики RL агента',
            error: error.message
        });
        }
    }
});

// Остановить обучение RL
router.post('/reinforcement-learning/stop', async (req, res) => {
    try {
        const result = await ReinforcementLearningService.stopTraining();
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('❌ Error stopping RL training:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
        }
    }
});

// Сбросить агента RL
router.post('/reinforcement-learning/reset', async (req, res) => {
    try {
        const result = await ReinforcementLearningService.resetAgent();
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('❌ Error resetting RL agent:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
        }
    }
});

// ========================================
// УПРАВЛЕНИЕ КЕШЕМ НОВОСТЕЙ И TELEGRAM
// ========================================

// Обновить настройки кеша новостей
router.post('/notifications/cache/news', async (req, res) => {
    try {
        const { interval } = req.body;
        
        if (!interval) {
            return res.status(400).json({
                success: false,
                error: 'Не указан интервал обновления'
            });
        }
        
        await SettingsService.updateSetting('news_cache_update_interval', interval, 'notifications');
        
        res.json({
            success: true,
            message: 'Настройки кеша новостей обновлены',
            data: { interval }
        });
    } catch (error) {
        console.error('❌ Ошибка обновления настроек кеша новостей:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка обновления настроек кеша новостей',
            details: error.message
        });
        }
    }
});

// Обновить настройки кеша Telegram
router.post('/notifications/cache/telegram', async (req, res) => {
    try {
        const { interval } = req.body;
        
        if (!interval) {
            return res.status(400).json({
                success: false,
                error: 'Не указан интервал обновления'
            });
        }
        
        await SettingsService.updateSetting('telegram_cache_update_interval', interval, 'notifications');
        
        res.json({
            success: true,
            message: 'Настройки кеша Telegram обновлены',
            data: { interval }
        });
    } catch (error) {
        console.error('❌ Ошибка обновления настроек кеша Telegram:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка обновления настроек кеша Telegram',
            details: error.message
        });
        }
    }
});

// Получить статус кеша новостей
router.get('/notifications/cache/news/status', async (req, res) => {
    try {
        const CachedNews = (await import('../models/CachedNews.js')).default;
        
        const totalNews = await CachedNews.count();
        const expiredNews = await CachedNews.count({
            where: {
                expiresAt: {
                    [Op.lt]: new Date()
                }
            }
        });
        
        const recentNews = await CachedNews.count({
            where: {
                cachedAt: {
                    [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000)
                }
            }
        });
        
        res.json({
            success: true,
            data: {
                totalNews,
                expiredNews,
                recentNews,
                activeNews: totalNews - expiredNews
            }
        });
    } catch (error) {
        console.error('❌ Ошибка получения статуса кеша новостей:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка получения статуса кеша новостей',
            details: error.message
        });
        }
    }
});

// Получить статус кеша Telegram
router.get('/notifications/cache/telegram/status', async (req, res) => {
    try {
        const CachedTelegramSentiment = (await import('../models/CachedTelegramSentiment.js')).default;
        
        const totalSentiments = await CachedTelegramSentiment.count();
        const expiredSentiments = await CachedTelegramSentiment.count({
            where: {
                expiresAt: {
                    [Op.lt]: new Date()
                }
            }
        });
        
        const recentSentiments = await CachedTelegramSentiment.count({
            where: {
                cachedAt: {
                    [Op.gte]: new Date(Date.now() - 6 * 60 * 60 * 1000)
                }
            }
        });
        
        res.json({
            success: true,
            data: {
                totalSentiments,
                expiredSentiments,
                recentSentiments,
                activeSentiments: totalSentiments - expiredSentiments
            }
        });
    } catch (error) {
        console.error('❌ Ошибка получения статуса кеша Telegram:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка получения статуса кеша Telegram',
            details: error.message
        });
        }
    }
});

// Принудительная очистка кеша новостей
router.post('/notifications/cache/news/cleanup', async (req, res) => {
    try {
        const NewsAnalysisService = (await import('../services/NewsAnalysisService.js')).default;
        await NewsAnalysisService.cleanExpiredNews();
        
        res.json({
            success: true,
            message: 'Кеш новостей очищен'
        });
    } catch (error) {
        console.error('❌ Ошибка очистки кеша новостей:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка очистки кеша новостей',
            details: error.message
        });
        }
    }
});

// Принудительная очистка кеша Telegram
router.post('/notifications/cache/telegram/cleanup', async (req, res) => {
    try {
        const TelegramSentimentService = (await import('../services/TelegramSentimentService.js')).default;
        await TelegramSentimentService.cleanExpiredSentiments();
        
        res.json({
            success: true,
            message: 'Кеш Telegram очищен'
        });
    } catch (error) {
        console.error('❌ Ошибка очистки кеша Telegram:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка очистки кеша Telegram',
            details: error.message
        });
        }
    }
});

// ============================================================================
// ERROR LOGGING
// ============================================================================

/**
 * Логирование ошибок фронтенда
 */
router.post('/errors', async (req, res) => {
    try {
        const {
            message,
            stack,
            componentStack,
            timestamp,
            userAgent,
            url
        } = req.body;

        // Логируем ошибку
        console.error('🚨 Frontend Error:', {
            message,
            stack,
            componentStack,
            timestamp,
            userAgent,
            url,
            ip: req.ip
        });

        // Здесь можно добавить отправку в систему мониторинга
        // например, Sentry, LogRocket, или сохранение в БД

        res.json({
            success: true,
            message: 'Error logged successfully'
        });
    } catch (error) {
        console.error('❌ Failed to log frontend error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to log error'
        });
        }
    }
});

// ============================================================================
// ТОРГОВЫЕ ЗАЯВКИ (TRADING REQUESTS)
// ============================================================================

/**
 * Получение списка торговых заявок
 */
router.get('/trading-requests', async (req, res) => {
    try {
        const { status, limit = 50, tradingMode } = req.query;
        const TradingRequestService = (await import('../services/TradingRequestService.js')).default;
        
        const requests = await TradingRequestService.getRequests(status, parseInt(limit), tradingMode);
        
        res.json({
            success: true,
            data: requests
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка получения торговых заявок',
            error: error.message
        });
        }
    }
});

/**
 * Получение ожидающих заявок
 */
router.get('/trading-requests/pending', async (req, res) => {
    try {
        const { tradingMode } = req.query;
        const TradingRequestService = (await import('../services/TradingRequestService.js')).default;
        
        const requests = await TradingRequestService.getPendingRequests(tradingMode);
        
        res.json({
            success: true,
            data: requests
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка получения ожидающих заявок',
            error: error.message
        });
        }
    }
});

/**
 * Получение одобренных заявок
 */
router.get('/trading-requests/approved', async (req, res) => {
    try {
        const { tradingMode } = req.query;
        const TradingRequestService = (await import('../services/TradingRequestService.js')).default;
        
        const requests = await TradingRequestService.getApprovedRequests(tradingMode);
        
        res.json({
            success: true,
            data: requests
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка получения одобренных заявок',
            error: error.message
        });
        }
    }
});

/**
 * Создание торговой заявки из рекомендации
 */
router.post('/trading-requests/create', async (req, res) => {
    try {
        const { recommendationFigi, options = {} } = req.body;
        
        if (!recommendationFigi) {
            return res.status(400).json({
                success: false,
                message: 'Recommendation FIGI is required'
            });
        }
        
        const TradingRequestService = (await import('../services/TradingRequestService.js')).default;
        
        const request = await TradingRequestService.createTradingRequest(recommendationFigi, options);
        
        res.json({
            success: true,
            data: request
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка создания торговой заявки',
            error: error.message
        });
        }
    }
});

/**
 * Массовое создание торговых заявок
 */
router.post('/trading-requests/create-bulk', async (req, res) => {
    try {
        const { recommendationFigis, options = {} } = req.body;
        
        if (!recommendationFigis || !Array.isArray(recommendationFigis)) {
            return res.status(400).json({
                success: false,
                message: 'Recommendation FIGIs array is required'
            });
        }
        
        const TradingRequestService = (await import('../services/TradingRequestService.js')).default;
        
        const result = await TradingRequestService.createBulkTradingRequests(recommendationFigis, options);
        
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка массового создания заявок',
            error: error.message
        });
        }
    }
});

/**
 * Подтверждение торговой заявки
 */
router.post('/trading-requests/:id/approve', async (req, res) => {
    try {
        const { id } = req.params;
        const { comment } = req.body;
        
        const TradingRequestService = (await import('../services/TradingRequestService.js')).default;
        
        const request = await TradingRequestService.approveRequest(id, comment);
        
        res.json({
            success: true,
            data: request
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка подтверждения заявки',
            error: error.message
        });
        }
    }
});

/**
 * Отклонение торговой заявки
 */
router.post('/trading-requests/:id/reject', async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        
        if (!reason) {
            return res.status(400).json({
                success: false,
                message: 'Rejection reason is required'
            });
        }
        
        const TradingRequestService = (await import('../services/TradingRequestService.js')).default;
        
        const request = await TradingRequestService.rejectRequest(id, reason);
        
        res.json({
            success: true,
            data: request
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка отклонения заявки',
            error: error.message
        });
        }
    }
});

/**
 * Исполнение торговой заявки
 */
router.post('/trading-requests/:id/execute', async (req, res) => {
    try {
        const { id } = req.params;
        
        const TradingRequestService = (await import('../services/TradingRequestService.js')).default;
        
        const result = await TradingRequestService.executeRequest(id);
        
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка исполнения заявки',
            error: error.message
        });
        }
    }
});

/**
 * Отмена торговой заявки
 */
router.post('/trading-requests/:id/cancel', async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        
        const TradingRequestService = (await import('../services/TradingRequestService.js')).default;
        
        const request = await TradingRequestService.cancelRequest(id, reason);
        
        res.json({
            success: true,
            data: request
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка отмены заявки',
            error: error.message
        });
        }
    }
});

/**
 * Массовое подтверждение заявок
 */
router.post('/trading-requests/bulk-approve', async (req, res) => {
    try {
        const { requestIds, comment } = req.body;
        
        if (!requestIds || !Array.isArray(requestIds)) {
            return res.status(400).json({
                success: false,
                message: 'Request IDs array is required'
            });
        }
        
        const TradingRequestService = (await import('../services/TradingRequestService.js')).default;
        
        const result = await TradingRequestService.bulkApprove(requestIds, comment);
        
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка массового подтверждения',
            error: error.message
        });
        }
    }
});

/**
 * Массовое отклонение заявок
 */
router.post('/trading-requests/bulk-reject', async (req, res) => {
    try {
        const { requestIds, reason } = req.body;
        
        if (!requestIds || !Array.isArray(requestIds)) {
            return res.status(400).json({
                success: false,
                message: 'Request IDs array is required'
            });
        }
        
        if (!reason) {
            return res.status(400).json({
                success: false,
                message: 'Rejection reason is required'
            });
        }
        
        const TradingRequestService = (await import('../services/TradingRequestService.js')).default;
        
        const result = await TradingRequestService.bulkReject(requestIds, reason);
        
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка массового отклонения',
            error: error.message
        });
        }
    }
});

/**
 * Статистика торговых заявок
 */
router.get('/trading-requests/stats', async (req, res) => {
    try {
        const { tradingMode } = req.query;
        const TradingRequestService = (await import('../services/TradingRequestService.js')).default;
        
        const stats = await TradingRequestService.getRequestStats(tradingMode);
        
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статистики',
            error: error.message
        });
        }
    }
});

/**
 * Статистика торговых заявок по всем режимам
 */
router.get('/trading-requests/stats-by-mode', async (req, res) => {
    try {
        const TradingRequestService = (await import('../services/TradingRequestService.js')).default;
        
        const stats = await TradingRequestService.getStatsByMode();
        
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статистики по режимам',
            error: error.message
        });
        }
    }
});

/**
 * Пакетное обучение Meta-Learning для множества инструментов
 */
router.post('/meta-learning/train-batch', async (req, res) => {
    try {
        const { instruments, options = {} } = req.body;

        if (!Array.isArray(instruments) || instruments.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Instruments array is required'
            });
        }

        console.log('🧠 Starting batch meta-learning training...');
        
        // Сразу возвращаем 200
        res.json({
            success: true,
            message: 'Meta-learning batch training started',
            data: {
                instrumentsCount: instruments.length,
                status: 'started'
            }
        });
        
        // Отправляем уведомление о начале обучения
        const WebSocketService = ServiceManager.getService('WebSocketService');
        if (WebSocketService) {
            WebSocketService.broadcast('meta_learning_batch_started', {
            success: true,
            instrumentsCount: instruments.length,
            timestamp: new Date().toISOString()
        });
        
        // Запускаем обучение в фоне
        const MetaLearningService = (await import('../services/MetaLearningService.js')).default;
        const results = [];
        let successCount = 0;
        let failCount = 0;

        for (const instrument of instruments) {
            const figi = typeof instrument === 'string' ? instrument : instrument?.figi;
            try {
                console.log(`🧠 Meta-learning training for ${figi}...`);
                const result = await MetaLearningService.train(figi, options);
                results.push({ figi, success: true, result });
                successCount++;
            } catch (error) {
                console.error(`❌ Meta-learning failed for ${figi}:`, error.message);
                
                // Отправляем алерт в Telegram об ошибке обучения Meta-Learning
                try {
                    const OptimizedTelegramService = (await import('../services/OptimizedTelegramService.js')).default;
                    await OptimizedTelegramService.sendAlert(
                        'META_LEARNING_TRAINING_ERROR',
                        `❌ <b>ОШИБКА ОБУЧЕНИЯ META-LEARNING</b>\n\n📈 Инструмент: <b>${figi}</b>\n🔍 Ошибка: ${error.message}\n⏰ Время: ${new Date().toLocaleString('ru-RU')}`,
                        'error'
                    );
                } catch (telegramError) {
                    console.warn('Failed to send meta-learning training error alert:', telegramError.message);
                }
                
                results.push({ figi, success: false, error: error.message });
                failCount++;
            }
        }

        const summary = {
            total: instruments.length,
            success: successCount,
            failed: failCount,
            results
        };

        console.log('✅ Meta-learning batch training completed:', summary);
        
        // Отправляем уведомление о завершении
        const WebSocketService = ServiceManager.getService('WebSocketService');
        if (WebSocketService) {
            WebSocketService.broadcast('meta_learning_batch_completed', {
            success: true,
            summary,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Meta-learning batch training failed:', error);
        
        // Отправляем уведомление об ошибке
        const WebSocketService = ServiceManager.getService('WebSocketService');
        if (WebSocketService) {
            WebSocketService.broadcast('meta_learning_batch_failed', {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
        }
    }
});

/**
 * Пакетное обучение Reinforcement Learning для множества инструментов
 */
router.post('/reinforcement-learning/train-batch', async (req, res) => {
    try {
        const { instruments, options = {} } = req.body;

        if (!Array.isArray(instruments) || instruments.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Instruments array is required'
            });
        }

        console.log('🤖 Starting batch reinforcement learning training...');
        
        // Сразу возвращаем 200
        res.json({
            success: true,
            message: 'Reinforcement learning batch training started',
            data: {
                instrumentsCount: instruments.length,
                status: 'started'
            }
        });
        
        // Отправляем уведомление о начале обучения
        const WebSocketService = ServiceManager.getService('WebSocketService');
        if (WebSocketService) {
            WebSocketService.broadcast('rl_batch_started', {
            success: true,
            instrumentsCount: instruments.length,
            timestamp: new Date().toISOString()
        });
        
        // Запускаем обучение в фоне
        const ReinforcementLearningService = (await import('../services/ReinforcementLearningService.js')).default;
        const results = [];
        let successCount = 0;
        let failCount = 0;

        for (const instrument of instruments) {
            const figi = typeof instrument === 'string' ? instrument : instrument?.figi;
            try {
                console.log(`🤖 RL training for ${figi}...`);
                const result = await ReinforcementLearningService.train(figi, options);
                results.push({ figi, success: true, result });
                successCount++;
            } catch (error) {
                console.error(`❌ RL training failed for ${figi}:`, error.message);
                
                // Отправляем алерт в Telegram об ошибке обучения RL
                try {
                    const OptimizedTelegramService = (await import('../services/OptimizedTelegramService.js')).default;
                    await OptimizedTelegramService.sendAlert(
                        'REINFORCEMENT_LEARNING_TRAINING_ERROR',
                        `❌ <b>ОШИБКА ОБУЧЕНИЯ RL АГЕНТА</b>\n\n📈 Инструмент: <b>${figi}</b>\n🔍 Ошибка: ${error.message}\n⏰ Время: ${new Date().toLocaleString('ru-RU')}`,
                        'error'
                    );
                } catch (telegramError) {
                    console.warn('Failed to send RL training error alert:', telegramError.message);
                }
                
                results.push({ figi, success: false, error: error.message });
                failCount++;
            }
        }

        const summary = {
            total: instruments.length,
            success: successCount,
            failed: failCount,
            results
        };

        console.log('✅ RL batch training completed:', summary);
        
        // Отправляем уведомление о завершении
        const WebSocketService = ServiceManager.getService('WebSocketService');
        if (WebSocketService) {
            WebSocketService.broadcast('rl_batch_completed', {
            success: true,
            summary,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ RL batch training failed:', error);
        
        // Отправляем уведомление об ошибке
        const WebSocketService = ServiceManager.getService('WebSocketService');
        if (WebSocketService) {
            WebSocketService.broadcast('rl_batch_failed', {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
        }
    }
});

export default router;
