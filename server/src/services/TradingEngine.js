import TradingModeManager from './TradingModeManager.js';
import TinkoffApiService from './TinkoffApiService.js';
import WebSocketService from './WebSocketService.js';
import RiskManagementService from './RiskManagementService.js';
import CacheService from './CacheService.js';
import VirtualPortfolio from '../models/VirtualPortfolio.js';

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
            console.log('🚀 Инициализация Trading Engine...');
            
            await this.modeManager.initialize();
            await RiskManagementService.initialize();
            this.broker = TinkoffApiService;
            
            // Загружаем виртуальный портфель из БД или создаем новый
            await this.loadVirtualPortfolio();
            
            this.isInitialized = true;
            this.isActive = true; // Активируем после инициализации
            console.log('✅ Trading Engine инициализирован и активирован');
            
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
                console.log('📊 Демо-портфель уже инициализирован');
                return;
            }

            console.log('📊 Инициализация демо-портфеля...');
            
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
            
            console.log('✅ Демо-портфель инициализирован с тестовыми позициями');
            console.log(`💰 Наличные: ${this.virtualPortfolio.cash.toLocaleString('ru-RU')} ₽`);
            console.log(`📊 Позиций: ${Object.keys(demoPositions).length}`);
            
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
        console.log(`📊 Исполнение ордера в режиме ${mode.toUpperCase()}:`, signal);

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

            // 3. Использование скорректированного сигнала если есть
            const finalSignal = validation.adjustedSignal || signal;
            
            // 4. Исполнение ордера
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

            // 4. Обновление статистики риск-менеджмента
            if (result.trade) {
                await RiskManagementService.updateStats(result.trade);
            }

            // 5. Уведомление о исполнении
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
        
        // Имитация задержки исполнения
        await this.delay(settings.executionDelay);
        
        // Имитация проскальзывания (более реалистичная модель)
        const slippagePercent = settings.slippage || 0.001; // 0.1% по умолчанию
        // Проскальзывание зависит от объема и волатильности (более реалистично)
        const volumeFactor = Math.min(quantity / 1000, 1); // Нормализация объема
        const slippage = price * slippagePercent * volumeFactor * (action === 'BUY' ? 1 : -1);
        const executionPrice = price + slippage;
        
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
            const buyTrades = this.virtualPortfolio.trades.filter(t => 
                (t.symbol === symbol || t.figi === symbol) && t.action === 'BUY'
            );
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

        // Запись сделки
        const trade = {
            id: `paper_${Date.now()}`,
            symbol,
            action,
            quantity,
            price: executionPrice,
            commission,
            pnl,
            timestamp: new Date().toISOString(),
            confidence,
            mode: 'paper'
        };
        
        this.virtualPortfolio.trades.push(trade);
        
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
        
        if (limitedQuantity < quantity) {
            console.log(`⚠️ Ограничение размера позиции: ${quantity} → ${limitedQuantity}`);
        }

        try {
            // Проверяем доступность торговли
            const isTradingAvailable = await this.broker.isTradingAvailable();
            if (!isTradingAvailable) {
                throw new Error('Торговля недоступна в данный момент');
            }

            // Реальное исполнение через Tinkoff API
            const orderResult = await this.broker.placeOrder({
                symbol,
                action,
                quantity: limitedQuantity,
                price,
                orderType: 'LIMIT'
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

            // Реальное исполнение через Tinkoff API
            const orderResult = await this.broker.placeOrder({
                symbol,
                action,
                quantity,
                price,
                orderType: 'LIMIT'
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
            console.log('📊 Загрузка виртуального портфеля из БД...');
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
                console.log(`✅ Виртуальный портфель загружен из БД:`);
                console.log(`   💰 Наличные: ${this.virtualPortfolio.cash.toLocaleString('ru-RU')} ₽`);
                console.log(`   📈 Позиций: ${positionsCount}`);
                if (positionsCount > 0) {
                    console.log(`   📋 Позиции:`, Object.entries(this.virtualPortfolio.positions).map(([figi, qty]) => `${figi}: ${qty}`).join(', '));
                }
                console.log(`   💼 Общая стоимость: ${this.virtualPortfolio.totalValue.toLocaleString('ru-RU')} ₽`);
                console.log(`   📊 Сделок в истории: ${this.virtualPortfolio.trades.length}`);
                
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
                        console.log(`   🔄 Общая стоимость пересчитана: ${this.virtualPortfolio.totalValue.toLocaleString('ru-RU')} ₽`);
                    }
                } catch (priceError) {
                    console.warn('⚠️ Не удалось пересчитать стоимость позиций, используем сохраненное значение:', priceError.message);
                }
            } else {
                // Если портфеля нет в БД, создаем новый
                console.log('📊 Виртуальный портфель не найден в БД, создаем новый с начальным капиталом');
                this.virtualPortfolio = {
                    cash: 1000000,
                    positions: {},
                    totalValue: 1000000,
                    trades: [],
                    initialCapital: 1000000
                };
                await this.saveVirtualPortfolio();
                console.log('✅ Новый виртуальный портфель создан и сохранен в БД');
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
            
            console.log(`💾 Сохранение виртуального портфеля в БД:`);
            console.log(`   💰 Наличные: ${this.virtualPortfolio.cash.toLocaleString('ru-RU')} ₽`);
            console.log(`   📈 Позиций: ${Object.keys(positionsToSave).length}`);
            if (Object.keys(positionsToSave).length > 0) {
                console.log(`   📋 Позиции:`, Object.entries(positionsToSave).map(([figi, qty]) => `${figi}: ${qty}`).join(', '));
            }
            console.log(`   💼 Общая стоимость: ${this.virtualPortfolio.totalValue.toLocaleString('ru-RU')} ₽`);
            console.log(`   📊 Сделок в истории: ${tradesToSave.length}`);
            
            await VirtualPortfolio.savePortfolio({
                cash: this.virtualPortfolio.cash,
                positions: positionsToSave,
                trades: tradesToSave,
                totalValue: this.virtualPortfolio.totalValue,
                initialCapital: this.virtualPortfolio.initialCapital || 1000000
            });
            
            console.log(`✅ Виртуальный портфель успешно сохранен в БД`);
            
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
        // Здесь должна быть логика получения текущих цен
        // Пока возвращаем базовую стоимость
        let positionsValue = 0;
        
        for (const [symbol, quantity] of Object.entries(this.virtualPortfolio.positions)) {
            if (quantity > 0) {
                // Получаем реальную цену
                // skipUpdate = true, чтобы не дергать API при обучении
                const prices = await this.getCurrentPrices([symbol], true);
                const currentPrice = prices[symbol] || 0;
                positionsValue += currentPrice * quantity;
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
            return {
                ...portfolio,
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
    getTradeHistory(limit = 100) {
        const modeInfo = this.modeManager.getCurrentMode();
        const mode = modeInfo.mode || modeInfo; // Поддержка старого формата
        
        if (mode === 'paper') {
            return this.virtualPortfolio.trades.slice(-limit);
        } else {
            // Для реальных режимов нужно получать данные из брокера
            return [];
        }
    }

    /**
     * Расчет статистики торговли
     */
    async calculateTradingStats() {
        const trades = this.getTradeHistory();
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

        for (const trade of trades) {
            // Используем уже рассчитанный PnL из сделки (учитывает комиссии)
            if (trade.pnl !== undefined) {
                totalReturn += trade.pnl;
                if (trade.pnl > 0) {
                    profitableTrades++;
                }
            } else if (trade.action === 'SELL') {
                // Fallback: если PnL не рассчитан, рассчитываем с учетом комиссии
                const buyTrades = trades.filter(t => 
                    (t.symbol === trade.symbol || t.figi === trade.symbol) && 
                    t.action === 'BUY' && 
                    new Date(t.timestamp) < new Date(trade.timestamp)
                );
                if (buyTrades.length > 0) {
                    const totalCost = buyTrades.reduce((sum, t) => 
                        sum + (t.price * t.quantity) + (t.commission || 0), 0
                    );
                    const totalQuantity = buyTrades.reduce((sum, t) => sum + t.quantity, 0);
                    const averageBuyPrice = totalQuantity > 0 ? totalCost / totalQuantity : trade.price;
                    const profit = (trade.price - averageBuyPrice) * trade.quantity - (trade.commission || 0);
                    totalReturn += profit;
                    if (profit > 0) {
                        profitableTrades++;
                    }
                }
            }
        }

        const winRate = trades.length > 0 ? profitableTrades / trades.length : 0;
        const averageTrade = trades.length > 0 ? totalReturn / trades.length : 0;

        return {
            totalTrades: trades.length,
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
        WebSocketService.broadcast(message);
        
        console.log(`📊 Ордер исполнен: ${signal.symbol} ${signal.action} ${signal.quantity} @ ${result.trade.price}`);
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
                console.log(`✅ TradingEngine автоматически активирован для режима ${newMode}`);
            } else {
                // Для micro и real деактивируем до явной активации
                this.isActive = false;
                console.log(`⏸️ TradingEngine деактивирован. Требуется явная активация для режима ${newMode}`);
            }
            
            console.log(`🔄 TradingEngine: режим изменен с ${previousMode} на ${newMode}`);
            
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
            console.log(`✅ Trading Engine активирован в режиме ${mode}`);
            
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
            console.log('⏸️ Trading Engine деактивирован');
            
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
            console.log('🛑 Stopping Trading Engine...');
            
            // Останавливаем все активные процессы
            this.isRunning = false;
            
            // Очищаем таймеры если есть
            if (this.tradingTimer) {
                clearInterval(this.tradingTimer);
                this.tradingTimer = null;
            }
            
            console.log('✅ Trading Engine stopped successfully');
            
        } catch (error) {
            console.error('❌ Error stopping Trading Engine:', error);
            throw error;
        }
    }
}

export default new TradingEngine();
