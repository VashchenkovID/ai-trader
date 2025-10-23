import express from 'express';
import PreflightCheckService from '../services/PreflightCheckService.js';
import ServiceManager from '../services/ServiceManager.js';

const router = express.Router();

/**
 * Запуск проверки готовности
 */
router.post('/run', async (req, res) => {
    try {
        const result = await PreflightCheckService.runCheck();
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка запуска проверки готовности:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка запуска проверки готовности',
            error: error.message
        });
    }
});

/**
 * Статус проверки готовности
 */
router.get('/status', async (req, res) => {
    try {
        const status = await PreflightCheckService.getStatus();
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('Ошибка получения статуса проверки готовности:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статуса проверки готовности',
            error: error.message
        });
    }
});

/**
 * Результаты проверки готовности
 */
router.get('/results', async (req, res) => {
    try {
        const results = await PreflightCheckService.getResults();
        res.json({
            success: true,
            data: results
        });
    } catch (error) {
        console.error('Ошибка получения результатов проверки готовности:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения результатов проверки готовности',
            error: error.message
        });
    }
});

export default router;
