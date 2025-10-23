/**
 * Централизованный менеджер сервисов
 * Управляет инициализацией и доступом ко всем сервисам
 */

class ServiceManager {
    constructor() {
        this.services = new Map();
        this.initializationPromises = new Map();
        this.isInitialized = false;
    }

    /**
     * Полная инициализация системы
     */
    async initializeSystem(server = null, sequelize = null) {
        if (this.isInitialized) {
            console.log('✅ ServiceManager already initialized');
            return;
        }

        console.log('🚀 Initializing complete system...');
        
        try {
            // 1. Инициализируем базу данных (если передана)
            if (sequelize) {
                await sequelize.authenticate();
                console.log('✅ Database connected');
                
                // Инициализируем DatabaseConnectionManager
                const DatabaseConnectionManager = (await import('../utils/DatabaseConnectionManager.js')).default;
                await DatabaseConnectionManager.initialize();
                console.log('✅ Database connection manager initialized');
            }

            // 2. Инициализируем основные сервисы
            await this.initializeService('CacheService', () => import('./CacheService.js'));
            // WebSocketService инициализируется отдельно, так как требует сервер
            
            await this.initializeService('SchedulerService', () => import('./SchedulerService.js'));
            await this.initializeService('TradingEngine', () => import('./TradingEngine.js'));
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

            // 5. Инициализируем WebSocket с сервером (если передан)
            if (server) {
                console.log('🌐 Initializing WebSocket service...');
                const WebSocketService = (await import('./WebSocketService.js')).default;
                const webSocketService = new WebSocketService();
                webSocketService.initialize(server);
                this.services.set('WebSocketService', webSocketService);
                console.log('✅ WebSocket service initialized with server');
                
                // Передаем WebSocketService в SchedulerService
                const schedulerService = this.getService('SchedulerService');
                if (schedulerService && typeof schedulerService.setWebSocketService === 'function') {
                    schedulerService.setWebSocketService(webSocketService);
                    console.log('✅ WebSocketService passed to SchedulerService');
                }
            }

            this.isInitialized = true;
            console.log('✅ Complete system initialized successfully');
        } catch (error) {
            console.error('❌ System initialization failed:', error);
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
    async initializeService(serviceName, importFunction) {
        if (this.services.has(serviceName)) {
            return this.services.get(serviceName);
        }

        // Проверяем, не идет ли уже инициализация
        if (this.initializationPromises.has(serviceName)) {
            return await this.initializationPromises.get(serviceName);
        }

        console.log(`🔧 Initializing ${serviceName}...`);
        
        const initPromise = (async () => {
            try {
                const ServiceModule = (await importFunction()).default;
                
                // Проверяем, является ли экспорт классом или экземпляром
                let service;
                if (typeof ServiceModule === 'function') {
                    // Это класс - создаем экземпляр
                    console.log(`📦 ${serviceName} is a class, creating instance...`);
                    service = new ServiceModule();
                } else if (typeof ServiceModule === 'object' && ServiceModule !== null) {
                    // Это уже экземпляр - используем как есть
                    console.log(`📦 ${serviceName} is already an instance, using as is...`);
                    service = ServiceModule;
                } else {
                    console.error(`❌ Invalid service export for ${serviceName}:`, typeof ServiceModule, ServiceModule);
                    throw new Error(`Invalid service export for ${serviceName}: expected class or object, got ${typeof ServiceModule}`);
                }
                
                // Инициализируем сервис, если у него есть метод initialize
                // Исключение для WebSocketService - он инициализируется отдельно с сервером
                if (typeof service.initialize === 'function' && serviceName !== 'WebSocketService') {
                    await service.initialize();
                }
                
                this.services.set(serviceName, service);
                console.log(`✅ ${serviceName} initialized`);
                return service;
            } catch (error) {
                console.error(`❌ Failed to initialize ${serviceName}:`, error);
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
                console.log('🔧 Telegram service not initialized, initializing...');
                await telegramService.initialize();
            }
            
            await telegramService.sendAlert(alertType, message, severity);
            console.log('✅ Telegram alert sent successfully');
        } catch (error) {
            console.error('❌ Failed to send Telegram alert:', error);
        }
    }

    /**
     * Остановка всех сервисов
     */
    async stop() {
        console.log('🛑 Stopping ServiceManager...');
        
        const stopPromises = [];
        
        for (const [serviceName, service] of this.services) {
            if (typeof service.stop === 'function') {
                stopPromises.push(
                    service.stop().catch(error => 
                        console.error(`❌ Error stopping ${serviceName}:`, error)
                    )
                );
            }
        }
        
        await Promise.all(stopPromises);
        this.services.clear();
        this.initializationPromises.clear();
        this.isInitialized = false;
        
        console.log('✅ ServiceManager stopped');
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
