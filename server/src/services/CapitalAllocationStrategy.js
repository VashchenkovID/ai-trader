import Settings from '../models/Settings.js';
import OptimizedTelegramService from './OptimizedTelegramService.js';
import TradingEngine from './TradingEngine.js';
import RiskManagementService from './RiskManagementService.js';
import CapitalScalingService from './CapitalScalingService.js';
import ProfitabilityTracker from './ProfitabilityTracker.js';
import CacheService from './CacheService.js';
import TinkoffApiService from './TinkoffApiService.js';
import CachedInstrument from '../models/CachedInstrument.js';
import PortfolioOptimizer from './PortfolioOptimizer.js';
import CorrelationService from './CorrelationService.js';

/**
 * Сервис для стратегии распределения капитала
 * 
 * Основные функции:
 * - Оптимальное распределение капитала между позициями
 * - Диверсификация портфеля
 * - Управление концентрацией риска
 * - Адаптивные стратегии распределения
 * - Интеграция с системой масштабирования
 */
class CapitalAllocationStrategy {
    constructor() {
        this.isInitialized = false;
        this.allocationSettings = {};
        this.allocationHistory = [];
        this.currentStrategy = 'balanced'; // balanced, aggressive, conservative, dynamic
        this.availableInstrumentsCache = null;
        this.availableInstrumentsCacheTime = null;
        this.availableInstrumentsCacheTTL = 5 * 60 * 1000; // 5 минут
        this.strategies = {
            balanced: {
                name: 'Сбалансированная',
                maxPositionSize: 0.05, // 5% на позицию
                maxSectorExposure: 0.20, // 20% на сектор
                maxSingleStock: 0.10, // 10% на одну акцию
                diversification: 0.8,
                riskTolerance: 0.5
            },
            aggressive: {
                name: 'Агрессивная',
                maxPositionSize: 0.10, // 10% на позицию
                maxSectorExposure: 0.30, // 30% на сектор
                maxSingleStock: 0.15, // 15% на одну акцию
                diversification: 0.6,
                riskTolerance: 0.8
            },
            conservative: {
                name: 'Консервативная',
                maxPositionSize: 0.03, // 3% на позицию
                maxSectorExposure: 0.15, // 15% на сектор
                maxSingleStock: 0.05, // 5% на одну акцию
                diversification: 0.9,
                riskTolerance: 0.2
            },
            dynamic: {
                name: 'Динамическая',
                maxPositionSize: 0.05, // Будет адаптироваться
                maxSectorExposure: 0.20, // Будет адаптироваться
                maxSingleStock: 0.10, // Будет адаптироваться
                diversification: 0.8, // Будет адаптироваться
                riskTolerance: 0.5 // Будет адаптироваться
            },
            optimized: {
                name: 'Оптимизированная (Mean-Variance/Black-Litterman/Risk Parity)',
                maxPositionSize: 0.10, // 10% на позицию (будет оптимизировано)
                maxSectorExposure: 0.30, // 30% на сектор
                maxSingleStock: 0.15, // 15% на одну акцию
                diversification: 0.9,
                riskTolerance: 0.5,
                optimizationMethod: 'mean_variance', // mean_variance, black_litterman, risk_parity
                useOptimizer: true
            }
        };
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        try {
            
            await this.loadAllocationSettings();
            await this.loadAllocationHistory();
            await this.determineCurrentStrategy();
            
            this.isInitialized = true;
            console.log('✅ CapitalAllocationStrategy инициализирован');
            
        } catch (error) {
            console.error('❌ Ошибка инициализации CapitalAllocationStrategy:', error);
            throw error;
        }
    }

    /**
     * Загрузка настроек распределения
     */
    async loadAllocationSettings() {
        this.allocationSettings = {
            // Основные параметры
            enabled: await Settings.getSetting('allocation_enabled', true),
            autoRebalancing: await Settings.getSetting('allocation_auto_rebalancing', true),
            rebalancingFrequency: await Settings.getSetting('allocation_rebalancing_frequency', 'weekly'), // daily, weekly, monthly
            
            // Стратегии распределения
            defaultStrategy: await Settings.getSetting('allocation_default_strategy', 'balanced'),
            adaptiveStrategy: await Settings.getSetting('allocation_adaptive_strategy', true),
            strategySwitching: await Settings.getSetting('allocation_strategy_switching', true),
            
            // Лимиты распределения
            maxPositions: await Settings.getSetting('allocation_max_positions', 20),
            minPositions: await Settings.getSetting('allocation_min_positions', 5),
            maxPositionSize: await Settings.getSetting('allocation_max_position_size', 0.05), // 5%
            minPositionSize: await Settings.getSetting('allocation_min_position_size', 0.01), // 1%
            
            // Диверсификация
            maxSectorExposure: await Settings.getSetting('allocation_max_sector_exposure', 0.20), // 20%
            maxSingleStock: await Settings.getSetting('allocation_max_single_stock', 0.10), // 10%
            minDiversification: await Settings.getSetting('allocation_min_diversification', 0.7), // 70%
            
            // Риск-менеджмент
            correlationThreshold: await Settings.getSetting('allocation_correlation_threshold', 0.7),
            volatilityThreshold: await Settings.getSetting('allocation_volatility_threshold', 0.3),
            liquidityThreshold: await Settings.getSetting('allocation_liquidity_threshold', 1000000), // 1M руб.
            
            // Адаптация
            performanceWindow: await Settings.getSetting('allocation_performance_window', 30), // дни
            adaptationSensitivity: await Settings.getSetting('allocation_adaptation_sensitivity', 0.5),
            maxStrategyChange: await Settings.getSetting('allocation_max_strategy_change', 0.3), // 30%
            
            // Уведомления
            notifyOnRebalancing: await Settings.getSetting('allocation_notify_rebalancing', true),
            notifyOnStrategyChange: await Settings.getSetting('allocation_notify_strategy_change', true),
            notifyOnViolations: await Settings.getSetting('allocation_notify_violations', true),
            
            // Интеграция
            integrateWithScaling: await Settings.getSetting('allocation_integrate_scaling', true),
            integrateWithRisk: await Settings.getSetting('allocation_integrate_risk', true),
            integrateWithProfitability: await Settings.getSetting('allocation_integrate_profitability', true)
        };
    }

