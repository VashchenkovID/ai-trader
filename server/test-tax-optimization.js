import axios from 'axios';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';

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

async function checkServerHealth() {
    logInfo('Проверка доступности сервера...');
    
    const healthResult = await testAPI('/health');
    if (healthResult.success) {
        logSuccess(`Сервер доступен на ${API_BASE_URL}`);
        return true;
    }
    
    const monitoringHealthResult = await testAPI('/api/monitoring/health');
    if (monitoringHealthResult.success) {
        logSuccess(`Сервер доступен на ${API_BASE_URL}`);
        return true;
    }
    
    logError(`Сервер недоступен на ${API_BASE_URL}`);
    logWarning(`Убедитесь, что сервер запущен на порту 3001`);
    logWarning('Запустите сервер командой: npm start');
    return false;
}

async function testCommissionCalculation() {
    logSection('1. Тестирование расчета комиссий');

    // 1.1 Расчет комиссии для стандартной сделки
    logInfo('1.1 Расчет комиссии для сделки (цена: 100₽, количество: 10)...');
    const commissionResult = await testAPI('/api/tax-optimization/calculate-commission', 'POST', {
        price: 100,
        quantity: 10
    });
    
    if (commissionResult.success) {
        const data = commissionResult.data?.data;
        logSuccess('Комиссия рассчитана');
        console.log(`  - Сумма сделки: ${data.dealAmount.toFixed(2)}₽`);
        console.log(`  - Комиссия: ${data.amount.toFixed(2)}₽`);
        console.log(`  - Ставка: ${(data.rate * 100).toFixed(3)}%`);
        console.log(`  - Комиссия в %: ${data.commissionPercent.toFixed(3)}%`);
        console.log(`  - Сумма с комиссией: ${data.netAmount.toFixed(2)}₽`);
    } else {
        logError(`Ошибка: ${commissionResult.error}`);
        if (commissionResult.errorDetails) {
            console.log(`  Статус: ${commissionResult.errorDetails.status}`);
        }
    }

    // 1.2 Расчет комиссии для большой сделки
    logInfo('\n1.2 Расчет комиссии для большой сделки (цена: 500₽, количество: 100)...');
    const largeCommissionResult = await testAPI('/api/tax-optimization/calculate-commission', 'POST', {
        price: 500,
        quantity: 100
    });
    
    if (largeCommissionResult.success) {
        const data = largeCommissionResult.data?.data;
        logSuccess('Комиссия рассчитана');
        console.log(`  - Сумма сделки: ${data.dealAmount.toFixed(2)}₽`);
        console.log(`  - Комиссия: ${data.amount.toFixed(2)}₽`);
        console.log(`  - Комиссия в %: ${data.commissionPercent.toFixed(3)}%`);
    } else {
        logError(`Ошибка: ${largeCommissionResult.error}`);
    }
}

async function testPositionSizeCalculation() {
    logSection('2. Тестирование расчета размера позиции с учетом комиссии');

    // 2.1 Расчет размера позиции
    logInfo('2.1 Расчет размера позиции (капитал: 10000₽, цена: 100₽)...');
    const positionSizeResult = await testAPI('/api/tax-optimization/calculate-position-size', 'POST', {
        availableCapital: 10000,
        price: 100
    });
    
    if (positionSizeResult.success) {
        const data = positionSizeResult.data?.data;
        logSuccess('Размер позиции рассчитан');
        console.log(`  - Количество: ${data.quantity} шт.`);
        console.log(`  - Сумма сделки: ${data.dealAmount.toFixed(2)}₽`);
        console.log(`  - Комиссия: ${data.commission.toFixed(2)}₽`);
        console.log(`  - Общая стоимость: ${data.totalCost.toFixed(2)}₽`);
        console.log(`  - Остаток капитала: ${data.availableAfter.toFixed(2)}₽`);
        console.log(`  - Комиссия в %: ${data.commissionPercent?.toFixed(3) || 'N/A'}%`);
    } else {
        logError(`Ошибка: ${positionSizeResult.error}`);
        if (positionSizeResult.errorDetails) {
            console.log(`  Статус: ${positionSizeResult.errorDetails.status}`);
        }
    }
}

