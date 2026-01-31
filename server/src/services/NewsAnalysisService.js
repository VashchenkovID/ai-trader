import { Op } from 'sequelize';

/**
 * Сервис для анализа новостей
 * Получает новости из внешних источников и анализирует их влияние на рынок
 */
class NewsAnalysisService {
    constructor() {
        this.isInitialized = false;
        this.cache = new Map();
        this.cacheTimeout = 30 * 60 * 1000; // 30 минут
        this.sentimentModel = null; // BERT модель для анализа тональности
        this.modelLoading = false; // Флаг загрузки модели
    }

    async initialize() {
        try {
            this.isInitialized = true;
        } catch (error) {
            console.error('❌ Error initializing NewsAnalysisService:', error);
        }
    }

    /**
     * Ленивая загрузка BERT модели для анализа тональности
     * Использует @xenova/transformers, пробует несколько моделей по порядку
     * @returns {Promise<object>} - Загруженная модель (pipeline)
     */
    async loadSentimentModel() {
        // Проверяем, не отключен ли анализ тональности
        if (process.env.DISABLE_SENTIMENT_ANALYSIS === 'true') {
            return null;
        }
        
        try {
            if (this.modelLoading) {
                while (this.modelLoading) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                return this.sentimentModel;
            }

            if (this.sentimentModel) {
                return this.sentimentModel;
            }

            this.modelLoading = true;

            try {
                const { pipeline } = await import('@xenova/transformers');

                const modelsToTry = [
                    'Xenova/bert-base-multilingual-uncased-sentiment',
                    'Xenova/rubert-base-cased-sentiment',
                    'cointegrated/rubert-tiny2',
                    'nlptown/bert-base-multilingual-uncased-sentiment',
                    'Xenova/distilbert-base-multilingual-cased',
                    null
                ];

                let lastError = null;
                for (const modelName of modelsToTry) {
                    if (!modelName) {
                        // Пропускаем null модели
                        continue;
                    }
                    
                    try {
                        // Добавляем timeout для защиты от зависания и segmentation fault
                        this.sentimentModel = await Promise.race([
                            pipeline(
                                'sentiment-analysis',
                                modelName,
                                {
                                    quantized: true
                                }
                            ),
                            new Promise((_, reject) => 
                                setTimeout(() => reject(new Error('Model loading timeout')), 30000)
                            )
                        ]);
                        break;
                    } catch (error) {
                        lastError = error;
                        const errorMsg = error.message || String(error);
                        // Если это ONNX ошибка, прекращаем попытки и отключаем анализ тональности
                        if (errorMsg.includes('Ort::Exception') || 
                            errorMsg.includes('onnxruntime') ||
                            errorMsg.includes('No error information')) {
                            console.warn('⚠️ ONNX Runtime error detected, disabling sentiment analysis');
                            this.sentimentModel = null;
                            this.modelLoading = false;
                            return null;
                        }
                        continue;
                    }
                }

                if (!this.sentimentModel) {
                    throw lastError || new Error('Не удалось загрузить ни одну модель для анализа тональности');
                }
            } catch (importError) {
                // Если импорт @xenova/transformers вызывает ошибку, отключаем анализ тональности
                if (importError.message && (importError.message.includes('Ort::Exception') || 
                    importError.message.includes('onnxruntime'))) {
                    console.warn('⚠️ ONNX Runtime error, sentiment analysis disabled');
                    this.sentimentModel = null;
                    this.modelLoading = false;
                    return null;
                }
                throw importError;
            }

            this.modelLoading = false;
            return this.sentimentModel;

        } catch (error) {
            this.modelLoading = false;
            console.error('❌ Ошибка загрузки BERT модели для анализа тональности:', error.message);
            this.sentimentModel = null;
            return null;
        }
    }

    /**
     * @deprecated Используйте getCachedNews() для получения новостей из БД
     * Метод fetchNews удален, используйте getCachedNews().
     */
    async fetchNews(figi, options = {}) {
        const { days = 7, limit = 10 } = options;
        return await this.getCachedNews(figi, days, limit);
    }

    /**
     * Расчет релевантности новости для инструмента
     */
    calculateRelevance(article, figi) {
        const text = (article.title + ' ' + (article.description || '')).toLowerCase();
        const figiLower = figi.toLowerCase();
        
        let relevance = 0;
        
        if (text.includes(figiLower)) {
            relevance += 0.5;
        }
        
        const financialKeywords = [
            'доходы', 'выручка', 'прибыль', 'убыток', 'дивиденды',
            'слияние', 'поглощение', 'партнерство', 'инвестиции',
            'акции', 'акция', 'рынок', 'торговля', 'цена', 'цены',
            'результаты', 'квартал', 'год', 'отчетность', 'финансы',
            'капитал', 'оборот', 'продажи', 'рост', 'падение',
            'котировки', 'бирже', 'инвесторы', 'портфель', 'дивиденд'
        ];
        
        financialKeywords.forEach(keyword => {
            if (text.includes(keyword)) {
                relevance += 0.1;
            }
        });
        
        return Math.min(1, relevance);
    }

