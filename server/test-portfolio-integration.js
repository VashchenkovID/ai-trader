import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import CapitalAllocationStrategy from './src/services/CapitalAllocationStrategy.js';
import PortfolioOptimizer from './src/services/PortfolioOptimizer.js';
import CorrelationService from './src/services/CorrelationService.js';
import CacheService from './src/services/CacheService.js';
import CachedInstrument from './src/models/CachedInstrument.js';
import sequelize from './src/config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
const envPaths = [
    join(__dirname, '.env'),
    join(__dirname, '..', '.env'),
    join(process.cwd(), '.env'),
    join(process.cwd(), 'server', '.env')
];

let envLoaded = false;
for (const envPath of envPaths) {
    const result = dotenv.config({ path: envPath });
    if (!result.error) {
        envLoaded = true;
        console.log(`✅ Loaded .env from: ${envPath}`);
        break;
    }
}

if (!envLoaded) {
    dotenv.config();
    console.log('⚠️ .env file not found, using system environment variables');
}

// Вспомогательные функции для вывода
function log(message, color = 'white') {
    const colors = {
        green: '\x1b[32m',
        red: '\x1b[31m',
        yellow: '\x1b[33m',
        cyan: '\x1b[36m',
        white: '\x1b[37m',
        reset: '\x1b[0m'
    };
    console.log(`${colors[color] || ''}${message}${colors.reset}`);
}

function logSection(title) {
    console.log('\n' + '='.repeat(60));
    log(title, 'cyan');
    console.log('='.repeat(60) + '\n');
}

function logTest(name, passed, details = '') {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    const color = passed ? 'green' : 'red';
    log(`${status}: ${name}`, color);
    if (details) {
        console.log(`   ${details}`);
    }
}

