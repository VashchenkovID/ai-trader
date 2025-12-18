import express from 'express';
import { Op } from 'sequelize';
import PortfolioOptimizer from '../services/PortfolioOptimizer.js';
import CorrelationService from '../services/CorrelationService.js';
import CacheService from '../services/CacheService.js';
import CachedInstrument from '../models/CachedInstrument.js';
import CapitalAllocationStrategy from '../services/CapitalAllocationStrategy.js';

const router = express.Router();

/**
 * Получение статуса PortfolioOptimizer
 */
router.get('/status', async (req, res) => {
    try {
        if (!PortfolioOptimizer.isInitialized) {
            await PortfolioOptimizer.initialize();
        }

        const status = PortfolioOptimizer.getStatus();
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('Ошибка получения статуса PortfolioOptimizer:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статуса',
            error: error.message
        });
    }
});

/**
 * Получение метрик производительности
 */
router.get('/performance', async (req, res) => {
    try {
        if (!PortfolioOptimizer.isInitialized) {
            await PortfolioOptimizer.initialize();
        }

        const metrics = PortfolioOptimizer.getPerformanceMetrics();
        res.json({
            success: true,
            data: metrics
        });
    } catch (error) {
        console.error('Ошибка получения метрик производительности:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения метрик',
            error: error.message
        });
    }
});

/**
 * Сброс метрик производительности
 */
router.post('/performance/reset', async (req, res) => {
    try {
        PortfolioOptimizer.resetPerformanceMetrics();
        res.json({
            success: true,
            message: 'Метрики производительности сброшены'
        });
    } catch (error) {
        console.error('Ошибка сброса метрик:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка сброса метрик',
            error: error.message
        });
    }
});

/**
 * Mean-Variance Optimization
 */
router.post('/optimize/mean-variance', async (req, res) => {
    try {
        const {
            instruments, // Массив {figi, ticker} или массив FIGI
            totalCapital = 1000000,
            riskAversion = 3.0,
            targetReturn = null,
            maxPositionSize = 0.10,
            minPositionSize = 0.01,
            constraints = {}
        } = req.body;

        if (!instruments || !Array.isArray(instruments) || instruments.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Необходимо предоставить массив инструментов'
            });
        }

        // Преобразуем инструменты в нужный формат
        const instrumentsList = await prepareInstruments(instruments);
        
        if (instrumentsList.length < 2) {
            return res.status(400).json({
                success: false,
                message: 'Недостаточно инструментов для оптимизации (нужно минимум 2)'
            });
        }

        // Получаем матрицу корреляций
        const figis = instrumentsList.map(i => i.figi);
        const correlationMatrix = await CorrelationService.getCorrelationMatrix(figis);

        if (!correlationMatrix || Object.keys(correlationMatrix).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Не удалось получить матрицу корреляций'
            });
        }

        const result = await PortfolioOptimizer.meanVarianceOptimization({
            instruments: instrumentsList,
            correlationMatrix: correlationMatrix,
            totalCapital: totalCapital,
            riskAversion: riskAversion,
            targetReturn: targetReturn,
            maxPositionSize: maxPositionSize,
            minPositionSize: minPositionSize,
            constraints: constraints
        });

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка Mean-Variance оптимизации:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка оптимизации',
            error: error.message
        });
    }
});

/**
 * Black-Litterman Optimization
 */
router.post('/optimize/black-litterman', async (req, res) => {
    try {
        const {
            instruments,
            totalCapital = 1000000,
            tau = 0.05,
            riskAversion = 3.0,
            marketCapWeights = null,
            views = null,
            maxPositionSize = 0.10,
            minPositionSize = 0.01,
            constraints = {}
        } = req.body;

        if (!instruments || !Array.isArray(instruments) || instruments.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Необходимо предоставить массив инструментов'
            });
        }

        const instrumentsList = await prepareInstruments(instruments);
        
        if (instrumentsList.length < 2) {
            return res.status(400).json({
                success: false,
                message: 'Недостаточно инструментов для оптимизации (нужно минимум 2)'
            });
        }

        const figis = instrumentsList.map(i => i.figi);
        const correlationMatrix = await CorrelationService.getCorrelationMatrix(figis);

        if (!correlationMatrix || Object.keys(correlationMatrix).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Не удалось получить матрицу корреляций'
            });
        }

        const result = await PortfolioOptimizer.blackLittermanOptimization({
            instruments: instrumentsList,
            correlationMatrix: correlationMatrix,
            totalCapital: totalCapital,
            tau: tau,
            riskAversion: riskAversion,
            marketCapWeights: marketCapWeights,
            views: views,
            maxPositionSize: maxPositionSize,
            minPositionSize: minPositionSize,
            constraints: constraints
        });

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка Black-Litterman оптимизации:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка оптимизации',
            error: error.message
        });
    }
});

/**
 * Risk Parity Optimization
 */
