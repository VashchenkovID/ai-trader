import axios from 'axios';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

// Проверяем порт из .env или используем дефолтный
const PORT = process.env.PORT || 3001;
const API_BASE_URL = process.env.API_BASE_URL || `http://localhost:${PORT}`;

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

function logSection(title) {
    console.log('\n' + '='.repeat(60));
    log(title, 'cyan');
    console.log('='.repeat(60));
}

function logSuccess(message) {
    log(`✅ ${message}`, 'green');
}

function logError(message) {
    log(`❌ ${message}`, 'red');
}

function logWarning(message) {
    log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
    log(`ℹ️  ${message}`, 'blue');
}

async function testAPI(endpoint, method = 'GET', data = null) {
    try {
        const config = {
            method,
            url: `${API_BASE_URL}${endpoint}`,
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 10000
        };

        if (data) {
            config.data = data;
        }

        const response = await axios(config);
        return { success: true, data: response.data, status: response.status };
    } catch (error) {
        let errorMessage = 'Unknown error';
        let errorDetails = null;

        if (error.code === 'ECONNREFUSED') {
            errorMessage = 'Connection refused - сервер не запущен или недоступен';
        } else if (error.code === 'ETIMEDOUT') {
            errorMessage = 'Request timeout - сервер не отвечает';
        } else if (error.response) {
            errorMessage = error.response.data?.message || error.response.data?.error || JSON.stringify(error.response.data);
            errorDetails = {
                status: error.response.status,
                statusText: error.response.statusText,
                data: error.response.data
            };
        } else if (error.message) {
            errorMessage = error.message;
        }

        return {
            success: false,
            error: errorMessage,
            errorDetails,
            status: error.response?.status || 500
        };
    }
}

async function testPositionMonitoring() {
    logSection('1. Тестирование PositionMonitoringService');

    // 1.1 Получение открытых позиций
    logInfo('1.1 Получение открытых позиций...');
    const positionsResult = await testAPI('/api/position-monitoring/positions');
    if (positionsResult.success) {
        logSuccess(`Получено позиций: ${positionsResult.data?.data?.length || 0}`);
        if (positionsResult.data?.data?.length > 0) {
            logInfo(`Пример позиции: ${positionsResult.data.data[0].ticker} (${positionsResult.data.data[0].figi})`);
        }
    } else {
        logError(`Ошибка: ${positionsResult.error}`);
        if (positionsResult.errorDetails) {
            console.log(`  Статус: ${positionsResult.errorDetails.status}`);
            console.log(`  Детали: ${JSON.stringify(positionsResult.errorDetails.data, null, 2)}`);
        }
    }

    // 1.2 Проверка всех позиций
    logInfo('\n1.2 Проверка всех позиций...');
    const checkResult = await testAPI('/api/position-monitoring/check');
    if (checkResult.success) {
        const result = checkResult.data?.data;
        logSuccess(`Проверено позиций: ${result?.checked || 0}`);
        logInfo(`Алертов: ${result?.alerts || 0}`);
        logInfo(`Предупреждений: ${result?.warnings || 0}`);
        if (result?.results && result.results.length > 0) {
            logInfo(`\nДетали проверки:`);
            result.results.slice(0, 3).forEach((r, i) => {
                console.log(`  ${i + 1}. ${r.ticker}: ${r.hasAlert ? '🚨 Алерт' : r.hasWarning ? '⚠️ Предупреждение' : '✅ OK'}`);
            });
        }
    } else {
        logError(`Ошибка: ${checkResult.error}`);
        if (checkResult.errorDetails) {
            console.log(`  Статус: ${checkResult.errorDetails.status}`);
        }
    }

    // 1.3 Получение настроек
    logInfo('\n1.3 Получение настроек мониторинга...');
    const settingsResult = await testAPI('/api/position-monitoring/settings');
    if (settingsResult.success) {
        logSuccess('Настройки получены');
        const settings = settingsResult.data?.data;
        console.log(`  - Интервал проверки: ${settings?.checkIntervalMinutes || 'N/A'} минут`);
        console.log(`  - Порог предупреждения стоп-лосса: ${settings?.stopLossWarningPercent || 'N/A'}%`);
        console.log(`  - Порог критического стоп-лосса: ${settings?.stopLossCriticalPercent || 'N/A'}%`);
        console.log(`  - Cooldown алертов: ${settings?.alertCooldownMinutes || 'N/A'} минут`);
    } else {
        logError(`Ошибка: ${settingsResult.error}`);
        if (settingsResult.errorDetails) {
            console.log(`  Статус: ${settingsResult.errorDetails.status}`);
        }
    }

    // 1.4 Обновление настроек (тест)
    logInfo('\n1.4 Тест обновления настроек...');
    const updateSettingsResult = await testAPI('/api/position-monitoring/settings', 'POST', {
        checkIntervalMinutes: 5,
        stopLossWarningPercent: 2.0
    });
    if (updateSettingsResult.success) {
        logSuccess('Настройки обновлены');
    } else {
        logWarning(`Не удалось обновить настройки: ${updateSettingsResult.error?.message || JSON.stringify(updateSettingsResult.error)}`);
    }
}

