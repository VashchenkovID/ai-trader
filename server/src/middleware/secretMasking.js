import SecretManagementService from '../services/SecretManagementService.js';

/**
 * Middleware для маскирования секретов в ответах API
 * Автоматически маскирует секреты перед отправкой ответа клиенту
 */
export const maskSecretsInResponse = async (req, res, next) => {
    // Сохраняем оригинальный метод res.json
    const originalJson = res.json.bind(res);
    
    // Переопределяем res.json для маскирования секретов
    res.json = function(data) {
        try {
            // Маскируем секреты в данных ответа
            if (SecretManagementService.isInitialized) {
                const sanitized = SecretManagementService.sanitizeApiResponse(data);
                return originalJson(sanitized);
            }
            return originalJson(data);
        } catch (error) {
            // Если произошла ошибка при маскировании, отправляем оригинальные данные
            console.warn('⚠️ Ошибка при маскировании секретов в ответе:', error.message);
            return originalJson(data);
        }
    };
    
    next();
};

/**
 * Middleware для маскирования секретов в теле запроса при логировании
 * Не изменяет запрос, только маскирует при логировании
 */
export const maskSecretsInRequest = (req, res, next) => {
    // Сохраняем оригинальные данные запроса для внутреннего использования
    req._originalBody = req.body;
    req._originalQuery = req.query;
    req._originalParams = req.params;
    
    // Создаем замаскированные версии для логирования
    if (SecretManagementService.isInitialized) {
        req._maskedBody = SecretManagementService.maskSecretsInObject(req.body || {});
        req._maskedQuery = SecretManagementService.maskSecretsInObject(req.query || {});
        req._maskedParams = SecretManagementService.maskSecretsInObject(req.params || {});
    } else {
        req._maskedBody = req.body;
        req._maskedQuery = req.query;
        req._maskedParams = req.params;
    }
    
    next();
};

/**
 * Middleware для проверки наличия секретов в запросе
 * Логирует предупреждение, если обнаружены секреты
 */
export const checkSecretsInRequest = (req, res, next) => {
    if (!SecretManagementService.isInitialized) {
        return next();
    }
    
    // Проверяем тело запроса
    if (req.body && typeof req.body === 'object') {
        const bodyStr = JSON.stringify(req.body);
        if (SecretManagementService.containsSecrets(bodyStr)) {
            console.warn('⚠️ Обнаружены секреты в теле запроса:', req.path);
        }
    }
    
    // Проверяем query параметры
    if (req.query && typeof req.query === 'object') {
        const queryStr = JSON.stringify(req.query);
        if (SecretManagementService.containsSecrets(queryStr)) {
            console.warn('⚠️ Обнаружены секреты в query параметрах:', req.path);
        }
    }
    
    // Проверяем заголовки (особенно Authorization)
    if (req.headers.authorization) {
        const authHeader = req.headers.authorization;
        if (SecretManagementService.containsSecrets(authHeader)) {
            // Автоматически маскируем заголовок Authorization при логировании
            req.headers.authorization = SecretManagementService.maskSecret(authHeader);
        }
    }
    
    next();
};

export default {
    maskSecretsInResponse,
    maskSecretsInRequest,
    checkSecretsInRequest
};

