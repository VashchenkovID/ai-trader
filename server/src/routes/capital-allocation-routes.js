import express from 'express';
import CapitalAllocationStrategy from '../services/CapitalAllocationStrategy.js';
import ServiceManager from '../services/ServiceManager.js';

const router = express.Router();

/**
 * Статус распределения капитала
 */
router.get('/status', async (req, res) => {
    try {
        const status = await CapitalAllocationStrategy.getStatus();
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('Ошибка получения статуса распределения капитала:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статуса распределения капитала',
            error: error.message
        });
    }
});

/**
 * Анализ портфеля для распределения капитала
 */
router.get('/portfolio-analysis', async (req, res) => {
    try {
        const analysis = await CapitalAllocationStrategy.getPortfolioAnalysis();
        res.json({
            success: true,
            data: analysis
        });
    } catch (error) {
        console.error('Ошибка получения анализа портфеля для распределения капитала:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения анализа портфеля для распределения капитала',
            error: error.message
        });
    }
});

/**
 * Оптимизация распределения капитала
 */
router.post('/optimize', async (req, res) => {
    try {
        const { parameters } = req.body;
        const result = await CapitalAllocationStrategy.optimize(parameters);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка оптимизации распределения капитала:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка оптимизации распределения капитала',
            error: error.message
        });
    }
});

/**
 * Автоматическая ребалансировка
 */
router.post('/auto-rebalance', async (req, res) => {
    try {
        const result = await CapitalAllocationStrategy.autoRebalance();
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка автоматической ребалансировки:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка автоматической ребалансировки',
            error: error.message
        });
    }
});

/**
 * Инструменты для распределения капитала
 */
router.get('/instruments', async (req, res) => {
    try {
        const instruments = await CapitalAllocationStrategy.getInstruments();
        res.json({
            success: true,
            data: instruments
        });
    } catch (error) {
        console.error('Ошибка получения инструментов для распределения капитала:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения инструментов для распределения капитала',
            error: error.message
        });
    }
});

/**
 * История распределения капитала
 */
router.get('/history', async (req, res) => {
    try {
        const history = await CapitalAllocationStrategy.getHistory();
        res.json({
            success: true,
            data: history
        });
    } catch (error) {
        console.error('Ошибка получения истории распределения капитала:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения истории распределения капитала',
            error: error.message
        });
    }
});

/**
 * Настройки распределения капитала
 */
router.post('/settings', async (req, res) => {
    try {
        const { settings } = req.body;
        const result = await CapitalAllocationStrategy.updateSettings(settings);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка обновления настроек распределения капитала:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка обновления настроек распределения капитала',
            error: error.message
        });
    }
});

export default router;
