import express from 'express';
import CacheService from '../services/CacheService.js';
import TinkoffApiService from '../services/TinkoffApiService.js';
import ServiceManager from '../services/ServiceManager.js';

const router = express.Router();

/**
 * Инструменты
 */
router.get('/instruments', async (req, res) => {
    try {
        const instruments = await CacheService.getAllInstruments();
        res.json({
            success: true,
            data: instruments
        });
    } catch (error) {
        console.error('Ошибка получения инструментов:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения инструментов',
            error: error.message
        });
    }
});

/**
 * Рекомендации
 */
router.get('/recommendations', async (req, res) => {
    try {
        const recommendations = await CacheService.getRecommendations();
        res.json({
            success: true,
            data: recommendations
        });
    } catch (error) {
        console.error('Ошибка получения рекомендаций:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения рекомендаций',
            error: error.message
        });
    }
});

/**
 * Обновление рынка
 */
router.post('/refresh', async (req, res) => {
    try {
        const result = await CacheService.updateCache();
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка обновления рынка:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка обновления рынка',
            error: error.message
        });
    }
});

/**
 * Тестовый endpoint для проверки fallback
 * GET /api/market/test-fallback/stocks
 * Напрямую вызывает TinkoffApiService.getStocks() для тестирования fallback
 */
router.get('/test-fallback/stocks', async (req, res) => {
    try {
        console.log('🧪 Тестовый запрос к TinkoffApiService.getStocks() для проверки fallback');
        const stocks = await TinkoffApiService.getStocks();
        
        // Проверяем, откуда пришли данные
        const fromCache = stocks._fromCache || false;
        const cacheAge = stocks._cacheAge || null;
        const simplified = stocks._simplified || false;
        
        // Убираем метаданные из ответа
        const cleanStocks = { ...stocks };
        delete cleanStocks._fromCache;
        delete cleanStocks._cacheAge;
        delete cleanStocks._simplified;
        delete cleanStocks._originalError;
        
        res.json({
            success: true,
            data: cleanStocks,
            meta: {
                fromCache: fromCache,
                cacheAge: cacheAge ? Math.round(cacheAge / 1000 / 60) : null, // в минутах
                simplified: simplified
            }
        });
    } catch (error) {
        console.error('❌ Ошибка тестового запроса:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка тестового запроса',
            error: error.message
        });
    }
});

/**
 * Тестовый endpoint для проверки fallback свечей
 * GET /api/market/test-fallback/candles/:figi?days=30&interval=DAY
 */
router.get('/test-fallback/candles/:figi', async (req, res) => {
    try {
        const { figi } = req.params;
        const days = parseInt(req.query.days) || 30;
        const interval = req.query.interval || 'DAY';
        
        const to = new Date();
        const from = new Date();
        from.setDate(from.getDate() - days);
        
        console.log(`🧪 Тестовый запрос к TinkoffApiService.getCandles() для ${figi}`);
        const candles = await TinkoffApiService.getCandles(figi, interval, from, to);
        
        // Проверяем, откуда пришли данные
        const fromCache = candles._fromCache || false;
        const cacheAge = candles._cacheAge || null;
        const simplified = candles._simplified || false;
        
        // Убираем метаданные из ответа
        const cleanCandles = { ...candles };
        delete cleanCandles._fromCache;
        delete cleanCandles._cacheAge;
        delete cleanCandles._simplified;
        delete cleanCandles._originalError;
        
        res.json({
            success: true,
            data: cleanCandles,
            meta: {
                fromCache: fromCache,
                cacheAge: cacheAge ? Math.round(cacheAge / 1000 / 60) : null, // в минутах
                simplified: simplified
            }
        });
    } catch (error) {
        console.error('❌ Ошибка тестового запроса свечей:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка тестового запроса свечей',
            error: error.message
        });
    }
});

/**
 * Детальная информация об инструменте
 * GET /api/market/stock/:figi
 */
router.get('/stock/:figi', async (req, res) => {
    try {
        const { figi } = req.params;
        
        const instrument = await CacheService.getInstrument(figi);
        if (!instrument) {
            return res.status(404).json({
                success: false,
                message: 'Инструмент не найден'
            });
        }
        
        // Формируем детальную информацию
        const { formatDateToISO } = await import('../utils/dateFormatter.js');
        const stockDetail = {
            figi: instrument.figi,
            ticker: instrument.ticker,
            name: instrument.name,
            sector: instrument.sector,
            currentPrice: instrument.lastPrice || 0,
            currency: instrument.currency || 'RUB',
            lot: instrument.lot || 1,
            dividendYield: instrument.dividendYield || null,
            lastPrice: instrument.lastPrice || null,
            lastPriceTime: formatDateToISO(instrument.lastPriceTime)
        };
        
        res.json({
            success: true,
            data: stockDetail
        });
    } catch (error) {
        console.error('Ошибка получения детальной информации об инструменте:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения детальной информации об инструменте',
            error: error.message
        });
    }
});

