import express from 'express';
import { Op } from 'sequelize';
import TradingEngine from '../services/TradingEngine.js';
import ServiceManager from '../services/ServiceManager.js';
import TinkoffApiService from '../services/TinkoffApiService.js';
import CacheService from '../services/CacheService.js';
import LoggerService from '../services/LoggerService.js';

const router = express.Router();

/**
 * Общая информация о портфеле
 */
router.get('/', async (req, res) => {
    try {
        const portfolio = await TradingEngine.getPortfolioValue();
        
        // Используем значения из TradingEngine.getPortfolioValue() вместо пересчета
        // Это гарантирует согласованность данных
        const cash = portfolio?.cash || 0;
        const positionsValue = portfolio?.positionsValue || 0;
        const totalValue = portfolio?.totalValue || (cash + positionsValue);
        const rawPositions = portfolio?.positions || {};
        
        // Рассчитываем PnL
        const initialCapital = portfolio?.initialCapital || 1000000;
        const totalPnL = totalValue - initialCapital;
        const totalPnLPercent = initialCapital > 0 ? (totalPnL / initialCapital) * 100 : 0;
        
        res.json({
            success: true,
            data: {
                cash,
                positions: rawPositions,
                positionsValue,
                totalValue,
                totalPnL,
                totalPnLPercent,
                trades: portfolio?.trades || [],
                mode: portfolio?.mode || 'paper',
                initialCapital
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
        const totalValue = portfolio?.totalValue || (cash + positionsValue);
        
        // Рассчитываем PnL (если есть начальный капитал)
        const initialCapital = portfolio?.initialCapital || 0;
        const totalPnL = initialCapital > 0 ? totalValue - initialCapital : 0;
        const totalPnLPercent = initialCapital > 0 ? (totalPnL / initialCapital) * 100 : 0;
        
        res.json({
            success: true,
            data: {
                cash,
                positions: rawPositions,
                positionsValue,
                totalValue,
                totalPnL,
                totalPnLPercent,
                trades: portfolio?.trades || [],
                mode: 'real',
                initialCapital
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
        
        // Импортируем модели
        const TradingRequest = (await import('../models/TradingRequest.js')).default;
        const PositionStrategy = (await import('../models/PositionStrategy.js')).default;
        const TradingStrategy = (await import('../models/TradingStrategy.js')).default;
        
        // Группируем позиции по FIGI + strategyId
        // Для каждого FIGI находим все BUY заявки и группируем их по стратегиям
        const positionsByStrategy = new Map(); // Ключ: `${figi}_${strategyId || 'null'}`, значение: {figi, strategyId, buyTrades, sellTrades}
        
        // Собираем все уникальные FIGI из rawPositions
        const allFigis = Object.keys(rawPositions).filter(figi => rawPositions[figi] > 0);
        
        // Отладочная информация
        console.log(`🔍 Portfolio positions debug:`, {
            rawPositionsCount: Object.keys(rawPositions).length,
            allFigisCount: allFigis.length,
            allFigis: allFigis.slice(0, 5), // Первые 5 для примера
            tradesCount: trades.length
        });
        
        for (const figi of allFigis) {
            try {
                // Получаем все BUY заявки для этого FIGI (не только EXECUTED, но и APPROVED, PENDING)
                // EXECUTED заявки могут не существовать, если сделки выполняются напрямую через TradingEngine
                const buyRequests = await TradingRequest.findAll({
                    where: {
                        figi,
                        action: 'BUY',
                        status: {
                            [Op.in]: ['EXECUTED', 'APPROVED', 'PENDING']
                        }
                    },
                    order: [['executedAt', 'ASC'], ['createdAt', 'ASC']]
                });
                
                // Получаем все SELL заявки для этого FIGI
                const sellRequests = await TradingRequest.findAll({
                    where: {
                        figi,
                        action: 'SELL',
                        status: {
                            [Op.in]: ['EXECUTED', 'APPROVED', 'PENDING']
                        }
                    },
                    order: [['executedAt', 'ASC'], ['createdAt', 'ASC']]
                });
                
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
                    
                    if (buyTradesForFigi.length > 0) {
                        // Группируем сделки по strategyId
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
                    } else {
                        // Если нет сделок, создаем одну запись с количеством из rawPositions
                        const key = `${figi}_null`;
                        if (!positionsByStrategy.has(key)) {
                            positionsByStrategy.set(key, {
                                figi,
                                strategyId: null,
                                buyTrades: [],
                                sellTrades: []
                            });
                        }
                        positionsByStrategy.get(key).buyTrades.push({
                            quantity: rawPositions[figi],
                            price: 0, // Будет рассчитано позже
                            executedAt: new Date()
                        });
                    }
                }
                
                // Группируем BUY заявки по стратегиям
                for (const buyRequest of buyRequests) {
                    let strategyId = buyRequest.strategyId;
                    
                    // Если strategyId нет в заявке, ищем через PositionStrategy
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
                    
                    // Добавляем BUY заявку с количеством и ценой
                    const buyQuantity = buyRequest.quantity || 0;
                    const buyPrice = buyRequest.actualPrice || buyRequest.priceAtRequest || 0;
                    positionsByStrategy.get(key).buyTrades.push({
                        quantity: buyQuantity,
                        price: buyPrice,
                        executedAt: buyRequest.executedAt || buyRequest.createdAt
                    });
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
                        const positionStrategy = await PositionStrategy.findOne({
                            where: { positionId: sellRequest.id }
                        });
                        if (positionStrategy) {
                            sellStrategyId = positionStrategy.strategyId;
                        }
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
            positionsByStrategyKeys: Array.from(positionsByStrategy.keys()).slice(0, 5)
        });
        
        // Формируем финальные позиции
        for (const [key, positionData] of positionsByStrategy.entries()) {
            const { figi, strategyId, buyTrades, sellTrades } = positionData;
            
            // Рассчитываем количество акций (BUY - SELL)
            const totalBuyQty = buyTrades.reduce((sum, t) => sum + t.quantity, 0);
            const totalSellQty = sellTrades.reduce((sum, t) => sum + t.quantity, 0);
            const quantity = totalBuyQty - totalSellQty;
            
            // Отладочная информация для первой позиции
            if (positions.length === 0) {
                console.log(`🔍 First position calculation:`, {
                    key,
                    figi,
                    strategyId,
                    buyTradesCount: buyTrades.length,
                    sellTradesCount: sellTrades.length,
                    totalBuyQty,
                    totalSellQty,
                    quantity
                });
            }
            
            // Пропускаем позиции с нулевым или отрицательным количеством
            if (quantity <= 0) {
                if (positions.length === 0) {
                    console.log(`⚠️ Skipping position ${key}: quantity = ${quantity}`);
                }
                continue;
            }
            
            try {
                // Получаем инструмент
                let instrument = await CacheService.getInstrument(figi, true);
                if (!instrument) {
                    console.warn(`⚠️ Пропущена позиция ${figi}: инструмент не найден в кеше`);
                    continue;
                }
                
                // Получаем текущую цену
                let currentPrice = instrument.lastPrice || 0;
                
                // Рассчитываем среднюю цену покупки
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
                
                const marketValue = currentPrice > 0 ? currentPrice * quantity : 0;
                const unrealizedPnL = currentPrice > 0 && averagePrice > 0 ? (currentPrice - averagePrice) * quantity : 0;
                const unrealizedPnLPercent = averagePrice > 0 && currentPrice > 0 ? ((currentPrice - averagePrice) / averagePrice) * 100 : 0;
                
                totalValue += marketValue;
                
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
                    quantity,
                    averagePrice: Math.round(averagePrice * 100) / 100,
                    currentPrice: Math.round(currentPrice * 100) / 100,
                    marketValue: Math.round(marketValue * 100) / 100,
                    unrealizedPnL: Math.round(unrealizedPnL * 100) / 100,
                    unrealizedPnLPercent: Math.round(unrealizedPnLPercent * 100) / 100,
                    weight: 0,
                    sector,
                    currency: instrument.currency || 'RUB',
                    lastUpdate: new Date().toISOString(),
                    strategy: strategy ? {
                        id: strategy.id,
                        name: strategy.name,
                        type: strategy.type
                    } : null,
                    positionStrategy: strategyId ? {
                        id: null, // Можно добавить ID PositionStrategy если нужно
                        strategyId: strategyId
                    } : null
                });
            } catch (error) {
                console.warn(`⚠️ Пропущена позиция ${figi} из-за ошибки загрузки:`, error.message);
                continue;
            }
        }
        
        // Рассчитываем веса позиций
        positions.forEach(position => {
            position.weight = totalValue > 0 ? (position.marketValue / totalValue) * 100 : 0;
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
        const SchedulerService = (await import('../services/SchedulerService.js')).default;
        
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

export default router;
