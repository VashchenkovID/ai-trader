import fetch from 'node-fetch';

/**
 * Сервис для анализа новостей
 * Получает новости из различных источников и анализирует их влияние на рынок
 */
class NewsAnalysisService {
    constructor() {
        this.isInitialized = false;
        this.newsApiKey = process.env.NEWS_API_KEY;
        // Минимальная дата, разрешенная планом NewsAPI (можно настроить через переменную окружения)
        // По умолчанию: 2025-10-05 (пример для бесплатного плана)
        this.minAllowedDate = process.env.NEWS_API_MIN_DATE 
            ? new Date(process.env.NEWS_API_MIN_DATE) 
            : new Date('2025-10-05');
        this.newsSources = [
            'reuters',
            'bloomberg',
            'financial-times',
            'wall-street-journal',
            'cnbc',
            'marketwatch'
        ];
        this.cache = new Map();
        this.cacheTimeout = 30 * 60 * 1000; // 30 минут
        this.requestCount = 0; // Счетчик запросов
        this.requestLimit = 100; // Лимит запросов в 24 часа (для разработческого аккаунта)
        this.lastResetTime = Date.now(); // Время последнего сброса счетчика
        this.rateLimitResetInterval = 24 * 60 * 60 * 1000; // 24 часа
    }

    async initialize() {
        try {
            if (!this.newsApiKey) {
                console.warn('⚠️ NEWS_API_KEY not set, news analysis disabled');
                return;
            }

            this.isInitialized = true;
            console.log('✅ NewsAnalysisService initialized');
        } catch (error) {
            console.error('❌ Error initializing NewsAnalysisService:', error);
        }
    }

    /**
     * Получение новостей для конкретного инструмента
     * @param {string} figi - FIGI инструмента
     * @param {object} options - Опции запроса
     * @param {number} options.limit - Максимальное количество новостей
     * @param {number} options.days - Количество дней назад для поиска
     * @param {string[]} options.sources - Источники новостей
     * @param {Date|string} options.maxDate - Максимальная дата новостей (для предотвращения утечки данных)
     */
    async fetchNews(figi, options = {}) {
        const {
            limit = 10,
            days = 7,
            sources = this.newsSources,
            maxDate = null // Если указан, фильтруем новости только до этой даты
        } = options;

        try {
            if (!this.isInitialized) {
                return [];
            }

            // Определяем дату "от" - используем maxDate если указан, иначе текущую дату
            const referenceDate = maxDate ? new Date(maxDate) : new Date();
            let fromDate = new Date(referenceDate);
            fromDate.setDate(fromDate.getDate() - days);

            // Ограничиваем дату минимальной разрешенной датой плана NewsAPI
            if (fromDate < this.minAllowedDate) {
                fromDate = new Date(this.minAllowedDate);
            }

            // Проверяем кеш (учитываем maxDate в ключе кеша)
            const cacheKey = `${figi}_${days}_${limit}_${maxDate ? new Date(maxDate).toISOString() : 'current'}`;
            if (this.cache.has(cacheKey)) {
                const cached = this.cache.get(cacheKey);
                // Увеличиваем время кеширования до 2 часов для уменьшения количества запросов
                const extendedCacheTimeout = 2 * 60 * 60 * 1000; // 2 часа
                const age = Date.now() - cached.timestamp;
                if (age < extendedCacheTimeout) {
                    const articleCount = cached.data ? cached.data.length : 0;
                    const ageMinutes = Math.round(age / (60 * 1000));
                    console.log(`📦 Using cached news for ${figi} (${articleCount} articles, age: ${ageMinutes}m)`);
                    return cached.data;
                } else {
                    const ageHours = (age / (60 * 60 * 1000)).toFixed(2);
                    console.log(`⏰ Cached news for ${figi} expired (age: ${ageHours}h), fetching fresh data`);
                }
            }

            // Проверяем лимит запросов
            const timeSinceReset = Date.now() - this.lastResetTime;
            if (timeSinceReset >= this.rateLimitResetInterval) {
                // Сбрасываем счетчик каждые 24 часа
                this.requestCount = 0;
                this.lastResetTime = Date.now();
                console.log('🔄 NewsAPI request counter reset');
            }

            if (this.requestCount >= this.requestLimit) {
                const hoursUntilReset = Math.ceil((this.rateLimitResetInterval - timeSinceReset) / (60 * 60 * 1000));
                
                // Пытаемся вернуть устаревшие данные из кеша, если они есть
                if (this.cache.has(cacheKey)) {
                    const cached = this.cache.get(cacheKey);
                    const age = Date.now() - cached.timestamp;
                    const ageHours = (age / (60 * 60 * 1000)).toFixed(2);
                    const articleCount = cached.data ? cached.data.length : 0;
                    console.warn(`⚠️ Returning stale cached news for ${figi} due to rate limit (${articleCount} articles, age: ${ageHours}h)`);
                    return cached.data;
                }
                
                // Проверяем, есть ли вообще что-то в кеше
                if (this.cache.size > 0) {
                    console.warn(`⚠️ Cache has ${this.cache.size} entries, but none match key "${cacheKey}". Available keys: ${Array.from(this.cache.keys()).slice(0, 3).join(', ')}...`);
                }
                
                return [];
            }

            // Получаем новости из NewsAPI
            const url = `https://newsapi.org/v2/everything?` +
                `q=${encodeURIComponent(figi)}&` +
                `sources=${sources.join(',')}&` +
                `from=${fromDate.toISOString().split('T')[0]}&` +
                `sortBy=publishedAt&` +
                `pageSize=${limit}&` +
                `apiKey=${this.newsApiKey}`;

            console.log(`📡 NewsAPI request #${this.requestCount + 1}/${this.requestLimit} for ${figi}`);

            const response = await fetch(url);
            const data = await response.json();

            if (data.status === 'ok') {
                // Увеличиваем счетчик запросов только при успешном запросе
                this.requestCount++;
                let news = data.articles.map(article => ({
                    title: article.title,
                    description: article.description,
                    url: article.url,
                    publishedAt: new Date(article.publishedAt),
                    source: article.source.name,
                    relevance: this.calculateRelevance(article, figi),
                    sentiment: this.analyzeSentiment(article.title + ' ' + article.description)
                }));

                // Фильтруем новости по maxDate если указан (защита от утечки данных)
                if (maxDate) {
                    const maxDateObj = new Date(maxDate);
                    news = news.filter(article => article.publishedAt <= maxDateObj);
                }

                // Кешируем результат (увеличиваем время кеширования до 2 часов)
                this.cache.set(cacheKey, {
                    data: news,
                    timestamp: Date.now()
                });

                console.log(`💾 Cached ${news.length} news articles for ${figi} (valid for 2 hours)`);

                return news;
            } else {
                console.error('❌ NewsAPI error:', data.message);
                
                // Обработка различных типов ошибок
                if (data.message && data.message.includes('too far in the past')) {
                    console.error(`⚠️ NewsAPI date limit error. Minimum allowed date: ${this.minAllowedDate.toISOString().split('T')[0]}, requested from: ${fromDate.toISOString().split('T')[0]}`);
                } else if (data.message && data.message.includes('too many requests')) {
                    // Превышен лимит запросов - используем кеш
                    console.error(`⚠️ NewsAPI rate limit exceeded. Request count: ${this.requestCount}/${this.requestLimit}`);
                    this.requestCount = this.requestLimit; // Устанавливаем на лимит, чтобы не делать больше запросов
                    
                    // Пытаемся вернуть устаревшие данные из кеша
                    if (this.cache.has(cacheKey)) {
                        const cached = this.cache.get(cacheKey);
                        console.warn(`⚠️ Returning stale cached news for ${figi} due to rate limit`);
                        return cached.data;
                    }
                }
                
                return [];
            }

        } catch (error) {
            console.error('❌ Error fetching news:', error);
            return [];
        }
    }

