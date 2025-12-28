import express from 'express';
import DataCleanupService from '../services/DataCleanupService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validateBody, validationRules } from '../middleware/validation.js';

const router = express.Router();

/**
 * POST /api/data-cleanup/perform
 * Выполнение очистки данных
 */
router.post('/perform',
    validateBody({
        cleanupLogs: { required: false, type: 'boolean' },
        cleanupDatabase: { required: false, type: 'boolean' },
        cleanupModels: { required: false, type: 'boolean' },
        cleanupTempFiles: { required: false, type: 'boolean' }
    }),
    asyncHandler(async (req, res) => {
        const options = req.body;
        
        const result = await DataCleanupService.performCleanup(options);
        
        res.json({
            success: true,
            data: result
        });
    })
);

/**
 * POST /api/data-cleanup/cleanup-logs
 * Очистка старых логов
 */
router.post('/cleanup-logs',
    asyncHandler(async (req, res) => {
        const result = await DataCleanupService.cleanupLogs();
        
        res.json({
            success: true,
            data: result
        });
    })
);

/**
 * POST /api/data-cleanup/cleanup-database
 * Очистка старых данных из БД
 */
router.post('/cleanup-database',
    asyncHandler(async (req, res) => {
        const result = await DataCleanupService.cleanupDatabase();
        
        res.json({
            success: true,
            data: result
        });
    })
);

/**
 * POST /api/data-cleanup/cleanup-models
 * Очистка неиспользуемых моделей
 */
router.post('/cleanup-models',
    asyncHandler(async (req, res) => {
        const result = await DataCleanupService.cleanupUnusedModels();
        
        res.json({
            success: true,
            data: result
        });
    })
);

/**
 * POST /api/data-cleanup/cleanup-temp-files
 * Очистка временных файлов
 */
router.post('/cleanup-temp-files',
    asyncHandler(async (req, res) => {
        const result = await DataCleanupService.cleanupTempFiles();
        
        res.json({
            success: true,
            data: result
        });
    })
);

/**
 * GET /api/data-cleanup/stats
 * Получение статистики очистки
 */
router.get('/stats',
    asyncHandler(async (req, res) => {
        const stats = await DataCleanupService.getCleanupStats();
        
        res.json({
            success: true,
            data: stats
        });
    })
);

/**
 * GET /api/data-cleanup/settings
 * Получение настроек очистки
 */
router.get('/settings',
    asyncHandler(async (req, res) => {
        const settings = DataCleanupService.getSettings();
        
        res.json({
            success: true,
            data: settings
        });
    })
);

/**
 * POST /api/data-cleanup/settings
 * Обновление настроек очистки
 */
router.post('/settings',
    asyncHandler(async (req, res) => {
        const newSettings = req.body;
        
        await DataCleanupService.updateSettings(newSettings);
        
        res.json({
            success: true,
            message: 'Settings updated successfully'
        });
    })
);

export default router;

