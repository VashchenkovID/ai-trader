import express from 'express';
import IntegratedAIService from '../services/IntegratedAIService.js';
import ServiceManager from '../services/ServiceManager.js';
import OptimizedTelegramService from '../services/OptimizedTelegramService.js';
import SignalValidationService from '../services/SignalValidationService.js';
import MultiTimeframeService from '../services/MultiTimeframeService.js';

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
            const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
            if (WebSocketService && typeof WebSocketService.broadcast === 'function') {
                WebSocketService.broadcast({
                    type: 'ai_training_completed',
                    data: {
                        success: true,
                        result: result
                    },
                    timestamp: new Date().toISOString()
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
            const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
            if (WebSocketService && typeof WebSocketService.broadcast === 'function') {
                WebSocketService.broadcast({
                    type: 'ai_training_error',
                    data: {
                        success: false,
                        error: trainingError.message
                    },
                    timestamp: new Date().toISOString()
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
        
        // Преобразуем Sequelize модель в обычный объект для надежного доступа к полям
        const instrumentData = instrument.toJSON ? instrument.toJSON() : instrument;
        
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
        
        // Сохраняем горизонты в правильной структуре для фронтенда
        if (prediction?.horizons) {
            // Если горизонты есть, добавляем их в explanation.details.ensemble
            if (!explanation.details) {
                explanation.details = {};
            }
            if (!explanation.details.ensemble) {
                explanation.details.ensemble = {};
            }
            explanation.details.ensemble.horizons = prediction.horizons;
        }
        
        let analysis = {};
        if (prediction?.horizons) {
            analysis = {
                horizons: prediction.horizons,
                agreement: prediction.agreement || null
            };
        }
        
        const recommendation = prediction?.recommendation || 'HOLD';
        
        // Получаем цену: сначала из кеша, если нет - пытаемся получить через API
        let currentPrice = null;
        
        // Используем утилиту для надежного извлечения из Sequelize модели
        const { getField } = await import('../utils/sequelizeUtils.js');
        
        // Пробуем получить цену из разных источников (на случай если Sequelize возвращает по-разному)
        const lastPriceFromUtil = getField(instrument, 'lastPrice');
        const averagePriceFromUtil = getField(instrument, 'averagePrice');
        const lastPrice = lastPriceFromUtil || instrumentData.lastPrice || instrument.get?.('lastPrice') || instrument.dataValues?.lastPrice || instrument.lastPrice;
        
        // Пробуем получить цену из кеша, конвертируя в число если нужно
        if (lastPrice !== null && lastPrice !== undefined) {
            // Конвертируем в число, если это строка
            const cachedPrice = typeof lastPrice === 'string' 
                ? parseFloat(lastPrice) 
                : Number(lastPrice);
            
            // Проверяем, что это валидное число и больше 0
            if (!isNaN(cachedPrice) && isFinite(cachedPrice) && cachedPrice > 0) {
                currentPrice = cachedPrice;
            }
        }
        
        // Если цена не найдена в кеше или невалидна, пытаемся получить через API
        if (!currentPrice) {
            try {
                const TinkoffApiService = (await import('../services/TinkoffApiService.js')).default;
                const lastPricesResp = await TinkoffApiService.getLastPrices([figi]);
                if (lastPricesResp?.lastPrices && lastPricesResp.lastPrices.length > 0) {
                    const priceData = lastPricesResp.lastPrices[0];
                    if (priceData.price) {
                        const units = parseFloat(priceData.price.units || 0);
                        const nano = parseFloat(priceData.price.nano || 0);
                        currentPrice = units + nano / 1e9;
                        // Обновляем цену в кеше для будущих запросов
                        if (currentPrice > 0 && instrument.update) {
                            await instrument.update({ 
                                lastPrice: currentPrice, 
                                lastPriceTime: priceData.time ? new Date(priceData.time) : new Date() 
                            });
                        }
                    }
                }
            } catch (priceError) {
                // Игнорируем ошибки получения цены через API
            }
        }
        
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
        await Recommendation.upsert(recommendationData, {
            returning: true
        });
    } catch (error) {
        console.error('❌ Error saving recommendation to database:', error);
        throw error;
    }
}

/**
 * Анализ одного инструмента с сохранением в рекомендации (для отладки)
 */
router.post('/analyze-single-instrument', async (req, res) => {
    try {
        const { figi } = req.body;
        
        if (!figi) {
            return res.status(400).json({
                success: false,
                message: 'FIGI is required'
            });
        }

        console.log(`🔍 [DEBUG] Starting analysis for single instrument: ${figi}`);

        // Получаем сервисы
        const NeuralNetworkService = (await import('../services/NeuralNetworkService.js')).default;
        const CacheService = ServiceManager.getService('CacheService');
        
        // Инициализируем NeuralNetworkService, если нужно
        if (!NeuralNetworkService.isInitialized) {
            await NeuralNetworkService.initialize();
        }

        // Получаем инструмент из кеша
        let instrument;
        try {
            instrument = await CacheService.getInstrument(figi);
        } catch (cacheError) {
            console.error(`❌ [DEBUG] Error getting instrument from cache:`, cacheError);
            return res.status(500).json({
                success: false,
                message: `Error getting instrument from cache: ${cacheError.message}`
            });
        }

        if (!instrument) {
            return res.status(404).json({
                success: false,
                message: `Instrument with FIGI ${figi} not found in cache`
            });
        }

        console.log(`📊 [DEBUG] Instrument found: ${instrument.ticker} - ${instrument.name}`);

        // Используем IntegratedAIService для получения рекомендации
        const integratedRec = await IntegratedAIService.getIntegratedRecommendation(figi);
        
        console.log(`✅ [DEBUG] Got integrated recommendation:`, {
            recommendation: integratedRec.recommendation,
            score: integratedRec.score,
            confidence: integratedRec.confidence
        });

        // Формируем структуру для сохранения (как в analyzeAllInstruments)
        const prediction = {
            score: integratedRec.score || 0,
            confidence: integratedRec.confidence || integratedRec.score || 0,
            recommendation: integratedRec.recommendation || 'HOLD',
            explanation: integratedRec.summary || {},
            summary: typeof integratedRec.summary === 'string' ? integratedRec.summary : (integratedRec.summary?.summary || ''),
            details: integratedRec.details || {},
            horizons: integratedRec.horizons || null,
            agreement: integratedRec.agreement || null
        };

        // Получаем текущую цену
        let currentPrice = null;
        try {
            if (instrument.lastPrice && typeof instrument.lastPrice === 'number' && instrument.lastPrice > 0) {
                currentPrice = instrument.lastPrice;
            } else {
                const TinkoffApiService = (await import('../services/TinkoffApiService.js')).default;
                const lastPrices = await TinkoffApiService.getLastPrices([figi]);
                if (lastPrices && lastPrices[figi] && typeof lastPrices[figi] === 'number' && lastPrices[figi] > 0) {
                    currentPrice = lastPrices[figi];
                    // Обновляем кеш
                    const CachedInstrument = (await import('../models/CachedInstrument.js')).default;
                    await CachedInstrument.update(
                        { lastPrice: currentPrice, lastPriceTime: new Date() },
                        { where: { figi } }
                    );
                }
            }
        } catch (priceError) {
            console.warn(`⚠️ [DEBUG] Could not get price for ${figi}:`, priceError.message);
        }

        // Формируем запись для сохранения
        const buyRecommendation = {
            instrument: instrument,
            prediction: prediction,
            currentPrice: currentPrice
        };

        // Сохраняем рекомендацию в БД через NeuralNetworkService
        await NeuralNetworkService.saveRecommendationsToDatabase([buyRecommendation], []);

        console.log(`💾 [DEBUG] Recommendation saved to database for ${figi}`);

        // Получаем сохраненную рекомендацию из БД
        const Recommendation = (await import('../models/Recommendation.js')).default;
        const savedRecommendation = await Recommendation.findByPk(figi);

        res.json({
            success: true,
            message: `Analysis completed and saved for ${instrument.ticker}`,
            data: {
                figi: figi,
                ticker: instrument.ticker,
                name: instrument.name,
                recommendation: prediction.recommendation,
                score: prediction.score,
                confidence: prediction.confidence,
                priceAtAnalysis: currentPrice || 0,
                savedRecommendation: savedRecommendation ? savedRecommendation.toJSON() : null
            }
        });
    } catch (error) {
        console.error('❌ [DEBUG] Error analyzing single instrument:', error);
        res.status(500).json({
            success: false,
            message: 'Error analyzing single instrument',
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

/**
 * GET /api/ai/:figi/multi-timeframe
 * Мультитаймфреймовый анализ инструмента
 */
router.get('/:figi/multi-timeframe', async (req, res) => {
    try {
        const { figi } = req.params;
        const timeframes = req.query.timeframes ? req.query.timeframes.split(',') : ['H1', 'D1', 'W1'];
        const period = parseInt(req.query.period) || 30;

        if (!figi) {
            return res.status(400).json({
                success: false,
                message: 'FIGI is required'
            });
        }

        const result = await MultiTimeframeService.analyzeMultiTimeframe(figi, timeframes, period);
        
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Error getting multi-timeframe analysis:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting multi-timeframe analysis',
            error: error.message
        });
    }
});

export default router;
