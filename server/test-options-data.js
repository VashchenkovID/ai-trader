/**
 * Тестовый скрипт для проверки OptionsDataService
 * Проверяет получение опционов, вычисление IV и интеграцию с нейросетью
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initDatabase } from './src/utils/initDatabase.js';
import sequelize from './src/config/database.js';
import OptionsDataService from './src/services/OptionsDataService.js';
import CacheService from './src/services/CacheService.js';
import TinkoffApiService from './src/services/TinkoffApiService.js';
import AssetSyncService from './src/services/AssetSyncService.js';
import CachedInstrument from './src/models/CachedInstrument.js';
import OptionsData from './src/models/OptionsData.js';
import { calculateImpliedVolatility, blackScholesPrice } from './src/utils/blackScholes.js';

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
    const status = passed ? '✅' : '❌';
    const color = passed ? 'green' : 'red';
    log(`${status} ${name}`, color);
    if (details) {
        console.log(`   ${details}`);
    }
}

/**
 * Тест 1: Инициализация сервиса
 */
async function testInitialization() {
    logSection('ТЕСТ 1: Инициализация OptionsDataService');
    
    try {
        await OptionsDataService.initialize();
        
        if (OptionsDataService.isInitialized) {
            logTest('Инициализация сервиса', true);
            return true;
        } else {
            logTest('Инициализация сервиса', false, 'Сервис не был инициализирован');
            return false;
        }
    } catch (error) {
        logTest('Инициализация сервиса', false, `Ошибка: ${error.message}`);
        console.error(error);
        return false;
    }
}

/**
 * Тест 2: Получение инструмента с опционами
 */
async function testGetInstrumentWithOptions() {
    logSection('ТЕСТ 2: Поиск инструмента с опционами');
    
    try {
        // Инициализируем CacheService для получения инструментов
        if (!CacheService.isInitialized) {
            await CacheService.initialize();
        }
        
        // Получаем список активных инструментов, предпочитая популярные
        // Популярные инструменты с опционами: SBER, GAZP, LKOH, YNDX, GMKN, ROSN, TATN, ALRS
        const popularTickers = ['SBER', 'GAZP', 'LKOH', 'YNDX', 'GMKN', 'ROSN', 'TATN', 'ALRS'];
        
        let testInstrument = null;
        
        // Сначала пытаемся найти популярные инструменты
        for (const ticker of popularTickers) {
            const instrument = await CachedInstrument.findOne({
                where: { 
                    isActive: true,
                    ticker: ticker
                }
            });
            if (instrument) {
                testInstrument = instrument;
                log(`Найден популярный инструмент: ${ticker} (${instrument.figi})`, 'green');
                break;
            }
        }
        
        // Если не нашли популярные, берем любой активный
        if (!testInstrument) {
            const instruments = await CachedInstrument.findAll({
                where: { isActive: true },
                limit: 10,
                order: [['lastUpdated', 'DESC']]
            });
            
            if (instruments.length > 0) {
                testInstrument = instruments[0];
                log(`Используем инструмент: ${testInstrument.ticker} (${testInstrument.figi})`, 'yellow');
            }
        }
        
        if (!testInstrument) {
            logTest('Поиск инструментов', false, 'Не найдено активных инструментов');
            return null;
        }
        
        log(`Тестируем инструмент: ${testInstrument.ticker} (${testInstrument.figi})`);
        
        return testInstrument;
    } catch (error) {
        logTest('Поиск инструментов', false, `Ошибка: ${error.message}`);
        console.error(error);
        return null;
    }
}

/**
 * Тест 3: Получение asset_uid по FIGI
 */
async function testGetAssetUid(testInstrument) {
    logSection('ТЕСТ 3: Получение asset_uid по FIGI');
    
    if (!testInstrument) {
        logTest('Получение asset_uid', false, 'Тестовый инструмент не найден');
        return null;
    }
    
    try {
        const assetUid = await AssetSyncService.getAssetUidByFigi(testInstrument.figi);
        
        if (assetUid) {
            logTest('Получение asset_uid', true, `asset_uid: ${assetUid}`);
            return assetUid;
        } else {
            logTest('Получение asset_uid', false, 'asset_uid не найден для данного FIGI');
            return null;
        }
    } catch (error) {
        logTest('Получение asset_uid', false, `Ошибка: ${error.message}`);
        console.error(error);
        return null;
    }
}

/**
 * Тест 4: Получение опционов из API
 */
async function testGetOptionsFromAPI(assetUid) {
    logSection('ТЕСТ 4: Получение опционов из Tinkoff API');
    
    if (!assetUid) {
        logTest('Получение опционов', false, 'asset_uid не найден');
        return [];
    }
    
    try {
        const options = await TinkoffApiService.getOptionsBy({
            basicAssetUid: assetUid
        });
        
        if (options && options.length > 0) {
            logTest('Получение опционов', true, `Найдено опционов: ${options.length}`);
            log(`Пример опциона:`, 'blue');
            console.log(JSON.stringify(options[0], null, 2));
            return options;
        } else {
            logTest('Получение опционов', false, 'Опционы не найдены (возможно, для данного инструмента нет опционов)');
            return [];
        }
    } catch (error) {
        logTest('Получение опционов', false, `Ошибка: ${error.message}`);
        console.error(error);
        return [];
    }
}

