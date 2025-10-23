import express from 'express';
import PortfolioMigrator from '../services/PortfolioMigrator.js';
import ServiceManager from '../services/ServiceManager.js';

const router = express.Router();

/**
 * Создание плана миграции портфеля
 */
router.post('/create-plan', async (req, res) => {
    try {
        const { parameters } = req.body;
        const result = await PortfolioMigrator.createMigrationPlan(parameters);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка создания плана миграции портфеля:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка создания плана миграции портфеля',
            error: error.message
        });
    }
});

/**
 * Выполнение миграции портфеля
 */
router.post('/execute', async (req, res) => {
    try {
        const { planId } = req.body;
        const result = await PortfolioMigrator.executeMigration(planId);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка выполнения миграции портфеля:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка выполнения миграции портфеля',
            error: error.message
        });
    }
});

/**
 * Статус миграции портфеля
 */
router.get('/status', async (req, res) => {
    try {
        const status = await PortfolioMigrator.getStatus();
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('Ошибка получения статуса миграции портфеля:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статуса миграции портфеля',
            error: error.message
        });
    }
});

/**
 * История миграции портфеля
 */
router.get('/history', async (req, res) => {
    try {
        const history = await PortfolioMigrator.getHistory();
        res.json({
            success: true,
            data: history
        });
    } catch (error) {
        console.error('Ошибка получения истории миграции портфеля:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения истории миграции портфеля',
            error: error.message
        });
    }
});

/**
 * Активные миграции портфеля
 */
router.get('/active', async (req, res) => {
    try {
        const active = await PortfolioMigrator.getActiveMigrations();
        res.json({
            success: true,
            data: active
        });
    } catch (error) {
        console.error('Ошибка получения активных миграций портфеля:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения активных миграций портфеля',
            error: error.message
        });
    }
});

/**
 * Очистка миграции портфеля
 */
router.post('/cleanup', async (req, res) => {
    try {
        const result = await PortfolioMigrator.cleanup();
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка очистки миграции портфеля:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка очистки миграции портфеля',
            error: error.message
        });
    }
});

/**
 * Остановка миграции портфеля
 */
router.post('/stop', async (req, res) => {
    try {
        const { migrationId } = req.body;
        const result = await PortfolioMigrator.stopMigration(migrationId);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка остановки миграции портфеля:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка остановки миграции портфеля',
            error: error.message
        });
    }
});

/**
 * Настройки миграции портфеля
 */
router.get('/settings', async (req, res) => {
    try {
        const settings = await PortfolioMigrator.getSettings();
        res.json({
            success: true,
            data: settings
        });
    } catch (error) {
        console.error('Ошибка получения настроек миграции портфеля:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения настроек миграции портфеля',
            error: error.message
        });
    }
});

/**
 * Обновление настроек миграции портфеля
 */
router.post('/settings', async (req, res) => {
    try {
        const { settings } = req.body;
        const result = await PortfolioMigrator.updateSettings(settings);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка обновления настроек миграции портфеля:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка обновления настроек миграции портфеля',
            error: error.message
        });
    }
});

export default router;
