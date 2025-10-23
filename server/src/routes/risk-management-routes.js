import express from 'express';
import RiskManagementService from '../services/RiskManagementService.js';
import ServiceManager from '../services/ServiceManager.js';

const router = express.Router();

/**
 * Статус риск-менеджмента
 */
router.get('/status', async (req, res) => {
    try {
        const status = await RiskManagementService.getStatus();
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('Ошибка получения статуса риск-менеджмента:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статуса риск-менеджмента',
            error: error.message
        });
    }
});

/**
 * Статистика риск-менеджмента
 */
router.get('/stats', async (req, res) => {
    try {
        const stats = await RiskManagementService.getStats();
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Ошибка получения статистики риск-менеджмента:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статистики риск-менеджмента',
            error: error.message
        });
    }
});

/**
 * Установка лимитов
 */
router.post('/limits', async (req, res) => {
    try {
        const { limits } = req.body;
        const result = await RiskManagementService.setLimits(limits);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка установки лимитов:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка установки лимитов',
            error: error.message
        });
    }
});

/**
 * Сброс экстренного режима
 */
router.post('/reset-emergency', async (req, res) => {
    try {
        const result = await RiskManagementService.resetEmergencyMode();
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка сброса экстренного режима:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка сброса экстренного режима',
            error: error.message
        });
    }
});

export default router;
