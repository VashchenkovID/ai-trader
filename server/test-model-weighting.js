import axios from 'axios';

const API_BASE_URL = 'http://localhost:3001/api';

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
        '/model-weighting/settings' // Проверяем через один из наших endpoints
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

async function testModelWeightingSettings() {
    log('\n⚖️ Тест 1: Получение настроек взвешивания моделей', 'cyan');
    
    const result = await testAPI('/model-weighting/settings');
    
    if (result.success && result.data.success) {
        log('✅ Настройки получены', 'green');
        log(`   Окно производительности: ${result.data.data.performanceWindowDays} дней`, 'blue');
        log(`   Минимальная точность: ${result.data.data.minAccuracy}`, 'blue');
        log(`   Минимальный F1 Score: ${result.data.data.minF1Score}`, 'blue');
        log(`   Автообновление весов: ${result.data.data.autoUpdateWeights}`, 'blue');
        return true;
    } else {
        log('❌ Ошибка получения настроек', 'red');
        log(`   Статус: ${result.status}`, 'red');
        log(`   Ответ: ${JSON.stringify(result.data)}`, 'red');
        return false;
    }
}

async function testGetModelWeights() {
    log('\n⚖️ Тест 2: Получение весов моделей', 'cyan');
    
    const result = await testAPI('/model-weighting/weights');
    
    if (result.success && result.data.success) {
        log('✅ Веса моделей получены', 'green');
        log(`   Веса:`, 'blue');
        for (const [model, weight] of Object.entries(result.data.data)) {
            log(`     ${model}: ${(weight * 100).toFixed(2)}%`, 'blue');
        }
        return true;
    } else {
        log('❌ Ошибка получения весов', 'red');
        log(`   Статус: ${result.status}`, 'red');
        log(`   Ответ: ${JSON.stringify(result.data)}`, 'red');
        return false;
    }
}

async function testGetModelPerformance() {
    log('\n⚖️ Тест 3: Получение производительности модели', 'cyan');
    
    // Тестируем для ensemble модели
    const result = await testAPI('/model-weighting/performance/ensemble');
    
    if (result.success && result.data.success) {
        log('✅ Производительность получена', 'green');
        const perf = result.data.data;
        log(`   Тип модели: ${perf.modelType}`, 'blue');
        if (perf.latest) {
            log(`   Последняя точность: ${(perf.latest.accuracy * 100).toFixed(2)}%`, 'blue');
            log(`   Последний F1 Score: ${(perf.latest.f1Score * 100).toFixed(2)}%`, 'blue');
            log(`   Win Rate: ${(perf.latest.winRate * 100).toFixed(2)}%`, 'blue');
            log(`   Текущий вес: ${(perf.currentWeight * 100).toFixed(2)}%`, 'blue');
        } else {
            log(`   Данных о производительности пока нет (это нормально для нового сервиса)`, 'yellow');
            log(`   Текущий вес: ${(perf.currentWeight * 100).toFixed(2)}%`, 'blue');
        }
        if (perf.average) {
            log(`   Средняя точность: ${(perf.average.accuracy * 100).toFixed(2)}%`, 'blue');
        }
        return true;
    } else {
        log('❌ Ошибка получения производительности', 'red');
        log(`   Статус: ${result.status}`, 'red');
        log(`   Ответ: ${JSON.stringify(result.data)}`, 'red');
        return false;
    }
}

async function testUpdateSettings() {
    log('\n⚖️ Тест 4: Обновление настроек взвешивания', 'cyan');
    
    const newSettings = {
        performanceWindowDays: 30,
        minAccuracy: 0.55
    };
    
    const result = await testAPI('/model-weighting/settings', 'POST', newSettings);
    
    if (result.success && result.data.success) {
        log('✅ Настройки обновлены', 'green');
        
        // Проверяем, что настройки действительно обновились
        const checkResult = await testAPI('/model-weighting/settings');
        if (checkResult.success && checkResult.data.success) {
            const settings = checkResult.data.data;
            if (settings.performanceWindowDays === 30 && settings.minAccuracy === 0.55) {
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
    log('\n🧪 ТЕСТИРОВАНИЕ ВЗВЕШИВАНИЯ МОДЕЛЕЙ', 'cyan');
    log('='.repeat(50), 'cyan');
    
    // Проверяем доступность сервера
    const serverAvailable = await checkServer();
    if (!serverAvailable) {
        log('\n❌ Сервер недоступен. Убедитесь, что сервер запущен на порту 3001', 'red');
        process.exit(1);
    }
    
    const results = [];
    
    // Тест 1: Получение настроек
    results.push(await testModelWeightingSettings());
    
    // Тест 2: Получение весов моделей
    results.push(await testGetModelWeights());
    
    // Тест 3: Получение производительности модели
    results.push(await testGetModelPerformance());
    
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

