/**
 * Миграция: Добавление полей telegramSent и telegramSentAt в таблицу cached_signals
 * Для отслеживания отправленных в Telegram сигналов
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import { Sequelize, DataTypes } from 'sequelize';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем переменные окружения
dotenv.config({ path: join(__dirname, '../.env') });

// Создаем подключение для миграции
const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    String(process.env.DB_PASSWORD || ''),
    {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        dialect: 'postgres',
        logging: false
    }
);

export async function up(queryInterface, Sequelize) {
    const literal = (value) => queryInterface.sequelize.literal(value);
    
    // Добавляем поле telegramSent
    await queryInterface.addColumn('cached_signals', 'telegramSent', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Отправлен ли сигнал в Telegram'
    });

    // Добавляем поле telegramSentAt
    await queryInterface.addColumn('cached_signals', 'telegramSentAt', {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Дата и время отправки сигнала в Telegram'
    });
}

export async function down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('cached_signals', 'telegramSentAt');
    await queryInterface.removeColumn('cached_signals', 'telegramSent');
}

// Позволяет запускать миграцию напрямую командой `node migrations/add-telegram-sent-to-cached-signals.js`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const run = async () => {
        const queryInterface = sequelize.getQueryInterface();
        try {
            await up(queryInterface, DataTypes);
            console.log('✅ Migration applied: added telegramSent and telegramSentAt to cached_signals');
        } catch (err) {
            console.error('❌ Migration failed:', err);
            process.exitCode = 1;
        } finally {
            await sequelize.close();
        }
    };
    run();
}

