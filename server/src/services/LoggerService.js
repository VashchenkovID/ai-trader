import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';
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
            console.log('🚀 Инициализация LoggerService...');
            
            // Создаем директорию для логов если её нет
            const logDir = path.join(__dirname, '../../logs');
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }
            
            // Настраиваем формат логов
            const logFormat = winston.format.combine(
                winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
                winston.format.errors({ stack: true }),
                winston.format.splat(),
                winston.format.json(),
                winston.format.printf((info) => {
                    const { timestamp, level, message, ...meta } = info;
                    
                    // Формируем базовый объект лога
                    const logEntry = {
                        timestamp,
                        level,
                        message,
                        ...meta
                    };
                    
                    // В production возвращаем JSON, в development - читаемый формат
                    if (process.env.NODE_ENV === 'production') {
                        return JSON.stringify(logEntry);
                    } else {
                        // Читаемый формат для разработки
                        let output = `${timestamp} [${level.toUpperCase()}] ${message}`;
                        if (Object.keys(meta).length > 0 && meta.constructor === Object) {
                            const metaStr = JSON.stringify(meta, null, 2);
                            if (metaStr !== '{}') {
                                output += `\n${metaStr}`;
                            }
                        }
                        return output;
                    }
                })
            );
            
            // Создаем транспорты с ротацией по размеру
            const transports = [
                // Все логи с ротацией по размеру
                new winston.transports.File({
                    filename: path.join(logDir, 'combined.log'),
                    maxsize: 20 * 1024 * 1024, // 20MB
                    maxFiles: 14, // Хранить 14 файлов (14 дней при 20MB в день)
                    format: logFormat,
                    level: 'info',
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
            
            // В режиме разработки также выводим в консоль
            if (process.env.NODE_ENV !== 'production') {
                transports.push(
                    new winston.transports.Console({
                        format: winston.format.combine(
                            winston.format.colorize(),
                            winston.format.printf((info) => {
                                const { timestamp, level, message, ...meta } = info;
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
                                
                                // Добавляем метаданные если есть
                                if (Object.keys(meta).length > 0) {
                                    const relevantMeta = { ...meta };
                                    delete relevantMeta.requestId;
                                    delete relevantMeta.service;
                                    delete relevantMeta.userId;
                                    if (Object.keys(relevantMeta).length > 0) {
                                        output += `\n${JSON.stringify(relevantMeta, null, 2)}`;
                                    }
                                }
                                
                                return output;
                            })
                        )
                    })
                );
            }
            
            // Создаем логгер
            this.logger = winston.createLogger({
                level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
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
            console.log('✅ LoggerService инициализирован');
            
            // Логируем инициализацию
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
                info: (...args) => console.log(...args),
                debug: (...args) => console.log(...args),
                verbose: (...args) => console.log(...args)
            };
        }
        
        return {
            error: (message, meta = {}) => this.error(message, { ...context, ...meta }),
            warn: (message, meta = {}) => this.warn(message, { ...context, ...meta }),
            info: (message, meta = {}) => this.info(message, { ...context, ...meta }),
            debug: (message, meta = {}) => this.debug(message, { ...context, ...meta }),
            verbose: (message, meta = {}) => this.verbose(message, { ...context, ...meta })
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
     * Логирование с автоматическим добавлением контекста
     */
    _log(level, message, meta = {}) {
        if (!this.isInitialized) {
            // Fallback на console если сервис не инициализирован
            const consoleMethod = level === 'error' ? console.error : 
                                 level === 'warn' ? console.warn : console.log;
            consoleMethod(`[${level.toUpperCase()}] ${message}`, meta);
            return;
        }
        
        // Добавляем контекст из requestId если есть
        if (meta.requestId) {
            const context = this.getContext(meta.requestId);
            meta = { ...context, ...meta };
        }
        
        this.logger.log(level, message, meta);
    }
    
    /**
     * Логирование ошибки
     */
    error(message, meta = {}) {
        this._log('error', message, meta);
    }
    
    /**
     * Логирование предупреждения
     */
    warn(message, meta = {}) {
        this._log('warn', message, meta);
    }
    
    /**
     * Логирование информации
     */
    info(message, meta = {}) {
        this._log('info', message, meta);
    }
    
    /**
     * Логирование отладки
     */
    debug(message, meta = {}) {
        this._log('debug', message, meta);
    }
    
    /**
     * Логирование подробной информации
     */
    verbose(message, meta = {}) {
        this._log('verbose', message, meta);
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
        
        const level = statusCode >= 500 ? 'error' : 
                     statusCode >= 400 ? 'warn' : 'info';
        
        const meta = {
            requestId,
            method,
            path,
            statusCode,
            ip,
            userAgent,
            duration: duration ? `${duration.toFixed(2)}ms` : null
        };
        
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
        
        this.error(`Request error: ${method} ${path}`, {
            requestId,
            method,
            path,
            error: {
                message: error.message,
                stack: error.stack,
                name: error.name
            },
            ...(req.user?.id && { userId: req.user.id })
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
        
        const level = duration && duration > 5000 ? 'warn' : 'info';
        
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

