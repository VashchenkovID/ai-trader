/**
 * Тестовый скрипт для проверки системы авторизации
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from './src/models/User.js';
import sequelize from './src/config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Загружаем переменные окружения
dotenv.config({ path: path.join(__dirname, '.env') });

async function testAuth() {
    console.log('🧪 Тестирование системы авторизации...\n');
    
    let errors = [];
    let warnings = [];
    
    try {
        // 1. Проверка подключения к БД
        console.log('1️⃣ Проверка подключения к БД...');
        await sequelize.authenticate();
        console.log('   ✅ Подключение к БД успешно');
        
        // 2. Проверка модели User
        console.log('\n2️⃣ Проверка модели User...');
        try {
            await User.sync({ alter: false });
            console.log('   ✅ Модель User синхронизирована');
        } catch (error) {
            errors.push(`Ошибка синхронизации модели User: ${error.message}`);
            console.log(`   ❌ Ошибка синхронизации: ${error.message}`);
        }
        
        // 3. Проверка существования пользователя
        console.log('\n3️⃣ Проверка пользователя...');
        const user = await User.findOne({ where: { username: 'admin' } });
        
        if (!user) {
            errors.push('Пользователь не найден. Запустите init-db для создания пользователя.');
            console.log('   ❌ Пользователь не найден');
            console.log('   💡 Запустите: npm run init-db');
        } else {
            console.log(`   ✅ Пользователь найден: ${user.fullName} (${user.username})`);
            console.log(`   📅 Создан: ${user.createdAt}`);
            console.log(`   🔐 Активен: ${user.isActive ? 'Да' : 'Нет'}`);
            
            // 4. Проверка пароля
            console.log('\n4️⃣ Проверка пароля...');
            const testPassword = process.env.USER_PASSWORD;
            
            if (!testPassword) {
                warnings.push('USER_PASSWORD не установлен в .env');
                console.log('   ⚠️ USER_PASSWORD не установлен в .env');
            } else {
                try {
                    const isPasswordValid = await bcrypt.compare(testPassword, user.passwordHash);
                    if (isPasswordValid) {
                        console.log('   ✅ Пароль валиден');
                    } else {
                        errors.push('Пароль не совпадает с USER_PASSWORD из .env');
                        console.log('   ❌ Пароль не совпадает');
                    }
                } catch (error) {
                    errors.push(`Ошибка проверки пароля: ${error.message}`);
                    console.log(`   ❌ Ошибка проверки пароля: ${error.message}`);
                }
            }
            
            // 5. Проверка JWT токена
            console.log('\n5️⃣ Проверка JWT токена...');
            const jwtSecret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
            
            try {
                const token = jwt.sign(
                    { userId: user.id, username: user.username },
                    jwtSecret,
                    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
                );
                console.log('   ✅ JWT токен создан');
                
                // Проверяем декодирование
                const decoded = jwt.verify(token, jwtSecret);
                if (decoded.userId === user.id && decoded.username === user.username) {
                    console.log('   ✅ JWT токен валиден');
                    console.log(`   📋 Токен: ${token.substring(0, 50)}...`);
                } else {
                    errors.push('JWT токен не прошел проверку');
                    console.log('   ❌ JWT токен не прошел проверку');
                }
            } catch (error) {
                errors.push(`Ошибка создания/проверки JWT: ${error.message}`);
                console.log(`   ❌ Ошибка JWT: ${error.message}`);
            }
        }
        
        // 6. Проверка переменных окружения
        console.log('\n6️⃣ Проверка переменных окружения...');
        const requiredEnvVars = ['USER_PASSWORD'];
        const optionalEnvVars = ['JWT_SECRET', 'JWT_EXPIRES_IN'];
        
        for (const envVar of requiredEnvVars) {
            if (process.env[envVar]) {
                console.log(`   ✅ ${envVar}: установлен`);
            } else {
                errors.push(`${envVar} не установлен в .env`);
                console.log(`   ❌ ${envVar}: не установлен`);
            }
        }
        
        for (const envVar of optionalEnvVars) {
            if (process.env[envVar]) {
                console.log(`   ✅ ${envVar}: ${process.env[envVar]}`);
            } else {
                warnings.push(`${envVar} не установлен, используется значение по умолчанию`);
                console.log(`   ⚠️ ${envVar}: не установлен (используется значение по умолчанию)`);
            }
        }
        
    } catch (error) {
        errors.push(`Критическая ошибка: ${error.message}`);
        console.error(`\n❌ Критическая ошибка: ${error.message}`);
        if (error.stack) {
            console.error(error.stack);
        }
    }
    
    // Итоги
    console.log('\n' + '='.repeat(60));
    console.log('📊 ИТОГИ ТЕСТИРОВАНИЯ');
    console.log('='.repeat(60));
    
    if (errors.length === 0 && warnings.length === 0) {
        console.log('✅ Все тесты пройдены успешно!');
    } else {
        if (errors.length > 0) {
            console.log(`\n❌ Ошибки (${errors.length}):`);
            errors.forEach((err, index) => {
                console.log(`   ${index + 1}. ${err}`);
            });
        }
        
        if (warnings.length > 0) {
            console.log(`\n⚠️ Предупреждения (${warnings.length}):`);
            warnings.forEach((warn, index) => {
                console.log(`   ${index + 1}. ${warn}`);
            });
        }
    }
    
    console.log('\n');
    
    return {
        success: errors.length === 0,
        errors,
        warnings
    };
}

// Запускаем тесты
testAuth()
    .then(result => {
        process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
        console.error('❌ Критическая ошибка при тестировании:', error);
        process.exit(1);
    });

