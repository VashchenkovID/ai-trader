import { DataTypes } from 'sequelize';

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable('trading_requests', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    
    // Связь с рекомендацией
    recommendationId: {
      type: DataTypes.STRING,
      allowNull: false
    },
    
    // Основная информация об инструменте
    figi: {
      type: DataTypes.STRING,
      allowNull: false
    },
    ticker: {
      type: DataTypes.STRING,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    
    // Торговая информация
    action: {
      type: DataTypes.ENUM('BUY', 'SELL'),
      allowNull: false
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    priceAtRequest: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    estimatedAmount: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    
    // Статус заявки
    status: {
      type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED', 'CANCELLED', 'EXPIRED'),
      allowNull: false,
      defaultValue: 'PENDING'
    },
    
    // Данные из рекомендации
    confidence: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    score: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    
    // Обоснование
    reasoning: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    aiExplanation: {
      type: DataTypes.JSON,
      allowNull: true
    },
    
    // Временные метки
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
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false
    },
    approvedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    executedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    
    // Результат исполнения
    executionResult: {
      type: DataTypes.JSON,
      allowNull: true
    },
    actualPrice: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    actualAmount: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    commission: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    
    // Комментарии пользователя
    userComment: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    rejectionReason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    
    // Метаданные
    tradingMode: {
      type: DataTypes.ENUM('paper', 'micro', 'real'),
      allowNull: false,
      defaultValue: 'paper'
    },
    priority: {
      type: DataTypes.ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT'),
      allowNull: false,
      defaultValue: 'NORMAL'
    },
    
    // Риск-параметры
    riskLevel: {
      type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH'),
      allowNull: false,
      defaultValue: 'MEDIUM'
    },
    maxLoss: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    stopLoss: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    takeProfit: {
      type: DataTypes.FLOAT,
      allowNull: true
    }
  });

  // Создаем индексы
  await queryInterface.addIndex('trading_requests', ['status', 'createdAt']);
  await queryInterface.addIndex('trading_requests', ['figi', 'status']);
  await queryInterface.addIndex('trading_requests', ['expiresAt']);
  await queryInterface.addIndex('trading_requests', ['tradingMode', 'status']);
  await queryInterface.addIndex('trading_requests', ['priority', 'createdAt']);
};

export const down = async (queryInterface, Sequelize) => {
  await queryInterface.dropTable('trading_requests');
};
