import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем переменные окружения из папки server
dotenv.config({ path: join(__dirname, '../.env') });

// Используем те же настройки, что и в database.js
const dbName = process.env.DB_NAME;
const dbUser = process.env.DB_USER;
const dbPassword = String(process.env.DB_PASSWORD || ''); // Приводим к строке
const dbHost = process.env.DB_HOST;
const dbPort = process.env.DB_PORT;

if (!dbName || !dbUser || !dbPassword || !dbHost || !dbPort) {
    console.error('❌ Database environment variables are not set');
    console.error('Required: DB_NAME, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT');
    console.error('Please check your .env file');
    process.exit(1);
}

const sequelize = new Sequelize(
    dbName,
    dbUser,
    dbPassword,
    {
        host: dbHost,
        port: dbPort,
        dialect: 'postgres',
        logging: false
    }
);

async function createTrailingStopsTable() {
    try {
        await sequelize.authenticate();
        console.log('✅ Database connection established');

        console.log('🔄 Creating trailing_stops table...');

        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS trailing_stops (
                id SERIAL PRIMARY KEY,
                "tradingRequestId" UUID REFERENCES trading_requests(id) ON DELETE SET NULL,
                figi VARCHAR(255) NOT NULL,
                ticker VARCHAR(255) NOT NULL,
                "entryPrice" DOUBLE PRECISION NOT NULL,
                quantity DOUBLE PRECISION NOT NULL,
                direction VARCHAR(10) NOT NULL CHECK (direction IN ('BUY', 'SELL')),
                "activationProfitPercent" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
                "trailingDistancePercent" DOUBLE PRECISION,
                "trailingDistanceATR" DOUBLE PRECISION,
                "useATR" BOOLEAN NOT NULL DEFAULT false,
                "isActive" BOOLEAN NOT NULL DEFAULT false,
                "currentStopPrice" DOUBLE PRECISION,
                "highestPrice" DOUBLE PRECISION,
                "lowestPrice" DOUBLE PRECISION,
                status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'triggered', 'cancelled')),
                "triggeredAt" TIMESTAMP,
                "triggerPrice" DOUBLE PRECISION,
                "portfolioType" VARCHAR(20) NOT NULL DEFAULT 'virtual' CHECK ("portfolioType" IN ('virtual', 'real')),
                "strategyId" INTEGER REFERENCES trading_strategies(id) ON DELETE SET NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
            );
        `);

        console.log('✅ Table trailing_stops created successfully');

        // Создаем индексы
        await sequelize.query(`
            CREATE INDEX IF NOT EXISTS idx_trailing_stops_figi_status 
            ON trailing_stops(figi, status);
        `);

        await sequelize.query(`
            CREATE INDEX IF NOT EXISTS idx_trailing_stops_trading_request_id 
            ON trailing_stops("tradingRequestId");
        `);

        await sequelize.query(`
            CREATE INDEX IF NOT EXISTS idx_trailing_stops_status_active 
            ON trailing_stops(status, "isActive");
        `);

        await sequelize.query(`
            CREATE INDEX IF NOT EXISTS idx_trailing_stops_portfolio_type 
            ON trailing_stops("portfolioType");
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

createTrailingStopsTable();

