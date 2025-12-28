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
        '/diversification/settings' // Проверяем через один из наших endpoints
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

async function testDiversificationSettings() {
    log('\n🌍 Тест 1: Получение настроек диверсификации', 'cyan');
    
    const result = await testAPI('/diversification/settings');
    
    if (result.success && result.data.success) {
        log('✅ Настройки получены', 'green');
        log(`   Макс. экспозиция сектора: ${(result.data.data.maxSectorExposure * 100).toFixed(2)}%`, 'blue');
        log(`   Мин. крупных компаний: ${(result.data.data.minLargeCapPercent * 100).toFixed(2)}%`, 'blue');
        log(`   Мин. средних компаний: ${(result.data.data.minMidCapPercent * 100).toFixed(2)}%`, 'blue');
        log(`   Макс. экспозиция страны: ${(result.data.data.maxCountryExposure * 100).toFixed(2)}%`, 'blue');
        return true;
    } else {
        log('❌ Ошибка получения настроек', 'red');
        log(`   Статус: ${result.status}`, 'red');
        log(`   Ответ: ${JSON.stringify(result.data)}`, 'red');
        return false;
    }
}

async function testCheckDiversification() {
    log('\n🌍 Тест 2: Проверка диверсификации портфеля', 'cyan');
    
    // Создаем тестовые позиции
    const mockPositions = [
        {
            figi: 'BBG004730N88',
            ticker: 'SBER',
            currentValue: 100000,
            sector: 'Финансы',
            marketCap: 3000000000000,
            country: 'RU'
        },
        {
            figi: 'BBG004730ZJ9',
            ticker: 'GAZP',
            currentValue: 80000,
            sector: 'Энергетика',
            marketCap: 5000000000000,
            country: 'RU'
        },
        {
            figi: 'BBG0013HJJ31',
            ticker: 'YNDX',
            currentValue: 60000,
            sector: 'IT',
            marketCap: 800000000000,
            country: 'RU'
        }
    ];
    
    const totalValue = mockPositions.reduce((sum, p) => sum + p.currentValue, 0);
    
    const result = await testAPI('/diversification/check', 'POST', {
        positions: mockPositions,
        totalValue
    });
    
    if (result.success && result.data.success) {
        log('✅ Проверка диверсификации выполнена', 'green');
        const analysis = result.data.data;
        log(`   Валидность: ${analysis.isValid ? '✅' : '❌'}`, analysis.isValid ? 'green' : 'red');
        log(`   Предупреждений: ${analysis.warnings.length}`, 'blue');
        log(`   Ошибок: ${analysis.errors.length}`, analysis.errors.length > 0 ? 'red' : 'green');
        
        if (analysis.sectorAnalysis && analysis.sectorAnalysis.sectors) {
            log(`   Секторы:`, 'blue');
            for (const [sector, data] of Object.entries(analysis.sectorAnalysis.sectors)) {
                log(`     ${sector}: ${(data.exposure * 100).toFixed(2)}%`, 'blue');
            }
        }
        
        if (analysis.capitalizationAnalysis && analysis.capitalizationAnalysis.distribution) {
            log(`   Капитализация:`, 'blue');
            for (const [cap, data] of Object.entries(analysis.capitalizationAnalysis.distribution)) {
                log(`     ${cap}: ${(data.exposure * 100).toFixed(2)}%`, 'blue');
            }
        }
        
        return true;
    } else {
        log('❌ Ошибка проверки диверсификации', 'red');
        log(`   Статус: ${result.status}`, 'red');
        log(`   Ответ: ${JSON.stringify(result.data)}`, 'red');
        return false;
    }
}

async function testCanAddPosition() {
    log('\n🌍 Тест 3: Проверка возможности добавления позиции', 'cyan');
    
    const mockPositions = [
        {
            figi: 'BBG004730N88',
            ticker: 'SBER',
            currentValue: 100000
        }
    ];
    
    const totalValue = 100000;
    const newPosition = {
        figi: 'BBG004730ZJ9',
        value: 50000
    };
    
    const result = await testAPI('/diversification/can-add', 'POST', {
        figi: newPosition.figi,
        value: newPosition.value,
        currentPositions: mockPositions,
        totalValue
    });
    
    if (result.success && result.data.success) {
        log('✅ Проверка возможности добавления выполнена', 'green');
        const check = result.data.data;
        log(`   Можно добавить: ${check.canAdd ? '✅' : '❌'}`, check.canAdd ? 'green' : 'red');
        log(`   Предупреждений: ${check.warnings.length}`, 'blue');
        log(`   Ошибок: ${check.errors.length}`, check.errors.length > 0 ? 'red' : 'green');
        return true;
    } else {
        log('❌ Ошибка проверки возможности добавления', 'red');
        log(`   Статус: ${result.status}`, 'red');
        log(`   Ответ: ${JSON.stringify(result.data)}`, 'red');
        return false;
    }
}

async function testUpdateSettings() {
    log('\n🌍 Тест 4: Обновление настроек диверсификации', 'cyan');
    
    const newSettings = {
        maxSectorExposure: 0.30,
        minLargeCapPercent: 0.35
    };
    
    const result = await testAPI('/diversification/settings', 'POST', newSettings);
    
    if (result.success && result.data.success) {
        log('✅ Настройки обновлены', 'green');
        
        // Проверяем, что настройки действительно обновились
        const checkResult = await testAPI('/diversification/settings');
        if (checkResult.success && checkResult.data.success) {
            const settings = checkResult.data.data;
            if (settings.maxSectorExposure === 0.30 && settings.minLargeCapPercent === 0.35) {
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
    log('\n🧪 ТЕСТИРОВАНИЕ КОНТРОЛЯ ДИВЕРСИФИКАЦИИ', 'cyan');
    log('='.repeat(50), 'cyan');
    
    // Проверяем доступность сервера
    const serverAvailable = await checkServer();
    if (!serverAvailable) {
        log('\n❌ Сервер недоступен. Убедитесь, что сервер запущен на порту 3001', 'red');
        process.exit(1);
    }
    
    const results = [];
    
    // Тест 1: Получение настроек
    results.push(await testDiversificationSettings());
    
    // Тест 2: Проверка диверсификации
    results.push(await testCheckDiversification());
    
    // Тест 3: Проверка возможности добавления позиции
    results.push(await testCanAddPosition());
    
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