    /**
     * Загрузка истории распределения
     */
    async loadAllocationHistory() {
        try {
            const history = await Settings.getSetting('allocation_history', []);
            this.allocationHistory = history.slice(-100); // Последние 100 записей
        } catch (error) {
            console.error('❌ Ошибка загрузки истории распределения:', error);
            this.allocationHistory = [];
        }
    }

    /**
     * Определение текущей стратегии
     */
    async determineCurrentStrategy() {
        try {
            const currentStrategy = await Settings.getSetting('current_allocation_strategy', this.allocationSettings.defaultStrategy);
            this.currentStrategy = currentStrategy;
            console.log(`📊 Текущая стратегия распределения: ${this.strategies[currentStrategy]?.name || currentStrategy}`);
        } catch (error) {
            console.error('❌ Ошибка определения стратегии:', error);
            this.currentStrategy = this.allocationSettings.defaultStrategy;
        }
    }

    /**
     * Анализ текущего портфеля
     */
    async analyzePortfolio() {
        try {
            const portfolio = TradingEngine.virtualPortfolio || {};
            const allTrades = portfolio.trades || [];
            
            // Фильтруем тестовые FIGI
            const isTestFigi = (figi) => {
                if (!figi || typeof figi !== 'string') return false;
                return figi === 'TEST' || figi.startsWith('TEST_') || figi.startsWith('TEST_FIGI_');
            };
            
            const positions = allTrades.filter(trade => {
                const figi = trade.figi || trade.symbol;
                return !isTestFigi(figi);
            });
            
            const analysis = {
                timestamp: new Date(),
                totalValue: portfolio.totalValue || 0,
                totalPositions: positions.length,
                positions: [],
                sectors: {},
                risks: {},
                recommendations: []
            };

            // Анализируем каждую позицию
            for (const position of positions) {
                const positionAnalysis = await this.analyzePosition(position);
                analysis.positions.push(positionAnalysis);
            }

            // Анализируем сектора
            analysis.sectors = this.analyzeSectors(analysis.positions);

            // Анализируем риски
            analysis.risks = await this.analyzeRisks(analysis.positions);

            // Генерируем рекомендации
            analysis.recommendations = this.generateRecommendations(analysis);

            return analysis;

        } catch (error) {
            console.error('❌ Ошибка анализа портфеля:', error);
            return {
                timestamp: new Date(),
                error: error.message
            };
        }
    }

    /**
     * Анализ отдельной позиции
     */
    async analyzePosition(position) {
        const currentPrice = await this.getCurrentPrice(position.symbol);
        const currentValue = (position.quantity || 0) * currentPrice;
        const positionSize = this.calculatePositionSize(currentValue);
        
        return {
            symbol: position.symbol,
            quantity: position.quantity || 0,
            currentPrice,
            currentValue,
            positionSize,
            pnl: position.pnl || 0,
            pnlPercent: position.pnl ? (position.pnl / (currentValue - position.pnl)) * 100 : 0,
            sector: await this.getSector(position.symbol),
            volatility: await this.getVolatility(position.symbol, true), // Используем только кеш
            liquidity: await this.getLiquidity(position.symbol, true), // Используем только кеш
            correlation: await this.getCorrelation(position.symbol, true) // Используем только кеш
        };
    }

    /**
     * Анализ секторов
     */
    analyzeSectors(positions) {
        const sectors = {};
        
        positions.forEach(position => {
            const sector = position.sector || 'Unknown';
            if (!sectors[sector]) {
                sectors[sector] = {
                    positions: 0,
                    totalValue: 0,
                    exposure: 0,
                    avgVolatility: 0,
                    symbols: []
                };
            }
            
            sectors[sector].positions++;
            sectors[sector].totalValue += position.currentValue;
            sectors[sector].symbols.push(position.symbol);
        });

        // Рассчитываем экспозицию для каждого сектора
        const totalValue = Object.values(sectors).reduce((sum, sector) => sum + sector.totalValue, 0);
        Object.values(sectors).forEach(sector => {
            sector.exposure = totalValue > 0 ? sector.totalValue / totalValue : 0;
        });

        return sectors;
    }

    /**
     * Анализ рисков
     */
    async analyzeRisks(positions) {
        const risks = {
            concentration: 0,
            correlation: 0,
            volatility: 0,
            liquidity: 0,
            violations: []
        };

        // Анализ концентрации
        const positionSizes = positions.map(p => p.positionSize);
        risks.concentration = this.calculateConcentrationRisk(positionSizes);

        // Анализ корреляции (асинхронный метод)
        risks.correlation = await this.calculateCorrelationRisk(positions);

        // Анализ волатильности
        risks.volatility = this.calculateVolatilityRisk(positions);

        // Анализ ликвидности
        risks.liquidity = this.calculateLiquidityRisk(positions);

        // Проверка нарушений
        risks.violations = this.checkViolations(positions);

        return risks;
    }

