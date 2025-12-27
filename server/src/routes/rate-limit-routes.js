import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validateQuery, validateParams, validationRules } from '../middleware/validation.js';
import {
    getRateLimitStats,
    getAllRateLimitStats,
    resetRateLimit,
    clearAllRateLimits
} from '../middleware/rateLimiter.js';

const router = express.Router();

/**
 * GET /api/rate-limit/stats
 * Получить статистику rate limiting для всех IP
 */
router.get('/stats', asyncHandler(async (req, res) => {
    const stats = getAllRateLimitStats();
    
    res.json({
        success: true,
        data: {
            total: stats.length,
            stats: stats
        }
    });
}));

/**
 * GET /api/rate-limit/stats/:ip
 * Получить статистику rate limiting для конкретного IP
 */
router.get('/stats/:ip',
    validateParams({
        ip: validationRules.string({ required: true, minLength: 1 })
    }),
    asyncHandler(async (req, res) => {
        const { ip } = req.params;
        const stats = getRateLimitStats(ip);
        
        if (!stats) {
            return res.status(404).json({
                success: false,
                error: 'No rate limit data found for this IP'
            });
        }
        
        res.json({
            success: true,
            data: stats
        });
    })
);

/**
 * DELETE /api/rate-limit/reset/:ip
 * Сбросить rate limit для конкретного IP
 */
router.delete('/reset/:ip',
    validateParams({
        ip: validationRules.string({ required: true, minLength: 1 })
    }),
    asyncHandler(async (req, res) => {
        const { ip } = req.params;
        resetRateLimit(ip);
        
        res.json({
            success: true,
            message: `Rate limit reset for IP ${ip}`
        });
    })
);

/**
 * DELETE /api/rate-limit/reset
 * Очистить все rate limit записи (только для разработки)
 */
router.delete('/reset',
    asyncHandler(async (req, res) => {
        if (process.env.NODE_ENV === 'production') {
            return res.status(403).json({
                success: false,
                error: 'This operation is not allowed in production'
            });
        }
        
        clearAllRateLimits();
        
        res.json({
            success: true,
            message: 'All rate limits cleared'
        });
    })
);

export default router;

