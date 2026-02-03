import TradingModeManager from './TradingModeManager.js';
import TinkoffApiService from './TinkoffApiService.js';
import { getWebSocketService } from './WebSocketService.js';
import RiskManagementService from './RiskManagementService.js';
import CacheService from './CacheService.js';
import VirtualPortfolio from '../models/VirtualPortfolio.js';
import EntryOptimizationService from './EntryOptimizationService.js';

/**
 * Единый торговый движок для всех режимов торговли
 * Обрабатывает ордера в зависимости от текущего режима
 */
class TradingEngine {
    constructor() {
        this.modeManager = TradingModeManager;
        this.broker = null;
        this.virtualPortfolio = {
            cash: 1000000, // 1 млн руб
            positions: {},
            totalValue: 1000000,
            trades: [],
            initialCapital: 1000000 // Начальный капитал для расчета PnL
        };
        this.isInitialized = false;
        this.isActive = false; // Флаг активности торгового движка
    }

    /**
     * Инициализация торгового движка
     */
    async initialize() {
        try {
            
            await this.modeManager.initialize();
            await RiskManagementService.initialize();
            this.broker = TinkoffApiService;
            
            // Загружаем виртуальный портфель из БД или создаем новый
            await this.loadVirtualPortfolio();
            
            this.isInitialized = true;
            this.isActive = true; // Активируем после инициализации
            
        } catch (error) {
            console.error('❌ Ошибка инициализации Trading Engine:', error);
            throw error;
        }
    }

    /**
     * Инициализация демо-портфеля с тестовыми позициями
     */
    async initializeDemoPortfolio() {
        try {
            // Проверяем, есть ли уже позиции
            if (Object.keys(this.virtualPortfolio.positions).length > 0) {
                return;
            }


            // Добавляем тестовые позиции
            const demoPositions = {
                'BBG004730N88': 100,  // SBER
                'BBG004731354': 200,  // GAZP
                'BBG004730RP0': 50,   // LKOH
                'BBG004S68473': 500   // VTBR
            };

            // Создаем историю тестовых сделок
            const demoTrades = [
                {
                    id: 'demo_1',
                    symbol: 'BBG004730N88',
                    action: 'BUY',
                    quantity: 100,
                    price: 280.50,
                    commission: 50,
                    timestamp: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() // 30 дней назад
                },
                {
                    id: 'demo_2',
                    symbol: 'BBG004731354',
                    action: 'BUY',
                    quantity: 200,
                    price: 165.30,
                    commission: 66,
                    timestamp: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString() // 25 дней назад
                },
                {
                    id: 'demo_3',
                    symbol: 'BBG004730RP0',
                    action: 'BUY',
                    quantity: 50,
                    price: 6200.00,
                    commission: 155,
                    timestamp: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString() // 20 дней назад
                },
                {
                    id: 'demo_4',
                    symbol: 'BBG004S68473',
                    action: 'BUY',
                    quantity: 500,
                    price: 0.045,
                    commission: 11,
                    timestamp: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString() // 15 дней назад
                }
            ];

            // Применяем позиции и сделки
            this.virtualPortfolio.positions = demoPositions;
            this.virtualPortfolio.trades = demoTrades;
            
            // Рассчитываем потраченные средства
            const totalSpent = demoTrades.reduce((sum, trade) => {
                return sum + (trade.price * trade.quantity) + trade.commission;
            }, 0);
            
            // Обновляем наличные
            this.virtualPortfolio.cash = Math.max(0, this.virtualPortfolio.cash - totalSpent);
            
            // Сохраняем демо-портфель в БД
            await this.saveVirtualPortfolio();
            
        } catch (error) {
            console.warn('⚠️ Ошибка инициализации демо-портфеля:', error.message);
        }
    }

