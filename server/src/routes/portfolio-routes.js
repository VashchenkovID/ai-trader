import express from 'express';
import { Op } from 'sequelize';
import TradingEngine from '../services/TradingEngine.js';
import ServiceManager from '../services/ServiceManager.js';
import TinkoffApiService from '../services/TinkoffApiService.js';
import CacheService from '../services/CacheService.js';
import LoggerService from '../services/LoggerService.js';
import PnLCalculationService from '../services/PnLCalculationService.js';

const router = express.Router();

// Импортируем функции расчета позиций и P&L из утилиты
import { calculatePositionsWithStrategies, calculatePnLFromPositions } from '../utils/portfolioPositionsCalculator.js';

/**
 * Общая информация о портфеле
 */
router.get('/', async (req, res) => {
    try {
        const portfolio = await TradingEngine.getPortfolioValue();
        const trades = portfolio?.trades || [];
        const rawPositions = portfolio?.positions || {};
        
        // РАССЧИТЫВАЕМ ПОЗИЦИИ С УЧЕТОМ СТРАТЕГИЙ (используем функцию из утилиты)
        const positionsByFigi = await calculatePositionsWithStrategies(portfolio, rawPositions, trades);
        
        // РАССЧИТЫВАЕМ P&L ИЗ ПОЗИЦИЙ С УЧЕТОМ СТРАТЕГИЙ
        const pnlResult = await calculatePnLFromPositions(portfolio, positionsByFigi, rawPositions);
        
        const cash = portfolio?.cash || 0;
        const positionsValue = pnlResult.positionsValue > 0 ? pnlResult.positionsValue : (portfolio?.positionsValue || 0);
        const totalValue = cash + positionsValue;
        
        res.json({
            success: true,
            data: {
                cash,
                positions: pnlResult.aggregatedPositions, // Используем агрегированные позиции с учетом стратегий
                positionsValue,
                totalValue,
                pnl: {
                    total: pnlResult.totalPnL,
                    totalPercent: pnlResult.totalPnLPercent,
                    realized: pnlResult.realizedPnL,
                    realizedPercent: pnlResult.realizedPnLPercent,
                    unrealized: pnlResult.unrealizedPnL,
                    winRate: (pnlResult.winRate || 0) * 100, // Конвертируем в проценты (0-100) для единообразия
                    totalTrades: pnlResult.totalTrades,
                    sharpeRatio: pnlResult.sharpeRatio || 0
                },
                trades: trades,
                mode: portfolio?.mode || 'paper',
                initialCapital: portfolio?.initialCapital || 1000000
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Ошибка получения портфеля:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения портфеля',
            error: error.message
        });
    }
});

/**
 * Реальный портфель
 */
router.get('/real', async (req, res) => {
    try {
        const portfolio = await TradingEngine.getRealPortfolioValue();
        
        if (!portfolio) {
            return res.json({
                success: true,
                data: null,
                message: 'Реальный портфель недоступен'
            });
        }
        
        // TradingEngine.getRealPortfolioValue() уже преобразует positions в объект {figi: quantity}
        // и рассчитывает positionsValue, но можем пересчитать для точности
        let positionsValue = portfolio.positionsValue || 0;
        const rawPositions = portfolio?.positions || {};
        
        // Если positionsValue не был рассчитан, рассчитываем вручную
        if (positionsValue === 0) {
            for (const [figi, quantity] of Object.entries(rawPositions)) {
                if (typeof quantity === 'number' && quantity > 0) {
                    try {
                        const instrument = await CacheService.getInstrument(figi, true);
                        const currentPrice = instrument?.lastPrice || 0;
                        positionsValue += currentPrice * quantity;
                    } catch (error) {
                        console.warn(`⚠️ Не удалось получить цену для ${figi}:`, error.message);
                    }
                }
            }
        }
        
        const cash = portfolio?.cash || 0;
        // totalValue = cash + positionsValue (общая сумма портфеля)
        const totalValue = portfolio?.totalValue || (cash + positionsValue);
        
        // Рассчитываем PnL используя новый сервис (на основе сделок)
        let pnlData = null;
        try {
            pnlData = await PnLCalculationService.calculateTotalPnL(portfolio, {
                tradingMode: 'real',
                includeTrades: true,
                includePositions: true
            });
        } catch (error) {
            LoggerService.error('Error calculating PnL', {
                service: 'portfolio-routes',
                operation: 'getRealPortfolio',
                error: { message: error.message }
            });
            // Возвращаем нулевые значения в новой структуре
            pnlData = {
                total: { pnl: 0, percent: 0 },
                realized: { total: 0, percent: 0 },
                unrealized: { total: 0 },
                summary: { winRate: 0, totalTrades: 0 }
            };
        }
        
        res.json({
            success: true,
            data: {
                cash,
                positions: rawPositions,
                positionsValue,
                totalValue,
                pnl: {
                    total: pnlData.total.pnl,
                    totalPercent: pnlData.total.percent,
                    realized: pnlData.realized.total,
                    realizedPercent: pnlData.realized.percent,
                    unrealized: pnlData.unrealized.total,
                    winRate: pnlData.summary?.winRate || 0, // Уже в диапазоне 0-1
                    totalTrades: pnlData.summary?.totalTrades || 0,
                    sharpeRatio: pnlData.summary?.sharpeRatio || 0 // Sharpe Ratio из закрытых сделок
                },
                trades: portfolio?.trades || [],
                mode: 'real',
                initialCapital: portfolio?.initialCapital || 0
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Ошибка получения реального портфеля:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения реального портфеля',
            error: error.message
        });
    }
});

/**
 * Позиции портфеля
 */
router.get('/positions', async (req, res) => {
    try {
        const portfolio = await TradingEngine.getPortfolioValue();
        const rawPositions = portfolio?.positions || {};
        const positions = [];
        let totalValue = portfolio?.cash || 0;
        
        const trades = portfolio.trades || [];
        
        // Определяем текущий режим торговли
        const TradingModeManager = (await import('../services/TradingModeManager.js')).default;
        const currentMode = TradingModeManager.getCurrentMode();
        const tradingMode = currentMode.mode || 'paper';
        
        // Импортируем модели
        const TradingRequest = (await import('../models/TradingRequest.js')).default;
        const PositionStrategy = (await import('../models/PositionStrategy.js')).default;
        const TradingStrategy = (await import('../models/TradingStrategy.js')).default;
        
        // УПРОЩЕННЫЙ ПОДХОД: Используем количество из портфеля как источник истины
        // Заявки и сделки используем только для определения стратегий и расчета средней цены
        const positionsByStrategy = new Map(); // Ключ: `${figi}_${strategyId || 'null'}`, значение: {figi, strategyId, quantity, buyTrades, sellTrades}
        
        // Собираем все уникальные FIGI из rawPositions (это уже правильные количества!)
        const allFigis = Object.keys(rawPositions).filter(figi => rawPositions[figi] > 0);
        
        console.log(`🔍 Loading positions for mode: ${tradingMode}, FIGIs: ${allFigis.length}, trades: ${trades.length}`);
        console.log(`🔍 Raw positions:`, Object.keys(rawPositions).map(f => `${f}: ${rawPositions[f]}`));
        
        // ОПТИМИЗАЦИЯ: Получаем все заявки одним запросом вместо N+1
        // ВАЖНО: Фильтруем по tradingMode чтобы получать только заявки для текущего режима
        const allRequests = allFigis.length > 0 ? await TradingRequest.findAll({
            where: {
                figi: { [Op.in]: allFigis },
                tradingMode: tradingMode, // Фильтр по режиму торговли
                status: {
                    [Op.in]: ['EXECUTED', 'APPROVED', 'PENDING']
                }
            },
            order: [['executedAt', 'ASC'], ['createdAt', 'ASC']]
        }) : [];
        
        console.log(`🔍 Found ${allRequests.length} requests for ${allFigis.length} FIGIs`);
        
        // Группируем заявки по FIGI и действию
        const requestsByFigi = new Map();
        for (const request of allRequests) {
            const key = `${request.figi}_${request.action}`;
            if (!requestsByFigi.has(key)) {
                requestsByFigi.set(key, []);
            }
            requestsByFigi.get(key).push(request);
        }
        
        // ОПТИМИЗАЦИЯ: Получаем все PositionStrategy одним запросом
        const requestIds = allRequests.map(r => r.id);
        const allPositionStrategies = requestIds.length > 0 ? await PositionStrategy.findAll({
            where: {
                positionId: { [Op.in]: requestIds }
            }
        }) : [];
        
        // Создаем Map для быстрого поиска strategyId по positionId
        const strategyByPositionId = new Map();
        for (const ps of allPositionStrategies) {
            strategyByPositionId.set(ps.positionId, ps.strategyId);
        }
        
        for (const figi of allFigis) {
            // ИСПОЛЬЗУЕМ КОЛИЧЕСТВО ИЗ ПОРТФЕЛЯ КАК ИСТОЧНИК ИСТИНЫ
            const totalQuantityFromPortfolio = rawPositions[figi] || 0;
            
            if (totalQuantityFromPortfolio <= 0) {
                continue; // Пропускаем нулевые позиции
            }
            try {
                // Получаем заявки из кеша
                const buyRequests = requestsByFigi.get(`${figi}_BUY`) || [];
                const sellRequests = requestsByFigi.get(`${figi}_SELL`) || [];
                
                // Отладочная информация для первого FIGI
                if (allFigis.indexOf(figi) === 0) {
                    console.log(`🔍 First FIGI ${figi} debug:`, {
                        rawQuantity: rawPositions[figi],
                        buyRequestsCount: buyRequests.length,
                        sellRequestsCount: sellRequests.length,
                        buyRequests: buyRequests.slice(0, 3).map(r => ({
                            id: r.id,
                            strategyId: r.strategyId,
                            quantity: r.quantity,
                            status: r.status
                        }))
                    });
                }
                
                // Если заявки не найдены, но есть позиция в rawPositions, используем данные из trades
                // Группируем сделки по strategyId из самих сделок
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
                        
                        // Обрабатываем SELL сделки из trades (если они есть)
                        // Используем FIFO: списываем с позиций в порядке покупки
                        for (const sellTrade of sellTradesForFigi) {
                            const sellQuantity = sellTrade.quantity || 0;
                            let remainingSellQty = sellQuantity;
                            const sellStrategyId = sellTrade.strategyId || null;
                            
                            if (sellStrategyId) {
                                // Если стратегия определена, списываем с соответствующей позиции
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
                                        remainingSellQty -= sellQty;
                                    }
                                }
                            } else {
                                // Если стратегия не определена, списываем с позиций в порядке FIFO
                                const sortedKeys = Array.from(positionsByStrategy.keys())
                                    .filter(k => k.startsWith(`${figi}_`))
                                    .sort((a, b) => {
                                        const aTrades = positionsByStrategy.get(a).buyTrades;
                                        const bTrades = positionsByStrategy.get(b).buyTrades;
                                        const aDate = aTrades.length > 0 ? new Date(aTrades[0].executedAt) : new Date(0);
                                        const bDate = bTrades.length > 0 ? new Date(bTrades[0].executedAt) : new Date(0);
                                        return aDate - bDate;
                                    });
                                
                                // Списываем с позиций в порядке FIFO
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
                    } else {
                        // Если нет сделок, но есть позиция - создаем запись с количеством из rawPositions
                        // Это важно для позиций, созданных до включения автоторговли или напрямую
                        const key = `${figi}_null`;
                        if (!positionsByStrategy.has(key)) {
                            positionsByStrategy.set(key, {
                                figi,
                                strategyId: null,
                                buyTrades: [],
                                sellTrades: []
                            });
                        }
                        // Используем текущую цену как приблизительную цену покупки
                        // Это лучше чем 0, так как позволит рассчитать PnL
                        try {
                            const TradingEngine = (await import('../services/TradingEngine.js')).default;
                            const prices = await TradingEngine.getCurrentPrices([figi], true);
                            const estimatedPrice = prices[figi] || 0;
                            positionsByStrategy.get(key).buyTrades.push({
                                quantity: rawPositions[figi],
                                price: estimatedPrice, // Используем текущую цену как приближение
                                executedAt: new Date() // Используем текущую дату
                            });
                            console.log(`📊 FIGI ${figi}: Created position from rawPositions, quantity: ${rawPositions[figi]}, estimated price: ${estimatedPrice}`);
                        } catch (priceError) {
                            // Если не удалось получить цену, используем 0
                            positionsByStrategy.get(key).buyTrades.push({
                                quantity: rawPositions[figi],
                                price: 0,
                                executedAt: new Date()
                            });
                        }
                    }
                }
                
                // Группируем BUY заявки по стратегиям
                for (const buyRequest of buyRequests) {
                    let strategyId = buyRequest.strategyId;
                    
                    // Если strategyId нет в заявке, ищем через кеш PositionStrategy
                    if (!strategyId) {
                        strategyId = strategyByPositionId.get(buyRequest.id) || null;
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
                    
                    // Добавляем BUY заявку с количеством и ценой
                    const buyQuantity = buyRequest.quantity || 0;
                    const buyPrice = buyRequest.actualPrice || buyRequest.priceAtRequest || 0;
                    positionsByStrategy.get(key).buyTrades.push({
                        quantity: buyQuantity,
                        price: buyPrice,
                        executedAt: buyRequest.executedAt || buyRequest.createdAt
                    });
                }
                
                // Также обрабатываем SELL операции из trades (если они есть и не были обработаны через TradingRequest)
                const sellTradesForFigi = trades.filter(t => (t.symbol === figi || t.figi === figi) && t.action === 'SELL');
                
                // Обрабатываем SELL сделки из trades (если они не были обработаны через TradingRequest)
                for (const sellTrade of sellTradesForFigi) {
                    const sellQuantity = sellTrade.quantity || 0;
                    let remainingSellQty = sellQuantity;
                    const sellStrategyId = sellTrade.strategyId || null;
                    
                    if (sellStrategyId) {
                        // Если стратегия определена, списываем с соответствующей позиции
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
                                remainingSellQty -= sellQty;
                            }
                        }
                    } else {
                        // Если стратегия не определена, списываем с позиций в порядке FIFO
                        const sortedKeys = Array.from(positionsByStrategy.keys())
                            .filter(k => k.startsWith(`${figi}_`))
                            .sort((a, b) => {
                                const aTrades = positionsByStrategy.get(a).buyTrades;
                                const bTrades = positionsByStrategy.get(b).buyTrades;
                                const aDate = aTrades.length > 0 ? new Date(aTrades[0].executedAt) : new Date(0);
                                const bDate = bTrades.length > 0 ? new Date(bTrades[0].executedAt) : new Date(0);
                                return aDate - bDate;
                            });
                        
                        // Списываем с позиций в порядке FIFO
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
                
                // Группируем SELL заявки по стратегиям (используем FIFO - первая купленная, первая проданная)
                // Для упрощения, SELL заявки списываем с позиций в порядке FIFO
                let remainingSells = [...sellRequests];
                
                for (const sellRequest of sellRequests) {
                    const sellQuantity = sellRequest.quantity || 0;
                    let remainingSellQty = sellQuantity;
                    
                    // Определяем стратегию для SELL заявки
                    let sellStrategyId = sellRequest.strategyId;
                    if (!sellStrategyId) {
                        sellStrategyId = strategyByPositionId.get(sellRequest.id) || null;
                    }
                    
                    // Если стратегия не определена, списываем с позиций в порядке FIFO
                    if (!sellStrategyId) {
                        // Сортируем позиции по дате покупки (FIFO)
                        const sortedKeys = Array.from(positionsByStrategy.keys())
                            .filter(k => k.startsWith(`${figi}_`))
                            .sort((a, b) => {
                                const aTrades = positionsByStrategy.get(a).buyTrades;
                                const bTrades = positionsByStrategy.get(b).buyTrades;
                                const aDate = aTrades.length > 0 ? new Date(aTrades[0].executedAt) : new Date(0);
                                const bDate = bTrades.length > 0 ? new Date(bTrades[0].executedAt) : new Date(0);
                                return aDate - bDate;
                            });
                        
                        // Списываем с позиций в порядке FIFO
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
                        // Если стратегия определена, списываем с соответствующей позиции
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
        
        // Отладочная информация перед формированием позиций
        console.log(`🔍 Positions by strategy:`, {
            totalPositionsByStrategy: positionsByStrategy.size,
            positionsByStrategyKeys: Array.from(positionsByStrategy.keys()).slice(0, 10),
            allFigis: allFigis,
            rawPositionsCount: Object.keys(rawPositions).length
        });
        
        // Получаем общий totalValue из портфеля для правильного расчета весов
        const portfolioValue = await TradingEngine.getPortfolioValue();
        const portfolioTotalValue = portfolioValue?.totalValue || portfolioValue?.cash + (portfolioValue?.positionsValue || 0);
        const portfolioCash = portfolioValue?.cash || 0;
        const portfolioPositionsValue = portfolioValue?.positionsValue || 0;
        
        // УПРОЩЕННЫЙ ПОДХОД: Используем количество из портфеля как источник истины
        // Группируем позиции по FIGI, затем распределяем по стратегиям пропорционально
        const positionsByFigi = new Map(); // Ключ: figi, значение: {figi, totalQuantity, strategies: []}
        
        // Сначала группируем все позиции по FIGI
        for (const [key, positionData] of positionsByStrategy.entries()) {
            const { figi, strategyId, buyTrades, sellTrades } = positionData;
            
            if (!positionsByFigi.has(figi)) {
                positionsByFigi.set(figi, {
                    figi,
                    totalQuantity: rawPositions[figi] || 0, // ИСТОЧНИК ИСТИНЫ - количество из портфеля
                    strategies: []
                });
            }
            
            const figiData = positionsByFigi.get(figi);
            
            // Рассчитываем количество для стратегии на основе заявок (для пропорционального распределения)
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
        
        // ВАЖНО: Добавляем позиции из rawPositions, которые не попали в positionsByStrategy
        // Это критично для позиций, созданных до включения автоторговли или напрямую
        for (const figi of allFigis) {
            if (!positionsByFigi.has(figi) && rawPositions[figi] > 0) {
                console.log(`📊 FIGI ${figi}: Position exists in portfolio but not in positionsByStrategy, adding it`);
                positionsByFigi.set(figi, {
                    figi,
                    totalQuantity: rawPositions[figi],
                    strategies: [] // Без стратегий - будет обработано в блоке else ниже
                });
            }
        }
        
        console.log(`🔍 PositionsByFigi: ${positionsByFigi.size} entries`);
        for (const [figi, figiData] of positionsByFigi.entries()) {
            console.log(`🔍 Processing FIGI ${figi}: quantity=${figiData.totalQuantity}, strategies=${figiData.strategies.length}`);
        }
        
        // Теперь формируем позиции, используя количество из портфеля
        for (const [figi, figiData] of positionsByFigi.entries()) {
            const totalQuantityForFigi = figiData.totalQuantity; // ИСТОЧНИК ИСТИНЫ
            
            if (totalQuantityForFigi <= 0) {
                console.log(`⚠️ Skipping FIGI ${figi}: quantity is 0 or negative`);
                continue; // Пропускаем нулевые позиции
            }
            
            // Если есть стратегии, распределяем позицию между ними пропорционально
            if (figiData.strategies.length > 0) {
                console.log(`📊 FIGI ${figi}: Processing with ${figiData.strategies.length} strategies`);
                // Рассчитываем общее рассчитанное количество для пропорционального распределения
                const totalCalculatedQty = figiData.strategies.reduce((sum, s) => sum + Math.max(0, s.calculatedQty), 0);
                
                for (const strategyData of figiData.strategies) {
                    const { strategyId, buyTrades, sellTrades, calculatedQty } = strategyData;
                    
                    // Распределяем количество пропорционально рассчитанным количествам
                    let quantityForStrategy = 0;
                    if (totalCalculatedQty > 0 && calculatedQty > 0) {
                        // Пропорциональное распределение на основе рассчитанных количеств
                        quantityForStrategy = Math.round((calculatedQty / totalCalculatedQty) * totalQuantityForFigi);
                    } else if (figiData.strategies.length === 1) {
                        // Если только одна стратегия, используем все количество из портфеля
                        quantityForStrategy = totalQuantityForFigi;
                    } else if (totalCalculatedQty === 0 && buyTrades.length > 0) {
                        // Если нет рассчитанных количеств, но есть buyTrades, используем количество из портфеля
                        // Это важно для позиций без заявок, где buyTrades созданы из rawPositions
                        quantityForStrategy = totalQuantityForFigi;
                    } else {
                        // Если нет рассчитанных количеств, распределяем поровну
                        quantityForStrategy = Math.round(totalQuantityForFigi / figiData.strategies.length);
                    }
                    
                    // Убеждаемся, что не превышаем общее количество и не меньше 0
                    quantityForStrategy = Math.max(0, Math.min(quantityForStrategy, totalQuantityForFigi));
                    
                    console.log(`📊 FIGI ${figi}, Strategy ${strategyId || 'null'}: calculatedQty=${calculatedQty}, totalCalculatedQty=${totalCalculatedQty}, quantityForStrategy=${quantityForStrategy}, totalQuantityForFigi=${totalQuantityForFigi}`);
                    
                    if (quantityForStrategy <= 0) {
                        console.log(`⚠️ Skipping FIGI ${figi}, Strategy ${strategyId || 'null'}: quantityForStrategy is 0 or negative`);
                        continue; // Пропускаем нулевые позиции
                    }
                    
                    try {
                        // Получаем инструмент с актуальными данными (skipUpdate = false)
                        let instrument = await CacheService.getInstrument(figi, false);
                        
                        // FALLBACK: Если инструмент не найден в кеше, пытаемся получить через API
                        if (!instrument) {
                            console.warn(`⚠️ Инструмент ${figi} не найден в кеше, пытаемся получить через API`);
                            try {
                                const TinkoffApiService = (await import('../services/TinkoffApiService.js')).default;
                                const apiResponse = await TinkoffApiService.getInstrumentByFigi(figi);
                                if (apiResponse?.instrument) {
                                    // Создаем минимальный объект инструмента из API ответа
                                    instrument = {
                                        figi: apiResponse.instrument.figi || figi,
                                        ticker: apiResponse.instrument.ticker || figi.substring(0, 10),
                                        name: apiResponse.instrument.name || 'Неизвестно',
                                        currency: apiResponse.instrument.currency || 'RUB',
                                        sector: null,
                                        lastPrice: 0 // Будет получено через getCurrentPrices
                                    };
                                    console.log(`✅ Инструмент ${figi} получен через API: ${instrument.name}`);
                                }
                            } catch (apiError) {
                                console.warn(`⚠️ Не удалось получить инструмент ${figi} через API:`, apiError.message);
                            }
                        }
                        
                        // Если инструмент все еще не найден, пропускаем позицию
                        if (!instrument) {
                            console.warn(`⚠️ Пропущена позиция ${figi}: инструмент не найден в кеше и через API`);
                            continue;
                        }
                        
                        // Получаем актуальную текущую цену через TradingEngine для синхронизации с расчетом PnL
                        const TradingEngine = (await import('../services/TradingEngine.js')).default;
                        const prices = await TradingEngine.getCurrentPrices([figi], false);
                        let currentPrice = prices[figi] || instrument.lastPrice || 0;
                        
                        // Рассчитываем среднюю цену покупки для этой стратегии
                        let averagePrice = currentPrice || 0;
                        if (buyTrades.length > 0) {
                            const totalCost = buyTrades.reduce((sum, t) => sum + (t.price * t.quantity), 0);
                            const totalQuantity = buyTrades.reduce((sum, t) => sum + t.quantity, 0);
                            if (totalQuantity > 0) {
                                averagePrice = totalCost / totalQuantity;
                            }
                        }
                        
                        if (!currentPrice && !averagePrice) {
                            console.warn(`⚠️ Пропущена позиция ${figi}: нет данных о цене`);
                            continue;
                        }
                        
                        // Рассчитываем marketValue на основе quantityForStrategy (количество для этой стратегии)
                        const marketValueForStrategy = currentPrice > 0 ? currentPrice * quantityForStrategy : 0;
                        
                        // Для расчета PnL используем количество стратегии
                        const unrealizedPnL = currentPrice > 0 && averagePrice > 0 ? (currentPrice - averagePrice) * quantityForStrategy : 0;
                        const unrealizedPnLPercent = averagePrice > 0 && currentPrice > 0 ? ((currentPrice - averagePrice) / averagePrice) * 100 : 0;
                    
                        
                        // Определяем сектор
                        let sector = instrument.sector || 'Неизвестно';
                        if (sector === 'Неизвестно' && instrument.ticker) {
                            const ticker = instrument.ticker.toUpperCase();
                            if (['SBER', 'VTBR', 'GAZS', 'TCSG'].includes(ticker)) {
                                sector = 'Финансы';
                            } else if (['GAZP', 'LKOH', 'ROSN', 'NVTK', 'TATN'].includes(ticker)) {
                                sector = 'Энергетика';
                            } else if (['YNDX', 'OZON', 'VKCO', 'TCIT'].includes(ticker)) {
                                sector = 'IT';
                            } else if (['MGNT', 'FIVE', 'FIXP', 'MVID'].includes(ticker)) {
                                sector = 'Ритейл';
                            } else if (ticker.startsWith('RUB')) {
                                sector = 'Валюта';
                            }
                        }
                        
                        // Получаем стратегию
                        let strategy = null;
                        if (strategyId) {
                            try {
                                strategy = await TradingStrategy.findByPk(strategyId);
                            } catch (error) {
                                console.warn(`Could not load strategy ${strategyId}:`, error.message);
                            }
                        }
                        
                        positions.push({
                            figi,
                            ticker: instrument.ticker || figi.substring(0, 10),
                            name: instrument.name || 'Неизвестно',
                            quantity: quantityForStrategy, // Количество для этой стратегии (из портфеля, распределенное пропорционально)
                            averagePrice: Math.round(averagePrice * 100) / 100,
                            currentPrice: Math.round(currentPrice * 100) / 100,
                            marketValue: Math.round(marketValueForStrategy * 100) / 100, // marketValue для этой стратегии
                            unrealizedPnL: Math.round(unrealizedPnL * 100) / 100,
                            unrealizedPnLPercent: Math.round(unrealizedPnLPercent * 100) / 100,
                            weight: 0, // Будет рассчитано ниже
                            sector,
                            currency: instrument.currency || 'RUB',
                            lastUpdate: new Date().toISOString(),
                            strategy: strategy ? {
                                id: strategy.id,
                                name: strategy.name,
                                type: strategy.type
                            } : null,
                            positionStrategy: strategyId ? {
                                id: null,
                                strategyId: strategyId
                            } : null,
                            _debug: {
                                quantityForStrategy,
                                totalQuantityForFigi,
                                calculatedQty,
                                marketValueForStrategy: Math.round(marketValueForStrategy * 100) / 100
                            }
                        });
                    } catch (error) {
                        console.warn(`⚠️ Пропущена позиция ${figi} (стратегия ${strategyId || 'null'}) из-за ошибки:`, error.message);
                        continue;
                    }
                }
            } else {
                // Если нет стратегий, создаем одну позицию без стратегии
                console.log(`📊 FIGI ${figi}: No strategies, creating position without strategy, quantity=${totalQuantityForFigi}`);
                try {
                    let instrument = await CacheService.getInstrument(figi, false);
                    
                    // FALLBACK: Если инструмент не найден в кеше, пытаемся получить через API
                    if (!instrument) {
                        console.warn(`⚠️ Инструмент ${figi} не найден в кеше, пытаемся получить через API`);
                        try {
                            const TinkoffApiService = (await import('../services/TinkoffApiService.js')).default;
                            const apiResponse = await TinkoffApiService.getInstrumentByFigi(figi);
                            if (apiResponse?.instrument) {
                                // Создаем минимальный объект инструмента из API ответа
                                instrument = {
                                    figi: apiResponse.instrument.figi || figi,
                                    ticker: apiResponse.instrument.ticker || figi.substring(0, 10),
                                    name: apiResponse.instrument.name || 'Неизвестно',
                                    currency: apiResponse.instrument.currency || 'RUB',
                                    sector: null,
                                    lastPrice: 0 // Будет получено через getCurrentPrices
                                };
                                console.log(`✅ Инструмент ${figi} получен через API: ${instrument.name}`);
                            }
                        } catch (apiError) {
                            console.warn(`⚠️ Не удалось получить инструмент ${figi} через API:`, apiError.message);
                        }
                    }
                    
                    // Если инструмент все еще не найден, пропускаем позицию
                    if (!instrument) {
                        console.warn(`⚠️ Пропущена позиция ${figi}: инструмент не найден в кеше и через API`);
                        continue;
                    }
                    
                    console.log(`✅ FIGI ${figi}: Instrument found, ticker=${instrument.ticker}, name=${instrument.name}`);
                    
                    // Получаем актуальную текущую цену через TradingEngine для синхронизации с расчетом PnL
                    const TradingEngine = (await import('../services/TradingEngine.js')).default;
                    const prices = await TradingEngine.getCurrentPrices([figi], false);
                    const currentPrice = prices[figi] || instrument.lastPrice || 0;
                    const marketValue = currentPrice > 0 ? currentPrice * totalQuantityForFigi : 0;
                    
                    const positionData = {
                        figi,
                        ticker: instrument.ticker || figi.substring(0, 10),
                        name: instrument.name || 'Неизвестно',
                        quantity: totalQuantityForFigi,
                        averagePrice: Math.round(currentPrice * 100) / 100,
                        currentPrice: Math.round(currentPrice * 100) / 100,
                        marketValue: Math.round(marketValue * 100) / 100,
                        unrealizedPnL: 0,
                        unrealizedPnLPercent: 0,
                        weight: 0,
                        sector: instrument.sector || 'Неизвестно',
                        currency: instrument.currency || 'RUB',
                        lastUpdate: new Date().toISOString(),
                        strategy: null,
                        positionStrategy: null
                    };
                    positions.push(positionData);
                    console.log(`✅ FIGI ${figi}: Position added to array:`, {
                        ticker: positionData.ticker,
                        quantity: positionData.quantity,
                        currentPrice: positionData.currentPrice,
                        marketValue: positionData.marketValue
                    });
                } catch (error) {
                    console.warn(`⚠️ Пропущена позиция ${figi} из-за ошибки:`, error.message);
                    continue;
                }
            }
        }
        
        // Рассчитываем веса позиций на основе общего totalValue портфеля
        // ВАЖНО: Для расчета веса используем общую стоимость позиции (FIGI),
        // а не marketValue для стратегии, так как вес должен отражать долю позиции в общем портфеле
        const finalTotalValue = portfolioTotalValue || (portfolioCash + portfolioPositionsValue);
        
        // Группируем позиции по FIGI для правильного расчета веса
        const positionsByFigiForWeight = new Map();
        positions.forEach(position => {
            if (!positionsByFigiForWeight.has(position.figi)) {
                // Используем количество из портфеля для расчета общей стоимости позиции
                const totalQuantity = position._debug?.totalQuantityForFigi || position.quantity;
                const totalMarketValue = position.currentPrice * totalQuantity;
                
                positionsByFigiForWeight.set(position.figi, {
                    figi: position.figi,
                    totalMarketValue,
                    positions: []
                });
            }
            const figiData = positionsByFigiForWeight.get(position.figi);
            figiData.positions.push(position);
        });
        
        // Рассчитываем вес для каждой позиции на основе общей стоимости позиции (FIGI)
        positions.forEach(position => {
            const figiData = positionsByFigiForWeight.get(position.figi);
            if (figiData && finalTotalValue > 0) {
                // Вес рассчитываем на основе общей стоимости позиции (FIGI), а не стоимости для стратегии
                position.weight = (figiData.totalMarketValue / finalTotalValue) * 100;
            } else {
                position.weight = 0;
            }
        });
        
        res.json({
            success: true,
            data: positions,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Ошибка получения позиций портфеля:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения позиций портфеля',
            error: error.message
        });
    }
});

/**
 * Позиция по конкретному инструменту
 */
router.get('/positions/:figi', async (req, res) => {
    try {
        const { figi } = req.params;
        const position = await TradingEngine.getPositionByFigi(figi);
        res.json({
            success: true,
            data: position
        });
    } catch (error) {
        console.error('Ошибка получения позиции:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения позиции',
            error: error.message
        });
    }
});

/**
 * История портфеля
 */
router.get('/history', async (req, res) => {
    try {
        const history = await TradingEngine.getPortfolioHistory();
        res.json({
            success: true,
            data: history
        });
    } catch (error) {
        console.error('Ошибка получения истории портфеля:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения истории портфеля',
            error: error.message
        });
    }
});

/**
 * Аналитика портфеля
 */
router.get('/analytics', async (req, res) => {
    try {
        const analytics = await TradingEngine.getPortfolioAnalytics();
        res.json({
            success: true,
            data: analytics
        });
    } catch (error) {
        console.error('Ошибка получения аналитики портфеля:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения аналитики портфеля',
            error: error.message
        });
    }
});

/**
 * Секторальное распределение
 */
router.get('/sector-allocation', async (req, res) => {
    try {
        const allocation = await TradingEngine.getSectorAllocation();
        res.json({
            success: true,
            data: allocation
        });
    } catch (error) {
        console.error('Ошибка получения секторального распределения:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения секторального распределения',
            error: error.message
        });
    }
});

/**
 * Риск-метрики портфеля
 */
router.get('/risk-metrics', async (req, res) => {
    try {
        const riskMetrics = await TradingEngine.getPortfolioRiskMetrics();
        res.json({
            success: true,
            data: riskMetrics
        });
    } catch (error) {
        console.error('Ошибка получения риск-метрик портфеля:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения риск-метрик портфеля',
            error: error.message
        });
    }
});

/**
 * Синхронизация реального портфеля из Tinkoff API
 */
router.post('/real/sync', async (req, res) => {
    try {
        const { getGlobalServiceManager } = await import('../services/GlobalServiceManager.js');
        const globalServiceManager = getGlobalServiceManager();
        const SchedulerService = globalServiceManager?.getServiceSafe('SchedulerService');
        if (!SchedulerService) {
            return res.status(503).json({
                success: false,
                message: 'SchedulerService недоступен'
            });
        }
        
        // Выполняем синхронизацию реального портфеля
        const result = await SchedulerService.performRealPortfolioSync();
        
        res.json({
            success: true,
            message: 'Синхронизация реального портфеля завершена',
            data: result
        });
    } catch (error) {
        console.error('Ошибка синхронизации реального портфеля:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка синхронизации реального портфеля',
            error: error.message
        });
    }
});