/**
 * Свечи для инструмента
 * GET /api/market/stock/:figi/candles?days=365&interval=DAY
 */
router.get('/stock/:figi/candles', async (req, res) => {
    try {
        const { figi } = req.params;
        const days = parseInt(req.query.days) || 365;
        const interval = req.query.interval || 'DAY'; // DAY, HOUR, etc.
        
        const candles = await CacheService.getCandles(figi, interval, days);
        
        // Преобразуем в формат для фронтенда
        const { formatDateToISO } = await import('../utils/dateFormatter.js');
        const formattedCandles = candles.map(candle => {
            // Преобразуем Sequelize модель в обычный объект
            const candleData = candle.toJSON ? candle.toJSON() : candle;
            
            return {
                time: formatDateToISO(candleData.time),
                open: candleData.open || 0,
                high: candleData.high || 0,
                low: candleData.low || 0,
                close: candleData.close || 0,
                volume: candleData.volume || 0
            };
        });
        
        res.json({
            success: true,
            data: formattedCandles
        });
    } catch (error) {
        console.error('Ошибка получения свечей:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения свечей',
            error: error.message
        });
    }
});

/**
 * Последняя рекомендация для инструмента (если свежая)
 * GET /api/market/stock/:figi/latest-recommendation?maxAgeHours=1
 */
router.get('/stock/:figi/latest-recommendation', async (req, res) => {
    try {
        const { figi } = req.params;
        const maxAgeHours = parseInt(req.query.maxAgeHours) || 1; // По умолчанию 1 час
        const Recommendation = (await import('../models/Recommendation.js')).default;
        
        // Получаем последнюю активную рекомендацию
        const latestRec = await Recommendation.findOne({
            where: { 
                figi,
                isActive: true
            },
            order: [['analysisDate', 'DESC']]
        });
        
        if (!latestRec) {
            return res.json({
                success: true,
                data: null,
                isFresh: false,
                reason: 'No recommendation found in database'
            });
        }
        
        // Проверяем, свежая ли рекомендация
        const ageHours = (Date.now() - new Date(latestRec.analysisDate).getTime()) / (1000 * 60 * 60);
        const isFresh = ageHours < maxAgeHours;
        
        if (isFresh) {
            // Форматируем даты
            const { formatModelDates } = await import('../utils/dateFormatter.js');
            const formattedRec = formatModelDates(latestRec, ['analysisDate', 'validUntil', 'createdAt', 'updatedAt']);
            
            // Возвращаем данные в формате, совместимом с IntegratedAIService
            res.json({
                success: true,
                data: {
                    recommendation: formattedRec.recommendation || latestRec.recommendation,
                    score: formattedRec.score || latestRec.score,
                    confidence: formattedRec.confidence || latestRec.confidence,
                    explanation: formattedRec.explanation || latestRec.explanation,
                    analysis: formattedRec.analysis || latestRec.analysis,
                    agreement: formattedRec.analysis?.agreement || latestRec.analysis?.agreement || 0,
                    horizons: formattedRec.analysis?.horizons || latestRec.analysis?.horizons || null,
                    summary: formattedRec.explanation?.summary || latestRec.explanation?.summary || latestRec.explanation?.details?.summary || '',
                    analysisDate: formattedRec.analysisDate,
                    isFromDatabase: true
                },
                isFresh: true,
                ageHours: ageHours.toFixed(2)
            });
        } else {
            res.json({
                success: true,
                data: null,
                isFresh: false,
                reason: `Recommendation is too old (${ageHours.toFixed(2)} hours, max ${maxAgeHours} hours)`,
                ageHours: ageHours.toFixed(2)
            });
        }
    } catch (error) {
        console.error('Ошибка получения последней рекомендации:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения последней рекомендации',
            error: error.message
        });
    }
});

/**
 * История предсказаний для инструмента
 * GET /api/market/stock/:figi/predictions
 */
