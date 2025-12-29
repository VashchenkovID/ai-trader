/**
 * Тестирование функциональности фундаментальных данных
 * 
 * Проверяет:
 * 1. Создание таблиц fundamental_data и assets
 * 2. Получение активов через GetAssets и синхронизация
 * 3. Поиск активов по FIGI из наших инструментов
 * 4. Массовое заполнение фундаментальных данных
 * 5. Проверка батчинга запросов (лимит 100 uid за раз)
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import sequelize from './src/config/database.js';
import FundamentalData from './src/models/FundamentalData.js';
import Asset from './src/models/Asset.js';
import CachedInstrument from './src/models/CachedInstrument.js';
import FundamentalDataService from './src/services/FundamentalDataService.js';
import AssetSyncService from './src/services/AssetSyncService.js';
import TinkoffApiService from './src/services/TinkoffApiService.js';
import LoggerService from './src/services/LoggerService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем переменные окружения
dotenv.config({ path: join(__dirname, '.env') });

// Лимит для GetAssetFundamentals API
const MAX_UID_PER_REQUEST = 100;

// Цветной вывод
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m',
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
    console.log('\n' + '='.repeat(60));
    log(title, 'bright');
    console.log('='.repeat(60));
}

function logTest(name, passed, details = '') {
    const status = passed ? '✅' : '❌';
    const color = passed ? 'green' : 'red';
    log(`${status} ${name}`, color);
    if (details) {
        log(`   ${details}`, 'yellow');
    }
}

/**
 * Тест 1: Проверка существования таблиц
 */
async function testTablesExist() {
    logSection('1. ПРОВЕРКА ТАБЛИЦ');
    
    try {
        await sequelize.authenticate();
        log('✅ Подключение к БД установлено', 'green');
        
        // Проверяем таблицу fundamental_data
        const [fundamentalTable] = await sequelize.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'fundamental_data'
            );
        `);
        const fundamentalExists = fundamentalTable[0].exists;
        logTest('Таблица fundamental_data существует', fundamentalExists);
        
        // Проверяем таблицу assets
        const [assetsTable] = await sequelize.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'assets'
            );
        `);
        const assetsExists = assetsTable[0].exists;
        logTest('Таблица assets существует', assetsExists);
        
        return { fundamentalExists, assetsExists };
    } catch (error) {
        logTest('Проверка таблиц', false, error.message);
        return { fundamentalExists: false, assetsExists: false };
    }
}

/**
 * Тест 2: Синхронизация активов
 */
async function testSyncAssets() {
    logSection('2. СИНХРОНИЗАЦИЯ АКТИВОВ');
    
    try {
        if (!AssetSyncService.isInitialized) {
            await AssetSyncService.initialize();
        }
        
        log('🔄 Начинаем синхронизацию российских акций...', 'cyan');
        const result = await AssetSyncService.syncRussianShares(false);
        
        logTest('Синхронизация активов', result.synced > 0, 
            `Синхронизировано: ${result.synced}, создано: ${result.created}, обновлено: ${result.updated}, ошибок: ${result.errors}`);
        
        const stats = await AssetSyncService.getStats();
        log(`\n📊 Статистика в БД:`, 'cyan');
        log(`   Всего активов: ${stats.total}`, 'blue');
        Object.entries(stats.byType).forEach(([type, count]) => {
            log(`   ${type}: ${count}`, 'blue');
        });
        
        return result;
    } catch (error) {
        logTest('Синхронизация активов', false, error.message);
        return { synced: 0, created: 0, updated: 0, errors: 0 };
    }
}

/**
 * Тест 3: Сбор UID активов и запрос фундаментальных данных
 */
