import express from 'express';
import IntegratedAIService from '../services/IntegratedAIService.js';
import ServiceManager from '../services/ServiceManager.js';
import OptimizedTelegramService from '../services/OptimizedTelegramService.js';

const router = express.Router();

/**
 * Инициализация ИИ
 */
router.post('/initialize', async (req, res) => {
    try {
        const result = await IntegratedAIService.initialize();
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка инициализации ИИ:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка инициализации ИИ',
            error: error.message
        });
    }
});

/**
 * Получение рекомендации
 */
router.post('/recommendation', async (req, res) => {
    try {
        const { figi, context } = req.body;
        
        if (!figi) {
            return res.status(400).json({
                success: false,
                message: 'FIGI is required'
            });
        }

        const recommendation = await IntegratedAIService.getRecommendation(figi, context);
        
        res.json({
            success: true,
            data: recommendation
        });
    } catch (error) {
        console.error('Ошибка получения рекомендации:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения рекомендации',
            error: error.message
        });
    }
});

/**
 * Обучение ИИ
 */
router.post('/train', async (req, res) => {
    try {
        const { epochs = 10, batchSize = 32 } = req.body;
        
        // Отправляем ответ сразу
        res.json({
            success: true,
            message: 'Обучение ИИ запущено',
            data: { epochs, batchSize }
        });

        // Запускаем обучение в фоне
        try {
            const result = await IntegratedAIService.train(epochs, batchSize);
            console.log('Обучение ИИ завершено:', result);
            
            // Уведомляем через WebSocket
            const WebSocketService = ServiceManager.getService('WebSocketService');
            if (WebSocketService) {
                WebSocketService.broadcast('ai_training_completed', {
                    success: true,
                    result: result
                });
            }
        } catch (trainingError) {
            console.error('Ошибка обучения ИИ:', trainingError);
            
            // Отправляем ошибку в Telegram
            if (OptimizedTelegramService && OptimizedTelegramService.isInitialized) {
                await OptimizedTelegramService.sendAlert(
                    'Ошибка обучения ИИ',
                    `Ошибка: ${trainingError.message}\nСтек: ${trainingError.stack}`
                );
            }
            
            // Уведомляем через WebSocket
            const WebSocketService = ServiceManager.getService('WebSocketService');
            if (WebSocketService) {
                WebSocketService.broadcast('ai_training_error', {
                    success: false,
                    error: trainingError.message
                });
            }
        }
    } catch (error) {
        console.error('Ошибка запуска обучения ИИ:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка запуска обучения ИИ',
            error: error.message
        });
    }
});

/**
 * Частичное обучение
 */
router.post('/partial-train', async (req, res) => {
    try {
        const { figi, epochs = 5 } = req.body;
        
        if (!figi) {
            return res.status(400).json({
                success: false,
                message: 'FIGI is required'
            });
        }

        const result = await IntegratedAIService.partialTrain(figi, epochs);
        
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка частичного обучения:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка частичного обучения',
            error: error.message
        });
    }
});

/**
 * Статус ИИ
 */
router.get('/status', async (req, res) => {
    try {
        const status = await IntegratedAIService.getStatus();
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('Ошибка получения статуса ИИ:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статуса ИИ',
            error: error.message
        });
    }
});

/**
 * Загрузка моделей
 */
router.post('/load-models', async (req, res) => {
    try {
        const result = await IntegratedAIService.loadModels();
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка загрузки моделей:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка загрузки моделей',
            error: error.message
        });
    }
});

/**
 * Сохранение моделей
 */
router.post('/save-models', async (req, res) => {
    try {
        const result = await IntegratedAIService.saveModels();
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка сохранения моделей:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка сохранения моделей',
            error: error.message
        });
    }
});

export default router;
