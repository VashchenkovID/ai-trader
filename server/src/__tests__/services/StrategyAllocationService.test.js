import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import StrategyAllocationService from '../../services/StrategyAllocationService.js';
import TradingStrategy from '../../models/TradingStrategy.js';
import PortfolioAllocation from '../../models/PortfolioAllocation.js';
import InstrumentStats from '../../models/InstrumentStats.js';
import CorrelationService from '../../services/CorrelationService.js';
import AdaptiveThresholdService from '../../services/AdaptiveThresholdService.js';

// Моки
jest.mock('../../models/TradingStrategy.js');
jest.mock('../../models/PortfolioAllocation.js');
jest.mock('../../models/InstrumentStats.js');
jest.mock('../../models/PositionStrategy.js', () => ({
    default: {
        findAll: jest.fn(),
        count: jest.fn()
    }
}));
jest.mock('../../models/TradingRequest.js', () => ({
    default: {
        findByPk: jest.fn()
    }
}));
jest.mock('../../services/CorrelationService.js');
jest.mock('../../services/AdaptiveThresholdService.js');
jest.mock('../../services/ProfitabilityTracker.js', () => ({
    default: {
        calculateStrategyMetrics: jest.fn()
    }
}));
jest.mock('../../services/SettingsService.js', () => ({
    default: {
        getPortfolioSettings: jest.fn().mockResolvedValue({
            user_max_portfolio_budget: 1000000
        })
    }
}));
jest.mock('../../services/LoggerService.js', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}));

