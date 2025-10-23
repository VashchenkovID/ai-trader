import { performance } from 'perf_hooks';
import MonitoringService from '../services/MonitoringService.js';

// Middleware для мониторинга запросов
export const requestMonitoring = (req, res, next) => {
    const startTime = performance.now();
    const startMemory = process.memoryUsage();
    
    // Увеличиваем счетчик запросов
    MonitoringService.updateApplicationMetrics({
        requests: (MonitoringService.metrics.application.requests || 0) + 1
    });
    
    // Перехватываем завершение ответа
    const originalSend = res.send;
    res.send = function(data) {
        const endTime = performance.now();
        const endMemory = process.memoryUsage();
        const duration = endTime - startTime;
        const memoryDelta = endMemory.heapUsed - startMemory.heapUsed;
        
        // Обновляем метрики
        MonitoringService.updateApplicationMetrics({
            responseTime: duration,
            memory: endMemory
        });
        
        // Логируем медленные запросы
        if (duration > 1000) { // > 1 секунды
            console.warn(`🐌 Slow request: ${req.method} ${req.path} (${duration.toFixed(2)}ms)`);
        }
        
        // Логируем запросы с большим потреблением памяти
        if (memoryDelta > 10 * 1024 * 1024) { // > 10MB
            console.warn(`💾 High memory usage: ${req.method} ${req.path} (${(memoryDelta / 1024 / 1024).toFixed(2)}MB)`);
        }
        
        // Вызываем оригинальный send
        return originalSend.call(this, data);
    };
    
    next();
};

// Middleware для обработки ошибок
export const errorMonitoring = (err, req, res, next) => {
    // Увеличиваем счетчик ошибок
    MonitoringService.updateApplicationMetrics({
        errors: (MonitoringService.metrics.application.errors || 0) + 1
    });
    
    // Логируем ошибку
    console.error(`❌ Request error: ${req.method} ${req.path}`, err);
    
    // Отправляем алерт для критических ошибок
    if (err.status >= 500) {
        MonitoringService.createAlert('application', 'high', 
            `Server error: ${err.message} in ${req.method} ${req.path}`);
    }
    
    next(err);
};

// Middleware для мониторинга WebSocket соединений
export const websocketMonitoring = (ws, req) => {
    // Увеличиваем счетчик активных соединений
    MonitoringService.updateApplicationMetrics({
        activeConnections: (MonitoringService.metrics.application.activeConnections || 0) + 1
    });
    
    // Обрабатываем закрытие соединения
    ws.on('close', () => {
        MonitoringService.updateApplicationMetrics({
            activeConnections: Math.max(0, (MonitoringService.metrics.application.activeConnections || 1) - 1)
        });
    });
    
    // Обрабатываем ошибки WebSocket
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        MonitoringService.createAlert('websocket', 'medium', 
            `WebSocket error: ${error.message}`);
    });
};

// Middleware для мониторинга базы данных
export const databaseMonitoring = (sequelize) => {
    // Перехватываем все запросы к БД
    const originalQuery = sequelize.query.bind(sequelize);
    
    sequelize.query = async function(sql, options) {
        const startTime = performance.now();
        
        try {
            const result = await originalQuery(sql, options);
            const duration = performance.now() - startTime;
            
            // Обновляем метрики БД
            MonitoringService.updateDatabaseMetrics({
                queries: (MonitoringService.metrics.database.queries || 0) + 1
            });
            
            // Логируем медленные запросы
            if (duration > 1000) { // > 1 секунды
                const sqlString = typeof sql === 'string' ? sql : JSON.stringify(sql);
                console.warn(`🐌 Slow database query (${duration.toFixed(2)}ms):`, sqlString.substring(0, 100));
                MonitoringService.updateDatabaseMetrics({
                    slowQueries: (MonitoringService.metrics.database.slowQueries || 0) + 1
                });
            }
            
            return result;
        } catch (error) {
            const duration = performance.now() - startTime;
            
            // Обновляем счетчик ошибок БД
            MonitoringService.updateDatabaseMetrics({
                errors: (MonitoringService.metrics.database.errors || 0) + 1
            });
            
            // Логируем ошибки БД
            console.error(`❌ Database error (${duration.toFixed(2)}ms):`, error.message);
            
            // Отправляем алерт для критических ошибок БД
            if (error.name === 'SequelizeConnectionError') {
                MonitoringService.createAlert('database', 'critical', 
                    `Database connection error: ${error.message}`);
            }
            
            throw error;
        }
    };
};

