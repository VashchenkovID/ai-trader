import axios from 'axios';

const API_BASE_URL = 'http://localhost:3001/api';
const BASE_URL = 'http://localhost:3001';

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

async function testAPI(endpoint, method = 'GET', data = null) {
    try {
        const config = {
            method,
            url: `${API_BASE_URL}${endpoint}`,
            headers: {
                'Content-Type': 'application/json'
            }
        };
        
        if (data) {
            config.data = data;
        }
        
        const response = await axios(config);
        return { success: true, data: response.data, status: response.status };
    } catch (error) {
        return {
            success: false,
            error: error.message,
            status: error.response?.status,
            data: error.response?.data
        };
    }
}

async function checkServer() {
    log('\n🔍 Проверка доступности сервера...', 'cyan');
    // Пробуем несколько возможных endpoints (с учетом того, что API_BASE_URL уже содержит /api)
    const endpoints = [
        '/system/health',
        '/monitoring/health',
        '/pyramiding/settings' // Проверяем через один из наших endpoints
    ];
    let serverAvailable = false;
    let lastError = null;
    
    for (const endpoint of endpoints) {
        const result = await testAPI(endpoint);
        if (result.success) {
            log('✅ Сервер доступен', 'green');
            serverAvailable = true;
            break;
        } else {
            lastError = result;
        }
    }
    
    if (!serverAvailable) {
        log('❌ Сервер недоступен', 'red');
        log(`   Проверены endpoints: ${endpoints.map(e => `/api${e}`).join(', ')}`, 'red');
        if (lastError) {
            log(`   Последняя ошибка: ${lastError.error}`, 'red');
            log(`   Статус: ${lastError.status}`, 'red');
        }
        // Попробуем проверить без /api префикса
        try {
            const directCheck = await axios.get(`${BASE_URL}/health`, { timeout: 2000 });
            if (directCheck.status === 200) {
                log('✅ Сервер доступен на порту 3001 (проверено через /health)', 'green');
                return true;
            }
        } catch (e) {
            log(`   Прямая проверка /health также не удалась: ${e.message}`, 'red');
        }
        return false;
    }
    
    return true;
}

async function testPyramidingSettings() {
    log('\n📊 Тест 1: Получение настроек пирамидинга', 'cyan');
    
    const result = await testAPI('/pyramiding/settings');
    
    if (result.success && result.data.success) {
        log('✅ Настройки получены', 'green');
        log(`   Проценты входов: ${JSON.stringify(result.data.data.entryPercentages)}`, 'blue');
        log(`   Макс. входов: ${result.data.data.maxEntries}`, 'blue');
        log(`   Стоп-лосс: ${result.data.data.stopLossPercent}%`, 'blue');
        return true;
    } else {
        log('❌ Ошибка получения настроек', 'red');
        log(`   Статус: ${result.status}`, 'red');
        log(`   Ответ: ${JSON.stringify(result.data)}`, 'red');
        return false;
    }
}

async function testGetPyramids() {
    log('\n📊 Тест 2: Получение списка пирамид', 'cyan');
    
    const result = await testAPI('/pyramiding/pyramids');
    
    if (result.success && result.data.success) {
        log('✅ Список пирамид получен', 'green');
        log(`   Количество пирамид: ${result.data.data.length}`, 'blue');
        
        if (result.data.data.length > 0) {
            const pyramid = result.data.data[0];
            log(`   Пример пирамиды:`, 'blue');
            log(`     FIGI: ${pyramid.figi}`, 'blue');
            log(`     Тикер: ${pyramid.ticker}`, 'blue');
            log(`     Статус: ${pyramid.status}`, 'blue');
            log(`     Текущий размер: ${pyramid.currentPercent}%`, 'blue');
            log(`     Количество входов: ${pyramid.entries.length}`, 'blue');
        }
        return true;
    } else {
        log('❌ Ошибка получения списка пирамид', 'red');
        log(`   Статус: ${result.status}`, 'red');
        log(`   Ответ: ${JSON.stringify(result.data)}`, 'red');
        return false;
    }
}

async function testCheckPyramids() {
    log('\n📊 Тест 3: Проверка активных пирамид', 'cyan');
    
    const result = await testAPI('/pyramiding/check');
    
    if (result.success && result.data.success) {
        log('✅ Проверка выполнена', 'green');
        log(`   Проверено пирамид: ${result.data.data.checked}`, 'blue');
        
        if (result.data.data.results && result.data.data.results.length > 0) {
            const checkResult = result.data.data.results[0];
            log(`   Пример результата:`, 'blue');
            log(`     FIGI: ${checkResult.figi}`, 'blue');
            log(`     Текущий уровень: ${checkResult.currentLevel}`, 'blue');
            log(`     Можно войти: ${checkResult.checkResult.canEnter}`, 'blue');
            if (checkResult.checkResult.reason) {
                log(`     Причина: ${checkResult.checkResult.reason}`, 'blue');
            }
        }
        return true;
    } else {
        log('❌ Ошибка проверки пирамид', 'red');
        log(`   Статус: ${result.status}`, 'red');
        log(`   Ответ: ${JSON.stringify(result.data)}`, 'red');
        return false;
    }
}

async function testUpdateSettings() {
    log('\n📊 Тест 4: Обновление настроек пирамидинга', 'cyan');
    
    const newSettings = {
        checkIntervalMinutes: 30,
        maxWaitDays: 5
    };
    
    const result = await testAPI('/pyramiding/settings', 'POST', newSettings);
    
    if (result.success && result.data.success) {
        log('✅ Настройки обновлены', 'green');
        
        // Проверяем, что настройки действительно обновились
        const checkResult = await testAPI('/pyramiding/settings');
        if (checkResult.success && checkResult.data.success) {
            const settings = checkResult.data.data;
            if (settings.checkIntervalMinutes === 30) {
                log('✅ Настройки подтверждены', 'green');
                return true;
            } else {
                log('⚠️ Настройки не обновились', 'yellow');
                return false;
            }
        }
        return true;
    } else {
        log('❌ Ошибка обновления настроек', 'red');
        log(`   Статус: ${result.status}`, 'red');
        log(`   Ответ: ${JSON.stringify(result.data)}`, 'red');
        return false;
    }
}

async function main() {
    log('\n🧪 ТЕСТИРОВАНИЕ ПИРАМИДИНГА ПОЗИЦИЙ', 'cyan');
    log('='.repeat(50), 'cyan');
    
    // Проверяем доступность сервера
    const serverAvailable = await checkServer();
    if (!serverAvailable) {
        log('\n❌ Сервер недоступен. Убедитесь, что сервер запущен на порту 3001', 'red');
        process.exit(1);
    }
    
    const results = [];
    
    // Тест 1: Получение настроек
    results.push(await testPyramidingSettings());
    
    // Тест 2: Получение списка пирамид
    results.push(await testGetPyramids());
    
    // Тест 3: Проверка активных пирамид
    results.push(await testCheckPyramids());
    
    // Тест 4: Обновление настроек
    results.push(await testUpdateSettings());
    
    // Итоги
    log('\n' + '='.repeat(50), 'cyan');
    const passed = results.filter(r => r).length;
    const total = results.length;
    
    if (passed === total) {
        log(`\n✅ ВСЕ ТЕСТЫ ПРОЙДЕНЫ (${passed}/${total})`, 'green');
    } else {
        log(`\n⚠️ ПРОЙДЕНО ТЕСТОВ: ${passed}/${total}`, 'yellow');
    }
    
    log('\n', 'reset');
}

main().catch(error => {
    log(`\n❌ Критическая ошибка: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
});

