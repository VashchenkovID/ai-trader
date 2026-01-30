import express from 'express';
import sequelize from '../config/database.js';
import OptionsDataService from '../services/OptionsDataService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validateQuery, validateParams, validationRules } from '../middleware/validation.js';
import LoggerService from '../services/LoggerService.js';
import CachedInstrument from '../models/CachedInstrument.js';
import OptionsData from '../models/OptionsData.js';
import { performOptionsDataUpdate } from '../utils/scheduler/optionsDataUpdateUtils.js';

const router = express.Router();

/**
 * POST /api/options-data/update-all
 * Массовое обновление опционов для всех активных инструментов
 * Работает асинхронно через worker - отправляет ответ сразу и обрабатывает в фоне
 */
router.post('/update-all', asyncHandler(async (req, res) => {
    const startTime = Date.now();
    const { 
        delayMs = 2000, 
        forceUpdate = false,
        limit = null // Ограничение количества инструментов для обработки (не используется в worker, но оставляем для совместимости)
    } = req.body;
    
    LoggerService.info('📊 [OPTIONS] Received request to update options for all instruments', {
        service: 'OptionsDataRoutes',
        operation: 'update-all',
        delayMs,
        forceUpdate,
        limit,
        timestamp: new Date().toISOString()
    });
    
    console.log(`📊 [OPTIONS] Starting options data update: delayMs=${delayMs}, forceUpdate=${forceUpdate}, limit=${limit || 'unlimited'}`);
    
    // Отправляем ответ сразу
    res.json({
        success: true,
        message: 'Обновление опционных данных запущено в фоновом режиме',
        data: {
            delayMs,
            forceUpdate,
            status: 'processing'
        }
    });

    // Запускаем обновление в фоне через worker
    try {
        const ServiceManager = (await import('../services/ServiceManager.js')).default;
        const SchedulerService = (await import('../services/SchedulerService.js')).default;
        
        LoggerService.info('📊 [OPTIONS] Starting worker for options data update', {
            service: 'OptionsDataRoutes',
            operation: 'update-all-worker-start'
        });
        
        const context = {
            getWebSocketService: () => ServiceManager.getServiceSafe('WebSocketService'),
            workersSet: SchedulerService.workers || new Set()
        };
        
        const result = await performOptionsDataUpdate(context, {
            delayMs: parseInt(delayMs),
            forceUpdate: Boolean(forceUpdate)
        });
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        LoggerService.info('✅ [OPTIONS] Options data update completed', {
            service: 'OptionsDataRoutes',
            operation: 'update-all-completed',
            duration: `${duration}s`,
            stats: result.stats || {},
            summary: result.summary
        });
        
        console.log(`✅ [OPTIONS] Update completed in ${duration}s:`, {
            processed: result.stats?.processed || 0,
            saved: result.stats?.saved || 0,
            errors: result.stats?.errors || 0,
            skipped: result.stats?.skipped || 0
        });
        
        // Уведомляем через WebSocket
        const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
        if (WebSocketService) {
            WebSocketService.broadcast('options_data_update_completed', {
                success: true,
                result: result
            });
        }
    } catch (updateError) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        LoggerService.error('❌ [OPTIONS] Error in options data update', {
            service: 'OptionsDataRoutes',
            operation: 'update-all-error',
            duration: `${duration}s`,
            error: {
                message: updateError.message,
                stack: updateError.stack
            }
        });
        
        console.error(`❌ [OPTIONS] Update failed after ${duration}s:`, updateError.message);
        
        // Уведомляем через WebSocket об ошибке
        try {
            const ServiceManager = (await import('../services/ServiceManager.js')).default;
            const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
            if (WebSocketService) {
                WebSocketService.broadcast('options_data_update_error', {
                    success: false,
                    error: updateError.message
                });
            }
        } catch (wsError) {
            console.warn('⚠️ [OPTIONS] Failed to send WebSocket error notification:', wsError.message);
        }
    }
}));

/**
 * POST /api/options-data/update/:figi
 * Обновление опционов для конкретного инструмента
 */
