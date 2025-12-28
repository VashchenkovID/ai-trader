import { DataTypes } from 'sequelize';

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable('position_pyramids', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    basePositionId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'trading_requests',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    figi: {
      type: DataTypes.STRING,
      allowNull: false
    },
    ticker: {
      type: DataTypes.STRING,
      allowNull: false
    },
    strategyId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'trading_strategies',
        key: 'id'
      }
    },
    targetSize: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      comment: 'Целевой размер позиции в рублях (100%)'
    },
    currentSize: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0,
      comment: 'Текущий размер позиции в рублях'
    },
    currentPercent: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0,
      comment: 'Текущий процент от целевого размера'
    },
    entries: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      comment: 'Массив входов'
    },
    status: {
      type: DataTypes.ENUM('ACTIVE', 'COMPLETED', 'CANCELLED', 'CLOSED'),
      allowNull: false,
      defaultValue: 'ACTIVE'
    },
    nextEntryConditions: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Условия для следующего входа'
    },
    lastCheckDate: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Дата последней проверки условий'
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

  // Создаем индексы
  await queryInterface.addIndex('position_pyramids', ['basePositionId']);
  await queryInterface.addIndex('position_pyramids', ['figi', 'status']);
  await queryInterface.addIndex('position_pyramids', ['strategyId', 'status']);
  await queryInterface.addIndex('position_pyramids', ['status', 'lastCheckDate']);
};

export const down = async (queryInterface, Sequelize) => {
  await queryInterface.dropTable('position_pyramids');
};

