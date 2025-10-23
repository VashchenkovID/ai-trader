import sequelize from '../config/database.js';
import CachedInstrument from '../models/CachedInstrument.js';

async function fixDividends() {
    console.log('🔧 ИСПРАВЛЕНИЕ ДИВИДЕНДОВ В БД\n');

    try {
        await sequelize.authenticate();
        console.log('✅ Подключение к БД успешно\n');

        // Обновляем все некорректные дивиденды
        const result = await CachedInstrument.update(
            { dividendYield: null },
            {
                where: {
                    [sequelize.Sequelize.Op.or]: [
                        { dividendYield: { [sequelize.Sequelize.Op.is]: null } },
                        { dividendYield: { [sequelize.Sequelize.Op.eq]: NaN } },
                        { dividendYield: { [sequelize.Sequelize.Op.lt]: 0 } },
                        { dividendYield: { [sequelize.Sequelize.Op.gt]: 1 } }
                    ]
                }
            }
        );

        console.log(`🧹 Очищено некорректных записей: ${result[0]}`);

        // Проверяем результат
        const validDividends = await CachedInstrument.count({
            where: {
                dividendYield: {
                    [sequelize.Sequelize.Op.and]: [
                        { [sequelize.Sequelize.Op.ne]: null },
                        { [sequelize.Sequelize.Op.gte]: 0 },
                        { [sequelize.Sequelize.Op.lte]: 1 }
                    ]
                }
            }
        });

        console.log(`✅ Валидных дивидендов: ${validDividends}`);

        // Показываем примеры валидных дивидендов
        const examples = await CachedInstrument.findAll({
            where: {
                dividendYield: {
                    [sequelize.Sequelize.Op.and]: [
                        { [sequelize.Sequelize.Op.ne]: null },
                        { [sequelize.Sequelize.Op.gte]: 0 },
                        { [sequelize.Sequelize.Op.lte]: 1 }
                    ]
                }
            },
            limit: 5,
            order: [['dividendYield', 'DESC']]
        });

        if (examples.length > 0) {
            console.log('\n📊 ПРИМЕРЫ ВАЛИДНЫХ ДИВИДЕНДОВ:');
            examples.forEach(instrument => {
                console.log(`${instrument.ticker}: ${(instrument.dividendYield * 100).toFixed(2)}%`);
            });
        }

    } catch (error) {
        console.error('❌ Ошибка:', error);
    } finally {
        process.exit(0);
    }
}

fixDividends();
