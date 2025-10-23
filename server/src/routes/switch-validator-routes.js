import express from 'express';
import SwitchValidator from '../services/SwitchValidator.js';
import ServiceManager from '../services/ServiceManager.js';

const router = express.Router();

/**
 * Микро-валидация переключения
 */
router.get('/micro', async (req, res) => {
    try {
        const validation = await SwitchValidator.microValidation();
        res.json({
            success: true,
            data: validation
        });
    } catch (error) {
        console.error('Ошибка микро-валидации переключения:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка микро-валидации переключения',
            error: error.message
        });
    }
});

/**
 * Полная валидация переключения
 */
router.get('/full', async (req, res) => {
    try {
        const validation = await SwitchValidator.fullValidation();
        res.json({
            success: true,
            data: validation
        });
    } catch (error) {
        console.error('Ошибка полной валидации переключения:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка полной валидации переключения',
            error: error.message
        });
    }
});

/**
 * История валидации переключения
 */
router.get('/history', async (req, res) => {
    try {
        const history = await SwitchValidator.getValidationHistory();
        res.json({
            success: true,
            data: history
        });
    } catch (error) {
        console.error('Ошибка получения истории валидации переключения:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения истории валидации переключения',
            error: error.message
        });
    }
});

export default router;
