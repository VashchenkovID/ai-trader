import sequelize from '../config/database.js';
import DatabaseConnectionManager from './DatabaseConnectionManager.js';
import Settings from '../models/Settings.js';
import MigrationStatus from '../models/MigrationStatus.js';
import CachedInstrument from '../models/CachedInstrument.js';
import CachedCandle from '../models/CachedCandle.js';
import CachedNews from '../models/CachedNews.js';
import CachedTelegramSentiment from '../models/CachedTelegramSentiment.js';
import CachedTradingHours from '../models/CachedTradingHours.js';
import Company from '../models/Company.js';
import PortfolioItem from '../models/PortfolioItem.js';
import Recommendation from '../models/Recommendation.js';
import TradingRequest from '../models/TradingRequest.js';
import VirtualPortfolio from '../models/VirtualPortfolio.js';

export async function initDatabase() {
    console.log('🚀 ИНИЦИАЛИЗАЦИЯ БАЗЫ ДАННЫХ\n');

    try {
        // Подключение к базе данных
        await sequelize.authenticate();
        console.log('✅ Подключение к БД успешно');

        // Инициализируем менеджер соединений, чтобы избежать повторных закрытий/переподключений во время инициализации
        try {
            await DatabaseConnectionManager.initialize();
        } catch (e) {
            console.warn('⚠️ Не удалось инициализировать менеджер соединений:', e.message);
        }

        // Синхронизация всех моделей
        console.log('🔄 Синхронизация моделей...');
        await sequelize.sync({ force: false });
        console.log('✅ Все модели синхронизированы');
        
        // Добавляем столбец instrumentType, если его нет
        try {
            await sequelize.query(`
                ALTER TABLE cached_instruments 
                ADD COLUMN IF NOT EXISTS "instrumentType" VARCHAR(255);
            `);
            console.log('✅ Столбец instrumentType проверен/добавлен');
            
            // Обновляем существующие записи: устанавливаем 'share' для всех существующих
            await sequelize.query(`
                UPDATE cached_instruments 
                SET "instrumentType" = 'share' 
                WHERE "instrumentType" IS NULL;
            `);
            console.log('✅ Существующие записи обновлены с instrumentType = share');
        } catch (error) {
            // Игнорируем ошибку, если столбец уже существует или таблицы нет
            if (!error.message.includes('не существует') && !error.message.includes('does not exist')) {
                console.warn('⚠️ Предупреждение при добавлении столбца instrumentType:', error.message);
            }
        }
        
        // Создаем новые таблицы для кеширования
        console.log('📰 Создание таблиц кеширования новостей, настроений и торговых часов...');
        await CachedNews.sync({ force: false });
        await CachedTelegramSentiment.sync({ force: false });
        await CachedTradingHours.sync({ force: false });
        console.log('✅ Таблицы кеширования созданы/обновлены');
        
        // Создаем таблицу торговых заявок
        console.log('🎯 Создание таблицы торговых заявок...');
        await TradingRequest.sync({ force: false });
        console.log('✅ Таблица торговых заявок создана/обновлена');
        
        // Создаем таблицу виртуального портфеля
        console.log('💼 Создание таблицы виртуального портфеля...');
        await VirtualPortfolio.sync({ force: false });
        console.log('✅ Таблица виртуального портфеля создана/обновлена');

        // Инициализация настроек
        console.log('\n🔧 Инициализация настроек...');
        await initializeRecommendedSettings();
        console.log('✅ Настройки инициализированы');

        // Показываем статистику
        await showDatabaseStats();

        console.log('\n🎉 Инициализация базы данных завершена успешно!');

    } catch (error) {
        console.error('❌ Ошибка инициализации базы данных:', error);
        // Не завершаем процесс принудительно, даём вызывающей стороне обработать
    }
}

/**
 * Инициализация рекомендуемых настроек для Этапов 1-2
 */
