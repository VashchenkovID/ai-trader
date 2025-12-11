import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

// Настройки подключения к базе данных
const sequelize = new Sequelize(
    process.env.DB_NAME || 'ivashka_trade_helper',
    process.env.DB_USER || 'postgres',
    process.env.DB_PASSWORD || 'password',
    {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        dialect: 'postgres',
        logging: false,
    }
);

async function addStrategyIdColumn() {
    try {
        console.log('🔄 Adding strategyId column to Recommendations table...');
        
        // Проверяем, существует ли таблица trading_strategies
        const [tables] = await sequelize.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'trading_strategies';
        `);
        
        if (tables.length === 0) {
            console.log('⚠️ Table trading_strategies does not exist. Please run initDatabase first.');
            await sequelize.close();
            return;
        }
        
        // Добавляем столбец strategyId
        await sequelize.query(`
            ALTER TABLE "Recommendations" 
            ADD COLUMN IF NOT EXISTS "strategyId" INTEGER;
        `);
        
        console.log('✅ Column strategyId added successfully');
        
        // Добавляем внешний ключ
        await sequelize.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint 
                    WHERE conname = 'Recommendations_strategyId_fkey'
                ) THEN
                    ALTER TABLE "Recommendations"
                    ADD CONSTRAINT "Recommendations_strategyId_fkey"
                    FOREIGN KEY ("strategyId")
                    REFERENCES "trading_strategies"("id")
                    ON DELETE SET NULL
                    ON UPDATE CASCADE;
                END IF;
            END $$;
        `);
        
        console.log('✅ Foreign key constraint added successfully');
        
        // Добавляем индекс для улучшения производительности запросов
        await sequelize.query(`
            CREATE INDEX IF NOT EXISTS "idx_recommendations_strategy_id" 
            ON "Recommendations"("strategyId");
        `);
        
        console.log('✅ Index on strategyId added successfully');
        
        // Проверяем результат
        const [columns] = await sequelize.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'Recommendations'
            AND column_name = 'strategyId';
        `);
        
        if (columns.length > 0) {
            console.log('📊 Column info:', columns[0]);
        }
        
        await sequelize.close();
        console.log('🎉 Migration completed successfully!');
        
    } catch (error) {
        console.error('❌ Error during migration:', error.message);
        console.error('Full error:', error);
        await sequelize.close();
        process.exit(1);
    }
}

// Запускаем миграцию
addStrategyIdColumn();

