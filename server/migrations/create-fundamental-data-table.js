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
  await queryInterface.createTable('fundamental_data', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    figi: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'FIGI инструмента'
    },
    ticker: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Тикер инструмента (для удобства поиска)'
    },
    period: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: 'Период отчетности (дата окончания квартала/года)'
    },
    periodType: {
      type: DataTypes.ENUM('quarterly', 'yearly'),
      allowNull: false,
      defaultValue: 'quarterly',
      comment: 'Тип периода: квартальный или годовой'
    },
    // Фундаментальные показатели
    pe: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'P/E (Price-to-Earnings) - отношение цены к прибыли'
    },
    pb: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'P/B (Price-to-Book) - отношение цены к балансовой стоимости'
    },
    evEbitda: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'EV/EBITDA - отношение стоимости компании к EBITDA'
    },
    roe: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'ROE (Return on Equity) - рентабельность собственного капитала (%)'
    },
    debtEbitda: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Долг/EBITDA - отношение долга к EBITDA'
    },
    operatingMargin: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Операционная маржа (%)'
    },
    netMargin: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Чистая маржа (%)'
    },
    // Метаданные
    source: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'unknown',
      comment: 'Источник данных (tinkoff, smartlab, investing, etc.)'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Дополнительные метаданные (roic, roa, beta, marketCap и т.д.)'
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
  await queryInterface.addIndex('fundamental_data', ['figi', 'period', 'periodType'], {
    unique: true,
    name: 'unique_figi_period_type'
  });
  await queryInterface.addIndex('fundamental_data', ['figi']);
  await queryInterface.addIndex('fundamental_data', ['ticker']);
  await queryInterface.addIndex('fundamental_data', ['period']);
  await queryInterface.addIndex('fundamental_data', ['periodType']);
  await queryInterface.addIndex('fundamental_data', ['source']);
};

export const down = async (queryInterface, Sequelize) => {
  await queryInterface.dropTable('fundamental_data');
};

// Позволяет запускать миграцию напрямую командой `node migrations/create-fundamental-data-table.js`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const run = async () => {
        try {
            // Проверяем подключение
            await sequelize.authenticate();
            console.log('✅ Database connection established');
            
            const queryInterface = sequelize.getQueryInterface();
            console.log('🔄 Running migration: create-fundamental-data-table...');
            
            await up(queryInterface, DataTypes);
            console.log('✅ Migration applied: fundamental_data');
            
            // Проверяем результат
            const result = await sequelize.query(`
                SELECT COUNT(*) as total FROM information_schema.tables 
                WHERE table_name = 'fundamental_data';
            `);
            
            if (result[0][0].total > 0) {
                console.log('✅ Table fundamental_data created successfully');
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

