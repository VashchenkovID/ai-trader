/**
 * HTTP тест для проверки API endpoints мониторинга
 * Запуск: node server/test-monitoring-api.js
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
                    resolve({ status: res.statusCode, data: parsed });
                } catch (error) {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        if (body) {
            req.write(JSON.stringify(body));
        }

        req.end();
    });
}

async function runTests() {
    const results = { passed: 0, failed: 0 };

    logSection('ТЕСТИРОВАНИЕ API МОНИТОРИНГА');
    log('Проверка всех endpoints мониторинга', 'blue');
    log(`Базовый URL: ${API_BASE_URL}${API_PREFIX}`, 'blue');

    // 1. Health check
    logSection('1. GET /api/monitoring/health');
    try {
        const response = await makeRequest('GET', `${API_PREFIX}/health`);
        const isValid = response.status === 200 && 
                       response.data.success === true &&
                       response.data.data &&
                       response.data.data.status;
        logTest('GET /api/monitoring/health', isValid, 
            isValid ? `Status: ${response.data.data.status}` : `Status code: ${response.status}`);
        if (isValid) {
            results.passed++;
            log(`   Данные: ${JSON.stringify(response.data.data, null, 2)}`, 'blue');
        } else {
            results.failed++;
        }
    } catch (error) {
        logTest('GET /api/monitoring/health', false, error.message);
        results.failed++;
    }

    // 2. Metrics
    logSection('2. GET /api/monitoring/metrics');
    try {
        const response = await makeRequest('GET', `${API_PREFIX}/metrics`);
        const isValid = response.status === 200 && 
                       response.data.success === true &&
                       response.data.data &&
                       response.data.data.application;
        logTest('GET /api/monitoring/metrics', isValid, 
            isValid ? 'Метрики получены' : `Status code: ${response.status}`);
        if (isValid) {
            results.passed++;
            const metrics = response.data.data;
            log(`   Запросов: ${metrics.application?.requests || 0}`, 'blue');
            log(`   Ошибок: ${metrics.application?.errors || 0}`, 'blue');
            log(`   Активных алертов: ${metrics.alerts?.active || 0}`, 'blue');
        } else {
            results.failed++;
        }
    } catch (error) {
        logTest('GET /api/monitoring/metrics', false, error.message);
        results.failed++;
    }

    // 3. Performance stats
    logSection('3. GET /api/monitoring/performance');
    try {
        const response = await makeRequest('GET', `${API_PREFIX}/performance`);
        const isValid = response.status === 200 && 
                       response.data.success === true &&
                       response.data.data;
        logTest('GET /api/monitoring/performance', isValid, 
            isValid ? 'Статистика получена' : `Status code: ${response.status}`);
        if (isValid) {
            results.passed++;
            const perf = response.data.data;
            log(`   Время отклика: ${perf.responseTime?.current || 0}ms`, 'blue');
            log(`   Частота ошибок: ${(perf.errorRate?.current * 100 || 0).toFixed(2)}%`, 'blue');
        } else {
            results.failed++;
        }
    } catch (error) {
        logTest('GET /api/monitoring/performance', false, error.message);
        results.failed++;
    }

    // 4. Alerts
    logSection('4. GET /api/monitoring/alerts');
    try {
        const response = await makeRequest('GET', `${API_PREFIX}/alerts`);
        const isValid = response.status === 200 && 
                       response.data.success === true &&
                       Array.isArray(response.data.data);
        logTest('GET /api/monitoring/alerts', isValid, 
            isValid ? `Найдено алертов: ${response.data.count || 0}` : `Status code: ${response.status}`);
        if (isValid) {
            results.passed++;
            if (response.data.data.length > 0) {
                log('   Последние алерты:', 'blue');
                response.data.data.slice(0, 3).forEach((alert, i) => {
                    log(`   ${i + 1}. [${alert.severity}] ${alert.category}: ${alert.message}`, 'blue');
                });
            }
        } else {
            results.failed++;
        }
    } catch (error) {
        logTest('GET /api/monitoring/alerts', false, error.message);
        results.failed++;
    }

    // 5. Report
    logSection('5. GET /api/monitoring/report');
    try {
        const response = await makeRequest('GET', `${API_PREFIX}/report`);
        const isValid = response.status === 200 && 
                       response.data.success === true &&
                       response.data.data &&
                       response.data.data.metrics &&
                       response.data.data.health;
        logTest('GET /api/monitoring/report', isValid, 
            isValid ? 'Отчет получен' : `Status code: ${response.status}`);
        if (isValid) {
            results.passed++;
            const report = response.data.data;
            log(`   Статус системы: ${report.health?.status || 'unknown'}`, 'blue');
            log(`   Недавних алертов: ${report.recentAlerts?.length || 0}`, 'blue');
        } else {
            results.failed++;
        }
    } catch (error) {
        logTest('GET /api/monitoring/report', false, error.message);
        results.failed++;
    }

    // 6. Filtered alerts
    logSection('6. GET /api/monitoring/alerts?severity=high');
    try {
        const response = await makeRequest('GET', `${API_PREFIX}/alerts?severity=high`);
        const isValid = response.status === 200 && 
                       response.data.success === true;
        logTest('GET /api/monitoring/alerts?severity=high', isValid, 
            isValid ? `Найдено высокоприоритетных алертов: ${response.data.count || 0}` : `Status code: ${response.status}`);
        if (isValid) {
            results.passed++;
        } else {
            results.failed++;
        }
    } catch (error) {
        logTest('GET /api/monitoring/alerts?severity=high', false, error.message);
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

