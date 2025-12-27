/**
 * HTTP тест для проверки BackupService
 * Запуск: node server/test-backup.js
 * Требует запущенный сервер на порту 3001
 */

import http from 'http';

const API_BASE_URL = 'http://localhost:3001';
const API_PREFIX = '/api/backup';

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

        req.setTimeout(30000, () => {
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
    let createdBackupId = null;

    logSection('ТЕСТИРОВАНИЕ BACKUP SERVICE');
    log('Проверка всех функций резервного копирования', 'blue');

    // 0. Проверка доступности сервера
    logSection('0. Проверка доступности сервера');
    try {
        const response = await makeRequest('GET', '/health');
        const isAvailable = response.status === 200;
        logTest('GET /health (server availability)', isAvailable, 
            isAvailable ? 'Сервер доступен' : `Status: ${response.status}`);
        if (!isAvailable) {
            log('⚠️ Сервер недоступен, все последующие тесты могут провалиться', 'yellow');
            results.failed++;
            return false;
        } else {
            results.passed++;
        }
    } catch (error) {
        logTest('GET /health (server availability)', false, `Сервер недоступен: ${error.message}`);
        log('⚠️ Убедитесь, что сервер запущен на порту 3001', 'yellow');
        results.failed++;
        return false;
    }

    // 1. Получение списка бэкапов (до создания)
    logSection('1. Получение списка бэкапов (до создания)');
    try {
        const response = await makeRequest('GET', `${API_PREFIX}/list`);
        const isValid = response.status === 200 && 
                       response.data.success === true &&
                       Array.isArray(response.data.data);
        logTest('GET /api/backup/list', isValid, 
            isValid ? `Найдено бэкапов: ${response.data.count || 0}` : `Status: ${response.status}`);
        if (isValid) {
            results.passed++;
            log(`   Бэкапов в системе: ${response.data.count || 0}`, 'blue');
        } else {
            results.failed++;
        }
    } catch (error) {
        logTest('GET /api/backup/list', false, `Error: ${error.message}`);
        results.failed++;
    }

    // 2. Создание нового бэкапа
    logSection('2. Создание нового бэкапа');
    log('   Это может занять некоторое время...', 'yellow');
    try {
        const response = await makeRequest('POST', `${API_PREFIX}/create`, {
            type: 'manual',
            description: 'Тестовый бэкап'
        });
        const isValid = response.status === 201 && 
                       response.data.success === true &&
                       response.data.data &&
                       response.data.data.id;
        logTest('POST /api/backup/create', isValid, 
            isValid ? `Бэкап создан: ${response.data.data.id}` : `Status: ${response.status}`);
        if (isValid) {
            results.passed++;
            createdBackupId = response.data.data.id;
            log(`   ID бэкапа: ${createdBackupId}`, 'blue');
            log(`   Тип: ${response.data.data.type}`, 'blue');
            log(`   Компоненты: ${Object.keys(response.data.data.components || {}).join(', ')}`, 'blue');
            
            // Проверяем наличие компонентов
            if (response.data.data.components) {
                const components = response.data.data.components;
                if (components.database) {
                    if (components.database.error) {
                        log(`   ⚠️ БД: ${components.database.error}`, 'yellow');
                    } else {
                        log(`   ✅ БД: ${components.database.size || 0} bytes`, 'green');
                    }
                }
                if (components.settings) {
                    log(`   ✅ Настройки: ${components.settings.count || 0} записей`, 'green');
                }
                if (components.models) {
                    log(`   ✅ Модели: ${components.models.filesCount || 0} файлов`, 'green');
                }
            }
        } else {
            results.failed++;
            log(`   Response: ${JSON.stringify(response.data).substring(0, 200)}`, 'yellow');
        }
    } catch (error) {
        logTest('POST /api/backup/create', false, `Error: ${error.message}`);
        results.failed++;
    }

    // 3. Получение информации о созданном бэкапе
    if (createdBackupId) {
        logSection('3. Получение информации о бэкапе');
        try {
            const response = await makeRequest('GET', `${API_PREFIX}/${createdBackupId}/info`);
            const isValid = response.status === 200 && 
                           response.data.success === true &&
                           response.data.data;
            logTest('GET /api/backup/:id/info', isValid, 
                isValid ? 'Информация получена' : `Status: ${response.status}`);
            if (isValid) {
                results.passed++;
                const info = response.data.data;
                log(`   ID: ${info.id}`, 'blue');
                log(`   Тип: ${info.type || 'N/A'}`, 'blue');
                log(`   Время: ${info.timestamp || 'N/A'}`, 'blue');
                if (info.size) {
                    log(`   Размер: ${(info.size / 1024 / 1024).toFixed(2)} MB`, 'blue');
                }
            } else {
                results.failed++;
            }
        } catch (error) {
            logTest('GET /api/backup/:id/info', false, `Error: ${error.message}`);
            results.failed++;
        }
    } else {
        logSection('3. Получение информации о бэкапе');
        logTest('GET /api/backup/:id/info', false, 'Пропущен: бэкап не был создан');
        results.failed++;
    }

    // 4. Получение списка бэкапов (после создания)
    logSection('4. Получение списка бэкапов (после создания)');
    try {
        const response = await makeRequest('GET', `${API_PREFIX}/list`);
        const isValid = response.status === 200 && 
                       response.data.success === true &&
                       Array.isArray(response.data.data) &&
                       response.data.count > 0;
        logTest('GET /api/backup/list (after creation)', isValid, 
            isValid ? `Найдено бэкапов: ${response.data.count}` : `Status: ${response.status}`);
        if (isValid) {
            results.passed++;
            if (response.data.data.length > 0) {
                log(`   Последний бэкап: ${response.data.data[0].id}`, 'blue');
            }
        } else {
            results.failed++;
        }
    } catch (error) {
        logTest('GET /api/backup/list (after creation)', false, `Error: ${error.message}`);
        results.failed++;
    }

    // 5. Валидация создания бэкапа
    logSection('5. Валидация создания бэкапа');
    try {
        const response = await makeRequest('POST', `${API_PREFIX}/create`, {
            type: 'invalid_type'
        });
        const isValid = response.status === 400 && 
                       response.data.success === false;
        logTest('POST /api/backup/create (invalid type)', isValid, 
            isValid ? 'Валидация отклонила невалидный тип' : `Status: ${response.status}`);
        if (isValid) {
            results.passed++;
        } else {
            results.failed++;
        }
    } catch (error) {
        logTest('POST /api/backup/create (invalid type)', false, `Error: ${error.message}`);
        results.failed++;
    }

    // 6. Получение информации о несуществующем бэкапе
    logSection('6. Получение информации о несуществующем бэкапе');
    try {
        const response = await makeRequest('GET', `${API_PREFIX}/nonexistent-backup-id/info`);
        const isValid = response.status === 404 && 
                       response.data.success === false;
        logTest('GET /api/backup/:id/info (not found)', isValid, 
            isValid ? '404 ошибка обработана корректно' : `Status: ${response.status}`);
        if (isValid) {
            results.passed++;
        } else {
            results.failed++;
        }
    } catch (error) {
        logTest('GET /api/backup/:id/info (not found)', false, `Error: ${error.message}`);
        results.failed++;
    }

    // 7. Очистка старых бэкапов
    logSection('7. Очистка старых бэкапов');
    try {
        const response = await makeRequest('POST', `${API_PREFIX}/cleanup`);
        const isValid = response.status === 200 && 
                       response.data.success === true;
        logTest('POST /api/backup/cleanup', isValid, 
            isValid ? `Очистка завершена, удалено: ${response.data.data?.deleted || 0}` : `Status: ${response.status}`);
        if (isValid) {
            results.passed++;
            if (response.data.data?.deleted > 0) {
                log(`   Удалено старых бэкапов: ${response.data.data.deleted}`, 'blue');
            }
        } else {
            results.failed++;
        }
    } catch (error) {
        logTest('POST /api/backup/cleanup', false, `Error: ${error.message}`);
        results.failed++;
    }

    // 8. Фильтрация списка бэкапов по типу
    logSection('8. Фильтрация списка бэкапов');
    try {
        const response = await makeRequest('GET', `${API_PREFIX}/list?type=full`);
        const isValid = response.status === 200 && 
                       response.data.success === true;
        logTest('GET /api/backup/list?type=full', isValid, 
            isValid ? `Найдено полных бэкапов: ${response.data.count || 0}` : `Status: ${response.status}`);
        if (isValid) {
            results.passed++;
        } else {
            results.failed++;
        }
    } catch (error) {
        logTest('GET /api/backup/list?type=full', false, `Error: ${error.message}`);
        results.failed++;
    }

    // Итоги
    logSection('ИТОГИ ТЕСТИРОВАНИЯ');
    log(`✅ Пройдено: ${results.passed}`, 'green');
    log(`❌ Провалено: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
    log(`📊 Всего тестов: ${results.passed + results.failed}`, 'blue');
    
    const successRate = ((results.passed / (results.passed + results.failed)) * 100).toFixed(1);
    log(`📈 Процент успеха: ${successRate}%`, successRate >= 80 ? 'green' : 'yellow');

    if (createdBackupId) {
        log(`\n💡 Созданный тестовый бэкап: ${createdBackupId}`, 'blue');
        log(`   Вы можете удалить его через: DELETE /api/backup/${createdBackupId}`, 'blue');
    }

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

