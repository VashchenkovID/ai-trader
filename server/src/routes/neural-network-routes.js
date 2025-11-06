import express from 'express';
import NeuralNetworkService from '../services/NeuralNetworkService.js';
import ServiceManager from '../services/ServiceManager.js';
import OptimizedTelegramService from '../services/OptimizedTelegramService.js';
import CacheService from '../services/CacheService.js';

const router = express.Router();

/**
 * Статус нейросети
 */
router.get('/status', async (req, res) => {
    try {
        const status = await NeuralNetworkService.getModelStatus();
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('Ошибка получения статуса нейросети:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статуса нейросети',
            error: error.message
        });
    }
});

/**
 * Обучение нейросети
 */
router.post('/train', async (req, res) => {
    try {
        const { figi, options = {} } = req.body;
        if (!figi) {
            return res.status(400).json({ success: false, message: 'FIGI is required' });
        }
        
        // Отправляем ответ сразу
        res.json({
            success: true,
            message: 'Обучение нейросети запущено',
            data: { figi }
        });

        // Запускаем обучение в фоне
        try {
            // Используем существующий метод обучения для инструмента
            const days = typeof options.days === 'number' ? options.days : 180;
            const result = await NeuralNetworkService.trainForInstrument(figi, days);
            console.log('Обучение нейросети завершено:', result?.success ? 'Успешно' : 'Ошибка');
            
            // Уведомляем через WebSocket
            const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
            if (WebSocketService && typeof WebSocketService.broadcast === 'function') {
                WebSocketService.broadcast({
                    type: 'neural_network_training_completed',
                    data: { success: true, result }
                });
            }
        } catch (trainingError) {
            console.error('Ошибка обучения нейросети:', trainingError);
            
            // Отправляем ошибку в Telegram
            if (OptimizedTelegramService && OptimizedTelegramService.isInitialized) {
                await OptimizedTelegramService.sendAlert(
                    'Ошибка обучения нейросети',
                    `Ошибка: ${trainingError.message}\nСтек: ${trainingError.stack}`
                );
            }
            
            // Уведомляем через WebSocket
            const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
            if (WebSocketService && typeof WebSocketService.broadcast === 'function') {
                WebSocketService.broadcast({
                    type: 'neural_network_training_error',
                    data: { success: false, error: trainingError.message }
                });
            }
        }
    } catch (error) {
        console.error('Ошибка запуска обучения нейросети:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка запуска обучения нейросети',
            error: error.message
        });
    }
});

/**
 * Пакетное обучение нейросети
 */
// alias для совместимости с фронтом: /train-batch
router.post('/train-batch', async (req, res) => {
    try {
        const { epochs = 10, batchSize = 32, models = ['lstm', 'cnn', 'transformer'] } = req.body;
        
        // Отправляем ответ сразу
        res.json({
            success: true,
            message: 'Пакетное обучение нейросети запущено',
            data: { epochs, batchSize, models }
        });

        // Запускаем пакетное обучение в фоне
        try {
            const result = await NeuralNetworkService.batchTrainModels(epochs, batchSize, models);
            console.log('Пакетное обучение нейросети завершено:', result);
            
            // Уведомляем через WebSocket
            const WebSocketService = ServiceManager.getService('WebSocketService');
            if (WebSocketService) {
                WebSocketService.broadcast('neural_network_batch_training_completed', {
                    success: true,
                    result: result
                });
            }
        } catch (trainingError) {
            console.error('Ошибка пакетного обучения нейросети:', trainingError);
            
            // Отправляем ошибку в Telegram
            if (OptimizedTelegramService && OptimizedTelegramService.isInitialized) {
                await OptimizedTelegramService.sendAlert(
                    'Ошибка пакетного обучения нейросети',
                    `Ошибка: ${trainingError.message}\nСтек: ${trainingError.stack}`
                );
            }
            
            // Уведомляем через WebSocket
            const WebSocketService = ServiceManager.getService('WebSocketService');
            if (WebSocketService) {
                WebSocketService.broadcast('neural_network_batch_training_error', {
                    success: false,
                    error: trainingError.message
                });
            }
        }
    } catch (error) {
        console.error('Ошибка запуска пакетного обучения нейросети:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка запуска пакетного обучения нейросети',
            error: error.message
        });
    }
});

// основной маршрут
router.post('/batch-train', async (req, res) => {
    try {
        const { epochs = 10, batchSize = 32, models = ['lstm', 'cnn', 'transformer'] } = req.body;
        res.json({ success: true, message: 'Пакетное обучение нейросети запущено', data: { epochs, batchSize, models } });
        try {
            const result = await NeuralNetworkService.batchTrainModels(epochs, batchSize, models);
            const WebSocketService = ServiceManager.getService('WebSocketService');
            if (WebSocketService) {
                WebSocketService.broadcast('neural_network_batch_training_completed', { success: true, result });
            }
        } catch (trainingError) {
            if (OptimizedTelegramService && OptimizedTelegramService.isInitialized) {
                await OptimizedTelegramService.sendAlert('Ошибка пакетного обучения нейросети', `Ошибка: ${trainingError.message}\nСтек: ${trainingError.stack}`);
            }
            const WebSocketService = ServiceManager.getService('WebSocketService');
            if (WebSocketService) {
                WebSocketService.broadcast('neural_network_batch_training_error', { success: false, error: trainingError.message });
            }
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Ошибка запуска пакетного обучения нейросети', error: error.message });
    }
});

/**
 * Получение списка инструментов, доступных для обучения нейросети
 */
router.get('/instruments', async (req, res) => {
    try {
        const instruments = await CacheService.getAllInstruments();
        res.json({
            success: true,
            data: instruments
        });
    } catch (error) {
        console.error('Ошибка получения списка инструментов для обучения нейросети:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения списка инструментов для обучения нейросети',
            error: error.message
        });
    }
});

export default router;
