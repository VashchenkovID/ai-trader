import express from 'express';
import TradingEngine from '../services/TradingEngine.js';
import ServiceManager from '../services/ServiceManager.js';

const router = express.Router();

/**
 * Позиции портфеля
 */
router.get('/positions', async (req, res) => {
    try {
        const portfolio = await TradingEngine.getPortfolioValue();
        const positions = portfolio?.positions || {};
        res.json({
            success: true,
            data: positions
        });
    } catch (error) {
        console.error('Ошибка получения позиций портфеля:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения позиций портфеля',
            error: error.message
        });
    }
});

/**
 * Позиция по конкретному инструменту
 */
router.get('/positions/:figi', async (req, res) => {
    try {
        const { figi } = req.params;
        const position = await TradingEngine.getPositionByFigi(figi);
        res.json({
            success: true,
            data: position
        });
    } catch (error) {
        console.error('Ошибка получения позиции:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения позиции',
            error: error.message
        });
    }
});

/**
 * История портфеля
 */
router.get('/history', async (req, res) => {
    try {
        const history = await TradingEngine.getPortfolioHistory();
        res.json({
            success: true,
            data: history
        });
    } catch (error) {
        console.error('Ошибка получения истории портфеля:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения истории портфеля',
            error: error.message
        });
    }
});

/**
 * Аналитика портфеля
 */
router.get('/analytics', async (req, res) => {
    try {
        const analytics = await TradingEngine.getPortfolioAnalytics();
        res.json({
            success: true,
            data: analytics
        });
    } catch (error) {
        console.error('Ошибка получения аналитики портфеля:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения аналитики портфеля',
            error: error.message
        });
    }
});

/**
 * Секторальное распределение
 */
router.get('/sector-allocation', async (req, res) => {
    try {
        const allocation = await TradingEngine.getSectorAllocation();
        res.json({
            success: true,
            data: allocation
        });
    } catch (error) {
        console.error('Ошибка получения секторального распределения:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения секторального распределения',
            error: error.message
        });
    }
});

/**
 * Риск-метрики портфеля
 */
router.get('/risk-metrics', async (req, res) => {
    try {
        const riskMetrics = await TradingEngine.getPortfolioRiskMetrics();
        res.json({
            success: true,
            data: riskMetrics
        });
    } catch (error) {
        console.error('Ошибка получения риск-метрик портфеля:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения риск-метрик портфеля',
            error: error.message
        });
    }
});

export default router;