/**
 * Тест 5: Сохранение опционов в БД
 */
async function testSaveOptions(testInstrument) {
    logSection('ТЕСТ 5: Сохранение опционов в БД');
    
    if (!testInstrument) {
        logTest('Сохранение опционов', false, 'Тестовый инструмент не найден');
        return false;
    }
    
    try {
        const savedOptions = await OptionsDataService.fetchAndSaveOptions(testInstrument.figi, false);
        
        if (savedOptions && savedOptions.length > 0) {
            logTest('Сохранение опционов', true, `Сохранено опционов: ${savedOptions.length}`);
            
            // Показываем пример сохраненного опциона
            if (savedOptions[0]) {
                const option = savedOptions[0];
                log(`Пример сохраненного опциона:`, 'blue');
                console.log({
                    figi: option.figi,
                    baseFigi: option.baseFigi,
                    optionType: option.optionType,
                    strikePrice: option.strikePrice?.toString(),
                    expirationDate: option.expirationDate,
                    currentPrice: option.currentPrice?.toString(),
                    impliedVolatility: option.impliedVolatility?.toString(),
                    timeToExpiration: option.timeToExpiration?.toString()
                });
            }
            
            return true;
        } else {
            logTest('Сохранение опционов', false, 'Опционы не были сохранены (возможно, для данного инструмента нет опционов)');
            return false;
        }
    } catch (error) {
        logTest('Сохранение опционов', false, `Ошибка: ${error.message}`);
        console.error(error);
        return false;
    }
}

/**
 * Тест 6: Вычисление IV через Black-Scholes
 */
async function testCalculateIV() {
    logSection('ТЕСТ 6: Вычисление Implied Volatility');
    
    try {
        // Тестовые параметры
        const S = 100; // Текущая цена актива
        const K = 105; // Страйк
        const T = 0.25; // Время до экспирации (3 месяца)
        const r = 0.16; // Безрисковая ставка (16%)
        const marketPrice = 3.5; // Рыночная цена опциона
        
        // Вычисляем IV
        const iv = calculateImpliedVolatility(marketPrice, S, K, T, r, 'call');
        
        if (iv !== null && iv > 0) {
            logTest('Вычисление IV', true, `IV: ${(iv * 100).toFixed(2)}%`);
            
            // Проверяем обратную операцию - вычисляем цену опциона с полученной IV
            const calculatedPrice = blackScholesPrice(S, K, T, r, iv, 'call');
            const priceDiff = Math.abs(marketPrice - calculatedPrice);
            
            log(`Проверка: рыночная цена = ${marketPrice}, вычисленная цена = ${calculatedPrice.toFixed(4)}`);
            log(`Разница: ${priceDiff.toFixed(4)}`, priceDiff < 0.01 ? 'green' : 'yellow');
            
            return true;
        } else {
            logTest('Вычисление IV', false, 'Не удалось вычислить IV');
            return false;
        }
    } catch (error) {
        logTest('Вычисление IV', false, `Ошибка: ${error.message}`);
        console.error(error);
        return false;
    }
}

/**
 * Тест 7: Получение ATM опционов
 */
async function testGetATMOptions(testInstrument) {
    logSection('ТЕСТ 7: Получение ATM опционов');
    
    if (!testInstrument) {
        logTest('Получение ATM опционов', false, 'Тестовый инструмент не найден');
        return false;
    }
    
    try {
        const atmOptions = await OptionsDataService.getATMOptions(testInstrument.figi);
        
        if (atmOptions && atmOptions.length > 0) {
            logTest('Получение ATM опционов', true, `Найдено ATM опционов: ${atmOptions.length}`);
            
            // Показываем примеры
            log(`Примеры ATM опционов:`, 'blue');
            atmOptions.slice(0, 3).forEach((opt, idx) => {
                const iv = opt.impliedVolatility ? (typeof opt.impliedVolatility === 'number' ? opt.impliedVolatility.toFixed(2) : parseFloat(opt.impliedVolatility).toFixed(2)) : 'N/A';
                console.log(`${idx + 1}. Страйк: ${opt.strikePrice}, IV: ${iv}%, Экспирация: ${opt.expirationDate}`);
            });
            
            return true;
        } else {
            logTest('Получение ATM опционов', false, 'ATM опционы не найдены');
            return false;
        }
    } catch (error) {
        logTest('Получение ATM опционов', false, `Ошибка: ${error.message}`);
        console.error(error);
        return false;
    }
}

/**
 * Тест 8: Получение опционных фичей
 */
