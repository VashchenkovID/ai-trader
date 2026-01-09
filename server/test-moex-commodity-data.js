/**
 * Тестовый скрипт для проверки интеграции MOEX ISS API для цен на сырье
 */

import sequelize from './src/config/database.js';
import { Op } from 'sequelize';
import MacroDataService from './src/services/MacroDataService.js';
import OptimizedDataService from './src/services/OptimizedDataService.js';
import MacroIndicator from './src/models/MacroIndicator.js';

async function testInitialization() {
    console.log('\n📋 Тест 1: Инициализация сервисов');
    try {
        await MacroDataService.initialize();
        console.log('✅ MacroDataService инициализирован');
        
        await OptimizedDataService.initialize();
        console.log('✅ OptimizedDataService инициализирован');
        
        return true;
    } catch (error) {
        console.error('❌ Ошибка инициализации:', error);
        return false;
    }
}

async function testFetchActiveFutures() {
    console.log('\n📋 Тест 2: Получение активных фьючерсов');
    try {
        // Сначала проверим, какие инструменты есть на MOEX
        const url = 'https://iss.moex.com/iss/engines/futures/markets/forts/securities.json?iss.meta=off&limit=100';
        console.log(`📡 Тестовый запрос к MOEX ISS API: ${url}`);
        
        const response = await fetch(url);
        if (response.ok) {
            const jsonData = await response.json();
            if (jsonData.securities && jsonData.securities.data) {
                const securities = jsonData.securities.data;
                const columns = jsonData.securities.columns || [];
                const secidIndex = columns.indexOf('SECID');
                
                console.log(`\n📊 Найдено ${securities.length} инструментов на FORTS`);
                console.log('📋 Примеры SECID (первые 20):');
                securities.slice(0, 20).forEach((row, idx) => {
                    if (Array.isArray(row) && row.length > secidIndex) {
                        const secid = row[secidIndex];
                        console.log(`  [${idx + 1}] ${secid}`);
                    }
                });
            }
        }
        
        const futures = await MacroDataService.fetchActiveCommodityFutures();
        console.log('\n✅ Получены активные фьючерсы:', futures);
        
        if (Object.keys(futures).length === 0) {
            console.warn('⚠️ Не найдено активных фьючерсов (возможно, коды инструментов неверны)');
            console.log('💡 Проверьте, что коды baseCode соответствуют реальным кодам на MOEX');
        } else {
            console.log(`✅ Найдено ${Object.keys(futures).length} типов сырья с активными фьючерсами`);
        }
        
        return futures;
    } catch (error) {
        console.error('❌ Ошибка получения активных фьючерсов:', error);
        return null;
    }
}

async function testFetchCommodityData() {
    console.log('\n📋 Тест 3: Получение данных о ценах на сырье');
    try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30); // Последние 30 дней
        
        console.log(`📅 Период: ${startDate.toISOString().split('T')[0]} - ${endDate.toISOString().split('T')[0]}`);
        
        const indicators = await MacroDataService.fetchMoexCommodityData(startDate, endDate);
        console.log(`✅ Получено ${indicators.length} индикаторов`);
        
        if (indicators.length > 0) {
            console.log('\n📊 Примеры индикаторов:');
            indicators.slice(0, 3).forEach((ind, idx) => {
                console.log(`  [${idx + 1}] ${ind.metadata?.commodityType || 'unknown'}: ${ind.value} (${ind.period.toISOString().split('T')[0]})`);
            });
        } else {
            console.warn('⚠️ Не получено данных (возможно, проблема с API или нет активных фьючерсов)');
        }
        
        return indicators;
    } catch (error) {
        console.error('❌ Ошибка получения данных о сырье:', error);
        return [];
    }
}

async function testSaveIndicators() {
    console.log('\n📋 Тест 4: Сохранение индикаторов в БД');
    try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 7); // Последние 7 дней (меньше данных для теста)
        
        const indicators = await MacroDataService.fetchMoexCommodityData(startDate, endDate);
        
        if (indicators.length === 0) {
            console.warn('⚠️ Нет данных для сохранения');
            return 0;
        }
        
        const savedCount = await MacroDataService.bulkSaveIndicators(indicators);
        console.log(`✅ Сохранено ${savedCount} индикаторов из ${indicators.length} полученных`);
        
        return savedCount;
    } catch (error) {
        console.error('❌ Ошибка сохранения индикаторов:', error);
        return 0;
    }
}

