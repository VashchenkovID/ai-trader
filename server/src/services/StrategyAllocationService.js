import TradingStrategy from '../models/TradingStrategy.js';
import PortfolioAllocation from '../models/PortfolioAllocation.js';
import PositionStrategy from '../models/PositionStrategy.js';
import SettingsService from './SettingsService.js';

/**
 * Сервис для управления распределением бюджета по торговым стратегиям
 */
class StrategyAllocationService {
    constructor() {
        this.isInitialized = false;
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            // Убеждаемся, что стратегии по умолчанию созданы
            await TradingStrategy.initializeDefaultStrategies();
            
            // Инициализируем распределение бюджета для всех стратегий
            await this.initializeAllocations();
            
            this.isInitialized = true;
            console.log('✅ StrategyAllocationService initialized');
        } catch (error) {
            console.error('❌ Failed to initialize StrategyAllocationService:', error);
            throw error;
        }
    }

    /**
     * Инициализация распределения бюджета
     */
    async initializeAllocations() {
        try {
            const strategies = await TradingStrategy.findAll({
                where: { isActive: true },
                order: [['priority', 'ASC']]
            });

            // Получаем общий бюджет портфеля
            const portfolioSettings = await SettingsService.getPortfolioSettings();
            const totalBudget = portfolioSettings.user_max_portfolio_budget || 1000000;

            for (const strategy of strategies) {
                const allocation = await PortfolioAllocation.getOrCreateAllocation(strategy.id);
                
                // Если распределение еще не установлено, устанавливаем на основе процента
                if (parseFloat(allocation.allocatedAmount) === 0) {
                    const allocatedAmount = (totalBudget * strategy.budgetAllocation) / 100;
                    await PortfolioAllocation.updateAllocation(strategy.id, allocatedAmount);
                    console.log(`💰 Initialized allocation for ${strategy.name}: ${allocatedAmount.toFixed(2)} RUB (${strategy.budgetAllocation}%)`);
                }
            }
        } catch (error) {
            console.error('❌ Error initializing allocations:', error);
            throw error;
        }
    }

    /**
     * Получить стратегию для рекомендации на основе confidence и score
     */
    async getStrategyForRecommendation(recommendation) {
        try {
            const { confidence, score } = recommendation;
            
            // Определяем подходящую стратегию
            let strategy = null;
            
            if (confidence > 0.8 && score > 0.75) {
                // Агрессивная стратегия для высоких показателей
                strategy = await TradingStrategy.findOne({
                    where: { 
                        type: 'aggressive', 
                        isActive: true,
                        minConfidence: { [Op.lte]: confidence },
                        minScore: { [Op.lte]: score }
                    },
                    order: [['priority', 'DESC']]
                });
            } else if (confidence >= 0.6 && score >= 0.6) {
                // Умеренная стратегия для средних показателей
                strategy = await TradingStrategy.findOne({
                    where: { 
                        type: 'moderate', 
                        isActive: true,
                        minConfidence: { [Op.lte]: confidence },
                        minScore: { [Op.lte]: score }
                    },
                    order: [['priority', 'DESC']]
                });
            } else if (confidence >= 0.5 && score >= 0.5) {
                // Консервативная стратегия для низких показателей
                strategy = await TradingStrategy.findOne({
                    where: { 
                        type: 'conservative', 
                        isActive: true,
                        minConfidence: { [Op.lte]: confidence },
                        minScore: { [Op.lte]: score }
                    },
                    order: [['priority', 'DESC']]
                });
            }
            
            return strategy;
        } catch (error) {
            console.error('❌ Error getting strategy for recommendation:', error);
            return null;
        }
    }

    /**
     * Получить доступный бюджет для стратегии
     */
    async getAvailableBudget(strategyId) {
        try {
            const allocation = await PortfolioAllocation.getOrCreateAllocation(strategyId);
            return parseFloat(allocation.allocatedAmount) - parseFloat(allocation.usedAmount);
        } catch (error) {
            console.error(`❌ Error getting available budget for strategy ${strategyId}:`, error);
            return 0;
        }
    }

    /**
     * Рассчитать размер позиции для стратегии
     */
    async calculatePositionSize(strategyId, recommendation, totalBudget) {
        try {
            const strategy = await TradingStrategy.findByPk(strategyId);
            if (!strategy) {
                throw new Error(`Strategy ${strategyId} not found`);
            }

            // Получаем доступный бюджет стратегии
            const availableBudget = await this.getAvailableBudget(strategyId);
            
            // Базовая сумма с учетом риска (максимум 10% от бюджета стратегии на одну позицию)
            const maxPositionSize = availableBudget * 0.1;
            
            // Учитываем количество активных позиций в стратегии
            const PositionStrategyModel = (await import('../models/PositionStrategy.js')).default;
            
            const activePositions = await PositionStrategyModel.count({
                where: { 
                    strategyId,
                    exitDate: null
                }
            });

            // Если есть ограничение на количество позиций
            let baseAmount = maxPositionSize;
            if (strategy.maxPositions && activePositions >= strategy.maxPositions) {
                return { quantity: 0, amount: 0, reason: 'Max positions reached' };
            }

            // Корректируем размер в зависимости от confidence
            let multiplier = 1.0;
            if (recommendation.confidence > 0.8) {
                multiplier = 1.2; // Увеличиваем размер для высокой уверенности
            } else if (recommendation.confidence < 0.6) {
                multiplier = 0.8; // Уменьшаем размер для низкой уверенности
            }

            const finalAmount = Math.min(baseAmount * multiplier, availableBudget);
            
            return {
                amount: finalAmount,
                multiplier,
                availableBudget,
                activePositions
            };
        } catch (error) {
            console.error('❌ Error calculating position size:', error);
            throw error;
        }
    }

    /**
     * Проверка соответствия стратегии и рекомендации
     * Возвращает объект с информацией о соответствии
     */
    async validateStrategyRecommendationMatch(strategyId, recommendation) {
        try {
            const strategy = await TradingStrategy.findByPk(strategyId);
            if (!strategy) {
                return {
                    isValid: false,
                    reason: 'Strategy not found',
                    warning: null
                };
            }

            const { confidence, score, recommendation: recType } = recommendation;
            
            // Проверяем соответствие минимальным требованиям стратегии
            const meetsMinConfidence = confidence >= strategy.minConfidence;
            const meetsMinScore = score >= strategy.minScore;
            
            // Проверяем соответствие типа стратегии и рекомендации
            let typeMatch = true;
            let warning = null;
            
            if (recType === 'HOLD') {
                // Для HOLD рекомендаций агрессивная стратегия не рекомендуется
                if (strategy.type === 'aggressive') {
                    typeMatch = false;
                    warning = 'Агрессивная стратегия не рекомендуется для HOLD рекомендаций. Рекомендуется консервативная или умеренная стратегия.';
                }
            } else if (recType === 'BUY') {
                // Для BUY рекомендаций консервативная стратегия может быть слишком осторожной
                if (strategy.type === 'conservative' && confidence > 0.8 && score > 0.75) {
                    warning = 'Для высоких показателей (confidence > 80%, score > 75%) рекомендуется более агрессивная стратегия.';
                }
            } else if (recType === 'SELL') {
                // Для SELL рекомендаций агрессивная стратегия может быть слишком рискованной
                if (strategy.type === 'aggressive') {
                    warning = 'Для SELL рекомендаций рекомендуется более консервативная стратегия.';
                }
            }
            
            // Проверяем соответствие временного горизонта стратегии и рекомендации
            let timeframeMatch = true;
            if (recommendation.explanation?.details?.horizons) {
                const horizons = recommendation.explanation.details.horizons;
                const longTermRec = horizons.longTerm?.recommendation;
                const mediumTermRec = horizons.mediumTerm?.recommendation;
                const shortTermRec = horizons.shortTerm?.recommendation;
                
                if (strategy.timeframe === 'long' && longTermRec !== recType && longTermRec !== 'HOLD') {
                    timeframeMatch = false;
                    warning = warning || `Долгосрочный горизонт показывает ${longTermRec}, но стратегия настроена на долгосрочные позиции.`;
                } else if (strategy.timeframe === 'short' && shortTermRec !== recType && shortTermRec !== 'HOLD') {
                    timeframeMatch = false;
                    warning = warning || `Краткосрочный горизонт показывает ${shortTermRec}, но стратегия настроена на краткосрочные позиции.`;
                }
            }
            
            const isValid = meetsMinConfidence && meetsMinScore && typeMatch && timeframeMatch;
            
            return {
                isValid,
                meetsMinConfidence,
                meetsMinScore,
                typeMatch,
                timeframeMatch,
                warning,
                strategy: {
                    id: strategy.id,
                    name: strategy.name,
                    type: strategy.type,
                    timeframe: strategy.timeframe
                }
            };
        } catch (error) {
            console.error('❌ Error validating strategy-recommendation match:', error);
            return {
                isValid: false,
                reason: error.message,
                warning: null
            };
        }
    }

    /**
     * Выделить бюджет для стратегии
     */
    async allocateBudget(strategyId, amount) {
        try {
            await PortfolioAllocation.updateAllocation(strategyId, amount);
            console.log(`💰 Allocated ${amount} RUB to strategy ${strategyId}`);
        } catch (error) {
            console.error(`❌ Error allocating budget to strategy ${strategyId}:`, error);
            throw error;
        }
    }

    /**
     * Перебалансировка стратегий (автоматическая)
     */
    async rebalanceStrategies() {
        try {
            console.log('🔄 Starting strategy rebalancing...');
            
            // Получаем все активные стратегии
            const strategies = await TradingStrategy.findAll({
                where: { isActive: true },
                order: [['priority', 'ASC']]
            });

            // Получаем общий бюджет
            const portfolioSettings = await SettingsService.getPortfolioSettings();
            const totalBudget = portfolioSettings.user_max_portfolio_budget || 1000000;

            // Рассчитываем общий использованный бюджет по всем стратегиям
            let totalUsedBudget = 0;
            for (const strategy of strategies) {
                const allocation = await PortfolioAllocation.getOrCreateAllocation(strategy.id);
                totalUsedBudget += parseFloat(allocation.usedAmount || 0);
            }

            // Доступный бюджет = общий бюджет - использованный
            const availableBudget = totalBudget - totalUsedBudget;

            // Анализируем эффективность стратегий (упрощенная версия)
            // В будущем здесь будет анализ Sharpe Ratio, Win Rate и т.д.
            
            // Перераспределяем доступный бюджет согласно процентам, сохраняя использованный бюджет
            for (const strategy of strategies) {
                const allocation = await PortfolioAllocation.getOrCreateAllocation(strategy.id);
                const usedAmount = parseFloat(allocation.usedAmount || 0);
                const targetTotalAmount = (totalBudget * strategy.budgetAllocation) / 100;
                
                // Новое выделенное = целевое общее (но не меньше использованного)
                const newAllocatedAmount = Math.max(targetTotalAmount, usedAmount);
                
                // Перераспределяем только если разница > 5%
                const currentAllocated = parseFloat(allocation.allocatedAmount);
                const difference = Math.abs(newAllocatedAmount - currentAllocated);
                if (difference > totalBudget * 0.05) {
                    await PortfolioAllocation.updateAllocation(strategy.id, newAllocatedAmount);
                    console.log(`🔄 Rebalanced ${strategy.name}: ${currentAllocated.toFixed(2)} → ${newAllocatedAmount.toFixed(2)} RUB (used: ${usedAmount.toFixed(2)}, available: ${(newAllocatedAmount - usedAmount).toFixed(2)})`);
                }
            }

            console.log('✅ Strategy rebalancing completed');
        } catch (error) {
            console.error('❌ Error rebalancing strategies:', error);
            throw error;
        }
    }

    /**
     * Обновление распределения стратегий на основе актуального totalValue портфеля
     */
    async updateAllocationsFromPortfolioValue(totalValue) {
        try {
            if (!totalValue || totalValue <= 0) {
                console.warn('⚠️ Invalid totalValue for allocation update:', totalValue);
                return;
            }

            console.log(`💰 Updating strategy allocations based on portfolio totalValue: ${totalValue.toLocaleString('ru-RU')} RUB`);
            
            // Получаем все активные стратегии
            const strategies = await TradingStrategy.findAll({
                where: { isActive: true },
                order: [['priority', 'ASC']]
            });

            // Рассчитываем общий использованный бюджет по всем стратегиям
            let totalUsedBudget = 0;
            for (const strategy of strategies) {
                const allocation = await PortfolioAllocation.getOrCreateAllocation(strategy.id);
                // Используем реальное использование, если доступно
                const usedAmount = parseFloat(allocation.usedAmount || 0);
                totalUsedBudget += usedAmount;
            }

            // Обновляем распределение для каждой стратегии на основе актуального totalValue
            for (const strategy of strategies) {
                const allocation = await PortfolioAllocation.getOrCreateAllocation(strategy.id);
                const usedAmount = parseFloat(allocation.usedAmount || 0);
                
                // Рассчитываем новое выделенное количество на основе процента от актуального totalValue
                const targetAllocatedAmount = (totalValue * strategy.budgetAllocation) / 100;
                
                // Новое выделенное не может быть меньше использованного
                const newAllocatedAmount = Math.max(targetAllocatedAmount, usedAmount);
                
                // Обновляем только если разница значительна (> 1%)
                const currentAllocated = parseFloat(allocation.allocatedAmount);
                const difference = Math.abs(newAllocatedAmount - currentAllocated);
                const threshold = totalValue * 0.01; // 1% от totalValue
                
                if (difference > threshold) {
                    await PortfolioAllocation.updateAllocation(strategy.id, newAllocatedAmount);
                    console.log(`💰 Updated ${strategy.name}: ${currentAllocated.toFixed(2)} → ${newAllocatedAmount.toFixed(2)} RUB (${strategy.budgetAllocation}% of ${totalValue.toLocaleString('ru-RU')} RUB)`);
                }
            }

            console.log('✅ Strategy allocations updated based on portfolio totalValue');
        } catch (error) {
            console.error('❌ Error updating allocations from portfolio value:', error);
            throw error;
        }
    }

    /**
     * Получить все стратегии с их распределением бюджета
     * Рассчитывает реальное использование на основе торговых заявок
     */
    async getAllStrategiesWithAllocations() {
        try {
            const strategies = await TradingStrategy.findAll({
                where: { isActive: true },
                order: [['priority', 'ASC']]
            });

            const TradingRequest = (await import('../models/TradingRequest.js')).default;
            const PositionStrategy = (await import('../models/PositionStrategy.js')).default;
            const { Op } = await import('sequelize');

            const result = [];
            for (const strategy of strategies) {
                const allocation = await PortfolioAllocation.getOrCreateAllocation(strategy.id);
                
                // Рассчитываем реальное использование на основе торговых заявок
                // Берем только активные/исполненные заявки (не отмененные/отклоненные)
                const activePositions = await PositionStrategy.findAll({
                    where: {
                        strategyId: strategy.id,
                        exitDate: null // Только открытые позиции
                    }
                });

                // Получаем торговые заявки для этих позиций
                const positionIds = activePositions.map(p => p.positionId);
                let realUsedAmount = 0;
                
                if (positionIds.length > 0) {
                    const activeRequests = await TradingRequest.findAll({
                        where: {
                            id: {
                                [Op.in]: positionIds
                            },
                            status: {
                                [Op.in]: ['APPROVED', 'EXECUTED', 'PENDING'] // Активные статусы
                            },
                            action: 'BUY' // Только покупки учитываем в использовании бюджета
                        }
                    });

                    // Суммируем реальное использование из торговых заявок
                    for (const request of activeRequests) {
                        // Используем actualAmount если есть, иначе estimatedAmount
                        const amount = parseFloat(request.actualAmount || request.estimatedAmount || 0);
                        realUsedAmount += amount;
                    }
                }

                // Также учитываем заявки без PositionStrategy (старые заявки или новые)
                const directRequests = await TradingRequest.findAll({
                    where: {
                        strategyId: strategy.id,
                        status: {
                            [Op.in]: ['APPROVED', 'EXECUTED', 'PENDING']
                        },
                        action: 'BUY' // Только покупки
                    }
                });

                // Проверяем, какие заявки уже учтены через PositionStrategy
                const accountedIds = new Set(positionIds);
                for (const request of directRequests) {
                    if (!accountedIds.has(request.id)) {
                        const amount = parseFloat(request.actualAmount || request.estimatedAmount || 0);
                        realUsedAmount += amount;
                    }
                }

                // Используем реальное использование, если оно больше чем в allocation
                const finalUsedAmount = Math.max(realUsedAmount, parseFloat(allocation.usedAmount || 0));
                const allocatedAmount = parseFloat(allocation.allocatedAmount);
                const availableAmount = allocatedAmount - finalUsedAmount;

                result.push({
                    ...strategy.toJSON(),
                    allocation: {
                        allocatedAmount: allocatedAmount,
                        usedAmount: finalUsedAmount,
                        availableAmount: Math.max(0, availableAmount), // Не может быть отрицательным
                        realUsedAmount: realUsedAmount, // Реальное использование из заявок
                        positionsCount: activePositions.length
                    }
                });
            }

            return result;
        } catch (error) {
            // Fallback к простому варианту при ошибке
            try {
                const strategies = await TradingStrategy.findAll({
                    where: { isActive: true },
                    order: [['priority', 'ASC']]
                });

                const result = [];
                for (const strategy of strategies) {
                    const allocation = await PortfolioAllocation.getOrCreateAllocation(strategy.id);
                    result.push({
                        ...strategy.toJSON(),
                        allocation: {
                            allocatedAmount: parseFloat(allocation.allocatedAmount),
                            usedAmount: parseFloat(allocation.usedAmount),
                            availableAmount: parseFloat(allocation.allocatedAmount) - parseFloat(allocation.usedAmount)
                        }
                    });
                }
                return result;
            } catch (fallbackError) {
                return [];
            }
        }
    }

    /**
     * Получить статистику по стратегии
     */
    async getStrategyStats(strategyId) {
        try {
            const strategy = await TradingStrategy.findByPk(strategyId);
            if (!strategy) {
                return null;
            }

            const PositionStrategy = (await import('../models/PositionStrategy.js')).default;
            const TradingRequest = (await import('../models/TradingRequest.js')).default;
            
            // Получаем все позиции стратегии через positionId
            const positions = await PositionStrategy.findAll({
                where: { strategyId }
            });
            
            // Получаем TradingRequest для каждой позиции отдельно
            const positionsWithRequests = await Promise.all(
                positions.map(async (pos) => {
                    try {
                        const request = await TradingRequest.findByPk(pos.positionId);
                        return { ...pos.toJSON(), request };
                    } catch (error) {
                        return { ...pos.toJSON(), request: null };
                    }
                })
            );

            // Рассчитываем метрики
            const totalPositions = positionsWithRequests.length;
            const closedPositions = positionsWithRequests.filter(p => p.exitDate !== null);
            const winCount = closedPositions.filter(p => p.resultPercent > 0).length;
            const winRate = closedPositions.length > 0 ? winCount / closedPositions.length : 0;
            
            const avgResult = closedPositions.length > 0
                ? closedPositions.reduce((sum, p) => sum + (p.resultPercent || 0), 0) / closedPositions.length
                : 0;

            return {
                strategyId,
                strategyName: strategy.name,
                totalPositions,
                closedPositions: closedPositions.length,
                winRate,
                averageResult: avgResult,
                winCount,
                lossCount: closedPositions.length - winCount
            };
        } catch (error) {
            console.error(`❌ Error getting stats for strategy ${strategyId}:`, error);
            return null;
        }
    }
}

export default new StrategyAllocationService();