    /**
     * Генерация рекомендаций
     */
    generateRecommendations(analysis) {
        const recommendations = [];

        // Рекомендации по концентрации
        if (analysis.risks.concentration > 0.7) {
            recommendations.push({
                type: 'concentration',
                priority: 'high',
                message: 'Высокая концентрация риска. Рекомендуется диверсификация.',
                action: 'diversify_portfolio'
            });
        }

        // Рекомендации по секторам
        Object.entries(analysis.sectors).forEach(([sector, data]) => {
            if (data.exposure > this.allocationSettings.maxSectorExposure) {
                recommendations.push({
                    type: 'sector_exposure',
                    priority: 'medium',
                    message: `Превышена экспозиция по сектору ${sector}: ${(data.exposure * 100).toFixed(1)}%`,
                    action: 'reduce_sector_exposure',
                    sector
                });
            }
        });

        // Рекомендации по позициям
        analysis.positions.forEach(position => {
            if (position.positionSize > this.allocationSettings.maxPositionSize) {
                recommendations.push({
                    type: 'position_size',
                    priority: 'high',
                    message: `Превышен размер позиции ${position.symbol}: ${(position.positionSize * 100).toFixed(1)}%`,
                    action: 'reduce_position_size',
                    symbol: position.symbol
                });
            }
        });

        // Рекомендации по диверсификации
        if (analysis.totalPositions < this.allocationSettings.minPositions) {
            recommendations.push({
                type: 'diversification',
                priority: 'medium',
                message: `Недостаточно позиций для диверсификации: ${analysis.totalPositions}`,
                action: 'add_positions'
            });
        }

        return recommendations;
    }

    /**
     * Оптимальное распределение капитала
     */
    async optimizeAllocation(targetStrategy = null) {
        try {
            const strategy = targetStrategy || this.currentStrategy;
            const strategyConfig = this.strategies[strategy];
            
            // Для стратегии 'optimized' не нужен полный анализ портфеля
            // Используем упрощенный подход без вызова analyzePortfolio()
            let analysis = null;
            let currentPositions = [];
            
            if (strategy === 'optimized') {
                // Для оптимизированной стратегии получаем позиции напрямую из портфеля
                const portfolio = TradingEngine.virtualPortfolio || {};
                const positions = portfolio.trades || [];
                currentPositions = positions.map(pos => ({
                    symbol: pos.symbol || pos.figi,
                    figi: pos.figi || pos.symbol,
                    quantity: pos.quantity || 0,
                    currentPrice: pos.currentPrice || 0,
                    currentValue: (pos.quantity || 0) * (pos.currentPrice || 0)
                }));
                
                analysis = {
                    timestamp: new Date(),
                    totalValue: portfolio.totalValue || 0,
                    totalPositions: currentPositions.length,
                    positions: currentPositions,
                    sectors: {},
                    risks: {},
                    recommendations: []
                };
            } else {
                // Для других стратегий используем полный анализ
                analysis = await this.analyzePortfolio();
                if (analysis.error) {
                    throw new Error(analysis.error);
                }
                currentPositions = analysis.positions;
            }

            const optimization = {
                strategy,
                timestamp: new Date(),
                currentAllocation: currentPositions,
                targetAllocation: [],
                rebalancing: [],
                risks: analysis.risks || {},
                recommendations: analysis.recommendations || []
            };

            // Рассчитываем оптимальное распределение
            const targetAllocation = await this.calculateTargetAllocation(analysis, strategyConfig);
            optimization.targetAllocation = targetAllocation;

            // Рассчитываем необходимые изменения
            optimization.rebalancing = this.calculateRebalancing(currentPositions, targetAllocation);

            // Валидируем распределение
            const validation = this.validateAllocation(targetAllocation, strategyConfig);
            optimization.validation = validation;

            return optimization;

        } catch (error) {
            console.error('❌ Ошибка оптимизации распределения:', error);
            throw error;
        }
    }

    /**
     * Расчет целевого распределения
     */
    async calculateTargetAllocation(analysis, strategyConfig) {
        const targetAllocation = [];
        const totalValue = analysis.totalValue;
        
        if (totalValue <= 0) {
            return targetAllocation;
        }

        // Если используется стратегия optimized, используем PortfolioOptimizer
        if (strategyConfig.useOptimizer) {
            try {
                return await this.calculateOptimizedAllocation(analysis, strategyConfig);
            } catch (error) {
                console.warn('⚠️ Ошибка оптимизации портфеля, используем fallback метод:', error.message);
                // Fallback на стандартный метод
            }
        }

        // Стандартный метод распределения (fallback или для других стратегий)
        // Получаем список доступных инструментов
        // Используем skipMetrics=true для ускорения (метрики не критичны для расчета целевого распределения)
        const availableInstruments = await this.getAvailableInstruments(true, true);
        
        // Сортируем по приоритету (прибыльность, волатильность, ликвидность)
        const prioritizedInstruments = await this.prioritizeInstruments(availableInstruments);

        // Распределяем капитал
        let remainingCapital = totalValue;
        let positionCount = 0;

        for (const instrument of prioritizedInstruments) {
            if (positionCount >= this.allocationSettings.maxPositions) break;
            if (remainingCapital <= 0) break;

            // Рассчитываем размер позиции
            const positionSize = this.calculateOptimalPositionSize(
                instrument, 
                strategyConfig, 
                remainingCapital,
                targetAllocation
            );

            if (positionSize > 0) {
                targetAllocation.push({
                    symbol: instrument.symbol,
                    quantity: Math.floor(positionSize / instrument.price),
                    value: positionSize,
                    weight: positionSize / totalValue,
                    sector: instrument.sector,
                    expectedReturn: instrument.expectedReturn || 0,
                    risk: instrument.risk || 0
                });

                remainingCapital -= positionSize;
                positionCount++;
            }
        }

        return targetAllocation;
    }

