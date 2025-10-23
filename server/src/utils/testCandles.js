import CacheService from '../services/CacheService.js';
import sequelize from '../config/database.js';

async function testCandles() {
    console.log('🔍 ТЕСТИРОВАНИЕ ДАННЫХ СВЕЧЕЙ\n');

    try {
        // Подключаемся к БД
        await sequelize.authenticate();
        console.log('✅ Подключение к БД успешно\n');

        // Получаем инструменты
        const instruments = await CacheService.getAllInstruments(10);
        console.log(`📊 Инструментов в кеше: ${instruments.length}\n`);

        if (instruments.length === 0) {
            console.log('❌ Нет инструментов в кеше!');
            return;
        }

        // Проверяем данные свечей для каждого инструмента
        for (const instrument of instruments.slice(0, 5)) {
            console.log(`🔍 Проверяем ${instrument.ticker} (${instrument.figi}):`);
            
            try {
                const candles = await CacheService.getCandles(instrument.figi, 'DAY', 100);
                console.log(`   📈 Свечей: ${candles.length}`);
                
                if (candles.length > 0) {
                    const lastCandle = candles[candles.length - 1];
                    console.log(`   📅 Последняя свеча: ${lastCandle.time}, цена: ${lastCandle.close}`);
                }
                
                if (candles.length < 60) {
                    console.log(`   ⚠️ Недостаточно данных для анализа (нужно 60, есть ${candles.length})`);
                } else {
                    console.log(`   ✅ Достаточно данных для анализа`);
                }
                
            } catch (error) {
                console.log(`   ❌ Ошибка получения свечей: ${error.message}`);
            }
            
            console.log('');
        }

    } catch (error) {
        console.error('❌ Ошибка тестирования:', error);
    } finally {
        process.exit(0);
    }
}

testCandles();