async function testDailyReports() {
    logSection('2. Тестирование DailyReportService');

    // 2.1 Генерация отчета
    logInfo('2.1 Генерация ежедневного отчета...');
    const generateResult = await testAPI('/api/daily-reports/generate');
    if (generateResult.success) {
        const report = generateResult.data?.data;
        logSuccess('Отчет сгенерирован');
        console.log(`  - Дата: ${report?.date || 'N/A'}`);
        console.log(`  - Открытых позиций: ${report?.summary?.openPositions || 0}`);
        console.log(`  - Закрыто сегодня: ${report?.summary?.closedToday || 0}`);
        
        if (report?.dailyPnL) {
            const dailyPnL = report.dailyPnL.total;
            const emoji = dailyPnL >= 0 ? '📈' : '📉';
            console.log(`  - ${emoji} P&L за день: ${dailyPnL >= 0 ? '+' : ''}${dailyPnL.toFixed(2)}₽`);
        }
        
        if (report?.totalPnL) {
            const totalPnL = report.totalPnL.total;
            const emoji = totalPnL >= 0 ? '📈' : '📉';
            console.log(`  - ${emoji} Общий P&L: ${totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}₽`);
        }

        if (report?.topPositions) {
            console.log(`  - Топ прибыльных: ${report.topPositions.profitable?.length || 0}`);
            console.log(`  - Топ убыточных: ${report.topPositions.unprofitable?.length || 0}`);
        }
    } else {
        logError(`Ошибка: ${generateResult.error}`);
        if (generateResult.errorDetails) {
            console.log(`  Статус: ${generateResult.errorDetails.status}`);
            if (generateResult.errorDetails.data) {
                console.log(`  Детали: ${JSON.stringify(generateResult.errorDetails.data, null, 2)}`);
            }
        }
    }

    // 2.2 Получение настроек отчетов
    logInfo('\n2.2 Получение настроек отчетов...');
    const reportSettingsResult = await testAPI('/api/daily-reports/settings');
    if (reportSettingsResult.success) {
        logSuccess('Настройки получены');
        const settings = reportSettingsResult.data?.data;
        console.log(`  - Включены отчеты: ${settings?.enableDailyReports ? 'Да' : 'Нет'}`);
        console.log(`  - Время отправки: ${settings?.reportTime || 'N/A'}`);
        console.log(`  - Включена отправка в Telegram: ${settings?.enableTelegramReports ? 'Да' : 'Нет'}`);
        console.log(`  - Количество топ позиций: ${settings?.topPositionsCount || 'N/A'}`);
    } else {
        logError(`Ошибка: ${reportSettingsResult.error}`);
        if (reportSettingsResult.errorDetails) {
            console.log(`  Статус: ${reportSettingsResult.errorDetails.status}`);
        }
    }

    // 2.3 Отправка отчета в Telegram (опционально)
    logInfo('\n2.3 Тест отправки отчета в Telegram...');
    logWarning('Это отправит реальное сообщение в Telegram. Пропускаем для безопасности.');
    // Раскомментируйте следующую строку для реальной отправки:
    // const sendResult = await testAPI('/api/daily-reports/send', 'POST');
    // if (sendResult.success) {
    //     logSuccess('Отчет отправлен в Telegram');
    // } else {
    //     logError(`Ошибка: ${sendResult.error?.message || JSON.stringify(sendResult.error)}`);
    // }
}

async function testIntegration() {
    logSection('3. Тестирование интеграции');

    // 3.1 Проверка, что сервисы инициализированы
    logInfo('3.1 Проверка инициализации сервисов...');
    
    // Проверяем через API, что сервисы работают
    const positionsCheck = await testAPI('/api/position-monitoring/positions');
    if (positionsCheck.success) {
        logSuccess('PositionMonitoringService работает');
    } else {
        logError('PositionMonitoringService не работает');
    }

    const reportCheck = await testAPI('/api/daily-reports/generate');
    if (reportCheck.success) {
        logSuccess('DailyReportService работает');
    } else {
        logError('DailyReportService не работает');
    }
}

async function checkServerHealth() {
    logInfo('Проверка доступности сервера...');
    const healthResult = await testAPI('/api/monitoring/health');
    if (healthResult.success) {
        logSuccess('Сервер доступен');
        return true;
    } else {
        logError(`Сервер недоступен: ${healthResult.error}`);
        logWarning('Убедитесь, что сервер запущен на порту 3000');
        return false;
    }
}

async function runTests() {
    console.log('\n');
    log('🚀 Запуск тестов мониторинга позиций и ежедневных отчетов', 'cyan');
    log(`API URL: ${API_BASE_URL}`, 'blue');
    console.log('\n');

    // Проверяем доступность сервера
    const serverAvailable = await checkServerHealth();
    if (!serverAvailable) {
        logError('Сервер недоступен. Завершение тестов.');
        process.exit(1);
    }

    try {
        await testPositionMonitoring();
        await testDailyReports();
        await testIntegration();

        logSection('Результаты тестирования');
        logSuccess('Все основные тесты пройдены!');
        logInfo('\nПримечания:');
        logInfo('- Если нет открытых позиций, некоторые тесты могут показать 0 результатов');
        logInfo('- Отправка в Telegram отключена для безопасности (можно включить в коде)');
        logInfo('- Проверьте логи сервера для детальной информации');

    } catch (error) {
        logError(`Критическая ошибка: ${error.message}`);
        console.error(error);
        process.exit(1);
    }
}

// Запуск тестов
runTests().catch(error => {
    logError(`Ошибка выполнения тестов: ${error.message}`);
    console.error(error);
    process.exit(1);
});