router.get('/stock/:figi/predictions', async (req, res) => {
    try {
        const { figi } = req.params;
        const Recommendation = (await import('../models/Recommendation.js')).default;
        
        // Получаем все рекомендации для этого инструмента (включая неактивные для истории)
        const recommendations = await Recommendation.findAll({
            where: { figi },
            order: [['analysisDate', 'DESC']],
            limit: 100 // Последние 100 предсказаний
        });
        
        // Форматируем даты
        const { formatModelsDates } = await import('../utils/dateFormatter.js');
        const formattedRecs = formatModelsDates(recommendations, ['analysisDate', 'validUntil', 'createdAt', 'updatedAt']);
        
        const predictionHistory = formattedRecs.map(rec => ({
            id: rec.figi + '_' + rec.analysisDate,
            analysisDate: rec.analysisDate,
            recommendation: rec.recommendation,
            score: rec.score || 0,
            confidence: rec.confidence || 0,
            explanation: rec.explanation || null
        }));
        
        res.json({
            success: true,
            data: predictionHistory
        });
    } catch (error) {
        console.error('Ошибка получения истории предсказаний:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения истории предсказаний',
            error: error.message
        });
    }
});

/**
 * Получение торговых сигналов для инструмента из БД
 * GET /api/market/stock/:figi/signals?limit=20&activeOnly=true
 */
router.get('/stock/:figi/signals', async (req, res) => {
    try {
        const { figi } = req.params;
        const { from, to, direction, activeOnly, limit } = req.query;
        
        const SignalCacheService = (await import('../services/SignalCacheService.js')).default;
        
        const requestedLimit = limit ? parseInt(limit) : 20;
        const options = {
            limit: requestedLimit
        };
        if (from) options.from = new Date(from);
        if (to) options.to = new Date(to);
        if (direction) options.direction = direction;
        if (activeOnly === 'true') options.activeOnly = true;
        
        // Сначала проверяем, есть ли сигналы в БД
        let signals = await SignalCacheService.getSignalsByFigi(figi, options);
        
        // Если сигналов нет в БД или их мало (и нет фильтров по датам/направлению), запрашиваем с максимальным лимитом
        if (signals.length === 0 || (signals.length < requestedLimit && !from && !to && !direction)) {
            console.log(`📡 Сигналов в БД для ${figi}: ${signals.length}, запрашиваем из API с максимальным лимитом...`);
            
            // Запрашиваем с максимальным лимитом (1000 - обычно максимальный лимит для API)
            const fetchOptions = {
                limit: 1000, // Максимальный лимит для получения всех доступных сигналов
                pageNumber: 0
            };
            
            const fetchResult = await SignalCacheService.fetchAndCacheSignals(figi, fetchOptions);
            
            if (fetchResult.success && fetchResult.savedCount > 0) {
                console.log(`✅ Загружено и сохранено ${fetchResult.savedCount} сигналов для ${figi}`);
                
                // Теперь получаем сигналы из БД с нужными фильтрами
                signals = await SignalCacheService.getSignalsByFigi(figi, options);
            }
        }
        
        // Преобразуем сигналы в формат для фронтенда
        const { formatDateToISO } = await import('../utils/dateFormatter.js');
        const formattedSignals = signals.map(signal => {
            // Преобразуем цену из формата {units, nano} в число
            const formatPrice = (priceObj) => {
                if (!priceObj) return null;
                if (typeof priceObj === 'number') return priceObj;
                const units = parseFloat(priceObj.units || 0);
                const nano = parseFloat(priceObj.nano || 0) / 1000000000;
                return units + nano;
            };
            
            // Преобразуем Sequelize модель в обычный объект
            const signalData = signal.toJSON ? signal.toJSON() : signal;
            const createDt = formatDateToISO(signalData.createDt || signal.createDt);
            const endDt = formatDateToISO(signalData.endDt || signal.endDt);
            
            return {
                signalId: signalData.signalId || signal.signalId,
                strategyId: signalData.strategyId || signal.strategyId,
                strategyName: signalData.strategyName || signal.strategyName,
                instrumentUid: signalData.instrumentUid || signal.instrumentUid,
                figi: signalData.figi || signal.figi,
                createDt: createDt,
                endDt: endDt,
                direction: signalData.direction || signal.direction,
                initialPrice: formatPrice(signalData.initialPrice || signal.initialPrice),
                targetPrice: formatPrice(signalData.targetPrice || signal.targetPrice),
                stoploss: formatPrice(signalData.stoploss || signal.stoploss),
                probability: signalData.probability || signal.probability,
                name: signalData.name || signal.name,
                info: signalData.info || signal.info,
                isActive: endDt ? new Date(endDt) >= new Date() : false
            };
        });
        
        res.json({
            success: true,
            data: formattedSignals
        });
    } catch (error) {
        console.error('Ошибка получения сигналов из БД:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения сигналов из БД',
            error: error.message
        });
    }
});

