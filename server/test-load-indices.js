/**
 * Тестовый скрипт для проверки загрузки рыночных индексов
 */

import sequelize from './src/config/database.js';
import MacroDataService from './src/services/MacroDataService.js';
import CacheService from './src/services/CacheService.js';
import CachedInstrument from './src/models/CachedInstrument.js';
import TinkoffApiService from './src/services/TinkoffApiService.js';

async function testLoadIndices() {
    try {
        console.log('🚀 Тест загрузки рыночных индексов\n');
        console.log('='.repeat(80) + '\n');

        // 1. Инициализация БД
        await sequelize.authenticate();
        console.log('✅ Подключение к БД установлено\n');

        // 2. Инициализация сервисов
        if (!CacheService.isInitialized) {
            await CacheService.initialize();
        }
        console.log('✅ CacheService инициализирован');

        if (!MacroDataService.isInitialized) {
            await MacroDataService.initialize();
        }
        console.log('✅ MacroDataService инициализирован\n');

        // 3. Проверка наличия индексов в CachedInstrument
        console.log('📋 Шаг 1: Проверка наличия индексов в CachedInstrument\n');
        
        const indicesToCheck = ['IMOEX', 'RTSI'];
        const foundInstruments = {};

        for (const ticker of indicesToCheck) {
            // Сначала ищем точно по ticker
            let instrument = await CachedInstrument.findOne({
                where: { ticker: ticker }
            });

            // Если не нашли, ищем без учета типа
            if (!instrument) {
                const allWithTicker = await CachedInstrument.findAll({
                    where: { ticker: ticker },
                    limit: 5
                });
                if (allWithTicker.length > 0) {
                    instrument = allWithTicker[0];
                    console.log(`⚠️ Найден инструмент ${ticker}, но возможно неправильный тип: ${instrument.instrumentType}`);
                }
            }

            if (instrument) {
                foundInstruments[ticker] = instrument;
                console.log(`✅ ${ticker} найден:`);
                console.log(`   FIGI: ${instrument.figi}`);
                console.log(`   Тип: ${instrument.instrumentType}`);
                console.log(`   Название: ${instrument.name || 'N/A'}`);
            } else {
                console.log(`⚠️ ${ticker} не найден в CachedInstrument`);
                console.log(`   Нужно сначала загрузить этот инструмент через TinkoffApiService`);
            }
            console.log('');
        }

        // 4. Попытка найти индексы через Tinkoff API (если не найдены в БД)
        console.log('📋 Шаг 2: Поиск индексов через Tinkoff API (если не найдены)\n');
        
        for (const ticker of indicesToCheck) {
            if (!foundInstruments[ticker]) {
                try {
                    console.log(`🔍 Поиск ${ticker} через Tinkoff API...`);
                    // Используем FindInstrument если доступен
                    // Или попробуем через getStocks и найти индекс
                    const stocks = await TinkoffApiService.getStocks();
                    
                    const found = stocks.instruments?.find(inst => 
                        inst.ticker === ticker || 
                        inst.name?.includes(ticker) ||
                        (ticker === 'IMOEX' && (inst.name?.includes('МосБиржи') || inst.name?.includes('Московская')))
                    );
                    
                    if (found) {
                        console.log(`✅ Найден ${ticker} в API:`);
                        console.log(`   FIGI: ${found.figi}`);
                        console.log(`   Название: ${found.name}`);
                        console.log(`   Тип: ${found.instrumentType || 'unknown'}`);
                        console.log(`   ⚠️ Но он не в CachedInstrument, нужно сохранить`);
                    } else {
                        console.log(`⚠️ ${ticker} не найден в списке инструментов от Tinkoff API`);
                        console.log(`   Возможно, нужно использовать другой метод API для поиска индексов`);
                    }
                } catch (error) {
                    console.error(`❌ Ошибка поиска ${ticker} через API:`, error.message);
                }
                console.log('');
            }
        }

        // 5. Тест метода fetchMarketIndexData (если есть хотя бы один индекс)
        if (Object.keys(foundInstruments).length > 0) {
            console.log('📋 Шаг 3: Тест метода fetchMarketIndexData\n');
            
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 30); // Последние 30 дней

            console.log(`📅 Период: ${startDate.toISOString().split('T')[0]} - ${endDate.toISOString().split('T')[0]}\n`);

            try {
                const indicators = await MacroDataService.fetchMarketIndexData(startDate, endDate);
                console.log(`✅ Получено ${indicators.length} индикаторов индексов\n`);

                if (indicators.length > 0) {
                    console.log('📊 Примеры индикаторов:');
                    indicators.slice(0, 5).forEach((ind, idx) => {
                        console.log(`  [${idx + 1}] ${ind.metadata?.indexName || ind.source}: ${ind.value} (${ind.period.toISOString().split('T')[0]})`);
                    });
                } else {
                    console.warn('⚠️ Не получено индикаторов (возможно, нет свечей для индексов в кеше)');
                }
            } catch (error) {
                console.error('❌ Ошибка при вызове fetchMarketIndexData:', error);
                console.error(error.stack);
            }
        } else {
            console.log('⚠️ Шаг 3 пропущен: нет индексов в CachedInstrument для тестирования');
            console.log('\n💡 Для загрузки индексов нужно:');
            console.log('   1. Найти FIGI индексов IMOEX и RTSI через Tinkoff API');
            console.log('   2. Сохранить их в CachedInstrument (или загрузить через CacheService)');
            console.log('   3. Получить свечи для этих индексов через CacheService');
            console.log('   4. Затем вызвать MacroDataService.fetchMarketIndexData()');
        }

        console.log('\n' + '='.repeat(80));
        console.log('✅ Тест завершен!\n');

        await sequelize.close();
    } catch (error) {
        console.error('\n❌ Ошибка при выполнении теста:', error);
        console.error(error.stack);
        process.exit(1);
    }
}

testLoadIndices();

