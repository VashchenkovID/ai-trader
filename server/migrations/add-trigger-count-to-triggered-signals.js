/**
 * Миграция для добавления полей triggerCount и lastTriggeredAt в таблицу triggered_signals
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
    
    // Добавляем поле triggerCount
    await queryInterface.addColumn('triggered_signals', 'triggerCount', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: 'Количество срабатываний этого сигнала (один сигнал может сработать несколько раз)'
    });

    // Добавляем поле lastTriggeredAt
    await queryInterface.addColumn('triggered_signals', 'lastTriggeredAt', {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: literal('CURRENT_TIMESTAMP'),
        comment: 'Дата и время последнего срабатывания сигнала'
    });

    // Обновляем существующие записи: устанавливаем triggerCount = 1 и lastTriggeredAt = triggeredAt
    await queryInterface.sequelize.query(`
        UPDATE triggered_signals 
        SET "triggerCount" = 1, 
            "lastTriggeredAt" = "triggeredAt"
        WHERE "triggerCount" IS NULL OR "lastTriggeredAt" IS NULL;
    `);
}

export async function down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('triggered_signals', 'triggerCount');
    await queryInterface.removeColumn('triggered_signals', 'lastTriggeredAt');
}

// Позволяет запускать миграцию напрямую командой `node migrations/add-trigger-count-to-triggered-signals.js`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const run = async () => {
        const queryInterface = sequelize.getQueryInterface();
        try {
            await up(queryInterface, DataTypes);
            console.log('✅ Migration applied: added triggerCount and lastTriggeredAt to triggered_signals');
        } catch (err) {
            console.error('❌ Migration failed:', err);
            process.exitCode = 1;
        } finally {
            await sequelize.close();
        }
    };
    run();
}

