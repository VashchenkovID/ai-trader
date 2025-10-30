import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const Settings = sequelize.define('Settings', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    key: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: 'Ключ настройки'
    },
    value: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: 'Значение настройки (JSON строка)'
    },
    description: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'Описание настройки'
    },
    category: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'general',
        comment: 'Категория настройки'
    },
    isEditable: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Можно ли редактировать через UI'
    },
    dataType: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'string',
        comment: 'Тип данных настройки',
        validate: {
            isIn: {
                args: [['string', 'number', 'boolean', 'json', 'array']],
                msg: 'dataType must be one of: string, number, boolean, json, array'
            }
        }
    },
    minValue: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: 'Минимальное значение (для числовых настроек)'
    },
    maxValue: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: 'Максимальное значение (для числовых настроек)'
    },
    options: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Доступные опции (JSON строка для select)'
    },
    lastUpdated: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: 'Время последнего обновления'
    }
}, {
    tableName: 'settings',
    timestamps: false,
    indexes: [
        {
            unique: true,
            fields: ['key']
        },
        {
            fields: ['category']
        }
    ]
});

// Статические методы для работы с настройками
Settings.getSetting = async function(key, defaultValue = null) {
    try {
        // Импортируем менеджер соединений
        const DatabaseConnectionManager = (await import('../utils/DatabaseConnectionManager.js')).default;
        
        // Используем безопасный запрос
        const setting = await DatabaseConnectionManager.safeQuery(
            this.findOne.bind(this),
            { where: { key } }
        );
        
        if (!setting) return defaultValue;
        
        // Парсим значение в зависимости от типа
        switch (setting.dataType) {
            case 'number':
                return parseFloat(setting.value) || defaultValue;
            case 'boolean':
                return setting.value === 'true';
            case 'json':
            case 'array':
                try {
                    return JSON.parse(setting.value);
                } catch {
                    return defaultValue;
                }
            default:
                return setting.value || defaultValue;
        }
    } catch (error) {
        console.error(`Error getting setting ${key}:`, error);
        return defaultValue;
    }
};

Settings.setSetting = async function(key, value, options = {}) {
    try {
        // Импортируем менеджер соединений
        const DatabaseConnectionManager = (await import('../utils/DatabaseConnectionManager.js')).default;
        
        const { description, category = 'general', dataType = 'string', isEditable = true, minValue, maxValue, options: selectOptions } = options;
        
        // Определяем тип данных автоматически, если не указан
        let detectedType = dataType;
        if (dataType === 'string') {
            if (typeof value === 'number') detectedType = 'number';
            else if (typeof value === 'boolean') detectedType = 'boolean';
            else if (Array.isArray(value) || (typeof value === 'object' && value !== null)) detectedType = 'json';
        }
        
        // Преобразуем значение в строку для хранения
        let stringValue;
        switch (detectedType) {
            case 'number':
            case 'boolean':
                stringValue = String(value);
                break;
            case 'json':
            case 'array':
                stringValue = JSON.stringify(value);
                break;
            default:
                stringValue = String(value);
        }
        
        const [setting, created] = await DatabaseConnectionManager.safeQuery(
            this.upsert.bind(this),
            {
                key,
                value: stringValue,
                description,
                category,
                dataType: detectedType,
                isEditable,
                minValue,
                maxValue,
                options: selectOptions ? JSON.stringify(selectOptions) : null,
                lastUpdated: new Date()
            }
        );
        
        return setting;
    } catch (error) {
        console.error(`Error setting ${key}:`, error);
        throw error;
    }
};

Settings.getAllSettings = async function(category = null) {
    try {
        const where = category ? { category } : {};
        const settings = await this.findAll({ where, order: [['category', 'ASC'], ['key', 'ASC']] });
        
        // Преобразуем настройки в удобный формат
        return settings.map(setting => {
            let parsedValue = setting.value;
            try {
                if (setting.dataType === 'json' || setting.dataType === 'array') {
                    parsedValue = JSON.parse(setting.value);
                } else if (setting.dataType === 'number') {
                    parsedValue = parseFloat(setting.value);
                } else if (setting.dataType === 'boolean') {
                    parsedValue = setting.value === 'true';
                }
            } catch {
                // Оставляем исходное значение если не удалось распарсить
            }
            
            return {
                key: setting.key,
                value: parsedValue,
                description: setting.description,
                category: setting.category,
                dataType: setting.dataType,
                isEditable: setting.isEditable,
                minValue: setting.minValue,
                maxValue: setting.maxValue,
                options: setting.options ? JSON.parse(setting.options) : null,
                lastUpdated: setting.lastUpdated
            };
        });
    } catch (error) {
        console.error('Error getting all settings:', error);
        return [];
    }
};

Settings.initializeDefaults = async function() {
    const defaultSettings = [
        // Бюджет и портфель
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
        
        // Интервалы обновления
        {
            key: 'cache_update_interval',
            value: '0 */4 * * *',
            description: 'Интервал обновления кеша данных (cron)',
            category: 'scheduler',
            dataType: 'string',
            options: [
                { value: '0 */1 * * *', label: 'Каждый час' },
                { value: '0 */3 * * *', label: 'Каждые 3 часа' },
                { value: '0 */6 * * *', label: 'Каждые 6 часов' },
                { value: '0 */12 * * *', label: 'Каждые 12 часов' },
                { value: '0 0 * * *', label: 'Раз в день' },
                { value: '0 0 */2 * *', label: 'Раз в 2 дня' }
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
        
        // Параметры нейросети
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
        
        // Рекомендуемые настройки обучения
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
            key: 'nn_training_strategy',
            value: 'progressive',
            description: 'Стратегия обучения нейросети',
            category: 'neural_network',
            dataType: 'string',
            options: [
                { value: 'progressive', label: 'Прогрессивное обучение' },
                { value: 'ensemble', label: 'Ансамблевое обучение' },
                { value: 'adaptive', label: 'Адаптивное обучение' },
                { value: 'transfer', label: 'Transfer Learning' },
                { value: 'reinforcement', label: 'Reinforcement Learning' }
            ]
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
        
        // Уведомления
        {
            key: 'telegram_notifications_enabled',
            value: true,
            description: 'Включить уведомления в Telegram',
            category: 'notifications',
            dataType: 'boolean'
        },
        {
            key: 'email_notifications_enabled',
            value: false,
            description: 'Включить уведомления по email',
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
        
        // Настройки торговых часов
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
        }
    ];
    
    for (const setting of defaultSettings) {
        try {
            await this.setSetting(setting.key, setting.value, setting);
        } catch (error) {
            console.error(`Error initializing setting ${setting.key}:`, error);
        }
    }
    
    console.log('✅ Default settings initialized');
};

export default Settings;
