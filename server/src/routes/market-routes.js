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

export default router;
