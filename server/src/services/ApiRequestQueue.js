/**
 * Централизованная очередь API запросов
 * Координирует все запросы к внешним API для избежания rate limiting
 * и оптимизации использования ресурсов
 */

class ApiRequestQueue {
    constructor() {
        this.isInitialized = false;
        // Очередь запросов: массив объектов { priority, requestFn, type, resolve, reject }
        this.queue = [];
        // Активные запросы: Map<requestId, requestData>
        this.activeRequests = new Map();
        // Приоритеты типов запросов (чем выше число, тем выше приоритет)
        this.priorities = {
            // Критичные запросы (высокий приоритет)
            'portfolio_prices': 100,
            'trading_request_status': 100,
            'active_signal_price': 90,
            'order_execution': 100,
            
            // Обычные запросы (средний приоритет)
            'price_update': 70,
            'candles': 60,
            'instruments': 50,
            'last_prices': 70,
            
            // Фоновые запросы (низкий приоритет)
            'options_data': 30,
            'fundamental_data': 20,
            'news': 25,
        };
        
        // Rate limiting настройки
        this.rateLimiter = {
            // Token bucket для rate limiting
            tokens: 20, // Текущее количество токенов
            maxTokens: 20, // Максимальное количество токенов
            refillRate: 10, // Токенов в секунду
            lastRefill: Date.now()
        };
        
        // Батчинг запросов
        this.batchProcessor = {
            batches: new Map(), // type -> { requests: [], timer: null }
            batchDelay: 500, // Задержка перед обработкой батча (мс)
            maxBatchSize: 50 // Максимальный размер батча
        };
        
        // Флаг обработки очереди
        this.isProcessing = false;
        // Счетчик запросов
        this.requestCounter = 0;
        
        // Статистика
        this.stats = {
            totalRequests: 0,
            queuedRequests: 0,
            batchedRequests: 0,
            rateLimitErrors: 0,
            averageWaitTime: 0
        };
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        // Запускаем обработку очереди
        this.startQueueProcessor();
        
        // Запускаем refill токенов
        this.startTokenRefill();
        
        this.isInitialized = true;
        console.log('✅ ApiRequestQueue initialized');
    }

    /**
     * Запуск процесса пополнения токенов
     * @private
     */
    startTokenRefill() {
        setInterval(() => {
            const now = Date.now();
            const elapsed = (now - this.rateLimiter.lastRefill) / 1000; // секунды
            const tokensToAdd = Math.floor(elapsed * this.rateLimiter.refillRate);
            
            this.rateLimiter.tokens = Math.min(
                this.rateLimiter.maxTokens,
                this.rateLimiter.tokens + tokensToAdd
            );
            this.rateLimiter.lastRefill = now;
        }, 1000); // Проверяем каждую секунду
    }

    /**
     * Получить приоритет запроса по типу
     * @param {string} requestType - Тип запроса
     * @returns {number} Приоритет (по умолчанию 50)
     */
    getPriority(requestType) {
        return this.priorities[requestType] || 50;
    }

    /**
     * Добавить запрос в очередь
     * @param {Function} requestFn - Функция для выполнения запроса (async функция)
     * @param {string} requestType - Тип запроса
     * @param {Object} options - Опции запроса
     * @param {number} options.priority - Приоритет (если не указан, определяется по типу)
     * @param {boolean} options.batchable - Можно ли батчить с другими запросами того же типа
     * @returns {Promise} Promise с результатом запроса
     */
    async enqueue(requestFn, requestType, options = {}) {
        const {
            priority = null,
            batchable = false,
            metadata = {}
        } = options;

        const requestPriority = priority !== null ? priority : this.getPriority(requestType);
        const requestId = `req_${Date.now()}_${++this.requestCounter}`;
        const enqueuedAt = Date.now();

        // Если запрос можно батчить и есть активный батч, добавляем в батч
        if (batchable && this.batchProcessor.batches.has(requestType)) {
            const batch = this.batchProcessor.batches.get(requestType);
            if (batch.requests.length < this.batchProcessor.maxBatchSize) {
                return new Promise((resolve, reject) => {
                    batch.requests.push({
                        requestFn,
                        requestId,
                        resolve,
                        reject,
                        metadata,
                        enqueuedAt
                    });
                    
                    this.stats.batchedRequests++;
                });
            }
        }

        // Если запрос батчируемый, создаем или добавляем в батч
        if (batchable) {
            return this.enqueueBatchable(requestFn, requestType, requestId, requestPriority, metadata, enqueuedAt);
        }

        // Обычный запрос - добавляем в очередь
        return new Promise((resolve, reject) => {
            this.queue.push({
                priority: requestPriority,
                requestFn,
                requestType,
                requestId,
                metadata,
                resolve,
                reject,
                enqueuedAt
            });

            // Сортируем очередь по приоритету (высокий приоритет первым)
            this.queue.sort((a, b) => b.priority - a.priority);
            
            this.stats.queuedRequests++;
            this.stats.totalRequests++;

            // Запускаем обработку очереди
            this.processQueue();
        });
    }

    /**
     * Добавить батчируемый запрос
     * @private
     */
    enqueueBatchable(requestFn, requestType, requestId, priority, metadata, enqueuedAt) {
        return new Promise((resolve, reject) => {
            // Получаем или создаем батч для этого типа
            if (!this.batchProcessor.batches.has(requestType)) {
                const batch = {
                    requests: [],
                    timer: null,
                    priority,
                    requestType
                };
                
                // Устанавливаем таймер для обработки батча
                batch.timer = setTimeout(() => {
                    this.processBatch(requestType);
                }, this.batchProcessor.batchDelay);
                
                this.batchProcessor.batches.set(requestType, batch);
            }

            const batch = this.batchProcessor.batches.get(requestType);
            batch.requests.push({
                requestFn,
                requestId,
                resolve,
                reject,
                metadata,
                enqueuedAt
            });

            this.stats.batchedRequests++;
            this.stats.totalRequests++;

            // Если батч заполнен, обрабатываем сразу
            if (batch.requests.length >= this.batchProcessor.maxBatchSize) {
                clearTimeout(batch.timer);
                this.processBatch(requestType);
            }
        });
    }