    /**
     * Исполнение торгового сигнала
     */
    async executeOrder(signal) {
        if (!this.isInitialized) {
            throw new Error('Trading Engine не инициализирован');
        }

        if (!this.isActive) {
            throw new Error('Trading Engine не активирован. Используйте метод activate() для активации.');
        }

        const modeInfo = this.modeManager.getCurrentMode();
        const mode = modeInfo.mode || modeInfo; // Поддержка старого формата

        try {
            // 1. Получаем актуальный портфель в зависимости от режима
            let portfolio;
            if (mode === 'paper') {
                portfolio = await this.getVirtualPortfolioValue();
            } else {
                try {
                    portfolio = await this.getRealPortfolioValue();
                } catch (error) {
                    console.warn('⚠️ Не удалось получить реальный портфель, используем виртуальный:', error.message);
                    portfolio = await this.getVirtualPortfolioValue();
                }
            }
            
            // 2. Валидация через риск-менеджмент
            const currentPrices = await this.getCurrentPrices([signal.symbol]);
            const validation = await RiskManagementService.validateOrder(signal, portfolio, currentPrices);
            
            if (!validation.isValid) {
                console.warn('⚠️ Ордер отклонен риск-менеджментом:', validation.errors);
                throw new Error(`Ордер отклонен: ${validation.errors.join(', ')}`);
            }

            // 3. Фаза 4, задача 4.2: Оптимизация входа
            let optimizedSignal = validation.adjustedSignal || signal;
            
            try {
                // 3.1. Предсказание оптимального времени входа
                const entryPrediction = await EntryOptimizationService.predictOptimalEntryTime(
                    signal.symbol,
                    { lookbackPeriod: 30, predictionHorizon: 60 }
                );

                // Если модель рекомендует избегать входа, добавляем предупреждение
                if (entryPrediction.success && entryPrediction.optimalTime === 'avoid') {
                    console.warn('⚠️ EntryOptimizationService рекомендует избегать входа сейчас:', {
                        probability: entryPrediction.probability,
                        confidence: entryPrediction.confidence
                    });
                    // Не блокируем, но добавляем информацию в сигнал
                    optimizedSignal = {
                        ...optimizedSignal,
                        entryOptimization: {
                            recommendation: 'avoid',
                            probability: entryPrediction.probability,
                            confidence: entryPrediction.confidence
                        }
                    };
                }

                // 3.2. Расчет оптимального размера ордера
                const optimalSize = await EntryOptimizationService.calculateOptimalOrderSize(
                    signal.symbol,
                    optimizedSignal.quantity || signal.quantity || 1,
                    {
                        maxSizePercent: 0.05,
                        volatilityAdjustment: true,
                        timeOfDayAdjustment: true
                    }
                );

                // Обновляем размер ордера, если он был оптимизирован
                if (optimalSize.optimalSize && optimalSize.optimalSize !== optimizedSignal.quantity) {
                    optimizedSignal = {
                        ...optimizedSignal,
                        quantity: optimalSize.optimalSize,
                        originalQuantity: optimizedSignal.quantity,
                        sizeOptimization: optimalSize
                    };
                }

                // 3.3. Рекомендация типа ордера на основе spread'а
                const orderTypeRecommendation = await EntryOptimizationService.recommendOrderType(
                    signal.symbol,
                    optimizedSignal,
                    {
                        urgency: signal.urgency || false
                    }
                );

                // Добавляем рекомендацию по типу ордера
                optimizedSignal = {
                    ...optimizedSignal,
                    orderType: orderTypeRecommendation.orderType,
                    recommendedPrice: orderTypeRecommendation.recommendedPrice,
                    orderTypeRecommendation: orderTypeRecommendation
                };

            } catch (optimizationError) {
                console.warn('⚠️ Ошибка оптимизации входа, продолжаем с исходным сигналом:', optimizationError.message);
                // Продолжаем с исходным сигналом при ошибке оптимизации
            }

            // 4. Использование скорректированного сигнала
            const finalSignal = optimizedSignal;
            
            // 5. Исполнение ордера
            let result;
            
            switch (mode) {
                case 'paper':
                    result = await this.executePaperOrder(finalSignal);
                    break;
                case 'micro':
                    result = await this.executeMicroOrder(finalSignal);
                    break;
                case 'real':
                    result = await this.executeRealOrder(finalSignal);
                    break;
                default:
                    throw new Error(`Неизвестный режим торговли: ${mode}`);
            }

            // 6. Обновление статистики риск-менеджмента
            if (result.trade) {
                await RiskManagementService.updateStats(result.trade);
            }

            // 7. Уведомление о исполнении
            await this.notifyOrderExecution(finalSignal, result);
            
            return result;

        } catch (error) {
            console.error('❌ Ошибка исполнения ордера:', error);
            throw error;
        }
    }

    /**
     * Получение текущих цен инструментов
     * @param {Array} symbols - массив символов инструментов
     * @param {Boolean} skipUpdate - если true, не обновлять кеш из API (для обучения)
     */
    async getCurrentPrices(symbols, skipUpdate = false) {
        try {
            const prices = {};
            
            for (const symbol of symbols) {
                try {
                    // Сначала пробуем получить из кеша
                    const instrument = await CacheService.getInstrument(symbol, skipUpdate);
                    if (instrument && typeof instrument.lastPrice === 'number') {
                        prices[symbol] = instrument.lastPrice;
                        continue;
                    }
                    
                    // Если нет в кеше, получаем через API
                    const lastPrices = await TinkoffApiService.getLastPrices([symbol]);
                    if (lastPrices.lastPrices && lastPrices.lastPrices.length > 0) {
                        const priceData = lastPrices.lastPrices[0];
                        if (priceData.price) {
                            const units = parseFloat(priceData.price.units || 0);
                            const nano = parseFloat(priceData.price.nano || 0);
                            prices[symbol] = units + nano / 1e9;
                            continue;
                        }
                    }
                    
                    // Если ничего не получили, возвращаем 0
                    prices[symbol] = 0;
                    
                } catch (error) {
                    console.warn(`⚠️ Ошибка получения цены для ${symbol}:`, error.message);
                    prices[symbol] = 0;
                }
            }
            
            return prices;
        } catch (error) {
            console.error('❌ Ошибка получения цен:', error);
            return {};
        }
    }

