import express from 'express';
import OptimizedTrainingService from '../services/OptimizedTrainingService.js';
import MetaLearningService from '../services/MetaLearningService.js';
import ReinforcementLearningService from '../services/ReinforcementLearningService.js';
import ServiceManager from '../services/ServiceManager.js';
import { getGlobalServiceManager } from '../services/GlobalServiceManager.js';
import OptimizedTelegramService from '../services/OptimizedTelegramService.js';
import { heavyOperationLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Middleware для применения лимитера ко всем роутам, кроме пакетного обучения
const applyHeavyLimiter = (req, res, next) => {
    // Пропускаем пакетное обучение (batch-train), для них не нужен rate limiter
    // Проверяем как полный путь, так и базовый путь
    const path = req.path || req.url || '';
    if (path.includes('/batch-train-all') || path.endsWith('/batch-train-all') ||
        path.includes('/meta-learning/batch-train') || path.endsWith('/meta-learning/batch-train') ||
        path.includes('/reinforcement-learning/batch-train') || path.endsWith('/reinforcement-learning/batch-train')) {
        return next();
    }
    return heavyOperationLimiter(req, res, next);
};

// Применяем строгие лимиты к тяжелым операциям обучения (кроме batch-train-all)
router.use(applyHeavyLimiter);

/**
 * Пакетное обучение всех нейросетей
 * Rate limiter отключен для этого эндпоинта
 */
router.post('/batch-train-all', async (req, res) => {
    try {
        const { epochs = 10, batchSize = 32, force = false } = req.body;
        
        // Получаем глобальный ServiceManager
        const globalServiceManager = getGlobalServiceManager();
        
        // Проверяем, инициализирован ли ServiceManager
        if (!globalServiceManager || !globalServiceManager.isInitialized) {
            return res.status(503).json({
                success: false,
                message: 'ServiceManager не инициализирован. Попробуйте позже.'
            });
        }
        
        // Получаем SchedulerService для вызова унифицированной функции полного обучения
        let SchedulerService = null;
        try {
            SchedulerService = globalServiceManager.getService('SchedulerService');
        } catch (error) {
            // Если сервис не найден, пробуем получить через getServiceSafe
            SchedulerService = globalServiceManager.getServiceSafe('SchedulerService');
        }
        
        if (!SchedulerService) {
            // Пробуем инициализировать SchedulerService, если он еще не инициализирован
            try {
                await globalServiceManager.initializeService('SchedulerService', () => import('../services/SchedulerService.js'));
                SchedulerService = globalServiceManager.getService('SchedulerService');
            } catch (initError) {
                console.error('Ошибка инициализации SchedulerService:', initError);
                return res.status(500).json({
                    success: false,
                    message: 'SchedulerService недоступен. Не удалось инициализировать сервис.',
                    error: initError.message
                });
            }
        }
        
        // Проверяем, не идет ли уже обучение
        if (SchedulerService.isTraining && !force) {
            return res.status(409).json({
                success: false,
                message: 'Обучение уже запущено',
                isRunning: true
            });
        }
        
        // Отправляем ответ сразу
        res.json({
            success: true,
            message: 'Полное обучение всех нейросетей запущено',
            data: { epochs, batchSize, force }
        });

        // Запускаем полное обучение в фоне (используем унифицированную функцию)
        try {
            const result = await SchedulerService.performFullTraining({ 
                skipChecks: true, // Пропускаем проверки, так как уже проверили выше
                force: force 
            });
            
            console.log('Полное обучение всех нейросетей завершено:', result);
            
            // Уведомляем через WebSocket
            const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
            if (WebSocketService) {
                WebSocketService.broadcast({
                    type: 'batch_training_all_completed',
                    data: {
                        success: true,
                        result: result,
                        timestamp: new Date().toISOString()
                    }
                });
            }
        } catch (trainingError) {
            console.error('Ошибка полного обучения всех нейросетей:', trainingError);
            
            // Уведомляем через WebSocket
            const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
            if (WebSocketService) {
                WebSocketService.broadcast({
                    type: 'batch_training_all_error',
                    data: {
                        success: false,
                        error: trainingError.message,
                        timestamp: new Date().toISOString()
                    }
                });
            }
        }
    } catch (error) {
        console.error('Ошибка запуска полного обучения всех нейросетей:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка запуска полного обучения всех нейросетей',
            error: error.message
        });
    }
});

/**
 * Обучение Meta-Learning
 */