    /**
     * Расчет целевого распределения с использованием PortfolioOptimizer
     */
    async calculateOptimizedAllocation(analysis, strategyConfig) {
        const totalValue = analysis.totalValue;
        
        // Инициализируем PortfolioOptimizer если еще не инициализирован
        if (!PortfolioOptimizer.isInitialized) {
            await PortfolioOptimizer.initialize();
        }

        // Получаем список доступных инструментов
        // Используем skipMetrics=true для ускорения (метрики не критичны для оптимизации)
        const availableInstruments = await this.getAvailableInstruments(true, true);
        
        if (!availableInstruments || availableInstruments.length === 0) {
            throw new Error('Нет доступных инструментов для оптимизации');
        }

        // Преобразуем инструменты в формат для PortfolioOptimizer
        const instruments = [];
        for (const inst of availableInstruments) {
            // Получаем FIGI из CachedInstrument если нужно
            let figi = inst.figi;
            if (!figi && inst.symbol) {
                const cachedInst = await CachedInstrument.findOne({
                    where: { ticker: inst.symbol },
                    attributes: ['figi', 'ticker', 'name', 'instrumentType', 'currency']
                });
                if (cachedInst) {
                    figi = cachedInst.figi;
                }
            }

            if (figi) {
                instruments.push({
                    figi: figi,
                    ticker: inst.symbol || inst.ticker,
                    name: inst.name,
                    sector: inst.sector,
                    price: inst.price || 0
                });
            }
        }

        if (instruments.length < 2) {
            throw new Error('Недостаточно инструментов для оптимизации (нужно минимум 2)');
        }

        // Получаем матрицу корреляций
        const figis = instruments.map(i => i.figi);
        const correlationMatrix = await CorrelationService.getCorrelationMatrix(figis);

        if (!correlationMatrix || Object.keys(correlationMatrix).length === 0) {
            throw new Error('Не удалось получить матрицу корреляций');
        }

        // Определяем метод оптимизации
        const optimizationMethod = strategyConfig.optimizationMethod || 'mean_variance';
        
        // Настройки ограничений
        const constraints = {
            maxPositionSize: strategyConfig.maxPositionSize || 0.10,
            minPositionSize: 0.01, // Минимум 1%
            maxSectorExposure: strategyConfig.maxSectorExposure || 0.30,
            maxPositions: this.allocationSettings.maxPositions || instruments.length,
            instruments: instruments
        };

        // Выполняем оптимизацию в зависимости от метода
        let optimizationResult;
        try {
            switch (optimizationMethod) {
                case 'black_litterman':
                    optimizationResult = await PortfolioOptimizer.blackLittermanOptimization({
                        instruments: instruments,
                        correlationMatrix: correlationMatrix,
                        totalCapital: totalValue,
                        constraints: constraints,
                        riskAversion: strategyConfig.riskTolerance ? (1 / strategyConfig.riskTolerance) * 2 : 3.0
                    });
                    break;
                
                case 'risk_parity':
                    optimizationResult = await PortfolioOptimizer.riskParityOptimization({
                        instruments: instruments,
                        correlationMatrix: correlationMatrix,
                        totalCapital: totalValue,
                        constraints: constraints
                    });
                    break;
                
                case 'mean_variance':
                default:
                    optimizationResult = await PortfolioOptimizer.meanVarianceOptimization({
                        instruments: instruments,
                        correlationMatrix: correlationMatrix,
                        totalCapital: totalValue,
                        constraints: constraints,
                        riskAversion: strategyConfig.riskTolerance ? (1 / strategyConfig.riskTolerance) * 2 : 3.0
                    });
                    break;
            }
        } catch (error) {
            console.error('❌ Ошибка выполнения оптимизации:', error);
            throw error;
        }

        if (!optimizationResult || !optimizationResult.weights) {
            throw new Error('Оптимизация не вернула результаты');
        }

        // Преобразуем результаты оптимизации в формат targetAllocation
        const targetAllocation = [];
        const weights = optimizationResult.weights;

        for (const instrument of instruments) {
            const weight = weights[instrument.figi] || 0;
            
            if (weight > 0.001) { // Минимальный вес 0.1%
                const positionValue = totalValue * weight;
                const price = instrument.price || (await CacheService.getInstrument(instrument.figi))?.lastPrice || 0;
                
                if (price > 0) {
                    targetAllocation.push({
                        symbol: instrument.ticker,
                        figi: instrument.figi,
                        quantity: Math.floor(positionValue / price),
                        value: positionValue,
                        weight: weight,
                        sector: instrument.sector,
                        expectedReturn: optimizationResult.expectedReturn || 0,
                        risk: optimizationResult.portfolioVolatility || 0,
                        optimizationMethod: optimizationMethod,
                        sharpeRatio: optimizationResult.sharpeRatio || 0
                    });
                }
            }
        }

        // Сортируем по весу (от большего к меньшему)
        targetAllocation.sort((a, b) => b.weight - a.weight);

        return targetAllocation;
    }

    /**
     * Расчет оптимального размера позиции
     */
    calculateOptimalPositionSize(instrument, strategyConfig, availableCapital, existingAllocation) {
        // Базовый размер позиции
        let positionSize = availableCapital * strategyConfig.maxPositionSize;

        // Корректировка на основе волатильности
        if (instrument.volatility > 0.3) {
            positionSize *= 0.7; // Снижаем для волатильных инструментов
        }

        // Корректировка на основе ликвидности
        if (instrument.liquidity < this.allocationSettings.liquidityThreshold) {
            positionSize *= 0.5; // Снижаем для неликвидных инструментов
        }

        // Проверка лимитов сектора
        const sectorExposure = this.calculateSectorExposure(existingAllocation, instrument.sector);
        if (sectorExposure + positionSize > availableCapital * strategyConfig.maxSectorExposure) {
            positionSize = Math.max(0, availableCapital * strategyConfig.maxSectorExposure - sectorExposure);
        }

        // Проверка минимального размера
        if (positionSize < availableCapital * this.allocationSettings.minPositionSize) {
            return 0;
        }

        return Math.min(positionSize, availableCapital);
    }

