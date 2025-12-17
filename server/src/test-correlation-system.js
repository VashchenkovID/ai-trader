/**
 * Тестовый скрипт для проверки системы контроля корреляций
 * Проверяет:
 * - Инициализацию CorrelationService
 * - Расчет корреляций между инструментами
 * - Кеширование корреляций
 * - Интеграцию с RiskManagementService
 * - Интеграцию с CapitalAllocationStrategy
 */

import CorrelationService from './services/CorrelationService.js';
import CorrelationCache from './models/CorrelationCache.js';
import RiskManagementService from './services/RiskManagementService.js';
import CapitalAllocationStrategy from './services/CapitalAllocationStrategy.js';
import CacheService from './services/CacheService.js';
import CachedInstrument from './models/CachedInstrument.js';
import Settings from './models/Settings.js';
import sequelize from './config/database.js';

// Цвета для консоли
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
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

// Тестовые данные
const testFigis = [
    'BBG004730N88', // SBER
    'BBG004730ZJ9', // GAZP
    'BBG0047315Y7', // LKOH
    'BBG004731354', // GMKN
    'BBG00475J8X3'  // YNDX
];

async function testDatabaseConnection() {
    logSection('1. Проверка подключения к БД');
    
    try {
        await sequelize.authenticate();
        logTest('Подключение к БД', true, 'База данных доступна');
        return true;
    } catch (error) {
        logTest('Подключение к БД', false, error.message);
        return false;
    }
}

async function testCorrelationCacheModel() {
    logSection('2. Тестирование модели CorrelationCache');
    
    try {
        // Проверяем, что модель определена
        logTest('Модель CorrelationCache определена', CorrelationCache !== undefined);
        
        // Проверяем статические методы
        logTest('Метод getOrCalculate существует', typeof CorrelationCache.getOrCalculate === 'function');
        logTest('Метод cleanExpired существует', typeof CorrelationCache.cleanExpired === 'function');
        logTest('Метод getCorrelationsForInstrument существует', typeof CorrelationCache.getCorrelationsForInstrument === 'function');
        
        // Тестируем очистку устаревших записей
        try {
            const deleted = await CorrelationCache.cleanExpired();
            logTest('Очистка устаревших записей', true, `Удалено записей: ${deleted}`);
        } catch (error) {
            logTest('Очистка устаревших записей', false, error.message);
        }
        
        return true;
    } catch (error) {
        logTest('Тестирование модели CorrelationCache', false, error.message);
        return false;
    }
}

async function testCorrelationServiceInitialization() {
    logSection('3. Тестирование инициализации CorrelationService');
    
    try {
        await CorrelationService.initialize();
        logTest('Инициализация CorrelationService', CorrelationService.isInitialized === true);
        
        // Проверяем настройки
        logTest('Настройки загружены', CorrelationService.settings !== undefined);
        if (CorrelationService.settings) {
            console.log(`   - Период по умолчанию: ${CorrelationService.settings.defaultPeriod} дней`);
            console.log(`   - TTL кеша: ${CorrelationService.settings.cacheTtl / (60 * 60 * 1000)} часов`);
            console.log(`   - Минимум точек данных: ${CorrelationService.settings.minDataPoints}`);
            console.log(`   - Порог корреляции: ${CorrelationService.settings.correlationThreshold}`);
        }
        
        return true;
    } catch (error) {
        logTest('Инициализация CorrelationService', false, error.message);
        console.error(error);
        return false;
    }
}

async function testCorrelationCalculation() {
    logSection('4. Тестирование расчета корреляций');
    
    try {
        // Инициализируем CacheService, если нужно
        if (!CacheService.isInitialized) {
            await CacheService.initialize();
        }
        
        // Получаем доступные инструменты из кеша
        const instruments = await CachedInstrument.findAll({
            limit: 5,
            attributes: ['figi', 'ticker', 'name']
        });
        
        if (instruments.length < 2) {
            logTest('Достаточно инструментов для теста', false, 'Необходимо минимум 2 инструмента в кеше');
            return false;
        }
        
        const testPairs = [];
        for (let i = 0; i < Math.min(3, instruments.length); i++) {
            for (let j = i + 1; j < Math.min(3, instruments.length); j++) {
                testPairs.push([instruments[i].figi, instruments[j].figi]);
            }
        }
        
        log(`Тестируем ${testPairs.length} пар инструментов...`, 'blue');
        
        let successCount = 0;
        for (const [figi1, figi2] of testPairs) {
            try {
                const correlation = await CorrelationService.calculateCorrelation(figi1, figi2, 30);
                
                const isValid = correlation >= -1 && correlation <= 1 && isFinite(correlation);
                const instrument1 = instruments.find(i => i.figi === figi1);
                const instrument2 = instruments.find(i => i.figi === figi2);
                
                logTest(
                    `Корреляция ${instrument1?.ticker || figi1} - ${instrument2?.ticker || figi2}`,
                    isValid,
                    `Значение: ${correlation.toFixed(4)}`
                );
                
                if (isValid) {
                    successCount++;
                }
            } catch (error) {
                logTest(
                    `Корреляция ${figi1} - ${figi2}`,
                    false,
                    error.message
                );
            }
        }
        
        logTest('Общий результат расчета корреляций', successCount > 0, `Успешно: ${successCount}/${testPairs.length}`);
        
        return successCount > 0;
    } catch (error) {
        logTest('Расчет корреляций', false, error.message);
        console.error(error);
        return false;
    }
}

