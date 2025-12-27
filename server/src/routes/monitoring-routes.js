import express from 'express';
import MonitoringService from '../services/MonitoringService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validateQuery, validateParams, validationRules } from '../middleware/validation.js';
import { NotFoundError, AuthorizationError } from '../utils/errors/AppError.js';

const router = express.Router();

/**
 * GET /api/monitoring/metrics
 * Получение всех метрик
 */
router.get('/metrics', asyncHandler(async (req, res) => {
    const metrics = MonitoringService.getMetrics();
    res.json({
        success: true,
        data: metrics
    });
}));

/**
 * GET /api/monitoring/alerts
 * Получение алертов
 */
router.get('/alerts', 
    validateQuery({
        category: validationRules.string({ required: false }),
        severity: validationRules.enum(['low', 'medium', 'high', 'critical'], { required: false }),
        resolved: validationRules.boolean({ required: false }),
        limit: validationRules.number({ min: 1, max: 1000, required: false })
    }),
    asyncHandler(async (req, res) => {
        const { category, severity, resolved, limit } = req.query;
        
        const alerts = MonitoringService.getAlerts({
            category,
            severity,
            resolved: resolved === 'true' ? true : resolved === 'false' ? false : undefined,
            limit: limit ? parseInt(limit) : undefined
        });
        
        res.json({
            success: true,
            data: alerts,
            count: alerts.length
        });
}));

/**
 * POST /api/monitoring/alerts/:id/resolve
 * Разрешение алерта
 */
router.post('/alerts/:id/resolve', 
    validateParams({
        id: validationRules.string({ required: true, minLength: 1 })
    }),
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const alert = MonitoringService.resolveAlert(id);
        
        if (!alert) {
            throw new NotFoundError('Alert');
        }
        
        res.json({
            success: true,
            data: alert
        });
}));

/**
 * GET /api/monitoring/performance
 * Получение статистики производительности
 */
router.get('/performance', asyncHandler(async (req, res) => {
    const stats = MonitoringService.getPerformanceStats();
    res.json({
        success: true,
        data: stats
    });
}));

/**
 * GET /api/monitoring/health
 * Health check с детальной информацией
 */
router.get('/health', asyncHandler(async (req, res) => {
    const health = MonitoringService.getHealthStatus();
    res.json({
        success: true,
        data: health
    });
}));

/**
 * GET /api/monitoring/report
 * Детальный отчет о состоянии системы
 */
router.get('/report', asyncHandler(async (req, res) => {
    const metrics = MonitoringService.getMetrics();
    const performance = MonitoringService.getPerformanceStats();
    const health = MonitoringService.getHealthStatus();
    const alerts = MonitoringService.getAlerts({ limit: 50 });
    
    res.json({
        success: true,
        data: {
            metrics,
            performance,
            health,
            recentAlerts: alerts,
            timestamp: new Date().toISOString()
        }
    });
}));

/**
 * POST /api/monitoring/reset
 * Сброс метрик (только для разработки)
 */
router.post('/reset', asyncHandler(async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        throw new AuthorizationError('Reset is not allowed in production');
    }
    
    MonitoringService.resetMetrics();
    res.json({
        success: true,
        message: 'Metrics reset successfully'
    });
}));

export default router;

