import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import BackupService from '../services/BackupService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validateBody, validateParams, validateQuery, validationRules } from '../middleware/validation.js';
import { NotFoundError, ValidationError } from '../utils/errors/AppError.js';
import { strictLimiter, heavyOperationLimiter } from '../middleware/rateLimiter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Настройка multer для загрузки файлов
const upload = multer({
    dest: path.join(__dirname, '../../backups/uploads'),
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['.json', '.csv'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        } else {
            cb(new ValidationError('Invalid file type', [
                { field: 'file', message: `File type must be one of: ${allowedTypes.join(', ')}` }
            ]));
        }
    }
});

const router = express.Router();

// Применяем строгие лимиты к операциям создания/восстановления бэкапов
router.post('/create', strictLimiter);
router.post('/:id/restore', strictLimiter);
router.post('/cleanup', strictLimiter);
// Тяжелые операции импорта/экспорта
router.post('/export/*', heavyOperationLimiter);
router.post('/import/*', heavyOperationLimiter);

/**
 * GET /api/backup/list
 * Получение списка всех бэкапов
 */
router.get('/list',
    validateQuery({
        type: validationRules.enum(['all', 'full', 'database', 'settings', 'models'], { required: false })
    }),
    asyncHandler(async (req, res) => {
        const { type = 'all' } = req.query;
        const backups = await BackupService.listBackups(type);
        
        res.json({
            success: true,
            data: backups,
            count: backups.length
        });
    })
);

/**
 * POST /api/backup/create
 * Создание нового бэкапа
 */
router.post('/create',
    validateBody({
        type: validationRules.enum(['manual', 'daily', 'weekly', 'monthly'], { required: false }),
        description: validationRules.string({ maxLength: 500, required: false })
    }),
    asyncHandler(async (req, res) => {
        const { type = 'manual', description = '' } = req.body;
        
        const backup = await BackupService.createFullBackup({ type, description });
        
        res.status(201).json({
            success: true,
            data: backup
        });
    })
);

/**
 * GET /api/backup/:id/info
 * Получение информации о бэкапе
 */
router.get('/:id/info',
    validateParams({
        id: validationRules.string({ required: true, minLength: 1 })
    }),
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        
        try {
            const backupInfo = await BackupService.getBackupInfo(id);
            res.json({
                success: true,
                data: backupInfo
            });
        } catch (error) {
            if (error.message.includes('not found')) {
                throw new NotFoundError('Backup');
            }
            throw error;
        }
    })
);

/**
 * POST /api/backup/:id/restore
 * Восстановление из бэкапа
 */
router.post('/:id/restore',
    validateParams({
        id: validationRules.string({ required: true, minLength: 1 })
    }),
    validateBody({
        components: validationRules.array({ required: false }),
        verify: validationRules.boolean({ required: false })
    }),
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { components = ['database', 'settings', 'models'], verify = true } = req.body;
        
        // Валидация компонентов
        const validComponents = ['database', 'settings', 'models'];
        const invalidComponents = components.filter(c => !validComponents.includes(c));
        if (invalidComponents.length > 0) {
            throw new ValidationError('Invalid components', [
                { field: 'components', message: `Invalid components: ${invalidComponents.join(', ')}. Valid: ${validComponents.join(', ')}` }
            ]);
        }
        
        try {
            const result = await BackupService.restoreBackup(id, { components, verify });
            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            if (error.message.includes('not found')) {
                throw new NotFoundError('Backup');
            }
            throw error;
        }
    })
);

/**
 * DELETE /api/backup/:id
 * Удаление бэкапа
 */
router.delete('/:id',
    validateParams({
        id: validationRules.string({ required: true, minLength: 1 })
    }),
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        
        try {
            const result = await BackupService.deleteBackup(id);
            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            if (error.message.includes('not found')) {
                throw new NotFoundError('Backup');
            }
            throw error;
        }
    })
);

/**
 * POST /api/backup/cleanup
 * Очистка старых бэкапов (ротация)
 */
router.post('/cleanup', asyncHandler(async (req, res) => {
    const result = await BackupService.cleanupOldBackups();
    
    res.json({
        success: true,
        data: result
    });
}));