async function initializeRecommendedSettings() {
    try {
        // Проверяем, есть ли уже настройки
        const existingCount = await Settings.count();
        
        if (existingCount > 0) {
            console.log(`ℹ️ Найдено ${existingCount} существующих настроек`);
            
            // Спрашиваем пользователя, хочет ли он перезаписать настройки
            console.log('🔄 Обновляем настройки до рекомендуемых...');
        }

        // Рекомендуемые настройки для Этапов 1-2
        const recommendedSettings = [
            // ========================================
            // ПОРТФЕЛЬ И ТОРГОВЛЯ
            // ========================================
            {
                key: 'user_max_portfolio_budget',
                value: 1000000,
                description: 'Максимальный бюджет портфеля (руб.)',
                category: 'portfolio',
                dataType: 'number',
                minValue: 10000,
                maxValue: 10000000
            },
            {
                key: 'max_stock_price',
                value: 0,
                description: 'Максимальная цена акции для покупки (0 = без ограничений)',
                category: 'portfolio',
                dataType: 'number',
                minValue: 0,
                maxValue: 100000
            },
            {
                key: 'min_stock_price',
                value: 0,
                description: 'Минимальная цена акции для покупки',
                category: 'portfolio',
                dataType: 'number',
                minValue: 0,
                maxValue: 10000
            },

            // ========================================
            // ПЛАНИРОВЩИК
            // ========================================
            {
                key: 'cache_update_interval',
                value: '0 */4 * * *',
                description: 'Интервал обновления кеша данных (cron)',
                category: 'scheduler',
                dataType: 'string',
                options: [
                    { value: '0 */1 * * *', label: 'Каждый час' },
                    { value: '0 */3 * * *', label: 'Каждые 3 часа' },
                    { value: '0 */4 * * *', label: 'Каждые 4 часа' },
                    { value: '0 */6 * * *', label: 'Каждые 6 часов' },
                    { value: '0 */12 * * *', label: 'Каждые 12 часов' },
                    { value: '0 0 * * *', label: 'Раз в день' }
                ]
            },
            {
                key: 'analysis_interval',
                value: '0 */1 * * *',
                description: 'Интервал анализа рынка (cron)',
                category: 'scheduler',
                dataType: 'string',
                options: [
                    { value: '0 */1 * * *', label: 'Каждый час' },
                    { value: '0 */2 * * *', label: 'Каждые 2 часа' },
                    { value: '0 */4 * * *', label: 'Каждые 4 часа' },
                    { value: '0 */6 * * *', label: 'Каждые 6 часов' },
                    { value: '0 */12 * * *', label: 'Каждые 12 часов' },
                    { value: '0 0 * * *', label: 'Раз в день' }
                ]
            },
            {
                key: 'nn_training_schedule',
                value: '0 3 * * 1',
                description: 'Расписание полного обучения нейросети (cron)',
                category: 'scheduler',
                dataType: 'string',
                options: [
                    { value: '0 2 * * 1', label: 'Понедельник в 2:00' },
                    { value: '0 3 * * 1', label: 'Понедельник в 3:00' },
                    { value: '0 4 * * 1', label: 'Понедельник в 4:00' },
                    { value: '0 0 * * 1', label: 'Понедельник в 0:00' },
                    { value: '0 3 * * 0', label: 'Воскресенье в 3:00' }
                ]
            },
            {
                key: 'nn_training_interval',
                value: '*/30 * * * *',
                description: 'Интервал быстрого обучения нейросети (cron)',
                category: 'scheduler',
                dataType: 'string',
                options: [
                    { value: '*/5 * * * *', label: 'Каждые 5 минут' },
                    { value: '*/10 * * * *', label: 'Каждые 10 минут' },
                    { value: '*/15 * * * *', label: 'Каждые 15 минут' },
                    { value: '*/30 * * * *', label: 'Каждые 30 минут' },
                    { value: '0 */1 * * *', label: 'Каждый час' },
                    { value: '0 */2 * * *', label: 'Каждые 2 часа' }
                ]
            },
            {
                key: 'system_report_schedule',
                value: '0 */6 * * *',
                description: 'Расписание системных отчетов в Telegram (cron)',
                category: 'scheduler',
                dataType: 'string',
                options: [
                    { value: '0 */2 * * *', label: 'Каждые 2 часа' },
                    { value: '0 */4 * * *', label: 'Каждые 4 часа' },
                    { value: '0 */6 * * *', label: 'Каждые 6 часов' },
                    { value: '0 */8 * * *', label: 'Каждые 8 часов' },
                    { value: '0 */12 * * *', label: 'Каждые 12 часов' },
                    { value: '0 0 * * *', label: 'Ежедневно в 0:00' }
                ]
            },
            {
                key: 'system_report_enabled',
                value: true,
                description: 'Включить автоматические системные отчеты в Telegram',
                category: 'scheduler',
                dataType: 'boolean'
            },
            {
                key: 'startup_update_enabled',
                value: false,
                description: 'Обновлять данные при запуске приложения',
                category: 'scheduler',
                dataType: 'boolean'
            },
            {
                key: 'startup_update_interval',
                value: 240,
                description: 'Минимальный интервал для обновления данных при запуске (минуты)',
                category: 'scheduler',
                dataType: 'number',
                minValue: 5,
                maxValue: 1440
            },

            // ========================================
            // НЕЙРОСЕТЬ
            // ========================================
            {
                key: 'nn_training_days',
                value: 180,
                description: 'Количество дней для обучения нейросети',
                category: 'neural_network',
                dataType: 'number',
                minValue: 30,
                maxValue: 365
            },
            {
                key: 'nn_training_limit',
                value: 50,
                description: 'Максимальное количество инструментов для обучения',
                category: 'neural_network',
                dataType: 'number',
                minValue: 10,
                maxValue: 200
            },
            {
                key: 'nn_model_max_age_days',
                value: 7,
                description: 'Максимальный возраст модели (дни)',
                category: 'neural_network',
                dataType: 'number',
                minValue: 1,
                maxValue: 30
            },
            {
                key: 'nn_quick_training_enabled',
                value: true,
                description: 'Включить быстрое обучение нейросети',
                category: 'neural_network',
                dataType: 'boolean'
            },
            {
                key: 'nn_quick_training_limit',
                value: 15,
                description: 'Количество инструментов для быстрого обучения',
                category: 'neural_network',
                dataType: 'number',
                minValue: 5,
                maxValue: 50
            },
            {
                key: 'nn_quick_training_days',
                value: 30,
                description: 'Количество дней для быстрого обучения',
                category: 'neural_network',
                dataType: 'number',
                minValue: 7,
                maxValue: 90
            },
            {
                key: 'nn_learning_rate',
                value: 0.0005,
                description: 'Learning rate для обучения нейросети',
                category: 'neural_network',
                dataType: 'number',
                minValue: 0.0001,
                maxValue: 0.01
            },
            {
                key: 'nn_batch_size',
                value: 16,
                description: 'Размер батча для обучения',
                category: 'neural_network',
                dataType: 'number',
                minValue: 8,
                maxValue: 64
            },
            {
                key: 'nn_epochs',
                value: 50,
                description: 'Количество эпох обучения',
                category: 'neural_network',
                dataType: 'number',
                minValue: 20,
                maxValue: 200
            },
            {
                key: 'nn_dropout_rate',
                value: 0.2,
                description: 'Коэффициент dropout для предотвращения переобучения',
                category: 'neural_network',
                dataType: 'number',
                minValue: 0.1,
                maxValue: 0.5
            },
            {
                key: 'nn_validation_split',
                value: 0.2,
                description: 'Доля данных для валидации',
                category: 'neural_network',
                dataType: 'number',
                minValue: 0.1,
                maxValue: 0.3
            },
            {
                key: 'nn_early_stopping_patience',
                value: 10,
                description: 'Количество эпох без улучшения для early stopping',
                category: 'neural_network',
                dataType: 'number',
                minValue: 5,
                maxValue: 20
            },
            {
                key: 'nn_sequence_length',
                value: 60,
                description: 'Длина временной последовательности для LSTM',
                category: 'neural_network',
                dataType: 'number',
                minValue: 20,
                maxValue: 120
            },
            {
                key: 'nn_prediction_horizon',
                value: 5,
                description: 'Горизонт предсказания в днях',
                category: 'neural_network',
                dataType: 'number',
                minValue: 1,
                maxValue: 30
            },
            {
                key: 'nn_accuracy_threshold',
                value: 0.65,
                description: 'Минимальная точность для принятия модели',
                category: 'neural_network',
                dataType: 'number',
                minValue: 0.5,
                maxValue: 0.95
            },
            {
                key: 'nn_include_dividends',
                value: true,
                description: 'Включить дивиденды как фактор в нейросеть',
                category: 'neural_network',
                dataType: 'boolean'
            },
            {
                key: 'nn_dividend_weight',
                value: 0.1,
                description: 'Вес дивидендного фактора в нейросети (0-1)',
                category: 'neural_network',
                dataType: 'number',
                minValue: 0.0,
                maxValue: 1.0
            },

            // ========================================
            // УВЕДОМЛЕНИЯ
            // ========================================
            {
                key: 'telegram_notifications_enabled',
                value: true,
                description: 'Включить уведомления в Telegram',
                category: 'notifications',
                dataType: 'boolean'
            },
            {
                key: 'notification_frequency',
                value: 'important',
                description: 'Частота уведомлений',
                category: 'notifications',
                dataType: 'string',
                options: [
                    { value: 'all', label: 'Все уведомления' },
                    { value: 'important', label: 'Только важные' },
                    { value: 'errors', label: 'Только ошибки' }
                ]
            },
            {
                key: 'news_cache_update_interval',
                value: '0 */6 * * *',
                description: 'Расписание обновления кеша новостей (cron)',
                category: 'notifications',
                dataType: 'string'
            },
            {
                key: 'telegram_cache_update_interval',
                value: '0 */6 * * *',
                description: 'Расписание обновления кеша настроений Telegram (cron)',
                category: 'notifications',
                dataType: 'string'
            },

            // ========================================
            // ТОРГОВЫЕ ЧАСЫ
            // ========================================
            {
                key: 'trading_hours_update_interval',
                value: '*/15 * * * *',
                description: 'Интервал обновления торговых часов (cron)',
                category: 'trading_hours',
                dataType: 'string',
                options: [
                    { value: '*/5 * * * *', label: 'Каждые 5 минут' },
                    { value: '*/10 * * * *', label: 'Каждые 10 минут' },
                    { value: '*/15 * * * *', label: 'Каждые 15 минут' },
                    { value: '*/30 * * * *', label: 'Каждые 30 минут' },
                    { value: '0 */1 * * *', label: 'Каждый час' }
                ]
            },
            {
                key: 'trading_hours_cache_timeout',
                value: 15,
                description: 'Timeout кеша торговых часов (минуты)',
                category: 'trading_hours',
                dataType: 'number',
                minValue: 5,
                maxValue: 60
            },
            {
                key: 'trading_hours_enabled',
                value: true,
                description: 'Включить мониторинг торговых часов',
                category: 'trading_hours',
                dataType: 'boolean'
            },
            {
                key: 'trading_hours_notification_minutes',
                value: 15,
                description: 'За сколько минут до открытия/закрытия отправлять уведомления',
                category: 'trading_hours',
                dataType: 'number',
                minValue: 5,
                maxValue: 60
            },
            {
                key: 'trading_hours_instruments_count',
                value: 2,
                description: 'Количество инструментов для проверки торговых часов',
                category: 'trading_hours',
                dataType: 'number',
                minValue: 1,
                maxValue: 10
            },

            // ========================================
            // МИГРАЦИЯ ПОРТФЕЛЯ
            // ========================================
            {
                key: 'migration_max_position_size',
                value: 50000,
                description: 'Максимальный размер позиции для миграции (руб.)',
                category: 'migration',
                dataType: 'number',
                minValue: 1000,
                maxValue: 500000
            },
            {
                key: 'migration_max_total_exposure',
                value: 200000,
                description: 'Максимальное общее воздействие для миграции (руб.)',
                category: 'migration',
                dataType: 'number',
                minValue: 10000,
                maxValue: 2000000
            },
            {
                key: 'migration_steps',
                value: 5,
                description: 'Количество шагов миграции',
                category: 'migration',
                dataType: 'number',
                minValue: 1,
                maxValue: 20
            },
            {
                key: 'migration_step_delay',
                value: 30000,
                description: 'Задержка между шагами миграции (мс)',
                category: 'migration',
                dataType: 'number',
                minValue: 5000,
                maxValue: 300000
            },
            {
                key: 'migration_price_tolerance',
                value: 0.02,
                description: 'Толерантность к изменению цен (2% = 0.02)',
                category: 'migration',
                dataType: 'number',
                minValue: 0.001,
                maxValue: 0.1
            },
            {
                key: 'migration_max_slippage',
                value: 0.005,
                description: 'Максимальное проскальзывание (0.5% = 0.005)',
                category: 'migration',
                dataType: 'number',
                minValue: 0.001,
                maxValue: 0.05
            },
            {
                key: 'migration_emergency_stop_loss',
                value: 0.10,
                description: 'Стоп-лосс для миграции (10% = 0.10)',
                category: 'migration',
                dataType: 'number',
                minValue: 0.01,
                maxValue: 0.5
            },
            {
                key: 'migration_min_position_value',
                value: 1000,
                description: 'Минимальная стоимость позиции для миграции (руб.)',
                category: 'migration',
                dataType: 'number',
                minValue: 100,
                maxValue: 10000
            },
            {
                key: 'migration_max_positions_per_step',
                value: 3,
                description: 'Максимальное количество позиций на шаг',
                category: 'migration',
                dataType: 'number',
                minValue: 1,
                maxValue: 10
            },
            {
                key: 'migration_retry_attempts',
                value: 3,
                description: 'Количество попыток повторного исполнения',
                category: 'migration',
                dataType: 'number',
                minValue: 1,
                maxValue: 10
            },
            {
                key: 'migration_retry_delay',
                value: 5000,
                description: 'Задержка между попытками (мс)',
                category: 'migration',
                dataType: 'number',
                minValue: 1000,
                maxValue: 60000
            },
            {
                key: 'migration_notify_on_start',
                value: true,
                description: 'Уведомлять о начале миграции',
                category: 'migration',
                dataType: 'boolean'
            },
            {
                key: 'migration_notify_on_progress',
                value: true,
                description: 'Уведомлять о прогрессе миграции',
                category: 'migration',
                dataType: 'boolean'
            },
            {
                key: 'migration_notify_on_complete',
                value: true,
                description: 'Уведомлять о завершении миграции',
                category: 'migration',
                dataType: 'boolean'
            },
            {
                key: 'migration_notify_on_error',
                value: true,
                description: 'Уведомлять об ошибках миграции',
                category: 'migration',
                dataType: 'boolean'
            },
            {
                key: 'migration_require_confirmation',
                value: true,
                description: 'Требовать подтверждение перед миграцией',
                category: 'migration',
                dataType: 'boolean'
            },
            {
                key: 'migration_max_time',
                value: 3600000,
                description: 'Максимальное время миграции (мс)',
                category: 'migration',
                dataType: 'number',
                minValue: 300000,
                maxValue: 7200000
            },
            {
                key: 'migration_auto_stop_on_error',
                value: true,
                description: 'Автоматически останавливать при критических ошибках',
                category: 'migration',
                dataType: 'boolean'
            },

            // ========================================
            // МАСШТАБИРОВАНИЕ КАПИТАЛА (ЭТАП 3)
            // ========================================
            {
                key: 'scaling_min_profitability',
                value: 0.15,
                description: 'Минимальная прибыльность для увеличения капитала (15% = 0.15)',
                category: 'scaling',
                dataType: 'number',
                minValue: 0.05,
                maxValue: 0.50
            },
            {
                key: 'scaling_min_trading_days',
                value: 30,
                description: 'Минимальное количество торговых дней для анализа',
                category: 'scaling',
                dataType: 'number',
                minValue: 7,
                maxValue: 365
            },
            {
                key: 'scaling_max_drawdown',
                value: 0.10,
                description: 'Максимальная допустимая просадка (10% = 0.10)',
                category: 'scaling',
                dataType: 'number',
                minValue: 0.01,
                maxValue: 0.30
            },
            {
                key: 'scaling_min_win_rate',
                value: 0.60,
                description: 'Минимальный win rate для увеличения капитала (60% = 0.60)',
                category: 'scaling',
                dataType: 'number',
                minValue: 0.30,
                maxValue: 0.95
            },
            {
                key: 'scaling_capital_increase_step',
                value: 0.25,
                description: 'Шаг увеличения капитала (25% = 0.25)',
                category: 'scaling',
                dataType: 'number',
                minValue: 0.05,
                maxValue: 0.50
            },
            {
                key: 'scaling_max_capital_increase',
                value: 0.50,
                description: 'Максимальное увеличение капитала за раз (50% = 0.50)',
                category: 'scaling',
                dataType: 'number',
                minValue: 0.10,
                maxValue: 1.00
            },
            {
                key: 'scaling_min_days_between',
                value: 14,
                description: 'Минимальное количество дней между увеличениями',
                category: 'scaling',
                dataType: 'number',
                minValue: 1,
                maxValue: 90
            },
            {
                key: 'scaling_capital_decrease_step',
                value: 0.20,
                description: 'Шаг снижения капитала (20% = 0.20)',
                category: 'scaling',
                dataType: 'number',
                minValue: 0.05,
                maxValue: 0.50
            },
            {
                key: 'scaling_max_capital_decrease',
                value: 0.40,
                description: 'Максимальное снижение капитала за раз (40% = 0.40)',
                category: 'scaling',
                dataType: 'number',
                minValue: 0.10,
                maxValue: 0.80
            },
            {
                key: 'scaling_risk_adjustment_factor',
                value: 0.8,
                description: 'Коэффициент корректировки риска при увеличении капитала',
                category: 'scaling',
                dataType: 'number',
                minValue: 0.5,
                maxValue: 1.0
            },
            {
                key: 'scaling_max_risk_per_trade',
                value: 0.02,
                description: 'Максимальный риск на сделку (2% = 0.02)',
                category: 'scaling',
                dataType: 'number',
                minValue: 0.001,
                maxValue: 0.10
            },
            {
                key: 'scaling_max_portfolio_risk',
                value: 0.10,
                description: 'Максимальный риск портфеля (10% = 0.10)',
                category: 'scaling',
                dataType: 'number',
                minValue: 0.01,
                maxValue: 0.30
            },
            {
                key: 'scaling_notify_capital_change',
                value: true,
                description: 'Уведомлять об изменениях капитала',
                category: 'scaling',
                dataType: 'boolean'
            },
            {
                key: 'scaling_notify_risk_adjustment',
                value: true,
                description: 'Уведомлять о корректировках риска',
                category: 'scaling',
                dataType: 'boolean'
            },
            {
                key: 'scaling_notify_performance_alert',
                value: true,
                description: 'Уведомлять о предупреждениях производительности',
                category: 'scaling',
                dataType: 'boolean'
            },
            {
                key: 'scaling_require_manual_approval',
                value: true,
                description: 'Требовать ручное подтверждение для изменений капитала',
                category: 'scaling',
                dataType: 'boolean'
            },
            {
                key: 'scaling_max_auto_increase',
                value: 0.20,
                description: 'Максимальное автоматическое увеличение (20% = 0.20)',
                category: 'scaling',
                dataType: 'number',
                minValue: 0.05,
                maxValue: 0.50
            },
            {
                key: 'scaling_performance_window',
                value: 30,
                description: 'Окно анализа производительности (дни)',
                category: 'scaling',
                dataType: 'number',
                minValue: 7,
                maxValue: 365
            },
            {
                key: 'scaling_evaluation_frequency',
                value: 'daily',
                description: 'Частота оценки производительности',
                category: 'scaling',
                dataType: 'string',
                options: [
                    { value: 'daily', label: 'Ежедневно' },
                    { value: 'weekly', label: 'Еженедельно' },
                    { value: 'monthly', label: 'Ежемесячно' }
                ]
            },
            {
                key: 'scaling_auto_enabled',
                value: false,
                description: 'Включить автоматическое масштабирование капитала',
                category: 'scaling',
                dataType: 'boolean'
            },
            {
                key: 'scaling_capital_levels',
                value: {
                    micro: { min: 10000, max: 50000, multiplier: 1.0, name: 'Микро-капитал' },
                    small: { min: 50000, max: 200000, multiplier: 1.2, name: 'Малый капитал' },
                    medium: { min: 200000, max: 500000, multiplier: 1.5, name: 'Средний капитал' },
                    large: { min: 500000, max: 1000000, multiplier: 2.0, name: 'Большой капитал' }
                },
                description: 'Уровни капитала для масштабирования',
                category: 'scaling',
                dataType: 'json'
            },

            // ========================================
            // КОРРЕКТИРОВКА РИСКОВ
            // ========================================
            {
                key: 'risk_adjustment_enabled',
                value: true,
                description: 'Включить автоматическую корректировку рисков',
                category: 'risk_adjustment',
                dataType: 'boolean'
            },
            {
                key: 'risk_auto_adjustment',
                value: true,
                description: 'Включить автоматическую корректировку',
                category: 'risk_adjustment',
                dataType: 'boolean'
            },
            {
                key: 'risk_adjustment_frequency',
                value: 'daily',
                description: 'Частота корректировки рисков',
                category: 'risk_adjustment',
                dataType: 'string',
                options: [
                    { value: 'daily', label: 'Ежедневно' },
                    { value: 'weekly', label: 'Еженедельно' },
                    { value: 'monthly', label: 'Ежемесячно' }
                ]
            },
            {
                key: 'risk_performance_threshold',
                value: 0.15,
                description: 'Порог производительности для корректировки (15% = 0.15)',
                category: 'risk_adjustment',
                dataType: 'number',
                minValue: 0.05,
                maxValue: 0.50
            },
            {
                key: 'risk_drawdown_threshold',
                value: 0.08,
                description: 'Порог просадки для корректировки (8% = 0.08)',
                category: 'risk_adjustment',
                dataType: 'number',
                minValue: 0.01,
                maxValue: 0.30
            },
            {
                key: 'risk_volatility_threshold',
                value: 0.05,
                description: 'Порог волатильности для корректировки (5% = 0.05)',
                category: 'risk_adjustment',
                dataType: 'number',
                minValue: 0.01,
                maxValue: 0.20
            },
            {
                key: 'risk_winrate_threshold',
                value: 0.60,
                description: 'Порог win rate для корректировки (60% = 0.60)',
                category: 'risk_adjustment',
                dataType: 'number',
                minValue: 0.30,
                maxValue: 0.95
            },
            {
                key: 'risk_adjustment_step',
                value: 0.1,
                description: 'Шаг корректировки рисков (10% = 0.1)',
                category: 'risk_adjustment',
                dataType: 'number',
                minValue: 0.01,
                maxValue: 0.50
            },
            {
                key: 'risk_max_adjustment',
                value: 0.5,
                description: 'Максимальная корректировка (50% = 0.5)',
                category: 'risk_adjustment',
                dataType: 'number',
                minValue: 0.1,
                maxValue: 1.0
            },
            {
                key: 'risk_min_adjustment',
                value: 0.05,
                description: 'Минимальная корректировка (5% = 0.05)',
                category: 'risk_adjustment',
                dataType: 'number',
                minValue: 0.01,
                maxValue: 0.20
            },
            {
                key: 'risk_performance_window',
                value: 30,
                description: 'Окно анализа производительности (дни)',
                category: 'risk_adjustment',
                dataType: 'number',
                minValue: 7,
                maxValue: 365
            },
            {
                key: 'risk_volatility_window',
                value: 14,
                description: 'Окно анализа волатильности (дни)',
                category: 'risk_adjustment',
                dataType: 'number',
                minValue: 3,
                maxValue: 90
            },
            {
                key: 'risk_trend_window',
                value: 7,
                description: 'Окно анализа тренда (дни)',
                category: 'risk_adjustment',
                dataType: 'number',
                minValue: 3,
                maxValue: 30
            },
            {
                key: 'risk_notify_adjustment',
                value: true,
                description: 'Уведомлять о корректировках рисков',
                category: 'risk_adjustment',
                dataType: 'boolean'
            },
            {
                key: 'risk_notify_risk_change',
                value: true,
                description: 'Уведомлять об изменениях уровня риска',
                category: 'risk_adjustment',
                dataType: 'boolean'
            },
            {
                key: 'risk_notify_threshold',
                value: true,
                description: 'Уведомлять о превышении порогов',
                category: 'risk_adjustment',
                dataType: 'boolean'
            },
            {
                key: 'risk_integrate_scaling',
                value: true,
                description: 'Интегрировать с системой масштабирования',
                category: 'risk_adjustment',
                dataType: 'boolean'
            },
            {
                key: 'risk_integrate_profitability',
                value: true,
                description: 'Интегрировать с отслеживанием прибыльности',
                category: 'risk_adjustment',
                dataType: 'boolean'
            },
            {
                key: 'risk_emergency_stop_enabled',
                value: true,
                description: 'Включить экстренную остановку',
                category: 'risk_adjustment',
                dataType: 'boolean'
            },
            {
                key: 'risk_emergency_stop_threshold',
                value: 0.15,
                description: 'Порог экстренной остановки (15% = 0.15)',
                category: 'risk_adjustment',
                dataType: 'number',
                minValue: 0.05,
                maxValue: 0.50
            },
            {
                key: 'risk_emergency_stop_duration',
                value: 24,
                description: 'Длительность экстренной остановки (часы)',
                category: 'risk_adjustment',
                dataType: 'number',
                minValue: 1,
                maxValue: 168
            },

            // ========================================
            // АНАЛИЗ ПРОИЗВОДИТЕЛЬНОСТИ
            // ========================================
            {
                key: 'performance_analysis_enabled',
                value: true,
                description: 'Включить анализ производительности',
                category: 'performance',
                dataType: 'boolean'
            },
            {
                key: 'performance_cache_enabled',
                value: true,
                description: 'Включить кеширование анализа',
                category: 'performance',
                dataType: 'boolean'
            },
            {
                key: 'performance_cache_timeout',
                value: 300,
                description: 'Timeout кеша анализа (секунды)',
                category: 'performance',
                dataType: 'number',
                minValue: 60,
                maxValue: 3600
            },
            {
                key: 'performance_short_term',
                value: 7,
                description: 'Краткосрочный период анализа (дни)',
                category: 'performance',
                dataType: 'number',
                minValue: 1,
                maxValue: 30
            },
            {
                key: 'performance_medium_term',
                value: 30,
                description: 'Среднесрочный период анализа (дни)',
                category: 'performance',
                dataType: 'number',
                minValue: 7,
                maxValue: 90
            },
            {
                key: 'performance_long_term',
                value: 90,
                description: 'Долгосрочный период анализа (дни)',
                category: 'performance',
                dataType: 'number',
                minValue: 30,
                maxValue: 365
            },
            {
                key: 'performance_excellent_threshold',
                value: 0.20,
                description: 'Порог отличной производительности (20% = 0.20)',
                category: 'performance',
                dataType: 'number',
                minValue: 0.05,
                maxValue: 0.50
            },
            {
                key: 'performance_good_threshold',
                value: 0.10,
                description: 'Порог хорошей производительности (10% = 0.10)',
                category: 'performance',
                dataType: 'number',
                minValue: 0.02,
                maxValue: 0.30
            },
            {
                key: 'performance_average_threshold',
                value: 0.05,
                description: 'Порог средней производительности (5% = 0.05)',
                category: 'performance',
                dataType: 'number',
                minValue: 0.01,
                maxValue: 0.20
            },
            {
                key: 'performance_poor_threshold',
                value: 0.0,
                description: 'Порог плохой производительности (0% = 0.0)',
                category: 'performance',
                dataType: 'number',
                minValue: -0.20,
                maxValue: 0.10
            },
            {
                key: 'performance_include_trading',
                value: true,
                description: 'Включить анализ торговых метрик',
                category: 'performance',
                dataType: 'boolean'
            },
            {
                key: 'performance_include_ai',
                value: true,
                description: 'Включить анализ AI метрик',
                category: 'performance',
                dataType: 'boolean'
            },
            {
                key: 'performance_include_risk',
                value: true,
                description: 'Включить анализ риск-метрик',
                category: 'performance',
                dataType: 'boolean'
            },
            {
                key: 'performance_include_scaling',
                value: true,
                description: 'Включить анализ метрик масштабирования',
                category: 'performance',
                dataType: 'boolean'
            },
            {
                key: 'performance_notify_analysis',
                value: true,
                description: 'Уведомлять о результатах анализа',
                category: 'performance',
                dataType: 'boolean'
            },
            {
                key: 'performance_notify_trends',
                value: true,
                description: 'Уведомлять об изменениях трендов',
                category: 'performance',
                dataType: 'boolean'
            },
            {
                key: 'performance_notify_alerts',
                value: true,
                description: 'Уведомлять о предупреждениях',
                category: 'performance',
                dataType: 'boolean'
            },
            {
                key: 'performance_daily_report',
                value: false,
                description: 'Генерировать ежедневные отчеты',
                category: 'performance',
                dataType: 'boolean'
            },
            {
                key: 'performance_weekly_report',
                value: true,
                description: 'Генерировать еженедельные отчеты',
                category: 'performance',
                dataType: 'boolean'
            },
            {
                key: 'performance_monthly_report',
                value: true,
                description: 'Генерировать ежемесячные отчеты',
                category: 'performance',
                dataType: 'boolean'
            },
            {
                key: 'performance_integrate_telegram',
                value: true,
                description: 'Интегрировать с Telegram уведомлениями',
                category: 'performance',
                dataType: 'boolean'
            },
            {
                key: 'performance_integrate_websocket',
                value: true,
                description: 'Интегрировать с WebSocket',
                category: 'performance',
                dataType: 'boolean'
            },

            // ========================================
            // СТРАТЕГИЯ РАСПРЕДЕЛЕНИЯ КАПИТАЛА
            // ========================================
            {
                key: 'allocation_enabled',
                value: true,
                description: 'Включить стратегию распределения капитала',
                category: 'allocation',
                dataType: 'boolean'
            },
            {
                key: 'allocation_auto_rebalancing',
                value: true,
                description: 'Включить автоматическую ребалансировку',
                category: 'allocation',
                dataType: 'boolean'
            },
            {
                key: 'allocation_rebalancing_frequency',
                value: 'weekly',
                description: 'Частота ребалансировки портфеля',
                category: 'allocation',
                dataType: 'string',
                options: [
                    { value: 'daily', label: 'Ежедневно' },
                    { value: 'weekly', label: 'Еженедельно' },
                    { value: 'monthly', label: 'Ежемесячно' }
                ]
            },
            {
                key: 'allocation_default_strategy',
                value: 'balanced',
                description: 'Стратегия распределения по умолчанию',
                category: 'allocation',
                dataType: 'string',
                options: [
                    { value: 'balanced', label: 'Сбалансированная' },
                    { value: 'aggressive', label: 'Агрессивная' },
                    { value: 'conservative', label: 'Консервативная' },
                    { value: 'dynamic', label: 'Динамическая' }
                ]
            },
            {
                key: 'allocation_adaptive_strategy',
                value: true,
                description: 'Включить адаптивную стратегию',
                category: 'allocation',
                dataType: 'boolean'
            },
            {
                key: 'allocation_strategy_switching',
                value: true,
                description: 'Разрешить переключение стратегий',
                category: 'allocation',
                dataType: 'boolean'
            },
            {
                key: 'allocation_max_positions',
                value: 20,
                description: 'Максимальное количество позиций',
                category: 'allocation',
                dataType: 'number',
                minValue: 5,
                maxValue: 100
            },
            {
                key: 'allocation_min_positions',
                value: 5,
                description: 'Минимальное количество позиций',
                category: 'allocation',
                dataType: 'number',
                minValue: 1,
                maxValue: 50
            },
            {
                key: 'allocation_max_position_size',
                value: 0.05,
                description: 'Максимальный размер позиции (5% = 0.05)',
                category: 'allocation',
                dataType: 'number',
                minValue: 0.01,
                maxValue: 0.20
            },
            {
                key: 'allocation_min_position_size',
                value: 0.01,
                description: 'Минимальный размер позиции (1% = 0.01)',
                category: 'allocation',
                dataType: 'number',
                minValue: 0.001,
                maxValue: 0.05
            },
            {
                key: 'allocation_max_sector_exposure',
                value: 0.20,
                description: 'Максимальная экспозиция по сектору (20% = 0.20)',
                category: 'allocation',
                dataType: 'number',
                minValue: 0.05,
                maxValue: 0.50
            },
            {
                key: 'allocation_max_single_stock',
                value: 0.10,
                description: 'Максимальная экспозиция по одной акции (10% = 0.10)',
                category: 'allocation',
                dataType: 'number',
                minValue: 0.01,
                maxValue: 0.30
            },
            {
                key: 'allocation_min_diversification',
                value: 0.7,
                description: 'Минимальная диверсификация (70% = 0.7)',
                category: 'allocation',
                dataType: 'number',
                minValue: 0.3,
                maxValue: 1.0
            },
            {
                key: 'allocation_correlation_threshold',
                value: 0.7,
                description: 'Порог корреляции между позициями (70% = 0.7)',
                category: 'allocation',
                dataType: 'number',
                minValue: 0.3,
                maxValue: 1.0
            },
            {
                key: 'allocation_volatility_threshold',
                value: 0.3,
                description: 'Порог волатильности (30% = 0.3)',
                category: 'allocation',
                dataType: 'number',
                minValue: 0.1,
                maxValue: 1.0
            },
            {
                key: 'allocation_liquidity_threshold',
                value: 1000000,
                description: 'Порог ликвидности (1M руб.)',
                category: 'allocation',
                dataType: 'number',
                minValue: 100000,
                maxValue: 10000000
            },
            {
                key: 'allocation_performance_window',
                value: 30,
                description: 'Окно анализа производительности (дни)',
                category: 'allocation',
                dataType: 'number',
                minValue: 7,
                maxValue: 365
            },
            {
                key: 'allocation_adaptation_sensitivity',
                value: 0.5,
                description: 'Чувствительность адаптации (50% = 0.5)',
                category: 'allocation',
                dataType: 'number',
                minValue: 0.1,
                maxValue: 1.0
            },
            {
                key: 'allocation_max_strategy_change',
                value: 0.3,
                description: 'Максимальное изменение стратегии (30% = 0.3)',
                category: 'allocation',
                dataType: 'number',
                minValue: 0.1,
                maxValue: 0.8
            },
            {
                key: 'allocation_notify_rebalancing',
                value: true,
                description: 'Уведомлять о ребалансировке',
                category: 'allocation',
                dataType: 'boolean'
            },
            {
                key: 'allocation_notify_strategy_change',
                value: true,
                description: 'Уведомлять об изменении стратегии',
                category: 'allocation',
                dataType: 'boolean'
            },
            {
                key: 'allocation_notify_violations',
                value: true,
                description: 'Уведомлять о нарушениях лимитов',
                category: 'allocation',
                dataType: 'boolean'
            },
            {
                key: 'allocation_integrate_scaling',
                value: true,
                description: 'Интегрировать с системой масштабирования',
                category: 'allocation',
                dataType: 'boolean'
            },
            {
                key: 'allocation_integrate_risk',
                value: true,
                description: 'Интегрировать с риск-менеджментом',
                category: 'allocation',
                dataType: 'boolean'
            },
            {
                key: 'allocation_integrate_profitability',
                value: true,
                description: 'Интегрировать с отслеживанием прибыльности',
                category: 'allocation',
                dataType: 'boolean'
            },

            // ========================================
            // ВАЛИДАЦИЯ ЭТАПА 3
            // ========================================
            {
                key: 'stage3_validation_enabled',
                value: true,
                description: 'Включить валидацию Этапа 3',
                category: 'stage3_validation',
                dataType: 'boolean'
            },
            {
                key: 'stage3_auto_validation',
                value: true,
                description: 'Включить автоматическую валидацию',
                category: 'stage3_validation',
                dataType: 'boolean'
            },
            {
                key: 'stage3_validation_frequency',
                value: 'daily',
                description: 'Частота валидации',
                category: 'stage3_validation',
                dataType: 'string',
                options: [
                    { value: 'daily', label: 'Ежедневно' },
                    { value: 'weekly', label: 'Еженедельно' },
                    { value: 'monthly', label: 'Ежемесячно' }
                ]
            },
            {
                key: 'stage3_min_trading_days',
                value: 30,
                description: 'Минимальное количество торговых дней',
                category: 'stage3_validation',
                dataType: 'number',
                minValue: 7,
                maxValue: 365
            },
            {
                key: 'stage3_min_profitability',
                value: 0.10,
                description: 'Минимальная прибыльность (10% = 0.10)',
                category: 'stage3_validation',
                dataType: 'number',
                minValue: 0.01,
                maxValue: 0.50
            },
            {
                key: 'stage3_max_drawdown',
                value: 0.08,
                description: 'Максимальная просадка (8% = 0.08)',
                category: 'stage3_validation',
                dataType: 'number',
                minValue: 0.01,
                maxValue: 0.30
            },
            {
                key: 'stage3_min_win_rate',
                value: 0.55,
                description: 'Минимальный win rate (55% = 0.55)',
                category: 'stage3_validation',
                dataType: 'number',
                minValue: 0.30,
                maxValue: 0.95
            },
            {
                key: 'stage3_min_trades',
                value: 50,
                description: 'Минимальное количество сделок',
                category: 'stage3_validation',
                dataType: 'number',
                minValue: 10,
                maxValue: 1000
            },
            {
                key: 'stage3_max_volatility',
                value: 0.15,
                description: 'Максимальная волатильность (15% = 0.15)',
                category: 'stage3_validation',
                dataType: 'number',
                minValue: 0.05,
                maxValue: 0.50
            },
            {
                key: 'stage3_min_consistency',
                value: 0.6,
                description: 'Минимальная консистентность (60% = 0.6)',
                category: 'stage3_validation',
                dataType: 'number',
                minValue: 0.3,
                maxValue: 1.0
            },
            {
                key: 'stage3_max_consecutive_losses',
                value: 5,
                description: 'Максимальное количество последовательных убытков',
                category: 'stage3_validation',
                dataType: 'number',
                minValue: 2,
                maxValue: 20
            },
            {
                key: 'stage3_min_uptime',
                value: 0.95,
                description: 'Минимальный uptime системы (95% = 0.95)',
                category: 'stage3_validation',
                dataType: 'number',
                minValue: 0.8,
                maxValue: 1.0
            },
            {
                key: 'stage3_max_error_rate',
                value: 0.05,
                description: 'Максимальный уровень ошибок (5% = 0.05)',
                category: 'stage3_validation',
                dataType: 'number',
                minValue: 0.01,
                maxValue: 0.20
            },
            {
                key: 'stage3_min_data_quality',
                value: 0.9,
                description: 'Минимальное качество данных (90% = 0.9)',
                category: 'stage3_validation',
                dataType: 'number',
                minValue: 0.7,
                maxValue: 1.0
            },
            {
                key: 'stage3_risk_management_active',
                value: true,
                description: 'Риск-менеджмент должен быть активен',
                category: 'stage3_validation',
                dataType: 'boolean'
            },
            {
                key: 'stage3_max_risk_per_trade',
                value: 0.02,
                description: 'Максимальный риск на сделку (2% = 0.02)',
                category: 'stage3_validation',
                dataType: 'number',
                minValue: 0.001,
                maxValue: 0.10
            },
            {
                key: 'stage3_max_portfolio_risk',
                value: 0.10,
                description: 'Максимальный риск портфеля (10% = 0.10)',
                category: 'stage3_validation',
                dataType: 'number',
                minValue: 0.01,
                maxValue: 0.30
            },
            {
                key: 'stage3_min_ai_accuracy',
                value: 0.60,
                description: 'Минимальная точность AI (60% = 0.60)',
                category: 'stage3_validation',
                dataType: 'number',
                minValue: 0.30,
                maxValue: 0.95
            },
            {
                key: 'stage3_min_prediction_confidence',
                value: 0.7,
                description: 'Минимальная уверенность предсказаний (70% = 0.7)',
                category: 'stage3_validation',
                dataType: 'number',
                minValue: 0.5,
                maxValue: 1.0
            },
            {
                key: 'stage3_max_prediction_delay',
                value: 300,
                description: 'Максимальная задержка предсказаний (секунды)',
                category: 'stage3_validation',
                dataType: 'number',
                minValue: 10,
                maxValue: 1800
            },
            {
                key: 'stage3_notify_validation',
                value: true,
                description: 'Уведомлять о результатах валидации',
                category: 'stage3_validation',
                dataType: 'boolean'
            },
            {
                key: 'stage3_notify_readiness',
                value: true,
                description: 'Уведомлять о готовности к этапу',
                category: 'stage3_validation',
                dataType: 'boolean'
            },
            {
                key: 'stage3_notify_issues',
                value: true,
                description: 'Уведомлять о проблемах',
                category: 'stage3_validation',
                dataType: 'boolean'
            },
            {
                key: 'stage3_integrate_telegram',
                value: true,
                description: 'Интегрировать с Telegram',
                category: 'stage3_validation',
                dataType: 'boolean'
            },
            {
                key: 'stage3_integrate_websocket',
                value: true,
                description: 'Интегрировать с WebSocket',
                category: 'stage3_validation',
                dataType: 'boolean'
            }
        ];

        // Добавляем настройки в базу данных
        let addedCount = 0;
        let updatedCount = 0;

        for (const setting of recommendedSettings) {
            try {
                const existing = await Settings.findOne({ where: { key: setting.key } });
                
                if (existing) {
                    await Settings.setSetting(setting.key, setting.value, {
                        description: setting.description,
                        category: setting.category,
                        dataType: setting.dataType,
                        minValue: setting.minValue,
                        maxValue: setting.maxValue,
                        options: setting.options
                    });
                    updatedCount++;
                } else {
                    await Settings.setSetting(setting.key, setting.value, {
                        description: setting.description,
                        category: setting.category,
                        dataType: setting.dataType,
                        minValue: setting.minValue,
                        maxValue: setting.maxValue,
                        options: setting.options
                    });
                    addedCount++;
                }
            } catch (error) {
                console.error(`❌ Ошибка обработки настройки ${setting.key}:`, error.message);
            }
        }

        console.log(`   ✅ Добавлено: ${addedCount} настроек`);
        console.log(`   🔄 Обновлено: ${updatedCount} настроек`);
        console.log(`   📋 Всего настроек: ${recommendedSettings.length}`);

    } catch (error) {
        console.error('❌ Ошибка инициализации настроек:', error);
        throw error;
    }
}