async function testCorrelationCaching() {
    logSection('5. Тестирование кеширования корреляций');
    
    try {
        const instruments = await CachedInstrument.findAll({
            limit: 2,
            attributes: ['figi']
        });
        
        if (instruments.length < 2) {
            logTest('Достаточно инструментов для теста кеша', false);
            return false;
        }
        
        const [figi1, figi2] = [instruments[0].figi, instruments[1].figi];
        
        // Первый расчет (должен создать запись в кеше)
        const start1 = Date.now();
        const correlation1 = await CorrelationService.calculateCorrelation(figi1, figi2, 30);
        const time1 = Date.now() - start1;
        
        // Второй расчет (должен использовать кеш)
        const start2 = Date.now();
        const correlation2 = await CorrelationService.calculateCorrelation(figi1, figi2, 30);
        const time2 = Date.now() - start2;
        
        // Проверяем, что значения совпадают
        const valuesMatch = Math.abs(correlation1 - correlation2) < 0.0001;
        logTest('Значения корреляции совпадают', valuesMatch, 
            `Первое: ${correlation1.toFixed(4)}, Второе: ${correlation2.toFixed(4)}`);
        
        // Проверяем, что второй расчет быстрее (кеш работает)
        const cacheFaster = time2 < time1;
        logTest('Кеш ускоряет расчет', cacheFaster || time2 < 100, 
            `Первый расчет: ${time1}ms, Второй (из кеша): ${time2}ms`);
        
        // Проверяем наличие записи в кеше
        const cached = await CorrelationCache.findOne({
            where: {
                figi1: figi1 < figi2 ? figi1 : figi2,
                figi2: figi1 < figi2 ? figi2 : figi1,
                period: 30
            }
        });
        
        logTest('Запись в кеше создана', cached !== null, 
            cached ? `ID: ${cached.id}, Корреляция: ${cached.correlation.toFixed(4)}` : 'Запись не найдена');
        
        return valuesMatch && cached !== null;
    } catch (error) {
        logTest('Кеширование корреляций', false, error.message);
        console.error(error);
        return false;
    }
}

async function testCorrelationMatrix() {
    logSection('6. Тестирование матрицы корреляций');
    
    try {
        const instruments = await CachedInstrument.findAll({
            limit: 5,
            attributes: ['figi', 'ticker']
        });
        
        if (instruments.length < 2) {
            logTest('Достаточно инструментов для матрицы', false);
            return false;
        }
        
        const figis = instruments.map(i => i.figi);
        
        const matrix = await CorrelationService.getCorrelationMatrix(figis, 30);
        
        logTest('Матрица корреляций создана', matrix !== null && typeof matrix === 'object');
        
        if (matrix) {
            // Проверяем симметричность матрицы
            let symmetric = true;
            for (let i = 0; i < figis.length; i++) {
                for (let j = i + 1; j < figis.length; j++) {
                    const val1 = matrix[figis[i]]?.[figis[j]] ?? 0;
                    const val2 = matrix[figis[j]]?.[figis[i]] ?? 0;
                    if (Math.abs(val1 - val2) > 0.0001) {
                        symmetric = false;
                        break;
                    }
                }
                if (!symmetric) break;
            }
            
            logTest('Матрица симметрична', symmetric);
            
            // Выводим примеры значений
            console.log('\n   Примеры значений матрицы:');
            for (let i = 0; i < Math.min(3, figis.length); i++) {
                for (let j = i + 1; j < Math.min(3, figis.length); j++) {
                    const corr = matrix[figis[i]]?.[figis[j]] ?? 0;
                    const ticker1 = instruments.find(inst => inst.figi === figis[i])?.ticker || figis[i];
                    const ticker2 = instruments.find(inst => inst.figi === figis[j])?.ticker || figis[j];
                    console.log(`   ${ticker1} - ${ticker2}: ${corr.toFixed(4)}`);
                }
            }
        }
        
        return matrix !== null;
    } catch (error) {
        logTest('Матрица корреляций', false, error.message);
        console.error(error);
        return false;
    }
}

