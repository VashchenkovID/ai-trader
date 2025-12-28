import express from 'express';
import PyramidingService from '../services/PyramidingService.js';
import PositionPyramid from '../models/PositionPyramid.js';
import TradingRequest from '../models/TradingRequest.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validateQuery, validateParams, validateBody, validationRules } from '../middleware/validation.js';

const router = express.Router();

/**
 * GET /api/pyramiding/pyramids
 * Получение списка пирамид
 */
router.get('/pyramids',
    validateQuery({
        status: { required: false, type: 'string' },
        strategyId: { required: false, type: 'number' },
        figi: { required: false, type: 'string' }
    }),
    asyncHandler(async (req, res) => {
        try {
            const { status, strategyId, figi } = req.query;
            
            const where = {};
            if (status) where.status = status;
            if (strategyId) where.strategyId = parseInt(strategyId);
            if (figi) where.figi = figi;
            
            const pyramids = await PositionPyramid.findAll({
                where,
                order: [['createdAt', 'DESC']],
                limit: parseInt(req.query.limit) || 50
            });
            
            const pyramidsInfo = await Promise.all(
                pyramids.map(pyramid => PyramidingService.getPyramidInfo(pyramid.id))
            );
            
            res.json({
                success: true,
                data: pyramidsInfo.filter(info => info !== null)
            });
        } catch (error) {
            // Если таблица не существует, возвращаем пустой массив
            if (error.name === 'SequelizeDatabaseError' && error.message.includes('does not exist')) {
                res.json({
                    success: true,
                    data: []
                });
            } else {
                throw error;
            }
        }
    })
);

/**
 * GET /api/pyramiding/pyramids/:id
 * Получение информации о пирамиде
 */
router.get('/pyramids/:id',
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        
        const pyramidInfo = await PyramidingService.getPyramidInfo(id);
        
        if (!pyramidInfo) {
            return res.status(404).json({
                success: false,
                message: 'Pyramid not found'
            });
        }
        
        res.json({
            success: true,
            data: pyramidInfo
        });
    })
);

/**
 * GET /api/pyramiding/check
 * Проверка всех активных пирамид на возможность следующего входа
 */
router.get('/check',
    asyncHandler(async (req, res) => {
        const results = await PyramidingService.checkAllActivePyramids();
        
        res.json({
            success: true,
            data: {
                checked: results.length,
                results
            }
        });
    })
);

/**
 * POST /api/pyramiding/create
 * Создание новой пирамиды (для тестирования)
 */
router.post('/create',
    validateBody({
        basePositionId: validationRules.string({ required: true }),
        targetSize: validationRules.number({ required: true, min: 0 })
    }),
    asyncHandler(async (req, res) => {
        const { basePositionId, targetSize } = req.body;
        
        const basePosition = await TradingRequest.findByPk(basePositionId);
        if (!basePosition) {
            return res.status(404).json({
                success: false,
                message: 'Base position not found'
            });
        }
        
        if (basePosition.action !== 'BUY' || basePosition.status !== 'EXECUTED') {
            return res.status(400).json({
                success: false,
                message: 'Base position must be an executed BUY request'
            });
        }
        
        const recommendation = await (await import('../models/Recommendation.js')).default.findByPk(basePosition.figi);
        if (!recommendation) {
            return res.status(404).json({
                success: false,
                message: 'Recommendation not found'
            });
        }
        
        const pyramid = await PyramidingService.createPyramid(basePosition, recommendation, targetSize);
        const pyramidInfo = await PyramidingService.getPyramidInfo(pyramid.id);
        
        res.json({
            success: true,
            data: pyramidInfo
        });
    })
);

/**
 * GET /api/pyramiding/settings
 * Получение настроек пирамидинга
 */
router.get('/settings',
    asyncHandler(async (req, res) => {
        const settings = PyramidingService.getSettings();
        
        res.json({
            success: true,
            data: settings
        });
    })
);

/**
 * POST /api/pyramiding/settings
 * Обновление настроек пирамидинга
 */
router.post('/settings',
    asyncHandler(async (req, res) => {
        const newSettings = req.body;
        
        await PyramidingService.updateSettings(newSettings);
        
        res.json({
            success: true,
            message: 'Settings updated successfully'
        });
    })
);

export default router;

