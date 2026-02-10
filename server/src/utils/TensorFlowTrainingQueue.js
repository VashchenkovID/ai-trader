/**
 * Глобальная очередь для обучения моделей TensorFlow.js
 * TensorFlow.js не позволяет запускать несколько fit() одновременно,
 * даже на разных моделях, поэтому нужна глобальная очередь
 */

class TensorFlowTrainingQueue {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
        this.currentTraining = null;
    }

    /**
     * Добавляет задачу обучения в очередь
     * @param {Function} trainingFn - Функция, которая выполняет обучение (должна возвращать Promise)
     * @param {string} identifier - Идентификатор задачи (для логирования)
     * @returns {Promise} Promise, который разрешится когда обучение завершится
     */
    async enqueue(trainingFn, identifier = 'unknown') {
        return new Promise((resolve, reject) => {
            this.queue.push({
                trainingFn,
                identifier,
                resolve,
                reject
            });

            // Запускаем обработку очереди, если она еще не запущена
            this.processQueue();
        });
    }

    /**
     * Обрабатывает очередь задач обучения
     */
    async processQueue() {
        // Если уже обрабатываем задачу или очередь пуста, выходим
        if (this.isProcessing || this.queue.length === 0) {
            return;
        }

        this.isProcessing = true;

        while (this.queue.length > 0) {
            const task = this.queue.shift();
            this.currentTraining = task.identifier;

            try {
                // Выполняем обучение
                const result = await task.trainingFn();
                task.resolve(result);
            } catch (error) {
                task.reject(error);
            } finally {
                this.currentTraining = null;
            }
        }

        this.isProcessing = false;
    }

    /**
     * Проверяет, идет ли сейчас обучение
     * @returns {boolean}
     */
    isTraining() {
        return this.isProcessing;
    }

    /**
     * Получает текущую задачу обучения
     * @returns {string|null}
     */
    getCurrentTraining() {
        return this.currentTraining;
    }

    /**
     * Получает размер очереди
     * @returns {number}
     */
    getQueueSize() {
        return this.queue.length;
    }

    /**
     * Очищает очередь (для экстренных случаев)
     */
    clear() {
        // Отклоняем все ожидающие задачи
        while (this.queue.length > 0) {
            const task = this.queue.shift();
            task.reject(new Error('Training queue cleared'));
        }
        this.isProcessing = false;
        this.currentTraining = null;
    }
}

// Экспортируем singleton
const tensorFlowTrainingQueue = new TensorFlowTrainingQueue();
export default tensorFlowTrainingQueue;


