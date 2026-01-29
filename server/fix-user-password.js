import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import sequelize from './src/config/database.js';
import User from './src/models/User.js';
import bcrypt from 'bcrypt';

// Загружаем переменные окружения
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });
dotenv.config();

async function fixUserPassword() {
    try {
        console.log('🔧 ИСПРАВЛЕНИЕ ПАРОЛЯ ПОЛЬЗОВАТЕЛЯ\n');
        
        // Подключаемся к БД
        await sequelize.authenticate();
        console.log('✅ Подключение к БД установлено\n');
        
        const userPassword = process.env.USER_PASSWORD;
        if (!userPassword) {
            console.error('❌ USER_PASSWORD не установлен в .env файле');
            process.exit(1);
        }
        
        console.log(`📝 Пароль из .env: длина ${userPassword.length} символов\n`);
        
        // Находим пользователя
        const user = await User.findOne({ where: { username: 'admin' } });
        
        if (!user) {
            console.log('❌ Пользователь "admin" не найден');
            console.log('📝 Создание пользователя...\n');
            
            const saltRounds = 10;
            const passwordHash = await bcrypt.hash(userPassword, saltRounds);
            
            const newUser = await User.create({
                username: 'admin',
                fullName: 'Иван Дмитриевич',
                passwordHash: passwordHash,
                isActive: true
            });
            
            console.log(`✅ Пользователь создан: ${newUser.username} (id: ${newUser.id})`);
        } else {
            console.log(`✅ Пользователь найден: ${user.username} (id: ${user.id})`);
            
            // Проверяем текущий пароль
            const isPasswordMatch = await bcrypt.compare(userPassword, user.passwordHash);
            console.log(`\n🔐 Проверка пароля:`);
            console.log(`   Совпадает: ${isPasswordMatch ? '✅ Да' : '❌ Нет'}`);
            
            if (!isPasswordMatch) {
                console.log('\n🔄 Обновление пароля...');
                const saltRounds = 10;
                const newPasswordHash = await bcrypt.hash(userPassword, saltRounds);
                await user.update({ passwordHash: newPasswordHash });
                console.log('✅ Пароль обновлен');
                
                // Проверяем новый пароль
                const isNewPasswordMatch = await bcrypt.compare(userPassword, newPasswordHash);
                console.log(`   Проверка нового пароля: ${isNewPasswordMatch ? '✅ Да' : '❌ Нет'}`);
            } else {
                console.log('✅ Пароль уже правильный, обновление не требуется');
            }
            
            // Убеждаемся, что пользователь активен
            if (!user.isActive) {
                await user.update({ isActive: true });
                console.log('✅ Пользователь активирован');
            }
        }
        
        console.log('\n✅ Готово! Теперь можно войти с паролем из USER_PASSWORD');
        
    } catch (error) {
        console.error('❌ Ошибка:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
}

fixUserPassword();