/**
 * Показать статистику базы данных
 */
async function showDatabaseStats() {
    try {
        console.log('\n📊 СТАТИСТИКА БАЗЫ ДАННЫХ:');
        
        const settingsCount = await Settings.count();
        console.log(`   ⚙️ Настройки: ${settingsCount}`);
        
        const migrationCount = await MigrationStatus.count();
        console.log(`   🔄 Миграции: ${migrationCount}`);
        
        const instrumentsCount = await CachedInstrument.count();
        console.log(`   📈 Инструменты: ${instrumentsCount}`);
        
        const candlesCount = await CachedCandle.count();
        console.log(`   🕯️ Свечи: ${candlesCount}`);
        
        const companiesCount = await Company.count();
        console.log(`   🏢 Компании: ${companiesCount}`);
        
        const portfolioCount = await PortfolioItem.count();
        console.log(`   💼 Портфель: ${portfolioCount}`);
        
        const recommendationsCount = await Recommendation.count();
        console.log(`   🎯 Рекомендации: ${recommendationsCount}`);

        // Группировка настроек по категориям
        const settings = await Settings.findAll({
            attributes: ['category'],
            group: ['category']
        });
        
        console.log('\n📂 Настройки по категориям:');
        for (const setting of settings) {
            const count = await Settings.count({ where: { category: setting.category } });
            console.log(`   ${setting.category}: ${count} настроек`);
        }

    } catch (error) {
        console.error('❌ Ошибка получения статистики:', error);
    }
}

initDatabase();