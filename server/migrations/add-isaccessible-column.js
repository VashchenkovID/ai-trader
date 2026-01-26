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

/**
 * Миграция: Добавление поля isAccessible в таблицу cached_instruments
 * Поле указывает, доступен ли инструмент для торговли без статуса квалифицированного инвестора
 * false = требуется квалифицированный инвестор
 */
async function addIsAccessibleColumn() {
    try {
        console.log('🔄 Adding isAccessible column to cached_instruments table...');
        
        // Добавляем столбец isAccessible
        await sequelize.query(`
            ALTER TABLE cached_instruments 
            ADD COLUMN IF NOT EXISTS "isAccessible" BOOLEAN DEFAULT true;
        `);
        
        console.log('✅ Column isAccessible added successfully');
        
        // Обновляем все существующие записи (по умолчанию доступны)
        await sequelize.query(`
            UPDATE cached_instruments 
            SET "isAccessible" = true 
            WHERE "isAccessible" IS NULL;
        `);
        
        console.log('✅ All existing records updated with isAccessible = true');
        
        // Создаем индекс для быстрого поиска доступных инструментов
        try {
            await sequelize.query(`
                CREATE INDEX IF NOT EXISTS idx_cached_instruments_is_accessible 
                ON cached_instruments("isAccessible");
            `);
            console.log('✅ Index created successfully');
        } catch (indexError) {
            // Индекс может уже существовать, это нормально
            if (!indexError.message.includes('already exists')) {
                console.warn('⚠️ Could not create index:', indexError.message);
            }
        }
        
        // Проверяем результат
        const result = await sequelize.query(`
            SELECT COUNT(*) as total, 
                   COUNT(CASE WHEN "isAccessible" = true THEN 1 END) as accessible,
                   COUNT(CASE WHEN "isAccessible" = false THEN 1 END) as requires_qualified
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
addIsAccessibleColumn();

