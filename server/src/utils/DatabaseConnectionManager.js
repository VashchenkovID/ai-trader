import sequelize from '../config/database.js';

/**
 * Менеджер соединений с базой данных
 * Обеспечивает проверку и восстановление соединений
 * Управляет очередью процессов, ожидающих свободного подключения
 */
class DatabaseConnectionManager {
    constructor() {
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
        this.reconnectDelay = 1000; // 1 секунда (базовая задержка для exponential backoff)
        
        // Очередь процессов, ожидающих подключения
        this.connectionQueue = [];
        this.activeConnections = new Set(); // Set для отслеживания активных подключений
        this.maxConnections = 20; // Максимальное количество одновременных подключений (из pool.max, будет обновлено при инициализации)
        this.checkInterval = null; // Интервал для проверки состояния пула
        this.keepAliveInterval = null; // Интервал для keep-alive запросов
        this.lastKeepAlive = Date.now(); // Время последнего keep-alive запроса
        this.stats = {
            totalRequests: 0,
            queuedRequests: 0,
            activeConnections: 0,
            maxWaitTime: 0,
            averageWaitTime: 0
        };
    }

    /**
     * Проверка состояния соединения
     */
    async isConnectionAlive() {
        try {
            await sequelize.authenticate();
            this.isConnected = true;
            this.reconnectAttempts = 0;
            return true;
        } catch (error) {
            this.isConnected = false;
            console.warn('⚠️ Database connection is not alive:', error.message);
            return false;
        }
    }