/**
 * Управление вводами/выводами средств (CashFlow)
 * POST /api/portfolio/cash-flow
 * Body: { type: 'DEPOSIT'|'WITHDRAWAL', amount: number, date?: Date, description?: string, portfolioType?: 'virtual'|'real' }
 */
router.post('/cash-flow', async (req, res) => {
    try {
        const CashFlow = (await import('../models/CashFlow.js')).default;
        const { type, amount, date, description, portfolioType = 'real' } = req.body;

        // Валидация
        if (!type || !['DEPOSIT', 'WITHDRAWAL'].includes(type)) {
            return res.status(400).json({
                success: false,
                message: 'type должен быть DEPOSIT или WITHDRAWAL'
            });
        }

        if (!amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'amount должен быть положительным числом'
            });
        }

        // Создаем запись о вводе/выводе
        const cashFlow = await CashFlow.create({
            type,
            amount: parseFloat(amount),
            date: date ? new Date(date) : new Date(),
            description: description || null,
            portfolioType
        });

        res.json({
            success: true,
            message: `${type === 'DEPOSIT' ? 'Ввод' : 'Вывод'} средств зарегистрирован`,
            data: cashFlow
        });
    } catch (error) {
        console.error('Ошибка регистрации ввода/вывода средств:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка регистрации ввода/вывода средств',
            error: error.message
        });
    }
});

