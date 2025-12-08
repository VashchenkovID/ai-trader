import cron from 'node-cron';
import CacheService from './CacheService.js';
import OptimizedTelegramService from './OptimizedTelegramService.js';
import NeuralNetworkService from './NeuralNetworkService.js';
import IntegratedAIService from './IntegratedAIService.js';
import SettingsService from './SettingsService.js';
import TradingHoursService from './TradingHoursService.js';
import TradingHoursCacheService from './TradingHoursCacheService.js';
import { Op } from 'sequelize';
import { getService } from './GlobalServiceManager.js';

class SchedulerService {
    constructor() {
        this.cacheTask = null;
        this.cleanupTask = null;
        this.newsCleanupTask = null;
        this.newsDailyUpdateTask = null;
        this.telegramCacheTask = null;
        this.trainingTask = null;
        this.quickTrainingTask = null;
        this.tradingHoursTask = null;
        this.tradingHoursCacheTask = null;
        this.degradationCheckTask = null;
        this.portfolioAnalysisTask = null;
        this.predictionsUpdateTask = null;
        this.isInitialized = null;
        this.isTraining = false;
        this.isAnalyzing = false;
        this.lastCacheUpdate = null; // Время последнего обновления кеша
        this.cacheUpdateInterval = 4 * 60 * 60 * 1000; // 4 часа в миллисекундах
        this.intervals = new Set(); // Храним все интервалы для очистки
        this.workers = new Set(); // Храним все worker'ы для завершения
        this.webSocketService = null; // Кэшируем WebSocketService
    }

    /**
     * Устанавливает WebSocketService (передается извне)
     */
    setWebSocketService(webSocketService) {
        this.webSocketService = webSocketService;
        console.log('🔌 WebSocketService set in SchedulerService');
    }

    /**
     * Получает WebSocketService
     */
    getWebSocketService() {
        if (!this.webSocketService) {
            console.warn('⚠️ WebSocketService not set, getting from global ServiceManager');
            // Получаем уже инициализированный экземпляр из глобального ServiceManager
            this.webSocketService = getService('WebSocketService');
            if (!this.webSocketService) {
                console.warn('⚠️ WebSocketService not available, skipping broadcast');
                return null;
            }
            console.log('🔌 WebSocketService retrieved from global ServiceManager');
        }
        return this.webSocketService;
    }

    async initialize() {
        try {
            console.log('🕐 Initializing Scheduler Service...');
            
            // Загружаем время последнего обновления кеша из настроек
            await this.loadLastCacheUpdateTime();
            
            await this.start();
            this.isInitialized = true;
            console.log('✅ Scheduler Service initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize Scheduler Service:', error);
            throw error;
        }
    }

    async start() {
        console.log('Starting scheduled tasks...');

        // Получаем настройки планировщика
        const schedulerSettings = await SettingsService.getSchedulerSettings();
        const nnSettings = await SettingsService.getNeuralNetworkSettings();
        const notificationSettings = await SettingsService.getNotificationSettings();
        const cacheSchedule = schedulerSettings.cache_update_interval || '0 */4 * * *';
        const trainingSchedule = schedulerSettings.nn_training_schedule || '0 3 * * 1';
        const quickTrainingSchedule = schedulerSettings.nn_training_interval || '*/30 * * * *';
        const newsCacheSchedule = notificationSettings.news_cache_update_interval || '0 */6 * * *';
        const newsDailyUpdateSchedule = notificationSettings.news_daily_update_schedule || '0 9 * * *'; // Каждый день в 9:00
        const newsWeeklyCleanupSchedule = notificationSettings.news_weekly_cleanup_schedule || '0 3 * * 0'; // Каждое воскресенье в 3:00
        const telegramCacheSchedule = notificationSettings.telegram_cache_update_interval || '0 */6 * * *';
        const quickTrainingEnabled = nnSettings.nn_quick_training_enabled !== false;
        
        // Настраиваем интервал обновления кеша из настроек
        const cacheUpdateIntervalHours = schedulerSettings.cache_update_interval_hours || 4;
        this.cacheUpdateInterval = cacheUpdateIntervalHours * 60 * 60 * 1000; // конвертируем в миллисекунды

        // Задача 1: Обновление кеша акций
        this.cacheTask = cron.schedule(cacheSchedule, async () => {
            try {
                console.log('⏰ Scheduled cache update started...');
                
                // Проверяем, нужно ли обновлять кеш
                if (!(await this.shouldUpdateCache())) {
                    return;
                }
                
                await this.performCacheUpdate();
            } catch (error) {
                console.error('Error in scheduled cache update:', error);
                await OptimizedTelegramService.sendAlert('CACHE_UPDATE_ERROR', error.message, 'critical');
            }
        }, {
            scheduled: true,
            timezone: "Europe/Moscow"
        });

        // Задача 2: Очистка старых свечей каждые 24 часа
        this.cleanupTask = cron.schedule('0 2 * * *', async () => {
            try {
                console.log('🧹 Scheduled cleanup started...');
                await this.performCleanup();
            } catch (error) {
                console.error('Error in scheduled cleanup:', error);
            }
        }, {
            scheduled: true,
            timezone: "Europe/Moscow"
        });

        // Задача 3: Периодическое обучение нейросети
        this.trainingTask = cron.schedule(trainingSchedule, async () => {
            try {
                console.log('🧠 Scheduled neural network training started...');
                await this.performScheduledTraining();
            } catch (error) {
                console.error('Error in scheduled training:', error);
                await OptimizedTelegramService.sendAlert('CACHE_UPDATE_ERROR', error.message, 'critical');
            }
        }, {
            scheduled: true,
            timezone: "Europe/Moscow"
        });

        // Задача 4: Быстрое обучение нейросети (если включено)
        if (quickTrainingEnabled) {
            this.quickTrainingTask = cron.schedule(quickTrainingSchedule, async () => {
                try {
                    console.log('⚡ Quick neural network training started...');
                    await this.performQuickTraining();
                } catch (error) {
                    console.error('Error in quick training:', error);
                    // Не отправляем в Telegram для быстрого обучения, чтобы не спамить
                }
            }, {
                scheduled: true,
                timezone: "Europe/Moscow"
            });
        }

        // Задача 5: Обновление кеша торговых часов
        const tradingHoursSchedule = schedulerSettings.trading_hours_update_interval || '*/15 * * * *';
        this.tradingHoursCacheTask = cron.schedule(tradingHoursSchedule, async () => {
            try {
                console.log('🕐 Scheduled trading hours cache update started...');
                await TradingHoursCacheService.updateTradingHoursCache();
            } catch (error) {
                console.error('Error in scheduled trading hours cache update:', error);
            }
        }, {
            scheduled: true,
            timezone: "Europe/Moscow"
        });

        // Задача 6: Еженедельная очистка новостей старше года (каждое воскресенье в 3:00)
        this.newsCleanupTask = cron.schedule(newsWeeklyCleanupSchedule, async () => {
            try {
                console.log('📰 Scheduled weekly news cleanup (older than 1 year) started...');
                await this.performNewsCacheCleanup();
            } catch (error) {
                console.error('Error in scheduled weekly news cleanup:', error);
                await OptimizedTelegramService.sendAlert('NEWS_WEEKLY_CLEANUP_ERROR', error.message, 'warning');
            }
        }, {
            scheduled: true,
            timezone: "Europe/Moscow"
        });

        // Задача: Ежедневная проверка и загрузка свежих новостей
        this.newsDailyUpdateTask = cron.schedule(newsDailyUpdateSchedule, async () => {
            try {
                console.log('📰 Scheduled daily news update started...');
                await this.performDailyNewsUpdate();
            } catch (error) {
                console.error('Error in scheduled daily news update:', error);
                await OptimizedTelegramService.sendAlert('NEWS_DAILY_UPDATE_ERROR', error.message, 'warning');
            }
        }, {
            scheduled: true,
            timezone: "Europe/Moscow"
        });

        // Задача 7: Обновление кеша настроений Telegram (настраиваемое расписание)
        this.telegramCacheTask = cron.schedule(telegramCacheSchedule, async () => {
            try {
                console.log('📱 Scheduled Telegram sentiment cache update started...');
                await this.performTelegramCacheUpdate();
            } catch (error) {
                console.error('Error in scheduled Telegram cache update:', error);
                await OptimizedTelegramService.sendAlert('TELEGRAM_CACHE_UPDATE_ERROR', error.message, 'warning');
            }
        }, {
            scheduled: true,
            timezone: "Europe/Moscow"
        });

        // Задача 8: Проверка торговых часов и уведомлений (каждые 5 минут)
        this.tradingHoursTask = cron.schedule('*/5 * * * *', async () => {
            try {
                await TradingHoursService.checkAndSendNotifications();
            } catch (error) {
                console.error('Error checking trading hours notifications:', error);
            }
        }, {
            scheduled: true,
            timezone: "Europe/Moscow"
        });

        // Задача 9: Проверка деградации моделей и автоматическое восстановление (каждые 6 часов)
        const degradationCheckSchedule = schedulerSettings.degradation_check_interval || '0 */6 * * *';
        this.degradationCheckTask = cron.schedule(degradationCheckSchedule, async () => {
            try {
                console.log('🔍 Scheduled degradation check started...');
                await this.checkDegradationAndRestoreAll();
            } catch (error) {
                console.error('Error in scheduled degradation check:', error);
                await OptimizedTelegramService.sendAlert('DEGRADATION_CHECK_ERROR', error.message, 'warning');
            }
        }, {
            scheduled: true,
            timezone: "Europe/Moscow"
        });

        // Задача 10: Автоматический анализ портфеля (каждый час)
        this.portfolioAnalysisTask = cron.schedule('0 * * * *', async () => {
            try {
                console.log('📊 Scheduled portfolio analysis started...');
                await this.performPortfolioAnalysis();
            } catch (error) {
                console.error('Error in scheduled portfolio analysis:', error);
                await OptimizedTelegramService.sendAlert('PORTFOLIO_ANALYSIS_ERROR', error.message, 'warning');
            }
        }, {
            scheduled: true,
            timezone: "Europe/Moscow"
        });

        // Задача 11: Обновление предсказаний в рекомендациях каждые 20 минут
        this.predictionsUpdateTask = cron.schedule('*/20 * * * *', async () => {
            try {
                console.log('🔄 Scheduled predictions update started...');
                await this.updateRecommendationsPredictions();
            } catch (error) {
                console.error('Error in scheduled predictions update:', error);
                // Не отправляем в Telegram, чтобы не спамить при частых обновлениях
            }
        }, {
            scheduled: true,
            timezone: "Europe/Moscow"
        });

        // Первое обновление при запуске (через 1 минуту) - ОТКЛЮЧЕНО для отладки
        // setTimeout(() => {
        //     this.performCacheUpdate();
        // }, 60000);
        console.log('🚫 Startup cache update DISABLED for debugging');

        console.log('✅ Scheduled tasks started:');
        console.log(`   - Cache update: ${cacheSchedule} (interval: ${cacheUpdateIntervalHours}h)`);
        console.log('   - Cleanup: daily at 2:00 AM');
        console.log(`   - News cache cleanup: ${newsCacheSchedule}`);
        console.log(`   - Telegram cache update: ${telegramCacheSchedule}`);
        console.log(`   - Neural network training: ${trainingSchedule}`);
        if (quickTrainingEnabled) {
            console.log(`   - Quick neural network training: ${quickTrainingSchedule}`);
        }
        console.log(`   - Trading hours cache update: ${tradingHoursSchedule}`);
        console.log('   - Trading hours notifications: every 5 minutes');
        console.log('   - Predictions update: every 20 minutes');
        console.log(`   - Model degradation check: ${degradationCheckSchedule}`);
        console.log('   - Portfolio analysis: every hour');
        
        // Запускаем периодическую отправку данных через WebSocket
        this.startWebSocketBroadcasts();
    }

