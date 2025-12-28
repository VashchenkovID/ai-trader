import express from 'express';
import MigrationService from '../services/MigrationService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validateParams, validateBody, validationRules } from '../middleware/validation.js';

const router = express.Router();

/**
 * GET /api/migration/status
 * Получение статуса миграций
 */
router.get('/status',
    asyncHandler(async (req, res) => {
        const status = await MigrationService.getMigrationStatus();
        
        res.json({
            success: true,
            data: status
        });
    })
);

/**
 * GET /api/migration/discover
 * Обнаружение миграций в директории
 */
router.get('/discover',
    asyncHandler(async (req, res) => {
        const migrations = await MigrationService.discoverMigrations();
        
        res.json({
            success: true,
            data: migrations
        });
    })
);

/**
 * POST /api/migration/run
 * Выполнение конкретной миграции
 */
router.post('/run',
    validateBody({
        migrationName: validationRules.string({ required: true })
    }),
    asyncHandler(async (req, res) => {
        const { migrationName } = req.body;
        
        const result = await MigrationService.runMigration(migrationName);
        
        res.json({
            success: true,
            data: result
        });
    })
);

/**
 * POST /api/migration/run-pending
 * Выполнение всех ожидающих миграций
 */
router.post('/run-pending',
    asyncHandler(async (req, res) => {
        const result = await MigrationService.runPendingMigrations();
        
        res.json({
            success: true,
            data: result
        });
    })
);

/**
 * POST /api/migration/rollback
 * Откат миграции
 */
router.post('/rollback',
    validateBody({
        migrationName: validationRules.string({ required: true })
    }),
    asyncHandler(async (req, res) => {
        const { migrationName } = req.body;
        
        const result = await MigrationService.rollbackMigration(migrationName);
        
        res.json({
            success: true,
            data: result
        });
    })
);

/**
 * POST /api/migration/check-integrity
 * Проверка целостности миграции
 */
router.post('/check-integrity',
    validateBody({
        migrationName: validationRules.string({ required: true })
    }),
    asyncHandler(async (req, res) => {
        const { migrationName } = req.body;
        
        const result = await MigrationService.checkIntegrity(migrationName);
        
        res.json({
            success: true,
            data: result
        });
    })
);

/**
 * GET /api/migration/settings
 * Получение настроек миграций
 */
router.get('/settings',
    asyncHandler(async (req, res) => {
        const settings = MigrationService.getSettings();
        
        res.json({
            success: true,
            data: settings
        });
    })
);

/**
 * POST /api/migration/settings
 * Обновление настроек миграций
 */
router.post('/settings',
    asyncHandler(async (req, res) => {
        const newSettings = req.body;
        
        await MigrationService.updateSettings(newSettings);
        
        res.json({
            success: true,
            message: 'Settings updated successfully'
        });
    })
);

export default router;