describe('StrategyAllocationService - Фаза 2, задача 2.5: Улучшение стратегий', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        StrategyAllocationService.isInitialized = true;
    });

    describe('2.5.1. Автоматическая перебалансировка', () => {
        it('should rebalance strategies using performance-based method', async () => {
            // Создаем две стратегии с разными метриками для создания контраста
            const mockStrategy1 = {
                id: 1,
                name: 'High Performance Strategy',
                budgetAllocation: 50,
                isActive: true,
                priority: 1
            };
            
            const mockStrategy2 = {
                id: 2,
                name: 'Low Performance Strategy',
                budgetAllocation: 50,
                isActive: true,
                priority: 2
            };

            TradingStrategy.findAll = jest.fn().mockResolvedValue([mockStrategy1, mockStrategy2]);
            PortfolioAllocation.getOrCreateAllocation = jest.fn().mockResolvedValue({
                allocatedAmount: 500000,
                usedAmount: 200000
            });

            // Мокируем ProfitabilityTracker - возвращаем разные метрики для разных стратегий
            const ProfitabilityTracker = (await import('../../services/ProfitabilityTracker.js')).default;
            ProfitabilityTracker.calculateStrategyMetrics = jest.fn().mockImplementation((strategyId) => {
                if (strategyId === 1) {
                    // Высокие метрики для первой стратегии
                    return Promise.resolve({
                        strategyId: 1,
                        sharpeRatio: 2.5,  // Высокий Sharpe Ratio
                        winRate: 0.75,    // Хороший win rate
                        maxDrawdown: 0.10, // Низкая просадка
                        totalTrades: 100,
                        insufficientData: false
                    });
                } else {
                    // Низкие метрики для второй стратегии
                    return Promise.resolve({
                        strategyId: 2,
                        sharpeRatio: 0.5,  // Низкий Sharpe Ratio
                        winRate: 0.45,     // Низкий win rate
                        maxDrawdown: 0.30, // Высокая просадка
                        totalTrades: 50,
                        insufficientData: false
                    });
                }
            });

            // Мокируем PortfolioAllocation.updateAllocation, чтобы изменения применялись
            PortfolioAllocation.updateAllocation = jest.fn().mockResolvedValue(undefined);

            const result = await StrategyAllocationService.rebalanceStrategies({
                usePerformanceBased: true,
                days: 30,
                minSharpeRatio: 0 // Минимальный Sharpe Ratio = 0
            });

            expect(result.success).toBe(true);
            // С контрастными метриками должно быть значительное изменение (> 2%)
            // Поэтому должен вернуться performance-based метод
            expect(result.method).toBe('performance-based');
            expect(result.changes).toBeDefined();
            expect(result.changes.length).toBeGreaterThan(0);
        });

        it('should fallback to standard rebalancing if performance-based fails', async () => {
            const mockStrategy = {
                id: 1,
                name: 'Test Strategy',
                budgetAllocation: 50,
                isActive: true,
                priority: 1
            };

            TradingStrategy.findAll = jest.fn().mockResolvedValue([mockStrategy]);
            PortfolioAllocation.getOrCreateAllocation = jest.fn().mockResolvedValue({
                allocatedAmount: 500000,
                usedAmount: 200000
            });

            // Мокируем ошибку в performance-based методе
            const ProfitabilityTracker = (await import('../../services/ProfitabilityTracker.js')).default;
            // Заменяем метод на мок с ошибкой - это вызовет ошибку в Promise.all
            ProfitabilityTracker.calculateStrategyMetrics = jest.fn().mockRejectedValue(new Error('Test error'));

            const result = await StrategyAllocationService.rebalanceStrategies({
                usePerformanceBased: true,
                days: 30
            });

            expect(result.success).toBe(true);
            // При ошибке в performance-based должен быть fallback на standard
            expect(result.method).toBe('standard');
            // Проверяем, что ошибка была обработана и выполнилась стандартная перебалансировка
            expect(TradingStrategy.findAll).toHaveBeenCalled();
        });
    });

    describe('2.5.2. Адаптивные параметры стратегий', () => {
        it('should get adaptive strategy with volatility adjustments', async () => {
            const mockStrategy = {
                id: 1,
                name: 'Test Strategy',
                stopLossPercent: 5.0,
                takeProfitPercent: 10.0,
                atrMultiplier: 2.0,
                toJSON: () => ({
                    id: 1,
                    name: 'Test Strategy',
                    stopLossPercent: 5.0,
                    takeProfitPercent: 10.0,
                    atrMultiplier: 2.0
                })
            };

            TradingStrategy.findByPk = jest.fn().mockResolvedValue(mockStrategy);
            InstrumentStats.findOne = jest.fn().mockResolvedValue({
                volatility: 0.25 // Высокая волатильность
            });

            AdaptiveThresholdService.isInitialized = true;
            AdaptiveThresholdService.detectMarketMode = jest.fn().mockResolvedValue('volatile');

            const result = await StrategyAllocationService.getAdaptiveStrategy(1, 'TEST_FIGI');

            expect(result).toBeDefined();
            expect(result.adaptiveParams).toBeDefined();
            expect(result.adaptiveParams.volatilityMultiplier).toBeLessThan(1.0); // Высокая волатильность снижает размер
            expect(result.adjustedStopLossPercent).toBeGreaterThan(5.0); // В волатильном режиме увеличиваем стоп-лосс
        });

        it('should apply market mode adjustments correctly', async () => {
            const mockStrategy = {
                id: 1,
                name: 'Test Strategy',
                stopLossPercent: 5.0,
                takeProfitPercent: 10.0,
                toJSON: () => ({
                    id: 1,
                    name: 'Test Strategy',
                    stopLossPercent: 5.0,
                    takeProfitPercent: 10.0
                })
            };

            TradingStrategy.findByPk = jest.fn().mockResolvedValue(mockStrategy);
            AdaptiveThresholdService.isInitialized = true;
            AdaptiveThresholdService.detectMarketMode = jest.fn().mockResolvedValue('trend');

            const result = await StrategyAllocationService.getAdaptiveStrategy(1, 'TEST_FIGI', 0.15, 'trend');

            expect(result.adaptiveParams.marketMode).toBe('trend');
            expect(result.adjustedTakeProfitPercent).toBeGreaterThan(10.0); // В тренде увеличиваем тейк-профит
        });
    });

    describe('2.5.3. Улучшенный расчет размера позиции', () => {
        it('should calculate position size with confidence adjustment', async () => {
            const mockStrategy = {
                id: 1,
                name: 'Test Strategy',
                maxPositions: 10
            };

            TradingStrategy.findByPk = jest.fn().mockResolvedValue(mockStrategy);
            PortfolioAllocation.getOrCreateAllocation = jest.fn().mockResolvedValue({
                allocatedAmount: 100000,
                usedAmount: 30000
            });

            const PositionStrategy = (await import('../../models/PositionStrategy.js')).default;
            PositionStrategy.count = jest.fn().mockResolvedValue(3);

            const recommendation = {
                figi: 'TEST_FIGI',
                confidence: 0.85, // Высокая уверенность
                score: 0.8
            };

            const result = await StrategyAllocationService.calculatePositionSize(1, recommendation, 1000000);

            expect(result.amount).toBeGreaterThan(0);
            expect(result.adjustments.confidence).toBeGreaterThan(1.0); // Высокая уверенность увеличивает размер
            expect(result.details.confidenceAdjustment).toBeDefined();
        });

        it('should adjust position size based on volatility', async () => {
            const mockStrategy = {
                id: 1,
                name: 'Test Strategy',
                maxPositions: 10
            };

            TradingStrategy.findByPk = jest.fn().mockResolvedValue(mockStrategy);
            PortfolioAllocation.getOrCreateAllocation = jest.fn().mockResolvedValue({
                allocatedAmount: 100000,
                usedAmount: 30000
            });

            const PositionStrategy = (await import('../../models/PositionStrategy.js')).default;
            PositionStrategy.count = jest.fn().mockResolvedValue(3);

            InstrumentStats.findOne = jest.fn().mockResolvedValue({
                volatility: 0.35 // Очень высокая волатильность
            });

            AdaptiveThresholdService.isInitialized = true;
            AdaptiveThresholdService.detectMarketMode = jest.fn().mockResolvedValue('volatile');

            const recommendation = {
                figi: 'TEST_FIGI',
                confidence: 0.7,
                score: 0.7
            };

            const result = await StrategyAllocationService.calculatePositionSize(1, recommendation, 1000000);

            expect(result.adjustments.volatility).toBeLessThan(1.0); // Высокая волатильность снижает размер
            expect(result.volatility).toBe(0.35);
            expect(result.marketMode).toBe('volatile');
        });

        it('should adjust position size based on correlation', async () => {
            const mockStrategy = {
                id: 1,
                name: 'Test Strategy',
                maxPositions: 10
            };

            TradingStrategy.findByPk = jest.fn().mockResolvedValue(mockStrategy);
            PortfolioAllocation.getOrCreateAllocation = jest.fn().mockResolvedValue({
                allocatedAmount: 100000,
                usedAmount: 30000
            });

            const PositionStrategy = (await import('../../models/PositionStrategy.js')).default;
            PositionStrategy.count = jest.fn().mockResolvedValue(3);
            PositionStrategy.findAll = jest.fn().mockResolvedValue([
                { 
                    positionId: 1, 
                    strategyId: 1,
                    figi: 'EXISTING_FIGI',
                    exitDate: null
                }
            ]);

            const TradingRequest = (await import('../../models/TradingRequest.js')).default;
            TradingRequest.findByPk = jest.fn().mockResolvedValue({
                id: 1,
                figi: 'EXISTING_FIGI'
            });

            CorrelationService.isInitialized = true;
            CorrelationService.calculateCorrelation = jest.fn().mockResolvedValue(0.85); // Высокая корреляция

            const recommendation = {
                figi: 'TEST_FIGI',
                confidence: 0.7,
                score: 0.7
            };

            const result = await StrategyAllocationService.calculatePositionSize(1, recommendation, 1000000);

            expect(result.adjustments.correlation).toBeLessThan(1.0); // Высокая корреляция снижает размер
            expect(result.maxCorrelation).toBe(0.85);
        });

        it('should combine all adjustments correctly', async () => {
            const mockStrategy = {
                id: 1,
                name: 'Test Strategy',
                maxPositions: 10
            };

            TradingStrategy.findByPk = jest.fn().mockResolvedValue(mockStrategy);
            PortfolioAllocation.getOrCreateAllocation = jest.fn().mockResolvedValue({
                allocatedAmount: 100000,
                usedAmount: 30000
            });

            const PositionStrategy = (await import('../../models/PositionStrategy.js')).default;
            PositionStrategy.count = jest.fn().mockResolvedValue(3);

            const recommendation = {
                figi: 'TEST_FIGI',
                confidence: 0.9, // Очень высокая уверенность
                score: 0.85
            };

            // Мокируем AdaptiveThresholdService, чтобы не пытался определить marketMode
            if (AdaptiveThresholdService) {
                AdaptiveThresholdService.isInitialized = false; // Отключаем, чтобы использовался 'normal'
            }

            const result = await StrategyAllocationService.calculatePositionSize(1, recommendation, 1000000, {
                volatility: 0.08, // Низкая волатильность (< 10%)
                correlation: 0.3,  // Низкая корреляция
                marketMode: 'normal' // Явно указываем режим 'normal'
            });

            expect(result.multiplier).toBeDefined();
            // Проверяем, что multiplier рассчитан корректно
            const multiplier = parseFloat(result.multiplier);
            expect(multiplier).toBeGreaterThan(0);
            expect(result.adjustments.confidence).toBeGreaterThan(1.0); // Высокая уверенность увеличивает
            
            // Для volatility 0.08 (< 10%) и marketMode 'normal':
            // volatilityMultiplier = 1.2 (low volatility)
            // marketModeMultiplier = 1.0 (normal mode)
            // positionSizeMultiplier = 1.2 * 1.0 = 1.2
            const volatilityAdjustment = parseFloat(result.adjustments.volatility);
            // Проверяем, что marketMode был использован правильно
            expect(result.marketMode).toBe('normal');
            // positionSizeMultiplier должен быть 1.2 для low volatility + normal mode
            expect(volatilityAdjustment).toBeCloseTo(1.2, 2); // 1.2 с допуском 0.02
            
            expect(result.adjustments.correlation).toBe(1.0); // Низкая корреляция не влияет
            
            // При confidence 0.9, volatility 0.08 (low -> 1.2), correlation 0.3 (low -> 1.0)
            // multiplier = confidence (1.18) * volatility (1.2) * correlation (1.0) = 1.416
            // Ограничен диапазоном [0.3, 1.5], поэтому должен быть 1.416 (но ограничен до 1.5)
            expect(multiplier).toBeGreaterThan(1.0); // Все положительные факторы должны дать multiplier > 1.0
        });
    });

    describe('TradingStrategy.getAdaptiveParams', () => {
        it('should return adaptive params for low volatility', () => {
            const params = TradingStrategy.getAdaptiveParams(0.08, 'normal');
            
            expect(params.volatilityMultiplier).toBeGreaterThan(1.0); // Низкая волатильность увеличивает размер
            expect(params.positionSizeMultiplier).toBeGreaterThan(1.0);
        });

        it('should return adaptive params for high volatility', () => {
            const params = TradingStrategy.getAdaptiveParams(0.35, 'volatile');
            
            expect(params.volatilityMultiplier).toBeLessThan(1.0); // Высокая волатильность снижает размер
            expect(params.stopLossMultiplier).toBeGreaterThan(1.0); // В волатильном режиме увеличиваем стоп-лосс
        });

        it('should return adaptive params for trend mode', () => {
            const params = TradingStrategy.getAdaptiveParams(0.15, 'trend');
            
            expect(params.marketMode).toBe('trend');
            expect(params.takeProfitMultiplier).toBeGreaterThan(1.0); // В тренде увеличиваем тейк-профит
            expect(params.stopLossMultiplier).toBeLessThan(1.0); // В тренде ужесточаем стоп-лосс
        });

        it('should return adaptive params for flat mode', () => {
            const params = TradingStrategy.getAdaptiveParams(0.15, 'flat');
            
            expect(params.marketMode).toBe('flat');
            expect(params.positionSizeMultiplier).toBeLessThan(1.0); // Во флэте уменьшаем размер
        });
    });

    describe('TradingStrategy.applyAdaptiveParams', () => {
        it('should apply adaptive params to strategy', () => {
            const strategy = {
                id: 1,
                name: 'Test Strategy',
                stopLossPercent: 5.0,
                takeProfitPercent: 10.0,
                atrMultiplier: 2.0
            };

            const adapted = TradingStrategy.applyAdaptiveParams(strategy, 0.25, 'volatile');

            expect(adapted.adjustedStopLossPercent).toBeGreaterThan(5.0); // В волатильном режиме увеличиваем
            expect(adapted.adjustedAtrMultiplier).toBeGreaterThan(2.0);
            expect(adapted.adaptiveParams).toBeDefined();
        });
    });
});

