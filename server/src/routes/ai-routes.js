import express from 'express';
import IntegratedAIService from '../services/IntegratedAIService.js';
import ServiceManager from '../services/ServiceManager.js';
import OptimizedTelegramService from '../services/OptimizedTelegramService.js';
import SignalValidationService from '../services/SignalValidationService.js';

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
        
        // Сохраняем рекомендацию в БД (в фоне, не блокируем ответ)
        (async () => {
            try {
                await saveSingleRecommendationToDatabase(figi, recommendation);
            } catch (saveError) {
                console.warn('⚠️ Failed to save recommendation to database:', saveError.message);
            }
        })();
        
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
            console.log('Обучение ИИ завершено:', result?.success ? 'Успешно' : 'Ошибка');
            
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

/**
 * Валидация предсказания модели против сигналов аналитиков
 * POST /api/ai/validate-prediction
 */
router.post('/validate-prediction', async (req, res) => {
    try {
        const { figi, prediction, timestamp } = req.body;
        
        if (!figi || !prediction) {
            return res.status(400).json({
                success: false,
                message: 'FIGI and prediction are required'
            });
        }

        const validationResult = await SignalValidationService.validatePredictionAgainstSignals(
            figi,
            prediction,
            timestamp ? new Date(timestamp) : new Date()
        );
        
        res.json({
            success: validationResult.success,
            data: validationResult
        });
    } catch (error) {
        console.error('Ошибка валидации предсказания:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка валидации предсказания',
            error: error.message
        });
    }
});

/**
 * Получение метрик качества предсказаний
 * GET /api/ai/quality-metrics?figi=XXX&from=2024-01-01&to=2024-12-31
 */
router.get('/quality-metrics', async (req, res) => {
    try {
        const { figi, from, to } = req.query;
        
        const metrics = await SignalValidationService.getQualityMetrics(
            figi || null,
            from ? new Date(from) : null,
            to ? new Date(to) : null
        );
        
        res.json({
            success: metrics.success,
            data: metrics
        });
    } catch (error) {
        console.error('Ошибка получения метрик качества:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения метрик качества',
            error: error.message
        });
    }
});

/**
 * Оценка исторических сигналов
 * GET /api/ai/historical-signals?figi=XXX&from=2024-01-01&to=2024-12-31
 */
router.get('/historical-signals', async (req, res) => {
    try {
        const { figi, from, to } = req.query;
        
        const evaluation = await SignalValidationService.evaluateHistoricalSignals(
            figi || null,
            from ? new Date(from) : null,
            to ? new Date(to) : null
        );
        
        res.json({
            success: evaluation.success,
            data: evaluation
        });
    } catch (error) {
        console.error('Ошибка оценки исторических сигналов:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка оценки исторических сигналов',
            error: error.message
        });
    }
});

/**
 * Сохранение одной рекомендации в БД
 */
