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
const dbPassword = String(process.env.DB_PASSWORD || '');
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
        port: parseInt(dbPort),
        dialect: 'postgres',
        logging: false,
    }
);

async function createCorrelationCacheTable() {
    try {
        // Проверяем подключение
        await sequelize.authenticate();
        console.log('✅ Database connection established');
        
        console.log('🔄 Creating correlation_cache table...');
        
        // Создаем таблицу correlation_cache
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS correlation_cache (
                id SERIAL PRIMARY KEY,
                "figi1" VARCHAR(50) NOT NULL,
                "figi2" VARCHAR(50) NOT NULL,
                correlation DOUBLE PRECISION NOT NULL,
                period INTEGER NOT NULL DEFAULT 30,
                "calculatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "expiresAt" TIMESTAMP NOT NULL,
                "dataPoints" INTEGER,
                "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT check_correlation_range CHECK (correlation >= -1 AND correlation <= 1),
                CONSTRAINT unique_correlation_pair UNIQUE ("figi1", "figi2", period)
            );
        `);
        
        console.log('✅ Table correlation_cache created successfully');
        
        // Создаем индексы
        console.log('🔄 Creating indexes...');
        
        await sequelize.query(`
            CREATE INDEX IF NOT EXISTS idx_expires_at ON correlation_cache ("expiresAt");
        `);
        
        await sequelize.query(`
            CREATE INDEX IF NOT EXISTS idx_figi1 ON correlation_cache ("figi1");
        `);
        
        await sequelize.query(`
            CREATE INDEX IF NOT EXISTS idx_figi2 ON correlation_cache ("figi2");
        `);
        
        console.log('✅ Indexes created successfully');
        
        // Проверяем результат
        const result = await sequelize.query(`
            SELECT COUNT(*) as total FROM correlation_cache;
        `);
        
        console.log('📊 Table created, current rows:', result[0][0].total);
        
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

// Запускаем миграцию
createCorrelationCacheTable();

