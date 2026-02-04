import { DataTypes } from 'sequelize';
import sequelize from '../src/config/database.js';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);

export const up = async (queryInterface, Sequelize) => {
  // Проверяем существование таблицы
  const [results] = await queryInterface.sequelize.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'real_portfolio'
    );
  `);
  
  const tableExists = results[0].exists;
  
  if (!tableExists) {
    console.log('📊 Таблица real_portfolio не существует, создаем...');
    
    // Создаем таблицу real_portfolio
    await queryInterface.createTable('real_portfolio', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      
      // Денежные средства
      cash: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
        comment: 'Денежные средства в реальном портфеле'
      },
      
      // Позиции (JSON: { FIGI: quantity })
      positions: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: {},
        comment: 'Позиции в портфеле: { FIGI: quantity }'
      },
      
      // История сделок (JSON массив)
      trades: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: [],
        comment: 'История сделок реального портфеля'
      },
      
      // Общая стоимость портфеля
      totalValue: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
        comment: 'Общая стоимость портфеля (cash + positions value)'
      },
      
      // Стоимость позиций
      positionsValue: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
        comment: 'Стоимость всех позиций'
      },
      
      // Начальный капитал (для расчета PnL)
      initialCapital: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: 'Начальный капитал при создании портфеля (если известен)'
      },
      
      // Метаданные
      version: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: 'Версия структуры портфеля (для миграций)'
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
      },
      
      lastUpdated: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: 'Время последнего обновления портфеля из Tinkoff API'
      }
    });
    
    // Создаем индекс на lastUpdated
    await queryInterface.addIndex('real_portfolio', ['lastUpdated'], {
      name: 'real_portfolio_lastUpdated_idx'
    });
    
    console.log('✅ Таблица real_portfolio создана');
  } else {
    console.log('📊 Таблица real_portfolio существует, проверяем индексы...');
    
    // Удаляем все проблемные индексы на real_portfolio (кроме первичного ключа)
    try {
      const [indexes] = await queryInterface.sequelize.query(`
        SELECT indexname 
        FROM pg_indexes 
        WHERE tablename = 'real_portfolio' 
        AND indexname != 'real_portfolio_pkey'
        AND indexname != 'real_portfolio_id_pkey';
      `);
      
      for (const index of indexes) {
        try {
          await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "${index.indexname}" CASCADE;`);
          console.log(`🗑️  Удален индекс: ${index.indexname}`);
        } catch (error) {
          console.warn(`⚠️  Не удалось удалить индекс ${index.indexname}:`, error.message);
        }
      }
    } catch (error) {
      console.warn('⚠️  Ошибка при проверке индексов:', error.message);
    }
    
    // Проверяем наличие колонки lastUpdated
    const [columns] = await queryInterface.sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'real_portfolio' 
      AND column_name = 'lastUpdated';
    `);
    
    if (columns.length === 0) {
      // Добавляем колонку lastUpdated, если её нет
      await queryInterface.addColumn('real_portfolio', 'lastUpdated', {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: 'Время последнего обновления портфеля из Tinkoff API'
      });
      console.log('✅ Добавлена колонка lastUpdated');
    }
    
    // Проверяем наличие колонки positionsValue
    const [positionsValueCol] = await queryInterface.sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'real_portfolio' 
      AND column_name = 'positionsValue';
    `);
    
    if (positionsValueCol.length === 0) {
      // Добавляем колонку positionsValue, если её нет
      await queryInterface.addColumn('real_portfolio', 'positionsValue', {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
        comment: 'Стоимость всех позиций'
      });
      console.log('✅ Добавлена колонка positionsValue');
    }
    
    // Пересоздаем индекс на lastUpdated
    try {
      await queryInterface.addIndex('real_portfolio', ['lastUpdated'], {
        name: 'real_portfolio_lastUpdated_idx',
        ifNotExists: true
      });
      console.log('✅ Индекс на lastUpdated создан/обновлен');
    } catch (error) {
      console.warn('⚠️  Не удалось создать индекс на lastUpdated:', error.message);
    }
  }
};

export const down = async (queryInterface, Sequelize) => {
  // При откате миграции удаляем индекс (но не таблицу)
  try {
    await queryInterface.removeIndex('real_portfolio', 'real_portfolio_lastUpdated_idx');
  } catch (error) {
    // Игнорируем ошибку, если индекс не существует
  }
};

// Позволяет запускать миграцию напрямую командой `node migrations/fix-real-portfolio-indexes.js`
if (process.argv[1] === __filename) {
  const run = async () => {
    try {
      // Проверяем подключение
      await sequelize.authenticate();
      console.log('✅ Database connection established');
      
      const queryInterface = sequelize.getQueryInterface();
      console.log('🔄 Running migration: fix-real-portfolio-indexes...');
      
      await up(queryInterface, DataTypes);
      console.log('✅ Migration applied: fix-real-portfolio-indexes');
      
      // Проверяем результат
      const [indexes] = await sequelize.query(`
        SELECT indexname 
        FROM pg_indexes 
        WHERE tablename = 'real_portfolio' 
        AND indexname = 'real_portfolio_lastUpdated_idx';
      `);
      
      if (indexes.length > 0) {
        console.log('✅ Index real_portfolio_lastUpdated_idx created successfully');
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
