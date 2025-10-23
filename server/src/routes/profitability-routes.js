import express from 'express';
import ProfitabilityTracker from '../services/ProfitabilityTracker.js';
import ServiceManager from '../services/ServiceManager.js';

const router = express.Router();

/**
 * Статус трекера прибыльности
 */
router.get('/status', async (req, res) => {
    try {
        const status = await ProfitabilityTracker.getStatus();
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('Ошибка получения статуса трекера прибыльности:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статуса трекера прибыльности',
            error: error.message
        });
    }
});

/**
 * Анализ прибыльности
 */
router.get('/analysis', async (req, res) => {
    try {
        const analysis = await ProfitabilityTracker.getAnalysis();
        res.json({
            success: true,
            data: analysis
        });
    } catch (error) {
        console.error('Ошибка получения анализа прибыльности:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения анализа прибыльности',
            error: error.message
        });
    }
});

/**
 * Отчет о прибыльности
 */
router.get('/report', async (req, res) => {
    try {
        const report = await ProfitabilityTracker.getReport();
        res.json({
            success: true,
            data: report
        });
    } catch (error) {
        console.error('Ошибка получения отчета о прибыльности:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения отчета о прибыльности',
            error: error.message
        });
    }
});

export default router;