    /**
     * Проверяет, устарел ли кеш (нет свежих данных)
     */
    async isCacheStale() {
        try {
            // Проверяем, есть ли свежие данные в кеше
            const instruments = await CacheService.getAllInstruments(1); // Берем только 1 инструмент для проверки
            console.log(`🔍 Cache staleness check: found ${instruments?.length || 0} instruments`);
            
            if (!instruments || instruments.length === 0) {
                console.log('📅 Cache is empty, update needed');
                return true;
            }
            
            // Проверяем время последнего обновления инструмента
            const lastUpdate = instruments[0].lastUpdated;
            console.log(`🔍 Last update time: ${lastUpdate ? new Date(lastUpdate).toISOString() : 'null'}`);
            
            if (!lastUpdate) {
                console.log('📅 No update time in cache, update needed');
                return true;
            }
            
            const timeSinceUpdate = Date.now() - new Date(lastUpdate).getTime();
            const isStale = timeSinceUpdate > this.cacheUpdateInterval;
            
            if (isStale) {
                const hoursSinceUpdate = Math.round(timeSinceUpdate / (60 * 60 * 1000));
                console.log(`📅 Cache is stale: ${hoursSinceUpdate}h since last update, update needed`);
            } else {
                const remainingTime = Math.round((this.cacheUpdateInterval - timeSinceUpdate) / (60 * 1000));
                console.log(`⏰ Cache is fresh: ${remainingTime}min until next update`);
            }
            
            return isStale;
        } catch (error) {
            console.error('❌ Error checking cache staleness:', error);
            // В случае ошибки считаем кеш устаревшим
            return true;
        }
    }

    /**
     * Проверяет, нужно ли обновлять кеш
     */
    async shouldUpdateCache() {
        
        if (!this.lastCacheUpdate) {
            // Проверяем, есть ли свежие данные в кеше
            const isStale = await this.isCacheStale();
            return isStale;
        }

        const timeSinceLastUpdate = Date.now() - this.lastCacheUpdate;
        const shouldUpdate = timeSinceLastUpdate >= this.cacheUpdateInterval;

        return shouldUpdate;
    }

    /**
     * Загружает время последнего обновления кеша из настроек
     */
    async loadLastCacheUpdateTime() {
        try {
            const lastUpdateSetting = await SettingsService.getSetting('last_cache_update_time');
            if (lastUpdateSetting) {
                this.lastCacheUpdate = new Date(lastUpdateSetting).getTime();
            } else {
                // При первом запуске проверяем свежесть кеша
                const isStale = await this.isCacheStale();
                if (isStale) {
                    this.lastCacheUpdate = null; // Устанавливаем null, чтобы shouldUpdateCache() вернул true
                } else {
                    this.lastCacheUpdate = Date.now();
                    await this.saveLastCacheUpdateTime();
                }
            }
        } catch (error) {
            console.error('❌ Error loading last cache update time:', error);
            // В случае ошибки проверяем свежесть кеша
            const isStale = await this.isCacheStale();
            this.lastCacheUpdate = isStale ? null : Date.now();
        }
    }

