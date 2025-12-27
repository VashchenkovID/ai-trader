import axios from 'axios';

/**
 * Тест Rate Limiting
 * Проверяет работу rate limiting middleware
 */

const BASE_URL = process.env.API_URL || 'http://localhost:3001';
const API_URL = `${BASE_URL}/api`;

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

function logSuccess(message) {
    log(`✅ ${message}`, 'green');
}

function logError(message) {
    log(`❌ ${message}`, 'red');
}

function logInfo(message) {
    log(`ℹ️  ${message}`, 'cyan');
}

function logWarning(message) {
    log(`⚠️  ${message}`, 'yellow');
}

/**
 * Тест 1: Общий rate limiting (100 запросов за 15 минут)
 */
async function testGeneralRateLimit() {
    console.log('\n🧪 Тест 1: Общий Rate Limiting (100 запросов / 15 минут)');
    console.log('='.repeat(60));
    
    try {
        logInfo('Отправляем 105 запросов к /api/settings...');
        
        let successCount = 0;
        let rateLimitedCount = 0;
        const startTime = Date.now();
        
        // Отправляем 105 запросов (на 5 больше лимита)
        // Отправляем последовательно, чтобы счетчик успевал обновляться
        const results = [];
        for (let i = 0; i < 105; i++) {
            try {
                const response = await axios.get(`${API_URL}/settings`);
                successCount++;
                results.push({ success: true, index: i, status: response.status });
                
                // Показываем прогресс каждые 20 запросов
                if ((i + 1) % 20 === 0) {
                    console.log(`   📊 Отправлено ${i + 1}/105 запросов...`);
                }
            } catch (error) {
                if (error.response && error.response.status === 429) {
                    rateLimitedCount++;
                    results.push({ 
                        success: false, 
                        rateLimited: true, 
                        index: i, 
                        retryAfter: error.response.data?.retryAfter,
                        status: 429
                    });
                    console.log(`   🚫 Запрос #${i + 1} заблокирован (429)`);
                } else {
                    results.push({ 
                        success: false, 
                        error: error.message, 
                        index: i,
                        status: error.response?.status || 'unknown'
                    });
                }
            }
            // Небольшая задержка между запросами для корректной работы счетчика
            if (i < 104) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }
        const duration = Date.now() - startTime;
        
        console.log(`\n📊 Результаты:`);
        console.log(`   ⏱️  Время выполнения: ${duration}ms`);
        console.log(`   ✅ Успешных запросов: ${successCount}`);
        console.log(`   🚫 Заблокированных запросов (429): ${rateLimitedCount}`);
        console.log(`   📈 Всего запросов: ${results.length}`);
        
        // Проверяем, что rate limiting сработал
        if (rateLimitedCount > 0) {
            logSuccess(`Rate limiting работает! Заблокировано ${rateLimitedCount} запросов`);
            
            // Показываем информацию о retryAfter из первого заблокированного запроса
            const firstRateLimited = results.find(r => r.rateLimited);
            if (firstRateLimited && firstRateLimited.retryAfter) {
                console.log(`   ⏳ Retry-After: ${firstRateLimited.retryAfter} секунд`);
            }
        } else {
            logWarning('Rate limiting не сработал. Возможно, лимит не достигнут или middleware не применен.');
        }
        
        // Проверяем заголовки rate limit
        try {
            const testResponse = await axios.get(`${API_URL}/settings`);
            const headers = testResponse.headers;
            
            console.log(`\n📋 Заголовки Rate Limit:`);
            if (headers['x-ratelimit-limit']) {
                console.log(`   X-RateLimit-Limit: ${headers['x-ratelimit-limit']}`);
                logSuccess('Заголовок X-RateLimit-Limit присутствует');
            } else {
                logWarning('Заголовок X-RateLimit-Limit отсутствует');
            }
            
            if (headers['x-ratelimit-remaining']) {
                console.log(`   X-RateLimit-Remaining: ${headers['x-ratelimit-remaining']}`);
                logSuccess('Заголовок X-RateLimit-Remaining присутствует');
            } else {
                logWarning('Заголовок X-RateLimit-Remaining отсутствует');
            }
            
            if (headers['x-ratelimit-reset']) {
                console.log(`   X-RateLimit-Reset: ${headers['x-ratelimit-reset']}`);
                logSuccess('Заголовок X-RateLimit-Reset присутствует');
            } else {
                logWarning('Заголовок X-RateLimit-Reset отсутствует');
            }
        } catch (error) {
            logError(`Ошибка при проверке заголовков: ${error.message}`);
        }
        
        return {
            success: rateLimitedCount > 0,
            successCount,
            rateLimitedCount,
            totalRequests: results.length,
            duration
        };
    } catch (error) {
        logError(`Ошибка при тестировании общего rate limiting: ${error.message}`);
        if (error.response) {
            console.error('Response:', error.response.status, error.response.data);
        }
        return null;
    }
}

