import express from 'express';
import EnsembleService from '../services/EnsembleService.js';
import ServiceManager from '../services/ServiceManager.js';
import OptimizedTelegramService from '../services/OptimizedTelegramService.js';

const router = express.Router();

/**
 * Статус ансамбля
 */
router.get('/status', async (req, res) => {
    try {
        const status = await EnsembleService.getEnsembleStats();
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('Ошибка получения статуса ансамбля:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статуса ансамбля',
            error: error.message
        });
    }
});

/**
 * Обучение ансамбля
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
            message: 'Обучение ансамбля запущено',
            data: { figi }
        });

        // Запускаем обучение в фоне
        try {
            const result = await EnsembleService.trainEnsemble(figi, options);
            console.log('Обучение ансамбля завершено:', result);
            
            // Уведомляем через WebSocket
            const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
            if (WebSocketService && typeof WebSocketService.broadcast === 'function') {
                WebSocketService.broadcast({
                    type: 'ensemble_training_completed',
                    data: { success: true, result }
                });
            }
        } catch (trainingError) {
            console.error('Ошибка обучения ансамбля:', trainingError);
            
            // Отправляем ошибку в Telegram
            if (OptimizedTelegramService && OptimizedTelegramService.isInitialized) {
                await OptimizedTelegramService.sendAlert(
                    'Ошибка обучения ансамбля',
                    `Ошибка: ${trainingError.message}\nСтек: ${trainingError.stack}`
                );
            }
            
            // Уведомляем через WebSocket
            const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
            if (WebSocketService && typeof WebSocketService.broadcast === 'function') {
                WebSocketService.broadcast({
                    type: 'ensemble_training_error',
                    data: { success: false, error: trainingError.message }
                });
            }
        }
    } catch (error) {
        console.error('Ошибка запуска обучения ансамбля:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка запуска обучения ансамбля',
            error: error.message
        });
    }
});

/**
 * Пакетное обучение ансамбля
 */
router.post('/batch-train', async (req, res) => {
    try {
        const { epochs = 10, batchSize = 32 } = req.body;
        
        // Отправляем ответ сразу
        res.json({
            success: true,
            message: 'Пакетное обучение ансамбля запущено',
            data: { epochs, batchSize }
        });

        // Запускаем пакетное обучение в фоне
        try {
            const result = await EnsembleService.batchTrainEnsemble(epochs, batchSize);
            console.log('Пакетное обучение ансамбля завершено:', result);
            
            // Уведомляем через WebSocket
            const WebSocketService = ServiceManager.getService('WebSocketService');
            if (WebSocketService) {
                WebSocketService.broadcast('ensemble_batch_training_completed', {
                    success: true,
                    result: result
                });
            }
        } catch (trainingError) {
            console.error('Ошибка пакетного обучения ансамбля:', trainingError);
            
            // Отправляем ошибку в Telegram
            if (OptimizedTelegramService && OptimizedTelegramService.isInitialized) {
                await OptimizedTelegramService.sendAlert(
                    'Ошибка пакетного обучения ансамбля',
                    `Ошибка: ${trainingError.message}\nСтек: ${trainingError.stack}`
                );
            }
            
            // Уведомляем через WebSocket
            const WebSocketService = ServiceManager.getService('WebSocketService');
            if (WebSocketService) {
                WebSocketService.broadcast('ensemble_batch_training_error', {
                    success: false,
                    error: trainingError.message
                });
            }
        }
    } catch (error) {
        console.error('Ошибка запуска пакетного обучения ансамбля:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка запуска пакетного обучения ансамбля',
            error: error.message
        });
    }
});

export default router;
