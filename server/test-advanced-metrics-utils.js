/**
 * Unit-тесты для утилит продвинутых метрик производительности
 */

import {
    calculateSortinoRatio,
    calculateCalmarRatio,
    calculateInformationRatio,
    calculateMAEandMFE,
    analyzeByDayOfWeek,
    analyzeByMonth
} from './src/utils/advancedMetrics.js';

// Helper for colored console output
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
    if (passed) {
        const status = '✅ PASS';
        const color = 'green';
        log(`  ${status}: ${name}`, color);
    } else {
        const status = '❌ FAIL';
        const color = 'red';
        log(`  ${status}: ${name} ${details ? `- ${details}` : ''}`, color);
    }
};

function runTests() {
    const results = { passed: 0, failed: 0 };

    // 1. Тестирование calculateSortinoRatio
    logSection('1. Тестирование calculateSortinoRatio');
    
    try {
        // Тест 1: Пустой массив
        const sortinoEmpty = calculateSortinoRatio([]);
        if (sortinoEmpty === 0) {
            results.passed++;
        } else {
            logTest('Sortino Ratio с пустым массивом', false, `Ожидалось 0, получено ${sortinoEmpty}`);
            results.failed++;
        }

        // Тест 2: Только положительные доходности
        const sortinoOnlyPositive = calculateSortinoRatio([1, 2, 3, 4, 5]);
        if (sortinoOnlyPositive === Infinity || sortinoOnlyPositive > 1000) {
            logTest('Sortino Ratio с только положительными доходностями', true);
            results.passed++;
        } else {
            logTest('Sortino Ratio с только положительными доходностями', false, 
                `Ожидалось Infinity или большое значение, получено ${sortinoOnlyPositive}`);
            results.failed++;
        }

        // Тест 3: Нормальные данные
        const returns = [1, -2, 3, -1, 2, -0.5, 1.5, -1];
        const sortinoNormal = calculateSortinoRatio(returns, 8, 252);
        if (typeof sortinoNormal === 'number' && isFinite(sortinoNormal)) {
            logTest('Sortino Ratio с нормальными данными', true);
            results.passed++;
        } else {
            logTest('Sortino Ratio с нормальными данными', false, 
                `Ожидалось число, получено ${sortinoNormal}`);
            results.failed++;
        }
    } catch (error) {
        logTest('calculateSortinoRatio работает', false, error.message);
        results.failed++;
    }

    // 2. Тестирование calculateCalmarRatio
    logSection('2. Тестирование calculateCalmarRatio');
    
    try {
        // Тест 1: Нулевая просадка
        const calmarZeroDD = calculateCalmarRatio(20, 0);
        if (calmarZeroDD === 0) {
            logTest('Calmar Ratio с нулевой просадкой', true);
            results.passed++;
        } else {
            logTest('Calmar Ratio с нулевой просадкой', false, `Ожидалось 0, получено ${calmarZeroDD}`);
            results.failed++;
        }

        // Тест 2: Нормальные данные
        const calmarNormal = calculateCalmarRatio(20, 10);
        if (calmarNormal === 2) {
            logTest('Calmar Ratio с нормальными данными', true);
            results.passed++;
        } else {
            logTest('Calmar Ratio с нормальными данными', false, 
                `Ожидалось 2, получено ${calmarNormal}`);
            results.failed++;
        }

        // Тест 3: Отрицательная доходность
        const calmarNegative = calculateCalmarRatio(-10, 5);
        if (calmarNegative === -2) {
            logTest('Calmar Ratio с отрицательной доходностью', true);
            results.passed++;
        } else {
            logTest('Calmar Ratio с отрицательной доходностью', false, 
                `Ожидалось -2, получено ${calmarNegative}`);
            results.failed++;
        }
    } catch (error) {
        logTest('calculateCalmarRatio работает', false, error.message);
        results.failed++;
    }

    // 3. Тестирование calculateInformationRatio
    logSection('3. Тестирование calculateInformationRatio');
    
    try {
        // Тест 1: Пустые массивы
        const infoRatioEmpty = calculateInformationRatio([], []);
        if (infoRatioEmpty === 0) {
            logTest('Information Ratio с пустыми массивами', true);
            results.passed++;
        } else {
            logTest('Information Ratio с пустыми массивами', false, 
                `Ожидалось 0, получено ${infoRatioEmpty}`);
            results.failed++;
        }

        // Тест 2: Разная длина массивов
        const infoRatioDifferentLength = calculateInformationRatio([1, 2, 3], [1, 2]);
        if (infoRatioDifferentLength === 0) {
            logTest('Information Ratio с разной длиной массивов', true);
            results.passed++;
        } else {
            logTest('Information Ratio с разной длиной массивов', false, 
                `Ожидалось 0, получено ${infoRatioDifferentLength}`);
            results.failed++;
        }

        // Тест 3: Нормальные данные
        const portfolioReturns = [1, 2, -1, 3, 1];
        const benchmarkReturns = [0.5, 1.5, -0.5, 2, 0.5];
        const infoRatioNormal = calculateInformationRatio(portfolioReturns, benchmarkReturns);
        if (typeof infoRatioNormal === 'number' && isFinite(infoRatioNormal)) {
            logTest('Information Ratio с нормальными данными', true);
            results.passed++;
        } else {
            logTest('Information Ratio с нормальными данными', false, 
                `Ожидалось число, получено ${infoRatioNormal}`);
            results.failed++;
        }
    } catch (error) {
        logTest('calculateInformationRatio работает', false, error.message);
        results.failed++;
    }

    // 4. Тестирование calculateMAEandMFE
    logSection('4. Тестирование calculateMAEandMFE');
    
    try {
        // Тест 1: Пустой массив сделок
        const maeMfeEmpty = calculateMAEandMFE([], []);
        if (maeMfeEmpty.mae === 0 && maeMfeEmpty.mfe === 0 && maeMfeEmpty.trades.length === 0) {
            logTest('MAE/MFE с пустым массивом', true);
            results.passed++;
        } else {
            logTest('MAE/MFE с пустым массивом', false, 
                `Ожидалось {mae: 0, mfe: 0, trades: []}, получено ${JSON.stringify(maeMfeEmpty)}`);
            results.failed++;
        }

        // Тест 2: Сделки без свечей
        const tradesWithoutCandles = [
            { entryPrice: 100, exitPrice: 110, entryTime: new Date('2024-01-01'), exitTime: new Date('2024-01-02') }
        ];
        const maeMfeNoCandles = calculateMAEandMFE(tradesWithoutCandles, []);
        if (maeMfeNoCandles.trades.length === 1 && maeMfeNoCandles.trades[0].mae !== undefined) {
            logTest('MAE/MFE без свечей', true);
            results.passed++;
        } else {
            logTest('MAE/MFE без свечей', false, 
                `Ожидалось trades с MAE/MFE, получено ${JSON.stringify(maeMfeNoCandles)}`);
            results.failed++;
        }

        // Тест 3: Сделки со свечами
        const tradesWithCandles = [
            { entryPrice: 100, exitPrice: 110, entryTime: new Date('2024-01-01'), exitTime: new Date('2024-01-03') }
        ];
        const candles = [
            { time: new Date('2024-01-01'), high: 105, low: 98 },
            { time: new Date('2024-01-02'), high: 112, low: 99 },
            { time: new Date('2024-01-03'), high: 110, low: 108 }
        ];
        const maeMfeWithCandles = calculateMAEandMFE(tradesWithCandles, candles);
        if (maeMfeWithCandles.trades.length === 1 && 
            maeMfeWithCandles.trades[0].mae >= 0 && 
            maeMfeWithCandles.trades[0].mfe >= 0) {
            logTest('MAE/MFE со свечами', true);
            results.passed++;
        } else {
            logTest('MAE/MFE со свечами', false, 
                `Ожидалось trades с MAE/MFE >= 0, получено ${JSON.stringify(maeMfeWithCandles)}`);
            results.failed++;
        }
    } catch (error) {
        logTest('calculateMAEandMFE работает', false, error.message);
        results.failed++;
    }

    // 5. Тестирование analyzeByDayOfWeek
    logSection('5. Тестирование analyzeByDayOfWeek');
    
    try {
        // Тест 1: Пустой массив
        const dayOfWeekEmpty = analyzeByDayOfWeek([]);
        if (dayOfWeekEmpty.monday && dayOfWeekEmpty.bestDay === null) {
            logTest('Анализ по дням недели с пустым массивом', true);
            results.passed++;
        } else {
            logTest('Анализ по дням недели с пустым массивом', false, 
                `Ожидалось структуру с днями, получено ${JSON.stringify(dayOfWeekEmpty)}`);
            results.failed++;
        }

        // Тест 2: Нормальные данные
        const trades = [
            { timestamp: '2024-01-01T10:00:00Z', pnl: 100 }, // Понедельник
            { timestamp: '2024-01-02T10:00:00Z', pnl: 50 },  // Вторник
            { timestamp: '2024-01-03T10:00:00Z', pnl: -20 },  // Среда
            { timestamp: '2024-01-04T10:00:00Z', pnl: 80 },   // Четверг
            { timestamp: '2024-01-05T10:00:00Z', pnl: -10 }   // Пятница
        ];
        const dayOfWeekNormal = analyzeByDayOfWeek(trades);
        if (dayOfWeekNormal.monday && dayOfWeekNormal.monday.trades === 1 && 
            dayOfWeekNormal.monday.profit === 100) {
            logTest('Анализ по дням недели с нормальными данными', true);
            results.passed++;
        } else {
            logTest('Анализ по дням недели с нормальными данными', false, 
                `Ожидалось понедельник с 1 сделкой и прибылью 100, получено ${JSON.stringify(dayOfWeekNormal.monday)}`);
            results.failed++;
        }

        // Тест 3: Лучший/худший день
        if (dayOfWeekNormal.bestDay && dayOfWeekNormal.bestDay.day === 'monday') {
            logTest('Определение лучшего дня', true);
            results.passed++;
        } else {
            logTest('Определение лучшего дня', false, 
                `Ожидалось bestDay = monday, получено ${JSON.stringify(dayOfWeekNormal.bestDay)}`);
            results.failed++;
        }
    } catch (error) {
        logTest('analyzeByDayOfWeek работает', false, error.message);
        results.failed++;
    }

    // 6. Тестирование analyzeByMonth
    logSection('6. Тестирование analyzeByMonth');
    
    try {
        // Тест 1: Пустой массив
        const monthEmpty = analyzeByMonth([]);
        if (monthEmpty.january && monthEmpty.bestMonth === null) {
            logTest('Анализ по месяцам с пустым массивом', true);
            results.passed++;
        } else {
            logTest('Анализ по месяцам с пустым массивом', false, 
                `Ожидалось структуру с месяцами, получено ${JSON.stringify(monthEmpty)}`);
            results.failed++;
        }

        // Тест 2: Нормальные данные
        const tradesByMonth = [
            { timestamp: '2024-01-15T10:00:00Z', pnl: 200 },  // Январь
            { timestamp: '2024-02-15T10:00:00Z', pnl: 150 },  // Февраль
            { timestamp: '2024-03-15T10:00:00Z', pnl: -50 },   // Март
            { timestamp: '2024-01-20T10:00:00Z', pnl: 100 }   // Январь (вторая сделка)
        ];
        const monthNormal = analyzeByMonth(tradesByMonth);
        if (monthNormal.january && monthNormal.january.trades === 2 && 
            monthNormal.january.profit === 300) {
            logTest('Анализ по месяцам с нормальными данными', true);
            results.passed++;
        } else {
            logTest('Анализ по месяцам с нормальными данными', false, 
                `Ожидалось январь с 2 сделками и прибылью 300, получено ${JSON.stringify(monthNormal.january)}`);
            results.failed++;
        }

        // Тест 3: Лучший/худший месяц
        if (monthNormal.bestMonth && monthNormal.bestMonth.month === 'january') {
            logTest('Определение лучшего месяца', true);
            results.passed++;
        } else {
            logTest('Определение лучшего месяца', false, 
                `Ожидалось bestMonth = january, получено ${JSON.stringify(monthNormal.bestMonth)}`);
            results.failed++;
        }
    } catch (error) {
        logTest('analyzeByMonth работает', false, error.message);
        results.failed++;
    }

    // Итоги
    log('\n' + '='.repeat(60), 'cyan');
    log('ИТОГИ ТЕСТИРОВАНИЯ', 'cyan');
    log('='.repeat(60), 'cyan');
    log(`✅ Пройдено тестов: ${results.passed}`, 'green');
    log(`❌ Провалено тестов: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
    log(`📊 Всего тестов: ${results.passed + results.failed}`, 'cyan');
    log(`📈 Успешность: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`, 'cyan');
    log('='.repeat(60) + '\n', 'cyan');

    if (results.failed === 0) {
        log('🎉 Все тесты пройдены успешно!', 'green');
    } else {
        log('⚠️ Некоторые тесты провалены. Проверьте логи выше.', 'yellow');
    }

    return results.failed === 0 ? 0 : 1;
}

// Запускаем тесты
const exitCode = runTests();
process.exit(exitCode);

