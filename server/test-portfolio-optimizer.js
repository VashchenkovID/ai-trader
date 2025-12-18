/**
 * Тестовый скрипт для проверки PortfolioOptimizer (Этап 1)
 * Проверяет базовую инфраструктуру и интеграцию с существующими сервисами
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import PortfolioOptimizer from './src/services/PortfolioOptimizer.js';
import CorrelationService from './src/services/CorrelationService.js';
import CacheService from './src/services/CacheService.js';
import CachedInstrument from './src/models/CachedInstrument.js';
import { initDatabase } from './src/utils/initDatabase.js';
import sequelize from './src/config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем переменные окружения
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
        console.log(`✅ Загружен .env из: ${envPath}`);
        break;
    }
}

if (!envLoaded) {
    dotenv.config();
    console.log('⚠️ .env файл не найден, используются системные переменные окружения');
}

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

async function testInitialization() {
    logSection('1. Тестирование инициализации');
    
    try {
        await PortfolioOptimizer.initialize();
        logTest('Инициализация PortfolioOptimizer', PortfolioOptimizer.isInitialized === true);
        
        const status = PortfolioOptimizer.getStatus();
        console.log('   Статус сервиса:');
        console.log(`   - Инициализирован: ${status.isInitialized}`);
        console.log(`   - Период по умолчанию: ${status.settings.defaultPeriod} дней`);
        console.log(`   - Безрисковая ставка: ${(status.settings.riskFreeRate * 100).toFixed(2)}%`);
        console.log(`   - Размер кеша корреляций: ${status.cacheSize.correlation}`);
        console.log(`   - Размер кеша доходностей: ${status.cacheSize.expectedReturns}`);
        
        return true;
    } catch (error) {
        logTest('Инициализация PortfolioOptimizer', false, error.message);
        console.error(error);
        return false;
    }
}

async function testGetInstruments() {
    logSection('2. Получение тестовых инструментов');
    
    try {
        const instruments = await CachedInstrument.findAll({
            where: {
                currency: 'rub',
                instrumentType: 'share'
            },
            limit: 5,
            attributes: ['figi', 'ticker', 'name', 'lastPrice']
        });

        if (instruments.length < 2) {
            logTest('Достаточно инструментов для теста', false, `Найдено только ${instruments.length}, нужно минимум 2`);
            return null;
        }

        logTest('Достаточно инструментов для теста', true, `Найдено ${instruments.length} инструментов`);
        
        console.log('   Инструменты для тестирования:');
        instruments.forEach((inst, index) => {
            console.log(`   ${index + 1}. ${inst.ticker} (${inst.figi}) - ${inst.name || 'N/A'}`);
        });

        return instruments.map(inst => ({
            figi: inst.figi,
            ticker: inst.ticker,
            name: inst.name
        }));
    } catch (error) {
        logTest('Получение инструментов', false, error.message);
        console.error(error);
        return null;
    }
}

async function testVolatilityCalculation(instruments) {
    logSection('3. Тестирование расчета волатильности');
    
    if (!instruments || instruments.length === 0) {
        logTest('Расчет волатильности', false, 'Нет инструментов для тестирования');
        return null;
    }

    try {
        const volatilities = {};
        let successCount = 0;

        for (const instrument of instruments.slice(0, 3)) {
            try {
                const startTime = Date.now();
                const volatility = await PortfolioOptimizer.calculateVolatility(instrument.figi);
                const duration = Date.now() - startTime;

                volatilities[instrument.figi] = volatility;

                const isValid = volatility >= 0 && volatility <= 100 && isFinite(volatility);
                logTest(
                    `Волатильность ${instrument.ticker}`,
                    isValid,
                    `${volatility.toFixed(2)}% (за ${duration}ms)`
                );

                if (isValid && volatility > 0) {
                    successCount++;
                }
            } catch (error) {
                logTest(`Волатильность ${instrument.ticker}`, false, error.message);
            }
        }

        logTest('Общий результат расчета волатильностей', successCount > 0, `Успешно: ${successCount}/${Math.min(3, instruments.length)}`);

        return volatilities;
    } catch (error) {
        logTest('Расчет волатильностей', false, error.message);
        console.error(error);
        return null;
    }
}

async function testGetVolatilities(instruments) {
    logSection('4. Тестирование массового расчета волатильностей');
    
    if (!instruments || instruments.length === 0) {
        logTest('Массовый расчет волатильностей', false, 'Нет инструментов для тестирования');
        return null;
    }

    try {
        const startTime = Date.now();
        const volatilities = await PortfolioOptimizer.getVolatilities(instruments.slice(0, 3));
        const duration = Date.now() - startTime;

        const validVolatilities = Object.values(volatilities).filter(v => v > 0 && isFinite(v)).length;
        logTest(
            'Массовый расчет волатильностей',
            validVolatilities > 0,
            `Рассчитано для ${validVolatilities} инструментов за ${duration}ms`
        );

        if (Object.keys(volatilities).length > 0) {
            console.log('   Примеры волатильностей:');
            for (const [figi, vol] of Object.entries(volatilities).slice(0, 3)) {
                const inst = instruments.find(i => i.figi === figi);
                console.log(`   - ${inst?.ticker || figi}: ${vol.toFixed(2)}%`);
            }
        }

        return volatilities;
    } catch (error) {
        logTest('Массовый расчет волатильностей', false, error.message);
        console.error(error);
        return null;
    }
}

async function testCorrelationMatrix(instruments) {
    logSection('5. Тестирование получения матрицы корреляций');
    
    if (!instruments || instruments.length < 2) {
        logTest('Матрица корреляций', false, 'Нужно минимум 2 инструмента');
        return null;
    }

    try {
        const startTime = Date.now();
        const correlationMatrix = await PortfolioOptimizer.getCorrelationMatrix(instruments.slice(0, 3));
        const duration = Date.now() - startTime;

        const hasData = correlationMatrix && Object.keys(correlationMatrix).length > 0;
        logTest(
            'Получение матрицы корреляций',
            hasData,
            `Матрица ${Object.keys(correlationMatrix).length}x${Object.keys(correlationMatrix).length} за ${duration}ms`
        );

        if (hasData) {
            console.log('   Примеры корреляций:');
            const figis = Object.keys(correlationMatrix).slice(0, 3);
            for (let i = 0; i < figis.length; i++) {
                for (let j = i + 1; j < figis.length; j++) {
                    const figi1 = figis[i];
                    const figi2 = figis[j];
                    const inst1 = instruments.find(inst => inst.figi === figi1);
                    const inst2 = instruments.find(inst => inst.figi === figi2);
                    const corr = correlationMatrix[figi1]?.[figi2] ?? correlationMatrix[figi2]?.[figi1] ?? 0;
                    console.log(`   ${inst1?.ticker || figi1} - ${inst2?.ticker || figi2}: ${corr.toFixed(4)}`);
                }
            }
        }

        return correlationMatrix;
    } catch (error) {
        logTest('Матрица корреляций', false, error.message);
        console.error(error);
        return null;
    }
}

async function testCovarianceMatrix(instruments, volatilities, correlationMatrix) {
    logSection('6. Тестирование расчета матрицы ковариаций');
    
    if (!instruments || instruments.length < 2) {
        logTest('Матрица ковариаций', false, 'Нужно минимум 2 инструмента');
        return null;
    }

    if (!volatilities || Object.keys(volatilities).length === 0) {
        logTest('Матрица ковариаций', false, 'Нужны данные о волатильностях');
        return null;
    }

    if (!correlationMatrix || Object.keys(correlationMatrix).length === 0) {
        logTest('Матрица ковариаций', false, 'Нужна матрица корреляций');
        return null;
    }

    try {
        // Подготавливаем данные инструментов с волатильностями
        const instrumentsWithVol = instruments.slice(0, 3).map(inst => ({
            figi: inst.figi,
            ticker: inst.ticker,
            volatility: volatilities[inst.figi] / 100 // Конвертируем из процентов в десятичные
        }));

        const startTime = Date.now();
        const covarianceMatrix = PortfolioOptimizer.calculateCovarianceMatrix(instrumentsWithVol, correlationMatrix);
        const duration = Date.now() - startTime;

        const hasData = covarianceMatrix && Object.keys(covarianceMatrix).length > 0;
        logTest(
            'Расчет матрицы ковариаций',
            hasData,
            `Матрица ${Object.keys(covarianceMatrix).length}x${Object.keys(covarianceMatrix).length} за ${duration}ms`
        );

        if (hasData) {
            console.log('   Примеры ковариаций:');
            const figis = Object.keys(covarianceMatrix).slice(0, 3);
            for (let i = 0; i < figis.length; i++) {
                for (let j = i; j < figis.length; j++) {
                    const figi1 = figis[i];
                    const figi2 = figis[j];
                    const inst1 = instruments.find(inst => inst.figi === figi1);
                    const inst2 = instruments.find(inst => inst.figi === figi2);
                    const cov = covarianceMatrix[figi1]?.[figi2] ?? 0;
                    const label = figi1 === figi2 ? 'дисперсия' : 'ковариация';
                    console.log(`   ${inst1?.ticker || figi1} - ${inst2?.ticker || figi2} (${label}): ${cov.toFixed(6)}`);
                }
            }
        }

        return covarianceMatrix;
    } catch (error) {
        logTest('Матрица ковариаций', false, error.message);
        console.error(error);
        return null;
    }
}

async function testExpectedReturnsHistorical(instruments) {
    logSection('7. Тестирование расчета ожидаемых доходностей (исторические)');
    
    if (!instruments || instruments.length === 0) {
        logTest('Ожидаемые доходности (исторические)', false, 'Нет инструментов для тестирования');
        return null;
    }

    try {
        const startTime = Date.now();
        const expectedReturns = await PortfolioOptimizer.calculateExpectedReturns(
            instruments.slice(0, 3),
            'historical'
        );
        const duration = Date.now() - startTime;

        const validReturns = Object.values(expectedReturns).filter(r => isFinite(r)).length;
        logTest(
            'Расчет ожидаемых доходностей (исторические)',
            validReturns > 0,
            `Рассчитано для ${validReturns} инструментов за ${duration}ms`
        );

        if (Object.keys(expectedReturns).length > 0) {
            console.log('   Примеры ожидаемых доходностей:');
            for (const [figi, returnValue] of Object.entries(expectedReturns).slice(0, 3)) {
                const inst = instruments.find(i => i.figi === figi);
                console.log(`   - ${inst?.ticker || figi}: ${returnValue.toFixed(2)}% годовых`);
            }
        }

        return expectedReturns;
    } catch (error) {
        logTest('Ожидаемые доходности (исторические)', false, error.message);
        console.error(error);
        return null;
    }
}

async function testExpectedReturnsAI(instruments) {
    logSection('8. Тестирование расчета ожидаемых доходностей (AI прогнозы)');
    
    if (!instruments || instruments.length === 0) {
        logTest('Ожидаемые доходности (AI)', false, 'Нет инструментов для тестирования');
        return null;
    }

    try {
        const startTime = Date.now();
        const expectedReturns = await PortfolioOptimizer.calculateExpectedReturns(
            instruments.slice(0, 3),
            'ai_forecast'
        );
        const duration = Date.now() - startTime;

        const hasData = expectedReturns && Object.keys(expectedReturns).length > 0;
        logTest(
            'Расчет ожидаемых доходностей (AI прогнозы)',
            hasData,
            `Рассчитано за ${duration}ms`
        );

        if (hasData) {
            console.log('   Примеры ожидаемых доходностей из AI:');
            for (const [figi, returnValue] of Object.entries(expectedReturns).slice(0, 3)) {
                const inst = instruments.find(i => i.figi === figi);
                console.log(`   - ${inst?.ticker || figi}: ${returnValue.toFixed(2)}% годовых`);
            }
        }

        return expectedReturns;
    } catch (error) {
        logTest('Ожидаемые доходности (AI)', false, error.message);
        console.error(error);
        return null;
    }
}

async function testExpectedReturnsBlended(instruments) {
    logSection('9. Тестирование расчета ожидаемых доходностей (blended)');
    
    if (!instruments || instruments.length === 0) {
        logTest('Ожидаемые доходности (blended)', false, 'Нет инструментов для тестирования');
        return null;
    }

    try {
        const startTime = Date.now();
        const expectedReturns = await PortfolioOptimizer.calculateExpectedReturns(
            instruments.slice(0, 3),
            'blended',
            {
                historicalWeight: 0.6,
                aiWeight: 0.4
            }
        );
        const duration = Date.now() - startTime;

        const validReturns = Object.values(expectedReturns).filter(r => isFinite(r)).length;
        logTest(
            'Расчет ожидаемых доходностей (blended)',
            validReturns > 0,
            `Рассчитано для ${validReturns} инструментов за ${duration}ms`
        );

        if (Object.keys(expectedReturns).length > 0) {
            console.log('   Примеры blended доходностей:');
            for (const [figi, returnValue] of Object.entries(expectedReturns).slice(0, 3)) {
                const inst = instruments.find(i => i.figi === figi);
                console.log(`   - ${inst?.ticker || figi}: ${returnValue.toFixed(2)}% годовых`);
            }
        }

        return expectedReturns;
    } catch (error) {
        logTest('Ожидаемые доходности (blended)', false, error.message);
        console.error(error);
        return null;
    }
}

async function testMeanVarianceOptimization(instruments, correlationMatrix, volatilities) {
    logSection('11. Тестирование Mean-Variance Optimization');
    
    if (!instruments || instruments.length < 2) {
        logTest('Mean-Variance Optimization', false, 'Нужно минимум 2 инструмента');
        return null;
    }

    if (!correlationMatrix || Object.keys(correlationMatrix).length === 0) {
        logTest('Mean-Variance Optimization', false, 'Нужна матрица корреляций');
        return null;
    }

    if (!volatilities || Object.keys(volatilities).length === 0) {
        logTest('Mean-Variance Optimization', false, 'Нужны данные о волатильностях');
        return null;
    }

    try {
        const testInstruments = instruments.slice(0, 3).map(inst => ({
            figi: inst.figi,
            ticker: inst.ticker,
            volatility: volatilities[inst.figi] / 100 // Конвертируем из процентов
        }));

        const startTime = Date.now();
        const result = await PortfolioOptimizer.meanVarianceOptimization({
            instruments: testInstruments,
            correlationMatrix: correlationMatrix,
            totalCapital: 1000000,
            maxPositionSize: 0.1, // 10% максимум на позицию
            minPositionSize: 0.01, // 1% минимум
            constraints: {
                maxPositions: 3
            }
        });
        const duration = Date.now() - startTime;

        const isValid = result && 
                       result.weights && 
                       typeof result.expectedReturn === 'number' &&
                       typeof result.portfolioVolatility === 'number' &&
                       typeof result.sharpeRatio === 'number' &&
                       isFinite(result.expectedReturn) &&
                       isFinite(result.portfolioVolatility) &&
                       isFinite(result.sharpeRatio);

        logTest(
            'Mean-Variance Optimization',
            isValid,
            `Выполнено за ${duration}ms, Sharpe Ratio: ${result.sharpeRatio.toFixed(3)}`
        );

        if (isValid) {
            console.log('   Результаты оптимизации:');
            console.log(`   - Ожидаемая доходность: ${result.expectedReturn.toFixed(2)}%`);
            console.log(`   - Волатильность портфеля: ${result.portfolioVolatility.toFixed(2)}%`);
            console.log(`   - Sharpe Ratio: ${result.sharpeRatio.toFixed(3)}`);
            console.log(`   - Итераций: ${result.iterations}`);
            console.log(`   - Сошлось: ${result.converged ? 'Да' : 'Нет'}`);
            
            console.log('   Распределение весов:');
            const sortedWeights = Object.entries(result.weights)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3);
            for (const [figi, weight] of sortedWeights) {
                const inst = instruments.find(i => i.figi === figi);
                console.log(`   - ${inst?.ticker || figi}: ${(weight * 100).toFixed(2)}%`);
            }

            if (result.warnings && result.warnings.length > 0) {
                console.log('   Предупреждения:');
                result.warnings.forEach(warning => {
                    console.log(`   ⚠️ ${warning}`);
                });
            }
        }

        return isValid ? result : null;
    } catch (error) {
        logTest('Mean-Variance Optimization', false, error.message);
        console.error(error);
        return null;
    }
}

async function testEfficientFrontier(instruments, correlationMatrix) {
    logSection('12. Тестирование генерации эффективной границы');
    
    if (!instruments || instruments.length < 2) {
        logTest('Эффективная граница', false, 'Нужно минимум 2 инструмента');
        return null;
    }

    if (!correlationMatrix || Object.keys(correlationMatrix).length === 0) {
        logTest('Эффективная граница', false, 'Нужна матрица корреляций');
        return null;
    }

    try {
        const testInstruments = instruments.slice(0, 3);

        const startTime = Date.now();
        const frontier = await PortfolioOptimizer.generateEfficientFrontier(
            testInstruments,
            correlationMatrix,
            10 // 10 точек для теста
        );
        const duration = Date.now() - startTime;

        const isValid = Array.isArray(frontier) && frontier.length > 0;
        logTest(
            'Генерация эффективной границы',
            isValid,
            `Сгенерировано ${frontier.length} точек за ${duration}ms`
        );

        if (isValid && frontier.length > 0) {
            console.log('   Примеры точек эффективной границы:');
            const samplePoints = frontier.slice(0, 3);
            samplePoints.forEach((point, index) => {
                console.log(`   Точка ${index + 1}:`);
                console.log(`      - Доходность: ${point.return.toFixed(2)}%`);
                console.log(`      - Риск: ${point.risk.toFixed(2)}%`);
                console.log(`      - Sharpe Ratio: ${point.sharpe.toFixed(3)}`);
            });

            // Находим точку с максимальным Sharpe Ratio
            const maxSharpePoint = frontier.reduce((max, point) => 
                point.sharpe > max.sharpe ? point : max
            );
            console.log(`   Точка с максимальным Sharpe Ratio:`);
            console.log(`      - Доходность: ${maxSharpePoint.return.toFixed(2)}%`);
            console.log(`      - Риск: ${maxSharpePoint.risk.toFixed(2)}%`);
            console.log(`      - Sharpe Ratio: ${maxSharpePoint.sharpe.toFixed(3)}`);
        }

        return isValid ? frontier : null;
    } catch (error) {
        logTest('Эффективная граница', false, error.message);
        console.error(error);
        return null;
    }
}

async function testBlackLittermanOptimization(instruments, correlationMatrix, volatilities) {
    logSection('13. Тестирование Black-Litterman Optimization');
    
    if (!instruments || instruments.length < 2) {
        logTest('Black-Litterman Optimization', false, 'Нужно минимум 2 инструмента');
        return null;
    }

    if (!correlationMatrix || Object.keys(correlationMatrix).length === 0) {
        logTest('Black-Litterman Optimization', false, 'Нужна матрица корреляций');
        return null;
    }

    if (!volatilities || Object.keys(volatilities).length === 0) {
        logTest('Black-Litterman Optimization', false, 'Нужны данные о волатильностях');
        return null;
    }

    try {
        const testInstruments = instruments.slice(0, 3).map(inst => ({
            figi: inst.figi,
            ticker: inst.ticker,
            volatility: volatilities[inst.figi] / 100 // Конвертируем из процентов
        }));

        const startTime = Date.now();
        const result = await PortfolioOptimizer.blackLittermanOptimization({
            instruments: testInstruments,
            correlationMatrix: correlationMatrix,
            totalCapital: 1000000,
            maxPositionSize: 0.1,
            minPositionSize: 0.01,
            constraints: {
                maxPositions: 3
            },
            tau: 0.05, // Масштабирующий параметр
            riskAversion: 3.0
        });
        const duration = Date.now() - startTime;

        const isValid = result && 
                       result.weights && 
                       typeof result.expectedReturn === 'number' &&
                       typeof result.portfolioVolatility === 'number' &&
                       typeof result.sharpeRatio === 'number' &&
                       isFinite(result.expectedReturn) &&
                       isFinite(result.portfolioVolatility) &&
                       isFinite(result.sharpeRatio);

        logTest(
            'Black-Litterman Optimization',
            isValid,
            `Выполнено за ${duration}ms, Sharpe Ratio: ${result.sharpeRatio.toFixed(3)}, Views: ${result.viewsCount || 0}`
        );

        if (isValid) {
            console.log('   Результаты Black-Litterman оптимизации:');
            console.log(`   - Ожидаемая доходность: ${result.expectedReturn.toFixed(2)}%`);
            console.log(`   - Волатильность портфеля: ${result.portfolioVolatility.toFixed(2)}%`);
            console.log(`   - Sharpe Ratio: ${result.sharpeRatio.toFixed(3)}`);
            console.log(`   - Итераций: ${result.iterations}`);
            console.log(`   - Сошлось: ${result.converged ? 'Да' : 'Нет'}`);
            console.log(`   - Количество views: ${result.viewsCount || 0}`);
            console.log(`   - Tau: ${result.tau}`);
            
            console.log('   Распределение весов:');
            const sortedWeights = Object.entries(result.weights)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3);
            for (const [figi, weight] of sortedWeights) {
                const inst = instruments.find(i => i.figi === figi);
                console.log(`   - ${inst?.ticker || figi}: ${(weight * 100).toFixed(2)}%`);
            }

            if (result.impliedReturns && result.impliedReturns.length > 0) {
                console.log('   Подразумеваемые доходности (примеры):');
                for (let i = 0; i < Math.min(3, result.impliedReturns.length); i++) {
                    const inst = instruments[i];
                    console.log(`   - ${inst?.ticker || 'N/A'}: ${result.impliedReturns[i].toFixed(2)}%`);
                }
            }

            if (result.blExpectedReturns && result.blExpectedReturns.length > 0) {
                console.log('   Black-Litterman доходности (примеры):');
                for (let i = 0; i < Math.min(3, result.blExpectedReturns.length); i++) {
                    const inst = instruments[i];
                    console.log(`   - ${inst?.ticker || 'N/A'}: ${result.blExpectedReturns[i].toFixed(2)}%`);
                }
            }

            if (result.warnings && result.warnings.length > 0) {
                console.log('   Предупреждения:');
                result.warnings.forEach(warning => {
                    console.log(`   ⚠️ ${warning}`);
                });
            }
        }

        return isValid ? result : null;
    } catch (error) {
        logTest('Black-Litterman Optimization', false, error.message);
        console.error(error);
        return null;
    }
}

async function testRiskParityOptimization(instruments, correlationMatrix, volatilities) {
    logSection('14. Тестирование Risk Parity Optimization');
    
    if (!instruments || instruments.length < 2) {
        logTest('Risk Parity Optimization', false, 'Нужно минимум 2 инструмента');
        return null;
    }

    if (!correlationMatrix || Object.keys(correlationMatrix).length === 0) {
        logTest('Risk Parity Optimization', false, 'Нужна матрица корреляций');
        return null;
    }

    if (!volatilities || Object.keys(volatilities).length === 0) {
        logTest('Risk Parity Optimization', false, 'Нужны данные о волатильностях');
        return null;
    }

    try {
        const testInstruments = instruments.slice(0, 3).map(inst => ({
            figi: inst.figi,
            ticker: inst.ticker,
            volatility: volatilities[inst.figi] / 100 // Конвертируем из процентов
        }));

        const startTime = Date.now();
        const result = await PortfolioOptimizer.riskParityOptimization({
            instruments: testInstruments,
            correlationMatrix: correlationMatrix,
            totalCapital: 1000000,
            maxPositionSize: 0.1,
            minPositionSize: 0.01,
            constraints: {
                maxPositions: 3
            }
            // Используем значения по умолчанию: maxIterations: 200, tolerance: 1e-3
        });
        const duration = Date.now() - startTime;

        const isValid = result && 
                       result.weights && 
                       typeof result.expectedReturn === 'number' &&
                       typeof result.portfolioVolatility === 'number' &&
                       typeof result.sharpeRatio === 'number' &&
                       typeof result.uniformity === 'number' &&
                       isFinite(result.expectedReturn) &&
                       isFinite(result.portfolioVolatility) &&
                       isFinite(result.sharpeRatio);

        logTest(
            'Risk Parity Optimization',
            isValid,
            `Выполнено за ${duration}ms, Sharpe Ratio: ${result.sharpeRatio.toFixed(3)}, Uniformity: ${(result.uniformity * 100).toFixed(1)}%`
        );

        if (isValid) {
            console.log('   Результаты Risk Parity оптимизации:');
            console.log(`   - Ожидаемая доходность: ${result.expectedReturn.toFixed(2)}%`);
            console.log(`   - Волатильность портфеля: ${result.portfolioVolatility.toFixed(2)}%`);
            console.log(`   - Sharpe Ratio: ${result.sharpeRatio.toFixed(3)}`);
            console.log(`   - Итераций: ${result.iterations}`);
            console.log(`   - Сошлось: ${result.converged ? 'Да' : 'Нет'}`);
            console.log(`   - Равномерность вкладов: ${(result.uniformity * 100).toFixed(1)}%`);
            console.log(`   - Максимальное отклонение: ${result.maxDeviation.toFixed(2)}%`);
            
            console.log('   Распределение весов:');
            const sortedWeights = Object.entries(result.weights)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3);
            for (const [figi, weight] of sortedWeights) {
                const inst = instruments.find(i => i.figi === figi);
                console.log(`   - ${inst?.ticker || figi}: ${(weight * 100).toFixed(2)}%`);
            }

            if (result.riskContributions && result.riskContributions.length > 0) {
                console.log('   Вклады в риск портфеля:');
                const contributions = result.riskContributions;
                const target = result.targetContribution;
                for (let i = 0; i < Math.min(3, contributions.length); i++) {
                    const inst = instruments[i];
                    const deviation = Math.abs(contributions[i] - target);
                    console.log(`   - ${inst?.ticker || 'N/A'}: ${contributions[i].toFixed(2)}% (целевой: ${target.toFixed(2)}%, отклонение: ${deviation.toFixed(2)}%)`);
                }
            }

            if (result.warnings && result.warnings.length > 0) {
                console.log('   Предупреждения:');
                result.warnings.forEach(warning => {
                    console.log(`   ⚠️ ${warning}`);
                });
            }
        }

        return isValid ? result : null;
    } catch (error) {
        logTest('Risk Parity Optimization', false, error.message);
        console.error(error);
        return null;
    }
}

async function testCache() {
    logSection('10. Тестирование кеширования');
    
    try {
        const statusBefore = PortfolioOptimizer.getStatus();
        const cacheSizeBefore = statusBefore.cacheSize.expectedReturns;

        // Выполняем операцию, которая должна использовать кеш
        const instruments = await CachedInstrument.findAll({
            where: {
                currency: 'rub',
                instrumentType: 'share'
            },
            limit: 2,
            attributes: ['figi', 'ticker']
        });

        if (instruments.length < 2) {
            logTest('Тест кеширования', false, 'Недостаточно инструментов');
            return false;
        }

        const insts = instruments.map(inst => ({ figi: inst.figi, ticker: inst.ticker }));

        // Первый вызов - должен создать кеш
        const start1 = Date.now();
        await PortfolioOptimizer.calculateExpectedReturns(insts, 'historical');
        const time1 = Date.now() - start1;

        // Второй вызов - должен использовать кеш
        const start2 = Date.now();
        await PortfolioOptimizer.calculateExpectedReturns(insts, 'historical');
        const time2 = Date.now() - start2;

        const statusAfter = PortfolioOptimizer.getStatus();
        const cacheSizeAfter = statusAfter.cacheSize.expectedReturns;

        const cacheWorks = cacheSizeAfter > cacheSizeBefore || time2 < time1;
        logTest(
            'Кеширование работает',
            cacheWorks,
            `Первый вызов: ${time1}ms, Второй (из кеша): ${time2}ms, Размер кеша: ${cacheSizeAfter}`
        );

        // Тестируем очистку кеша
        PortfolioOptimizer.clearCache();
        const statusAfterClear = PortfolioOptimizer.getStatus();
        const cacheCleared = statusAfterClear.cacheSize.expectedReturns === 0 &&
                            statusAfterClear.cacheSize.correlation === 0 &&
                            statusAfterClear.cacheSize.covariance === 0;
        logTest('Очистка кеша', cacheCleared, 'Кеш очищен');

        return cacheWorks;
    } catch (error) {
        logTest('Тест кеширования', false, error.message);
        console.error(error);
        return false;
    }
}

async function runAllTests() {
    log('\n' + '='.repeat(60), 'cyan');
    log('ТЕСТИРОВАНИЕ PORTFOLIO OPTIMIZER (ЭТАПЫ 1-4)', 'cyan');
    log('='.repeat(60) + '\n', 'cyan');
    
    const results = {
        passed: 0,
        failed: 0,
        tests: []
    };

    try {
        // Инициализация БД
        console.log('🔧 Инициализация базы данных...');
        try {
            await initDatabase();
            console.log('✅ База данных инициализирована\n');
        } catch (dbError) {
            if (dbError.message && dbError.message.includes('password must be a string')) {
                console.error('❌ Ошибка подключения к БД: пароль не установлен или не является строкой');
                await sequelize.close().catch(() => {});
                process.exit(1);
            }
            if (dbError.name === 'SequelizeUniqueConstraintError' && 
                dbError.original && dbError.original.code === '23505' &&
                dbError.original.detail && dbError.original.detail.includes('enum_')) {
                console.log('✅ База данных инициализирована (ENUM типы уже существуют)\n');
            } else {
                throw dbError;
            }
        }

        // Инициализация сервисов
        if (!CorrelationService.isInitialized) {
            await CorrelationService.initialize();
        }
        if (!CacheService.isInitialized) {
            await CacheService.initialize();
        }

        // Запускаем тесты
        const tests = [
            { name: 'Инициализация', fn: testInitialization },
            { name: 'Получение инструментов', fn: testGetInstruments }
        ];

        let instruments = null;
        for (const test of tests) {
            try {
                const result = await test.fn();
                results.tests.push({ name: test.name, passed: !!result });
                if (result) {
                    results.passed++;
                    if (test.name === 'Получение инструментов') {
                        instruments = result;
                    }
                } else {
                    results.failed++;
                }
            } catch (error) {
                logTest(test.name, false, error.message);
                results.tests.push({ name: test.name, passed: false });
                results.failed++;
            }
        }

        // Продолжаем только если есть инструменты
        if (instruments && instruments.length >= 2) {
            const volatilities = await testVolatilityCalculation(instruments);
            results.tests.push({ name: 'Расчет волатильности', passed: !!volatilities });
            if (volatilities) results.passed++; else results.failed++;

            const volatilitiesBatch = await testGetVolatilities(instruments);
            results.tests.push({ name: 'Массовый расчет волатильностей', passed: !!volatilitiesBatch });
            if (volatilitiesBatch) results.passed++; else results.failed++;

            const correlationMatrix = await testCorrelationMatrix(instruments);
            results.tests.push({ name: 'Матрица корреляций', passed: !!correlationMatrix });
            if (correlationMatrix) results.passed++; else results.failed++;

            const covarianceMatrix = await testCovarianceMatrix(instruments, volatilitiesBatch || volatilities, correlationMatrix);
            results.tests.push({ name: 'Матрица ковариаций', passed: !!covarianceMatrix });
            if (covarianceMatrix) results.passed++; else results.failed++;

            const historicalReturns = await testExpectedReturnsHistorical(instruments);
            results.tests.push({ name: 'Ожидаемые доходности (исторические)', passed: !!historicalReturns });
            if (historicalReturns) results.passed++; else results.failed++;

            const aiReturns = await testExpectedReturnsAI(instruments);
            results.tests.push({ name: 'Ожидаемые доходности (AI)', passed: !!aiReturns });
            if (aiReturns) results.passed++; else results.failed++;

            const blendedReturns = await testExpectedReturnsBlended(instruments);
            results.tests.push({ name: 'Ожидаемые доходности (blended)', passed: !!blendedReturns });
            if (blendedReturns) results.passed++; else results.failed++;

            const cacheTest = await testCache();
            results.tests.push({ name: 'Кеширование', passed: cacheTest });
            if (cacheTest) results.passed++; else results.failed++;

            // Этап 2: Mean-Variance Optimization
            const mvOptimization = await testMeanVarianceOptimization(instruments, correlationMatrix, volatilitiesBatch || volatilities);
            results.tests.push({ name: 'Mean-Variance Optimization', passed: !!mvOptimization });
            if (mvOptimization) results.passed++; else results.failed++;

            const efficientFrontier = await testEfficientFrontier(instruments, correlationMatrix);
            results.tests.push({ name: 'Эффективная граница', passed: !!efficientFrontier });
            if (efficientFrontier) results.passed++; else results.failed++;

            // Этап 3: Black-Litterman Optimization
            const blOptimization = await testBlackLittermanOptimization(instruments, correlationMatrix, volatilitiesBatch || volatilities);
            results.tests.push({ name: 'Black-Litterman Optimization', passed: !!blOptimization });
            if (blOptimization) results.passed++; else results.failed++;

            // Этап 4: Risk Parity Optimization
            const rpOptimization = await testRiskParityOptimization(instruments, correlationMatrix, volatilitiesBatch || volatilities);
            results.tests.push({ name: 'Risk Parity Optimization', passed: !!rpOptimization });
            if (rpOptimization) results.passed++; else results.failed++;
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
    } catch (error) {
        console.error('\n❌ Критическая ошибка при выполнении тестов:', error.message);
        console.error(error.stack);
        
        try {
            await sequelize.close();
        } catch (closeError) {
            // Игнорируем ошибки закрытия
        }
        
        return false;
    }
}

// Запускаем тесты
runAllTests()
    .then(success => {
        process.exit(success ? 0 : 1);
    })
    .catch(error => {
        console.error('Критическая ошибка:', error);
        process.exit(1);
    });