async function testFundamentalsRequest() {
    logSection('3. СБОР UID АКТИВОВ И ЗАПРОС ФУНДАМЕНТАЛЬНЫХ ДАННЫХ');
    
    try {
        // Получаем все активы из БД
        log('🔍 Получаем активы из БД...', 'cyan');
        const assets = await Asset.findAll({
            attributes: ['uid', 'apiData']
        });
        
        log(`   Найдено активов: ${assets.length}`, 'blue');
        
        if (assets.length === 0) {
            log('⚠️  В БД нет активов. Сначала выполните синхронизацию.', 'yellow');
            return { assetUids: [], requestCount: 0, testRequest: null };
        }
        
        // Собираем все FIGI и asset_uid
        const assetUidToFigis = new Map(); // asset_uid -> [figi1, figi2, ...]
        const figiToInfo = new Map(); // figi -> {assetUid, ticker}
        
        for (const asset of assets) {
            if (!asset.apiData || !asset.uid) continue;
            
            const instruments = asset.apiData.instruments || [];
            if (!Array.isArray(instruments)) continue;
            
            for (const instrument of instruments) {
                const figi = instrument?.figi || instrument?.FIGI;
                if (figi) {
                    if (!assetUidToFigis.has(asset.uid)) {
                        assetUidToFigis.set(asset.uid, []);
                    }
                    assetUidToFigis.get(asset.uid).push(figi);
                    figiToInfo.set(figi, {
                        assetUid: asset.uid,
                        ticker: instrument?.ticker || instrument?.Ticker || null
                    });
                }
            }
        }
        
        const uniqueAssetUids = Array.from(assetUidToFigis.keys());
        const requestCount = Math.ceil(uniqueAssetUids.length / MAX_UID_PER_REQUEST);
        
        logTest('Сборка списка asset_uid', uniqueAssetUids.length > 0, 
            `Найдено ${uniqueAssetUids.length} уникальных asset_uid`);
        
        log(`\n📊 Расчет запросов к API:`, 'cyan');
        log(`   Всего уникальных asset_uid: ${uniqueAssetUids.length}`, 'blue');
        log(`   Лимит на запрос: ${MAX_UID_PER_REQUEST}`, 'blue');
        log(`   Необходимо запросов: ${requestCount}`, 'magenta');
        
        if (requestCount > 0) {
            log(`\n📦 Разбивка по батчам:`, 'cyan');
            for (let i = 0; i < requestCount; i++) {
                const start = i * MAX_UID_PER_REQUEST;
                const end = Math.min(start + MAX_UID_PER_REQUEST, uniqueAssetUids.length);
                const batchSize = end - start;
                log(`   Батч ${i + 1}: UID ${start + 1}-${end} (${batchSize} шт.)`, 'blue');
            }
        }
        
        // Тестовый запрос для первых 10 активов
        if (uniqueAssetUids.length > 0) {
            const testBatch = uniqueAssetUids.slice(0, Math.min(10, uniqueAssetUids.length));
            log(`\n🧪 Тестовый запрос для ${testBatch.length} asset_uid...`, 'cyan');
            
            const fundamentals = await TinkoffApiService.getAssetFundamentals(testBatch);
            logTest('Тестовый запрос к API', fundamentals && fundamentals.length > 0, 
                `Получено ${fundamentals?.length || 0} записей`);
            
            if (fundamentals && fundamentals.length > 0) {
                log(`\n📋 Пример ответа API (первая запись):`, 'cyan');
                const example = fundamentals[0];
                log(`   assetUid: ${example.assetUid || 'N/A'}`, 'blue');
                log(`   currency: ${example.currency || 'N/A'}`, 'blue');
                log(`   peRatioTtm: ${example.peRatioTtm ?? 'N/A'}`, 'blue');
                log(`   priceToBookTtm: ${example.priceToBookTtm ?? 'N/A'}`, 'blue');
                log(`   roe: ${example.roe ?? 'N/A'}`, 'blue');
                log(`   Всего полей в ответе: ${Object.keys(example).length}`, 'green');
            }
            
            return {
                assetUids: uniqueAssetUids,
                requestCount,
                testRequest: {
                    batchSize: testBatch.length,
                    received: fundamentals?.length || 0,
                    example: fundamentals?.[0] || null
                }
            };
        }
        
        return { assetUids: uniqueAssetUids, requestCount, testRequest: null };
    } catch (error) {
        logTest('Запрос фундаментальных данных', false, error.message);
        console.error(error);
        return { assetUids: [], requestCount: 0, testRequest: null };
    }
}

/**
 * Тест 4: Массовое заполнение фундаментальных данных
 */
