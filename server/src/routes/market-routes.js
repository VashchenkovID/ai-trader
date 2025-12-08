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
 * Получение торговых сигналов для инструмента через Tinkoff API
 * GET /api/market/stock/:figi/signals
 */
router.get('/stock/:figi/signals', async (req, res) => {
    try {
        const { figi } = req.params;
        
        console.log(`🔍 Запрос сигналов для FIGI: ${figi}`);
        
        // Пробуем получить сигналы через Tinkoff API
        const result = await TinkoffApiService.getSignals(figi);
        
        if (result.success) {
            res.json({
                success: true,
                message: 'Сигналы успешно получены',
                data: result.data,
                path: result.path,
                rawResponse: result
            });
        } else {
            // Если метод не найден, возвращаем информацию об ошибке
            res.status(404).json({
                success: false,
                message: 'Метод GetSignals не найден или недоступен',
                error: result.error,
                details: result.details,
                note: 'Возможно, метод GetSignals недоступен в текущей версии API или требует специальных прав доступа'
            });
        }
    } catch (error) {
        console.error('Ошибка получения сигналов:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения сигналов',
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

export default router;
