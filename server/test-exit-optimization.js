import axios from 'axios';

const API_URL = process.env.API_URL || 'http://localhost:3001/api';

// Цвета для консоли
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function logInfo(message) {
    console.log(`${colors.cyan}ℹ️  ${message}${colors.reset}`);
}

function logSuccess(message) {
    console.log(`${colors.green}✅ ${message}${colors.reset}`);
}

function logError(message) {
    console.log(`${colors.red}❌ ${message}${colors.reset}`);
}

function logWarning(message) {
    console.log(`${colors.yellow}⚠️  ${message}${colors.reset}`);
}

function logSection(title) {
    console.log(`\n${colors.bright}${colors.blue}${'='.repeat(60)}${colors.reset}`);
    console.log(`${colors.bright}${colors.blue}${title}${colors.reset}`);
    console.log(`${colors.bright}${colors.blue}${'='.repeat(60)}${colors.reset}\n`);
}

async function checkServerAvailability() {
    try {
        const response = await axios.get(`${API_URL}/settings`);
        return response.status === 200;
    } catch (error) {
        return false;
    }
}

async function testExitOptimization() {
    logSection('🧪 ТЕСТИРОВАНИЕ EXIT OPTIMIZATION SERVICE');
    
    logInfo(`API URL: ${API_URL}\n`);
    
    // Проверяем доступность сервера
    logInfo('Проверяем доступность сервера...');
    const isAvailable = await checkServerAvailability();
    
    if (!isAvailable) {
        logError('Сервер недоступен. Убедитесь, что сервер запущен на порту 3001');
        return;
    }
    
    logSuccess('Сервер доступен\n');
    
    // Тест 1: Получение открытых позиций для тестирования
    logSection('Тест 1: Поиск открытых позиций');
    try {
        logInfo('Получаем список открытых позиций...');
        
        // Получаем выполненные заявки (открытые позиции)
        const positionsResponse = await axios.get(`${API_URL}/trading-requests?status=EXECUTED&limit=5`);
        
        let positions = [];
        if (positionsResponse.data) {
            if (Array.isArray(positionsResponse.data)) {
                positions = positionsResponse.data;
            } else if (positionsResponse.data.data && Array.isArray(positionsResponse.data.data)) {
                positions = positionsResponse.data.data;
            } else if (positionsResponse.data.success && positionsResponse.data.data) {
                positions = Array.isArray(positionsResponse.data.data) 
                    ? positionsResponse.data.data 
                    : [];
            }
        }
        
        if (positions.length === 0) {
            logWarning('Нет открытых позиций для тестирования');
            logInfo('Создаем тестовую позицию...');
            
            // Пытаемся создать тестовую позицию через рекомендацию
            const recommendationsResponse = await axios.get(`${API_URL}/recommendations?limit=1`);
            let recommendations = [];
            if (recommendationsResponse.data) {
                if (Array.isArray(recommendationsResponse.data)) {
                    recommendations = recommendationsResponse.data;
                } else if (recommendationsResponse.data.data && Array.isArray(recommendationsResponse.data.data)) {
                    recommendations = recommendationsResponse.data.data;
                } else if (recommendationsResponse.data.success && recommendationsResponse.data.data) {
                    recommendations = Array.isArray(recommendationsResponse.data.data) 
                        ? recommendationsResponse.data.data 
                        : [];
                }
            }
            
            if (recommendations.length > 0) {
                const recommendation = recommendations[0];
                logInfo(`Создаем тестовую заявку из рекомендации: ${recommendation.ticker || recommendation.figi}`);
                
                try {
                    const createResponse = await axios.post(`${API_URL}/trading-requests/create`, {
                        recommendationFigi: recommendation.figi,
                        options: { forceEntry: true }
                    });
                    
                    if (createResponse.data && createResponse.data.id) {
                        // Одобряем и выполняем заявку
                        const requestId = createResponse.data.id;
                        logInfo(`Одобряем заявку ${requestId}...`);
                        
                        try {
                            await axios.post(`${API_URL}/trading-requests/${requestId}/approve`);
                            logInfo(`Выполняем заявку ${requestId}...`);
                            await axios.post(`${API_URL}/trading-requests/${requestId}/execute`);
                            logSuccess('Тестовая позиция создана и выполнена');
                            
                            // Получаем обновленный список
                            const updatedResponse = await axios.get(`${API_URL}/trading-requests?status=EXECUTED&limit=1`);
                            if (updatedResponse.data && updatedResponse.data.data) {
                                positions = Array.isArray(updatedResponse.data.data) ? updatedResponse.data.data : [];
                            }
                        } catch (execError) {
                            logWarning(`Не удалось выполнить заявку: ${execError.message}`);
                        }
                    }
                } catch (createError) {
                    logWarning(`Не удалось создать тестовую заявку: ${createError.message}`);
                }
            }
        }
        
        if (positions.length > 0) {
            const testPosition = positions[0];
            logSuccess(`Найдена позиция для тестирования: ${testPosition.ticker || testPosition.figi}`);
            logInfo(`ID позиции: ${testPosition.id}`);
            logInfo(`FIGI: ${testPosition.figi}`);
            logInfo(`Действие: ${testPosition.action}`);
            logInfo(`Цена входа: ${testPosition.priceAtRequest || testPosition.actualPrice}`);
            logInfo(`Уверенность: ${(testPosition.confidence * 100).toFixed(2)}%`);
            
            // Тест 2: Прямой анализ выхода
            logSection('Тест 2: Прямой анализ выхода');
            logInfo('Тестируем Exit Optimization Service...');
            
            try {
                const analysisResponse = await axios.post(`${API_URL}/trading-requests/test-exit-optimization`, {
                    positionId: testPosition.id,
                    options: {}
                });
                
                if (analysisResponse.data && analysisResponse.data.success) {
                    const analysis = analysisResponse.data.data;
                    
                    logSuccess('✅ Анализ выхода выполнен успешно');
                    logInfo(`Нужно выходить: ${analysis.shouldExit ? 'Да' : 'Нет'}`);
                    logInfo(`Рекомендуется рассмотреть выход: ${analysis.shouldConsiderExit ? 'Да' : 'Нет'}`);
                    logInfo(`Рекомендация: ${analysis.recommendation}`);
                    logInfo(`Приоритет: ${analysis.priority || 'N/A'}`);
                    logInfo(`Причина: ${analysis.reason}`);
                    
                    if (analysis.exitReasons && analysis.exitReasons.length > 0) {
                        logInfo('\n🚨 Критические причины для выхода:');
                        analysis.exitReasons.forEach((reason, index) => {
                            logInfo(`  ${index + 1}. ${reason}`);
                        });
                    }
                    
                    if (analysis.warnings && analysis.warnings.length > 0) {
                        logInfo('\n⚠️  Предупреждения:');
                        analysis.warnings.forEach((warning, index) => {
                            logInfo(`  ${index + 1}. ${warning}`);
                        });
                    }
                    
                    if (analysis.analysis) {
                        logInfo('\n📊 Детальный анализ:');
                        
                        if (analysis.analysis.timeHorizon) {
                            const th = analysis.analysis.timeHorizon;
                            logInfo(`  Временной горизонт: ${th.reason}`);
                            if (th.daysUntilExit !== undefined) {
                                logInfo(`    Дней до окончания: ${th.daysUntilExit}`);
                            }
                        }
                        
                        if (analysis.analysis.confidence) {
                            const conf = analysis.analysis.confidence;
                            logInfo(`  Уверенность: ${conf.reason}`);
                            if (conf.currentConfidence !== undefined) {
                                logInfo(`    Текущая: ${(conf.currentConfidence * 100).toFixed(1)}%`);
                            }
                            if (conf.originalConfidence !== undefined) {
                                logInfo(`    Исходная: ${(conf.originalConfidence * 100).toFixed(1)}%`);
                            }
                        }
                        
                        if (analysis.analysis.recommendation) {
                            const rec = analysis.analysis.recommendation;
                            logInfo(`  Рекомендация AI: ${rec.reason}`);
                        }
                        
                        if (analysis.analysis.stopLoss) {
                            const sl = analysis.analysis.stopLoss;
                            logInfo(`  Стоп-лосс: ${sl.reason}`);
                        }
                        
                        if (analysis.analysis.tax) {
                            const tax = analysis.analysis.tax;
                            logInfo(`  Налоги: ${tax.reason}`);
                        }
                    }
                    
                    if (analysis.suggestedExitPrice) {
                        logInfo(`\n💰 Рекомендуемая цена выхода: ${analysis.suggestedExitPrice.toFixed(2)}`);
                    }
                    
                    if (analysis.suggestedExitPercent !== null && analysis.suggestedExitPercent !== undefined) {
                        const profitColor = analysis.suggestedExitPercent >= 0 ? colors.green : colors.red;
                        logInfo(`📈 Прибыль/убыток при выходе: ${profitColor}${analysis.suggestedExitPercent.toFixed(2)}%${colors.reset}`);
                    }
                } else {
                    logError('Не удалось получить анализ выхода');
                }
            } catch (testError) {
                if (testError.response) {
                    logError(`Ошибка тестирования: ${testError.response.status} ${testError.response.statusText}`);
                    logError(`Сообщение: ${testError.response.data?.message || testError.response.data?.error || 'Unknown error'}`);
                    
                    if (testError.response.status === 404) {
                        logWarning('Endpoint для тестирования не найден. Возможно, нужно добавить его в routes.');
                    }
                } else {
                    logError(`Ошибка тестирования: ${testError.message}`);
                }
            }
        } else {
            logWarning('Нет доступных позиций для тестирования');
            logInfo('Создаем тестовый анализ с мок-данными...');
            
            // Тест 3: Тестирование с мок-данными
            logSection('Тест 3: Тестирование с мок-данными');
            
            // Сценарий 1: Позиция с истекшим временным горизонтом
            logInfo('\n📋 Сценарий 1: Позиция с истекшим временным горизонтом');
            try {
                const entryDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000); // 100 дней назад
                const expectedExitDate = new Date(entryDate);
                expectedExitDate.setDate(expectedExitDate.getDate() + 30); // Ожидаемый выход через 30 дней (уже прошел)
                
                const mockPosition1 = {
                    id: 'test-position-1',
                    figi: 'BBG004730N88',
                    ticker: 'SBER',
                    name: 'Сбербанк',
                    action: 'BUY',
                    priceAtRequest: 300,
                    actualPrice: 300,
                    confidence: 0.7,
                    score: 0.7,
                    stopLoss: 285,
                    createdAt: entryDate.toISOString(),
                    status: 'EXECUTED',
                    tradingMode: 'paper'
                };
                
                const analysis1 = await axios.post(`${API_URL}/trading-requests/test-exit-optimization`, {
                    mockPosition: mockPosition1,
                    options: {
                        currentPrice: 320,
                        mockPositionStrategy: {
                            entryDate: entryDate.toISOString(),
                            expectedExitDate: expectedExitDate.toISOString(),
                            targetTimeframe: 30
                        }
                    }
                });
                
                if (analysis1.data && analysis1.data.success) {
                    const result = analysis1.data.data;
                    logSuccess('✅ Анализ выполнен');
                    logInfo(`Нужно выходить: ${result.shouldExit ? 'Да' : 'Нет'}`);
                    logInfo(`Причина: ${result.reason}`);
                    if (result.analysis && result.analysis.timeHorizon) {
                        logInfo(`Временной горизонт: ${result.analysis.timeHorizon.reason}`);
                    }
                }
            } catch (error) {
                logError(`Ошибка: ${error.message}`);
            }
            
            // Сценарий 2: Позиция с упавшей уверенностью
            logInfo('\n📋 Сценарий 2: Позиция с упавшей уверенностью');
            try {
                const mockPosition2 = {
                    id: 'test-position-2',
                    figi: 'BBG004730N88',
                    ticker: 'SBER',
                    name: 'Сбербанк',
                    action: 'BUY',
                    priceAtRequest: 300,
                    actualPrice: 300,
                    confidence: 0.8, // Исходная высокая уверенность
                    score: 0.8,
                    stopLoss: 285,
                    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 дней назад
                    status: 'EXECUTED',
                    tradingMode: 'paper'
                };
                
                // Создаем рекомендацию с низкой уверенностью (для теста)
                // В реальности это будет получено из БД
                const analysis2 = await axios.post(`${API_URL}/trading-requests/test-exit-optimization`, {
                    mockPosition: mockPosition2,
                    options: {
                        currentPrice: 310,
                        // Симулируем низкую уверенность через мок-рекомендацию
                        mockRecommendation: {
                            confidence: 0.3, // Упала с 0.8 до 0.3
                            score: 0.4,
                            recommendation: 'SELL' // Рекомендация изменилась на SELL
                        },
                        // Исходная рекомендация при входе
                        mockOriginalRecommendation: {
                            confidence: 0.8,
                            score: 0.8
                        }
                    }
                });
                
                if (analysis2.data && analysis2.data.success) {
                    const result = analysis2.data.data;
                    logSuccess('✅ Анализ выполнен');
                    logInfo(`Нужно выходить: ${result.shouldExit ? 'Да' : 'Нет'}`);
                    logInfo(`Причина: ${result.reason}`);
                    if (result.analysis && result.analysis.confidence) {
                        logInfo(`Уверенность: ${result.analysis.confidence.reason}`);
                    }
                }
            } catch (error) {
                logError(`Ошибка: ${error.message}`);
            }
            
            // Сценарий 3: Позиция в норме
            logInfo('\n📋 Сценарий 3: Позиция в норме (не нужно выходить)');
            try {
                const mockPosition3 = {
                    id: 'test-position-3',
                    figi: 'BBG004730N88',
                    ticker: 'SBER',
                    name: 'Сбербанк',
                    action: 'BUY',
                    priceAtRequest: 300,
                    actualPrice: 300,
                    confidence: 0.7,
                    score: 0.7,
                    stopLoss: 285,
                    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 дней назад
                    status: 'EXECUTED',
                    tradingMode: 'paper'
                };
                
                const analysis3 = await axios.post(`${API_URL}/trading-requests/test-exit-optimization`, {
                    mockPosition: mockPosition3,
                    options: {
                        currentPrice: 315
                    }
                });
                
                if (analysis3.data && analysis3.data.success) {
                    const result = analysis3.data.data;
                    logSuccess('✅ Анализ выполнен');
                    logInfo(`Нужно выходить: ${result.shouldExit ? 'Да' : 'Нет'}`);
                    logInfo(`Рекомендация: ${result.recommendation}`);
                    logInfo(`Причина: ${result.reason}`);
                }
            } catch (error) {
                logError(`Ошибка: ${error.message}`);
            }
        }
        
    } catch (error) {
        logError(`Ошибка при тестировании: ${error.message}`);
        if (error.response) {
            logError(`Статус: ${error.response.status}`);
            logError(`Данные: ${JSON.stringify(error.response.data, null, 2)}`);
        }
    }
    
    // Итоговый отчет
    logSection('📊 ИТОГОВЫЙ ОТЧЕТ');
    logSuccess('Тестирование завершено!');
    logInfo('\nПроверьте результаты выше для деталей.');
    logInfo('Если вы видите детальный анализ выхода - сервис работает корректно.');
}

// Запуск тестов
testExitOptimization().catch(error => {
    logError(`Критическая ошибка: ${error.message}`);
    console.error(error);
    process.exit(1);
});

