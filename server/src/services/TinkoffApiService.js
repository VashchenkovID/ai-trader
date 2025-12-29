import fetch from 'node-fetch';
import https from 'https';
import RetryService from './RetryService.js';
import FallbackService from './FallbackService.js';

const agent = new https.Agent({
    rejectUnauthorized: false
});

class TinkoffApiService {
    constructor() {
        this.baseUrl = process.env.TINKOFF_API_URL || 'https://invest-public-api.tinkoff.ru/rest';
        this.token = process.env.TINKOFF_TOKEN || 't.1234567890abcdef';
        this.requestDelay = 1000; // Задержка между запросами в мс (увеличено для избежания rate limiting)
        this.maxRetries = 5; // Увеличено количество повторов
        this.retryDelay = 2000; // Задержка перед повтором в мс (увеличено)
        this.lastRequestTime = 0;
        
    }

    async makeRequest(path, body = {}, retryCount = 0) {
        // Используем RetryService для автоматических повторов
        return await RetryService.executeWithRetry(async () => {
            try {
            // Добавляем задержку между запросами
            const timeSinceLastRequest = Date.now() - this.lastRequestTime;
            if (timeSinceLastRequest < this.requestDelay) {
                await RetryService.delay(this.requestDelay - timeSinceLastRequest);
            }

            const controller = new AbortController();
            // Увеличиваем таймаут для Shares endpoint, так как он может быть медленным
            const timeout = path.includes('/Shares') ? 60000 : 30000; // 60 секунд для Shares, 30 для остальных
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(`${this.baseUrl}${path}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body),
                agent: agent,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            this.lastRequestTime = Date.now();

            if (!response.ok) {
                const errorText = await response.text();
                
                // Обработка ошибки 404 (Not Found) - метод не существует или инструмент не найден
                if (response.status === 404) {
                    // Для GetInstrumentBy 404 - это нормально (инструмент не найден), не логируем
                    if (path.includes('GetInstrumentBy')) {
                        // Просто выбрасываем ошибку без логирования - она будет обработана в вызывающем коде
                        throw new Error(`HTTP error! status: 404, details: ${errorText}`);
                    }
                    // Для методов получения новостей это нормально - метод может не существовать
                    if (path.includes('News') || path.includes('GetNews')) {
                        throw new Error(`HTTP error! status: 404, details: ${errorText}`);
                    }
                    // Для других методов логируем ошибку
                    console.error('API Error details:', {
                        status: response.status,
                        statusText: response.statusText,
                        path: path,
                        body: body,
                        error: errorText
                    });
                    throw new Error(`HTTP error! status: ${response.status}, details: ${errorText}`);
                }
                
                // Все ошибки обрабатываются RetryService
                const error = new Error(`HTTP error! status: ${response.status}, details: ${errorText}`);
                error.status = response.status;
                error.statusCode = response.status;
                error.response = { status: response.status, statusText: response.statusText };
                throw error;
            }

            const data = await response.json();
            return data;
            } catch (error) {
                // Обработка таймаутов
                if (error.name === 'AbortError') {
                    const timeoutError = new Error('Request timeout - API server is not responding');
                    timeoutError.code = 'ETIMEDOUT';
                    throw timeoutError;
                }
                
                // Добавляем статус код для RetryService, если его нет
                if (!error.status && !error.statusCode && error.message && error.message.includes('status:')) {
                    const statusMatch = error.message.match(/status:\s*(\d+)/);
                    if (statusMatch) {
                        error.status = parseInt(statusMatch[1]);
                        error.statusCode = parseInt(statusMatch[1]);
                    }
                }
                
                // Не логируем 404 для GetInstrumentBy - это нормально (инструмент не найден)
                if (error.message && error.message.includes('404') && path.includes('GetInstrumentBy')) {
                    throw error;
                }
                
                // Специальная обработка для Shares endpoint
                if (path.includes('/Shares') && error.code === 'ECONNRESET') {
                    console.warn('⚠️ Shares endpoint returned ECONNRESET - this is a known issue with Tinkoff API');
                    console.warn('💡 Consider using cached data or alternative endpoints');
                }
                
                throw error;
            }
        }, {
            maxRetries: this.maxRetries,
            initialDelay: 2000,
            maxDelay: 30000,
            exponentialBase: 2,
            jitter: true,
            retryableStatusCodes: [429, 500, 502, 503, 504],
            retryableErrors: ['ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'timeout', 'AbortError'],
            serviceName: 'TinkoffAPI',
            circuitBreaker: true,
            onRetry: (attempt, delay, error) => {
                if (error.status === 429 || error.statusCode === 429) {
                    console.warn(`⚠️ Rate limit exceeded. Retrying in ${Math.round(delay/1000)}s... (attempt ${attempt}/${this.maxRetries})`);
                } else {
                    console.warn(`⚠️ Tinkoff API error. Retrying in ${Math.round(delay/1000)}s... (attempt ${attempt}/${this.maxRetries})`);
                }
            }
        });
    }

    // Вспомогательная функция для задержки
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Конвертация цены из формата Tinkoff API (units + nano) в число
     * @param {Object} priceObject - Объект с полями units (string) и nano (number)
     * @returns {number} - Цена как число
     */
    convertPriceToNumber(priceObject) {
        if (!priceObject) return 0;
        const units = parseFloat(priceObject.units || 0);
        const nano = parseFloat(priceObject.nano || 0);
        return units + nano / 1e9;
    }

    // Получение списка акций с пагинацией (с fallback на кеш)
    async getStocks() {
        return await FallbackService.executeWithFallback(
            // API запрос
            async () => {
                const response = await this.makeRequest('/tinkoff.public.invest.api.contract.v1.InstrumentsService/Shares', {
                    instrumentStatus: 'INSTRUMENT_STATUS_BASE'
                });

                const allInstruments = response?.instruments || [];
                console.log(`📊 Получено из API: ${allInstruments.length} инструментов`);

                // Сначала фильтруем по наличию обязательных полей
                const validInstruments = allInstruments.filter(inst => {
                    return inst && inst.figi && inst.ticker;
                });
                console.log(`✅ С FIGI и ticker: ${validInstruments.length} инструментов`);

                // Фильтруем только российские акции по стране и валюте
                const russianInstruments = validInstruments.filter(inst => {
                    const countryOfRisk = (inst.countryOfRisk || '').toUpperCase();
                    const countryOfRiskCode = (inst.countryOfRiskCode || '').toUpperCase();
                    const currency = (inst.currency || '').toUpperCase();
                    const exchange = (inst.exchange || '').toUpperCase();
                    
                    const hasRussianCountry = countryOfRisk === 'RU' || 
                                            countryOfRisk === 'RUS' ||
                                            countryOfRiskCode === 'RU' ||
                                            countryOfRiskCode === 'RUS';
                    
                    const isMoexExchange = exchange.includes('MOEX') || exchange.includes('MOSCOW');
                    const hasRussianCurrency = currency === 'RUB' || currency === 'RUR';
                    
                    const isRussian = (hasRussianCountry || isMoexExchange) && hasRussianCurrency;
                    return isRussian;
                });

                console.log(`🇷🇺 Российских акций после фильтрации по стране: ${russianInstruments.length}`);
                return { ...response, instruments: russianInstruments };
            },
            // Кеш запрос
            async () => {
                const CachedInstrument = (await import('../models/CachedInstrument.js')).default;
                const cached = await CachedInstrument.findAll({
                    where: { isActive: true },
                    limit: 1000
                });
                
                if (cached && cached.length > 0) {
                    return {
                        instruments: cached.map(inst => ({
                            figi: inst.figi,
                            ticker: inst.ticker,
                            name: inst.name,
                            currency: inst.currency,
                            exchange: inst.exchange,
                            countryOfRisk: inst.countryOfRisk,
                            countryOfRiskCode: inst.countryOfRiskCode,
                            lastUpdated: inst.lastUpdated
                        })),
                        _fromCache: true
                    };
                }
                return null;
            },
            {
                serviceName: 'TinkoffAPI',
                maxCacheAge: 24 * 60 * 60 * 1000, // 24 часа
                notifyUser: true
            }
        );
    }

    // Получение исторических свечей (с fallback на кеш)
    async getCandles(figi, from, to, interval = 'DAY') {
        // Проверяем и корректируем даты
        const fromDate = new Date(from);
        const toDate = new Date(to);

        // Если from >= to, корректируем на безопасный интервал
        if (fromDate >= toDate) {
            fromDate.setDate(toDate.getDate() - 31);
        }

        return await FallbackService.getCandlesWithFallback(figi, interval, fromDate, toDate);
    }

    // Получение последних цен
    async getLastPrices(figiList) {
        try {
            if (!Array.isArray(figiList) || figiList.length === 0) {
                return {lastPrices: []};
            }

            const response = await this.makeRequest('/tinkoff.public.invest.api.contract.v1.MarketDataService/GetLastPrices', {
                figi: figiList
            });

            return response;
        } catch (error) {
            console.error('Error getting last prices:', error);
            return {lastPrices: []};
        }
    }

    // Получение информации о дивидендах (ИСПРАВЛЕННЫЙ МЕТОД)
    async getDividends(figi) {
        try {
            // Правильный формат запроса для дивидендов
            const response = await this.makeRequest('/tinkoff.public.invest.api.contract.v1.InstrumentsService/GetDividends', {
                instrumentId: figi, // Используем instrumentId вместо id
                idType: 'INSTRUMENT_ID_TYPE_FIGI'
            });
            return response;
        } catch (error) {
            // Если это ошибка 429, не логируем как warning, а просто возвращаем пустой результат
            if (error.message.includes('Rate limit exceeded')) {
                console.log(`Skipping dividends for ${figi} due to rate limit`);
            } else {
                console.warn(`Could not get dividends for ${figi}:`, error.message);
            }
            return {dividends: []};
        }
    }

    // Получение информации по конкретному инструменту по FIGI (с fallback на кеш)
    async getInstrumentByFigi(figi) {
        return await FallbackService.executeWithFallback(
            // API запрос
            async () => {
                const response = await this.makeRequest('/tinkoff.public.invest.api.contract.v1.InstrumentsService/GetInstrumentBy', {
                    id: figi,
                    idType: 'INSTRUMENT_ID_TYPE_FIGI'
                });
                return response;
            },
            // Кеш запрос
            async () => {
                const CachedInstrument = (await import('../models/CachedInstrument.js')).default;
                const cached = await CachedInstrument.findOne({ where: { figi } });
                if (cached) {
                    return {
                        instrument: {
                            figi: cached.figi,
                            ticker: cached.ticker,
                            name: cached.name,
                            currency: cached.currency,
                            exchange: cached.exchange,
                            countryOfRisk: cached.countryOfRisk,
                            countryOfRiskCode: cached.countryOfRiskCode,
                            lastUpdated: cached.lastUpdated
                        }
                    };
                }
                return null;
            },
            {
                serviceName: 'TinkoffAPI',
                maxCacheAge: 24 * 60 * 60 * 1000,
                notifyUser: true,
                retryFirst: false // Для 404 не делаем retry
            }
        );
    }

    // Поиск инструмента через FindInstrument (более универсальный метод)
    async findInstrument(query) {
        try {
            const response = await this.makeRequest('/tinkoff.public.invest.api.contract.v1.InstrumentsService/FindInstrument', {
                query: query
            });

            // FindInstrument возвращает массив инструментов, берем первый результат
            if (response.instruments && response.instruments.length > 0) {
                return response.instruments[0];
            }
            
            return null;
        } catch (error) {
            // 404 - это нормально, инструмент просто не найден (не логируем как ошибку)
            if (error.message && error.message.includes('404')) {
                return null;
            }
            // Другие ошибки логируем
            console.warn(`⚠️ Ошибка поиска инструмента по запросу "${query}":`, error.message);
            return null;
        }
    }


    // Получение портфеля пользователя
    async getPortfolio(accountId = null) {
        try {
            const accountIdToUse = accountId || process.env.TINKOFF_ACCOUNT_ID;
            
            const response = await this.makeRequest('/tinkoff.public.invest.api.contract.v1.OperationsService/GetPortfolio', {
                accountId: accountIdToUse
            });
            
            const transformedData = this.transformPortfolioData(response);
            
            return transformedData;
        } catch (error) {
            console.error('Error getting portfolio:', error);
            // Возвращаем пустой портфель при ошибке
            return {
                totalAmountPortfolio: { value: 0, currency: 'RUB' },
                totalAmountCurrencies: [],
                expectedYield: { value: 0, currency: 'RUB' },
                expectedYieldCurrencies: [],
                positions: []
            };
        }
    }

    // Получение позиций портфеля
    async getPositions(accountId = null) {
        try {
            const accountIdToUse = accountId || process.env.TINKOFF_ACCOUNT_ID;
            
            const response = await this.makeRequest('/tinkoff.public.invest.api.contract.v1.OperationsService/GetPositions', {
                accountId: accountIdToUse
            });
            
            const transformedData = this.transformPositionsData(response);
            
            return transformedData;
        } catch (error) {
            console.error('Error getting positions:', error);
            return { positions: [] };
        }
    }

    // Получение операций по портфелю
    async getOperations(accountId = null, from = null, to = null, state = 'OPERATION_STATE_EXECUTED') {
        try {
            const fromDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 дней назад
            const toDate = to || new Date();

            const response = await this.makeRequest('/tinkoff.public.invest.api.contract.v1.OperationsService/GetOperations', {
                accountId: accountId || process.env.TINKOFF_ACCOUNT_ID,
                from: fromDate.toISOString(),
                to: toDate.toISOString(),
                state: state
            });

            return response;
        } catch (error) {
            console.error('Error getting operations:', error);
            return { operations: [] };
        }
    }

    // Получение информации о счетах
    async getAccounts() {
        try {
            console.log('🔍 Getting accounts from T-Bank API...');
            const response = await this.makeRequest('/tinkoff.public.invest.api.contract.v1.UsersService/GetAccounts', {});

            console.log(`📊 Raw accounts response:`, JSON.stringify(response, null, 2));
            
            // Обрабатываем ответ и показываем только нужную информацию
            const accounts = response.accounts || [];
            console.log(`📊 Found ${accounts.length} accounts:`);
            accounts.forEach((account, index) => {
                console.log(`  ${index + 1}. ID: ${account.id}`);
                console.log(`     Type: ${account.type}`);
                console.log(`     Name: ${account.name}`);
                console.log(`     Status: ${account.status}`);
                console.log(`     Access Level: ${account.accessLevel}`);
                console.log('     ---');
            });

            return response;
        } catch (error) {
            console.error('Error getting accounts:', error);
            return { accounts: [] };
        }
    }

    // Получение информации о пользователе
    async getUserInfo() {
        try {
            console.log('🔍 Getting user info from T-Bank API...');
            const response = await this.makeRequest('/tinkoff.public.invest.api.contract.v1.UsersService/GetInfo', {});

            console.log(`📊 Raw user info response:`, JSON.stringify(response, null, 2));
            
            if (response) {
                console.log(`👤 User info:`);
                console.log(`   Premium Status: ${response.premiumStatus || 'N/A'}`);
                console.log(`   Qual Status: ${response.qualStatus || 'N/A'}`);
                console.log(`   Tariff: ${response.tariff || 'N/A'}`);
            }

            return response;
        } catch (error) {
            console.error('Error getting user info:', error);
            return null;
        }
    }

    // Получение курсов валют
    async getCurrencies() {
        try {
            const response = await this.makeRequest('/tinkoff.public.invest.api.contract.v1.InstrumentsService/Currencies', {
                instrumentStatus: 'INSTRUMENT_STATUS_BASE'
            });

            return response;
        } catch (error) {
            console.error('Error getting currencies:', error);
            return { instruments: [] };
        }
    }

    // Получение облигаций
    async getBonds() {
        try {
            const response = await this.makeRequest('/tinkoff.public.invest.api.contract.v1.InstrumentsService/Bonds', {
                instrumentStatus: 'INSTRUMENT_STATUS_BASE'
            });

            return response;
        } catch (error) {
            console.error('Error getting bonds:', error);
            return { instruments: [] };
        }
    }

    // Получение ETF
    async getEtfs() {
        try {
            const response = await this.makeRequest('/tinkoff.public.invest.api.contract.v1.InstrumentsService/Etfs', {
                instrumentStatus: 'INSTRUMENT_STATUS_BASE'
            });

            return response;
        } catch (error) {
            console.error('Error getting ETFs:', error);
            return { instruments: [] };
        }
    }

    // Трансформация данных портфеля
    transformPortfolioData(tinkoffData) {
        return {
            totalAmountPortfolio: {
                value: tinkoffData.totalAmountPortfolio?.units || 0,
                currency: tinkoffData.totalAmountPortfolio?.currency || 'RUB'
            },
            totalAmountCurrencies: Array.isArray(tinkoffData.totalAmountCurrencies) 
                ? tinkoffData.totalAmountCurrencies.map(currency => ({
                    value: currency.units || 0,
                    currency: currency.currency || 'RUB'
                }))
                : [],
            expectedYield: {
                value: tinkoffData.expectedYield?.units || 0,
                currency: tinkoffData.expectedYield?.currency || 'RUB'
            },
            expectedYieldCurrencies: Array.isArray(tinkoffData.expectedYieldCurrencies) 
                ? tinkoffData.expectedYieldCurrencies.map(currency => ({
                    value: currency.units || 0,
                    currency: currency.currency || 'RUB'
                }))
                : [],
            positions: Array.isArray(tinkoffData.positions) 
                ? tinkoffData.positions.map(position => ({
                    figi: position.figi,
                    ticker: position.ticker,
                    instrumentType: position.instrumentType,
                    quantity: (() => {
                        const qty = position.quantity?.units || position.quantity || 0;
                        // Преобразуем в число, если это строка
                        return typeof qty === 'string' ? parseFloat(qty) || 0 : (typeof qty === 'number' ? qty : 0);
                    })(),
                    averagePositionPrice: {
                        value: (() => {
                            const val = position.averagePositionPrice?.units || 0;
                            return typeof val === 'string' ? parseFloat(val) || 0 : (typeof val === 'number' ? val : 0);
                        })(),
                        currency: position.averagePositionPrice?.currency || 'RUB'
                    },
                    expectedYield: {
                        value: (() => {
                            const val = position.expectedYield?.units || 0;
                            return typeof val === 'string' ? parseFloat(val) || 0 : (typeof val === 'number' ? val : 0);
                        })(),
                        currency: position.expectedYield?.currency || 'RUB'
                    },
                currentPrice: {
                    value: (() => {
                        const val = position.currentPrice?.units || 0;
                        return typeof val === 'string' ? parseFloat(val) || 0 : (typeof val === 'number' ? val : 0);
                    })(),
                    currency: position.currentPrice?.currency || 'RUB'
                },
                currentNkd: {
                    value: position.currentNkd?.units || 0,
                    currency: position.currentNkd?.currency || 'RUB'
                },
                varMargin: {
                    value: position.varMargin?.units || 0,
                    currency: position.varMargin?.currency || 'RUB'
                },
                expectedYieldFifo: {
                    value: position.expectedYieldFifo?.units || 0,
                    currency: position.expectedYieldFifo?.currency || 'RUB'
                }
                }))
                : []
        };
    }

    // Трансформация данных позиций
    transformPositionsData(tinkoffData) {
        return {
            positions: Array.isArray(tinkoffData.positions) 
                ? tinkoffData.positions.map(position => ({
                figi: position.figi,
                instrumentType: position.instrumentType,
                quantity: position.quantity?.units || 0,
                averagePositionPrice: {
                    value: position.averagePositionPrice?.units || 0,
                    currency: position.averagePositionPrice?.currency || 'RUB'
                },
                expectedYield: {
                    value: position.expectedYield?.units || 0,
                    currency: position.expectedYield?.currency || 'RUB'
                },
                currentPrice: {
                    value: position.currentPrice?.units || 0,
                    currency: position.currentPrice?.currency || 'RUB'
                },
                currentNkd: {
                    value: position.currentNkd?.units || 0,
                    currency: position.currentNkd?.currency || 'RUB'
                },
                varMargin: {
                    value: position.varMargin?.units || 0,
                    currency: position.varMargin?.currency || 'RUB'
                },
                expectedYieldFifo: {
                    value: position.expectedYieldFifo?.units || 0,
                    currency: position.expectedYieldFifo?.currency || 'RUB'
                }
                }))
                : [],
            money: Array.isArray(tinkoffData.money) 
                ? tinkoffData.money.map(money => ({
                    value: money.units || 0,
                    currency: money.currency || 'RUB'
                }))
                : [],
            blocked: Array.isArray(tinkoffData.blocked) 
                ? tinkoffData.blocked.map(blocked => ({
                    value: blocked.units || 0,
                    currency: blocked.currency || 'RUB'
                }))
                : [],
            securities: Array.isArray(tinkoffData.securities) 
                ? tinkoffData.securities.map(security => ({
                    figi: security.figi,
                    blocked: security.blocked || 0,
                    balance: security.balance || 0
                }))
                : [],
            futures: Array.isArray(tinkoffData.futures) 
                ? tinkoffData.futures.map(future => ({
                    figi: future.figi,
                    blocked: future.blocked || 0,
                    balance: future.balance || 0
                }))
                : [],
            options: Array.isArray(tinkoffData.options) 
                ? tinkoffData.options.map(option => ({
                    figi: option.figi,
                    blocked: option.blocked || 0,
                    balance: option.balance || 0
                }))
                : []
        };
    }

    // Получение торговых часов для инструмента
    async getTradingHours(figi) {
        try {
            const response = await this.makeRequest('/tinkoff.public.invest.api.contract.v1.InstrumentsService/TradingSchedules', {
                exchange: 'MOEX',
                from: new Date().toISOString(),
                to: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // +7 дней
            });

            // Ищем расписание для конкретного инструмента
            const schedule = response?.exchanges?.[0]?.days?.[0];
            if (schedule) {
                return {
                    nextOpen: schedule.startTime,
                    nextClose: schedule.endTime,
                    isTradingDay: schedule.isTradingDay
                };
            }

            return null;
        } catch (error) {
            console.error('Error getting trading hours:', error);
            return null;
        }
    }

    // ============================================================================
    // ТОРГОВЫЕ ОПЕРАЦИИ
    // ============================================================================

    /**
     * Размещение рыночного ордера
     */
    async placeMarketOrder(orderData) {
        try {
            const { symbol, action, quantity, accountId } = orderData;
            
            const response = await this.makeRequest('/tinkoff.public.invest.api.contract.v1.OrdersService/PostOrder', {
                figi: symbol,
                quantity: quantity,
                price: null, // Для рыночного ордера
                direction: action === 'BUY' ? 'ORDER_DIRECTION_BUY' : 'ORDER_DIRECTION_SELL',
                accountId: accountId || process.env.TINKOFF_ACCOUNT_ID,
                orderType: 'ORDER_TYPE_MARKET',
                orderId: `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            });

            return {
                success: true,
                orderId: response.orderId,
                executionReportStatus: response.executionReportStatus,
                lotsRequested: response.lotsRequested,
                lotsExecuted: response.lotsExecuted,
                initialOrderPrice: response.initialOrderPrice,
                executedOrderPrice: response.executedOrderPrice,
                totalOrderAmount: response.totalOrderAmount,
                initialCommission: response.initialCommission,
                executedCommission: response.executedCommission,
                aciValue: response.aciValue,
                figi: response.figi,
                direction: response.direction,
                initialSecurityPrice: response.initialSecurityPrice,
                stages: response.stages,
                serviceCommission: response.serviceCommission,
                currency: response.currency,
                orderType: response.orderType,
                orderDate: response.orderDate,
                instrumentUid: response.instrumentUid
            };
        } catch (error) {
            console.error('❌ Ошибка размещения рыночного ордера:', error);
            throw error;
        }
    }

    /**
     * Размещение лимитного ордера
     */
    async placeLimitOrder(orderData) {
        try {
            const { symbol, action, quantity, price, accountId } = orderData;
            
            const response = await this.makeRequest('/tinkoff.public.invest.api.contract.v1.OrdersService/PostOrder', {
                figi: symbol,
                quantity: quantity,
                price: {
                    units: Math.floor(price),
                    nano: Math.floor((price % 1) * 1e9)
                },
                direction: action === 'BUY' ? 'ORDER_DIRECTION_BUY' : 'ORDER_DIRECTION_SELL',
                accountId: accountId || process.env.TINKOFF_ACCOUNT_ID,
                orderType: 'ORDER_TYPE_LIMIT',
                orderId: `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            });

            return {
                success: true,
                orderId: response.orderId,
                executionReportStatus: response.executionReportStatus,
                lotsRequested: response.lotsRequested,
                lotsExecuted: response.lotsExecuted,
                initialOrderPrice: response.initialOrderPrice,
                executedOrderPrice: response.executedOrderPrice,
                totalOrderAmount: response.totalOrderAmount,
                initialCommission: response.initialCommission,
                executedCommission: response.executedCommission,
                aciValue: response.aciValue,
                figi: response.figi,
                direction: response.direction,
                initialSecurityPrice: response.initialSecurityPrice,
                stages: response.stages,
                serviceCommission: response.serviceCommission,
                currency: response.currency,
                orderType: response.orderType,
                orderDate: response.orderDate,
                instrumentUid: response.instrumentUid
            };
        } catch (error) {
            console.error('❌ Ошибка размещения лимитного ордера:', error);
            throw error;
        }
    }

    /**
     * Универсальный метод размещения ордера
     */
    async placeOrder(orderData) {
        try {
            const { orderType = 'LIMIT', ...rest } = orderData;
            
            if (orderType === 'MARKET') {
                return await this.placeMarketOrder(rest);
            } else {
                return await this.placeLimitOrder(rest);
            }
        } catch (error) {
            console.error('❌ Ошибка размещения ордера:', error);
            throw error;
        }
    }

    /**
     * Отмена ордера
     */
    async cancelOrder(orderId, accountId = null) {
        try {
            const response = await this.makeRequest('/tinkoff.public.invest.api.contract.v1.OrdersService/CancelOrder', {
                accountId: accountId || process.env.TINKOFF_ACCOUNT_ID,
                orderId: orderId
            });

            return {
                success: true,
                orderId: response.orderId,
                executionReportStatus: response.executionReportStatus
            };
        } catch (error) {
            console.error('❌ Ошибка отмены ордера:', error);
            throw error;
        }
    }

    /**
     * Получение активных ордеров
     */
    async getActiveOrders(accountId = null) {
        try {
            const response = await this.makeRequest('/tinkoff.public.invest.api.contract.v1.OrdersService/GetOrders', {
                accountId: accountId || process.env.TINKOFF_ACCOUNT_ID
            });

            return {
                orders: response.orders || []
            };
        } catch (error) {
            console.error('❌ Ошибка получения активных ордеров:', error);
            return { orders: [] };
        }
    }

    /**
     * Получение истории ордеров
     */
    async getOrderHistory(accountId = null, from = null, to = null) {
        try {
            const fromDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 дней назад
            const toDate = to || new Date();

            const response = await this.makeRequest('/tinkoff.public.invest.api.contract.v1.OrdersService/GetOrders', {
                accountId: accountId || process.env.TINKOFF_ACCOUNT_ID,
                from: fromDate.toISOString(),
                to: toDate.toISOString()
            });

            return {
                orders: response.orders || []
            };
        } catch (error) {
            console.error('❌ Ошибка получения истории ордеров:', error);
            return { orders: [] };
        }
    }

    /**
     * Получение статуса ордера
     */
    async getOrderStatus(orderId, accountId = null) {
        try {
            const response = await this.makeRequest('/tinkoff.public.invest.api.contract.v1.OrdersService/GetOrderState', {
                accountId: accountId || process.env.TINKOFF_ACCOUNT_ID,
                orderId: orderId
            });

            return {
                orderId: response.orderId,
                executionReportStatus: response.executionReportStatus,
                lotsRequested: response.lotsRequested,
                lotsExecuted: response.lotsExecuted,
                initialOrderPrice: response.initialOrderPrice,
                executedOrderPrice: response.executedOrderPrice,
                totalOrderAmount: response.totalOrderAmount,
                initialCommission: response.initialCommission,
                executedCommission: response.executedCommission,
                aciValue: response.aciValue,
                figi: response.figi,
                direction: response.direction,
                initialSecurityPrice: response.initialSecurityPrice,
                stages: response.stages,
                serviceCommission: response.serviceCommission,
                currency: response.currency,
                orderType: response.orderType,
                orderDate: response.orderDate,
                instrumentUid: response.instrumentUid
            };
        } catch (error) {
            console.error('❌ Ошибка получения статуса ордера:', error);
            throw error;
        }
    }

    /**
     * Получение информации о сделках
     */
    async getTrades(accountId = null, from = null, to = null) {
        try {
            const fromDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 дней назад
            const toDate = to || new Date();

            const response = await this.makeRequest('/tinkoff.public.invest.api.contract.v1.OperationsService/GetOperations', {
                accountId: accountId || process.env.TINKOFF_ACCOUNT_ID,
                from: fromDate.toISOString(),
                to: toDate.toISOString(),
                state: 'OPERATION_STATE_EXECUTED',
                operationTypes: ['OPERATION_TYPE_BUY', 'OPERATION_TYPE_SELL']
            });

            return {
                operations: response.operations || []
            };
        } catch (error) {
            console.error('❌ Ошибка получения сделок:', error);
            return { operations: [] };
        }
    }

    /**
     * Проверка доступности торговли
     */
    async isTradingAvailable() {
        try {
            const now = new Date();
            const tradingHours = await this.getTradingHours('BBG004730N88'); // SBER как пример
            
            if (!tradingHours) {
                return false;
            }

            const currentTime = now.toISOString();
            const isTradingDay = tradingHours.isTradingDay;
            const isWithinHours = currentTime >= tradingHours.nextOpen && currentTime <= tradingHours.nextClose;

            return isTradingDay && isWithinHours;
        } catch (error) {
            console.error('❌ Ошибка проверки доступности торговли:', error);
            return false;
        }
    }

    /**
     * Получение информации о комиссиях
     */
    async getCommissionInfo() {
        try {
            // Стандартные комиссии Тинькофф Инвестиции
            return {
                stockCommission: 0.003, // 0.3% за сделку с акциями
                minCommission: 1, // Минимальная комиссия 1 рубль
                currency: 'RUB'
            };
        } catch (error) {
            console.error('❌ Ошибка получения информации о комиссиях:', error);
            return {
                stockCommission: 0.003,
                minCommission: 1,
                currency: 'RUB'
            };
        }
    }

    /**
     * Расчет комиссии для сделки
     */
    calculateCommission(price, quantity, instrumentType = 'stock') {
        const commissionInfo = this.getCommissionInfo();
        const dealAmount = price * quantity;
        const commission = Math.max(dealAmount * commissionInfo.stockCommission, commissionInfo.minCommission);
        
        return {
            amount: commission,
            currency: commissionInfo.currency,
            rate: commissionInfo.stockCommission,
            dealAmount: dealAmount
        };
    }

    /**
     * Получение торговых сигналов для инструмента
     * Документация: https://developer.tbank.ru/invest/api/signal-service-get-signals
     * @param {string} figi - FIGI инструмента (или instrumentUid)
     * @param {Object} options - Опции запроса
     * @param {Date} options.from - Дата начала периода (опционально)
     * @param {Date} options.to - Дата окончания периода (опционально)
     * @param {string} options.direction - Направление сигнала (SIGNAL_DIRECTION_BUY, SIGNAL_DIRECTION_SELL, SIGNAL_DIRECTION_UNSPECIFIED)
     * @param {string} options.active - Статус сигнала (SIGNAL_STATE_ACTIVE, SIGNAL_STATE_CLOSED, SIGNAL_STATE_ALL)
     * @param {number} options.limit - Максимальное количество сигналов (по умолчанию 20)
     * @param {number} options.pageNumber - Номер страницы (по умолчанию 0)
     * @returns {Promise<Object>} - Объект с сигналами
     */
    async getSignals(figi, options = {}) {
        try {
            const path = '/tinkoff.public.invest.api.contract.v1.SignalService/GetSignals';
            
            // Формируем тело запроса
            const requestBody = {};
            
            // Пробуем использовать figi или instrumentUid
            // Сначала пробуем как figi, потом как instrumentUid
            const possibleBodies = [
                { figi: figi },
                { instrumentUid: figi }
            ];

            // Добавляем опциональные параметры
            if (options.from) {
                requestBody.from = options.from instanceof Date ? options.from.toISOString() : options.from;
            }
            if (options.to) {
                requestBody.to = options.to instanceof Date ? options.to.toISOString() : options.to;
            }
            if (options.direction) {
                requestBody.direction = options.direction;
            }
            if (options.active) {
                requestBody.active = options.active;
            }
            if (options.limit) {
                requestBody.paging = {
                    limit: options.limit,
                    pageNumber: options.pageNumber || 0
                };
            }

            for (const body of possibleBodies) {
                try {
                    const fullBody = { ...body, ...requestBody };
                    console.log(`🔍 Получаем сигналы через ${path} для ${Object.keys(body)[0]}: ${figi}`, 
                        options.from ? `с ${options.from.toISOString()}` : '', 
                        options.to ? `по ${options.to.toISOString()}` : '');
                    
                    const response = await this.makeRequest(path, fullBody);

                    console.log(`✅ Успешно получены сигналы: ${response.signals?.length || 0} сигналов`);
                    
                    return {
                        success: true,
                        path: path,
                        data: response
                    };
                } catch (error) {
                    // Если это ошибка валидации (не 404), значит метод существует, но формат неправильный
                    if (!error.message.includes('404') && !error.message.includes('Not Found')) {
                        console.warn(`⚠️ Ошибка при запросе с ${Object.keys(body)[0]}:`, error.message);
                        // Продолжаем пробовать другие форматы
                        continue;
                    }
                    // Если 404, значит метод не существует или формат неправильный
                    throw new Error(`Метод GetSignals не найден или неправильный формат запроса: ${error.message}`);
                }
            }

            throw new Error('Не удалось получить сигналы ни с одним форматом запроса');
            
        } catch (error) {
            console.error('❌ Ошибка получения сигналов:', error);
            return {
                success: false,
                error: error.message,
                details: error
            };
        }
    }

    /**
     * Получение списка активов через GetAssets
     * @param {Object} options - Опции запроса
     * @param {string} options.instrumentType - Тип инструмента (INSTRUMENT_TYPE_SHARE, INSTRUMENT_TYPE_BOND и т.д.)
     * @param {string} options.instrumentStatus - Статус инструмента (INSTRUMENT_STATUS_BASE, INSTRUMENT_STATUS_ALL)
     * @returns {Promise<Array>} - Массив активов
     */
    async getAssets(options = {}) {
        try {
            const {
                instrumentType = 'INSTRUMENT_TYPE_UNSPECIFIED',
                instrumentStatus = 'INSTRUMENT_STATUS_BASE'
            } = options;

            const response = await this.makeRequest(
                '/tinkoff.public.invest.api.contract.v1.InstrumentsService/GetAssets',
                {
                    instrumentType,
                    instrumentStatus
                }
            );

            return response.assets || [];
        } catch (error) {
            console.error('❌ Ошибка получения активов:', error);
            return [];
        }
    }

    /**
     * Получение фундаментальных показателей по активам
     * @param {Array<string>} assetIdentifiers - Массив идентификаторов активов (asset_uid, до 100 шт)
     * @returns {Promise<Array>} - Массив объектов с фундаментальными данными
     */
    async getAssetFundamentals(assetIdentifiers) {
        try {
            // Валидация входных данных
            if (!Array.isArray(assetIdentifiers)) {
                // Если передан один идентификатор как строка, преобразуем в массив
                if (typeof assetIdentifiers === 'string') {
                    assetIdentifiers = [assetIdentifiers];
                } else {
                    console.warn('⚠️ getAssetFundamentals: assetIdentifiers должен быть массивом или строкой');
                    return [];
                }
            }

            // Фильтруем только валидные строки
            const validIdentifiers = assetIdentifiers.filter(id => typeof id === 'string' && id.length > 0);
            
            if (validIdentifiers.length === 0) {
                console.warn('⚠️ getAssetFundamentals: нет валидных идентификаторов активов');
                return [];
            }

            // API принимает до 100 активов за раз
            if (validIdentifiers.length > 100) {
                console.warn(`⚠️ Слишком много активов (${validIdentifiers.length}), будет выполнено несколько запросов`);
                const results = [];
                for (let i = 0; i < validIdentifiers.length; i += 100) {
                    const batch = validIdentifiers.slice(i, i + 100);
                    const batchResults = await this.getAssetFundamentals(batch);
                    results.push(...batchResults);
                }
                return results;
            }

            // Формируем запрос - передаем идентификаторы активов
            // Request body: { "assets": ["asset_uid1", "asset_uid2", ...] }
            const response = await this.makeRequest(
                '/tinkoff.public.invest.api.contract.v1.InstrumentsService/GetAssetFundamentals',
                {
                    assets: validIdentifiers
                }
            );

            // Ответ содержит массив fundamentals
            return response.fundamentals || [];
        } catch (error) {
            console.error('❌ Ошибка получения фундаментальных данных:', error);
            return [];
        }
    }

    /**
     * Получение торговых сигналов для инструмента (альтернативный вариант с instrumentId)
     * @param {string} figi - FIGI инструмента
     * @returns {Promise<Object>} - Объект с сигналами
     */
    async getSignalsByInstrumentId(figi) {
        try {
            const possiblePaths = [
                '/tinkoff.public.invest.api.contract.v1.SignalsService/GetSignals',
                '/tinkoff.public.invest.api.contract.v1.MarketDataService/GetSignals'
            ];

            const possibleBodies = [
                { figi: figi },
                { instrumentId: figi, idType: 'INSTRUMENT_ID_TYPE_FIGI' },
                { figi: [figi] } // Возможно, принимает массив
            ];

            for (const path of possiblePaths) {
                for (const body of possibleBodies) {
                    try {
                        console.log(`🔍 Пробуем получить сигналы через ${path} с телом:`, JSON.stringify(body));
                        
                        const response = await this.makeRequest(path, body);

                        console.log(`✅ Успешно получены сигналы:`, JSON.stringify(response, null, 2));
                        
                        return {
                            success: true,
                            path: path,
                            body: body,
                            data: response
                        };
                    } catch (error) {
                        if (error.message.includes('404') || error.message.includes('Not Found')) {
                            continue;
                        }
                        console.warn(`⚠️ Ошибка:`, error.message);
                        continue;
                    }
                }
            }

            throw new Error('Метод GetSignals не найден');
            
        } catch (error) {
            console.error('❌ Ошибка получения сигналов:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }


}

export default new TinkoffApiService();