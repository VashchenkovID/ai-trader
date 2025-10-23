import sequelize from '../config/database.js';
import Settings from '../models/Settings.js';
import dotenv from 'dotenv';
dotenv.config();

async function initSettings() {
    console.log('🔧 ИНИЦИАЛИЗАЦИЯ НАСТРОЕК В БД\n');

    try {
        await sequelize.authenticate();
        console.log('✅ Подключение к БД успешно\n');

        // Синхронизируем модель
        await Settings.sync({ force: false });
        console.log('✅ Модель Settings синхронизирована\n');

        // Проверяем, есть ли уже настройки
        const existingCount = await Settings.count();
        console.log(`📊 Существующих настроек: ${existingCount}\n`);

        if (existingCount === 0) {
            console.log('📝 Инициализация настроек по умолчанию...');
            await Settings.initializeDefaults();
            console.log('✅ Настройки инициализированы\n');
        } else {
            console.log('ℹ️ Настройки уже существуют, пропускаем инициализацию\n');
        }

        // Показываем все настройки
        const allSettings = await Settings.findAll({
            order: [['category', 'ASC'], ['key', 'ASC']]
        });

        console.log('📋 ВСЕ НАСТРОЙКИ:');
        allSettings.forEach(setting => {
            console.log(`   ${setting.category}.${setting.key}: ${setting.value} (${setting.dataType})`);
        });

        console.log('\n🎉 Инициализация завершена успешно!');

    } catch (error) {
        console.error('❌ Ошибка при инициализации настроек:', error);
    } finally {
        process.exit(0);
    }
}

initSettings();
