import Settings from '../models/Settings.js';

class SettingsService {
    constructor() {
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 минут
        this.lastCacheUpdate = 0;
    }

    // Получить настройку с кешированием
    async getSetting(key, defaultValue = null) {
        try {
            // Проверяем кеш
            if (this.cache.has(key) && Date.now() - this.lastCacheUpdate < this.cacheTimeout) {
                return this.cache.get(key);
            }

            // Загружаем из БД
            const value = await Settings.getSetting(key, defaultValue);
            
            // Обновляем кеш
            this.cache.set(key, value);
            this.lastCacheUpdate = Date.now();
            
            return value;
        } catch (error) {
            console.error(`Error getting setting ${key}:`, error);
            return defaultValue;
        }
    }

    // Установить настройку
    async setSetting(key, value, options = {}) {
        try {
            const setting = await Settings.setSetting(key, value, options);
            
            // Обновляем кеш
            this.cache.set(key, value);
            this.lastCacheUpdate = Date.now();
            
            return setting;
        } catch (error) {
            console.error(`Error setting ${key}:`, error);
            throw error;
        }
    }

    // Получить все настройки
    async getAllSettings(category = null) {
        try {
            return await Settings.getAllSettings(category);
        } catch (error) {
            console.error('Error getting all settings:', error);
            return [];
        }
    }

    // Получить настройки портфеля
    async getPortfolioSettings() {
        const settings = await this.getAllSettings('portfolio');
        const result = {};
        
        for (const setting of settings) {
            result[setting.key] = setting.value;
        }
        
        return result;
    }

    // Получить настройки планировщика
    async getSchedulerSettings() {
        const settings = await this.getAllSettings('scheduler');
        const result = {};
        
        for (const setting of settings) {
            result[setting.key] = setting.value;
        }
        
        return result;
    }

    // Получить настройки нейросети
    async getNeuralNetworkSettings() {
        const settings = await this.getAllSettings('neural_network');
        const result = {};
        
        for (const setting of settings) {
            result[setting.key] = setting.value;
        }
        
        return result;
    }

    // Получить настройки уведомлений
    async getNotificationSettings() {
        const settings = await this.getAllSettings('notifications');
        const result = {};
        
        for (const setting of settings) {
            result[setting.key] = setting.value;
        }
        
        return result;
    }

    // Получить настройки торговых часов
    async getTradingHoursSettings() {
        const settings = await this.getAllSettings('trading_hours');
        const result = {};
        
        for (const setting of settings) {
            result[setting.key] = setting.value;
        }
        
        return result;
    }

    // Очистить кеш
    clearCache() {
        this.cache.clear();
        this.lastCacheUpdate = 0;
    }

    // Получить настройки для фронтенда (только редактируемые)
    async getEditableSettings() {
        try {
            const allSettings = await this.getAllSettings();
            return allSettings.filter(setting => setting.isEditable);
        } catch (error) {
            console.error('Error getting editable settings:', error);
            return [];
        }
    }

    // Валидация значения настройки
    validateSettingValue(setting, value) {
        const { dataType, minValue, maxValue, options } = setting;
        
        // Проверка типа
        switch (dataType) {
            case 'number':
                const numValue = parseFloat(value);
                if (isNaN(numValue)) {
                    return { valid: false, error: 'Значение должно быть числом' };
                }
                if (minValue !== null && numValue < minValue) {
                    return { valid: false, error: `Значение должно быть не менее ${minValue}` };
                }
                if (maxValue !== null && numValue > maxValue) {
                    return { valid: false, error: `Значение должно быть не более ${maxValue}` };
                }
                break;
                
            case 'boolean':
                if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
                    return { valid: false, error: 'Значение должно быть true или false' };
                }
                break;
                
            case 'string':
                if (typeof value !== 'string') {
                    return { valid: false, error: 'Значение должно быть строкой' };
                }
                break;
        }
        
        // Проверка опций (для select)
        if (options && Array.isArray(options)) {
            const validValues = options.map(opt => opt.value);
            if (!validValues.includes(value)) {
                return { valid: false, error: `Значение должно быть одним из: ${validValues.join(', ')}` };
            }
        }
        
        return { valid: true };
    }

    // Применить настройки к сервисам
    async applySettings() {
        try {
            const portfolioSettings = await this.getPortfolioSettings();
            const schedulerSettings = await this.getSchedulerSettings();
            const nnSettings = await this.getNeuralNetworkSettings();
            const notificationSettings = await this.getNotificationSettings();
            
            // Обновляем переменные окружения для совместимости
            if (portfolioSettings.user_max_portfolio_budget) {
                process.env.USER_MAX_PORTFOLIO_BUDGET = portfolioSettings.user_max_portfolio_budget.toString();
            }
            if (portfolioSettings.max_stock_price) {
                process.env.MAX_STOCK_PRICE = portfolioSettings.max_stock_price.toString();
            }
            if (portfolioSettings.min_stock_price) {
                process.env.MIN_STOCK_PRICE = portfolioSettings.min_stock_price.toString();
            }
            if (schedulerSettings.cache_update_interval) {
                process.env.CACHE_UPDATE_SCHEDULE = schedulerSettings.cache_update_interval;
            }
            if (schedulerSettings.analysis_interval) {
                process.env.ANALYSIS_SCHEDULE = schedulerSettings.analysis_interval;
            }
            if (schedulerSettings.nn_training_schedule) {
                process.env.NN_TRAINING_SCHEDULE = schedulerSettings.nn_training_schedule;
            }
            if (nnSettings.nn_training_days) {
                process.env.NN_TRAINING_DAYS = nnSettings.nn_training_days.toString();
            }
            if (nnSettings.nn_training_limit) {
                process.env.NN_TRAINING_LIMIT = nnSettings.nn_training_limit.toString();
            }
            if (nnSettings.nn_model_max_age_days) {
                process.env.NN_MODEL_MAX_AGE_DAYS = nnSettings.nn_model_max_age_days.toString();
            }

            return {
                portfolio: portfolioSettings,
                scheduler: schedulerSettings,
                neuralNetwork: nnSettings,
                notifications: notificationSettings
            };
        } catch (error) {
            console.error('Error applying settings:', error);
            throw error;
        }
    }
}

export default new SettingsService();
