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
        port: parseInt(dbPort),
        dialect: 'postgres',
        logging: false,
    }
);

async function addAtrMultiplierColumn() {
    try {
        // Проверяем подключение
        await sequelize.authenticate();
        console.log('✅ Database connection established');
        
        console.log('🔄 Adding atrMultiplier column to trading_strategies table...');
        
        // Добавляем столбец atrMultiplier
        await sequelize.query(`
            ALTER TABLE trading_strategies 
            ADD COLUMN IF NOT EXISTS "atrMultiplier" DOUBLE PRECISION;
        `);
        
        console.log('✅ Column atrMultiplier added successfully');
        
        // Добавляем ограничение на диапазон значений (0.5 - 5.0)
        try {
            await sequelize.query(`
                ALTER TABLE trading_strategies 
                ADD CONSTRAINT check_atr_multiplier_range 
                CHECK ("atrMultiplier" IS NULL OR ("atrMultiplier" >= 0.5 AND "atrMultiplier" <= 5.0));
            `);
            console.log('✅ Constraint added successfully');
        } catch (constraintError) {
            // Ограничение может уже существовать
            if (constraintError.message.includes('already exists')) {
                console.log('⚠️ Constraint already exists, skipping');
            } else {
                throw constraintError;
            }
        }
        
        // Обновляем существующие стратегии значениями по умолчанию
        await sequelize.query(`
            UPDATE trading_strategies 
            SET "atrMultiplier" = 1.8 
            WHERE type = 'conservative' AND "atrMultiplier" IS NULL;
        `);
        
        await sequelize.query(`
            UPDATE trading_strategies 
            SET "atrMultiplier" = 2.2 
            WHERE type = 'moderate' AND "atrMultiplier" IS NULL;
        `);
        
        await sequelize.query(`
            UPDATE trading_strategies 
            SET "atrMultiplier" = 2.7 
            WHERE type = 'aggressive' AND "atrMultiplier" IS NULL;
        `);
        
        console.log('✅ Default values set for existing strategies');
        
        // Проверяем результат
        const result = await sequelize.query(`
            SELECT type, COUNT(*) as total, 
                   COUNT(CASE WHEN "atrMultiplier" IS NOT NULL THEN 1 END) as with_atr
            FROM trading_strategies
            GROUP BY type;
        `);
        
        console.log('📊 Migration result:', result[0]);
        
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
addAtrMultiplierColumn();

