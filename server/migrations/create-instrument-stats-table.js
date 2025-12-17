import { DataTypes } from 'sequelize';
import sequelize from '../src/config/database.js';
import { fileURLToPath } from 'url';

const migration = {
  async up(queryInterface, Sequelize = DataTypes) {
    const literal = (value) => queryInterface.sequelize.literal(value);
    
    await queryInterface.createTable('instrument_stats', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      figi: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
        comment: 'FIGI инструмента'
      },
      ticker: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: 'Тикер инструмента'
      },
      winRate: {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 0,
        comment: 'Процент прибыльных сделок (0-1)'
      },
      averageWin: {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 0,
        comment: 'Средняя прибыль в процентах'
      },
      averageLoss: {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 0,
        comment: 'Средний убыток в процентах (положительное число)'
      },
      totalTrades: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Общее количество сделок'
      },
      profitableTrades: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Количество прибыльных сделок'
      },
      losingTrades: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Количество убыточных сделок'
      },
      volatility: {
        type: Sequelize.FLOAT,
        allowNull: true,
        comment: 'Текущая волатильность инструмента (стандартное отклонение доходности)'
      },
      volatilityPeriod: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 30,
        comment: 'Период расчета волатильности в днях'
      },
      kellyFraction: {
        type: Sequelize.FLOAT,
        allowNull: true,
        comment: 'Коэффициент Келли для инструмента'
      },
      conservativeKelly: {
        type: Sequelize.FLOAT,
        allowNull: true,
        comment: 'Консервативный коэффициент Келли (1/4 от полного)'
      },
      lastUpdated: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: literal('CURRENT_TIMESTAMP'),
        comment: 'Дата последнего обновления статистики'
      },
      lastTradeDate: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Дата последней сделки по инструменту'
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Дополнительные метаданные (история, графики и т.д.)'
      }
    });

    // Создаем индексы
    await queryInterface.addIndex('instrument_stats', ['figi'], {
      unique: true,
      name: 'instrument_stats_figi_unique'
    });
    
    await queryInterface.addIndex('instrument_stats', ['ticker'], {
      name: 'instrument_stats_ticker_idx'
    });
    
    await queryInterface.addIndex('instrument_stats', ['winRate'], {
      name: 'instrument_stats_win_rate_idx'
    });
    
    await queryInterface.addIndex('instrument_stats', ['totalTrades'], {
      name: 'instrument_stats_total_trades_idx'
    });
    
    await queryInterface.addIndex('instrument_stats', ['lastUpdated'], {
      name: 'instrument_stats_last_updated_idx'
    });
  },

  async down(queryInterface, Sequelize = DataTypes) {
    await queryInterface.dropTable('instrument_stats');
  }
};

export default migration;

// Позволяет запускать миграцию напрямую командой `node migrations/create-instrument-stats-table.js`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const run = async () => {
    const queryInterface = sequelize.getQueryInterface();
    try {
      await migration.up(queryInterface, DataTypes);
      console.log('✅ Migration applied: instrument_stats');
    } catch (err) {
      console.error('❌ Migration failed:', err);
      process.exitCode = 1;
    } finally {
      await sequelize.close();
    }
  };
  run();
}

