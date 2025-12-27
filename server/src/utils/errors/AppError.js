/**
 * Базовый класс для всех кастомных ошибок приложения
 */
export class AppError extends Error {
    constructor(message, statusCode = 500, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Ошибка валидации (400)
 */
export class ValidationError extends AppError {
    constructor(message, details = null) {
        super(message, 400);
        this.details = details;
        this.type = 'validation';
    }
}

/**
 * Ошибка аутентификации (401)
 */
export class AuthenticationError extends AppError {
    constructor(message = 'Authentication required') {
        super(message, 401);
        this.type = 'authentication';
    }
}

/**
 * Ошибка авторизации (403)
 */
export class AuthorizationError extends AppError {
    constructor(message = 'Access denied') {
        super(message, 403);
        this.type = 'authorization';
    }
}

/**
 * Ошибка "Не найдено" (404)
 */
export class NotFoundError extends AppError {
    constructor(resource = 'Resource') {
        super(`${resource} not found`, 404);
        this.type = 'not_found';
    }
}

/**
 * Ошибка конфликта (409)
 */
export class ConflictError extends AppError {
    constructor(message) {
        super(message, 409);
        this.type = 'conflict';
    }
}

/**
 * Ошибка базы данных (500)
 */
export class DatabaseError extends AppError {
    constructor(message, originalError = null) {
        super(message || 'Database operation failed', 500);
        this.type = 'database';
        this.originalError = originalError;
    }
}

/**
 * Ошибка внешнего API (502)
 */
export class ExternalApiError extends AppError {
    constructor(service, message, originalError = null) {
        super(`External API error (${service}): ${message}`, 502);
        this.type = 'external_api';
        this.service = service;
        this.originalError = originalError;
    }
}

/**
 * Ошибка таймаута (504)
 */
export class TimeoutError extends AppError {
    constructor(operation = 'Operation') {
        super(`${operation} timed out`, 504);
        this.type = 'timeout';
    }
}