async function testRiskManagementIntegration() {
    logSection('7. Тестирование интеграции с RiskManagementService');
    
    try {
        const instruments = await CachedInstrument.findAll({
            limit: 3,
            attributes: ['figi', 'ticker']
        });
        
        if (instruments.length < 2) {
            logTest('Достаточно инструментов для теста', false);
            return false;
        }
        
        // Создаем тестовый сигнал
        const testSignal = {
            figi: instruments[0].figi,
            symbol: instruments[0].ticker,
            direction: 'BUY',
            quantity: 10,
            price: 100
        };
        
        // Создаем тестовый портфель с одной позицией
        const testPortfolio = {
            positions: {
                [instruments[1].figi]: 5
            }
        };
        
        const correlationRisk = await RiskManagementService.checkCorrelationRisk(testSignal, testPortfolio);
        
        logTest('Метод checkCorrelationRisk работает', correlationRisk !== null && typeof correlationRisk === 'object');
        
        if (correlationRisk) {
            logTest('Поле recommendation присутствует', 'recommendation' in correlationRisk);
            logTest('Поле portfolioCorrelation присутствует', 'portfolioCorrelation' in correlationRisk);
            logTest('Поле correlatedPositions присутствует', Array.isArray(correlationRisk.correlatedPositions));
            
            console.log(`   - Рекомендация: ${correlationRisk.recommendation}`);
            console.log(`   - Корреляция портфеля: ${(correlationRisk.portfolioCorrelation * 100).toFixed(2)}%`);
            console.log(`   - Коррелированных позиций: ${correlationRisk.correlatedPositions.length}`);
        }
        
        return correlationRisk !== null;
    } catch (error) {
        logTest('Интеграция с RiskManagementService', false, error.message);
        console.error(error);
        return false;
    }
}

async function testCapitalAllocationIntegration() {
    logSection('8. Тестирование интеграции с CapitalAllocationStrategy');
    
    try {
        // Создаем тестовые позиции
        const instruments = await CachedInstrument.findAll({
            limit: 3,
            attributes: ['figi', 'ticker']
        });
        
        if (instruments.length < 2) {
            logTest('Достаточно инструментов для теста', false);
            return false;
        }
        
        const testPositions = instruments.map((inst, index) => ({
            figi: inst.figi,
            symbol: inst.ticker,
            positionSize: 1000 + index * 100,
            pnlPercent: (Math.random() - 0.5) * 10 // Случайный PnL от -5% до +5%
        }));
        
        const correlationRisk = await CapitalAllocationStrategy.calculateCorrelationRisk(testPositions);
        
        logTest('Метод calculateCorrelationRisk работает', typeof correlationRisk === 'number');
        logTest('Значение корреляции валидно', correlationRisk >= 0 && correlationRisk <= 1);
        
        console.log(`   - Корреляционный риск: ${(correlationRisk * 100).toFixed(2)}%`);
        
        return typeof correlationRisk === 'number' && correlationRisk >= 0 && correlationRisk <= 1;
    } catch (error) {
        logTest('Интеграция с CapitalAllocationStrategy', false, error.message);
        console.error(error);
        return false;
    }
}

async function testPortfolioCorrelation() {
    logSection('9. Тестирование расчета корреляции портфеля');
    
    try {
        const instruments = await CachedInstrument.findAll({
            limit: 5,
            attributes: ['figi']
        });
        
        if (instruments.length < 2) {
            logTest('Достаточно инструментов для теста', false);
            return false;
        }
        
        // Создаем тестовый портфель
        const testPortfolio = {
            positions: {}
        };
        
        instruments.forEach((inst, index) => {
            testPortfolio.positions[inst.figi] = 10 + index * 5;
        });
        
        const portfolioCorrelation = await CorrelationService.calculatePortfolioCorrelation(testPortfolio, 30);
        
        logTest('Расчет корреляции портфеля работает', typeof portfolioCorrelation === 'number');
        logTest('Значение корреляции валидно', portfolioCorrelation >= 0 && portfolioCorrelation <= 1);
        
        console.log(`   - Средняя корреляция портфеля: ${(portfolioCorrelation * 100).toFixed(2)}%`);
        
        return typeof portfolioCorrelation === 'number' && portfolioCorrelation >= 0 && portfolioCorrelation <= 1;
    } catch (error) {
        logTest('Расчет корреляции портфеля', false, error.message);
        console.error(error);
        return false;
    }
}

