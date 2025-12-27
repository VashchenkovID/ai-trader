import sequelize from './src/config/database.js';
import NeuralNetworkService from './src/services/NeuralNetworkService.js';
import StrategyAllocationService from './src/services/StrategyAllocationService.js';
import TradingRequest from './src/models/TradingRequest.js';
import TradingStrategy from './src/models/TradingStrategy.js';
import PortfolioItem from './src/models/PortfolioItem.js';
import VirtualPortfolio from './src/models/VirtualPortfolio.js';
import { Op } from 'sequelize';

/**
 * Тест оптимизаций БД
 * Проверяет производительность и количество запросов после оптимизаций
 */

// Включаем логирование запросов для подсчета
let queryCount = 0;
const originalLogging = sequelize.options.logging;

// Перехватываем логирование Sequelize для подсчета запросов
sequelize.options.logging = (sql, timing) => {
    queryCount++;
    if (originalLogging) {
        originalLogging(sql, timing);
    }
};

function resetQueryCount() {
    queryCount = 0;
}

function getQueryCount() {
    return queryCount;
}

function restoreLogging() {
    sequelize.options.logging = originalLogging;
}

async function testNeuralNetworkServiceOptimization() {
    console.log('\n🧪 Тест 1: NeuralNetworkService.analyzePortfolio()');
    console.log('=' .repeat(60));
    
    try {
        // Получаем реальные данные портфеля
        const virtualPortfolio = await VirtualPortfolio.findOne({
            order: [['updatedAt', 'DESC']]
        });
        
        if (!virtualPortfolio || !virtualPortfolio.positions || Object.keys(virtualPortfolio.positions).length === 0) {
            console.log('⚠️  Виртуальный портфель пуст, создаем тестовые данные...');
            
            // Получаем несколько инструментов для теста
            const testInstruments = await PortfolioItem.findAll({
                limit: 5,
                attributes: ['figi', 'ticker', 'name', 'quantity', 'averagePrice']
            });
            
            if (testInstruments.length === 0) {
                // Пытаемся получить инструменты из CachedInstrument
                const CachedInstrument = (await import('./src/models/CachedInstrument.js')).default;
                const cachedInstruments = await CachedInstrument.findAll({
                    where: { isActive: true },
                    limit: 3,
                    attributes: ['figi', 'ticker', 'name']
                });
                
                if (cachedInstruments.length === 0) {
                    console.log('❌ Нет данных для тестирования. Добавьте позиции в портфель или инструменты в кеш.');
                    return null;
                }
                
                // Создаем минимальные тестовые данные
                const portfolioItems = cachedInstruments.map(item => ({
                    figi: item.figi,
                    ticker: item.ticker,
                    name: item.name,
                    quantity: 1, // Минимальное количество для теста
                    averagePrice: 100 // Тестовая цена
                }));
                
                console.log(`📊 Тестируем с ${portfolioItems.length} тестовыми позициями из кеша:`);
                portfolioItems.forEach(item => {
                    console.log(`   - ${item.ticker} (${item.figi}): ${item.quantity} шт.`);
                });
                
                resetQueryCount();
                const startTime = Date.now();
                
                // Вызываем оптимизированный метод
                const result = await NeuralNetworkService.analyzePortfolio(portfolioItems);
                
                const endTime = Date.now();
                const duration = endTime - startTime;
                const queries = getQueryCount();
                
                console.log(`\n✅ Результаты:`);
                console.log(`   ⏱️  Время выполнения: ${duration}ms`);
                console.log(`   📊 Количество запросов к БД: ${queries}`);
                console.log(`   📈 Рекомендаций на продажу: ${result.sellRecommendations?.length || 0}`);
                console.log(`   💰 Стоимость портфеля: ${result.portfolioValue?.toFixed(2) || 0} руб.`);
                
                // Проверяем эффективность (запросов на позицию)
                const queriesPerItem = (queries / portfolioItems.length).toFixed(2);
                console.log(`   📉 Запросов на позицию: ${queriesPerItem} (оптимально < 1)`);
                
                return {
                    duration,
                    queries,
                    itemsCount: portfolioItems.length,
                    recommendationsCount: result.sellRecommendations?.length || 0,
                    queriesPerItem: parseFloat(queriesPerItem)
                };
            }
            
            // Формируем тестовые данные портфеля
            const portfolioItems = testInstruments.map(item => ({
                figi: item.figi,
                ticker: item.ticker,
                name: item.name,
                quantity: parseFloat(item.quantity || 1),
                averagePrice: parseFloat(item.averagePrice || 0)
            }));
            
            console.log(`📊 Тестируем с ${portfolioItems.length} позициями:`);
            portfolioItems.forEach(item => {
                console.log(`   - ${item.ticker} (${item.figi}): ${item.quantity} шт.`);
            });
            
            resetQueryCount();
            const startTime = Date.now();
            
            // Вызываем оптимизированный метод
            const result = await NeuralNetworkService.analyzePortfolio(portfolioItems);
            
            const endTime = Date.now();
            const duration = endTime - startTime;
            const queries = getQueryCount();
            
            console.log(`\n✅ Результаты:`);
            console.log(`   ⏱️  Время выполнения: ${duration}ms`);
            console.log(`   📊 Количество запросов к БД: ${queries}`);
            console.log(`   📈 Рекомендаций на продажу: ${result.sellRecommendations?.length || 0}`);
            console.log(`   💰 Стоимость портфеля: ${result.portfolioValue?.toFixed(2) || 0} руб.`);
            
            // Проверяем, что данные загружены правильно
            if (result.sellRecommendations && result.sellRecommendations.length > 0) {
                const hasStrategyInfo = result.sellRecommendations.some(rec => rec.strategy !== null);
                console.log(`   🎯 Рекомендации со стратегиями: ${result.sellRecommendations.filter(rec => rec.strategy !== null).length}`);
            }
            
            return {
                duration,
                queries,
                itemsCount: portfolioItems.length,
                recommendationsCount: result.sellRecommendations?.length || 0
            };
        } else {
            // Используем реальные данные портфеля
            const positions = virtualPortfolio.positions;
            const portfolioItems = Object.keys(positions).map(figi => ({
                figi,
                ticker: positions[figi].ticker || figi,
                name: positions[figi].name || figi,
                quantity: parseFloat(positions[figi].quantity || 0),
                averagePrice: parseFloat(positions[figi].averagePrice || 0)
            })).filter(item => item.quantity > 0);
            
            if (portfolioItems.length === 0) {
                console.log('❌ Портфель пуст');
                return null;
            }
            
            console.log(`📊 Тестируем с ${portfolioItems.length} позициями из реального портфеля`);
            
            resetQueryCount();
            const startTime = Date.now();
            
            const result = await NeuralNetworkService.analyzePortfolio(portfolioItems);
            
            const endTime = Date.now();
            const duration = endTime - startTime;
            const queries = getQueryCount();
            
            console.log(`\n✅ Результаты:`);
            console.log(`   ⏱️  Время выполнения: ${duration}ms`);
            console.log(`   📊 Количество запросов к БД: ${queries}`);
            console.log(`   📈 Рекомендаций на продажу: ${result.sellRecommendations?.length || 0}`);
            console.log(`   💰 Стоимость портфеля: ${result.portfolioValue?.toFixed(2) || 0} руб.`);
            
            // Проверяем эффективность (запросов на позицию)
            const queriesPerItem = (queries / portfolioItems.length).toFixed(2);
            console.log(`   📉 Запросов на позицию: ${queriesPerItem} (оптимально < 1)`);
            
            return {
                duration,
                queries,
                itemsCount: portfolioItems.length,
                recommendationsCount: result.sellRecommendations?.length || 0,
                queriesPerItem: parseFloat(queriesPerItem)
            };
        }
    } catch (error) {
        console.error('❌ Ошибка при тестировании NeuralNetworkService:', error);
        console.error(error.stack);
        return null;
    }
}

