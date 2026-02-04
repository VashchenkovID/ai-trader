/**
 * Интеграционный тест для Фазы 2, задача 2.5: Улучшение стратегий
 * 
 * Тестирует:
 * - 2.5.1: Автоматическую перебалансировку на основе Sharpe Ratio, win rate, max drawdown
 * - 2.5.2: Адаптивные параметры стратегий (волатильность, рыночные режимы)
 * - 2.5.3: Улучшенный расчет размера позиции (confidence, волатильность, корреляция)
 */

import StrategyAllocationService from '../src/services/StrategyAllocationService.js';
import TradingStrategy from '../src/models/TradingStrategy.js';
import PortfolioAllocation from '../src/models/PortfolioAllocation.js';
import InstrumentStats from '../src/models/InstrumentStats.js';
import CorrelationService from '../src/services/CorrelationService.js';
import AdaptiveThresholdService from '../src/services/AdaptiveThresholdService.js';
import ProfitabilityTracker from '../src/services/ProfitabilityTracker.js';
import SettingsService from '../src/services/SettingsService.js';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  ✅ ${message}`);
        testsPassed++;
    } else {
        console.error(`  ❌ ${message}`);
        testsFailed++;
    }
}

async function testAdaptiveParams() {
    console.log('\n📊 Тест 2.5.2: Адаптивные параметры стратегий');
    console.log('='.repeat(60));
    
    try {
        // Тест для низкой волатильности
        const lowVolParams = TradingStrategy.getAdaptiveParams(0.08, 'normal');
        assert(lowVolParams.volatilityMultiplier > 1.0, 'Низкая волатильность увеличивает размер позиции');
        assert(lowVolParams.positionSizeMultiplier > 1.0, 'Низкая волатильность увеличивает общий множитель');
        
        // Тест для высокой волатильности
        const highVolParams = TradingStrategy.getAdaptiveParams(0.35, 'volatile');
        assert(highVolParams.volatilityMultiplier < 1.0, 'Высокая волатильность снижает размер позиции');
        assert(highVolParams.stopLossMultiplier > 1.0, 'В волатильном режиме увеличивается стоп-лосс');
        
        // Тест для трендового режима
        const trendParams = TradingStrategy.getAdaptiveParams(0.15, 'trend');
        assert(trendParams.takeProfitMultiplier > 1.0, 'В тренде увеличивается тейк-профит');
        assert(trendParams.stopLossMultiplier < 1.0, 'В тренде ужесточается стоп-лосс');
        
        // Тест применения адаптивных параметров
        const mockStrategy = {
            stopLossPercent: 5.0,
            takeProfitPercent: 10.0,
            atrMultiplier: 2.0,
            toJSON: () => ({
                stopLossPercent: 5.0,
                takeProfitPercent: 10.0,
                atrMultiplier: 2.0
            })
        };
        
        const adapted = TradingStrategy.applyAdaptiveParams(mockStrategy, 0.25, 'volatile');
        assert(adapted.adjustedStopLossPercent > 5.0, 'Адаптивный стоп-лосс больше базового в волатильном режиме');
        assert(adapted.adaptiveParams !== undefined, 'Адаптивные параметры применены');
        
        console.log('✅ Все тесты адаптивных параметров пройдены');
    } catch (error) {
        console.error('❌ Ошибка в тестах адаптивных параметров:', error);
        testsFailed++;
    }
}

async function testPositionSizeCalculation() {
    console.log('\n💰 Тест 2.5.3: Улучшенный расчет размера позиции');
    console.log('='.repeat(60));
    
    try {
        // Инициализируем сервисы
        if (!StrategyAllocationService.isInitialized) {
            await StrategyAllocationService.initialize();
        }
        
        // Создаем тестовую стратегию
        const [strategy] = await TradingStrategy.findOrCreate({
            where: { name: 'Test Strategy for Position Size' },
            defaults: {
                name: 'Test Strategy for Position Size',
                type: 'moderate',
                timeframe: 'medium',
                budgetAllocation: 50,
                minConfidence: 0.6,
                minScore: 0.6,
                stopLossPercent: 5.0,
                takeProfitPercent: 10.0,
                isActive: true,
                priority: 1
            }
        });
        
        // Инициализируем allocation
        await PortfolioAllocation.getOrCreateAllocation(strategy.id);
        await PortfolioAllocation.updateAllocation(strategy.id, 100000);
        
        // Тест 1: Высокая уверенность увеличивает размер
        const recommendation1 = {
            figi: 'TEST_FIGI_1',
            confidence: 0.9,
            score: 0.85
        };
        
        const result1 = await StrategyAllocationService.calculatePositionSize(
            strategy.id, 
            recommendation1, 
            1000000
        );
        
        assert(result1.amount > 0, 'Размер позиции рассчитан');
        assert(parseFloat(result1.adjustments.confidence) > 1.0, 'Высокая уверенность увеличивает размер');
        
        // Тест 2: Низкая уверенность уменьшает размер
        const recommendation2 = {
            figi: 'TEST_FIGI_2',
            confidence: 0.55,
            score: 0.6
        };
        
        const result2 = await StrategyAllocationService.calculatePositionSize(
            strategy.id, 
            recommendation2, 
            1000000
        );
        
        assert(parseFloat(result2.adjustments.confidence) < 1.0, 'Низкая уверенность уменьшает размер');
        
        // Тест 3: Волатильность влияет на размер
        const recommendation3 = {
            figi: 'TEST_FIGI_3',
            confidence: 0.7,
            score: 0.7
        };
        
        const result3 = await StrategyAllocationService.calculatePositionSize(
            strategy.id, 
            recommendation3, 
            1000000,
            { volatility: 0.35 } // Высокая волатильность
        );
        
        assert(parseFloat(result3.adjustments.volatility) < 1.0, 'Высокая волатильность снижает размер');
        
        // Тест 4: Корреляция влияет на размер
        const result4 = await StrategyAllocationService.calculatePositionSize(
            strategy.id, 
            recommendation3, 
            1000000,
            { correlation: 0.85 } // Высокая корреляция
        );
        
        assert(parseFloat(result4.adjustments.correlation) < 1.0, 'Высокая корреляция снижает размер');
        
        // Тест 5: Комбинированное влияние всех факторов
        const result5 = await StrategyAllocationService.calculatePositionSize(
            strategy.id, 
            { figi: 'TEST_FIGI_5', confidence: 0.9, score: 0.85 }, 
            1000000,
            { 
                volatility: 0.12,  // Низкая волатильность
                correlation: 0.2   // Низкая корреляция
            }
        );
        
        const combinedMultiplier = parseFloat(result5.multiplier);
        assert(combinedMultiplier > 1.0, 'Все положительные факторы увеличивают размер');
        
        console.log('✅ Все тесты расчета размера позиции пройдены');
    } catch (error) {
        console.error('❌ Ошибка в тестах расчета размера позиции:', error);
        testsFailed++;
    }
}

async function testPerformanceBasedRebalancing() {
    console.log('\n🔄 Тест 2.5.1: Автоматическая перебалансировка на основе производительности');
    console.log('='.repeat(60));
    
    try {
        // Инициализируем сервисы
        if (!StrategyAllocationService.isInitialized) {
            await StrategyAllocationService.initialize();
        }
        
        // Создаем тестовые стратегии
        const [strategy1] = await TradingStrategy.findOrCreate({
            where: { name: 'High Performance Strategy' },
            defaults: {
                name: 'High Performance Strategy',
                type: 'aggressive',
                timeframe: 'short',
                budgetAllocation: 30,
                minConfidence: 0.8,
                minScore: 0.75,
                isActive: true,
                priority: 1
            }
        });
        
        const [strategy2] = await TradingStrategy.findOrCreate({
            where: { name: 'Low Performance Strategy' },
            defaults: {
                name: 'Low Performance Strategy',
                type: 'conservative',
                timeframe: 'long',
                budgetAllocation: 40,
                minConfidence: 0.5,
                minScore: 0.5,
                isActive: true,
                priority: 2
            }
        });
        
        // Мокируем метрики производительности
        const originalCalculateStrategyMetrics = ProfitabilityTracker.calculateStrategyMetrics;
        ProfitabilityTracker.calculateStrategyMetrics = async (strategyId, days) => {
            if (strategyId === strategy1.id) {
                return {
                    strategyId: strategy1.id,
                    sharpeRatio: 2.0,      // Высокий Sharpe Ratio
                    winRate: 0.75,         // Высокий win rate
                    maxDrawdown: 0.10,     // Низкая просадка
                    totalTrades: 50,
                    insufficientData: false
                };
            } else if (strategyId === strategy2.id) {
                return {
                    strategyId: strategy2.id,
                    sharpeRatio: 0.5,      // Низкий Sharpe Ratio
                    winRate: 0.45,         // Низкий win rate
                    maxDrawdown: 0.25,     // Высокая просадка
                    totalTrades: 30,
                    insufficientData: false
                };
            }
            return {
                strategyId,
                sharpeRatio: 0,
                winRate: 0,
                maxDrawdown: 0,
                totalTrades: 0,
                insufficientData: true
            };
        };
        
        // Инициализируем allocations
        await PortfolioAllocation.getOrCreateAllocation(strategy1.id);
        await PortfolioAllocation.updateAllocation(strategy1.id, 300000);
        
        await PortfolioAllocation.getOrCreateAllocation(strategy2.id);
        await PortfolioAllocation.updateAllocation(strategy2.id, 400000);
        
        // Выполняем перебалансировку
        const result = await StrategyAllocationService.rebalanceBudgetByPerformance(30, 0);
        
        assert(result.success, 'Перебалансировка выполнена успешно');
        
        // Восстанавливаем оригинальный метод
        ProfitabilityTracker.calculateStrategyMetrics = originalCalculateStrategyMetrics;
        
        console.log('✅ Тест перебалансировки на основе производительности пройден');
    } catch (error) {
        console.error('❌ Ошибка в тесте перебалансировки:', error);
        testsFailed++;
    }
}

async function testGetAdaptiveStrategy() {
    console.log('\n🎯 Тест получения адаптивной стратегии');
    console.log('='.repeat(60));
    
    try {
        if (!StrategyAllocationService.isInitialized) {
            await StrategyAllocationService.initialize();
        }
        
        // Создаем тестовую стратегию
        const [strategy] = await TradingStrategy.findOrCreate({
            where: { name: 'Test Adaptive Strategy' },
            defaults: {
                name: 'Test Adaptive Strategy',
                type: 'moderate',
                timeframe: 'medium',
                budgetAllocation: 50,
                minConfidence: 0.6,
                minScore: 0.6,
                stopLossPercent: 5.0,
                takeProfitPercent: 10.0,
                atrMultiplier: 2.0,
                isActive: true,
                priority: 1
            }
        });
        
        // Создаем тестовую статистику инструмента
        // В интеграционном тесте используем реальный сервис, если он инициализирован
        if (AdaptiveThresholdService && !AdaptiveThresholdService.isInitialized) {
            try {
                await AdaptiveThresholdService.initialize();
            } catch (error) {
                console.warn('⚠️ Could not initialize AdaptiveThresholdService:', error.message);
            }
        }
        
        const result = await StrategyAllocationService.getAdaptiveStrategy(
            strategy.id, 
            'TEST_FIGI', 
            0.25,  // Высокая волатильность
            'volatile' // Волатильный режим
        );
        
        assert(result !== null, 'Адаптивная стратегия получена');
        assert(result.adaptiveParams !== undefined, 'Адаптивные параметры применены');
        assert(result.adjustedStopLossPercent > 5.0, 'Стоп-лосс скорректирован для волатильного режима');
        
        console.log('✅ Тест получения адаптивной стратегии пройден');
    } catch (error) {
        console.error('❌ Ошибка в тесте получения адаптивной стратегии:', error);
        testsFailed++;
    }
}

async function runAllTests() {
    console.log('🚀 Запуск интеграционных тестов для Фазы 2, задача 2.5: Улучшение стратегий\n');
    console.log('='.repeat(60));
    
    try {
        // SettingsService не требует инициализации - это сервис без метода initialize
        
        await testAdaptiveParams();
        await testPositionSizeCalculation();
        await testPerformanceBasedRebalancing();
        await testGetAdaptiveStrategy();
        
        console.log('\n' + '='.repeat(60));
        console.log(`\n📊 Результаты тестирования:`);
        console.log(`   ✅ Пройдено: ${testsPassed}`);
        console.log(`   ❌ Провалено: ${testsFailed}`);
        console.log(`   📈 Успешность: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);
        
        if (testsFailed === 0) {
            console.log('\n✅ Все тесты пройдены успешно!');
            process.exit(0);
        } else {
            console.log('\n❌ Некоторые тесты провалены');
            process.exit(1);
        }
    } catch (error) {
        console.error('\n❌ Критическая ошибка при выполнении тестов:', error);
        console.error(error.stack);
        process.exit(1);
    }
}

// Запуск тестов
runAllTests();

