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

async function addIsActiveColumn() {
    try {
        console.log('🔄 Adding isActive column to cached_instruments table...');
        
        // Добавляем столбец isActive
        await sequelize.query(`
            ALTER TABLE cached_instruments 
            ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN DEFAULT true;
        `);
        
        console.log('✅ Column isActive added successfully');
        
        // Обновляем все существующие записи
        await sequelize.query(`
            UPDATE cached_instruments 
            SET "isActive" = true 
            WHERE "isActive" IS NULL;
        `);
        
        console.log('✅ All existing records updated with isActive = true');
        
        // Проверяем результат
        const result = await sequelize.query(`
            SELECT COUNT(*) as total, 
                   COUNT(CASE WHEN "isActive" = true THEN 1 END) as active
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
addIsActiveColumn();