async function testStrategyAllocationServiceOptimization() {
    console.log('\n🧪 Тест 2: StrategyAllocationService.getAllStrategiesWithAllocations()');
    console.log('=' .repeat(60));
    
    try {
        // Получаем количество активных стратегий
        const strategiesCount = await TradingStrategy.count({
            where: { isActive: true }
        });
        
        if (strategiesCount === 0) {
            console.log('⚠️  Нет активных стратегий для тестирования');
            return null;
        }
        
        console.log(`📊 Тестируем с ${strategiesCount} активными стратегиями`);
        
        resetQueryCount();
        const startTime = Date.now();
        
        // Вызываем оптимизированный метод
        const result = await StrategyAllocationService.getAllStrategiesWithAllocations();
        
        const endTime = Date.now();
        const duration = endTime - startTime;
        const queries = getQueryCount();
        
        console.log(`\n✅ Результаты:`);
        console.log(`   ⏱️  Время выполнения: ${duration}ms`);
        console.log(`   📊 Количество запросов к БД: ${queries}`);
        console.log(`   📈 Стратегий обработано: ${result.length}`);
        
        // Проверяем, что данные загружены правильно
        if (result.length > 0) {
            const withAllocations = result.filter(s => s.allocation).length;
            const withPositions = result.filter(s => s.allocation?.positionsCount > 0).length;
            console.log(`   💼 Стратегий с аллокациями: ${withAllocations}`);
            console.log(`   📊 Стратегий с позициями: ${withPositions}`);
            
            // Показываем пример данных
            const example = result[0];
            if (example && example.allocation) {
                console.log(`\n   📋 Пример данных (${example.name}):`);
                console.log(`      - Выделено: ${example.allocation.allocatedAmount} руб.`);
                console.log(`      - Использовано: ${example.allocation.usedAmount} руб.`);
                console.log(`      - Доступно: ${example.allocation.availableAmount} руб.`);
                console.log(`      - Позиций: ${example.allocation.positionsCount}`);
            }
        }
        
        // Проверяем эффективность (запросов на стратегию)
        const queriesPerStrategy = (queries / strategiesCount).toFixed(2);
        console.log(`   📉 Запросов на стратегию: ${queriesPerStrategy} (оптимально < 1)`);
        
        return {
            duration,
            queries,
            strategiesCount,
            queriesPerStrategy: parseFloat(queriesPerStrategy)
        };
    } catch (error) {
        console.error('❌ Ошибка при тестировании StrategyAllocationService:', error);
        console.error(error.stack);
        return null;
    }
}