/**
 * Получение истории вводов/выводов средств
 * GET /api/portfolio/cash-flow
 * Query: { portfolioType?: 'virtual'|'real', startDate?: Date, endDate?: Date, limit?: number }
 */
router.get('/cash-flow', async (req, res) => {
    try {
        const CashFlow = (await import('../models/CashFlow.js')).default;
        const { portfolioType = 'real', startDate, endDate, limit = 100 } = req.query;

        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate) : null;

        const history = await CashFlow.getHistory(portfolioType, start, end, parseInt(limit));

        // Получаем статистику
        const totalDeposits = await CashFlow.getTotalDeposits(portfolioType, start, end);
        const totalWithdrawals = await CashFlow.getTotalWithdrawals(portfolioType, start, end);
        const netCashFlow = await CashFlow.getNetCashFlow(portfolioType, start, end);

        res.json({
            success: true,
            data: {
                history,
                statistics: {
                    totalDeposits,
                    totalWithdrawals,
                    netCashFlow,
                    count: history.length
                }
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Ошибка получения истории вводов/выводов:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения истории вводов/выводов',
            error: error.message
        });
    }
});

/**
 * Удаление записи о вводе/выводе средств
 * DELETE /api/portfolio/cash-flow/:id
 */
router.delete('/cash-flow/:id', async (req, res) => {
    try {
        const CashFlow = (await import('../models/CashFlow.js')).default;
        const { id } = req.params;

        const cashFlow = await CashFlow.findByPk(id);
        
        if (!cashFlow) {
            return res.status(404).json({
                success: false,
                message: 'Запись не найдена'
            });
        }

        await cashFlow.destroy();

        res.json({
            success: true,
            message: 'Запись удалена'
        });
    } catch (error) {
        console.error('Ошибка удаления записи:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка удаления записи',
            error: error.message
        });
    }
});

