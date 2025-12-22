import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import OptimizedAnalysisService from './src/services/OptimizedAnalysisService.js';
import TradingEngine from './src/services/TradingEngine.js';
import { initDatabase } from './src/utils/initDatabase.js';
import sequelize from './src/config/database.js';

// Настройка dotenv
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

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

async function runStage3Tests() {
    const results = { passed: 0, failed: 0 };

    try {
        log('🚀 Запуск тестов Этапа 3: Расширение OptimizedAnalysisService', 'blue');
        log('============================================================', 'blue');

        // Инициализация базы данных и сервисов
        logSection('1. Инициализация базы данных и сервисов');
        try {
            await initDatabase();
            await OptimizedAnalysisService.initialize();
            
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
            
            log('✅ База данных и сервисы инициализированы', 'green');
            results.passed++;
        } catch (error) {
            logTest('Инициализация базы данных и сервисов', false, error.message);
            results.failed++;
            return;
        }

        // 2. Подготовка тестовых данных (сделки)
        logSection('2. Подготовка тестовых сделок');
        try {
            const baseDate = new Date();
            baseDate.setDate(baseDate.getDate() - 20); // 20 дней назад (в пределах 30 дней)
            
            // Находим ближайший понедельник
            const dayOfWeek = baseDate.getDay();
            const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
            const monday = new Date(baseDate);
            monday.setDate(baseDate.getDate() + diff);
            monday.setHours(10, 0, 0, 0);

            // Создаем сделки в разные дни недели и месяцы
            const testTrades = [];
            
            // Понедельники (3 сделки)
            testTrades.push(
                { timestamp: monday.toISOString(), pnl: 100, action: 'BUY', symbol: 'TEST1' },
                { timestamp: new Date(monday.getTime() + 7 * 86400000).toISOString(), pnl: 80, action: 'SELL', symbol: 'TEST1' },
                { timestamp: new Date(monday.getTime() + 14 * 86400000).toISOString(), pnl: 200, action: 'BUY', symbol: 'TEST1' }
            );
            
            // Вторники (2 сделки)
            testTrades.push(
                { timestamp: new Date(monday.getTime() + 86400000).toISOString(), pnl: 50, action: 'SELL', symbol: 'TEST2' },
                { timestamp: new Date(monday.getTime() + 8 * 86400000).toISOString(), pnl: -20, action: 'BUY', symbol: 'TEST2' }
            );
            
            // Среда (1 сделка)
            testTrades.push(
                { timestamp: new Date(monday.getTime() + 2 * 86400000).toISOString(), pnl: -30, action: 'SELL', symbol: 'TEST3' }
            );

            TradingEngine.virtualPortfolio.trades = testTrades;
            
            log(`✅ Создано ${testTrades.length} тестовых сделок`, 'green');
            results.passed++;
        } catch (error) {
            logTest('Подготовка тестовых сделок', false, error.message);
            results.failed++;
        }

        // 3. Тестирование analyzePeriodPerformance() без параметров
        logSection('3. Тестирование analyzePeriodPerformance() без параметров');
        try {
            const analysis = await OptimizedAnalysisService.analyzePeriodPerformance();
            
            if (analysis.success && analysis.byDayOfWeek && analysis.byMonth) {
                logTest('analyzePeriodPerformance() возвращает корректные данные', true);
                results.passed++;
                
                if (analysis.totalTrades > 0) {
                    logTest('totalTrades > 0', true);
                    results.passed++;
                } else {
                    logTest('totalTrades > 0', false, `Получено: ${analysis.totalTrades}`);
                    results.failed++;
                }
            } else {
                logTest('analyzePeriodPerformance() возвращает корректные данные', false, 
                    `success: ${analysis.success}, byDayOfWeek: ${!!analysis.byDayOfWeek}, byMonth: ${!!analysis.byMonth}`);
                results.failed++;
            }
        } catch (error) {
            logTest('analyzePeriodPerformance() работает', false, error.message);
            results.failed++;
        }

        // 4. Тестирование анализа по дням недели
        logSection('4. Тестирование анализа по дням недели');
        try {
            const analysis = await OptimizedAnalysisService.analyzePeriodPerformance('daily');
            
            if (analysis.byDayOfWeek) {
                const monday = analysis.byDayOfWeek.monday;
                if (monday && monday.trades === 3 && monday.profit === 380) {
                    logTest('Анализ по дням недели работает корректно (понедельник)', true);
                    results.passed++;
                } else {
                    logTest('Анализ по дням недели работает корректно (понедельник)', false, 
                        `Ожидалось 3 сделки и прибыль 380, получено ${monday?.trades || 0} сделок и прибыль ${monday?.profit || 0}`);
                    results.failed++;
                }
                
                if (analysis.bestDay && analysis.bestDay.period) {
                    logTest('bestDay определяется корректно', true);
                    results.passed++;
                } else {
                    logTest('bestDay определяется корректно', false, 'bestDay не найден');
                    results.failed++;
                }
                
                if (analysis.worstDay && analysis.worstDay.period) {
                    logTest('worstDay определяется корректно', true);
                    results.passed++;
                } else {
                    logTest('worstDay определяется корректно', false, 'worstDay не найден');
                    results.failed++;
                }
            } else {
                logTest('Анализ по дням недели доступен', false, 'byDayOfWeek = null');
                results.failed++;
            }
        } catch (error) {
            logTest('Анализ по дням недели работает', false, error.message);
            results.failed++;
        }

        // 5. Тестирование анализа по месяцам
        logSection('5. Тестирование анализа по месяцам');
        try {
            const analysis = await OptimizedAnalysisService.analyzePeriodPerformance('monthly');
            
            if (analysis.byMonth && Array.isArray(analysis.byMonth)) {
                logTest('Анализ по месяцам возвращает массив', true);
                results.passed++;
                
                if (analysis.byMonth.length > 0) {
                    logTest('Анализ по месяцам содержит данные', true);
                    results.passed++;
                } else {
                    logTest('Анализ по месяцам содержит данные', false, 'Массив пуст');
                    results.failed++;
                }
            } else {
                logTest('Анализ по месяцам возвращает массив', false, 
                    `Получено: ${typeof analysis.byMonth}`);
                results.failed++;
            }
        } catch (error) {
            logTest('Анализ по месяцам работает', false, error.message);
            results.failed++;
        }

        // 6. Тестирование summary
        logSection('6. Тестирование summary');
        try {
            const analysis = await OptimizedAnalysisService.analyzePeriodPerformance('daily');
            
            if (analysis.summary && 
                typeof analysis.summary.totalProfit === 'number' &&
                typeof analysis.summary.totalTrades === 'number' &&
                typeof analysis.summary.winRate === 'number') {
                logTest('summary содержит корректные данные', true);
                results.passed++;
                
                log(`  ℹ️ Общая прибыль: ${analysis.summary.totalProfit}`, 'cyan');
                log(`  ℹ️ Всего сделок: ${analysis.summary.totalTrades}`, 'cyan');
                log(`  ℹ️ Win Rate: ${analysis.summary.winRate.toFixed(2)}%`, 'cyan');
            } else {
                logTest('summary содержит корректные данные', false, 
                    `Получено: ${JSON.stringify(analysis.summary)}`);
                results.failed++;
            }
        } catch (error) {
            logTest('summary работает', false, error.message);
            results.failed++;
        }

        // 7. Тестирование с фильтрацией по датам
        logSection('7. Тестирование с фильтрацией по датам');
        try {
            const endDate = new Date();
            const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
            
            const analysis = await OptimizedAnalysisService.analyzePeriodPerformance('daily', startDate, endDate);
            
            if (analysis.success && analysis.startDate && analysis.endDate) {
                logTest('Фильтрация по датам работает', true);
                results.passed++;
            } else {
                logTest('Фильтрация по датам работает', false, 
                    `success: ${analysis.success}, startDate: ${analysis.startDate}, endDate: ${analysis.endDate}`);
                results.failed++;
            }
        } catch (error) {
            logTest('Фильтрация по датам работает', false, error.message);
            results.failed++;
        }

        // 8. Тестирование обработки пустых данных
        logSection('8. Тестирование обработки пустых данных');
        try {
            // Сохраняем текущие сделки
            const originalTrades = TradingEngine.virtualPortfolio.trades;
            
            // Очищаем сделки
            TradingEngine.virtualPortfolio.trades = [];
            
            const analysis = await OptimizedAnalysisService.analyzePeriodPerformance();
            
            if (!analysis.success && analysis.message) {
                logTest('Обработка пустых данных работает', true);
                results.passed++;
            } else {
                logTest('Обработка пустых данных работает', false, 
                    `success: ${analysis.success}, message: ${analysis.message}`);
                results.failed++;
            }
            
            // Восстанавливаем сделки
            TradingEngine.virtualPortfolio.trades = originalTrades;
        } catch (error) {
            logTest('Обработка пустых данных работает', false, error.message);
            results.failed++;
        }

        // Итоги
        log('\n' + '='.repeat(60), 'cyan');
        log('ИТОГИ ТЕСТИРОВАНИЯ ЭТАПА 3', 'cyan');
        log('='.repeat(60), 'cyan');
        log(`✅ Пройдено тестов: ${results.passed}`, 'green');
        log(`❌ Провалено тестов: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
        log(`📊 Всего тестов: ${results.passed + results.failed}`, 'cyan');
        log(`📈 Успешность: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`, 'cyan');
        log('='.repeat(60) + '\n', 'cyan');

        if (results.failed === 0) {
            log('🎉 Все тесты этапа 3 пройдены успешно!', 'green');
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

runStage3Tests();