router.post('/update/:figi',
    validateParams({
        figi: validationRules.string({ required: true })
    }),
    asyncHandler(async (req, res) => {
        const startTime = Date.now();
        const { figi } = req.params;
        const { forceUpdate = false } = req.body;
        
        LoggerService.info('📊 [OPTIONS] Received request to update options for instrument', {
            service: 'OptionsDataRoutes',
            operation: 'update-single',
            figi,
            forceUpdate,
            timestamp: new Date().toISOString()
        });
        
        console.log(`📊 [OPTIONS] Updating options for ${figi}, forceUpdate=${forceUpdate}`);
        
        try {
            const savedOptions = await OptionsDataService.fetchAndSaveOptions(figi, forceUpdate);
            
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            
            LoggerService.info('✅ [OPTIONS] Options data updated for instrument', {
                service: 'OptionsDataRoutes',
                operation: 'update-single-completed',
                figi,
                count: savedOptions.length,
                duration: `${duration}s`
            });
            
            console.log(`✅ [OPTIONS] Updated ${savedOptions.length} options for ${figi} in ${duration}s`);
            
            res.json({
                success: true,
                message: 'Options data updated',
                data: {
                    figi,
                    count: savedOptions.length,
                    options: savedOptions.slice(0, 10) // Первые 10 для примера
                }
            });
        } catch (error) {
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            
            LoggerService.error('❌ [OPTIONS] Error updating options for instrument', {
                service: 'OptionsDataRoutes',
                operation: 'update-single-error',
                figi,
                duration: `${duration}s`,
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
            
            console.error(`❌ [OPTIONS] Failed to update options for ${figi} after ${duration}s:`, error.message);
            
            throw error;
        }
    })
);

/**
 * POST /api/options-data/update-missing-iv
 * Обновление IV для опционов, у которых IV = null (используя историческую волатильность)
 */
router.post('/update-missing-iv', asyncHandler(async (req, res) => {
    const { baseFigi = null } = req.body;
    
    const updatedCount = await OptionsDataService.updateMissingIV(baseFigi);
    
    res.json({
        success: true,
        message: 'Missing IV values updated',
        data: {
            updatedCount,
            baseFigi: baseFigi || 'all'
        }
    });
}));

/**
 * GET /api/options-data/:figi
 * Получение опционов для конкретного инструмента
 */
router.get('/:figi',
    validateParams({
        figi: validationRules.string({ required: true })
    }),
    asyncHandler(async (req, res) => {
        const { figi } = req.params;
        const { limit = 100, offset = 0 } = req.query;
        
        const options = await OptionsData.findAndCountAll({
            where: { baseFigi: figi },
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [['timestamp', 'DESC'], ['expirationDate', 'ASC']]
        });
        
        res.json({
            success: true,
            data: {
                options: options.rows,
                total: options.count,
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        });
    })
);

/**
 * GET /api/options-data/:figi/features
 * Получение опционных фичей для нейросети
 */
router.get('/:figi/features',
    validateParams({
        figi: validationRules.string({ required: true })
    }),
    asyncHandler(async (req, res) => {
        const { figi } = req.params;
        const { timestamp } = req.query;
        
        const targetTimestamp = timestamp ? new Date(timestamp) : new Date();
        const features = await OptionsDataService.getOptionsFeatures(figi, targetTimestamp);
        
        res.json({
            success: true,
            data: {
                figi,
                features: {
                    currentIV: features[0],
                    avgIV30d: features[1],
                    ivRank: features[2],
                    hasOptionsData: features[3]
                }
            }
        });
    })
);

/**
 * GET /api/options-data/stats
 * Получение статистики по опционам
 */
router.get('/stats', asyncHandler(async (req, res) => {
    const totalOptions = await OptionsData.count();
    
    // Группировка по базовым активам
    const [byBaseFigi] = await sequelize.query(`
        SELECT "baseFigi", COUNT(*) as count
        FROM options_data
        GROUP BY "baseFigi"
        ORDER BY count DESC
        LIMIT 20
    `);
    
    // Статистика по IV
    const [ivStats] = await sequelize.query(`
        SELECT 
            COUNT(*) as total,
            COUNT("impliedVolatility") as with_iv,
            AVG("impliedVolatility") as avg_iv,
            MIN("impliedVolatility") as min_iv,
            MAX("impliedVolatility") as max_iv
        FROM options_data
    `);
    
    res.json({
        success: true,
        data: {
            totalOptions,
            byBaseFigi: byBaseFigi || [],
            ivStats: ivStats[0] || null
        }
    });
}));

export default router;