    /**
     * Бумажная торговля - виртуальное исполнение
     */
    async executePaperOrder(signal) {
        const modeSettings = await this.modeManager.getModeSettings();
        const settings = modeSettings.settings || modeSettings; // Поддержка старого формата
        const { symbol, action, quantity, price, confidence } = signal;
        
        // Фаза 4, задача 4.2.3: Используем рекомендованный тип ордера и цену
        const orderType = signal.orderType || 'MARKET';
        const recommendedPrice = signal.recommendedPrice || price;
        
        // Имитация задержки исполнения
        await this.delay(settings.executionDelay);
        
        // Имитация проскальзывания (более реалистичная модель)
        // Для LIMIT ордеров проскальзывание меньше
        const slippagePercent = (orderType === 'LIMIT' ? 0.0005 : settings.slippage || 0.001); // 0.05% для LIMIT, 0.1% для MARKET
        // Проскальзывание зависит от объема и волатильности (более реалистично)
        const volumeFactor = Math.min(quantity / 1000, 1); // Нормализация объема
        const slippage = recommendedPrice * slippagePercent * volumeFactor * (action === 'BUY' ? 1 : -1);
        const executionPrice = recommendedPrice + slippage;
        
        // Расчет комиссии (как у Tinkoff: 0.3% с минимумом 1 рубль)
        const dealAmount = executionPrice * quantity;
        const commissionRate = settings.commission || 0.003; // 0.3% по умолчанию
        const minCommission = settings.minCommission || 1; // 1 рубль минимум
        const commission = Math.max(dealAmount * commissionRate, minCommission);
        
        // Проверка достаточности средств
        const requiredAmount = executionPrice * quantity + commission;
        if (action === 'BUY' && requiredAmount > this.virtualPortfolio.cash) {
            throw new Error('Недостаточно средств для покупки');
        }

        // Обновление виртуального портфеля
        if (action === 'BUY') {
            this.virtualPortfolio.cash -= requiredAmount;
            this.virtualPortfolio.positions[symbol] = (this.virtualPortfolio.positions[symbol] || 0) + quantity;
        } else if (action === 'SELL') {
            if (!this.virtualPortfolio.positions[symbol] || this.virtualPortfolio.positions[symbol] < quantity) {
                throw new Error('Недостаточно акций для продажи');
            }
            this.virtualPortfolio.cash += executionPrice * quantity - commission;
            this.virtualPortfolio.positions[symbol] -= quantity;
        }

        // Расчет PnL для сделки
        // Важно: комиссия платится и при покупке, и при продаже
        let pnl = -commission; // Для BUY - только комиссия покупки (убыток)
        if (action === 'SELL') {
            // Рассчитываем среднюю цену покупки из всех сделок BUY для этого инструмента
            // Улучшенная логика сопоставления: проверяем и symbol, и figi
            const tradeSymbol = symbol || (signal.figi || '');
            const tradeFigi = signal.figi || symbol || '';
            
            const buyTrades = this.virtualPortfolio.trades.filter(t => {
                if (t.action !== 'BUY') return false;
                
                const tSymbol = t.symbol || t.figi || '';
                const tFigi = t.figi || t.symbol || '';
                
                // Проверяем совпадение по инструменту (symbol или figi)
                return (tSymbol && (tSymbol === tradeSymbol || tSymbol === tradeFigi)) ||
                       (tFigi && (tFigi === tradeSymbol || tFigi === tradeFigi));
            });
            
            if (buyTrades.length > 0) {
                // Суммируем стоимость покупок (цена + комиссия)
                const totalCost = buyTrades.reduce((sum, trade) => 
                    sum + (trade.price * trade.quantity) + (trade.commission || 0), 0
                );
                const totalQuantity = buyTrades.reduce((sum, trade) => sum + trade.quantity, 0);
                const averageBuyPrice = totalQuantity > 0 ? totalCost / totalQuantity : executionPrice;
                
                // PnL = (цена продажи - средняя цена покупки с комиссией) * количество - комиссия продажи
                pnl = (executionPrice - averageBuyPrice) * quantity - commission;
            } else {
                // Если нет истории покупок, используем текущую цену
                pnl = -commission;
            }
        }

        // Рассчитываем resultPercent для статистики инструмента (только для SELL)
        // Используем PnL для расчета, так как он уже учитывает обе комиссии (покупки и продажи)
        let resultPercent = null;
        if (action === 'SELL' && pnl !== undefined && pnl !== null) {
            // Находим среднюю цену покупки для расчета процента прибыли/убытка
            // Используем ту же логику сопоставления, что и для расчета PnL
            const tradeSymbol = symbol || (signal.figi || '');
            const tradeFigi = signal.figi || symbol || '';
            
            const buyTrades = this.virtualPortfolio.trades.filter(t => {
                if (t.action !== 'BUY') return false;
                
                const tSymbol = t.symbol || t.figi || '';
                const tFigi = t.figi || t.symbol || '';
                
                return (tSymbol && (tSymbol === tradeSymbol || tSymbol === tradeFigi)) ||
                       (tFigi && (tFigi === tradeSymbol || tFigi === tradeFigi));
            });
            
            if (buyTrades.length > 0) {
                // Суммируем стоимость покупок с учетом комиссий
                const totalCost = buyTrades.reduce((sum, t) => 
                    sum + (t.price * t.quantity) + (t.commission || 0), 0
                );
                const totalQuantity = buyTrades.reduce((sum, t) => sum + t.quantity, 0);
                const averageBuyPrice = totalQuantity > 0 ? totalCost / totalQuantity : executionPrice;
                
                if (averageBuyPrice > 0 && quantity > 0) {
                    // resultPercent рассчитываем из PnL, который уже учитывает обе комиссии
                    // resultPercent = PnL / (средняя цена покупки * количество)
                    // Это дает точный процент прибыли/убытка с учетом всех комиссий
                    const totalCostBasis = averageBuyPrice * quantity;
                    resultPercent = pnl / totalCostBasis;
                }
            }
        }
        
        // Запись сделки
        const trade = {
            id: `paper_${Date.now()}`,
            symbol,
            figi: signal.figi || symbol,
            ticker: signal.ticker || symbol,
            action,
            quantity,
            price: executionPrice,
            commission,
            pnl,
            resultPercent, // Добавляем resultPercent в trade для использования в ProfitabilityTracker
            timestamp: new Date().toISOString(),
            confidence,
            mode: 'paper',
            strategyId: signal.strategyId || null // Сохраняем strategyId из заявки
        };
        
        this.virtualPortfolio.trades.push(trade);
        
        // Обновляем статистику инструмента при закрытии позиции (SELL)
        if (action === 'SELL' && resultPercent !== null && resultPercent !== undefined) {
            try {
                const RiskManagementService = (await import('./RiskManagementService.js')).default;
                if (RiskManagementService.isInitialized) {
                    const figi = signal.figi || symbol;
                    const ticker = signal.ticker || symbol;
                    
                    await RiskManagementService.updateInstrumentStats(figi, ticker, resultPercent);
                }
            } catch (error) {
                // Не прерываем выполнение сделки при ошибке обновления статистики
                console.warn(`⚠️ Не удалось обновить статистику инструмента для ${symbol}:`, error.message);
            }
        }
        
        // Сохраняем виртуальный портфель в БД
        await this.saveVirtualPortfolio();
        
        return {
            success: true,
            trade,
            portfolio: await this.getPortfolioValue(),
            mode: 'paper'
        };
    }

