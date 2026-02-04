import winston from 'winston';
import path from 'path';
import {fileURLToPath} from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Централизованный сервис логирования
 * Обеспечивает структурированное логирование с контекстом, трассировкой запросов и ротацией
 */
class LoggerService {
    constructor() {
        this.isInitialized = false;
        this.logger = null;
        this.requestIdGenerator = null;
        this.contextStore = new Map(); // Хранилище контекста для каждого запроса
    }

    /**
     * Инициализация сервиса
     */
    initialize() {
        try {
            // Создаем директорию для логов если её нет
            const logDir = path.join(__dirname, '../../logs');
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, {recursive: true});
            }

            // Функция для ограничения размера логируемых объектов
            const sanitizeMeta = (obj, maxDepth = 3, maxSize = 10000) => {
                if (!obj || typeof obj !== 'object') {
                    return obj;
                }

                try {
                    const jsonStr = JSON.stringify(obj);
                    if (jsonStr.length <= maxSize) {
                        return obj;
                    }
                } catch (e) {
                    // Если не удалось сериализовать, возвращаем упрощенную версию
                }

                const sanitize = (value, depth = 0) => {
                    if (depth > maxDepth) {
                        return '[Max depth reached]';
                    }

                    if (value === null || value === undefined) {
                        return value;
                    }

                    if (typeof value === 'string') {
                        return value.length > 500 ? value.substring(0, 500) + '...[truncated]' : value;
                    }

                    if (typeof value !== 'object') {
                        return value;
                    }

                    if (Array.isArray(value)) {
                        if (value.length > 10) {
                            return value.slice(0, 10).map(item => sanitize(item, depth + 1)).concat([`...[${value.length - 10} more items]`]);
                        }
                        return value.map(item => sanitize(item, depth + 1));
                    }

                    // Для объектов - фильтруем большие вложенные структуры
                    const result = {};
                    for (const key in value) {
                        if (Object.prototype.hasOwnProperty.call(value, key)) {
                            // Пропускаем большие объекты конфигурации моделей
                            if (key === 'config' || key === 'architecture' || key === 'model' || key === 'weights' || 
                                key === 'layers' || key === 'kernel_initializer' || key === 'bias_initializer' ||
                                key === 'activity_regularizer' || key === 'class_name') {
                                result[key] = '[Large object - skipped]';
                                continue;
                            }
                            
                            try {
                                const jsonValue = JSON.stringify(value[key]);
                                if (jsonValue.length > 1000) {
                                    result[key] = '[Large value - truncated]';
                                } else {
                                    result[key] = sanitize(value[key], depth + 1);
                                }
                            } catch (e) {
                                result[key] = '[Non-serializable]';
                            }
                        }
                    }
                    return result;
                };

                return sanitize(obj);
            };

            // Настраиваем формат логов
            const logFormat = winston.format.combine(
                winston.format.timestamp({format: 'YYYY-MM-DD HH:mm:ss.SSS'}),
                winston.format.errors({stack: true}),
                winston.format.splat(),
                // Убираем winston.format.json() отсюда, чтобы очистка происходила до сериализации
                winston.format.printf((info) => {
                    const {timestamp, level, message, ...meta} = info;

                    // Очищаем метаданные от больших объектов ПЕРЕД сериализацией
                    const sanitizedMeta = sanitizeMeta(meta);

                    // Формируем базовый объект лога
                    const logEntry = {
                        timestamp,
                        level,
                        message,
                        ...sanitizedMeta
                    };

                    // В production возвращаем JSON, в development - читаемый формат
                    if (process.env.NODE_ENV !== 'production') {
                        // Сериализуем только после очистки
                        try {
                            return JSON.stringify(logEntry);
                        } catch (e) {
                            // Если не удалось сериализовать, возвращаем упрощенную версию
                            return JSON.stringify({
                                timestamp,
                                level,
                                message,
                                error: 'Failed to serialize log entry'
                            });
                        }
                    } else {
                        // Читаемый формат для разработки
                        let output = `${timestamp} [${level.toUpperCase()}] ${message}`;
                        if (Object.keys(sanitizedMeta).length > 0 && sanitizedMeta.constructor === Object) {
                            try {
                                const metaStr = JSON.stringify(sanitizedMeta, null, 2);
                                if (metaStr !== '{}') {
                                    output += `\n${metaStr}`;
                                }
                            } catch (e) {
                                // Игнорируем ошибки сериализации
                            }
                        }
                        return output;
                    }
                })
            );

