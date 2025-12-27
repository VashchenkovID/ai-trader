import http from 'http';
import LoggerService from './src/services/LoggerService.js';

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
                        data: parsed,
                        requestId: res.headers['x-request-id']
                    });
                } catch (error) {
                    resolve({
                        status: res.statusCode,
                        data: data,
                        requestId: res.headers['x-request-id']
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
 * Тестирование LoggerService
 */
async function testLogging() {
    console.log('🧪 ТЕСТИРОВАНИЕ LOGGING SERVICE');
    console.log('============================================================');
    console.log(`📍 Базовый URL: ${BASE_URL}`);
    console.log('⏳ Убедитесь, что сервер запущен на порту 3001\n');
    
    let passed = 0;
    let failed = 0;
    
    // Тест 1: Проверка инициализации LoggerService
    console.log('📊 Тест 1: Проверка инициализации LoggerService');
    console.log('────────────────────────────────────────────────────────────');
    try {
        // Инициализируем LoggerService
        await LoggerService.initialize();
        
        if (LoggerService.isInitialized) {
            console.log('✅ LoggerService инициализирован');
            console.log('📈 Статистика:', JSON.stringify(LoggerService.getStats(), null, 2));
            passed++;
        } else {
            console.log('❌ LoggerService не инициализирован');
            failed++;
        }
    } catch (error) {
        console.log(`❌ Ошибка: ${error.message}`);
        failed++;
    }
    
    console.log('');
    
    // Тест 2: Базовое логирование
    console.log('📝 Тест 2: Базовое логирование');
    console.log('────────────────────────────────────────────────────────────');
    try {
        LoggerService.info('Тестовое информационное сообщение', {
            test: 'basic-logging',
            service: 'TestService'
        });
        
        LoggerService.warn('Тестовое предупреждение', {
            test: 'basic-logging',
            service: 'TestService'
        });
        
        LoggerService.debug('Тестовое отладочное сообщение', {
            test: 'basic-logging',
            service: 'TestService'
        });
        
        console.log('✅ Базовое логирование выполнено (проверьте логи в server/logs/)');
        passed++;
    } catch (error) {
        console.log(`❌ Ошибка: ${error.message}`);
        failed++;
    }
    
    console.log('');
    
    // Тест 3: Логирование с контекстом
    console.log('🔍 Тест 3: Логирование с контекстом');
    console.log('────────────────────────────────────────────────────────────');
    try {
        const requestId = 'test_req_12345';
        const context = {
            requestId,
            userId: 'test_user_123',
            service: 'TestService'
        };
        
        LoggerService.setContext(requestId, context);
        
        LoggerService.info('Сообщение с контекстом', {
            requestId,
            message: 'Тестовое сообщение'
        });
        
        const retrievedContext = LoggerService.getContext(requestId);
        if (retrievedContext.requestId === requestId && retrievedContext.userId === 'test_user_123') {
            console.log('✅ Контекст установлен и получен корректно');
            passed++;
        } else {
            console.log('❌ Контекст не совпадает');
            failed++;
        }
        
        LoggerService.clearContext(requestId);
    } catch (error) {
        console.log(`❌ Ошибка: ${error.message}`);
        failed++;
    }
    
    console.log('');
    
    // Тест 4: Дочерний логгер
    console.log('🌳 Тест 4: Дочерний логгер');
    console.log('────────────────────────────────────────────────────────────');
    try {
        const childLogger = LoggerService.child({ service: 'ChildService' });
        
        childLogger.info('Сообщение от дочернего логгера', {
            operation: 'test'
        });
        
        console.log('✅ Дочерний логгер создан и использован');
        passed++;
    } catch (error) {
        console.log(`❌ Ошибка: ${error.message}`);
        failed++;
    }
    
    console.log('');
    
    // Тест 5: Специализированные методы логирования
    console.log('🔧 Тест 5: Специализированные методы логирования');
    console.log('────────────────────────────────────────────────────────────');
    try {
        // Логирование БД
        LoggerService.logDatabase('SELECT * FROM users', {
            duration: '50ms',
            rows: 100
        });
        
        // Логирование API вызова
        LoggerService.logApiCall('TinkoffAPI', '/instruments', 'GET', 250, {
            statusCode: 200
        });
        
        // Критическая ошибка
        LoggerService.logCritical('Тестовая критическая ошибка', {
            test: true
        });
        
        console.log('✅ Специализированные методы выполнены');
        passed++;
    } catch (error) {
        console.log(`❌ Ошибка: ${error.message}`);
        failed++;
    }
    
    console.log('');
    
    // Тест 6: Проверка requestId в HTTP запросах
    console.log('🌐 Тест 6: Проверка requestId в HTTP запросах');
    console.log('────────────────────────────────────────────────────────────');
    try {
        const response = await makeRequest({
            hostname: 'localhost',
            port: 3001,
            path: '/health',
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.status === 200 && response.requestId) {
            console.log('✅ Request ID получен в заголовке ответа');
            console.log(`   Request ID: ${response.requestId}`);
            passed++;
        } else {
            console.log(`⚠️  Статус: ${response.status}, Request ID: ${response.requestId || 'не найден'}`);
            if (response.status === 200) {
                console.log('ℹ️  Request ID может быть не установлен если middleware не подключен');
            }
            failed++;
        }
    } catch (error) {
        console.log(`❌ Ошибка: ${error.message}`);
        console.log('ℹ️  Убедитесь, что сервер запущен');
        failed++;
    }
    
    console.log('');
    
    // Тест 7: Проверка логирования запросов
    console.log('📡 Тест 7: Проверка логирования HTTP запросов');
    console.log('────────────────────────────────────────────────────────────');
    try {
        const startTime = Date.now();
        const response = await makeRequest({
            hostname: 'localhost',
            port: 3001,
            path: '/api/monitoring/health',
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        const duration = Date.now() - startTime;
        
        if (response.status === 200) {
            console.log(`✅ Запрос выполнен (${duration}ms)`);
            console.log(`   Request ID: ${response.requestId || 'не найден'}`);
            console.log('ℹ️  Проверьте логи в server/logs/combined.log для записи запроса');
            passed++;
        } else {
            console.log(`⚠️  Статус: ${response.status}`);
            failed++;
        }
    } catch (error) {
        console.log(`❌ Ошибка: ${error.message}`);
        console.log('ℹ️  Убедитесь, что сервер запущен и маршрут /api/monitoring/health доступен');
        failed++;
    }
    
    console.log('');
    
    // Тест 8: Проверка файлов логов
    console.log('📁 Тест 8: Проверка создания файлов логов');
    console.log('────────────────────────────────────────────────────────────');
    try {
        const fs = await import('fs');
        const path = await import('path');
        const { fileURLToPath } = await import('url');
        
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const logDir = path.join(__dirname, 'logs');
        
        if (fs.existsSync(logDir)) {
            const files = fs.readdirSync(logDir);
            const logFiles = files.filter(f => f.endsWith('.log'));
            
            console.log(`✅ Директория логов существует: ${logDir}`);
            console.log(`📄 Найдено файлов логов: ${logFiles.length}`);
            if (logFiles.length > 0) {
                console.log('   Файлы:', logFiles.join(', '));
            }
            passed++;
        } else {
            console.log(`⚠️  Директория логов не найдена: ${logDir}`);
            console.log('ℹ️  Файлы логов будут созданы при первом логировании');
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
        console.log('\n💡 Проверьте файлы логов в server/logs/ для подтверждения записи');
    } else {
        console.log('\n⚠️  Некоторые тесты не пройдены');
        console.log('💡 Убедитесь, что сервер запущен и LoggerService инициализирован');
    }
}

// Запуск тестов
testLogging().catch(error => {
    console.error('❌ Критическая ошибка:', error);
    process.exit(1);
});

