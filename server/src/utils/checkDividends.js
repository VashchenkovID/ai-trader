import sequelize from '../config/database.js';
import CachedInstrument from '../models/CachedInstrument.js';

async function checkDividends() {
    console.log('🔍 ПРОВЕРКА ДИВИДЕНДОВ В БД\n');

    try {
        await sequelize.authenticate();
        console.log('✅ Подключение к БД успешно\n');

        // Получаем все инструменты с дивидендами
        const instrumentsWithDividends = await CachedInstrument.findAll({
            where: {
                dividendYield: {
                    [sequelize.Sequelize.Op.ne]: null
                }
            },
            order: [['dividendYield', 'DESC']]
        });

        console.log(`📊 Инструментов с дивидендами: ${instrumentsWithDividends.length}\n`);

        if (instrumentsWithDividends.length > 0) {
            console.log('🏆 ТОП-10 по дивидендной доходности:');
            instrumentsWithDividends.slice(0, 10).forEach((instrument, index) => {
                console.log(`${index + 1}. ${instrument.ticker} - ${(instrument.dividendYield * 100).toFixed(2)}%`);
            });
        } else {
            console.log('❌ Дивиденды не найдены в базе данных');
        }

        // Проверяем все инструменты
        const allInstruments = await CachedInstrument.findAll({
            limit: 5,
            order: [['ticker', 'ASC']]
        });

        console.log('\n📋 ПРИМЕРЫ ИНСТРУМЕНТОВ:');
        allInstruments.forEach(instrument => {
            console.log(`${instrument.ticker}: dividendYield = ${instrument.dividendYield ? (instrument.dividendYield * 100).toFixed(2) + '%' : 'null'}`);
        });

    } catch (error) {
        console.error('❌ Ошибка:', error);
    } finally {
        process.exit(0);
    }
}

checkDividends();