    /**
     * Расчет релевантности новости для инструмента
     */
    calculateRelevance(article, figi) {
        const text = (article.title + ' ' + article.description).toLowerCase();
        const figiLower = figi.toLowerCase();
        
        // Простая эвристика релевантности
        let relevance = 0;
        
        if (text.includes(figiLower)) {
            relevance += 0.5;
        }
        
        // Ключевые слова для финансовых новостей (русские)
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
     * Анализ настроений новости
     */
    analyzeSentiment(text) {
        const positiveWords = [
            'good', 'great', 'excellent', 'positive', 'growth', 'profit',
            'increase', 'rise', 'gain', 'success', 'strong', 'up'
        ];
        
        const negativeWords = [
            'bad', 'terrible', 'negative', 'loss', 'decline', 'decrease',
            'fall', 'drop', 'weak', 'failure', 'down', 'crash'
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
            
            for (const position of portfolio) {
                const news = await this.fetchNews(position.symbol, options);
                allNews.push(...news);
            }
            
            // Сортируем по релевантности и времени
            return allNews
                .sort((a, b) => b.relevance - a.relevance)
                .slice(0, options.limit || 20);
                
        } catch (error) {
            console.error('❌ Error getting portfolio news:', error);
            return [];
        }
    }

    /**
     * Анализ влияния новостей на цены
     */
    async analyzeNewsImpact(figi, days = 30) {
        try {
            const news = await this.fetchNews(figi, { days, limit: 50 });
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
     * Получение статуса сервиса
     */
    getStatus() {
        const timeSinceReset = Date.now() - this.lastResetTime;
        const hoursUntilReset = Math.ceil((this.rateLimitResetInterval - timeSinceReset) / (60 * 60 * 1000));
        
        return {
            isInitialized: this.isInitialized,
            hasApiKey: !!this.newsApiKey,
            cacheSize: this.cache.size,
            sources: this.newsSources,
            requestCount: this.requestCount,
            requestLimit: this.requestLimit,
            requestsRemaining: Math.max(0, this.requestLimit - this.requestCount),
            hoursUntilReset: hoursUntilReset > 24 ? 0 : hoursUntilReset,
            rateLimitExceeded: this.requestCount >= this.requestLimit
        };
    }

    // ============================================================================
    // КЕШИРОВАНИЕ В БАЗЕ ДАННЫХ
    // ============================================================================

    /**
     * Получение кешированных новостей из БД
     */
    async getCachedNews(figi, days, limit) {
        try {
            const CachedNews = (await import('../models/CachedNews.js')).default;
            
            const fromDate = new Date();
            fromDate.setDate(fromDate.getDate() - days);
            
            const cachedNews = await CachedNews.findAll({
                where: {
                    figi,
                    publishedAt: {
                        [require('sequelize').Op.gte]: fromDate
                    },
                    expiresAt: {
                        [require('sequelize').Op.gt]: new Date()
                    }
                },
                order: [['publishedAt', 'DESC']],
                limit
            });

            return cachedNews.map(news => ({
                title: news.title,
                description: news.description,
                url: news.url,
                source: news.source,
                publishedAt: news.publishedAt,
                sentiment: news.sentiment,
                relevance: news.relevance,
                impact: news.impact,
                keywords: news.keywords || [],
                category: news.category
            }));

        } catch (error) {
            console.error('❌ Ошибка получения кешированных новостей:', error);
            return [];
        }
    }

    /**
     * Кеширование новостей в БД
     */
    async cacheNews(figi, news) {
        try {
            const CachedNews = (await import('../models/CachedNews.js')).default;
            
            const newsToCache = news.map(article => ({
                figi,
                title: article.title,
                description: article.description,
                url: article.url,
                source: article.source,
                publishedAt: article.publishedAt,
                sentiment: article.sentiment,
                relevance: article.relevance,
                impact: article.impact,
                keywords: article.keywords || [],
                category: article.category,
                language: 'ru',
                cachedAt: new Date(),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 часа
            }));

            // Используем bulkCreate с ignoreDuplicates для избежания дубликатов
            await CachedNews.bulkCreate(newsToCache, {
                ignoreDuplicates: true,
                updateOnDuplicate: ['sentiment', 'relevance', 'impact', 'keywords', 'category', 'cachedAt', 'expiresAt']
            });

            console.log(`💾 Кешировано ${newsToCache.length} новостей для ${figi}`);

        } catch (error) {
            console.error('❌ Ошибка кеширования новостей:', error);
        }
    }

    /**
     * Очистка устаревших новостей из кеша
     */
    async cleanExpiredNews() {
        try {
            const CachedNews = (await import('../models/CachedNews.js')).default;
            
            const deletedCount = await CachedNews.destroy({
                where: {
                    expiresAt: {
                        [require('sequelize').Op.lt]: new Date()
                    }
                }
            });

            console.log(`🧹 Очищено ${deletedCount} устаревших новостей из кеша`);

        } catch (error) {
            console.error('❌ Ошибка очистки кеша новостей:', error);
        }
    }

    /**
     * Извлечение ключевых слов из текста
     */
    extractKeywords(text) {
        const words = text.toLowerCase()
            .replace(/[^\u0400-\u04FF\s]/g, '') // Только кириллица и пробелы
            .split(/\s+/)
            .filter(word => word.length > 3);
        
        const wordCount = {};
        words.forEach(word => {
            wordCount[word] = (wordCount[word] || 0) + 1;
        });
        
        return Object.entries(wordCount)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10)
            .map(([word]) => word);
    }

    /**
     * Категоризация новостей
     */
    categorizeNews(article) {
        const text = (article.title + ' ' + article.description).toLowerCase();
        
        if (text.includes('дивиденд') || text.includes('выплат')) return 'dividends';
        if (text.includes('результат') || text.includes('отчет')) return 'earnings';
        if (text.includes('слияние') || text.includes('поглощение')) return 'merger';
        if (text.includes('партнерство') || text.includes('соглашение')) return 'partnership';
        if (text.includes('инвестиц') || text.includes('капитал')) return 'investment';
        
        return 'general';
    }

    /**
     * Расчет влияния новости
     */
    calculateImpact(article) {
        const text = (article.title + ' ' + article.description).toLowerCase();
        let impact = 0.5; // Базовое влияние
        
        // Ключевые слова высокой важности
        const highImpactWords = ['кризис', 'рост', 'падение', 'результат', 'дивиденд', 'слияние'];
        highImpactWords.forEach(word => {
            if (text.includes(word)) impact += 0.1;
        });
        
        // Источники высокой важности
        const highImpactSources = ['РБК', 'Коммерсант', 'Ведомости', 'Интерфакс'];
        if (highImpactSources.some(source => article.source?.name?.includes(source))) {
            impact += 0.2;
        }
        
        return Math.min(1, impact);
    }
}

export default new NewsAnalysisService();