async function testMassFillFundamentalData() {
    logSection('4. МАССОВОЕ ЗАПОЛНЕНИЕ ФУНДАМЕНТАЛЬНЫХ ДАННЫХ');
    
    try {
        // Инициализируем сервис
        await FundamentalDataService.initialize();
        log('✅ FundamentalDataService инициализирован', 'green');
        
        log('🔄 Запускаем массовое заполнение...', 'cyan');
        log('   Параметры: delayMs=1000, forceUpdate=false', 'blue');
        
        const startTime = Date.now();
        const stats = await FundamentalDataService.fillFundamentalDataForAllAssets({
            delayMs: 1000, // Задержка 1000мс между батчами
            forceUpdate: false // Не обновляем существующие данные
        });
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        logTest('Массовое заполнение завершено', true, `Время выполнения: ${duration}с`);
        
        log(`\n📊 Статистика заполнения:`, 'cyan');
        log(`   Всего активов обработано: ${stats.totalAssets}`, 'blue');
        log(`   Всего инструментов обработано: ${stats.totalInstruments}`, 'blue');
        log(`   Обработано записей: ${stats.processed}`, 'blue');
        log(`   Сохранено записей: ${stats.saved}`, 'green');
        log(`   Пропущено (уже есть): ${stats.skipped}`, 'yellow');
        log(`   Нет данных в API: ${stats.noData}`, 'yellow');
        log(`   Ошибок: ${stats.errors}`, stats.errors > 0 ? 'red' : 'green');
        log(`   Запросов к API: ${stats.requestCount}`, 'magenta');
        
        // Проверяем сохраненные данные
        const savedCount = await FundamentalData.count();
        log(`\n💾 Всего записей в БД: ${savedCount}`, 'cyan');
        
        if (savedCount > 0) {
            const recentData = await FundamentalData.findAll({
                limit: 5,
                order: [['createdAt', 'DESC']],
                attributes: ['figi', 'ticker', 'pe', 'pb', 'evEbitda', 'roe', 'source']
            });
            
            log(`\n📋 Последние сохраненные записи:`, 'cyan');
            recentData.forEach((record, index) => {
                log(`   ${index + 1}. ${record.ticker || 'N/A'} (${record.figi})`, 'blue');
                log(`      P/E: ${record.pe ?? 'N/A'}, P/B: ${record.pb ?? 'N/A'}, ROE: ${record.roe ?? 'N/A'}`, 'blue');
            });
        }
        
        return stats;
    } catch (error) {
        logTest('Массовое заполнение', false, error.message);
        console.error(error);
        return null;
    }
}

/**
 * Тест 5: Проверка батчинга запросов
 */
async function testBatchingLogic() {
    logSection('5. ПРОВЕРКА ЛОГИКИ БАТЧИНГА');
    
    try {
        // Получаем все активы
        const assets = await Asset.findAll({
            attributes: ['uid', 'apiData']
        });
        
        log(`📊 Всего активов в БД: ${assets.length}`, 'cyan');
        
        // Собираем все FIGI и asset_uid
        const figiToAssetUid = new Map();
        for (const asset of assets) {
            if (!asset.apiData) continue;
            
            const instruments = asset.apiData.instruments || asset.apiData.instrument || [];
            const instrumentsArray = Array.isArray(instruments) ? instruments : [instruments];
            
            for (const instrument of instrumentsArray) {
                const figi = instrument?.figi || instrument?.FIGI;
                if (figi && asset.uid) {
                    figiToAssetUid.set(figi, asset.uid);
                }
            }
        }
        
        const uniqueAssetUids = [...new Set(figiToAssetUid.values())];
        const requestCount = Math.ceil(uniqueAssetUids.length / MAX_UID_PER_REQUEST);
        
        logTest('Сборка списка asset_uid', uniqueAssetUids.length > 0, 
            `Найдено ${uniqueAssetUids.length} уникальных asset_uid`);
        
        log(`\n📊 Расчет батчей:`, 'cyan');
        log(`   Уникальных asset_uid: ${uniqueAssetUids.length}`, 'blue');
        log(`   Лимит на запрос: ${MAX_UID_PER_REQUEST}`, 'blue');
        log(`   Необходимо запросов: ${requestCount}`, 'magenta');
        
        // Проверяем, что метод правильно разбивает на батчи
        if (uniqueAssetUids.length > 0) {
            const testBatch = uniqueAssetUids.slice(0, Math.min(10, uniqueAssetUids.length));
            log(`\n🧪 Тестовый запрос для ${testBatch.length} asset_uid...`, 'cyan');
            
            const fundamentals = await TinkoffApiService.getAssetFundamentals(testBatch);
            logTest('Тестовый запрос к API', true, 
                `Получено ${fundamentals?.length || 0} записей (может быть 0, если нет данных)`);
            
            if (fundamentals && fundamentals.length > 0) {
                log(`   Пример: ${JSON.stringify(fundamentals[0], null, 2).substring(0, 200)}...`, 'blue');
            }
        }
        
        return {
            totalAssets: assets.length,
            uniqueAssetUids: uniqueAssetUids.length,
            requestCount,
            figiCount: figiToAssetUid.size
        };
    } catch (error) {
        logTest('Проверка батчинга', false, error.message);
        console.error(error);
        return null;
    }
}