    /**
     * Микро-торговля - реальные ордера с ограничениями
     */
    async executeMicroOrder(signal) {
        const modeSettings = await this.modeManager.getModeSettings();
        const settings = modeSettings.settings || modeSettings; // Поддержка старого формата
        const { symbol, action, quantity, price, confidence } = signal;
        
        // Получаем текущий портфель для расчета капитала
        const portfolio = await this.getRealPortfolioValue();
        const capital = portfolio.totalValue || portfolio.totalAmountPortfolio?.value || 1000000;
        
        // Ограничение размера позиции для микро-торговли
        const maxQuantity = Math.floor(capital * settings.maxPositionSize / price);
        const limitedQuantity = Math.min(quantity, maxQuantity);

        try {
            // Проверяем доступность торговли
            const isTradingAvailable = await this.broker.isTradingAvailable();
            if (!isTradingAvailable) {
                throw new Error('Торговля недоступна в данный момент');
            }

            // Фаза 4, задача 4.2.3: Используем рекомендованный тип ордера и цену
            const orderType = signal.orderType || 'LIMIT';
            const recommendedPrice = signal.recommendedPrice || price;
            
            // Реальное исполнение через Tinkoff API
            const orderResult = await this.broker.placeOrder({
                symbol,
                action,
                quantity: limitedQuantity,
                price: recommendedPrice,
                orderType: orderType
            });

            // Рассчитываем комиссию
            const commission = this.broker.calculateCommission(
                orderResult.executedOrderPrice || price, 
                limitedQuantity
            );

            return {
                success: true,
                trade: {
                    id: orderResult.orderId,
                    symbol,
                    action,
                    quantity: limitedQuantity,
                    price: orderResult.executedOrderPrice || price,
                    commission: commission.amount,
                    timestamp: new Date().toISOString(),
                    confidence,
                    mode: 'micro',
                    orderStatus: orderResult.executionReportStatus
                },
                portfolio: await this.getRealPortfolioValue(),
                mode: 'micro'
            };

        } catch (error) {
            console.error('❌ Ошибка микро-торговли:', error);
            throw error;
        }
    }

    /**
     * Реальная торговля - полное исполнение
     */
    async executeRealOrder(signal) {
        const modeSettings = await this.modeManager.getModeSettings();
        const settings = modeSettings.settings || modeSettings; // Поддержка старого формата
        const { symbol, action, quantity, price, confidence } = signal;
        
        try {
            // Проверяем доступность торговли
            const isTradingAvailable = await this.broker.isTradingAvailable();
            if (!isTradingAvailable) {
                throw new Error('Торговля недоступна в данный момент');
            }

            // Фаза 4, задача 4.2.3: Используем рекомендованный тип ордера и цену
            const orderType = signal.orderType || 'LIMIT';
            const recommendedPrice = signal.recommendedPrice || price;
            
            // Реальное исполнение через Tinkoff API
            const orderResult = await this.broker.placeOrder({
                symbol,
                action,
                quantity,
                price: recommendedPrice,
                orderType: orderType
            });

            // Рассчитываем комиссию
            const commission = this.broker.calculateCommission(
                orderResult.executedOrderPrice || price, 
                quantity
            );

            return {
                success: true,
                trade: {
                    id: orderResult.orderId,
                    symbol,
                    action,
                    quantity,
                    price: orderResult.executedOrderPrice || price,
                    commission: commission.amount,
                    timestamp: new Date().toISOString(),
                    confidence,
                    mode: 'real',
                    orderStatus: orderResult.executionReportStatus
                },
                portfolio: await this.getRealPortfolioValue(),
                mode: 'real'
            };

        } catch (error) {
            console.error('❌ Ошибка реальной торговли:', error);
            throw error;
        }
    }

    /**
     * Получение стоимости портфеля
     */
    async getPortfolioValue() {
        const modeInfo = this.modeManager.getCurrentMode();
        const mode = modeInfo.mode || modeInfo; // Поддержка старого формата
        
        if (mode === 'paper') {
            return await this.getVirtualPortfolioValue();
        } else {
            return await this.getRealPortfolioValue();
        }
    }

    /**
     * Загрузка виртуального портфеля из БД
     */
    async loadVirtualPortfolio() {
        try {
            const savedPortfolio = await VirtualPortfolio.getCurrent();
            
            if (savedPortfolio) {
                // Восстанавливаем данные из БД
                // Важно: positions и trades могут быть JSON строками, нужно их правильно распарсить
                let positions = savedPortfolio.positions;
                let trades = savedPortfolio.trades;
                
                // Если positions - строка, парсим её
                if (typeof positions === 'string') {
                    try {
                        positions = JSON.parse(positions);
                    } catch (e) {
                        console.warn('⚠️ Ошибка парсинга positions из БД:', e.message);
                        positions = {};
                    }
                }
                
                // Если trades - строка, парсим её
                if (typeof trades === 'string') {
                    try {
                        trades = JSON.parse(trades);
                    } catch (e) {
                        console.warn('⚠️ Ошибка парсинга trades из БД:', e.message);
                        trades = [];
                    }
                }
                
                // Убеждаемся, что positions - объект, а trades - массив
                if (!positions || typeof positions !== 'object' || Array.isArray(positions)) {
                    positions = {};
                }
                if (!trades || !Array.isArray(trades)) {
                    trades = [];
                }
                
                this.virtualPortfolio = {
                    cash: savedPortfolio.cash || 1000000,
                    positions: positions,
                    trades: trades,
                    totalValue: savedPortfolio.totalValue || savedPortfolio.cash || 1000000,
                    initialCapital: savedPortfolio.initialCapital || 1000000
                };
                
                const positionsCount = Object.keys(this.virtualPortfolio.positions).length;
                // Пересчитываем totalValue на основе текущих цен (но не перезаписываем сохраненное значение)
                // Это нужно для актуальности данных
                try {
                    let positionsValue = 0;
                    for (const [figi, quantity] of Object.entries(this.virtualPortfolio.positions)) {
                        if (quantity > 0) {
                            try {
                                const prices = await this.getCurrentPrices([figi], true);
                                const currentPrice = prices[figi] || 0;
                                if (currentPrice > 0) {
                                    positionsValue += currentPrice * quantity;
                                }
                            } catch (error) {
                                // Пропускаем позиции с ошибками получения цены
                                console.warn(`⚠️ Не удалось получить цену для ${figi}:`, error.message);
                            }
                        }
                    }
                    // Обновляем totalValue только если удалось получить цены
                    if (positionsValue > 0) {
                        this.virtualPortfolio.totalValue = this.virtualPortfolio.cash + positionsValue;
                    }
                } catch (priceError) {
                    console.warn('⚠️ Не удалось пересчитать стоимость позиций, используем сохраненное значение:', priceError.message);
                }
            } else {
                // Если портфеля нет в БД, создаем новый
                this.virtualPortfolio = {
                    cash: 1000000,
                    positions: {},
                    totalValue: 1000000,
                    trades: [],
                    initialCapital: 1000000
                };
                await this.saveVirtualPortfolio();
            }
        } catch (error) {
            console.error('❌ Ошибка загрузки виртуального портфеля из БД:', error);
            console.warn('⚠️ Используем значения по умолчанию');
            this.virtualPortfolio = {
                cash: 1000000,
                positions: {},
                totalValue: 1000000,
                trades: [],
                initialCapital: 1000000
            };
        }
    }