/**
 * Тест 2: Строгий rate limiting для обучения (5 запросов за час)
 */
async function testHeavyOperationRateLimit() {
    console.log('\n🧪 Тест 2: Rate Limiting для тяжелых операций (5 запросов / час)');
    console.log('='.repeat(60));
    
    try {
        logInfo('Отправляем 7 запросов к /api/training/batch-train-all...');
        
        let successCount = 0;
        let rateLimitedCount = 0;
        const startTime = Date.now();
        
        // Отправляем 7 запросов (на 2 больше лимита)
        const requests = [];
        for (let i = 0; i < 7; i++) {
            requests.push(
                axios.post(`${API_URL}/training/batch-train-all`, {
                    epochs: 1,
                    batchSize: 16
                })
                    .then(() => {
                        successCount++;
                        return { success: true, index: i };
                    })
                    .catch(error => {
                        if (error.response && error.response.status === 429) {
                            rateLimitedCount++;
                            return { 
                                success: false, 
                                rateLimited: true, 
                                index: i,
                                retryAfter: error.response.data?.retryAfter,
                                message: error.response.data?.message
                            };
                        }
                        // Игнорируем другие ошибки (например, если сервис не инициализирован)
                        if (error.response && error.response.status !== 500) {
                            return { success: false, error: error.message, index: i, status: error.response.status };
                        }
                        return { success: false, error: error.message, index: i };
                    })
            );
        }
        
        const results = await Promise.all(requests);
        const duration = Date.now() - startTime;
        
        console.log(`\n📊 Результаты:`);
        console.log(`   ⏱️  Время выполнения: ${duration}ms`);
        console.log(`   ✅ Успешных запросов: ${successCount}`);
        console.log(`   🚫 Заблокированных запросов (429): ${rateLimitedCount}`);
        console.log(`   📈 Всего запросов: ${results.length}`);
        
        // Показываем детали заблокированных запросов
        const rateLimitedRequests = results.filter(r => r.rateLimited);
        if (rateLimitedRequests.length > 0) {
            console.log(`\n   📝 Детали заблокированных запросов:`);
            rateLimitedRequests.forEach((req, idx) => {
                console.log(`      ${idx + 1}. Запрос #${req.index + 1}:`);
                if (req.retryAfter) {
                    console.log(`         Retry-After: ${req.retryAfter} секунд`);
                }
                if (req.message) {
                    console.log(`         Сообщение: ${req.message}`);
                }
            });
        }
        
        if (rateLimitedCount > 0) {
            logSuccess(`Rate limiting для тяжелых операций работает! Заблокировано ${rateLimitedCount} запросов`);
        } else {
            logWarning('Rate limiting не сработал. Возможно, лимит не достигнут.');
        }
        
        return {
            success: rateLimitedCount > 0,
            successCount,
            rateLimitedCount,
            totalRequests: results.length,
            duration
        };
    } catch (error) {
        logError(`Ошибка при тестировании rate limiting для тяжелых операций: ${error.message}`);
        if (error.response) {
            console.error('Response:', error.response.status, error.response.data);
        }
        return null;
    }
}

/**
 * Тест 3: API для мониторинга rate limiting
 */
