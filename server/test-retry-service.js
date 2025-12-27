import http from 'http';

const BASE_URL = 'http://localhost:3001';

/**
 * Выполнение HTTP запроса
 */
function makeRequest(options) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ status: res.statusCode, data: parsed });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        if (options.body) {
            req.write(JSON.stringify(options.body));
        }

        req.end();
    });
}

/**
 * Тест 1: Получение статистики retry для всех сервисов
 */
async function testGetAllStats() {
    console.log('\n📊 Тест 1: Получение статистики retry для всех сервисов');
    console.log('─'.repeat(60));
    
    try {
        const response = await makeRequest({
            hostname: 'localhost',
            port: 3001,
            path: '/api/retry/stats',
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        console.log(`✅ Статус: ${response.status}`);
        console.log('📈 Статистика:');
        console.log(JSON.stringify(response.data, null, 2));
        
        if (response.status === 200 && response.data.success) {
            console.log('✅ Тест пройден');
            return true;
        } else {
            console.log('❌ Тест не пройден');
            return false;
        }
    } catch (error) {
        console.error('❌ Ошибка:', error.message);
        return false;
    }
}

/**
 * Тест 2: Получение статистики для конкретного сервиса
 */
async function testGetServiceStats(serviceName = 'TinkoffAPI') {
    console.log(`\n📊 Тест 2: Получение статистики для ${serviceName}`);
    console.log('─'.repeat(60));
    
    try {
        const response = await makeRequest({
            hostname: 'localhost',
            port: 3001,
            path: `/api/retry/stats/${serviceName}`,
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        console.log(`✅ Статус: ${response.status}`);
        console.log('📈 Статистика:');
        console.log(JSON.stringify(response.data, null, 2));
        
        if (response.status === 200 && response.data.success) {
            console.log('✅ Тест пройден');
            return true;
        } else {
            console.log('❌ Тест не пройден');
            return false;
        }
    } catch (error) {
        console.error('❌ Ошибка:', error.message);
        return false;
    }
}

/**
 * Тест 3: Получение состояния circuit breaker
 */
async function testGetCircuitBreaker(serviceName = 'TinkoffAPI') {
    console.log(`\n🔌 Тест 3: Получение состояния circuit breaker для ${serviceName}`);
    console.log('─'.repeat(60));
    
    try {
        const response = await makeRequest({
            hostname: 'localhost',
            port: 3001,
            path: `/api/retry/circuit-breaker/${serviceName}`,
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        console.log(`✅ Статус: ${response.status}`);
        console.log('🔌 Circuit Breaker:');
        console.log(JSON.stringify(response.data, null, 2));
        
        if (response.status === 200 && response.data.success) {
            console.log('✅ Тест пройден');
            return true;
        } else {
            console.log('❌ Тест не пройден');
            return false;
        }
    } catch (error) {
        console.error('❌ Ошибка:', error.message);
        return false;
    }
}

/**
 * Тест 4: Сброс circuit breaker
 */
async function testResetCircuitBreaker(serviceName = 'TinkoffAPI') {
    console.log(`\n🔄 Тест 4: Сброс circuit breaker для ${serviceName}`);
    console.log('─'.repeat(60));
    
    try {
        const response = await makeRequest({
            hostname: 'localhost',
            port: 3001,
            path: `/api/retry/circuit-breaker/${serviceName}/reset`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        console.log(`✅ Статус: ${response.status}`);
        console.log('📝 Ответ:');
        console.log(JSON.stringify(response.data, null, 2));
        
        if (response.status === 200 && response.data.success) {
            console.log('✅ Тест пройден');
            return true;
        } else {
            console.log('❌ Тест не пройден');
            return false;
        }
    } catch (error) {
        console.error('❌ Ошибка:', error.message);
        return false;
    }
}

/**
 * Тест 5: Проверка работы retry через реальный API запрос
 * (Этот тест требует, чтобы сервер был запущен и Tinkoff API был настроен)
 */
async function testRetryWithRealRequest() {
    console.log('\n🔄 Тест 5: Проверка работы retry через реальный API запрос');
    console.log('─'.repeat(60));
    console.log('ℹ️  Этот тест проверяет, что retry работает при реальных запросах');
    console.log('ℹ️  Для полного теста нужно симулировать ошибки API');
    
    try {
        // Попробуем сделать запрос к Tinkoff API через наш сервис
        // Это вызовет retry логику, если будут ошибки
        const response = await makeRequest({
            hostname: 'localhost',
            port: 3001,
            path: '/api/instruments/list',
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        console.log(`✅ Статус: ${response.status}`);
        console.log('📝 Запрос выполнен');
        
        // После запроса проверяем статистику
        const statsResponse = await makeRequest({
            hostname: 'localhost',
            port: 3001,
            path: '/api/retry/stats/TinkoffAPI',
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (statsResponse.status === 200 && statsResponse.data.success) {
            console.log('📈 Статистика после запроса:');
            console.log(JSON.stringify(statsResponse.data.data, null, 2));
        }
        
        console.log('✅ Тест пройден (retry работает в фоне)');
        return true;
    } catch (error) {
        console.error('❌ Ошибка:', error.message);
        console.log('⚠️  Это может быть нормально, если сервер не запущен или API недоступен');
        return false;
    }
}

/**
 * Главная функция тестирования
 */
async function runTests() {
    console.log('🧪 ТЕСТИРОВАНИЕ RETRY SERVICE');
    console.log('='.repeat(60));
    console.log(`📍 Базовый URL: ${BASE_URL}`);
    console.log('⏳ Убедитесь, что сервер запущен на порту 3001\n');

    const results = [];

    // Тест 1: Получение всех статистик
    results.push(await testGetAllStats());

    // Тест 2: Статистика для конкретного сервиса
    results.push(await testGetServiceStats('TinkoffAPI'));
    results.push(await testGetServiceStats('NewsAPI'));

    // Тест 3: Circuit breaker состояние
    results.push(await testGetCircuitBreaker('TinkoffAPI'));
    results.push(await testGetCircuitBreaker('NewsAPI'));

    // Тест 4: Сброс circuit breaker
    results.push(await testResetCircuitBreaker('TinkoffAPI'));

    // Тест 5: Реальный запрос (опционально)
    // results.push(await testRetryWithRealRequest());

    // Итоги
    console.log('\n' + '='.repeat(60));
    console.log('📊 ИТОГИ ТЕСТИРОВАНИЯ');
    console.log('='.repeat(60));
    
    const passed = results.filter(r => r).length;
    const total = results.length;
    
    console.log(`✅ Пройдено: ${passed}/${total}`);
    console.log(`❌ Провалено: ${total - passed}/${total}`);
    
    if (passed === total) {
        console.log('\n🎉 Все тесты пройдены успешно!');
        process.exit(0);
    } else {
        console.log('\n⚠️  Некоторые тесты не пройдены');
        process.exit(1);
    }
}

// Запуск тестов
runTests().catch(error => {
    console.error('❌ Критическая ошибка:', error);
    process.exit(1);
});

