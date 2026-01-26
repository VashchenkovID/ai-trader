import { Sequelize, DataTypes } from 'sequelize';
import dotenv from 'dotenv';
import { join } from 'path';

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

async function createCashFlowsTable() {
    try {
        await sequelize.authenticate();
        console.log('✅ Database connection established');

        console.log('🔄 Creating cash_flows table...');

        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS cash_flows (
                id SERIAL PRIMARY KEY,
                type VARCHAR(20) NOT NULL CHECK (type IN ('DEPOSIT', 'WITHDRAWAL')),
                amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
                date TIMESTAMP NOT NULL DEFAULT NOW(),
                description TEXT,
                "portfolioType" VARCHAR(20) NOT NULL DEFAULT 'real' CHECK ("portfolioType" IN ('virtual', 'real')),
                metadata JSONB DEFAULT '{}',
                "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
            );
        `);

        console.log('✅ Table cash_flows created successfully');

        // Создаем индексы
        console.log('🔄 Creating indexes...');
        
        await sequelize.query(`
            CREATE INDEX IF NOT EXISTS idx_cash_flows_portfolio_type ON cash_flows("portfolioType");
        `);
        
        await sequelize.query(`
            CREATE INDEX IF NOT EXISTS idx_cash_flows_type ON cash_flows(type);
        `);
        
        await sequelize.query(`
            CREATE INDEX IF NOT EXISTS idx_cash_flows_date ON cash_flows(date);
        `);
        
        await sequelize.query(`
            CREATE INDEX IF NOT EXISTS idx_cash_flows_portfolio_type_date ON cash_flows("portfolioType", date);
        `);

        console.log('✅ Indexes created successfully');

        await sequelize.close();
        console.log('✅ Migration completed successfully');
    } catch (error) {
        console.error('❌ Error creating cash_flows table:', error);
        await sequelize.close();
        process.exit(1);
    }
}

createCashFlowsTable();

