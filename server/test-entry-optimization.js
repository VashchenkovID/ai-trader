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

async function testEntryOptimization() {
    logSection('🧪 ТЕСТИРОВАНИЕ ENTRY OPTIMIZATION SERVICE');
    
    logInfo(`API URL: ${API_URL}\n`);
    
    // Проверяем доступность сервера
    logInfo('Проверяем доступность сервера...');
    const isAvailable = await checkServerAvailability();
    
    if (!isAvailable) {
        logError('Сервер недоступен. Убедитесь, что сервер запущен на порту 3001');
        return;
    }
    
    logSuccess('Сервер доступен\n');
    
    // Тест 1: Получение настроек Entry Optimization
    logSection('Тест 1: Получение настроек Entry Optimization');
    try {
        // Сначала проверим, есть ли endpoint для настроек
        // Если нет, попробуем через общий endpoint настроек
        logInfo('Проверяем настройки через общий endpoint...');
        
        // Для тестирования создадим тестовый сигнал
        logInfo('Создаем тестовый сигнал для анализа...');
        
        // Получаем список рекомендаций для тестирования
        const recommendationsResponse = await axios.get(`${API_URL}/recommendations?limit=1`);
        
        // Обрабатываем разные форматы ответа
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
            
            logSuccess(`Найдена рекомендация для тестирования: ${recommendation.ticker || recommendation.figi}`);
            logInfo(`FIGI: ${recommendation.figi}`);
            logInfo(`Рекомендация: ${recommendation.recommendation}`);
            logInfo(`Уверенность: ${(recommendation.confidence * 100).toFixed(2)}%`);
            logInfo(`Оценка: ${(recommendation.score * 100).toFixed(2)}%`);
            
            // Тест 2: Создание торговой заявки с анализом входа
            logSection('Тест 2: Создание торговой заявки с анализом входа');
            
            try {
                logInfo('Создаем торговую заявку (будет автоматически проанализирован вход)...');
                
                const createRequestResponse = await axios.post(`${API_URL}/trading-requests/create`, {
                    recommendationFigi: recommendation.figi,
                    options: {
                        // Не форсируем вход, чтобы увидеть рекомендации оптимизации
                        forceEntry: false
                    }
                });
                
                if (createRequestResponse.data) {
                    const tradingRequest = createRequestResponse.data;
                    
                    logSuccess('Торговая заявка создана');
                    logInfo(`ID заявки: ${tradingRequest.id}`);
                    logInfo(`FIGI: ${tradingRequest.figi}`);
                    logInfo(`Действие: ${tradingRequest.action}`);
                    logInfo(`Цена: ${tradingRequest.priceAtRequest}`);
                    logInfo(`Уверенность: ${(tradingRequest.confidence * 100).toFixed(2)}%`);
                    
                    // Проверяем информацию об оптимизации входа
                    if (tradingRequest.entryOptimization) {
                        logSuccess('\n📊 Информация об оптимизации входа:');
                        logInfo(`Можно входить: ${tradingRequest.entryOptimization.canEnter ? 'Да' : 'Нет'}`);
                        logInfo(`Подтверждающих индикаторов: ${tradingRequest.entryOptimization.confirmingIndicators || 0}`);
                        logInfo(`Тип ордера: ${tradingRequest.entryOptimization.orderType || 'market'}`);
                        
                        if (tradingRequest.entryOptimization.indicators) {
                            logInfo('\n📈 Анализ индикаторов:');
                            
                            if (tradingRequest.entryOptimization.indicators.rsi) {
                                const rsi = tradingRequest.entryOptimization.indicators.rsi;
                                logInfo(`  RSI: ${rsi.value?.toFixed(2) || 'N/A'} - ${rsi.reason}`);
                                logInfo(`    Подтверждает: ${rsi.confirms ? '✅' : '❌'}`);
                            }
                            
                            if (tradingRequest.entryOptimization.indicators.macd) {
                                const macd = tradingRequest.entryOptimization.indicators.macd;
                                logInfo(`  MACD: ${macd.value?.toFixed(4) || 'N/A'} - ${macd.reason}`);
                                logInfo(`    Подтверждает: ${macd.confirms ? '✅' : '❌'}`);
                            }
                            
                            if (tradingRequest.entryOptimization.indicators.bollinger) {
                                const bb = tradingRequest.entryOptimization.indicators.bollinger;
                                logInfo(`  Bollinger Bands: ${bb.reason}`);
                                logInfo(`    Подтверждает: ${bb.confirms ? '✅' : '❌'}`);
                            }
                            
                            if (tradingRequest.entryOptimization.indicators.volume) {
                                const volume = tradingRequest.entryOptimization.indicators.volume;
                                logInfo(`  Объем: ${volume.reason}`);
                                logInfo(`    Достаточен: ${volume.sufficient ? '✅' : '❌'}`);
                            }
                            
                            if (tradingRequest.entryOptimization.indicators.correction) {
                                const correction = tradingRequest.entryOptimization.indicators.correction;
                                logInfo(`  Коррекция: ${correction.reason}`);
                                logInfo(`    Нужно ждать: ${correction.shouldWait ? '⏳' : '✅'}`);
                                if (correction.shouldWait) {
                                    logInfo(`    Целевая цена: ${correction.targetPrice?.toFixed(2) || 'N/A'}`);
                                }
                            }
                        }
                    } else {
                        logWarning('Информация об оптимизации входа отсутствует (возможно, сервис не инициализирован)');
                    }
                    
                    // Проверяем reasoning
                    if (tradingRequest.reasoning) {
                        logInfo('\n📝 Обоснование заявки:');
                        console.log(tradingRequest.reasoning);
                    }
                    
                    // Удаляем тестовую заявку
                    logInfo('\nУдаляем тестовую заявку...');
                    try {
                        await axios.delete(`${API_URL}/trading-requests/${tradingRequest.id}`);
                        logSuccess('Тестовая заявка удалена');
                    } catch (deleteError) {
                        logWarning(`Не удалось удалить тестовую заявку: ${deleteError.message}`);
                    }
                }
            } catch (createError) {
                if (createError.response) {
                    logError(`Ошибка создания заявки: ${createError.response.status} ${createError.response.statusText}`);
                    logError(`Сообщение: ${createError.response.data?.message || createError.response.data?.error || 'Unknown error'}`);
                    
                    // Если ошибка связана с ожиданием коррекции - это нормально
                    if (createError.response.data?.message?.includes('Ожидание коррекции') || 
                        createError.response.data?.message?.includes('Вход не рекомендуется')) {
                        logSuccess('✅ Сервис работает корректно - рекомендует подождать коррекции');
                        logInfo(`Причина: ${createError.response.data.message}`);
                    }
                } else {
                    logError(`Ошибка создания заявки: ${createError.message}`);
                }
            }
        } else {
            logWarning('Нет доступных рекомендаций для тестирования');
            logInfo('Создаем тестовый сигнал вручную...');
            
            // Тест 3: Прямой анализ входа через endpoint
            logSection('Тест 3: Прямой анализ входа');
            logInfo('Тестируем Entry Optimization Service напрямую...');
            
            try {
                // Используем фиксированный FIGI для тестирования (SBER)
                const testFigi = 'BBG004730N88'; // SBER
                let testPrice = 300;
                
                // Пытаемся получить текущую цену (если endpoint существует)
                // Если нет - используем тестовую цену
                try {
                    // Пробуем разные варианты endpoints
                    let priceResponse = null;
                    try {
                        priceResponse = await axios.get(`${API_URL}/market/last-prices?figis=${testFigi}`);
                    } catch (e1) {
                        try {
                            priceResponse = await axios.post(`${API_URL}/market/last-prices`, { figis: [testFigi] });
                        } catch (e2) {
                            // Игнорируем, используем тестовую цену
                        }
                    }
                    
                    if (priceResponse && priceResponse.data) {
                        const data = priceResponse.data.data || priceResponse.data;
                        if (data && Array.isArray(data) && data.length > 0) {
                            testPrice = data[0].price || data[0].lastPrice || testPrice;
                        } else if (data && data[testFigi]) {
                            testPrice = data[testFigi].price || data[testFigi].lastPrice || testPrice;
                        }
                    }
                } catch (priceError) {
                    // Используем тестовую цену
                }
                
                logInfo(`Используем FIGI: ${testFigi}, цена: ${testPrice}`);
                
                // Тестируем анализ входа для BUY
                logInfo('\nТестируем анализ входа для BUY...');
                const buyAnalysisResponse = await axios.post(`${API_URL}/trading-requests/test-entry-optimization`, {
                    figi: testFigi,
                    action: 'BUY',
                    price: testPrice,
                    confidence: 0.75,
                    score: 0.8
                });
                
                if (buyAnalysisResponse.data && buyAnalysisResponse.data.success) {
                    const analysis = buyAnalysisResponse.data.data;
                    logSuccess('✅ Анализ входа выполнен успешно');
                    logInfo(`Можно входить: ${analysis.canEnter ? 'Да' : 'Нет'}`);
                    logInfo(`Рекомендация: ${analysis.recommendation}`);
                    logInfo(`Причина: ${analysis.reason}`);
                    logInfo(`Подтверждающих индикаторов: ${analysis.confirmingIndicators || 0}`);
                    logInfo(`Тип ордера: ${analysis.orderType || 'market'}`);
                    logInfo(`Рекомендуемая цена: ${analysis.recommendedPrice?.toFixed(2) || 'N/A'}`);
                    
                    if (analysis.indicators) {
                        logInfo('\n📈 Детали индикаторов:');
                        if (analysis.indicators.rsi) {
                            logInfo(`  RSI: ${analysis.indicators.rsi.value?.toFixed(2) || 'N/A'} - ${analysis.indicators.rsi.reason}`);
                        }
                        if (analysis.indicators.macd) {
                            logInfo(`  MACD: ${analysis.indicators.macd.value?.toFixed(4) || 'N/A'} - ${analysis.indicators.macd.reason}`);
                        }
                        if (analysis.indicators.bollinger) {
                            logInfo(`  Bollinger Bands: ${analysis.indicators.bollinger.reason}`);
                        }
                        if (analysis.indicators.volume) {
                            logInfo(`  Объем: ${analysis.indicators.volume.reason}`);
                        }
                    }
                } else {
                    logError('Не удалось получить анализ входа');
                }
            } catch (testError) {
                if (testError.response) {
                    logError(`Ошибка тестирования: ${testError.response.status} ${testError.response.statusText}`);
                    logError(`Сообщение: ${testError.response.data?.message || testError.response.data?.error || 'Unknown error'}`);
                } else {
                    logError(`Ошибка тестирования: ${testError.message}`);
                }
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
    logInfo('Если вы видите информацию об оптимизации входа в заявке - сервис работает корректно.');
}

// Запуск тестов
testEntryOptimization().catch(error => {
    logError(`Критическая ошибка: ${error.message}`);
    console.error(error);
    process.exit(1);
});

