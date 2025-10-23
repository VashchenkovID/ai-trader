import Settings from '../models/Settings.js';
import SettingsService from '../services/SettingsService.js';
import sequelize from '../config/database.js';
import dotenv from 'dotenv';
dotenv.config();

async function testSettings() {
    console.log('🔍 ТЕСТИРОВАНИЕ МОДУЛЯ НАСТРОЕК\n');

    try {
        await sequelize.authenticate();
        console.log('✅ Подключение к БД успешно\n');

        // Инициализируем настройки по умолчанию
        console.log('📝 Инициализация настроек по умолчанию...');
        await Settings.initializeDefaults();
        console.log('✅ Настройки инициализированы\n');

        // Тестируем получение всех настроек
        console.log('📊 Получение всех настроек...');
        const allSettings = await SettingsService.getAllSettings();
        console.log(`✅ Найдено настроек: ${allSettings.length}\n`);

        // Тестируем получение настроек по категориям
        console.log('📂 Настройки по категориям:');
        const categories = ['portfolio', 'scheduler', 'neural_network', 'notifications'];
        for (const category of categories) {
            const categorySettings = await SettingsService.getAllSettings(category);
            console.log(`   ${category}: ${categorySettings.length} настроек`);
        }
        console.log('');

        // Тестируем получение конкретной настройки
        console.log('🔍 Тестирование получения конкретной настройки...');
        const budget = await SettingsService.getSetting('user_max_portfolio_budget');
        console.log(`   user_max_portfolio_budget: ${budget}\n`);

        // Тестируем изменение настройки
        console.log('✏️ Тестирование изменения настройки...');
        await SettingsService.setSetting('user_max_portfolio_budget', 2000000);
        const newBudget = await SettingsService.getSetting('user_max_portfolio_budget');
        console.log(`   Новый бюджет: ${newBudget}\n`);

        // Тестируем получение настроек портфеля
        console.log('💼 Настройки портфеля:');
        const portfolioSettings = await SettingsService.getPortfolioSettings();
        console.log(JSON.stringify(portfolioSettings, null, 2));
        console.log('');

        // Тестируем получение настроек планировщика
        console.log('⏰ Настройки планировщика:');
        const schedulerSettings = await SettingsService.getSchedulerSettings();
        console.log(JSON.stringify(schedulerSettings, null, 2));
        console.log('');

        // Тестируем получение настроек нейросети
        console.log('🧠 Настройки нейросети:');
        const nnSettings = await SettingsService.getNeuralNetworkSettings();
        console.log(JSON.stringify(nnSettings, null, 2));
        console.log('');

        // Тестируем применение настроек
        console.log('⚙️ Применение настроек к сервисам...');
        const appliedSettings = await SettingsService.applySettings();
        console.log('✅ Настройки применены к переменным окружения\n');

        console.log('🎉 Все тесты прошли успешно!');

    } catch (error) {
        console.error('❌ Ошибка при тестировании настроек:', error);
    } finally {
        process.exit(0);
    }
}

testSettings();
