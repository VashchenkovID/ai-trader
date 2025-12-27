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
 * Тест 1: Получение статистики fallback для всех сервисов
 */
async function testGetAllStats() {
    console.log('\n📊 Тест 1: Получение статистики fallback для всех сервисов');
    console.log('─'.repeat(60));
    
    try {
        const response = await makeRequest({
            hostname: 'localhost',
            port: 3001,
            path: '/api/fallback/stats',
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
    console.log(`\n📊 Тест 2: Получение статистики fallback для ${serviceName}`);
    console.log('─'.repeat(60));
    
    try {
        const response = await makeRequest({
            hostname: 'localhost',
            port: 3001,
            path: `/api/fallback/stats/${serviceName}`,
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
 * Тест 3: Получение конфигурации fallback стратегий
 */
async function testGetStrategies() {
    console.log('\n⚙️  Тест 3: Получение конфигурации fallback стратегий');
    console.log('─'.repeat(60));
    
    try {
        const response = await makeRequest({
            hostname: 'localhost',
            port: 3001,
            path: '/api/fallback/strategies',
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        console.log(`✅ Статус: ${response.status}`);
        console.log('⚙️  Конфигурация:');
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
 * Тест 4: Обновление конфигурации fallback стратегии
 */
async function testUpdateStrategy(serviceName = 'TinkoffAPI') {
    console.log(`\n⚙️  Тест 4: Обновление конфигурации fallback для ${serviceName}`);
    console.log('─'.repeat(60));
    
    try {
        const response = await makeRequest({
            hostname: 'localhost',
            port: 3001,
            path: `/api/fallback/strategies/${serviceName}`,
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: {
                maxCacheAge: 12 * 60 * 60 * 1000 // 12 часов
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
 * Тест 5: Сброс статистики fallback
 */
async function testResetStats() {
    console.log('\n🔄 Тест 5: Сброс статистики fallback');
    console.log('─'.repeat(60));
    
    try {
        const response = await makeRequest({
            hostname: 'localhost',
            port: 3001,
            path: '/api/fallback/stats/reset',
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
 * Главная функция тестирования
 */
async function runTests() {
    console.log('🧪 ТЕСТИРОВАНИЕ FALLBACK SERVICE');
    console.log('='.repeat(60));
    console.log(`📍 Базовый URL: ${BASE_URL}`);
    console.log('⏳ Убедитесь, что сервер запущен на порту 3001\n');

    const results = [];

    // Тест 1: Получение всех статистик
    results.push(await testGetAllStats());

    // Тест 2: Статистика для конкретного сервиса
    results.push(await testGetServiceStats('TinkoffAPI'));
    results.push(await testGetServiceStats('NewsAPI'));

    // Тест 3: Конфигурация стратегий
    results.push(await testGetStrategies());

    // Тест 4: Обновление конфигурации
    results.push(await testUpdateStrategy('TinkoffAPI'));

    // Тест 5: Сброс статистики
    results.push(await testResetStats());

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