    /**
     * Сохранение виртуального портфеля в БД
     */
    async saveVirtualPortfolio() {
        try {
            // Пересчитываем totalValue перед сохранением
            let positionsValue = 0;
            const positionsCount = Object.keys(this.virtualPortfolio.positions || {}).length;
            
            if (positionsCount > 0) {
                for (const [symbol, quantity] of Object.entries(this.virtualPortfolio.positions)) {
                    if (quantity > 0) {
                        try {
                            const prices = await this.getCurrentPrices([symbol], true);
                            const currentPrice = prices[symbol] || 0;
                            if (currentPrice > 0) {
                                positionsValue += currentPrice * quantity;
                            }
                        } catch (error) {
                            // Если не удалось получить цену, пропускаем эту позицию
                            console.warn(`⚠️ Не удалось получить цену для ${symbol} при сохранении:`, error.message);
                        }
                    }
                }
            }
            
            this.virtualPortfolio.totalValue = this.virtualPortfolio.cash + positionsValue;
            
            // Убеждаемся, что positions - объект, а trades - массив
            const positionsToSave = this.virtualPortfolio.positions && typeof this.virtualPortfolio.positions === 'object' && !Array.isArray(this.virtualPortfolio.positions)
                ? this.virtualPortfolio.positions
                : {};
            const tradesToSave = Array.isArray(this.virtualPortfolio.trades)
                ? this.virtualPortfolio.trades
                : [];
            await VirtualPortfolio.savePortfolio({
                cash: this.virtualPortfolio.cash,
                positions: positionsToSave,
                trades: tradesToSave,
                totalValue: this.virtualPortfolio.totalValue,
                initialCapital: this.virtualPortfolio.initialCapital || 1000000
            });
        } catch (error) {
            console.error('❌ Ошибка сохранения виртуального портфеля в БД:', error);
            console.error('   Детали ошибки:', error.stack);
            // Не прерываем выполнение, если сохранение не удалось
        }
    }

    /**
     * Расчет стоимости виртуального портфеля
     */
    async getVirtualPortfolioValue() {
        
        let positionsValue = 0;
        const positionsDetails = [];
        
        for (const [symbol, quantity] of Object.entries(this.virtualPortfolio.positions || {})) {
            if (quantity > 0) {
                try {
                    // Получаем актуальную цену (skipUpdate = false для обновления кеша)
                    // Это важно для корректного расчета прибыли/убытка
                    const prices = await this.getCurrentPrices([symbol], false);
                    const currentPrice = prices[symbol] || 0;
                    const positionValue = currentPrice * quantity;
                    positionsValue += positionValue;
                    
                    positionsDetails.push({
                        figi: symbol,
                        quantity,
                        currentPrice,
                        positionValue
                    });
                    
                } catch (error) {
                    // Если не удалось получить актуальную цену, логируем предупреждение
                    console.warn(`⚠️ Не удалось получить актуальную цену для ${symbol}:`, error.message);
                }
            }
        }
        
        const totalValue = this.virtualPortfolio.cash + positionsValue;
        
        // Обновляем totalValue в объекте портфеля
        this.virtualPortfolio.totalValue = totalValue;
        
        return {
            cash: this.virtualPortfolio.cash,
            positions: this.virtualPortfolio.positions,
            trades: this.virtualPortfolio.trades,
            positionsValue,
            totalValue,
            initialCapital: this.virtualPortfolio.initialCapital || 1000000,
            mode: 'paper'
        };
    }

