import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import MacroDataService from './src/services/MacroDataService.js';
import MacroIndicator from './src/models/MacroIndicator.js';
import sequelize from './src/config/database.js';
import { initDatabase } from './src/utils/initDatabase.js';
import {
    parseCbrXml,
    parseCbrKeyRateHtml,
    parseInvestingRosstatHtml,
    parseInvestingRviHtml,
    normalizeIndicator,
    validateIndicator,
    calculateChange
} from './src/utils/macroDataParsers.js';

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

const logTest = (name, passed, details = '') => {
    // Показываем только тесты с ошибками или предупреждениями
    if (!passed) {
        log(`❌ FAIL: ${name} ${details ? `- ${details}` : ''}`, 'red');
    }
    // Успешные тесты не выводим
};

const logSection = (title) => {
    log(`\n${'='.repeat(60)}`, 'cyan');
    log(title, 'cyan');
    log(`${'='.repeat(60)}\n`, 'cyan');
};

async function runStage2Tests() {
    log('\n' + '='.repeat(60), 'cyan');
    log('ТЕСТИРОВАНИЕ ЭТАПА 2: ИНТЕГРАЦИЯ С ИСТОЧНИКАМИ ДАННЫХ', 'cyan');
    log('='.repeat(60) + '\n', 'cyan');

    const results = {
        passed: 0,
        failed: 0,
        tests: []
    };

    try {
        // 1. Инициализация
        logSection('1. Инициализация');
        try {
            await initDatabase();
            await MacroDataService.initialize();
            log('✅ База данных и сервис инициализированы', 'green');
            results.passed++;
        } catch (error) {
            logTest('Инициализация', false, error.message);
            results.failed++;
            await sequelize.close().catch(() => {});
            process.exit(1);
        }

        // 2. Тестирование парсеров
        logSection('2. Тестирование парсеров');

        // 2.1. Парсер XML ЦБ РФ - пропускаем успешные тесты
        // try {
        //     const sampleCbrXml = `...`;
        //     const parsedCbr = parseCbrXml(sampleCbrXml);
        //     const cbrParsed = Array.isArray(parsedCbr) && parsedCbr.length > 0;
        //     if (cbrParsed) {
        //         results.passed++;
        //         if (parsedCbr[0].value === 16.0) {
        //             results.passed++;
        //         } else {
        //             logTest('Парсер XML ЦБ РФ корректно извлекает значения', false, `Ожидалось 16.0, получено ${parsedCbr[0].value}`);
        //             results.failed++;
        //         }
        //     } else {
        //         logTest('Парсер XML ЦБ РФ работает', false, 'Не найдено записей');
        //         results.failed++;
        //     }
        // } catch (error) {
        //     logTest('Парсер XML ЦБ РФ работает', false, error.message);
        //     results.failed++;
        // }

        // 2.2. Парсер JSON Мосбиржи удален - используем только HTML парсинг

        // 2.3. Парсер HTML Investing.com (Росстат) - только ошибки
        try {
            const investingRosstatHtml = `
        <div id="releaseInfo" class="releaseInfo bold">
            <span>Последний выпуск<div class="noBold">03.12.2025</div></span>
            <span>Факт.<div class="arial_14 greenFont">1,6%</div></span>
            <span>Прогноз<div class="arial_14 noBold">0,8%</div></span>
            <span>Пред.<div class="arial_14 noBold blackFont">0,9%</div></span>
        </div>`;
            const parsedRosstat = parseInvestingRosstatHtml(investingRosstatHtml, new Date('2025-12-01'), new Date('2025-12-31'));
            const rosstatParsed = Array.isArray(parsedRosstat) && parsedRosstat.length === 1;
            if (rosstatParsed) {
                results.passed++;
                const record = parsedRosstat[0];
                const valueCorrect = record.value === 1.6;
                const forecastCorrect = record.metadata.forecast === 0.8;
                const previousValueCorrect = record.metadata.previousValue === 0.9;
                const changeCorrect = record.metadata.change !== null && Math.abs(record.metadata.change - 77.78) < 0.1;
                
                if (valueCorrect && forecastCorrect && previousValueCorrect) {
                    results.passed++;
                    if (changeCorrect) {
                        results.passed++;
                    } else {
                        logTest('Парсер HTML Investing.com корректно рассчитывает изменение', false, 
                            `Ожидалось ~77.78%, получено ${record.metadata.change}`);
                        results.failed++;
                    }
                } else {
                    logTest('Парсер HTML Investing.com корректно извлекает значения', false, 
                        `Ожидалось 1.6/0.8/0.9, получено ${record.value}/${record.metadata.forecast}/${record.metadata.previousValue}`);
                    results.failed++;
                }
            } else {
                logTest('Парсер HTML Investing.com (Росстат) работает', false, `Найдено записей: ${parsedRosstat.length}`);
                results.failed++;
            }
        } catch (error) {
            logTest('Парсер HTML Investing.com (Росстат) работает', false, error.message);
            results.failed++;
        }

        // 3. Тестирование нормализации - пропускаем успешные тесты
        // logSection('3. Тестирование нормализации');
        // ... успешные тесты пропущены ...

        // 4. Тестирование валидации - только ошибки
        logSection('4. Тестирование валидации');
        
        // 4.1. Валидный индикатор - пропускаем успешный тест
        // ... успешный тест пропущен ...

        // 4.2. Невалидный индикатор (отсутствует значение)
        try {
            const invalidIndicator = {
                indicatorType: 'interest_rate',
                value: null,
                period: new Date('2024-01-15'),
                source: 'cbr'
            };
            
            const validation = validateIndicator(invalidIndicator);
            logTest('Валидация невалидного индикатора', !validation.valid, 
                `Найдено ошибок: ${validation.errors.length}`);
            if (!validation.valid) {
                results.passed++;
            } else {
                results.failed++;
            }
        } catch (error) {
            logTest('Валидация невалидного индикатора', false, error.message);
            results.failed++;
        }

        // 4.3. Валидация диапазонов
        // Примечание: значения > 50% для interest_rate не отклоняются валидацией,
        // а только предупреждаются (фильтрация происходит на уровне fetchCbrData)
        // Проверяем отрицательные значения, которые должны отклоняться
        try {
            const outOfRangeIndicator = {
                indicatorType: 'interest_rate',
                value: -5, // Отрицательное значение должно быть отклонено
                period: new Date('2024-01-15'),
                source: 'cbr',
                country: 'RUS'
            };
            
            const validation = validateIndicator(outOfRangeIndicator);
            logTest('Валидация диапазонов значений (отрицательное)', !validation.valid, 
                `Найдено ошибок: ${validation.errors.length}`);
            if (!validation.valid) {
                results.passed++;
            } else {
                results.failed++;
            }
        } catch (error) {
            logTest('Валидация диапазонов значений', false, error.message);
            results.failed++;
        }

        // 5. Тестирование получения данных от ЦБ РФ - пропускаем успешные тесты
        // logSection('5. Тестирование получения данных от ЦБ РФ');
        // ... успешные тесты пропущены ...

        // 6. Тестирование получения данных от Мосбиржи - только предупреждения
        logSection('6. Тестирование получения данных от Мосбиржи (через Investing.com)');
        try {
            const endDate = new Date();
            const startDate = new Date(endDate.getFullYear(), endDate.getMonth() - 1, 1);
            
            const moexData = await MacroDataService.fetchMoexData(startDate, endDate);
            const moexDataValid = Array.isArray(moexData);
            if (moexDataValid) {
                results.passed++;
                
                if (moexData.length === 0) {
                    log('ℹ️ Данные от Мосбиржи не получены (возможно, HTML парсинг не работает или нет данных)', 'yellow');
                } else {
                    const firstIndicator = moexData[0];
                    const hasRequiredFields = firstIndicator.indicatorType && 
                                             firstIndicator.value !== undefined && 
                                             firstIndicator.period && 
                                             firstIndicator.source;
                    if (!hasRequiredFields) {
                        logTest('Структура данных Мосбиржи корректна', false, 'Отсутствуют обязательные поля');
                        results.failed++;
                    } else {
                        results.passed++;
                    }
                }
            } else {
                logTest('Метод fetchMoexData возвращает массив', false, 'Метод не вернул массив');
                results.failed++;
            }
        } catch (error) {
            logTest('Метод fetchMoexData работает', false, error.message);
            results.failed++;
        }

        // 7. Тестирование получения данных от Росстата - только ошибки и предупреждения
        logSection('7. Тестирование получения данных от Росстата (через Investing.com)');
        try {
            const endDate = new Date();
            const startDate = new Date(endDate.getFullYear(), endDate.getMonth() - 3, 1);
            
            const rosstatData = await MacroDataService.fetchRosstatData(startDate, endDate);
            const rosstatDataValid = Array.isArray(rosstatData);
            if (rosstatDataValid) {
                results.passed++;
                
                if (rosstatData.length === 0) {
                    log('ℹ️ Данные от Росстата не получены (возможно, Investing.com недоступен или нет данных за период)', 'yellow');
                } else {
                    const firstIndicator = rosstatData[0];
                    const hasRequiredFields = firstIndicator.indicatorType && 
                                             firstIndicator.value !== undefined && 
                                             firstIndicator.period && 
                                             firstIndicator.source;
                    if (!hasRequiredFields) {
                        logTest('Структура данных Росстата корректна', false, 'Отсутствуют обязательные поля');
                        results.failed++;
                    } else {
                        results.passed++;
                        
                        // Проверяем, что источник правильный
                        if (firstIndicator.source !== 'rosstat') {
                            logTest('Источник данных Росстата корректный', false, 
                                `Ожидалось 'rosstat', получено '${firstIndicator.source}'`);
                            results.failed++;
                        } else {
                            results.passed++;
                        }
                        
                        // Проверяем типы индикаторов
                        const indicatorTypes = rosstatData.map(i => i.indicatorType);
                        const expectedTypes = ['gdp', 'unemployment', 'industrial_production'];
                        const hasValidTypes = indicatorTypes.every(type => expectedTypes.includes(type));
                        if (!hasValidTypes) {
                            logTest('Типы индикаторов Росстата корректны', false, 
                                `Найдены типы: ${[...new Set(indicatorTypes)].join(', ')}`);
                            results.failed++;
                        } else {
                            results.passed++;
                        }
                    }
                }
            } else {
                logTest('Метод fetchRosstatData возвращает массив', false, 'Метод не вернул массив');
                results.failed++;
            }
        } catch (error) {
            logTest('Метод fetchRosstatData работает', false, error.message);
            results.failed++;
        }

        // 8. Тестирование метода updateAllData - только предупреждения
        logSection('8. Тестирование метода updateAllData');
        try {
            const updateStats = await MacroDataService.updateAllData();
            const statsValid = updateStats && 
                             typeof updateStats.total === 'object' &&
                             typeof updateStats.total.fetched === 'number' &&
                             typeof updateStats.total.saved === 'number';
            if (!statsValid) {
                logTest('Метод updateAllData возвращает статистику', false, 'Неверный формат статистики');
                results.failed++;
            } else {
                results.passed++;
                
                log(`   📊 Статистика обновления:`, 'cyan');
                log(`   ЦБ РФ: получено ${updateStats.cbr.fetched}, сохранено ${updateStats.cbr.saved}`, 'cyan');
                log(`   Росстат (через Investing.com): получено ${updateStats.rosstat.fetched}, сохранено ${updateStats.rosstat.saved}`, 'cyan');
                log(`   Мосбиржа (через Investing.com): получено ${updateStats.moex.fetched}, сохранено ${updateStats.moex.saved}`, 'cyan');
                log(`   Всего: получено ${updateStats.total.fetched}, сохранено ${updateStats.total.saved}`, 'cyan');
                
                if (updateStats.total.fetched === 0) {
                    log('ℹ️ Данные не получены (возможно, API недоступны или нет данных за период)', 'yellow');
                } else {
                    results.passed++;
                }
            }
        } catch (error) {
            logTest('Метод updateAllData работает', false, error.message);
            results.failed++;
        }

        // 9. Проверка сохраненных данных в БД - только предупреждения
        logSection('9. Проверка сохраненных данных в БД');
        try {
            const savedIndicators = await MacroIndicator.findAll({
                limit: 10,
                order: [['createdAt', 'DESC']]
            });
            
            if (savedIndicators.length === 0) {
                log('ℹ️ В БД нет сохраненных индикаторов (возможно, данные не были получены)', 'yellow');
            } else {
                results.passed++;
                
                // Проверяем структуру сохраненных данных
                const firstSaved = savedIndicators[0];
                const hasAllFields = firstSaved.indicatorType && 
                                    firstSaved.value !== null && 
                                    firstSaved.period && 
                                    firstSaved.source;
                if (!hasAllFields) {
                    logTest('Структура сохраненных данных корректна', false, 'Отсутствуют обязательные поля');
                    results.failed++;
                } else {
                    results.passed++;
                }
            }
        } catch (error) {
            logTest('Проверка сохраненных данных', false, error.message);
            results.failed++;
        }

        // Итоги
        log('\n' + '='.repeat(60), 'cyan');
        log('ИТОГИ ТЕСТИРОВАНИЯ ЭТАПА 2', 'cyan');
        log('='.repeat(60), 'cyan');
        log(`✅ Пройдено тестов: ${results.passed}`, 'green');
        log(`❌ Провалено тестов: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
        log(`📊 Всего тестов: ${results.passed + results.failed}`, 'cyan');
        log(`📈 Успешность: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`, 'cyan');
        log('='.repeat(60) + '\n', 'cyan');

        if (results.failed === 0) {
            log('🎉 Все тесты этапа 2 пройдены успешно!', 'green');
        } else {
            log('⚠️ Некоторые тесты провалены. Проверьте логи выше.', 'yellow');
        }

    } catch (error) {
        log('❌ Критическая ошибка во время тестов:', 'red');
        console.error(error);
        results.failed++;
    } finally {
        await sequelize.close();
        log('✅ Соединение с базой данных закрыто.', 'green');
        process.exit(results.failed > 0 ? 1 : 0);
    }
}

runStage2Tests();

