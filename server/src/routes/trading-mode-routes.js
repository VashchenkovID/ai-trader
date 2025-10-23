import express from 'express';
import TradingModeManager from '../services/TradingModeManager.js';
import ServiceManager from '../services/ServiceManager.js';

const router = express.Router();

/**
 * Текущий режим торговли
 */
router.get('/current', async (req, res) => {
    try {
        const mode = await TradingModeManager.getCurrentMode();
        res.json({
            success: true,
            data: mode
        });
    } catch (error) {
        console.error('Ошибка получения текущего режима торговли:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения текущего режима торговли',
            error: error.message
        });
    }
});

/**
 * Переключение режима торговли
 */
router.post('/switch', async (req, res) => {
    try {
        const { mode } = req.body;
        const result = await TradingModeManager.switchMode(mode);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка переключения режима торговли:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка переключения режима торговли',
            error: error.message
        });
    }
});

/**
 * История режимов торговли
 */
router.get('/history', async (req, res) => {
    try {
        const history = await TradingModeManager.getHistory();
        res.json({
            success: true,
            data: history
        });
    } catch (error) {
        console.error('Ошибка получения истории режимов торговли:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения истории режимов торговли',
            error: error.message
        });
    }
});

/**
 * Настройки режима торговли
 */
router.get('/settings', async (req, res) => {
    try {
        const settings = await TradingModeManager.getSettings();
        res.json({
            success: true,
            data: settings
        });
    } catch (error) {
        console.error('Ошибка получения настроек режима торговли:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения настроек режима торговли',
            error: error.message
        });
    }
});

/**
 * Обновление настроек режима торговли
 */
router.put('/settings', async (req, res) => {
    try {
        const { settings } = req.body;
        const result = await TradingModeManager.updateSettings(settings);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка обновления настроек режима торговли:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка обновления настроек режима торговли',
            error: error.message
        });
    }
});

/**
 * Валидация режима торговли
 */
router.get('/validation', async (req, res) => {
    try {
        const validation = await TradingModeManager.validateMode();
        res.json({
            success: true,
            data: validation
        });
    } catch (error) {
        console.error('Ошибка валидации режима торговли:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка валидации режима торговли',
            error: error.message
        });
    }
});

/**
 * Производительность режима торговли
 */
router.get('/performance', async (req, res) => {
    try {
        const performance = await TradingModeManager.getPerformance();
        res.json({
            success: true,
            data: performance
        });
    } catch (error) {
        console.error('Ошибка получения производительности режима торговли:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения производительности режима торговли',
            error: error.message
        });
    }
});

/**
 * Миграция режима торговли
 */
router.post('/migrate', async (req, res) => {
    try {
        const { targetMode } = req.body;
        const result = await TradingModeManager.migrateMode(targetMode);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка миграции режима торговли:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка миграции режима торговли',
            error: error.message
        });
    }
});

/**
 * Статус миграции режима торговли
 */
router.get('/migration-status', async (req, res) => {
    try {
        const status = await TradingModeManager.getMigrationStatus();
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('Ошибка получения статуса миграции режима торговли:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статуса миграции режима торговли',
            error: error.message
        });
    }
});

export default router;
