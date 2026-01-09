/**
 * Тест расширенных макро-фичей
 * Проверяет добавление курсов валют и индексов в feature vector
 */

import sequelize from './src/config/database.js';
import { Op } from 'sequelize';
import MacroDataService from './src/services/MacroDataService.js';
import OptimizedDataService from './src/services/OptimizedDataService.js';
import CacheService from './src/services/CacheService.js';
import MacroIndicator from './src/models/MacroIndicator.js';

async function runTests() {
    console.log('🚀 Запуск тестов расширенных макро-фичей\n');
    console.log('='.repeat(80) + '\n');

    try {
        // 1. Инициализация БД
        console.log('🔧 Инициализация подключения к БД...');
        await sequelize.authenticate();
        console.log('✅ Подключение к БД установлено\n');

        // 2. Инициализация сервисов
        console.log('📋 Тест 1: Инициализация сервисов');
        if (!MacroDataService.isInitialized) {
            await MacroDataService.initialize();
        }
        console.log('✅ MacroDataService инициализирован');

        if (!OptimizedDataService.isInitialized) {
            await OptimizedDataService.initialize();
        }
        console.log('✅ OptimizedDataService инициализирован\n');

        // 3. Проверка размера макро-фичей
        console.log('📋 Тест 2: Проверка размера макро-фичей (должно быть 15)');
        const testDate = new Date(); // Используем текущую дату, так как данные загружены за сегодня

        const macroFeatures = await MacroDataService.getMacroFeatures(testDate, 'RUS');
        console.log(`✅ Получено ${macroFeatures.length} макро-фичей`);

        if (macroFeatures.length === 15) {
            console.log('✅ Правильное количество фичей (15)');
        } else {
            console.warn(`⚠️ Неправильное количество фичей: ожидается 15, получено ${macroFeatures.length}`);
        }

        console.log('\n📊 Структура макро-фичей:');
        console.log(`  [0-7] Базовые индикаторы (8 фичей): ${macroFeatures.slice(0, 8).map(f => f.toFixed(3)).join(', ')}`);
        console.log(`  [8-10] Сырье (3 фичи: нефть, газ, золото): ${macroFeatures.slice(8, 11).map(f => f.toFixed(3)).join(', ')}`);
        console.log(`  [11-12] Валюты (2 фичи: USD/RUB, изменение USD/RUB): ${macroFeatures.slice(11, 13).map(f => f.toFixed(3)).join(', ')}`);
        console.log(`  [13-14] Индексы (2 фичи: IMOEX, RTS): ${macroFeatures.slice(13, 15).map(f => f.toFixed(3)).join(', ')}`);

        // 4. Проверка через OptimizedDataService
        console.log('\n📋 Тест 3: Проверка через OptimizedDataService.getMacroFeatures');
        const optimizedMacroFeatures = await OptimizedDataService.getMacroFeatures(testDate, 'RUS');
        console.log(`✅ OptimizedDataService.getMacroFeatures вернул ${optimizedMacroFeatures.length} фичей`);

        if (optimizedMacroFeatures.length === 15) {
            console.log('✅ Правильное количество фичей (15)');
        } else {
            console.warn(`⚠️ Неправильное количество фичей: ожидается 15, получено ${optimizedMacroFeatures.length}`);
        }

        // 5. Проверка размера feature vector (должно быть 55)
        console.log('\n📋 Тест 4: Проверка размера feature vector (должно быть 55)');
        const TEST_FIGI = 'BBG000Q7ZZY2'; // SBER как тестовый инструмент

        const candles = await CacheService.getCandles(TEST_FIGI, 'DAY', 100, true); // skipUpdate = true

        if (!candles || candles.length < 50) {
            console.warn(`⚠️ Недостаточно свечей для теста (${candles?.length || 0}), требуется минимум 50`);
        } else {
            // Берем последние 60 свечей для создания feature vector
            const window = candles.slice(-60);
            const featureVector = await OptimizedDataService.createFeatureVector(window, TEST_FIGI, candles);

            console.log(`✅ Создан feature vector размером ${featureVector.length}`);

            if (featureVector.length === 55) {
                console.log('✅ Правильный размер feature vector (55)');
            } else {
                console.warn(`⚠️ Неправильный размер feature vector: ожидается 55, получено ${featureVector.length}`);
            }

            // Проверяем структуру feature vector
            console.log('\n📊 Структура feature vector:');
            console.log(`  [0-4] Цены (5 фичей)`);
            console.log(`  [5-9] Объемы (5 фичей)`);
            console.log(`  [10-15] Технические (6 фичей)`);
            console.log(`  [16-17] Временные (2 фичи)`);
            console.log(`  [18-20] Рыночные (3 фичи)`);
            console.log(`  [21-22] Новостные (2 фичи)`);
            console.log(`  [23-24] Telegram (2 фичи)`);
            console.log(`  [25-29] Сигналы (5 фичей)`);
            console.log(`  [30-44] Макро (15 фичей: 8 базовых + 3 сырьевых + 2 валютных + 2 индекса)`);
            console.log(`  [45-51] Фундаментальные (7 фичей)`);
            console.log(`  [52-54] Опционные (3 фичи)`);
            console.log(`  Итого: 55 фичей`);
        }

        // 6. Проверка данных о валютах в БД
        console.log('\n📋 Тест 5: Проверка данных о валютах в БД');
        
        const usdRate = await MacroIndicator.findOne({
            where: {
                indicatorType: 'currency_rate',
                source: 'cbr_usd',
                period: { [Op.lte]: testDate }
            },
            order: [['period', 'DESC']],
            limit: 1
        });

        const eurRate = await MacroIndicator.findOne({
            where: {
                indicatorType: 'currency_rate',
                source: 'cbr_eur',
                period: { [Op.lte]: testDate }
            },
            order: [['period', 'DESC']],
            limit: 1
        });

        if (usdRate) {
            console.log(`✅ USD/RUB найден: ${usdRate.value} (${usdRate.period.toISOString().split('T')[0]})`);
        } else {
            console.warn('⚠️ USD/RUB не найден в БД (проверьте, что данные были загружены)');
        }

        if (eurRate) {
            console.log(`✅ EUR/RUB найден: ${eurRate.value} (${eurRate.period.toISOString().split('T')[0]})`);
        } else {
            console.warn('⚠️ EUR/RUB не найден в БД (проверьте, что данные были загружены)');
        }

        // 7. Проверка данных об индексах в БД
        console.log('\n📋 Тест 6: Проверка данных об индексах в БД');
        
        const imoexIndex = await MacroIndicator.findOne({
            where: {
                indicatorType: 'oil_price', // Временно используем oil_price
                source: 'tinkoff_imoex',
                period: { [Op.lte]: testDate }
            },
            order: [['period', 'DESC']],
            limit: 1
        });

        const rtsIndex = await MacroIndicator.findOne({
            where: {
                indicatorType: 'oil_price', // Временно используем oil_price
                source: 'tinkoff_rts',
                period: { [Op.lte]: testDate }
            },
            order: [['period', 'DESC']],
            limit: 1
        });

        if (imoexIndex) {
            console.log(`✅ IMOEX найден: ${imoexIndex.value} (${imoexIndex.period.toISOString().split('T')[0]})`);
        } else {
            console.warn('⚠️ IMOEX не найден в БД');
            console.warn('   Примечание: Индексы требуют, чтобы инструменты IMOEX и RTSI были сначала загружены через CacheService');
            console.warn('   Затем нужно запустить обновление макро-данных для получения их цен');
        }

        if (rtsIndex) {
            console.log(`✅ RTS найден: ${rtsIndex.value} (${rtsIndex.period.toISOString().split('T')[0]})`);
        } else {
            console.warn('⚠️ RTS не найден в БД');
            console.warn('   Примечание: Индексы требуют, чтобы инструменты IMOEX и RTSI были сначала загружены через CacheService');
        }

        console.log('\n' + '='.repeat(80));
        console.log('✅ Все тесты завершены!\n');

    } catch (error) {
        console.error('\n❌ Ошибка при выполнении тестов:', error);
        console.error(error.stack);
        process.exit(1);
    } finally {
        await sequelize.close();
        console.log('🔌 Подключение к БД закрыто');
    }
}

runTests();

