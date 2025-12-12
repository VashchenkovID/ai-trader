import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        dialect: 'postgres',
        logging: false, // Set to console.log to see SQL queries
        pool: {
            max: 20, // Максимальное количество соединений в пуле (увеличено для поддержки множества worker'ов и процессов)
            min: 5, // Минимальное количество соединений в пуле (увеличено для быстрого доступа)
            acquire: 60000, // Максимальное время ожидания получения соединения (60 секунд)
            idle: 300000, // Максимальное время простоя соединения перед закрытием (5 минут - увеличено для предотвращения реконнектов)
            evict: 5000, // Интервал проверки неактивных соединений (5 секунд - увеличено для снижения нагрузки)
            handleDisconnects: true, // Автоматическое переподключение при разрыве соединения
        },
        dialectOptions: {
            // Увеличиваем таймауты для долгих операций
            connectTimeout: 30000, // 30 секунд на подключение
            statement_timeout: 300000, // 5 минут на выполнение запроса
        },
        retry: {
            max: 3, // Максимум 3 попытки переподключения
            match: [
                /ConnectionError/,
                /SequelizeConnectionError/,
                /SequelizeConnectionRefusedError/,
                /SequelizeHostNotFoundError/,
                /SequelizeHostNotReachableError/,
                /SequelizeInvalidConnectionError/,
                /SequelizeConnectionTimedOutError/
            ]
        }
    }
);

export default sequelize;