    /**
     * Сохраняет время последнего обновления кеша в настройки
     */
    async saveLastCacheUpdateTime() {
        try {
            if (!this.lastCacheUpdate) {
                return;
            }
            await SettingsService.setSetting('last_cache_update_time', new Date(this.lastCacheUpdate).toISOString());
            console.log(`💾 Saved last cache update time: ${new Date(this.lastCacheUpdate).toISOString()}`);
        } catch (error) {
            console.error('❌ Error saving last cache update time:', error);
        }
    }

    /**
     * Запускает периодическую отправку данных через WebSocket
     */
    startWebSocketBroadcasts() {
        // Отправляем данные о кеше каждые 30 секунд (cron: каждые 30 секунд)
        const cacheTask = cron.schedule('*/30 * * * * *', async () => {
            try {
                // Проверяем, не закрыта ли база данных
                if (!this.isInitialized) {
                    return;
                }
                
                const WebSocketService = this.getWebSocketService();
                if (WebSocketService) {
                    const cacheStatus = await this.getCacheStatus();
                    
                    WebSocketService.broadcast({
                        type: 'cache_status_update',
                        data: cacheStatus,
                        timestamp: new Date().toISOString()
                    });
                }
            } catch (error) {
                console.error('❌ Error broadcasting cache status:', error);
            }
        }, { scheduled: false });
        this.intervals.add(cacheTask);

        // Отправляем данные о системных ресурсах каждые 10 секунд (cron: каждые 10 секунд)
        const resourcesTask = cron.schedule('*/10 * * * * *', async () => {
            try {
                const WebSocketService = this.getWebSocketService();
                if (WebSocketService) {
                    const os = await import('os');
                    
                    // CPU информация
                    const cpus = os.default.cpus();
                    const cpuUsage = process.cpuUsage();
                    const cpuUsagePercent = Math.min((cpuUsage.user + cpuUsage.system) / 1000000, 100);
                    
                    // Memory информация
                    const totalMemory = os.default.totalmem();
                    const freeMemory = os.default.freemem();
                    const usedMemory = totalMemory - freeMemory;
                    const memoryUsagePercent = (usedMemory / totalMemory) * 100;
                    
                    const systemResources = {
                        cpu: {
                            usage: Math.round(cpuUsagePercent),
                            cores: cpus.length,
                            loadAverage: os.default.loadavg()
                        },
                        memory: {
                            used: Math.round(usedMemory / 1024 / 1024), // MB
                            total: Math.round(totalMemory / 1024 / 1024), // MB
                            free: Math.round(freeMemory / 1024 / 1024), // MB
                            usage: Math.round(memoryUsagePercent)
                        },
                        timestamp: new Date().toISOString()
                    };
                    
                    WebSocketService.broadcast({
                        type: 'system_resources_update',
                        data: systemResources,
                        timestamp: new Date().toISOString()
                    });
                }
            } catch (error) {
                console.error('❌ Error broadcasting system resources:', error);
            }
        }, { scheduled: false });
        this.intervals.add(resourcesTask);

        // Отправляем системный статус каждые 15 секунд (cron: каждые 15 секунд)
        const systemStatusTask = cron.schedule('*/15 * * * * *', async () => {
            try {
                const WebSocketService = this.getWebSocketService();
                if (WebSocketService) {
                    // Получаем сервисы из глобального ServiceManager
                    const NeuralNetworkService = getService('NeuralNetworkService');
                    const TradingEngine = getService('TradingEngine');
                    const EnsembleService = getService('EnsembleService');
                    const WebSocketService = getService('WebSocketService');
                    
                    // Получаем реальный статус системы с полными данными
                    let neuralNetworkStatus = {};
                    if (NeuralNetworkService) {
                        try {
                            // Используем getModelStatus() для получения полных данных
                            neuralNetworkStatus = NeuralNetworkService.getModelStatus();
                        } catch (error) {
                            console.warn('Error getting neural network status in scheduler:', error);
                            // Fallback к базовому статусу
                            neuralNetworkStatus = {
                                status: NeuralNetworkService.isTraining ? 'training' : (NeuralNetworkService.isActive ? 'active' : 'off'),
                                isTraining: NeuralNetworkService.isTraining || false,
                                isActive: NeuralNetworkService.isActive || false,
                                isLoaded: !!NeuralNetworkService.model
                            };
                        }
                    }
                    
                    // Получаем статус ансамбля
                    let ensembleStatus = {};
                    if (EnsembleService) {
                        try {
                            ensembleStatus = EnsembleService.getEnsembleStats();
                        } catch (error) {
                            console.warn('Error getting ensemble status in scheduler:', error);
                            ensembleStatus = {
                                isInitialized: EnsembleService.isInitialized || false,
                                isTraining: EnsembleService.isTraining || false
                            };
                        }
                    }
                    
                    const systemStatus = {
                        neuralNetwork: neuralNetworkStatus,
                        websocket: WebSocketService ? WebSocketService.getStatus() : { isConnected: false, clientsCount: 0, isInitialized: false },
                        database: { 
                            status: 'connected', 
                            lastQuery: new Date().toISOString() 
                        },
                        trading: { 
                            status: TradingEngine?.isActive ? 'active' : 'inactive',
                            mode: TradingEngine?.mode || 'paper',
                            isActive: TradingEngine?.isActive || false
                        },
                        ensemble: ensembleStatus
                    };
                    
                    WebSocketService.broadcastSystemStatus(systemStatus);
                }
            } catch (error) {
                console.error('❌ Error broadcasting system status:', error);
            }
        }, { scheduled: false });
        this.intervals.add(systemStatusTask);

        // Отправляем торговую статистику каждые 20 секунд (cron: каждые 20 секунд)
        const tradingStatsTask = cron.schedule('*/20 * * * * *', async () => {
            try {
                const WebSocketService = this.getWebSocketService();
                if (WebSocketService) {
                    const TradingEngine = getService('TradingEngine');
                    
                    // Проверяем, не закрыта ли база данных
                    if (!this.isInitialized) {
                        console.log('⏰ Skipping trading stats - service not initialized');
                        return;
                    }
                    
                    // Проверяем, не закрыта ли база данных
                    try {
                        const sequelize = (await import('../config/database.js')).default;
                        if (!sequelize || !sequelize.authenticate) {
                            console.log('⏰ Skipping trading stats - database not available');
                            return;
                        }
                    } catch (error) {
                        console.log('⏰ Skipping trading stats - database error:', error.message);
                        return;
                    }
                    
                    // Получаем реальную торговую статистику и состояние портфеля
                    const portfolio = await TradingEngine.getVirtualPortfolioValue();
                    const stats = await TradingEngine.calculateTradingStats();

                    // Получаем топ-3 активные BUY-рекомендации
                    const Recommendation = (await import('../models/Recommendation.js')).default;
                    const topBuys = await Recommendation.getTopRecommendations(3, 'BUY');

                    const tradingStats = {
                        portfolioValue: portfolio.totalValue,
                        cash: portfolio.cash,
                        totalPnL: stats.totalReturn || 0,
                        winRate: (stats.winRate || 0) * 100,
                        totalTrades: stats.totalTrades || 0,
                        successfulTrades: Math.round((stats.totalTrades || 0) * (stats.winRate || 0)),
                        recommendations: topBuys.map(rec => ({
                            figi: rec.figi,
                            ticker: rec.ticker,
                            name: rec.name,
                            recommendation: rec.recommendation,
                            confidence: rec.confidence,
                            score: rec.score
                        }))
                    };
                    
                    WebSocketService.broadcastTradingStats(tradingStats);
                }
            } catch (error) {
                console.error('❌ Error broadcasting trading stats:', error);
            }
        }, { scheduled: false });
        this.intervals.add(tradingStatsTask);

        // Отправляем статус обучения каждые 5 секунд (cron: каждые 5 секунд)
        const trainingStatusTask = cron.schedule('*/5 * * * * *', async () => {
            try {
                const WebSocketService = this.getWebSocketService();
                if (WebSocketService) {
                    const TrainingStatusService = getService('TrainingStatusService');
                    
                    const trainingStatus = TrainingStatusService?.getStatus() || {
                        neuralNetwork: { isTraining: false, stage: 'idle', progress: 0 },
                        ensemble: { isTraining: false, stage: 'idle', progress: 0 },
                        metaLearning: { isTraining: false, stage: 'idle', progress: 0 },
                        reinforcementLearning: { isTraining: false, stage: 'idle', progress: 0 }
                    };
                    
                    // Отправляем статус обучения всегда (для отображения лоадера)
                    WebSocketService.broadcast({
                        type: 'training_status_update',
                        data: trainingStatus,
                        timestamp: new Date().toISOString()
                    });
                }
            } catch (error) {
                console.error('❌ Error broadcasting training status:', error);
            }
        }, { scheduled: false });
        this.intervals.add(trainingStatusTask);
        
        // Добавляем частую проверку кеша (каждые 30 минут) - включено обратно
        const cacheCheckTask = cron.schedule('*/30 * * * *', async () => {
            try {
                console.log('🔍 Checking cache update need...');
                
                if (await this.shouldUpdateCache()) {
                    console.log('🔄 Cache update needed, starting update...');
                    await this.performCacheUpdate();
                } else {
                    console.log('⏰ Cache update not needed yet');
                }
            } catch (error) {
                console.error('❌ Error in cache check:', error);
            }
        }, { scheduled: false });
        this.intervals.add(cacheCheckTask);
        console.log('🚫 Cache check task DISABLED for debugging');
        
        // Запускаем все cron задачи
        console.log('🚀 Starting cron tasks...');
        this.intervals.forEach(task => {
            if (task && typeof task.start === 'function') {
                task.start();
                console.log('✅ Cron task started');
            }
        });
        
        // Проверяем кеш при запуске
        // Обновление кеша при старте (включено обратно)
        console.log('⏰ Enabling startup cache update...');
        setTimeout(async () => {
            try {
                console.log('🔍 Initial cache check on startup...');
                if (await this.shouldUpdateCache()) {
                    console.log('🔄 Cache update needed on startup, starting update...');
                    await this.performCacheUpdate();
                } else {
                    console.log('✅ Cache is up to date');
                }
            } catch (error) {
                console.error('❌ Error in startup cache check:', error);
            }
        }, 5000); // 5 секунд после запуска
    }

