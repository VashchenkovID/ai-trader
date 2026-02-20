/**
 * Скрипт для запуска миграций автоматической торговли
 */

import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sequelize from '../src/config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../.env') });

async function runMigrations() {
    try {
        console.log('🔄 Запуск миграций для автоматической торговли...');
        
        await sequelize.authenticate();
        console.log('✅ Подключение к БД установлено');
        
        const queryInterface = sequelize.getQueryInterface();
        
        // Миграция 1: Создание таблицы auto_paper_trading_stats
        console.log('\n📊 Миграция 1: Создание таблицы auto_paper_trading_stats...');
        try {
            // Проверяем, существует ли таблица
            const [results1] = await sequelize.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'auto_paper_trading_stats'
                ) as "exists";
            `);
            
            const tableExists = results1 && results1[0] && (results1[0].exists === true || results1[0].exists === 't');
            
            if (tableExists) {
                console.log('⚠️ Таблица auto_paper_trading_stats уже существует');
            } else {
                const { up: up1 } = await import('../migrations/create-auto-paper-trading-stats-table.js');
                await up1(queryInterface, sequelize.Sequelize);
                console.log('✅ Таблица auto_paper_trading_stats создана');
            }
        } catch (error) {
            if (error.message.includes('already exists') || error.message.includes('уже существует')) {
                console.log('⚠️ Таблица auto_paper_trading_stats уже существует');
            } else {
                throw error;
            }
        }
        
        // Миграция 2: Добавление полей в trading_requests
        console.log('\n📝 Миграция 2: Добавление полей в trading_requests...');
        try {
            const { up: up2 } = await import('../migrations/add-auto-paper-trading-fields-to-trading-requests.js');
            await up2(queryInterface, sequelize.Sequelize);
            console.log('✅ Поля добавлены в trading_requests');
        } catch (error) {
            if (error.message.includes('already exists') || error.message.includes('уже существует')) {
                console.log('⚠️ Поля уже существуют в trading_requests');
            } else {
                throw error;
            }
        }
        
        console.log('\n✅ Все миграции выполнены успешно!');
        await sequelize.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Ошибка при выполнении миграций:', error);
        console.error('Stack:', error.stack);
        if (sequelize) {
            await sequelize.close();
        }
        process.exit(1);
    }
}

runMigrations();

