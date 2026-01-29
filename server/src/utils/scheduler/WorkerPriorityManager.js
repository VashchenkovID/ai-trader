/**
 * Менеджер приоритетной очереди воркеров
 * Ограничивает количество одновременных воркеров и управляет их выполнением
 */

class WorkerPriorityManager {
    constructor() {
        // Максимальное количество одновременных воркеров (оптимизировано для низкой нагрузки)
        this.maxConcurrent = 3;
        // Приоритетная очередь: массив объектов { priority, workerFn, metadata }
        this.queue = [];
        // Активные воркеры: Map<workerId, { worker, priority, startTime }>
        this.activeWorkers = new Map();
        // Приоритеты воркеров (чем выше число, тем выше приоритет)
        this.priorities = {
            // Критичные воркеры (высокий приоритет)
            'portfolio_prices_update': 100,
            'trading_requests_prices_update': 100,
            'active_signals_prices_update': 90,
            'portfolio_analysis': 90,
            'market_analysis': 85,
            
            // Обычные воркеры (средний приоритет)
            'price_update': 70,
            'cache_update': 60,
            'training': 50,
            'ensemble_training': 50,
            
            // Фоновые воркеры (низкий приоритет)
            'options_data_update': 30,
            'fundamental_data_update': 20,
            'portfolio_rebalancing': 25,
        };
        
        // Флаг обработки очереди
        this.isProcessing = false;
    }

    /**
     * Получить приоритет воркера по типу
     * @param {string} workerType - Тип воркера
     * @returns {number} Приоритет (по умолчанию 50)
     */
    getPriority(workerType) {
        return this.priorities[workerType] || 50;
    }

    /**
     * Добавить воркер в очередь
     * @param {Function} workerFn - Функция для выполнения воркера (async функция)
     * @param {string} workerType - Тип воркера
     * @param {Object} metadata - Метаданные воркера
     * @returns {Promise} Promise, который разрешится когда воркер начнет выполняться
     */
    async enqueue(workerFn, workerType, metadata = {}) {
        const priority = this.getPriority(workerType);
        
        return new Promise((resolve, reject) => {
            // Добавляем в очередь с приоритетом
            this.queue.push({
                priority,
                workerFn,
                workerType,
                metadata,
                resolve,
                reject,
                enqueuedAt: Date.now()
            });
            
            // Сортируем очередь по приоритету (высокий приоритет первым)
            this.queue.sort((a, b) => b.priority - a.priority);
            
            // Запускаем обработку очереди
            this.processQueue();
        });
    }

    /**
     * Обработка очереди воркеров
     * @private
     */
    async processQueue() {
        // Если уже обрабатываем очередь или очередь пуста, выходим
        if (this.isProcessing || this.queue.length === 0) {
            return;
        }

        // Если достигнут лимит одновременных воркеров, ждем
        if (this.activeWorkers.size >= this.maxConcurrent) {
            return;
        }

        this.isProcessing = true;

        try {
            // Берем воркер с наивысшим приоритетом
            const nextWorker = this.queue.shift();
            if (!nextWorker) {
                this.isProcessing = false;
                return;
            }

            // Генерируем ID для воркера
            const workerId = `${nextWorker.workerType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            // Добавляем в активные воркеры
            this.activeWorkers.set(workerId, {
                workerType: nextWorker.workerType,
                priority: nextWorker.priority,
                startTime: Date.now(),
                metadata: nextWorker.metadata
            });

            // Запускаем выполнение воркера
            // Результат выполнения передается через resolve/reject
            this.executeWorker(workerId, nextWorker.workerFn, nextWorker.workerType)
                .then((result) => {
                    // Успешное выполнение - передаем результат
                    nextWorker.resolve(result);
                })
                .catch((error) => {
                    // Ошибка выполнения - передаем ошибку
                    nextWorker.reject(error);
                })
                .finally(() => {
                    // Удаляем из активных воркеров
                    this.activeWorkers.delete(workerId);
                    // Продолжаем обработку очереди
                    this.isProcessing = false;
                    this.processQueue();
                });

        } catch (error) {
            console.error('Error processing worker queue:', error);
            this.isProcessing = false;
            // Продолжаем обработку очереди даже при ошибке
            this.processQueue();
        }
    }

    /**
     * Выполнение воркера
     * @private
     */
    async executeWorker(workerId, workerFn, workerType) {
        try {
            const result = await workerFn();
            return result;
        } catch (error) {
            console.error(`Error executing worker ${workerId} (${workerType}):`, error);
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
            activeWorkers: this.activeWorkers.size,
            maxConcurrent: this.maxConcurrent,
            activeWorkerTypes: Array.from(this.activeWorkers.values()).map(w => w.workerType)
        };
    }

    /**
     * Очистить очередь (для критических ситуаций)
     */
    clearQueue() {
        // Отклоняем все ожидающие воркеры
        this.queue.forEach(item => {
            item.reject(new Error('Queue cleared'));
        });
        this.queue = [];
    }
}

// Экспортируем singleton экземпляр
const workerPriorityManager = new WorkerPriorityManager();

export default workerPriorityManager;