async function testGetCommodityFromDb() {
    console.log('\n📋 Тест 5: Получение данных о сырье из БД');
    try {
        const testDate = new Date();
        testDate.setDate(testDate.getDate() - 1); // Вчерашний день
        
        const oilPrice = await MacroIndicator.findOne({
            where: {
                indicatorType: 'oil_price',
                source: 'moex_iss_oil',
                period: { [Op.lte]: testDate }
            },
            order: [['period', 'DESC']],
            limit: 1
        });
        
        const gasPrice = await MacroIndicator.findOne({
            where: {
                indicatorType: 'oil_price',
                source: 'moex_iss_gas',
                period: { [Op.lte]: testDate }
            },
            order: [['period', 'DESC']],
            limit: 1
        });
        
        const goldPrice = await MacroIndicator.findOne({
            where: {
                indicatorType: 'oil_price',
                source: 'moex_iss_gold',
                period: { [Op.lte]: testDate }
            },
            order: [['period', 'DESC']],
            limit: 1
        });
        
        console.log('📊 Данные из БД:');
        if (oilPrice) {
            console.log(`  Нефть: ${oilPrice.value} (${oilPrice.period.toISOString().split('T')[0]})`);
        } else {
            console.log('  Нефть: не найдено');
        }
        
        if (gasPrice) {
            console.log(`  Газ: ${gasPrice.value} (${gasPrice.period.toISOString().split('T')[0]})`);
        } else {
            console.log('  Газ: не найдено');
        }
        
        if (goldPrice) {
            console.log(`  Золото: ${goldPrice.value} (${goldPrice.period.toISOString().split('T')[0]})`);
        } else {
            console.log('  Золото: не найдено');
        }
        
        return { oilPrice, gasPrice, goldPrice };
    } catch (error) {
        console.error('❌ Ошибка получения данных из БД:', error);
        return null;
    }
}

async function testGetMacroFeatures() {
    console.log('\n📋 Тест 6: Получение макро-фичей (должно быть 11 фичей)');
    try {
        const testDate = new Date();
        testDate.setDate(testDate.getDate() - 1);
        
        const features = await MacroDataService.getMacroFeatures(testDate, 'RUS');
        
        console.log(`✅ Получено ${features.length} макро-фичей`);
        
        if (features.length === 11) {
            console.log('✅ Правильное количество фичей (11)');
        } else {
            console.warn(`⚠️ Неправильное количество фичей: ожидается 11, получено ${features.length}`);
        }
        
        console.log('\n📊 Макро-фичи:');
        console.log(`  [0-7] Базовые индикаторы (8 фичей): ${features.slice(0, 8).map(f => f.toFixed(3)).join(', ')}`);
        console.log(`  [8] Нефть (нормализованная): ${features[8]?.toFixed(3) || 'N/A'}`);
        console.log(`  [9] Газ (нормализованная): ${features[9]?.toFixed(3) || 'N/A'}`);
        console.log(`  [10] Золото (нормализованное): ${features[10]?.toFixed(3) || 'N/A'}`);
        
        return features;
    } catch (error) {
        console.error('❌ Ошибка получения макро-фичей:', error);
        return null;
    }
}

async function testOptimizedDataServiceFeatures() {
    console.log('\n📋 Тест 7: Получение фичей через OptimizedDataService');
    try {
        // Нужен FIGI для создания feature vector, используем тестовый
        // Но для макро-фичей FIGI не обязателен, проверяем только макро-фичи
        const testDate = new Date();
        testDate.setDate(testDate.getDate() - 1);
        
        const macroFeatures = await OptimizedDataService.getMacroFeatures(testDate.getTime(), 'RUS');
        
        console.log(`✅ OptimizedDataService.getMacroFeatures вернул ${macroFeatures.length} фичей`);
        
        if (macroFeatures.length === 11) {
            console.log('✅ Правильное количество фичей (11)');
        } else {
            console.warn(`⚠️ Неправильное количество фичей: ожидается 11, получено ${macroFeatures.length}`);
        }
        
        return macroFeatures;
    } catch (error) {
        console.error('❌ Ошибка получения фичей через OptimizedDataService:', error);
        return null;
    }
}