async function testGetOptionsFeatures(testInstrument) {
    logSection('ТЕСТ 8: Получение опционных фичей для нейросети');
    
    if (!testInstrument) {
        logTest('Получение опционных фичей', false, 'Тестовый инструмент не найден');
        return false;
    }
    
    try {
        const features = await OptionsDataService.getOptionsFeatures(testInstrument.figi);
        
        if (features && features.length >= 3) {
            logTest('Получение опционных фичей', true, `Получено фичей: ${features.length}`);
            log(`Опционные фичи:`, 'blue');
            console.log({
                currentIV: features[0].toFixed(4),
                avgIV30d: features[1].toFixed(4),
                ivRank: features[2].toFixed(4),
                hasOptionsData: features[3] || 0
            });
            
            return true;
        } else {
            logTest('Получение опционных фичей', false, 'Не удалось получить фичи');
            return false;
        }
    } catch (error) {
        logTest('Получение опционных фичей', false, `Ошибка: ${error.message}`);
        console.error(error);
        return false;
    }
}

/**
 * Тест 9: Проверка данных в БД
 */
async function testDatabaseData() {
    logSection('ТЕСТ 9: Проверка данных в БД');
    
    try {
        const count = await OptionsData.count();
        logTest('Подсчет опционов в БД', true, `Всего опционов в БД: ${count}`);
        
        if (count > 0) {
            // Показываем примеры
            const sampleOptions = await OptionsData.findAll({
                limit: 5,
                order: [['createdAt', 'DESC']]
            });
            
            log(`Примеры записей в БД:`, 'blue');
            sampleOptions.forEach((opt, idx) => {
                const iv = opt.impliedVolatility ? (typeof opt.impliedVolatility === 'number' ? opt.impliedVolatility.toFixed(2) : parseFloat(opt.impliedVolatility).toFixed(2)) : 'N/A';
                console.log(`${idx + 1}. ${opt.baseFigi} | ${opt.optionType} | Страйк: ${opt.strikePrice} | IV: ${iv}%`);
            });
        }
        
        return true;
    } catch (error) {
        logTest('Проверка данных в БД', false, `Ошибка: ${error.message}`);
        console.error(error);
        return false;
    }
}

/**
 * Основная функция тестирования
 */
async function runAllTests() {
    log('\n' + '='.repeat(60), 'cyan');
    log('ТЕСТИРОВАНИЕ OPTIONSDATASERVICE', 'cyan');
    log('='.repeat(60) + '\n', 'cyan');
    
    const results = {
        passed: 0,
        failed: 0,
        tests: []
    };
    
    try {
        // Инициализация БД
        logSection('ИНИЦИАЛИЗАЦИЯ');
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
            console.error('❌ Ошибка инициализации БД:', dbError.message);
            throw dbError;
        }
        
        // Инициализация сервисов
        if (!CacheService.isInitialized) {
            await CacheService.initialize();
        }
        if (!AssetSyncService.isInitialized) {
            await AssetSyncService.initialize();
        }
        
        // Запускаем тесты
        const initTest = await testInitialization();
        results.tests.push({ name: 'Инициализация', passed: initTest });
        if (initTest) results.passed++; else results.failed++;
        
        const testInstrument = await testGetInstrumentWithOptions();
        results.tests.push({ name: 'Поиск инструмента', passed: !!testInstrument });
        if (testInstrument) results.passed++; else results.failed++;
        
        const assetUid = await testGetAssetUid(testInstrument);
        results.tests.push({ name: 'Получение asset_uid', passed: !!assetUid });
        if (assetUid) results.passed++; else results.failed++;
        
        const options = await testGetOptionsFromAPI(assetUid);
        results.tests.push({ name: 'Получение опционов из API', passed: options.length > 0 });
        if (options.length > 0) results.passed++; else results.failed++;
        
        const saveTest = await testSaveOptions(testInstrument);
        results.tests.push({ name: 'Сохранение опционов', passed: saveTest });
        if (saveTest) results.passed++; else results.failed++;
        
        const ivTest = await testCalculateIV();
        results.tests.push({ name: 'Вычисление IV', passed: ivTest });
        if (ivTest) results.passed++; else results.failed++;
        
        const atmTest = await testGetATMOptions(testInstrument);
        results.tests.push({ name: 'Получение ATM опционов', passed: atmTest });
        if (atmTest) results.passed++; else results.failed++;
        
        const featuresTest = await testGetOptionsFeatures(testInstrument);
        results.tests.push({ name: 'Получение опционных фичей', passed: featuresTest });
        if (featuresTest) results.passed++; else results.failed++;
        
        const dbTest = await testDatabaseData();
        results.tests.push({ name: 'Проверка данных в БД', passed: dbTest });
        if (dbTest) results.passed++; else results.failed++;
        
        // Выводим итоговую статистику
        logSection('ИТОГОВАЯ СТАТИСТИКА');
        
        console.log(`Всего тестов: ${results.tests.length}`);
        log(`Пройдено: ${results.passed}`, 'green');
        log(`Провалено: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
        console.log('\nДетали тестов:');
        results.tests.forEach(test => {
            logTest(test.name, test.passed);
        });
        
        // Закрываем соединение с БД
        await sequelize.close();
        
        log('\n✅ Тестирование завершено', 'green');
        
        process.exit(results.failed > 0 ? 1 : 0);
        
    } catch (error) {
        log('\n❌ Критическая ошибка при тестировании', 'red');
        console.error(error);
        await sequelize.close().catch(() => {});
        process.exit(1);
    }
}

// Запускаем тесты
runAllTests();

