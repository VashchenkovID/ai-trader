import LoggerService from '../services/LoggerService.js';
import { performance } from 'perf_hooks';

/**
 * Middleware для трассировки запросов
 * Добавляет requestId к каждому запросу и логирует все HTTP запросы
 */
export const requestTracing = (req, res, next) => {
    // Генерируем уникальный requestId для каждого запроса
    const requestId = LoggerService.requestIdGenerator 
        ? LoggerService.requestIdGenerator() 
        : `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Добавляем requestId к объекту запроса
    req.requestId = requestId;
    
    // Добавляем requestId в заголовки ответа для отладки
    res.setHeader('X-Request-ID', requestId);
    
    // Устанавливаем контекст для логирования
    const context = {
        requestId,
        method: req.method,
        path: req.path || req.url,
        ip: req.ip || req.connection?.remoteAddress || 'unknown',
        userAgent: req.get('user-agent') || 'unknown'
    };
    
    // Добавляем userId если есть
    if (req.user?.id) {
        context.userId = req.user.id;
    }
    
    LoggerService.setContext(requestId, context);
    
    const cleanup = () => {
        LoggerService.clearContext(requestId);
    };
    res.once('finish', cleanup);
    res.once('close', cleanup);
    
    // Засекаем время начала запроса
    const startTime = performance.now();
    
    // Перехватываем завершение ответа для логирования
    const originalSend = res.send;
    res.send = function(data) {
        const duration = performance.now() - startTime;
        
        // Логируем запрос (используем оригинальный req, но замаскированные данные уже применены через middleware)
        LoggerService.logRequest(req, res, duration);
        
        // Логируем медленные запросы
        if (duration > 1000) {
            LoggerService.logSlowRequest(req, duration);
        }
        
        cleanup();
        
        // Вызываем оригинальный send
        return originalSend.call(this, data);
    };
    
    // Обрабатываем ошибки
    res.on('error', (error) => {
        LoggerService.logRequestError(error, req);
        cleanup();
    });
    
    next();
};

/**
 * Middleware для добавления requestId в контекст ошибок
 */
export const errorTracing = (err, req, res, next) => {
    if (req.requestId) {
        err.requestId = req.requestId;
    }
    next(err);
};

