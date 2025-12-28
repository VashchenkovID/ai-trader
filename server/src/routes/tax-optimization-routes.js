import express from 'express';
import TaxOptimizationService from '../services/TaxOptimizationService.js';
import TradingRequest from '../models/TradingRequest.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validateQuery, validateBody, validationRules } from '../middleware/validation.js';

const router = express.Router();

/**
 * POST /api/tax-optimization/calculate-commission
 * Расчет комиссии для сделки
 */
router.post('/calculate-commission',
    validateBody({
        price: validationRules.number({ required: true, min: 0 }),
        quantity: validationRules.number({ required: true, min: 1 })
    }),
    asyncHandler(async (req, res) => {
        const { price, quantity } = req.body;
        
        const commissionInfo = TaxOptimizationService.calculateCommission(price, quantity);

        res.json({
            success: true,
            data: commissionInfo
        });
    })
);

/**
 * POST /api/tax-optimization/calculate-position-size
 * Расчет размера позиции с учетом комиссии
 */
router.post('/calculate-position-size',
    validateBody({
        availableCapital: validationRules.number({ required: true, min: 0 }),
        price: validationRules.number({ required: true, min: 0 })
    }),
    asyncHandler(async (req, res) => {
        const { availableCapital, price } = req.body;
        
        const positionSize = TaxOptimizationService.calculatePositionSizeWithCommission(
            availableCapital,
            price
        );

        res.json({
            success: true,
            data: positionSize
        });
    })
);

/**
 * POST /api/tax-optimization/analyze-profitability
 * Анализ целесообразности сделки с учетом комиссий
 */
router.post('/analyze-profitability',
    validateBody({
        entryPrice: validationRules.number({ required: true, min: 0 }),
        exitPrice: validationRules.number({ required: true, min: 0 }),
        quantity: validationRules.number({ required: true, min: 1 })
    }),
    asyncHandler(async (req, res) => {
        const { entryPrice, exitPrice, quantity } = req.body;
        
        const analysis = TaxOptimizationService.analyzeTradeProfitability(
            entryPrice,
            exitPrice,
            quantity
        );

        res.json({
            success: true,
            data: analysis
        });
    })
);

/**
 * POST /api/tax-optimization/calculate-tax
 * Расчет налогов для позиции
 */
router.post('/calculate-tax',
    validateBody({
        positionId: validationRules.string({ required: true }),
        exitPrice: validationRules.number({ required: true, min: 0 }),
        exitQuantity: validationRules.number({ required: false, min: 1 })
    }),
    asyncHandler(async (req, res) => {
        const { positionId, exitPrice, exitQuantity } = req.body;
        
        const position = await TradingRequest.findByPk(positionId);
        if (!position) {
            return res.status(404).json({
                success: false,
                message: 'Position not found'
            });
        }

        const taxCalculation = TaxOptimizationService.calculateTax(
            position,
            exitPrice,
            exitQuantity || position.quantity
        );

        res.json({
            success: true,
            data: taxCalculation
        });
    })
);

/**
 * POST /api/tax-optimization/optimize-batch
 * Оптимизация батча сделок (минимизация комиссий)
 */
router.post('/optimize-batch',
    validateBody({
        trades: validationRules.array({ required: true, minLength: 1 })
    }),
    asyncHandler(async (req, res) => {
        const { trades } = req.body;
        
        const optimized = TaxOptimizationService.optimizeTradeBatch(trades);

        res.json({
            success: true,
            data: {
                originalCount: trades.length,
                optimizedCount: optimized.length,
                trades: optimized
            }
        });
    })
);

/**
 * GET /api/tax-optimization/analyze-position/:positionId
 * Анализ позиции на предмет налоговой оптимизации
 */
router.get('/analyze-position/:positionId',
    asyncHandler(async (req, res) => {
        const { positionId } = req.params;
        
        const position = await TradingRequest.findByPk(positionId);
        if (!position) {
            return res.status(404).json({
                success: false,
                message: 'Position not found'
            });
        }

        const analysis = TaxOptimizationService.analyzeTaxOptimization(position);

        res.json({
            success: true,
            data: analysis
        });
    })
);

/**
 * GET /api/tax-optimization/settings
 * Получение настроек оптимизации
 */
router.get('/settings',
    asyncHandler(async (req, res) => {
        const settings = TaxOptimizationService.getSettings();

        res.json({
            success: true,
            data: settings
        });
    })
);

/**
 * POST /api/tax-optimization/settings
 * Обновление настроек оптимизации
 */
router.post('/settings',
    asyncHandler(async (req, res) => {
        const newSettings = req.body;
        
        await TaxOptimizationService.updateSettings(newSettings);

        res.json({
            success: true,
            message: 'Settings updated successfully'
        });
    })
);

export default router;