async function saveSingleRecommendationToDatabase(figi, prediction) {
    try {
        const Recommendation = (await import('../models/Recommendation.js')).default;
        const CacheService = (await import('../services/CacheService.js')).default;
        const RiskManagementService = (await import('../services/RiskManagementService.js')).default;
        const StrategyAllocationService = (await import('../services/StrategyAllocationService.js')).default;
        
        const instrument = await CacheService.getInstrument(figi, true);
        if (!instrument) {
            console.warn(`⚠️ Instrument ${figi} not found, skipping recommendation save`);
            return;
        }
        
        const score = typeof prediction?.score === 'number' && !isNaN(prediction.score) 
            ? Math.max(0, Math.min(1, prediction.score))
            : 0;
        
        let confidence;
        if (typeof prediction?.confidence === 'number' && !isNaN(prediction.confidence)) {
            // Нормализуем confidence: если больше 1, значит это процент (0-100), делим на 100
            if (prediction.confidence > 1) {
                confidence = Math.max(0, Math.min(1, prediction.confidence / 100));
            } else {
                confidence = Math.max(0, Math.min(1, prediction.confidence));
            }
        } else {
            confidence = Math.max(0, Math.min(1, score * 0.9));
        }
        
        // Логируем для отладки
        console.log(`💾 Saving recommendation for ${figi}: confidence=${confidence}, score=${score}, prediction.confidence=${prediction?.confidence}`);
        
        let explanation = {};
        if (prediction?.summary) {
            const summaryValue = typeof prediction.summary === 'string' 
                ? prediction.summary 
                : prediction.summary.summary || JSON.stringify(prediction.summary);
            explanation = {
                summary: summaryValue,
                details: prediction.details || prediction.horizons || {}
            };
        } else if (prediction?.explanation) {
            if (typeof prediction.explanation === 'string') {
                explanation = {
                    summary: prediction.explanation,
                    details: prediction.details || {}
                };
            } else {
                explanation = prediction.explanation;
            }
        } else {
            explanation = {
                summary: 'Анализ на основе интегрированной AI системы',
                details: {}
            };
        }
        
        let analysis = {};
        if (prediction?.horizons) {
            analysis = {
                horizons: prediction.horizons,
                agreement: prediction.agreement || null
            };
        }
        
        const recommendation = prediction?.recommendation || 'HOLD';
        const currentPrice = instrument.lastPrice || null;
        
        let strategyId = null;
        let strategy = null;
        try {
            strategy = await StrategyAllocationService.getStrategyForRecommendation({ confidence, score });
            if (strategy) {
                strategyId = strategy.id;
            }
        } catch (strategyError) {
            // Игнорируем ошибки определения стратегии
        }
        
        let targetPrice, stopLoss, takeProfit;
        if (currentPrice) {
            try {
                if (RiskManagementService && RiskManagementService.isInitialized && strategy) {
                    stopLoss = await RiskManagementService.calculateDynamicStopLoss(
                        figi,
                        currentPrice,
                        strategy,
                        recommendation === 'SELL' ? 'SELL' : 'BUY'
                    );
                } else {
                    if (recommendation === 'BUY') {
                        stopLoss = currentPrice * 0.9;
                    } else if (recommendation === 'SELL') {
                        stopLoss = currentPrice * 1.1;
                    } else {
                        stopLoss = currentPrice * 0.95;
                    }
                }
            } catch (error) {
                if (recommendation === 'BUY') {
                    stopLoss = currentPrice * 0.9;
                } else if (recommendation === 'SELL') {
                    stopLoss = currentPrice * 1.1;
                } else {
                    stopLoss = currentPrice * 0.95;
                }
            }
            
            if (recommendation === 'BUY') {
                targetPrice = currentPrice * 1.1;
                takeProfit = currentPrice * 1.2;
            } else if (recommendation === 'SELL') {
                targetPrice = currentPrice * 0.9;
                takeProfit = currentPrice * 0.8;
            } else {
                targetPrice = currentPrice * 1.05;
                takeProfit = currentPrice * 1.1;
            }
        }
        
        const recommendationData = {
            figi: figi,
            ticker: instrument.ticker || 'UNKNOWN',
            name: instrument.name || 'Unknown',
            recommendation: recommendation,
            confidence: confidence,
            score: score,
            explanation: explanation,
            analysis: analysis,
            analysisDate: new Date(),
            modelVersion: '1.0',
            priceAtAnalysis: currentPrice,
            targetPrice: targetPrice,
            stopLoss: stopLoss,
            takeProfit: takeProfit,
            sector: instrument.sector || 'Unknown',
            marketCap: instrument.marketCap || 'Unknown',
            isActive: true,
            strategyId: strategyId
        };
        
        // Используем upsert для обновления существующей записи или создания новой
        // Поскольку figi является первичным ключом, мы обновляем существующую запись
        const [savedRecommendation, created] = await Recommendation.upsert(recommendationData, {
            returning: true
        });
        
        if (created) {
            console.log(`✅ Created ${recommendation} recommendation for ${instrument.ticker} in DB`);
        } else {
            console.log(`✅ Updated ${recommendation} recommendation for ${instrument.ticker} in DB`);
        }
    } catch (error) {
        console.error('❌ Error saving recommendation to database:', error);
        throw error;
    }
}

export default router;
