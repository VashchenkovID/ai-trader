/**
 * Централизованный менеджер сервисов
 * Управляет инициализацией и доступом ко всем сервисам
 */

import ServiceInitializationTracker from '../utils/ServiceInitializationTracker.js';
import LoggerService from './LoggerService.js';

class ServiceManager {
    constructor() {
        this.services = new Map();
        this.initializationPromises = new Map();
        this.isInitialized = false;
        this.isWorker = typeof process.env.WORKER === 'string' && process.env.WORKER === 'true';
    }

    /**
     * Полная инициализация системы
     */
    async initializeSystem(server = null, sequelize = null) {
        if (this.isInitialized) {
            return;
        }
        
        try {
            // 1. Инициализируем базу данных (если передана)
            if (sequelize) {
                await sequelize.authenticate();
                
                // Инициализируем DatabaseConnectionManager
                const DatabaseConnectionManager = (await import('../utils/DatabaseConnectionManager.js')).default;
                await DatabaseConnectionManager.initialize();
            }

            // 2. Инициализируем основные сервисы
            // LoggerService должен быть инициализирован первым для логирования остальных сервисов
            await this.initializeService('LoggerService', () => import('./LoggerService.js'));
            // MonitoringService должен быть инициализирован вторым, так как используется в middleware
            await this.initializeService('MonitoringService', () => import('./MonitoringService.js'));
            await this.initializeService('RetryService', () => import('./RetryService.js'));
            await this.initializeService('FallbackService', () => import('./FallbackService.js'));
            await this.initializeService('RecoveryService', () => import('./RecoveryService.js'));
            await this.initializeService('BackupService', () => import('./BackupService.js'));
            
            // ApiRequestQueue - централизованная очередь для API запросов
            try {
                await this.initializeService('ApiRequestQueue', () => import('./ApiRequestQueue.js'));
            } catch (error) {
                if (LoggerService.isInitialized) {
                    LoggerService.warn('Не удалось инициализировать ApiRequestQueue', {
                        service: 'ServiceManager',
                        error: error.message
                    });
                }
            }
            
            // CacheService - критический сервис
            try {
                await this.initializeService('CacheService', () => import('./CacheService.js'));
            } catch (error) {
                if (LoggerService.isInitialized) {
                    LoggerService.error('Не удалось инициализировать CacheService', {
                        service: 'ServiceManager',
                        error: {
                            message: error.message,
                            stack: error.stack
                        }
                    });
                } else {
                    console.error('❌ Не удалось инициализировать CacheService:', error);
                }
                // Продолжаем инициализацию других сервисов
            }
            
            // WebSocketService инициализируется отдельно, так как требует сервер
            
            // SchedulerService - критический сервис
            try {
                await this.initializeService('SchedulerService', () => import('./SchedulerService.js'));
            } catch (error) {
                if (LoggerService.isInitialized) {
                    LoggerService.error('Не удалось инициализировать SchedulerService', {
                        service: 'ServiceManager',
                        error: {
                            message: error.message,
                            stack: error.stack
                        }
                    });
                } else {
                    console.error('❌ Не удалось инициализировать SchedulerService:', error);
                }
                // Продолжаем инициализацию других сервисов
            }
            
            // TradingEngine - критический сервис
            try {
                await this.initializeService('TradingEngine', () => import('./TradingEngine.js'));
            } catch (error) {
                if (LoggerService.isInitialized) {
                    LoggerService.error('Не удалось инициализировать TradingEngine', {
                        service: 'ServiceManager',
                        error: {
                            message: error.message,
                            stack: error.stack
                        }
                    });
                } else {
                    console.error('❌ Не удалось инициализировать TradingEngine:', error);
                }
                // Продолжаем инициализацию других сервисов
            }
            
            // PnLCalculationService - сервис для расчета прибыли/убытка
            await this.initializeService('PnLCalculationService', () => import('./PnLCalculationService.js'));
            
            await this.initializeService('NeuralNetworkService', () => import('./NeuralNetworkService.js'));
            await this.initializeService('EnsembleService', () => import('./EnsembleService.js'));
            await this.initializeService('ReinforcementLearningService', () => import('./ReinforcementLearningService.js'));
            await this.initializeService('MetaLearningService', () => import('./MetaLearningService.js'));
            await this.initializeService('IntegratedAIService', () => import('./IntegratedAIService.js'));

            // 3. Инициализируем дополнительные сервисы
            await this.initializeService('SwitchValidator', () => import('./SwitchValidator.js'));
            await this.initializeService('PortfolioMigrator', () => import('./PortfolioMigrator.js'));
            await this.initializeService('PreflightCheckService', () => import('./PreflightCheckService.js'));
            await this.initializeService('CapitalScalingService', () => import('./CapitalScalingService.js'));
            await this.initializeService('ProfitabilityTracker', () => import('./ProfitabilityTracker.js'));
            
            // 4. Инициализируем все остальные сервисы
            await this.initializeService('CapitalAllocationStrategy', () => import('./CapitalAllocationStrategy.js'));
            await this.initializeService('PortfolioOptimizer', () => import('./PortfolioOptimizer.js'));
            await this.initializeService('PortfolioRebalancingService', () => import('./PortfolioRebalancingService.js'));
            await this.initializeService('MacroDataService', () => import('./MacroDataService.js'));
            await this.initializeService('FundamentalDataService', () => import('./FundamentalDataService.js'));
            await this.initializeService('AssetSyncService', () => import('./AssetSyncService.js'));
            await this.initializeService('DividendService', () => import('./DividendService.js'));
            await this.initializeService('ModelSaveService', () => import('./ModelSaveService.js'));
            await this.initializeService('NewsAnalysisService', () => import('./NewsAnalysisService.js'));
            await this.initializeService('OptimizedAnalysisService', () => import('./OptimizedAnalysisService.js'));
            await this.initializeService('OptimizedDataService', () => import('./OptimizedDataService.js'));
            await this.initializeService('OptimizedTrainingService', () => import('./OptimizedTrainingService.js'));
            await this.initializeService('PerformanceAnalyzer', () => import('./PerformanceAnalyzer.js'));
            await this.initializeService('RiskAdjustmentService', () => import('./RiskAdjustmentService.js'));
            await this.initializeService('RiskManagementService', () => import('./RiskManagementService.js'));
            await this.initializeService('SettingsService', () => import('./SettingsService.js'));
            await this.initializeService('Stage3Validator', () => import('./Stage3Validator.js'));
            // Telegram сервисы инициализируются отдельно в app.js
            await this.initializeService('TinkoffApiService', () => import('./TinkoffApiService.js'));
            await this.initializeService('TradingHoursCacheService', () => import('./TradingHoursCacheService.js'));
            await this.initializeService('TradingHoursService', () => import('./TradingHoursService.js'));
            await this.initializeService('TradingModeManager', () => import('./TradingModeManager.js'));
            await this.initializeService('TrainingStatusService', () => import('./TrainingStatusService.js'));
            await this.initializeService('TradingRequestService', () => import('./TradingRequestService.js'));
            await this.initializeService('StrategyAllocationService', () => import('./StrategyAllocationService.js'));
            await this.initializeService('EntryOptimizationService', () => import('./EntryOptimizationService.js'));
            await this.initializeService('ExitOptimizationService', () => import('./ExitOptimizationService.js'));
            await this.initializeService('PositionMonitoringService', () => import('./PositionMonitoringService.js'));
            await this.initializeService('DailyReportService', () => import('./DailyReportService.js'));
            await this.initializeService('TaxOptimizationService', () => import('./TaxOptimizationService.js'));
            await this.initializeService('SecretManagementService', () => import('./SecretManagementService.js'));
            await this.initializeService('PyramidingService', () => import('./PyramidingService.js'));
            await this.initializeService('ModelWeightingService', () => import('./ModelWeightingService.js'));
            await this.initializeService('FeedbackService', () => import('./FeedbackService.js'));
            await this.initializeService('AdaptiveThresholdService', () => import('./AdaptiveThresholdService.js'));
            await this.initializeService('DiversificationService', () => import('./DiversificationService.js'));
            await this.initializeService('MigrationService', () => import('./MigrationService.js'));
            await this.initializeService('DataCleanupService', () => import('./DataCleanupService.js'));
            await this.initializeService('WorkerMonitoringService', () => import('./WorkerMonitoringService.js'));
            
            // ApiRequestQueue должен быть инициализирован (уже инициализирован выше, но проверяем)
            if (!this.services.has('ApiRequestQueue')) {
                try {
                    await this.initializeService('ApiRequestQueue', () => import('./ApiRequestQueue.js'));
                } catch (error) {
                    // Игнорируем, если уже инициализирован
                }
            }

            // 5. Инициализируем WebSocket с сервером (если передан)
            if (server) {
                const WebSocketService = (await import('./WebSocketService.js')).default;
                const webSocketService = new WebSocketService();
                // Инициализируем WebSocket на пути /ws для соответствия nginx конфигурации
                webSocketService.initialize(server, '/ws');
                this.services.set('WebSocketService', webSocketService);
                
                // Отмечаем WebSocketService как глобально инициализированный (если не воркер)
                if (!this.isWorker) {
                    await ServiceInitializationTracker.markServiceInitialized('WebSocketService');
                }
                
                // Передаем WebSocketService в SchedulerService
                if (this.services.has('SchedulerService')) {
                    const schedulerService = this.getService('SchedulerService');
                    if (schedulerService && typeof schedulerService.setWebSocketService === 'function') {
                        schedulerService.setWebSocketService(webSocketService);
                    }
                }
            }

            this.isInitialized = true;
            
            // Отмечаем все инициализированные сервисы как глобально инициализированные (если не воркер)
            if (!this.isWorker) {
                for (const serviceName of this.services.keys()) {
                    await ServiceInitializationTracker.markServiceInitialized(serviceName);
                }
            }
            
            console.log('✅ ServiceManager.initializeSystem завершена успешно');
        } catch (error) {
            console.error('❌ System initialization failed:', error);
            if (LoggerService.isInitialized) {
                LoggerService.error('System initialization failed', {
                    service: 'ServiceManager',
                    error: {
                        message: error.message,
                        stack: error.stack
                    }
                });
            }
            throw error;
        }
    }