router.post('/optimize/risk-parity', async (req, res) => {
    try {
        const {
            instruments,
            totalCapital = 1000000,
            maxPositionSize = 0.10,
            minPositionSize = 0.01,
            constraints = {},
            maxIterations = 200,
            tolerance = 1e-3
        } = req.body;

        if (!instruments || !Array.isArray(instruments) || instruments.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Необходимо предоставить массив инструментов'
            });
        }

        const instrumentsList = await prepareInstruments(instruments);
        
        if (instrumentsList.length < 2) {
            return res.status(400).json({
                success: false,
                message: 'Недостаточно инструментов для оптимизации (нужно минимум 2)'
            });
        }

        const figis = instrumentsList.map(i => i.figi);
        const correlationMatrix = await CorrelationService.getCorrelationMatrix(figis);

        if (!correlationMatrix || Object.keys(correlationMatrix).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Не удалось получить матрицу корреляций'
            });
        }

        const result = await PortfolioOptimizer.riskParityOptimization({
            instruments: instrumentsList,
            correlationMatrix: correlationMatrix,
            totalCapital: totalCapital,
            maxPositionSize: maxPositionSize,
            minPositionSize: minPositionSize,
            constraints: constraints,
            maxIterations: maxIterations,
            tolerance: tolerance
        });

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка Risk Parity оптимизации:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка оптимизации',
            error: error.message
        });
    }
});

/**
 * Генерация эффективной границы
 */
router.post('/efficient-frontier', async (req, res) => {
    try {
        const {
            instruments,
            steps = 20
        } = req.body;

        if (!instruments || !Array.isArray(instruments) || instruments.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Необходимо предоставить массив инструментов'
            });
        }

        const instrumentsList = await prepareInstruments(instruments);
        
        if (instrumentsList.length < 2) {
            return res.status(400).json({
                success: false,
                message: 'Недостаточно инструментов для генерации эффективной границы (нужно минимум 2)'
            });
        }

        const figis = instrumentsList.map(i => i.figi);
        const correlationMatrix = await CorrelationService.getCorrelationMatrix(figis);

        if (!correlationMatrix || Object.keys(correlationMatrix).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Не удалось получить матрицу корреляций'
            });
        }

        const frontier = await PortfolioOptimizer.generateEfficientFrontier(
            instrumentsList,
            correlationMatrix,
            steps
        );

        res.json({
            success: true,
            data: {
                frontier: frontier,
                steps: frontier.length
            }
        });
    } catch (error) {
        console.error('Ошибка генерации эффективной границы:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка генерации эффективной границы',
            error: error.message
        });
    }
});

/**
 * Оптимизация через CapitalAllocationStrategy
 */
router.post('/optimize-allocation', async (req, res) => {
    try {
        const {
            strategy = 'optimized',
            optimizationMethod = 'mean_variance'
        } = req.body;

        if (!CapitalAllocationStrategy.isInitialized) {
            await CapitalAllocationStrategy.initialize();
        }

        // Устанавливаем метод оптимизации для стратегии optimized
        if (strategy === 'optimized' && CapitalAllocationStrategy.strategies.optimized) {
            CapitalAllocationStrategy.strategies.optimized.optimizationMethod = optimizationMethod;
        }

        const result = await CapitalAllocationStrategy.optimizeAllocation(strategy);

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка оптимизации распределения:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка оптимизации распределения',
            error: error.message
        });
    }
});

/**
 * Очистка кеша PortfolioOptimizer
 */
router.post('/clear-cache', async (req, res) => {
    try {
        PortfolioOptimizer.clearCache();
        res.json({
            success: true,
            message: 'Кеш очищен'
        });
    } catch (error) {
        console.error('Ошибка очистки кеша:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка очистки кеша',
            error: error.message
        });
    }
});

/**
 * Вспомогательная функция для подготовки инструментов
 */
async function prepareInstruments(instruments) {
    const instrumentsList = [];

    for (const inst of instruments) {
        let figi, ticker, name;

        if (typeof inst === 'string') {
            // Если передан просто FIGI или ticker
            figi = inst;
            const cachedInst = await CachedInstrument.findOne({
                where: {
                    [Op.or]: [
                        { figi: inst },
                        { ticker: inst }
                    ]
                },
                attributes: ['figi', 'ticker', 'name', 'instrumentType', 'currency']
            });
            
            if (cachedInst) {
                figi = cachedInst.figi;
                ticker = cachedInst.ticker;
                name = cachedInst.name;
            } else {
                // Если не найден, пропускаем
                continue;
            }
        } else if (inst.figi) {
            figi = inst.figi;
            ticker = inst.ticker;
            name = inst.name;
        } else if (inst.ticker) {
            const cachedInst = await CachedInstrument.findOne({
                where: { ticker: inst.ticker },
                attributes: ['figi', 'ticker', 'name', 'instrumentType', 'currency']
            });
            
            if (cachedInst) {
                figi = cachedInst.figi;
                ticker = cachedInst.ticker;
                name = cachedInst.name;
            } else {
                continue;
            }
        } else {
            continue;
        }

        if (figi) {
            instrumentsList.push({
                figi: figi,
                ticker: ticker || figi,
                name: name || ticker || figi
            });
        }
    }

    return instrumentsList;
}

export default router;

