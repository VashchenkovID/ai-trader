/**
 * Миграция для создания таблицы недельных прогнозов (weekly_forecasts)
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

if (!dbName || !dbUser || !dbHost || !dbPort) {
    console.error('❌ Database environment variables are not set');
    process.exit(1);
}

const sequelize = new Sequelize(dbName, dbUser, dbPassword, {
    host: dbHost,
    port: dbPort,
    dialect: 'postgres',
    logging: false
});

async function createWeeklyForecastsTable() {
    try {
        await sequelize.authenticate();
        console.log('✅ Database connection established');

        console.log('🔄 Creating weekly_forecasts table...');

        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS weekly_forecasts (
                id SERIAL PRIMARY KEY,
                figi VARCHAR(50) NOT NULL,
                ticker VARCHAR(20) NOT NULL,
                forecast_date DATE NOT NULL,
                start_date DATE NOT NULL,
                end_date DATE NOT NULL,
                forecast_data JSONB NOT NULL,
                model_version VARCHAR(50),
                model_type VARCHAR(50) DEFAULT 'seq2seq' CHECK (model_type IN ('seq2seq', 'transformer', 'lstm', 'ensemble')),
                confidence_score DECIMAL(5, 4) CHECK (confidence_score >= 0 AND confidence_score <= 1),
                predicted_volatility DECIMAL(10, 6),
                predicted_trend VARCHAR(20) CHECK (predicted_trend IN ('BULLISH', 'BEARISH', 'SIDEWAYS') OR predicted_trend IS NULL),
                predicted_price_change DECIMAL(10, 4),
                actual_data JSONB,
                accuracy_metrics JSONB,
                is_completed BOOLEAN DEFAULT false,
                completion_date DATE,
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
        `);

        console.log('✅ Table weekly_forecasts created successfully');

        // Создаем индексы
        await sequelize.query(`
            CREATE INDEX IF NOT EXISTS idx_weekly_forecasts_figi_forecast_date 
            ON weekly_forecasts(figi, forecast_date);
        `);

        await sequelize.query(`
            CREATE INDEX IF NOT EXISTS idx_weekly_forecasts_start_date 
            ON weekly_forecasts(start_date);
        `);

        await sequelize.query(`
            CREATE INDEX IF NOT EXISTS idx_weekly_forecasts_is_completed 
            ON weekly_forecasts(is_completed);
        `);

        await sequelize.query(`
            CREATE INDEX IF NOT EXISTS idx_weekly_forecasts_figi_is_completed 
            ON weekly_forecasts(figi, is_completed);
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

createWeeklyForecastsTable();