async function testRateLimitAPI() {
    console.log('\n🧪 Тест 3: API для мониторинга Rate Limiting');
    console.log('='.repeat(60));
    
    try {
        // Сначала делаем несколько запросов, чтобы создать записи
        // Но не слишком много, чтобы не превысить лимит
        logInfo('Создаем записи rate limiting (5 запросов)...');
        for (let i = 0; i < 5; i++) {
            try {
                await axios.get(`${API_URL}/settings`);
                await new Promise(resolve => setTimeout(resolve, 50));
            } catch (error) {
                // Игнорируем ошибки (может быть 429, если лимит уже превышен)
            }
        }
        
        // Тест 1: Получить все статистики
        logInfo('Получаем все статистики rate limiting...');
        const allStatsResponse = await axios.get(`${API_URL}/rate-limit/stats`);
        
        if (allStatsResponse.data.success) {
            logSuccess('Получение всех статистик работает');
            console.log(`   📊 Всего активных IP: ${allStatsResponse.data.data.total}`);
            
            if (allStatsResponse.data.data.stats && allStatsResponse.data.data.stats.length > 0) {
                console.log(`\n   📋 Примеры статистик:`);
                allStatsResponse.data.data.stats.slice(0, 3).forEach((stat, idx) => {
                    console.log(`      ${idx + 1}. IP: ${stat.ip}`);
                    console.log(`         Запросов: ${stat.count}`);
                    console.log(`         Сброс через: ${stat.resetIn} секунд`);
                });
            }
        } else {
            logError('Ошибка получения статистик');
        }
        
        // Тест 2: Получить статистику для конкретного IP
        if (allStatsResponse.data.data.stats && allStatsResponse.data.data.stats.length > 0) {
            const testIP = allStatsResponse.data.data.stats[0].ip;
            logInfo(`Получаем статистику для IP: ${testIP}...`);
            
            try {
                const ipStatsResponse = await axios.get(`${API_URL}/rate-limit/stats/${testIP}`);
                
                if (ipStatsResponse.data.success) {
                    logSuccess('Получение статистики для IP работает');
                    console.log(`   📊 IP: ${ipStatsResponse.data.data.ip}`);
                    console.log(`   📈 Запросов: ${ipStatsResponse.data.data.count}`);
                    console.log(`   ⏳ Сброс через: ${ipStatsResponse.data.data.resetIn} секунд`);
                } else {
                    logError('Ошибка получения статистики для IP');
                }
            } catch (error) {
                if (error.response && error.response.status === 404) {
                    logWarning('Статистика для IP не найдена (возможно, уже истекла)');
                } else {
                    logError(`Ошибка: ${error.message}`);
                }
            }
        }
        
        // Тест 3: Сброс rate limit для IP
        if (allStatsResponse.data.data.stats && allStatsResponse.data.data.stats.length > 0) {
            const testIP = allStatsResponse.data.data.stats[0].ip;
            logInfo(`Сбрасываем rate limit для IP: ${testIP}...`);
            
            try {
                const resetResponse = await axios.delete(`${API_URL}/rate-limit/reset/${testIP}`);
                
                if (resetResponse.data.success) {
                    logSuccess('Сброс rate limit работает');
                    console.log(`   ✅ ${resetResponse.data.message}`);
                    
                    // Проверяем, что статистика удалена
                    try {
                        await axios.get(`${API_URL}/rate-limit/stats/${testIP}`);
                        logWarning('Статистика все еще существует после сброса');
                    } catch (error) {
                        if (error.response && error.response.status === 404) {
                            logSuccess('Статистика успешно удалена');
                        }
                    }
                } else {
                    logError('Ошибка сброса rate limit');
                }
            } catch (error) {
                logError(`Ошибка при сбросе: ${error.message}`);
            }
        }
        
        return {
            success: true
        };
    } catch (error) {
        logError(`Ошибка при тестировании API rate limiting: ${error.message}`);
        if (error.response) {
            console.error('Response:', error.response.status, error.response.data);
        }
        return null;
    }
}

/**
 * Запуск всех тестов
 */
async function runAllTests() {
    console.log('🚀 ТЕСТИРОВАНИЕ RATE LIMITING');
    console.log('='.repeat(60));
    console.log(`API URL: ${API_URL}\n`);
    
    // Проверяем доступность сервера
    try {
        logInfo('Проверяем доступность сервера...');
        await axios.get(`${BASE_URL}/health`);
        logSuccess('Сервер доступен\n');
    } catch (error) {
        logError(`Сервер недоступен: ${error.message}`);
        logError('Убедитесь, что сервер запущен на порту 3001');
        process.exit(1);
    }
    
    const results = {};
    
    // Тест 1: Общий rate limiting
    results.general = await testGeneralRateLimit();
    
    // Небольшая пауза между тестами
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Тест 2: Rate limiting для тяжелых операций
    results.heavyOperations = await testHeavyOperationRateLimit();
    
    // Небольшая пауза между тестами
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Тест 3: API для мониторинга
    results.api = await testRateLimitAPI();
    
    // Итоговый отчет
    console.log('\n' + '='.repeat(60));
    console.log('📊 ИТОГОВЫЙ ОТЧЕТ');
    console.log('='.repeat(60));
    
    if (results.general) {
        console.log(`\n✅ Общий Rate Limiting:`);
        console.log(`   📊 Успешных: ${results.general.successCount}`);
        console.log(`   🚫 Заблокированных: ${results.general.rateLimitedCount}`);
        console.log(`   ⏱️  Время: ${results.general.duration}ms`);
        if (results.general.success) {
            logSuccess('Тест пройден');
        } else {
            logWarning('Тест не прошел (rate limiting не сработал)');
        }
    }
    
    if (results.heavyOperations) {
        console.log(`\n✅ Rate Limiting для тяжелых операций:`);
        console.log(`   📊 Успешных: ${results.heavyOperations.successCount}`);
        console.log(`   🚫 Заблокированных: ${results.heavyOperations.rateLimitedCount}`);
        console.log(`   ⏱️  Время: ${results.heavyOperations.duration}ms`);
        if (results.heavyOperations.success) {
            logSuccess('Тест пройден');
        } else {
            logWarning('Тест не прошел (rate limiting не сработал)');
        }
    }
    
    if (results.api) {
        console.log(`\n✅ API для мониторинга:`);
        if (results.api.success) {
            logSuccess('Тест пройден');
        } else {
            logWarning('Тест не прошел');
        }
    }
    
    console.log('\n✅ Тестирование завершено!');
}

// Запускаем тесты
runAllTests().catch(error => {
    logError(`Критическая ошибка: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
});