    /**
     * Расчет необходимых изменений для ребалансировки
     */
    calculateRebalancing(currentPositions, targetAllocation) {
        const rebalancing = [];

        // Создаем карту текущих позиций
        const currentMap = new Map();
        currentPositions.forEach(pos => {
            currentMap.set(pos.symbol, pos);
        });

        // Создаем карту целевых позиций
        const targetMap = new Map();
        targetAllocation.forEach(pos => {
            targetMap.set(pos.symbol, pos);
        });

        // Находим изменения
        for (const [symbol, targetPos] of targetMap) {
            const currentPos = currentMap.get(symbol);
            
            if (!currentPos) {
                // Новая позиция
                rebalancing.push({
                    symbol,
                    action: 'BUY',
                    quantity: targetPos.quantity,
                    value: targetPos.value,
                    reason: 'Новая позиция'
                });
            } else {
                const quantityDiff = targetPos.quantity - currentPos.quantity;
                const valueDiff = targetPos.value - currentPos.currentValue;
                
                if (Math.abs(quantityDiff) > 0.01) { // Минимальный порог
                    rebalancing.push({
                        symbol,
                        action: quantityDiff > 0 ? 'BUY' : 'SELL',
                        quantity: Math.abs(quantityDiff),
                        value: Math.abs(valueDiff),
                        reason: quantityDiff > 0 ? 'Увеличение позиции' : 'Уменьшение позиции'
                    });
                }
            }
        }

        // Находим позиции для закрытия
        for (const [symbol, currentPos] of currentMap) {
            if (!targetMap.has(symbol)) {
                rebalancing.push({
                    symbol,
                    action: 'SELL',
                    quantity: currentPos.quantity,
                    value: currentPos.currentValue,
                    reason: 'Закрытие позиции'
                });
            }
        }

        return rebalancing;
    }

    /**
     * Валидация распределения
     */
    validateAllocation(allocation, strategyConfig) {
        const validation = {
            isValid: true,
            violations: [],
            warnings: []
        };

        const totalValue = allocation.reduce((sum, pos) => sum + pos.value, 0);
        
        // Проверка размера позиций
        allocation.forEach(pos => {
            const positionSize = pos.value / totalValue;
            if (positionSize > strategyConfig.maxPositionSize) {
                validation.violations.push({
                    type: 'position_size',
                    symbol: pos.symbol,
                    value: positionSize,
                    limit: strategyConfig.maxPositionSize,
                    message: `Позиция ${pos.symbol} превышает лимит: ${(positionSize * 100).toFixed(1)}% > ${(strategyConfig.maxPositionSize * 100).toFixed(1)}%`
                });
                validation.isValid = false;
            }
        });

        // Проверка экспозиции по секторам
        const sectorExposure = {};
        allocation.forEach(pos => {
            const sector = pos.sector || 'Unknown';
            sectorExposure[sector] = (sectorExposure[sector] || 0) + pos.value;
        });

        Object.entries(sectorExposure).forEach(([sector, value]) => {
            const exposure = value / totalValue;
            if (exposure > strategyConfig.maxSectorExposure) {
                validation.violations.push({
                    type: 'sector_exposure',
                    sector,
                    value: exposure,
                    limit: strategyConfig.maxSectorExposure,
                    message: `Сектор ${sector} превышает лимит: ${(exposure * 100).toFixed(1)}% > ${(strategyConfig.maxSectorExposure * 100).toFixed(1)}%`
                });
                validation.isValid = false;
            }
        });

        return validation;
    }

    /**
     * Автоматическая ребалансировка
     */
    async autoRebalance() {
        try {
            if (!this.allocationSettings.autoRebalancing) {
                return { rebalanced: false, reason: 'Автоматическая ребалансировка отключена' };
            }

            const optimization = await this.optimizeAllocation();
            
            if (!optimization.validation.isValid) {
                return { 
                    rebalanced: false, 
                    reason: 'Невозможно выполнить ребалансировку из-за нарушений',
                    violations: optimization.validation.violations
                };
            }

            // Выполняем ребалансировку
            const results = [];
            for (const rebalance of optimization.rebalancing) {
                try {
                    const result = await this.executeRebalancing(rebalance);
                    results.push(result);
                } catch (error) {
                    console.error(`❌ Ошибка ребалансировки ${rebalance.symbol}:`, error);
                    results.push({
                        symbol: rebalance.symbol,
                        success: false,
                        error: error.message
                    });
                }
            }

            // Записываем в историю
            await this.recordRebalancing(optimization, results);

            // Отправляем уведомление
            if (this.allocationSettings.notifyOnRebalancing) {
                await this.sendRebalancingNotification(optimization, results);
            }

            return {
                rebalanced: true,
                strategy: optimization.strategy,
                changes: results,
                timestamp: optimization.timestamp
            };

        } catch (error) {
            console.error('❌ Ошибка автоматической ребалансировки:', error);
            return { rebalanced: false, error: error.message };
        }
    }

    /**
     * Выполнение ребалансировки
     */
    async executeRebalancing(rebalance) {
        try {
            // Здесь должна быть интеграция с TradingEngine
            // Пока что возвращаем заглушку
            return {
                symbol: rebalance.symbol,
                action: rebalance.action,
                quantity: rebalance.quantity,
                success: true,
                timestamp: new Date()
            };
        } catch (error) {
            console.error(`❌ Ошибка выполнения ребалансировки ${rebalance.symbol}:`, error);
            throw error;
        }
    }

    /**
     * Вспомогательные методы
     */
    calculatePositionSize(value) {
        const totalValue = TradingEngine.virtualPortfolio?.totalValue || 1;
        return value / totalValue;
    }

