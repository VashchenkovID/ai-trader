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
 * Активация нейросети (включение анализа)
 */
router.post('/activate', async (req, res) => {
    try {
        await NeuralNetworkService.setStatus('active');
        res.json({
            success: true,
            message: 'Нейросеть активирована'
        });
    } catch (error) {
        console.error('Ошибка активации нейросети:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка активации нейросети',
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
            const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
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
            const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
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
            const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
            if (WebSocketService) {
                WebSocketService.broadcast('neural_network_batch_training_completed', { success: true, result });
            }
        } catch (trainingError) {
            if (OptimizedTelegramService && OptimizedTelegramService.isInitialized) {
                await OptimizedTelegramService.sendAlert('Ошибка пакетного обучения нейросети', `Ошибка: ${trainingError.message}\nСтек: ${trainingError.stack}`);
            }
            const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
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

/**
 * Анализ портфеля с рекомендациями по продаже/удержанию
 * Возвращает последний анализ из БД или запускает новый
 */
router.post('/analyze-portfolio', async (req, res) => {
    try {
        const { portfolioType = 'virtual', forceNew = false } = req.body;
        
        // Если не требуется новый анализ, пытаемся получить из БД
        if (!forceNew) {
            try {
                const PortfolioAnalysis = (await import('../models/PortfolioAnalysis.js')).default;
                
                // Ищем последний успешный анализ за последний час
                const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
                const lastAnalysis = await PortfolioAnalysis.findOne({
                    where: {
                        portfolioType,
                        status: 'completed',
                        analysisDate: {
                            [require('sequelize').Op.gte]: oneHourAgo
                        }
                    },
                    order: [['analysisDate', 'DESC']]
                });

                if (lastAnalysis) {
                    console.log(`📊 Returning cached portfolio analysis from DB (${portfolioType}, ${lastAnalysis.analysisDate})`);
                    return res.json({
                        success: true,
                        message: 'Анализ портфеля из БД',
                        data: {
                            portfolioType: lastAnalysis.portfolioType,
                            analysisDate: lastAnalysis.analysisDate,
                            portfolioValue: lastAnalysis.portfolioValue,
                            availableBudget: lastAnalysis.availableBudget,
                            totalPositions: lastAnalysis.totalPositions,
                            sellRecommendations: lastAnalysis.sellRecommendations || [],
                            buyRecommendations: lastAnalysis.buyRecommendations || [],
                            sellRecommendationsCount: lastAnalysis.sellRecommendationsCount,
                            buyRecommendationsCount: lastAnalysis.buyRecommendationsCount,
                            processingTime: lastAnalysis.processingTime,
                            metadata: lastAnalysis.metadata
                        }
                    });
                }
            } catch (dbError) {
                console.warn('Could not fetch analysis from DB, starting new analysis:', dbError.message);
            }
        }

        // Если нет свежего анализа в БД или требуется новый, запускаем анализ
        res.json({
            success: true,
            message: 'Анализ портфеля запущен',
            data: { status: 'analyzing', portfolioType }
        });

        // Запускаем анализ в фоне с сохранением в БД
        try {
            const analysisRecord = await NeuralNetworkService.analyzePortfolioAndSave(portfolioType);
            
            // Уведомляем через WebSocket
            const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
            if (WebSocketService && typeof WebSocketService.broadcast === 'function') {
                WebSocketService.broadcast({
                    type: 'portfolio_analysis_completed',
                    data: {
                        portfolioType: analysisRecord.portfolioType,
                        analysisDate: analysisRecord.analysisDate,
                        portfolioValue: analysisRecord.portfolioValue,
                        sellRecommendations: analysisRecord.sellRecommendations || [],
                        buyRecommendations: analysisRecord.buyRecommendations || [],
                        sellRecommendationsCount: analysisRecord.sellRecommendationsCount,
                        buyRecommendationsCount: analysisRecord.buyRecommendationsCount
                    }
                });
            }
            
            console.log('✅ Portfolio analysis completed and saved to DB');
        } catch (analysisError) {
            console.error('Ошибка анализа портфеля:', analysisError);
            
            // Уведомляем через WebSocket об ошибке
            const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
            if (WebSocketService && typeof WebSocketService.broadcast === 'function') {
                WebSocketService.broadcast({
                    type: 'portfolio_analysis_error',
                    data: { error: analysisError.message, portfolioType }
                });
            }
        }
    } catch (error) {
        console.error('Ошибка запуска анализа портфеля:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка запуска анализа портфеля',
            error: error.message
        });
    }
});

/**
 * Анализ только позиций портфеля (без сканирования рынка)
 * Сохраняет рекомендации в БД и возвращает результат сразу
 */
router.post('/analyze-portfolio/positions-only', async (req, res) => {
    try {
        const { portfolioType = 'virtual' } = req.body;

        console.log(`📊 [POSITIONS-ONLY] Starting analysis for ${portfolioType} portfolio (positions only, no market scan)`);
        const result = await NeuralNetworkService.analyzePortfolioPositionsOnly(portfolioType, true);
        console.log(`✅ [POSITIONS-ONLY] Analysis completed: ${result.sellRecommendationsCount} recommendations`);

        // Шлём через WebSocket, чтобы фронт получил обновление
        const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
        if (WebSocketService && typeof WebSocketService.broadcast === 'function') {
            WebSocketService.broadcast({
                type: 'portfolio_analysis_completed',
                data: result
            });
        }

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка анализа позиций портфеля:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка анализа позиций портфеля',
            error: error.message
        });
    }
});

export default router;