            // Создаем транспорты с ротацией по размеру
            const transports = [
                // Все логи с ротацией по размеру
                // В production: только warn и error
                // В development: info и выше
                new winston.transports.File({
                    filename: path.join(logDir, 'combined.log'),
                    maxsize: 20 * 1024 * 1024, // 20MB
                    maxFiles: 14, // Хранить 14 файлов (14 дней при 20MB в день)
                    format: logFormat,
                    level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
                    tailable: true // Старые файлы переименовываются в combined.log.1, combined.log.2 и т.д.
                }),

                // Ошибки с ротацией по размеру
                new winston.transports.File({
                    filename: path.join(logDir, 'error.log'),
                    maxsize: 20 * 1024 * 1024, // 20MB
                    maxFiles: 30, // Хранить 30 файлов
                    format: logFormat,
                    level: 'error',
                    tailable: true
                })
            ];

            // В консоль выводим только предупреждения и ошибки (warn, error)
            // В production: только warn и error в консоль
            // В development: warn и error в консоль, info и debug только в файлы
            transports.push(
                new winston.transports.Console({
                    level: 'warn', // Только warn и error в консоль (всегда)
                    format: winston.format.combine(
                        winston.format.colorize(),
                        winston.format.printf((info) => {
                            const {timestamp, level, message, ...meta} = info;
                            let output = `${timestamp} [${level}] ${message}`;

                            // Добавляем контекст если есть
                            if (meta.requestId) {
                                output = `[${meta.requestId}] ${output}`;
                            }
                            if (meta.service) {
                                output = `[${meta.service}] ${output}`;
                            }
                            if (meta.userId) {
                                output = `[user:${meta.userId}] ${output}`;
                            }

                            // Добавляем метаданные если есть (с ограничением размера)
                            if (Object.keys(meta).length > 0) {
                                const relevantMeta = {...meta};
                                delete relevantMeta.requestId;
                                delete relevantMeta.service;
                                delete relevantMeta.userId;
                                
                                // Фильтруем большие объекты
                                const sanitizeMeta = (obj) => {
                                    if (!obj || typeof obj !== 'object') return obj;
                                    const result = {};
                                    for (const key in obj) {
                                        if (Object.prototype.hasOwnProperty.call(obj, key)) {
                                            // Пропускаем большие объекты конфигурации моделей
                                            if (key === 'config' || key === 'architecture' || key === 'model' || key === 'weights' || 
                                                key === 'layers' || key === 'kernel_initializer' || key === 'bias_initializer' ||
                                                key === 'activity_regularizer' || key === 'class_name') {
                                                continue;
                                            }
                                            
                                            try {
                                                const jsonValue = JSON.stringify(obj[key]);
                                                if (jsonValue.length > 1000) {
                                                    result[key] = '[Large value - truncated]';
                                                } else {
                                                    result[key] = obj[key];
                                                }
                                            } catch (e) {
                                                result[key] = '[Non-serializable]';
                                            }
                                        }
                                    }
                                    return result;
                                };
                                
                                const sanitized = sanitizeMeta(relevantMeta);
                                if (Object.keys(sanitized).length > 0) {
                                    try {
                                        const metaStr = JSON.stringify(sanitized, null, 2);
                                        // Ограничиваем общую длину вывода метаданных в консоль
                                        const maxMetaLength = 2000;
                                        const truncatedMetaStr = metaStr.length > maxMetaLength 
                                            ? metaStr.substring(0, maxMetaLength) + '\n...[truncated]' 
                                            : metaStr;
                                        output += `\n${truncatedMetaStr}`;
                                    } catch (e) {
                                        output += '\n[Failed to serialize meta]';
                                    }
                                }
                            }

                            return output;
                        })
                    )
                })
            );

            // Определяем уровень логирования
            // В production: только warn и error (в консоль и файлы)
            // В development: info и выше (в файлы), warn и error (в консоль)
            const isProduction = process.env.NODE_ENV === 'production';
            const logLevel = process.env.LOG_LEVEL || (isProduction ? 'warn' : 'info');
            
