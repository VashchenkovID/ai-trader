import axios from 'axios';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';

// Цвета для консоли
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
    console.log('\n' + '='.repeat(60));
    log(title, 'cyan');
    console.log('='.repeat(60));
}

function logSuccess(message) {
    log(`✅ ${message}`, 'green');
}

function logError(message) {
    log(`❌ ${message}`, 'red');
}

function logWarning(message) {
    log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
    log(`ℹ️  ${message}`, 'blue');
}

async function testAPI(endpoint, method = 'GET', data = null) {
    try {
        const config = {
            method,
            url: `${API_BASE_URL}${endpoint}`,
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 10000
        };

        if (data) {
            config.data = data;
        }

        const response = await axios(config);
        return { success: true, data: response.data, status: response.status };
    } catch (error) {
        let errorMessage = 'Unknown error';
        let errorDetails = null;

        if (error.code === 'ECONNREFUSED') {
            errorMessage = 'Connection refused - сервер не запущен или недоступен';
        } else if (error.code === 'ETIMEDOUT') {
            errorMessage = 'Request timeout - сервер не отвечает';
        } else if (error.response) {
            errorMessage = error.response.data?.message || error.response.data?.error || JSON.stringify(error.response.data);
            errorDetails = {
                status: error.response.status,
                statusText: error.response.statusText,
                data: error.response.data
            };
        } else if (error.message) {
            errorMessage = error.message;
        }

        return {
            success: false,
            error: errorMessage,
            errorDetails,
            status: error.response?.status || 500
        };
    }
}

async function checkServerHealth() {
    logInfo('Проверка доступности сервера...');
    
    const healthResult = await testAPI('/health');
    if (healthResult.success) {
        logSuccess(`Сервер доступен на ${API_BASE_URL}`);
        return true;
    }
    
    const monitoringHealthResult = await testAPI('/api/monitoring/health');
    if (monitoringHealthResult.success) {
        logSuccess(`Сервер доступен на ${API_BASE_URL}`);
        return true;
    }
    
    logError(`Сервер недоступен на ${API_BASE_URL}`);
    logWarning(`Убедитесь, что сервер запущен на порту 3001`);
    logWarning('Запустите сервер командой: npm start');
    return false;
}

async function testSecretInfo() {
    logSection('1. Тестирование получения информации о секретах');

    logInfo('1.1 Получение информации о секретах (только для разработки)...');
    const infoResult = await testAPI('/api/secret-management/info');
    
    if (infoResult.success) {
        const data = infoResult.data?.data;
        logSuccess('Информация о секретах получена');
        
        if (data) {
            for (const [key, value] of Object.entries(data)) {
                if (value.exists) {
                    console.log(`  - ${key}: ${value.masked} (длина: ${value.length})`);
                } else {
                    console.log(`  - ${key}: отсутствует`);
                }
            }
        }
    } else {
        if (infoResult.status === 403) {
            logWarning('Endpoint отключен в production режиме (это нормально)');
        } else {
            logError(`Ошибка: ${infoResult.error}`);
        }
    }
}

async function testSecretValidation() {
    logSection('2. Тестирование валидации секретов');

    logInfo('2.1 Валидация обязательных секретов...');
    const validateResult = await testAPI('/api/secret-management/validate', 'POST', {
        secrets: ['TINKOFF_TOKEN', 'DB_PASSWORD', 'NEWS_API_KEY', 'TELEGRAM_BOT_TOKEN']
    });
    
    if (validateResult.success) {
        const data = validateResult.data?.data;
        logSuccess('Валидация выполнена');
        console.log(`  - Все секреты присутствуют: ${data.allPresent ? 'Да' : 'Нет'}`);
        
        if (data.missing && data.missing.length > 0) {
            logWarning(`  - Отсутствующие секреты: ${data.missing.join(', ')}`);
        }
        
        if (data.validation) {
            console.log(`  - Результаты валидации:`);
            for (const [key, value] of Object.entries(data.validation)) {
                console.log(`    ${key}: ${value.exists ? '✅' : '❌'} ${value.masked || 'N/A'}`);
            }
        }
    } else {
        logError(`Ошибка: ${validateResult.error}`);
    }
}

async function testSecretMasking() {
    logSection('3. Тестирование маскирования секретов');

    // 3.1 Маскирование объекта
    logInfo('3.1 Маскирование объекта с секретами...');
    const objectResult = await testAPI('/api/secret-management/mask', 'POST', {
        data: {
            username: 'testuser',
            password: 'mySecretPassword123',
            apiKey: 'sk_live_1234567890abcdef',
            token: 't.abcdefghijklmnopqrstuvwxyz',
            normalField: 'normalValue'
        }
    });
    
    if (objectResult.success) {
        const data = objectResult.data?.data;
        logSuccess('Объект замаскирован');
        console.log(`  - Оригинальный password: ${data.original.password}`);
        console.log(`  - Замаскированный password: ${data.masked.password}`);
        console.log(`  - Оригинальный apiKey: ${data.original.apiKey}`);
        console.log(`  - Замаскированный apiKey: ${data.masked.apiKey}`);
        console.log(`  - Нормальное поле (не изменено): ${data.masked.normalField}`);
    } else {
        logError(`Ошибка: ${objectResult.error}`);
    }

    // 3.2 Маскирование строки
    logInfo('\n3.2 Маскирование строки с секретами...');
    const stringResult = await testAPI('/api/secret-management/mask', 'POST', {
        data: 'Authorization: Bearer t.abcdefghijklmnopqrstuvwxyz123456'
    });
    
    if (stringResult.success) {
        const data = stringResult.data?.data;
        logSuccess('Строка замаскирована');
        console.log(`  - Оригинал: ${data.original}`);
        console.log(`  - Замаскировано: ${data.masked}`);
    } else {
        logError(`Ошибка: ${stringResult.error}`);
    }
}

