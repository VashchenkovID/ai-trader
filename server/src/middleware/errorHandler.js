import MonitoringService from '../services/MonitoringService.js';
import OptimizedTelegramService from '../services/OptimizedTelegramService.js';
import LoggerService from '../services/LoggerService.js';
import { AppError } from '../utils/errors/AppError.js';

/**
 * Централизованный обработчик ошибок
 */
export const errorHandler = (err, req, res, next) => {
    // Если ответ уже отправлен, передаем управление стандартному обработчику Express
    if (res.headersSent) {
        return next(err);
    }

    // Определяем статус код и сообщение
    let statusCode = err.statusCode || 500;
    let message = err.message || 'Internal server error';
    let details = null;

    // Обработка кастомных ошибок приложения
    if (err instanceof AppError) {
        statusCode = err.statusCode;
        message = err.message;
        details = err.details || null;
    }
    // Обработка ошибок валидации (например, от express-validator)
    else if (err.name === 'ValidationError' || err.name === 'SequelizeValidationError') {
        statusCode = 400;
        message = 'Validation error';
        details = err.errors || err.details || null;
    }
    // Обработка ошибок Sequelize
    else if (err.name === 'SequelizeDatabaseError') {
        statusCode = 500;
        message = 'Database error';
        details = process.env.NODE_ENV === 'development' ? err.message : null;
    }
    // Обработка ошибок подключения к БД
    else if (err.name === 'SequelizeConnectionError') {
        statusCode = 503;
        message = 'Database connection error';
        details = process.env.NODE_ENV === 'development' ? err.message : null;
    }
    // Обработка ошибок уникальности (Sequelize)
    else if (err.name === 'SequelizeUniqueConstraintError') {
        statusCode = 409;
        message = 'Resource already exists';
        details = err.errors || null;
    }
    // Обработка ошибок внешних API
    else if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
        statusCode = 502;
        message = 'External service unavailable';
    }
    // Обработка JSON ошибок
    else if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        statusCode = 400;
        message = 'Invalid JSON';
    }

    // Логирование ошибки
    const errorInfo = {
        message,
        statusCode,
        path: req.path,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        timestamp: new Date().toISOString(),
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        details: details || (err.details ? err.details : undefined)
    };

    // Логируем ошибку
    if (statusCode >= 500) {
        // Критические ошибки - полное логирование
        LoggerService.logRequestError(err, req);
    } else {
        // Клиентские ошибки - меньше деталей
        LoggerService.warn('Client Error', {
            requestId: req.requestId,
            message,
            statusCode,
            path: req.path,
            method: req.method
        });
    }

    // Обновляем метрики мониторинга
    try {
        MonitoringService.updateApplicationMetrics({
            errors: (MonitoringService.metrics.application.errors || 0) + 1
        });

        // Создаем алерт для критических ошибок
        if (statusCode >= 500) {
            MonitoringService.createAlert(
                'application',
                statusCode >= 500 ? 'high' : 'medium',
                `Server error: ${message} in ${req.method} ${req.path}`,
                {
                    statusCode,
                    path: req.path,
                    method: req.method
                }
            );
        }
    } catch (monitoringError) {
        // Игнорируем ошибки мониторинга, чтобы не ломать основной функционал
        LoggerService.warn('Failed to update monitoring metrics', {
            requestId: req.requestId,
            error: {
                message: monitoringError.message
            }
        });
    }

    // Отправляем уведомление в Telegram для критических ошибок
    if (statusCode >= 500) {
        (async () => {
            try {
                if (OptimizedTelegramService && OptimizedTelegramService.isInitialized) {
                    await OptimizedTelegramService.sendAlert(
                        'CRITICAL_ERROR',
                        `🚨 <b>КРИТИЧЕСКАЯ ОШИБКА</b>\n\n` +
                        `📝 ${message}\n` +
                        `🔗 ${req.method} ${req.path}\n` +
                        `📊 Код: ${statusCode}\n` +
                        `⏰ ${new Date().toLocaleString('ru-RU')}`,
                        'critical'
                    );
                }
            } catch (telegramError) {
                // Игнорируем ошибки Telegram
                LoggerService.warn('Failed to send Telegram alert', {
                    requestId: req.requestId,
                    error: {
                        message: telegramError.message
                    }
                });
            }
        })();
    }

    // Формируем ответ
    const response = {
        success: false,
        message,
        ...(details && { details }),
        ...(process.env.NODE_ENV === 'development' && {
            stack: err.stack,
            error: err.toString()
        })
    };

    // Отправляем ответ
    res.status(statusCode).json(response);
};

/**
 * Middleware для обработки асинхронных ошибок
 * Обертывает async функции, чтобы автоматически передавать ошибки в errorHandler
 */
export const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

/**
 * Middleware для обработки 404 ошибок
 */
export const notFoundHandler = (req, res, next) => {
    const error = new AppError(`Route ${req.originalUrl} not found`, 404);
    next(error);
};

