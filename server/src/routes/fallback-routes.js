import express from 'express';
import FallbackService from '../services/FallbackService.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

/**
 * GET /api/fallback/stats
 * Получение статистики fallback для всех сервисов
 */
router.get('/stats', asyncHandler(async (req, res) => {
    const stats = FallbackService.getStats();
    
    res.json({
        success: true,
        data: stats
    });
}));

/**
 * GET /api/fallback/stats/:serviceName
 * Получение статистики fallback для конкретного сервиса
 */
router.get('/stats/:serviceName', asyncHandler(async (req, res) => {
    const { serviceName } = req.params;
    const stats = FallbackService.getStats(serviceName);
    
    res.json({
        success: true,
        data: stats
    });
}));

/**
 * GET /api/fallback/strategies
 * Получение конфигурации fallback стратегий
 */
router.get('/strategies', asyncHandler(async (req, res) => {
    const strategies = FallbackService.getStrategies();
    
    res.json({
        success: true,
        data: strategies
    });
}));

/**
 * PUT /api/fallback/strategies/:serviceName
 * Обновление конфигурации fallback стратегии
 */
router.put('/strategies/:serviceName', asyncHandler(async (req, res) => {
    const { serviceName } = req.params;
    const config = req.body;
    
    FallbackService.updateStrategy(serviceName, config);
    
    res.json({
        success: true,
        message: `Конфигурация fallback для ${serviceName} обновлена`
    });
}));

/**
 * POST /api/fallback/stats/reset
 * Сброс статистики fallback
 */
router.post('/stats/reset', asyncHandler(async (req, res) => {
    const { serviceName } = req.body;
    FallbackService.resetStats(serviceName);
    
    res.json({
        success: true,
        message: serviceName 
            ? `Статистика fallback для ${serviceName} сброшена`
            : 'Статистика fallback для всех сервисов сброшена'
    });
}));

export default router;

