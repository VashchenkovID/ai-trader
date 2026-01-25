import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const User = sequelize.define('User', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    username: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        comment: 'Имя пользователя'
    },
    fullName: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: 'Полное имя пользователя'
    },
    passwordHash: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: 'Хеш пароля'
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Активен ли пользователь'
    },
    lastLogin: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Последний вход'
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
}, {
    tableName: 'users',
    timestamps: true,
    indexes: [
        {
            unique: true,
            fields: ['username']
        }
    ]
});

export default User;

