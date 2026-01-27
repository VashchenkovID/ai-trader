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
            winRate: trades.length > 0 ? (profitableCount / trades.length) * 100 : 0,
            trades
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
                return {
                    figi: exit.figi,
                    ticker: exit.ticker,
                    name: exit.name,
                    entryPrice: exit.entryPrice,
                    exitPrice: exit.exitPrice,
                    exitQuantity: exit.exitQuantity,
                    quantity: exit.exitQuantity,
                    commission: exit.commission || 0,
                    realizedProfit: exit.realizedProfit || 0,
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

            // Получаем все открытые BUY заявки
            const openBuyRequests = await TradingRequest.findAll({
                where: {
                    action: 'BUY',
                    status: {
                        [Op.in]: ['EXECUTED', 'APPROVED']
                    },
                    tradingMode: portfolio.mode || 'real'
                },
                order: [['executedAt', 'ASC'], ['createdAt', 'ASC']]
            });

            // Группируем по FIGI и рассчитываем среднюю цену покупки
            const positionsByFigi = new Map();

            for (const request of openBuyRequests) {
                const figi = request.figi;
                const quantity = portfolioPositions[figi] || 0;

                if (quantity > 0) {
                    if (!positionsByFigi.has(figi)) {
                        positionsByFigi.set(figi, {
                            figi,
                            ticker: request.ticker,
                            name: request.name,
                            buyTrades: [],
                            totalQuantity: 0,
                            totalCost: 0
                        });
                    }

                    const position = positionsByFigi.get(figi);
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

            // Получаем текущие цены
            const figis = Array.from(positionsByFigi.keys());
            const currentPrices = {};

            for (const figi of figis) {
                try {
                    const instrument = await CacheService.getInstrument(figi, true);
                    currentPrices[figi] = instrument?.lastPrice || 0;
                } catch (error) {
                    LoggerService.warn(`Could not get price for ${figi}`, {
                        service: 'PnLCalculationService',
                        operation: 'getOpenPositions',
                        figi,
                        error: { message: error.message }
                    });
                }
            }

            // Формируем массив позиций
            for (const [figi, positionData] of positionsByFigi.entries()) {
                const averagePrice = positionData.totalQuantity > 0
                    ? positionData.totalCost / positionData.totalQuantity
                    : 0;
                const currentPrice = currentPrices[figi] || 0;
                const quantity = positionData.totalQuantity;

                positions.push({
                    figi,
                    ticker: positionData.ticker,
                    name: positionData.name,
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
                closedTrades = await this.getClosedTrades(tradingMode, startDate, endDate);
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

            // Общий PnL
            let totalPnL = realizedPnL.total + unrealizedPnL.total;

            // Если нет сделок и позиций, но есть totalValue, рассчитываем PnL как разницу
            // Это важно для бумажной торговли, где может не быть закрытых сделок
            if (totalPnL === 0 && realizedPnL.count === 0 && unrealizedPnL.count === 0) {
                const totalValue = portfolio.totalValue || 0;
                const initialCapital = portfolio.initialCapital || (tradingMode === 'paper' ? 1000000 : 0);
                if (totalValue > 0 && initialCapital > 0) {
                    totalPnL = totalValue - initialCapital;
                }
            }

            // Получаем данные о вводах/выводах средств (если нужно)
            // Для бумажной торговли используем 1 000 000 по умолчанию, если initialCapital не задан
            const defaultInitialCapital = tradingMode === 'paper' ? 1000000 : 0;
            let adjustedCapital = portfolio.initialCapital || defaultInitialCapital;
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
                    totalTrades: realizedPnL.count,
                    totalPositions: unrealizedPnL.count,
                    winRate: realizedPnL.winRate || 0,
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

