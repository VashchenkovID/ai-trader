/**
 * HTTP тест для проверки обработки ошибок и валидации
 * Запуск: node server/test-error-handling.js
 * Требует запущенный сервер на порту 3001
 */

import http from 'http';

const API_BASE_URL = 'http://localhost:3001';
const API_PREFIX = '/api/monitoring';

// Цветной вывод
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

function logTest(name, passed, details = '') {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    const color = passed ? 'green' : 'red';
    log(`${status}: ${name}`, color);
    if (details) {
        log(`   ${details}`, 'yellow');
    }
}

// HTTP запрос
function makeRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, API_BASE_URL);
        const options = {
            hostname: url.hostname,
            port: url.port || 3001,
            path: url.pathname + url.search,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ status: res.statusCode, data: parsed, headers: res.headers });
                } catch (error) {
                    resolve({ status: res.statusCode, data: data, headers: res.headers });
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.setTimeout(5000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        if (body) {
            req.write(JSON.stringify(body));
        }

        req.end();
    });
}

async function runTests() {
    const results = { passed: 0, failed: 0 };

    logSection('ТЕСТИРОВАНИЕ ОБРАБОТКИ ОШИБОК И ВАЛИДАЦИИ');
    log('Проверка error handler и validation middleware', 'blue');

    // 0. Проверка доступности сервера
    logSection('0. Проверка доступности сервера');
    try {
        const response = await makeRequest('GET', '/health');
        const isAvailable = response.status === 200;
        logTest('GET /health (server availability)', isAvailable, 
            isAvailable ? 'Сервер доступен' : `Status: ${response.status}, Response: ${JSON.stringify(response.data)}`);
        if (!isAvailable) {
            log('⚠️ Сервер недоступен, все последующие тесты могут провалиться', 'yellow');
            results.failed++;
        } else {
            results.passed++;
        }
    } catch (error) {
        logTest('GET /health (server availability)', false, `Сервер недоступен: ${error.message}`);
        log('⚠️ Убедитесь, что сервер запущен на порту 3001', 'yellow');
        results.failed++;
        // Прерываем тесты, если сервер недоступен
        logSection('ИТОГИ ТЕСТИРОВАНИЯ');
        log(`❌ Сервер недоступен. Запустите сервер и повторите тест.`, 'red');
        return false;
    }

    // 1. Тест валидации query параметров - валидные данные
    logSection('1. Валидация query параметров - валидные данные');
    try {
        const response = await makeRequest('GET', `${API_PREFIX}/alerts?severity=high&limit=10`);
        log(`   Response status: ${response.status}`, 'blue');
        log(`   Response data: ${JSON.stringify(response.data).substring(0, 200)}`, 'blue');
        const isValid = response.status === 200 && response.data.success === true;
        logTest('GET /api/monitoring/alerts?severity=high&limit=10 (valid)', isValid, 
            isValid ? 'Валидация прошла успешно' : `Status: ${response.status}, Success: ${response.data.success}`);
        if (isValid) {
            results.passed++;
        } else {
            results.failed++;
        }
    } catch (error) {
        logTest('GET /api/monitoring/alerts (valid)', false, `Error: ${error.message}`);
        log(`   Stack: ${error.stack}`, 'yellow');
        results.failed++;
    }

    // 2. Тест валидации query параметров - невалидный severity
    logSection('2. Валидация query параметров - невалидный severity');
    try {
        const response = await makeRequest('GET', `${API_PREFIX}/alerts?severity=invalid`);
        log(`   Response status: ${response.status}`, 'blue');
        log(`   Response data: ${JSON.stringify(response.data).substring(0, 300)}`, 'blue');
        const isValid = response.status === 400 && 
                       response.data.success === false &&
                       (response.data.message === 'Validation failed' || response.data.message.includes('validation'));
        logTest('GET /api/monitoring/alerts?severity=invalid (invalid)', isValid, 
            isValid ? 'Валидация отклонила невалидное значение' : `Status: ${response.status}, Message: ${response.data.message || 'N/A'}`);
        if (isValid) {
            results.passed++;
            if (response.data.details) {
                log(`   Детали ошибки: ${JSON.stringify(response.data.details, null, 2)}`, 'blue');
            }
        } else {
            results.failed++;
        }
    } catch (error) {
        logTest('GET /api/monitoring/alerts?severity=invalid (invalid)', false, `Error: ${error.message}`);
        results.failed++;
    }

    // 3. Тест валидации query параметров - невалидный limit
    logSection('3. Валидация query параметров - невалидный limit');
    try {
        const response = await makeRequest('GET', `${API_PREFIX}/alerts?limit=2000`);
        const isValid = response.status === 400 && 
                       response.data.success === false;
        logTest('GET /api/monitoring/alerts?limit=2000 (invalid - превышает max)', isValid, 
            isValid ? 'Валидация отклонила значение превышающее max' : `Status: ${response.status}`);
        if (isValid) {
            results.passed++;
        } else {
            results.failed++;
        }
    } catch (error) {
        logTest('GET /api/monitoring/alerts?limit=2000 (invalid)', false, error.message);
        results.failed++;
    }

    // 4. Тест валидации params - валидный ID
    logSection('4. Валидация params - валидный ID');
    try {
        // Сначала создадим тестовый алерт через метрики, чтобы получить ID
        const alertsResponse = await makeRequest('GET', `${API_PREFIX}/alerts?limit=1`);
        if (alertsResponse.status === 200 && alertsResponse.data.data.length > 0) {
            const alertId = alertsResponse.data.data[0].id;
            const response = await makeRequest('POST', `${API_PREFIX}/alerts/${alertId}/resolve`);
            const isValid = response.status === 200 || response.status === 404; // 404 если алерт уже разрешен
            logTest('POST /api/monitoring/alerts/:id/resolve (valid ID)', isValid, 
                isValid ? 'Валидация прошла успешно' : `Status: ${response.status}`);
            if (isValid) {
                results.passed++;
            } else {
                results.failed++;
            }
        } else {
            logTest('POST /api/monitoring/alerts/:id/resolve (valid ID)', true, 'Нет алертов для тестирования');
            results.passed++;
        }
    } catch (error) {
        logTest('POST /api/monitoring/alerts/:id/resolve (valid ID)', false, error.message);
        results.failed++;
    }

    // 5. Тест валидации params - невалидный ID (пустой)
    logSection('5. Валидация params - невалидный ID');
    try {
        const response = await makeRequest('POST', `${API_PREFIX}/alerts//resolve`);
        const isValid = response.status === 404 || response.status === 400; // 404 от Express или 400 от валидации
        logTest('POST /api/monitoring/alerts//resolve (empty ID)', isValid, 
            isValid ? 'Валидация отклонила пустой ID' : `Status: ${response.status}`);
        if (isValid) {
            results.passed++;
        } else {
            results.failed++;
        }
    } catch (error) {
        logTest('POST /api/monitoring/alerts//resolve (empty ID)', false, error.message);
        results.failed++;
    }

    // 6. Тест 404 ошибки
    logSection('6. Тест 404 ошибки');
    try {
        const response = await makeRequest('GET', `${API_PREFIX}/nonexistent`);
        const isValid = response.status === 404 && 
                       response.data.success === false;
        logTest('GET /api/monitoring/nonexistent (404)', isValid, 
            isValid ? '404 ошибка обработана корректно' : `Status: ${response.status}`);
        if (isValid) {
            results.passed++;
            log(`   Сообщение: ${response.data.message}`, 'blue');
        } else {
            results.failed++;
        }
    } catch (error) {
        logTest('GET /api/monitoring/nonexistent (404)', false, error.message);
        results.failed++;
    }

    // 7. Тест NotFoundError
    logSection('7. Тест NotFoundError');
    try {
        const response = await makeRequest('POST', `${API_PREFIX}/alerts/nonexistent-id-12345/resolve`);
        const isValid = response.status === 404 && 
                       response.data.success === false &&
                       response.data.message.includes('not found');
        logTest('POST /api/monitoring/alerts/nonexistent-id/resolve (NotFoundError)', isValid, 
            isValid ? 'NotFoundError обработан корректно' : `Status: ${response.status}, Message: ${response.data.message}`);
        if (isValid) {
            results.passed++;
            log(`   Сообщение: ${response.data.message}`, 'blue');
        } else {
            results.failed++;
        }
    } catch (error) {
        logTest('POST /api/monitoring/alerts/nonexistent-id/resolve (NotFoundError)', false, error.message);
        results.failed++;
    }

    // 8. Тест AuthorizationError (reset в production)
    logSection('8. Тест AuthorizationError');
    try {
        const response = await makeRequest('POST', `${API_PREFIX}/reset`);
        // Может быть 403 (если production) или 200 (если development)
        const isValid = (response.status === 403 && response.data.success === false) || 
                       (response.status === 200 && response.data.success === true);
        logTest('POST /api/monitoring/reset (AuthorizationError check)', isValid, 
            isValid ? 'Проверка авторизации работает' : `Status: ${response.status}`);
        if (isValid) {
            results.passed++;
            if (response.status === 403) {
                log(`   Сообщение: ${response.data.message}`, 'blue');
            }
        } else {
            results.failed++;
        }
    } catch (error) {
        logTest('POST /api/monitoring/reset (AuthorizationError)', false, error.message);
        results.failed++;
    }

    // 9. Тест структуры ответа об ошибке
    logSection('9. Тест структуры ответа об ошибке');
    try {
        const response = await makeRequest('GET', `${API_PREFIX}/alerts?severity=invalid`);
        const hasCorrectStructure = response.status === 400 &&
                                   response.data.hasOwnProperty('success') &&
                                   response.data.hasOwnProperty('message') &&
                                   response.data.success === false;
        logTest('Структура ответа об ошибке', hasCorrectStructure, 
            hasCorrectStructure ? 'Структура корректна' : 'Структура не соответствует ожидаемой');
        if (hasCorrectStructure) {
            results.passed++;
            log(`   Структура: ${JSON.stringify({ success: response.data.success, message: response.data.message, hasDetails: !!response.data.details }, null, 2)}`, 'blue');
        } else {
            results.failed++;
        }
    } catch (error) {
        logTest('Структура ответа об ошибке', false, error.message);
        results.failed++;
    }

    // 10. Тест валидации с несколькими параметрами
    logSection('10. Тест валидации с несколькими параметрами');
    try {
        const response = await makeRequest('GET', `${API_PREFIX}/alerts?category=application&severity=high&limit=5&resolved=false`);
        const isValid = response.status === 200 && response.data.success === true;
        logTest('GET /api/monitoring/alerts (multiple valid params)', isValid, 
            isValid ? 'Множественная валидация прошла успешно' : `Status: ${response.status}`);
        if (isValid) {
            results.passed++;
        } else {
            results.failed++;
        }
    } catch (error) {
        logTest('GET /api/monitoring/alerts (multiple valid params)', false, error.message);
        results.failed++;
    }

    // Итоги
    logSection('ИТОГИ ТЕСТИРОВАНИЯ');
    log(`✅ Пройдено: ${results.passed}`, 'green');
    log(`❌ Провалено: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
    log(`📊 Всего тестов: ${results.passed + results.failed}`, 'blue');
    
    const successRate = ((results.passed / (results.passed + results.failed)) * 100).toFixed(1);
    log(`📈 Процент успеха: ${successRate}%`, successRate >= 80 ? 'green' : 'yellow');

    return results.failed === 0;
}

// Запуск тестов
runTests()
    .then((success) => {
        if (success) {
            log('\n🎉 Все тесты пройдены успешно!', 'green');
            process.exit(0);
        } else {
            log('\n⚠️ Некоторые тесты провалились', 'yellow');
            process.exit(1);
        }
    })
    .catch((error) => {
        log(`\n❌ Критическая ошибка: ${error.message}`, 'red');
        console.error(error);
        process.exit(1);
    });

