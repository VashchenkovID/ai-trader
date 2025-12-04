import express from 'express';
import NewsAnalysisService from '../services/NewsAnalysisService.js';
import ServiceManager from '../services/ServiceManager.js';

const router = express.Router();

/**
 * Новости по FIGI
 */
router.get('/:figi', async (req, res) => {
    try {
        const { figi } = req.params;
        const news = await NewsAnalysisService.getNewsByFigi(figi);
        res.json({
            success: true,
            data: news
        });
    } catch (error) {
        console.error('Ошибка получения новостей:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения новостей',
            error: error.message
        });
    }
});

/**
 * Проверка статуса исторических новостей
 */
router.get('/status/historical', async (req, res) => {
    try {
        const status = await NewsAnalysisService.checkHistoricalNewsStatus();
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('Ошибка проверки статуса исторических новостей:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка проверки статуса исторических новостей',
            error: error.message
        });
    }
});

/**
 * Получение даты последней новости для FIGI
 */
router.get('/last-date/:figi?', async (req, res) => {
    try {
        const { figi } = req.params;
        const lastNews = await NewsAnalysisService.getLastNewsDate(figi || null);
        res.json({
            success: true,
            data: lastNews
        });
    } catch (error) {
        console.error('Ошибка получения даты последней новости:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения даты последней новости',
            error: error.message
        });
    }
});

/**
 * Загрузка исторических новостей за год для всех акций
 */
router.post('/load-historical', async (req, res) => {
    try {
        const { year } = req.body;
        const targetYear = year || new Date().getFullYear();
        
        // Отправляем ответ сразу, так как загрузка будет выполняться в фоне
        res.json({
            success: true,
            message: 'Загрузка исторических новостей запущена',
            data: {
                year: targetYear
            }
        });

        // Запускаем загрузку в фоне
        (async () => {
            try {
                const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
                
                const result = await NewsAnalysisService.loadHistoricalNewsForAllInstruments({
                    year: targetYear,
                    onProgress: (progress) => {
                        // Отправляем прогресс через WebSocket
                        if (WebSocketService && typeof WebSocketService.broadcast === 'function') {
                            WebSocketService.broadcast({
                                type: 'news_historical_load_progress',
                                data: progress
                            });
                        }
                    }
                });


                // Отправляем результат через WebSocket
                if (WebSocketService && typeof WebSocketService.broadcast === 'function') {
                    WebSocketService.broadcast({
                        type: 'news_historical_load_completed',
                        data: result
                    });
                }

            } catch (error) {
                console.error('❌ Ошибка загрузки исторических новостей:', error);
                
                const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
                if (WebSocketService && typeof WebSocketService.broadcast === 'function') {
                    WebSocketService.broadcast({
                        type: 'news_historical_load_error',
                        data: {
                            error: error.message
                        }
                    });
                }
            }
        })();

    } catch (error) {
        console.error('Ошибка запуска загрузки исторических новостей:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка запуска загрузки исторических новостей',
            error: error.message
        });
    }
});

/**
 * Влияние новостей по FIGI
 */
router.get('/:figi/impact', async (req, res) => {
    try {
        const { figi } = req.params;
        const impact = await NewsAnalysisService.getNewsImpact(figi);
        res.json({
            success: true,
            data: impact
        });
    } catch (error) {
        console.error('Ошибка получения влияния новостей:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения влияния новостей',
            error: error.message
        });
    }
});

/**
 * Получение списка доступных инструментов для тестирования
 */
router.get('/instruments', async (req, res) => {
    try {
        const CachedInstrumentModule = await import('../models/CachedInstrument.js');
        const CachedInstrument = CachedInstrumentModule.default;
        
        const { limit = 50, currency = 'RUB', instrumentType = 'share' } = req.query;
        
        const instruments = await CachedInstrument.findAll({
            where: {
                currency: currency,
                instrumentType: instrumentType,
                isActive: true
            },
            attributes: ['ticker', 'name', 'figi', 'sector', 'currency'],
            limit: parseInt(limit),
            order: [['ticker', 'ASC']]
        });

        res.json({
            success: true,
            data: instruments,
            count: instruments.length
        });

    } catch (error) {
        console.error('Ошибка получения списка инструментов:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения списка инструментов',
            error: error.message
        });
    }
});

/**
 * Тестовый запрос новостей через NewsAPI.org для одного тикера
 */
router.post('/test-newsapi', async (req, res) => {
    try {
        const { ticker } = req.body;
        
        if (!ticker) {
            return res.status(400).json({
                success: false,
                message: 'Тикер не указан',
                error: 'Необходимо указать параметр ticker (например, "SBER")'
            });
        }

        const result = await NewsAnalysisService.fetchNewsFromNewsApiByTicker(ticker, {
            pageSize: 50
        });

        res.json({
            success: true,
            message: `Новости для ${ticker} успешно загружены через NewsAPI.org`,
            data: result
        });

    } catch (error) {
        console.error('Ошибка тестового запроса новостей:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка загрузки новостей',
            error: error.message
        });
    }
});

/**
 * Статус новостей
 */
router.get('/status', async (req, res) => {
    try {
        const status = await NewsAnalysisService.getStatus();
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('Ошибка получения статуса новостей:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статуса новостей',
            error: error.message
        });
    }
});


/**
 * Инициализация данных новостей
 * Проверяет FIGI без новостей за месяц и загружает их по одному
 * При достижении лимита откладывает операцию на сутки
 */
router.post('/initialize', async (req, res) => {
    try {
        const NewsAnalysisService = (await import('../services/NewsAnalysisService.js')).default;
        
        const { maxRequestsPerDay = 100 } = req.body;
        
        const result = await NewsAnalysisService.initializeNewsData({
            maxRequestsPerDay,
            onProgress: (progress) => {
            }
        });
        
        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error('❌ Ошибка инициализации данных новостей:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Получение списка FIGI без новостей за месяц
 */
router.get('/figis-without-month-news', async (req, res) => {
    try {
        const NewsAnalysisService = (await import('../services/NewsAnalysisService.js')).default;
        
        const figis = await NewsAnalysisService.getFigisWithoutMonthNews();
        
        res.json({
            success: true,
            count: figis.length,
            figis
        });
    } catch (error) {
        console.error('❌ Ошибка получения списка FIGI:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

export default router;
