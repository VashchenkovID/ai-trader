import { Op } from 'sequelize';
import LoggerService from './LoggerService.js';

/**
 * Сервис для расчета прибыли/убыли (PnL) для реального режима торговли
 * Реализует расчет на основе закрытых сделок и открытых позиций
 */
class PnLCalculationService {
    constructor() {
        this.isInitialized = false;
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        try {
            this.isInitialized = true;
        } catch (error) {
            LoggerService.error('Failed to initialize PnLCalculationService', {
                service: 'PnLCalculationService',
                operation: 'initialize',
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
            throw error;
        }
    }

    /**
     * Расчет реализованной прибыли/убытка от закрытых позиций
     * @param {Array} closedTrades - Массив закрытых сделок (PositionExit или TradingRequest)
     * @returns {Object} - Реализованная прибыль/убыток
     */
    calculateRealizedPnL(closedTrades) {
        if (!closedTrades || closedTrades.length === 0) {
            return {
                total: 0,
                count: 0,
                profitable: 0,
                unprofitable: 0,
                averageProfit: 0,
                averageLoss: 0,
                trades: []
            };
        }

        let totalPnL = 0;
        let profitableCount = 0;
        let unprofitableCount = 0;
        let totalProfit = 0;
        let totalLoss = 0;
        const trades = [];

        for (const trade of closedTrades) {
            // Поддерживаем разные форматы данных
            const entryPrice = trade.entryPrice || trade.actualPrice || trade.priceAtRequest;
            const exitPrice = trade.exitPrice;
            const quantity = trade.exitQuantity || trade.quantity;
            const commission = trade.commission || 0;
            
            // Если есть уже рассчитанная прибыль, используем её
            let tradePnL = 0;
            if (trade.realizedProfit !== undefined && trade.realizedProfit !== null) {
                tradePnL = trade.realizedProfit;
            } else if (entryPrice && exitPrice && quantity) {
                // Рассчитываем прибыль: (цена_выхода - цена_входа) * количество - комиссия
                tradePnL = (exitPrice - entryPrice) * quantity - commission;
            }

            if (entryPrice && exitPrice && quantity) {
                totalPnL += tradePnL;
                
                const profitPercent = entryPrice > 0 
                    ? ((exitPrice - entryPrice) / entryPrice) * 100 
                    : 0;

                trades.push({
                    figi: trade.figi,
                    ticker: trade.ticker,
                    name: trade.name,
                    entryPrice,
                    exitPrice,
                    quantity,
                    commission,
                    pnl: tradePnL,
                    pnlPercent: profitPercent,
                    exitDate: trade.exitDate || trade.executedAt || trade.updatedAt
                });

                if (tradePnL > 0) {
                    profitableCount++;
                    totalProfit += tradePnL;
                } else if (tradePnL < 0) {
                    unprofitableCount++;
                    totalLoss += Math.abs(tradePnL);
                }
            }
        }

        return {
            total: totalPnL,
            count: trades.length,
            profitable: profitableCount,
            unprofitable: unprofitableCount,
            averageProfit: profitableCount > 0 ? totalProfit / profitableCount : 0,
            averageLoss: unprofitableCount > 0 ? totalLoss / unprofitableCount : 0,
            winRate: trades.length > 0 ? profitableCount / trades.length : 0, // В диапазоне 0-1 для единообразия
            trades
        };
    }

    /**
     * Единая функция расчета винрейта и Sharpe Ratio из закрытых сделок
     * @param {Array} closedTrades - Массив закрытых сделок с полем pnl
     * @param {number} initialCapital - Начальный капитал для расчета Sharpe Ratio
     * @returns {Object} - {winRate: 0-1, sharpeRatio: number, totalTrades: number}
     */
    calculateMetricsFromClosedTrades(closedTrades, initialCapital = 1000000) {
        if (!closedTrades || closedTrades.length === 0) {
            return {
                winRate: 0,
                sharpeRatio: 0,
                totalTrades: 0
            };
        }

        // Фильтруем только сделки с валидным PnL
        const validTrades = closedTrades.filter(trade => {
            const pnl = trade.pnl;
            return pnl !== null && pnl !== undefined && !isNaN(pnl) && isFinite(pnl);
        });

        if (validTrades.length === 0) {
            return {
                winRate: 0,
                sharpeRatio: 0,
                totalTrades: 0
            };
        }

        // Рассчитываем винрейт (в диапазоне 0-1)
        const profitableTrades = validTrades.filter(t => t.pnl > 0).length;
        const winRate = validTrades.length > 0 ? profitableTrades / validTrades.length : 0;

        // Рассчитываем Sharpe Ratio из относительных доходностей
        let sharpeRatio = 0;
        if (validTrades.length > 1) {
            const returns = [];
            let runningCapital = initialCapital;

            // Сортируем сделки по дате
            const sortedTrades = [...validTrades].sort((a, b) => {
                const dateA = new Date(a.executedAt || a.exitDate || a.timestamp || 0);
                const dateB = new Date(b.executedAt || b.exitDate || b.timestamp || 0);
                return dateA - dateB;
            });

            // Рассчитываем относительные доходности
            for (const trade of sortedTrades) {
                const pnl = trade.pnl || 0;
                if (runningCapital > 0 && !isNaN(pnl) && isFinite(pnl)) {
                    const returnPercent = (pnl / runningCapital) * 100;
                    if (!isNaN(returnPercent) && isFinite(returnPercent)) {
                        returns.push(returnPercent);
                        runningCapital += pnl;
                    }
                }
            }

            if (returns.length > 1) {
                const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
                const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
                const volatility = Math.sqrt(variance);

                // Sharpe Ratio: (Average Return - Risk-Free Rate) / Volatility
                // Безрисковая ставка = 0 для упрощения
                if (volatility > 0 && !isNaN(avgReturn) && isFinite(avgReturn)) {
                    sharpeRatio = avgReturn / volatility;
                }
            }
        }

        return {
            winRate, // В диапазоне 0-1
            sharpeRatio,
            totalTrades: validTrades.length
        };
    }

    /**
     * Расчет нереализованной прибыли/убытка от открытых позиций
     * @param {Array} openPositions - Массив открытых позиций
     * @param {Object} currentPrices - Объект с текущими ценами {figi: price}
     * @returns {Object} - Нереализованная прибыль/убыток
     */
    calculateUnrealizedPnL(openPositions, currentPrices) {
        if (!openPositions || openPositions.length === 0) {
            return {
                total: 0,
                count: 0,
                profitable: 0,
                unprofitable: 0,
                positions: []
            };
        }

        let totalPnL = 0;
        let profitableCount = 0;
        let unprofitableCount = 0;
        const positions = [];

        for (const position of openPositions) {
            const entryPrice = position.entryPrice || position.averagePrice || position.actualPrice || position.priceAtRequest;
            const currentPrice = currentPrices[position.figi] || position.currentPrice || 0;
            const quantity = position.quantity;

            if (entryPrice && currentPrice && quantity) {
                const pnl = (currentPrice - entryPrice) * quantity;
                const pnlPercent = entryPrice > 0 
                    ? ((currentPrice - entryPrice) / entryPrice) * 100 
                    : 0;

                totalPnL += pnl;

                positions.push({
                    figi: position.figi,
                    ticker: position.ticker,
                    name: position.name,
                    entryPrice,
                    currentPrice,
                    quantity,
                    pnl,
                    pnlPercent,
                    marketValue: currentPrice * quantity
                });

                if (pnl > 0) {
                    profitableCount++;
                } else if (pnl < 0) {
                    unprofitableCount++;
                }
            }
        }

        return {
            total: totalPnL,
            count: positions.length,
            profitable: profitableCount,
            unprofitable: unprofitableCount,
            positions
        };
    }

    /**
     * Получение закрытых сделок из базы данных
     * @param {string} tradingMode - Режим торговли ('paper', 'micro', 'real')
     * @param {Date} startDate - Начальная дата (опционально)
     * @param {Date} endDate - Конечная дата (опционально)
     * @returns {Promise<Array>} - Массив закрытых сделок
     */
    async getClosedTrades(tradingMode = 'real', startDate = null, endDate = null) {
        try {
            // Для виртуальной торговли получаем сделки из TradingEngine
            if (tradingMode === 'paper') {
                const TradingEngine = (await import('./TradingEngine.js')).default;
                const trades = await TradingEngine.getTradeHistory(10000); // Получаем все сделки
                
                // Фильтруем только SELL сделки с валидным PnL (закрытые позиции)
                // В виртуальной торговле используется trade.action, а не trade.type
                const closedTrades = trades.filter(trade => {
                    const hasPnL = trade.pnl !== undefined && 
                                   trade.pnl !== null && 
                                   !isNaN(trade.pnl) && 
                                   isFinite(trade.pnl);
                    const isSell = (trade.action === 'SELL' || trade.type === 'SELL');
                    const isNotBuy = (trade.action !== 'BUY' && trade.type !== 'BUY');
                    
                    // Фильтруем по дате, если указана
                    let inDateRange = true;
                    if (startDate || endDate) {
                        const tradeDate = new Date(trade.timestamp || trade.date || trade.createdAt);
                        if (startDate && tradeDate < new Date(startDate)) inDateRange = false;
                        if (endDate && tradeDate > new Date(endDate)) inDateRange = false;
                    }
                    
                    return hasPnL && (isSell || isNotBuy) && inDateRange;
                });
                
                // Преобразуем в формат для расчета PnL
                return closedTrades.map(trade => {
                    // Находим соответствующую BUY сделку для расчета entryPrice
                    const buyTrades = trades.filter(t => {
                        const isBuy = (t.action === 'BUY' || t.type === 'BUY');
                        const sameInstrument = (t.figi === trade.figi || t.symbol === trade.symbol || 
                                               t.figi === trade.symbol || t.symbol === trade.figi);
                        const buyTime = t.timestamp ? new Date(t.timestamp).getTime() : 0;
                        const sellTime = trade.timestamp ? new Date(trade.timestamp).getTime() : 0;
                        return isBuy && sameInstrument && buyTime < sellTime;
                    });
                    
                    let entryPrice = trade.price; // Fallback
                    if (buyTrades.length > 0) {
                        const totalCost = buyTrades.reduce((sum, t) => 
                            sum + (t.price * t.quantity) + (t.commission || 0), 0
                        );
                        const totalQuantity = buyTrades.reduce((sum, t) => sum + t.quantity, 0);
                        entryPrice = totalQuantity > 0 ? totalCost / totalQuantity : trade.price;
                    }
                    
                    return {
                        figi: trade.figi || trade.symbol,
                        ticker: trade.ticker || trade.symbol,
                        name: trade.name || trade.ticker || trade.symbol,
                        entryPrice: entryPrice,
                        exitPrice: trade.price,
                        exitQuantity: trade.quantity,
                        quantity: trade.quantity,
                        commission: trade.commission || 0,
                        realizedProfit: trade.pnl, // Используем уже рассчитанный PnL
                        pnl: trade.pnl, // Добавляем pnl для единообразия с calculateMetricsFromClosedTrades
                        exitDate: trade.timestamp || trade.date || trade.createdAt,
                        executedAt: trade.timestamp || trade.date || trade.createdAt,
                        actualPrice: trade.price,
                        priceAtRequest: trade.price
                    };
                });
            }
            
            // Для реальной торговли используем PositionExit
            const PositionExit = (await import('../models/PositionExit.js')).default;
            const TradingRequest = (await import('../models/TradingRequest.js')).default;

            const whereClause = {
                status: 'EXECUTED',
                tradingMode
            };

            if (startDate || endDate) {
                whereClause.executedAt = {};
                if (startDate) {
                    whereClause.executedAt[Op.gte] = startDate;
                }
                if (endDate) {
                    whereClause.executedAt[Op.lte] = endDate;
                }
            }

            const exits = await PositionExit.findAll({
                where: whereClause,
                order: [['executedAt', 'DESC']]
            });

            // Получаем связанные TradingRequest отдельно
            const tradingRequestIds = [...new Set(exits.map(e => e.tradingRequestId).filter(id => id))];
            let tradingRequestsMap = new Map();
            
            if (tradingRequestIds.length > 0) {
                const tradingRequests = await TradingRequest.findAll({
                    where: {
                        id: {
                            [Op.in]: tradingRequestIds
                        }
                    }
                });
                tradingRequestsMap = new Map(tradingRequests.map(tr => [tr.id, tr]));
            }

            // Преобразуем PositionExit в формат для расчета PnL
            return exits.map(exit => {
                const tradingRequest = tradingRequestsMap.get(exit.tradingRequestId) || {};
                const realizedProfit = exit.realizedProfit || 0;
                return {
                    figi: exit.figi,
                    ticker: exit.ticker,
                    name: exit.name,
                    entryPrice: exit.entryPrice,
                    exitPrice: exit.exitPrice,
                    exitQuantity: exit.exitQuantity,
                    quantity: exit.exitQuantity,
                    commission: exit.commission || 0,
                    realizedProfit: realizedProfit,
                    pnl: realizedProfit, // Добавляем pnl для единообразия с calculateMetricsFromClosedTrades
                    exitDate: exit.executedAt,
                    executedAt: exit.executedAt,
                    tradingRequestId: exit.tradingRequestId,
                    // Дополнительные данные из TradingRequest
                    actualPrice: tradingRequest.actualPrice,
                    priceAtRequest: tradingRequest.priceAtRequest
                };
            });
        } catch (error) {
            LoggerService.error('Error getting closed trades', {
                service: 'PnLCalculationService',
                operation: 'getClosedTrades',
                tradingMode,
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
            return [];
        }
    }

    /**
     * Получение открытых позиций из портфеля
     * @param {Object} portfolio - Объект портфеля
     * @returns {Promise<Array>} - Массив открытых позиций
     */
    async getOpenPositions(portfolio) {
        try {
            const TradingRequest = (await import('../models/TradingRequest.js')).default;
            const CacheService = (await import('./CacheService.js')).default;

            const positions = [];
            const portfolioPositions = portfolio.positions || {};

            // Извлекаем tradingMode из portfolio
            // portfolio.mode может быть строкой или объектом { mode: 'paper' }
            let tradingMode = 'real';
            if (portfolio.mode) {
                if (typeof portfolio.mode === 'string') {
                    tradingMode = portfolio.mode;
                } else if (typeof portfolio.mode === 'object' && portfolio.mode.mode) {
                    tradingMode = portfolio.mode.mode;
                } else if (typeof portfolio.mode === 'object' && portfolio.mode.tradingMode) {
                    tradingMode = portfolio.mode.tradingMode;
                }
            } else if (portfolio.tradingMode) {
                tradingMode = portfolio.tradingMode;
            }

            // ИСПОЛЬЗУЕМ ВСЕ ПОЗИЦИИ ИЗ ПОРТФЕЛЯ КАК ИСТОЧНИК ИСТИНЫ
            // Сначала собираем все FIGI из portfolio.positions
            const figisFromPortfolio = Object.keys(portfolioPositions).filter(figi => portfolioPositions[figi] > 0);
            
            // Получаем все открытые BUY заявки для этих FIGI
            const openBuyRequests = await TradingRequest.findAll({
                where: {
                    action: 'BUY',
                    figi: figisFromPortfolio.length > 0 ? { [Op.in]: figisFromPortfolio } : { [Op.ne]: null },
                    status: {
                        [Op.in]: ['EXECUTED', 'APPROVED']
                    },
                    tradingMode: tradingMode
                },
                order: [['executedAt', 'ASC'], ['createdAt', 'ASC']]
            });

            // Группируем по FIGI и рассчитываем среднюю цену покупки
            const positionsByFigi = new Map();

            // Сначала инициализируем позиции для всех FIGI из портфеля
            for (const figi of figisFromPortfolio) {
                const quantity = portfolioPositions[figi] || 0;
                if (quantity > 0) {
                    positionsByFigi.set(figi, {
                        figi,
                        ticker: null,
                        name: null,
                        buyTrades: [],
                        totalQuantity: 0,
                        totalCost: 0,
                        portfolioQuantity: quantity // Сохраняем количество из портфеля
                    });
                }
            }

            // Затем обрабатываем заявки для расчета средней цены
            for (const request of openBuyRequests) {
                const figi = request.figi;
                const quantity = portfolioPositions[figi] || 0;

                if (quantity > 0 && positionsByFigi.has(figi)) {
                    const position = positionsByFigi.get(figi);
                    
                    // Обновляем ticker и name, если они есть
                    if (!position.ticker && request.ticker) {
                        position.ticker = request.ticker;
                    }
                    if (!position.name && request.name) {
                        position.name = request.name;
                    }
                    
                    const entryPrice = request.actualPrice || request.priceAtRequest;
                    const tradeQuantity = Math.min(request.quantity, quantity - position.totalQuantity);

                    if (tradeQuantity > 0 && entryPrice) {
                        position.buyTrades.push({
                            price: entryPrice,
                            quantity: tradeQuantity
                        });
                        position.totalQuantity += tradeQuantity;
                        position.totalCost += entryPrice * tradeQuantity;
                    }
                }
            }

            // Получаем актуальные текущие цены (skipUpdate = false для обновления кеша)
            // Это важно для корректного расчета прибыли/убытка
            const figis = Array.from(positionsByFigi.keys());
            const currentPrices = {};

            // Используем TradingEngine для получения актуальных цен
            try {
                const TradingEngine = (await import('./TradingEngine.js')).default;
                const prices = await TradingEngine.getCurrentPrices(figis, false);
                // Копируем цены в currentPrices
                for (const figi of figis) {
                    currentPrices[figi] = prices[figi] || 0;
                }
            } catch (error) {
                // Fallback: используем кеш, если TradingEngine недоступен
                LoggerService.warn('Could not get prices from TradingEngine, using cache', {
                    service: 'PnLCalculationService',
                    operation: 'getOpenPositions',
                    error: { message: error.message }
                });

            for (const figi of figis) {
                try {
                        const instrument = await CacheService.getInstrument(figi, false); // Обновляем кеш
                    currentPrices[figi] = instrument?.lastPrice || 0;
                    } catch (cacheError) {
                    LoggerService.warn(`Could not get price for ${figi}`, {
                        service: 'PnLCalculationService',
                        operation: 'getOpenPositions',
                        figi,
                            error: { message: cacheError.message }
                    });
                    }
                }
            }

            // Формируем массив позиций
            for (const [figi, positionData] of positionsByFigi.entries()) {
                // Используем количество из портфеля как источник истины
                const quantity = positionData.portfolioQuantity || positionData.totalQuantity || 0;
                
                // Рассчитываем среднюю цену покупки
                let averagePrice = 0;
                if (positionData.totalQuantity > 0 && positionData.totalCost > 0) {
                    // Если есть заявки, используем среднюю цену из них
                    averagePrice = positionData.totalCost / positionData.totalQuantity;
                } else {
                    // Если нет заявок, пытаемся получить цену из кеша
                    try {
                        const instrument = await CacheService.getInstrument(figi, false);
                        averagePrice = instrument?.lastPrice || currentPrices[figi] || 0;
                    } catch (error) {
                        averagePrice = currentPrices[figi] || 0;
                    }
                }
                
                const currentPrice = currentPrices[figi] || 0;
                
                // Если нет ticker/name, получаем из кеша
                let ticker = positionData.ticker;
                let name = positionData.name;
                if (!ticker || !name) {
                    try {
                        const instrument = await CacheService.getInstrument(figi, false);
                        if (!ticker) ticker = instrument?.ticker || figi.substring(0, 10);
                        if (!name) name = instrument?.name || 'Неизвестно';
                    } catch (error) {
                        if (!ticker) ticker = figi.substring(0, 10);
                        if (!name) name = 'Неизвестно';
                    }
                }

                positions.push({
                    figi,
                    ticker,
                    name,
                    entryPrice: averagePrice,
                    averagePrice,
                    currentPrice,
                    quantity,
                    marketValue: currentPrice * quantity
                });
            }

            return positions;
        } catch (error) {
            LoggerService.error('Error getting open positions', {
                service: 'PnLCalculationService',
                operation: 'getOpenPositions',
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
            return [];
        }
    }

    /**
     * Полный расчет PnL для портфеля
     * @param {Object} portfolio - Объект портфеля
     * @param {Object} options - Опции расчета
     * @returns {Promise<Object>} - Полный расчет PnL
     */
    async calculateTotalPnL(portfolio, options = {}) {
        try {
            const {
                tradingMode = portfolio.mode || 'real',
                startDate = null,
                endDate = null,
                includeTrades = true,
                includePositions = true,
                includeCashFlow = true
            } = options;

            // Получаем закрытые сделки
            let closedTrades = [];
            let realizedPnL = { total: 0, count: 0, profitable: 0, unprofitable: 0, trades: [] };

            if (includeTrades) {
                // Преобразуем даты в ISO строки, если они объекты Date
                const startDateStr = startDate ? (startDate instanceof Date ? startDate.toISOString() : startDate) : null;
                const endDateStr = endDate ? (endDate instanceof Date ? endDate.toISOString() : endDate) : null;
                closedTrades = await this.getClosedTrades(tradingMode, startDateStr, endDateStr);
                realizedPnL = this.calculateRealizedPnL(closedTrades);
            }

            // Получаем открытые позиции и текущие цены
            let openPositions = [];
            let unrealizedPnL = { total: 0, count: 0, profitable: 0, unprofitable: 0, positions: [] };

            if (includePositions) {
                openPositions = await this.getOpenPositions(portfolio);
                
                // Формируем объект с текущими ценами
                const currentPrices = {};
                openPositions.forEach(pos => {
                    currentPrices[pos.figi] = pos.currentPrice;
                });

                unrealizedPnL = this.calculateUnrealizedPnL(openPositions, currentPrices);
                
                // Если позиции не найдены через TradingRequest, но есть positionsValue в портфеле,
                // используем упрощенный расчет unrealizedPnL на основе totalValue и initialCapital
                if (unrealizedPnL.count === 0 && portfolio.positionsValue > 0 && portfolio.positions) {
                    const positionsCount = Object.keys(portfolio.positions).length;
                    if (positionsCount > 0) {
                        const totalValue = portfolio.totalValue || 0;
                        const initialCapital = portfolio.initialCapital || (tradingMode === 'paper' ? 1000000 : 0);
                        
                        // Если totalValue отличается от initialCapital, часть разницы - это unrealizedPnL
                        // (остальное - realizedPnL, если он есть)
                        if (totalValue !== initialCapital) {
                            const totalPnLFromValue = totalValue - initialCapital;
                            // Если есть realizedPnL, вычитаем его, иначе весь PnL - unrealized
                            unrealizedPnL.total = totalPnLFromValue - realizedPnL.total;
                            unrealizedPnL.count = positionsCount;
                        }
                    }
                }
            }

            // Рассчитываем метрики из закрытых сделок (винрейт и Sharpe Ratio)
            const defaultInitialCapital = tradingMode === 'paper' ? 1000000 : 0;
            const initialCapital = portfolio.initialCapital || defaultInitialCapital;
            const metrics = this.calculateMetricsFromClosedTrades(closedTrades, initialCapital);

            // Общий PnL
            let totalPnL = realizedPnL.total + unrealizedPnL.total;

            // Если нет сделок и позиций, но есть totalValue, рассчитываем PnL как разницу
            // Это важно для бумажной торговли, где может не быть закрытых сделок
            if (totalPnL === 0 && realizedPnL.count === 0 && unrealizedPnL.count === 0) {
                const totalValue = portfolio.totalValue || 0;
                if (totalValue > 0 && initialCapital > 0) {
                    totalPnL = totalValue - initialCapital;
                }
            }

            // Получаем данные о вводах/выводах средств (если нужно)
            let adjustedCapital = initialCapital;
            let cashFlowData = null;

            if (includeCashFlow) {
                try {
                    const CashFlow = (await import('../models/CashFlow.js')).default;
                    const portfolioType = tradingMode === 'real' ? 'real' : 'virtual';
                    
                    const totalDeposits = await CashFlow.getTotalDeposits(portfolioType, startDate, endDate);
                    const totalWithdrawals = await CashFlow.getTotalWithdrawals(portfolioType, startDate, endDate);
                    const netCashFlow = totalDeposits - totalWithdrawals;
                    
                    // Скорректированный капитал = начальный капитал + депозиты - выводы
                    adjustedCapital = adjustedCapital + netCashFlow;
                    
                    cashFlowData = {
                        totalDeposits,
                        totalWithdrawals,
                        netCashFlow,
                        adjustedCapital
                    };
                } catch (error) {
                    LoggerService.warn('Could not get cash flow data', {
                        service: 'PnLCalculationService',
                        operation: 'calculateTotalPnL',
                        error: { message: error.message }
                    });
                    // Продолжаем без учета cash flow
                }
            }

            // Рассчитываем проценты от скорректированного капитала
            const totalValue = portfolio.totalValue || 0;
            
            let realizedPnLPercent = 0;
            let totalPnLPercent = 0;

            if (adjustedCapital > 0) {
                realizedPnLPercent = (realizedPnL.total / adjustedCapital) * 100;
                totalPnLPercent = (totalPnL / adjustedCapital) * 100;
            }

            return {
                realized: {
                    ...realizedPnL,
                    percent: realizedPnLPercent
                },
                unrealized: {
                    ...unrealizedPnL
                },
                total: {
                    pnl: totalPnL,
                    percent: totalPnLPercent,
                    count: realizedPnL.count + unrealizedPnL.count
                },
                portfolio: {
                    initialCapital: portfolio.initialCapital || defaultInitialCapital,
                    adjustedCapital: cashFlowData?.adjustedCapital || (portfolio.initialCapital || defaultInitialCapital),
                    totalValue,
                    cash: portfolio.cash || 0,
                    positionsValue: portfolio.positionsValue || 0
                },
                cashFlow: cashFlowData || null,
                summary: {
                    totalTrades: metrics.totalTrades,
                    totalPositions: unrealizedPnL.count,
                    winRate: metrics.winRate, // В диапазоне 0-1
                    sharpeRatio: metrics.sharpeRatio,
                    averageProfit: realizedPnL.averageProfit || 0,
                    averageLoss: realizedPnL.averageLoss || 0
                }
            };
        } catch (error) {
            LoggerService.error('Error calculating total PnL', {
                service: 'PnLCalculationService',
                operation: 'calculateTotalPnL',
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
            throw error;
        }
    }
}

export default new PnLCalculationService();