async function testDatabaseIndexes() {
    console.log('\n🧪 Тест 3: Проверка индексов БД');
    console.log('=' .repeat(60));
    
    try {
        const DatabaseOptimization = (await import('./src/utils/databaseOptimization.js')).default;
        
        // Получаем полный отчет об оптимизации
        const report = await DatabaseOptimization.generateOptimizationReport();
        
        console.log(`\n✅ Результаты анализа индексов:`);
        console.log(`   📊 Всего таблиц: ${report.summary.totalTables}`);
        console.log(`   🔍 Текущих индексов: ${report.summary.totalCurrentIndexes}`);
        console.log(`   📋 Рекомендуемых индексов: ${report.summary.totalRecommendedIndexes}`);
        console.log(`   ⚠️  Недостающих индексов: ${report.summary.missingIndexesCount}`);
        
        if (report.summary.missingIndexesCount > 0) {
            console.log(`\n   📝 Недостающие индексы:`);
            for (const [tableName, indexes] of Object.entries(report.missingIndexes)) {
                console.log(`\n   ${tableName}:`);
                indexes.forEach(idx => {
                    console.log(`      - ${idx.name} (${idx.fields.join(', ')})`);
                    console.log(`        ${idx.description}`);
                });
            }
        } else {
            console.log(`\n   ✅ Все рекомендуемые индексы созданы!`);
        }
        
        return {
            totalTables: report.summary.totalTables,
            currentIndexes: report.summary.totalCurrentIndexes,
            recommendedIndexes: report.summary.totalRecommendedIndexes,
            missingIndexes: report.summary.missingIndexesCount
        };
    } catch (error) {
        console.error('❌ Ошибка при проверке индексов:', error);
        return null;
    }
}

