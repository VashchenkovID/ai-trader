import dotenv from 'dotenv';
import sequelize from './src/config/database.js';
import User from './src/models/User.js';
import bcrypt from 'bcrypt';

dotenv.config();

async function checkUser() {
    try {
        await sequelize.authenticate();
        console.log('✅ Подключение к БД установлено');

        const username = 'admin';
        const user = await User.findOne({ where: { username } });

        if (!user) {
            console.log('❌ Пользователь не найден');
            console.log('📝 Для создания пользователя запустите: npm run init-db');
            return;
        }

        console.log('✅ Пользователь найден:');
        console.log('   ID:', user.id);
        console.log('   Username:', user.username);
        console.log('   Full Name:', user.fullName);
        console.log('   Active:', user.isActive);
        console.log('   Last Login:', user.lastLogin);

        // Проверяем пароль из .env
        const userPassword = process.env.USER_PASSWORD;
        if (userPassword) {
            const isMatch = await bcrypt.compare(userPassword, user.passwordHash);
            console.log('   Пароль из .env совпадает:', isMatch);
        } else {
            console.log('   ⚠️ USER_PASSWORD не установлен в .env');
        }

    } catch (error) {
        console.error('❌ Ошибка:', error);
    } finally {
        await sequelize.close();
    }
}

checkUser();

