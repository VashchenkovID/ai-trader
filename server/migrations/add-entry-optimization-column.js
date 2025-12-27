import sequelize from '../src/config/database.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Миграция: Добавление столбца entryOptimization в таблицу trading_requests
 * 
 * Этот столбец хранит информацию об оптимизации входа через EntryOptimizationService
 */
async function addEntryOptimizationColumn() {
    try {
        console.log('🔄 Добавление столбца entryOptimization в trading_requests...');
        
        await sequelize.authenticate();
        console.log('✅ Подключение к БД успешно');
        
        // Проверяем, существует ли столбец
        const [results] = await sequelize.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'trading_requests' 
            AND column_name = 'entryOptimization';
        `);
        
        if (results.length > 0) {
            console.log('✅ Столбец entryOptimization уже существует');
            return;
        }
        
        // Добавляем столбец
        await sequelize.query(`
            ALTER TABLE trading_requests 
            ADD COLUMN "entryOptimization" JSONB;
        `);
        
        console.log('✅ Столбец entryOptimization успешно добавлен');
        
        // Добавляем комментарий
        await sequelize.query(`
            COMMENT ON COLUMN trading_requests."entryOptimization" IS 'Информация об анализе входа через EntryOptimizationService';
        `).catch(() => {
            // Игнорируем ошибку, если комментарии не поддерживаются
        });
        
        console.log('✅ Миграция завершена успешно');
        
    } catch (error) {
        console.error('❌ Ошибка при выполнении миграции:', error);
        throw error;
    } finally {
        await sequelize.close();
    }
}

// Запуск миграции
addEntryOptimizationColumn()
    .then(() => {
        console.log('🎉 Миграция выполнена');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Миграция не удалась:', error);
        process.exit(1);
    });