            // Создаем логгер
            this.logger = winston.createLogger({
                level: logLevel,
                format: logFormat,
                defaultMeta: {
                    service: 'ai-trader',
                    environment: process.env.NODE_ENV || 'development'
                },
                transports: transports,
                exceptionHandlers: [
                    new winston.transports.File({
                        filename: path.join(logDir, 'exceptions.log'),
                        maxsize: 20 * 1024 * 1024,
                        maxFiles: 30,
                        tailable: true
                    })
                ],
                rejectionHandlers: [
                    new winston.transports.File({
                        filename: path.join(logDir, 'rejections.log'),
                        maxsize: 20 * 1024 * 1024,
                        maxFiles: 30,
                        tailable: true
                    })
                ]
            });

            // Генератор requestId
            this.requestIdGenerator = () => {
                return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            };

            this.isInitialized = true;

            // Логируем инициализацию (только в файл, не в консоль)
            this.info('LoggerService initialized', {
                service: 'LoggerService',
                logLevel: this.logger.level,
                environment: process.env.NODE_ENV || 'development'
            });
        } catch (error) {
            console.error('❌ Ошибка инициализации LoggerService:', error);
            throw error;
        }
    }

    /**
     * Создание дочернего логгера с контекстом
     */
    child(context = {}) {
        if (!this.isInitialized) {
            // Fallback на console если сервис не инициализирован
            return {
                error: (...args) => console.error(...args),
                warn: (...args) => console.warn(...args),
                info: () => {},
                debug: () => {},
                verbose: () => {},
            };
        }

        return {
            error: (message, meta = {}) => this.error(message, {...context, ...meta}),
            warn: (message, meta = {}) => this.warn(message, {...context, ...meta}),
            info: (message, meta = {}) => this.info(message, {...context, ...meta}),
            debug: (message, meta = {}) => this.debug(message, {...context, ...meta}),
            verbose: (message, meta = {}) => this.verbose(message, {...context, ...meta})
        };
    }

    /**
     * Установка контекста для текущего запроса
     */
    setContext(requestId, context = {}) {
        this.contextStore.set(requestId, context);
    }

    /**
     * Получение контекста для текущего запроса
     */
    getContext(requestId) {
        return this.contextStore.get(requestId) || {};
    }

    /**
     * Очистка контекста после завершения запроса
     */
    clearContext(requestId) {
        this.contextStore.delete(requestId);
    }

    /**
     * Ограничивает длину строки
     */
    _truncateString(str, maxLength = 500) {
        if (typeof str !== 'string') return str;
        if (str.length <= maxLength) return str;
        return str.substring(0, maxLength) + '...[truncated]';
    }

    /**
     * Ограничивает размер объекта ошибки
     */
    _sanitizeError(error) {
        if (!error) return error;
        
        const maxMessageLength = 500;
        const maxStackLength = 1000;
        
        const sanitized = {
            name: error.name,
            message: this._truncateString(error.message || String(error), maxMessageLength),
        };
        
        if (error.stack) {
            sanitized.stack = this._truncateString(error.stack, maxStackLength);
        }
        
        // Добавляем другие свойства ошибки, но ограничиваем их размер
        for (const key in error) {
            if (key !== 'name' && key !== 'message' && key !== 'stack') {
                const value = error[key];
                if (typeof value === 'string') {
                    sanitized[key] = this._truncateString(value, 200);
                } else {
                    sanitized[key] = value;
                }
            }
        }
        
        return sanitized;
    }

    /**
     * Логирование с автоматическим добавлением контекста и маскированием секретов
     */
    async _log(level, message, meta = {}) {
        // Ограничиваем длину сообщения
        const maxMessageLength = 1000;
        if (typeof message === 'string' && message.length > maxMessageLength) {
            message = message.substring(0, maxMessageLength) + '...[truncated]';
        }
        
        if (!this.isInitialized) {
            // Fallback на console если сервис не инициализирован
            const consoleMethod = level === 'error' ? console.error : undefined

            // Маскируем секреты даже в fallback режиме
            try {
                const SecretManagementService = (await import('./SecretManagementService.js')).default;
                if (SecretManagementService && SecretManagementService.isInitialized) {
                    message = SecretManagementService.maskSecretsInString(message);
                    meta = SecretManagementService.maskSecretsInObject(meta);
                }
            } catch (error) {
                // Игнорируем ошибки при маскировании в fallback режиме
            }
            
            // Обрабатываем ошибки в meta
            if (meta.error) {
                meta.error = this._sanitizeError(meta.error);
            }
            
            if (!!consoleMethod) {
                consoleMethod(`[${level.toUpperCase()}] ${message}`, meta);
            }
            return;
        }

        // Добавляем контекст из requestId если есть
        if (meta.requestId) {
            const context = this.getContext(meta.requestId);
            meta = {...context, ...meta};
        }

        // Обрабатываем ошибки в meta - ограничиваем их размер
        if (meta.error) {
            meta.error = this._sanitizeError(meta.error);
        }
        
        // Обрабатываем все строковые значения в meta - ограничиваем их размер
        const sanitizeMetaValues = (obj, maxLength = 500) => {
            if (!obj || typeof obj !== 'object') return obj;
            const result = {};
            for (const key in obj) {
                if (Object.prototype.hasOwnProperty.call(obj, key)) {
                    if (key === 'error') {
                        // Ошибки уже обработаны выше
                        result[key] = obj[key];
                    } else if (typeof obj[key] === 'string') {
                        result[key] = this._truncateString(obj[key], maxLength);
                    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                        // Рекурсивно обрабатываем вложенные объекты, но ограничиваем глубину
                        try {
                            const jsonStr = JSON.stringify(obj[key]);
                            if (jsonStr.length > 1000) {
                                result[key] = '[Large object - truncated]';
                            } else {
                                result[key] = sanitizeMetaValues(obj[key], maxLength);
                            }
                        } catch (e) {
                            result[key] = '[Non-serializable]';
                        }
                    } else {
                        result[key] = obj[key];
                    }
                }
            }
            return result;
        };
        
        meta = sanitizeMetaValues(meta);

        // Маскируем секреты перед логированием
        try {
            const SecretManagementService = (await import('./SecretManagementService.js')).default;
            if (SecretManagementService && SecretManagementService.isInitialized) {
                message = SecretManagementService.maskSecretsInString(message);
                meta = SecretManagementService.maskSecretsInObject(meta);
            }
        } catch (error) {
            // Если SecretManagementService не доступен, логируем без маскирования
            // но предупреждаем об этом
            if (level === 'error') {
                console.warn('⚠️ SecretManagementService не доступен для маскирования секретов');
            }
        }

        this.logger.log(level, message, meta);
    }

    /**
     * Логирование ошибки
     */
    error(message, meta = {}) {
        this._log('error', message, meta).catch(err => {
            console.error('Ошибка при логировании:', err);
        });
    }

    /**
     * Логирование предупреждения
     */
    warn(message, meta = {}) {
        this._log('warn', message, meta).catch(err => {
            console.error('Ошибка при логировании:', err);
        });
    }

    /**
     * Логирование информации
     */
    info(message, meta = {}) {
        this._log('info', message, meta).catch(err => {
            console.error('Ошибка при логировании:', err);
        });
    }

    /**
     * Логирование отладки
     */
    debug(message, meta = {}) {
        this._log('debug', message, meta).catch(err => {
            console.error('Ошибка при логировании:', err);
        });
    }

    /**
     * Логирование подробной информации
     */
    verbose(message, meta = {}) {
        this._log('verbose', message, meta).catch(err => {
            console.error('Ошибка при логировании:', err);
        });
    }

    /**
     * Логирование HTTP запроса
     */
    logRequest(req, res, duration = null) {
        if (!this.isInitialized) return;

        const requestId = req.requestId || 'unknown';
        const method = req.method;
        const path = req.path || req.url;
        const statusCode = res.statusCode;
        const ip = req.ip || req.connection?.remoteAddress || 'unknown';
        const userAgent = req.get('user-agent') || 'unknown';

        // В production логируем только ошибки и предупреждения
        // В development логируем все запросы
        const isProduction = process.env.NODE_ENV === 'production';
        const level = statusCode >= 500 ? 'error' :
            statusCode >= 400 ? 'warn' : (isProduction ? null : 'info');
        
        // В production пропускаем успешные запросы (info)
        if (isProduction && level === null) {
            return;
        }

        // Используем замаскированные данные если они доступны (через middleware secretMasking)
        const body = req._maskedBody !== undefined ? req._maskedBody : req.body;
        const query = req._maskedQuery !== undefined ? req._maskedQuery : req.query;
        const params = req._maskedParams !== undefined ? req._maskedParams : req.params;

        const meta = {
            requestId,
            method,
            path,
            statusCode,
            ip,
            userAgent,
            duration: duration ? `${duration.toFixed(2)}ms` : null
        };

        // Добавляем замаскированные данные в метаданные только если они есть
        if (body && Object.keys(body).length > 0) {
            meta.body = body;
        }
        if (query && Object.keys(query).length > 0) {
            meta.query = query;
        }
        if (params && Object.keys(params).length > 0) {
            meta.params = params;
        }

        // Добавляем userId если есть
        if (req.user?.id) {
            meta.userId = req.user.id;
        }

        this._log(level, `${method} ${path} ${statusCode}`, meta);
    }

    /**
     * Логирование ошибки запроса
     */
    logRequestError(error, req) {
        if (!this.isInitialized) return;

        const requestId = req.requestId || 'unknown';
        const method = req.method;
        const path = req.path || req.url;

        // Ограничиваем длину сообщения об ошибке
        const maxMessageLength = 500;
        const maxStackLength = 1000;
        
        const errorMessage = error.message || String(error);
        const truncatedMessage = errorMessage.length > maxMessageLength 
            ? errorMessage.substring(0, maxMessageLength) + '...[truncated]' 
            : errorMessage;
        
        const errorStack = error.stack || '';
        const truncatedStack = errorStack.length > maxStackLength 
            ? errorStack.substring(0, maxStackLength) + '...[truncated]' 
            : errorStack;

        this.error(`Request error: ${method} ${path}`, {
            requestId,
            method,
            path,
            error: {
                message: truncatedMessage,
                stack: truncatedStack || undefined,
                name: error.name
            },
            ...(req.user?.id && {userId: req.user.id})
        });
    }

    /**
     * Логирование медленного запроса
     */
    logSlowRequest(req, duration) {
        if (!this.isInitialized) return;

        const requestId = req.requestId || 'unknown';
        const method = req.method;
        const path = req.path || req.url;

        this.warn(`Slow request: ${method} ${path}`, {
            requestId,
            method,
            path,
            duration: `${duration.toFixed(2)}ms`,
            threshold: '1000ms'
        });
    }

    /**
     * Логирование операции с БД
     */
    logDatabase(operation, meta = {}) {
        if (!this.isInitialized) return;

        this.debug(`Database: ${operation}`, {
            service: 'Database',
            ...meta
        });
    }

    /**
     * Логирование операции с внешним API
     */
    logApiCall(service, endpoint, method, duration = null, meta = {}) {
        if (!this.isInitialized) return;

        // В production логируем только медленные запросы (warn) и ошибки
        // В development логируем все запросы
        const isProduction = process.env.NODE_ENV === 'production';
        const level = duration && duration > 5000 ? 'warn' : (isProduction ? null : 'info');
        
        // В production пропускаем быстрые успешные запросы (info)
        if (isProduction && level === null) {
            return;
        }

        this._log(level, `API call: ${service} ${method} ${endpoint}`, {
            service: 'ExternalAPI',
            apiService: service,
            endpoint,
            method,
            duration: duration ? `${duration.toFixed(2)}ms` : null,
            ...meta
        });
    }

    /**
     * Логирование критической ошибки
     */
    logCritical(message, meta = {}) {
        this.error(message, {
            ...meta,
            critical: true,
            severity: 'critical'
        });
    }

    /**
     * Получение статистики логирования
     */
    getStats() {
        // Winston не предоставляет встроенной статистики
        // Можно добавить кастомную статистику если нужно
        return {
            isInitialized: this.isInitialized,
            logLevel: this.logger?.level || 'unknown',
            activeContexts: this.contextStore.size
        };
    }
}

// Создаем singleton
const loggerService = new LoggerService();

export default loggerService;

