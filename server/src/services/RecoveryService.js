import MonitoringService from './MonitoringService.js';
import DatabaseConnectionManager from '../utils/DatabaseConnectionManager.js';
import LoggerService from './LoggerService.js';
import sequelize from '../config/database.js';

// DatabaseConnectionManager уже является singleton, импортируем напрямую

/**
 * Сервис для автоматического восстановления после сбоев
 * Управляет переподключением к БД, WebSocket и восстановлением состояния сервисов
 */
class RecoveryService {
    constructor() {
        this.isInitialized = false;
        
        // Состояние восстановления
        this.recoveryState = {
            database: {
                isHealthy: true,
                lastCheck: null,
                reconnectAttempts: 0,
                lastError: null
            },
            websocket: {
                isHealthy: true,
                lastCheck: null,
                reconnectAttempts: 0,
                lastError: null
            },
            services: {
                isHealthy: true,
                lastCheck: null,
                failedServices: []
            }
        };
        
        // Конфигурация
        this.config = {
            healthCheckInterval: 30000, // 30 секунд
            maxReconnectAttempts: 5,
            reconnectDelay: 2000, // 2 секунды
            exponentialBackoff: true
        };
        
        // Интервалы проверки
        this.healthCheckInterval = null;
    }
    
    /**
     * Инициализация сервиса
     */
    async initialize() {
        try {
            this.isInitialized = true;
            
            // Запускаем периодическую проверку здоровья
            this.startHealthChecks();
            
            // Настраиваем обработчики ошибок для Sequelize
            this.setupDatabaseErrorHandlers();
        } catch (error) {
            LoggerService.error('Ошибка инициализации RecoveryService', {
                service: 'RecoveryService',
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
            throw error;
        }
    }
    
    /**
     * Запуск периодических проверок здоровья
     */
    startHealthChecks() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        
        this.healthCheckInterval = setInterval(async () => {
            await this.performHealthChecks();
        }, this.config.healthCheckInterval);
        
        // Первая проверка с задержкой, чтобы дать время другим сервисам инициализироваться
        // Задержка 5 секунд должна быть достаточной для инициализации всех сервисов
        setTimeout(async () => {
            await this.performHealthChecks();
        }, 5000);
    }
    
    /**
     * Выполнение проверок здоровья всех компонентов
     */
    async performHealthChecks() {
        try {
            await Promise.all([
                this.checkDatabaseHealth(),
                this.checkWebSocketHealth(),
                this.checkServicesHealth()
            ]);
        } catch (error) {
            LoggerService.error('Ошибка при проверке здоровья', {
                service: 'RecoveryService',
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
        }
    }
    
    /**
     * Проверка здоровья базы данных
     */
    async checkDatabaseHealth() {
        try {
            const isAlive = await DatabaseConnectionManager.isConnectionAlive();
            const now = Date.now();
            
            if (!isAlive) {
                this.recoveryState.database.isHealthy = false;
                this.recoveryState.database.lastError = 'Connection check failed';
                
                LoggerService.warn('Database connection is not healthy, attempting recovery', {
                    service: 'RecoveryService',
                    component: 'database'
                });
                await this.recoverDatabase();
            } else {
                this.recoveryState.database.isHealthy = true;
                this.recoveryState.database.reconnectAttempts = 0;
                this.recoveryState.database.lastError = null;
            }
            
            this.recoveryState.database.lastCheck = now;
        } catch (error) {
            LoggerService.error('Ошибка проверки здоровья БД', {
                service: 'RecoveryService',
                component: 'database',
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
            this.recoveryState.database.isHealthy = false;
            this.recoveryState.database.lastError = error.message;
            await this.recoverDatabase();
        }
    }
    
    /**
     * Восстановление подключения к базе данных
     */
    async recoverDatabase() {
        if (this.recoveryState.database.reconnectAttempts >= this.config.maxReconnectAttempts) {
            const error = new Error('Max database reconnection attempts exceeded');
            this.recoveryState.database.lastError = error.message;
            
            MonitoringService.createAlert(
                'database',
                'high',
                'Не удалось восстановить подключение к базе данных после всех попыток',
                {
                    attempts: this.recoveryState.database.reconnectAttempts,
                    maxAttempts: this.config.maxReconnectAttempts
                }
            );
            
            throw error;
        }
        
        this.recoveryState.database.reconnectAttempts++;
        
        // Вычисляем задержку с экспоненциальным backoff
        const delay = this.config.exponentialBackoff
            ? Math.min(
                this.config.reconnectDelay * Math.pow(2, this.recoveryState.database.reconnectAttempts - 1),
                30000 // Максимум 30 секунд
            )
            : this.config.reconnectDelay;
        
        try {
            // Используем DatabaseConnectionManager для переподключения
            const reconnected = await DatabaseConnectionManager.reconnect();
            
            if (reconnected) {
                this.recoveryState.database.isHealthy = true;
                this.recoveryState.database.reconnectAttempts = 0;
                this.recoveryState.database.lastError = null;
                
                MonitoringService.createAlert(
                    'database',
                    'info',
                    'Подключение к базе данных успешно восстановлено',
                    {
                        attempts: this.recoveryState.database.reconnectAttempts
                    }
                );
                
                return true;
            }
        } catch (error) {
            LoggerService.error(`Ошибка восстановления БД (попытка ${this.recoveryState.database.reconnectAttempts})`, {
                service: 'RecoveryService',
                component: 'database',
                attempt: this.recoveryState.database.reconnectAttempts,
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
            this.recoveryState.database.lastError = error.message;
            
            // Если не последняя попытка, ждем перед следующей
            if (this.recoveryState.database.reconnectAttempts < this.config.maxReconnectAttempts) {
                await this.delay(delay);
                return await this.recoverDatabase();
            }
        }
        
        return false;
    }
    
    /**
     * Проверка здоровья WebSocket
     */
    async checkWebSocketHealth() {
        try {
            const WebSocketService = (await import('./WebSocketService.js')).default;
            const getWebSocketService = (await import('./WebSocketService.js')).getWebSocketService;
            
            const wsService = getWebSocketService();
            const status = wsService.getStatus();
            
            const now = Date.now();
            const isHealthy = status && status.isActive !== false;
            
            if (!isHealthy) {
                this.recoveryState.websocket.isHealthy = false;
                this.recoveryState.websocket.lastError = 'WebSocket service is not active';
                
                LoggerService.warn('WebSocket is not healthy, attempting recovery', {
                    service: 'RecoveryService',
                    component: 'websocket'
                });
                await this.recoverWebSocket();
            } else {
                this.recoveryState.websocket.isHealthy = true;
                this.recoveryState.websocket.reconnectAttempts = 0;
                this.recoveryState.websocket.lastError = null;
            }
            
            this.recoveryState.websocket.lastCheck = now;
        } catch (error) {
            LoggerService.error('Ошибка проверки здоровья WebSocket', {
                service: 'RecoveryService',
                component: 'websocket',
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
            this.recoveryState.websocket.isHealthy = false;
            this.recoveryState.websocket.lastError = error.message;
        }
    }
    
    /**
     * Восстановление WebSocket
     */
    async recoverWebSocket() {
        if (this.recoveryState.websocket.reconnectAttempts >= this.config.maxReconnectAttempts) {
            const error = new Error('Max WebSocket reconnection attempts exceeded');
            this.recoveryState.websocket.lastError = error.message;
            
            MonitoringService.createAlert(
                'websocket',
                'medium',
                'Не удалось восстановить WebSocket после всех попыток',
                {
                    attempts: this.recoveryState.websocket.reconnectAttempts,
                    maxAttempts: this.config.maxReconnectAttempts
                }
            );
            
            return false;
        }
        
        this.recoveryState.websocket.reconnectAttempts++;
        
        const delay = this.config.exponentialBackoff
            ? Math.min(
                this.config.reconnectDelay * Math.pow(2, this.recoveryState.websocket.reconnectAttempts - 1),
                30000
            )
            : this.config.reconnectDelay;
        
        try {
            // WebSocket обычно переподключается автоматически через клиентов
            // Здесь мы можем проверить состояние и уведомить о проблеме
            await this.delay(delay);
            
            const WebSocketService = (await import('./WebSocketService.js')).default;
            const getWebSocketService = (await import('./WebSocketService.js')).getWebSocketService;
            const wsService = getWebSocketService();
            const status = wsService.getStatus();
            
            if (status && status.isActive) {
                this.recoveryState.websocket.isHealthy = true;
                this.recoveryState.websocket.reconnectAttempts = 0;
                this.recoveryState.websocket.lastError = null;
                return true;
            }
        } catch (error) {
            LoggerService.error(`Ошибка восстановления WebSocket (попытка ${this.recoveryState.websocket.reconnectAttempts})`, {
                service: 'RecoveryService',
                component: 'websocket',
                attempt: this.recoveryState.websocket.reconnectAttempts,
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
            this.recoveryState.websocket.lastError = error.message;
            
            if (this.recoveryState.websocket.reconnectAttempts < this.config.maxReconnectAttempts) {
                await this.delay(delay);
                return await this.recoverWebSocket();
            }
        }
        
        return false;
    }
    
    /**
     * Проверка здоровья сервисов
     */
    async checkServicesHealth() {
        try {
            const ServiceManager = (await import('./ServiceManager.js')).default;
            const failedServices = [];
            
            // Проверяем ключевые сервисы
            const criticalServices = [
                'MonitoringService',
                'CacheService',
                'TradingEngine',
                'SchedulerService'
            ];
            
            for (const serviceName of criticalServices) {
                try {
                    const service = ServiceManager.getServiceSafe(serviceName);
                    if (!service) {
                        failedServices.push({
                            name: serviceName,
                            error: 'Service not found in ServiceManager'
                        });
                    } else {
                        // Проверяем isInitialized только если он определен
                        // Если у сервиса нет метода initialize, то isInitialized может быть не определен
                        // Это нормально для сервисов, которые не требуют инициализации
                        if (service.isInitialized !== undefined && !service.isInitialized) {
                            failedServices.push({
                                name: serviceName,
                                error: 'Service isInitialized is false'
                            });
                        }
                        // Если сервис найден и isInitialized не определен или true - считаем его здоровым
                    }
                } catch (error) {
                    failedServices.push({
                        name: serviceName,
                        error: error.message
                    });
                }
            }
            
            const now = Date.now();
            this.recoveryState.services.isHealthy = failedServices.length === 0;
            this.recoveryState.services.failedServices = failedServices;
            this.recoveryState.services.lastCheck = now;
            
            if (failedServices.length > 0) {
                LoggerService.warn(`Обнаружены проблемы с сервисами: ${failedServices.map(s => s.name).join(', ')}`, {
                    service: 'RecoveryService',
                    component: 'services',
                    failedServices: failedServices.map(s => s.name)
                });
                await this.recoverServices(failedServices);
            }
        } catch (error) {
            LoggerService.error('Ошибка проверки здоровья сервисов', {
                service: 'RecoveryService',
                component: 'services',
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
        }
    }
    
    /**
     * Восстановление сервисов
     */
    async recoverServices(failedServices) {
        const ServiceManager = (await import('./ServiceManager.js')).default;
        
        for (const failedService of failedServices) {
            try {
                // Пытаемся переинициализировать сервис
                const service = ServiceManager.getServiceSafe(failedService.name);
                if (service && typeof service.initialize === 'function') {
                    await service.initialize();
                }
            } catch (error) {
                LoggerService.error(`Не удалось восстановить сервис ${failedService.name}`, {
                    service: 'RecoveryService',
                    targetService: failedService.name,
                    error: {
                        message: error.message,
                        stack: error.stack
                    }
                });
                
                MonitoringService.createAlert(
                    'service',
                    'high',
                    `Не удалось восстановить сервис ${failedService.name}`,
                    {
                        service: failedService.name,
                        error: error.message
                    }
                );
            }
        }
    }
    
    /**
     * Настройка обработчиков ошибок для Sequelize
     */
    setupDatabaseErrorHandlers() {
        try {
            // Sequelize не предоставляет прямой доступ к событиям пула
            // Вместо этого мы полагаемся на периодические проверки здоровья
            // и обработку ошибок в методах работы с БД
            
            // Можно попробовать использовать события самого sequelize, если они доступны
            if (sequelize && typeof sequelize.on === 'function') {
                sequelize.on('error', async (error) => {
                    LoggerService.error('Sequelize error', {
                        service: 'RecoveryService',
                        component: 'database',
                        error: {
                            message: error.message,
                            stack: error.stack
                        }
                    });
                    this.recoveryState.database.isHealthy = false;
                    this.recoveryState.database.lastError = error.message;
                    
                    // Автоматическое восстановление
                    await this.recoverDatabase();
                });
            }
        } catch (error) {
            // Игнорируем ошибки настройки обработчиков
            // Периодические проверки здоровья все равно будут работать
            LoggerService.warn('Не удалось настроить обработчики ошибок Sequelize', {
                service: 'RecoveryService',
                error: {
                    message: error.message
                }
            });
        }
    }
    
    /**
     * Проверка целостности данных после сбоя
     */
    async verifyDataIntegrity() {
        try {
            const issues = [];
            
            // Проверка 1: Настройки
            try {
                const Settings = (await import('../models/Settings.js')).default;
                const settingsCount = await Settings.count();
                if (settingsCount === 0) {
                    issues.push({
                        type: 'settings',
                        severity: 'high',
                        message: 'Таблица настроек пуста'
                    });
                }
            } catch (error) {
                issues.push({
                    type: 'settings',
                    severity: 'high',
                    message: `Ошибка проверки настроек: ${error.message}`
                });
            }
            
            // Проверка 2: Инструменты
            try {
                const CachedInstrument = (await import('../models/CachedInstrument.js')).default;
                const instrumentsCount = await CachedInstrument.count();
                if (instrumentsCount === 0) {
                    issues.push({
                        type: 'instruments',
                        severity: 'medium',
                        message: 'Кеш инструментов пуст'
                    });
                }
            } catch (error) {
                issues.push({
                    type: 'instruments',
                    severity: 'medium',
                    message: `Ошибка проверки инструментов: ${error.message}`
                });
            }
            
            // Проверка 3: Портфель
            try {
                const VirtualPortfolio = (await import('../models/VirtualPortfolio.js')).default;
                const portfolioCount = await VirtualPortfolio.count();
                if (portfolioCount === 0) {
                    issues.push({
                        type: 'portfolio',
                        severity: 'low',
                        message: 'Портфель не найден (может быть нормально)'
                    });
                }
            } catch (error) {
                issues.push({
                    type: 'portfolio',
                    severity: 'medium',
                    message: `Ошибка проверки портфеля: ${error.message}`
                });
            }
            
            if (issues.length > 0) {
                LoggerService.warn(`Обнаружены проблемы целостности данных: ${issues.length}`, {
                    service: 'RecoveryService',
                    operation: 'verifyDataIntegrity',
                    issuesCount: issues.length,
                    issues: issues.map(i => ({ type: i.type, severity: i.severity, message: i.message }))
                });
                
                // Создаем алерты для критических проблем
                issues.filter(i => i.severity === 'high').forEach(issue => {
                    MonitoringService.createAlert(
                        'data_integrity',
                        'high',
                        `Проблема целостности данных: ${issue.message}`,
                        {
                            type: issue.type,
                            message: issue.message
                        }
                    );
                });
            }
            
            return {
                success: issues.length === 0,
                issues: issues
            };
        } catch (error) {
            LoggerService.error('Ошибка проверки целостности данных', {
                service: 'RecoveryService',
                operation: 'verifyDataIntegrity',
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
            throw error;
        }
    }
    
    /**
     * Полное восстановление системы
     */
    async performFullRecovery() {
        try {
            // 1. Восстановление БД
            await this.recoverDatabase();
            
            // 2. Восстановление WebSocket
            await this.recoverWebSocket();
            
            // 3. Восстановление сервисов
            await this.checkServicesHealth();
            
            // 4. Проверка целостности данных
            await this.verifyDataIntegrity();
            
            return {
                success: true,
                database: this.recoveryState.database.isHealthy,
                websocket: this.recoveryState.websocket.isHealthy,
                services: this.recoveryState.services.isHealthy
            };
        } catch (error) {
            LoggerService.error('Ошибка полного восстановления', {
                service: 'RecoveryService',
                operation: 'performFullRecovery',
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
            throw error;
        }
    }
    
    /**
     * Получение состояния восстановления
     */
    getRecoveryState() {
        return {
            ...this.recoveryState,
            config: this.config,
            isInitialized: this.isInitialized
        };
    }
    
    /**
     * Получение статистики восстановления
     */
    getRecoveryStats() {
        return {
            database: {
                isHealthy: this.recoveryState.database.isHealthy,
                reconnectAttempts: this.recoveryState.database.reconnectAttempts,
                lastCheck: this.recoveryState.database.lastCheck,
                lastError: this.recoveryState.database.lastError
            },
            websocket: {
                isHealthy: this.recoveryState.websocket.isHealthy,
                reconnectAttempts: this.recoveryState.websocket.reconnectAttempts,
                lastCheck: this.recoveryState.websocket.lastCheck,
                lastError: this.recoveryState.websocket.lastError
            },
            services: {
                isHealthy: this.recoveryState.services.isHealthy,
                failedServices: this.recoveryState.services.failedServices,
                lastCheck: this.recoveryState.services.lastCheck
            }
        };
    }
    
    /**
     * Задержка
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Остановка сервиса
     */
    stop() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
    }
}

export default new RecoveryService();