    /**
     * Восстановление соединения
     */
    async reconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            throw new Error(`Max reconnection attempts (${this.maxReconnectAttempts}) exceeded`);
        }

        this.reconnectAttempts++;
        
        // ВАРИАНТ 6: Exponential backoff для реконнектов
        const backoffDelay = Math.min(
            this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
            30000 // Максимум 30 секунд
        );
        
        console.log(`🔄 Attempting to reconnect to database (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}, delay: ${backoffDelay}ms)...`);

        try {
            // Закрываем старое соединение, если оно есть
            if (sequelize.connectionManager && sequelize.connectionManager.pool) {
                const pool = sequelize.connectionManager.pool;
                if (!pool._draining) {
                    // Не закрываем пул полностью, только пытаемся восстановить соединения
                    try {
                        await sequelize.authenticate();
                    } catch (authError) {
                        // Если authenticate не помог, закрываем пул
                        await sequelize.close();
                    }
                }
            }

            // Ждем перед попыткой переподключения (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, backoffDelay));

            // Создаем новое соединение
            await sequelize.authenticate();
            this.isConnected = true;
            this.reconnectAttempts = 0;
            
            console.log('✅ Database connection restored');
            return true;
        } catch (error) {
            console.error(`❌ Reconnection attempt ${this.reconnectAttempts} failed:`, error.message);
            
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                return await this.reconnect();
            } else {
                throw error;
            }
        }
    }

    /**
     * Безопасное выполнение запроса с автоматическим восстановлением соединения
     */
    async safeQuery(operation, ...args) {
        try {
            // Проверяем соединение
            if (!this.isConnected) {
                await this.reconnect();
            }

            // Выполняем операцию
            return await operation(...args);
        } catch (error) {
            if (error.message.includes('ConnectionManager.getConnection was called after the connection manager was closed')) {
                console.warn('⚠️ Connection was closed, attempting to reconnect...');
                this.isConnected = false;
                
                try {
                    await this.reconnect();
                    // Повторяем операцию после восстановления соединения
                    return await operation(...args);
                } catch (reconnectError) {
                    console.error('❌ Failed to reconnect:', reconnectError.message);
                    throw reconnectError;
                }
            } else {
                throw error;
            }
        }
    }

    /**
     * Инициализация соединения
     */
    async initialize() {
        try {
            await this.isConnectionAlive();
            
            // Получаем максимальное количество подключений из пула
            const pool = sequelize.connectionManager?.pool;
            if (pool && pool.max) {
                this.maxConnections = pool.max;
            }
            
            // Запускаем мониторинг пула
            this.startPoolMonitoring(5000);
            
            // ВАРИАНТ 4: Запускаем keep-alive механизм
            this.startKeepAlive(30000); // Каждые 30 секунд
            
            console.log('✅ Database connection manager initialized');
            console.log(`📊 Max connections: ${this.maxConnections}, Queue management: enabled, Keep-alive: enabled`);
        } catch (error) {
            console.error('❌ Failed to initialize database connection:', error.message);
            throw error;
        }
    }

    /**
     * Закрытие соединения
     */
    async close() {
        try {
            if (sequelize.connectionManager) {
                await sequelize.close();
            }
            this.isConnected = false;
            console.log('✅ Database connection closed');
        } catch (error) {
            console.error('❌ Error closing database connection:', error.message);
        }
    }

    /**
     * Получение статуса соединения
     */
    getStatus() {
        const pool = sequelize.connectionManager?.pool;
        const poolSize = pool ? pool.size : 0;
        const availableConnections = pool ? (pool.max - pool.size) : 0;
        
        return {
            isConnected: this.isConnected,
            reconnectAttempts: this.reconnectAttempts,
            maxReconnectAttempts: this.maxReconnectAttempts,
            poolSize,
            maxConnections: this.maxConnections,
            activeConnections: this.activeConnections.size,
            queueLength: this.connectionQueue.length,
            availableConnections,
            stats: { ...this.stats }
        };
    }

    /**
     * Получение текущего состояния пула соединений
     */
    getPoolStatus() {
        try {
            const pool = sequelize.connectionManager?.pool;
            if (!pool) {
                return {
                    size: 0,
                    max: this.maxConnections,
                    available: this.maxConnections,
                    waiting: this.connectionQueue.length
                };
            }

            return {
                size: pool.size || 0,
                max: pool.max || this.maxConnections,
                available: Math.max(0, (pool.max || this.maxConnections) - (pool.size || 0)),
                waiting: this.connectionQueue.length,
                idle: pool.idle || 0,
                using: pool.using || 0
            };
        } catch (error) {
            console.warn('⚠️ Error getting pool status:', error.message);
            return {
                size: 0,
                max: this.maxConnections,
                available: 0,
                waiting: this.connectionQueue.length
            };
        }
    }

    /**
     * Получение подключения с ожиданием в очереди, если все подключения заняты
     * @param {string} requesterId - Уникальный идентификатор запроса (для отладки)
     * @param {number} timeout - Максимальное время ожидания в миллисекундах (по умолчанию 60 секунд)
     * @returns {Promise<Object>} Объект с методом release() для освобождения подключения
     */
    async acquireConnection(requesterId = 'unknown', timeout = 60000) {
        const startTime = Date.now();
        this.stats.totalRequests++;

        return new Promise(async (resolve, reject) => {
            // Проверяем доступность подключения
            const poolStatus = this.getPoolStatus();
            
            // Если есть свободные подключения, выдаем сразу
            if (poolStatus.available > 0 && this.connectionQueue.length === 0) {
                const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                this.activeConnections.add(connectionId);
                this.stats.activeConnections = this.activeConnections.size;
                
                // Проверяем соединение перед выдачей
                try {
                    await sequelize.authenticate();
                    this.isConnected = true;
                } catch (error) {
                    this.activeConnections.delete(connectionId);
                    reject(new Error(`Database connection failed: ${error.message}`));
                    return;
                }

                resolve({
                    connectionId,
                    release: () => {
                        this.activeConnections.delete(connectionId);
                        this.stats.activeConnections = this.activeConnections.size;
                        this.processQueue(); // Обрабатываем очередь после освобождения
                    }
                });
                return;
            }

            // Если все подключения заняты, добавляем в очередь
            this.stats.queuedRequests++;
            const queueItem = {
                requesterId,
                resolve,
                reject,
                startTime: Date.now(),
                timeout: setTimeout(() => {
                    const index = this.connectionQueue.indexOf(queueItem);
                    if (index !== -1) {
                        this.connectionQueue.splice(index, 1);
                        this.stats.queuedRequests = this.connectionQueue.length;
                        reject(new Error(`Connection timeout after ${timeout}ms for ${requesterId}`));
                    }
                }, timeout)
            };

            this.connectionQueue.push(queueItem);
            console.log(`⏳ [${requesterId}] Added to connection queue (position: ${this.connectionQueue.length}, available: ${poolStatus.available})`);
            
            // Запускаем обработку очереди
            this.processQueue();
        });
    }

    /**
     * Обработка очереди ожидающих подключений
     */
    async processQueue() {
        if (this.connectionQueue.length === 0) {
            return;
        }

        const poolStatus = this.getPoolStatus();
        
        // Если нет свободных подключений, ждем
        if (poolStatus.available <= 0) {
            return;
        }

        // Берем первый элемент из очереди
        const queueItem = this.connectionQueue.shift();
        if (!queueItem) {
            return;
        }

        clearTimeout(queueItem.timeout);
        this.stats.queuedRequests = this.connectionQueue.length;

        const waitTime = Date.now() - queueItem.startTime;
        this.stats.maxWaitTime = Math.max(this.stats.maxWaitTime, waitTime);
        this.stats.averageWaitTime = (this.stats.averageWaitTime * (this.stats.totalRequests - 1) + waitTime) / this.stats.totalRequests;

        try {
            // ВАРИАНТ 2: Не проверяем authenticate() - используем пул напрямую
            // Проверяем только если пул не доступен
            const pool = sequelize.connectionManager?.pool;
            if (!pool || pool._draining) {
                throw new Error('Connection pool is not available');
            }

            this.isConnected = true;

            const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            this.activeConnections.add(connectionId);
            this.stats.activeConnections = this.activeConnections.size;

            console.log(`✅ [${queueItem.requesterId}] Connection acquired (waited ${waitTime}ms, queue: ${this.connectionQueue.length})`);

            queueItem.resolve({
                connectionId,
                release: () => {
                    this.activeConnections.delete(connectionId);
                    this.stats.activeConnections = this.activeConnections.size;
                    this.processQueue(); // Обрабатываем очередь после освобождения
                }
            });

            // Обрабатываем следующий элемент очереди
            if (this.connectionQueue.length > 0) {
                // Небольшая задержка перед следующей обработкой
                setTimeout(() => this.processQueue(), 100);
            }
        } catch (error) {
            console.error(`❌ [${queueItem.requesterId}] Failed to acquire connection:`, error.message);
            
            // ВАРИАНТ 6: Retry с exponential backoff
            const retryDelay = Math.min(1000 * Math.pow(2, queueItem.retryCount || 0), 30000); // Максимум 30 секунд
            if (!queueItem.retryCount) queueItem.retryCount = 0;
            queueItem.retryCount++;
            
            if (queueItem.retryCount <= 3) {
                console.log(`🔄 [${queueItem.requesterId}] Retrying connection (attempt ${queueItem.retryCount}/3) after ${retryDelay}ms...`);
                setTimeout(() => {
                    // Возвращаем в очередь для повторной попытки
                    this.connectionQueue.unshift(queueItem);
                    this.processQueue();
                }, retryDelay);
            } else {
                queueItem.reject(new Error(`Database connection failed after 3 retries: ${error.message}`));
            }
            
            // Обрабатываем следующий элемент очереди
            if (this.connectionQueue.length > 0) {
                setTimeout(() => this.processQueue(), 1000);
            }
        }
    }

    /**
     * Безопасное выполнение операции с автоматическим управлением подключением
     * @param {Function} operation - Функция для выполнения
     * @param {string} requesterId - Уникальный идентификатор запроса
     * @param {number} timeout - Максимальное время ожидания подключения
     * @returns {Promise<any>} Результат выполнения операции
     */
    async executeWithConnection(operation, requesterId = 'unknown', timeout = 60000) {
        let connection = null;
        try {
            // Получаем подключение из очереди
            connection = await this.acquireConnection(requesterId, timeout);
            
            // Выполняем операцию
            const result = await operation();
            
            return result;
        } catch (error) {
            throw error;
        } finally {
            // Освобождаем подключение
            if (connection && connection.release) {
                connection.release();
            }
        }
    }

    /**
     * Запуск периодической проверки состояния пула
     */
    startPoolMonitoring(interval = 5000) {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }

        this.checkInterval = setInterval(() => {
            const poolStatus = this.getPoolStatus();
            
            // Автоматически обрабатываем очередь, если есть свободные подключения
            if (poolStatus.available > 0 && this.connectionQueue.length > 0) {
                this.processQueue();
            }
        }, interval);
    }

    /**
     * Остановка мониторинга пула
     */
    stopPoolMonitoring() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        this.stopKeepAlive();
    }

    /**
     * ВАРИАНТ 4: Keep-alive механизм для поддержания соединений активными
     * Отправляет легкие запросы для предотвращения закрытия соединений PostgreSQL
     */
    startKeepAlive(interval = 30000) {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
        }

        this.keepAliveInterval = setInterval(async () => {
            try {
                // Проверяем, не прошло ли слишком много времени с последнего keep-alive
                const timeSinceLastKeepAlive = Date.now() - this.lastKeepAlive;
                if (timeSinceLastKeepAlive < interval) {
                    return; // Слишком рано для следующего keep-alive
                }

                // Отправляем легкий запрос для поддержания соединения
                // Используем простой SELECT 1 вместо authenticate() для меньшей нагрузки
                await sequelize.query('SELECT 1', { type: sequelize.QueryTypes.SELECT });
                this.lastKeepAlive = Date.now();
                this.isConnected = true;
                
                // Логируем только если были проблемы
                if (!this.isConnected) {
                    console.log('✅ Keep-alive: Database connection maintained');
                }
            } catch (error) {
                console.warn('⚠️ Keep-alive failed:', error.message);
                this.isConnected = false;
                // Не пытаемся переподключиться здесь - это сделает основной механизм
            }
        }, interval);
    }

    /**
     * Остановка keep-alive механизма
     */
    stopKeepAlive() {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
    }
}

// Создаем единственный экземпляр
const connectionManager = new DatabaseConnectionManager();

export default connectionManager;