    /**
     * Получение реальной стоимости портфеля
     */
    async getRealPortfolioValue() {
        try {
            const portfolio = await this.broker.getPortfolio();
            
            // Преобразуем positions из массива в объект {figi: quantity} для совместимости
            let positions = {};
            let cash = 0;
            let positionsValue = 0;
            let cashFromPositions = 0; // Переменная для накопления cash из валютных позиций
            const positionsDetails = [];
            
            if (portfolio.positions && Array.isArray(portfolio.positions)) {
                // Если positions - массив объектов из Tinkoff API
                // transformPortfolioData уже преобразовал quantity в число
                for (const position of portfolio.positions) {
                    if (!position.figi) {
                        console.warn('⚠️ Position without figi:', position);
                        continue;
                    }
                    
                    // Проверяем, является ли позиция валютой (наличкой)
                    const isCurrency = position.instrumentType === 'currency' || 
                                      position.instrumentType === 'Currency' ||
                                      (position.ticker && (position.ticker === 'RUB' || position.ticker === 'RUR' || position.ticker === 'rub'));
                    
                    // quantity может быть числом или строкой после transformPortfolioData
                    // Преобразуем в число
                    let quantity = 0;
                    if (typeof position.quantity === 'number') {
                        quantity = position.quantity;
                    } else if (typeof position.quantity === 'string') {
                        quantity = parseFloat(position.quantity) || 0;
                    } else if (position.quantity && typeof position.quantity === 'object') {
                        // Если это объект с units
                        const units = position.quantity.units || position.quantity.value || 0;
                        quantity = typeof units === 'string' ? parseFloat(units) || 0 : units;
                    }
                    
                    if (quantity > 0) {
                        if (isCurrency) {
                            // Если это валюта (наличка), добавляем к cash
                            // Для валюты quantity уже является суммой в рублях
                            cashFromPositions += quantity;
                        } else {
                            // Обычная позиция (акция, облигация и т.д.)
                            positions[position.figi] = quantity;
                            
                            // Рассчитываем стоимость позиции
                            // Приоритет: expectedYield (текущая стоимость позиции) > currentPrice * quantity > averagePositionPrice * quantity
                            let positionValue = 0;
                            let currentPrice = 0;
                            let averagePrice = 0;
                            
                            let hasExpectedYield = false;
                            if (position.expectedYield !== undefined && position.expectedYield !== null) {
                                hasExpectedYield = true;
                                // expectedYield может быть объектом {value, currency} или числом
                                if (typeof position.expectedYield === 'object' && position.expectedYield.value !== undefined) {
                                    hasExpectedYield = Math.abs(position.expectedYield.value) > 0;
                                } else if (typeof position.expectedYield === 'number') {
                                    hasExpectedYield = Math.abs(position.expectedYield) > 0;
                                }
                            }
                            
                            // Приоритет 1: currentPrice (текущая рыночная цена)
                            if (typeof position.currentPrice === 'number') {
                                currentPrice = position.currentPrice;
                            } else if (position.currentPrice && typeof position.currentPrice === 'object') {
                                currentPrice = position.currentPrice.value || position.currentPrice.units || 0;
                            }
                            
                            if (currentPrice > 0 && quantity > 0) {
                                positionValue = currentPrice * quantity;
                            }
                            
                            // Приоритет 2: Если currentPrice нет, используем averagePositionPrice (средняя цена покупки)
                            // Но это менее точно, так как цена могла измениться
                            if (positionValue === 0) {
                                if (typeof position.averagePositionPrice === 'number') {
                                    averagePrice = position.averagePositionPrice;
                                } else if (position.averagePositionPrice && typeof position.averagePositionPrice === 'object') {
                                    averagePrice = position.averagePositionPrice.value || position.averagePositionPrice.units || 0;
                                }
                                
                                if (averagePrice > 0 && quantity > 0) {
                                    positionValue = averagePrice * quantity;
                                    currentPrice = averagePrice;
                                }
                            }
                            
                            // Приоритет 3: Если ничего не помогло, пытаемся получить цену из кеша
                            if (positionValue === 0 && quantity > 0) {
                                try {
                                    const instrument = await CacheService.getInstrument(position.figi, true);
                                    const cachedPrice = instrument?.lastPrice || 0;
                                    if (cachedPrice > 0) {
                                        currentPrice = cachedPrice;
                                        positionValue = cachedPrice * quantity;
                                    }
                                } catch (error) {
                                }
                            }
                            
                            if (positionValue > 0) {
                                positionsValue += positionValue;
                            }
                            
                            positionsDetails.push({
                                figi: position.figi,
                                ticker: position.ticker,
                                quantity,
                                currentPrice,
                                averagePrice,
                                expectedYield: position.expectedYield,
                                positionValue,
                                instrumentType: position.instrumentType
                            });
                            
                        }
                    }
                }
            } else if (portfolio.positions && typeof portfolio.positions === 'object' && !Array.isArray(portfolio.positions)) {
                // Если positions уже объект
                positions = portfolio.positions;
                // Рассчитываем positionsValue из всех позиций
                if (positionsValue === 0 && Object.keys(positions).length > 0) {
                    try {
                        for (const [figi, quantity] of Object.entries(positions)) {
                            if (quantity > 0) {
                                try {
                                    const instrument = await CacheService.getInstrument(figi, true);
                                    const currentPrice = instrument?.lastPrice || 0;
                                    const positionValue = currentPrice > 0 ? currentPrice * quantity : 0;
                                    if (positionValue > 0) {
                                        positionsValue += positionValue;
                                    }
                                    
                                    positionsDetails.push({
                                        figi,
                                        quantity,
                                        currentPrice,
                                        positionValue,
                                        source: 'cache'
                                    });
                                    
                                } catch (error) {
                                }
                            }
                        }
                    } catch (error) {
                    }
                }
            }
            
    
            // Извлекаем cash из totalAmountCurrencies
            let cashFromCurrencies = null;
            if (portfolio.totalAmountCurrencies && Array.isArray(portfolio.totalAmountCurrencies) && portfolio.totalAmountCurrencies.length > 0) {
                const rubCurrency = portfolio.totalAmountCurrencies.find(c => 
                    c.currency === 'RUB' || c.currency === 'rub' || c.currency === 'RUR'
                );
                if (rubCurrency) {
                    const cashValue = rubCurrency.value;
                    cashFromCurrencies = typeof cashValue === 'number' 
                        ? cashValue 
                        : (typeof cashValue === 'string' ? parseFloat(cashValue) || 0 : (cashValue?.units || 0));
                }
            }
            
            // Если cash не найден в totalAmountCurrencies, пробуем portfolio.cash
            if (cashFromCurrencies === null && portfolio.cash !== undefined) {
                cashFromCurrencies = typeof portfolio.cash === 'string' ? parseFloat(portfolio.cash) || 0 : portfolio.cash;
            }
            
            // Добавляем cash из валютных позиций к основному cash
            // cashFromPositions уже определен выше в цикле обработки позиций
            if (typeof cashFromPositions !== 'undefined' && cashFromPositions > 0) {
                if (cashFromCurrencies !== null) {
                    cashFromCurrencies += cashFromPositions;
                } else {
                    // Если cash не был найден в других местах, используем cash из позиций
                    cashFromCurrencies = cashFromPositions;
                }
            }
            
            // Извлекаем totalAmountPortfolio для проверки
            let totalPortfolio = null;
            if (portfolio.totalAmountPortfolio) {
                const totalPortfolioValue = portfolio.totalAmountPortfolio.value || portfolio.totalAmountPortfolio.units || 0;
                totalPortfolio = typeof totalPortfolioValue === 'string' 
                    ? parseFloat(totalPortfolioValue) || 0 
                    : (typeof totalPortfolioValue === 'number' ? totalPortfolioValue : 0);
            }
            
            // Убеждаемся, что positionsValue рассчитан из всех позиций
            // Если positionsValue неполный или равен 0, но есть позиции, рассчитываем из кеша
            if (Object.keys(positions).length > 0 && positionsValue === 0) {
                // Пересчитываем positionsValue из всех позиций через кеш
                let recalculatedPositionsValue = 0;
                try {
                    for (const [figi, quantity] of Object.entries(positions)) {
                        if (quantity > 0) {
                            try {
                                const instrument = await CacheService.getInstrument(figi, true);
                                const currentPrice = instrument?.lastPrice || 0;
                                const positionValue = currentPrice > 0 ? currentPrice * quantity : 0;
                                if (positionValue > 0) {
                                    recalculatedPositionsValue += positionValue;
                                }
                            } catch (error) {
                            }
                        }
                    }
                    if (recalculatedPositionsValue > 0) {
                        positionsValue = recalculatedPositionsValue;
                    }
                } catch (error) {
                }
            }
            
            // Определяем cash и проверяем согласованность с totalPortfolio
            if (cashFromCurrencies !== null) {
                // Если cash найден в totalAmountCurrencies или portfolio.cash, используем его
                cash = cashFromCurrencies;
            } else if (totalPortfolio !== null && positionsValue > 0) {
                // Если cash не найден, но есть totalPortfolio и positionsValue, вычисляем cash как разницу
                // totalPortfolio = cash + positionsValue
                cash = Math.max(0, totalPortfolio - positionsValue);
            }
            
            // Финальный расчет totalValue
            // Приоритет: totalPortfolio из API > cash + positionsValue
            let finalTotalValue;
            const calculatedTotal = cash + positionsValue;
            
            if (totalPortfolio !== null && totalPortfolio > 0) {
                // Используем totalPortfolio из API как источник истины
                finalTotalValue = totalPortfolio;
                // Проверяем согласованность: если разница больше 1%, корректируем
                const difference = Math.abs(finalTotalValue - calculatedTotal);
                const differencePercent = finalTotalValue > 0 ? (difference / finalTotalValue) * 100 : 0;
                
                if (differencePercent > 1) {
                    // Если разница больше 1%, пересчитываем positionsValue из totalPortfolio
                    // Это может быть, если цены в кеше устарели
                    positionsValue = Math.max(0, finalTotalValue - cash);
                }
            } else {
                // Если totalPortfolio нет, используем расчетную сумму
                finalTotalValue = calculatedTotal;
                console.log('📊 [REAL] totalPortfolio нет, используем calculatedTotal:', finalTotalValue);
            }
            
            return {
                cash,
                positions,
                positionsValue,
                totalValue: finalTotalValue,
                trades: portfolio.trades || [],
                initialCapital: portfolio.initialCapital || null,
                mode: this.modeManager.getCurrentMode()
            };
        } catch (error) {
            console.error('❌ Ошибка получения реального портфеля:', error);
            throw error;
        }
    }

