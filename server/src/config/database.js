import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Загружаем переменные окружения
// Пробуем загрузить из разных мест
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Сначала пробуем загрузить из server/.env, затем из корня проекта
const envPaths = [
    path.join(__dirname, '..', '.env'),
    path.join(__dirname, '..', '..', '.env'),
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), 'server', '.env')
];

let envLoaded = false;
for (const envPath of envPaths) {
    const result = dotenv.config({ path: envPath });
    if (!result.error) {
        envLoaded = true;
        break;
    }
}

// Если не загрузили из файла, пробуем системные переменные окружения
if (!envLoaded) {
    dotenv.config();
}

// Убеждаемся, что пароль - строка и не пустой
const dbPassword = process.env.DB_PASSWORD;
const passwordString = dbPassword && typeof dbPassword === 'string' && dbPassword.trim() !== '' 
    ? dbPassword.trim() 
    : '';

if (!passwordString && process.env.DB_PASSWORD !== undefined) {
    console.warn('⚠️ DB_PASSWORD установлен, но является пустой строкой или не строкой');
}

const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    passwordString,
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