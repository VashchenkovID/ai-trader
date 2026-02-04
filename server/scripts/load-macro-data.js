/**
 * Скрипт для загрузки всех макро-данных
 */

import sequelize from '../src/config/database.js';
import MacroDataService from '../src/services/MacroDataService.js';

async function loadMacroData() {
    try {
        console.log('🚀 Загрузка макро-данных...\n');
        
        // Инициализация БД
        await sequelize.authenticate();
        console.log('✅ Подключение к БД установлено\n');

        // Инициализация сервиса
        if (!MacroDataService.isInitialized) {
            await MacroDataService.initialize();
        }
        console.log('✅ MacroDataService инициализирован\n');

        // Загружаем данные за последние 90 дней
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 90);

        console.log(`📅 Период загрузки: ${startDate.toISOString().split('T')[0]} - ${endDate.toISOString().split('T')[0]}\n`);
        console.log('🔄 Начинаю загрузку данных...\n');

        const stats = await MacroDataService.updateAllData(startDate, endDate);

        console.log('\n' + '='.repeat(80));
        console.log('📊 Результаты загрузки:\n');
        console.log('ЦБ РФ:');
        console.log(`  Загружено: ${stats.cbr.fetched}, Сохранено: ${stats.cbr.saved}`);
        if (stats.cbr.errors.length > 0) {
            console.log(`  Ошибки: ${stats.cbr.errors.length}`);
            stats.cbr.errors.forEach(err => console.log(`    - ${err}`));
        }

        console.log('\nРосстат:');
        console.log(`  Загружено: ${stats.rosstat.fetched}, Сохранено: ${stats.rosstat.saved}`);
        if (stats.rosstat.errors.length > 0) {
            console.log(`  Ошибки: ${stats.rosstat.errors.length}`);
            stats.rosstat.errors.forEach(err => console.log(`    - ${err}`));
        }

        console.log('\nМосбиржа (волатильность):');
        console.log(`  Загружено: ${stats.moex.fetched}, Сохранено: ${stats.moex.saved}`);
        if (stats.moex.errors.length > 0) {
            console.log(`  Ошибки: ${stats.moex.errors.length}`);
            stats.moex.errors.forEach(err => console.log(`    - ${err}`));
        }

        console.log('\nМосбиржа (сырье):');
        console.log(`  Загружено: ${stats.moexCommodity.fetched}, Сохранено: ${stats.moexCommodity.saved}`);
        if (stats.moexCommodity.errors.length > 0) {
            console.log(`  Ошибки: ${stats.moexCommodity.errors.length}`);
            stats.moexCommodity.errors.forEach(err => console.log(`    - ${err}`));
        }

        console.log('\nРыночные индексы:');
        console.log(`  Загружено: ${stats.marketIndices.fetched}, Сохранено: ${stats.marketIndices.saved}`);
        if (stats.marketIndices.errors.length > 0) {
            console.log(`  Ошибки: ${stats.marketIndices.errors.length}`);
            stats.marketIndices.errors.forEach(err => console.log(`    - ${err}`));
        }

        console.log('\n' + '='.repeat(80));
        console.log(`\n✅ Всего загружено: ${stats.total.fetched}, Сохранено: ${stats.total.saved}`);
        console.log('\n✅ Загрузка данных завершена!');

        await sequelize.close();
    } catch (error) {
        console.error('\n❌ Ошибка при загрузке данных:', error);
        console.error(error.stack);
        process.exit(1);
    }
}

loadMacroData();