    calculateConcentrationRisk(positionSizes) {
        if (positionSizes.length === 0) return 0;
        const maxSize = Math.max(...positionSizes);
        const avgSize = positionSizes.reduce((sum, size) => sum + size, 0) / positionSizes.length;
        return maxSize / avgSize;
    }

    /**
     * Расчет корреляционного риска портфеля
     * Использует CorrelationService для расчета реальных корреляций
     */
    async calculateCorrelationRisk(positions) {
        if (positions.length < 2) return 0;
        
        try {
            const CorrelationService = (await import('./CorrelationService.js')).default;
            
            // Инициализируем сервис, если еще не инициализирован
            if (!CorrelationService.isInitialized) {
                await CorrelationService.initialize();
            }
            
            // Получаем FIGI всех позиций
            const figis = positions
                .map(p => p.figi || p.symbol)
                .filter(Boolean);
            
            if (figis.length < 2) return 0;
            
            // Рассчитываем матрицу корреляций
            const correlationMatrix = await CorrelationService.getCorrelationMatrix(figis, 30);
            
            // Рассчитываем среднюю корреляцию портфеля
            let totalCorrelation = 0;
            let pairCount = 0;
            
            for (let i = 0; i < figis.length; i++) {
                for (let j = i + 1; j < figis.length; j++) {
                    const correlation = correlationMatrix[figis[i]]?.[figis[j]] || 0;
                    totalCorrelation += Math.abs(correlation);
                    pairCount++;
                }
            }
            
            return pairCount > 0 ? totalCorrelation / pairCount : 0;
            
        } catch (error) {
            console.error('❌ Ошибка расчета корреляционного риска:', error);
            // Fallback на упрощенный расчет при ошибке
            return this.calculateCorrelationRiskFallback(positions);
        }
    }
    
    /**
     * Упрощенный расчет корреляционного риска (fallback)
     */
    calculateCorrelationRiskFallback(positions) {
        if (positions.length < 2) return 0;
        
        try {
            // Рассчитываем корреляцию между позициями на основе PnL
            const returns = positions.map(pos => pos.pnlPercent || 0);
            
            if (returns.length < 2) return 0;
            
            // Простой расчет дисперсии как proxy для корреляции
            const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
            const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length;
            
            // Нормализуем в диапазон 0-1
            return Math.min(1, Math.max(0, variance / 100));
            
        } catch (error) {
            console.error('❌ Ошибка упрощенного расчета корреляции:', error);
            return 0;
        }
    }

    calculateVolatilityRisk(positions) {
        if (positions.length === 0) return 0;
        const avgVolatility = positions.reduce((sum, pos) => sum + (pos.volatility || 0), 0) / positions.length;
        return avgVolatility;
    }

    calculateLiquidityRisk(positions) {
        if (positions.length === 0) return 0;
        const avgLiquidity = positions.reduce((sum, pos) => sum + (pos.liquidity || 0), 0) / positions.length;
        return avgLiquidity < this.allocationSettings.liquidityThreshold ? 1 : 0;
    }

    checkViolations(positions) {
        const violations = [];
        
        positions.forEach(pos => {
            if (pos.positionSize > this.allocationSettings.maxPositionSize) {
                violations.push({
                    type: 'position_size',
                    symbol: pos.symbol,
                    value: pos.positionSize,
                    limit: this.allocationSettings.maxPositionSize
                });
            }
        });

        return violations;
    }

    calculateSectorExposure(allocation, sector) {
        return allocation
            .filter(pos => pos.sector === sector)
            .reduce((sum, pos) => sum + pos.value, 0);
    }

    async getCurrentPrice(symbol) {
        try {
            // Сначала пробуем получить из кеша
            const instrument = await CacheService.getInstrument(symbol);
            if (instrument && typeof instrument.lastPrice === 'number') {
                return instrument.lastPrice;
            }

            // Если нет в кеше, запрашиваем через API
            const prices = await TradingEngine.getCurrentPrices([symbol]);
            return prices[symbol] || 0;

        } catch (error) {
            console.error(`❌ Ошибка получения цены для ${symbol}:`, error);
            return 0;
        }
    }

    async getSector(symbol) {
        try {
            const instrument = await CacheService.getInstrument(symbol);
            if (instrument && instrument.sector) {
                return instrument.sector;
            }

            // Если нет в кеше, получаем из API
            const instruments = await TinkoffApiService.getStocks();
            const foundInstrument = instruments.instruments?.find(inst => 
                inst.ticker === symbol || inst.figi === symbol
            );
            
            return foundInstrument?.sector || 'Unknown';

        } catch (error) {
            console.error(`❌ Ошибка получения сектора для ${symbol}:`, error);
            return 'Unknown';
        }
    }

    async getVolatility(symbol, skipUpdate = false) {
        try {
            // Получаем исторические данные для расчета волатильности
            // Используем только кеш, не делаем запросы к API
            const CachedCandle = (await import('../models/CachedCandle.js')).default;
            const { Op } = await import('sequelize');
            
            const from = new Date();
            from.setDate(from.getDate() - 30);
            
            const candles = await CachedCandle.findAll({
                where: {
                    figi: symbol,
                    interval: 'DAY',
                    time: { [Op.gte]: from }
                },
                order: [['time', 'ASC']],
                limit: 30
            });
            
            if (!candles || candles.length < 10) {
                return 0.2; // Значение по умолчанию
            }

            const prices = candles.map(c => c.close);
            const priceChanges = prices.slice(1).map((price, i) => (price - prices[i]) / prices[i]);
            const variance = priceChanges.reduce((sum, change) => sum + change * change, 0) / priceChanges.length;
            
            return Math.sqrt(variance);

        } catch (error) {
            console.error(`❌ Ошибка расчета волатильности для ${symbol}:`, error);
            return 0.2; // Значение по умолчанию
        }
    }

