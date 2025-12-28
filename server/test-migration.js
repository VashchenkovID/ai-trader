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
        '/migration/status'
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

async function testMigrationStatus() {
    log('\n🔄 Тест 1: Получение статуса миграций', 'cyan');
    
    const result = await testAPI('/migration/status');
    
    if (result.success && result.data.success) {
        log('✅ Статус миграций получен', 'green');
        const status = result.data.data;
        log(`   Текущая версия схемы: ${status.currentVersion}`, 'blue');
        log(`   Ожидающих миграций: ${status.pending}`, 'blue');
        log(`   Выполненных миграций: ${status.completed}`, 'blue');
        log(`   Неудачных миграций: ${status.failed}`, 'blue');
        log(`   Обнаружено миграций: ${status.totalDiscovered}`, 'blue');
        return true;
    } else {
        log('❌ Ошибка получения статуса миграций', 'red');
        log(`   Статус: ${result.status}`, 'red');
        log(`   Ответ: ${JSON.stringify(result.data)}`, 'red');
        return false;
    }
}

async function testDiscoverMigrations() {
    log('\n🔄 Тест 2: Обнаружение миграций', 'cyan');
    
    const result = await testAPI('/migration/discover');
    
    if (result.success && result.data.success) {
        log('✅ Миграции обнаружены', 'green');
        const migrations = result.data.data;
        log(`   Найдено миграций: ${migrations.length}`, 'blue');
        
        if (migrations.length > 0) {
            const firstMigration = migrations[0];
            log(`   Пример миграции:`, 'blue');
            log(`     Имя: ${firstMigration.name}`, 'blue');
            log(`     Размер: ${firstMigration.size} байт`, 'blue');
            log(`     Хеш: ${firstMigration.checksum.substring(0, 16)}...`, 'blue');
        }
        return true;
    } else {
        log('❌ Ошибка обнаружения миграций', 'red');
        log(`   Статус: ${result.status}`, 'red');
        log(`   Ответ: ${JSON.stringify(result.data)}`, 'red');
        return false;
    }
}

async function testMigrationSettings() {
    log('\n🔄 Тест 3: Получение настроек миграций', 'cyan');
    
    const result = await testAPI('/migration/settings');
    
    if (result.success && result.data.success) {
        log('✅ Настройки получены', 'green');
        const settings = result.data.data;
        log(`   Автозапуск при старте: ${settings.autoRunOnStart}`, 'blue');
        log(`   Проверка целостности: ${settings.checkIntegrity}`, 'blue');
        log(`   Резервное копирование: ${settings.backupBeforeMigration}`, 'blue');
        log(`   Версионирование: ${settings.versioningEnabled}`, 'blue');
        return true;
    } else {
        log('❌ Ошибка получения настроек', 'red');
        log(`   Статус: ${result.status}`, 'red');
        log(`   Ответ: ${JSON.stringify(result.data)}`, 'red');
        return false;
    }
}

async function testUpdateSettings() {
    log('\n🔄 Тест 4: Обновление настроек миграций', 'cyan');
    
    const newSettings = {
        checkIntegrity: true,
        backupBeforeMigration: true
    };
    
    const result = await testAPI('/migration/settings', 'POST', newSettings);
    
    if (result.success && result.data.success) {
        log('✅ Настройки обновлены', 'green');
        
        // Проверяем, что настройки действительно обновились
        const checkResult = await testAPI('/migration/settings');
        if (checkResult.success && checkResult.data.success) {
            const settings = checkResult.data.data;
            if (settings.checkIntegrity === true && settings.backupBeforeMigration === true) {
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
    log('\n🧪 ТЕСТИРОВАНИЕ СИСТЕМЫ МИГРАЦИЙ', 'cyan');
    log('='.repeat(50), 'cyan');
    
    // Проверяем доступность сервера
    const serverAvailable = await checkServer();
    if (!serverAvailable) {
        log('\n❌ Сервер недоступен. Убедитесь, что сервер запущен на порту 3001', 'red');
        process.exit(1);
    }
    
    const results = [];
    
    // Тест 1: Получение статуса
    results.push(await testMigrationStatus());
    
    // Тест 2: Обнаружение миграций
    results.push(await testDiscoverMigrations());
    
    // Тест 3: Получение настроек
    results.push(await testMigrationSettings());
    
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