/**
 * Запрос и кеширование торговых сигналов для инструмента из API
 * POST /api/market/stock/:figi/signals/fetch
 */
router.post('/stock/:figi/signals/fetch', async (req, res) => {
    try {
        const { figi } = req.params;
        
        const SignalCacheService = (await import('../services/SignalCacheService.js')).default;
        
        const result = await SignalCacheService.fetchAndCacheSignals(figi);
        
        if (result.success) {
            res.json({
                success: true,
                message: `Загружено и сохранено ${result.savedCount} сигналов`,
                data: {
                    savedCount: result.savedCount,
                    totalSignals: result.totalSignals || 0
                }
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Ошибка загрузки сигналов',
                error: result.error || 'Неизвестная ошибка'
            });
        }
    } catch (error) {
        console.error('Ошибка запроса сигналов:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка запроса сигналов',
            error: error.message
        });
    }
});

/**
 * Получение всех сигналов из БД
 * GET /api/market/signals?limit=50&from=2024-01-01&to=2024-12-31&direction=BUY&activeOnly=true
 */
router.get('/signals', async (req, res) => {
    try {
        const { limit, from, to, direction, activeOnly } = req.query;
        
        const SignalCacheService = (await import('../services/SignalCacheService.js')).default;
        
        const options = {};
        if (limit) options.limit = parseInt(limit);
        if (from) options.from = new Date(from);
        if (to) options.to = new Date(to);
        if (direction) options.direction = direction;
        if (activeOnly === 'true') options.activeOnly = true;
        
        const signals = await SignalCacheService.getAllSignals(options);
        
        // Преобразуем сигналы в формат для фронтенда
        const formatPrice = (priceObj) => {
            if (!priceObj) return null;
            if (typeof priceObj === 'number') return priceObj;
            const units = parseFloat(priceObj.units || 0);
            const nano = parseFloat(priceObj.nano || 0) / 1000000000;
            return units + nano;
        };
        
        const formattedSignals = signals.map(signal => {
            return {
                signalId: signal.signalId,
                strategyId: signal.strategyId,
                strategyName: signal.strategyName,
                instrumentUid: signal.instrumentUid,
                figi: signal.figi,
                ticker: signal.ticker || null,
                name: signal.instrumentName || signal.name || null, // Название инструмента (приоритет) или сигнала
                signalName: signal.name || null, // Название сигнала
                createDt: signal.createDt,
                endDt: signal.endDt,
                direction: signal.direction,
                initialPrice: formatPrice(signal.initialPrice),
                targetPrice: formatPrice(signal.targetPrice),
                stoploss: formatPrice(signal.stoploss),
                probability: signal.probability,
                info: signal.info
            };
        });
        
        res.json({
            success: true,
            data: formattedSignals,
            count: formattedSignals.length
        });
    } catch (error) {
        console.error('Ошибка получения всех сигналов из БД:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения сигналов из БД',
            error: error.message
        });
    }
});

/**
 * Получение сигналов из БД по FIGI
 * GET /api/market/signals/:figi?from=2024-01-01&to=2024-12-31&direction=BUY&activeOnly=true
 */
router.get('/signals/:figi', async (req, res) => {
    try {
        const { figi } = req.params;
        const { from, to, direction, activeOnly } = req.query;
        
        const SignalCacheService = (await import('../services/SignalCacheService.js')).default;
        
        const options = {};
        if (from) options.from = new Date(from);
        if (to) options.to = new Date(to);
        if (direction) options.direction = direction;
        if (activeOnly === 'true') options.activeOnly = true;
        
        const signals = await SignalCacheService.getSignalsByFigi(figi, options);
        
        // Преобразуем сигналы в формат для фронтенда
        const formattedSignals = signals.map(signal => ({
            signalId: signal.signalId,
            strategyId: signal.strategyId,
            strategyName: signal.strategyName,
            instrumentUid: signal.instrumentUid,
            figi: signal.figi,
            createDt: signal.createDt,
            endDt: signal.endDt,
            direction: signal.direction,
            initialPrice: signal.initialPrice,
            targetPrice: signal.targetPrice,
            stoploss: signal.stoploss,
            probability: signal.probability,
            name: signal.name,
            info: signal.info
        }));
        
        res.json({
            success: true,
            data: formattedSignals,
            count: formattedSignals.length
        });
    } catch (error) {
        console.error('Ошибка получения сигналов из БД:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения сигналов из БД',
            error: error.message
        });
    }
});

export default router;
