import { DataTypes } from 'sequelize';

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable('model_performances', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    modelType: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Тип модели'
    },
    figi: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'FIGI инструмента (null для общей производительности)'
    },
    periodStart: {
      type: DataTypes.DATE,
      allowNull: false
    },
    periodEnd: {
      type: DataTypes.DATE,
      allowNull: false
    },
    accuracy: {
      type: DataTypes.DECIMAL(5, 4),
      allowNull: false,
      defaultValue: 0
    },
    precision: {
      type: DataTypes.DECIMAL(5, 4),
      allowNull: false,
      defaultValue: 0
    },
    recall: {
      type: DataTypes.DECIMAL(5, 4),
      allowNull: false,
      defaultValue: 0
    },
    f1Score: {
      type: DataTypes.DECIMAL(5, 4),
      allowNull: false,
      defaultValue: 0
    },
    winRate: {
      type: DataTypes.DECIMAL(5, 4),
      allowNull: false,
      defaultValue: 0
    },
    averageReturn: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: false,
      defaultValue: 0
    },
    sharpeRatio: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: true
    },
    totalTrades: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    profitableTrades: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    agreement: {
      type: DataTypes.DECIMAL(5, 4),
      allowNull: true
    },
    calculatedWeight: {
      type: DataTypes.DECIMAL(5, 4),
      allowNull: true
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
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

  // Создаем индексы с проверкой существования
  try {
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS "model_performances_model_type_figi_period_end" 
      ON "model_performances" ("modelType", "figi", "periodEnd");
    `);
  } catch (error) {
    // Игнорируем ошибки, если индекс уже существует
    if (!error.message?.includes('already exists')) {
      console.warn('⚠️ Ошибка создания индекса model_performances_model_type_figi_period_end:', error.message);
    }
  }

  try {
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS "model_performances_model_type_is_active" 
      ON "model_performances" ("modelType", "isActive");
    `);
  } catch (error) {
    if (!error.message?.includes('already exists')) {
      console.warn('⚠️ Ошибка создания индекса model_performances_model_type_is_active:', error.message);
    }
  }

  try {
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS "model_performances_figi_period_end" 
      ON "model_performances" ("figi", "periodEnd");
    `);
  } catch (error) {
    if (!error.message?.includes('already exists')) {
      console.warn('⚠️ Ошибка создания индекса model_performances_figi_period_end:', error.message);
    }
  }

  try {
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS "model_performances_period_end" 
      ON "model_performances" ("periodEnd");
    `);
  } catch (error) {
    if (!error.message?.includes('already exists')) {
      console.warn('⚠️ Ошибка создания индекса model_performances_period_end:', error.message);
    }
  }
};

export const down = async (queryInterface, Sequelize) => {
  await queryInterface.dropTable('model_performances');
};

// Код для прямого запуска миграции (если нужно запустить вручную)
// Обычно таблица создается автоматически через initDatabase() -> safeSyncModel(ModelPerformance)
// Запуск: node migrations/create-model-performances.js

// Проверяем, запущен ли файл напрямую
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import { Sequelize } from 'sequelize';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем переменные окружения
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

async function runMigration() {
    try {
        console.log('🔄 Запуск миграции create-model-performances...');
        await sequelize.authenticate();
        console.log('✅ Подключение к БД установлено');
        
        const queryInterface = sequelize.getQueryInterface();
        
        // Проверяем, существует ли таблица
        const [results] = await sequelize.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'model_performances'
            ) as exists;
        `);
        
        const tableExists = results && results[0] && (results[0].exists === true || results[0].exists === 't');
        
        if (tableExists) {
            console.log('⚠️ Таблица model_performances уже существует. Миграция пропущена.');
            console.log('💡 Таблица создается автоматически при старте сервера через initDatabase()');
        } else {
            await up(queryInterface, Sequelize);
            console.log('✅ Миграция выполнена успешно');
        }
        
        await sequelize.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Ошибка при выполнении миграции:', error.message);
        console.error('Stack:', error.stack);
        if (sequelize) {
            await sequelize.close();
        }
        process.exit(1);
    }
}

// Запускаем миграцию, если файл запущен напрямую
if (process.argv[1] && process.argv[1].endsWith('create-model-performances.js')) {
    runMigration();
}