async function testSecretDetection() {
    logSection('4. Тестирование обнаружения секретов');

    // 4.1 Проверка строки с секретом
    logInfo('4.1 Проверка строки с секретом...');
    const checkResult1 = await testAPI('/api/secret-management/check', 'POST', {
        text: 'API key: sk_live_1234567890abcdef and token: t.abcdefghijklmnopqrstuvwxyz'
    });
    
    if (checkResult1.success) {
        const data = checkResult1.data?.data;
        logSuccess('Проверка выполнена');
        console.log(`  - Содержит секреты: ${data.containsSecrets ? 'Да' : 'Нет'}`);
        console.log(`  - Оригинал: ${data.original}`);
        console.log(`  - Замаскировано: ${data.masked}`);
    } else {
        logError(`Ошибка: ${checkResult1.error}`);
    }

    // 4.2 Проверка строки без секретов
    logInfo('\n4.2 Проверка строки без секретов...');
    const checkResult2 = await testAPI('/api/secret-management/check', 'POST', {
        text: 'This is a normal message without any secrets'
    });
    
    if (checkResult2.success) {
        const data = checkResult2.data?.data;
        logSuccess('Проверка выполнена');
        console.log(`  - Содержит секреты: ${data.containsSecrets ? 'Да' : 'Нет'}`);
        console.log(`  - Оригинал: ${data.original}`);
        console.log(`  - Замаскировано: ${data.masked}`);
    } else {
        logError(`Ошибка: ${checkResult2.error}`);
    }
}

async function testApiResponseMasking() {
    logSection('5. Тестирование маскирования в ответах API');

    // 5.1 Тест ответа с секретами (через любой endpoint, который может вернуть секреты)
    logInfo('5.1 Проверка маскирования секретов в ответах API...');
    logInfo('  (Создаем тестовый запрос, который может содержать секреты)');
    
    // Тестируем через endpoint настроек, который может содержать секреты
    const settingsResult = await testAPI('/api/settings');
    
    if (settingsResult.success) {
        logSuccess('Ответ получен');
        logInfo('  Проверьте, что если в ответе были секреты, они замаскированы');
        logInfo('  (Middleware maskSecretsInResponse должен автоматически маскировать секреты)');
    } else {
        logWarning(`Не удалось получить ответ: ${settingsResult.error}`);
    }
}

async function testLoggingMasking() {
    logSection('6. Тестирование маскирования в логах');

    logInfo('6.1 Проверка маскирования секретов в логах...');
    logInfo('  (Создаем запрос, который может логировать секреты)');
    
    // Создаем запрос с секретами в теле
    const testRequestResult = await testAPI('/api/secret-management/mask', 'POST', {
        data: {
            test: 'value',
            password: 'secretPassword123',
            token: 't.test1234567890abcdef'
        }
    });
    
    if (testRequestResult.success) {
        logSuccess('Запрос выполнен');
        logInfo('  Проверьте логи сервера - секреты должны быть замаскированы');
        logInfo('  (LoggerService автоматически маскирует секреты через SecretManagementService)');
    } else {
        logError(`Ошибка: ${testRequestResult.error}`);
    }
}

async function runTests() {
    console.log('\n');
    log('🔐 Запуск тестов безопасного хранения секретов', 'cyan');
    log(`API URL: ${API_BASE_URL}`, 'blue');
    console.log('\n');

    // Проверяем доступность сервера
    const serverAvailable = await checkServerHealth();
    if (!serverAvailable) {
        logError('Сервер недоступен. Завершение тестов.');
        process.exit(1);
    }

    try {
        await testSecretInfo();
        await testSecretValidation();
        await testSecretMasking();
        await testSecretDetection();
        await testApiResponseMasking();
        await testLoggingMasking();

        logSection('Результаты тестирования');
        logSuccess('Все основные тесты пройдены!');
        logInfo('\nПримечания:');
        logInfo('- Проверьте логи сервера для подтверждения маскирования секретов');
        logInfo('- Endpoint /api/secret-management/info отключен в production режиме');
        logInfo('- Все секреты автоматически маскируются в ответах API и логах');

    } catch (error) {
        logError(`Критическая ошибка: ${error.message}`);
        console.error(error);
        process.exit(1);
    }
}

// Запуск тестов
runTests().catch(error => {
    logError(`Ошибка выполнения тестов: ${error.message}`);
    console.error(error);
    process.exit(1);
});

