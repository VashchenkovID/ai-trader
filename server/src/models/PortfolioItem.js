import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class PortfolioItem extends Model {}

PortfolioItem.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    figi: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    ticker: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
            min: 1
        }
    },
    averagePrice: {
        type: DataTypes.FLOAT,
        allowNull: false,
        validate: {
            min: 0
        }
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
}, {
    sequelize,
    modelName: 'PortfolioItem',
    tableName: 'portfolio_items',
    indexes: [
        {
            fields: ['figi']
        },
        {
            fields: ['ticker']
        }
    ]
});

export default PortfolioItem;