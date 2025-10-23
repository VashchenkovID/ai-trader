import express from 'express';
import RiskAdjustmentService from '../services/RiskAdjustmentService.js';
import ServiceManager from '../services/ServiceManager.js';

const router = express.Router();

/**
 * Статус корректировки риска
 */
router.get('/status', async (req, res) => {
    try {
        const status = await RiskAdjustmentService.getStatus();
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('Ошибка получения статуса корректировки риска:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статуса корректировки риска',
            error: error.message
        });
    }
});

/**
 * Анализ корректировки риска
 */
router.get('/analysis', async (req, res) => {
    try {
        const analysis = await RiskAdjustmentService.getAnalysis();
        res.json({
            success: true,
            data: analysis
        });
    } catch (error) {
        console.error('Ошибка получения анализа корректировки риска:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения анализа корректировки риска',
            error: error.message
        });
    }
});

/**
 * Автоматическая корректировка риска
 */
router.post('/auto-adjust', async (req, res) => {
    try {
        const result = await RiskAdjustmentService.autoAdjust();
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка автоматической корректировки риска:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка автоматической корректировки риска',
            error: error.message
        });
    }
});

/**
 * История корректировки риска
 */
router.get('/history', async (req, res) => {
    try {
        const history = await RiskAdjustmentService.getHistory();
        res.json({
            success: true,
            data: history
        });
    } catch (error) {
        console.error('Ошибка получения истории корректировки риска:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения истории корректировки риска',
            error: error.message
        });
    }
});

/**
 * Настройки корректировки риска
 */
router.post('/settings', async (req, res) => {
    try {
        const { settings } = req.body;
        const result = await RiskAdjustmentService.updateSettings(settings);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка обновления настроек корректировки риска:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка обновления настроек корректировки риска',
            error: error.message
        });
    }
});

export default router;
