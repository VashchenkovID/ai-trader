import express from 'express';
import FundamentalDataService from '../services/FundamentalDataService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validateQuery, validateParams, validationRules } from '../middleware/validation.js';
import LoggerService from '../services/LoggerService.js';

const router = express.Router();

/**
 * POST /api/fundamental-data/fill-all
 * Массовое заполнение фундаментальных данных по всем активам из БД
 */
router.post('/fill-all', asyncHandler(async (req, res) => {
    const { delayMs = 1000, forceUpdate = false } = req.body;
    
    LoggerService.info('Received request to fill fundamental data for all assets', {
        service: 'FundamentalDataRoutes',
        delayMs,
        forceUpdate
    });
    
    const stats = await FundamentalDataService.fillFundamentalDataForAllAssets({
        delayMs: parseInt(delayMs),
        forceUpdate: Boolean(forceUpdate)
    });
    
    res.json({
        success: true,
        message: 'Mass fill of fundamental data completed',
        data: stats
    });
}));

/**
 * POST /api/fundamental-data/sync-and-fill
 * Общий метод: синхронизация активов + заполнение фундаментальных данных
 */
router.post('/sync-and-fill', asyncHandler(async (req, res) => {
    const { 
        syncAssets = true, 
        forceUpdateAssets = false,
        delayMs = 1000, 
        forceUpdateFundamentals = false 
    } = req.body;
    
    LoggerService.info('Received request to sync assets and fill fundamental data', {
        service: 'FundamentalDataRoutes',
        syncAssets,
        forceUpdateAssets,
        delayMs,
        forceUpdateFundamentals
    });
    
    const result = await FundamentalDataService.syncAndFillFundamentalData({
        syncAssets: Boolean(syncAssets),
        forceUpdateAssets: Boolean(forceUpdateAssets),
        delayMs: parseInt(delayMs),
        forceUpdateFundamentals: Boolean(forceUpdateFundamentals)
    });
    
    res.json({
        success: true,
        message: 'Sync and fill completed',
        data: result
    });
}));

/**
 * GET /api/fundamental-data/:figi
 * Получение фундаментальных данных по FIGI
 */
router.get('/:figi',
    validateParams({
        figi: validationRules.string({ required: true })
    }),
    asyncHandler(async (req, res) => {
        const { figi } = req.params;
        const { date } = req.query;
        
        const targetDate = date ? new Date(date) : new Date();
        const data = await FundamentalDataService.getFundamentalData(figi, targetDate, false);
        
        if (data) {
            res.json({ success: true, data });
        } else {
            res.status(404).json({ success: false, message: 'Fundamental data not found' });
        }
    })
);

/**
 * GET /api/fundamental-data/:figi/features
 * Получение нормализованных фичей для нейросети
 */
router.get('/:figi/features',
    validateParams({
        figi: validationRules.string({ required: true })
    }),
    asyncHandler(async (req, res) => {
        const { figi } = req.params;
        const { timestamp } = req.query;
        
        const targetTimestamp = timestamp ? new Date(timestamp) : new Date();
        const features = await FundamentalDataService.getFundamentalFeatures(figi, targetTimestamp);
        
        res.json({
            success: true,
            data: {
                figi,
                features,
                count: features.length
            }
        });
    })
);

export default router;

