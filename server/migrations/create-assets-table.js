import { Sequelize, DataTypes } from 'sequelize';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем переменные окружения
dotenv.config({ path: join(__dirname, '../.env') });

// Настройки подключения к БД
const dbName = process.env.DB_NAME;
const dbUser = process.env.DB_USER;
const dbPassword = String(process.env.DB_PASSWORD || '');
const dbHost = process.env.DB_HOST;
const dbPort = process.env.DB_PORT;

if (!dbName || !dbUser || !dbPassword || !dbHost || !dbPort) {
    console.error('❌ Database environment variables are not set');
    console.error('Required: DB_NAME, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT');
    process.exit(1);
}

// Создаем подключение Sequelize
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
    await queryInterface.createTable('assets', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        uid: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
            comment: 'UID актива из Tinkoff API'
        },
        name: {
            type: DataTypes.STRING,
            allowNull: true,
            comment: 'Название актива'
        },
        apiData: {
            type: DataTypes.JSONB,
            allowNull: true,
            comment: 'Полные данные из API (включая instruments с FIGI)'
        },
        createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        },
        updatedAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        }
    });

    // Создаем индексы
    await queryInterface.addIndex('assets', ['uid'], {
        unique: true,
        name: 'assets_uid_unique'
    });
    await queryInterface.addIndex('assets', ['name']);
    // GIN индекс для JSONB поиска по apiData
    await queryInterface.sequelize.query(`
        CREATE INDEX IF NOT EXISTS assets_api_data_gin_idx ON assets USING gin (apiData);
    `);
};

export const down = async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('assets');
};

// Позволяет запускать миграцию напрямую командой `node migrations/create-assets-table.js`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const run = async () => {
        try {
            // Проверяем подключение
            await sequelize.authenticate();
            console.log('✅ Database connection established');
            
            const queryInterface = sequelize.getQueryInterface();
            console.log('🔄 Running migration: create-assets-table...');
            
            await up(queryInterface, DataTypes);
            console.log('✅ Migration applied: assets');
            
            // Проверяем результат
            const result = await sequelize.query(`
                SELECT COUNT(*) as total FROM information_schema.tables 
                WHERE table_name = 'assets';
            `);
            
            if (result[0][0].total > 0) {
                console.log('✅ Table assets created successfully');
            }
            
        } catch (err) {
            console.error('❌ Migration failed:', err);
            process.exitCode = 1;
        } finally {
            await sequelize.close();
        }
    };
    run();
}