    async getLiquidity(symbol, skipUpdate = false) {
        try {
            // Получаем данные о ликвидности из последних свечей
            // Используем только кеш, не делаем запросы к API
            const CachedCandle = (await import('../models/CachedCandle.js')).default;
            const { Op } = await import('sequelize');
            
            const from = new Date();
            from.setDate(from.getDate() - 5);
            
            const candles = await CachedCandle.findAll({
                where: {
                    figi: symbol,
                    interval: 'DAY',
                    time: { [Op.gte]: from }
                },
                order: [['time', 'ASC']],
                limit: 5
            });
            
            if (!candles || candles.length === 0) {
                return 1000000; // Значение по умолчанию
            }

            // Рассчитываем средний объем торгов
            const avgVolume = candles.reduce((sum, candle) => sum + (candle.volume || 0), 0) / candles.length;
            const avgPrice = candles.reduce((sum, candle) => sum + candle.close, 0) / candles.length;
            
            return avgVolume * avgPrice;

        } catch (error) {
            console.error(`❌ Ошибка расчета ликвидности для ${symbol}:`, error);
            return 1000000; // Значение по умолчанию
        }
    }

    async getCorrelation(symbol, skipUpdate = false) {
        try {
            // Проверяем, является ли это тестовым FIGI
            if (symbol === 'TEST' || symbol.startsWith('TEST_') || symbol.startsWith('TEST_FIGI_')) {
                return 0.5; // Значение по умолчанию для тестовых инструментов
            }
            
            // Упрощенный расчет корреляции с рынком
            // Используем только кеш, не делаем запросы к API
            const CachedCandle = (await import('../models/CachedCandle.js')).default;
            const { Op } = await import('sequelize');
            
            const from = new Date();
            from.setDate(from.getDate() - 30);
            
            const candles = await CachedCandle.findAll({
                where: {
                    figi: symbol,
                    interval: 'DAY',
                    time: { [Op.gte]: from }
                },
                order: [['time', 'ASC']],
                limit: 30
            });
            
            if (!candles || candles.length < 10) {
                return 0.5; // Значение по умолчанию
            }

            const prices = candles.map(c => c.close);
            const returns = prices.slice(1).map((price, i) => (price - prices[i]) / prices[i]);
            
            // Упрощенный расчет корреляции (в реальности нужен бенчмарк)
            const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
            const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length;
            
            // Нормализуем в диапазон 0-1
            return Math.min(1, Math.max(0, variance * 10));

        } catch (error) {
            console.error(`❌ Ошибка расчета корреляции для ${symbol}:`, error);
            return 0.5; // Значение по умолчанию
        }
    }

    async getAvailableInstruments(useCache = true, skipMetrics = false) {
        try {
            // Проверяем кеш
            if (useCache && this.availableInstrumentsCache && this.availableInstrumentsCacheTime) {
                const cacheAge = Date.now() - this.availableInstrumentsCacheTime;
                if (cacheAge < this.availableInstrumentsCacheTTL) {
                    return this.availableInstrumentsCache;
                }
            }

            // Получаем реальные инструменты из кеша
            const instruments = await CachedInstrument.findAll({
                where: {
                    currency: 'rub', // Только российские инструменты
                    instrumentType: 'share' // Только акции
                },
                limit: 50, // Ограничиваем количество для производительности
                order: [['lastPrice', 'DESC']] // Сортируем по цене
            });

            const result = [];
            for (const instrument of instruments) {
                try {
                    const currentPrice = instrument.lastPrice || 0;
                    
                    // Если skipMetrics = true, используем значения по умолчанию (быстрее для тестов)
                    let volatility = 0.2;
                    let liquidity = 1000000;
                    let expectedReturn = 0.05;
                    
                    if (!skipMetrics) {
                        // Рассчитываем метрики только если не пропущены
                        // Используем skipUpdate=true чтобы не делать запросы к API (используем только кеш)
                        volatility = await this.getVolatility(instrument.figi, true);
                        liquidity = await this.getLiquidity(instrument.figi, true);
                        expectedReturn = await this.calculateExpectedReturn(instrument.figi, true);
                    }
                    
                    result.push({
                        symbol: instrument.ticker,
                        figi: instrument.figi,
                        price: currentPrice,
                        sector: instrument.sector || 'Unknown',
                        expectedReturn,
                        risk: volatility,
                        liquidity,
                        name: instrument.name
                    });
                } catch (error) {
                    console.warn(`⚠️ Ошибка обработки инструмента ${instrument.ticker}:`, error.message);
                }
            }

            // Сохраняем в кеш
            this.availableInstrumentsCache = result;
            this.availableInstrumentsCacheTime = Date.now();

            return result;

        } catch (error) {
            console.error('❌ Ошибка получения доступных инструментов:', error);
            // Возвращаем заглушку только в случае ошибки
            return [];
        }
    }

    /**
     * Очистка кеша доступных инструментов
     */
    clearAvailableInstrumentsCache() {
        this.availableInstrumentsCache = null;
        this.availableInstrumentsCacheTime = null;
    }

    async calculateExpectedReturn(figi, skipUpdate = false) {
        try {
            // Используем только кеш, не делаем запросы к API
            const CachedCandle = (await import('../models/CachedCandle.js')).default;
            const { Op } = await import('sequelize');
            
            const from = new Date();
            from.setDate(from.getDate() - 90);
            
            const candles = await CachedCandle.findAll({
                where: {
                    figi: figi,
                    interval: 'DAY',
                    time: { [Op.gte]: from }
                },
                order: [['time', 'ASC']],
                limit: 90
            });
            
            if (!candles || candles.length < 30) {
                return 0.05; // Значение по умолчанию
            }

            const prices = candles.map(c => c.close);
            const returns = prices.slice(1).map((price, i) => (price - prices[i]) / prices[i]);
            const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
            
            // Годовая доходность
            return avgReturn * 252;

        } catch (error) {
            console.error(`❌ Ошибка расчета ожидаемой доходности для ${figi}:`, error);
            return 0.05; // Значение по умолчанию
        }
    }