async function testFeatureVectorSize() {
    console.log('\n📋 Тест 8: Проверка размера feature vector (должно быть 51)');
    try {
        // Находим любой инструмент для тестирования
        const { default: CachedInstrument } = await import('./src/models/CachedInstrument.js');
        const testInstrument = await CachedInstrument.findOne({
            where: { isActive: true },
            limit: 1
        });
        
        if (!testInstrument) {
            console.warn('⚠️ Не найден активный инструмент для теста');
            return null;
        }
        
        const figi = testInstrument.figi;
        console.log(`📊 Тестируем с инструментом: ${figi}`);
        
        // Получаем feature vector (нужны свечи)
        const { default: CacheService } = await import('./src/services/CacheService.js');
        await CacheService.initialize();
        
        const candles = await CacheService.getCandles(figi, 'DAY', 100, true); // skipUpdate = true
        
        if (!candles || candles.length < 50) {
            console.warn(`⚠️ Недостаточно свечей для теста (${candles?.length || 0}), требуется минимум 50`);
            return null;
        }
        
        // Берем последние 60 свечей для создания feature vector
        const window = candles.slice(-60);
        const featureVector = await OptimizedDataService.createFeatureVector(window, figi, candles);
        
        console.log(`✅ Создан feature vector размером ${featureVector.length}`);
        
        if (featureVector.length === 51) {
            console.log('✅ Правильный размер feature vector (51)');
        } else {
            console.warn(`⚠️ Неправильный размер feature vector: ожидается 51, получено ${featureVector.length}`);
        }
        
        return featureVector;
    } catch (error) {
        console.error('❌ Ошибка проверки размера feature vector:', error);
        return null;
    }
}

async function testUpdateAllData() {
    console.log('\n📋 Тест 9: Полное обновление макро-данных (включая сырье)');
    try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 7); // Последние 7 дней
        
        console.log('🔄 Запуск полного обновления макро-данных...');
        const stats = await MacroDataService.updateAllData(startDate, endDate);
        
        console.log('\n📊 Статистика обновления:');
        console.log(`  ЦБ РФ: получено ${stats.cbr.fetched}, сохранено ${stats.cbr.saved}`);
        console.log(`  Росстат: получено ${stats.rosstat.fetched}, сохранено ${stats.rosstat.saved}`);
        console.log(`  Мосбиржа (RVI): получено ${stats.moex.fetched}, сохранено ${stats.moex.saved}`);
        console.log(`  Мосбиржа (сырье): получено ${stats.moexCommodity.fetched}, сохранено ${stats.moexCommodity.saved}`);
        console.log(`  Всего: получено ${stats.total.fetched}, сохранено ${stats.total.saved}`);
        
        if (stats.moexCommodity.errors.length > 0) {
            console.warn(`⚠️ Ошибки при обновлении сырья: ${stats.moexCommodity.errors.join(', ')}`);
        }
        
        return stats;
    } catch (error) {
        console.error('❌ Ошибка полного обновления данных:', error);
        return null;
    }
}

async function runAllTests() {
    console.log('🚀 Запуск тестов интеграции MOEX ISS API для цен на сырье\n');
    console.log('='.repeat(80));
    
    try {
        // Инициализация БД
        console.log('\n🔧 Инициализация подключения к БД...');
        await sequelize.authenticate();
        console.log('✅ Подключение к БД установлено');
        
        // Тест 1: Инициализация
        const initOk = await testInitialization();
        if (!initOk) {
            console.error('❌ Критическая ошибка: не удалось инициализировать сервисы');
            return;
        }
        
        // Тест 2: Получение активных фьючерсов
        const futures = await testFetchActiveFutures();
        
        // Тест 3: Получение данных
        const indicators = await testFetchCommodityData();
        
        // Тест 4: Сохранение в БД
        const savedCount = await testSaveIndicators();
        
        // Тест 5: Получение из БД
        await testGetCommodityFromDb();
        
        // Тест 6: Получение макро-фичей
        const macroFeatures = await testGetMacroFeatures();
        
        // Тест 7: OptimizedDataService
        await testOptimizedDataServiceFeatures();
        
        // Тест 8: Размер feature vector
        await testFeatureVectorSize();
        
        // Тест 9: Полное обновление (опционально, может быть долгим)
        console.log('\n⚠️ Тест 9 (полное обновление) пропущен для быстроты теста');
        // await testUpdateAllData();
        
        console.log('\n' + '='.repeat(80));
        console.log('✅ Все тесты завершены!');
        
    } catch (error) {
        console.error('\n❌ Критическая ошибка при выполнении тестов:', error);
        console.error(error.stack);
    } finally {
        await sequelize.close();
        console.log('\n🔌 Подключение к БД закрыто');
        process.exit(0);
    }
}

// Запуск тестов
runAllTests().catch(error => {
    console.error('❌ Необработанная ошибка:', error);
    process.exit(1);
});