async function testCorrelationScore() {
    logSection('10. Тестирование оценки корреляции инструмента');
    
    try {
        const instruments = await CachedInstrument.findAll({
            limit: 3,
            attributes: ['figi', 'ticker']
        });
        
        if (instruments.length < 2) {
            logTest('Достаточно инструментов для теста', false);
            return false;
        }
        
        // Создаем тестовый портфель с одной позицией
        const testPortfolio = {
            positions: {
                [instruments[1].figi]: 10
            }
        };
        
        const score = await CorrelationService.getCorrelationScore(
            instruments[0].figi,
            testPortfolio,
            30
        );
        
        logTest('Метод getCorrelationScore работает', score !== null && typeof score === 'object');
        
        if (score) {
            logTest('Поле correlationScore присутствует', 'correlationScore' in score);
            logTest('Поле avgCorrelation присутствует', 'avgCorrelation' in score);
            logTest('Поле maxCorrelation присутствует', 'maxCorrelation' in score);
            
            console.log(`   - Приоритет (correlationScore): ${score.correlationScore.toFixed(4)}`);
            console.log(`   - Средняя корреляция: ${(score.avgCorrelation * 100).toFixed(2)}%`);
            console.log(`   - Максимальная корреляция: ${(score.maxCorrelation * 100).toFixed(2)}%`);
            console.log(`   - Коррелированных позиций: ${score.correlatedPositions.length}`);
        }
        
        return score !== null;
    } catch (error) {
        logTest('Оценка корреляции инструмента', false, error.message);
        console.error(error);
        return false;
    }
}

async function runAllTests() {
    log('\n' + '='.repeat(60), 'cyan');
    log('ТЕСТИРОВАНИЕ СИСТЕМЫ КОНТРОЛЯ КОРРЕЛЯЦИЙ', 'cyan');
    log('='.repeat(60) + '\n', 'cyan');
    
    const results = {
        passed: 0,
        failed: 0,
        tests: []
    };
    
    // Запускаем все тесты
    const tests = [
        { name: 'Подключение к БД', fn: testDatabaseConnection },
        { name: 'Модель CorrelationCache', fn: testCorrelationCacheModel },
        { name: 'Инициализация CorrelationService', fn: testCorrelationServiceInitialization },
        { name: 'Расчет корреляций', fn: testCorrelationCalculation },
        { name: 'Кеширование корреляций', fn: testCorrelationCaching },
        { name: 'Матрица корреляций', fn: testCorrelationMatrix },
        { name: 'Интеграция с RiskManagementService', fn: testRiskManagementIntegration },
        { name: 'Интеграция с CapitalAllocationStrategy', fn: testCapitalAllocationIntegration },
        { name: 'Корреляция портфеля', fn: testPortfolioCorrelation },
        { name: 'Оценка корреляции инструмента', fn: testCorrelationScore }
    ];
    
    for (const test of tests) {
        try {
            const result = await test.fn();
            results.tests.push({ name: test.name, passed: result });
            if (result) {
                results.passed++;
            } else {
                results.failed++;
            }
        } catch (error) {
            logTest(test.name, false, error.message);
            results.tests.push({ name: test.name, passed: false });
            results.failed++;
        }
    }
    
    // Выводим итоговую статистику
    logSection('ИТОГОВАЯ СТАТИСТИКА');
    
    console.log(`Всего тестов: ${results.tests.length}`);
    log(`Пройдено: ${results.passed}`, 'green');
    log(`Провалено: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
    console.log(`\nУспешность: ${((results.passed / results.tests.length) * 100).toFixed(1)}%`);
    
    console.log('\nДетали по тестам:');
    results.tests.forEach(test => {
        const status = test.passed ? '✅' : '❌';
        const color = test.passed ? 'green' : 'red';
        log(`  ${status} ${test.name}`, color);
    });
    
    // Закрываем соединение с БД
    await sequelize.close();
    
    return results.failed === 0;
}

// Запускаем тесты
runAllTests()
    .then(success => {
        process.exit(success ? 0 : 1);
    })
    .catch(error => {
        console.error('Критическая ошибка при выполнении тестов:', error);
        process.exit(1);
    });

