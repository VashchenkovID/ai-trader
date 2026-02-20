#!/usr/bin/env node

/**
 * Скрипт для полной инициализации базы данных
 * Создает все таблицы, ENUM типы, индексы и начальные данные
 * 
 * Использование:
 *   node scripts/init-database.js
 *   node scripts/init-database.js --force  (пересоздать все таблицы)
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Определяем путь к .env файлу
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '..', '.env');

// Загружаем переменные окружения
dotenv.config({ path: envPath });

// Проверяем альтернативные пути к .env
if (!process.env.DB_HOST) {
    const altEnvPath = join(__dirname, '..', '..', '.env');
    dotenv.config({ path: altEnvPath });
}

import { initDatabase } from '../src/utils/initDatabase.js';
import sequelize from '../src/config/database.js';

const args = process.argv.slice(2);
const force = args.includes('--force') || args.includes('-f');

async function main() {
    console.log('🚀 Начинаем полную инициализацию базы данных...\n');
    
    if (force) {
        console.log('⚠️  ВНИМАНИЕ: Используется режим --force');
        console.log('   Все существующие таблицы будут пересозданы!\n');
    }
    
    try {
        // Проверяем подключение к БД
        console.log('📡 Проверка подключения к базе данных...');
        await sequelize.authenticate();
        console.log('✅ Подключение к базе данных установлено\n');
        
        // Если force, удаляем все таблицы (ОПАСНО!)
        if (force) {
            console.log('🗑️  Удаление всех таблиц...');
            try {
                await sequelize.drop({ cascade: true });
                console.log('✅ Все таблицы удалены\n');
            } catch (dropError) {
                console.warn('⚠️  Предупреждение при удалении таблиц:', dropError.message);
                console.log('   Продолжаем инициализацию...\n');
            }
        }
        
        // Запускаем инициализацию
        console.log('🔄 Запуск инициализации базы данных...\n');
        await initDatabase();
        
        console.log('\n✅ Инициализация базы данных успешно завершена!');
        console.log('📊 База данных готова к использованию\n');
        
        // Показываем статистику
        try {
            const [results] = await sequelize.query(`
                SELECT 
                    COUNT(*) as table_count
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_type = 'BASE TABLE';
            `);
            
            const tableCount = results[0]?.table_count || 0;
            console.log(`📈 Создано таблиц: ${tableCount}`);
            
            // Показываем список таблиц
            const [tables] = await sequelize.query(`
                SELECT table_name
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_type = 'BASE TABLE'
                ORDER BY table_name;
            `);
            
            if (tables.length > 0) {
                console.log('\n📋 Список таблиц:');
                tables.forEach((row, index) => {
                    console.log(`   ${index + 1}. ${row.table_name}`);
                });
            }
        } catch (statsError) {
            console.warn('⚠️  Не удалось получить статистику:', statsError.message);
        }
        
        console.log('\n✨ Готово!');
        
    } catch (error) {
        console.error('\n❌ ОШИБКА при инициализации базы данных:');
        console.error('   Сообщение:', error.message);
        if (error.stack) {
            console.error('\n   Stack trace:');
            console.error(error.stack);
        }
        process.exit(1);
    } finally {
        // Закрываем соединение
        try {
            await sequelize.close();
            console.log('\n🔌 Соединение с базой данных закрыто');
        } catch (closeError) {
            // Игнорируем ошибки закрытия
        }
    }
}

// Запускаем скрипт
main().catch(error => {
    console.error('❌ Критическая ошибка:', error);
    process.exit(1);
});