async function runAllTests() {
    console.log('🚀 ТЕСТИРОВАНИЕ ОПТИМИЗАЦИЙ БД');
    console.log('=' .repeat(60));
    console.log('Проверяем производительность и количество запросов после оптимизаций\n');
    
    try {
        // Подключаемся к БД
        await sequelize.authenticate();
        console.log('✅ Подключение к БД успешно\n');
        
        // Инициализируем сервисы
        if (!NeuralNetworkService.isInitialized) {
            console.log('🔄 Инициализация NeuralNetworkService...');
            await NeuralNetworkService.initialize();
            console.log('✅ NeuralNetworkService инициализирован\n');
        }
        
        if (!StrategyAllocationService.isInitialized) {
            console.log('🔄 Инициализация StrategyAllocationService...');
            await StrategyAllocationService.initialize();
            console.log('✅ StrategyAllocationService инициализирован\n');
        }
        
        const results = {};
        
        // Тест 1: NeuralNetworkService
        results.neuralNetwork = await testNeuralNetworkServiceOptimization();
        
        // Тест 2: StrategyAllocationService
        results.strategyAllocation = await testStrategyAllocationServiceOptimization();
        
        // Тест 3: Индексы
        results.indexes = await testDatabaseIndexes();
        
        // Итоговый отчет
        console.log('\n' + '='.repeat(60));
        console.log('📊 ИТОГОВЫЙ ОТЧЕТ');
        console.log('='.repeat(60));
        
        if (results.neuralNetwork) {
            console.log(`\n✅ NeuralNetworkService:`);
            console.log(`   ⏱️  Время: ${results.neuralNetwork.duration}ms`);
            console.log(`   📊 Запросов: ${results.neuralNetwork.queries}`);
            console.log(`   📉 Запросов на позицию: ${results.neuralNetwork.queriesPerItem?.toFixed(2) || 'N/A'}`);
            if (results.neuralNetwork.queriesPerItem && results.neuralNetwork.queriesPerItem < 1) {
                console.log(`   ✅ Оптимизация эффективна!`);
            }
        }
        
        if (results.strategyAllocation) {
            console.log(`\n✅ StrategyAllocationService:`);
            console.log(`   ⏱️  Время: ${results.strategyAllocation.duration}ms`);
            console.log(`   📊 Запросов: ${results.strategyAllocation.queries}`);
            console.log(`   📉 Запросов на стратегию: ${results.strategyAllocation.queriesPerStrategy?.toFixed(2) || 'N/A'}`);
            if (results.strategyAllocation.queriesPerStrategy && results.strategyAllocation.queriesPerStrategy < 1) {
                console.log(`   ✅ Оптимизация эффективна!`);
            }
        }
        
        if (results.indexes) {
            console.log(`\n✅ Индексы БД:`);
            console.log(`   📊 Всего таблиц: ${results.indexes.totalTables}`);
            console.log(`   🔍 Текущих индексов: ${results.indexes.currentIndexes}`);
            console.log(`   📋 Рекомендуемых: ${results.indexes.recommendedIndexes}`);
            console.log(`   ⚠️  Недостающих: ${results.indexes.missingIndexes}`);
            if (results.indexes.missingIndexes === 0) {
                console.log(`   ✅ Все индексы созданы!`);
            }
        }
        
        console.log('\n✅ Тестирование завершено!');
        
    } catch (error) {
        console.error('❌ Критическая ошибка:', error);
        console.error(error.stack);
    } finally {
        restoreLogging();
        await sequelize.close();
        process.exit(0);
    }
}

// Запускаем тесты
runAllTests();

