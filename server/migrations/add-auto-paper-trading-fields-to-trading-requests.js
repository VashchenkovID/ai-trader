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
    // Проверяем, существует ли таблица trading_requests
    const [tableResults] = await sequelize.query(`
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'trading_requests'
        ) as "exists";
    `);
    
    const tableExists = tableResults && tableResults[0] && (tableResults[0].exists === true || tableResults[0].exists === 't');
    
    if (!tableExists) {
        console.log('⚠️ Таблица trading_requests не существует. Миграция пропущена.');
        return;
    }

    // Проверяем, какие колонки уже существуют
    const [columnResults] = await sequelize.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'trading_requests' 
        AND column_name IN ('autoExecuted', 'executionSimulation', 'autoExecutionPhase', 'actualQuantity', 'autoExecutionFailed', 'executionError');
    `);
    
    const existingColumns = columnResults.map(r => r.column_name);
    
    // Добавляем новые поля для автоматической торговли
    if (!existingColumns.includes('autoExecuted')) {
        await queryInterface.addColumn('trading_requests', 'autoExecuted', {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            comment: 'Была ли заявка исполнена автоматически'
        });
    }

    if (!existingColumns.includes('executionSimulation')) {
        await queryInterface.addColumn('trading_requests', 'executionSimulation', {
            type: DataTypes.JSON,
            allowNull: true,
            comment: 'Данные симуляции исполнения: { spread, slippage, liquidityLevel }'
        });
    }

    if (!existingColumns.includes('autoExecutionPhase')) {
        // Проверяем, существует ли ENUM тип
        const [enumResults] = await sequelize.query(`
            SELECT EXISTS (
                SELECT 1 FROM pg_type WHERE typname = 'enum_trading_requests_autoexecutionphase'
            ) as "exists";
        `);
        
        const enumExists = enumResults && enumResults[0] && (enumResults[0].exists === true || enumResults[0].exists === 't');
        
        if (!enumExists) {
            await sequelize.query(`
                CREATE TYPE "enum_trading_requests_autoexecutionphase" AS ENUM ('phase1', 'phase2', 'phase3');
            `);
        }
        
        await queryInterface.addColumn('trading_requests', 'autoExecutionPhase', {
            type: DataTypes.ENUM('phase1', 'phase2', 'phase3'),
            allowNull: true,
            comment: 'Фаза автоматического исполнения на момент создания'
        });
    }

    if (!existingColumns.includes('actualQuantity')) {
        await queryInterface.addColumn('trading_requests', 'actualQuantity', {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: 'Фактически исполненное количество (для частичного исполнения)'
        });
    }

    if (!existingColumns.includes('autoExecutionFailed')) {
        await queryInterface.addColumn('trading_requests', 'autoExecutionFailed', {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            comment: 'Флаг ошибки автоматического исполнения'
        });
    }

    if (!existingColumns.includes('executionError')) {
        await queryInterface.addColumn('trading_requests', 'executionError', {
            type: DataTypes.TEXT,
            allowNull: true,
            comment: 'Текст ошибки при автоматическом исполнении'
        });
    }

    // Добавляем индексы для оптимизации запросов (если их еще нет)
    // Проверяем существование индексов
    const [indexResults] = await sequelize.query(`
        SELECT indexname FROM pg_indexes 
        WHERE tablename = 'trading_requests' 
        AND indexname IN ('idx_trading_requests_auto_executed', 'idx_trading_requests_auto_execution_phase');
    `);
    
    const existingIndexes = indexResults.map(r => r.indexname);
    
    if (!existingIndexes.includes('idx_trading_requests_auto_executed')) {
        try {
            await queryInterface.addIndex('trading_requests', ['autoExecuted'], {
                name: 'idx_trading_requests_auto_executed'
            });
        } catch (error) {
            if (!error.message.includes('already exists') && !error.message.includes('duplicate')) {
                throw error;
            }
        }
    }

    if (!existingIndexes.includes('idx_trading_requests_auto_execution_phase')) {
        try {
            await queryInterface.addIndex('trading_requests', ['autoExecutionPhase'], {
                name: 'idx_trading_requests_auto_execution_phase'
            });
        } catch (error) {
            if (!error.message.includes('already exists') && !error.message.includes('duplicate')) {
                throw error;
            }
        }
    }
};

export const down = async (queryInterface, Sequelize) => {
    // Удаляем индексы
    try {
        await queryInterface.removeIndex('trading_requests', 'idx_trading_requests_auto_executed');
    } catch (error) {
        // Игнорируем, если индекс не существует
    }

    try {
        await queryInterface.removeIndex('trading_requests', 'idx_trading_requests_auto_execution_phase');
    } catch (error) {
        // Игнорируем, если индекс не существует
    }

    // Удаляем колонки
    try {
        await queryInterface.removeColumn('trading_requests', 'autoExecuted');
    } catch (error) {
        // Игнорируем, если колонка не существует
    }

    try {
        await queryInterface.removeColumn('trading_requests', 'executionSimulation');
    } catch (error) {
        // Игнорируем, если колонка не существует
    }

    try {
        await queryInterface.removeColumn('trading_requests', 'autoExecutionPhase');
    } catch (error) {
        // Игнорируем, если колонка не существует
    }

    try {
        await queryInterface.removeColumn('trading_requests', 'actualQuantity');
    } catch (error) {
        // Игнорируем, если колонка не существует
    }

    try {
        await queryInterface.removeColumn('trading_requests', 'autoExecutionFailed');
    } catch (error) {
        // Игнорируем, если колонка не существует
    }

    try {
        await queryInterface.removeColumn('trading_requests', 'executionError');
    } catch (error) {
        // Игнорируем, если колонка не существует
    }
};

async function runMigration() {
    try {
        console.log('🔄 Запуск миграции add-auto-paper-trading-fields-to-trading-requests...');
        await sequelize.authenticate();
        console.log('✅ Подключение к БД установлено');
        
        const queryInterface = sequelize.getQueryInterface();
        await up(queryInterface, Sequelize);
        console.log('✅ Миграция выполнена успешно');
        
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
if (process.argv[1] && process.argv[1].endsWith('add-auto-paper-trading-fields-to-trading-requests.js')) {
    runMigration();
}