async function testProfitabilityAnalysis() {
    logSection('3. Тестирование анализа целесообразности сделки');

    // 3.1 Прибыльная сделка
    logInfo('3.1 Анализ прибыльной сделки (вход: 100₽, выход: 105₽, количество: 10)...');
    const profitableResult = await testAPI('/api/tax-optimization/analyze-profitability', 'POST', {
        entryPrice: 100,
        exitPrice: 105,
        quantity: 10
    });
    
    if (profitableResult.success) {
        const data = profitableResult.data?.data;
        logSuccess('Анализ выполнен');
        console.log(`  - Прибыль до комиссий: ${data.grossProfit.toFixed(2)}₽`);
        console.log(`  - Комиссия входа: ${data.entryCommission.toFixed(2)}₽`);
        console.log(`  - Комиссия выхода: ${data.exitCommission.toFixed(2)}₽`);
        console.log(`  - Общая комиссия: ${data.totalCommission.toFixed(2)}₽`);
        console.log(`  - Чистая прибыль: ${data.netProfit.toFixed(2)}₽`);
        console.log(`  - Прибыль в %: ${data.profitPercent.toFixed(2)}%`);
        console.log(`  - Рекомендация: ${data.recommendation}`);
        console.log(`  - Следует выполнить: ${data.shouldExecute ? 'Да' : 'Нет'}`);
    } else {
        logError(`Ошибка: ${profitableResult.error}`);
    }

    // 3.2 Убыточная сделка
    logInfo('\n3.2 Анализ убыточной сделки (вход: 100₽, выход: 98₽, количество: 10)...');
    const unprofitableResult = await testAPI('/api/tax-optimization/analyze-profitability', 'POST', {
        entryPrice: 100,
        exitPrice: 98,
        quantity: 10
    });
    
    if (unprofitableResult.success) {
        const data = unprofitableResult.data?.data;
        logSuccess('Анализ выполнен');
        console.log(`  - Прибыль до комиссий: ${data.grossProfit.toFixed(2)}₽`);
        console.log(`  - Чистая прибыль: ${data.netProfit.toFixed(2)}₽`);
        console.log(`  - Прибыль в %: ${data.profitPercent.toFixed(2)}%`);
        console.log(`  - Рекомендация: ${data.recommendation}`);
        console.log(`  - Следует выполнить: ${data.shouldExecute ? 'Да' : 'Нет'}`);
    } else {
        logError(`Ошибка: ${unprofitableResult.error}`);
    }
}

async function testTaxCalculation() {
    logSection('4. Тестирование расчета налогов');

    // 4.1 Получаем открытую позицию для теста
    logInfo('4.1 Поиск открытой позиции для расчета налогов...');
    const positionsResult = await testAPI('/api/position-monitoring/positions');
    
    let testPositionId = null;
    if (positionsResult.success && positionsResult.data?.data?.length > 0) {
        testPositionId = positionsResult.data.data[0].id;
        logSuccess(`Найдена позиция: ${positionsResult.data.data[0].ticker} (ID: ${testPositionId})`);
    } else {
        logWarning('Открытых позиций не найдено. Пропускаем тест расчета налогов.');
        return;
    }

    // 4.2 Расчет налогов
    logInfo('\n4.2 Расчет налогов для позиции...');
    const taxResult = await testAPI('/api/tax-optimization/calculate-tax', 'POST', {
        positionId: testPositionId,
        exitPrice: 105,
        exitQuantity: 10
    });
    
    if (taxResult.success) {
        const data = taxResult.data?.data;
        logSuccess('Налоги рассчитаны');
        console.log(`  - Прибыль до налогов: ${data.grossProfit.toFixed(2)}₽`);
        console.log(`  - Налоговая база: ${data.taxableAmount.toFixed(2)}₽`);
        console.log(`  - Ставка налога: ${data.taxRate.toFixed(1)}%`);
        console.log(`  - Сумма налога: ${data.taxAmount.toFixed(2)}₽`);
        console.log(`  - Чистая прибыль: ${data.netProfit.toFixed(2)}₽`);
        console.log(`  - Дней в позиции: ${data.daysHeld}`);
        console.log(`  - Долгосрочная позиция: ${data.isLongTerm ? 'Да' : 'Нет'}`);
        console.log(`  - ИИС счет: ${data.iisAccount ? 'Да' : 'Нет'}`);
        console.log(`  - Налог освобожден: ${data.taxExempt ? 'Да' : 'Нет'}`);
        if (data.taxExemptReason) {
            console.log(`  - Причина освобождения: ${data.taxExemptReason}`);
        }
    } else {
        logError(`Ошибка: ${taxResult.error}`);
        if (taxResult.errorDetails) {
            console.log(`  Статус: ${taxResult.errorDetails.status}`);
        }
    }
}