router.post('/meta-learning/train', async (req, res) => {
    try {
        const { figi, epochs = 10, batchSize = 32, options = {} } = req.body;
        
        // Отправляем ответ сразу
        res.json({
            success: true,
            message: 'Обучение Meta-Learning запущено',
            data: { figi, epochs, batchSize }
        });

        // Запускаем обучение в фоне
        try {
            // Если figi не передан,fallback на первый из кеша
            let targetFigi = figi;
            if (!targetFigi) {
                const CacheService = ServiceManager.getService('CacheService');
                const instruments = await CacheService.getAllInstruments();
                if (!instruments || instruments.length === 0) {
                    throw new Error('No instruments available for meta-learning training');
                }
                targetFigi = instruments[0].figi || instruments[0];
            }

            const result = await MetaLearningService.train(targetFigi, { ...options, epochs, batchSize });
            console.log('Обучение Meta-Learning завершено:', result?.success ? 'Успешно' : 'Ошибка');
            
            // Уведомляем через WebSocket
            try {
                const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
                if (WebSocketService && typeof WebSocketService.broadcast === 'function') {
                    WebSocketService.broadcast({
                        type: 'meta_learning_training_completed',
                        data: { success: true, result }
                    });
                }
            } catch (error) {
                console.warn('WebSocketService not available for broadcast:', error.message);
            }
        } catch (trainingError) {
            console.error('Ошибка обучения Meta-Learning:', trainingError);
            
            // Отправляем ошибку в Telegram
            if (OptimizedTelegramService && OptimizedTelegramService.isInitialized) {
                await OptimizedTelegramService.sendAlert(
                    'Ошибка обучения Meta-Learning',
                    `Ошибка: ${trainingError.message}\nСтек: ${trainingError.stack}`
                );
            }
            
            // Уведомляем через WebSocket
            const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
            if (WebSocketService) {
                WebSocketService.broadcast('meta_learning_training_error', {
                    success: false,
                    error: trainingError.message
                });
            }
        }
    } catch (error) {
        console.error('Ошибка запуска обучения Meta-Learning:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка запуска обучения Meta-Learning',
            error: error.message
        });
    }
});

/**
 * Пакетное обучение Meta-Learning
 */
router.post('/meta-learning/batch-train', async (req, res) => {
    try {
        const { epochs = 10, batchSize = 32 } = req.body;
        
        // Отправляем ответ сразу
        res.json({
            success: true,
            message: 'Пакетное обучение Meta-Learning запущено',
            data: { epochs, batchSize }
        });

        // Запускаем обучение в фоне
        try {
            // Получаем все инструменты для обучения
            const CacheService = ServiceManager.getService('CacheService');
            const instruments = await CacheService.getAllInstruments();
            
            if (!instruments || instruments.length === 0) {
                throw new Error('No instruments available for meta-learning training');
            }
            
            // Обучаем для первого инструмента
            const figi = instruments[0].figi || instruments[0];
            const result = await MetaLearningService.train(figi, { epochs, batchSize });
            console.log('Обучение Meta-Learning завершено:', result?.success ? 'Успешно' : 'Ошибка');
            
            // Уведомляем через WebSocket
            const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
            if (WebSocketService) {
                WebSocketService.broadcast('meta_learning_batch_training_completed', {
                    success: true,
                    result: result
                });
            }
        } catch (trainingError) {
            console.error('Ошибка пакетного обучения Meta-Learning:', trainingError);
            
            // Отправляем ошибку в Telegram
            if (OptimizedTelegramService && OptimizedTelegramService.isInitialized) {
                await OptimizedTelegramService.sendAlert(
                    'Ошибка пакетного обучения Meta-Learning',
                    `Ошибка: ${trainingError.message}\nСтек: ${trainingError.stack}`
                );
            }
            
            // Уведомляем через WebSocket
            const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
            if (WebSocketService) {
                WebSocketService.broadcast('meta_learning_batch_training_error', {
                    success: false,
                    error: trainingError.message
                });
            }
        }
    } catch (error) {
        console.error('Ошибка запуска пакетного обучения Meta-Learning:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка запуска пакетного обучения Meta-Learning',
            error: error.message
        });
    }
});

/**
 * Обучение Reinforcement Learning
 */
router.post('/reinforcement-learning/train', async (req, res) => {
    try {
        const { epochs = 10, batchSize = 32 } = req.body;
        
        // Отправляем ответ сразу
        res.json({
            success: true,
            message: 'Обучение Reinforcement Learning запущено',
            data: { epochs, batchSize }
        });

        // Запускаем обучение в фоне
        try {
            // Получаем все инструменты для обучения
            const CacheService = ServiceManager.getService('CacheService');
            const instruments = await CacheService.getAllInstruments();
            
            if (!instruments || instruments.length === 0) {
                throw new Error('No instruments available for reinforcement learning training');
            }
            
            // Обучаем для первого инструмента (можно расширить для всех)
            const figi = instruments[0].figi || instruments[0];
            const result = await ReinforcementLearningService.train(figi, { epochs, batchSize });
            console.log('Обучение Reinforcement Learning завершено:', result?.success ? 'Успешно' : 'Ошибка');
            
            // Уведомляем через WebSocket
            const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
            if (WebSocketService) {
                WebSocketService.broadcast('reinforcement_learning_training_completed', {
                    success: true,
                    result: result
                });
            }
        } catch (trainingError) {
            console.error('Ошибка обучения Reinforcement Learning:', trainingError);
            
            // Отправляем ошибку в Telegram
            if (OptimizedTelegramService && OptimizedTelegramService.isInitialized) {
                await OptimizedTelegramService.sendAlert(
                    'Ошибка обучения Reinforcement Learning',
                    `Ошибка: ${trainingError.message}\nСтек: ${trainingError.stack}`
                );
            }
            
            // Уведомляем через WebSocket
            const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
            if (WebSocketService && typeof WebSocketService.broadcast === 'function') {
                WebSocketService.broadcast({
                    type: 'reinforcement_learning_training_error',
                    data: {
                        success: false,
                        error: trainingError.message
                    },
                    timestamp: new Date().toISOString()
                });
            }
        }
    } catch (error) {
        console.error('Ошибка запуска обучения Reinforcement Learning:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка запуска обучения Reinforcement Learning',
            error: error.message
        });
    }
});

