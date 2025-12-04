import fetch from 'node-fetch';
import https from 'https';

const agent = new https.Agent({
    rejectUnauthorized: false
});

class TinkoffApiService {
    constructor() {
        this.baseUrl = process.env.TINKOFF_API_URL || 'https://invest-public-api.tinkoff.ru/rest';
        this.token = process.env.TINKOFF_TOKEN || 't.1234567890abcdef';
        this.requestDelay = 500; // Задержка между запросами в мс (увеличено для избежания rate limiting)
        this.maxRetries = 3;
        this.retryDelay = 1000; // Задержка перед повтором в мс
        this.lastRequestTime = 0;
        
        // Отладочная информация
        console.log('🔑 TinkoffApiService initialized:');
        console.log(`   Base URL: ${this.baseUrl}`);
        console.log(`   Token: ${this.token ? this.token.substring(0, 10) + '...' : 'NOT SET'}`);
        console.log(`   Account ID: ${process.env.TINKOFF_ACCOUNT_ID || 'NOT SET'}`);
    }

    async makeRequest(path, body = {}, retryCount = 0) {
        try {
            // Добавляем задержку между запросами
            const timeSinceLastRequest = Date.now() - this.lastRequestTime;
            if (timeSinceLastRequest < this.requestDelay) {
                await this.delay(this.requestDelay - timeSinceLastRequest);
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
                
                // Обработка ошибки 404 (Not Found) - метод не существует
                if (response.status === 404) {
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
                
                // Обработка ошибки 429 (Too Many Requests)
                if (response.status === 429) {
                    if (retryCount < this.maxRetries) {
                        const waitTime = this.retryDelay * Math.pow(2, retryCount); // Exponential backoff
                        console.warn(`Rate limit exceeded. Retrying in ${waitTime}ms... (attempt ${retryCount + 1}/${this.maxRetries})`);
                        await this.delay(waitTime);
                        return this.makeRequest(path, body, retryCount + 1);
                    } else {
                        console.error('Max retries exceeded for rate limit');
                        throw new Error(`Rate limit exceeded. Max retries (${this.maxRetries}) exceeded.`);
                    }
                }

                console.error('API Error details:', {
                    status: response.status,
                    statusText: response.statusText,
                    path: path,
                    body: body,
                    error: errorText
                });
                throw new Error(`HTTP error! status: ${response.status}, details: ${errorText}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            if (error.name === 'AbortError') {
                console.error('Tinkoff API request timeout:', error);
                throw new Error('Request timeout - API server is not responding');
            }
            
            // Обработка сетевых ошибок с повторными попытками
            if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
                if (retryCount < this.maxRetries) {
                    const waitTime = this.retryDelay * Math.pow(2, retryCount); // Exponential backoff
                    console.warn(`Network error (${error.code}). Retrying in ${waitTime}ms... (attempt ${retryCount + 1}/${this.maxRetries})`);
                    await this.delay(waitTime);
                    return this.makeRequest(path, body, retryCount + 1);
                } else {
                    console.error(`Max retries exceeded for network error: ${error.code}`);
                    throw new Error(`Network error: ${error.code}. Max retries (${this.maxRetries}) exceeded.`);
                }
            }
            
            // Специальная обработка для Shares endpoint
            if (path.includes('/Shares') && error.code === 'ECONNRESET') {
                console.warn('⚠️ Shares endpoint returned ECONNRESET - this is a known issue with Tinkoff API');
                console.warn('💡 Consider using cached data or alternative endpoints');
                throw new Error('Shares endpoint temporarily unavailable due to ECONNRESET');
            }
            
            console.error('Tinkoff API request failed:', error);
            throw error;
        }
    }

    // Вспомогательная функция для задержки
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Получение списка акций с пагинацией
    async getStocks() {
        try {
            
            const response = await this.makeRequest('/tinkoff.public.invest.api.contract.v1.InstrumentsService/Shares', {
                instrumentStatus: 'INSTRUMENT_STATUS_BASE'
            });

            // Фильтруем российские акции (валюта рубль или риск-страна RU)
            const instruments = (response?.instruments || []).filter(inst => {
                const currency = (inst.currency || '').toLowerCase();
                const country = (inst.countryOfRisk || inst.country || '').toUpperCase();
                return currency === 'rub' || country === 'RU';
            });

            return { ...response, instruments };
        } catch (error) {
            console.error('Error getting stocks:', error);
            // Возвращаем пустой результат при ошибке
            return { instruments: [] };
        }
    }

    // Получение исторических свечей
    async getCandles(figi, from, to, interval = 'DAY') {
        try {
            // Проверяем и корректируем даты
            const fromDate = new Date(from);
            const toDate = new Date(to);

            // Если from >= to, корректируем на безопасный интервал
            if (fromDate >= toDate) {
                // Отматываем на 31 день, чтобы включить минимум месяц
                fromDate.setDate(toDate.getDate() - 31);
            }

            const response = await this.makeRequest('/tinkoff.public.invest.api.contract.v1.MarketDataService/GetCandles', {
                figi: figi,
                from: fromDate.toISOString(),
                to: toDate.toISOString(),
                interval: `CANDLE_INTERVAL_${interval}`
            });

            return response;
        } catch (error) {
            console.error(`Error getting candles for ${figi}:`, error);
            return {candles: []};
        }
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

    // Получение информации по конкретному инструменту
    async getInstrumentByFigi(figi) {
        try {
            const response = await this.makeRequest('/tinkoff.public.invest.api.contract.v1.InstrumentsService/GetInstrumentBy', {
                id: figi,
                idType: 'INSTRUMENT_ID_TYPE_FIGI'
            });

            return response;
        } catch (error) {
            console.error(`Error getting instrument ${figi}:`, error);
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


}

export default new TinkoffApiService();