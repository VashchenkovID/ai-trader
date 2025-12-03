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

async function addInstrumentTypeColumn() {
    try {
        console.log('🔄 Adding instrumentType column to cached_instruments table...');
        
        // Добавляем столбец instrumentType
        await sequelize.query(`
            ALTER TABLE cached_instruments 
            ADD COLUMN IF NOT EXISTS "instrumentType" VARCHAR(255);
        `);
        
        console.log('✅ Column instrumentType added successfully');
        
        // Обновляем существующие записи: устанавливаем 'share' для всех существующих
        // (так как getStocks() возвращает только акции)
        await sequelize.query(`
            UPDATE cached_instruments 
            SET "instrumentType" = 'share' 
            WHERE "instrumentType" IS NULL;
        `);
        
        console.log('✅ All existing records updated with instrumentType = share (default)');
        
        // Проверяем результат
        const result = await sequelize.query(`
            SELECT 
                COUNT(*) as total,
                COUNT("instrumentType") as with_type,
                COUNT(CASE WHEN "instrumentType" = 'share' THEN 1 END) as shares
            FROM cached_instruments;
        `);
        
        console.log('📊 Migration result:', result[0][0]);
        
        await sequelize.close();
        console.log('🎉 Migration completed successfully!');
        
    } catch (error) {
        console.error('❌ Error during migration:', error.message);
        await sequelize.close();
        process.exit(1);
    }
}

// Запускаем миграцию
addInstrumentTypeColumn();

