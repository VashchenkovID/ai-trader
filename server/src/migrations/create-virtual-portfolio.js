import { DataTypes } from 'sequelize';

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable('virtual_portfolio', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    
    // Денежные средства
    cash: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 1000000,
      comment: 'Денежные средства в виртуальном портфеле'
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
      comment: 'История сделок виртуального портфеля'
    },
    
    // Общая стоимость портфеля
    totalValue: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 1000000,
      comment: 'Общая стоимость портфеля (cash + positions value)'
    },
    
    // Начальный капитал (для расчета PnL)
    initialCapital: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 1000000,
      comment: 'Начальный капитал при создании портфеля'
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
      comment: 'Время последнего обновления портфеля'
    }
  });

  // Индекс для быстрого поиска последнего портфеля
  await queryInterface.addIndex('virtual_portfolio', ['lastUpdated']);
};

export const down = async (queryInterface, Sequelize) => {
  await queryInterface.dropTable('virtual_portfolio');
};

