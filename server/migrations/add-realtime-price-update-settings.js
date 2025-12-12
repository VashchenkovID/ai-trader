import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем переменные окружения из папки server
dotenv.config({ path: join(__dirname, '../.env') });

// Используем те же настройки, что и в database.js
const dbName = process.env.DB_NAME;
const dbUser = process.env.DB_USER;
const dbPassword = String(process.env.DB_PASSWORD || '');
const dbHost = process.env.DB_HOST;
const dbPort = process.env.DB_PORT;

if (!dbName || !dbUser || !dbPassword || !dbHost || !dbPort) {
    console.error('❌ Database environment variables are not set');
    console.error('Required: DB_NAME, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT');
    console.error('Please check your .env file');
    process.exit(1);
}

const sequelize = new Sequelize(
    dbName,
    dbUser,
    dbPassword,
    {
        host: dbHost,
        port: dbPort,
        dialect: 'postgres',
        logging: false
    }
);

async function addRealtimePriceUpdateSettings() {
    try {
        await sequelize.authenticate();
        console.log('✅ Database connection established');

        console.log('🔄 Adding realtime price update settings...');

        // Новые настройки для обновления цен в режиме реального времени
        const newSettings = [
            {
                key: 'price_update_interval_minutes',
                value: '20',
                description: 'Интервал обновления цен всех инструментов (минуты)',
                category: 'scheduler',
                dataType: 'number',
                minValue: 5,
                maxValue: 60
            },
            {
                key: 'portfolio_prices_update_interval_minutes',
                value: '2',
                description: 'Интервал обновления цен активных позиций портфеля (минуты)',
                category: 'scheduler',
                dataType: 'number',
                minValue: 1,
                maxValue: 10
            },
            {
                key: 'active_signals_prices_update_interval_minutes',
                value: '5',
                description: 'Интервал обновления цен активных сигналов (минуты)',
                category: 'scheduler',
                dataType: 'number',
                minValue: 1,
                maxValue: 30
            },
            {
                key: 'trading_requests_prices_update_interval_seconds',
                value: '60',
                description: 'Интервал обновления цен активных торговых заявок (секунды)',
                category: 'scheduler',
                dataType: 'number',
                minValue: 30,
                maxValue: 300
            }
        ];

        // Добавляем настройки, если их еще нет (используем INSERT ... ON CONFLICT DO NOTHING)
        for (const setting of newSettings) {
            try {
                // Проверяем, существует ли настройка
                const [existing] = await sequelize.query(`
                    SELECT key FROM settings WHERE key = :key
                `, {
                    replacements: { key: setting.key },
                    type: Sequelize.QueryTypes.SELECT
                });

                if (existing && existing.length > 0) {
                    console.log(`⏭️ Setting "${setting.key}" already exists, skipping`);
                    continue;
                }

                // Добавляем новую настройку
                await sequelize.query(`
                    INSERT INTO settings (key, value, description, category, "dataType", "minValue", "maxValue", "isEditable", "lastUpdated")
                    VALUES (:key, :value, :description, :category, :dataType, :minValue, :maxValue, true, NOW())
                `, {
                    replacements: {
                        key: setting.key,
                        value: String(setting.value),
                        description: setting.description,
                        category: setting.category,
                        dataType: setting.dataType,
                        minValue: setting.minValue,
                        maxValue: setting.maxValue
                    }
                });

                console.log(`✅ Setting "${setting.key}" created`);
            } catch (error) {
                // Если настройка уже существует (unique constraint), просто пропускаем
                if (error.name === 'SequelizeUniqueConstraintError' || error.message.includes('duplicate key')) {
                    console.log(`⏭️ Setting "${setting.key}" already exists, skipping`);
                } else {
                    console.error(`❌ Error adding setting "${setting.key}":`, error.message);
                }
            }
        }

        console.log('✅ Realtime price update settings migration completed');

    } catch (error) {
        console.error('❌ Error adding realtime price update settings:', error);
        throw error;
    } finally {
        await sequelize.close();
    }
}

addRealtimePriceUpdateSettings()
    .then(() => {
        console.log('🎉 Migration completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    });

