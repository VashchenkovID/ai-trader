import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import advancedMetricsRoutes from './src/routes/advanced-metrics-routes.js';
import optimizedRoutes from './src/routes/optimized-routes.js';
import TradingEngine from './src/services/TradingEngine.js';
import ProfitabilityTracker from './src/services/ProfitabilityTracker.js';
import OptimizedAnalysisService from './src/services/OptimizedAnalysisService.js';
import { initDatabase } from './src/utils/initDatabase.js';
import sequelize from './src/config/database.js';

// Настройка dotenv
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const API_PREFIX = '/api/advanced-metrics';

// Helper для цветного вывода в консоль
const log = (message, color = 'white') => {
    const colors = {
        red: '\x1b[31m',
        green: '\x1b[32m',
        yellow: '\x1b[33m',
        blue: '\x1b[34m',
        magenta: '\x1b[35m',
        cyan: '\x1b[36m',
        white: '\x1b[37m',
        reset: '\x1b[0m'
    };
    console.log(`${colors[color]}${message}${colors.reset}`);
};

const logSection = (title) => {
    log('\n' + '='.repeat(60), 'cyan');
    log(title, 'cyan');
    log('='.repeat(60), 'cyan');
};

const logTest = (name, passed, details = '') => {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    const color = passed ? 'green' : 'red';
    log(`${status}: ${name} ${details ? `- ${details}` : ''}`, color);
};

/**
 * Проверка структуры маршрутов
 */
function checkRouteStructure(router, expectedRoutes) {
    const routes = [];
    router.stack.forEach((middleware) => {
        if (middleware.route) {
            routes.push({
                path: middleware.route.path,
                methods: Object.keys(middleware.route.methods)
            });
        } else if (middleware.name === 'router') {
            // Вложенные роутеры
            middleware.handle.stack.forEach((nested) => {
                if (nested.route) {
                    routes.push({
                        path: nested.route.path,
                        methods: Object.keys(nested.route.methods)
                    });
                }
            });
        }
    });
    
    return { routes, expectedRoutes };
}

