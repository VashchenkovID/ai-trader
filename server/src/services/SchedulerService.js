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
        this.priceUpdateTask = null; // Задача обновления цен
        this.cleanupTask = null;
        this.newsCleanupTask = null;
        this.newsDailyUpdateTask = null;
        this.newsCacheUpdateTask = null; // Периодическое обновление кеша новостей
        this.telegramCacheTask = null;
        this.trainingTask = null;
        this.quickTrainingTask = null;
        this.tradingHoursTask = null;
        this.tradingHoursCacheTask = null;
        this.degradationCheckTask = null;
        this.portfolioAnalysisTask = null;
        this.predictionsUpdateTask = null;
        this.signalsUpdateTask = null;
        this.trailingStopsCheckTask = null;
        this.realPortfolioSyncTask = null;
        this.virtualPortfolioUpdateTask = null;
        this.isInitialized = null;
        this.isTraining = false;
        this.isAnalyzing = false;
        this.lastCacheUpdate = null; // Время последнего обновления кеша
        this.lastPriceUpdate = null; // Время последнего обновления цен
        this.cacheUpdateInterval = 4 * 60 * 60 * 1000; // 4 часа в миллисекундах
        this.priceUpdateInterval = 20 * 60 * 1000; // 20 минут в миллисекундах
        this.intervals = new Set(); // Храним все интервалы для очистки
        this.workers = new Set(); // Храним все worker'ы для завершения
        this.webSocketService = null; // Кэшируем WebSocketService
        this.startTime = Date.now(); // Время старта сервиса для отслеживания первого запуска
        this.skipFirstRun = new Set(); // Задачи, которые должны пропустить первый запуск
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
        
        // Сохраняем время старта для предотвращения немедленного запуска задач
        // ВАЖНО: устанавливаем время старта ДО создания cron задач
        this.startTime = Date.now();

        // Получаем настройки планировщика
        const schedulerSettings = await SettingsService.getSchedulerSettings();
        const nnSettings = await SettingsService.getNeuralNetworkSettings();
        const notificationSettings = await SettingsService.getNotificationSettings();
        const cacheSchedule = schedulerSettings.cache_update_interval || '0 */4 * * *';
        // Полное обучение ночью в 02:00 (последовательно: Базовая → Ансамбль → Мета-обучение → RL)
        const trainingSchedule = schedulerSettings.nn_training_schedule || '0 2 * * *';
        // Быстрое обучение каждые 2 часа: 08:00, 10:00, 12:00, 14:00, 16:00, 18:00
        const quickTrainingSchedule = schedulerSettings.nn_training_interval || '0 8,10,12,14,16,18 * * *';
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
            // Пропускаем первый запуск при старте (минимум 10 минут с момента старта)
            const timeSinceStart = Date.now() - this.startTime;
            if (timeSinceStart < 10 * 60 * 1000) {
                console.log('⏭️ Skipping first cache update run (too soon after startup)');
                return;
            }
            
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

        // Задача 1.5: Обновление цен акций (каждые 20 минут)
        const priceUpdateIntervalMinutes = schedulerSettings.price_update_interval_minutes || 20;
        const priceUpdateSchedule = `*/${priceUpdateIntervalMinutes} * * * *`; // Каждые N минут
        this.priceUpdateTask = cron.schedule(priceUpdateSchedule, async () => {
            // Пропускаем первый запуск при старте (минимум 1 минута с момента старта)
            const timeSinceStart = Date.now() - this.startTime;
            if (timeSinceStart < 60 * 1000) {
                console.log('⏭️ Skipping first price update run (too soon after startup)');
                return;
            }
            
            try {
                console.log('💰 Scheduled price update started...');
                await this.performPriceUpdate();
            } catch (error) {
                console.error('Error in scheduled price update:', error);
                // Не отправляем критическое уведомление для обновления цен
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
        // Расписание: каждые 2 часа (08:00, 10:00, 12:00, 14:00, 16:00, 18:00)
        if (quickTrainingEnabled) {
            this.quickTrainingTask = cron.schedule(quickTrainingSchedule, async () => {
                try {
                    console.log('⚡ Scheduled quick neural network training started...');
                    const QuickTrainingService = (await import('./QuickTrainingService.js')).default;
                    await QuickTrainingService.performQuickTraining();
                } catch (error) {
                    console.error('Error in scheduled quick training:', error);
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
            // Пропускаем первый запуск при старте (минимум 1 минута с момента старта)
            const timeSinceStart = Date.now() - this.startTime;
            if (timeSinceStart < 60 * 1000) {
                console.log('⏭️ Skipping first trading hours cache update run (too soon after startup)');
                return;
            }
            
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

        // Задача: Периодическое обновление кеша новостей (каждые 6 часов по умолчанию)
        // ОТКЛЮЧЕНО: Новости теперь обновляются в performCacheUpdate и performDailyNewsUpdate
        // чтобы не превысить лимит в 100 запросов в день
        // this.newsCacheUpdateTask = cron.schedule(newsCacheSchedule, async () => {
        //     // Пропускаем первый запуск при старте (минимум 10 минут с момента старта)
        //     const timeSinceStart = Date.now() - this.startTime;
        //     if (timeSinceStart < 10 * 60 * 1000) {
        //         console.log('⏭️ Skipping first news cache update run (too soon after startup)');
        //         return;
        //     }
        //     
        //     try {
        //         console.log('📰 Scheduled news cache update started...');
        //         await this.performDailyNewsUpdate();
        //     } catch (error) {
        //         console.error('Error in scheduled news cache update:', error);
        //         await OptimizedTelegramService.sendAlert('NEWS_CACHE_UPDATE_ERROR', error.message, 'warning');
        //     }
        // }, {
        //     scheduled: true,
        //     timezone: "Europe/Moscow"
        // });

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
        // Пропускаем первый запуск, так как он будет выполнен через 30 минут после старта
        this.portfolioAnalysisTask = cron.schedule('0 * * * *', async () => {
            // Проверяем, прошло ли достаточно времени с момента старта (минимум 35 минут)
            const timeSinceStart = Date.now() - this.startTime;
            if (timeSinceStart < 35 * 60 * 1000) {
                console.log('⏭️ Skipping first portfolio analysis run (will run after 30 minutes from startup)');
                return;
            }
            
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
            // Пропускаем первый запуск при старте (минимум 1 минута с момента старта)
            const timeSinceStart = Date.now() - this.startTime;
            if (timeSinceStart < 60 * 1000) {
                console.log('⏭️ Skipping first predictions update run (too soon after startup)');
                return;
            }
            
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

        // Задача 12: Обновление сигналов аналитиков раз в день (в 6:00)
        this.signalsUpdateTask = cron.schedule('0 6 * * *', async () => {
            try {
                console.log('⚡ Scheduled signals update started...');
                await this.performSignalsUpdate();
            } catch (error) {
                console.error('Error in scheduled signals update:', error);
                await OptimizedTelegramService.sendAlert('SIGNALS_UPDATE_ERROR', error.message, 'warning');
            }
        }, {
            scheduled: true,
            timezone: "Europe/Moscow"
        });

        // Задача 13: Проверка трейлинг-стопов (каждые 5 минут)
        this.trailingStopsCheckTask = cron.schedule('*/5 * * * *', async () => {
            // Пропускаем первый запуск при старте (минимум 1 минута с момента старта)
            const timeSinceStart = Date.now() - this.startTime;
            if (timeSinceStart < 60 * 1000) {
                console.log('⏭️ Skipping first trailing stops check run (too soon after startup)');
                return;
            }
            
            try {
                await this.checkTrailingStops();
            } catch (error) {
                console.error('Error in trailing stops check:', error);
            }
        }, {
            scheduled: true,
            timezone: "Europe/Moscow"
        });

        // Задача 14: Автоматическая перебалансировка стратегий (каждое воскресенье в 3:00)
        this.strategyRebalanceTask = cron.schedule('0 3 * * 0', async () => {
            try {
                console.log('🔄 Scheduled strategy rebalancing started...');
                const StrategyAllocationService = (await import('./StrategyAllocationService.js')).default;
                await StrategyAllocationService.rebalanceStrategies();
                await OptimizedTelegramService.sendAlert('STRATEGY_REBALANCE_COMPLETE', 'Стратегии перебалансированы', 'info');
            } catch (error) {
                console.error('Error in scheduled strategy rebalancing:', error);
                await OptimizedTelegramService.sendAlert('STRATEGY_REBALANCE_ERROR', error.message, 'warning');
            }
        }, {
            scheduled: true,
            timezone: "Europe/Moscow"
        });
        
        // Запускаем периодическую отправку данных через WebSocket
        this.startWebSocketBroadcasts();
        
        // Первый анализ портфеля через 30 минут после старта
        setTimeout(async () => {
            try {
                console.log('📊 Starting initial portfolio analysis (30 minutes after startup)...');
                await this.performPortfolioAnalysis();
            } catch (error) {
                console.error('Error in initial portfolio analysis:', error);
                await OptimizedTelegramService.sendAlert('PORTFOLIO_ANALYSIS_ERROR', error.message, 'warning');
            }
        }, 30 * 60 * 1000); // 30 минут = 30 * 60 * 1000 миллисекунд
        console.log('⏰ Initial portfolio analysis scheduled in 30 minutes');
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
                    // Используем прямой запрос без include, чтобы избежать ошибок ассоциаций
                    const topBuys = await Recommendation.findAll({
                        where: {
                            isActive: true,
                            recommendation: 'BUY'
                        },
                        order: [['confidence', 'DESC'], ['score', 'DESC']],
                        limit: 3
                    });

                    const tradingStats = {
                        portfolioValue: portfolio?.totalValue || 0,
                        cash: portfolio?.cash || 0,
                        totalPnL: stats?.totalReturn || 0,
                        winRate: (stats?.winRate || 0) * 100,
                        totalTrades: stats?.totalTrades || 0,
                        successfulTrades: Math.round((stats?.totalTrades || 0) * (stats?.winRate || 0)),
                        recommendations: (topBuys || []).map(rec => ({
                            figi: rec.figi || '',
                            ticker: rec.ticker || '',
                            name: rec.name || '',
                            recommendation: rec.recommendation || 'HOLD',
                            confidence: rec.confidence || 0,
                            score: rec.score || 0
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

        // Отправляем метрики моделей каждую минуту (cron: каждую минуту)
        const modelMetricsTask = cron.schedule('0 * * * * *', async () => {
            try {
                const WebSocketService = this.getWebSocketService();
                if (!WebSocketService || !this.isInitialized) {
                    return;
                }

                const OptimizedTrainingService = getService('OptimizedTrainingService');
                const PerformanceAnalyzer = getService('PerformanceAnalyzer');
                
                if (!OptimizedTrainingService && !PerformanceAnalyzer) {
                    return;
                }

                // Получаем метрики производительности
                try {
                    if (PerformanceAnalyzer && typeof PerformanceAnalyzer.getPerformanceMetrics === 'function') {
                        const performanceMetrics = await PerformanceAnalyzer.getPerformanceMetrics();
                        
                        if (performanceMetrics && performanceMetrics.trading) {
                            // Отправляем метрики для каждой модели
                            const CacheService = (await import('./CacheService.js')).default;
                            const instruments = await CacheService.getAllInstruments(10); // Берем первые 10 инструментов
                            
                            for (const instrument of instruments) {
                                try {
                                    // Получаем метрики для конкретного инструмента
                                    const predictions = await PerformanceAnalyzer.getPredictionData(30);
                                    const instrumentPredictions = predictions.filter(p => p.figi === instrument.figi);
                                    
                                    if (instrumentPredictions.length > 0) {
                                        const correct = instrumentPredictions.filter(p => p.correct).length;
                                        const accuracy = correct / instrumentPredictions.length;
                                        
                                        // Рассчитываем MAE и RMSE если есть данные
                                        let mae = null;
                                        let rmse = null;
                                        
                                        if (instrumentPredictions.length > 0) {
                                            const errors = instrumentPredictions
                                                .filter(p => p.actualPrice && p.predictedPrice)
                                                .map(p => Math.abs(p.actualPrice - p.predictedPrice));
                                            
                                            if (errors.length > 0) {
                                                mae = errors.reduce((sum, e) => sum + e, 0) / errors.length;
                                                rmse = Math.sqrt(
                                                    errors.reduce((sum, e) => sum + e * e, 0) / errors.length
                                                );
                                            }
                                        }
                                        
                                        WebSocketService.broadcastModelMetrics({
                                            modelType: 'neural_network',
                                            figi: instrument.figi,
                                            instrument: instrument.ticker,
                                            accuracy: accuracy,
                                            mae: mae,
                                            rmse: rmse,
                                            totalPredictions: instrumentPredictions.length,
                                            correctPredictions: correct,
                                            winRate: performanceMetrics.trading.winRate || null
                                        });
                                    }
                                } catch (error) {
                                    console.warn(`Error getting metrics for ${instrument.figi}:`, error.message);
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.error('❌ Error broadcasting model metrics:', error);
                }
            } catch (error) {
                console.error('❌ Error in model metrics task:', error);
            }
        }, { scheduled: false });
        this.intervals.add(modelMetricsTask);
        
        // Добавляем частую проверку кеша (каждые 30 минут) - включено обратно
        // Добавляем частую проверку кеша (каждые 30 минут)
        const cacheCheckTask = cron.schedule('*/30 * * * *', async () => {
            // Пропускаем первый запуск при старте (минимум 5 минут с момента старта)
            const timeSinceStart = Date.now() - this.startTime;
            if (timeSinceStart < 5 * 60 * 1000) {
                console.log('⏭️ Skipping first cache check run (too soon after startup)');
                return;
            }
            
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
        }, { scheduled: true, timezone: "Europe/Moscow" });
        this.intervals.add(cacheCheckTask);
        
        // Запускаем все cron задачи
        console.log('🚀 Starting cron tasks...');
        this.intervals.forEach(task => {
            if (task && typeof task.start === 'function') {
                task.start();
                console.log('✅ Cron task started');
            }
        });
        
        // Проверка кеша при старте ОТКЛЮЧЕНА - не запускаем сразу при старте
        // setTimeout(async () => {
        //     try {
        //         console.log('🔍 Initial cache check on startup...');
        //         if (await this.shouldUpdateCache()) {
        //             console.log('🔄 Cache update needed on startup, starting update...');
        //             await this.performCacheUpdate();
        //         } else {
        //             console.log('✅ Cache is up to date');
        //         }
        //     } catch (error) {
        //         console.error('❌ Error in startup cache check:', error);
        //     }
        // }, 5000); // 5 секунд после запуска
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
            if (this.priceUpdateTask) {
                this.priceUpdateTask.stop();
                this.priceUpdateTask.destroy();
                this.priceUpdateTask = null;
                console.log('✅ Price update task stopped and destroyed');
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
            if (this.newsCacheUpdateTask) {
                this.newsCacheUpdateTask.stop();
                this.newsCacheUpdateTask.destroy();
                this.newsCacheUpdateTask = null;
                console.log('✅ News cache update task stopped and destroyed');
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
                    updateSignals: true, // Включаем обновление сигналов
                    instrumentsLimit: 100,
                    candlesDays: cacheDays, // Увеличенный объём свечей
                    incrementalUpdate: true, // Используем инкрементальное обновление
                    signalsLimit: 100 // Лимит инструментов для обновления сигналов
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

            // Обновляем новости для ограниченного количества инструментов (чтобы не превысить лимит в 100 запросов в день)
            // Обновляем только для инструментов без свежих новостей (старше 24 часов)
            // Ограничиваем до 10 запросов за раз, так как performCacheUpdate вызывается каждые 4 часа (6 раз в день)
            // Итого: 10 * 6 = 60 запросов в день + 30 из performDailyNewsUpdate = 90 запросов (в пределах лимита)
            try {
                console.log('📰 Starting news cache update (limited to avoid API limits)...');
                await this.performLimitedNewsUpdate(10); // Максимум 10 запросов за раз
            } catch (newsError) {
                console.warn('⚠️ News cache update failed (non-critical):', newsError.message);
                // Не прерываем процесс, если обновление новостей не удалось
            }

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
                        totalCandlesCached: result.totalCandlesCached || 0,
                        totalSignalsCached: result.totalSignalsCached || 0,
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

    /**
     * Обновление цен акций через worker thread
     */
    async performPriceUpdate() {
        const startTime = Date.now();

        try {
            console.log('💰 Starting price update in worker...');
            
            // Отправляем уведомление о начале обновления через WebSocket
            const WebSocketService = await this.getWebSocketService();
            if (WebSocketService) {
                WebSocketService.broadcast({
                    type: 'price_update_started',
                    data: {
                        message: 'Обновление цен запущено',
                        timestamp: new Date().toISOString()
                    }
                });
            }
            
            // Создаем worker для обновления цен
            const { Worker } = await import('worker_threads');
            const { fileURLToPath } = await import('url');
            const { dirname, join } = await import('path');
            
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = dirname(__filename);
            const workerPath = join(__dirname, '../workers/priceUpdateWorker.js');
            
            const worker = new Worker(workerPath, {
                workerData: {
                    instrumentsLimit: 1000 // Обновляем цены для всех инструментов
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
                    } else if (msg.type === 'progress') {
                        // Отправляем прогресс через WebSocket
                        if (WebSocketService) {
                            WebSocketService.broadcast({
                                type: 'price_update_progress',
                                data: msg.data,
                                timestamp: new Date().toISOString()
                            });
                        }
                    }
                });
                
                worker.on('error', reject);
                worker.on('exit', (code) => {
                    this.workers.delete(worker);
                    if (code !== 0) {
                        reject(new Error(`Worker stopped with exit code ${code}`));
                    }
                });
            });
            
            // Удаляем worker из списка после завершения
            this.workers.delete(worker);
            worker.terminate();

            const duration = Math.round((Date.now() - startTime) / 1000);
            console.log(`✅ Price update completed in ${duration}s. Updated: ${result.totalUpdated}, Failed: ${result.totalFailed || 0}`);

            // Обновляем время последнего обновления цен
            this.lastPriceUpdate = Date.now();
            console.log(`📅 Price update timestamp updated: ${new Date(this.lastPriceUpdate).toISOString()}`);

            // Отправляем уведомление о завершении через WebSocket
            if (WebSocketService) {
                WebSocketService.broadcast({
                    type: 'price_update_completed',
                    data: {
                        message: `Цены обновлены успешно за ${duration}с`,
                        duration,
                        totalUpdated: result.totalUpdated,
                        totalFailed: result.totalFailed || 0,
                        timestamp: new Date().toISOString()
                    }
                });
            }

            return result;
        } catch (error) {
            console.error('❌ Price update failed:', error);
            
            // Отправляем уведомление об ошибке через WebSocket
            const WebSocketService = await this.getWebSocketService();
            if (WebSocketService) {
                WebSocketService.broadcast({
                    type: 'price_update_error',
                    data: {
                        error: error.message,
                        timestamp: new Date().toISOString()
                    }
                });
            }
            
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

            console.log('🧠 Starting scheduled FULL training (sequential: Base → Ensemble → Meta → RL)...');
            
            // Получаем настройки
            const nnSettings = await SettingsService.getNeuralNetworkSettings();
            const trainingDays = nnSettings.nn_retrain_days || parseInt(process.env.NN_TRAINING_DAYS) || 180;
            
            // Получаем все инструменты для обучения
            const instruments = await CacheService.getAllInstruments();
            
            let totalTrained = 0;
            let successes = 0;
            let failures = 0;
            
            // ПОСЛЕДОВАТЕЛЬНОЕ ОБУЧЕНИЕ: Базовая → Ансамбль → Мета-обучение → RL
            // Этап 1: Базовая нейросеть для всех инструментов
            console.log('📊 Stage 1/4: Training Base Neural Network for all instruments...');
            for (const instrument of instruments) {
                try {
                    const shouldRetrain = await this.shouldRetrainModel(instrument.figi);
                    if (!shouldRetrain) {
                        continue;
                    }
                    
                    console.log(`🧠 [Base] Training ${instrument.ticker}...`);
                    await NeuralNetworkService.trainForInstrument(instrument.figi, trainingDays);
                    successes++;
                    totalTrained++;
                } catch (error) {
                    console.warn(`❌ [Base] Training failed for ${instrument.ticker}:`, error.message);
                    failures++;
                    totalTrained++;
                }
            }
            
            // Этап 2: Ансамбль для всех инструментов
            console.log('📊 Stage 2/4: Training Ensemble for all instruments...');
            const EnsembleService = (await import('./EnsembleService.js')).default;
            for (const instrument of instruments) {
                try {
                    console.log(`🧠 [Ensemble] Training ${instrument.ticker}...`);
                    await EnsembleService.train(instrument.figi, {
                        days: trainingDays,
                        epochs: 50
                    });
                    successes++;
                } catch (error) {
                    console.warn(`❌ [Ensemble] Training failed for ${instrument.ticker}:`, error.message);
                    failures++;
                }
            }
            
            // Этап 3: Мета-обучение для всех инструментов
            console.log('📊 Stage 3/4: Training Meta-Learning for all instruments...');
            const MetaLearningService = (await import('./MetaLearningService.js')).default;
            for (const instrument of instruments) {
                try {
                    console.log(`🧠 [Meta] Training ${instrument.ticker}...`);
                    await MetaLearningService.train(instrument.figi, {
                        days: trainingDays
                    });
                    successes++;
                } catch (error) {
                    console.warn(`❌ [Meta] Training failed for ${instrument.ticker}:`, error.message);
                    failures++;
                }
            }
            
            // Этап 4: Обучение с подкреплением для всех инструментов
            console.log('📊 Stage 4/4: Training Reinforcement Learning for all instruments...');
            const ReinforcementLearningService = (await import('./ReinforcementLearningService.js')).default;
            for (const instrument of instruments) {
                try {
                    console.log(`🧠 [RL] Training ${instrument.ticker}...`);
                    await ReinforcementLearningService.train(instrument.figi, {
                        days: trainingDays,
                        episodes: 50
                    });
                    successes++;
                } catch (error) {
                    console.warn(`❌ [RL] Training failed for ${instrument.ticker}:`, error.message);
                    failures++;
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
            const quickTrainingDays = nnSettings.nn_quick_training_days || nnSettings.nn_retrain_days || 30;

            console.log(`⚡ Starting quick training: all instruments, ${quickTrainingDays} days`);

            // Получаем все инструменты для быстрого обучения
            const instruments = await CacheService.getAllInstruments();
            const selectedInstruments = instruments;

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
            
            try {
                const fs = await import('fs/promises');
                const path = await import('path');
                const { fileURLToPath } = await import('url');
                
                // Получаем правильный путь к модели относительно server директории
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
            const { fileURLToPath } = await import('url');
            
            // Используем правильный путь относительно server директории
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = path.dirname(__filename);
            const modelsDir = path.join(__dirname, '..', '..', 'models');
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
            const instruments = await CacheService.getAllInstruments();
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
        if (this.newsCacheUpdateTask) {
            this.newsCacheUpdateTask.stop();
            console.log('News cache update task stopped');
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
            if (this.signalsUpdateTask) {
                this.signalsUpdateTask.stop();
                this.signalsUpdateTask.destroy();
                this.signalsUpdateTask = null;
                console.log('✅ Signals update task stopped and destroyed');
            }
            if (this.trailingStopsCheckTask) {
                this.trailingStopsCheckTask.stop();
                this.trailingStopsCheckTask.destroy();
                this.trailingStopsCheckTask = null;
                console.log('✅ Trailing stops check task stopped and destroyed');
            }
            if (this.realPortfolioSyncTask) {
                this.realPortfolioSyncTask.stop();
                this.realPortfolioSyncTask.destroy();
                this.realPortfolioSyncTask = null;
                console.log('✅ Real portfolio sync task stopped and destroyed');
            }
            if (this.virtualPortfolioUpdateTask) {
                this.virtualPortfolioUpdateTask.stop();
                this.virtualPortfolioUpdateTask.destroy();
                this.virtualPortfolioUpdateTask = null;
                console.log('✅ Virtual portfolio update task stopped and destroyed');
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
                                // Формируем explanation в едином формате: объект с summary и details
                                let explanation = rec.explanation || {};
                                if (freshPrediction.summary) {
                                    // Если summary - строка, создаем объект
                                    if (typeof freshPrediction.summary === 'string') {
                                        explanation = {
                                            summary: freshPrediction.summary,
                                            details: freshPrediction.details || {}
                                        };
                                    } else {
                                        // Если summary - объект, используем его
                                        explanation = freshPrediction.summary;
                                    }
                                } else if (freshPrediction.details) {
                                    explanation = {
                                        summary: explanation.summary || 'Анализ обновлен',
                                        details: freshPrediction.details
                                    };
                                } else if (typeof explanation === 'string') {
                                    // Если explanation - строка, преобразуем в объект
                                    explanation = {
                                        summary: explanation,
                                        details: {}
                                    };
                                }
                                
                                await rec.update({
                                    score: freshPrediction.score,
                                    confidence: freshPrediction.confidence ?? freshPrediction.score,
                                    recommendation: freshPrediction.recommendation || rec.recommendation,
                                    analysisDate: new Date(),
                                    explanation: explanation
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
        // Проверяем, не идет ли уже анализ
        if (this.isAnalyzing) {
            console.log('⚠️ Portfolio analysis already in progress, skipping duplicate start');
            return;
        }

        // Проверяем, активна ли нейросеть
        if (!NeuralNetworkService.isActive) {
            console.log('⚠️ Neural network is not active, skipping portfolio analysis');
            return;
        }

        this.isAnalyzing = true;
        
        try {

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
        } finally {
            this.isAnalyzing = false;
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
     * Ограниченное обновление новостей (для использования в performCacheUpdate)
     * Обновляет новости только для инструментов без свежих новостей (старше 24 часов)
     * Использует ротацию: каждый день обновляются следующие инструменты в очереди
     * @param {number} maxRequests - Максимальное количество запросов (по умолчанию 10)
     */
    async performLimitedNewsUpdate(maxRequests = 10) {
        try {
            const NewsAnalysisService = (await import('./NewsAnalysisService.js')).default;
            const CacheService = (await import('./CacheService.js')).default;
            const CachedNews = (await import('../models/CachedNews.js')).default;
            const { Op } = await import('sequelize');
            
            // Получаем все акции в рублях
            const instruments = await CacheService.getAllInstruments();
            const shares = instruments.filter(inst => 
                inst.currency === 'RUB' && 
                (inst.instrumentType === 'share' || !inst.instrumentType) &&
                inst.ticker && inst.name
            );
            
            if (shares.length === 0) {
                console.log('⚠️ No shares found for news update');
                return { success: true, updated: 0, message: 'No shares found' };
            }
            
            // Получаем индекс последнего обновленного инструмента из настроек (ротация)
            const lastNewsUpdateIndex = await SettingsService.getSetting('news_update_last_index', 0);
            const startIndex = parseInt(lastNewsUpdateIndex) || 0;
            
            // Проверяем, какие инструменты нуждаются в обновлении новостей (нет новостей за последние 24 часа)
            const oneDayAgo = new Date();
            oneDayAgo.setDate(oneDayAgo.getDate() - 1);
            
            const instrumentsNeedingUpdate = [];
            let checkedCount = 0;
            let currentIndex = startIndex;
            
            // Проверяем инструменты начиная с сохраненного индекса (ротация)
            // Проверяем больше инструментов, чем maxRequests, чтобы найти те, которым действительно нужно обновление
            while (instrumentsNeedingUpdate.length < maxRequests && checkedCount < shares.length * 2) {
                const instrument = shares[currentIndex % shares.length];
                currentIndex++;
                checkedCount++;
                
                const lastNews = await CachedNews.findOne({
                    where: {
                        figi: instrument.figi,
                        publishedAt: { [Op.gte]: oneDayAgo }
                    },
                    order: [['publishedAt', 'DESC']]
                });
                
                if (!lastNews) {
                    instrumentsNeedingUpdate.push(instrument);
                }
            }
            
            if (instrumentsNeedingUpdate.length === 0) {
                console.log('✅ All instruments have fresh news, skipping update');
                // Сохраняем текущий индекс для следующего раза
                await SettingsService.setSetting('news_update_last_index', currentIndex % shares.length);
                return { success: true, updated: 0, message: 'No instruments need news update' };
            }
            
            console.log(`📰 Updating news for ${instrumentsNeedingUpdate.length} instruments (rotation: starting from index ${startIndex}, limited to ${maxRequests} requests to avoid API limits)...`);
            
            // Обновляем новости только для инструментов, которым это нужно
            const to = new Date();
            const from = new Date();
            from.setDate(from.getDate() - 1);
            from.setHours(0, 0, 0, 0);
            to.setHours(23, 59, 59, 999);
            
            let updated = 0;
            let totalNews = 0;
            
            for (let i = 0; i < Math.min(instrumentsNeedingUpdate.length, maxRequests); i++) {
                const instrument = instrumentsNeedingUpdate[i];
                
                try {
                    const news = await NewsAnalysisService.fetchNewsByCompanyNameAndPeriod(
                        instrument.name,
                        from,
                        to,
                        {
                            ticker: instrument.ticker,
                            sector: instrument.sector,
                            apiData: instrument.apiData,
                            aliases: instrument.apiData?.aliases || null,
                            includeFinancialTerms: true,
                            figi: instrument.figi,
                            pageSize: 100
                        }
                    );
                    
                    if (news.length > 0) {
                        await NewsAnalysisService.cacheNews(instrument.figi, news);
                        totalNews += news.length;
                        updated++;
                    }
                    
                    // Задержка между запросами (1 секунда для бесплатного плана)
                    if (i < Math.min(instrumentsNeedingUpdate.length, maxRequests) - 1) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                } catch (error) {
                    console.error(`❌ Ошибка загрузки новостей для ${instrument.ticker}:`, error.message);
                    
                    // Если это ошибка лимита, останавливаемся
                    if (error.message && (error.message.includes('rate limit') || error.message.includes('limit'))) {
                        console.warn('⚠️ API rate limit reached, stopping news update');
                        break;
                    }
                }
            }
            
            // Сохраняем индекс последнего обновленного инструмента для ротации
            await SettingsService.setSetting('news_update_last_index', currentIndex % shares.length);
            
            console.log(`✅ Limited news update completed: ${updated} instruments updated, ${totalNews} news articles loaded (next update will start from index ${currentIndex % shares.length})`);
            
            return {
                success: true,
                updated,
                totalNews,
                nextIndex: currentIndex % shares.length,
                message: `Updated news for ${updated} instruments (rotation: next update starts from index ${currentIndex % shares.length})`
            };
        } catch (error) {
            console.error('❌ Error during limited news update:', error);
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
            
            // Загружаем свежие новости для всех акций с ротацией
            // Ограничиваем до 30 инструментов, чтобы не превысить лимит в 100 запросов в день
            // performCacheUpdate делает 10 запросов * 6 раз в день = 60 запросов
            // performDailyNewsUpdate делает 30 запросов * 1 раз в день = 30 запросов
            // Итого: 60 + 30 = 90 запросов (в пределах лимита в 100 запросов)
            // Используем ротацию: каждый день обновляем следующие 30 инструментов
            const lastDailyNewsUpdateIndex = await SettingsService.getSetting('daily_news_update_last_index', 0);
            const startIndex = parseInt(lastDailyNewsUpdateIndex) || 0;
            
            const result = await NewsAnalysisService.loadFreshNewsForAllInstruments({
                limit: 30, // Ограничиваем количество инструментов
                startIndex: startIndex, // Начинаем с сохраненного индекса (ротация)
                onProgress: (progress) => {
                    console.log(`📰 Прогресс загрузки: ${progress.current}/${progress.total} (${progress.ticker || progress.figi})`);
                }
            });
            
            // Сохраняем индекс для следующего дня (ротация)
            if (result.total !== undefined) {
                const nextIndex = (startIndex + 30) % result.total;
                await SettingsService.setSetting('daily_news_update_last_index', nextIndex);
                console.log(`📰 Daily news update rotation: next update will start from index ${nextIndex}`);
            }

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

    /**
     * Проверка и обработка трейлинг-стопов
     */
    async checkTrailingStops() {
        try {
            const RiskManagementService = (await import('./RiskManagementService.js')).default;
            const TradingEngine = (await import('./TradingEngine.js')).default;
            const WebSocketService = this.getWebSocketService();

            // Проверяем трейлинг-стопы для виртуального портфеля
            const virtualTriggered = await RiskManagementService.checkAllTrailingStops('virtual');
            
            // Проверяем трейлинг-стопы для реального портфеля
            const realTriggered = await RiskManagementService.checkAllTrailingStops('real');

            const allTriggered = [...virtualTriggered, ...realTriggered];

            if (allTriggered.length > 0) {
                console.log(`🛑 Обнаружено ${allTriggered.length} сработавших трейлинг-стопов`);

                // Закрываем позиции для каждого сработавшего трейлинг-стопа
                for (const stop of allTriggered) {
                    try {
                        const signal = {
                            figi: stop.figi,
                            ticker: stop.ticker,
                            action: stop.direction === 'BUY' ? 'SELL' : 'BUY', // Обратное действие для закрытия
                            quantity: stop.quantity,
                            price: stop.triggerPrice,
                            confidence: 1.0,
                            reason: 'trailing_stop_triggered',
                            trailingStopId: stop.id
                        };

                        // Исполняем ордер через TradingEngine
                        const result = await TradingEngine.executeOrder(signal);

                        console.log(`✅ Позиция закрыта по трейлинг-стопу для ${stop.ticker}: ${stop.quantity} шт. по цене ${stop.triggerPrice.toFixed(2)}`);

                        // Отправляем уведомление через WebSocket
                        if (WebSocketService) {
                            WebSocketService.broadcast({
                                type: 'trailing_stop_triggered',
                                data: {
                                    figi: stop.figi,
                                    ticker: stop.ticker,
                                    quantity: stop.quantity,
                                    triggerPrice: stop.triggerPrice,
                                    entryPrice: stop.entryPrice,
                                    profit: stop.direction === 'BUY' 
                                        ? ((stop.triggerPrice - stop.entryPrice) / stop.entryPrice) * 100
                                        : ((stop.entryPrice - stop.triggerPrice) / stop.entryPrice) * 100,
                                    portfolioType: stop.portfolioType
                                },
                                timestamp: new Date().toISOString()
                            });
                        }

                        // Отправляем уведомление в Telegram
                        await OptimizedTelegramService.sendAlert(
                            'TRAILING_STOP_TRIGGERED',
                            `🛑 Трейлинг-стоп сработал для ${stop.ticker}\n\n` +
                            `Цена входа: ${stop.entryPrice.toFixed(2)}₽\n` +
                            `Цена закрытия: ${stop.triggerPrice.toFixed(2)}₽\n` +
                            `Количество: ${stop.quantity} шт.\n` +
                            `Прибыль: ${(stop.direction === 'BUY' 
                                ? ((stop.triggerPrice - stop.entryPrice) / stop.entryPrice) * 100
                                : ((stop.entryPrice - stop.triggerPrice) / stop.entryPrice) * 100).toFixed(2)}%`,
                            'info'
                        );
                    } catch (error) {
                        console.error(`❌ Ошибка закрытия позиции по трейлинг-стопу для ${stop.ticker}:`, error);
                    }
                }
            }
        } catch (error) {
            console.error('❌ Ошибка проверки трейлинг-стопов:', error);
            throw error;
        }
    }

    /**
     * Обновление сигналов аналитиков для всех активных инструментов
     */
    async performSignalsUpdate() {
        try {
            console.log('⚡ Starting signals update...');
            
            const SignalCacheService = (await import('./SignalCacheService.js')).default;
            const CachedInstrument = (await import('../models/CachedInstrument.js')).default;
            
            // Диагностика: проверяем количество инструментов с разными условиями
            const totalInstruments = await CachedInstrument.count();
            const rubInstruments = await CachedInstrument.count({
                where: {
                    [Op.or]: [
                        { currency: 'RUB' },
                        { currency: 'rub' }
                    ]
                }
            });
            const shareInstruments = await CachedInstrument.count({
                where: {
                    instrumentType: 'share'
                }
            });
            const activeInstruments = await CachedInstrument.count({
                where: {
                    isActive: true
                }
            });
            
            console.log(`📊 Instruments statistics:`);
            console.log(`   Total: ${totalInstruments}`);
            console.log(`   RUB currency: ${rubInstruments}`);
            console.log(`   Share type: ${shareInstruments}`);
            console.log(`   Active: ${activeInstruments}`);
            
            // Получаем список активных инструментов (более гибкий запрос)
            const instruments = await CachedInstrument.findAll({
                where: {
                    [Op.and]: [
                        {
                            [Op.or]: [
                                { currency: 'RUB' },
                                { currency: 'rub' }
                            ]
                        },
                        {
                            instrumentType: 'share'
                        },
                        {
                            [Op.or]: [
                                { isActive: true },
                                { isActive: null } // Если поле не установлено, считаем активным
                            ]
                        }
                    ]
                },
                attributes: ['figi', 'ticker', 'name', 'currency', 'instrumentType', 'isActive'],
                limit: 100 // Ограничиваем количество для производительности
            });

            let instrumentsToProcess = instruments;
            
            if (instruments.length === 0) {
                console.log('⚠️ No active instruments found for signals update');
                console.log('💡 Trying fallback: searching without isActive filter...');
                
                // Fallback: пробуем без фильтра isActive
                const fallbackInstruments = await CachedInstrument.findAll({
                    where: {
                        [Op.or]: [
                            { currency: 'RUB' },
                            { currency: 'rub' }
                        ],
                        instrumentType: 'share'
                    },
                    attributes: ['figi', 'ticker', 'name', 'currency', 'instrumentType', 'isActive'],
                    limit: 100
                });
                
                if (fallbackInstruments.length === 0) {
                    console.log('❌ No instruments found even without isActive filter');
                    return;
                }
                
                console.log(`✅ Found ${fallbackInstruments.length} instruments (fallback mode)`);
                instrumentsToProcess = fallbackInstruments;
            } else {
                console.log(`✅ Found ${instruments.length} active instruments`);
            }

            console.log(`📊 Updating signals for ${instrumentsToProcess.length} instruments...`);

            let updatedCount = 0;
            let errorCount = 0;
            const batchSize = 5; // Обрабатываем по 5 инструментов параллельно

            // Обрабатываем инструменты батчами
            for (let i = 0; i < instrumentsToProcess.length; i += batchSize) {
                const batch = instrumentsToProcess.slice(i, i + batchSize);
                
                await Promise.all(batch.map(async (instrument) => {
                    try {
                        // Проверяем, нужно ли обновлять кэш
                        const shouldUpdate = await SignalCacheService.shouldUpdateCache(instrument.figi);
                        
                        if (shouldUpdate) {
                            // Загружаем сигналы за последние 30 дней
                            const from = new Date();
                            from.setDate(from.getDate() - 30);
                            const to = new Date();
                            
                            const result = await SignalCacheService.fetchAndCacheSignals(instrument.figi, {
                                from: from,
                                to: to,
                                active: 'SIGNAL_STATE_ALL'
                            });

                            if (result.success) {
                                updatedCount++;
                                console.log(`✅ Updated signals for ${instrument.ticker} (${instrument.figi}): ${result.savedCount} signals`);
                            }
                        } else {
                            console.log(`⏭️ Skipping ${instrument.ticker} - cache is fresh`);
                        }
                    } catch (error) {
                        errorCount++;
                        console.error(`❌ Error updating signals for ${instrument.ticker}:`, error.message);
                    }
                }));

                // Небольшая задержка между батчами для избежания rate limiting
                if (i + batchSize < instrumentsToProcess.length) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            console.log(`✅ Signals update completed: ${updatedCount} instruments updated, ${errorCount} errors`);

            // Отправляем уведомление через Telegram
            if (updatedCount > 0) {
                await OptimizedTelegramService.sendAlert(
                    'SIGNALS_UPDATE_COMPLETE',
                    `⚡ Обновление сигналов завершено\n\n` +
                    `Обновлено: ${updatedCount} инструментов\n` +
                    `Ошибок: ${errorCount}`,
                    'info'
                );
            }

            return { updatedCount, errorCount, total: instruments.length };
        } catch (error) {
            console.error('❌ Error during signals update:', error);
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
            if (this.newsCacheUpdateTask) {
                this.newsCacheUpdateTask.stop();
                this.newsCacheUpdateTask = null;
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

    /**
     * Синхронизация реального портфеля из Tinkoff API
     */
    async performRealPortfolioSync() {
        try {
            console.log('💼 Starting real portfolio sync from Tinkoff API...');
            
            const TradingEngine = (await import('./TradingEngine.js')).default;
            const RealPortfolio = (await import('../models/RealPortfolio.js')).default;
            
            // Получаем актуальные данные из Tinkoff API
            const portfolioData = await TradingEngine.getRealPortfolioValue();
            
            if (!portfolioData) {
                console.warn('⚠️ No portfolio data received from Tinkoff API');
                return;
            }
            
            // Рассчитываем стоимость позиций
            let positionsValue = 0;
            const rawPositions = portfolioData.positions || {};
            
            // Если positionsValue уже есть в данных, используем его
            if (portfolioData.positionsValue) {
                positionsValue = portfolioData.positionsValue;
            } else {
                // Иначе рассчитываем вручную
                const CacheService = (await import('./CacheService.js')).default;
                for (const [figi, quantity] of Object.entries(rawPositions)) {
                    if (typeof quantity === 'number' && quantity > 0) {
                        try {
                            const instrument = await CacheService.getInstrument(figi, true);
                            const currentPrice = instrument?.lastPrice || 0;
                            if (currentPrice > 0) {
                                positionsValue += currentPrice * quantity;
                            }
                        } catch (error) {
                            console.warn(`⚠️ Не удалось получить цену для ${figi}:`, error.message);
                        }
                    }
                }
            }
            
            const cash = portfolioData.cash || 0;
            const totalValue = cash + positionsValue;
            
            // Сохраняем в БД
            await RealPortfolio.savePortfolio({
                cash,
                positions: rawPositions,
                trades: portfolioData.trades || [],
                totalValue,
                positionsValue,
                initialCapital: portfolioData.initialCapital || null
            });
            
            console.log(`✅ Real portfolio synced: totalValue=${totalValue.toLocaleString('ru-RU')} RUB, cash=${cash.toLocaleString('ru-RU')} RUB, positions=${Object.keys(rawPositions).length}`);
            
            // Обновляем распределение стратегий на основе актуального totalValue
            try {
                const StrategyAllocationService = (await import('./StrategyAllocationService.js')).default;
                await StrategyAllocationService.updateAllocationsFromPortfolioValue(totalValue);
            } catch (error) {
                console.warn('⚠️ Failed to update strategy allocations:', error.message);
            }
            
        } catch (error) {
            console.error('❌ Error syncing real portfolio:', error);
            throw error;
        }
    }

    /**
     * Обновление виртуального портфеля - пересчет totalValue на основе текущих цен
     */
    async performVirtualPortfolioUpdate() {
        try {
            console.log('💼 Starting virtual portfolio update (recalculating totalValue)...');
            
            const TradingEngine = (await import('./TradingEngine.js')).default;
            const VirtualPortfolio = (await import('../models/VirtualPortfolio.js')).default;
            
            // Получаем текущий виртуальный портфель из БД
            const savedPortfolio = await VirtualPortfolio.getCurrent();
            
            if (!savedPortfolio) {
                console.warn('⚠️ No virtual portfolio found in DB, skipping update');
                return;
            }
            
            // Пересчитываем totalValue на основе текущих цен
            const portfolioValue = await TradingEngine.getVirtualPortfolioValue();
            
            // Сохраняем обновленный портфель
            await VirtualPortfolio.savePortfolio({
                cash: portfolioValue.cash,
                positions: portfolioValue.positions,
                trades: portfolioValue.trades || [],
                totalValue: portfolioValue.totalValue,
                initialCapital: savedPortfolio.initialCapital || 1000000
            });
            
            console.log(`✅ Virtual portfolio updated: totalValue=${portfolioValue.totalValue.toLocaleString('ru-RU')} RUB`);
            
            // Обновляем распределение стратегий на основе актуального totalValue (только если режим виртуальный)
            try {
                const TradingModeManager = (await import('./TradingModeManager.js')).default;
                const currentMode = TradingModeManager.getCurrentMode();
                if (currentMode.mode === 'paper' || currentMode === 'paper') {
                    const StrategyAllocationService = (await import('./StrategyAllocationService.js')).default;
                    await StrategyAllocationService.updateAllocationsFromPortfolioValue(portfolioValue.totalValue);
                }
            } catch (error) {
                console.warn('⚠️ Failed to update strategy allocations:', error.message);
            }
            
        } catch (error) {
            console.error('❌ Error updating virtual portfolio:', error);
            throw error;
        }
    }
}

export default new SchedulerService();