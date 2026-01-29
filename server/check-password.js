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

async function checkPassword() {
    try {
        console.log('🔍 ПРОВЕРКА ПАРОЛЯ ПОЛЬЗОВАТЕЛЯ\n');
        
        // Подключаемся к БД
        await sequelize.authenticate();
        console.log('✅ Подключение к БД установлено\n');
        
        // Находим пользователя
        const user = await User.findOne({ where: { username: 'admin' } });
        
        if (!user) {
            console.log('❌ Пользователь "admin" не найден в БД');
            process.exit(1);
        }
        
        console.log('👤 ИНФОРМАЦИЯ О ПОЛЬЗОВАТЕЛЕ:');
        console.log(`   ID: ${user.id}`);
        console.log(`   Username: ${user.username}`);
        console.log(`   Полное имя: ${user.fullName}`);
        console.log(`   Активен: ${user.isActive ? '✅ Да' : '❌ Нет'}`);
        console.log(`   Последний вход: ${user.lastLogin || 'Никогда'}`);
        console.log(`   Создан: ${user.createdAt}`);
        console.log(`   Обновлен: ${user.updatedAt}`);
        
        console.log('\n🔐 ИНФОРМАЦИЯ О ПАРОЛЕ:');
        console.log(`   Хеш пароля (первые 20 символов): ${user.passwordHash.substring(0, 20)}...`);
        console.log(`   Длина хеша: ${user.passwordHash.length} символов`);
        console.log(`   Формат: bcrypt (${user.passwordHash.startsWith('$2') ? 'определен' : 'неизвестен'})`);
        
        // Проверяем пароль из .env
        const userPassword = process.env.USER_PASSWORD;
        if (userPassword) {
            console.log(`\n📝 ПАРОЛЬ ИЗ .ENV:`);
            console.log(`   Установлен: ✅ Да`);
            console.log(`   Длина: ${userPassword.length} символов`);
            console.log(`   Первые 3 символа: ${userPassword.substring(0, 3)}***`);
            
            console.log(`\n🧪 ПРОВЕРКА СОВПАДЕНИЯ:`);
            const isPasswordMatch = await bcrypt.compare(userPassword, user.passwordHash);
            console.log(`   Результат: ${isPasswordMatch ? '✅ Пароли СОВПАДАЮТ' : '❌ Пароли НЕ совпадают'}`);
            
            if (!isPasswordMatch) {
                console.log('\n⚠️ Пароль из .env НЕ совпадает с паролем в БД!');
                console.log('   Выполните: npm run fix:password');
            } else {
                console.log('\n✅ Пароль из .env совпадает с паролем в БД');
                console.log('   Можно использовать этот пароль для входа');
            }
        } else {
            console.log(`\n⚠️ USER_PASSWORD не установлен в .env файле`);
            console.log('   Невозможно проверить совпадение пароля');
        }
        
        console.log('\n💡 ПРИМЕЧАНИЕ:');
        console.log('   Исходный пароль нельзя восстановить из хеша');
        console.log('   Можно только проверить, совпадает ли пароль с хешем');
        console.log('   Для входа используйте пароль из USER_PASSWORD в .env файле');
        
    } catch (error) {
        console.error('❌ Ошибка:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
}

checkPassword();

