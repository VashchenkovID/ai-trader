import express from 'express';
import InstrumentStats from '../models/InstrumentStats.js';
import RiskManagementService from '../services/RiskManagementService.js';
import CacheService from '../services/CacheService.js';

const router = express.Router();

/**
 * Получить статистику по всем инструментам
 */
router.get('/', async (req, res) => {
    try {
        const { minTrades = 0, sortBy = 'totalTrades', order = 'DESC', limit = 100 } = req.query;
        
        const where = {};
        if (parseInt(minTrades) > 0) {
            where.totalTrades = { [require('sequelize').Op.gte]: parseInt(minTrades) };
        }
        
        const orderBy = [[sortBy, order.toUpperCase()]];
        
        const stats = await InstrumentStats.findAll({
            where,
            order: orderBy,
            limit: parseInt(limit)
        });
        
        res.json({
            success: true,
            data: stats,
            count: stats.length
        });
    } catch (error) {
        console.error('❌ Ошибка получения статистики инструментов:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статистики инструментов',
            error: error.message
        });
    }
});

/**
 * Получить статистику по конкретному инструменту
 */
router.get('/:figi', async (req, res) => {
    try {
        const { figi } = req.params;
        
        let stats = await InstrumentStats.findOne({ where: { figi } });
        
        if (!stats) {
            // Создаем новую запись, если её нет
            stats = await InstrumentStats.getOrCreateStats(figi);
        }
        
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error(`❌ Ошибка получения статистики для ${req.params.figi}:`, error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статистики инструмента',
            error: error.message
        });
    }
});

/**
 * Рассчитать Келли для инструмента
 */
router.post('/calculate-kelly', async (req, res) => {
    try {
        const { figi, portfolioValue } = req.body;
        
        if (!figi) {
            return res.status(400).json({
                success: false,
                message: 'FIGI обязателен'
            });
        }
        
        let stats = await InstrumentStats.findOne({ where: { figi } });
        
        if (!stats || stats.totalTrades < 1) {
            return res.json({
                success: true,
                data: {
                    figi,
                    kellyFraction: 0,
                    conservativeKelly: 0,
                    recommendedPositionSize: 0,
                    insufficientData: true,
                    message: 'Недостаточно данных для расчета Келли'
                }
            });
        }
        
        // Рассчитываем Келли, если еще не рассчитан
        let kellyFraction = stats.kellyFraction;
        if (kellyFraction === null || kellyFraction === undefined) {
            const winRate = stats.winRate || 0.5;
            const averageWin = stats.averageWin || 0.01;
            const averageLoss = Math.abs(stats.averageLoss) || 0.01;
            
            if (averageWin > 0) {
                kellyFraction = (winRate * averageWin - (1 - winRate) * averageLoss) / averageWin;
                kellyFraction = Math.min(Math.max(kellyFraction, 0), 0.25);
            } else {
                kellyFraction = 0;
            }
        }
        
        const conservativeKelly = kellyFraction * 0.25;
        const recommendedPositionSize = portfolioValue ? portfolioValue * conservativeKelly : 0;
        
        res.json({
            success: true,
            data: {
                figi,
                ticker: stats.ticker,
                winRate: stats.winRate,
                averageWin: stats.averageWin,
                averageLoss: stats.averageLoss,
                totalTrades: stats.totalTrades,
                kellyFraction,
                conservativeKelly,
                recommendedPositionSize,
                volatility: stats.volatility,
                insufficientData: false
            }
        });
    } catch (error) {
        console.error('❌ Ошибка расчета Келли:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка расчета Келли',
            error: error.message
        });
    }
});

/**
 * Обновить статистику по инструменту (вручную)
 */
router.post('/:figi/refresh', async (req, res) => {
    try {
        const { figi } = req.params;
        
        // Обновляем волатильность
        await RiskManagementService.updateInstrumentVolatility(figi);
        
        const stats = await InstrumentStats.findOne({ where: { figi } });
        
        res.json({
            success: true,
            message: 'Статистика обновлена',
            data: stats
        });
    } catch (error) {
        console.error(`❌ Ошибка обновления статистики для ${req.params.figi}:`, error);
        res.status(500).json({
            success: false,
            message: 'Ошибка обновления статистики',
            error: error.message
        });
    }
});

/**
 * Получить топ инструментов по метрике
 */
router.get('/top/:metric', async (req, res) => {
    try {
        const { metric } = req.params;
        const { limit = 10 } = req.query;
        
        const validMetrics = ['winRate', 'kellyFraction', 'totalTrades', 'averageWin'];
        if (!validMetrics.includes(metric)) {
            return res.status(400).json({
                success: false,
                message: `Недопустимая метрика. Доступны: ${validMetrics.join(', ')}`
            });
        }
        
        const stats = await InstrumentStats.findAll({
            where: {
                totalTrades: { [require('sequelize').Op.gte]: 5 }
            },
            order: [[metric, 'DESC']],
            limit: parseInt(limit)
        });
        
        res.json({
            success: true,
            data: stats,
            metric,
            count: stats.length
        });
    } catch (error) {
        console.error(`❌ Ошибка получения топ инструментов по ${req.params.metric}:`, error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения топ инструментов',
            error: error.message
        });
    }
});

export default router;