/**
 * Детальный расчет PnL
 * GET /api/portfolio/pnl/detailed
 * Query: { tradingMode?: 'paper'|'micro'|'real', startDate?: Date, endDate?: Date }
 */
router.get('/pnl/detailed', async (req, res) => {
    try {
        const { tradingMode = 'real', startDate, endDate } = req.query;
        
        // Получаем портфель в зависимости от режима
        let portfolio = null;
        if (tradingMode === 'real') {
            portfolio = await TradingEngine.getRealPortfolioValue();
        } else {
            portfolio = await TradingEngine.getPortfolioValue();
        }
        
        if (!portfolio) {
            return res.json({
                success: true,
                data: null,
                message: 'Портфель недоступен'
            });
        }
        
        // Парсим даты если переданы
        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate) : null;
        
        // Рассчитываем детальный PnL
        const pnlData = await PnLCalculationService.calculateTotalPnL(portfolio, {
            tradingMode,
            startDate: start,
            endDate: end,
            includeTrades: true,
            includePositions: true
        });
        
        res.json({
            success: true,
            data: pnlData,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Ошибка получения детального PnL:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения детального PnL',
            error: error.message
        });
    }
});

/**
 * Синхронизация портфеля со стратегиями (Фаза 1, задача 1.2)
 * POST /api/portfolio/sync
 * Body: { maxLookbackHours?: number, silent?: boolean, createMissingPositions?: boolean }
 */
