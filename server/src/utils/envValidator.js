/**
 * Утилита для валидации переменных окружения
 */

/**
 * Получение JWT_SECRET с проверкой
 * @throws {Error} Если JWT_SECRET не установлен или имеет небезопасное значение
 */
export function getJWTSecret() {
    const secret = process.env.JWT_SECRET;
    const unsafeDefaults = [
        'your-secret-key-change-in-production',
        'your_jwt_secret_here',
        'secret',
        'test',
        ''
    ];
    
    if (!secret || unsafeDefaults.includes(secret)) {
        throw new Error(
            'JWT_SECRET must be set in environment variables and must not be a default value. ' +
            'Please set a strong, random secret key (minimum 32 characters) in your .env file.'
        );
    }
    
    if (secret.length < 32) {
        console.warn('⚠️ JWT_SECRET is shorter than 32 characters. Consider using a longer secret for better security.');
    }
    
    return secret;
}

/**
 * Проверка обязательных переменных окружения
 * @param {string[]} requiredVars - Массив обязательных переменных
 * @throws {Error} Если какая-либо переменная отсутствует
 */
export function validateRequiredEnvVars(requiredVars = []) {
    const missing = [];
    const warnings = [];
    
    // Базовый список обязательных переменных
    const defaultRequired = [
        'JWT_SECRET',
        'DB_NAME',
        'DB_USER',
        'DB_HOST'
    ];
    
    const allRequired = [...new Set([...defaultRequired, ...requiredVars])];
    
    for (const key of allRequired) {
        const value = process.env[key];
        
        if (!value || value.trim() === '') {
            missing.push(key);
        } else {
            // Дополнительные проверки для критических переменных
            if (key === 'JWT_SECRET') {
                const unsafeDefaults = [
                    'your-secret-key-change-in-production',
                    'your_jwt_secret_here',
                    'secret',
                    'test'
                ];
                if (unsafeDefaults.includes(value)) {
                    missing.push(key);
                } else if (value.length < 32) {
                    warnings.push(`${key} is shorter than recommended 32 characters`);
                }
            }
        }
    }
    
    if (missing.length > 0) {
        throw new Error(
            `Missing or invalid required environment variables: ${missing.join(', ')}\n` +
            `Please check your .env file or environment configuration.`
        );
    }
    
    if (warnings.length > 0) {
        console.warn('⚠️ Environment variable warnings:');
        warnings.forEach(warning => console.warn(`  - ${warning}`));
    }
    
    return true;
}

/**
 * Проверка переменных окружения для продакшена
 */
export function validateProductionEnv() {
    if (process.env.NODE_ENV === 'production') {
        const productionRequired = [
            'JWT_SECRET',
            'DB_PASSWORD',
            'DB_NAME',
            'DB_USER',
            'DB_HOST'
        ];
        
        validateRequiredEnvVars(productionRequired);
        
        // Дополнительные проверки для продакшена
        if (!process.env.FRONTEND_URL) {
            console.warn('⚠️ FRONTEND_URL is not set. CORS may not work correctly in production.');
        }
        
        if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
            throw new Error('JWT_SECRET must be at least 32 characters long in production');
        }
    }
}

