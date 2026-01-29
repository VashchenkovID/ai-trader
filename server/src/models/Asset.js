import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * Модель для хранения активов из Tinkoff API
 * Используется для получения asset_uid для GetAssetFundamentals
 */
class Asset extends Model {}

Asset.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    uid: {
        type: DataTypes.STRING,
        allowNull: false,
        // unique: true убрано - уникальность обеспечивается через индекс ниже
        comment: 'UID актива из Tinkoff API'
    },
    name: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Название актива'
    },
    apiData: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: 'Полные данные из API (включая instruments с FIGI)'
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
    sequelize,
    modelName: 'Asset',
    tableName: 'assets',
    indexes: [
        {
            unique: true,
            fields: ['uid']
        },
        {
            fields: ['name']
        },
        {
            fields: ['apiData'],
            using: 'gin' // GIN индекс для JSONB поиска
        }
    ],
    timestamps: true
});

export default Asset;

