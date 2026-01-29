/**
 * HTTP тест для API мониторинга воркеров
 * Запуск: node test-worker-monitoring-api.js
 * 
 * Требования: сервер должен быть запущен на порту 3001
 */

const BASE_URL = 'http://localhost:3001/api/workers';

async function makeRequest(method, url, body = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json'
        }
    };
    
    if (body) {
        options.body = JSON.stringify(body);
    }
    
    try {
        const response = await fetch(url, options);
        const data = await response.json();
        return { status: response.status, data };
    } catch (error) {
        return { error: error.message };
    }
}

async function testAPI() {
    console.log('🧪 Тестирование API мониторинга воркеров\n');
    console.log('⚠️  Убедитесь, что сервер запущен на порту 3001\n');

    const results = {
        passed: 0,
        failed: 0,
        tests: []
    };

    function test(name, fn) {
        return async () => {
            try {
                await fn();
                console.log(`✅ ${name}`);
                results.passed++;
                results.tests.push({ name, status: 'passed' });
            } catch (error) {
                console.log(`❌ ${name}: ${error.message}`);
                results.failed++;
                results.tests.push({ name, status: 'failed', error: error.message });
            }
        };
    }

    // Тест 1: Получение статуса воркеров
    await test('GET /api/workers/status - получение статуса', async () => {
        const result = await makeRequest('GET', `${BASE_URL}/status`);
        if (result.error) throw new Error(result.error);
        if (result.status !== 200) throw new Error(`Ожидался статус 200, получен ${result.status}`);
        if (!result.data.success) throw new Error('Ответ не содержит success: true');
        if (!Array.isArray(result.data.data.workers)) throw new Error('Workers не является массивом');
        console.log(`   Найдено воркеров: ${result.data.data.workers.length}`);
    })();

    // Тест 2: Получение статистики
    await test('GET /api/workers/stats - получение статистики', async () => {
        const result = await makeRequest('GET', `${BASE_URL}/stats?period=24h`);
        if (result.error) throw new Error(result.error);
        if (result.status !== 200) throw new Error(`Ожидался статус 200, получен ${result.status}`);
        if (!result.data.success) throw new Error('Ответ не содержит success: true');
        if (!result.data.data.active) throw new Error('Ответ не содержит active');
        console.log(`   Активных: ${result.data.data.active.total}`);
        console.log(`   Завершено: ${result.data.data.completed.total}`);
    })();

    // Тест 3: Получение временной линии
    await test('GET /api/workers/timeline - получение временной линии', async () => {
        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
        const url = `${BASE_URL}/timeline?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`;
        const result = await makeRequest('GET', url);
        if (result.error) throw new Error(result.error);
        if (result.status !== 200) throw new Error(`Ожидался статус 200, получен ${result.status}`);
        if (!result.data.success) throw new Error('Ответ не содержит success: true');
        if (!Array.isArray(result.data.data.timeline)) throw new Error('Timeline не является массивом');
        console.log(`   Найдено событий: ${result.data.data.timeline.length}`);
    })();

    // Тест 4: Получение истории
    await test('GET /api/workers/history - получение истории', async () => {
        const result = await makeRequest('GET', `${BASE_URL}/history?limit=10`);
        if (result.error) throw new Error(result.error);
        if (result.status !== 200) throw new Error(`Ожидался статус 200, получен ${result.status}`);
        if (!result.data.success) throw new Error('Ответ не содержит success: true');
        if (!Array.isArray(result.data.data.history)) throw new Error('History не является массивом');
        console.log(`   Найдено записей: ${result.data.data.history.length}`);
    })();

    // Итоги
    console.log('\n' + '='.repeat(50));
    console.log(`📊 Результаты тестирования:`);
    console.log(`   ✅ Пройдено: ${results.passed}`);
    console.log(`   ❌ Провалено: ${results.failed}`);
    console.log(`   📈 Успешность: ${Math.round((results.passed / (results.passed + results.failed)) * 100)}%`);
    console.log('='.repeat(50));

    if (results.failed > 0) {
        console.log('\n❌ Некоторые тесты провалились:');
        results.tests.filter(t => t.status === 'failed').forEach(t => {
            console.log(`   - ${t.name}: ${t.error}`);
        });
        process.exit(1);
    } else {
        console.log('\n🎉 Все тесты пройдены успешно!');
        process.exit(0);
    }
}

// Проверяем наличие fetch (Node.js 18+)
if (typeof fetch === 'undefined') {
    console.error('❌ Требуется Node.js 18+ с поддержкой fetch');
    console.log('💡 Альтернатива: используйте curl или Postman для тестирования API');
    console.log('\nПримеры команд curl:');
    console.log(`  curl ${BASE_URL}/status`);
    console.log(`  curl ${BASE_URL}/stats?period=24h`);
    console.log(`  curl ${BASE_URL}/history?limit=10`);
    process.exit(1);
}

testAPI();