// Middleware для мониторинга нейросети
export const neuralNetworkMonitoring = (neuralNetworkService) => {
    // Перехватываем методы нейросети
    const originalTrain = neuralNetworkService.trainForInstrument;
    const originalAnalyze = neuralNetworkService.analyzePortfolio;
    
    neuralNetworkService.trainForInstrument = async function(...args) {
        const startTime = performance.now();
        
        try {
            const result = await originalTrain.apply(this, args);
            const duration = performance.now() - startTime;
            
            // Обновляем метрики нейросети
            MonitoringService.updateNeuralNetworkMetrics({
                lastTraining: new Date().toISOString(),
                status: 'active'
            });
            
            // Логируем медленное обучение
            if (duration > 30000) { // > 30 секунд
                console.warn(`🐌 Slow neural network training (${(duration / 1000).toFixed(2)}s)`);
            }
            
            return result;
        } catch (error) {
            // Обновляем счетчик ошибок нейросети
            MonitoringService.updateNeuralNetworkMetrics({
                errors: (MonitoringService.metrics.neuralNetwork.errors || 0) + 1,
                status: 'error'
            });
            
            // Отправляем алерт
            MonitoringService.createAlert('neural_network', 'high', 
                `Neural network training error: ${error.message}`);
            
            throw error;
        }
    };
    
    neuralNetworkService.analyzePortfolio = async function(...args) {
        const startTime = performance.now();
        
        try {
            const result = await originalAnalyze.apply(this, args);
            const duration = performance.now() - startTime;
            
            // Логируем медленный анализ
            if (duration > 10000) { // > 10 секунд
                console.warn(`🐌 Slow portfolio analysis (${(duration / 1000).toFixed(2)}s)`);
            }
            
            return result;
        } catch (error) {
            // Обновляем счетчик ошибок нейросети
            MonitoringService.updateNeuralNetworkMetrics({
                errors: (MonitoringService.metrics.neuralNetwork.errors || 0) + 1,
                status: 'error'
            });
            
            // Отправляем алерт
            MonitoringService.createAlert('neural_network', 'high', 
                `Neural network analysis error: ${error.message}`);
            
            throw error;
        }
    };
};

// Middleware для мониторинга кеша
export const cacheMonitoring = (cacheService) => {
    // Перехватываем методы кеша
    const originalGet = cacheService.get;
    const originalSet = cacheService.set;
    
    cacheService.get = function(key) {
        const startTime = performance.now();
        
        try {
            const result = originalGet.call(this, key);
            const duration = performance.now() - startTime;
            
            // Логируем медленные операции кеша
            if (duration > 100) { // > 100ms
                console.warn(`🐌 Slow cache get (${duration.toFixed(2)}ms): ${key}`);
            }
            
            return result;
        } catch (error) {
            console.error(`❌ Cache get error: ${error.message}`);
            throw error;
        }
    };
    
    cacheService.set = function(key, value, ttl) {
        const startTime = performance.now();
        
        try {
            const result = originalSet.call(this, key, value, ttl);
            const duration = performance.now() - startTime;
            
            // Логируем медленные операции кеша
            if (duration > 100) { // > 100ms
                console.warn(`🐌 Slow cache set (${duration.toFixed(2)}ms): ${key}`);
            }
            
            return result;
        } catch (error) {
            console.error(`❌ Cache set error: ${error.message}`);
            throw error;
        }
    };
};

// Middleware для мониторинга планировщика
export const schedulerMonitoring = (schedulerService) => {
    // Перехватываем методы планировщика
    const originalPerformCacheUpdate = schedulerService.performCacheUpdate;
    const originalPerformScheduledTraining = schedulerService.performScheduledTraining;
    
    schedulerService.performCacheUpdate = async function() {
        const startTime = performance.now();
        
        try {
            const result = await originalPerformCacheUpdate.call(this);
            const duration = performance.now() - startTime;
            
            // Логируем медленное обновление кеша
            if (duration > 60000) { // > 1 минуты
                console.warn(`🐌 Slow cache update (${(duration / 1000).toFixed(2)}s)`);
            }
            
            return result;
        } catch (error) {
            console.error(`❌ Cache update error: ${error.message}`);
            MonitoringService.createAlert('scheduler', 'high', 
                `Cache update error: ${error.message}`);
            throw error;
        }
    };
    
    schedulerService.performScheduledTraining = async function() {
        const startTime = performance.now();
        
        try {
            const result = await originalPerformScheduledTraining.call(this);
            const duration = performance.now() - startTime;
            
            // Логируем медленное обучение
            if (duration > 300000) { // > 5 минут
                console.warn(`🐌 Slow scheduled training (${(duration / 1000 / 60).toFixed(2)}min)`);
            }
            
            return result;
        } catch (error) {
            console.error(`❌ Scheduled training error: ${error.message}`);
            MonitoringService.createAlert('scheduler', 'high', 
                `Scheduled training error: ${error.message}`);
            throw error;
        }
    };
};

export default {
    requestMonitoring,
    errorMonitoring,
    websocketMonitoring,
    databaseMonitoring,
    neuralNetworkMonitoring,
    cacheMonitoring,
    schedulerMonitoring
};