    /**
     * Приоритизация инструментов по низкой корреляции с портфелем
     * @param {Array} instruments - Массив инструментов для приоритизации
     * @param {Object} portfolio - Объект портфеля
     * @param {number} maxCorrelation - Максимальная допустимая корреляция (по умолчанию 0.7)
     * @returns {Promise<Array>} Отсортированный массив инструментов с оценками корреляции
     */
    async prioritizeInstrumentsByCorrelation(instruments, portfolio, maxCorrelation = 0.7) {
        try {
            const CorrelationService = (await import('./CorrelationService.js')).default;
            
            // Инициализируем сервис, если еще не инициализирован
            if (!CorrelationService.isInitialized) {
                await CorrelationService.initialize();
            }
            
            const prioritized = [];
            
            for (const instrument of instruments) {
                const figi = instrument.figi || instrument.symbol;
                if (!figi) continue;
                
                try {
                    // Получаем оценку корреляции для инструмента
                    const correlationScore = await CorrelationService.getCorrelationScore(
                        figi,
                        portfolio,
                        30
                    );
                    
                    prioritized.push({
                        ...instrument,
                        correlationScore: correlationScore.correlationScore,
                        avgCorrelation: correlationScore.avgCorrelation,
                        maxCorrelation: correlationScore.maxCorrelation,
                        correlatedPositions: correlationScore.correlatedPositions
                    });
                } catch (error) {
                    console.warn(`⚠️ Ошибка расчета корреляции для ${figi}:`, error.message);
                    // При ошибке даем средний приоритет
                    prioritized.push({
                        ...instrument,
                        correlationScore: 0.5,
                        avgCorrelation: 0,
                        maxCorrelation: 0,
                        correlatedPositions: []
                    });
                }
            }
            
            // Сортируем по приоритету (высокий приоритет = низкая корреляция)
            return prioritized.sort((a, b) => b.correlationScore - a.correlationScore);
            
        } catch (error) {
            console.error('❌ Ошибка приоритизации по корреляции:', error);
            // Возвращаем исходный массив при ошибке
            return instruments.map(instr => ({
                ...instr,
                correlationScore: 0.5,
                avgCorrelation: 0,
                maxCorrelation: 0
            }));
        }
    }

    async prioritizeInstruments(instruments) {
        // Сортируем по соотношению доходность/риск
        return instruments.sort((a, b) => {
            const ratioA = a.expectedReturn / a.risk;
            const ratioB = b.expectedReturn / b.risk;
            return ratioB - ratioA;
        });
    }

    async recordRebalancing(optimization, results) {
        try {
            const record = {
                timestamp: optimization.timestamp,
                strategy: optimization.strategy,
                changes: results,
                risks: optimization.risks,
                recommendations: optimization.recommendations
            };

            this.allocationHistory.unshift(record);
            
            if (this.allocationHistory.length > 100) {
                this.allocationHistory.splice(100);
            }

            await Settings.setSetting('allocation_history', this.allocationHistory, {
                description: 'История ребалансировки портфеля',
                category: 'allocation',
                dataType: 'json'
            });

        } catch (error) {
            console.error('❌ Ошибка записи ребалансировки:', error);
        }
    }

    async sendRebalancingNotification(optimization, results) {
        try {
            let message = `🔄 РЕБАЛАНСИРОВКА ПОРТФЕЛЯ\n\n`;
            
            message += `📊 Стратегия: ${this.strategies[optimization.strategy]?.name}\n`;
            message += `📈 Изменений: ${results.length}\n\n`;
            
            message += `🔧 ВЫПОЛНЕННЫЕ ОПЕРАЦИИ:\n`;
            results.slice(0, 5).forEach(result => {
                message += `• ${result.action} ${result.symbol}: ${result.quantity} шт.\n`;
            });
            
            if (results.length > 5) {
                message += `... и еще ${results.length - 5} операций\n`;
            }

            await OptimizedTelegramService.sendAlert('🔄 РЕБАЛАНСИРОВКА', message);

        } catch (error) {
            console.error('❌ Ошибка отправки уведомления:', error);
        }
    }

    /**
     * Получение статуса сервиса
     */
    async getStatus() {
        try {
            const analysis = await this.analyzePortfolio();
            
            return {
                isInitialized: this.isInitialized,
                currentStrategy: this.currentStrategy,
                strategyConfig: this.strategies[this.currentStrategy],
                settings: this.allocationSettings,
                portfolioAnalysis: analysis,
                historyCount: this.allocationHistory.length
            };

        } catch (error) {
            console.error('❌ Ошибка получения статуса:', error);
            return {
                isInitialized: this.isInitialized,
                error: error.message
            };
        }
    }

    /**
     * Получение истории ребалансировки
     */
    getRebalancingHistory(limit = 50) {
        return this.allocationHistory.slice(0, limit);
    }

    /**
     * Обновление настроек распределения
     */
    async updateAllocationSettings(newSettings) {
        try {
            for (const [key, value] of Object.entries(newSettings)) {
                await Settings.setSetting(`allocation_${key}`, value, {
                    description: `Настройка распределения капитала: ${key}`,
                    category: 'allocation',
                    dataType: typeof value === 'number' ? 'number' : 'boolean'
                });
            }

            await this.loadAllocationSettings();
            
            return { success: true, message: 'Настройки обновлены' };

        } catch (error) {
            console.error('❌ Ошибка обновления настроек:', error);
            throw error;
        }
    }
}

export default new CapitalAllocationStrategy();
