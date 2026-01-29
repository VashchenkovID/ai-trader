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

async function checkUserAuth() {
    try {
        console.log('🔍 ПРОВЕРКА АВТОРИЗАЦИИ ПОЛЬЗОВАТЕЛЯ\n');
        
        // Подключаемся к БД
        await sequelize.authenticate();
        console.log('✅ Подключение к БД установлено\n');
        
        // Проверяем наличие пользователя
        const user = await User.findOne({ where: { username: 'admin' } });
        
        if (!user) {
            console.log('❌ Пользователь "admin" не найден в БД');
            console.log('\n📝 Создание пользователя...');
            
            const userPassword = process.env.USER_PASSWORD;
            if (!userPassword) {
                console.error('❌ USER_PASSWORD не установлен в .env файле');
                console.error('   Установите USER_PASSWORD в .env файле');
                process.exit(1);
            }
            
            const saltRounds = 10;
            const passwordHash = await bcrypt.hash(userPassword, saltRounds);
            
            const newUser = await User.create({
                username: 'admin',
                fullName: 'Иван Дмитриевич',
                passwordHash: passwordHash,
                isActive: true
            });
            
            console.log(`✅ Пользователь создан: ${newUser.username} (id: ${newUser.id})`);
            console.log(`   Полное имя: ${newUser.fullName}`);
            console.log(`   Активен: ${newUser.isActive}`);
        } else {
            console.log('✅ Пользователь найден:');
            console.log(`   ID: ${user.id}`);
            console.log(`   Username: ${user.username}`);
            console.log(`   Полное имя: ${user.fullName}`);
            console.log(`   Активен: ${user.isActive}`);
            console.log(`   Последний вход: ${user.lastLogin || 'Никогда'}`);
            
            // Проверяем пароль
            const userPassword = process.env.USER_PASSWORD;
            if (userPassword) {
                const isPasswordMatch = await bcrypt.compare(userPassword, user.passwordHash);
                console.log(`\n🔐 Проверка пароля:`);
                console.log(`   USER_PASSWORD из .env: ${userPassword ? 'Установлен (длина: ' + userPassword.length + ')' : 'Не установлен'}`);
                console.log(`   Пароль совпадает: ${isPasswordMatch ? '✅ Да' : '❌ Нет'}`);
                
                if (!isPasswordMatch) {
                    console.log('\n🔄 Обновление пароля...');
                    const saltRounds = 10;
                    const newPasswordHash = await bcrypt.hash(userPassword, saltRounds);
                    await user.update({ passwordHash: newPasswordHash });
                    console.log('✅ Пароль обновлен');
                }
            } else {
                console.log('\n⚠️ USER_PASSWORD не установлен в .env файле');
                console.log('   Невозможно проверить пароль');
            }
            
            // Убеждаемся, что пользователь активен
            if (!user.isActive) {
                console.log('\n🔄 Активация пользователя...');
                await user.update({ isActive: true });
                console.log('✅ Пользователь активирован');
            }
        }
        
        // Тестируем авторизацию
        console.log('\n🧪 ТЕСТ АВТОРИЗАЦИИ:');
        const testPassword = process.env.USER_PASSWORD;
        if (testPassword) {
            const testUser = await User.findOne({ where: { username: 'admin' } });
            if (testUser) {
                const isValid = await bcrypt.compare(testPassword, testUser.passwordHash);
                console.log(`   Username: admin`);
                console.log(`   Password: ${testPassword.substring(0, 3)}*** (скрыт)`);
                console.log(`   Результат: ${isValid ? '✅ Пароль верный' : '❌ Пароль неверный'}`);
            }
        } else {
            console.log('   ⚠️ USER_PASSWORD не установлен, тест пропущен');
        }
        
        console.log('\n✅ Проверка завершена');
        
    } catch (error) {
        console.error('❌ Ошибка:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
}

checkUserAuth();

