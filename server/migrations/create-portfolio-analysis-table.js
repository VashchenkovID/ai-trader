import { DataTypes } from 'sequelize';
import sequelize from '../src/config/database.js';
import { fileURLToPath } from 'url';

const migration = {
  async up(queryInterface, Sequelize = DataTypes) {
    const literal = (value) => queryInterface.sequelize.literal(value);
    await queryInterface.createTable('portfolio_analyses', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      portfolioType: {
        type: Sequelize.ENUM('real', 'virtual', 'paper'),
        allowNull: false,
        comment: 'Тип портфеля: real, virtual, paper'
      },
      analysisDate: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: literal('CURRENT_TIMESTAMP'),
        comment: 'Дата и время анализа'
      },
      portfolioValue: {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 0,
        comment: 'Общая стоимость портфеля на момент анализа'
      },
      availableBudget: {
        type: Sequelize.FLOAT,
        allowNull: true,
        comment: 'Доступный бюджет'
      },
      totalPositions: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Общее количество позиций в портфеле'
      },
      sellRecommendations: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Рекомендации на продажу позиций из портфеля'
      },
      buyRecommendations: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Рекомендации на покупку новых инструментов'
      },
      sellRecommendationsCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Количество рекомендаций на продажу'
      },
      buyRecommendationsCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Количество рекомендаций на покупку'
      },
      status: {
        type: Sequelize.ENUM('pending', 'completed', 'failed'),
        allowNull: false,
        defaultValue: 'pending',
        comment: 'Статус анализа'
      },
      error: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Ошибка, если анализ не удался'
      },
      processingTime: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Время обработки в миллисекундах'
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Дополнительные метаданные анализа'
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('portfolio_analyses', ['portfolioType']);
    await queryInterface.addIndex('portfolio_analyses', ['analysisDate']);
    await queryInterface.addIndex('portfolio_analyses', ['status']);
    await queryInterface.addIndex('portfolio_analyses', ['portfolioType', 'analysisDate']);
  },

  async down(queryInterface, Sequelize = DataTypes) {
    await queryInterface.dropTable('portfolio_analyses');
  }
};

export default migration;

// Позволяет запускать миграцию напрямую командой `node migrations/create-portfolio-analysis-table.js`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const run = async () => {
    const queryInterface = sequelize.getQueryInterface();
    try {
      await migration.up(queryInterface, DataTypes);
      console.log('✅ Migration applied: portfolio_analyses');
    } catch (err) {
      console.error('❌ Migration failed:', err);
      process.exitCode = 1;
    } finally {
      await sequelize.close();
    }
  };
  run();
}
