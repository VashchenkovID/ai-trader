import LoggerService from '../services/LoggerService.js';
import MonitoringService from '../services/MonitoringService.js';

/**
 * Rate Limiting Middleware для Express
 * Ограничивает количество запросов с одного IP адреса
 */

// Хранилище для счетчиков запросов (в памяти)
// В production можно использовать Redis для распределенного rate limiting
const requestCounts = new Map();

// Конфигурация по умолчанию
// Для одного пользователя лимиты увеличены
const defaultConfig = {
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 1000, // 1000 запросов за окно (увеличено для одного пользователя)
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true, // Возвращать информацию о лимитах в заголовках
    legacyHeaders: false, // Отключить заголовки X-RateLimit-*
    skipSuccessfulRequests: false, // Считать все запросы, включая успешные
    skipFailedRequests: false, // Считать все запросы, включая неудачные
    keyGenerator: (req) => {
        // Генерируем ключ на основе IP адреса
        // Express автоматически устанавливает req.ip при trust proxy
        // Иначе используем заголовки или connection
        return req.ip || 
               req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
               req.headers['x-real-ip'] ||
               req.connection?.remoteAddress ||
               req.socket?.remoteAddress ||
               'unknown';
    },
    handler: (req, res) => {
        const key = defaultConfig.keyGenerator(req);
        const count = requestCounts.get(key) || { count: 0, resetTime: Date.now() + defaultConfig.windowMs };
        
        LoggerService.warn('Rate limit exceeded', {
            service: 'RateLimiter',
            ip: key,
            path: req.path,
            method: req.method,
            count: count.count
        });
        
        // Создаем алерт через MonitoringService
        if (MonitoringService.isInitialized) {
            try {
                MonitoringService.createAlert(
                    'security',
                    'warning',
                    `Rate limit exceeded for IP ${key} on ${req.method} ${req.path}`,
                    {
                        ip: key,
                        path: req.path,
                        method: req.method,
                        count: count.count
                    }
                );
            } catch (err) {
                // Игнорируем ошибки создания алертов
            }
        }
        
        res.status(429).json({
            error: 'Too Many Requests',
            message: defaultConfig.message,
            retryAfter: Math.ceil((count.resetTime - Date.now()) / 1000)
        });
    }
};

/**
 * Очистка старых записей из кеша
 */
function cleanupExpiredEntries() {
    const now = Date.now();
    for (const [key, value] of requestCounts.entries()) {
        if (value.resetTime < now) {
            requestCounts.delete(key);
        }
    }
}

// Очистка каждые 5 минут
setInterval(cleanupExpiredEntries, 5 * 60 * 1000);

/**
 * Создает rate limiter middleware с заданной конфигурацией
 * @param {Object} config - Конфигурация rate limiter
 * @returns {Function} Express middleware
 */
export function createRateLimiter(config = {}) {
    const options = { ...defaultConfig, ...config };
    
    return (req, res, next) => {
        const key = options.keyGenerator(req);
        const now = Date.now();
        
        // Получаем или создаем счетчик для этого ключа
        let countData = requestCounts.get(key);
        
        if (!countData || countData.resetTime < now) {
            // Создаем новый счетчик
            countData = {
                count: 0,
                resetTime: now + options.windowMs
            };
            requestCounts.set(key, countData);
        }
        
        // Увеличиваем счетчик ПЕРЕД проверкой
        countData.count++;
        
        // Сохраняем обновленный счетчик (важно для параллельных запросов)
        requestCounts.set(key, countData);
        
        // Проверяем лимит (строго больше, не >=)
        if (countData.count > options.max) {
            return options.handler(req, res);
        }
        
        // Добавляем заголовки с информацией о лимитах
        if (options.standardHeaders) {
            res.setHeader('X-RateLimit-Limit', options.max);
            res.setHeader('X-RateLimit-Remaining', Math.max(0, options.max - countData.count));
            res.setHeader('X-RateLimit-Reset', new Date(countData.resetTime).toISOString());
        }
        
        // Пропускаем запрос
        next();
    };
}

/**
 * Rate limiter для общих API endpoints
 * 1000 запросов за 15 минут (увеличено для одного пользователя)
 */
export const generalLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 1000 // Увеличено с 100 до 1000 для одного пользователя
});

/**
 * Rate limiter для строгих endpoints (авторизация, создание данных)
 * 100 запросов за 15 минут (увеличено для одного пользователя)
 */
export const strictLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 100, // Увеличено с 10 до 100 для одного пользователя
    message: 'Too many requests to this endpoint. Please try again later.'
});

/**
 * Rate limiter для публичных endpoints (чтение данных)
 * 2000 запросов за 15 минут (увеличено для одного пользователя)
 */
export const publicLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 2000 // Увеличено с 200 до 2000 для одного пользователя
});

/**
 * Rate limiter для тяжелых операций (обучение, бэкапы)
 * 5 запросов за час
 */
export const heavyOperationLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 час
    max: 5,
    message: 'Too many heavy operations. Please wait before trying again.'
});

/**
 * Rate limiter для batch-train-all (более мягкие ограничения)
 * 100 запросов за 30 минут (увеличено для одного пользователя)
 * В production можно уменьшить до 10-20 запросов
 */
export const batchTrainLimiter = createRateLimiter({
    windowMs: 30 * 60 * 1000, // 30 минут
    max: process.env.NODE_ENV === 'production' ? 20 : 100, // 100 для разработки, 20 для production
    message: 'Too many batch training requests. Please wait before trying again. You can reset the limit via /api/rate-limit/reset'
});

/**
 * Получить статистику rate limiting для IP
 * @param {string} ip - IP адрес
 * @returns {Object|null} Статистика или null если нет данных
 */
export function getRateLimitStats(ip) {
    const countData = requestCounts.get(ip);
    if (!countData) {
        return null;
    }
    
    return {
        ip,
        count: countData.count,
        resetTime: countData.resetTime,
        resetIn: Math.max(0, Math.ceil((countData.resetTime - Date.now()) / 1000))
    };
}

/**
 * Получить все активные rate limit записи
 * @returns {Array} Массив статистики
 */
export function getAllRateLimitStats() {
    const stats = [];
    for (const [ip, countData] of requestCounts.entries()) {
        stats.push({
            ip,
            count: countData.count,
            resetTime: countData.resetTime,
            resetIn: Math.max(0, Math.ceil((countData.resetTime - Date.now()) / 1000))
        });
    }
    return stats;
}

/**
 * Сбросить rate limit для IP
 * @param {string} ip - IP адрес
 */
export function resetRateLimit(ip) {
    requestCounts.delete(ip);
}

/**
 * Очистить все rate limit записи
 */
export function clearAllRateLimits() {
    requestCounts.clear();
}

