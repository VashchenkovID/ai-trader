import MonitoringService from './MonitoringService.js';
import LoggerService from './LoggerService.js';

/**
 * Универсальный сервис для retry логики с экспоненциальной задержкой
 * Поддерживает circuit breaker для недоступных сервисов
 */
class RetryService {
    constructor() {
        this.isInitialized = false;
        
        // Состояния circuit breaker для разных сервисов
        this.circuitBreakers = new Map();
        
        // Статистика retry
        this.stats = new Map();
    }
    
    /**
     * Инициализация сервиса
     */
    async initialize() {
        try {
            this.isInitialized = true;
        } catch (error) {
            LoggerService.error('Ошибка инициализации RetryService', {
                service: 'RetryService',
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
            throw error;
        }
    }
    
    /**
     * Выполнение функции с retry логикой
     * @param {Function} fn - Функция для выполнения
     * @param {Object} options - Опции retry
     * @returns {Promise<any>} - Результат выполнения функции
     */
    async executeWithRetry(fn, options = {}) {
        const {
            maxRetries = 3,
            initialDelay = 1000,        // Начальная задержка в мс
            maxDelay = 30000,            // Максимальная задержка в мс
            exponentialBase = 2,        // База для экспоненциальной задержки
            jitter = true,               // Добавлять случайную задержку (jitter)
            retryableErrors = [],        // Список ошибок, при которых нужно повторять
            retryableStatusCodes = [429, 500, 502, 503, 504], // HTTP коды для retry
            onRetry = null,              // Callback при повторе
            serviceName = 'unknown',     // Имя сервиса для статистики
            circuitBreaker = true,       // Использовать circuit breaker
            requestData = null           // Данные запроса (path, body) для логирования
        } = options;
        
        let lastError = null;
        let attempt = 0;
        
        // Проверяем circuit breaker
        if (circuitBreaker && this.isCircuitOpen(serviceName)) {
            throw new Error(`Circuit breaker is OPEN for service: ${serviceName}. Service is temporarily unavailable.`);
        }
        
        while (attempt <= maxRetries) {
            try {
                const result = await fn();
                
                // Успешное выполнение - сбрасываем circuit breaker
                if (circuitBreaker) {
                    this.recordSuccess(serviceName);
                }
                
                // Обновляем статистику
                this.recordAttempt(serviceName, true, attempt);
                
                return result;
                
            } catch (error) {
                lastError = error;
                attempt++;
                
                // Проверяем, нужно ли повторять
                const shouldRetry = this.shouldRetry(error, attempt, maxRetries, retryableErrors, retryableStatusCodes);
                
                if (!shouldRetry) {
                    // Не повторяем - записываем неудачу
                    if (circuitBreaker) {
                        const errorInfo = {
                            error: error,
                            endpoint: error.config?.url || error.request?.path || error.url || requestData?.path || null,
                            requestData: requestData || null
                        };
                        this.recordFailure(serviceName, errorInfo);
                    }
                    this.recordAttempt(serviceName, false, attempt - 1);
                    throw error;
                }
                
                // Если это последняя попытка, не повторяем
                if (attempt > maxRetries) {
                    if (circuitBreaker) {
                        const errorInfo = {
                            error: error,
                            endpoint: error.config?.url || error.request?.path || error.url || requestData?.path || null,
                            requestData: requestData || null
                        };
                        this.recordFailure(serviceName, errorInfo);
                    }
                    this.recordAttempt(serviceName, false, attempt - 1);
                    throw error;
                }
                
                // Вычисляем задержку с экспоненциальным backoff
                const delay = this.calculateDelay(attempt, initialDelay, maxDelay, exponentialBase, jitter);
                
                // Callback при повторе
                if (onRetry) {
                    onRetry(attempt, delay, error);
                } else {
                    LoggerService.warn(`Retry ${attempt}/${maxRetries} for ${serviceName} after ${delay}ms`, {
                        service: 'RetryService',
                        serviceName,
                        attempt,
                        maxRetries,
                        delay,
                        error: {
                            message: error.message
                        }
                    });
                }
                
                // Ждем перед повтором
                await this.delay(delay);
            }
        }
        
        // Если дошли сюда, все попытки исчерпаны
        if (circuitBreaker) {
            const errorInfo = {
                error: lastError,
                endpoint: lastError?.config?.url || lastError?.request?.path || lastError?.url || requestData?.path || null,
                requestData: requestData || null
            };
            this.recordFailure(serviceName, errorInfo);
        }
        this.recordAttempt(serviceName, false, attempt - 1);
        throw lastError;
    }
    
    /**
     * Определяет, нужно ли повторять запрос
     */
    shouldRetry(error, attempt, maxRetries, retryableErrors, retryableStatusCodes) {
        // Превышено максимальное количество попыток
        if (attempt > maxRetries) {
            return false;
        }
        
        // Проверяем список ошибок для retry
        if (retryableErrors.length > 0) {
            const errorMessage = error.message || error.toString();
            const errorName = error.name || '';
            
            for (const retryableError of retryableErrors) {
                if (typeof retryableError === 'string') {
                    if (errorMessage.includes(retryableError) || errorName.includes(retryableError)) {
                        return true;
                    }
                } else if (retryableError instanceof RegExp) {
                    if (retryableError.test(errorMessage) || retryableError.test(errorName)) {
                        return true;
                    }
                } else if (error instanceof retryableError) {
                    return true;
                }
            }
        }
        
        // Проверяем HTTP статус коды
        if (error.status || error.statusCode || error.response?.status) {
            const statusCode = error.status || error.statusCode || error.response.status;
            if (retryableStatusCodes.includes(statusCode)) {
                return true;
            }
            
            // 4xx ошибки (кроме 429) обычно не повторяем
            if (statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
                return false;
            }
        }
        
        // Проверяем типичные сетевые ошибки
        const errorMessage = (error.message || error.toString()).toLowerCase();
        const networkErrors = [
            'econnrefused',
            'etimedout',
            'enotfound',
            'econnreset',
            'timeout',
            'network error',
            'fetch failed'
        ];
        
        for (const networkError of networkErrors) {
            if (errorMessage.includes(networkError)) {
                return true;
            }
        }
        
        // По умолчанию повторяем для неизвестных ошибок
        return true;
    }
    
    /**
     * Вычисляет задержку с экспоненциальным backoff
     */
    calculateDelay(attempt, initialDelay, maxDelay, exponentialBase, jitter) {
        // Экспоненциальная задержка: initialDelay * (base ^ attempt)
        let delay = initialDelay * Math.pow(exponentialBase, attempt - 1);
        
        // Ограничиваем максимальной задержкой
        delay = Math.min(delay, maxDelay);
        
        // Добавляем jitter (случайную задержку) для предотвращения thundering herd
        if (jitter) {
            const jitterAmount = delay * 0.1; // 10% jitter
            delay = delay + (Math.random() * jitterAmount * 2 - jitterAmount);
        }
        
        return Math.floor(delay);
    }
    
    /**
     * Задержка на указанное время
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Circuit Breaker: проверка, открыт ли circuit
     */
    isCircuitOpen(serviceName) {
        const breaker = this.circuitBreakers.get(serviceName);
        if (!breaker) {
            return false;
        }
        
        // Если circuit открыт, проверяем, не прошло ли достаточно времени для полуоткрытого состояния
        if (breaker.state === 'open') {
            const timeSinceOpen = Date.now() - breaker.openedAt;
            const timeout = breaker.timeout || 60000; // 1 минута по умолчанию
            
            if (timeSinceOpen >= timeout) {
                // Переходим в полуоткрытое состояние
                breaker.state = 'half-open';
                breaker.halfOpenAttempts = 0;
                return false;
            }
            
            return true;
        }
        
        return false;
    }
    
    /**
     * Circuit Breaker: запись успешного запроса
     */
    recordSuccess(serviceName) {
        let breaker = this.circuitBreakers.get(serviceName);
        
        if (!breaker) {
            breaker = {
                state: 'closed',
                failures: 0,
                successes: 0,
                lastFailure: null,
                openedAt: null,
                timeout: 60000,
                failureThreshold: 5,
                halfOpenAttempts: 0
            };
            this.circuitBreakers.set(serviceName, breaker);
        }
        
        if (breaker.state === 'half-open') {
            // Успешный запрос в полуоткрытом состоянии - закрываем circuit
            breaker.state = 'closed';
            breaker.failures = 0;
            breaker.halfOpenAttempts = 0;
        } else {
            breaker.successes++;
            // Сбрасываем счетчик ошибок при успешных запросах
            if (breaker.failures > 0) {
                breaker.failures = Math.max(0, breaker.failures - 1);
            }
        }
    }
    
    /**
     * Circuit Breaker: запись неудачного запроса
     */
    recordFailure(serviceName, errorInfo = null) {
        let breaker = this.circuitBreakers.get(serviceName);
        
        if (!breaker) {
            breaker = {
                state: 'closed',
                failures: 0,
                successes: 0,
                lastFailure: null,
                openedAt: null,
                timeout: 60000,
                failureThreshold: 5,
                halfOpenAttempts: 0,
                lastError: null,
                lastEndpoint: null,
                lastRequestData: null
            };
            this.circuitBreakers.set(serviceName, breaker);
        }
        
        breaker.failures++;
        breaker.lastFailure = Date.now();
        
        // Сохраняем информацию об ошибке, эндпоинте и данных запроса
        if (errorInfo) {
            breaker.lastError = errorInfo.error?.message || errorInfo.error?.toString() || 'Unknown error';
            breaker.lastEndpoint = errorInfo.endpoint || errorInfo.url || null;
            breaker.lastRequestData = errorInfo.requestData || null;
        }
        
        if (breaker.state === 'half-open') {
            // Неудача в полуоткрытом состоянии - снова открываем
            breaker.state = 'open';
            breaker.openedAt = Date.now();
            LoggerService.warn(`Circuit breaker для ${serviceName} снова открыт после неудачи в HALF-OPEN`, {
                service: 'RetryService',
                serviceName,
                state: 'open',
                reason: 'half-open-failure',
                endpoint: breaker.lastEndpoint,
                error: breaker.lastError
            });
        } else if (breaker.failures >= breaker.failureThreshold) {
            // Превышен порог ошибок - открываем circuit
            breaker.state = 'open';
            breaker.openedAt = Date.now();
            LoggerService.warn(`Circuit breaker для ${serviceName} открыт (${breaker.failures} ошибок подряд)`, {
                service: 'RetryService',
                serviceName,
                state: 'open',
                failures: breaker.failures,
                threshold: breaker.failureThreshold,
                endpoint: breaker.lastEndpoint,
                error: breaker.lastError
            });
            
            // Создаем алерт с информацией об эндпоинте, данных запроса и ошибке
            const alertDetails = {
                service: serviceName,
                failures: breaker.failures,
                threshold: breaker.failureThreshold
            };
            
            if (breaker.lastEndpoint) {
                alertDetails.endpoint = breaker.lastEndpoint;
            }
            
            if (breaker.lastRequestData) {
                alertDetails.requestData = breaker.lastRequestData;
            }
            
            if (breaker.lastError) {
                alertDetails.error = breaker.lastError;
            }
            
            const alert = MonitoringService.createAlert(
                'external_api',
                'high',
                `Circuit breaker открыт для ${serviceName}. Сервис временно недоступен.`,
                alertDetails
            );
            
            // При ошибке MONITORING_EXTERNAL_API блокируем запросы на 5 минут
            // Увеличиваем timeout circuit breaker до 5 минут (300000 мс)
            breaker.timeout = 5 * 60 * 1000; // 5 минут
            breaker.openedAt = Date.now(); // Обновляем время открытия
        }
    }
    
    /**
     * Запись статистики попытки
     */
    recordAttempt(serviceName, success, attemptNumber) {
        if (!this.stats.has(serviceName)) {
            this.stats.set(serviceName, {
                total: 0,
                successful: 0,
                failed: 0,
                retries: 0,
                averageAttempts: 0
            });
        }
        
        const stats = this.stats.get(serviceName);
        stats.total++;
        
        if (success) {
            stats.successful++;
        } else {
            stats.failed++;
        }
        
        if (attemptNumber > 1) {
            stats.retries += attemptNumber - 1;
        }
        
        // Обновляем среднее количество попыток
        stats.averageAttempts = stats.total > 0 
            ? ((stats.averageAttempts * (stats.total - 1)) + attemptNumber) / stats.total 
            : attemptNumber;
    }
    
    /**
     * Получение статистики для сервиса
     */
    getStats(serviceName) {
        return this.stats.get(serviceName) || {
            total: 0,
            successful: 0,
            failed: 0,
            retries: 0,
            averageAttempts: 0
        };
    }
    
    /**
     * Получение состояния circuit breaker
     */
    getCircuitBreakerState(serviceName) {
        const breaker = this.circuitBreakers.get(serviceName);
        if (!breaker) {
            return {
                state: 'closed',
                failures: 0,
                successes: 0
            };
        }
        
        return {
            state: breaker.state,
            failures: breaker.failures,
            successes: breaker.successes,
            lastFailure: breaker.lastFailure,
            openedAt: breaker.openedAt
        };
    }
    
    /**
     * Сброс circuit breaker для сервиса
     */
    resetCircuitBreaker(serviceName) {
        this.circuitBreakers.delete(serviceName);
    }
    
    /**
     * Установка timeout для circuit breaker сервиса
     * Используется для блокировки запросов на определенное время при критических ошибках
     */
    setCircuitBreakerTimeout(serviceName, timeoutMs) {
        const breaker = this.circuitBreakers.get(serviceName);
        if (breaker) {
            breaker.timeout = timeoutMs;
            if (breaker.state === 'open') {
                breaker.openedAt = Date.now(); // Обновляем время открытия для применения нового timeout
            }
            LoggerService.info(`Circuit breaker timeout для ${serviceName} установлен на ${timeoutMs / 1000} секунд`, {
                service: 'RetryService',
                serviceName,
                timeout: timeoutMs
            });
        }
    }
    
    /**
     * Получение всех статистик
     */
    getAllStats() {
        const result = {};
        for (const [serviceName, stats] of this.stats.entries()) {
            result[serviceName] = {
                ...stats,
                successRate: stats.total > 0 ? (stats.successful / stats.total * 100).toFixed(2) + '%' : '0%',
                circuitBreaker: this.getCircuitBreakerState(serviceName)
            };
        }
        return result;
    }
}

export default new RetryService();