router.post('/sync', async (req, res) => {
    try {
        const PortfolioSyncService = (await import('../services/PortfolioSyncService.js')).default;
        
        const { maxLookbackHours, silent, createMissingPositions } = req.body;
        
        const result = await PortfolioSyncService.syncRealPortfolioWithStrategies({
            maxLookbackHours: maxLookbackHours || 48,
            silent: silent || false,
            createMissingPositions: createMissingPositions || false
        });
        
        res.json({
            success: result.success,
            message: `Синхронизировано позиций: ${result.matched}, создано стратегий: ${result.created}, обновлено: ${result.updated}`,
            data: result
        });
    } catch (error) {
        console.error('Ошибка синхронизации портфеля со стратегиями:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка синхронизации портфеля со стратегиями',
            error: error.message
        });
    }
});

/**
 * Получить статус последней синхронизации
 * GET /api/portfolio/sync/status
 */
router.get('/sync/status', async (req, res) => {
    try {
        const PortfolioSyncService = (await import('../services/PortfolioSyncService.js')).default;
        
        const status = PortfolioSyncService.getLastSyncStatus();
        
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('Ошибка получения статуса синхронизации:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статуса синхронизации',
            error: error.message
        });
    }
});

/**
 * Получить список несоответствий (позиции без стратегии, заявки без позиций)
 * GET /api/portfolio/mismatches
 */