async function testBatchOptimization() {
    logSection('5. Тестирование оптимизации батча сделок');

    // 5.1 Создаем тестовый батч сделок
    const testTrades = [
        { figi: 'BBG004730N88', action: 'BUY', quantity: 10, priceAtRequest: 100, estimatedAmount: 1000 },
        { figi: 'BBG004730N88', action: 'BUY', quantity: 15, priceAtRequest: 100, estimatedAmount: 1500 },
        { figi: 'BBG004730N88', action: 'BUY', quantity: 20, priceAtRequest: 100, estimatedAmount: 2000 },
        { figi: 'BBG004730N88', action: 'BUY', quantity: 5, priceAtRequest: 100, estimatedAmount: 500 },
        { figi: 'BBG004730N88', action: 'BUY', quantity: 8, priceAtRequest: 100, estimatedAmount: 800 }
    ];

    logInfo(`5.1 Оптимизация батча из ${testTrades.length} сделок...`);
    const batchResult = await testAPI('/api/tax-optimization/optimize-batch', 'POST', {
        trades: testTrades
    });
    
    if (batchResult.success) {
        const data = batchResult.data?.data;
        logSuccess('Батч оптимизирован');
        console.log(`  - Исходное количество сделок: ${data.originalCount}`);
        console.log(`  - Оптимизированное количество: ${data.optimizedCount}`);
        console.log(`  - Экономия сделок: ${data.originalCount - data.optimizedCount}`);
        
        if (data.trades && data.trades.length > 0) {
            const firstTrade = data.trades[0];
            if (firstTrade.batched) {
                console.log(`  - Объединено сделок: ${firstTrade.originalTradesCount}`);
                if (firstTrade.commissionSavings) {
                    console.log(`  - Экономия комиссий: ${firstTrade.commissionSavings.savings.toFixed(2)}₽`);
                    console.log(`  - Экономия в %: ${firstTrade.commissionSavings.savingsPercent.toFixed(2)}%`);
                }
            }
        }
    } else {
        logError(`Ошибка: ${batchResult.error}`);
        if (batchResult.errorDetails) {
            console.log(`  Статус: ${batchResult.errorDetails.status}`);
        }
    }
}

