import http from 'http';

const BASE_URL = 'http://localhost:3001';

/**
 * Утилита для выполнения HTTP запросов
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
                    resolve({
                        status: res.statusCode,
                        data: parsed
                    });
                } catch (error) {
                    resolve({
                        status: res.statusCode,
                        data: data
                    });
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
 * Тестирование RecoveryService
 */
async function testRecoveryService() {
    console.log('🧪 ТЕСТИРОВАНИЕ RECOVERY SERVICE');
    console.log('============================================================');
    console.log(`📍 Базовый URL: ${BASE_URL}`);
    console.log('⏳ Убедитесь, что сервер запущен на порту 3001\n');
    
    let passed = 0;
    let failed = 0;
    
    // Тест 1: Получение состояния восстановления
    console.log('📊 Тест 1: Получение состояния восстановления');
    console.log('────────────────────────────────────────────────────────────');
    try {
        const response = await makeRequest({
            hostname: 'localhost',
            port: 3001,
            path: '/api/recovery/state',
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.status === 200 && response.data.success) {
            console.log('✅ Статус: 200');
            console.log('📈 Состояние:', JSON.stringify(response.data.data, null, 2));
            passed++;
        } else {
            console.log(`❌ Статус: ${response.status}`);
            console.log('⚠️ Неожиданный ответ:', response.data);
            failed++;
        }
    } catch (error) {
        console.log(`❌ Ошибка: ${error.message}`);
        failed++;
    }
    
    console.log('');
    
    // Тест 2: Получение статистики восстановления
    console.log('📊 Тест 2: Получение статистики восстановления');
    console.log('────────────────────────────────────────────────────────────');
    try {
        const response = await makeRequest({
            hostname: 'localhost',
            port: 3001,
            path: '/api/recovery/stats',
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.status === 200 && response.data.success) {
            console.log('✅ Статус: 200');
            console.log('📈 Статистика:', JSON.stringify(response.data.data, null, 2));
            passed++;
        } else {
            console.log(`❌ Статус: ${response.status}`);
            console.log('⚠️ Неожиданный ответ:', response.data);
            failed++;
        }
    } catch (error) {
        console.log(`❌ Ошибка: ${error.message}`);
        failed++;
    }
    
    console.log('');
    
    // Тест 3: Принудительная проверка здоровья
    console.log('🔍 Тест 3: Принудительная проверка здоровья');
    console.log('────────────────────────────────────────────────────────────');
    try {
        const response = await makeRequest({
            hostname: 'localhost',
            port: 3001,
            path: '/api/recovery/health-check',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.status === 200 && response.data.success) {
            console.log('✅ Статус: 200');
            console.log('📈 Результат проверки:', JSON.stringify(response.data.data, null, 2));
            passed++;
        } else {
            console.log(`❌ Статус: ${response.status}`);
            console.log('⚠️ Неожиданный ответ:', response.data);
            failed++;
        }
    } catch (error) {
        console.log(`❌ Ошибка: ${error.message}`);
        failed++;
    }
    
    console.log('');
    
    // Тест 4: Проверка целостности данных
    console.log('🔍 Тест 4: Проверка целостности данных');
    console.log('────────────────────────────────────────────────────────────');
    try {
        const response = await makeRequest({
            hostname: 'localhost',
            port: 3001,
            path: '/api/recovery/verify-integrity',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.status === 200 && response.data.success !== undefined) {
            console.log('✅ Статус: 200');
            console.log('📈 Результат:', JSON.stringify(response.data, null, 2));
            passed++;
        } else {
            console.log(`❌ Статус: ${response.status}`);
            console.log('⚠️ Неожиданный ответ:', response.data);
            failed++;
        }
    } catch (error) {
        console.log(`❌ Ошибка: ${error.message}`);
        failed++;
    }
    
    console.log('');
    
    // Тест 5: Полное восстановление (только если есть проблемы)
    console.log('🔄 Тест 5: Полное восстановление системы');
    console.log('────────────────────────────────────────────────────────────');
    console.log('ℹ️  Этот тест выполнит полное восстановление системы');
    console.log('ℹ️  Используйте только если есть проблемы с подключениями\n');
    
    try {
        const response = await makeRequest({
            hostname: 'localhost',
            port: 3001,
            path: '/api/recovery/full',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.status === 200 && response.data.success !== undefined) {
            console.log('✅ Статус: 200');
            console.log('📈 Результат:', JSON.stringify(response.data, null, 2));
            passed++;
        } else {
            console.log(`❌ Статус: ${response.status}`);
            console.log('⚠️ Неожиданный ответ:', response.data);
            failed++;
        }
    } catch (error) {
        console.log(`❌ Ошибка: ${error.message}`);
        failed++;
    }
    
    console.log('');
    console.log('============================================================');
    console.log('📊 ИТОГИ ТЕСТИРОВАНИЯ');
    console.log('============================================================');
    console.log(`✅ Пройдено: ${passed}/${passed + failed}`);
    console.log(`❌ Провалено: ${failed}/${passed + failed}`);
    
    if (failed === 0) {
        console.log('\n🎉 Все тесты пройдены успешно!');
    } else {
        console.log('\n⚠️  Некоторые тесты не пройдены');
    }
}

// Запуск тестов
testRecoveryService().catch(error => {
    console.error('❌ Критическая ошибка:', error);
    process.exit(1);
});