    /**
     * Инициализация только основных сервисов (для обратной совместимости)
     */
    async initialize() {
        return await this.initializeSystem();
    }

    /**
     * Инициализация отдельного сервиса
     */
    async initializeService(serviceName, importFunction, options = {}) {
        if (this.services.has(serviceName)) {
            return this.services.get(serviceName);
        }

        // Проверяем, не идет ли уже инициализация
        if (this.initializationPromises.has(serviceName)) {
            return await this.initializationPromises.get(serviceName);
        }

        // Проверяем, не инициализирован ли сервис глобально (в основном процессе)
        // Это особенно важно для воркеров
        const isGloballyInitialized = await ServiceInitializationTracker.isServiceInitializedGlobally(serviceName);
        
        if (isGloballyInitialized && this.isWorker && !options.forceReinit) {
            // В воркере и сервис уже инициализирован в основном процессе
            // Используем легковесную инициализацию или пропускаем тяжелые части
            // Логируем только если нужно
        }

        const initPromise = (async () => {
            try {
                // Логируем начало инициализации
                if (LoggerService.isInitialized) {
                    LoggerService.info(`Инициализация сервиса ${serviceName}...`, {
                        service: 'ServiceManager',
                        serviceName
                    });
                }
                
                const ServiceModule = (await importFunction()).default;
                
                // Проверяем, является ли экспорт классом или экземпляром
                let service;
                if (typeof ServiceModule === 'function') {
                    // Это класс - создаем экземпляр
                    service = new ServiceModule();
                } else if (typeof ServiceModule === 'object' && ServiceModule !== null) {
                    service = ServiceModule;
                } else {
                    const errorMsg = `Invalid service export for ${serviceName}: expected class or object, got ${typeof ServiceModule}`;
                    if (LoggerService.isInitialized) {
                        LoggerService.error(errorMsg, {
                            service: 'ServiceManager',
                            serviceName,
                            exportType: typeof ServiceModule
                        });
                    } else {
                        console.error(`❌ ${errorMsg}:`, ServiceModule);
                    }
                    throw new Error(errorMsg);
                }
                
                // Инициализируем сервис, если у него есть метод initialize
                // Исключение для WebSocketService - он инициализируется отдельно с сервером
                if (typeof service.initialize === 'function' && serviceName !== 'WebSocketService') {
                    // Если сервис уже инициализирован глобально и мы в воркере,
                    // используем легковесную инициализацию если она доступна
                    if (isGloballyInitialized && this.isWorker && typeof service.initializeLightweight === 'function') {
                        await service.initializeLightweight();
                    } else {
                        try {
                            await service.initialize();
                            // Проверяем, что сервис действительно инициализирован
                            if (service.isInitialized !== undefined && !service.isInitialized) {
                                const errorMsg = `Сервис ${serviceName} не установил isInitialized = true после инициализации`;
                                if (LoggerService.isInitialized) {
                                    LoggerService.error(errorMsg, {
                                        service: 'ServiceManager',
                                        serviceName
                                    });
                                } else {
                                    console.error(`❌ ${errorMsg}`);
                                }
                                throw new Error(errorMsg);
                            }
                        } catch (initError) {
                            // Логируем ошибку инициализации
                            if (LoggerService.isInitialized) {
                                LoggerService.error(`Ошибка инициализации ${serviceName}`, {
                                    service: 'ServiceManager',
                                    serviceName,
                                    error: {
                                        message: initError.message,
                                        stack: initError.stack
                                    }
                                });
                            } else {
                                console.error(`❌ Ошибка инициализации ${serviceName}:`, initError);
                            }
                            // Не добавляем сервис в Map, если инициализация не удалась
                            throw initError;
                        }
                    }
                }
                
                this.services.set(serviceName, service);
                
                // Логируем успешную инициализацию
                if (LoggerService.isInitialized) {
                    LoggerService.info(`Сервис ${serviceName} успешно инициализирован`, {
                        service: 'ServiceManager',
                        serviceName,
                        hasInitialize: typeof service.initialize === 'function',
                        isInitialized: service.isInitialized !== undefined ? service.isInitialized : 'N/A'
                    });
                }
                
                // Отмечаем сервис как инициализированный глобально (если не воркер или принудительно)
                if (!this.isWorker || options.markAsGlobal) {
                    await ServiceInitializationTracker.markServiceInitialized(serviceName);
                }
                
                return service;
            } catch (error) {
                if (LoggerService.isInitialized) {
                    LoggerService.error(`Failed to initialize ${serviceName}`, {
                        service: 'ServiceManager',
                        serviceName,
                        error: {
                            message: error.message,
                            stack: error.stack
                        }
                    });
                } else {
                    console.error(`❌ Failed to initialize ${serviceName}:`, error);
                }
                throw error;
            }
        })();

        this.initializationPromises.set(serviceName, initPromise);
        return await initPromise;
    }

