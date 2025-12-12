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
            lastPriceTime: instrument.lastPriceTime || null
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
        const formattedCandles = candles.map(candle => ({
            time: candle.time,
            open: candle.open || 0,
            high: candle.high || 0,
            low: candle.low || 0,
            close: candle.close || 0,
            volume: candle.volume || 0
        }));
        
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
            // Возвращаем данные в формате, совместимом с IntegratedAIService
            res.json({
                success: true,
                data: {
                    recommendation: latestRec.recommendation,
                    score: latestRec.score,
                    confidence: latestRec.confidence,
                    explanation: latestRec.explanation,
                    analysis: latestRec.analysis,
                    agreement: latestRec.analysis?.agreement || 0,
                    horizons: latestRec.analysis?.horizons || null,
                    summary: latestRec.explanation?.summary || latestRec.explanation?.details?.summary || '',
                    analysisDate: latestRec.analysisDate,
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
        
        const predictionHistory = recommendations.map(rec => ({
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
        
        const options = {
            limit: limit ? parseInt(limit) : 20 // По умолчанию 20 сигналов
        };
        if (from) options.from = new Date(from);
        if (to) options.to = new Date(to);
        if (direction) options.direction = direction;
        if (activeOnly === 'true') options.activeOnly = true;
        
        const signals = await SignalCacheService.getSignalsByFigi(figi, options);
        
        // Преобразуем сигналы в формат для фронтенда
        const formattedSignals = signals.map(signal => {
            // Преобразуем цену из формата {units, nano} в число
            const formatPrice = (priceObj) => {
                if (!priceObj) return null;
                if (typeof priceObj === 'number') return priceObj;
                const units = parseFloat(priceObj.units || 0);
                const nano = parseFloat(priceObj.nano || 0) / 1000000000;
                return units + nano;
            };
            
            return {
                signalId: signal.signalId,
                strategyId: signal.strategyId,
                strategyName: signal.strategyName,
                instrumentUid: signal.instrumentUid,
                figi: signal.figi,
                createDt: signal.createDt,
                endDt: signal.endDt,
                direction: signal.direction,
                initialPrice: formatPrice(signal.initialPrice),
                targetPrice: formatPrice(signal.targetPrice),
                stoploss: formatPrice(signal.stoploss),
                probability: signal.probability,
                name: signal.name,
                info: signal.info,
                isActive: new Date(signal.endDt) >= new Date()
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
