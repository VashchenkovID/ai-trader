import express from 'express';
import CapitalScalingService from '../services/CapitalScalingService.js';
import ServiceManager from '../services/ServiceManager.js';

const router = express.Router();

/**
 * Статус масштабирования капитала
 */
router.get('/status', async (req, res) => {
    try {
        const status = await CapitalScalingService.getStatus();
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('Ошибка получения статуса масштабирования капитала:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статуса масштабирования капитала',
            error: error.message
        });
    }
});

/**
 * Производительность масштабирования
 */
router.get('/performance', async (req, res) => {
    try {
        const performance = await CapitalScalingService.getPerformance();
        res.json({
            success: true,
            data: performance
        });
    } catch (error) {
        console.error('Ошибка получения производительности масштабирования:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения производительности масштабирования',
            error: error.message
        });
    }
});

/**
 * Можно ли увеличить капитал
 */
router.get('/can-increase', async (req, res) => {
    try {
        const canIncrease = await CapitalScalingService.canIncreaseCapital();
        res.json({
            success: true,
            data: canIncrease
        });
    } catch (error) {
        console.error('Ошибка проверки возможности увеличения капитала:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка проверки возможности увеличения капитала',
            error: error.message
        });
    }
});

/**
 * Увеличение капитала
 */
router.post('/increase', async (req, res) => {
    try {
        const { amount } = req.body;
        const result = await CapitalScalingService.increaseCapital(amount);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка увеличения капитала:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка увеличения капитала',
            error: error.message
        });
    }
});

/**
 * Уменьшение капитала
 */
router.post('/decrease', async (req, res) => {
    try {
        const { amount } = req.body;
        const result = await CapitalScalingService.decreaseCapital(amount);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка уменьшения капитала:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка уменьшения капитала',
            error: error.message
        });
    }
});

/**
 * Автоматическая корректировка
 */
router.post('/auto-adjust', async (req, res) => {
    try {
        const result = await CapitalScalingService.autoAdjustCapital();
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка автоматической корректировки капитала:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка автоматической корректировки капитала',
            error: error.message
        });
    }
});

/**
 * История масштабирования
 */
router.get('/history', async (req, res) => {
    try {
        const history = await CapitalScalingService.getHistory();
        res.json({
            success: true,
            data: history
        });
    } catch (error) {
        console.error('Ошибка получения истории масштабирования:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения истории масштабирования',
            error: error.message
        });
    }
});

/**
 * Уровни капитала
 */
router.get('/levels', async (req, res) => {
    try {
        const levels = await CapitalScalingService.getLevels();
        res.json({
            success: true,
            data: levels
        });
    } catch (error) {
        console.error('Ошибка получения уровней капитала:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения уровней капитала',
            error: error.message
        });
    }
});

/**
 * Создание уровней капитала
 */
router.post('/levels', async (req, res) => {
    try {
        const { levels } = req.body;
        const result = await CapitalScalingService.createLevels(levels);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка создания уровней капитала:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка создания уровней капитала',
            error: error.message
        });
    }
});

/**
 * Настройки масштабирования
 */
router.post('/settings', async (req, res) => {
    try {
        const { settings } = req.body;
        const result = await CapitalScalingService.updateSettings(settings);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка обновления настроек масштабирования:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка обновления настроек масштабирования',
            error: error.message
        });
    }
});

export default router;
