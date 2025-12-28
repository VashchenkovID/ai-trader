import express from 'express';
import DiversificationService from '../services/DiversificationService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validateBody } from '../middleware/validation.js';

const router = express.Router();

/**
 * POST /api/diversification/check
 * Проверка диверсификации портфеля
 */
router.post('/check',
    validateBody({
        positions: { required: true, type: 'array' },
        totalValue: { required: true, type: 'number', min: 0 }
    }),
    asyncHandler(async (req, res) => {
        const { positions, totalValue } = req.body;
        
        const analysis = await DiversificationService.checkDiversification(positions, totalValue);
        
        res.json({
            success: true,
            data: analysis
        });
    })
);

/**
 * POST /api/diversification/can-add
 * Проверка возможности добавления новой позиции
 */
router.post('/can-add',
    validateBody({
        figi: { required: true, type: 'string' },
        value: { required: true, type: 'number', min: 0 },
        currentPositions: { required: true, type: 'array' },
        totalValue: { required: true, type: 'number', min: 0 }
    }),
    asyncHandler(async (req, res) => {
        const { figi, value, currentPositions, totalValue } = req.body;
        
        const check = await DiversificationService.canAddPosition(figi, value, currentPositions, totalValue);
        
        res.json({
            success: true,
            data: check
        });
    })
);

/**
 * GET /api/diversification/settings
 * Получение настроек диверсификации
 */
router.get('/settings',
    asyncHandler(async (req, res) => {
        const settings = DiversificationService.getSettings();
        
        res.json({
            success: true,
            data: settings
        });
    })
);

/**
 * POST /api/diversification/settings
 * Обновление настроек диверсификации
 */
router.post('/settings',
    asyncHandler(async (req, res) => {
        const newSettings = req.body;
        
        await DiversificationService.updateSettings(newSettings);
        
        res.json({
            success: true,
            message: 'Settings updated successfully'
        });
    })
);

export default router;