    /**
     * Обработка батча запросов
     * @private
     */
    async processBatch(requestType) {
        const batch = this.batchProcessor.batches.get(requestType);
        if (!batch || batch.requests.length === 0) {
            this.batchProcessor.batches.delete(requestType);
            return;
        }

        const requests = batch.requests.splice(0, this.batchProcessor.maxBatchSize);
        this.batchProcessor.batches.delete(requestType);

        // Обрабатываем все запросы из батча параллельно (с учетом rate limit)
        const results = await Promise.allSettled(
            requests.map(req => this.executeRequest(req.requestFn, req.requestId, req.requestType))
        );

        // Разрешаем/отклоняем промисы для каждого запроса
        results.forEach((result, index) => {
            const req = requests[index];
            if (result.status === 'fulfilled') {
                req.resolve(result.value);
            } else {
                req.reject(result.reason);
            }
        });
    }

    /**
     * Запуск обработчика очереди
     * @private
     */
    startQueueProcessor() {
        // Обработка очереди запускается при добавлении запросов
        // Дополнительный интервал для обработки застрявших запросов
        setInterval(() => {
            if (this.queue.length > 0 && !this.isProcessing) {
                this.processQueue();
            }
        }, 1000); // Проверяем каждую секунду
    }

    /**
     * Обработка очереди запросов
     * @private
     */
    async processQueue() {
        // Если уже обрабатываем очередь или очередь пуста, выходим
        if (this.isProcessing || this.queue.length === 0) {
            return;
        }

        // Если нет токенов, ждем
        if (this.rateLimiter.tokens < 1) {
            return;
        }

        this.isProcessing = true;

        try {
            // Берем запрос с наивысшим приоритетом
            const nextRequest = this.queue.shift();
            if (!nextRequest) {
                this.isProcessing = false;
                return;
            }

            // Используем токен
            this.rateLimiter.tokens--;

            // Добавляем в активные запросы
            this.activeRequests.set(nextRequest.requestId, {
                requestType: nextRequest.requestType,
                priority: nextRequest.priority,
                startTime: Date.now(),
                metadata: nextRequest.metadata
            });

            // Выполняем запрос
            this.executeRequest(nextRequest.requestFn, nextRequest.requestId, nextRequest.requestType)
                .then((result) => {
                    nextRequest.resolve(result);
                })
                .catch((error) => {
                    // Проверяем, является ли это ошибкой rate limit
                    if (error.status === 429 || error.statusCode === 429 || 
                        error.message?.includes('rate limit') || 
                        error.message?.includes('too many requests')) {
                        this.stats.rateLimitErrors++;
                        // Возвращаем токен и запрос обратно в очередь с более низким приоритетом
                        this.rateLimiter.tokens++;
                        nextRequest.priority = Math.max(10, nextRequest.priority - 20);
                        this.queue.unshift(nextRequest); // Добавляем в начало для повторной обработки
                        // Увеличиваем задержку перед следующей попыткой
                        setTimeout(() => this.processQueue(), 5000);
                    } else {
                        nextRequest.reject(error);
                    }
                })
                .finally(() => {
                    // Удаляем из активных запросов
                    this.activeRequests.delete(nextRequest.requestId);
                    
                    // Обновляем статистику
                    const waitTime = Date.now() - nextRequest.enqueuedAt;
                    this.stats.averageWaitTime = 
                        (this.stats.averageWaitTime * (this.stats.totalRequests - 1) + waitTime) / this.stats.totalRequests;
                    
                    // Продолжаем обработку очереди
                    this.isProcessing = false;
                    this.processQueue();
                });

        } catch (error) {
            console.error('Error processing API request queue:', error);
            this.isProcessing = false;
            // Продолжаем обработку очереди даже при ошибке
            this.processQueue();
        }
    }

    /**
     * Выполнение запроса
     * @private
     */
    async executeRequest(requestFn, requestId, requestType) {
        try {
            const result = await requestFn();
            return result;
        } catch (error) {
            console.error(`Error executing API request ${requestId} (${requestType}):`, error);
            throw error;
        }
    }

    /**
     * Получить статистику очереди
     * @returns {Object} Статистика
     */
    getStats() {
        return {
            queueLength: this.queue.length,
            activeRequests: this.activeRequests.size,
            availableTokens: this.rateLimiter.tokens,
            maxTokens: this.rateLimiter.maxTokens,
            batches: Array.from(this.batchProcessor.batches.entries()).map(([type, batch]) => ({
                type,
                size: batch.requests.length
            })),
            stats: { ...this.stats }
        };
    }

    /**
     * Очистить очередь (для критических ситуаций)
     */
    clearQueue() {
        // Отклоняем все ожидающие запросы
        this.queue.forEach(item => {
            item.reject(new Error('Queue cleared'));
        });
        this.queue = [];
        
        // Очищаем батчи
        this.batchProcessor.batches.forEach(batch => {
            batch.requests.forEach(req => {
                req.reject(new Error('Queue cleared'));
            });
            if (batch.timer) {
                clearTimeout(batch.timer);
            }
        });
        this.batchProcessor.batches.clear();
    }
}

// Экспортируем singleton экземпляр
const apiRequestQueue = new ApiRequestQueue();

export default apiRequestQueue;