    /**
     * Получает информацию о статусе кеша
     */
    async getCacheStatus() {
        const now = Date.now();
        const timeSinceLastUpdate = this.lastCacheUpdate ? now - this.lastCacheUpdate : null;
                
        return {
            lastUpdate: this.lastCacheUpdate ? new Date(this.lastCacheUpdate).toISOString() : null,
            timeSinceLastUpdate: timeSinceLastUpdate ? Math.round(timeSinceLastUpdate / (60 * 1000)) : null, // в минутах
            updateInterval: Math.round(this.cacheUpdateInterval / (60 * 1000)), // в минутах
            needsUpdate: await this.shouldUpdateCache(),
            nextUpdateIn: timeSinceLastUpdate ? Math.max(0, Math.round((this.cacheUpdateInterval - timeSinceLastUpdate) / (60 * 1000))) : null // в минутах
        };
    }

    /**
     * Принудительно обновляет время последнего обновления кеша (для исправления текущей ситуации)
     */
    async forceUpdateCacheTime() {
        try {
            this.lastCacheUpdate = Date.now();
            await this.saveLastCacheUpdateTime();
            console.log(`🔄 Forced cache update time: ${new Date(this.lastCacheUpdate).toISOString()}`);
            return true;
        } catch (error) {
            console.error('❌ Error forcing cache update time:', error);
            return false;
        }
    }

    /**
     * Останавливает все процессы и очищает ресурсы
     */
    async stop() {
        try {
            console.log('🛑 Stopping Scheduler Service...');
            
            // Сначала сбрасываем флаг инициализации
            this.isInitialized = false;
            console.log('🛑 Scheduler Service marked as stopped');
            
            // Останавливаем все cron задачи
            if (this.cacheTask) {
                this.cacheTask.stop();
                this.cacheTask.destroy();
                this.cacheTask = null;
                console.log('✅ Cache task stopped and destroyed');
            }
            if (this.cleanupTask) {
                this.cleanupTask.stop();
                this.cleanupTask.destroy();
                this.cleanupTask = null;
                console.log('✅ Cleanup task stopped and destroyed');
            }
            if (this.newsCleanupTask) {
                this.newsCleanupTask.stop();
                this.newsCleanupTask.destroy();
                this.newsCleanupTask = null;
                console.log('✅ News cleanup task stopped and destroyed');
            }
            if (this.newsDailyUpdateTask) {
                this.newsDailyUpdateTask.stop();
                this.newsDailyUpdateTask.destroy();
                this.newsDailyUpdateTask = null;
                console.log('✅ News daily update task stopped and destroyed');
            }
            if (this.telegramCacheTask) {
                this.telegramCacheTask.stop();
                this.telegramCacheTask.destroy();
                this.telegramCacheTask = null;
                console.log('✅ Telegram cache task stopped and destroyed');
            }
            if (this.trainingTask) {
                this.trainingTask.stop();
                this.trainingTask.destroy();
                this.trainingTask = null;
                console.log('✅ Training task stopped and destroyed');
            }
            if (this.quickTrainingTask) {
                this.quickTrainingTask.stop();
                this.quickTrainingTask.destroy();
                this.quickTrainingTask = null;
                console.log('✅ Quick training task stopped and destroyed');
            }
            if (this.tradingHoursTask) {
                this.tradingHoursTask.stop();
                this.tradingHoursTask.destroy();
                this.tradingHoursTask = null;
                console.log('✅ Trading hours task stopped and destroyed');
            }
            if (this.tradingHoursCacheTask) {
                this.tradingHoursCacheTask.stop();
                this.tradingHoursCacheTask.destroy();
                this.tradingHoursCacheTask = null;
                console.log('✅ Trading hours cache task stopped and destroyed');
            }
            
            // Останавливаем все cron задачи из intervals
            this.intervals.forEach(task => {
                if (task && typeof task.stop === 'function') {
                    task.stop();
                    if (typeof task.destroy === 'function') {
                        task.destroy();
                    }
                }
            });
            this.intervals.clear();
            console.log('✅ All interval tasks stopped and destroyed');
            
            // Завершаем все worker'ы
            this.workers.forEach(worker => {
                if (worker && worker.terminate) {
                    worker.terminate();
                }
            });
            this.workers.clear();
            
            // Сбрасываем флаги
            this.isTraining = false;
            this.isAnalyzing = false;
            this.isInitialized = false;
            
            console.log('✅ Scheduler Service stopped');
        } catch (error) {
            console.error('❌ Error stopping Scheduler Service:', error);
            throw error;
        }
    }

