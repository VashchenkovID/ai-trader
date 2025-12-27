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
 * Задержка
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Тест 1: Проверка нормальной работы API (без fallback)
 */
async function testNormalApiWork() {
    console.log('\n📡 Тест 1: Проверка нормальной работы API');
    console.log('─'.repeat(60));
    
    try {
        // Запрос к тестовому endpoint, который напрямую вызывает TinkoffApiService
        const response = await makeRequest({
            hostname: 'localhost',
            port: 3001,
            path: '/api/market/test-fallback/stocks',
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        console.log(`✅ Статус: ${response.status}`);
        
            if (response.status === 200 && response.data.success) {
                const instruments = response.data.data?.instruments || [];
                const meta = response.data.meta || {};
                console.log(`📊 Получено инструментов: ${instruments.length}`);
                if (meta.fromCache) {
                    console.log(`💾 Данные из КЕША (возраст: ${meta.cacheAge} минут)`);
                } else {
                    console.log('✅ Данные из API');
                }
                return true;
        } else {
            console.log('⚠️  API вернул неожиданный ответ');
            return false;
        }
    } catch (error) {
        console.error('❌ Ошибка:', error.message);
        return false;
    }
}

/**
 * Тест 2: Проверка статистики fallback до симуляции ошибки
 */
async function testFallbackStatsBefore() {
    console.log('\n📊 Тест 2: Статистика fallback ДО симуляции ошибки');
    console.log('─'.repeat(60));
    
    try {
        const response = await makeRequest({
            hostname: 'localhost',
            port: 3001,
            path: '/api/fallback/stats/TinkoffAPI',
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        console.log(`✅ Статус: ${response.status}`);
        console.log('📈 Статистика:');
        console.log(JSON.stringify(response.data.data, null, 2));
        
        return response.data.data;
    } catch (error) {
        console.error('❌ Ошибка:', error.message);
        return null;
    }
}

/**
 * Тест 3: Симуляция недоступности API через неверный токен
 * (Это вызовет ошибку аутентификации, которая не будет retry, но fallback должен сработать)
 */
async function testApiUnavailable() {
    console.log('\n🔴 Тест 3: Симуляция недоступности API');
    console.log('─'.repeat(60));
    console.log('ℹ️  Для полного теста нужно временно изменить TINKOFF_TOKEN в .env');
    console.log('ℹ️  Или отключить интернет на несколько секунд');
    console.log('ℹ️  Проверяем статистику fallback после запроса...\n');
    
    try {
        // Делаем запрос к тестовому endpoint, который напрямую вызывает TinkoffApiService
        const response = await makeRequest({
            hostname: 'localhost',
            port: 3001,
            path: '/api/market/test-fallback/stocks',
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        console.log(`📡 Статус запроса: ${response.status}`);
        
        // Ждем немного, чтобы fallback успел обработать
        await delay(2000);
        
        // Проверяем статистику fallback
        const statsResponse = await makeRequest({
            hostname: 'localhost',
            port: 3001,
            path: '/api/fallback/stats/TinkoffAPI',
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (statsResponse.status === 200 && statsResponse.data.success) {
            const stats = statsResponse.data.data;
            console.log('📈 Статистика fallback ПОСЛЕ запроса:');
            console.log(JSON.stringify(stats, null, 2));
            
            if (stats.total > 0) {
                console.log(`✅ Fallback обработал ${stats.total} запрос(ов)`);
                if (stats.cacheHits > 0) {
                    console.log(`✅ Использовано кешированных данных: ${stats.cacheHits} раз(а)`);
                }
                if (stats.failures > 0) {
                    console.log(`⚠️  Зафиксировано ошибок: ${stats.failures}`);
                }
            } else {
                console.log('ℹ️  Fallback еще не использовался (API работает нормально)');
            }
            
            return stats;
        }
        
        return null;
    } catch (error) {
        console.error('❌ Ошибка:', error.message);
        return null;
    }
}

/**
 * Тест 4: Проверка circuit breaker состояния
 */
async function testCircuitBreakerState() {
    console.log('\n🔌 Тест 4: Проверка состояния circuit breaker');
    console.log('─'.repeat(60));
    
    try {
        const response = await makeRequest({
            hostname: 'localhost',
            port: 3001,
            path: '/api/retry/circuit-breaker/TinkoffAPI',
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        console.log(`✅ Статус: ${response.status}`);
        console.log('🔌 Circuit Breaker:');
        console.log(JSON.stringify(response.data.data, null, 2));
        
        if (response.data.data.state === 'open') {
            console.log('🔴 Circuit breaker ОТКРЫТ - API недоступен');
        } else if (response.data.data.state === 'half-open') {
            console.log('🟡 Circuit breaker ПОЛУОТКРЫТ - тестируется восстановление');
        } else {
            console.log('🟢 Circuit breaker ЗАКРЫТ - API работает нормально');
        }
        
        return response.data.data;
    } catch (error) {
        console.error('❌ Ошибка:', error.message);
        return null;
    }
}

/**
 * Тест 5: Проверка работы с кешированными данными
 */
async function testCachedDataAccess() {
    console.log('\n💾 Тест 5: Проверка доступа к кешированным данным');
    console.log('─'.repeat(60));
    
    try {
        // Запрос к тестовому endpoint для получения инструментов
        // Если API недоступен, должны получить данные из кеша
        const response = await makeRequest({
            hostname: 'localhost',
            port: 3001,
            path: '/api/market/test-fallback/stocks',
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        console.log(`✅ Статус: ${response.status}`);
        
        if (response.status === 200 && response.data.success) {
            const instruments = response.data.data?.instruments || [];
            const meta = response.data.meta || {};
            console.log(`📊 Получено инструментов: ${instruments.length}`);
            
            // Проверяем, есть ли метаданные о кеше в ответе
            if (meta.fromCache) {
                console.log('✅ Данные получены из КЕША');
                console.log(`   Возраст кеша: ${meta.cacheAge} минут`);
            } else if (meta.simplified) {
                console.log('⚠️  Использованы упрощенные данные (API и кеш недоступны)');
            } else {
                console.log('✅ Данные получены из API');
            }
            
            return true;
        } else {
            console.log('⚠️  Не удалось получить данные');
            return false;
        }
    } catch (error) {
        console.error('❌ Ошибка:', error.message);
        return false;
    }
}

/**
 * Тест 6: Проверка алертов от fallback
 */
async function testFallbackAlerts() {
    console.log('\n🚨 Тест 6: Проверка алертов от fallback');
    console.log('─'.repeat(60));
    
    try {
        // Проверяем алерты мониторинга
        const response = await makeRequest({
            hostname: 'localhost',
            port: 3001,
            path: '/api/monitoring/alerts?category=external_api&severity=medium&limit=10',
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        console.log(`✅ Статус: ${response.status}`);
        
        if (response.status === 200 && response.data.success) {
            const alerts = response.data.data || [];
            console.log(`📊 Найдено алертов: ${alerts.length}`);
            
            // Ищем алерты связанные с fallback
            const fallbackAlerts = alerts.filter(alert => 
                alert.message && alert.message.includes('кешированные данные')
            );
            
            if (fallbackAlerts.length > 0) {
                console.log(`✅ Найдено ${fallbackAlerts.length} алерт(ов) о использовании fallback:`);
                fallbackAlerts.forEach((alert, index) => {
                    console.log(`   ${index + 1}. ${alert.message}`);
                    console.log(`      Время: ${new Date(alert.createdAt).toLocaleString()}`);
                });
            } else {
                console.log('ℹ️  Алертов о fallback не найдено (возможно, API работает нормально)');
            }
            
            return alerts;
        }
        
        return [];
    } catch (error) {
        console.error('❌ Ошибка:', error.message);
        return [];
    }
}

/**
 * Главная функция тестирования
 */
async function runTests() {
    console.log('🧪 ТЕСТИРОВАНИЕ РЕАЛЬНОЙ РАБОТЫ FALLBACK');
    console.log('='.repeat(60));
    console.log(`📍 Базовый URL: ${BASE_URL}`);
    console.log('⏳ Убедитесь, что сервер запущен на порту 3001\n');
    console.log('⚠️  ВАЖНО: Для полного теста fallback нужно:');
    console.log('   1. Временно изменить TINKOFF_TOKEN в .env на неверный');
    console.log('   2. Или отключить интернет на несколько секунд');
    console.log('   3. Затем сделать запрос к API\n');

    const results = [];

    // Тест 1: Нормальная работа API
    results.push(await testNormalApiWork());

    // Тест 2: Статистика до
    const statsBefore = await testFallbackStatsBefore();

    // Тест 3: Симуляция недоступности
    const statsAfter = await testApiUnavailable();

    // Тест 4: Circuit breaker
    await testCircuitBreakerState();

    // Тест 5: Кешированные данные
    results.push(await testCachedDataAccess());

    // Тест 6: Алерты
    await testFallbackAlerts();

    // Сравнение статистики
    if (statsBefore && statsAfter) {
        console.log('\n📊 СРАВНЕНИЕ СТАТИСТИКИ');
        console.log('─'.repeat(60));
        console.log('ДО:');
        console.log(`   Total: ${statsBefore.total}, Cache Hits: ${statsBefore.cacheHits}, Failures: ${statsBefore.failures}`);
        console.log('ПОСЛЕ:');
        console.log(`   Total: ${statsAfter.total}, Cache Hits: ${statsAfter.cacheHits}, Failures: ${statsAfter.failures}`);
        
        const diff = {
            total: statsAfter.total - statsBefore.total,
            cacheHits: statsAfter.cacheHits - statsBefore.cacheHits,
            failures: statsAfter.failures - statsBefore.failures
        };
        
        console.log('РАЗНИЦА:');
        console.log(`   Total: +${diff.total}, Cache Hits: +${diff.cacheHits}, Failures: +${diff.failures}`);
        
        if (diff.total > 0) {
            console.log('✅ Fallback обработал запросы');
        }
        if (diff.cacheHits > 0) {
            console.log('✅ Fallback использовал кеш');
        }
    }

    // Итоги
    console.log('\n' + '='.repeat(60));
    console.log('📊 ИТОГИ ТЕСТИРОВАНИЯ');
    console.log('='.repeat(60));
    
    const passed = results.filter(r => r).length;
    const total = results.length;
    
    console.log(`✅ Пройдено: ${passed}/${total}`);
    console.log(`❌ Провалено: ${total - passed}/${total}`);
    
    console.log('\n💡 Для полного теста fallback:');
    console.log('   1. Измените TINKOFF_TOKEN в .env на неверный');
    console.log('   2. Перезапустите сервер');
    console.log('   3. Запустите этот тест снова');
    console.log('   4. Проверьте, что данные получены из кеша');
    
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