    /**
     * Получение истории сделок
     */
    async getTradeHistory(limit = 100) {
        const modeInfo = this.modeManager.getCurrentMode();
        const mode = modeInfo.mode || modeInfo; // Поддержка старого формата
        
        if (mode === 'paper') {
            // Если портфель не загружен, пытаемся загрузить из БД
            if (!this.isInitialized || !this.virtualPortfolio || !this.virtualPortfolio.trades) {
                try {
                    await this.loadVirtualPortfolio();
                } catch (error) {
                    const LoggerService = (await import('./LoggerService.js')).default;
                    if (LoggerService && LoggerService.isInitialized) {
                        LoggerService.warn('getTradeHistory: не удалось загрузить портфель из БД', {
                            service: 'TradingEngine',
                            error: error.message
                        });
                    }
                    return [];
                }
            }
            
            // Возвращаем сделки из виртуального портфеля
            const trades = this.virtualPortfolio?.trades || [];
            return Array.isArray(trades) ? trades.slice(-limit) : [];
        } else {
            // Для реальных режимов нужно получать данные из брокера
            return [];
        }
    }

    /**
     * Расчет статистики торговли
     */
    async calculateTradingStats() {
        const trades = await this.getTradeHistory();
        const modeInfo = this.modeManager.getCurrentMode();
        const mode = modeInfo.mode || modeInfo; // Поддержка старого формата
        
        if (trades.length === 0) {
            return {
                totalTrades: 0,
                winRate: 0,
                totalReturn: 0,
                maxDrawdown: 0,
                averageTrade: 0,
                mode
            };
        }

        let profitableTrades = 0;
        let totalReturn = 0;
        let maxValue = 0;
        let maxDrawdown = 0;
        let processedTrades = 0; // Считаем только сделки с PnL

        // Фильтруем только закрытые сделки (SELL)
        // Для Win Rate нужны только закрытые позиции, где можно определить прибыль/убыток
        // НЕ считаем открытые позиции (BUY с нереализованным PnL)
        const closedTrades = [];
        
        for (const trade of trades) {
            // Win Rate считаем только по SELL сделкам (закрытым позициям)
            if (trade.action === 'SELL') {
                let tradePnL = null;
                
                // Используем уже рассчитанный PnL из сделки (учитывает комиссии)
                if (trade.pnl !== undefined && trade.pnl !== null) {
                    tradePnL = trade.pnl;
                } else {
                    // Fallback: если PnL не рассчитан, рассчитываем с учетом комиссии
                    // Улучшенная логика сопоставления: проверяем и symbol, и figi
                    const tradeSymbol = trade.symbol || trade.figi || '';
                    const tradeFigi = trade.figi || trade.symbol || '';
                    
                    const buyTrades = trades.filter(t => {
                        if (t.action !== 'BUY') return false;
                        
                        // Проверяем совпадение по времени (BUY должен быть раньше SELL)
                        const buyTime = t.timestamp ? new Date(t.timestamp).getTime() : 0;
                        const sellTime = trade.timestamp ? new Date(trade.timestamp).getTime() : 0;
                        if (buyTime >= sellTime) return false;
                        
                        // Проверяем совпадение по инструменту (symbol или figi)
                        const tSymbol = t.symbol || t.figi || '';
                        const tFigi = t.figi || t.symbol || '';
                        
                        return (tSymbol && (tSymbol === tradeSymbol || tSymbol === tradeFigi)) ||
                               (tFigi && (tFigi === tradeSymbol || tFigi === tradeFigi));
                    });
                    
                    if (buyTrades.length > 0) {
                        const totalCost = buyTrades.reduce((sum, t) => 
                            sum + (t.price * t.quantity) + (t.commission || 0), 0
                        );
                        const totalQuantity = buyTrades.reduce((sum, t) => sum + t.quantity, 0);
                        const averageBuyPrice = totalQuantity > 0 ? totalCost / totalQuantity : trade.price;
                        tradePnL = (trade.price - averageBuyPrice) * trade.quantity - (trade.commission || 0);
                    }
                }
                
                // Если PnL рассчитан, добавляем в статистику
                if (tradePnL !== null && tradePnL !== undefined) {
                    totalReturn += tradePnL;
                    processedTrades++;
                    if (tradePnL > 0) {
                        profitableTrades++;
                    }
                    closedTrades.push({ ...trade, pnl: tradePnL });
                }
            }
            // Игнорируем BUY сделки для расчета Win Rate (это открытые позиции)
        }

        // Win Rate считаем только по закрытым сделкам (с PnL)
        const winRate = processedTrades > 0 ? profitableTrades / processedTrades : 0;
        const averageTrade = processedTrades > 0 ? totalReturn / processedTrades : 0;

        return {
            totalTrades: processedTrades, // Возвращаем количество обработанных сделок
            winRate,
            totalReturn,
            maxDrawdown,
            averageTrade,
            mode
        };
    }

