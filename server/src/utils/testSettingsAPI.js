import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import sequelize from '../config/database.js';
import Settings from '../models/Settings.js';
import settingsRoutes from '../routes/settings.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/settings', settingsRoutes);

async function testSettingsAPI() {
    console.log('🔍 ТЕСТИРОВАНИЕ API НАСТРОЕК\n');

    try {
        await sequelize.authenticate();
        console.log('✅ Подключение к БД успешно\n');

        // Синхронизируем модель
        await Settings.sync({ force: true });
        console.log('✅ Модель Settings синхронизирована\n');

        // Инициализируем настройки
        await Settings.initializeDefaults();
        console.log('✅ Настройки инициализированы\n');

        // Запускаем сервер для тестирования
        const server = app.listen(3002, () => {
            console.log('🚀 Тестовый сервер запущен на порту 3002\n');
        });

        // Тест 1: GET /api/settings/categories
        console.log('1. Тестируем GET /api/settings/categories');
        try {
            const response = await fetch('http://localhost:3002/api/settings/categories');
            const data = await response.json();
            console.log('   ✅ Ответ:', data);
        } catch (error) {
            console.log('   ❌ Ошибка:', error.message);
        }

        // Тест 2: GET /api/settings
        console.log('\n2. Тестируем GET /api/settings');
        try {
            const response = await fetch('http://localhost:3002/api/settings');
            const data = await response.json();
            console.log(`   ✅ Ответ: ${data.length} настроек`);
        } catch (error) {
            console.log('   ❌ Ошибка:', error.message);
        }

        // Тест 3: GET /api/settings?category=portfolio
        console.log('\n3. Тестируем GET /api/settings?category=portfolio');
        try {
            const response = await fetch('http://localhost:3002/api/settings?category=portfolio');
            const data = await response.json();
            console.log(`   ✅ Ответ: ${data.length} настроек портфеля`);
        } catch (error) {
            console.log('   ❌ Ошибка:', error.message);
        }

        // Закрываем сервер
        server.close();
        console.log('\n🎉 Тестирование завершено!');

    } catch (error) {
        console.error('❌ Ошибка при тестировании API:', error);
    } finally {
        process.exit(0);
    }
}

testSettingsAPI();