async function testIntegration() {
    logSection('ТЕСТИРОВАНИЕ ИНТЕГРАЦИИ PORTFOLIO OPTIMIZER С CAPITAL ALLOCATION STRATEGY');
    
    const results = {
        passed: 0,
        failed: 0,
        tests: []
    };

    try {
        // 1. Инициализация БД и сервисов
        logSection('1. Инициализация БД и сервисов');
        try {
            await sequelize.authenticate();
            log('✅ База данных подключена', 'green');
        } catch (dbError) {
            log('❌ Ошибка подключения к БД: ' + dbError.message, 'red');
            throw dbError;
        }

        // Settings не требует явной инициализации
        await CacheService.initialize();
        await CorrelationService.initialize();
        await PortfolioOptimizer.initialize();
        await CapitalAllocationStrategy.initialize();
        log('✅ Все сервисы инициализированы', 'green');
        results.passed++;
        results.tests.push({ name: 'Инициализация сервисов', passed: true });

        // 2. Проверка наличия стратегии optimized
        logSection('2. Проверка стратегии optimized');
        const strategies = CapitalAllocationStrategy.strategies;
        const hasOptimizedStrategy = strategies && strategies.optimized;
        
        if (hasOptimizedStrategy) {
            log('✅ Стратегия optimized найдена', 'green');
            log(`   Название: ${strategies.optimized.name}`);
            log(`   Метод оптимизации: ${strategies.optimized.optimizationMethod}`);
            log(`   useOptimizer: ${strategies.optimized.useOptimizer}`);
            results.passed++;
            results.tests.push({ name: 'Стратегия optimized существует', passed: true });
        } else {
            log('❌ Стратегия optimized не найдена', 'red');
            results.failed++;
            results.tests.push({ name: 'Стратегия optimized существует', passed: false });
        }

        // 3. Получение тестовых инструментов
        logSection('3. Получение тестовых инструментов');
        const instruments = await CachedInstrument.findAll({
            where: {
                instrumentType: 'share',
                currency: 'rub'
            },
            limit: 5,
            attributes: ['figi', 'ticker', 'name', 'lastPrice']
        });

        if (instruments.length < 2) {
            log('⚠️ Недостаточно инструментов для тестирования (нужно минимум 2)', 'yellow');
            log('   Пропускаем тесты оптимизации');
            results.tests.push({ name: 'Достаточно инструментов', passed: false });
        } else {
            log(`✅ Найдено ${instruments.length} инструментов: ${instruments.map(i => i.ticker).join(', ')}`, 'green');
            results.passed++;
            results.tests.push({ name: 'Достаточно инструментов', passed: true });

            // 4. Тест оптимизации с методом mean_variance
            logSection('4. Тест оптимизации (Mean-Variance)');
            try {
                // Устанавливаем стратегию optimized с методом mean_variance
                CapitalAllocationStrategy.currentStrategy = 'optimized';
                CapitalAllocationStrategy.strategies.optimized.optimizationMethod = 'mean_variance';

                // Создаем mock анализ портфеля
                const mockAnalysis = {
                    totalValue: 1000000, // 1 млн рублей
                    positions: [],
                    risks: {}
                };

                // Mock метод getAvailableInstruments для CapitalAllocationStrategy
                const originalGetAvailableInstruments = CapitalAllocationStrategy.getAvailableInstruments;
                CapitalAllocationStrategy.getAvailableInstruments = async function() {
                    return instruments.map(inst => ({
                        figi: inst.figi,
                        symbol: inst.ticker,
                        ticker: inst.ticker,
                        name: inst.name,
                        price: inst.lastPrice || 100,
                        sector: 'Technology'
                    }));
                };

                const strategyConfig = CapitalAllocationStrategy.strategies.optimized;
                const allocation = await CapitalAllocationStrategy.calculateOptimizedAllocation(
                    mockAnalysis,
                    strategyConfig
                );

                if (allocation && Array.isArray(allocation) && allocation.length > 0) {
                    log('✅ Оптимизация Mean-Variance выполнена успешно', 'green');
                    log(`   Найдено ${allocation.length} позиций:`);
                    allocation.slice(0, 3).forEach(pos => {
                        log(`   - ${pos.symbol}: ${(pos.weight * 100).toFixed(2)}% (${pos.value.toFixed(0)} руб)`);
                    });
                    if (allocation[0].sharpeRatio !== undefined) {
                        log(`   Sharpe Ratio портфеля: ${allocation[0].sharpeRatio.toFixed(3)}`);
                    }
                    results.passed++;
                    results.tests.push({ name: 'Оптимизация Mean-Variance', passed: true });
                } else {
                    log('❌ Оптимизация не вернула результаты', 'red');
                    results.failed++;
                    results.tests.push({ name: 'Оптимизация Mean-Variance', passed: false });
                }

                // Восстанавливаем оригинальный метод
                CapitalAllocationStrategy.getAvailableInstruments = originalGetAvailableInstruments;

            } catch (error) {
                log(`❌ Ошибка теста Mean-Variance: ${error.message}`, 'red');
                console.error(error);
                results.failed++;
                results.tests.push({ name: 'Оптимизация Mean-Variance', passed: false });
            }

            // 5. Тест fallback на стандартный метод
            logSection('5. Тест fallback на стандартный метод');
            try {
                // Создаем стратегию с useOptimizer = false
                const fallbackStrategy = {
                    ...CapitalAllocationStrategy.strategies.balanced,
                    useOptimizer: false
                };

                const mockAnalysis = {
                    totalValue: 1000000,
                    positions: [],
                    risks: {}
                };

                // Mock метод getAvailableInstruments
                const originalGetAvailableInstruments = CapitalAllocationStrategy.getAvailableInstruments;
                CapitalAllocationStrategy.getAvailableInstruments = async function() {
                    return instruments.map(inst => ({
                        figi: inst.figi,
                        symbol: inst.ticker,
                        ticker: inst.ticker,
                        name: inst.name,
                        price: inst.lastPrice || 100,
                        sector: 'Technology',
                        expectedReturn: 0.1,
                        risk: 0.2
                    }));
                };

                const allocation = await CapitalAllocationStrategy.calculateTargetAllocation(
                    mockAnalysis,
                    fallbackStrategy
                );

                if (allocation && Array.isArray(allocation)) {
                    log('✅ Fallback на стандартный метод работает', 'green');
                    log(`   Найдено ${allocation.length} позиций`);
                    results.passed++;
                    results.tests.push({ name: 'Fallback на стандартный метод', passed: true });
                } else {
                    log('❌ Fallback не вернул результаты', 'red');
                    results.failed++;
                    results.tests.push({ name: 'Fallback на стандартный метод', passed: false });
                }

                // Восстанавливаем оригинальный метод
                CapitalAllocationStrategy.getAvailableInstruments = originalGetAvailableInstruments;

            } catch (error) {
                log(`❌ Ошибка теста fallback: ${error.message}`, 'red');
                console.error(error);
                results.failed++;
                results.tests.push({ name: 'Fallback на стандартный метод', passed: false });
            }
        }

        // 6. Итоговая статистика
        logSection('ИТОГОВАЯ СТАТИСТИКА');
        log(`Всего тестов: ${results.tests.length}`, 'cyan');
        log(`Пройдено: ${results.passed}`, 'green');
        log(`Провалено: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
        
        console.log('\nДетали тестов:');
        results.tests.forEach(test => {
            const status = test.passed ? '✅' : '❌';
            log(`${status} ${test.name}`, test.passed ? 'green' : 'red');
        });

        if (results.failed === 0) {
            log('\n🎉 Все тесты интеграции пройдены успешно!', 'green');
        } else {
            log(`\n⚠️ ${results.failed} тест(ов) провалено`, 'yellow');
        }

    } catch (error) {
        log(`\n❌ Критическая ошибка: ${error.message}`, 'red');
        console.error(error);
        process.exit(1);
    } finally {
        await sequelize.close();
        log('\n✅ Соединение с БД закрыто', 'green');
        process.exit(results.failed > 0 ? 1 : 0);
    }
}

testIntegration();

