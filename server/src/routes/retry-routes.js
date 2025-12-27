import express from 'express';
import RetryService from '../services/RetryService.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

/**
 * GET /api/retry/stats
 * Получение статистики retry для всех сервисов
 */
router.get('/stats', asyncHandler(async (req, res) => {
    const stats = RetryService.getAllStats();
    
    res.json({
        success: true,
        data: stats
    });
}));

/**
 * GET /api/retry/stats/:serviceName
 * Получение статистики retry для конкретного сервиса
 */
router.get('/stats/:serviceName', asyncHandler(async (req, res) => {
    const { serviceName } = req.params;
    const stats = RetryService.getStats(serviceName);
    const circuitBreaker = RetryService.getCircuitBreakerState(serviceName);
    
    res.json({
        success: true,
        data: {
            ...stats,
            circuitBreaker
        }
    });
}));

/**
 * GET /api/retry/circuit-breaker/:serviceName
 * Получение состояния circuit breaker для сервиса
 */
router.get('/circuit-breaker/:serviceName', asyncHandler(async (req, res) => {
    const { serviceName } = req.params;
    const state = RetryService.getCircuitBreakerState(serviceName);
    
    res.json({
        success: true,
        data: state
    });
}));

/**
 * POST /api/retry/circuit-breaker/:serviceName/reset
 * Сброс circuit breaker для сервиса
 */
router.post('/circuit-breaker/:serviceName/reset', asyncHandler(async (req, res) => {
    const { serviceName } = req.params;
    RetryService.resetCircuitBreaker(serviceName);
    
    res.json({
        success: true,
        message: `Circuit breaker для ${serviceName} сброшен`
    });
}));

export default router;