    /**
     * Получение сервиса
     */
    getService(serviceName) {
        if (!this.services.has(serviceName)) {
            throw new Error(`Service ${serviceName} not found. Make sure it's initialized.`);
        }
        return this.services.get(serviceName);
    }

    /**
     * Безопасное получение сервиса (возвращает null если не найден)
     */
    getServiceSafe(serviceName) {
        return this.services.get(serviceName) || null;
    }

    /**
     * Проверка, инициализирован ли сервис
     */
    isServiceInitialized(serviceName) {
        return this.services.has(serviceName);
    }

    /**
     * Получение Telegram сервиса (специальный метод для удобства)
     */
    getTelegramService() {
        return this.getService('OptimizedTelegramService');
    }

    /**
     * Отправка алерта через Telegram (удобный метод)
     */
    async sendTelegramAlert(alertType, message, severity = 'warning') {
        try {
            const telegramService = this.getTelegramService();
            
            // Проверяем, инициализирован ли сервис
            if (!telegramService.isInitialized) {
                await telegramService.initialize();
            }
            
            await telegramService.sendAlert(alertType, message, severity);
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Failed to send Telegram alert', {
                    service: 'ServiceManager',
                    operation: 'sendTelegramAlert',
                    alertType,
                    error: {
                        message: error.message,
                        stack: error.stack
                    }
                });
            } else {
                console.error('❌ Failed to send Telegram alert:', error);
            }
        }
    }

    /**
     * Остановка всех сервисов
     */
    async stop() {
        const stopPromises = [];
        
        for (const [serviceName, service] of this.services) {
            if (typeof service.stop === 'function') {
                stopPromises.push(
                    service.stop().catch(error => {
                        if (LoggerService.isInitialized) {
                            LoggerService.error(`Error stopping ${serviceName}`, {
                                service: 'ServiceManager',
                                serviceName,
                                error: {
                                    message: error.message,
                                    stack: error.stack
                                }
                            });
                        } else {
                            console.error(`❌ Error stopping ${serviceName}:`, error);
                        }
                    })
                );
            }
            
            // Отмечаем сервис как не инициализированный
            if (!this.isWorker) {
                ServiceInitializationTracker.markServiceUninitialized(serviceName).catch(() => {});
            }
        }
        
        await Promise.all(stopPromises);
        this.services.clear();
        this.initializationPromises.clear();
        this.isInitialized = false;
        
    }

    /**
     * Получение статуса всех сервисов
     */
    getStatus() {
        const status = {
            isInitialized: this.isInitialized,
            services: {}
        };

        for (const [serviceName, service] of this.services) {
            status.services[serviceName] = {
                initialized: true,
                hasStop: typeof service.stop === 'function',
                hasInitialize: typeof service.initialize === 'function'
            };
        }

        return status;
    }
}

// Создаем единственный экземпляр
const serviceManager = new ServiceManager();

export default serviceManager;