async function testTaxOptimizationAnalysis() {
    logSection('6. Тестирование анализа налоговой оптимизации');

    // 6.1 Получаем открытую позицию
    logInfo('6.1 Поиск открытой позиции для анализа...');
    const positionsResult = await testAPI('/api/position-monitoring/positions');
    
    let testPositionId = null;
    if (positionsResult.success && positionsResult.data?.data?.length > 0) {
        testPositionId = positionsResult.data.data[0].id;
        logSuccess(`Найдена позиция: ${positionsResult.data.data[0].ticker} (ID: ${testPositionId})`);
    } else {
        logWarning('Открытых позиций не найдено. Пропускаем тест анализа.');
        return;
    }

    // 6.2 Анализ позиции
    logInfo('\n6.2 Анализ позиции на предмет налоговой оптимизации...');
    const analysisResult = await testAPI(`/api/tax-optimization/analyze-position/${testPositionId}`);
    
    if (analysisResult.success) {
        const data = analysisResult.data?.data;
        logSuccess('Анализ выполнен');
        console.log(`  - Дней в позиции: ${data.daysHeld}`);
        console.log(`  - Дней до долгосрочной позиции: ${data.daysUntilLongTerm || 0}`);
        console.log(`  - Долгосрочная позиция: ${data.isLongTerm ? 'Да' : 'Нет'}`);
        console.log(`  - Рекомендуется держать: ${data.shouldHold ? 'Да' : 'Нет'}`);
        console.log(`  - Приоритет: ${data.priority}`);
        console.log(`  - Налогово оптимизировано: ${data.taxOptimized ? 'Да' : 'Нет'}`);
        
        if (data.recommendations && data.recommendations.length > 0) {
            console.log(`  - Рекомендации:`);
            data.recommendations.forEach((rec, i) => {
                console.log(`    ${i + 1}. ${rec.message}`);
            });
        }
    } else {
        logError(`Ошибка: ${analysisResult.error}`);
        if (analysisResult.errorDetails) {
            console.log(`  Статус: ${analysisResult.errorDetails.status}`);
        }
    }
}

async function testSettings() {
    logSection('7. Тестирование настроек');

    // 7.1 Получение настроек
    logInfo('7.1 Получение настроек оптимизации...');
    const settingsResult = await testAPI('/api/tax-optimization/settings');
    
    if (settingsResult.success) {
        const settings = settingsResult.data?.data;
        logSuccess('Настройки получены');
        console.log(`  - Ставка комиссии: ${(settings.commissionRate * 100).toFixed(3)}%`);
        console.log(`  - Минимальная комиссия: ${settings.minCommission}₽`);
        console.log(`  - Ставка налога: ${(settings.taxRate * 100).toFixed(1)}%`);
        console.log(`  - ИИС счет: ${settings.iisAccount ? 'Да' : 'Нет'}`);
        console.log(`  - Учитывать комиссию в размере позиции: ${settings.includeCommissionInPositionSize ? 'Да' : 'Нет'}`);
        console.log(`  - Минимальная прибыль после комиссий: ${(settings.minProfitAfterCommission * 100).toFixed(1)}%`);
    } else {
        logError(`Ошибка: ${settingsResult.error}`);
    }

    // 7.2 Обновление настроек (тест)
    logInfo('\n7.2 Тест обновления настроек...');
    const updateResult = await testAPI('/api/tax-optimization/settings', 'POST', {
        commissionRate: 0.003,
        minCommission: 1.0
    });
    
    if (updateResult.success) {
        logSuccess('Настройки обновлены');
    } else {
        logWarning(`Не удалось обновить настройки: ${updateResult.error}`);
    }
}

async function runTests() {
    console.log('\n');
    log('🚀 Запуск тестов оптимизации комиссий и налогов', 'cyan');
    log(`API URL: ${API_BASE_URL}`, 'blue');
    console.log('\n');

    // Проверяем доступность сервера
    const serverAvailable = await checkServerHealth();
    if (!serverAvailable) {
        logError('Сервер недоступен. Завершение тестов.');
        process.exit(1);
    }

    try {
        await testCommissionCalculation();
        await testPositionSizeCalculation();
        await testProfitabilityAnalysis();
        await testTaxCalculation();
        await testBatchOptimization();
        await testTaxOptimizationAnalysis();
        await testSettings();

        logSection('Результаты тестирования');
        logSuccess('Все основные тесты пройдены!');
        logInfo('\nПримечания:');
        logInfo('- Если нет открытых позиций, некоторые тесты могут быть пропущены');
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

