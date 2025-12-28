import LoggerService from './LoggerService.js';

/**
 * Сервис для безопасного управления секретами
 * 
 * Функциональность:
 * - Маскирование секретов в ответах API
 * - Проверка логирования на наличие секретов
 * - Безопасный доступ к секретам
 * - Валидация наличия обязательных секретов
 */
class SecretManagementService {
    constructor() {
        this.isInitialized = false;
        
        // Список секретных полей, которые нужно маскировать
        this.secretFields = [
            'password',
            'token',
            'apiKey',
            'api_key',
            'secret',
            'secretKey',
            'secret_key',
            'authorization',
            'auth',
            'credentials',
            'accessToken',
            'access_token',
            'refreshToken',
            'refresh_token',
            'jwt',
            'jwtSecret',
            'jwt_secret',
            'tinkoff_token',
            'tinkoffToken',
            'telegram_bot_token',
            'telegramBotToken',
            'news_api_key',
            'newsApiKey',
            'db_password',
            'dbPassword',
            'pgpassword',
            'pgPassword'
        ];
        
        // Список переменных окружения, содержащих секреты
        this.secretEnvVars = [
            'TINKOFF_TOKEN',
            'TINKOFF_ACCOUNT_ID',
            'TELEGRAM_BOT_TOKEN',
            'TELEGRAM_CHAT_ID',
            'NEWS_API_KEY',
            'DB_PASSWORD',
            'JWT_SECRET',
            'PGPASSWORD'
        ];
        
        // Паттерны для поиска секретов в строках
        this.secretPatterns = [
            /token["\s:=]+([a-zA-Z0-9\-_\.]{20,})/gi,
            /api[_-]?key["\s:=]+([a-zA-Z0-9\-_\.]{20,})/gi,
            /secret["\s:=]+([a-zA-Z0-9\-_\.]{20,})/gi,
            /password["\s:=]+([^\s"',}]{8,})/gi,
            /authorization["\s:=]+(Bearer\s+[a-zA-Z0-9\-_\.]+)/gi,
            /t\.([a-zA-Z0-9]{20,})/g, // Tinkoff token format
        ];
        
        // Маска для секретов
        this.maskChar = '*';
        this.maskLength = 8; // Количество символов для маскирования
        this.showFirst = 4; // Показать первые N символов
        this.showLast = 4; // Показать последние N символов
    }

    async initialize() {
        try {
            LoggerService.info('🔐 Initializing Secret Management Service...');
            
            // Проверяем наличие обязательных секретов
            await this.validateRequiredSecrets();
            
            this.isInitialized = true;
            LoggerService.info('✅ Secret Management Service initialized');
        } catch (error) {
            LoggerService.error('❌ Failed to initialize Secret Management Service:', error);
            throw error;
        }
    }

    /**
     * Валидация наличия обязательных секретов
     */
    async validateRequiredSecrets() {
        const requiredSecrets = [
            { name: 'TINKOFF_TOKEN', description: 'Токен Тинькофф API' },
            { name: 'DB_PASSWORD', description: 'Пароль базы данных' }
        ];

        const missing = [];
        for (const secret of requiredSecrets) {
            if (!process.env[secret.name] || process.env[secret.name].trim() === '') {
                missing.push(secret);
            }
        }

        if (missing.length > 0) {
            LoggerService.warn('⚠️ Отсутствуют обязательные секреты:');
            missing.forEach(secret => {
                LoggerService.warn(`  - ${secret.name}: ${secret.description}`);
            });
        }
    }

    /**
     * Маскирование секрета
     * @param {string} secret - Секрет для маскирования
     * @param {Object} options - Опции маскирования
     * @returns {string} - Замаскированный секрет
     */
    maskSecret(secret, options = {}) {
        if (!secret || typeof secret !== 'string') {
            return secret;
        }

        const showFirst = options.showFirst !== undefined ? options.showFirst : this.showFirst;
        const showLast = options.showLast !== undefined ? options.showLast : this.showLast;
        const maskLength = options.maskLength !== undefined ? options.maskLength : this.maskLength;

        // Если секрет слишком короткий, маскируем полностью
        if (secret.length <= showFirst + showLast) {
            return this.maskChar.repeat(maskLength);
        }

        const first = secret.substring(0, showFirst);
        const last = secret.substring(secret.length - showLast);
        const masked = this.maskChar.repeat(maskLength);

        return `${first}${masked}${last}`;
    }

    /**
     * Маскирование объекта с секретами
     * @param {Object} obj - Объект для маскирования
     * @param {Array} fieldsToMask - Дополнительные поля для маскирования
     * @returns {Object} - Объект с замаскированными секретами
     */
    maskSecretsInObject(obj, fieldsToMask = []) {
        if (!obj || typeof obj !== 'object') {
            return obj;
        }

        const allFieldsToMask = [...this.secretFields, ...fieldsToMask];
        const masked = Array.isArray(obj) ? [...obj] : { ...obj };

        for (const key in masked) {
            if (masked.hasOwnProperty(key)) {
                const lowerKey = key.toLowerCase();
                
                // Проверяем, нужно ли маскировать это поле
                if (allFieldsToMask.some(field => lowerKey.includes(field.toLowerCase()))) {
                    if (typeof masked[key] === 'string' && masked[key].length > 0) {
                        masked[key] = this.maskSecret(masked[key]);
                    } else if (typeof masked[key] === 'object' && masked[key] !== null) {
                        masked[key] = this.maskSecretsInObject(masked[key], fieldsToMask);
                    }
                } else if (typeof masked[key] === 'object' && masked[key] !== null) {
                    // Рекурсивно обрабатываем вложенные объекты
                    masked[key] = this.maskSecretsInObject(masked[key], fieldsToMask);
                }
            }
        }

        return masked;
    }

    /**
     * Маскирование секретов в строке
     * @param {string} text - Текст для маскирования
     * @returns {string} - Текст с замаскированными секретами
     */
    maskSecretsInString(text) {
        if (!text || typeof text !== 'string') {
            return text;
        }

        let masked = text;

        // Маскируем по паттернам
        for (const pattern of this.secretPatterns) {
            masked = masked.replace(pattern, (match, secret) => {
                const maskedSecret = this.maskSecret(secret);
                return match.replace(secret, maskedSecret);
            });
        }

        // Маскируем переменные окружения
        for (const envVar of this.secretEnvVars) {
            const envValue = process.env[envVar];
            if (envValue && masked.includes(envValue)) {
                masked = masked.replace(new RegExp(envValue, 'g'), this.maskSecret(envValue));
            }
        }

        return masked;
    }

    /**
     * Проверка строки на наличие секретов
     * @param {string} text - Текст для проверки
     * @returns {boolean} - true, если найдены секреты
     */
    containsSecrets(text) {
        if (!text || typeof text !== 'string') {
            return false;
        }

        // Проверяем по паттернам
        for (const pattern of this.secretPatterns) {
            if (pattern.test(text)) {
                return true;
            }
        }

        // Проверяем переменные окружения
        for (const envVar of this.secretEnvVars) {
            const envValue = process.env[envVar];
            if (envValue && text.includes(envValue)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Безопасное логирование (с маскированием секретов)
     * @param {string} level - Уровень логирования (info, warn, error)
     * @param {string} message - Сообщение
     * @param {Object} data - Данные для логирования
     */
    safeLog(level, message, data = {}) {
        const maskedMessage = this.maskSecretsInString(message);
        const maskedData = this.maskSecretsInObject(data);

        switch (level) {
            case 'info':
                LoggerService.info(maskedMessage, maskedData);
                break;
            case 'warn':
                LoggerService.warn(maskedMessage, maskedData);
                break;
            case 'error':
                LoggerService.error(maskedMessage, maskedData);
                break;
            default:
                LoggerService.info(maskedMessage, maskedData);
        }
    }

    /**
     * Получение секрета из переменных окружения (безопасно)
     * @param {string} key - Ключ переменной окружения
     * @param {string} defaultValue - Значение по умолчанию
     * @returns {string} - Значение секрета (не маскированное, для внутреннего использования)
     */
    getSecret(key, defaultValue = null) {
        return process.env[key] || defaultValue;
    }

    /**
     * Проверка наличия секрета
     * @param {string} key - Ключ переменной окружения
     * @returns {boolean} - true, если секрет существует
     */
    hasSecret(key) {
        const value = process.env[key];
        return value !== undefined && value !== null && value.trim() !== '';
    }

    /**
     * Получение информации о секретах (для отладки, с маскированием)
     * @returns {Object} - Информация о секретах
     */
    getSecretsInfo() {
        const info = {};
        
        for (const envVar of this.secretEnvVars) {
            if (this.hasSecret(envVar)) {
                info[envVar] = {
                    exists: true,
                    masked: this.maskSecret(process.env[envVar]),
                    length: process.env[envVar].length
                };
            } else {
                info[envVar] = {
                    exists: false
                };
            }
        }

        return info;
    }

    /**
     * Добавление поля в список секретных полей
     * @param {string} field - Название поля
     */
    addSecretField(field) {
        if (!this.secretFields.includes(field)) {
            this.secretFields.push(field);
        }
    }

    /**
     * Добавление переменной окружения в список секретных
     * @param {string} envVar - Название переменной окружения
     */
    addSecretEnvVar(envVar) {
        if (!this.secretEnvVars.includes(envVar)) {
            this.secretEnvVars.push(envVar);
        }
    }

    /**
     * Валидация ответа API на наличие секретов
     * @param {Object} response - Ответ API
     * @returns {Object} - Ответ с замаскированными секретами
     */
    sanitizeApiResponse(response) {
        if (!response) {
            return response;
        }

        // Если это строка, маскируем секреты в строке
        if (typeof response === 'string') {
            return this.maskSecretsInString(response);
        }

        // Если это объект, маскируем секреты в объекте
        if (typeof response === 'object') {
            return this.maskSecretsInObject(response);
        }

        return response;
    }
}

export default new SecretManagementService();

