import express from 'express';
import StrategyAllocationService from '../services/StrategyAllocationService.js';
import TradingStrategy from '../models/TradingStrategy.js';
import PortfolioAllocation from '../models/PortfolioAllocation.js';
import PositionStrategy from '../models/PositionStrategy.js';
import { Op } from 'sequelize';

const router = express.Router();

/**
 * GET /api/strategies
 * Получить все стратегии с их распределением бюджета
 */
router.get('/', async (req, res) => {
    try {
        // Убеждаемся, что сервис инициализирован
        if (!StrategyAllocationService.isInitialized) {
            await StrategyAllocationService.initialize();
        }
        
        const strategies = await StrategyAllocationService.getAllStrategiesWithAllocations();
        res.json({
            success: true,
            data: strategies
        });
    } catch (error) {
        console.error('Error getting strategies:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * GET /api/strategies/:id
 * Получить детали стратегии
 */
router.get('/:id', async (req, res) => {
    try {
        const strategy = await TradingStrategy.findByPk(req.params.id);
        if (!strategy) {
            return res.status(404).json({
                success: false,
                message: 'Strategy not found'
            });
        }

        const allocation = await PortfolioAllocation.getOrCreateAllocation(strategy.id);
        
        res.json({
            success: true,
            data: {
                ...strategy.toJSON(),
                allocation: {
                    allocatedAmount: parseFloat(allocation.allocatedAmount),
                    usedAmount: parseFloat(allocation.usedAmount),
                    availableAmount: parseFloat(allocation.allocatedAmount) - parseFloat(allocation.usedAmount)
                }
            }
        });
    } catch (error) {
        console.error('Error getting strategy:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * PUT /api/strategies/:id
 * Обновить стратегию
 */
router.put('/:id', async (req, res) => {
    try {
        const strategy = await TradingStrategy.findByPk(req.params.id);
        if (!strategy) {
            return res.status(404).json({
                success: false,
                message: 'Strategy not found'
            });
        }

        const {
            name,
            type,
            timeframe,
            budgetAllocation,
            minConfidence,
            minScore,
            stopLossPercent,
            takeProfitPercent,
            maxPositions,
            isActive,
            priority,
            metadata
        } = req.body;

        // Валидация budgetAllocation
        if (budgetAllocation !== undefined) {
            const allStrategies = await TradingStrategy.findAll({
                where: {
                    isActive: true,
                    id: { [Op.ne]: strategy.id }
                }
            });
            
            const totalAllocation = allStrategies.reduce((sum, s) => sum + s.budgetAllocation, 0) + budgetAllocation;
            if (totalAllocation > 100) {
                return res.status(400).json({
                    success: false,
                    message: `Total budget allocation cannot exceed 100%. Current: ${totalAllocation}%`
                });
            }
        }

        await strategy.update({
            name,
            type,
            timeframe,
            budgetAllocation,
            minConfidence,
            minScore,
            stopLossPercent,
            takeProfitPercent,
            maxPositions,
            isActive,
            priority,
            metadata
        });

        // Если изменился budgetAllocation, обновляем распределение
        if (budgetAllocation !== undefined) {
            const portfolioSettings = await (await import('../services/SettingsService.js')).default.getPortfolioSettings();
            const totalBudget = portfolioSettings.user_max_portfolio_budget || 1000000;
            const allocatedAmount = (totalBudget * budgetAllocation) / 100;
            await PortfolioAllocation.updateAllocation(strategy.id, allocatedAmount);
        }

        res.json({
            success: true,
            data: strategy
        });
    } catch (error) {
        console.error('Error updating strategy:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * POST /api/strategies/rebalance
 * Перебалансировка бюджета между стратегиями
 */
router.post('/rebalance', async (req, res) => {
    try {
        const { allocations } = req.body; // { strategyId: budgetAllocationPercent }
        
        if (!allocations || typeof allocations !== 'object') {
            return res.status(400).json({
                success: false,
                message: 'Invalid allocations format'
            });
        }

        // Проверяем, что сумма = 100%
        const total = Object.values(allocations).reduce((sum, val) => sum + parseFloat(val), 0);
        if (Math.abs(total - 100) > 0.01) {
            return res.status(400).json({
                success: false,
                message: `Total allocation must equal 100%. Current: ${total}%`
            });
        }

        // Получаем общий бюджет
        const SettingsService = (await import('../services/SettingsService.js')).default;
        const portfolioSettings = await SettingsService.getPortfolioSettings();
        const totalBudget = portfolioSettings.user_max_portfolio_budget || 1000000;

        // Рассчитываем общий использованный бюджет
        let totalUsedBudget = 0;
        for (const [strategyId] of Object.entries(allocations)) {
            const allocation = await PortfolioAllocation.getOrCreateAllocation(parseInt(strategyId));
            totalUsedBudget += parseFloat(allocation.usedAmount || 0);
        }

        // Обновляем стратегии и распределения с учетом использованного бюджета
        for (const [strategyId, budgetAllocation] of Object.entries(allocations)) {
            const strategy = await TradingStrategy.findByPk(strategyId);
            if (!strategy) {
                continue;
            }

            await strategy.update({ budgetAllocation: parseFloat(budgetAllocation) });
            
            // Получаем текущее использованное количество для этой стратегии
            const allocation = await PortfolioAllocation.getOrCreateAllocation(strategy.id);
            const usedAmount = parseFloat(allocation.usedAmount || 0);
            
            // Целевое общее количество = процент от общего бюджета
            const targetTotalAmount = (totalBudget * parseFloat(budgetAllocation)) / 100;
            
            // Новое выделенное = целевое общее (но не меньше использованного)
            const newAllocatedAmount = Math.max(targetTotalAmount, usedAmount);
            
            await PortfolioAllocation.updateAllocation(strategy.id, newAllocatedAmount);
        }

        // Выполняем перебалансировку через сервис
        await StrategyAllocationService.rebalanceStrategies();

        res.json({
            success: true,
            message: 'Strategies rebalanced successfully'
        });
    } catch (error) {
        console.error('Error rebalancing strategies:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * GET /api/strategies/allocations
 * Получить текущее распределение бюджета
 */
router.get('/allocations/summary', async (req, res) => {
    try {
        // Определяем тип портфеля из query параметра или из текущего режима
        const portfolioType = req.query.portfolioType || req.query.type || null;
        const strategies = await StrategyAllocationService.getAllStrategiesWithAllocations(portfolioType);
        
        const summary = {
            totalAllocated: 0,
            totalUsed: 0,
            totalAvailable: 0,
            strategies: strategies.map(s => ({
                id: s.id,
                name: s.name,
                type: s.type,
                budgetAllocation: s.budgetAllocation,
                allocatedAmount: s.allocation.allocatedAmount,
                usedAmount: s.allocation.usedAmount,
                availableAmount: s.allocation.availableAmount
            }))
        };

        summary.totalAllocated = summary.strategies.reduce((sum, s) => sum + s.allocatedAmount, 0);
        summary.totalUsed = summary.strategies.reduce((sum, s) => sum + s.usedAmount, 0);
        summary.totalAvailable = summary.totalAllocated - summary.totalUsed;

        res.json({
            success: true,
            data: summary
        });
    } catch (error) {
        console.error('Error getting allocations summary:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * GET /api/strategies/:id/stats
 * Получить статистику по стратегии
 */
router.get('/:id/stats', async (req, res) => {
    try {
        const stats = await StrategyAllocationService.getStrategyStats(req.params.id);
        if (!stats) {
            return res.status(404).json({
                success: false,
                message: 'Strategy not found'
            });
        }

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Error getting strategy stats:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * GET /api/strategies/stats/all
 * Получить статистику по всем стратегиям
 */
router.get('/stats/all', async (req, res) => {
    try {
        const strategies = await TradingStrategy.findAll({
            where: { isActive: true }
        });

        const allStats = [];
        for (const strategy of strategies) {
            const stats = await StrategyAllocationService.getStrategyStats(strategy.id);
            if (stats) {
                allStats.push(stats);
            }
        }

        res.json({
            success: true,
            data: allStats
        });
    } catch (error) {
        console.error('Error getting all strategies stats:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * GET /api/strategies/:id/available-budget
 * Получить доступный бюджет стратегии
 */
router.get('/:id/available-budget', async (req, res) => {
    try {
        const availableBudget = await StrategyAllocationService.getAvailableBudget(req.params.id);
        res.json({
            success: true,
            data: {
                strategyId: req.params.id,
                availableBudget
            }
        });
    } catch (error) {
        console.error('Error getting available budget:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

export default router;

