import express from 'express';
import ModelWeightingService from '../services/ModelWeightingService.js';
import ModelPerformance from '../models/ModelPerformance.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validateQuery, validateParams, validateBody, validationRules } from '../middleware/validation.js';

const router = express.Router();

/**
 * GET /api/model-weighting/weights
 * Получение весов моделей
 */
router.get('/weights',
    validateQuery({
        figi: { required: false, type: 'string' }
    }),
    asyncHandler(async (req, res) => {
        const { figi } = req.query;
        
        const weights = await ModelWeightingService.getModelWeights(figi || null);
        
        res.json({
            success: true,
            data: weights
        });
    })
);

/**
 * GET /api/model-weighting/performance/:modelType
 * Получение информации о производительности модели
 */
router.get('/performance/:modelType',
    validateQuery({
        figi: { required: false, type: 'string' }
    }),
    asyncHandler(async (req, res) => {
        const { modelType } = req.params;
        const { figi } = req.query;
        
        const info = await ModelWeightingService.getModelPerformanceInfo(modelType, figi || null);
        
        if (!info) {
            // Если данных нет, возвращаем базовую информацию
            return res.json({
                success: true,
                data: {
                    modelType,
                    figi: figi || null,
                    latest: null,
                    average: null,
                    degradation: {
                        isDegrading: false,
                        reason: 'No data available'
                    },
                    currentWeight: 0
                }
            });
        }
        
        res.json({
            success: true,
            data: info
        });
    })
);

/**
 * POST /api/model-weighting/record
 * Запись производительности модели
 */
router.post('/record',
    validateBody({
        modelType: validationRules.string({ required: true }),
        metrics: validationRules.object({ required: true }),
        figi: { required: false, type: 'string' }
    }),
    asyncHandler(async (req, res) => {
        const { modelType, metrics, figi } = req.body;
        
        await ModelWeightingService.recordPerformance(modelType, metrics, figi || null);
        
        res.json({
            success: true,
            message: 'Performance recorded successfully'
        });
    })
);

/**
 * GET /api/model-weighting/settings
 * Получение настроек взвешивания моделей
 */
router.get('/settings',
    asyncHandler(async (req, res) => {
        const settings = ModelWeightingService.getSettings();
        
        res.json({
            success: true,
            data: settings
        });
    })
);

/**
 * POST /api/model-weighting/settings
 * Обновление настроек взвешивания моделей
 */
router.post('/settings',
    asyncHandler(async (req, res) => {
        const newSettings = req.body;
        
        await ModelWeightingService.updateSettings(newSettings);
        
        res.json({
            success: true,
            message: 'Settings updated successfully'
        });
    })
);

export default router;

