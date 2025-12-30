import cron from 'node-cron';
import CacheService from './CacheService.js';
import OptimizedTelegramService from './OptimizedTelegramService.js';
import NeuralNetworkService from './NeuralNetworkService.js';
import IntegratedAIService from './IntegratedAIService.js';
import SettingsService from './SettingsService.js';
import TradingHoursService from './TradingHoursService.js';
import TradingHoursCacheService from './TradingHoursCacheService.js';
import { Op } from 'sequelize';
import sequelize from '../config/database.js';
import { getService } from './GlobalServiceManager.js';
import ServiceManager from './ServiceManager.js';

// Импорт утилит планировщика
import * as SchedulerUtils from '../utils/scheduler/index.js';

class SchedulerService {
    constructor() {
        this.cacheTask = null;
        this.priceUpdateTask = null; // Задача обновления цен
        this.portfolioPricesUpdateTask = null; // Задача обновления цен портфеля
        this.partialExitCheckTask = null; // Задача проверки частичного закрытия позиций
        this.activeSignalsPricesUpdateTask = null; // Задача обновления цен активных сигналов
        this.tradingRequestsPricesUpdateTask = null; // Задача обновления цен активных заявок
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
        this.dynamicBudgetRebalanceTask = null;
        this.correlationPrecalcTask = null;
        this.weeklyBacktestTask = null;
        this.macroDataUpdateTask = null; // Задача обновления макроэкономических данных
        this.optionsDataUpdateTask = null; // Задача обновления опционных данных
        this.portfolioRebalancingTask = null; // Задача ребалансировки портфеля
        this.positionMonitoringTask = null; // Задача мониторинга позиций
        this.dailyReportTask = null; // Задача ежедневных отчетов
        this.dataCleanupTask = null; // Задача автоматической очистки данных
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
        this.isFullCacheUpdateRunning = false; // Флаг выполнения полного обновления кеша
        this.currentFullCacheUpdateWorker = null; // Текущий worker полного обновления кеша
        this.pendingTriggeredSignals = []; // Накопленные сработавшие сигналы для отправки после анализа
        this.maxPendingSignals = 1000; // Максимальное количество накопленных сигналов (защита от утечки памяти)
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
            try {
                // Получаем уже инициализированный экземпляр из глобального ServiceManager
                // Используем тот же подход, что и для других сервисов
                this.webSocketService = ServiceManager?.getServiceSafe('WebSocketService') || null;
            } catch (error) {
                // Сервис не найден - это нормально, если он еще не инициализирован
                // Не устанавливаем в кеш, чтобы попробовать снова при следующем вызове
                return null;
            }
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
        
        // Загружаем время последнего обновления кеша, если оно еще не загружено
        // Это гарантирует восстановление состояния после перезапуска сервиса
        if (this.lastCacheUpdate === null || this.lastCacheUpdate === undefined) {
            await this.loadLastCacheUpdateTime();
        }
        
        // Сохраняем время старта для предотвращения немедленного запуска задач
        // ВАЖНО: устанавливаем время старта ДО создания cron задач
        this.startTime = Date.now();

        // Получаем настройки планировщика
        const schedulerSettings = await SettingsService.getSchedulerSettings();
        const nnSettings = await SettingsService.getNeuralNetworkSettings();
        const notificationSettings = await SettingsService.getNotificationSettings();
        // Инкрементальное обновление кеша раз в сутки (в 2:00)
        const cacheSchedule = schedulerSettings.cache_update_interval || '0 2 * * *';
        // Полное обучение ночью в 03:00 (после обновления кеша в 02:00, последовательно: Базовая → Ансамбль → Мета-обучение → RL)
        const trainingSchedule = schedulerSettings.nn_training_schedule || '0 3 * * *';
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
        this.cacheTask = SchedulerUtils.createScheduledTask(
            cacheSchedule,
            async () => {
                console.log('⏰ Scheduled cache update started...');
                
                // Проверяем, нужно ли обновлять кеш
                if (!(await this.shouldUpdateCache())) {
                    return;
                }
                
                await this.performCacheUpdate();
            },
            {
                taskName: 'cache-update',
                sendAlerts: false, // performCacheUpdate уже отправляет свои уведомления об ошибках
                alertType: 'critical',
                startTime: this.startTime,
                minDelay: 10 * 60 * 1000, // 10 минут
                checkCacheStale: false // Проверка уже внутри performCacheUpdate
            }
        );

        // Задача 1.5: Обновление цен акций (каждые 20 минут)
        const priceUpdateIntervalMinutes = schedulerSettings.price_update_interval_minutes || 20;
        const priceUpdateSchedule = `*/${priceUpdateIntervalMinutes} * * * *`; // Каждые N минут
        this.priceUpdateTask = SchedulerUtils.createScheduledTask(
            priceUpdateSchedule,
            async () => {
                console.log('💰 Scheduled price update started...');
                await this.performPriceUpdate();
            },
            {
                taskName: 'price-update',
                sendAlerts: false, // Не отправляем критическое уведомление для обновления цен
                startTime: this.startTime,
                minDelay: 60 * 1000 // 1 минута
            }
        );

        // Задача 1.6: Обновление цен активных позиций в портфеле (каждые 2 минуты в торговые часы)
        const portfolioPricesUpdateIntervalMinutes = schedulerSettings.portfolio_prices_update_interval_minutes || 2;
        const portfolioPricesUpdateSchedule = `*/${portfolioPricesUpdateIntervalMinutes} * * * *`; // Каждые N минут
        this.portfolioPricesUpdateTask = SchedulerUtils.createScheduledTask(
            portfolioPricesUpdateSchedule,
            async () => {
                console.log('💰 Scheduled portfolio prices update started...');
                await this.performPortfolioPricesUpdate();
            },
            {
                taskName: 'portfolio-prices-update',
                sendAlerts: false,
                startTime: this.startTime,
                minDelay: 60 * 1000 // 1 минута
            }
        );

        // Задача 1.6.5: Проверка частичного закрытия позиций (каждые 2 минуты вместе с обновлением цен)
        this.partialExitCheckTask = SchedulerUtils.createScheduledTask(
            portfolioPricesUpdateSchedule,
            async () => {
                console.log('📊 Checking positions for partial exit...');
                const PartialExitService = (await import('./PartialExitService.js')).default;
                if (!PartialExitService.isInitialized) {
                    await PartialExitService.initialize();
                }
                const result = await PartialExitService.checkAndExecutePartialExits();
                if (result.executed > 0) {
                    console.log(`✅ Partial exit check completed: checked=${result.checked}, executed=${result.executed}, skipped=${result.skipped}`);
                }
            },
            {
                taskName: 'partial-exit-check',
                sendAlerts: false,
                startTime: this.startTime,
                minDelay: 60 * 1000, // 1 минута
                checkFlagFn: () => this.isFullCacheUpdateRunning,
                flagName: 'full cache update'
            }
        );

        // Задача 1.7: Обновление цен активных сигналов (каждые 5 минут в торговые часы)
        const activeSignalsPricesUpdateIntervalMinutes = schedulerSettings.active_signals_prices_update_interval_minutes || 5;
        const activeSignalsPricesUpdateSchedule = `*/${activeSignalsPricesUpdateIntervalMinutes} * * * *`; // Каждые N минут
        this.activeSignalsPricesUpdateTask = SchedulerUtils.createScheduledTask(
            activeSignalsPricesUpdateSchedule,
            async () => {
                console.log('📊 Scheduled active signals prices update started...');
                await this.performActiveSignalsPricesUpdate();
            },
            {
                taskName: 'active-signals-prices-update',
                sendAlerts: false,
                startTime: this.startTime,
                minDelay: 60 * 1000 // 1 минута
            }
        );

        // Задача 1.8: Обновление цен активных торговых заявок (каждую минуту в торговые часы)
        const tradingRequestsPricesUpdateIntervalSeconds = schedulerSettings.trading_requests_prices_update_interval_seconds || 60;
        const tradingRequestsPricesUpdateSchedule = `*/${Math.floor(tradingRequestsPricesUpdateIntervalSeconds / 60)} * * * *`; // Каждые N минут (округляем до минут)
        this.tradingRequestsPricesUpdateTask = SchedulerUtils.createScheduledTask(
            tradingRequestsPricesUpdateSchedule,
            async () => {
                console.log('📋 Scheduled trading requests prices update started...');
                await this.performTradingRequestsPricesUpdate();
            },
            {
                taskName: 'trading-requests-prices-update',
                sendAlerts: false,
                startTime: this.startTime,
                minDelay: 60 * 1000 // 1 минута
            }
        );

        // Задача 2: Очистка старых свечей каждые 24 часа
        this.cleanupTask = SchedulerUtils.createScheduledTask(
            '0 2 * * *',
            async () => {
                console.log('🧹 Scheduled cleanup started...');
                await this.performCleanup();
            },
            {
                taskName: 'cleanup',
                sendAlerts: false,
                startTime: this.startTime,
                minDelay: 60 * 1000 // 1 минута
            }
        );

        // Задача 3: Периодическое обучение нейросети
        this.trainingTask = SchedulerUtils.createScheduledTask(
            trainingSchedule,
            async () => {
                console.log('🧠 Scheduled neural network training started...');
                await this.performScheduledTraining();
            },
            {
                taskName: 'training',
                sendAlerts: true,
                alertType: 'critical',
                startTime: this.startTime,
                minDelay: 60 * 1000,
                checkCacheStale: true,
                isCacheStaleFn: () => this.isCacheStale(),
                skipIfStale: false // Ждем обновления кеша
            }
        );

        // Задача 4: Быстрое обучение нейросети (если включено)
        // Расписание: каждые 2 часа (08:00, 10:00, 12:00, 14:00, 16:00, 18:00)
        if (quickTrainingEnabled) {
            this.quickTrainingTask = SchedulerUtils.createScheduledTask(
                quickTrainingSchedule,
                async () => {
                    console.log('⚡ Scheduled quick neural network training started...');
                    const QuickTrainingService = (await import('./QuickTrainingService.js')).default;
                    await QuickTrainingService.performQuickTraining();
                },
                {
                    taskName: 'quick-training',
                    sendAlerts: false, // Не отправляем в Telegram для быстрого обучения, чтобы не спамить
                    startTime: this.startTime,
                    minDelay: 60 * 1000,
                    checkCacheStale: true,
                    isCacheStaleFn: () => this.isCacheStale(),
                    skipIfStale: true // Пропускаем если кеш устарел
                }
            );
        }

        // Задача 5: Обновление кеша торговых часов
        const tradingHoursSchedule = schedulerSettings.trading_hours_update_interval || '*/15 * * * *';
        this.tradingHoursCacheTask = SchedulerUtils.createScheduledTask(
            tradingHoursSchedule,
            async () => {
                console.log('🕐 Scheduled trading hours cache update started...');
                await TradingHoursCacheService.updateTradingHoursCache();
            },
            {
                taskName: 'trading-hours-cache-update',
                sendAlerts: false,
                startTime: this.startTime,
                minDelay: 60 * 1000 // 1 минута
            }
        );

        // Задача 6: Еженедельная очистка новостей старше года (каждое воскресенье в 3:00)
        this.newsCleanupTask = SchedulerUtils.createScheduledTask(
            newsWeeklyCleanupSchedule,
            async () => {
                console.log('📰 Scheduled weekly news cleanup (older than 1 year) started...');
                await this.performNewsCacheCleanup();
            },
            {
                taskName: 'news-weekly-cleanup',
                sendAlerts: true,
                alertType: 'warning',
                startTime: this.startTime,
                minDelay: 60 * 1000
            }
        );

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
        this.newsDailyUpdateTask = SchedulerUtils.createScheduledTask(
            newsDailyUpdateSchedule,
            async () => {
                console.log('📰 Scheduled daily news update started...');
                await this.performDailyNewsUpdate();
            },
            {
                taskName: 'news-daily-update',
                sendAlerts: true,
                alertType: 'warning',
                startTime: this.startTime,
                minDelay: 60 * 1000
            }
        );

        // Задача 7: Обновление кеша настроений Telegram (настраиваемое расписание)
        this.telegramCacheTask = SchedulerUtils.createScheduledTask(
            telegramCacheSchedule,
            async () => {
                console.log('📱 Scheduled Telegram sentiment cache update started...');
                await this.performTelegramCacheUpdate();
            },
            {
                taskName: 'telegram-cache-update',
                sendAlerts: true,
                alertType: 'warning',
                startTime: this.startTime,
                minDelay: 60 * 1000
            }
        );

        // Задача 7.5: Мониторинг открытых позиций (каждые 5 минут)
        this.positionMonitoringTask = SchedulerUtils.createScheduledTask(
            '*/5 * * * *',
            async () => {
                console.log('📊 Scheduled position monitoring started...');
                const PositionMonitoringService = (await import('./PositionMonitoringService.js')).default;
                if (!PositionMonitoringService.isInitialized) {
                    await PositionMonitoringService.initialize();
                }
                await PositionMonitoringService.checkAllPositions();
            },
            {
                taskName: 'position-monitoring',
                sendAlerts: false, // Алерты отправляются самим PositionMonitoringService
                startTime: this.startTime,
                minDelay: 60 * 1000 // 1 минута
            }
        );

        // Задача 7.6: Ежедневный отчет (в 20:00)
        const dailyReportTime = notificationSettings.daily_report_time || '20:00';
        const [reportHour, reportMinute] = dailyReportTime.split(':').map(Number);
        const dailyReportSchedule = `${reportMinute} ${reportHour} * * *`;
        this.dailyReportTask = SchedulerUtils.createScheduledTask(
            dailyReportSchedule,
            async () => {
                console.log('📊 Scheduled daily report generation started...');
                const DailyReportService = (await import('./DailyReportService.js')).default;
                if (!DailyReportService.isInitialized) {
                    await DailyReportService.initialize();
                }
                const report = await DailyReportService.generateDailyReport();
                await DailyReportService.sendReportToTelegram(report);
            },
            {
                taskName: 'daily-report',
                sendAlerts: false, // Отчет отправляется самим DailyReportService
                startTime: this.startTime,
                minDelay: 60 * 1000 // 1 минута
            }
        );

        // Задача 7.7: Автоматическая очистка данных (каждый день в 2:00)
        try {
            const DataCleanupService = (await import('./DataCleanupService.js')).default;
            if (!DataCleanupService.isInitialized) {
                await DataCleanupService.initialize();
            }
            const settings = DataCleanupService.getSettings();
            const cleanupSchedule = settings?.cleanupSchedule || '0 2 * * *';
            if (settings?.autoCleanup) {
                this.dataCleanupTask = SchedulerUtils.createScheduledTask(
                    cleanupSchedule,
                    async () => {
                        console.log('🧹 Scheduled data cleanup started...');
                        try {
                            await DataCleanupService.performCleanup();
                        } catch (error) {
                            console.error('❌ Error in scheduled data cleanup:', error);
                        }
                    },
                    {
                        taskName: 'data-cleanup',
                        sendAlerts: false,
                        startTime: this.startTime,
                        minDelay: 60 * 1000 // 1 минута
                    }
                );
            }
        } catch (error) {
            console.warn('⚠️ Could not initialize data cleanup task:', error.message);
        }

        // Задача 8: Проверка торговых часов и уведомлений (каждые 5 минут)
        this.tradingHoursTask = SchedulerUtils.createScheduledTask(
            '*/5 * * * *',
            async () => {
                await TradingHoursService.checkAndSendNotifications();
            },
            {
                taskName: 'trading-hours-check',
                sendAlerts: false,
                startTime: this.startTime,
                minDelay: 60 * 1000
            }
        );

        // Задача 9: Проверка деградации моделей и автоматическое восстановление (каждые 6 часов)
        const degradationCheckSchedule = schedulerSettings.degradation_check_interval || '0 */6 * * *';
        this.degradationCheckTask = SchedulerUtils.createScheduledTask(
            degradationCheckSchedule,
            async () => {
                console.log('🔍 Scheduled degradation check started...');
                await this.checkDegradationAndRestoreAll();
            },
            {
                taskName: 'degradation-check',
                sendAlerts: true,
                alertType: 'warning',
                startTime: this.startTime,
                minDelay: 60 * 1000
            }
        );

        // Задача 10: Автоматический анализ портфеля (каждый час)
        // Пропускаем первый запуск, так как он будет выполнен через 30 минут после старта
        this.portfolioAnalysisTask = SchedulerUtils.createScheduledTask(
            '0 * * * *',
            async () => {
                console.log('📊 Scheduled portfolio analysis started...');
                await this.performPortfolioAnalysis();
            },
            {
                taskName: 'portfolio-analysis',
                sendAlerts: true,
                alertType: 'warning',
                startTime: this.startTime,
                minDelay: 35 * 60 * 1000, // 35 минут (первый запуск через 30 минут после старта)
                checkCacheStale: true,
                isCacheStaleFn: () => this.isCacheStale(),
                skipIfStale: true
            }
        );

        // Задача 11: Обновление предсказаний в рекомендациях каждые 20 минут
        this.predictionsUpdateTask = SchedulerUtils.createScheduledTask(
            '*/20 * * * *',
            async () => {
                console.log('🔄 Scheduled predictions update started...');
                await this.updateRecommendationsPredictions();
            },
            {
                taskName: 'predictions-update',
                sendAlerts: false, // Не отправляем в Telegram, чтобы не спамить при частых обновлениях
                startTime: this.startTime,
                minDelay: 60 * 1000,
                checkFlagFn: () => this.isFullCacheUpdateRunning,
                flagName: 'full cache update',
                checkCacheStale: true,
                isCacheStaleFn: () => this.isCacheStale(),
                skipIfStale: true
            }
        );

        // Задача 12: Обновление сигналов аналитиков раз в день (в 6:00)
        this.signalsUpdateTask = SchedulerUtils.createScheduledTask(
            '0 6 * * *',
            async () => {
                console.log('⚡ Scheduled signals update started...');
                await this.performSignalsUpdate();
            },
            {
                taskName: 'signals-update',
                sendAlerts: true,
                alertType: 'warning',
                startTime: this.startTime,
                minDelay: 60 * 1000,
                checkFlagFn: () => this.isFullCacheUpdateRunning,
                flagName: 'full cache update'
            }
        );

        // Задача 13: Проверка трейлинг-стопов (каждые 5 минут)
        this.trailingStopsCheckTask = SchedulerUtils.createScheduledTask(
            '*/5 * * * *',
            async () => {
                await this.checkTrailingStops();
            },
            {
                taskName: 'trailing-stops-check',
                sendAlerts: false,
                startTime: this.startTime,
                minDelay: 60 * 1000,
                checkFlagFn: () => this.isFullCacheUpdateRunning,
                flagName: 'full cache update'
            }
        );

        // Задача 14: Автоматическая перебалансировка стратегий (каждое воскресенье в 3:00)
        this.strategyRebalanceTask = SchedulerUtils.createScheduledTask(
            '0 3 * * 0',
            async () => {
                console.log('🔄 Scheduled strategy rebalancing started...');
                const StrategyAllocationService = (await import('./StrategyAllocationService.js')).default;
                await StrategyAllocationService.rebalanceStrategies();
                await OptimizedTelegramService.sendAlert('STRATEGY_REBALANCE_COMPLETE', 'Стратегии перебалансированы', 'info');
            },
            {
                taskName: 'strategy-rebalance',
                sendAlerts: true,
                alertType: 'warning',
                startTime: this.startTime,
                minDelay: 60 * 1000
            }
        );

        // Задача 14.5: Предварительный расчет корреляций для популярных инструментов (каждое воскресенье в 2:00)
        const correlationPrecalcSchedule = schedulerSettings.correlation_precalc_schedule || '0 2 * * 0'; // Каждое воскресенье в 2:00
        this.correlationPrecalcTask = SchedulerUtils.createScheduledTask(
            correlationPrecalcSchedule,
            async () => {
                await this.performCorrelationPrecalculation();
            },
            {
                taskName: 'correlation-precalc',
                sendAlerts: false, // performCorrelationPrecalculation уже отправляет свои уведомления об ошибках
                alertType: 'warning',
                startTime: this.startTime,
                minDelay: 60 * 60 * 1000 // 1 час
            }
        );

        // Задача 15: Динамическое перераспределение бюджета по результативности (каждое воскресенье в 4:00)
        // Выполняется после обычной перебалансировки для оптимизации распределения на основе метрик
        const dynamicRebalanceSchedule = schedulerSettings.dynamic_budget_rebalance_schedule || '0 4 * * 0'; // Каждое воскресенье в 4:00
        this.dynamicBudgetRebalanceTask = SchedulerUtils.createScheduledTask(
            dynamicRebalanceSchedule,
            async () => {
                await this.performDynamicBudgetRebalance();
            },
            {
                taskName: 'dynamic-budget-rebalance',
                sendAlerts: false, // performDynamicBudgetRebalance уже отправляет свои уведомления об ошибках
                alertType: 'warning',
                startTime: this.startTime,
                minDelay: 60 * 60 * 1000 // 1 час
            }
        );

        // Задача 16: Еженедельный бэктестинг стратегий (каждое воскресенье в 5:00)
        // Выполняется после перебалансировки бюджета для оценки производительности стратегий
        const weeklyBacktestSchedule = schedulerSettings.weekly_backtest_schedule || '0 5 * * 0'; // Каждое воскресенье в 5:00
        this.weeklyBacktestTask = SchedulerUtils.createScheduledTask(
            weeklyBacktestSchedule,
            async () => {
                await this.performWeeklyBacktesting();
            },
            {
                taskName: 'weekly-backtest',
                sendAlerts: true,
                alertType: 'warning',
                startTime: this.startTime,
                minDelay: 60 * 60 * 1000 // 1 час
            }
        );
        
        // Задача 17: Обновление макроэкономических данных
        // Расписание из настроек (по умолчанию: ежедневно в 10:00)
        const macroDataUpdateSchedule = await SettingsService.getSetting('macro_data_update_interval', '0 10 * * *');
        this.macroDataUpdateTask = SchedulerUtils.createScheduledTask(
            macroDataUpdateSchedule,
            async () => {
                await this.performMacroDataUpdate();
            },
            {
                taskName: 'macro-data-update',
                sendAlerts: true,
                alertType: 'info',
                startTime: this.startTime,
                minDelay: 30 * 60 * 1000 // 30 минут
            }
        );
        
        // Задача 18: Автоматическая ребалансировка портфеля
        // Расписание из настроек (по умолчанию: ежедневно в 2:00)
        const portfolioRebalancingSchedule = await SettingsService.getSetting('portfolio_rebalancing_check_interval', '0 2 * * *');
        this.portfolioRebalancingTask = SchedulerUtils.createScheduledTask(
            portfolioRebalancingSchedule,
            async () => {
                await this.performPortfolioRebalancing();
            },
            {
                taskName: 'portfolio-rebalancing',
                sendAlerts: true,
                alertType: 'info',
                startTime: this.startTime,
                minDelay: 60 * 60 * 1000 // 1 час
            }
        );
        
        // Запускаем периодическую отправку данных через WebSocket
        this.startWebSocketBroadcasts();
        
        // Первый анализ портфеля через 30 минут после старта (с проверкой свежести данных)
        setTimeout(async () => {
            try {
                // Проверяем свежесть данных перед первым анализом
                const isStale = await this.isCacheStale();
                if (isStale) {
                    console.log('⚠️ Cache is stale, skipping initial portfolio analysis (will run after cache update)...');
                    return;
                }
                
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
     * Использует утилиту из cacheManagementUtils
     */
    async isCacheStale() {
        return await SchedulerUtils.isCacheStale(this.cacheUpdateInterval);
    }

    /**
     * Проверяет, нужно ли обновлять кеш
     * Использует утилиту из cacheManagementUtils
     */
    async shouldUpdateCache() {
        return await SchedulerUtils.shouldUpdateCache(
            this.lastCacheUpdate,
            this.cacheUpdateInterval,
            () => this.isCacheStale()
        );
    }

    /**
     * Загружает время последнего обновления кеша из настроек
     * Использует утилиту из cacheManagementUtils
     */
    async loadLastCacheUpdateTime() {
        this.lastCacheUpdate = await SchedulerUtils.loadLastCacheUpdateTime(
            () => this.isCacheStale()
        );
    }

    /**
     * Сохраняет время последнего обновления кеша в настройки
     * Использует утилиту из cacheManagementUtils
     */
    async saveLastCacheUpdateTime() {
        if (this.lastCacheUpdate) {
            await SchedulerUtils.saveLastCacheUpdateTime(this.lastCacheUpdate);
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
                // Получаем сервисы так же, как в других местах
                let WebSocketService = null;
                let NeuralNetworkService = null;
                let TradingEngine = null;
                let EnsembleService = null;
                
                try {
                    WebSocketService = this.getWebSocketService();
                } catch (error) {
                    // Сервис не найден - это нормально, если он еще не инициализирован
                    return;
                }
                
                if (!WebSocketService) {
                    return;
                }
                
                // Получаем сервисы из глобального ServiceManager
                try {
                    NeuralNetworkService = getService('NeuralNetworkService');
                } catch (error) {
                    // Сервис не найден - используем пустой объект
                }
                
                try {
                    TradingEngine = getService('TradingEngine');
                } catch (error) {
                    // Сервис не найден - используем пустой объект
                }
                
                try {
                    EnsembleService = getService('EnsembleService');
                } catch (error) {
                    // Сервис не найден - используем пустой объект
                }
                
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
            } catch (error) {
                // Не логируем ошибки получения сервисов, чтобы не засорять консоль
                // Только логируем критические ошибки
                if (error.message && !error.message.includes('not found')) {
                    console.error('❌ Error broadcasting system status:', error);
                }
            }
        }, { scheduled: false });
        this.intervals.add(systemStatusTask);

        // Отправляем торговую статистику каждые 20 секунд (cron: каждые 20 секунд)
        const tradingStatsTask = cron.schedule('*/20 * * * * *', async () => {
            try {
                // Получаем сервисы так же, как в других местах
                let WebSocketService = null;
                let TradingEngine = null;
                
                try {
                    WebSocketService = this.getWebSocketService();
                } catch (error) {
                    // Сервис не найден - это нормально, если он еще не инициализирован
                    return;
                }
                
                if (!WebSocketService) {
                    return;
                }
                
                try {
                    TradingEngine = getService('TradingEngine');
                } catch (error) {
                    // Сервис не найден - пропускаем обновление статистики
                    return;
                }
                
                // Проверяем, не закрыта ли база данных
                if (!this.isInitialized) {
                    return;
                }
                
                // Проверяем, не закрыта ли база данных
                try {
                    const sequelize = (await import('../config/database.js')).default;
                    if (!sequelize || !sequelize.authenticate) {
                        return;
                    }
                } catch (error) {
                    return;
                }
                
                // Получаем реальную торговую статистику и состояние портфеля
                const portfolio = await TradingEngine.getVirtualPortfolioValue();
                const stats = await TradingEngine.calculateTradingStats();

                // Получаем топ-3 активные BUY-рекомендации - по одной для каждой стратегии
                const Recommendation = (await import('../models/Recommendation.js')).default;
                const topBuys = await Recommendation.getTopRecommendationsByStrategies();

                const tradingStats = {
                    portfolioValue: portfolio?.totalValue || 0,
                    cash: portfolio?.cash || 0,
                    totalPnL: stats?.totalReturn || 0,
                    initialCapital: portfolio?.initialCapital || 1000000, // Добавляем начальный капитал для расчета процента прибыли
                    winRate: (stats?.winRate || 0) * 100,
                    totalTrades: stats?.totalTrades || 0,
                    successfulTrades: Math.round((stats?.totalTrades || 0) * (stats?.winRate || 0)),
                    recommendations: (topBuys || []).map(rec => ({
                        figi: rec.figi || '',
                        ticker: rec.ticker || '',
                        name: rec.name || '',
                        recommendation: rec.recommendation || 'BUY',
                        confidence: rec.strategyData?.strategyConfidence || rec.strategyData?.confidence || rec.confidence || 0,
                        score: rec.strategyData?.score || rec.score || 0,
                        strategyType: rec.strategyType || null,
                        horizon: rec.horizon || null
                    }))
                };
                
                WebSocketService.broadcastTradingStats(tradingStats);
            } catch (error) {
                // Не логируем ошибки получения сервисов, чтобы не засорять консоль
                // Только логируем критические ошибки
                if (error.message && !error.message.includes('not found')) {
                    console.error('❌ Error broadcasting trading stats:', error);
                }
            }
        }, { scheduled: false });
        this.intervals.add(tradingStatsTask);

        // Отправляем статус обучения каждые 5 секунд (cron: каждые 5 секунд)
        const trainingStatusTask = cron.schedule('*/5 * * * * *', async () => {
            try {
                // Получаем сервисы так же, как в других местах
                let WebSocketService = null;
                let TrainingStatusService = null;
                
                try {
                    WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
                } catch (error) {
                    // Сервис не найден - это нормально, если он еще не инициализирован
                    return;
                }
                
                try {
                    TrainingStatusService = ServiceManager.getServiceSafe('TrainingStatusService');
                } catch (error) {
                    // Сервис не найден - используем дефолтный статус
                }
                
                if (WebSocketService) {
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
                // Не логируем ошибки получения сервисов, чтобы не засорять консоль
                // Только логируем критические ошибки
                if (error.message && !error.message.includes('not found')) {
                    console.error('❌ Error broadcasting training status:', error);
                }
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
            if (this.weeklyBacktestTask) {
                this.weeklyBacktestTask.stop();
                this.weeklyBacktestTask.destroy();
                this.weeklyBacktestTask = null;
                console.log('✅ Weekly backtest task stopped and destroyed');
            }
            if (this.macroDataUpdateTask) {
                this.macroDataUpdateTask.stop();
                this.macroDataUpdateTask.destroy();
                this.macroDataUpdateTask = null;
                console.log('✅ Macro data update task stopped and destroyed');
            }
            
            if (this.optionsDataUpdateTask) {
                this.optionsDataUpdateTask.stop();
                this.optionsDataUpdateTask.destroy();
                this.optionsDataUpdateTask = null;
                console.log('✅ Options data update task stopped and destroyed');
            }
            
            if (this.portfolioRebalancingTask) {
                this.portfolioRebalancingTask.stop();
                this.portfolioRebalancingTask.destroy();
                this.portfolioRebalancingTask = null;
                console.log('✅ Portfolio rebalancing task stopped and destroyed');
            }
            if (this.positionMonitoringTask) {
                this.positionMonitoringTask.stop();
                this.positionMonitoringTask.destroy();
                this.positionMonitoringTask = null;
                console.log('✅ Position monitoring task stopped and destroyed');
            }
            if (this.dailyReportTask) {
                this.dailyReportTask.stop();
                this.dailyReportTask.destroy();
                this.dailyReportTask = null;
                console.log('✅ Daily report task stopped and destroyed');
            }
            if (this.dataCleanupTask) {
                this.dataCleanupTask.stop();
                this.dataCleanupTask.destroy();
                this.dataCleanupTask = null;
                console.log('✅ Data cleanup task stopped and destroyed');
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

    /**
     * Инкрементальное обновление кеша
     * Использует утилиту из cacheUpdateUtils
     */
    async performCacheUpdate() {
        const context = {
            getWebSocketService: () => this.getWebSocketService(),
            workersSet: this.workers,
            checkFullCacheUpdate: () => this.isFullCacheUpdateRunning,
            shouldUpdateCacheFn: () => this.shouldUpdateCache(),
            updateLastCacheUpdate: (timestamp) => { this.lastCacheUpdate = timestamp; },
            performLimitedNewsUpdate: (limit) => this.performLimitedNewsUpdate(limit)
        };
        
        return await SchedulerUtils.performCacheUpdate(context);
    }

    /**
     * Полное обновление кеша (ТОЛЬКО РУЧНОЙ ЗАПУСК)
     * 
     * ВАЖНО: Это очень ресурсоемкая операция, которая:
     * - Приостанавливает ВСЕ процессы системы (обучение, анализ, обновление цен и т.д.)
     * - Может занять несколько часов в зависимости от количества инструментов
     * - Создает большую нагрузку на БД (обрабатывает все инструменты за 1 год свечей)
     * - Должна выполняться ТОЛЬКО вручную пользователем через API endpoint
     * 
     * НЕ ДОБАВЛЯТЬ автоматические вызовы этого метода!
     * 
     * Использует утилиту из cacheUpdateUtils
     * 
     * @param {boolean} force - Принудительное обновление, игнорирует проверку shouldUpdateCache()
     */
    async performFullCacheUpdate(force = false) {
        const context = {
            getWebSocketService: () => this.getWebSocketService(),
            workersSet: this.workers,
            checkFullCacheUpdate: () => this.isFullCacheUpdateRunning,
            setFullCacheUpdateRunning: (value) => { this.isFullCacheUpdateRunning = value; },
            setCurrentFullCacheUpdateWorker: (worker) => { this.currentFullCacheUpdateWorker = worker; },
            shouldUpdateCacheFn: () => this.shouldUpdateCache(),
            pauseAllProcesses: () => this.pauseAllProcesses(),
            resumeAllProcesses: () => this.resumeAllProcesses(),
            updateLastCacheUpdate: (timestamp) => { this.lastCacheUpdate = timestamp; }
            // Не передаем currentFullCacheUpdateWorker в контекст, так как это снимок значения
            // Вместо этого используем локальную переменную worker в performFullCacheUpdate
        };
        
        return await SchedulerUtils.performFullCacheUpdate(context, force);
    }

    /**
     * Приостанавливает все процессы во время полного обновления кеша
     */
    async pauseAllProcesses() {
        console.log('⏸️ Pausing all processes for full cache update...');
        
        // Останавливаем все cron задачи
        if (this.cacheTask) {
            this.cacheTask.stop();
            console.log('⏸️ Paused: cache update task');
        }
        if (this.priceUpdateTask) {
            this.priceUpdateTask.stop();
            console.log('⏸️ Paused: price update task');
        }
        if (this.portfolioPricesUpdateTask) {
            this.portfolioPricesUpdateTask.stop();
            console.log('⏸️ Paused: portfolio prices update task');
        }
        if (this.partialExitCheckTask) {
            this.partialExitCheckTask.stop();
            console.log('⏸️ Paused: partial exit check task');
        }
        if (this.activeSignalsPricesUpdateTask) {
            this.activeSignalsPricesUpdateTask.stop();
            console.log('⏸️ Paused: active signals prices update task');
        }
        if (this.tradingRequestsPricesUpdateTask) {
            this.tradingRequestsPricesUpdateTask.stop();
            console.log('⏸️ Paused: trading requests prices update task');
        }
        if (this.trainingTask) {
            this.trainingTask.stop();
            console.log('⏸️ Paused: training task');
        }
        if (this.quickTrainingTask) {
            this.quickTrainingTask.stop();
            console.log('⏸️ Paused: quick training task');
        }
        if (this.portfolioAnalysisTask) {
            this.portfolioAnalysisTask.stop();
            console.log('⏸️ Paused: portfolio analysis task');
        }
        if (this.predictionsUpdateTask) {
            this.predictionsUpdateTask.stop();
            console.log('⏸️ Paused: predictions update task');
        }
        if (this.signalsUpdateTask) {
            this.signalsUpdateTask.stop();
            console.log('⏸️ Paused: signals update task');
        }
        if (this.trailingStopsCheckTask) {
            this.trailingStopsCheckTask.stop();
            console.log('⏸️ Paused: trailing stops check task');
        }
        if (this.realPortfolioSyncTask) {
            this.realPortfolioSyncTask.stop();
            console.log('⏸️ Paused: real portfolio sync task');
        }
        if (this.virtualPortfolioUpdateTask) {
            this.virtualPortfolioUpdateTask.stop();
            console.log('⏸️ Paused: virtual portfolio update task');
        }
        if (this.degradationCheckTask) {
            this.degradationCheckTask.stop();
            console.log('⏸️ Paused: degradation check task');
        }
        if (this.weeklyBacktestTask) {
            this.weeklyBacktestTask.stop();
            console.log('⏸️ Paused: weekly backtest task');
        }
        if (this.macroDataUpdateTask) {
            this.macroDataUpdateTask.stop();
            console.log('⏸️ Paused: macro data update task');
        }
        
        console.log('✅ All processes paused');
    }

    /**
     * Возобновляет все процессы после завершения полного обновления кеша
     * ВАЖНО: Возобновляем постепенно с задержками, чтобы не перегрузить БД одновременными подключениями
     */
    async resumeAllProcesses() {
        console.log('▶️ Resuming all processes after full cache update (gradually to avoid DB overload)...');
        
        // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Возобновляем процессы постепенно с задержками
        // Это предотвращает одновременное подключение всех worker'ов к БД
        
        // Группа 1: Критичные процессы (сразу)
        if (this.trailingStopsCheckTask) {
            this.trailingStopsCheckTask.start();
            console.log('▶️ Resumed: trailing stops check task');
        }
        
        // Небольшая задержка перед следующей группой
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 секунды
        
        // Группа 2: Обновление цен (постепенно)
        if (this.priceUpdateTask) {
            this.priceUpdateTask.start();
            console.log('▶️ Resumed: price update task');
        }
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 секунда
        
        if (this.portfolioPricesUpdateTask) {
            this.portfolioPricesUpdateTask.start();
            console.log('▶️ Resumed: portfolio prices update task');
        }
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 секунда
        
        if (this.partialExitCheckTask) {
            this.partialExitCheckTask.start();
            console.log('▶️ Resumed: partial exit check task');
        }
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 секунда
        
        if (this.activeSignalsPricesUpdateTask) {
            this.activeSignalsPricesUpdateTask.start();
            console.log('▶️ Resumed: active signals prices update task');
        }
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 секунда
        
        if (this.tradingRequestsPricesUpdateTask) {
            this.tradingRequestsPricesUpdateTask.start();
            console.log('▶️ Resumed: trading requests prices update task');
        }
        
        // Задержка перед тяжелыми процессами
        await new Promise(resolve => setTimeout(resolve, 3000)); // 3 секунды
        
        // Группа 3: Анализ и предсказания
        if (this.portfolioAnalysisTask) {
            this.portfolioAnalysisTask.start();
            console.log('▶️ Resumed: portfolio analysis task');
        }
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 секунды
        
        if (this.predictionsUpdateTask) {
            this.predictionsUpdateTask.start();
            console.log('▶️ Resumed: predictions update task');
        }
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 секунды
        
        // Группа 4: Обновление кеша и обучение (самые тяжелые)
        if (this.cacheTask) {
            this.cacheTask.start();
            console.log('▶️ Resumed: cache update task');
        }
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 секунды
        
        if (this.trainingTask) {
            this.trainingTask.start();
            console.log('▶️ Resumed: training task');
        }
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 секунды
        
        if (this.quickTrainingTask) {
            this.quickTrainingTask.start();
            console.log('▶️ Resumed: quick training task');
        }
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 секунды
        
        // Группа 5: Остальные процессы
        if (this.signalsUpdateTask) {
            this.signalsUpdateTask.start();
            console.log('▶️ Resumed: signals update task');
        }
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 секунда
        
        if (this.realPortfolioSyncTask) {
            this.realPortfolioSyncTask.start();
            console.log('▶️ Resumed: real portfolio sync task');
        }
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 секунда
        
        if (this.virtualPortfolioUpdateTask) {
            this.virtualPortfolioUpdateTask.start();
            console.log('▶️ Resumed: virtual portfolio update task');
        }
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 секунда
        
        if (this.degradationCheckTask) {
            this.degradationCheckTask.start();
            console.log('▶️ Resumed: degradation check task');
        }
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 секунда
        
        if (this.weeklyBacktestTask) {
            this.weeklyBacktestTask.start();
            console.log('▶️ Resumed: weekly backtest task');
        }
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 секунда
        
        if (this.macroDataUpdateTask) {
            this.macroDataUpdateTask.start();
            console.log('▶️ Resumed: macro data update task');
        }
        
        // Задержка перед следующей группой
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 секунды
        
        if (this.optionsDataUpdateTask) {
            this.optionsDataUpdateTask.start();
            console.log('▶️ Resumed: options data update task');
        }
        
        console.log('✅ All processes resumed gradually (total delay: ~22 seconds)');
    }

    /**
     * Обновление цен акций через worker thread
     */
    /**
     * Обновление цен инструментов
     * Использует утилиту из priceUpdateUtils
     */
    async performPriceUpdate() {
        const context = {
            getWebSocketService: () => this.getWebSocketService(),
            workersSet: this.workers,
            checkFullCacheUpdate: () => this.isFullCacheUpdateRunning
        };
        
        const result = await SchedulerUtils.performPriceUpdate(context);

            // Обновляем время последнего обновления цен
        if (result && !result.skipped) {
            this.lastPriceUpdate = Date.now();
            console.log(`📅 Price update timestamp updated: ${new Date(this.lastPriceUpdate).toISOString()}`);
            }

            return result;
    }

    /**
     * Обновление цен активных позиций в портфеле
     * Выполняется каждые 1-2 минуты в торговые часы
     * Использует утилиту из priceUpdateUtils
     */
    async performPortfolioPricesUpdate() {
        const context = {
            getWebSocketService: () => this.getWebSocketService(),
            workersSet: this.workers,
            checkFullCacheUpdate: () => this.isFullCacheUpdateRunning,
            recalculatePortfolioValue: () => this.recalculatePortfolioValue()
        };
        
        return await SchedulerUtils.performPortfolioPricesUpdate(context);
    }

    /**
     * Пересчет стоимости портфеля на основе обновленных цен
     * Использует утилиту из priceUpdateUtils
     */
    async recalculatePortfolioValue() {
        const context = {
            getWebSocketService: () => this.getWebSocketService()
        };
        
        return await SchedulerUtils.recalculatePortfolioValue(context);
    }

    /**
     * Обновление цен активных сигналов
     * Выполняется каждые 5-10 минут в торговые часы
     * Использует утилиту из priceUpdateUtils
     */
    async performActiveSignalsPricesUpdate() {
        const context = {
            getWebSocketService: () => this.getWebSocketService(),
            workersSet: this.workers,
            checkFullCacheUpdate: () => this.isFullCacheUpdateRunning,
            handleTriggeredSignals: (signals) => this.handleTriggeredSignals(signals)
        };
        
        return await SchedulerUtils.performActiveSignalsPricesUpdate(context);
    }

    /**
     * Обработка сработавших сигналов (достижение targetPrice или stoploss)
     */
    async handleTriggeredSignals(triggeredSignals) {
        try {
            const OptimizedTelegramService = (await import('./OptimizedTelegramService.js')).default;
            const CachedSignal = (await import('../models/CachedSignal.js')).default;
            const CachedInstrument = (await import('../models/CachedInstrument.js')).default;
            const TriggeredSignal = (await import('../models/TriggeredSignal.js')).default;
            const WebSocketService = await this.getWebSocketService();

            for (const triggered of triggeredSignals) {
                try {
                    // Получаем информацию об инструменте
                    const instrument = await CachedInstrument.findOne({
                        where: { figi: triggered.figi }
                    });

                    const ticker = instrument?.ticker || triggered.figi;
                    const name = instrument?.name || 'Неизвестный инструмент';

                    // Получаем исходный сигнал для дополнительной информации
                    const originalSignal = await CachedSignal.findOne({
                        where: { signalId: triggered.signalId }
                    });

                    // Функция для преобразования цены из формата {units, nano} в число
                    const formatPrice = (priceObj) => {
                        if (!priceObj) return null;
                        if (typeof priceObj === 'number') return priceObj;
                        if (typeof priceObj === 'object' && priceObj.units !== undefined) {
                            const units = parseFloat(priceObj.units || 0);
                            const nano = parseFloat(priceObj.nano || 0) / 1000000000;
                            return units + nano;
                        }
                        return parseFloat(priceObj) || null;
                    };

                    // Преобразуем цены из исходного сигнала в числа
                    const initialPrice = formatPrice(triggered.initialPrice || originalSignal?.initialPrice);
                    const targetPrice = formatPrice(triggered.targetPrice || originalSignal?.targetPrice);
                    const stoploss = formatPrice(triggered.stoploss || originalSignal?.stoploss);

                    // Сохраняем или обновляем сработавший сигнал в БД
                    // Обновляем счетчик срабатываний, если сигнал уже существует
                    try {
                        const [existingSignal, created] = await TriggeredSignal.findOrCreate({
                            where: {
                                signalId: triggered.signalId,
                                triggerType: triggered.triggerType
                            },
                            defaults: {
                                signalId: triggered.signalId,
                                strategyId: triggered.strategyId || originalSignal?.strategyId || '',
                                strategyName: triggered.strategyName || originalSignal?.strategyName || 'Неизвестна',
                                figi: triggered.figi,
                                ticker: ticker,
                                name: name,
                                direction: triggered.direction,
                                triggerType: triggered.triggerType,
                                initialPrice: initialPrice,
                                currentPrice: triggered.currentPrice,
                                targetPrice: targetPrice,
                                stoploss: stoploss,
                                signalName: triggered.name || originalSignal?.name || null,
                                probability: triggered.probability || originalSignal?.probability || null,
                                status: 'triggered',
                                triggerCount: 1,
                                lastTriggeredAt: new Date(),
                                triggeredAt: new Date(),
                                signalCreateDt: originalSignal?.createDt || null,
                                signalEndDt: originalSignal?.endDt || null
                            }
                        });

                        if (!created && existingSignal) {
                            // Обновляем существующий сигнал: увеличиваем счетчик и обновляем цены
                            await existingSignal.update({
                                triggerCount: (existingSignal.triggerCount || 1) + 1,
                                lastTriggeredAt: new Date(),
                                currentPrice: triggered.currentPrice, // Обновляем текущую цену
                                updatedAt: new Date()
                            });
                            console.log(`🔄 Triggered signal updated: ${triggered.signalId} (${triggered.triggerType}) - count: ${existingSignal.triggerCount + 1}`);
                        } else {
                            console.log(`💾 Triggered signal saved to DB: ${triggered.signalId} (${triggered.triggerType})`);
                        }

                        // Добавляем сигнал в очередь для отправки после анализа
                        // Используем актуальные данные из БД
                        const signalToNotify = await TriggeredSignal.findOne({
                            where: {
                                signalId: triggered.signalId,
                                triggerType: triggered.triggerType
                            }
                        });

                        if (signalToNotify) {
                            // Защита от утечки памяти: ограничиваем размер массива
                            if (this.pendingTriggeredSignals.length >= this.maxPendingSignals) {
                                // Удаляем самые старые записи (FIFO)
                                const removeCount = Math.floor(this.maxPendingSignals * 0.1); // Удаляем 10%
                                this.pendingTriggeredSignals.splice(0, removeCount);
                                console.warn(`⚠️ Pending signals buffer full, removed ${removeCount} oldest entries`);
                            }
                            
                            // Используем данные из БД, а не из объекта triggered
                            this.pendingTriggeredSignals.push({
                                signalId: signalToNotify.signalId,
                                strategyId: signalToNotify.strategyId,
                                strategyName: signalToNotify.strategyName,
                                figi: signalToNotify.figi,
                                ticker: ticker,
                                name: name,
                                direction: signalToNotify.direction,
                                triggerType: signalToNotify.triggerType,
                                initialPrice: signalToNotify.initialPrice,
                                currentPrice: signalToNotify.currentPrice,
                                targetPrice: signalToNotify.targetPrice,
                                stoploss: signalToNotify.stoploss,
                                signalName: signalToNotify.signalName,
                                probability: signalToNotify.probability,
                                triggerCount: signalToNotify.triggerCount,
                                lastTriggeredAt: signalToNotify.lastTriggeredAt,
                                signalCreateDt: originalSignal?.createDt || signalToNotify.signalCreateDt || null,
                                signalEndDt: originalSignal?.endDt || signalToNotify.signalEndDt || null
                            });
                        }
                    } catch (dbError) {
                        console.error(`❌ Error saving triggered signal to DB:`, dbError.message);
                    }
                } catch (signalError) {
                    console.error(`❌ Error handling triggered signal ${triggered.signalId}:`, signalError.message);
                }
            }
        } catch (error) {
            console.error('❌ Error handling triggered signals:', error);
        }
    }

    /**
     * Обновление цен активных торговых заявок
     * Выполняется каждые 30 секунд - 1 минуту в торговые часы
     */
    /**
     * Обновление цен активных торговых заявок
     * Использует утилиту из priceUpdateUtils
     */
    async performTradingRequestsPricesUpdate() {
        const context = {
            getWebSocketService: () => this.getWebSocketService(),
            workersSet: this.workers,
            checkFullCacheUpdate: () => this.isFullCacheUpdateRunning
        };
        
        const result = await SchedulerUtils.performTradingRequestsPricesUpdate(context);

            // Обрабатываем заявки, готовые к исполнению
        if (result && result.readyToExecute && result.readyToExecute.length > 0) {
                await this.handleReadyToExecuteRequests(result.readyToExecute);
            }

            return result;
    }

    /**
     * Обработка заявок, готовых к исполнению
     */
    async handleReadyToExecuteRequests(readyToExecute) {
        try {
            const OptimizedTelegramService = (await import('./OptimizedTelegramService.js')).default;
            const TradingRequest = (await import('../models/TradingRequest.js')).default;
            const WebSocketService = await this.getWebSocketService();

            for (const requestData of readyToExecute) {
                try {
                    // Получаем заявку из БД
                    const request = await TradingRequest.findByPk(requestData.requestId);
                    if (!request) {
                        continue;
                    }

                    // Пропускаем уже исполненные, отклоненные или отмененные заявки
                    if (['EXECUTED', 'REJECTED', 'CANCELLED'].includes(request.status)) {
                        console.log(`⏭️ Skipping request ${requestData.requestId} - status is ${request.status}`);
                        continue;
                    }

                    // Формируем сообщение
                    const actionText = requestData.action === 'BUY' ? 'ПОКУПКА' : 'ПРОДАЖА';
                    const statusText = requestData.isPriceReached ? '✅ Цена достигнута - готово к исполнению' : '⚠️ Цена приближается - готово к исполнению';
                    
                    const message = `📋 Заявка готова к исполнению\n` +
                        `📈 Инструмент: ${requestData.ticker} (${requestData.name})\n` +
                        `📊 Действие: ${actionText}\n` +
                        `💰 Цена заявки: ${requestData.priceAtRequest.toFixed(2)} ₽\n` +
                        `💵 Текущая цена: ${requestData.currentPrice.toFixed(2)} ₽\n` +
                        `📉 Разница: ${requestData.priceDiffPercent.toFixed(2)}%\n` +
                        `📦 Количество: ${requestData.quantity}\n` +
                        `🎯 Уверенность: ${(requestData.confidence * 100).toFixed(0)}%\n` +
                        `📋 Статус: ${statusText}`;

                    // Отправляем уведомление в Telegram
                    await OptimizedTelegramService.sendAlert(
                        'Заявка готова к исполнению',
                        message,
                        requestData.isPriceReached ? 'success' : 'info'
                    );

                    // Отправляем уведомление через WebSocket
                    if (WebSocketService) {
                        WebSocketService.broadcast({
                            type: 'trading_request_ready_to_execute',
                            data: {
                                requestId: requestData.requestId,
                                figi: requestData.figi,
                                ticker: requestData.ticker,
                                name: requestData.name,
                                action: requestData.action,
                                priceAtRequest: requestData.priceAtRequest,
                                currentPrice: requestData.currentPrice,
                                priceDiffPercent: requestData.priceDiffPercent,
                                isPriceReached: requestData.isPriceReached,
                                isPriceApproaching: requestData.isPriceApproaching,
                                quantity: requestData.quantity,
                                status: requestData.status,
                                timestamp: new Date().toISOString()
                            }
                        });
                    }

                    console.log(`✅ Request ready to execute: ${requestData.requestId} (${requestData.figi}) - ${statusText}`);
                } catch (requestError) {
                    console.error(`❌ Error handling ready to execute request ${requestData.requestId}:`, requestError.message);
                }
            }
        } catch (error) {
            console.error('❌ Error handling ready to execute requests:', error);
        }
    }

    async performCleanup() {
        try {
            const { CachedCandle } = await import('../models/CachedCandle.js');
            const TriggeredSignal = (await import('../models/TriggeredSignal.js')).default;

            // Удаляем свечи старше 30 дней
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const deletedCandlesCount = await CachedCandle.destroy({
                where: {
                    time: {
                        [Op.lt]: thirtyDaysAgo
                    }
                }
            });

            // Удаляем сработавшие сигналы старше 1 суток (24 часа)
            const oneDayAgo = new Date();
            oneDayAgo.setDate(oneDayAgo.getDate() - 1);

            const deletedSignalsCount = await TriggeredSignal.destroy({
                where: {
                    triggeredAt: {
                        [Op.lt]: oneDayAgo
                    }
                }
            });

            console.log(`🧹 Cleanup completed. Deleted ${deletedCandlesCount} old candles, ${deletedSignalsCount} old triggered signals`);
        } catch (error) {
            console.error('Cleanup error:', error);
            throw error;
        }
    }

    async performScheduledTraining() {
        // Проверяем, не идет ли полное обновление кеша
        if (this.isFullCacheUpdateRunning) {
            console.log('🧠 Scheduled training skipped: full cache update is running');
            return;
        }
        
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
        // Проверяем, не идет ли полное обновление кеша
        if (this.isFullCacheUpdateRunning) {
            console.log('⚡ Quick training skipped: full cache update is running');
            return;
        }
        
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
        // Проверяем, не идет ли полное обновление кеша
        if (this.isFullCacheUpdateRunning) {
            console.log('🔄 Predictions update skipped: full cache update is running');
            return;
        }
        
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
        // Проверяем, не идет ли полное обновление кеша
        if (this.isFullCacheUpdateRunning) {
            console.log('⚠️ Portfolio analysis skipped: full cache update is running');
            return;
        }
        
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
            // ВАРИАНТ 2: Используем DatabaseConnectionManager без лишних authenticate()
            const DatabaseConnectionManager = (await import('../utils/DatabaseConnectionManager.js')).default;
            const requesterId = `portfolio-analysis-${Date.now()}`;
            
            console.log(`📊 Requesting database connection before portfolio analysis (${requesterId})...`);
            const connection = await DatabaseConnectionManager.acquireConnection(requesterId, 60000);
            console.log(`✅ Database connection acquired (${connection.connectionId}), starting analysis...`);
            
            // Освобождаем подключение сразу после проверки, анализ получит свое через worker
            connection.release();

            // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Анализируем портфели последовательно с задержками
            // Это предотвращает одновременное подключение нескольких worker'ов к БД
            
            // Анализируем виртуальный портфель
            try {
                await NeuralNetworkService.analyzePortfolioAndSave('virtual');
                console.log('✅ Virtual portfolio analysis completed');
            } catch (error) {
                console.error('❌ Error analyzing virtual portfolio:', error);
            }

            // Задержка перед анализом реального портфеля (если есть)
            // Это дает время БД освободить соединения от первого worker'а
            await new Promise(resolve => setTimeout(resolve, 3000)); // 3 секунды

            // Анализируем реальный портфель (если есть)
            try {
                const TradingEngine = (await import('./TradingEngine.js')).default;
                const realPortfolio = await TradingEngine.getRealPortfolioValue();
                if (realPortfolio && realPortfolio.positions) {
                    const positions = Array.isArray(realPortfolio.positions) 
                        ? realPortfolio.positions 
                        : Object.keys(realPortfolio.positions);
                    if (positions.length > 0) {
                        // ВАРИАНТ 2 и 6: Используем DatabaseConnectionManager с retry вместо прямых authenticate()
                        const DatabaseConnectionManager = (await import('../utils/DatabaseConnectionManager.js')).default;
                        const requesterId2 = `real-portfolio-analysis-${Date.now()}`;
                        
                        try {
                            const connection2 = await DatabaseConnectionManager.acquireConnection(requesterId2, 60000);
                            console.log(`✅ Database connection acquired for real portfolio analysis (${connection2.connectionId})`);
                            connection2.release();
                        } catch (dbError) {
                            console.error('❌ Database connection failed before real portfolio analysis:', dbError.message);
                            // DatabaseConnectionManager уже обработал retry с exponential backoff
                            throw dbError;
                        }
                        
                        await NeuralNetworkService.analyzePortfolioAndSave('real');
                        console.log('✅ Real portfolio analysis completed');
                    }
                }
            } catch (error) {
                console.error('❌ Error analyzing real portfolio:', error);
            }

            console.log('✅ Portfolio analysis completed for all portfolio types');

            // Отправляем накопленные сработавшие сигналы после завершения анализа
            if (this.pendingTriggeredSignals.length > 0) {
                await this.sendPendingTriggeredSignals();
            }
        } catch (error) {
            console.error('❌ Error performing portfolio analysis:', error);
            throw error;
        } finally {
            this.isAnalyzing = false;
        }
    }

    /**
     * Отправка накопленных сработавших сигналов раз после анализа
     * Это позволяет избежать неактуальности и дублирования уведомлений
     */
    async sendPendingTriggeredSignals() {
        if (this.pendingTriggeredSignals.length === 0) {
            return;
        }

        try {
            const OptimizedTelegramService = (await import('./OptimizedTelegramService.js')).default;
            const WebSocketService = await this.getWebSocketService();
            const translateStrategy = (await import('../utils/strategyTranslator.js')).default;

            // Фильтруем сигналы: отправляем только сигналы не старше 24 часов
            const now = Date.now();
            const maxAge = 1 * 24 * 60 * 60 * 1000; // 1 день (24 часа)
            const maxTimeSinceEnd = 1 * 24 * 60 * 60 * 1000; // 1 день после окончания

            const filteredSignals = this.pendingTriggeredSignals.filter(triggered => {
                // Проверяем дату создания сигнала
                if (triggered.signalCreateDt) {
                    const signalAge = now - new Date(triggered.signalCreateDt).getTime();
                    if (signalAge > maxAge) {
                        const hoursAgo = Math.floor(signalAge / (60 * 60 * 1000));
                        console.log(`⏭️ Skipped old triggered signal ${triggered.signalId}: created ${hoursAgo} hours ago`);
                        return false;
                    }
                }

                // Проверяем дату окончания сигнала
                if (triggered.signalEndDt) {
                    const endDt = new Date(triggered.signalEndDt);
                    const timeSinceEnd = now - endDt.getTime();
                    if (timeSinceEnd > maxTimeSinceEnd) {
                        const daysAgo = Math.floor(timeSinceEnd / (24 * 60 * 60 * 1000));
                        console.log(`⏭️ Skipped expired triggered signal ${triggered.signalId}: ended ${daysAgo} days ago`);
                        return false;
                    }
                }

                return true;
            });

            // Группируем сигналы по инструменту для более компактного представления
            const signalsByInstrument = {};
            for (const triggered of filteredSignals) {
                const key = `${triggered.figi}_${triggered.triggerType}`;
                if (!signalsByInstrument[key]) {
                    signalsByInstrument[key] = [];
                }
                signalsByInstrument[key].push(triggered);
            }

            // Собираем все сигналы в одно сообщение для группировки
            const signalMessages = [];
            const signalWebSocketData = [];

            // Формируем сообщения для каждого уникального сигнала
            for (const [key, signals] of Object.entries(signalsByInstrument)) {
                const triggered = signals[0]; // Берем первый сигнал для базовой информации
                const latestSignal = signals[signals.length - 1]; // Берем последний для актуальной цены
                const totalCount = signals.reduce((sum, s) => sum + (s.triggerCount || 1), 0);

                try {
                    const directionText = triggered.direction === 'SIGNAL_DIRECTION_BUY' ? 'ПОКУПКА' : 'ПРОДАЖА';
                    const triggerText = triggered.triggerType === 'target_reached' ? '✅ Целевая цена достигнута' : '⚠️ Стоп-лосс сработал';
                    const strategyNameRu = translateStrategy(triggered.strategyName || 'Неизвестна');
                    
                    // Получаем информацию о стратегии нашей системы (если есть связь через TradingRequest)
                    let ourStrategyName = null;
                    let ourStrategy = null;
                    try {
                        // Проверяем доступность соединения с БД перед запросом
                        const sequelize = (await import('../config/database.js')).default;
                        let dbAvailable = false;
                        
                        try {
                            // Проверяем, не закрыт ли пул соединений
                            if (sequelize.connectionManager && sequelize.connectionManager.pool) {
                                const pool = sequelize.connectionManager.pool;
                                if (!pool._draining && !pool._closed) {
                                    dbAvailable = true;
                                }
                            } else {
                                // Если пула нет, считаем что соединение может быть доступно
                                dbAvailable = true;
                            }
                        } catch (dbCheckError) {
                            // Соединение недоступно
                            dbAvailable = false;
                        }
                        
                        if (dbAvailable) {
                            const TriggeredSignal = (await import('../models/TriggeredSignal.js')).default;
                            const TradingRequest = (await import('../models/TradingRequest.js')).default;
                            const TradingStrategy = (await import('../models/TradingStrategy.js')).default;
                            
                            // Находим TriggeredSignal в БД
                            const triggeredSignalFromDb = await TriggeredSignal.findOne({
                                where: {
                                    signalId: triggered.signalId,
                                    triggerType: triggered.triggerType
                                }
                            });
                            
                            // Если есть связь с TradingRequest, получаем стратегию
                            if (triggeredSignalFromDb?.tradingRequestId) {
                                const tradingRequest = await TradingRequest.findByPk(triggeredSignalFromDb.tradingRequestId);
                                
                                if (tradingRequest?.strategyId) {
                                    const strategy = await TradingStrategy.findByPk(tradingRequest.strategyId);
                                    if (strategy) {
                                        ourStrategyName = strategy.name;
                                        ourStrategy = strategy;
                                    }
                                }
                            }
                        }
                    } catch (strategyError) {
                        // Игнорируем ошибки при получении стратегии (включая ошибки закрытого соединения)
                        if (!strategyError.message || !strategyError.message.includes('connection manager was closed')) {
                            console.warn('⚠️ Could not get our strategy for signal:', strategyError.message);
                        }
                    }
                    
                    // Рассчитываем рекомендуемое количество для покупки
                    let recommendedQuantity = null;
                    let recommendedAmount = null;
                    let potentialProfit = null;
                    let maxLoss = null;
                    let portfolioPercent = null;
                    try {
                        // Проверяем доступность соединения с БД перед запросом
                        const sequelize = (await import('../config/database.js')).default;
                        let dbAvailable = false;
                        
                        try {
                            // Проверяем, не закрыт ли пул соединений
                            if (sequelize.connectionManager && sequelize.connectionManager.pool) {
                                const pool = sequelize.connectionManager.pool;
                                if (!pool._draining && !pool._closed) {
                                    // Пытаемся выполнить простой запрос для проверки соединения
                                    await sequelize.authenticate();
                                    dbAvailable = true;
                                }
                            } else {
                                // Если пула нет, пытаемся подключиться
                                await sequelize.authenticate();
                                dbAvailable = true;
                            }
                        } catch (dbCheckError) {
                            // Соединение недоступно, используем значения по умолчанию
                            console.warn('⚠️ Database connection unavailable for recommended quantity calculation, using defaults');
                            dbAvailable = false;
                        }
                        
                        let totalBudget = 1000000; // Значение по умолчанию
                        
                        if (dbAvailable) {
                            try {
                                const SettingsService = (await import('./SettingsService.js')).default;
                                const portfolioSettings = await SettingsService.getPortfolioSettings();
                                totalBudget = portfolioSettings.user_max_portfolio_budget || 1000000;
                            } catch (settingsError) {
                                // Если не удалось получить настройки, используем значение по умолчанию
                                console.warn('⚠️ Could not get portfolio settings, using default budget:', settingsError.message);
                            }
                        }
                        
                        const currentPrice = latestSignal.currentPrice;
                        
                        // Валидация текущей цены перед расчетами
                        if (!currentPrice || currentPrice <= 0 || isNaN(currentPrice)) {
                            console.warn(`⚠️ Invalid currentPrice for signal ${triggered.signalId}: ${currentPrice}, skipping quantity calculation`);
                            throw new Error(`Invalid currentPrice: ${currentPrice}`);
                        }
                        
                        const stoploss = latestSignal.stoploss || (currentPrice * 0.95); // Если нет стоп-лосса, используем -5%
                        const targetPrice = latestSignal.targetPrice || (currentPrice * 1.1); // Если нет цели, используем +10%
                        
                        // Определяем доступный бюджет
                        let availableBudget = totalBudget;
                        if (ourStrategy && ourStrategy.budgetAllocation) {
                            // Если есть стратегия с выделенным бюджетом
                            availableBudget = totalBudget * (ourStrategy.budgetAllocation / 100);
                        } else {
                            // Консервативный подход: максимум 5% от портфеля на одну позицию
                            availableBudget = totalBudget * 0.05;
                        }
                        
                        // Расчет на основе риска (консервативный подход)
                        // Максимальный риск на позицию: 2% от портфеля
                        const maxRiskPercent = 2.0;
                        const maxRiskAmount = totalBudget * (maxRiskPercent / 100);
                        
                        // Риск на одну акцию (разница между текущей ценой и стоп-лоссом)
                        const riskPerShare = Math.abs(currentPrice - stoploss);
                        
                        if (riskPerShare > 0 && currentPrice > 0) {
                            // Количество акций на основе риска
                            const quantityByRisk = Math.floor(maxRiskAmount / riskPerShare);
                            
                            // Количество акций на основе бюджета (с проверкой на деление на ноль)
                            const quantityByBudget = Math.floor(availableBudget / currentPrice);
                            
                            // Берем минимум из двух (более консервативный подход)
                            recommendedQuantity = Math.min(quantityByRisk, quantityByBudget);
                            
                            // Рассчитываем сумму инвестиций
                            recommendedAmount = recommendedQuantity * currentPrice;
                            
                            // Процент от портфеля
                            portfolioPercent = ((recommendedAmount / totalBudget) * 100).toFixed(2);
                            
                            // Потенциальная прибыль при достижении цели
                            if (targetPrice > currentPrice) {
                                const profitPerShare = targetPrice - currentPrice;
                                potentialProfit = recommendedQuantity * profitPerShare;
                            }
                            
                            // Максимальный убыток при срабатывании стоп-лосса
                            if (stoploss < currentPrice) {
                                const lossPerShare = currentPrice - stoploss;
                                maxLoss = recommendedQuantity * lossPerShare;
                            }
                        }
                    } catch (calcError) {
                        // Игнорируем ошибки расчета
                        console.warn('⚠️ Could not calculate recommended quantity:', calcError.message);
                    }
                    
                    // Формируем понятное сообщение для пользователя
                    const instrumentName = triggered.name || 'Неизвестный инструмент';
                    const signalName = triggered.signalName || 'Сигнал';
                    
                    // Заголовок с понятным объяснением
                    let message = `🔔 <b>СИГНАЛ СРАБОТАЛ</b>\n\n`;
                    message += `📊 <b>Что произошло:</b>\n`;
                    message += `Сигнал "${signalName}" для инструмента ${triggered.ticker} (${instrumentName}) достиг своей цели.\n\n`;
                    
                    // Основная информация
                    message += `📈 <b>Инструмент:</b> ${triggered.ticker} (${instrumentName})\n`;
                    message += `📊 <b>Направление:</b> ${directionText}\n`;
                    message += `🎯 <b>Результат:</b> ${triggerText}\n\n`;
                    
                    // Цены с понятными объяснениями
                    message += `💰 <b>Цены:</b>\n`;
                    if (latestSignal.initialPrice) {
                        const isBuy = triggered.direction === 'SIGNAL_DIRECTION_BUY';
                        const priceChange = latestSignal.currentPrice - latestSignal.initialPrice;
                        const priceChangePercent = ((priceChange / latestSignal.initialPrice) * 100).toFixed(2);
                        const changeSign = priceChange >= 0 ? '+' : '';
                        const changeEmoji = priceChange >= 0 ? '📈' : '📉';
                        
                        message += `• Входная цена (цена ${isBuy ? 'покупки' : 'продажи'}): <b>${latestSignal.initialPrice.toFixed(2)} ₽</b>\n`;
                        message += `• Текущая цена (сейчас): <b>${latestSignal.currentPrice.toFixed(2)} ₽</b> ${changeEmoji} (${changeSign}${priceChangePercent}%)\n`;
                    } else {
                        message += `• Текущая цена (сейчас): <b>${latestSignal.currentPrice.toFixed(2)} ₽</b>\n`;
                    }
                    if (latestSignal.targetPrice) {
                        const targetReached = triggered.triggerType === 'target_reached';
                        const isBuy = triggered.direction === 'SIGNAL_DIRECTION_BUY';
                        const isSell = triggered.direction === 'SIGNAL_DIRECTION_SELL';
                        
                        // Для BUY: целевая цена должна быть выше входной (ожидается рост)
                        // Для SELL: целевая цена должна быть ниже входной (ожидается падение)
                        if (targetReached) {
                            // Время достижения цели
                            const targetReachedTime = triggered.lastTriggeredAt || triggered.triggeredAt;
                            const timeStr = targetReachedTime ? new Date(targetReachedTime).toLocaleString('ru-RU', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                            }) : 'ранее';
                            
                            if (isBuy) {
                                // Для BUY: если текущая цена >= целевой, значит цена выросла до цели
                                if (latestSignal.currentPrice >= latestSignal.targetPrice) {
                                    message += `• Целевая цена (достигнута ${timeStr}): <b>${latestSignal.targetPrice.toFixed(2)} ₽</b> ✅\n`;
                                    if (latestSignal.currentPrice > latestSignal.targetPrice) {
                                        const excessProfit = ((latestSignal.currentPrice - latestSignal.targetPrice) / latestSignal.targetPrice * 100).toFixed(2);
                                        message += `  <i>Цель была достигнута ${timeStr}. Сейчас цена ${latestSignal.currentPrice.toFixed(2)} ₽ (выше цели на ${excessProfit}%)</i>\n`;
                                    } else {
                                        message += `  <i>Цена выросла с ${latestSignal.initialPrice ? latestSignal.initialPrice.toFixed(2) : 'входной'} ₽ до ${latestSignal.currentPrice.toFixed(2)} ₽</i>\n`;
                                    }
                                } else {
                                    // Странная ситуация: для BUY текущая цена ниже целевой при срабатывании
                                    message += `• Целевая цена: <b>${latestSignal.targetPrice.toFixed(2)} ₽</b> ⚠️\n`;
                                    message += `  <i>Внимание: текущая цена ниже целевой для сигнала на покупку</i>\n`;
                                }
                            } else if (isSell) {
                                // Для SELL: если текущая цена <= целевой, значит цена упала до цели
                                if (latestSignal.currentPrice <= latestSignal.targetPrice) {
                                    message += `• Целевая цена (достигнута ${timeStr}): <b>${latestSignal.targetPrice.toFixed(2)} ₽</b> ✅\n`;
                                    if (latestSignal.currentPrice < latestSignal.targetPrice) {
                                        const excessProfit = ((latestSignal.targetPrice - latestSignal.currentPrice) / latestSignal.targetPrice * 100).toFixed(2);
                                        message += `  <i>Цель была достигнута ${timeStr}. Сейчас цена ${latestSignal.currentPrice.toFixed(2)} ₽ (ниже цели на ${excessProfit}%)</i>\n`;
                                    } else {
                                        message += `  <i>Цена упала с ${latestSignal.initialPrice ? latestSignal.initialPrice.toFixed(2) : 'входной'} ₽ до ${latestSignal.currentPrice.toFixed(2)} ₽</i>\n`;
                                    }
                                } else {
                                    message += `• Целевая цена: <b>${latestSignal.targetPrice.toFixed(2)} ₽</b> ⚠️\n`;
                                    message += `  <i>Внимание: текущая цена выше целевой для сигнала на продажу</i>\n`;
                                }
                            } else {
                                message += `• Целевая цена (достигнута ${timeStr}): <b>${latestSignal.targetPrice.toFixed(2)} ₽</b> ✅\n`;
                            }
                        } else {
                            message += `• Целевая цена (ожидается): <b>${latestSignal.targetPrice.toFixed(2)} ₽</b>\n`;
                            if (isBuy && latestSignal.initialPrice) {
                                const profitToTarget = ((latestSignal.targetPrice - latestSignal.initialPrice) / latestSignal.initialPrice * 100).toFixed(2);
                                message += `  <i>Ожидается рост на ${profitToTarget}% от входной цены</i>\n`;
                            } else if (isSell && latestSignal.initialPrice) {
                                const profitToTarget = ((latestSignal.initialPrice - latestSignal.targetPrice) / latestSignal.initialPrice * 100).toFixed(2);
                                message += `  <i>Ожидается падение на ${profitToTarget}% от входной цены</i>\n`;
                            }
                        }
                    }
                    if (latestSignal.stoploss) {
                        message += `• Стоп-лосс (защита от убытков): <b>${latestSignal.stoploss.toFixed(2)} ₽</b>\n`;
                    }
                    message += `\n`;
                    
                    // Прибыль/убыток с понятным объяснением
                    if (latestSignal.initialPrice && latestSignal.currentPrice) {
                        const profitPercent = ((latestSignal.currentPrice - latestSignal.initialPrice) / latestSignal.initialPrice * 100);
                        const profitSign = profitPercent >= 0 ? '+' : '';
                        const profitAbs = Math.abs(profitPercent).toFixed(2);
                        const profitRub = Math.abs(latestSignal.currentPrice - latestSignal.initialPrice).toFixed(2);
                        
                        if (profitPercent >= 0) {
                            message += `📈 <b>Прибыль:</b> <b>${profitSign}${profitAbs}%</b> (${profitSign}${profitRub} ₽ на каждую акцию)\n`;
                            message += `Это означает, что если вы купили по входной цене, сейчас вы в прибыли!\n\n`;
                        } else {
                            message += `📉 <b>Убыток:</b> <b>${profitSign}${profitAbs}%</b> (${profitSign}${profitRub} ₽ на каждую акцию)\n`;
                            message += `Это означает, что цена ушла вниз от входной цены.\n\n`;
                        }
                    }
                    
                    // Стратегии
                    message += `📋 <b>Стратегия сигнала:</b> ${strategyNameRu}\n`;
                    if (ourStrategyName) {
                        message += `🎯 <b>Наша стратегия:</b> ${ourStrategyName}\n`;
                    }
                    message += `\n`;
                    
                    // Вероятность успеха (если есть)
                    if (latestSignal.probability) {
                        const prob = latestSignal.probability;
                        let probText = '';
                        if (prob >= 70) {
                            probText = 'высокая (надежный сигнал)';
                        } else if (prob >= 40) {
                            probText = 'средняя (умеренно надежный)';
                        } else {
                            probText = 'низкая (рискованный сигнал)';
                        }
                        message += `📊 <b>Вероятность успеха:</b> ${prob}% (${probText})\n\n`;
                    }
                    
                    // Количество срабатываний
                    if (totalCount > 1) {
                        message += `🔄 <b>Количество срабатываний:</b> ${totalCount}\n`;
                        message += `Этот сигнал срабатывал ${totalCount} раз(а), что означает, что цена несколько раз достигала целевого уровня.\n\n`;
                    }
                    
                    // Рекомендуемое количество для покупки (только для сигналов на покупку)
                    if (triggered.direction === 'SIGNAL_DIRECTION_BUY' && recommendedQuantity && recommendedQuantity > 0) {
                        message += `💼 <b>Рекомендация по размеру позиции:</b>\n`;
                        message += `• Рекомендуемое количество акций: <b>${recommendedQuantity} шт.</b>\n`;
                        message += `• Сумма инвестиций: <b>${recommendedAmount.toFixed(2)} ₽</b>\n`;
                        message += `• Процент от портфеля: <b>${portfolioPercent}%</b>\n`;
                        
                        if (potentialProfit && potentialProfit > 0) {
                            const potentialProfitPercent = ((potentialProfit / recommendedAmount) * 100).toFixed(2);
                            message += `• Потенциальная прибыль (при достижении цели): <b>+${potentialProfitPercent}%</b> (<b>+${potentialProfit.toFixed(2)} ₽</b>)\n`;
                        }
                        
                        if (maxLoss && maxLoss > 0) {
                            const maxLossPercent = ((maxLoss / recommendedAmount) * 100).toFixed(2);
                            message += `• Максимальный убыток (при срабатывании стоп-лосса): <b>-${maxLossPercent}%</b> (<b>-${maxLoss.toFixed(2)} ₽</b>)\n`;
                        }
                        
                        message += `\n`;
                        message += `<i>💡 Это рекомендация на основе риск-менеджмента. Реальное количество может отличаться в зависимости от вашей стратегии и доступных средств.</i>\n\n`;
                    }
                    
                    // Что делать дальше
                    message += `💡 <b>Что делать дальше:</b>\n`;
                    if (triggered.triggerType === 'target_reached') {
                        const isBuy = triggered.direction === 'SIGNAL_DIRECTION_BUY';
                        const isSell = triggered.direction === 'SIGNAL_DIRECTION_SELL';
                        
                        if (isBuy) {
                            message += `✅ <b>Целевая цена достигнута!</b>\n`;
                            message += `Сигнал на ПОКУПКУ означает: "купи сейчас, ожидается рост до целевой цены".\n`;
                            message += `Цель достигнута, поэтому рекомендуется <b>зафиксировать прибыль</b> (продать часть или всю позицию).\n`;
                            message += `Это позволит закрепить полученную прибыль и снизить риски.\n`;
                        } else if (isSell) {
                            message += `✅ <b>Целевая цена достигнута!</b>\n`;
                            message += `Сигнал на ПРОДАЖУ означает: "продай сейчас, ожидается падение до целевой цены".\n`;
                            message += `Цель достигнута, позиция должна быть закрыта.\n`;
                        } else {
                            message += `✅ Целевая цена достигнута! Рекомендуется рассмотреть возможность фиксации прибыли.\n`;
                        }
                    } else {
                        message += `⚠️ <b>Сработал стоп-лосс!</b>\n`;
                        message += `Это защитный механизм, который ограничивает убытки.\n`;
                        message += `Рекомендуется <b>немедленно закрыть позицию</b>, чтобы ограничить дальнейшие убытки.\n`;
                    }
                    message += `\n`;
                    
                    // Важное предупреждение
                    message += `⚠️ <i>Помните: сигналы не являются гарантией прибыли. Всегда используйте стоп-лосс и не вкладывайте все средства в один сигнал.</i>`;

                    // Сохраняем сообщение для группировки
                    signalMessages.push(message);

                    // Сохраняем данные для WebSocket
                    signalWebSocketData.push({
                                signalId: triggered.signalId,
                                figi: triggered.figi,
                                ticker: triggered.ticker,
                                name: triggered.name,
                                direction: triggered.direction,
                                triggerType: triggered.triggerType,
                                currentPrice: latestSignal.currentPrice,
                                targetPrice: latestSignal.targetPrice,
                                stoploss: latestSignal.stoploss,
                                strategyName: triggered.strategyName,
                                strategyNameRu: strategyNameRu,
                                triggerCount: totalCount,
                                timestamp: new Date().toISOString()
                        });

                    console.log(`✅ Signal message prepared: ${triggered.signalId} (${triggered.figi}) - ${triggerText} (count: ${totalCount})`);
                } catch (signalError) {
                    console.error(`❌ Error preparing notification for signal ${triggered.signalId}:`, signalError.message);
                }
            }

            // Группируем все сигналы в одно сообщение
            if (signalMessages.length > 0) {
                const totalSignals = signalMessages.length;
                const header = `🔔 <b>СРАБОТАЛИ СИГНАЛЫ</b>\n\n📊 Всего сигналов: <b>${totalSignals}</b>\n\n`;
                const separator = `\n${'─'.repeat(40)}\n\n`;
                const groupedMessage = header + signalMessages.join(separator);
                
                // Определяем общий тип severity (если есть стоп-лоссы, то warning, иначе success)
                const hasStoploss = signalWebSocketData.some(s => s.triggerType === 'stoploss_triggered');
                const severity = hasStoploss ? 'warning' : 'success';

                // Отправляем одно группированное сообщение
                await OptimizedTelegramService.sendAlert(
                    `Сигналы сработали (${totalSignals})`,
                    groupedMessage,
                    severity
                );

                console.log(`📤 Sent grouped notification with ${totalSignals} signals`);
            }

            // Отправляем уведомления через WebSocket (каждое отдельно для реального времени)
            if (WebSocketService && signalWebSocketData.length > 0) {
                for (const data of signalWebSocketData) {
                    WebSocketService.broadcast({
                        type: 'signal_triggered',
                        data: data
                    });
                }
            }

            // Очищаем очередь после отправки
            this.pendingTriggeredSignals = [];
            console.log(`✅ Sent ${signalMessages.length} triggered signal notifications (grouped) after analysis`);
        } catch (error) {
            console.error('❌ Error sending pending triggered signals:', error);
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
        // Проверяем, не идет ли полное обновление кеша
        if (this.isFullCacheUpdateRunning) {
            console.log('📰 Daily news update skipped: full cache update is running');
            return;
        }
        
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
        // Проверяем, не идет ли полное обновление кеша
        if (this.isFullCacheUpdateRunning) {
            console.log('🛑 Trailing stops check skipped: full cache update is running');
            return;
        }
        
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
    /**
     * Предварительный расчет корреляций для популярных инструментов
     */
    async performCorrelationPrecalculation() {
        try {
            console.log('🔗 Scheduled correlation precalculation started...');
            const CorrelationService = (await import('./CorrelationService.js')).default;
            const CachedInstrument = (await import('../models/CachedInstrument.js')).default;
            
            // Инициализируем сервис, если нужно
            if (!CorrelationService.isInitialized) {
                await CorrelationService.initialize();
            }
            
            // Получаем топ-50 инструментов по активности торгов
            // Используем количество свечей и средний объем торгов как показатели активности
            const CachedCandle = (await import('../models/CachedCandle.js')).default;
            
            // Получаем инструменты с достаточным количеством свечей (минимум 20 для расчета корреляции)
            // Сортируем по количеству свечей и среднему объему торгов
            const instrumentsWithCandles = await CachedCandle.findAll({
                attributes: [
                    'figi',
                    [sequelize.fn('COUNT', sequelize.col('figi')), 'candleCount'],
                    [sequelize.fn('AVG', sequelize.col('volume')), 'avgVolume'],
                    [sequelize.fn('MAX', sequelize.col('time')), 'lastCandleTime']
                ],
                group: ['figi'],
                having: sequelize.where(
                    sequelize.fn('COUNT', sequelize.col('figi')),
                    { [Op.gte]: 20 } // Минимум 20 свечей для расчета корреляции
                ),
                order: [
                    // Сортируем по среднему объему торгов (показатель ликвидности)
                    [sequelize.fn('AVG', sequelize.col('volume')), 'DESC'],
                    // Затем по количеству свечей (показатель активности)
                    [sequelize.fn('COUNT', sequelize.col('figi')), 'DESC'],
                    // Затем по последней свече (актуальность данных)
                    [sequelize.fn('MAX', sequelize.col('time')), 'DESC']
                ],
                limit: 50,
                raw: true
            });
            
            // Если не удалось получить через группировку, используем альтернативный метод
            let popularInstruments;
            if (instrumentsWithCandles.length < 2) {
                // Fallback: используем активные инструменты с недавними обновлениями
                popularInstruments = await CachedInstrument.findAll({
                    where: {
                        isActive: true,
                        lastUpdated: {
                            [Op.gte]: sequelize.literal("NOW() - INTERVAL '7 days'") // Обновлялись за последние 7 дней
                        }
                    },
                    order: [
                        ['lastUpdated', 'DESC'] // По времени последнего обновления
                    ],
                    limit: 50,
                    attributes: ['figi']
                });
            } else {
                // Преобразуем результат группировки в формат с figi
                popularInstruments = instrumentsWithCandles.map(item => ({
                    figi: item.figi,
                    candleCount: parseInt(item.candleCount) || 0,
                    avgVolume: parseFloat(item.avgVolume) || 0
                }));
            }
            
            const figis = popularInstruments.map(inst => inst.figi).filter(Boolean);
            
            if (figis.length >= 2) {
                const result = await CorrelationService.precalculateCorrelations(figis, 30);
                await OptimizedTelegramService.sendAlert(
                    'CORRELATION_PRECALC_COMPLETE',
                    `Предварительный расчет корреляций завершен: рассчитано ${result.calculated}, из кеша ${result.cached}, ошибок ${result.errors}`,
                    'info'
                );
            } else {
                console.warn('⚠️ Недостаточно инструментов для предварительного расчета корреляций');
            }
        } catch (error) {
            console.error('Error in scheduled correlation precalculation:', error);
            await OptimizedTelegramService.sendAlert('CORRELATION_PRECALC_ERROR', error.message, 'warning');
            throw error;
        }
    }

    /**
     * Динамическое перераспределение бюджета по результативности
     */
    async performDynamicBudgetRebalance() {
        try {
            console.log('💰 Scheduled dynamic budget rebalancing based on performance started...');
            const StrategyAllocationService = (await import('./StrategyAllocationService.js')).default;
            
            // Выполняем перераспределение на основе метрик за последние 30 дней
            const result = await StrategyAllocationService.rebalanceBudgetByPerformance(30, 0);
            
            if (result.success && result.changes && result.changes.length > 0) {
                // Формируем сообщение с деталями изменений
                let message = '💰 ДИНАМИЧЕСКОЕ ПЕРЕРАСПРЕДЕЛЕНИЕ БЮДЖЕТА\n\n';
                message += `📊 Перераспределено стратегий: ${result.changes.length}\n`;
                message += `📈 Средний Sharpe Ratio: ${result.averageSharpeRatio.toFixed(3)}\n\n`;
                message += '📋 Изменения:\n';
                
                result.changes.forEach((change, index) => {
                    message += `${index + 1}. ${change.strategyName}\n`;
                    message += `   Бюджет: ${change.oldAllocation} → ${change.newAllocation}\n`;
                    message += `   Сумма: ${change.oldAmount} → ${change.newAmount} RUB\n`;
                    message += `   Sharpe: ${change.sharpeRatio}, Win Rate: ${change.winRate}\n`;
                    message += `   Max Drawdown: ${change.maxDrawdown}\n\n`;
                });
                
                await OptimizedTelegramService.sendAlert('DYNAMIC_BUDGET_REBALANCE_COMPLETE', message, 'info');
            } else if (result.success && result.reason) {
                console.log(`✅ Dynamic budget rebalancing completed: ${result.reason}`);
            } else {
                console.warn(`⚠️ Dynamic budget rebalancing completed with issues: ${result.reason || 'Unknown'}`);
            }
        } catch (error) {
            console.error('Error in scheduled dynamic budget rebalancing:', error);
            await OptimizedTelegramService.sendAlert('DYNAMIC_BUDGET_REBALANCE_ERROR', error.message, 'warning');
            throw error;
        }
    }

    async performSignalsUpdate() {
        // Проверяем, не идет ли полное обновление кеша
        if (this.isFullCacheUpdateRunning) {
            console.log('⚡ Signals update skipped: full cache update is running');
            return;
        }
        
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
        // Проверяем, не идет ли полное обновление кеша
        if (this.isFullCacheUpdateRunning) {
            console.log('💼 Real portfolio sync skipped: full cache update is running');
            return;
        }
        
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
            
            // TradingEngine.getRealPortfolioValue() уже преобразует данные в правильный формат
            // positions уже объект {figi: quantity}, cash и positionsValue уже рассчитаны
            const rawPositions = portfolioData.positions || {};
            const positionsValue = portfolioData.positionsValue || 0;
            const cash = portfolioData.cash || 0;
            const totalValue = portfolioData.totalValue || (cash + positionsValue);
            
            // Если positionsValue не был рассчитан, рассчитываем вручную
            let calculatedPositionsValue = positionsValue;
            if (calculatedPositionsValue === 0) {
                const CacheService = (await import('./CacheService.js')).default;
                for (const [figi, quantity] of Object.entries(rawPositions)) {
                    if (typeof quantity === 'number' && quantity > 0) {
                        try {
                            const instrument = await CacheService.getInstrument(figi, true);
                            const currentPrice = instrument?.lastPrice || 0;
                            if (currentPrice > 0) {
                                calculatedPositionsValue += currentPrice * quantity;
                            }
                        } catch (error) {
                            console.warn(`⚠️ Не удалось получить цену для ${figi}:`, error.message);
                        }
                    }
                }
            }
            
            // Сохраняем в БД
            await RealPortfolio.savePortfolio({
                cash,
                positions: rawPositions, // Уже объект {figi: quantity}
                trades: portfolioData.trades || [],
                totalValue: cash + calculatedPositionsValue,
                positionsValue: calculatedPositionsValue,
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
     * Еженедельный бэктестинг всех активных стратегий
     * Выполняет walk-forward анализ для выявления деградации производительности
     */
    async performWeeklyBacktesting() {
        try {
            console.log('📊 Starting weekly backtesting for all active strategies...');
            
            const TradingStrategy = (await import('../models/TradingStrategy.js')).default;
            const BacktestingService = (await import('./BacktestingService.js')).default;
            const StrategyAllocationService = (await import('./StrategyAllocationService.js')).default;
            
            // Получаем все активные стратегии
            const strategies = await TradingStrategy.findAll({
                where: { isActive: true }
            });

            if (strategies.length === 0) {
                console.log('⚠️ No active strategies found for backtesting');
                return;
            }

            console.log(`📊 Found ${strategies.length} active strategies to backtest`);

            const results = [];
            const degradedStrategies = [];
            const warnings = [];

            // Выполняем walk-forward анализ для каждой стратегии
            for (const strategy of strategies) {
                try {
                    console.log(`\n📊 Backtesting strategy "${strategy.name}" (ID: ${strategy.id})...`);
                    
                    // Выполняем walk-forward анализ за последние 6 месяцев
                    const endDate = new Date();
                    const startDate = new Date();
                    startDate.setMonth(startDate.getMonth() - 6);

                    const walkForwardResult = await BacktestingService.walkForwardAnalysis(
                        strategy.id,
                        {
                            startDate: startDate,
                            endDate: endDate,
                            windowSizeMonths: 2, // 2 месяца на окно
                            stepSizeMonths: 1,  // Шаг 1 месяц
                            saveToDb: true
                        }
                    );

                    results.push({
                        strategyId: strategy.id,
                        strategyName: strategy.name,
                        averageReturn: walkForwardResult.stabilityAnalysis.averageReturn,
                        consistency: walkForwardResult.stabilityAnalysis.consistency,
                        isDegrading: walkForwardResult.degradationAnalysis.isDegrading,
                        severity: walkForwardResult.degradationAnalysis.severity,
                        alerts: walkForwardResult.alerts
                    });

                    // Проверяем на деградацию
                    if (walkForwardResult.degradationAnalysis.isDegrading) {
                        degradedStrategies.push({
                            strategyId: strategy.id,
                            strategyName: strategy.name,
                            severity: walkForwardResult.degradationAnalysis.severity,
                            reasons: walkForwardResult.degradationAnalysis.reasons,
                            metrics: {
                                averageReturn: walkForwardResult.stabilityAnalysis.averageReturn,
                                averageWinRate: walkForwardResult.stabilityAnalysis.averageWinRate,
                                averageSharpeRatio: walkForwardResult.stabilityAnalysis.averageSharpeRatio
                            }
                        });

                        // Если критическая деградация - отключаем стратегию
                        if (walkForwardResult.degradationAnalysis.severity === 'critical') {
                            console.log(`🔴 CRITICAL: Disabling strategy "${strategy.name}" due to degradation`);
                            await strategy.update({ isActive: false });
                            
                            // Уведомление в Telegram
                            const message = `🔴 <b>КРИТИЧЕСКАЯ ДЕГРАДАЦИЯ СТРАТЕГИИ</b>\n\n` +
                                `Стратегия "<b>${strategy.name}</b>" была автоматически отключена из-за критической деградации производительности.\n\n` +
                                `Причины:\n${walkForwardResult.degradationAnalysis.reasons.map(r => `• ${r}`).join('\n')}\n\n` +
                                `Метрики:\n` +
                                `• Средняя доходность: ${walkForwardResult.stabilityAnalysis.averageReturn.toFixed(2)}%\n` +
                                `• Средний Win Rate: ${walkForwardResult.stabilityAnalysis.averageWinRate.toFixed(2)}%\n` +
                                `• Средний Sharpe Ratio: ${walkForwardResult.stabilityAnalysis.averageSharpeRatio.toFixed(2)}\n\n` +
                                `Стратегия будет отключена до ручного пересмотра.`;

                            await OptimizedTelegramService.sendAlert(
                                'STRATEGY_DEGRADATION',
                                message,
                                'error'
                            );
                        } else {
                            // Предупреждение о деградации
                            warnings.push({
                                strategyId: strategy.id,
                                strategyName: strategy.name,
                                reasons: walkForwardResult.degradationAnalysis.reasons
                            });
                        }
                    }

                    console.log(`✅ Strategy "${strategy.name}" backtested: Return=${walkForwardResult.stabilityAnalysis.averageReturn.toFixed(2)}%, Degrading=${walkForwardResult.degradationAnalysis.isDegrading ? 'YES' : 'NO'}`);
                } catch (error) {
                    console.error(`❌ Error backtesting strategy ${strategy.id}:`, error);
                    await OptimizedTelegramService.sendAlert(
                        'BACKTEST_ERROR',
                        `Ошибка при бэктестинге стратегии "${strategy.name}": ${error.message}`,
                        'warning'
                    );
                }
            }

            // Формируем сводный отчет
            const summary = {
                totalStrategies: strategies.length,
                testedStrategies: results.length,
                degradedStrategies: degradedStrategies.length,
                criticalDegradations: degradedStrategies.filter(s => s.severity === 'critical').length,
                warnings: warnings.length
            };

            console.log(`\n📊 Weekly backtesting completed:`);
            console.log(`   Total strategies: ${summary.totalStrategies}`);
            console.log(`   Tested: ${summary.testedStrategies}`);
            console.log(`   Degraded: ${summary.degradedStrategies} (${summary.criticalDegradations} critical)`);
            console.log(`   Warnings: ${summary.warnings}`);

            // Отправляем сводный отчет в Telegram
            if (summary.degradedStrategies > 0 || summary.warnings > 0) {
                let reportMessage = `📊 <b>ЕЖЕНЕДЕЛЬНЫЙ БЭКТЕСТИНГ СТРАТЕГИЙ</b>\n\n`;
                reportMessage += `Протестировано стратегий: <b>${summary.testedStrategies}</b>\n`;
                reportMessage += `Деградирующих: <b>${summary.degradedStrategies}</b> (${summary.criticalDegradations} критических)\n`;
                reportMessage += `Предупреждений: <b>${summary.warnings}</b>\n\n`;

                if (summary.criticalDegradations > 0) {
                    reportMessage += `🔴 <b>Критически деградирующие стратегии:</b>\n`;
                    for (const degraded of degradedStrategies.filter(s => s.severity === 'critical')) {
                        reportMessage += `• ${degraded.strategyName} (отключена)\n`;
                    }
                    reportMessage += `\n`;
                }

                if (warnings.length > 0) {
                    reportMessage += `🟠 <b>Стратегии с предупреждениями:</b>\n`;
                    for (const warning of warnings) {
                        reportMessage += `• ${warning.strategyName}\n`;
                    }
                }

                await OptimizedTelegramService.sendAlert(
                    'WEEKLY_BACKTEST_REPORT',
                    reportMessage,
                    summary.criticalDegradations > 0 ? 'error' : 'warning'
                );
            } else {
                // Все стратегии в порядке
                const successMessage = `✅ <b>ЕЖЕНЕДЕЛЬНЫЙ БЭКТЕСТИНГ СТРАТЕГИЙ</b>\n\n` +
                    `Все <b>${summary.testedStrategies}</b> стратегий протестированы.\n` +
                    `Деградация не обнаружена. Все стратегии работают стабильно.`;

                await OptimizedTelegramService.sendAlert(
                    'WEEKLY_BACKTEST_REPORT',
                    successMessage,
                    'success'
                );
            }

            // Обновляем распределение бюджета на основе результатов бэктестинга
            if (summary.degradedStrategies > 0) {
                try {
                    console.log('🔄 Updating budget allocation based on backtest results...');
                    await StrategyAllocationService.rebalanceBudgetByPerformance(30, 0);
                    console.log('✅ Budget allocation updated');
                } catch (error) {
                    console.error('❌ Error updating budget allocation:', error);
                }
            }

        } catch (error) {
            console.error('❌ Error in performWeeklyBacktesting:', error);
            await OptimizedTelegramService.sendAlert(
                'WEEKLY_BACKTEST_ERROR',
                `Ошибка при выполнении еженедельного бэктестинга: ${error.message}`,
                'error'
            );
            throw error;
        }
    }

    /**
     * Выполнение обновления макроэкономических данных
     * Вызывается по расписанию из cron-задачи
     */
    async performMacroDataUpdate() {
        try {
            console.log('📊 Starting macro data update...');
            
            const MacroDataService = (await import('./MacroDataService.js')).default;
            
            // Убеждаемся, что сервис инициализирован
            if (!MacroDataService.isInitialized) {
                await MacroDataService.initialize();
            }
            
            // Выполняем обновление всех данных
            const updateStats = await MacroDataService.updateAllData();
            
            // Формируем отчет
            const summary = {
                cbr: {
                    fetched: updateStats.cbr?.fetched || 0,
                    saved: updateStats.cbr?.saved || 0,
                    errors: updateStats.cbr?.errors || []
                },
                rosstat: {
                    fetched: updateStats.rosstat?.fetched || 0,
                    saved: updateStats.rosstat?.saved || 0,
                    errors: updateStats.rosstat?.errors || []
                },
                moex: {
                    fetched: updateStats.moex?.fetched || 0,
                    saved: updateStats.moex?.saved || 0,
                    errors: updateStats.moex?.errors || []
                },
                total: {
                    fetched: updateStats.total?.fetched || 0,
                    saved: updateStats.total?.saved || 0
                }
            };
            
            console.log(`\n📊 Macro data update completed:`);
            console.log(`   ЦБ РФ: получено ${summary.cbr.fetched}, сохранено ${summary.cbr.saved}`);
            console.log(`   Росстат: получено ${summary.rosstat.fetched}, сохранено ${summary.rosstat.saved}`);
            console.log(`   Мосбиржа: получено ${summary.moex.fetched}, сохранено ${summary.moex.saved}`);
            console.log(`   Всего: получено ${summary.total.fetched}, сохранено ${summary.total.saved}`);
            
            // Проверяем наличие ошибок
            const totalErrors = summary.cbr.errors.length + summary.rosstat.errors.length + summary.moex.errors.length;
            
            if (totalErrors > 0) {
                // Есть ошибки - отправляем предупреждение
                let errorMessage = `⚠️ <b>ОБНОВЛЕНИЕ МАКРОЭКОНОМИЧЕСКИХ ДАННЫХ</b>\n\n`;
                errorMessage += `Получено данных: <b>${summary.total.fetched}</b>\n`;
                errorMessage += `Сохранено: <b>${summary.total.saved}</b>\n`;
                errorMessage += `Ошибок: <b>${totalErrors}</b>\n\n`;
                
                if (summary.cbr.errors.length > 0) {
                    errorMessage += `<b>ЦБ РФ:</b>\n`;
                    summary.cbr.errors.slice(0, 3).forEach(err => {
                        errorMessage += `• ${err}\n`;
                    });
                    if (summary.cbr.errors.length > 3) {
                        errorMessage += `... и еще ${summary.cbr.errors.length - 3} ошибок\n`;
                    }
                    errorMessage += `\n`;
                }
                
                if (summary.rosstat.errors.length > 0) {
                    errorMessage += `<b>Росстат:</b>\n`;
                    summary.rosstat.errors.slice(0, 3).forEach(err => {
                        errorMessage += `• ${err}\n`;
                    });
                    if (summary.rosstat.errors.length > 3) {
                        errorMessage += `... и еще ${summary.rosstat.errors.length - 3} ошибок\n`;
                    }
                    errorMessage += `\n`;
                }
                
                if (summary.moex.errors.length > 0) {
                    errorMessage += `<b>Мосбиржа:</b>\n`;
                    summary.moex.errors.slice(0, 3).forEach(err => {
                        errorMessage += `• ${err}\n`;
                    });
                    if (summary.moex.errors.length > 3) {
                        errorMessage += `... и еще ${summary.moex.errors.length - 3} ошибок\n`;
                    }
                }
                
                await OptimizedTelegramService.sendAlert(
                    'MACRO_DATA_UPDATE_WARNING',
                    errorMessage,
                    'warning'
                );
            } else if (summary.total.saved > 0) {
                // Успешное обновление - отправляем информационное сообщение
                const successMessage = `✅ <b>ОБНОВЛЕНИЕ МАКРОЭКОНОМИЧЕСКИХ ДАННЫХ</b>\n\n` +
                    `Получено данных: <b>${summary.total.fetched}</b>\n` +
                    `Сохранено: <b>${summary.total.saved}</b>\n\n` +
                    `ЦБ РФ: ${summary.cbr.saved} записей\n` +
                    `Росстат: ${summary.rosstat.saved} записей\n` +
                    `Мосбиржа: ${summary.moex.saved} записей`;
                
                await OptimizedTelegramService.sendAlert(
                    'MACRO_DATA_UPDATE_SUCCESS',
                    successMessage,
                    'info'
                );
            } else {
                // Данные не получены (возможно, источники недоступны или нет новых данных)
                console.log('ℹ️ No new macro data to save (sources may be unavailable or no updates)');
            }
            
        } catch (error) {
            console.error('❌ Error in performMacroDataUpdate:', error);
            await OptimizedTelegramService.sendAlert(
                'MACRO_DATA_UPDATE_ERROR',
                `❌ Ошибка при обновлении макроэкономических данных:\n${error.message}`,
                'error'
            );
        }
    }

    /**
     * Обновление опционных данных
     */
    async performOptionsDataUpdate() {
        try {
            console.log('📊 Starting options data update...');
            
            const OptionsDataService = (await import('./OptionsDataService.js')).default;
            
            // Убеждаемся, что сервис инициализирован
            if (!OptionsDataService.isInitialized) {
                await OptionsDataService.initialize();
            }
            
            // Выполняем массовое обновление опционов
            const updateStats = await OptionsDataService.updateOptionsForAllInstruments({
                delayMs: 2000, // 2 секунды между запросами
                forceUpdate: false // Не принуждаем обновление существующих записей
            });
            
            // Формируем отчет
            const summary = `Обновление опционных данных завершено:
• Обработано инструментов: ${updateStats.processed} / ${updateStats.total}
• Сохранено опционов: ${updateStats.saved}
• Ошибок: ${updateStats.errors}
• Пропущено: ${updateStats.skipped}`;
            
            console.log(`✅ Options data update completed:\n${summary}`);
            
            // Отправляем уведомление в Telegram
            await OptimizedTelegramService.sendAlert(
                'OPTIONS_DATA_UPDATE',
                summary,
                updateStats.errors > 0 ? 'warning' : 'info'
            );
            
            return {
                success: true,
                stats: updateStats,
                summary
            };
        } catch (error) {
            console.error('❌ Error in performOptionsDataUpdate:', error);
            await OptimizedTelegramService.sendAlert(
                'OPTIONS_DATA_UPDATE_ERROR',
                `❌ Ошибка при обновлении опционных данных:\n${error.message}`,
                'error'
            );
            throw error;
        }
    }

    /**
     * Выполнение автоматической ребалансировки портфеля
     */
    async performPortfolioRebalancing() {
        try {
            console.log('🔄 Starting portfolio rebalancing...');
            
            const PortfolioRebalancingService = (await import('./PortfolioRebalancingService.js')).default;
            
            // Убеждаемся, что сервис инициализирован
            if (!PortfolioRebalancingService.isInitialized) {
                await PortfolioRebalancingService.initialize();
            }
            
            // Проверяем, включена ли автоматическая ребалансировка
            const status = PortfolioRebalancingService.getStatus();
            if (!status.enabled) {
                console.log('⏭️ Portfolio rebalancing is disabled, skipping...');
                return;
            }
            
            // Выполняем ребалансировку
            const result = await PortfolioRebalancingService.performRebalancing();
            
            // Формируем отчет
            if (result.success) {
                const summary = {
                    operations: result.operations?.length || 0,
                    totalCommission: result.totalCommission || 0,
                    needsRebalancing: result.needsRebalancing || false
                };
                
                console.log('✅ Portfolio rebalancing completed:', summary);
                
                if (result.operations && result.operations.length > 0) {
                    await OptimizedTelegramService.sendAlert(
                        'PORTFOLIO_REBALANCING_COMPLETE',
                        `Ребалансировка портфеля выполнена: ${result.operations.length} операций, комиссия: ${result.totalCommission?.toFixed(2)} ₽`,
                        'info'
                    );
                } else {
                    console.log('ℹ️ No rebalancing needed');
                }
            } else {
                console.warn('⚠️ Portfolio rebalancing completed with warnings:', result.error || 'Unknown error');
                await OptimizedTelegramService.sendAlert(
                    'PORTFOLIO_REBALANCING_WARNING',
                    `Ребалансировка портфеля: ${result.error || 'Неизвестная ошибка'}`,
                    'warning'
                );
            }
            
        } catch (error) {
            console.error('❌ Error performing portfolio rebalancing:', error);
            await OptimizedTelegramService.sendAlert('PORTFOLIO_REBALANCING_ERROR', error.message, 'error');
        }
    }

    /**
     * Обновление виртуального портфеля - пересчет totalValue на основе текущих цен
     */
    async performVirtualPortfolioUpdate() {
        // Проверяем, не идет ли полное обновление кеша
        if (this.isFullCacheUpdateRunning) {
            console.log('💼 Virtual portfolio update skipped: full cache update is running');
            return;
        }
        
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

    /**
     * Получить статус планировщика
     */
    async getStatus() {
        try {
            const tasks = {
                cacheTask: this.cacheTask ? 'active' : 'inactive',
                priceUpdateTask: this.priceUpdateTask ? 'active' : 'inactive',
                portfolioPricesUpdateTask: this.portfolioPricesUpdateTask ? 'active' : 'inactive',
                activeSignalsPricesUpdateTask: this.activeSignalsPricesUpdateTask ? 'active' : 'inactive',
                tradingRequestsPricesUpdateTask: this.tradingRequestsPricesUpdateTask ? 'active' : 'inactive',
                cleanupTask: this.cleanupTask ? 'active' : 'inactive',
                trainingTask: this.trainingTask ? 'active' : 'inactive',
                quickTrainingTask: this.quickTrainingTask ? 'active' : 'inactive',
                tradingHoursTask: this.tradingHoursTask ? 'active' : 'inactive',
                tradingHoursCacheTask: this.tradingHoursCacheTask ? 'active' : 'inactive',
                degradationCheckTask: this.degradationCheckTask ? 'active' : 'inactive',
                portfolioAnalysisTask: this.portfolioAnalysisTask ? 'active' : 'inactive',
                predictionsUpdateTask: this.predictionsUpdateTask ? 'active' : 'inactive',
                signalsUpdateTask: this.signalsUpdateTask ? 'active' : 'inactive',
                trailingStopsCheckTask: this.trailingStopsCheckTask ? 'active' : 'inactive',
                newsCleanupTask: this.newsCleanupTask ? 'active' : 'inactive',
                newsDailyUpdateTask: this.newsDailyUpdateTask ? 'active' : 'inactive',
                telegramCacheTask: this.telegramCacheTask ? 'active' : 'inactive',
                strategyRebalanceTask: this.strategyRebalanceTask ? 'active' : 'inactive',
                dynamicBudgetRebalanceTask: this.dynamicBudgetRebalanceTask ? 'active' : 'inactive',
                correlationPrecalcTask: this.correlationPrecalcTask ? 'active' : 'inactive',
                weeklyBacktestTask: this.weeklyBacktestTask ? 'active' : 'inactive',
                macroDataUpdateTask: this.macroDataUpdateTask ? 'active' : 'inactive',
                portfolioRebalancingTask: this.portfolioRebalancingTask ? 'active' : 'inactive'
            };

            return {
                isInitialized: this.isInitialized || false,
                tasks,
                activeWorkers: this.workers.size,
                activeIntervals: this.intervals.size,
                lastCacheUpdate: this.lastCacheUpdate ? new Date(this.lastCacheUpdate).toISOString() : null,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('Error getting scheduler status:', error);
            return {
                isInitialized: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

// Экспортируем класс для тестирования
export { SchedulerService };

// Экспортируем экземпляр по умолчанию для использования в приложении
export default new SchedulerService();