    async performCacheUpdate() {
        const startTime = Date.now();

        try {
            // Проверяем, нужно ли обновлять кеш
            if (!(await this.shouldUpdateCache())) {
                console.log('⏰ Skipping cache update - too soon since last update');
                return {
                    success: true,
                    message: 'Cache update skipped - too soon since last update',
                    skipped: true
                };
            }

            console.log('🔄 Starting cache update in worker...');
            
            // Отправляем уведомление о начале обновления через WebSocket
            const WebSocketService = await this.getWebSocketService();
            if (WebSocketService) {
                WebSocketService.broadcast({
                    type: 'cache_update_started',
                    data: {
                        message: 'Обновление кеша запущено',
                        timestamp: new Date().toISOString()
                    }
                });
            }
            
            // Создаем worker для обновления кеша
            const { Worker } = await import('worker_threads');
            const { fileURLToPath } = await import('url');
            const { dirname, join } = await import('path');
            
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = dirname(__filename);
            const workerPath = join(__dirname, '../workers/cacheUpdateWorker.js');
            
            // Получаем настройки для объёма кеширования
            const nnSettings = await SettingsService.getNeuralNetworkSettings();
            const cacheDays = nnSettings.cache_candles_days || 365; // Год данных по умолчанию
            
            const worker = new Worker(workerPath, {
                workerData: {
                    updateInstruments: true,
                    updateCandles: true,
                    instrumentsLimit: 100,
                    candlesDays: cacheDays, // Увеличенный объём свечей
                    incrementalUpdate: true // Используем инкрементальное обновление
                }
            });
            
            // Добавляем worker в список для отслеживания
            this.workers.add(worker);
            
            // Обрабатываем результат
            const result = await new Promise((resolve, reject) => {
                worker.on('message', (msg) => {
                    if (msg.type === 'done') {
                        resolve(msg.data);
                    } else if (msg.type === 'error') {
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
            
            // Удаляем worker из списка после завершения
            this.workers.delete(worker);
            worker.terminate();

            const duration = Math.round((Date.now() - startTime) / 1000);
            console.log(`✅ Cache update completed in ${duration}s. ${result.message}`);

            // Обновляем время последнего обновления кеша
            this.lastCacheUpdate = Date.now();
            console.log(`📅 Cache update timestamp updated: ${new Date(this.lastCacheUpdate).toISOString()}`);
            
            // Сохраняем время обновления в настройки
            await this.saveLastCacheUpdateTime();

            // Отправляем уведомление о завершении через WebSocket
            if (WebSocketService) {
                WebSocketService.broadcast({
                    type: 'cache_update_completed',
                    data: {
                        message: `Кеш обновлен успешно за ${duration}с`,
                        duration,
                        totalUpdated: result.totalUpdated,
                        timestamp: new Date().toISOString()
                    }
                });
            }

            // Отправляем уведомление в Telegram о завершении
            await OptimizedTelegramService.sendAlert(
                'Обновление Базы Данных',
                `Кеш обновлен успешно:\n• Время: ${duration}с\n• Обновлено: ${result.totalUpdated} элементов\n• Статус: ✅ Готов к работе`,
                'info'
            );

        } catch (error) {
            console.error('❌ Cache update failed:', error);
            
            // Отправляем уведомление об ошибке через WebSocket
            const WebSocketService = await this.getWebSocketService();
            if (WebSocketService) {
                WebSocketService.broadcast({
                    type: 'cache_update_failed',
                    data: {
                        message: `Ошибка обновления кеша: ${error.message}`,
                        error: error.message,
                        timestamp: new Date().toISOString()
                    }
                });
            }
            
            // Отправляем уведомление об ошибке в Telegram
            await OptimizedTelegramService.sendAlert(
                'CACHE_UPDATE_FAILED',
                `Ошибка обновления кеша:\n• Ошибка: ${error.message}\n• Время: ${new Date().toLocaleString('ru-RU')}`,
                'warning'
            );
            
            throw error;
        }
    }

    async performCleanup() {
        try {
            const { CachedCandle } = await import('../models/CachedCandle.js');

            // Удаляем свечи старше 30 дней
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const deletedCount = await CachedCandle.destroy({
                where: {
                    time: {
                        [Op.lt]: thirtyDaysAgo
                    }
                }
            });

            console.log(`🧹 Cleanup completed. Deleted ${deletedCount} old candles`);
        } catch (error) {
            console.error('Cleanup error:', error);
            throw error;
        }
    }

    async performScheduledTraining() {
        // Проверяем, не идет ли уже обучение
        if (this.isTraining) {
            console.log('🧠 Scheduled training skipped: training already in progress');
            return;
        }

        const startTime = Date.now();
        this.isTraining = true;
        
        try {
            // Сначала проверяем деградацию и восстанавливаем best-модели
            console.log('🔍 Checking model degradation before scheduled training...');
            await this.checkDegradationAndRestoreAll();

            // Проверяем, нужно ли переобучение
            const shouldRetrain = await this.shouldRetrainModel();
            if (!shouldRetrain) {
                console.log('🧠 Model is up to date, skipping scheduled training');
                // Уведомления о периодическом обучении теперь обрабатываются в IntegratedAIService
                return;
            }

            console.log('🧠 Starting scheduled neural network training...');
            
            // Запускаем обучение всех AI сетей по скользящему окну последних N дней
            const nnSettings = await SettingsService.getNeuralNetworkSettings();
            const trainingDays = nnSettings.nn_retrain_days || parseInt(process.env.NN_TRAINING_DAYS) || 180;
            const trainingLimit = parseInt(process.env.NN_TRAINING_LIMIT) || 50;
            
            // Получаем топ инструменты для обучения
            const instruments = await CacheService.getAllInstruments(trainingLimit);
            
            let totalTrained = 0;
            let successes = 0;
            let failures = 0;
            
            // Обучаем каждый инструмент через IntegratedAIService
            for (const instrument of instruments) {
                try {
                    // Проверяем, нужно ли переобучение для этого инструмента
                    const shouldRetrain = await this.shouldRetrainModel(instrument.figi);
                    if (!shouldRetrain) {
                        console.log(`🧠 Model for ${instrument.ticker} is up to date, skipping`);
                        continue;
                    }

                    console.log(`🧠 Training all networks for ${instrument.ticker}...`);
                    const results = await IntegratedAIService.trainAllNetworks(instrument.figi, {
                        days: trainingDays,
                        epochs: 50,
                        batchSize: 16
                    });
                    
                    // Проверяем результаты
                    const hasSuccess = Object.values(results).some(result => result.success !== false);
                    if (hasSuccess) {
                        successes++;
                    } else {
                        failures++;
                    }
                    totalTrained++;
                    
                } catch (error) {
                    console.warn(`❌ Training failed for ${instrument.ticker}:`, error.message);
                    failures++;
                    totalTrained++;
                    
                    // Отправляем алерт об ошибке обучения конкретного инструмента
                    try {
                        await OptimizedTelegramService.sendAlert(
                            'QUICK_TRAINING_INSTRUMENT_ERROR',
                            `⚠️ <b>ОШИБКА ОБУЧЕНИЯ ИНСТРУМЕНТА</b>\n\n📈 Инструмент: <b>${instrument.ticker} (${instrument.figi})</b>\n🔍 Ошибка: ${error.message}\n⏰ Время: ${new Date().toLocaleString('ru-RU')}`,
                            'warning'
                        );
                    } catch (telegramError) {
                        console.warn('Failed to send instrument training error alert:', telegramError.message);
                    }
                }
            }
            
            const duration = Math.round((Date.now() - startTime) / 1000);
            
            // Отправляем уведомление о завершении через оптимизированный сервис
            await OptimizedTelegramService.sendAlert(
                'TRAINING_COMPLETED',
                `Полное обучение завершено:\n• Всего инструментов: ${totalTrained}\n• Успешно: ${successes}\n• Ошибок: ${failures}\n• Время: ${duration}с`,
                'info'
            );

            console.log(`✅ Scheduled training completed in ${duration} seconds`);
            
        } catch (error) {
            console.error('Scheduled training error:', error);
            await OptimizedTelegramService.sendAlert('TRAINING_ERROR', error.message, 'critical');
            throw error;
        } finally {
            this.isTraining = false;
        }
    }

    async performQuickTraining() {
        // Проверяем, не идет ли уже обучение или анализ
        if (this.isTraining || this.isAnalyzing) {
            console.log('⚡ Quick training skipped: another process is running');
            return;
        }

        const startTime = Date.now();
        this.isTraining = true;
        
        try {
            // Получаем настройки быстрого обучения
            const nnSettings = await SettingsService.getNeuralNetworkSettings();
            const quickTrainingLimit = nnSettings.nn_quick_training_limit || 10;
            const quickTrainingDays = nnSettings.nn_quick_training_days || nnSettings.nn_retrain_days || 30;

            console.log(`⚡ Starting quick training: ${quickTrainingLimit} instruments, ${quickTrainingDays} days`);

            // Получаем случайные инструменты для быстрого обучения
            const instruments = await CacheService.getAllInstruments(quickTrainingLimit * 2);
            const shuffled = instruments.sort(() => 0.5 - Math.random());
            const selectedInstruments = shuffled.slice(0, quickTrainingLimit);

            let successCount = 0;
            let failCount = 0;

            for (const instrument of selectedInstruments) {
                try {
                    // Используем частичное обучение через IntegratedAIService
                    await IntegratedAIService.partialTraining(instrument.figi, {
                        days: quickTrainingDays,
                        epochs: 10,
                        batchSize: 16
                    });
                    successCount++;
                    console.log(`⚡ Quick training completed for ${instrument.ticker}`);
                } catch (error) {
                    failCount++;
                    console.warn(`⚡ Quick training failed for ${instrument.ticker}:`, error.message);
                }
            }

            const duration = Math.round((Date.now() - startTime) / 1000);
            console.log(`⚡ Quick training completed: ${successCount} success, ${failCount} failed, ${duration}s`);

            // Отправляем уведомление о завершении всего процесса быстрого обучения
            if (successCount > 0) {
                await OptimizedTelegramService.sendAlert(
                    'QUICK_TRAINING_COMPLETED',
                    `⚡ <b>БЫСТРОЕ ОБУЧЕНИЕ ЗАВЕРШЕНО</b>\n\n📊 Результаты:\n• Успешно обучено: ${successCount} инструментов\n• Ошибок: ${failCount}\n• Время выполнения: ${duration} секунд\n• Инструментов в очереди: ${selectedInstruments.length}\n\n🧠 Нейросети обновлены и готовы к работе`,
                    'success'
                );
            }

            // Отправляем уведомление только при критических ошибках
            if (failCount > 5) { // Только если много ошибок
                await OptimizedTelegramService.sendAlert(
                    'QUICK_TRAINING_ERRORS',
                    `Быстрое обучение завершено с ошибками:\n• Успешно: ${successCount}\n• Ошибок: ${failCount}\n• Время: ${duration}с`,
                    'warning'
                );
            }

        } catch (error) {
            console.error('Quick training error:', error);
        } finally {
            this.isTraining = false;
        }
    }

    async shouldRetrainModel(figi = null) {
        try {
            const OptimizedTrainingService = getService('OptimizedTrainingService');
            
            // Если указан FIGI, проверяем per-FIGI модель
            if (figi && OptimizedTrainingService) {
                return await this.shouldRetrainModelForFigi(figi, OptimizedTrainingService);
            }

            // Проверяем, есть ли сохраненная модель
            const modelExists = NeuralNetworkService.model !== null;
            if (!modelExists) {
                console.log('🧠 No model found, training required');
                return true;
            }

            // Получаем настройки из базы данных
            const nnSettings = await SettingsService.getNeuralNetworkSettings();
            const modelAge = nnSettings.nn_model_max_age_days || 7;
            const modelPath = './models/neural-network-model.json';
            
            try {
                const fs = await import('fs/promises');
                const path = await import('path');
                const { fileURLToPath } = await import('url');
                
                // Получаем правильный путь к модели
                const __filename = fileURLToPath(import.meta.url);
                const __dirname = path.dirname(__filename);
                const fullModelPath = path.join(__dirname, '..', '..', 'models', 'neural-network-model.json');
                
                const stats = await fs.stat(fullModelPath);
                const ageInDays = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);
                
                if (ageInDays > modelAge) {
                    console.log(`🧠 Model is ${ageInDays.toFixed(1)} days old (max: ${modelAge} days), retraining required`);
                    return true;
                }
                
                console.log(`🧠 Model is ${ageInDays.toFixed(1)} days old (max: ${modelAge} days), still fresh`);
                return false;
            } catch (error) {
                console.log('🧠 Cannot check model age, retraining to be safe');
                return true;
            }
        } catch (error) {
            console.error('Error checking if model should retrain:', error);
            return true; // В случае ошибки лучше переобучить
        }
    }

    /**
     * Проверка необходимости переобучения для конкретного FIGI с учетом деградации
     */
    async shouldRetrainModelForFigi(figi, OptimizedTrainingService) {
        try {
            // 1. Проверяем возраст модели
            const fs = await import('fs/promises');
            const path = await import('path');
            const modelsDir = './models';
            const modelPath = path.join(modelsDir, `${figi}_model.json`);
            
            try {
                const stats = await fs.stat(modelPath);
                const ageInDays = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);
                const nnSettings = await SettingsService.getNeuralNetworkSettings();
                const modelAge = nnSettings.nn_model_max_age_days || 7;
                
                if (ageInDays > modelAge) {
                    console.log(`🧠 Model for ${figi} is ${ageInDays.toFixed(1)} days old (max: ${modelAge} days), retraining required`);
                    return true;
                }
            } catch (error) {
                // Модель не найдена - нужно обучить
                console.log(`🧠 No model found for ${figi}, training required`);
                return true;
            }

            // 2. Проверяем деградацию модели
            try {
                const bestMeta = await OptimizedTrainingService.loadBestMeta(figi);
                if (bestMeta && bestMeta.bestAccuracy) {
                    // Загружаем текущую модель и оцениваем её производительность
                    const currentModel = await OptimizedTrainingService.loadModel(figi);
                    if (currentModel) {
                        const currentMetrics = await OptimizedTrainingService.evaluateModelPerformance(figi, currentModel);
                        
                        if (currentMetrics && currentMetrics.accuracy) {
                            const degradation = bestMeta.bestAccuracy - currentMetrics.accuracy;
                            const degradationThreshold = 0.05; // 5% деградация
                            
                            if (degradation > degradationThreshold) {
                                console.log(`⚠️ Model degradation detected for ${figi}: current=${currentMetrics.accuracy.toFixed(4)}, best=${bestMeta.bestAccuracy.toFixed(4)}, degradation=${(degradation*100).toFixed(2)}%`);
                                console.log(`🔄 Retraining required due to degradation`);
                                return true;
                            }
                        }
                    }
                }
            } catch (error) {
                console.warn(`⚠️ Error checking degradation for ${figi}:`, error.message);
                // В случае ошибки проверки деградации, проверяем только возраст
            }

            return false;
        } catch (error) {
            console.error(`Error checking if model should retrain for ${figi}:`, error);
            return true; // В случае ошибки лучше переобучить
        }
    }

    /**
     * Проверка деградации и автоматическое восстановление best-модели для всех инструментов
     */
    async checkDegradationAndRestoreAll() {
        try {
            const OptimizedTrainingService = getService('OptimizedTrainingService');
            
            if (!OptimizedTrainingService) {
                console.warn('⚠️ OptimizedTrainingService not available for degradation check');
                return;
            }

            console.log('🔍 Checking model degradation for all instruments...');
            
            // Получаем все инструменты
            const instruments = await CacheService.getAllInstruments(100);
            let checked = 0;
            let degraded = 0;
            let restored = 0;

            for (const instrument of instruments) {
                try {
                    const model = await OptimizedTrainingService.loadModel(instrument.figi);
                    if (model) {
                        const metrics = await OptimizedTrainingService.evaluateModelPerformance(instrument.figi, model);
                        if (metrics) {
                            const result = await OptimizedTrainingService.checkDegradationAndRestore(
                                instrument.figi, 
                                model, 
                                metrics
                            );
                            
                            checked++;
                            if (result.degraded) {
                                degraded++;
                            }
                            if (result.restored) {
                                restored++;
                            }
                        }
                    }
                } catch (error) {
                    console.warn(`⚠️ Error checking degradation for ${instrument.figi}:`, error.message);
                }
            }

            console.log(`✅ Degradation check completed: checked=${checked}, degraded=${degraded}, restored=${restored}`);
            
            if (degraded > 0 || restored > 0) {
                // Отправляем уведомление о результатах проверки
                await OptimizedTelegramService.sendAlert(
                    'DEGRADATION_CHECK',
                    `Проверка деградации моделей:\n• Проверено: ${checked}\n• Деградировало: ${degraded}\n• Восстановлено: ${restored}`,
                    degraded > 0 ? 'warning' : 'info'
                );
            }
        } catch (error) {
            console.error('❌ Error checking degradation for all instruments:', error);
        }
    }

    stop() {
        if (this.cacheTask) {
            this.cacheTask.stop();
            console.log('Cache update task stopped');
        }
        if (this.cleanupTask) {
            this.cleanupTask.stop();
            console.log('Cleanup task stopped');
        }
        if (this.trainingTask) {
            this.trainingTask.stop();
            console.log('Training task stopped');
        }
        if (this.quickTrainingTask) {
            this.quickTrainingTask.stop();
            console.log('Quick training task stopped');
        }
        if (this.tradingHoursTask) {
            this.tradingHoursTask.stop();
            console.log('Trading hours task stopped');
        }
        if (this.tradingHoursCacheTask) {
            this.tradingHoursCacheTask.stop();
            console.log('Trading hours cache task stopped');
        }
        if (this.degradationCheckTask) {
            this.degradationCheckTask.stop();
            console.log('Degradation check task stopped');
        }
        if (this.newsCleanupTask) {
            this.newsCleanupTask.stop();
            console.log('News cleanup task stopped');
        }
        if (this.newsDailyUpdateTask) {
            this.newsDailyUpdateTask.stop();
            console.log('News daily update task stopped');
        }
        if (this.telegramCacheTask) {
            this.telegramCacheTask.stop();
            console.log('Telegram cache task stopped');
        }
            if (this.portfolioAnalysisTask) {
                this.portfolioAnalysisTask.stop();
                this.portfolioAnalysisTask.destroy();
                this.portfolioAnalysisTask = null;
                console.log('✅ Portfolio analysis task stopped and destroyed');
            }
            if (this.predictionsUpdateTask) {
                this.predictionsUpdateTask.stop();
                this.predictionsUpdateTask.destroy();
                this.predictionsUpdateTask = null;
                console.log('✅ Predictions update task stopped and destroyed');
            }
    }

    /**
     * Выполняет анализ портфеля для всех типов (real, virtual)
     */
    /**
     * Обновление предсказаний в таблице Recommendations каждые 20 минут
     */
    async updateRecommendationsPredictions() {
        try {
            const Recommendation = (await import('../models/Recommendation.js')).default;
            
            // Получаем IntegratedAIService через ServiceManager или прямой импорт
            let IntegratedAIService = getService('IntegratedAIService');
            if (!IntegratedAIService) {
                IntegratedAIService = (await import('./IntegratedAIService.js')).default;
            }
            
            // Проверяем и инициализируем, если нужно
            if (!IntegratedAIService) {
                console.log('⚠️ IntegratedAIService not found, skipping predictions update');
                return;
            }
            
            if (!IntegratedAIService.isInitialized) {
                console.log('🔄 IntegratedAIService not initialized, initializing...');
                try {
                    await IntegratedAIService.initialize();
                } catch (initError) {
                    console.warn(`⚠️ Failed to initialize IntegratedAIService:`, initError.message);
                    return;
                }
            }

            // Получаем все активные рекомендации, которые старше 20 минут
            const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000);
            const recommendationsToUpdate = await Recommendation.findAll({
                where: {
                    isActive: true,
                    [Op.or]: [
                        { analysisDate: { [Op.lt]: twentyMinutesAgo } },
                        { analysisDate: null }
                    ]
                },
                limit: 50 // Обновляем максимум 50 за раз, чтобы не перегрузить систему
            });

            if (recommendationsToUpdate.length === 0) {
                console.log('✅ No recommendations need updating (all are fresh)');
                return;
            }

            console.log(`🔄 Updating ${recommendationsToUpdate.length} recommendations...`);

            let updatedCount = 0;
            let errorCount = 0;

            // Обновляем предсказания параллельно (батчами по 5)
            const batchSize = 5;
            for (let i = 0; i < recommendationsToUpdate.length; i += batchSize) {
                const batch = recommendationsToUpdate.slice(i, i + batchSize);
                
                await Promise.allSettled(
                    batch.map(async (rec) => {
                        try {
                            // Получаем актуальное предсказание через IntegratedAIService
                            const freshPrediction = await IntegratedAIService.getIntegratedRecommendation(rec.figi);
                            
                            if (freshPrediction && freshPrediction.score !== undefined) {
                                // Обновляем рекомендацию актуальными данными
                                await rec.update({
                                    score: freshPrediction.score,
                                    confidence: freshPrediction.confidence ?? freshPrediction.score,
                                    recommendation: freshPrediction.recommendation || rec.recommendation,
                                    analysisDate: new Date(),
                                    explanation: freshPrediction.summary || freshPrediction.details || rec.explanation
                                });

                                updatedCount++;
                                console.log(`✅ Updated prediction for ${rec.ticker}: ${freshPrediction.recommendation} (score: ${freshPrediction.score.toFixed(3)})`);
                            }
                        } catch (error) {
                            errorCount++;
                            console.warn(`⚠️ Failed to update prediction for ${rec.ticker}:`, error.message);
                        }
                    })
                );

                // Небольшая задержка между батчами, чтобы не перегрузить систему
                if (i + batchSize < recommendationsToUpdate.length) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            console.log(`✅ Predictions update completed: ${updatedCount} updated, ${errorCount} errors`);

            // Отправляем уведомление через WebSocket
            const WebSocketService = this.getWebSocketService();
            if (WebSocketService && typeof WebSocketService.broadcast === 'function') {
                WebSocketService.broadcast({
                    type: 'predictions_updated',
                    data: {
                        updatedCount,
                        errorCount,
                        totalProcessed: recommendationsToUpdate.length,
                        timestamp: new Date().toISOString()
                    }
                });
            }

        } catch (error) {
            console.error('❌ Error updating recommendations predictions:', error);
            throw error;
        }
    }

    async performPortfolioAnalysis() {
        try {
            // Проверяем, активна ли нейросеть
            if (!NeuralNetworkService.isActive) {
                console.log('⚠️ Neural network is not active, skipping portfolio analysis');
                return;
            }

            // Анализируем виртуальный портфель
            try {
                await NeuralNetworkService.analyzePortfolioAndSave('virtual');
            } catch (error) {
                console.error('Error analyzing virtual portfolio:', error);
            }

            // Анализируем реальный портфель (если есть)
            try {
                const TradingEngine = (await import('./TradingEngine.js')).default;
                const realPortfolio = await TradingEngine.getRealPortfolioValue();
                if (realPortfolio && realPortfolio.positions) {
                    const positions = Array.isArray(realPortfolio.positions) 
                        ? realPortfolio.positions 
                        : Object.keys(realPortfolio.positions);
                    if (positions.length > 0) {
                        await NeuralNetworkService.analyzePortfolioAndSave('real');
                    }
                }
            } catch (error) {
                console.error('Error analyzing real portfolio:', error);
            }

            console.log('✅ Portfolio analysis completed for all portfolio types');
        } catch (error) {
            console.error('❌ Error performing portfolio analysis:', error);
            throw error;
        }
    }

    async performNewsCacheCleanup() {
        try {
            console.log('📰 Starting cleanup of expired news and sentiment cache...');
            
            // Очистка кеша новостей
            const NewsAnalysisService = (await import('./NewsAnalysisService.js')).default;
            await NewsAnalysisService.cleanExpiredNews();
            
            // Очистка кеша настроений Telegram
            const TelegramSentimentService = (await import('./TelegramSentimentService.js')).default;
            await TelegramSentimentService.cleanExpiredSentiments();
            
            console.log('✅ News cache cleanup completed');
            
        } catch (error) {
            console.error('❌ Error during news cache cleanup:', error);
            throw error;
        }
    }

    /**
     * Ежедневная проверка и загрузка свежих новостей
     */
    async performDailyNewsUpdate() {
        try {
            console.log('📰 Starting daily news update...');
            
            const NewsAnalysisService = (await import('./NewsAnalysisService.js')).default;
            
            // Загружаем свежие новости для всех акций (один большой запрос)
            const result = await NewsAnalysisService.loadFreshNewsForAllInstruments({
                onProgress: (progress) => {
                    console.log(`📰 Прогресс загрузки: ${progress.current}/${progress.total} (${progress.ticker || progress.figi})`);
                }
            });

            console.log(`✅ Daily news update completed: ${result.updated} instruments updated, ${result.totalNews} news articles loaded`);
            
            // Отправляем уведомление через Telegram
            if (result.updated > 0) {
                await OptimizedTelegramService.sendAlert(
                    'NEWS_DAILY_UPDATE',
                    `📰 Ежедневное обновление новостей завершено\n\n` +
                    `Обновлено: ${result.updated} инструментов\n` +
                    `Загружено новостей: ${result.totalNews}\n` +
                    `Ошибок: ${result.errorCount || 0}`,
                    'info'
                );
            }

            return result;

        } catch (error) {
            console.error('❌ Error during daily news update:', error);
            throw error;
        }
    }

    async performTelegramCacheUpdate() {
        try {
            console.log('📱 Starting Telegram sentiment cache update...');
            
            // Получаем список активных инструментов для обновления настроений
            const CachedInstrument = (await import('../models/CachedInstrument.js')).default;
            const instruments = await CachedInstrument.findAll({
                where: {
                    currency: 'rub',
                    instrumentType: 'share'
                },
                limit: 20, // Ограничиваем количество для производительности
                order: [['lastPrice', 'DESC']]
            });
            
            const TelegramSentimentService = (await import('./TelegramSentimentService.js')).default;
            
            // Обновляем настроения для каждого инструмента
            for (const instrument of instruments) {
                try {
                    const sentiment = await TelegramSentimentService.analyzeTelegramSentiment(instrument.figi, {
                        days: 7,
                        limit: 100
                    });
                    
                    // Кешируем результат
                    await TelegramSentimentService.cacheSentiment(instrument.figi, sentiment);
                    
                    console.log(`📱 Updated sentiment for ${instrument.ticker}: ${sentiment.sentiment?.toFixed(2)}`);
                    
                } catch (error) {
                    console.warn(`⚠️ Failed to update sentiment for ${instrument.ticker}:`, error.message);
                }
            }
            
            console.log('✅ Telegram sentiment cache update completed');
            
        } catch (error) {
            console.error('❌ Error during Telegram cache update:', error);
            throw error;
        }
    }
    // Уведомление о завершении апдейта кеша отправляет TelegramService

    async stop() {
        try {
            console.log('🛑 Stopping Scheduler Service...');
            
            // Останавливаем все задачи
            if (this.cacheTask) {
                this.cacheTask.stop();
                this.cacheTask = null;
            }
            
            if (this.cleanupTask) {
                this.cleanupTask.stop();
                this.cleanupTask = null;
            }
            
            if (this.newsCleanupTask) {
                this.newsCleanupTask.stop();
                this.newsCleanupTask = null;
            }
            if (this.newsDailyUpdateTask) {
                this.newsDailyUpdateTask.stop();
                this.newsDailyUpdateTask = null;
            }
            
            if (this.telegramCacheTask) {
                this.telegramCacheTask.stop();
                this.telegramCacheTask = null;
            }
            
            if (this.trainingTask) {
                this.trainingTask.stop();
                this.trainingTask = null;
            }
            
            if (this.quickTrainingTask) {
                this.quickTrainingTask.stop();
                this.quickTrainingTask = null;
            }
            
            if (this.tradingHoursTask) {
                this.tradingHoursTask.stop();
                this.tradingHoursTask = null;
            }
            
            if (this.tradingHoursCacheTask) {
                this.tradingHoursCacheTask.stop();
                this.tradingHoursCacheTask = null;
            }
            
            this.isInitialized = false;
            console.log('✅ Scheduler Service stopped successfully');
            
        } catch (error) {
            console.error('❌ Error stopping Scheduler Service:', error);
            throw error;
        }
    }
}

export default new SchedulerService();