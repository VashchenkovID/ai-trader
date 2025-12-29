import express from 'express';
import AssetSyncService from '../services/AssetSyncService.js';
import Asset from '../models/Asset.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validateQuery, validateBody, validationRules } from '../middleware/validation.js';
import { Op } from 'sequelize';

const router = express.Router();

/**
 * POST /api/assets/sync
 * Синхронизация российских акций из Tinkoff API
 */
router.post('/sync',
    validateBody({
        forceUpdate: { required: false, type: 'boolean' }
    }),
    asyncHandler(async (req, res) => {
        const { forceUpdate = false } = req.body;

        // Инициализируем сервис, если еще не инициализирован
        if (!AssetSyncService.isInitialized) {
            await AssetSyncService.initialize();
        }

        const result = await AssetSyncService.syncRussianShares(forceUpdate);

        res.json({
            success: true,
            message: 'Синхронизация активов завершена',
            data: result
        });
    })
);

/**
 * GET /api/assets/stats
 * Получение статистики по активам в БД
 */
router.get('/stats',
    asyncHandler(async (req, res) => {
        if (!AssetSyncService.isInitialized) {
            await AssetSyncService.initialize();
        }

        const stats = await AssetSyncService.getStats();

        res.json({
            success: true,
            data: stats
        });
    })
);

/**
 * GET /api/assets
 * Получение списка активов с фильтрацией
 */
router.get('/',
    validateQuery({
        figi: { required: false, type: 'string' },
        ticker: { required: false, type: 'string' },
        instrumentType: { required: false, type: 'string' },
        countryOfRiskCode: { required: false, type: 'string' },
        limit: { required: false, type: 'number' },
        offset: { required: false, type: 'number' }
    }),
    asyncHandler(async (req, res) => {
        const {
            figi,
            ticker,
            instrumentType,
            countryOfRiskCode,
            limit = 100,
            offset = 0
        } = req.query;

        const where = {};
        
        if (figi) {
            where.figi = figi;
        }
        if (ticker) {
            where.ticker = { [Op.iLike]: `%${ticker}%` };
        }
        if (instrumentType) {
            where.instrumentType = instrumentType;
        }
        if (countryOfRiskCode) {
            where.countryOfRiskCode = countryOfRiskCode;
        }

        const { count, rows } = await Asset.findAndCountAll({
            where,
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [['name', 'ASC']]
        });

        res.json({
            success: true,
            data: {
                assets: rows,
                total: count,
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        });
    })
);

/**
 * GET /api/assets/:uid
 * Получение актива по UID
 */
router.get('/:uid',
    asyncHandler(async (req, res) => {
        const { uid } = req.params;

        const asset = await Asset.findOne({
            where: { uid }
        });

        if (!asset) {
            return res.status(404).json({
                success: false,
                message: 'Актив не найден'
            });
        }

        res.json({
            success: true,
            data: asset
        });
    })
);

/**
 * GET /api/assets/figi/:figi
 * Получение актива по FIGI
 */
router.get('/figi/:figi',
    asyncHandler(async (req, res) => {
        const { figi } = req.params;

        const asset = await Asset.findOne({
            where: { figi }
        });

        if (!asset) {
            return res.status(404).json({
                success: false,
                message: 'Актив не найден'
            });
        }

        res.json({
            success: true,
            data: asset
        });
    })
);

export default router;