    /**
     * Уведомление о исполнении ордера
     */
    async notifyOrderExecution(signal, result) {
        const message = {
            type: 'order_executed',
            signal,
            result,
            timestamp: new Date().toISOString()
        };

        // WebSocket уведомление
        try {
            const webSocketService = getWebSocketService();
            if (webSocketService && typeof webSocketService.broadcast === 'function') {
                webSocketService.broadcast(message);
            }
        } catch (error) {
            // Игнорируем ошибки WebSocket, чтобы не прерывать выполнение ордера
            console.warn('Failed to broadcast order execution via WebSocket:', error.message);
        }
    }

    /**
     * Задержка для имитации
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Переключение режима торговли
     */
    async switchTradingMode(newMode) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            // Проверяем возможность переключения
            const canSwitch = await this.modeManager.canSwitchTo(newMode);
            if (!canSwitch.canSwitch) {
                throw new Error(`Невозможно переключиться на режим ${newMode}: ${canSwitch.reason}`);
            }

            const previousMode = this.modeManager.getCurrentMode().mode;
            const result = await this.modeManager.switchMode(newMode);
            
            // Автоматически активируем движок при переключении на paper режим
            // Для micro и real требуется явная активация через activate()
            if (newMode === 'paper') {
                this.isActive = true;
            } else {
                // Для micro и real деактивируем до явной активации
                this.isActive = false;
            }
            return {
                ...result,
                isActive: this.isActive,
                requiresActivation: newMode !== 'paper'
            };
        } catch (error) {
            console.error('❌ Ошибка переключения режима в TradingEngine:', error);
            throw error;
        }
    }

    /**
     * Активация торгового движка
     * Для micro и real режимов требуется явная активация
     */
    async activate() {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            const modeInfo = this.modeManager.getCurrentMode();
            const mode = modeInfo.mode || modeInfo;

            // Проверяем готовность к активации
            if (mode === 'micro' || mode === 'real') {
                // Для реальных режимов проверяем готовность
                const canSwitch = await this.modeManager.canSwitchTo(mode);
                if (!canSwitch.canSwitch) {
                    throw new Error(`Невозможно активировать движок в режиме ${mode}: ${canSwitch.reason}`);
                }

                // Проверяем доступность брокера для реальных режимов
                if (mode === 'real') {
                    const isTradingAvailable = await this.broker.isTradingAvailable();
                    if (!isTradingAvailable) {
                        throw new Error('Торговля недоступна в данный момент. Проверьте подключение к брокеру.');
                    }
                }
            }
            
            this.isActive = true;

            return {
                success: true,
                isActive: true,
                mode: mode,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('❌ Ошибка активации Trading Engine:', error);
            throw error;
        }
    }

    /**
     * Деактивация торгового движка
     */
    async deactivate() {
        try {
            this.isActive = false;

            return {
                success: true,
                isActive: false,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('❌ Ошибка деактивации Trading Engine:', error);
            throw error;
        }
    }

    /**
     * Получить текущий режим (для совместимости)
     */
    get mode() {
        const modeInfo = this.modeManager.getCurrentMode();
        return modeInfo.mode || modeInfo;
    }

    /**
     * Получение статуса движка
     */
    async getStatus() {
        const modeInfo = this.modeManager.getCurrentMode();
        const modeSettings = await this.modeManager.getModeSettings();
        const mode = modeInfo.mode || modeInfo;
        
        return {
            isInitialized: this.isInitialized,
            isActive: this.isActive,
            currentMode: modeInfo,
            mode: mode, // Для совместимости с WebSocket
            modeSettings: modeSettings,
            portfolio: await this.getPortfolioValue(),
            stats: await this.calculateTradingStats()
        };
    }

    async stop() {
        try {

            // Останавливаем все активные процессы
            this.isRunning = false;
            
            // Очищаем таймеры если есть
            if (this.tradingTimer) {
                clearInterval(this.tradingTimer);
                this.tradingTimer = null;
            }

        } catch (error) {
            console.error('❌ Error stopping Trading Engine:', error);
            throw error;
        }
    }
}

export default new TradingEngine();
