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

  // Создаем индексы
  await queryInterface.addIndex('model_performances', ['modelType', 'figi', 'periodEnd']);
  await queryInterface.addIndex('model_performances', ['modelType', 'isActive']);
  await queryInterface.addIndex('model_performances', ['figi', 'periodEnd']);
  await queryInterface.addIndex('model_performances', ['periodEnd']);
};

export const down = async (queryInterface, Sequelize) => {
  await queryInterface.dropTable('model_performances');
};

