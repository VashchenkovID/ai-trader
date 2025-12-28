import express from 'express';
import PositionMonitoringService from '../services/PositionMonitoringService.js';
import DailyReportService from '../services/DailyReportService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validateQuery, validationRules } from '../middleware/validation.js';

const router = express.Router();

/**
 * GET /api/position-monitoring/check
 * Проверка всех открытых позиций
 */
router.get('/check',
    validateQuery({
        tradingMode: validationRules.string({ required: false })
    }),
    asyncHandler(async (req, res) => {
        const { tradingMode } = req.query;
        
        const result = await PositionMonitoringService.checkAllPositions({
            tradingMode: tradingMode || undefined
        });

        res.json({
            success: true,
            data: result
        });
    })
);

/**
 * GET /api/position-monitoring/positions
 * Получение всех открытых позиций
 */
router.get('/positions',
    validateQuery({
        tradingMode: validationRules.string({ required: false })
    }),
    asyncHandler(async (req, res) => {
        const { tradingMode } = req.query;
        
        const positions = await PositionMonitoringService.getOpenPositions({
            tradingMode: tradingMode || undefined
        });

        res.json({
            success: true,
            data: positions
        });
    })
);

/**
 * GET /api/position-monitoring/settings
 * Получение настроек мониторинга
 */
router.get('/settings',
    asyncHandler(async (req, res) => {
        const settings = PositionMonitoringService.getSettings();

        res.json({
            success: true,
            data: settings
        });
    })
);

/**
 * POST /api/position-monitoring/settings
 * Обновление настроек мониторинга
 */
router.post('/settings',
    asyncHandler(async (req, res) => {
        const newSettings = req.body;
        
        await PositionMonitoringService.updateSettings(newSettings);

        res.json({
            success: true,
            message: 'Settings updated successfully'
        });
    })
);

/**
 * GET /api/daily-reports/generate
 * Генерация ежедневного отчета
 */
router.get('/generate',
    validateQuery({
        date: validationRules.string({ required: false }) // Формат: YYYY-MM-DD
    }),
    asyncHandler(async (req, res) => {
        const { date } = req.query;
        
        const reportDate = date ? new Date(date) : new Date();
        const report = await DailyReportService.generateDailyReport({
            date: reportDate
        });

        res.json({
            success: true,
            data: report
        });
    })
);

/**
 * POST /api/daily-reports/send
 * Отправка ежедневного отчета в Telegram
 */
router.post('/send',
    asyncHandler(async (req, res) => {
        const { date } = req.body;
        
        const reportDate = date ? new Date(date) : new Date();
        const report = await DailyReportService.generateDailyReport({
            date: reportDate
        });
        
        await DailyReportService.sendReportToTelegram(report);

        res.json({
            success: true,
            message: 'Daily report sent to Telegram',
            data: report
        });
    })
);

/**
 * GET /api/daily-reports/settings
 * Получение настроек отчетов
 */
router.get('/settings',
    asyncHandler(async (req, res) => {
        const settings = DailyReportService.getSettings();

        res.json({
            success: true,
            data: settings
        });
    })
);

/**
 * POST /api/daily-reports/settings
 * Обновление настроек отчетов
 */
router.post('/settings',
    asyncHandler(async (req, res) => {
        const newSettings = req.body;
        
        await DailyReportService.updateSettings(newSettings);

        res.json({
            success: true,
            message: 'Settings updated successfully'
        });
    })
);

export default router;