router.get('/mismatches', async (req, res) => {
    try {
        const PortfolioSyncService = (await import('../services/PortfolioSyncService.js')).default;
        
        const mismatches = await PortfolioSyncService.getMismatches();
        
        res.json({
            success: true,
            data: mismatches
        });
    } catch (error) {
        console.error('Ошибка получения несоответствий:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения несоответствий',
            error: error.message
        });
    }
});

/**
 * Назначить стратегию позиции вручную
 * POST /api/portfolio/positions/:figi/assign-strategy
 * Body: { strategyId: number, requestId?: string }
 */
router.post('/positions/:figi/assign-strategy', async (req, res) => {
    try {
        const PortfolioSyncService = (await import('../services/PortfolioSyncService.js')).default;
        const TradingRequest = (await import('../models/TradingRequest.js')).default;
        const PositionStrategy = (await import('../models/PositionStrategy.js')).default;
        
        const { figi } = req.params;
        const { strategyId, requestId } = req.body;
        
        if (!strategyId) {
            return res.status(400).json({
                success: false,
                message: 'strategyId обязателен'
            });
        }
        
        // Если указан requestId, используем его
        let tradingRequest = null;
        if (requestId) {
            tradingRequest = await TradingRequest.findByPk(requestId);
            if (!tradingRequest) {
                return res.status(404).json({
                    success: false,
                    message: 'Заявка не найдена'
                });
            }
        } else {
            // Ищем последнюю одобренную заявку для этого FIGI
            tradingRequest = await TradingRequest.findOne({
                where: {
                    figi,
                    status: {
                        [Op.in]: ['APPROVED', 'EXECUTED']
                    }
                },
                order: [['approvedAt', 'DESC'], ['createdAt', 'DESC']]
            });
        }
        
        if (!tradingRequest) {
            return res.status(404).json({
                success: false,
                message: 'Не найдена одобренная заявка для этого инструмента'
            });
        }
        
        // Проверяем, нет ли уже PositionStrategy
        const existing = await PositionStrategy.findOne({
            where: { positionId: tradingRequest.id }
        });
        
        if (existing) {
            return res.status(400).json({
                success: false,
                message: 'PositionStrategy уже существует для этой заявки'
            });
        }
        
        // Создаем PositionStrategy
        const TradingEngine = (await import('../services/TradingEngine.js')).default;
        const portfolio = await TradingEngine.getRealPortfolioValue();
        const currentQuantity = portfolio?.positions?.[figi] || 0;
        
        const positionStrategy = await PortfolioSyncService.createPositionStrategyFromRequest(
            tradingRequest,
            currentQuantity
        );
        
        res.json({
            success: true,
            message: 'Стратегия назначена позиции',
            data: positionStrategy
        });
    } catch (error) {
        console.error('Ошибка назначения стратегии:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка назначения стратегии',
            error: error.message
        });
    }
});

