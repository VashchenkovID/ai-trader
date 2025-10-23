import express from 'express';
import NewsAnalysisService from '../services/NewsAnalysisService.js';
import ServiceManager from '../services/ServiceManager.js';

const router = express.Router();

/**
 * Новости по FIGI
 */
router.get('/:figi', async (req, res) => {
    try {
        const { figi } = req.params;
        const news = await NewsAnalysisService.getNewsByFigi(figi);
        res.json({
            success: true,
            data: news
        });
    } catch (error) {
        console.error('Ошибка получения новостей:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения новостей',
            error: error.message
        });
    }
});

/**
 * Влияние новостей по FIGI
 */
router.get('/:figi/impact', async (req, res) => {
    try {
        const { figi } = req.params;
        const impact = await NewsAnalysisService.getNewsImpact(figi);
        res.json({
            success: true,
            data: impact
        });
    } catch (error) {
        console.error('Ошибка получения влияния новостей:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения влияния новостей',
            error: error.message
        });
    }
});

/**
 * Статус новостей
 */
router.get('/status', async (req, res) => {
    try {
        const status = await NewsAnalysisService.getStatus();
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('Ошибка получения статуса новостей:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статуса новостей',
            error: error.message
        });
    }
});

export default router;
