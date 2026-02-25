import express from 'express';
import NewsAnalysisService from '../services/NewsAnalysisService.js';
import ServiceManager from '../services/ServiceManager.js';

const router = express.Router();

/**
 * Диагностика новостей в БД (должен быть до /:figi)
 * GET /api/news/debug?figi=BBG000SR0YS4
 */
router.get('/debug', async (req, res) => {
    try {
        const { figi } = req.query;
        const CachedNewsModule = await import('../models/CachedNews.js');
        const CachedNews = CachedNewsModule.default;
        const { Op } = await import('sequelize');
        const now = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const whereBase = figi ? { figi } : {};
        const wherePublished = { ...whereBase, publishedAt: { [Op.gte]: thirtyDaysAgo } };
        const whereNotExpired = { ...wherePublished, expiresAt: { [Op.gt]: now } };

        const [total, withDate, withExpiry, figiRows] = await Promise.all([
            CachedNews.count({ where: whereBase }),
            CachedNews.count({ where: wherePublished }),
            CachedNews.count({ where: whereNotExpired }),
            CachedNews.findAll({
                attributes: ['figi'],
                raw: true,
                limit: 100
            })
        ]);
        const distinctFigis = [...new Set(figiRows.map(r => r.figi))];

        const sample = await CachedNews.findAll({
            where: whereBase,
            order: [['publishedAt', 'DESC']],
            limit: 5,
            attributes: ['id', 'figi', 'title', 'publishedAt', 'expiresAt', 'category', 'url']
        });

        res.json({
            success: true,
            data: {
                figi: figi || null,
                totalInTable: total,
                last30Days: withDate,
                last30DaysNotExpired: withExpiry,
                sampleFigisInDb: distinctFigis,
                sampleRows: sample.map(s => s.toJSON ? s.toJSON() : s)
            }
        });
    } catch (error) {
        console.error('❌ Ошибка диагностики новостей:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Новости по FIGI
 * GET /api/news/:figi?limit=20&days=30
 */
router.get('/:figi', async (req, res) => {
    try {
        const { figi } = req.params;
        const limit = parseInt(req.query.limit) || 20;
        const days = parseInt(req.query.days) || 30;
        
        let news = await NewsAnalysisService.getNewsByFigi(figi, { limit, days });
        let fallbackUsed = false;

        // Если за короткий период новостей нет, пробуем расширенный период,
        // чтобы пользователь видел исторические привязанные новости по FIGI.
        if ((!news || news.length === 0) && days <= 30) {
            const fallbackNews = await NewsAnalysisService.getNewsByFigi(figi, { limit, days: 3650 });
            if (fallbackNews && fallbackNews.length > 0) {
                news = fallbackNews;
                fallbackUsed = true;
            }
        }
        const { formatModelsDates } = await import('../utils/dateFormatter.js');
        
        // Форматируем даты в новостях
        const formattedNews = Array.isArray(news) 
            ? formatModelsDates(news, ['publishedAt', 'createdAt', 'updatedAt'])
            : news;
        
        res.json({
            success: true,
            data: formattedNews,
            meta: {
                figi,
                requestedDays: days,
                fallbackUsed
            }
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
 * Принудительная загрузка свежих новостей для конкретного FIGI
 * POST /api/news/:figi/fresh
 */
router.post('/:figi/fresh', async (req, res) => {
    try {
        const { figi } = req.params;
        const limit = parseInt(req.body?.limit) || 50;

        const CacheService = (await import('../services/CacheService.js')).default;
        const instrument = await CacheService.getInstrument(figi, true);

        if (!instrument) {
            return res.status(404).json({
                success: false,
                message: `Инструмент не найден: ${figi}`
            });
        }

        const to = new Date();
        const from = new Date();
        from.setDate(from.getDate() - 30);
        from.setHours(0, 0, 0, 0);
        to.setHours(23, 59, 59, 999);

        const news = await NewsAnalysisService.fetchNewsByCompanyNameAndPeriod(
            instrument.name,
            from,
            to,
            {
                ticker: instrument.ticker,
                sector: instrument.sector,
                apiData: instrument.apiData,
                aliases: instrument.apiData?.aliases || null,
                includeFinancialTerms: true,
                figi: instrument.figi,
                pageSize: 100,
                includeCompanyNews: true,
                includeSectorNews: true,
                includePoliticalNews: true
            }
        );

        if (news && news.length > 0) {
            await NewsAnalysisService.cacheNews(figi, news);
        }

        const cachedNews = await NewsAnalysisService.getNewsByFigi(figi, { limit, days: 30 });
        const { formatModelsDates } = await import('../utils/dateFormatter.js');
        const formattedNews = Array.isArray(cachedNews)
            ? formatModelsDates(cachedNews, ['publishedAt', 'createdAt', 'updatedAt'])
            : cachedNews;

        res.json({
            success: true,
            message: `Свежие новости обновлены для ${instrument.ticker || figi}`,
            data: {
                figi,
                ticker: instrument.ticker,
                fetched: news?.length || 0,
                news: formattedNews
            }
        });
    } catch (error) {
        console.error('Ошибка принудительной загрузки свежих новостей:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка принудительной загрузки свежих новостей',
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
                
                const LoggerService = (await import('../services/LoggerService.js')).default;
                if (LoggerService.isInitialized) {
                    LoggerService.error('Error loading historical news', {
                        service: 'news-routes',
                        operation: 'load-historical',
                        error: {
                            message: error.message,
                            stack: error.stack
                        }
                    });
                }
                
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
        })().catch(async error => {
            // Дополнительная защита от необработанных промисов
            console.error('❌ Unhandled error in historical news load background task:', error);
            try {
                const LoggerService = (await import('../services/LoggerService.js')).default;
                if (LoggerService.isInitialized) {
                    LoggerService.error('Unhandled error in historical news load', {
                        service: 'news-routes',
                        operation: 'load-historical-background',
                        error: {
                            message: error.message,
                            stack: error.stack
                        }
                    });
                }
            } catch (logError) {
                console.error('❌ Failed to log error:', logError);
            }
        });

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

/**
 * Ручное обновление новостей (такой же запрос как в кроне)
 * POST /api/news/update-daily
 */
router.post('/update-daily', async (req, res) => {
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
        const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
        
        // Отправляем ответ сразу, так как обновление будет выполняться в фоне
        res.json({
            success: true,
            message: 'Обновление новостей запущено',
            data: {
                started: new Date().toISOString()
            }
        });

        // Запускаем обновление в фоне
        (async () => {
            try {
                const LoggerService = (await import('../services/LoggerService.js')).default;
                LoggerService.info('Manual news update started via API', {
                    service: 'news-routes',
                    operation: 'update-daily',
                    timestamp: new Date().toISOString()
                });
                
                const result = await SchedulerService.performDailyNewsUpdate();

                LoggerService.info('Manual news update completed', {
                    service: 'news-routes',
                    operation: 'update-daily',
                    result: {
                        updated: result.updated,
                        totalNews: result.totalNews,
                        processed: result.processed
                    }
                });

                // Отправляем результат через WebSocket (безопасно, обрабатываем промис если есть)
                if (WebSocketService && typeof WebSocketService.broadcast === 'function') {
                    try {
                        const broadcastResult = WebSocketService.broadcast({
                            type: 'news_daily_update_completed',
                            data: result
                        });
                        // Если broadcast возвращает промис, обрабатываем его
                        if (broadcastResult && typeof broadcastResult.catch === 'function') {
                            broadcastResult.catch(err => {
                                console.warn('⚠️ Error in WebSocket broadcast:', err.message);
                            });
                        }
                    } catch (wsError) {
                        // Игнорируем ошибки WebSocket, чтобы не прерывать процесс
                        console.warn('⚠️ Error in WebSocket broadcast:', wsError.message);
                    }
                }

            } catch (error) {
                const LoggerService = (await import('../services/LoggerService.js')).default;
                LoggerService.error('Error during manual news update', {
                    service: 'news-routes',
                    operation: 'update-daily',
                    error: {
                        message: error.message,
                        stack: error.stack
                    }
                });
                
                const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
                if (WebSocketService && typeof WebSocketService.broadcast === 'function') {
                    try {
                        const broadcastResult = WebSocketService.broadcast({
                            type: 'news_daily_update_error',
                            data: {
                                error: error.message
                            }
                        });
                        // Если broadcast возвращает промис, обрабатываем его
                        if (broadcastResult && typeof broadcastResult.catch === 'function') {
                            broadcastResult.catch(err => {
                                console.warn('⚠️ Error in WebSocket error broadcast:', err.message);
                            });
                        }
                    } catch (wsError) {
                        // Игнорируем ошибки WebSocket, чтобы не прерывать процесс
                        console.warn('⚠️ Error in WebSocket error broadcast:', wsError.message);
                    }
                }
            }
        })().catch(async error => {
            // Дополнительная защита от необработанных промисов
            console.error('❌ Unhandled error in daily news update background task:', error);
            try {
                const LoggerService = (await import('../services/LoggerService.js')).default;
                if (LoggerService.isInitialized) {
                    LoggerService.error('Unhandled error in daily news update', {
                        service: 'news-routes',
                        operation: 'update-daily-background',
                        error: {
                            message: error.message,
                            stack: error.stack
                        }
                    });
                }
            } catch (logError) {
                console.error('❌ Failed to log error:', logError);
            }
        });

    } catch (error) {
        console.error('❌ Ошибка запуска обновления новостей:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка запуска обновления новостей',
            error: error.message
        });
    }
});

export default router;
