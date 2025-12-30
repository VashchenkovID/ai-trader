import express from 'express';
import sequelize from '../config/database.js';
import OptionsDataService from '../services/OptionsDataService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validateQuery, validateParams, validationRules } from '../middleware/validation.js';
import LoggerService from '../services/LoggerService.js';
import CachedInstrument from '../models/CachedInstrument.js';
import OptionsData from '../models/OptionsData.js';

const router = express.Router();

/**
 * POST /api/options-data/update-all
 * Массовое обновление опционов для всех активных инструментов
 */
router.post('/update-all', asyncHandler(async (req, res) => {
    const { 
        delayMs = 2000, 
        forceUpdate = false,
        limit = null // Ограничение количества инструментов для обработки
    } = req.body;
    
    LoggerService.info('Received request to update options for all instruments', {
        service: 'OptionsDataRoutes',
        delayMs,
        forceUpdate,
        limit
    });
    
    // Получаем список активных инструментов
    const instruments = await CachedInstrument.findAll({
        where: { isActive: true },
        limit: limit || undefined,
        attributes: ['figi', 'ticker', 'name']
    });
    
    if (instruments.length === 0) {
        return res.json({
            success: true,
            message: 'No active instruments found',
            data: {
                processed: 0,
                saved: 0,
                errors: 0,
                skipped: 0
            }
        });
    }
    
    const stats = {
        processed: 0,
        saved: 0,
        errors: 0,
        skipped: 0,
        total: instruments.length
    };
    
    // Обрабатываем каждый инструмент с задержкой
    for (const instrument of instruments) {
        try {
            const savedOptions = await OptionsDataService.fetchAndSaveOptions(
                instrument.figi, 
                forceUpdate
            );
            
            stats.processed++;
            stats.saved += savedOptions.length;
            
            // Задержка между запросами
            if (delayMs > 0) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        } catch (error) {
            stats.errors++;
            LoggerService.error('Error updating options for instrument', {
                service: 'OptionsDataRoutes',
                figi: instrument.figi,
                ticker: instrument.ticker,
                error: { message: error.message }
            });
        }
    }
    
    res.json({
        success: true,
        message: 'Mass update of options data completed',
        data: stats
    });
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
        const { figi } = req.params;
        const { forceUpdate = false } = req.body;
        
        const savedOptions = await OptionsDataService.fetchAndSaveOptions(figi, forceUpdate);
        
        res.json({
            success: true,
            message: 'Options data updated',
            data: {
                figi,
                count: savedOptions.length,
                options: savedOptions.slice(0, 10) // Первые 10 для примера
            }
        });
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

