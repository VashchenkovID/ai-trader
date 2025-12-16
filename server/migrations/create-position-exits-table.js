/**
 * Миграция для создания таблицы частичных закрытий позиций (position_exits)
 * Выполняется автоматически при запуске initDatabase.js
 */

import { Sequelize, DataTypes } from 'sequelize';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем переменные окружения
dotenv.config({ path: join(__dirname, '../.env') });

const dbName = process.env.DB_NAME;
const dbUser = process.env.DB_USER;
const dbPassword = String(process.env.DB_PASSWORD || '');
const dbHost = process.env.DB_HOST;
const dbPort = process.env.DB_PORT;

if (!dbName || !dbUser || !dbPassword || !dbHost || !dbPort) {
    console.error('❌ Database environment variables are not set');
    process.exit(1);
}

const sequelize = new Sequelize(dbName, dbUser, dbPassword, {
    host: dbHost,
    port: dbPort,
    dialect: 'postgres',
    logging: false
});

async function createPositionExitsTable() {
    try {
        await sequelize.authenticate();
        console.log('✅ Database connection established');

        console.log('🔄 Creating position_exits table...');

        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS position_exits (
                id SERIAL PRIMARY KEY,
                "tradingRequestId" UUID REFERENCES trading_requests(id) ON DELETE CASCADE,
                figi VARCHAR(255) NOT NULL,
                ticker VARCHAR(255) NOT NULL,
                name VARCHAR(255) NOT NULL,
                "entryPrice" DOUBLE PRECISION NOT NULL,
                "initialQuantity" INTEGER NOT NULL,
                "remainingQuantity" INTEGER NOT NULL,
                "exitStage" VARCHAR(50) NOT NULL CHECK ("exitStage" IN ('STAGE_1_10PCT', 'STAGE_2_15PCT', 'STAGE_3_20PCT', 'FULL_CLOSE', 'TRAILING_STOP')),
                "profitPercent" DOUBLE PRECISION NOT NULL,
                "exitPrice" DOUBLE PRECISION NOT NULL,
                "exitQuantity" INTEGER NOT NULL,
                "exitAmount" DOUBLE PRECISION NOT NULL,
                commission DOUBLE PRECISION NOT NULL DEFAULT 0,
                "realizedProfit" DOUBLE PRECISION NOT NULL DEFAULT 0,
                status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'EXECUTED', 'FAILED', 'CANCELLED')),
                "tradingMode" VARCHAR(20) NOT NULL DEFAULT 'paper' CHECK ("tradingMode" IN ('paper', 'micro', 'real')),
                "executedAt" TIMESTAMP,
                notes TEXT,
                "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
            );
        `);

        console.log('✅ Table position_exits created successfully');

        // Создаем индексы
        await sequelize.query(`
            CREATE INDEX IF NOT EXISTS idx_position_exits_trading_request_id 
            ON position_exits("tradingRequestId");
        `);

        await sequelize.query(`
            CREATE INDEX IF NOT EXISTS idx_position_exits_figi_status 
            ON position_exits(figi, status);
        `);

        await sequelize.query(`
            CREATE INDEX IF NOT EXISTS idx_position_exits_exit_stage_status 
            ON position_exits("exitStage", status);
        `);

        await sequelize.query(`
            CREATE INDEX IF NOT EXISTS idx_position_exits_executed_at 
            ON position_exits("executedAt");
        `);

        console.log('✅ Indexes created successfully');

        await sequelize.close();
        console.log('✅ Migration completed successfully!');

    } catch (error) {
        console.error('❌ Error during migration:', error.message);
        console.error('Stack:', error.stack);
        if (sequelize) {
            await sequelize.close();
        }
        process.exit(1);
    }
}

createPositionExitsTable();

