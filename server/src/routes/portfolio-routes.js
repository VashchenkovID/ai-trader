import express from 'express';
import TradingEngine from '../services/TradingEngine.js';
import ServiceManager from '../services/ServiceManager.js';
import TinkoffApiService from '../services/TinkoffApiService.js';
import CacheService from '../services/CacheService.js';

const router = express.Router();

/**
 * Позиции портфеля
 */
router.get('/positions', async (req, res) => {
    try {
        const portfolio = await TradingEngine.getPortfolioValue();
        const rawPositions = portfolio?.positions || {};
        const positions = [];
        let totalValue = portfolio?.cash || 0;
        
        // Простая обработка позиций - показываем все, что есть
        const trades = portfolio.trades || [];
        
        for (const [figi, quantity] of Object.entries(rawPositions)) {
            if (typeof quantity === 'number' && quantity > 0) {
                try {
                    // Пробуем получить инструмент из кеша (быстро, без обновления)
                    let instrument = await CacheService.getInstrument(figi, true);
                    
                    // Если нет в кеше, создаем базовую информацию
                    if (!instrument) {
                        instrument = {
                            figi: figi,
                            ticker: figi.substring(0, 10),
                            name: 'Инструмент не найден',
                            currency: 'RUB',
                            sector: null,
                            lastPrice: null
                        };
                    }
                    
                    // Получаем цену из кеша
                    let currentPrice = instrument.lastPrice || 0;
                    
                    // Получаем среднюю цену покупки из истории сделок
                    let averagePrice = currentPrice || 0;
                    const buyTrades = trades.filter(t => (t.symbol === figi || t.figi === figi) && t.action === 'BUY');
                    if (buyTrades.length > 0) {
                        const totalCost = buyTrades.reduce((sum, trade) => sum + (trade.price * trade.quantity), 0);
                        const totalQuantity = buyTrades.reduce((sum, trade) => sum + trade.quantity, 0);
                        if (totalQuantity > 0) {
                            averagePrice = totalCost / totalQuantity;
                        }
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
                        lastUpdate: new Date().toISOString()
                    });
                } catch (error) {
                    // Даже при ошибке создаем базовую позицию
                    positions.push({
                        figi,
                        ticker: figi.substring(0, 10),
                        name: 'Ошибка загрузки',
                        quantity,
                        averagePrice: 0,
                        currentPrice: 0,
                        marketValue: 0,
                        unrealizedPnL: 0,
                        unrealizedPnLPercent: 0,
                        weight: 0,
                        sector: 'Неизвестно',
                        currency: 'RUB',
                        lastUpdate: new Date().toISOString()
                    });
                }
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

export default router;
