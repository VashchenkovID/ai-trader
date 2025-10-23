import CacheService from '../services/CacheService.js';
import sequelize from '../config/database.js';

async function testDividendsSimple() {
    console.log('🔍 ТЕСТИРОВАНИЕ ДИВИДЕНДОВ (БЕЗ API)\n');

    try {
        await sequelize.authenticate();
        console.log('✅ Подключение к БД успешно\n');

        // Попробуем кешировать несколько инструментов
        console.log('📊 Запускаем кеширование инструментов...');
        const result = await CacheService.cacheInstruments();
        console.log(`✅ Кешировано инструментов: ${result.length}\n`);

        // Проверяем результат
        const instruments = await CacheService.getAllInstruments(10);
        console.log('📋 ПРИМЕРЫ ИНСТРУМЕНТОВ:');
        
        let withDividends = 0;
        instruments.forEach(instrument => {
            const dividendText = instrument.dividendYield 
                ? `${(instrument.dividendYield * 100).toFixed(2)}%` 
                : 'Нет';
            
            if (instrument.dividendYield) withDividends++;
            
            console.log(`${instrument.ticker}: ${dividendText}`);
        });

        console.log(`\n📊 Статистика:`);
        console.log(`   Всего инструментов: ${instruments.length}`);
        console.log(`   С дивидендами: ${withDividends}`);
        console.log(`   Без дивидендов: ${instruments.length - withDividends}`);

    } catch (error) {
        console.error('❌ Ошибка:', error);
    } finally {
        process.exit(0);
    }
}

testDividendsSimple();
