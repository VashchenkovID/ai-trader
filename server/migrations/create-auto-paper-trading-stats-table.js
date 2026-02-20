import { DataTypes } from 'sequelize';
import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const dbName = process.env.DB_NAME;
const dbUser = process.env.DB_USER;
const dbPassword = String(process.env.DB_PASSWORD || '');
const dbHost = process.env.DB_HOST;
const dbPort = process.env.DB_PORT;

if (!dbName || !dbUser || !dbHost || !dbPort) {
    console.error('❌ Database environment variables are not set');
    process.exit(1);
}

const sequelize = new Sequelize(dbName, dbUser, dbPassword, {
    host: dbHost,
    port: dbPort,
    dialect: 'postgres',
    logging: false
});

export const up = async (queryInterface, Sequelize) => {
    await queryInterface.createTable('auto_paper_trading_stats', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        date: {
            type: DataTypes.DATEONLY,
            allowNull: false,
            unique: true,
            comment: 'Дата статистики'
        },
        dailyTrades: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: 'Количество сделок за день'
        },
        dailyPnL: {
            type: DataTypes.FLOAT,
            allowNull: false,
            defaultValue: 0,
            comment: 'Прибыль/убыток за день'
        },
        totalTrades: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: 'Общее количество сделок'
        },
        currentPhase: {
            type: DataTypes.ENUM('phase1', 'phase2', 'phase3'),
            allowNull: false,
            defaultValue: 'phase1',
            comment: 'Текущая фаза автоматической торговли'
        },
        settings: {
            type: DataTypes.JSON,
            allowNull: true,
            comment: 'Сохранение настроек на дату'
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
    await queryInterface.addIndex('auto_paper_trading_stats', ['date'], {
        name: 'idx_auto_paper_trading_stats_date',
        unique: true
    });

    await queryInterface.addIndex('auto_paper_trading_stats', ['currentPhase'], {
        name: 'idx_auto_paper_trading_stats_phase'
    });
};

export const down = async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('auto_paper_trading_stats');
};

async function runMigration() {
    try {
        console.log('🔄 Запуск миграции create-auto-paper-trading-stats-table...');
        await sequelize.authenticate();
        console.log('✅ Подключение к БД установлено');
        
        const queryInterface = sequelize.getQueryInterface();
        
        // Проверяем, существует ли таблица
        const [results] = await sequelize.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'auto_paper_trading_stats'
            ) as "exists";
        `);
        
        const tableExists = results && results[0] && (results[0].exists === true || results[0].exists === 't');
        
        if (tableExists) {
            console.log('⚠️ Таблица auto_paper_trading_stats уже существует. Миграция пропущена.');
        } else {
            await up(queryInterface, Sequelize);
            console.log('✅ Миграция выполнена успешно');
        }
        
        await sequelize.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Ошибка при выполнении миграции:', error.message);
        if (sequelize) {
            await sequelize.close();
        }
        process.exit(1);
    }
}

// Запускаем миграцию, если файл выполняется напрямую
if (process.argv[1] && process.argv[1].endsWith('create-auto-paper-trading-stats-table.js')) {
    runMigration();
}