/**
 * Пакетное обучение Reinforcement Learning
 */
router.post('/reinforcement-learning/batch-train', async (req, res) => {
    try {
        const { epochs = 10, batchSize = 32 } = req.body;
        
        // Отправляем ответ сразу
        res.json({
            success: true,
            message: 'Пакетное обучение Reinforcement Learning запущено',
            data: { epochs, batchSize }
        });

        // Запускаем обучение в фоне
        try {
            // Получаем все инструменты для обучения
            const CacheService = ServiceManager.getService('CacheService');
            const instruments = await CacheService.getAllInstruments();
            
            if (!instruments || instruments.length === 0) {
                throw new Error('No instruments available for reinforcement learning training');
            }
            
            // Обучаем для первого инструмента
            const figi = instruments[0].figi || instruments[0];
            const result = await ReinforcementLearningService.train(figi, { epochs, batchSize });
            console.log('Обучение Reinforcement Learning завершено:', result?.success ? 'Успешно' : 'Ошибка');
            
            // Уведомляем через WebSocket
            const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
            if (WebSocketService) {
                WebSocketService.broadcast('reinforcement_learning_batch_training_completed', {
                    success: true,
                    result: result
                });
            }
        } catch (trainingError) {
            console.error('Ошибка пакетного обучения Reinforcement Learning:', trainingError);
            
            // Отправляем ошибку в Telegram
            if (OptimizedTelegramService && OptimizedTelegramService.isInitialized) {
                await OptimizedTelegramService.sendAlert(
                    'Ошибка пакетного обучения Reinforcement Learning',
                    `Ошибка: ${trainingError.message}\nСтек: ${trainingError.stack}`
                );
            }
            
            // Уведомляем через WebSocket
            const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
            if (WebSocketService && typeof WebSocketService.broadcast === 'function') {
                WebSocketService.broadcast({
                    type: 'reinforcement_learning_batch_training_error',
                    data: {
                        success: false,
                        error: trainingError.message
                    },
                    timestamp: new Date().toISOString()
                });
            }
        }
    } catch (error) {
        console.error('Ошибка запуска пакетного обучения Reinforcement Learning:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка запуска пакетного обучения Reinforcement Learning',
            error: error.message
        });
    }
});

/**
 * Подбор гиперпараметров
 */
router.post('/tune-hyperparameters', async (req, res) => {
    try {
        const { testFigis = null, options = {} } = req.body;
        
        // Отправляем ответ сразу
        res.json({
            success: true,
            message: 'Подбор гиперпараметров запущен',
            data: { testFigis, options }
        });

        // Запускаем подбор в фоне
        try {
            const result = await OptimizedTrainingService.tuneHyperparameters(testFigis, options);
            console.log('Подбор гиперпараметров завершен:', result);
            
            // Уведомляем через WebSocket
            const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
            if (WebSocketService) {
                WebSocketService.broadcast({
                    type: 'hyperparameter_tuning_completed',
                    data: { success: true, result }
                });
            }
        } catch (tuningError) {
            console.error('Ошибка подбора гиперпараметров:', tuningError);
            
            // Отправляем ошибку в Telegram
            if (OptimizedTelegramService && OptimizedTelegramService.isInitialized) {
                await OptimizedTelegramService.sendAlert(
                    'Ошибка подбора гиперпараметров',
                    `Ошибка: ${tuningError.message}\nСтек: ${tuningError.stack}`
                );
            }
            
            // Уведомляем через WebSocket
            const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
            if (WebSocketService) {
                WebSocketService.broadcast({
                    type: 'hyperparameter_tuning_error',
                    data: { success: false, error: tuningError.message }
                });
            }
        }
    } catch (error) {
        console.error('Ошибка запуска подбора гиперпараметров:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка запуска подбора гиперпараметров',
            error: error.message
        });
    }
});

export default router;
