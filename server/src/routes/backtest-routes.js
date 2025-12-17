/**
 * API routes для бэктестинга стратегий
 */

import express from 'express';
import BacktestingService from '../services/BacktestingService.js';
import BacktestResult from '../models/BacktestResult.js';
import TradingStrategy from '../models/TradingStrategy.js';
import { Op } from 'sequelize';

const router = express.Router();

// Ассоциации устанавливаются в initDatabase.js
// Здесь мы просто проверяем, что они доступны
// Если ассоциации не установлены, Sequelize выдаст ошибку при использовании include

/**
 * GET /api/backtest/results/:strategyId
 * Получение последних результатов бэктестинга для стратегии
 */
router.get('/results/:strategyId', async (req, res) => {
    try {
        const { strategyId } = req.params;
        const { limit = 10, backtestType = 'walk_forward' } = req.query;

        // Проверяем существование стратегии
        const strategy = await TradingStrategy.findByPk(strategyId);
        if (!strategy) {
            return res.status(404).json({
                success: false,
                error: 'Стратегия не найдена'
            });
        }

        // Получаем последние результаты бэктестинга
        const results = await BacktestResult.findAll({
            where: {
                strategyId: parseInt(strategyId),
                backtestType: backtestType
            },
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            include: [{
                model: TradingStrategy,
                as: 'strategy',
                attributes: ['id', 'name']
            }]
        });

        res.json({
            success: true,
            data: {
                strategy: {
                    id: strategy.id,
                    name: strategy.name
                },
                results: results.map(result => ({
                    id: result.id,
                    backtestType: result.backtestType,
                    startDate: result.startDate,
                    endDate: result.endDate,
                    initialCapital: result.initialCapital,
                    finalCapital: result.finalCapital,
                    totalReturn: result.totalReturn,
                    totalProfit: result.finalCapital - result.initialCapital, // Вычисляем из капитала
                    totalTrades: result.totalTrades,
                    profitableTrades: result.profitableTrades,
                    losingTrades: result.losingTrades,
                    winRate: result.winRate,
                    maxDrawdown: result.maxDrawdown,
                    sharpeRatio: result.sharpeRatio,
                    sortinoRatio: result.sortinoRatio,
                    profitFactor: result.profitFactor,
                    calmarRatio: result.calmarRatio,
                    metrics: result.metrics,
                    status: result.status,
                    error: result.error,
                    executionTime: result.executionTime,
                    createdAt: result.createdAt
                })),
                count: results.length
            }
        });
    } catch (error) {
        console.error('❌ Ошибка получения результатов бэктестинга:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/backtest/run/:strategyId
 * Запуск бэктестинга для конкретной стратегии вручную
 */
router.post('/run/:strategyId', async (req, res) => {
    try {
        const { strategyId } = req.params;
        const {
            startDate,
            endDate,
            windowSizeMonths = 2,
            stepSizeMonths = 1,
            backtestType = 'walk_forward' // 'full' или 'walk_forward'
        } = req.body;

        // Проверяем существование стратегии
        const strategy = await TradingStrategy.findByPk(strategyId);
        if (!strategy) {
            return res.status(404).json({
                success: false,
                error: 'Стратегия не найдена'
            });
        }

        // Определяем даты
        const end = endDate ? new Date(endDate) : new Date();
        const start = startDate ? new Date(startDate) : (() => {
            const date = new Date();
            date.setMonth(date.getMonth() - 6);
            return date;
        })();

        console.log(`🚀 Запуск бэктестинга для стратегии ${strategyId} (${strategy.name})...`);
        console.log(`   Тип: ${backtestType}`);
        console.log(`   Период: ${start.toISOString()} - ${end.toISOString()}`);

        let result;

        if (backtestType === 'walk_forward') {
            // Walk-forward анализ
            result = await BacktestingService.walkForwardAnalysis(
                parseInt(strategyId),
                {
                    startDate: start,
                    endDate: end,
                    windowSizeMonths: parseInt(windowSizeMonths),
                    stepSizeMonths: parseInt(stepSizeMonths),
                    saveToDb: true
                }
            );
        } else {
            // Полный бэктестинг
            result = await BacktestingService.backtestStrategy(
                parseInt(strategyId),
                {
                    startDate: start,
                    endDate: end,
                    saveToDb: true
                }
            );
        }

        res.json({
            success: true,
            data: {
                strategy: {
                    id: strategy.id,
                    name: strategy.name
                },
                backtestType: backtestType,
                result: result
            },
            message: 'Бэктестинг успешно выполнен'
        });
    } catch (error) {
        console.error('❌ Ошибка выполнения бэктестинга:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/backtest/compare
 * Сравнение результатов бэктестинга всех стратегий
 */
router.get('/compare', async (req, res) => {
    try {
        const { backtestType = 'walk_forward', limit = 1 } = req.query;

        // Получаем все активные стратегии
        const strategies = await TradingStrategy.findAll({
            where: { isActive: true }
        });

        const comparison = [];

        for (const strategy of strategies) {
            // Получаем последний результат бэктестинга для каждой стратегии
            const latestResult = await BacktestResult.findOne({
                where: {
                    strategyId: strategy.id,
                    backtestType: backtestType,
                    status: 'completed'
                },
                order: [['createdAt', 'DESC']]
            });

            if (latestResult) {
                comparison.push({
                    strategyId: strategy.id,
                    strategyName: strategy.name,
                    totalReturn: latestResult.totalReturn,
                    totalProfit: latestResult.finalCapital - latestResult.initialCapital, // Вычисляем из капитала
                    totalTrades: latestResult.totalTrades,
                    winRate: latestResult.winRate,
                    maxDrawdown: latestResult.maxDrawdown,
                    sharpeRatio: latestResult.sharpeRatio,
                    profitFactor: latestResult.profitFactor,
                    startDate: latestResult.startDate,
                    endDate: latestResult.endDate,
                    createdAt: latestResult.createdAt
                });
            } else {
                // Стратегия без результатов бэктестинга
                comparison.push({
                    strategyId: strategy.id,
                    strategyName: strategy.name,
                    totalReturn: null,
                    totalProfit: null,
                    totalTrades: null,
                    winRate: null,
                    maxDrawdown: null,
                    sharpeRatio: null,
                    profitFactor: null,
                    startDate: null,
                    endDate: null,
                    createdAt: null,
                    note: 'Нет результатов бэктестинга'
                });
            }
        }

        // Сортируем по доходности (по убыванию)
        comparison.sort((a, b) => {
            if (a.totalReturn === null) return 1;
            if (b.totalReturn === null) return -1;
            return b.totalReturn - a.totalReturn;
        });

        res.json({
            success: true,
            data: {
                backtestType: backtestType,
                comparison: comparison,
                count: comparison.length,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('❌ Ошибка сравнения результатов бэктестинга:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/backtest/report/:strategyId
 * Получение детального отчета по бэктестингу
 */
router.get('/report/:strategyId', async (req, res) => {
    try {
        const { strategyId } = req.params;
        const { resultId, backtestType = 'walk_forward' } = req.query;

        // Проверяем существование стратегии
        const strategy = await TradingStrategy.findByPk(strategyId);
        if (!strategy) {
            return res.status(404).json({
                success: false,
                error: 'Стратегия не найдена'
            });
        }

        // Получаем результат бэктестинга
        let result;
        if (resultId) {
            result = await BacktestResult.findByPk(resultId, {
                include: [{
                    model: TradingStrategy,
                    as: 'strategy',
                    attributes: ['id', 'name']
                }]
            });
        } else {
            // Получаем последний результат
            result = await BacktestResult.findOne({
                where: {
                    strategyId: parseInt(strategyId),
                    backtestType: backtestType,
                    status: 'completed'
                },
                order: [['createdAt', 'DESC']],
                include: [{
                    model: TradingStrategy,
                    as: 'strategy',
                    attributes: ['id', 'name']
                }]
            });
        }

        if (!result) {
            return res.status(404).json({
                success: false,
                error: 'Результаты бэктестинга не найдены'
            });
        }

        // Генерируем отчет, если его нет
        let report = result.report;
        if (!report) {
            // BacktestingService экспортируется как singleton
            if (result.backtestType === 'walk_forward') {
                // Для walk-forward анализа генерируем отчет из метрик
                const walkForwardData = result.metrics || {};
                // Формируем данные для генерации отчета
                const reportData = {
                    strategyName: strategy.name,
                    period: {
                        startDate: result.startDate,
                        endDate: result.endDate
                    },
                    windowSizeMonths: walkForwardData.windowSizeMonths || 2,
                    stepSizeMonths: walkForwardData.stepSizeMonths || 1,
                    windowResults: walkForwardData.windowResults || [],
                    stabilityAnalysis: walkForwardData.stabilityAnalysis || {},
                    degradationAnalysis: walkForwardData.degradationAnalysis || {}
                };
                report = BacktestingService.generateWalkForwardReport(reportData);
            } else {
                // Для полного бэктестинга генерируем обычный отчет
                const reportData = {
                    strategyName: strategy.name,
                    period: {
                        startDate: result.startDate,
                        endDate: result.endDate
                    },
                    metrics: {
                        totalReturn: result.totalReturn,
                        totalProfit: result.finalCapital - result.initialCapital, // Вычисляем из капитала
                        totalTrades: result.totalTrades,
                        winRate: result.winRate,
                        profitFactor: result.profitFactor,
                        sharpeRatio: result.sharpeRatio,
                        maxDrawdown: result.maxDrawdown,
                        calmarRatio: result.calmarRatio,
                        sortinoRatio: result.sortinoRatio
                    },
                    trades: result.trades || [],
                    monthlyReturns: result.monthlyReturns || [],
                    instrumentResults: [],
                    alerts: result.alerts || []
                };
                report = BacktestingService.generateReport(reportData);
            }
        }

        res.json({
            success: true,
            data: {
                result: {
                    id: result.id,
                    backtestType: result.backtestType,
                    startDate: result.startDate,
                    endDate: result.endDate,
                    initialCapital: result.initialCapital,
                    finalCapital: result.finalCapital,
                    totalReturn: result.totalReturn,
                    totalProfit: result.finalCapital - result.initialCapital, // Вычисляем из капитала
                    totalTrades: result.totalTrades,
                    profitableTrades: result.profitableTrades,
                    losingTrades: result.losingTrades,
                    winRate: result.winRate,
                    maxDrawdown: result.maxDrawdown,
                    sharpeRatio: result.sharpeRatio,
                    sortinoRatio: result.sortinoRatio,
                    profitFactor: result.profitFactor,
                    calmarRatio: result.calmarRatio,
                    metrics: result.metrics,
                    equityCurve: result.equityCurve,
                    monthlyReturns: result.monthlyReturns,
                    trades: result.trades,
                    alerts: result.alerts,
                    status: result.status,
                    executionTime: result.executionTime,
                    createdAt: result.createdAt
                },
                strategy: {
                    id: strategy.id,
                    name: strategy.name
                },
                report: report
            }
        });
    } catch (error) {
        console.error('❌ Ошибка получения отчета бэктестинга:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/backtest/list
 * Получение списка всех результатов бэктестинга
 */
router.get('/list', async (req, res) => {
    try {
        const {
            strategyId,
            backtestType,
            status = 'completed',
            limit = 50,
            offset = 0
        } = req.query;

        const where = {};
        if (strategyId) {
            where.strategyId = parseInt(strategyId);
        }
        if (backtestType) {
            where.backtestType = backtestType;
        }
        if (status) {
            where.status = status;
        }

        const { count, rows } = await BacktestResult.findAndCountAll({
            where: where,
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset),
            include: [{
                model: TradingStrategy,
                as: 'strategy',
                attributes: ['id', 'name']
            }]
        });

        res.json({
            success: true,
            data: {
                results: rows.map(result => ({
                    id: result.id,
                    strategyId: result.strategyId,
                    strategyName: result.strategy?.name || 'Unknown',
                    backtestType: result.backtestType,
                    startDate: result.startDate,
                    endDate: result.endDate,
                    totalReturn: result.totalReturn,
                    totalProfit: result.finalCapital - result.initialCapital, // Вычисляем из капитала
                    totalTrades: result.totalTrades,
                    winRate: result.winRate,
                    maxDrawdown: result.maxDrawdown,
                    sharpeRatio: result.sharpeRatio,
                    status: result.status,
                    createdAt: result.createdAt
                })),
                pagination: {
                    total: count,
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    hasMore: parseInt(offset) + parseInt(limit) < count
                }
            }
        });
    } catch (error) {
        console.error('❌ Ошибка получения списка результатов бэктестинга:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

export default router;

