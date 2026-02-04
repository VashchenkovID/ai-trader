import os from 'os';
import OptimizedTelegramService from './OptimizedTelegramService.js';
import LoggerService from './LoggerService.js';

/**
 * Сервис для мониторинга системы
 * Собирает метрики производительности, ошибки и создает алерты
 */
class MonitoringService {
    constructor() {
        this.isInitialized = false;
        
        // Метрики приложения
        this.metrics = {
            application: {
                requests: 0,
                errors: 0,
                responseTime: 0,
                activeConnections: 0,
                memory: null,
                lastUpdate: null
            },
            database: {
                queries: 0,
                slowQueries: 0,
                errors: 0,
                lastQueryTime: null,
                lastUpdate: null
            },
            neuralNetwork: {
                trainings: 0,
                errors: 0,
                lastTraining: null,
                status: 'unknown',
                lastUpdate: null
            },
            cache: {
                hits: 0,
                misses: 0,
                operations: 0,
                size: 0,
                lastUpdate: null
            },
            system: {
                cpu: null,
                memory: null,
                disk: null,
                uptime: 0,
                lastUpdate: null
            }
        };
        
        // Алерты
        this.alerts = [];
        this.maxAlerts = 1000; // Максимальное количество хранимых алертов
        
        // История метрик (для трендов)
        this.metricsHistory = [];
        this.maxHistorySize = 1000;
        
        // Пороговые значения для алертов
        this.thresholds = {
            memory: 0.8,        // 80% использования памяти
            cpu: 0.7,            // 70% использования CPU
            disk: 0.9,           // 90% использования диска
            responseTime: 5000,  // 5 секунд
            errorRate: 0.05,     // 5% ошибок
            slowQueries: 0.1     // 10% медленных запросов
        };
        
        // Интервал обновления системных метрик
        this.updateInterval = null;
    }
    
