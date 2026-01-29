import TradingStrategy from '../models/TradingStrategy.js';
import PortfolioAllocation from '../models/PortfolioAllocation.js';
import SettingsService from './SettingsService.js';
import ProfitabilityTracker from './ProfitabilityTracker.js';
import InstrumentStats from '../models/InstrumentStats.js';
import CorrelationService from './CorrelationService.js';
import AdaptiveThresholdService from './AdaptiveThresholdService.js';
import LoggerService from './LoggerService.js';
import { Op } from 'sequelize';

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
            // Для реального портфеля используем totalValue (cash + positionsValue)
            // Для виртуального портфеля используем настройку из портфеля
            let totalBudget = 1000000; // Значение по умолчанию
            
            try {
                const TradingModeManager = (await import('./TradingModeManager.js')).default;
                const TradingEngine = (await import('./TradingEngine.js')).default;
                const currentMode = TradingModeManager.getCurrentMode();
                const mode = currentMode?.mode || currentMode;
                
                if (mode === 'real' || mode === 'micro') {
                    // Для реального портфеля используем totalValue (общая сумма портфеля)
                    const portfolio = await TradingEngine.getRealPortfolioValue();
                    if (portfolio && portfolio.totalValue > 0) {
                        totalBudget = portfolio.totalValue;
                    }
                } else {
                    // Для виртуального портфеля используем настройку из портфеля
                    const portfolioSettings = await SettingsService.getPortfolioSettings();
                    totalBudget = portfolioSettings.user_max_portfolio_budget || 1000000;
                }
            } catch (error) {
                console.warn('⚠️ Error getting portfolio value, using default budget:', error.message);
                const portfolioSettings = await SettingsService.getPortfolioSettings();
                totalBudget = portfolioSettings.user_max_portfolio_budget || 1000000;
            }

            for (const strategy of strategies) {
                const allocation = await PortfolioAllocation.getOrCreateAllocation(strategy.id);
                
                // Если распределение еще не установлено, устанавливаем на основе процента
                if (parseFloat(allocation.allocatedAmount) === 0) {
                    const allocatedAmount = (totalBudget * strategy.budgetAllocation) / 100;
                    await PortfolioAllocation.updateAllocation(strategy.id, allocatedAmount);
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
     * Улучшено в Фазе 2, задача 2.5.3: учет confidence, волатильности и корреляции
     */
    async calculatePositionSize(strategyId, recommendation, totalBudget, options = {}) {
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

            // 2.5.3: Улучшенный расчет с учетом confidence, волатильности и корреляции
            let multiplier = 1.0;
            const adjustments = {
                confidence: 1.0,
                volatility: 1.0,
                correlation: 1.0
            };

            // 1. Корректировка на основе confidence
            if (recommendation.confidence !== undefined && recommendation.confidence !== null) {
                // Линейная интерполяция: confidence 0.5 -> multiplier 0.7, confidence 1.0 -> multiplier 1.3
                adjustments.confidence = 0.7 + (recommendation.confidence - 0.5) * 1.2; // 0.5 -> 0.7, 1.0 -> 1.3
                adjustments.confidence = Math.max(0.5, Math.min(1.5, adjustments.confidence)); // Ограничиваем диапазон
            }

            // 2. Корректировка на основе волатильности инструмента (2.5.2, 2.5.3)
            let instrumentVolatility = options.volatility;
            let marketMode = options.marketMode || 'normal';
            
            // Если волатильность не передана, пытаемся получить из InstrumentStats
            if (instrumentVolatility === undefined && recommendation.figi) {
                try {
                    const instrumentStats = await InstrumentStats.findOne({ 
                        where: { figi: recommendation.figi } 
                    });
                    if (instrumentStats && instrumentStats.volatility) {
                        instrumentVolatility = parseFloat(instrumentStats.volatility);
                    }
                } catch (error) {
                    console.debug(`⚠️ Could not get volatility for ${recommendation.figi}:`, error.message);
                }
            }
            
            // Если рыночный режим не передан, пытаемся определить через AdaptiveThresholdService
            if (marketMode === 'normal' && recommendation.figi && AdaptiveThresholdService && AdaptiveThresholdService.isInitialized) {
                try {
                    marketMode = await AdaptiveThresholdService.detectMarketMode(recommendation.figi);
                } catch (error) {
                    console.debug(`⚠️ Could not detect market mode for ${recommendation.figi}:`, error.message);
                }
            }
            
            // Используем адаптивные параметры стратегии (2.5.2)
            const adaptiveParams = TradingStrategy.getAdaptiveParams(instrumentVolatility, marketMode);
            adjustments.volatility = adaptiveParams.positionSizeMultiplier;

            // 3. Корректировка на основе корреляции с существующими позициями (2.5.3)
            let maxCorrelation = options.correlation;
            
            // Если корреляция не передана, рассчитываем максимальную корреляцию с существующими позициями
            if (maxCorrelation === undefined && recommendation.figi && CorrelationService && CorrelationService.isInitialized) {
                try {
                    // Получаем активные позиции стратегии
                    const PositionStrategyModel = (await import('../models/PositionStrategy.js')).default;
                    const TradingRequest = (await import('../models/TradingRequest.js')).default;
                    
                    const activePositions = await PositionStrategyModel.findAll({
                        where: { 
                            strategyId,
                            exitDate: null
                        },
                        include: [{
                            model: TradingRequest,
                            as: 'position',
                            required: false
                        }]
                    });
                    
                    if (activePositions.length > 0) {
                        const correlations = [];
                        for (const position of activePositions) {
                            const positionFigi = position.position?.figi || position.figi;
                            if (positionFigi && positionFigi !== recommendation.figi) {
                                try {
                                    const correlation = await CorrelationService.calculateCorrelation(
                                        recommendation.figi,
                                        positionFigi,
                                        30
                                    );
                                    if (isFinite(correlation)) {
                                        correlations.push(Math.abs(correlation));
                                    }
                                } catch (error) {
                                    // Игнорируем ошибки расчета корреляции для отдельных позиций
                                }
                            }
                        }
                        
                        // Используем максимальную корреляцию
                        if (correlations.length > 0) {
                            maxCorrelation = Math.max(...correlations);
                        }
                    }
                } catch (error) {
                    console.debug(`⚠️ Could not calculate correlation for ${recommendation.figi}:`, error.message);
                }
            }
            
            if (maxCorrelation !== undefined && maxCorrelation !== null) {
                const correlation = parseFloat(maxCorrelation);
                if (isFinite(correlation) && Math.abs(correlation) > 0) {
                    const absCorrelation = Math.abs(correlation);
                    // Высокая корреляция (> 0.7) - снижаем размер позиции для диверсификации
                    if (absCorrelation > 0.7) {
                        adjustments.correlation = 0.7; // Снижаем на 30%
                    } else if (absCorrelation > 0.5) {
                        adjustments.correlation = 0.85; // Снижаем на 15%
                    } else {
                        adjustments.correlation = 1.0; // Низкая корреляция - без изменений
                    }
                }
            }

            // Комбинируем все корректировки
            multiplier = adjustments.confidence * adjustments.volatility * adjustments.correlation;
            
            // Ограничиваем итоговый множитель разумными пределами
            multiplier = Math.max(0.3, Math.min(1.5, multiplier));

            const finalAmount = Math.min(baseAmount * multiplier, availableBudget);
            
            return {
                amount: finalAmount,
                multiplier: multiplier.toFixed(3),
                adjustments,
                availableBudget,
                activePositions,
                baseAmount,
                adaptiveParams: adaptiveParams || null,
                marketMode: marketMode || 'normal',
                volatility: instrumentVolatility || null,
                maxCorrelation: maxCorrelation || null,
                details: {
                    confidenceAdjustment: adjustments.confidence.toFixed(3),
                    volatilityAdjustment: adjustments.volatility.toFixed(3),
                    correlationAdjustment: adjustments.correlation.toFixed(3),
                    marketMode: marketMode || 'normal',
                    volatility: instrumentVolatility ? (instrumentVolatility * 100).toFixed(2) + '%' : 'N/A'
                }
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
        } catch (error) {
            console.error(`❌ Error allocating budget to strategy ${strategyId}:`, error);
            throw error;
        }
    }

    /**
     * Перебалансировка стратегий (автоматическая)
     * Улучшено в Фазе 2, задача 2.5.1: учет Sharpe Ratio, win rate, max drawdown
     */
    async rebalanceStrategies(options = {}) {
        try {
            const usePerformanceBased = options.usePerformanceBased !== false; // По умолчанию включено
            const days = options.days || 30;
            const minSharpeRatio = options.minSharpeRatio || 0;

            let performanceBasedSucceeded = false;
            
            // Если включена перебалансировка на основе производительности (2.5.1)
            if (usePerformanceBased) {
                try {
                    const performanceResult = await this.rebalanceBudgetByPerformance(days, minSharpeRatio);
                    if (performanceResult.success && performanceResult.changes.length > 0) {
                        performanceBasedSucceeded = true;
                        return {
                            ...performanceResult,
                            method: 'performance-based'
                        };
                    } else if (performanceResult.success) {
                        // Продолжаем с обычной перебалансировкой
                    }
                } catch (perfError) {
                    console.warn('⚠️ Performance-based rebalancing failed, falling back to standard rebalancing:', perfError.message);
                    // Продолжаем с обычной перебалансировкой
                }
            }
            
            // Стандартная перебалансировка (fallback или если usePerformanceBased = false)
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
                }
            }
            return {
                success: true,
                method: performanceBasedSucceeded ? 'performance-based' : 'standard',
                changes: []
            };
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
                }
            }
        } catch (error) {
            console.error('❌ Error updating allocations from portfolio value:', error);
            throw error;
        }
    }

    /**
     * Получить все стратегии с их распределением бюджета
     * Рассчитывает реальное использование на основе торговых заявок
     * @param {string} portfolioType - Тип портфеля ('virtual' или 'real'). Если не указан, определяется автоматически
     */
    async getAllStrategiesWithAllocations(portfolioType = null) {
        try {
            const strategies = await TradingStrategy.findAll({
                where: { isActive: true },
                order: [['priority', 'ASC']]
            });

            if (strategies.length === 0) {
                return [];
            }

            const TradingRequest = (await import('../models/TradingRequest.js')).default;
            const PositionStrategy = (await import('../models/PositionStrategy.js')).default;
            const { Op } = await import('sequelize');
            
            // Определяем тип портфеля, если не указан
            let currentPortfolioType = portfolioType;
            if (!currentPortfolioType) {
                try {
                    const TradingModeManager = (await import('./TradingModeManager.js')).default;
                    const currentMode = TradingModeManager.getCurrentMode();
                    const mode = currentMode?.mode || currentMode;
                    currentPortfolioType = (mode === 'real' || mode === 'micro') ? 'real' : 'virtual';
                } catch (error) {
                    // По умолчанию используем виртуальный портфель
                    currentPortfolioType = 'virtual';
                }
            }

            // Оптимизация N+1: загружаем все данные одним запросом
            const strategyIds = strategies.map(s => s.id);
            
            // Загружаем все allocations одним запросом
            const allAllocations = await PortfolioAllocation.findAll({
                where: { strategyId: { [Op.in]: strategyIds } }
            });
            const allocationsByStrategyId = new Map();
            for (const alloc of allAllocations) {
                allocationsByStrategyId.set(alloc.strategyId, alloc);
            }
            
            // Для виртуального портфеля используем данные из виртуального портфеля
            // Для реального - из реального
            let allActivePositions = [];
            let allActiveRequests = [];
            
            if (currentPortfolioType === 'virtual') {
                // Для виртуального портфеля получаем данные из виртуального портфеля
                const TradingEngine = (await import('./TradingEngine.js')).default;
                const virtualPortfolio = TradingEngine.virtualPortfolio;
                
                if (!virtualPortfolio) {
                    if (LoggerService.isInitialized) {
                        LoggerService.warn('Virtual portfolio is not initialized', {
                            service: 'StrategyAllocationService',
                            operation: 'getAllStrategiesWithAllocations'
                        });
                    }
                    allActivePositions = [];
                    allActiveRequests = [];
                } else if (virtualPortfolio.positions) {
                    // Получаем текущие позиции из virtualPortfolio.positions (это объект { FIGI: quantity })
                    const positions = virtualPortfolio.positions || {};
                    const virtualTrades = virtualPortfolio.trades || [];
                    
                    // Создаем мапу trades по FIGI для быстрого поиска strategyId и других данных
                    // Используем последнюю сделку BUY для каждого FIGI
                    const tradesByFigi = new Map();
                    for (const trade of virtualTrades) {
                        if (trade.figi && trade.action === 'BUY') {
                            const existingTrade = tradesByFigi.get(trade.figi);
                            if (!existingTrade) {
                                tradesByFigi.set(trade.figi, trade);
                            } else {
                                // Берем более новую сделку (по timestamp или id)
                                const existingTime = existingTrade.timestamp || existingTrade.id || 0;
                                const currentTime = trade.timestamp || trade.id || 0;
                                if (currentTime > existingTime) {
                                    tradesByFigi.set(trade.figi, trade);
                                }
                            }
                        }
                    }
                    
                    // Преобразуем positions в формат, совместимый с PositionStrategy
                    allActivePositions = [];
                    for (const [figi, quantity] of Object.entries(positions)) {
                        if (quantity > 0 && figi) {
                            // Находим соответствующую сделку для получения strategyId
                            const trade = tradesByFigi.get(figi);
                            const strategyId = trade?.strategyId || null;
                            
                            // Включаем только позиции со стратегиями из списка
                            if (strategyId && strategyIds.includes(strategyId)) {
                                allActivePositions.push({
                                    positionId: trade?.id || trade?.requestId || null,
                                    strategyId: strategyId,
                                    figi: figi,
                                    quantity: quantity,
                                    price: trade?.price || trade?.currentPrice || 0
                                });
                            }
                        }
                    }
                    
                    // Получаем заявки из виртуального портфеля (только активные BUY)
                    allActiveRequests = virtualTrades
                        .filter(t => 
                            t.action === 'BUY' && 
                            t.figi &&
                            positions[t.figi] > 0 && // Только для позиций, которые есть в портфеле
                            (t.status === 'APPROVED' || t.status === 'EXECUTED' || t.status === 'PENDING' || !t.status)
                        )
                        .map(t => ({
                            id: t.id || t.requestId,
                            strategyId: t.strategyId,
                            figi: t.figi,
                            actualAmount: t.actualAmount || t.estimatedAmount || (t.quantity || 0) * (t.price || 0),
                            estimatedAmount: t.estimatedAmount || (t.quantity || 0) * (t.price || 0),
                            quantity: t.quantity || positions[t.figi] || 0,
                            price: t.price || t.currentPrice || 0
                        }));
                    
                    if (LoggerService.isInitialized) {
                        LoggerService.debug('Virtual portfolio positions loaded', {
                            service: 'StrategyAllocationService',
                            operation: 'getAllStrategiesWithAllocations',
                            positionsCount: allActivePositions.length,
                            requestsCount: allActiveRequests.length,
                            totalPositionsInPortfolio: Object.keys(positions).length
                        });
                    }
                } else {
                    // Если виртуальный портфель пуст, используем пустые данные
                    if (LoggerService.isInitialized) {
                        LoggerService.debug('Virtual portfolio has no positions', {
                            service: 'StrategyAllocationService',
                            operation: 'getAllStrategiesWithAllocations'
                        });
                    }
                    allActivePositions = [];
                    allActiveRequests = [];
                }
            } else {
                // Для реального портфеля используем PositionStrategy из БД
                allActivePositions = await PositionStrategy.findAll({
                    where: {
                        strategyId: { [Op.in]: strategyIds },
                        exitDate: null // Только открытые позиции
                    }
                });
                
                // Загружаем торговые заявки из БД
                const allPositionIds = new Set();
                for (const pos of allActivePositions) {
                    if (pos.positionId) {
                        allPositionIds.add(pos.positionId);
                    }
                }
                
                allActiveRequests = await TradingRequest.findAll({
                    where: {
                        [Op.or]: [
                            { id: { [Op.in]: Array.from(allPositionIds) } },
                            { strategyId: { [Op.in]: strategyIds } }
                        ],
                        status: { [Op.in]: ['APPROVED', 'EXECUTED', 'PENDING'] },
                        action: 'BUY'
                    }
                });
            }
            
            // Группируем позиции по strategyId
            const positionsByStrategyId = new Map();
            const allPositionIds = new Set();
            for (const pos of allActivePositions) {
                const posId = pos.positionId || pos.id;
                if (!positionsByStrategyId.has(pos.strategyId)) {
                    positionsByStrategyId.set(pos.strategyId, []);
                }
                positionsByStrategyId.get(pos.strategyId).push(pos);
                if (posId) {
                    allPositionIds.add(posId);
                }
            }
            
            
            // Группируем заявки по strategyId и по positionId
            const requestsByStrategyId = new Map();
            const requestsByPositionId = new Map();
            for (const request of allActiveRequests) {
                if (request.strategyId) {
                    if (!requestsByStrategyId.has(request.strategyId)) {
                        requestsByStrategyId.set(request.strategyId, []);
                    }
                    requestsByStrategyId.get(request.strategyId).push(request);
                }
                if (allPositionIds.has(request.id)) {
                    requestsByPositionId.set(request.id, request);
                }
            }

            // Для виртуального портфеля получаем initialCapital для расчета allocatedAmount
            let initialCapital = null;
            if (currentPortfolioType === 'virtual') {
                try {
                    const TradingEngine = (await import('./TradingEngine.js')).default;
                    const virtualPortfolio = TradingEngine.virtualPortfolio;
                    if (virtualPortfolio && virtualPortfolio.initialCapital) {
                        initialCapital = virtualPortfolio.initialCapital;
                    } else {
                        // Пытаемся получить из БД
                        const VirtualPortfolio = (await import('../models/VirtualPortfolio.js')).default;
                        const savedPortfolio = await VirtualPortfolio.getCurrent();
                        if (savedPortfolio) {
                            initialCapital = savedPortfolio.initialCapital || 1000000;
                        } else {
                            initialCapital = 1000000; // Значение по умолчанию
                        }
                    }
                } catch (error) {
                    if (LoggerService.isInitialized) {
                        LoggerService.warn('Failed to get initialCapital for virtual portfolio', {
                            service: 'StrategyAllocationService',
                            operation: 'getAllStrategiesWithAllocations',
                            error: { message: error.message }
                        });
                    }
                    initialCapital = 1000000; // Значение по умолчанию
                }
            }

            const result = [];
            for (const strategy of strategies) {
                // Получаем или создаем allocation
                let allocation = allocationsByStrategyId.get(strategy.id);
                if (!allocation) {
                    allocation = await PortfolioAllocation.getOrCreateAllocation(strategy.id);
                }
                
                // Получаем позиции для стратегии
                const activePositions = positionsByStrategyId.get(strategy.id) || [];
                const positionIds = activePositions.map(p => p.positionId || p.id);
                
                // Рассчитываем реальное использование и выделенную сумму
                let realUsedAmount = 0;
                let allocatedAmount = 0;
                
                if (currentPortfolioType === 'virtual') {
                    // Для виртуального портфеля считаем allocatedAmount на основе initialCapital
                    // allocatedAmount = процент от initialCapital
                    allocatedAmount = (initialCapital * strategy.budgetAllocation) / 100;
                    
                    // usedAmount = allocatedAmount (вся выделенная сумма считается использованной из initialCapital)
                    realUsedAmount = allocatedAmount;
                } else {
                    // Для реального портфеля используем allocatedAmount из БД
                    allocatedAmount = parseFloat(allocation.allocatedAmount || 0);
                    
                    // Для реального портфеля используем данные из заявок
                    // Суммируем использование из заявок через PositionStrategy
                    for (const posId of positionIds) {
                        const request = requestsByPositionId.get(posId);
                        if (request) {
                            const amount = parseFloat(request.actualAmount || request.estimatedAmount || 0);
                            realUsedAmount += amount;
                        }
                    }
                    
                    // Учитываем прямые заявки без PositionStrategy
                    const accountedIds = new Set(positionIds);
                    const directRequests = requestsByStrategyId.get(strategy.id) || [];
                    for (const request of directRequests) {
                        if (!accountedIds.has(request.id)) {
                            const amount = parseFloat(request.actualAmount || request.estimatedAmount || 0);
                            realUsedAmount += amount;
                        }
                    }
                }

                // Для виртуального портфеля используем allocatedAmount как usedAmount
                // Для реального - максимум из realUsedAmount и allocation.usedAmount
                const finalUsedAmount = currentPortfolioType === 'virtual' 
                    ? realUsedAmount 
                    : Math.max(realUsedAmount, parseFloat(allocation.usedAmount || 0));
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

    /**
     * Динамическое перераспределение бюджета на основе результативности стратегий
     * Использует Sharpe Ratio, Win Rate и Max Drawdown за последние 30 дней
     * Формула: новый_бюджет = базовый_бюджет × (Sharpe_стратегии / средний_Sharpe)
     * 
     * @param {number} days - Количество дней для анализа (по умолчанию 30)
     * @param {number} minSharpeRatio - Минимальный Sharpe Ratio для участия в перераспределении (по умолчанию 0)
     * @returns {Object} Результат перераспределения с деталями изменений
     */
    async rebalanceBudgetByPerformance(days = 30, minSharpeRatio = 0) {
        try {
            // Получаем все активные стратегии
            const strategies = await TradingStrategy.findAll({
                where: { isActive: true },
                order: [['priority', 'ASC']]
            });

            if (strategies.length === 0) {
                console.warn('⚠️ No active strategies found for rebalancing');
                return {
                    success: false,
                    reason: 'No active strategies',
                    changes: []
                };
            }

            // Получаем общий бюджет портфеля
            const portfolioSettings = await SettingsService.getPortfolioSettings();
            const totalBudget = portfolioSettings.user_max_portfolio_budget || 1000000;

            // Рассчитываем метрики для каждой стратегии
            const metricsPromises = strategies.map(strategy => 
                ProfitabilityTracker.calculateStrategyMetrics(strategy.id, days)
            );
            const metrics = await Promise.all(metricsPromises);

            // Минимальное количество сделок для участия в перераспределении
            const minTrades = 10; // Минимум 10 сделок за период
            
            // Фильтруем стратегии с достаточными данными и минимальным Sharpe Ratio
            const validMetrics = metrics
                .map((metric, index) => ({
                    ...metric,
                    strategy: strategies[index],
                    originalBudgetAllocation: strategies[index].budgetAllocation
                }))
                .filter(m => {
                    // Проверяем достаточность данных
                    if (m.insufficientData) {
                        return false;
                    }
                    
                    // Проверяем минимальное количество сделок
                    if (m.totalTrades < minTrades) {
                        return false;
                    }
                    
                    // Проверяем минимальный Sharpe Ratio
                    if (m.sharpeRatio < minSharpeRatio) {
                        return false;
                    }
                    
                    return true;
                });

            if (validMetrics.length === 0) {
                console.warn('⚠️ No strategies with sufficient data for rebalancing');
                return {
                    success: false,
                    reason: 'Insufficient data',
                    changes: []
                };
            }

            // Рассчитываем средний Sharpe Ratio
            const avgSharpeRatio = validMetrics.reduce((sum, m) => sum + m.sharpeRatio, 0) / validMetrics.length;

            if (avgSharpeRatio === 0) {
                console.warn('⚠️ Average Sharpe Ratio is zero, cannot rebalance');
                return {
                    success: false,
                    reason: 'Zero average Sharpe Ratio',
                    changes: []
                };
            }

            // Рассчитываем новые проценты распределения на основе метрик производительности
            // Комбинируем Sharpe Ratio, Win Rate и Max Drawdown
            // Формула: новый_процент = базовый_процент × (Sharpe_стратегии / средний_Sharpe) × (WinRate_стратегии / средний_WinRate) × (1 - MaxDrawdown_стратегии / средний_MaxDrawdown)
            
            // Рассчитываем средние значения для нормализации
            const avgWinRate = validMetrics.reduce((sum, m) => sum + m.winRate, 0) / validMetrics.length;
            const avgMaxDrawdown = validMetrics.reduce((sum, m) => sum + m.maxDrawdown, 0) / validMetrics.length;
            
            // Защита от деления на ноль
            const safeAvgWinRate = avgWinRate > 0 ? avgWinRate : 0.5;
            const safeAvgMaxDrawdown = avgMaxDrawdown > 0 ? avgMaxDrawdown : 0.1;
            
            const rebalancedMetrics = validMetrics.map(metric => {
                // Множитель на основе Sharpe Ratio
                const sharpeMultiplier = avgSharpeRatio > 0 ? metric.sharpeRatio / avgSharpeRatio : 1.0;
                
                // Множитель на основе Win Rate (чем выше Win Rate, тем больше бюджет)
                const winRateMultiplier = safeAvgWinRate > 0 ? metric.winRate / safeAvgWinRate : 1.0;
                
                // Множитель на основе Max Drawdown (чем меньше просадка, тем больше бюджет)
                // Инвертируем: (1 - drawdown / avgDrawdown) дает больше для меньших просадок
                const drawdownMultiplier = safeAvgMaxDrawdown > 0 
                    ? Math.max(0.5, Math.min(1.5, 1.0 - (metric.maxDrawdown / safeAvgMaxDrawdown) * 0.5))
                    : 1.0;
                
                // Комбинируем множители с весами: Sharpe 50%, Win Rate 30%, Drawdown 20%
                const combinedMultiplier = (
                    sharpeMultiplier * 0.5 +
                    winRateMultiplier * 0.3 +
                    drawdownMultiplier * 0.2
                );
                
                // Ограничиваем изменение: не более чем в 2 раза в любую сторону
                const cappedMultiplier = Math.max(0.5, Math.min(2.0, combinedMultiplier));
                
                // Проверка на переполнение перед умножением
                const maxSafeAllocation = 100; // Максимальный процент бюджета
                const newBudgetAllocation = Math.min(
                    maxSafeAllocation,
                    metric.originalBudgetAllocation * cappedMultiplier
                );
                
                // Проверка на валидность результата
                if (!isFinite(newBudgetAllocation) || newBudgetAllocation < 0) {
                    console.warn(`⚠️ Invalid budget allocation calculated for strategy ${metric.strategy.name}: ${newBudgetAllocation}`);
                    return {
                        ...metric,
                        performanceMultiplier: combinedMultiplier,
                        cappedMultiplier: 1.0,
                        newBudgetAllocation: metric.originalBudgetAllocation
                    };
                }
                
                return {
                    ...metric,
                    performanceMultiplier: combinedMultiplier,
                    cappedMultiplier,
                    newBudgetAllocation,
                    sharpeMultiplier,
                    winRateMultiplier,
                    drawdownMultiplier
                };
            });

            // Нормализуем проценты, чтобы сумма была равна 100%
            const totalNewAllocation = rebalancedMetrics.reduce((sum, m) => sum + m.newBudgetAllocation, 0);
            
            // Защита от деления на ноль
            if (totalNewAllocation === 0 || !isFinite(totalNewAllocation)) {
                console.warn('⚠️ Total new allocation is zero or invalid, cannot normalize');
                return {
                    success: false,
                    reason: 'Total allocation is zero or invalid',
                    changes: []
                };
            }
            
            const normalizationFactor = 100 / totalNewAllocation;

            const normalizedMetrics = rebalancedMetrics.map(metric => {
                const normalizedAllocation = metric.newBudgetAllocation * normalizationFactor;
                // Проверяем на валидность результата
                if (!isFinite(normalizedAllocation) || normalizedAllocation < 0) {
                    console.warn(`⚠️ Invalid normalized allocation for strategy ${metric.strategy.name}: ${normalizedAllocation}`);
                    return {
                        ...metric,
                        normalizedBudgetAllocation: metric.originalBudgetAllocation // Возвращаем исходное значение
                    };
                }
                return {
                    ...metric,
                    normalizedBudgetAllocation: normalizedAllocation
                };
            });

            // Применяем изменения только если разница значительна (> 2% от базового бюджета)
            const changes = [];
            const threshold = 2.0; // Минимальное изменение в процентах для применения

            for (const metric of normalizedMetrics) {
                const change = Math.abs(metric.normalizedBudgetAllocation - metric.originalBudgetAllocation);
                
                if (change >= threshold) {
                    const newAllocatedAmount = (totalBudget * metric.normalizedBudgetAllocation) / 100;
                    const allocation = await PortfolioAllocation.getOrCreateAllocation(metric.strategyId);
                    const currentAllocated = parseFloat(allocation.allocatedAmount);
                    
                    // Не уменьшаем выделенный бюджет ниже использованного
                    const finalAllocatedAmount = Math.max(newAllocatedAmount, parseFloat(allocation.usedAmount || 0));
                    
                    if (Math.abs(finalAllocatedAmount - currentAllocated) > totalBudget * 0.01) {
                        await PortfolioAllocation.updateAllocation(metric.strategyId, finalAllocatedAmount);
                        
                        changes.push({
                            strategyId: metric.strategyId,
                            strategyName: metric.strategy.name,
                            oldAllocation: metric.originalBudgetAllocation.toFixed(2) + '%',
                            newAllocation: metric.normalizedBudgetAllocation.toFixed(2) + '%',
                            oldAmount: currentAllocated.toFixed(2),
                            newAmount: finalAllocatedAmount.toFixed(2),
                            sharpeRatio: metric.sharpeRatio.toFixed(3),
                            winRate: (metric.winRate * 100).toFixed(2) + '%',
                            maxDrawdown: (metric.maxDrawdown * 100).toFixed(2) + '%',
                            totalTrades: metric.totalTrades || metric.totalPositions || 0,
                            performanceMultiplier: metric.cappedMultiplier.toFixed(3)
                        });
                    }
                }
            }

            if (changes.length === 0) {
                return {
                    success: true,
                    reason: 'No significant changes',
                    changes: [],
                    metrics: normalizedMetrics.map(m => ({
                        strategyName: m.strategy.name,
                        sharpeRatio: m.sharpeRatio,
                        winRate: m.winRate,
                        maxDrawdown: m.maxDrawdown,
                        oldAllocation: m.originalBudgetAllocation,
                        newAllocation: m.normalizedBudgetAllocation
                    }))
                };
            }

            return {
                success: true,
                changes,
                metrics: normalizedMetrics.map(m => ({
                    strategyName: m.strategy.name,
                    sharpeRatio: m.sharpeRatio,
                    winRate: m.winRate,
                    maxDrawdown: m.maxDrawdown,
                    oldAllocation: m.originalBudgetAllocation,
                    newAllocation: m.normalizedBudgetAllocation
                })),
                averageSharpeRatio: avgSharpeRatio,
                totalBudget
            };

        } catch (error) {
            console.error('❌ Error rebalancing budget by performance:', error);
            throw error;
        }
    }

    /**
     * Получить адаптивную стратегию с параметрами, скорректированными на основе волатильности и рыночного режима
     * Фаза 2, задача 2.5.2: Адаптивные параметры стратегий
     * 
     * @param {number} strategyId - ID стратегии
     * @param {string} figi - FIGI инструмента (опционально, для определения рыночного режима)
     * @param {number} volatility - Волатильность инструмента (опционально)
     * @param {string} marketMode - Рыночный режим (опционально)
     * @returns {Promise<Object>} Адаптивная стратегия с примененными параметрами
     */
    async getAdaptiveStrategy(strategyId, figi = null, volatility = null, marketMode = null) {
        try {
            const strategy = await TradingStrategy.findByPk(strategyId);
            if (!strategy) {
                throw new Error(`Strategy ${strategyId} not found`);
            }

            // Получаем волатильность, если не передана
            if (volatility === null && figi) {
                try {
                    const instrumentStats = await InstrumentStats.findOne({ 
                        where: { figi } 
                    });
                    if (instrumentStats && instrumentStats.volatility) {
                        volatility = parseFloat(instrumentStats.volatility);
                    }
                } catch (error) {
                    console.debug(`⚠️ Could not get volatility for ${figi}:`, error.message);
                }
            }

            // Определяем рыночный режим, если не передан
            if (marketMode === null && figi && AdaptiveThresholdService && AdaptiveThresholdService.isInitialized) {
                try {
                    marketMode = await AdaptiveThresholdService.detectMarketMode(figi);
                } catch (error) {
                    console.debug(`⚠️ Could not detect market mode for ${figi}:`, error.message);
                    marketMode = 'normal';
                }
            }

            // Применяем адаптивные параметры
            const adaptedStrategy = TradingStrategy.applyAdaptiveParams(
                strategy, 
                volatility || 0.15, 
                marketMode || 'normal'
            );

            return adaptedStrategy;
        } catch (error) {
            console.error(`❌ Error getting adaptive strategy ${strategyId}:`, error);
            throw error;
        }
    }
}

export default new StrategyAllocationService();