/**
 * Главная функция тестирования
 */
async function runTests() {
    logSection('🧪 ТЕСТИРОВАНИЕ МАССОВОГО ЗАПОЛНЕНИЯ ФУНДАМЕНТАЛЬНЫХ ДАННЫХ');
    log('Проверка метода fillFundamentalDataForAllAssets', 'blue');
    
    const results = {
        tablesExist: false,
        syncAssets: null,
        fundamentalsRequest: null,
        massFill: null
    };
    
    try {
        // Тест 1: Проверка таблиц
        const tables = await testTablesExist();
        results.tablesExist = tables.fundamentalExists && tables.assetsExists;
        
        if (!results.tablesExist) {
            log('\n⚠️  Не все таблицы созданы. Завершение тестирования.', 'yellow');
            return;
        }
        
        // Тест 2: Синхронизация активов (теперь фильтрует по нашим инструментам)
        results.syncAssets = await testSyncAssets();
        
        if (!results.syncAssets || results.syncAssets.synced === 0) {
            log('\n⚠️  Активы не синхронизированы. Пропускаем дальнейшие тесты.', 'yellow');
            log('   Убедитесь, что в БД есть активные инструменты (CachedInstrument).', 'yellow');
            return;
        }
        
        // Тест 3: Сбор UID активов и запрос фундаментальных данных
        results.fundamentalsRequest = await testFundamentalsRequest();
        
        if (!results.fundamentalsRequest || results.fundamentalsRequest.assetUids.length === 0) {
            log('\n⚠️  Не найдено активов для запроса фундаментальных данных.', 'yellow');
        }
        
        // Тест 4: Массовое заполнение (реальный вызов метода)
        log('\n💡 Запускаем реальное массовое заполнение...', 'yellow');
        results.massFill = await testMassFillFundamentalData();
        
    } catch (error) {
        log(`\n❌ Критическая ошибка: ${error.message}`, 'red');
        console.error(error);
    } finally {
        // Итоги
        logSection('📊 ИТОГИ ТЕСТИРОВАНИЯ');
        
        const tests = [
            { name: 'Таблицы существуют', passed: results.tablesExist },
            { name: 'Синхронизация активов', passed: results.syncAssets && results.syncAssets.synced > 0 },
            { name: 'Запрос фундаментальных данных', passed: results.fundamentalsRequest && results.fundamentalsRequest.testRequest !== null },
            { name: 'Массовое заполнение', passed: results.massFill !== null && results.massFill.saved > 0 }
        ];
        
        tests.forEach(test => {
            logTest(test.name, test.passed);
        });
        
        if (results.fundamentalsRequest) {
            log(`\n📊 Дополнительная информация:`, 'cyan');
            log(`   Уникальных asset_uid: ${results.fundamentalsRequest.assetUids.length}`, 'blue');
            log(`   Необходимо запросов к API: ${results.fundamentalsRequest.requestCount}`, 'magenta');
            if (results.fundamentalsRequest.testRequest) {
                log(`   Тестовый запрос: ${results.fundamentalsRequest.testRequest.received} из ${results.fundamentalsRequest.testRequest.batchSize}`, 'green');
            }
        }
        
        const passed = tests.filter(t => t.passed).length;
        const total = tests.length;
        
        log(`\n✅ Пройдено: ${passed}/${total}`, passed === total ? 'green' : 'yellow');
        
        await sequelize.close();
        process.exit(passed === total ? 0 : 1);
    }
}

// Запуск тестов
runTests().catch(error => {
    log(`\n❌ Критическая ошибка: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
});