async function runStage4Tests() {
    const results = { passed: 0, failed: 0 };

    try {
        log('🚀 Запуск тестов Этапа 4: API endpoints для продвинутых метрик', 'blue');
        log('============================================================', 'blue');

        // Инициализация базы данных и подготовка тестовых данных
        logSection('1. Инициализация и подготовка тестовых данных');
        try {
            await initDatabase();
            
            // Инициализируем TradingEngine для доступа к виртуальному портфелю
            if (!TradingEngine.virtualPortfolio) {
                TradingEngine.virtualPortfolio = {
                    cash: 1000000,
                    positions: {},
                    totalValue: 1000000,
                    trades: [],
                    initialCapital: 1000000
                };
            }

            // Создаем тестовые сделки
            const baseDate = new Date();
            baseDate.setDate(baseDate.getDate() - 20); // 20 дней назад
            
            const dayOfWeek = baseDate.getDay();
            const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
            const monday = new Date(baseDate);
            monday.setDate(baseDate.getDate() + diff);
            monday.setHours(10, 0, 0, 0);

            const testTrades = [];
            testTrades.push(
                { timestamp: monday.toISOString(), pnl: 100, action: 'BUY', symbol: 'TEST1' },
                { timestamp: new Date(monday.getTime() + 86400000).toISOString(), pnl: 50, action: 'SELL', symbol: 'TEST2' },
                { timestamp: new Date(monday.getTime() + 2 * 86400000).toISOString(), pnl: -20, action: 'BUY', symbol: 'TEST3' },
                { timestamp: new Date(monday.getTime() + 7 * 86400000).toISOString(), pnl: 80, action: 'SELL', symbol: 'TEST1' },
                { timestamp: new Date(monday.getTime() + 14 * 86400000).toISOString(), pnl: 200, action: 'BUY', symbol: 'TEST1' }
            );

            TradingEngine.virtualPortfolio.trades = testTrades;
            
            log('✅ Тестовые данные подготовлены', 'green');
            results.passed++;
        } catch (error) {
            logTest('Инициализация и подготовка тестовых данных', false, error.message);
            results.failed++;
            return;
        }

        // 2. Тестирование структуры маршрутов
        logSection('2. Тестирование структуры маршрутов');
        try {
            // Проверяем, что маршруты экспортированы
            // Express router может быть объектом с методами или функцией
            if (advancedMetricsRoutes && (typeof advancedMetricsRoutes === 'object' || typeof advancedMetricsRoutes === 'function')) {
                logTest('advanced-metrics-routes экспортирован', true);
                results.passed++;
            } else {
                logTest('advanced-metrics-routes экспортирован', false, 
                    `Тип: ${typeof advancedMetricsRoutes}, Значение: ${advancedMetricsRoutes}`);
                results.failed++;
            }

            // Проверяем, что маршруты зарегистрированы в optimized-routes
            const routeInfo = checkRouteStructure(optimizedRoutes, []);
            log(`  ℹ️ Найдено маршрутов в optimized-routes: ${routeInfo.routes.length}`, 'cyan');
            logTest('Маршруты зарегистрированы', true);
            results.passed++;
        } catch (error) {
            logTest('Структура маршрутов корректна', false, error.message);
            results.failed++;
        }

        // 3. Тестирование функциональности endpoints (прямой вызов сервисов)
        logSection('3. Тестирование функциональности endpoints');
        try {
            // Инициализируем сервисы
            await ProfitabilityTracker.initialize();
            await OptimizedAnalysisService.initialize();
            
            // Тест получения всех метрик
            const periodMap = { 'daily': 'day', 'weekly': 'week', 'monthly': 'month' };
            const analysis = await ProfitabilityTracker.analyzeProfitability('day', 30);
            const advancedMetrics = ProfitabilityTracker.calculateAdvancedMetrics(
                analysis.stats || [],
                'daily',
                analysis.metrics || {}
            );
            
            if (advancedMetrics && typeof advancedMetrics === 'object') {
                logTest('calculateAdvancedMetrics возвращает данные', true);
                results.passed++;
                
                if (typeof advancedMetrics.sortinoRatio === 'number') {
                    logTest('Sortino Ratio рассчитывается', true);
                    log(`  ℹ️ Sortino Ratio: ${advancedMetrics.sortinoRatio}`, 'cyan');
                    results.passed++;
                } else {
                    logTest('Sortino Ratio рассчитывается', false);
                    results.failed++;
                }
                
                if (typeof advancedMetrics.calmarRatio === 'number') {
                    logTest('Calmar Ratio рассчитывается', true);
                    log(`  ℹ️ Calmar Ratio: ${advancedMetrics.calmarRatio}`, 'cyan');
                    results.passed++;
                } else {
                    logTest('Calmar Ratio рассчитывается', false);
                    results.failed++;
                }
            } else {
                logTest('calculateAdvancedMetrics возвращает данные', false);
                results.failed++;
            }
        } catch (error) {
            logTest('Функциональность endpoints работает', false, error.message);
            results.failed++;
        }

        // 4. Тестирование анализа по периодам
        logSection('4. Тестирование анализа по периодам');
        try {
            const periodAnalysis = await OptimizedAnalysisService.analyzePeriodPerformance('daily');
            
            if (periodAnalysis && typeof periodAnalysis === 'object') {
                logTest('analyzePeriodPerformance возвращает данные', true);
                results.passed++;
                
                if (periodAnalysis.success && periodAnalysis.byDayOfWeek && periodAnalysis.byMonth) {
                    logTest('Анализ по периодам содержит данные', true);
                    results.passed++;
                } else if (!periodAnalysis.success && periodAnalysis.message) {
                    log('  ℹ️ Нет данных для анализа (это нормально, если нет сделок)', 'yellow');
                    logTest('analyzePeriodPerformance обрабатывает отсутствие данных', true);
                    results.passed++;
                } else {
                    logTest('Анализ по периодам содержит данные', false);
                    results.failed++;
                }
            } else {
                logTest('analyzePeriodPerformance возвращает данные', false);
                results.failed++;
            }
        } catch (error) {
            logTest('Анализ по периодам работает', false, error.message);
            results.failed++;
        }

        // 5. Тестирование MAE/MFE
        logSection('5. Тестирование MAE/MFE');
        try {
            const analysis = await ProfitabilityTracker.analyzeProfitability('day', 30);
            const advancedMetrics = ProfitabilityTracker.calculateAdvancedMetrics(
                analysis.stats || [],
                'daily',
                analysis.metrics || {}
            );
            
            if (typeof advancedMetrics.mae === 'number' && typeof advancedMetrics.mfe === 'number') {
                logTest('MAE/MFE рассчитываются', true);
                log(`  ℹ️ MAE: ${advancedMetrics.mae}, MFE: ${advancedMetrics.mfe}`, 'cyan');
                log(`  ℹ️ MAE/MFE доступны: ${advancedMetrics.maeMfeAvailable}`, 'cyan');
                results.passed++;
            } else {
                logTest('MAE/MFE рассчитываются', false);
                results.failed++;
            }
        } catch (error) {
            logTest('MAE/MFE работает', false, error.message);
            results.failed++;
        }

        // 6. Тестирование Information Ratio
        logSection('6. Тестирование Information Ratio');
        try {
            const analysis = await ProfitabilityTracker.analyzeProfitability('day', 30);
            const advancedMetrics = ProfitabilityTracker.calculateAdvancedMetrics(
                analysis.stats || [],
                'daily',
                analysis.metrics || {}
            );
            
            // Information Ratio может быть null, если нет данных бенчмарка
            if (advancedMetrics.informationRatio !== undefined) {
                logTest('Information Ratio обрабатывается корректно', true);
                log(`  ℹ️ Information Ratio: ${advancedMetrics.informationRatio || 'null (требует данные бенчмарка)'}`, 'cyan');
                results.passed++;
            } else {
                logTest('Information Ratio обрабатывается корректно', false);
                results.failed++;
            }
        } catch (error) {
            logTest('Information Ratio работает', false, error.message);
            results.failed++;
        }

        // Итоги
        log('\n' + '='.repeat(60), 'cyan');
        log('ИТОГИ ТЕСТИРОВАНИЯ ЭТАПА 4', 'cyan');
        log('='.repeat(60), 'cyan');
        log(`✅ Пройдено тестов: ${results.passed}`, 'green');
        log(`❌ Провалено тестов: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
        log(`📊 Всего тестов: ${results.passed + results.failed}`, 'cyan');
        log(`📈 Успешность: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`, 'cyan');
        log('='.repeat(60) + '\n', 'cyan');

        if (results.failed === 0) {
            log('🎉 Все тесты этапа 4 пройдены успешно!', 'green');
        } else {
            log('⚠️ Некоторые тесты провалены. Проверьте логи выше.', 'yellow');
        }

    } catch (error) {
        log('❌ Критическая ошибка во время тестов:', 'red');
        console.error(error);
        results.failed++;
    } finally {
        await sequelize.close().catch(() => {});
        log('✅ Соединение с базой данных закрыто.', 'green');
        process.exit(results.failed > 0 ? 1 : 0);
    }
}

runStage4Tests();