    /**
     * Анализ настроений новости с использованием BERT модели
     * @param {string} text - Текст для анализа
     * @param {boolean} useFallback - Использовать упрощенный метод при ошибке (по умолчанию true)
     * @returns {Promise<number>} - Значение от -1 (отрицательное) до 1 (положительное)
     */
    async analyzeSentiment(text, useFallback = true) {
        try {
            if (!text || typeof text !== 'string' || text.trim().length === 0) {
                return 0;
            }

            const model = await this.loadSentimentModel();
            
            if (model) {
                try {
                    const maxLength = 512;
                    const truncatedText = text.length > maxLength 
                        ? text.substring(0, maxLength) 
                        : text;

                    // Обертка для защиты от segmentation fault в нативных модулях
                    const result = await Promise.race([
                        model(truncatedText),
                        new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('BERT model timeout')), 10000)
                        )
                    ]);
                    const prediction = Array.isArray(result) ? result[0] : result;
                    
                    if (prediction && prediction.label) {
                        const label = (prediction.label || '').toUpperCase();
                        const score = prediction.score || 0;

                        let sentimentValue;
                        
                        if (label === 'POSITIVE' || label === 'POS' || label === 'LABEL_1' || 
                            label === 'LABEL_2' || label.includes('POSITIVE') || 
                            label === '5 STARS' || label === '4 STARS') {
                            sentimentValue = 0.2 + (score - 0.5) * 1.6;
                        } 
                        else if (label === 'NEGATIVE' || label === 'NEG' || label === 'LABEL_0' || 
                                 label.includes('NEGATIVE') || label === '1 STAR' || label === '2 STARS') {
                            sentimentValue = -1.0 + (score - 0.5) * 1.6;
                        } 
                        else if (label === 'NEUTRAL' || label === 'LABEL_1' || label === '3 STARS') {
                            sentimentValue = 0;
                        }
                        else {
                            sentimentValue = (score - 0.5) * 2;
                        }

                        return Math.max(-1, Math.min(1, sentimentValue));
                    }

                    if (useFallback) {
                        return this.analyzeSentimentFallback(text);
                    }
                    return 0;

                } catch (modelError) {
                    if (useFallback) {
                        return this.analyzeSentimentFallback(text);
                    }
                    return 0;
                }
            } else {
                if (useFallback) {
                    return this.analyzeSentimentFallback(text);
                }
                return 0;
            }

        } catch (error) {
            console.error('❌ Ошибка анализа тональности:', error);
            if (useFallback) {
                return this.analyzeSentimentFallback(text);
            }
            return 0;
        }
    }

    /**
     * Упрощенный метод анализа тональности (fallback)
     */
    analyzeSentimentFallback(text) {
        const positiveWords = [
            'good', 'great', 'excellent', 'positive', 'growth', 'profit',
            'increase', 'rise', 'gain', 'success', 'strong', 'up',
            'хорошо', 'отлично', 'положительный', 'рост', 'прибыль',
            'увеличение', 'успех', 'сильный', 'вверх', 'вырос', 'поднялся',
            'покупка', 'покупать', 'позитив', 'оптимизм', 'надежда', 'уверенность',
            'доход', 'выручка', 'результаты', 'квартал', 'отчетность'
        ];
        
        const negativeWords = [
            'bad', 'terrible', 'negative', 'loss', 'decline', 'decrease',
            'fall', 'drop', 'weak', 'failure', 'down', 'crash',
            'плохо', 'ужасно', 'отрицательный', 'убыток', 'снижение',
            'падение', 'слабый', 'провал', 'вниз', 'крах', 'упал',
            'снизился', 'продажа', 'продавать', 'пессимизм', 'риск', 'опасность',
            'кризис', 'проблемы', 'сложности', 'негатив'
        ];
        
        const words = text.toLowerCase().split(/\W+/);
        let positiveCount = 0;
        let negativeCount = 0;
        
        words.forEach(word => {
            if (positiveWords.includes(word)) {
                positiveCount++;
            }
            if (negativeWords.includes(word)) {
                negativeCount++;
            }
        });
        
        if (positiveCount + negativeCount === 0) {
            return 0; // Нейтральное
        }
        
        return (positiveCount - negativeCount) / (positiveCount + negativeCount);
    }

    /**
     * Получение агрегированных новостей для портфеля
     */
    async getPortfolioNews(portfolio, options = {}) {
        try {
            const allNews = [];
            const { days = 7, limit = 20 } = options;
            
            for (const position of portfolio) {
                const news = await this.getCachedNews(position.symbol, days, limit);
                allNews.push(...news);
            }
            
            return allNews
                .sort((a, b) => b.relevance - a.relevance)
                .slice(0, limit);
                
        } catch (error) {
            console.error('❌ Error getting portfolio news:', error);
            return [];
        }
    }

    /**
     * Получение новостей по FIGI
     */
    async getNewsByFigi(figi, options = {}) {
        try {
            const cachedNews = await this.getCachedNews(figi, options.days || 7, options.limit || 10);
            return cachedNews || [];
        } catch (error) {
            console.error('❌ Error getting news by FIGI:', error);
            return [];
        }
    }

    /**
     * Анализ влияния новостей на цены
     */
    async analyzeNewsImpact(figi, days = 30) {
        try {
            const news = await this.getCachedNews(figi, days, 50);
            const impact = {
                totalNews: news.length,
                positiveNews: news.filter(n => n.sentiment > 0.1).length,
                negativeNews: news.filter(n => n.sentiment < -0.1).length,
                averageSentiment: 0,
                highRelevanceNews: news.filter(n => n.relevance > 0.7).length
            };
            
            if (news.length > 0) {
                impact.averageSentiment = news.reduce((sum, n) => sum + n.sentiment, 0) / news.length;
            }
            
            return impact;
        } catch (error) {
            console.error('❌ Error analyzing news impact:', error);
            return {
                totalNews: 0,
                positiveNews: 0,
                negativeNews: 0,
                averageSentiment: 0,
                highRelevanceNews: 0
            };
        }
    }

    /**
     * Получение влияния новостей (алиас для совместимости)
     */
    async getNewsImpact(figi, days = 30) {
        return await this.analyzeNewsImpact(figi, days);
    }

    /**
     * Получение статуса сервиса
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            apiProvider: 'Tinkoff Invest API',
            cacheSize: this.cache.size
        };
    }

    /**
     * Получение кешированных новостей из БД
     */
    async getCachedNews(figi, days, limit) {
        try {
            const CachedNewsModule = await import('../models/CachedNews.js');
            const CachedNews = CachedNewsModule.default;
            
            const fromDate = new Date();
            fromDate.setDate(fromDate.getDate() - days);
            
            const cachedNews = await CachedNews.findAll({
                where: {
                    figi,
                    publishedAt: {
                        [Op.gte]: fromDate
                    },
                    expiresAt: {
                        [Op.gt]: new Date()
                    }
                },
                order: [['publishedAt', 'DESC']],
                limit
            });

            const { formatDateToISO } = await import('../utils/dateFormatter.js');
            
            return cachedNews.map(news => {
                const newsData = news.toJSON ? news.toJSON() : news;
                return {
                title: newsData.title || news.title,
                description: newsData.description || news.description,
                url: newsData.url || news.url,
                source: newsData.source || news.source,
                publishedAt: formatDateToISO(newsData.publishedAt || news.publishedAt),
                sentiment: newsData.sentiment || news.sentiment,
                relevance: newsData.relevance || news.relevance,
                impact: newsData.impact || news.impact,
                keywords: newsData.keywords || news.keywords || [],
                category: newsData.category || news.category
                };
            });

        } catch (error) {
            console.error('❌ Ошибка получения кешированных новостей:', error);
            return [];
        }
    }

    /**
     * Проверка наличия исторических новостей в БД
     * @param {string|null} figi - FIGI инструмента (опционально)
     * @returns {Promise<object>} - Объект с датой последней новости и флагом наличия истории
     */
    async getLastNewsDate(figi = null) {
        try {
            const CachedNewsModule = await import('../models/CachedNews.js');
            const CachedNews = CachedNewsModule.default;
            
            const whereClause = figi ? { figi } : {};
            
            const lastNews = await CachedNews.findOne({
                where: whereClause,
                order: [['publishedAt', 'DESC']],
                attributes: ['publishedAt', 'figi']
            });

            if (lastNews) {
                return {
                    date: lastNews.publishedAt,
                    figi: lastNews.figi,
                    hasHistory: true
                };
            }

            return {
                date: null,
                figi: figi || null,
                hasHistory: false
            };

        } catch (error) {
            console.error('❌ Ошибка получения последней даты новостей:', error);
            return {
                date: null,
                figi: figi || null,
                hasHistory: false
            };
        }
    }

    /**
     * Проверка наличия новостей за месяц для FIGI
     */
    async hasNewsForMonth(figi) {
        try {
            const CachedNewsModule = await import('../models/CachedNews.js');
            const CachedNews = CachedNewsModule.default;
            
            const oneMonthAgo = new Date();
            oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
            
            const newsCount = await CachedNews.count({
                where: {
                    figi,
                    publishedAt: {
                        [Op.gte]: oneMonthAgo
                    }
                }
            });

            return newsCount > 0;

        } catch (error) {
            console.error(`❌ Ошибка проверки новостей за месяц для ${figi}:`, error);
            return false;
        }
    }

    /**
     * Получение списка FIGI без новостей за месяц
     */
    async getFigisWithoutMonthNews() {
        try {
            const ServiceManager = (await import('./ServiceManager.js')).default;
            let CacheService = ServiceManager.getService('CacheService');
            if (!CacheService) {
                const CacheServiceModule = await import('./CacheService.js');
                CacheService = CacheServiceModule.default;
            }

            const instruments = await CacheService.getAllInstruments();
            const figisWithoutNews = [];

            for (const instrument of instruments) {
                const figi = instrument.figi || instrument;
                const hasNews = await this.hasNewsForMonth(figi);
                
                if (!hasNews) {
                    figisWithoutNews.push({
                        figi,
                        ticker: instrument.ticker,
                        name: instrument.name
                    });
                }
            }

            return figisWithoutNews;

        } catch (error) {
            console.error('❌ Ошибка получения списка FIGI без новостей:', error);
            throw error;
        }
    }

    /**
     * Проверка статуса исторических новостей
     */
    async checkHistoricalNewsStatus(year = null) {
        try {
            const ServiceManager = (await import('./ServiceManager.js')).default;
            let CacheService = ServiceManager.getService('CacheService');
            if (!CacheService) {
                const CacheServiceModule = await import('./CacheService.js');
                CacheService = CacheServiceModule.default;
            }

            const targetYear = year || new Date().getFullYear();
            const startDate = new Date(targetYear, 0, 1);
            const endDate = new Date(targetYear, 11, 31, 23, 59, 59);

            const instruments = await CacheService.getAllInstruments();
            const status = {
                year: targetYear,
                totalInstruments: instruments.length,
                instrumentsWithNews: 0,
                instrumentsWithoutNews: 0,
                lastNewsDate: null
            };

            for (const instrument of instruments) {
                const figi = instrument.figi || instrument;
                const lastNews = await this.getLastNewsDate(figi);
                
                if (lastNews.hasHistory && lastNews.date >= startDate && lastNews.date <= endDate) {
                    status.instrumentsWithNews++;
                } else {
                    status.instrumentsWithoutNews++;
                }
            }

            const globalLastNews = await this.getLastNewsDate();
            status.lastNewsDate = globalLastNews.date;

            return status;

        } catch (error) {
            console.error('❌ Ошибка проверки статуса исторических новостей:', error);
            throw error;
        }
    }


    /**
     * Проверка, является ли текст валидным описанием новости
     * Фильтрует мусор, метаданные и служебную информацию
     */
    isValidNewsText(text) {
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return false;
        }

        const trimmed = text.trim();
        
        // Слишком короткий текст (меньше 20 символов) - вероятно мусор
        if (trimmed.length < 20) {
            return false;
        }

        // Проверяем соотношение знаков препинания к словам
        const punctuationCount = (trimmed.match(/[,.\-:;]/g) || []).length;
        const wordCount = trimmed.split(/\s+/).filter(w => w.length > 2).length;
        
        // Если знаков препинания больше чем слов, или слов меньше 3 - это мусор
        if (punctuationCount > wordCount || wordCount < 3) {
            return false;
        }

        // Проверяем, что текст содержит осмысленные слова (не только цифры и символы)
        const meaningfulWords = trimmed.match(/[а-яёА-ЯЁa-zA-Z]{3,}/g) || [];
        if (meaningfulWords.length < 3) {
            return false;
        }

        // Фильтруем тексты, которые выглядят как метаданные (много цифр, служебных символов)
        const digitRatio = (trimmed.match(/\d/g) || []).length / trimmed.length;
        if (digitRatio > 0.3) {
            return false;
        }

        // Фильтруем тексты с множественными запятыми подряд
        if (trimmed.match(/,\s*,/)) {
            return false;
        }

        return true;
    }

    /**
     * Очистка и нормализация текста новости
     */
    cleanNewsText(text) {
        if (!text || typeof text !== 'string') {
            return '';
        }

        let cleaned = text.trim();
        
        // Удаляем множественные запятые и пробелы
        cleaned = cleaned.replace(/,\s*,+/g, ', ');
        
        // Удаляем множественные пробелы
        cleaned = cleaned.replace(/\s+/g, ' ');
        
        // Удаляем служебные паттерны (ИНН, ОГРН и т.д.)
        cleaned = cleaned.replace(/\b\d{10,15}\b/g, '');
        
        // Очищаем от лишних пробелов после удаления
        cleaned = cleaned.replace(/\s+/g, ' ').trim();
        
        return cleaned;
    }

    /**
     * Запрос новостей по названию компании и периоду через NewsAPI.org
     * @param {string} companyName - Название компании
     * @param {Date} fromDate - Дата начала периода
     * @param {Date} toDate - Дата окончания периода
     * @param {object} options - Дополнительные опции (ticker, sector, apiData и т.д.)
     * @returns {Promise<Array>} - Массив обработанных новостей
     */
    async fetchNewsByCompanyNameAndPeriod(companyName, fromDate, toDate, options = {}) {
        try {
            if (!this.isInitialized) {
                throw new Error('NewsAnalysisService не инициализирован');
            }

            const NewsApiService = (await import('./NewsApiService.js')).default;

            if (!NewsApiService.isInitialized) {
                await NewsApiService.initialize();
            }

            const news = await NewsApiService.fetchNewsByCompanyName(companyName, fromDate, toDate, {
                ticker: options.ticker || null,
                sector: options.sector || null,
                apiData: options.apiData || null,
                includeFinancialTerms: options.includeFinancialTerms !== false, // По умолчанию true
                aliases: options.aliases || null,
                pageSize: options.pageSize || 100
            });

            if (!news || news.length === 0) {
                return [];
            }

            const processedNewsPromises = news
                .filter(article => article.title || article.description || article.content)
                .map(async (article) => {
                    try {
                        let newsText = article.description || article.content || '';
                        const newsTitle = article.title || '';
                        
                        // Очищаем и валидируем текст
                        newsText = this.cleanNewsText(newsText);
                        
                        // Если текст невалидный, пропускаем статью
                        if (!this.isValidNewsText(newsText)) {
                            return null;
                        }
                        
                        let newsTime = new Date();
                        if (article.publishedAt) {
                            try {
                                newsTime = new Date(article.publishedAt);
                                if (isNaN(newsTime.getTime())) {
                                    newsTime = new Date();
                                }
                            } catch (e) {
                                newsTime = new Date();
                            }
                        }

                        const sentiment = await this.analyzeSentiment(newsTitle + ' ' + newsText);

                        return {
                            title: newsTitle,
                            description: newsText,
                            url: article.url || '',
                            publishedAt: newsTime,
                            source: article.source?.name || 'NewsAPI',
                            sentiment: sentiment,
                            relevance: options.figi ? this.calculateRelevance({ title: newsTitle, description: newsText }, options.figi) : 0.5,
                            keywords: this.extractKeywords(newsTitle + ' ' + newsText),
                            category: 'general',
                            impact: this.calculateImpact({ title: newsTitle, description: newsText }),
                            language: 'ru'
                        };
                    } catch (articleError) {
                        console.warn(`⚠️ Ошибка обработки статьи:`, articleError.message);
                        return null;
                    }
                });

            // Ждем завершения всех промисов
            const processedNews = (await Promise.all(processedNewsPromises))
                .filter(article => article !== null);

            return processedNews;

        } catch (error) {
            console.error(`❌ Ошибка загрузки новостей для "${companyName}":`, error);
            
            // Для ошибок 500, 502, 503, 504 (внешние API недоступны или временные ошибки) возвращаем пустой массив
            // вместо throw, чтобы не вызывать unhandledRejection
            if (error.status === 500 || error.statusCode === 500 ||
                error.status === 502 || error.statusCode === 502 || 
                error.status === 503 || error.statusCode === 503 ||
                error.status === 504 || error.statusCode === 504 ||
                error.message?.includes('status: 500') ||
                error.message?.includes('status: 502') ||
                error.message?.includes('status: 503') ||
                error.message?.includes('status: 504') ||
                error.message?.includes('HTTP 500') ||
                error.message?.includes('HTTP 502') ||
                error.message?.includes('HTTP 503') ||
                error.message?.includes('HTTP 504')) {
                const LoggerService = (await import('./LoggerService.js')).default;
                LoggerService.warn(`⚠️ External News API error for "${companyName}": ${error.message}. Returning empty news.`, {
                    service: 'NewsAnalysisService',
                    operation: 'fetchNewsByCompanyNameAndPeriod',
                    companyName,
                    error: { message: error.message, stack: error.stack }
                });
                return [];
            }
            
            throw error;
        }
    }

    /**
     * Получение новостей через NewsAPI.org для одного тикера (тестовый метод)
     * Использует поиск по ключевым словам вместо прямого поиска по тикеру
     * @param {string} ticker - Тикер акции (например, 'SBER')
     * @param {object} options - Опции запроса
     * @returns {Promise<object>} - Результат загрузки новостей
     */
    async fetchNewsFromNewsApiByTicker(ticker, options = {}) {
        try {
            if (!this.isInitialized) {
                throw new Error('NewsAnalysisService не инициализирован');
            }

            const NewsApiService = (await import('./NewsApiService.js')).default;
            const CachedInstrumentModule = await import('../models/CachedInstrument.js');
            const CachedInstrument = CachedInstrumentModule.default;

            if (!NewsApiService.isInitialized) {
                await NewsApiService.initialize();
            }

            const tickerUpper = ticker.toUpperCase();
            let instrument = await CachedInstrument.findOne({
                where: {
                    ticker: tickerUpper,
                    currency: 'RUB'
                }
            });

            // Если не нашли, пробуем найти просто по тикеру
            if (!instrument) {
                instrument = await CachedInstrument.findOne({
                    where: {
                        ticker: tickerUpper
                    }
                });
            }

            if (!instrument) {
                // Показываем список доступных тикеров для отладки
                const availableTickers = await CachedInstrument.findAll({
                    where: {
                        currency: 'RUB'
                    },
                    attributes: ['ticker', 'name'],
                    limit: 20,
                    order: [['ticker', 'ASC']]
                });
                
                const tickerList = availableTickers.length > 0 
                    ? availableTickers.map(i => `${i.ticker} (${i.name || 'без названия'})`).join(', ')
                    : 'нет данных';
                
                throw new Error(`Инструмент с тикером ${ticker} не найден в БД. Доступные тикеры: ${tickerList}`);
            }

            // Формируем поисковый запрос с дополнительными данными
            const searchQuery = NewsApiService.buildSearchQuery(
                instrument.ticker, 
                instrument.name,
                {
                    sector: instrument.sector,
                    apiData: instrument.apiData,
                    includeFinancialTerms: true,
                    aliases: instrument.apiData?.aliases || null
                }
            );

            const to = options.to || new Date();
            const from = options.from || new Date();
            
            from.setDate(from.getDate() - 30);
            from.setHours(0, 0, 0, 0);
            
            const now = new Date();
            if (to > now) {
                to.setTime(now.getTime());
            }
            to.setHours(23, 59, 59, 999);

            const news = await NewsApiService.searchNews(searchQuery, {
                language: 'ru',
                from: from,
                to: to,
                sortBy: 'relevancy',
                pageSize: Math.min(options.pageSize || 100, 100)
            });

            if (!news || news.length === 0) {
                return {
                    success: true,
                    ticker,
                    figi: instrument.figi,
                    newsCount: 0,
                    message: 'Новости не найдены',
                    searchQuery
                };
            }

            const processedNewsPromises = news
                .filter(article => article.title || article.description || article.content)
                .map(async (article) => {
                    try {
                        let newsText = article.description || article.content || '';
                        const newsTitle = article.title || '';
                        
                        // Очищаем и валидируем текст
                        newsText = this.cleanNewsText(newsText);
                        
                        // Если текст невалидный, пропускаем статью
                        if (!this.isValidNewsText(newsText)) {
                            return null;
                        }
                        
                        let newsTime = new Date();
                        if (article.publishedAt) {
                            try {
                                newsTime = new Date(article.publishedAt);
                                if (isNaN(newsTime.getTime())) {
                                    newsTime = new Date();
                                }
                            } catch (e) {
                                newsTime = new Date();
                            }
                        }

                        const sentiment = await this.analyzeSentiment(newsTitle + ' ' + newsText);

                        return {
                            title: newsTitle,
                            description: newsText,
                            url: article.url || '',
                            publishedAt: newsTime,
                            source: article.source?.name || 'NewsAPI',
                            sentiment: sentiment,
                            relevance: this.calculateRelevance({ title: newsTitle, description: newsText }, instrument.figi),
                            keywords: this.extractKeywords(newsTitle + ' ' + newsText),
                            category: 'general',
                            impact: this.calculateImpact({ title: newsTitle, description: newsText })
                        };
                    } catch (articleError) {
                        console.error(`❌ Ошибка обработки статьи:`, articleError.message);
                        return null;
                    }
                });

            const processedNews = (await Promise.all(processedNewsPromises))
                .filter(article => article !== null);

            if (processedNews.length > 0) {
                try {
                    await this.cacheNews(instrument.figi, processedNews);
                } catch (cacheError) {
                    console.error(`❌ Ошибка сохранения новостей в БД для ${ticker}:`, cacheError.message);
                }
            }

            return {
                success: true,
                ticker,
                figi: instrument.figi,
                companyName: instrument.name,
                searchQuery,
                newsCount: processedNews.length,
                news: processedNews.slice(0, 5)
            };

        } catch (error) {
            console.error(`❌ Ошибка загрузки новостей для ${ticker}:`, error);
            
            if (error.message && (error.message.includes('too far in the past') || error.message.includes('Минимальная доступная дата'))) {
                const friendlyMessage = `NewsAPI.org: Запрошенный период слишком далеко в прошлом. Используйте период не более 30 дней назад. ${error.message}`;
                throw new Error(friendlyMessage);
            }
            
            if (error.message && error.message.includes('Network error')) {
                throw new Error(`Ошибка подключения к NewsAPI.org: ${error.message}`);
            }
            
            if (error.message && error.message.includes('NEWS_API_KEY')) {
                throw new Error(`NewsAPI.org: API ключ не установлен. Проверьте переменную окружения NEWS_API_KEY.`);
            }
            
            if (error.message && error.message.includes('Failed to parse JSON')) {
                throw new Error(`NewsAPI.org: Некорректный ответ от сервера. ${error.message}`);
            }
            
            throw error;
        }
    }

    /**
     * Кеширование новостей в БД
     */
    async cacheNews(figi, news) {
        try {
            const CachedNewsModule = await import('../models/CachedNews.js');
            const CachedNews = CachedNewsModule.default;
            
            if (!news || news.length === 0) {
                return;
            }

            const validator = (await import('validator')).default;
            
            const sanitizeText = (text) => {
                if (!text || typeof text !== 'string') {
                    return '';
                }
                
                let cleaned = validator.stripLow(text, true);
                cleaned = cleaned.replace(/\s+/g, ' ');
                
                // Удаляем нулевые байты и другие проблемные символы
                cleaned = cleaned.replace(/\0/g, '');
                
                // НЕ используем validator.escape() - Sequelize уже экранирует данные при сохранении
                // escape() превращает нормальные символы в HTML-сущности (&#x2F; и т.д.)
                
                return cleaned.trim();
            };

            const BATCH_SIZE = 10;
            let savedCount = 0;
            let errorCount = 0;
            
            for (let i = 0; i < news.length; i += BATCH_SIZE) {
                const batch = news.slice(i, i + BATCH_SIZE);
                
                try {
                    const newsToCache = batch.map(article => {
                        let url = article.url || '';
                        // Если URL невалидный, просто очищаем его (не экранируем, это портит данные)
                        if (url && !validator.isURL(url, { require_protocol: false })) {
                            url = ''; // Оставляем пустым вместо порчи данных
                        }
                        
                        return {
                            figi,
                            title: sanitizeText(article.title || ''),
                            description: sanitizeText(article.description || ''),
                            url: url,
                            source: sanitizeText(article.source || 'unknown'),
                            publishedAt: article.publishedAt || new Date(),
                            sentiment: article.sentiment || 0,
                            relevance: article.relevance || 0.5,
                            impact: article.impact || 0,
                            keywords: Array.isArray(article.keywords) ? article.keywords : [],
                            category: sanitizeText(article.category || 'general'),
                            language: article.language || 'ru',
                            cachedAt: new Date(),
                            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
                        };
                    });

                    await CachedNews.bulkCreate(newsToCache, {
                        ignoreDuplicates: true
                    });

                    savedCount += newsToCache.length;
                } catch (batchError) {
                    errorCount += batch.length;
                    console.error(`❌ Ошибка сохранения батча новостей (${batch.length} шт.):`, batchError.message);
                    
                    for (const article of batch) {
                        try {
                            let url = article.url || '';
                            if (url && !validator.isURL(url, { require_protocol: false })) {
                                url = '';
                            }
                            
                            const newsData = {
                                figi,
                                title: sanitizeText(article.title || ''),
                                description: sanitizeText(article.description || ''),
                                url: url,
                                source: sanitizeText(article.source || 'unknown'),
                                publishedAt: article.publishedAt || new Date(),
                                sentiment: article.sentiment || 0,
                                relevance: article.relevance || 0.5,
                                impact: article.impact || 0,
                                keywords: Array.isArray(article.keywords) ? article.keywords : [],
                                category: sanitizeText(article.category || 'general'),
                                language: article.language || 'ru',
                                cachedAt: new Date(),
                                expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
                            };

                            const [cachedNewsItem, created] = await CachedNews.findOrCreate({
                                where: {
                                    figi: newsData.figi,
                                    url: newsData.url
                                },
                                defaults: newsData
                            });

                            if (!created) {
                                await cachedNewsItem.update({
                                    sentiment: newsData.sentiment,
                                    relevance: newsData.relevance,
                                    impact: newsData.impact,
                                    keywords: newsData.keywords,
                                    category: newsData.category,
                                    cachedAt: newsData.cachedAt,
                                    expiresAt: newsData.expiresAt
                                });
                            }

                            savedCount++;
                            errorCount--;
                        } catch (itemError) {
                            console.error(`❌ Ошибка сохранения отдельной новости:`, itemError.message);
                        }
                    }
                }
            }

        } catch (error) {
            console.error('❌ Ошибка кеширования новостей:', error);
            throw error;
        }
    }

    /**
     * Проверка самой старой новости в БД
     * @returns {Promise<Date|null>} - Дата самой старой новости или null
     */
    async getOldestNewsDate() {
        try {
            const CachedNewsModule = await import('../models/CachedNews.js');
            const CachedNews = CachedNewsModule.default;
            
            const oldestNews = await CachedNews.findOne({
                order: [['publishedAt', 'ASC']],
                attributes: ['publishedAt']
            });

            return oldestNews ? oldestNews.publishedAt : null;

        } catch (error) {
            console.error('❌ Ошибка получения самой старой новости:', error);
            return null;
        }
    }

    /**
     * Очистка устаревших новостей из кеша
     * Удаляет новости старше года (по publishedAt), если самая старая новость старше года
     */
    async cleanExpiredNews() {
        try {
            const CachedNewsModule = await import('../models/CachedNews.js');
            const CachedNews = CachedNewsModule.default;
            
            // Проверяем самую старую новость
            const oldestNewsDate = await this.getOldestNewsDate();
            
            if (!oldestNewsDate) {
                return {
                    deletedCount: 0,
                    cutoffDate: null,
                    oldestNewsDate: null,
                    needsCleanup: false
                };
            }

            const oneYearAgo = new Date();
            oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
            
            if (oldestNewsDate < oneYearAgo) {
                const deletedCount = await CachedNews.destroy({
                    where: {
                        publishedAt: {
                            [Op.lt]: oneYearAgo
                        }
                    }
                });

                return {
                    deletedCount,
                    cutoffDate: oneYearAgo.toISOString(),
                    oldestNewsDate: oldestNewsDate.toISOString(),
                    needsCleanup: true
                };
            } else {
                return {
                    deletedCount: 0,
                    cutoffDate: oneYearAgo.toISOString(),
                    oldestNewsDate: oldestNewsDate.toISOString(),
                    needsCleanup: false
                };
            }

        } catch (error) {
            console.error('❌ Ошибка очистки кеша новостей:', error);
            throw error;
        }
    }

    /**
     * Загрузка новостей за конкретный год для инструментов
     * @param {string[]} figis - Массив FIGI инструментов
     * @param {number} year - Год для загрузки
     */
    async fetchNewsForYear(figis, year) {
        try {
            if (!this.isInitialized) {
                throw new Error('NewsAnalysisService не инициализирован');
            }

            const newsByFigi = {};
            for (const figi of figis) {
                newsByFigi[figi] = [];
            }

            return newsByFigi;

        } catch (error) {
            console.error(`❌ Ошибка загрузки новостей за год:`, error);
            throw error;
        }
    }

    /**
     * Загрузка исторических новостей за год для всех акций
     * @param {object} options - Опции загрузки
     * @param {number} options.year - Год для загрузки (по умолчанию текущий год)
     * @param {function} options.onProgress - Callback для отслеживания прогресса
     */
    async loadHistoricalNewsForAllInstruments(options = {}) {
        try {
            const ServiceManager = (await import('./ServiceManager.js')).default;
            let CacheService = ServiceManager.getService('CacheService');
            if (!CacheService) {
                const CacheServiceModule = await import('./CacheService.js');
                CacheService = CacheServiceModule.default;
            }
            const { year = new Date().getFullYear(), onProgress } = options;
            
            if (!this.isInitialized) {
                throw new Error('NewsAnalysisService не инициализирован');
            }

            const instruments = await CacheService.getAllInstruments();
            const instrumentsToLoad = [];
            const startDate = new Date(year, 0, 1);
            const endDate = new Date(year, 11, 31, 23, 59, 59);
            
            for (const instrument of instruments) {
                const figi = instrument.figi || instrument;
                const lastNews = await this.getLastNewsDate(figi);
                
                if (!lastNews.hasHistory || (lastNews.date && lastNews.date < endDate)) {
                    instrumentsToLoad.push(figi);
                }
            }

            let successCount = 0;
            let errorCount = 0;
            const results = [];

            const batchSize = 10;
            const batches = [];
            for (let i = 0; i < instrumentsToLoad.length; i += batchSize) {
                batches.push(instrumentsToLoad.slice(i, i + batchSize));
            }

            for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
                const batch = batches[batchIndex];
                
                try {
                    const newsByFigi = await this.fetchNewsForYear(batch, year);
                    
                    for (const figi of batch) {
                        const news = newsByFigi[figi] || [];
                        
                        if (news.length > 0) {
                            await this.cacheNews(figi, news);
                            successCount++;
                            results.push({ figi, success: true, count: news.length });
                            
                            if (onProgress) {
                                onProgress({
                                    current: batchIndex * batchSize + batch.indexOf(figi) + 1,
                                    total: instrumentsToLoad.length,
                                    figi,
                                    success: true,
                                    count: news.length
                                });
                            }
                        } else {
                            results.push({ figi, success: true, count: 0 });
                            
                            if (onProgress) {
                                onProgress({
                                    current: batchIndex * batchSize + batch.indexOf(figi) + 1,
                                    total: instrumentsToLoad.length,
                                    figi,
                                    success: true,
                                    count: 0
                                });
                            }
                        }
                    }

                    if (batchIndex < batches.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }

                } catch (error) {
                    errorCount++;
                    console.error(`❌ Ошибка загрузки новостей для батча ${batchIndex + 1}:`, error.message);
                    
                    for (const figi of batch) {
                        results.push({ figi, success: false, error: error.message });
                        
                        if (onProgress) {
                            onProgress({
                                current: batchIndex * batchSize + batch.indexOf(figi) + 1,
                                total: instrumentsToLoad.length,
                                figi,
                                success: false,
                                error: error.message
                            });
                        }
                    }
                }
            }

            return {
                success: true,
                total: instrumentsToLoad.length,
                successCount,
                errorCount,
                results
            };

        } catch (error) {
            console.error('❌ Ошибка загрузки исторических новостей:', error);
            throw error;
        }
    }

    /**
     * Проверка актуальности новостей
     * Проверяет, есть ли свежие новости за последние сутки
     */
    async checkNewsFreshness(figi = null) {
        try {
            const CachedNewsModule = await import('../models/CachedNews.js');
            const CachedNews = CachedNewsModule.default;
            
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            yesterday.setHours(0, 0, 0, 0);
            
            const whereClause = figi ? { figi } : {};
            whereClause.publishedAt = {
                [Op.gte]: yesterday
            };

            const recentNews = await CachedNews.findAll({
                where: whereClause,
                order: [['publishedAt', 'DESC']],
                limit: 1
            });

            const hasFreshNews = recentNews.length > 0;
            const lastNewsDate = hasFreshNews ? recentNews[0].publishedAt : null;

            return {
                hasFreshNews,
                lastNewsDate,
                figi: figi || null
            };

        } catch (error) {
            console.error('❌ Ошибка проверки актуальности новостей:', error);
            return {
                hasFreshNews: false,
                lastNewsDate: null,
                figi: figi || null
            };
        }
    }

    /**
     * Проверка актуальности новостей для всех инструментов
     */
    async checkAllInstrumentsFreshness() {
        try {
            const ServiceManager = (await import('./ServiceManager.js')).default;
            let CacheService = ServiceManager.getService('CacheService');
            if (!CacheService) {
                const CacheServiceModule = await import('./CacheService.js');
                CacheService = CacheServiceModule.default;
            }

            const instruments = await CacheService.getAllInstruments();
            const freshnessResults = [];

            for (const instrument of instruments) {
                const figi = instrument.figi || instrument;
                const freshness = await this.checkNewsFreshness(figi);
                freshnessResults.push({
                    figi,
                    ...freshness
                });
            }

            return freshnessResults;

        } catch (error) {
            console.error('❌ Ошибка проверки актуальности новостей для всех инструментов:', error);
            return [];
        }
    }

    /**
     * Инициализация данных: загрузка новостей за месяц для FIGI без данных
     * Запрашивает по одному, при достижении лимита откладывает на сутки
     * @param {object} options - Опции инициализации
     * @param {function} options.onProgress - Callback для отслеживания прогресса
     * @param {number} options.maxRequestsPerDay - Максимальное количество запросов в день (по умолчанию 100)
     * @returns {Promise<object>} - Результат инициализации
     */
    async initializeNewsData(options = {}) {
        try {
            if (!this.isInitialized) {
                throw new Error('NewsAnalysisService не инициализирован');
            }

            const NewsApiService = (await import('./NewsApiService.js')).default;
            if (!NewsApiService.isInitialized) {
                await NewsApiService.initialize();
            }

            const { onProgress, maxRequestsPerDay = 100 } = options;

            // Получаем список FIGI без новостей за месяц
            const figisWithoutNews = await this.getFigisWithoutMonthNews();
            

            if (figisWithoutNews.length === 0) {
                return {
                    success: true,
                    message: 'Все инструменты имеют новости за месяц',
                    processed: 0,
                    deferred: 0,
                    total: 0
                };
            }

            // Получаем все инструменты для доступа к данным
            const ServiceManager = (await import('./ServiceManager.js')).default;
            let CacheService = ServiceManager.getService('CacheService');
            if (!CacheService) {
                const CacheServiceModule = await import('./CacheService.js');
                CacheService = CacheServiceModule.default;
            }

            const allInstruments = await CacheService.getAllInstruments();
            const instrumentMap = new Map();
            allInstruments.forEach(inst => {
                instrumentMap.set(inst.figi, inst);
            });

            // Период для запроса - последний месяц
            const to = new Date();
            const from = new Date();
            from.setMonth(from.getMonth() - 1);
            from.setHours(0, 0, 0, 0);
            to.setHours(23, 59, 59, 999);

            let processed = 0;
            let deferred = 0;
            let requestCount = 0;

            for (const item of figisWithoutNews) {
                try {
                    // Проверяем лимит запросов
                    if (requestCount >= maxRequestsPerDay) {
                        deferred = figisWithoutNews.length - processed;
                        break;
                    }

                    const instrument = instrumentMap.get(item.figi);
                    if (!instrument) {
                        continue;
                    }

                    // Запрашиваем новости за месяц (используем те же данные, что и в тестовом методе)
                    const news = await this.fetchNewsByCompanyNameAndPeriod(
                        instrument.name,
                        from,
                        to,
                        {
                            ticker: instrument.ticker,
                            sector: instrument.sector,
                            apiData: instrument.apiData,
                            aliases: instrument.apiData?.aliases || null,
                            includeFinancialTerms: true,
                            figi: item.figi
                        }
                    );

                    // Сохраняем в БД
                    if (news.length > 0) {
                        await this.cacheNews(item.figi, news);
                    }

                    requestCount++;
                    processed++;

                    if (onProgress) {
                        onProgress({
                            current: processed,
                            total: figisWithoutNews.length,
                            figi: item.figi,
                            ticker: item.ticker,
                            success: true,
                            count: news.length
                        });
                    }

                    // Небольшая задержка между запросами
                    await new Promise(resolve => setTimeout(resolve, 1000));

                } catch (error) {
                    console.error(`❌ Ошибка загрузки новостей для ${item.figi}:`, error.message);
                    
                    // Если это ошибка лимита API, останавливаемся
                    if (error.message && (error.message.includes('rate limit') || error.message.includes('limit'))) {
                        deferred = figisWithoutNews.length - processed;
                        break;
                    }

                    if (onProgress) {
                        onProgress({
                            current: processed,
                            total: figisWithoutNews.length,
                            figi: item.figi,
                            ticker: item.ticker,
                            success: false,
                            error: error.message
                        });
                    }
                }
            }

            return {
                success: true,
                processed,
                deferred,
                total: figisWithoutNews.length,
                requestCount
            };

        } catch (error) {
            console.error('❌ Ошибка инициализации данных новостей:', error);
            throw error;
        }
    }

    /**
     * Загрузка свежих новостей за последние сутки для всех инструментов через NewsAPI.org
     * Делает один большой запрос на все акции по name
     */
    async loadFreshNewsForAllInstruments(options = {}) {
        try {
            const ServiceManager = (await import('./ServiceManager.js')).default;
            let CacheService = ServiceManager.getService('CacheService');
            if (!CacheService) {
                const CacheServiceModule = await import('./CacheService.js');
                CacheService = CacheServiceModule.default;
            }

            const { onProgress, limit, startIndex = 0 } = options; // Добавляем поддержку limit и startIndex для ротации
            
            if (!this.isInitialized) {
                throw new Error('NewsAnalysisService не инициализирован');
            }

            const NewsApiService = (await import('./NewsApiService.js')).default;
            if (!NewsApiService.isInitialized) {
                await NewsApiService.initialize();
            }

            const LoggerService = (await import('./LoggerService.js')).default;
            
            // Получаем все акции в рублях
            const instruments = await CacheService.getAllInstruments();
            LoggerService.info(`Retrieved ${instruments.length} total instruments from CacheService`, {
                service: 'NewsAnalysisService',
                operation: 'loadFreshNewsForAllInstruments',
                totalInstruments: instruments.length
            });
            
            // Детальная статистика по фильтрам
            const withRUB = instruments.filter(inst => inst.currency === 'RUB' || inst.currency === 'rub');
            const withShareType = instruments.filter(inst => inst.instrumentType === 'share' || !inst.instrumentType);
            const withTicker = instruments.filter(inst => inst.ticker);
            const withName = instruments.filter(inst => inst.name);
            
            LoggerService.info('Instrument filtering statistics', {
                service: 'NewsAnalysisService',
                operation: 'loadFreshNewsForAllInstruments',
                statistics: {
                    total: instruments.length,
                    withRUB: withRUB.length,
                    withShareType: withShareType.length,
                    withTicker: withTicker.length,
                    withName: withName.length
                }
            });
            
            let shares = instruments.filter(inst => 
                (inst.currency === 'RUB' || inst.currency === 'rub') && 
                (inst.instrumentType === 'share' || !inst.instrumentType) &&
                inst.ticker && inst.name
            );
            
            const totalShares = shares.length;
            
            LoggerService.info(`Filtered to ${totalShares} shares matching all criteria`, {
                service: 'NewsAnalysisService',
                operation: 'loadFreshNewsForAllInstruments',
                totalShares,
                criteria: {
                    currency: 'RUB or rub',
                    instrumentType: 'share or null',
                    hasTicker: true,
                    hasName: true
                }
            });
            
            // Применяем ротацию: начинаем с startIndex
            if (startIndex > 0 && startIndex < shares.length) {
                shares = [...shares.slice(startIndex), ...shares.slice(0, startIndex)];
                LoggerService.info(`Applied rotation: startIndex=${startIndex}, shares after rotation=${shares.length}`, {
                    service: 'NewsAnalysisService',
                    operation: 'loadFreshNewsForAllInstruments',
                    startIndex,
                    sharesAfterRotation: shares.length
                });
            }
            
            // Ограничиваем количество инструментов, если указан limit
            if (limit && limit > 0) {
                shares = shares.slice(0, limit);
                LoggerService.info(`Loading fresh news for ${shares.length} instruments (rotation: startIndex=${startIndex}, total=${totalShares}, limited to ${limit} for API limit)`, {
                    service: 'NewsAnalysisService',
                    operation: 'loadFreshNewsForAllInstruments',
                    startIndex,
                    limit,
                    totalShares,
                    sharesToProcess: shares.length
                });
            } else {
                LoggerService.info(`Loading fresh news for ${shares.length} instruments (rotation: startIndex=${startIndex})`, {
                    service: 'NewsAnalysisService',
                    operation: 'loadFreshNewsForAllInstruments',
                    startIndex,
                    sharesToProcess: shares.length
                });
            }

            // Период - последние сутки
            const to = new Date();
            const from = new Date();
            from.setDate(from.getDate() - 1);
            from.setHours(0, 0, 0, 0);
            to.setHours(23, 59, 59, 999);

            let updated = 0;
            let totalNews = 0;

            // Загружаем новости для каждого инструмента
            for (let i = 0; i < shares.length; i++) {
                const instrument = shares[i];
                
                try {
                    LoggerService.info(`Loading news for ${instrument.ticker} (${instrument.name}) - ${i + 1}/${shares.length}`, {
                        service: 'NewsAnalysisService',
                        operation: 'loadFreshNewsForAllInstruments',
                        progress: {
                            current: i + 1,
                            total: shares.length
                        },
                        instrument: {
                            ticker: instrument.ticker,
                            name: instrument.name,
                            figi: instrument.figi
                        }
                    });

                    // Используем те же данные, что и в тестовом методе fetchNewsFromNewsApiByTicker
                    const news = await this.fetchNewsByCompanyNameAndPeriod(
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
                            pageSize: 100
                        }
                    );

                    if (news.length > 0) {
                        await this.cacheNews(instrument.figi, news);
                        totalNews += news.length;
                        updated++;
                        
                        LoggerService.info(`News loaded and cached for ${instrument.ticker}: ${news.length} articles`, {
                            service: 'NewsAnalysisService',
                            operation: 'loadFreshNewsForAllInstruments',
                            instrument: {
                                ticker: instrument.ticker,
                                figi: instrument.figi
                            },
                            newsCount: news.length
                        });
                    } else {
                        LoggerService.info(`No news found for ${instrument.ticker}`, {
                            service: 'NewsAnalysisService',
                            operation: 'loadFreshNewsForAllInstruments',
                            instrument: {
                                ticker: instrument.ticker,
                                figi: instrument.figi
                            }
                        });
                    }

                    if (onProgress) {
                        onProgress({
                            current: i + 1,
                            total: shares.length,
                            figi: instrument.figi,
                            ticker: instrument.ticker,
                            success: true,
                            count: news.length
                        });
                    }

                    // Задержка между запросами (1 секунда для бесплатного плана)
                    if (i < shares.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }

                } catch (error) {
                    LoggerService.error(`Error loading news for ${instrument.ticker}`, {
                        service: 'NewsAnalysisService',
                        operation: 'loadFreshNewsForAllInstruments',
                        instrument: {
                            ticker: instrument.ticker,
                            figi: instrument.figi
                        },
                        error: {
                            message: error.message,
                            stack: error.stack
                        }
                    });
                    
                    // Если это ошибка лимита, останавливаемся
                    if (error.message && (error.message.includes('rate limit') || error.message.includes('limit'))) {
                        break;
                    }

                    if (onProgress) {
                        onProgress({
                            current: i + 1,
                            total: shares.length,
                            figi: instrument.figi,
                            ticker: instrument.ticker,
                            success: false,
                            error: error.message
                        });
                    }
                }
            }

            const result = {
                success: true,
                message: `Загружено новостей для ${updated} из ${shares.length} инструментов`,
                updated,
                total: totalShares, // Возвращаем общее количество инструментов для ротации
                processed: shares.length, // Количество обработанных в этом запуске
                totalNews
            };
            
            LoggerService.info(`Fresh news loading completed: ${updated} instruments updated, ${totalNews} news articles loaded`, {
                service: 'NewsAnalysisService',
                operation: 'loadFreshNewsForAllInstruments',
                result
            });
            
            return result;

        } catch (error) {
            LoggerService.error('Error loading fresh news', {
                service: 'NewsAnalysisService',
                operation: 'loadFreshNewsForAllInstruments',
                error: {
                    message: error.message,
                    stack: error.stack,
                    name: error.name
                }
            });
            
            // Возвращаем безопасный результат вместо throw
            // Это предотвращает падение процесса при ошибках
            return {
                success: false,
                updated: 0,
                totalNews: 0,
                processed: 0,
                total: 0,
                error: error.message
            };
        }
    }

    /**
     * Извлечение ключевых слов из текста
     */
    extractKeywords(text) {
        const keywords = [];
        const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 4);
        const financialTerms = [
            'доходы', 'выручка', 'прибыль', 'убыток', 'дивиденды',
            'акции', 'рынок', 'торговля', 'цена', 'результаты',
            'квартал', 'год', 'отчетность', 'финансы', 'капитал'
        ];
        
        financialTerms.forEach(term => {
            if (text.toLowerCase().includes(term)) {
                keywords.push(term);
            }
        });
        
        return [...new Set(keywords)];
    }

    /**
     * Категоризация новости
     */
    categorizeNews(article) {
        const text = (article.title + ' ' + (article.description || '')).toLowerCase();
        
        if (text.includes('дивиденд') || text.includes('дивиденды')) {
            return 'dividends';
        }
        if (text.includes('отчет') || text.includes('результаты') || text.includes('квартал')) {
            return 'earnings';
        }
        if (text.includes('слияние') || text.includes('поглощение')) {
            return 'mergers';
        }
        if (text.includes('инвестиции') || text.includes('финансирование')) {
            return 'investments';
        }
        
        return 'general';
    }

    /**
     * Расчет влияния новости
     */
    calculateImpact(article) {
        const text = (article.title + ' ' + (article.description || '')).toLowerCase();
        let impact = 0.5; // Базовое влияние
        
        // Высокое влияние для важных событий
        const highImpactKeywords = [
            'дивиденды', 'отчет', 'результаты', 'прибыль', 'убыток',
            'слияние', 'поглощение', 'банкротство', 'IPO'
        ];
        
        highImpactKeywords.forEach(keyword => {
            if (text.includes(keyword)) {
                impact += 0.2;
            }
        });
        
        return Math.min(1, impact);
    }

    /**
     * Фаза 3, задача 3.4.1: Классификация важности событий
     * Определяет тип события и его приоритет
     * 
     * @param {Object} article - Новость
     * @returns {Object} Классификация события с типом и приоритетом
     */
    classifyEventImportance(article) {
        const text = (article.title + ' ' + (article.description || '')).toLowerCase();
        
        // Ключевые слова для разных типов событий
        const eventPatterns = {
            earnings: {
                keywords: [
                    'отчет', 'результаты', 'квартал', 'полугодие', 'год',
                    'выручка', 'прибыль', 'убыток', 'earnings', 'revenue',
                    'EBITDA', 'чистая прибыль', 'операционная прибыль'
                ],
                priority: 0.9, // Высокий приоритет
                category: 'earnings'
            },
            mergers: {
                keywords: [
                    'слияние', 'поглощение', 'merger', 'acquisition',
                    'покупка', 'продажа актива', 'сделка', 'транзакция',
                    'M&A', 'takeover', 'выкуп'
                ],
                priority: 0.85,
                category: 'mergers'
            },
            macro: {
                keywords: [
                    'ЦБ', 'центробанк', 'ключевая ставка', 'инфляция',
                    'ВВП', 'GDP', 'безработица', 'экономика', 'макро',
                    'санкции', 'эмбарго', 'торговые войны', 'валютный курс',
                    'нефть', 'газ', 'сырье', 'commodities'
                ],
                priority: 0.8,
                category: 'macro'
            },
            dividends: {
                keywords: [
                    'дивиденды', 'дивиденд', 'dividend', 'выплата',
                    'дивидендная политика', 'дивидендный календарь'
                ],
                priority: 0.75,
                category: 'dividends'
            },
            guidance: {
                keywords: [
                    'прогноз', 'forecast', 'outlook', 'ожидания',
                    'guidance', 'целевые показатели', 'планы'
                ],
                priority: 0.7,
                category: 'guidance'
            },
            regulatory: {
                keywords: [
                    'регулятор', 'лицензия', 'разрешение', 'запрет',
                    'надзор', 'комиссия', 'регулирование'
                ],
                priority: 0.65,
                category: 'regulatory'
            }
        };

        let maxPriority = 0.5; // Базовый приоритет
        let detectedCategory = 'general';
        let matchedPatterns = [];

        // Проверяем каждый тип события
        for (const [eventType, pattern] of Object.entries(eventPatterns)) {
            const matches = pattern.keywords.filter(keyword => text.includes(keyword));
            if (matches.length > 0) {
                matchedPatterns.push({
                    type: eventType,
                    category: pattern.category,
                    matches: matches.length,
                    priority: pattern.priority
                });
                
                // Используем максимальный приоритет из всех совпадений
                if (pattern.priority > maxPriority) {
                    maxPriority = pattern.priority;
                    detectedCategory = pattern.category;
                }
            }
        }

        // Увеличиваем приоритет при множественных совпадениях
        if (matchedPatterns.length > 1) {
            maxPriority = Math.min(1.0, maxPriority + 0.1);
        }

        return {
            category: detectedCategory,
            priority: maxPriority,
            matchedPatterns: matchedPatterns.map(p => ({
                type: p.type,
                category: p.category,
                matches: p.matches
            })),
            isHighPriority: maxPriority >= 0.8,
            isCritical: maxPriority >= 0.9
        };
    }

    /**
     * Фаза 3, задача 3.4.2: Временное затухание влияния новостей
     * Применяет экспоненциальное затухание к влиянию новости в зависимости от её возраста
     * 
     * @param {Object} article - Новость с полем publishedAt
     * @param {Date} referenceDate - Дата отсчета (по умолчанию текущая дата)
     * @param {number} halfLifeDays - Период полураспада в днях (по умолчанию 7 дней)
     * @returns {number} Коэффициент затухания от 0 до 1
     */
    calculateTimeDecay(article, referenceDate = new Date(), halfLifeDays = 7) {
        if (!article.publishedAt) {
            return 0; // Если нет даты публикации, влияние = 0
        }

        const publishedDate = new Date(article.publishedAt);
        const ageInDays = (referenceDate - publishedDate) / (1000 * 60 * 60 * 24);

        if (ageInDays < 0) {
            return 1; // Будущие новости (не должны быть, но на всякий случай)
        }

        if (ageInDays === 0) {
            return 1; // Свежие новости (сегодня)
        }

        // Экспоненциальное затухание: decay = e^(-λ * t)
        // где λ = ln(2) / halfLife (чтобы через halfLife дней значение было 0.5)
        const lambda = Math.log(2) / halfLifeDays;
        const decay = Math.exp(-lambda * ageInDays);

        return Math.max(0, Math.min(1, decay));
    }

    /**
     * Применяет временное затухание к массиву новостей
     * 
     * @param {Array} news - Массив новостей
     * @param {Date} referenceDate - Дата отсчета
     * @param {number} halfLifeDays - Период полураспада в днях
     * @returns {Array} Новости с добавленным полем timeDecayFactor
     */
    applyTimeDecayToNews(news, referenceDate = new Date(), halfLifeDays = 7) {
        return news.map(article => ({
            ...article,
            timeDecayFactor: this.calculateTimeDecay(article, referenceDate, halfLifeDays),
            adjustedSentiment: (article.sentiment || 0) * this.calculateTimeDecay(article, referenceDate, halfLifeDays),
            adjustedRelevance: (article.relevance || 0.5) * this.calculateTimeDecay(article, referenceDate, halfLifeDays)
        }));
    }

    /**
     * Фаза 3, задача 3.4.3: Связь новостей с рекомендациями
     * Анализирует историческое влияние новостей на цену и рассчитывает feature importance
     * 
     * @param {string} figi - FIGI инструмента
     * @param {number} days - Количество дней для анализа
     * @returns {Promise<Object>} Анализ влияния новостей с feature importance
     */
    async analyzeNewsFeatureImportance(figi, days = 30) {
        try {
            const news = await this.getCachedNews(figi, days, 100);
            
            if (!news || news.length === 0) {
                return {
                    featureImportance: {},
                    historicalImpact: {},
                    averageImpact: 0,
                    newsCount: 0
                };
            }

            // Применяем временное затухание
            const decayedNews = this.applyTimeDecayToNews(news);
            
            // Классифицируем события
            const classifiedNews = decayedNews.map(article => ({
                ...article,
                eventClassification: this.classifyEventImportance(article)
            }));

            // Рассчитываем feature importance для разных категорий
            const featureImportance = {};
            const categoryStats = {};

            classifiedNews.forEach(article => {
                const category = article.eventClassification.category;
                const priority = article.eventClassification.priority;
                const timeDecay = article.timeDecayFactor || 1;
                const sentiment = article.sentiment || 0;
                const relevance = article.relevance || 0.5;

                // Важность = приоритет * затухание * релевантность * |sentiment|
                const importance = priority * timeDecay * relevance * Math.abs(sentiment);

                if (!categoryStats[category]) {
                    categoryStats[category] = {
                        count: 0,
                        totalImportance: 0,
                        totalSentiment: 0,
                        totalRelevance: 0
                    };
                }

                categoryStats[category].count++;
                categoryStats[category].totalImportance += importance;
                categoryStats[category].totalSentiment += sentiment * timeDecay;
                categoryStats[category].totalRelevance += relevance * timeDecay;
            });

            // Нормализуем feature importance
            const totalImportance = Object.values(categoryStats).reduce(
                (sum, stats) => sum + stats.totalImportance, 0
            );

            for (const [category, stats] of Object.entries(categoryStats)) {
                const avgImportance = totalImportance > 0 
                    ? stats.totalImportance / totalImportance 
                    : 0;
                const avgSentiment = stats.count > 0 
                    ? stats.totalSentiment / stats.count 
                    : 0;
                const avgRelevance = stats.count > 0 
                    ? stats.totalRelevance / stats.count 
                    : 0;

                featureImportance[category] = {
                    importance: avgImportance,
                    count: stats.count,
                    averageSentiment: avgSentiment,
                    averageRelevance: avgRelevance,
                    weightedImpact: avgImportance * Math.abs(avgSentiment)
                };
            }

            // Рассчитываем общее историческое влияние
            const historicalImpact = {
                totalNews: classifiedNews.length,
                highPriorityNews: classifiedNews.filter(n => n.eventClassification.isHighPriority).length,
                criticalNews: classifiedNews.filter(n => n.eventClassification.isCritical).length,
                averageSentiment: classifiedNews.reduce((sum, n) => sum + (n.adjustedSentiment || 0), 0) / classifiedNews.length,
                averageRelevance: classifiedNews.reduce((sum, n) => sum + (n.adjustedRelevance || 0), 0) / classifiedNews.length,
                categories: Object.keys(categoryStats)
            };

            const averageImpact = totalImportance > 0 
                ? totalImportance / classifiedNews.length 
                : 0;

            return {
                featureImportance,
                historicalImpact,
                averageImpact,
                newsCount: classifiedNews.length,
                topCategories: Object.entries(featureImportance)
                    .sort((a, b) => b[1].importance - a[1].importance)
                    .slice(0, 5)
                    .map(([category, data]) => ({ category, ...data }))
            };
        } catch (error) {
            console.error('❌ Ошибка анализа feature importance новостей:', error);
            return {
                featureImportance: {},
                historicalImpact: {},
                averageImpact: 0,
                newsCount: 0,
                error: error.message
            };
        }
    }

    /**
     * Получение новостей с применением классификации и временного затухания
     * 
     * @param {string} figi - FIGI инструмента
     * @param {number} days - Количество дней
     * @param {number} limit - Лимит новостей
     * @param {Object} options - Дополнительные опции
     * @returns {Promise<Array>} Обработанные новости
     */
    async getEnhancedNews(figi, days = 7, limit = 20, options = {}) {
        try {
            const { applyTimeDecay = true, halfLifeDays = 7, prioritizeByImportance = true } = options;
            
            let news = await this.getCachedNews(figi, days, limit * 2); // Берем больше для фильтрации
            
            if (!news || news.length === 0) {
                return [];
            }

            // Применяем временное затухание
            if (applyTimeDecay) {
                news = this.applyTimeDecayToNews(news, new Date(), halfLifeDays);
            }

            // Классифицируем события
            news = news.map(article => ({
                ...article,
                eventClassification: this.classifyEventImportance(article)
            }));

            // Сортируем по важности (приоритет * затухание * релевантность)
            if (prioritizeByImportance) {
                news.sort((a, b) => {
                    const importanceA = (a.eventClassification.priority || 0.5) * 
                                      (a.timeDecayFactor || 1) * 
                                      (a.relevance || 0.5);
                    const importanceB = (b.eventClassification.priority || 0.5) * 
                                      (b.timeDecayFactor || 1) * 
                                      (b.relevance || 0.5);
                    return importanceB - importanceA;
                });
            }

            return news.slice(0, limit);
        } catch (error) {
            console.error('❌ Ошибка получения расширенных новостей:', error);
            return [];
        }
    }
}

export default new NewsAnalysisService();
