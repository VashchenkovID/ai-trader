import { Op } from 'sequelize';
import CacheService from '../services/CacheService.js';

/**
 * Вспомогательная функция для расчета позиций с учетом стратегий
 * Используется в /api/portfolio и в сокете для согласованности данных
 */
export async function calculatePositionsWithStrategies(portfolio, rawPositions, trades) {
    const TradingRequest = (await import('../models/TradingRequest.js')).default;
    const PositionStrategy = (await import('../models/PositionStrategy.js')).default;
    
    const positionsByStrategy = new Map(); // Ключ: `${figi}_${strategyId || 'null'}`
    const allFigis = Object.keys(rawPositions).filter(figi => rawPositions[figi] > 0);
    
    for (const figi of allFigis) {
        const totalQuantityFromPortfolio = rawPositions[figi] || 0;
        if (totalQuantityFromPortfolio <= 0) continue;
        
        try {
            // Получаем все BUY заявки для этого FIGI
            const buyRequests = await TradingRequest.findAll({
                where: {
                    figi,
                    action: 'BUY',
                    status: { [Op.in]: ['EXECUTED', 'APPROVED', 'PENDING'] }
                },
                order: [['executedAt', 'ASC'], ['createdAt', 'ASC']]
            });
            
            // Получаем все SELL заявки для этого FIGI
            const sellRequests = await TradingRequest.findAll({
                where: {
                    figi,
                    action: 'SELL',
                    status: { [Op.in]: ['EXECUTED', 'APPROVED', 'PENDING'] }
                },
                order: [['executedAt', 'ASC'], ['createdAt', 'ASC']]
            });
            
            // Если заявки не найдены, используем данные из trades
            if (buyRequests.length === 0 && rawPositions[figi] > 0) {
                const buyTradesForFigi = trades.filter(t => (t.symbol === figi || t.figi === figi) && t.action === 'BUY');
                const sellTradesForFigi = trades.filter(t => (t.symbol === figi || t.figi === figi) && t.action === 'SELL');
                
                if (buyTradesForFigi.length > 0) {
                    // Группируем BUY сделки по strategyId
                    for (const trade of buyTradesForFigi) {
                        const strategyId = trade.strategyId || null;
                        const key = `${figi}_${strategyId || 'null'}`;
                        
                        if (!positionsByStrategy.has(key)) {
                            positionsByStrategy.set(key, {
                                figi,
                                strategyId: strategyId,
                                buyTrades: [],
                                sellTrades: []
                            });
                        }
                        
                        positionsByStrategy.get(key).buyTrades.push({
                            quantity: trade.quantity || 0,
                            price: trade.price || 0,
                            executedAt: trade.timestamp || new Date()
                        });
                    }
                    
                    // Обрабатываем SELL сделки
                    for (const sellTrade of sellTradesForFigi) {
                        const sellQuantity = sellTrade.quantity || 0;
                        let remainingSellQty = sellQuantity;
                        const sellStrategyId = sellTrade.strategyId || null;
                        
                        if (sellStrategyId) {
                            const key = `${figi}_${sellStrategyId}`;
                            if (positionsByStrategy.has(key)) {
                                const position = positionsByStrategy.get(key);
                                const totalBuyQty = position.buyTrades.reduce((sum, t) => sum + t.quantity, 0);
                                const totalSellQty = position.sellTrades.reduce((sum, t) => sum + t.quantity, 0);
                                const availableQty = totalBuyQty - totalSellQty;
                                
                                if (availableQty > 0) {
                                    const sellQty = Math.min(remainingSellQty, availableQty);
                                    position.sellTrades.push({
                                        quantity: sellQty,
                                        price: sellTrade.price || 0,
                                        executedAt: sellTrade.timestamp || new Date()
                                    });
                                }
                            }
                        } else {
                            // FIFO списание
                            const sortedKeys = Array.from(positionsByStrategy.keys())
                                .filter(k => k.startsWith(`${figi}_`))
                                .sort((a, b) => {
                                    const aTrades = positionsByStrategy.get(a).buyTrades;
                                    const bTrades = positionsByStrategy.get(b).buyTrades;
                                    const aDate = aTrades.length > 0 ? new Date(aTrades[0].executedAt) : new Date(0);
                                    const bDate = bTrades.length > 0 ? new Date(bTrades[0].executedAt) : new Date(0);
                                    return aDate - bDate;
                                });
                            
                            for (const key of sortedKeys) {
                                if (remainingSellQty <= 0) break;
                                const position = positionsByStrategy.get(key);
                                const totalBuyQty = position.buyTrades.reduce((sum, t) => sum + t.quantity, 0);
                                const totalSellQty = position.sellTrades.reduce((sum, t) => sum + t.quantity, 0);
                                const availableQty = totalBuyQty - totalSellQty;
                                
                                if (availableQty > 0) {
                                    const sellQty = Math.min(remainingSellQty, availableQty);
                                    position.sellTrades.push({
                                        quantity: sellQty,
                                        price: sellTrade.price || 0,
                                        executedAt: sellTrade.timestamp || new Date()
                                    });
                                    remainingSellQty -= sellQty;
                                }
                            }
                        }
                    }
                }
            }
            
            // Группируем BUY заявки по стратегиям
            for (const buyRequest of buyRequests) {
                let strategyId = buyRequest.strategyId;
                if (!strategyId) {
                    const positionStrategy = await PositionStrategy.findOne({
                        where: { positionId: buyRequest.id }
                    });
                    if (positionStrategy) {
                        strategyId = positionStrategy.strategyId;
                    }
                }
                
                const key = `${figi}_${strategyId || 'null'}`;
                if (!positionsByStrategy.has(key)) {
                    positionsByStrategy.set(key, {
                        figi,
                        strategyId: strategyId || null,
                        buyTrades: [],
                        sellTrades: []
                    });
                }
                
                const buyQuantity = buyRequest.quantity || 0;
                const buyPrice = buyRequest.actualPrice || buyRequest.priceAtRequest || 0;
                positionsByStrategy.get(key).buyTrades.push({
                    quantity: buyQuantity,
                    price: buyPrice,
                    executedAt: buyRequest.executedAt || buyRequest.createdAt
                });
            }
            
            // Обрабатываем SELL заявки (FIFO)
            for (const sellRequest of sellRequests) {
                const sellQuantity = sellRequest.quantity || 0;
                let remainingSellQty = sellQuantity;
                let sellStrategyId = sellRequest.strategyId;
                
                if (!sellStrategyId) {
                    const positionStrategy = await PositionStrategy.findOne({
                        where: { positionId: sellRequest.id }
                    });
                    if (positionStrategy) {
                        sellStrategyId = positionStrategy.strategyId;
                    }
                }
                
                if (!sellStrategyId) {
                    // FIFO списание
                    const sortedKeys = Array.from(positionsByStrategy.keys())
                        .filter(k => k.startsWith(`${figi}_`))
                        .sort((a, b) => {
                            const aTrades = positionsByStrategy.get(a).buyTrades;
                            const bTrades = positionsByStrategy.get(b).buyTrades;
                            const aDate = aTrades.length > 0 ? new Date(aTrades[0].executedAt) : new Date(0);
                            const bDate = bTrades.length > 0 ? new Date(bTrades[0].executedAt) : new Date(0);
                            return aDate - bDate;
                        });
                    
                    for (const key of sortedKeys) {
                        if (remainingSellQty <= 0) break;
                        const position = positionsByStrategy.get(key);
                        const totalBuyQty = position.buyTrades.reduce((sum, t) => sum + t.quantity, 0);
                        const totalSellQty = position.sellTrades.reduce((sum, t) => sum + t.quantity, 0);
                        const availableQty = totalBuyQty - totalSellQty;
                        
                        if (availableQty > 0) {
                            const sellQty = Math.min(remainingSellQty, availableQty);
                            position.sellTrades.push({
                                quantity: sellQty,
                                price: sellRequest.actualPrice || sellRequest.priceAtRequest || 0,
                                executedAt: sellRequest.executedAt || sellRequest.createdAt
                            });
                            remainingSellQty -= sellQty;
                        }
                    }
                } else {
                    const key = `${figi}_${sellStrategyId}`;
                    if (positionsByStrategy.has(key)) {
                        positionsByStrategy.get(key).sellTrades.push({
                            quantity: sellQuantity,
                            price: sellRequest.actualPrice || sellRequest.priceAtRequest || 0,
                            executedAt: sellRequest.executedAt || sellRequest.createdAt
                        });
                    }
                }
            }
        } catch (error) {
            console.warn(`⚠️ Ошибка обработки позиций для ${figi}:`, error.message);
            continue;
        }
    }
    
    // Агрегируем позиции по FIGI с учетом стратегий
    const positionsByFigi = new Map();
    for (const [key, positionData] of positionsByStrategy.entries()) {
        const { figi, strategyId, buyTrades, sellTrades } = positionData;
        
        if (!positionsByFigi.has(figi)) {
            positionsByFigi.set(figi, {
                figi,
                totalQuantity: rawPositions[figi] || 0,
                strategies: []
            });
        }
        
        const figiData = positionsByFigi.get(figi);
        const totalBuyQty = buyTrades.reduce((sum, t) => sum + t.quantity, 0);
        const totalSellQty = sellTrades.reduce((sum, t) => sum + t.quantity, 0);
        const calculatedQtyForStrategy = Math.max(0, totalBuyQty - totalSellQty);
        
        figiData.strategies.push({
            strategyId,
            buyTrades,
            sellTrades,
            calculatedQty: calculatedQtyForStrategy
        });
    }
    
    return positionsByFigi;
}

