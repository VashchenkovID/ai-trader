/**
 * Миграция для упрощения таблицы assets
 * Удаляет лишние поля, оставляя только id, uid, name, apiData
 */

import { Sequelize, DataTypes } from 'sequelize';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

export const up = async (queryInterface, Sequelize) => {
    console.log('🔄 Упрощение таблицы assets...');
    
    try {
        // Проверяем, существует ли таблица
        const tableExists = await queryInterface.sequelize.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'assets'
            );
        `);
        
        if (!tableExists[0][0].exists) {
            console.log('⚠️ Таблица assets не существует, пропускаем миграцию');
            return;
        }
        
        // Проверяем, какие столбцы существуют
        const columns = await queryInterface.sequelize.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'assets' 
            AND table_schema = 'public';
        `);
        
        const existingColumns = columns[0].map(col => col.column_name);
        console.log(`📊 Найдено столбцов: ${existingColumns.length}`);
        
        // Удаляем лишние столбцы, если они существуют
        const columnsToRemove = [
            'figi',
            'instrumentType',
            'ticker',
            'isin',
            'countryOfRisk',
            'countryOfRiskCode',
            'currency',
            'exchange',
            'sector',
            'lastSyncedAt'
        ];
        
        for (const column of columnsToRemove) {
            if (existingColumns.includes(column)) {
                console.log(`   🗑️ Удаляем столбец: ${column}`);
                await queryInterface.removeColumn('assets', column);
            }
        }
        
        // Удаляем старые индексы, если они существуют
        const indexesToRemove = [
            'assets_figi_key',
            'assets_figi_idx',
            'assets_ticker_idx',
            'assets_isin_idx',
            'assets_instrument_type_idx',
            'assets_country_of_risk_code_idx'
        ];
        
        for (const indexName of indexesToRemove) {
            try {
                await queryInterface.sequelize.query(`DROP INDEX IF EXISTS ${indexName};`);
            } catch (e) {
                // Игнорируем ошибки, если индекс не существует
            }
        }
        
        // Проверяем, существует ли столбец apiData (PostgreSQL может хранить его как "apiData" или "apidata")
        const apiDataColumnExists = existingColumns.some(col => 
            col.toLowerCase() === 'apidata'
        );
        
        if (!apiDataColumnExists) {
            console.log('   ➕ Создаем столбец apiData...');
            await queryInterface.addColumn('assets', 'apiData', {
                type: DataTypes.JSONB,
                allowNull: true
            });
        }
        
        // Проверяем, существует ли индекс, перед созданием
        const indexExists = await queryInterface.sequelize.query(`
            SELECT EXISTS (
                SELECT 1 
                FROM pg_indexes 
                WHERE indexname = 'assets_api_data_gin_idx'
            );
        `);
        
        if (!indexExists[0][0].exists) {
            console.log('   ➕ Создаем GIN индекс для apiData...');
            // Используем кавычки для правильного имени столбца в PostgreSQL
            await queryInterface.sequelize.query(`
                CREATE INDEX assets_api_data_gin_idx ON assets USING gin ("apiData");
            `);
        } else {
            console.log('   ℹ️ Индекс assets_api_data_gin_idx уже существует');
        }
        
        console.log('✅ Миграция завершена успешно');
    } catch (error) {
        console.error('❌ Ошибка миграции:', error);
        throw error;
    }
};

export const down = async (queryInterface, Sequelize) => {
    console.log('⚠️ Откат миграции не поддерживается');
    // Откат не поддерживается, так как данные уже удалены
};

// Позволяет запускать миграцию напрямую
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const run = async () => {
        try {
            await sequelize.authenticate();
            console.log('✅ Database connection established');
            
            const queryInterface = sequelize.getQueryInterface();
            console.log('🔄 Running migration: simplify-assets-table...');
            
            await up(queryInterface, DataTypes);
            console.log('✅ Migration applied');
        } catch (err) {
            console.error('❌ Migration failed:', err);
            process.exitCode = 1;
        } finally {
            await sequelize.close();
        }
    };
    run();
}