/**
 * Сброс виртуального портфеля с указанием начального капитала
 * POST /api/portfolio/virtual/reset
 * Body: { initialCapital?: number }
 */
router.post('/virtual/reset', async (req, res) => {
    try {
        const VirtualPortfolio = (await import('../models/VirtualPortfolio.js')).default;
        const TradingEngine = (await import('../services/TradingEngine.js')).default;
        
        const { initialCapital = 50000000 } = req.body; // По умолчанию 50 млн
        
        // Валидация
        if (typeof initialCapital !== 'number' || initialCapital <= 0) {
            return res.status(400).json({
                success: false,
                message: 'initialCapital должен быть положительным числом'
            });
        }
        
        // Сбрасываем портфель
        const portfolio = await VirtualPortfolio.resetPortfolio(initialCapital);
        
        // Перезагружаем портфель в TradingEngine
        await TradingEngine.loadVirtualPortfolio();
        
        res.json({
            success: true,
            message: `Виртуальный портфель сброшен с начальным капиталом ${initialCapital.toLocaleString('ru-RU')} руб.`,
            data: {
                portfolio: {
                    id: portfolio.id,
                    cash: portfolio.cash,
                    initialCapital: portfolio.initialCapital,
                    totalValue: portfolio.totalValue,
                    positionsCount: Object.keys(portfolio.positions || {}).length
                }
            }
        });
    } catch (error) {
        console.error('Ошибка сброса виртуального портфеля:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка сброса виртуального портфеля',
            error: error.message
        });
    }
});

export default router;