    /**
     * Инициализация сервиса
     */
    async initialize() {
        try {
            // Начинаем периодическое обновление системных метрик
            this.startSystemMetricsUpdate();
            
            this.isInitialized = true;
        } catch (error) {
            LoggerService.error('Ошибка инициализации MonitoringService', {
                service: 'MonitoringService',
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
            throw error;
        }
    }
    
    /**
     * Запуск периодического обновления системных метрик
     */
    startSystemMetricsUpdate() {
        // Обновляем системные метрики каждые 30 секунд
        this.updateInterval = setInterval(() => {
            this.updateSystemMetrics();
        }, 30000);
        
        // Первое обновление сразу
        this.updateSystemMetrics();
    }
    
    /**
     * Остановка обновления метрик
     */
    stopSystemMetricsUpdate() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }
    
    /**
     * Обновление метрик приложения
     */
    updateApplicationMetrics(updates) {
        if (!this.isInitialized) {
            // Если сервис не инициализирован, просто инициализируем метрики
            if (!this.metrics.application.requests) {
                this.metrics.application = {
                    requests: 0,
                    errors: 0,
                    responseTime: 0,
                    activeConnections: 0,
                    memory: null,
                    lastUpdate: null
                };
            }
        }
        
        Object.assign(this.metrics.application, updates);
        this.metrics.application.lastUpdate = new Date().toISOString();
        
        // Проверяем пороги и создаем алерты
        this.checkApplicationThresholds();
    }
    
    /**
     * Обновление метрик базы данных
     */
    updateDatabaseMetrics(updates) {
        if (!this.metrics.database.queries) {
            this.metrics.database = {
                queries: 0,
                slowQueries: 0,
                errors: 0,
                lastQueryTime: null,
                lastUpdate: null
            };
        }
        
        Object.assign(this.metrics.database, updates);
        this.metrics.database.lastUpdate = new Date().toISOString();
        
        // Проверяем пороги
        this.checkDatabaseThresholds();
    }
    
    /**
     * Обновление метрик нейросети
     */
    updateNeuralNetworkMetrics(updates) {
        if (!this.metrics.neuralNetwork.trainings) {
            this.metrics.neuralNetwork = {
                trainings: 0,
                errors: 0,
                lastTraining: null,
                status: 'unknown',
                lastUpdate: null
            };
        }
        
        Object.assign(this.metrics.neuralNetwork, updates);
        this.metrics.neuralNetwork.lastUpdate = new Date().toISOString();
    }
    
    /**
     * Обновление метрик кеша
     */
    updateCacheMetrics(updates) {
        if (!this.metrics.cache.hits) {
            this.metrics.cache = {
                hits: 0,
                misses: 0,
                operations: 0,
                size: 0,
                lastUpdate: null
            };
        }
        
        Object.assign(this.metrics.cache, updates);
        this.metrics.cache.lastUpdate = new Date().toISOString();
    }
    
    /**
     * Обновление системных метрик
     */
    updateSystemMetrics() {
        try {
            const memUsage = process.memoryUsage();
            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const usedMem = totalMem - freeMem;
            
            // CPU загрузка (приблизительная)
            const cpus = os.cpus();
            const cpuUsage = cpus.reduce((acc, cpu) => {
                const total = Object.values(cpu.times).reduce((sum, time) => sum + time, 0);
                const idle = cpu.times.idle;
                return acc + (1 - idle / total);
            }, 0) / cpus.length;
            
            this.metrics.system = {
                cpu: {
                    usage: cpuUsage,
                    cores: cpus.length,
                    model: cpus[0]?.model || 'Unknown'
                },
                memory: {
                    used: memUsage.heapUsed,
                    total: memUsage.heapTotal,
                    external: memUsage.external,
                    rss: memUsage.rss,
                    systemUsed: usedMem,
                    systemTotal: totalMem,
                    systemUsage: usedMem / totalMem
                },
                uptime: process.uptime(),
                lastUpdate: new Date().toISOString()
            };
            
            // Проверяем пороги
            this.checkSystemThresholds();
            
        } catch (error) {
            LoggerService.error('Ошибка обновления системных метрик', {
                service: 'MonitoringService',
                operation: 'updateSystemMetrics',
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
        }
    }
    
    /**
     * Проверка порогов для метрик приложения
     */
    checkApplicationThresholds() {
        const app = this.metrics.application;
        
        // Проверка времени отклика
        if (app.responseTime > this.thresholds.responseTime) {
            this.createAlert('application', 'medium', 
                `Медленный отклик: ${app.responseTime.toFixed(2)}ms`);
        }
        
        // Проверка частоты ошибок
        if (app.requests > 0) {
            const errorRate = app.errors / app.requests;
            if (errorRate > this.thresholds.errorRate) {
                this.createAlert('application', 'high', 
                    `Высокая частота ошибок: ${(errorRate * 100).toFixed(2)}%`);
            }
        }
    }
    
    /**
     * Проверка порогов для метрик БД
     */
    checkDatabaseThresholds() {
        const db = this.metrics.database;
        
        // Проверка частоты медленных запросов
        if (db.queries > 0) {
            const slowQueryRate = db.slowQueries / db.queries;
            if (slowQueryRate > this.thresholds.slowQueries) {
                this.createAlert('database', 'medium', 
                    `Много медленных запросов: ${(slowQueryRate * 100).toFixed(2)}%`);
            }
        }
        
        // Проверка ошибок БД
        if (db.errors > 10) {
            this.createAlert('database', 'high', 
                `Много ошибок БД: ${db.errors}`);
        }
    }
    
    /**
     * Проверка порогов для системных метрик
     */
    checkSystemThresholds() {
        const system = this.metrics.system;
        
        if (!system.memory || !system.cpu) return;
        
        // Проверка использования памяти
        if (system.memory.systemUsage > this.thresholds.memory) {
            this.createAlert('system', 'high', 
                `Высокое использование памяти: ${(system.memory.systemUsage * 100).toFixed(2)}%`);
        }
        
        // Проверка использования CPU
        if (system.cpu.usage > this.thresholds.cpu) {
            this.createAlert('system', 'medium', 
                `Высокая нагрузка CPU: ${(system.cpu.usage * 100).toFixed(2)}%`);
        }
    }
    
    /**
     * Создание алерта
     */
    createAlert(category, severity, message, details = null) {
        // Проверяем на дубликаты (cooldown для одинаковых алертов)
        const alertKey = `${category}_${severity}_${message}`;
        const lastAlertTime = this.lastAlertTimes?.get(alertKey) || 0;
        const now = Date.now();
        const cooldownMs = 5 * 60 * 1000; // 5 минут cooldown для одинаковых алертов
        
        // Если такой же алерт был недавно, не создаем новый
        if (now - lastAlertTime < cooldownMs && (severity === 'high' || severity === 'critical')) {
            LoggerService.debug(`Алерт пропущен (cooldown): ${message}`, {
                service: 'MonitoringService',
                category,
                severity,
                lastAlertTime: new Date(lastAlertTime).toISOString(),
                cooldownMinutes: 5
            });
            return null;
        }
        
        // Инициализируем Map для хранения времени последних алертов
        if (!this.lastAlertTimes) {
            this.lastAlertTimes = new Map();
        }
        
        const alert = {
            id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            category, // 'application', 'database', 'neural_network', 'system', 'cache', 'websocket', 'scheduler'
            severity, // 'low', 'medium', 'high', 'critical'
            message,
            details,
            timestamp: new Date().toISOString(),
            resolved: false,
            resolvedAt: null
        };
        
        // Сохраняем время создания алерта
        this.lastAlertTimes.set(alertKey, now);
        
        // Очищаем старые записи (старше 1 часа)
        for (const [key, time] of this.lastAlertTimes.entries()) {
            if (now - time > 60 * 60 * 1000) {
                this.lastAlertTimes.delete(key);
            }
        }
        
        // Добавляем алерт в список
        this.alerts.unshift(alert);
        
        // Ограничиваем количество алертов
        if (this.alerts.length > this.maxAlerts) {
            this.alerts = this.alerts.slice(0, this.maxAlerts);
        }
        
        // Отправляем уведомление для критичных алертов
        if (severity === 'critical' || severity === 'high') {
            this.sendAlertNotification(alert);
        }
        
        // Отправляем через WebSocket
        this.broadcastAlert(alert);
        
        return alert;
    }
    
    /**
     * Отправка уведомления об алерте
     */
    async sendAlertNotification(alert) {
        try {
            if (OptimizedTelegramService && OptimizedTelegramService.isInitialized) {
                const emoji = {
                    low: '🟡',
                    medium: '🟠',
                    high: '🔴',
                    critical: '🚨'
                }[alert.severity] || '⚠️';
                
                await OptimizedTelegramService.sendAlert(
                    `MONITORING_${alert.category.toUpperCase()}`,
                    `${emoji} <b>АЛЕРТ: ${alert.category}</b>\n\n` +
                    `📝 ${alert.message}\n` +
                    `⚠️ Уровень: ${alert.severity}\n` +
                    `⏰ Время: ${new Date(alert.timestamp).toLocaleString('ru-RU')}` +
                    (alert.details ? `\n\n📊 Детали:\n${JSON.stringify(alert.details, null, 2)}` : ''),
                    alert.severity
                );
            }
        } catch (error) {
            LoggerService.error('Ошибка отправки уведомления об алерте', {
                service: 'MonitoringService',
                operation: 'sendAlertNotification',
                alertId: alert.id,
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
        }
    }
    
    /**
     * Отправка алерта через WebSocket
     */
    broadcastAlert(alert) {
        try {
            // Пытаемся получить WebSocketService через ServiceManager (динамический импорт)
            (async () => {
                try {
                    const ServiceManager = (await import('./ServiceManager.js')).default;
                    const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
                    
                    if (WebSocketService && typeof WebSocketService.broadcast === 'function') {
                        WebSocketService.broadcast('alert', {
                            id: alert.id,
                            category: alert.category,
                            severity: alert.severity,
                            message: alert.message,
                            timestamp: alert.timestamp
                        });
                    }
                } catch (error) {
                    // Игнорируем ошибки WebSocket, чтобы не ломать основной функционал
                    // Не логируем, так как это может быть вызвано до инициализации WebSocket
                }
            })();
        } catch (error) {
            // Игнорируем ошибки WebSocket, чтобы не ломать основной функционал
            LoggerService.warn('Не удалось отправить алерт через WebSocket', {
                service: 'MonitoringService',
                operation: 'broadcastAlert',
                alertId: alert.id,
                error: {
                    message: error.message
                }
            });
        }
    }
    
    /**
     * Разрешение алерта
     */
    resolveAlert(alertId) {
        const alert = this.alerts.find(a => a.id === alertId);
        if (alert) {
            alert.resolved = true;
            alert.resolvedAt = new Date().toISOString();
            return alert;
        }
        return null;
    }
    
    /**
     * Получение всех метрик
     */
    getMetrics() {
        return {
            ...this.metrics,
            alerts: {
                total: this.alerts.length,
                active: this.alerts.filter(a => !a.resolved).length,
                bySeverity: {
                    critical: this.alerts.filter(a => !a.resolved && a.severity === 'critical').length,
                    high: this.alerts.filter(a => !a.resolved && a.severity === 'high').length,
                    medium: this.alerts.filter(a => !a.resolved && a.severity === 'medium').length,
                    low: this.alerts.filter(a => !a.resolved && a.severity === 'low').length
                }
            }
        };
    }
    
    /**
     * Получение алертов
     */
    getAlerts(options = {}) {
        let alerts = [...this.alerts];
        
        // Фильтрация по категории
        if (options.category) {
            alerts = alerts.filter(a => a.category === options.category);
        }
        
        // Фильтрация по уровню важности
        if (options.severity) {
            alerts = alerts.filter(a => a.severity === options.severity);
        }
        
        // Фильтрация по статусу
        if (options.resolved !== undefined) {
            alerts = alerts.filter(a => a.resolved === options.resolved);
        }
        
        // Лимит
        const limit = options.limit || 100;
        alerts = alerts.slice(0, limit);
        
        return alerts;
    }
    
    /**
     * Получение статистики производительности
     */
    getPerformanceStats() {
        const app = this.metrics.application;
        const db = this.metrics.database;
        
        return {
            responseTime: {
                current: app.responseTime,
                average: app.responseTime, // Можно улучшить, добавив историю
                threshold: this.thresholds.responseTime
            },
            errorRate: {
                current: app.requests > 0 ? app.errors / app.requests : 0,
                threshold: this.thresholds.errorRate
            },
            throughput: {
                requestsPerSecond: app.requests / (process.uptime() || 1)
            },
            cacheHitRate: {
                current: this.metrics.cache.operations > 0 
                    ? this.metrics.cache.hits / this.metrics.cache.operations 
                    : 0
            },
            database: {
                queriesPerSecond: db.queries / (process.uptime() || 1),
                slowQueryRate: db.queries > 0 ? db.slowQueries / db.queries : 0
            }
        };
    }
    
    /**
     * Получение health check статуса
     */
    getHealthStatus() {
        const system = this.metrics.system;
        const app = this.metrics.application;
        
        const health = {
            status: 'healthy',
            checks: {
                system: {
                    status: 'ok',
                    cpu: system.cpu ? (system.cpu.usage < this.thresholds.cpu ? 'ok' : 'warning') : 'unknown',
                    memory: system.memory ? (system.memory.systemUsage < this.thresholds.memory ? 'ok' : 'warning') : 'unknown'
                },
                application: {
                    status: app.errors < 10 ? 'ok' : 'warning',
                    errorRate: app.requests > 0 ? app.errors / app.requests : 0
                },
                database: {
                    status: this.metrics.database.errors < 5 ? 'ok' : 'warning',
                    errors: this.metrics.database.errors
                }
            },
            timestamp: new Date().toISOString()
        };
        
        // Определяем общий статус
        const hasWarning = Object.values(health.checks).some(check => check.status === 'warning');
        const hasError = Object.values(health.checks).some(check => check.status === 'error');
        
        if (hasError) {
            health.status = 'unhealthy';
        } else if (hasWarning) {
            health.status = 'degraded';
        }
        
        return health;
    }
    
    /**
     * Сброс метрик
     */
    resetMetrics() {
        this.metrics = {
            application: {
                requests: 0,
                errors: 0,
                responseTime: 0,
                activeConnections: 0,
                memory: null,
                lastUpdate: null
            },
            database: {
                queries: 0,
                slowQueries: 0,
                errors: 0,
                lastQueryTime: null,
                lastUpdate: null
            },
            neuralNetwork: {
                trainings: 0,
                errors: 0,
                lastTraining: null,
                status: 'unknown',
                lastUpdate: null
            },
            cache: {
                hits: 0,
                misses: 0,
                operations: 0,
                size: 0,
                lastUpdate: null
            },
            system: this.metrics.system // Сохраняем системные метрики
        };
    }
    
    /**
     * Очистка старых алертов
     */
    cleanupOldAlerts(maxAge = 7 * 24 * 60 * 60 * 1000) { // 7 дней
        const now = Date.now();
        this.alerts = this.alerts.filter(alert => {
            const alertTime = new Date(alert.timestamp).getTime();
            return (now - alertTime) < maxAge;
        });
    }
}

// Экспортируем singleton
export default new MonitoringService();

