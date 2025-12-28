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
    const endpoints = [
        '/system/health',
        '/monitoring/health',
        '/data-cleanup/stats'
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
        try {
            const directCheck = await axios.get(`${BASE_URL}/health`, { timeout: 2000 });
            if (directCheck.status === 200) {
                log('✅ Сервер доступен на порту 3001 (проверено через /health)', 'green');
                return true;
            }
        } catch (e) {
            log('❌ Сервер недоступен', 'red');
            log(`   Проверены endpoints: ${endpoints.map(e => `/api${e}`).join(', ')}`, 'red');
            if (lastError) {
                log(`   Последняя ошибка: ${lastError.error}`, 'red');
            }
            return false;
        }
    }
    
    return true;
}

async function testCleanupStats() {
    log('\n🧹 Тест 1: Получение статистики очистки', 'cyan');
    
    const result = await testAPI('/data-cleanup/stats');
    
    if (result.success && result.data.success) {
        log('✅ Статистика получена', 'green');
        const stats = result.data.data;
        log(`   Логи: ${stats.logs.count} файлов`, 'blue');
        if (stats.logs.oldest) {
            log(`     Самый старый: ${new Date(stats.logs.oldest).toLocaleDateString()}`, 'blue');
        }
        log(`   БД - Рекомендации: ${stats.database.recommendations}`, 'blue');
        log(`   БД - Заявки (отклоненные): ${stats.database.tradingRequests}`, 'blue');
        log(`   БД - Кеш: ${stats.database.cachedItems}`, 'blue');
        log(`   Модели: ${stats.models.count} файлов (${(stats.models.totalSize / 1024 / 1024).toFixed(2)} MB)`, 'blue');
        log(`   Временные файлы: ${stats.tempFiles.count} файлов (${(stats.tempFiles.totalSize / 1024).toFixed(2)} KB)`, 'blue');
        return true;
    } else {
        log('❌ Ошибка получения статистики', 'red');
        log(`   Статус: ${result.status}`, 'red');
        log(`   Ответ: ${JSON.stringify(result.data)}`, 'red');
        return false;
    }
}

async function testCleanupSettings() {
    log('\n🧹 Тест 2: Получение настроек очистки', 'cyan');
    
    const result = await testAPI('/data-cleanup/settings');
    
    if (result.success && result.data.success) {
        log('✅ Настройки получены', 'green');
        const settings = result.data.data;
        log(`   Очистка логов: ${settings.cleanupLogs}`, 'blue');
        log(`   Хранение логов: ${settings.logRetentionDays} дней`, 'blue');
        log(`   Очистка БД: ${settings.cleanupOldData}`, 'blue');
        log(`   Хранение рекомендаций: ${settings.recommendationsRetentionDays} дней`, 'blue');
        log(`   Автоочистка: ${settings.autoCleanup}`, 'blue');
        log(`   Расписание: ${settings.cleanupSchedule}`, 'blue');
        return true;
    } else {
        log('❌ Ошибка получения настроек', 'red');
        log(`   Статус: ${result.status}`, 'red');
        log(`   Ответ: ${JSON.stringify(result.data)}`, 'red');
        return false;
    }
}

async function testCleanupDatabase() {
    log('\n🧹 Тест 3: Очистка старых данных из БД', 'cyan');
    log('   (Это безопасная операция - удаляются только старые отклоненные заявки и кеш)', 'yellow');
    
    const result = await testAPI('/data-cleanup/cleanup-database', 'POST');
    
    if (result.success && result.data.success) {
        log('✅ Очистка БД выполнена', 'green');
        const cleanup = result.data.data;
        log(`   Удалено записей: ${cleanup.deleted}`, 'blue');
        if (cleanup.errors && cleanup.errors.length > 0) {
            log(`   Ошибок: ${cleanup.errors.length}`, 'yellow');
        }
        return true;
    } else {
        log('❌ Ошибка очистки БД', 'red');
        log(`   Статус: ${result.status}`, 'red');
        log(`   Ответ: ${JSON.stringify(result.data)}`, 'red');
        return false;
    }
}

async function testCleanupTempFiles() {
    log('\n🧹 Тест 4: Очистка временных файлов', 'cyan');
    
    const result = await testAPI('/data-cleanup/cleanup-temp-files', 'POST');
    
    if (result.success && result.data.success) {
        log('✅ Очистка временных файлов выполнена', 'green');
        const cleanup = result.data.data;
        log(`   Удалено файлов: ${cleanup.deleted}`, 'blue');
        if (cleanup.errors && cleanup.errors.length > 0) {
            log(`   Ошибок: ${cleanup.errors.length}`, 'yellow');
        }
        return true;
    } else {
        log('❌ Ошибка очистки временных файлов', 'red');
        log(`   Статус: ${result.status}`, 'red');
        log(`   Ответ: ${JSON.stringify(result.data)}`, 'red');
        return false;
    }
}

async function testUpdateSettings() {
    log('\n🧹 Тест 5: Обновление настроек очистки', 'cyan');
    
    const newSettings = {
        logRetentionDays: 30,
        recommendationsRetentionDays: 90
    };
    
    const result = await testAPI('/data-cleanup/settings', 'POST', newSettings);
    
    if (result.success && result.data.success) {
        log('✅ Настройки обновлены', 'green');
        
        // Проверяем, что настройки действительно обновились
        const checkResult = await testAPI('/data-cleanup/settings');
        if (checkResult.success && checkResult.data.success) {
            const settings = checkResult.data.data;
            if (settings.logRetentionDays === 30 && settings.recommendationsRetentionDays === 90) {
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
    log('\n🧪 ТЕСТИРОВАНИЕ ОЧИСТКИ ДАННЫХ', 'cyan');
    log('='.repeat(50), 'cyan');
    
    // Проверяем доступность сервера
    const serverAvailable = await checkServer();
    if (!serverAvailable) {
        log('\n❌ Сервер недоступен. Убедитесь, что сервер запущен на порту 3001', 'red');
        process.exit(1);
    }
    
    const results = [];
    
    // Тест 1: Получение статистики
    results.push(await testCleanupStats());
    
    // Тест 2: Получение настроек
    results.push(await testCleanupSettings());
    
    // Тест 3: Очистка БД (безопасная операция)
    results.push(await testCleanupDatabase());
    
    // Тест 4: Очистка временных файлов
    results.push(await testCleanupTempFiles());
    
    // Тест 5: Обновление настроек
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