/**
 * POST /api/backup/export/settings
 * Экспорт настроек в JSON
 */
router.post('/export/settings',
    validateBody({
        format: validationRules.enum(['json'], { required: false })
    }),
    asyncHandler(async (req, res) => {
        const { format = 'json' } = req.body;
        const result = await BackupService.exportSettings(format);
        
        res.json({
            success: true,
            data: result
        });
    })
);

/**
 * POST /api/backup/export/portfolio
 * Экспорт портфеля в JSON или CSV
 */
router.post('/export/portfolio',
    validateBody({
        portfolioType: validationRules.enum(['real', 'virtual'], { required: false }),
        format: validationRules.enum(['json', 'csv'], { required: false })
    }),
    asyncHandler(async (req, res) => {
        const { portfolioType = 'virtual', format = 'json' } = req.body;
        const result = await BackupService.exportPortfolio(portfolioType, format);
        
        res.json({
            success: true,
            data: result
        });
    })
);

/**
 * POST /api/backup/export/trades
 * Экспорт истории сделок в JSON или CSV
 */
router.post('/export/trades',
    validateBody({
        format: validationRules.enum(['json', 'csv'], { required: false }),
        startDate: validationRules.string({ required: false }),
        endDate: validationRules.string({ required: false }),
        action: validationRules.enum(['BUY', 'SELL'], { required: false })
    }),
    asyncHandler(async (req, res) => {
        const { format = 'json', startDate, endDate, action } = req.body;
        const filters = {};
        if (startDate) filters.startDate = startDate;
        if (endDate) filters.endDate = endDate;
        if (action) filters.action = action;
        
        const result = await BackupService.exportTrades(format, filters);
        
        res.json({
            success: true,
            data: result
        });
    })
);

/**
 * POST /api/backup/export/metrics
 * Экспорт метрик и статистики в JSON
 */
router.post('/export/metrics',
    validateBody({
        format: validationRules.enum(['json'], { required: false })
    }),
    asyncHandler(async (req, res) => {
        const { format = 'json' } = req.body;
        const result = await BackupService.exportMetrics(format);
        
        res.json({
            success: true,
            data: result
        });
    })
);

/**
 * POST /api/backup/import/preview
 * Предпросмотр импортируемых данных
 */
router.post('/import/preview',
    upload.single('file'),
    validateBody({
        dataType: validationRules.enum(['settings', 'portfolio', 'trades'], { required: true })
    }),
    asyncHandler(async (req, res) => {
        if (!req.file) {
            throw new ValidationError('File is required', [
                { field: 'file', message: 'File must be uploaded' }
            ]);
        }
        
        const { dataType } = req.body;
        const result = await BackupService.previewImport(req.file.path, dataType);
        
        res.json({
            success: true,
            data: result
        });
    })
);

/**
 * POST /api/backup/import/settings
 * Импорт настроек из JSON
 */
router.post('/import/settings',
    upload.single('file'),
    validateBody({
        overwrite: validationRules.boolean({ required: false }),
        preview: validationRules.boolean({ required: false })
    }),
    asyncHandler(async (req, res) => {
        if (!req.file) {
            throw new ValidationError('File is required', [
                { field: 'file', message: 'File must be uploaded' }
            ]);
        }
        
        const { overwrite = false, preview = false } = req.body;
        const result = await BackupService.importSettings(req.file.path, { overwrite, preview });
        
        res.json({
            success: true,
            data: result
        });
    })
);

/**
 * POST /api/backup/import/portfolio
 * Импорт портфеля из CSV
 */
router.post('/import/portfolio',
    upload.single('file'),
    validateBody({
        portfolioType: validationRules.enum(['real', 'virtual'], { required: false }),
        preview: validationRules.boolean({ required: false })
    }),
    asyncHandler(async (req, res) => {
        if (!req.file) {
            throw new ValidationError('File is required', [
                { field: 'file', message: 'File must be uploaded' }
            ]);
        }
        
        const { portfolioType = 'virtual', preview = false } = req.body;
        const result = await BackupService.importPortfolio(req.file.path, portfolioType, { preview });
        
        res.json({
            success: true,
            data: result
        });
    })
);

export default router;

