import fetch from 'node-fetch';

/**
 * Сервис для анализа новостей
 * Получает новости из различных источников и анализирует их влияние на рынок
 */
class NewsAnalysisService {
    constructor() {
        this.isInitialized = false;
        this.newsApiKey = process.env.NEWS_API_KEY;
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
     */
    async fetchNews(figi, options = {}) {
        const {
            limit = 10,
            days = 7,
            sources = this.newsSources
        } = options;

        try {
            if (!this.isInitialized) {
                return [];
            }

            // Проверяем кеш
            const cacheKey = `${figi}_${days}_${limit}`;
            if (this.cache.has(cacheKey)) {
                const cached = this.cache.get(cacheKey);
                if (Date.now() - cached.timestamp < this.cacheTimeout) {
                    return cached.data;
                }
            }

            // Получаем новости из NewsAPI
            const fromDate = new Date();
            fromDate.setDate(fromDate.getDate() - days);
            
            const url = `https://newsapi.org/v2/everything?` +
                `q=${encodeURIComponent(figi)}&` +
                `sources=${sources.join(',')}&` +
                `from=${fromDate.toISOString().split('T')[0]}&` +
                `sortBy=publishedAt&` +
                `pageSize=${limit}&` +
                `apiKey=${this.newsApiKey}`;

            const response = await fetch(url);
            const data = await response.json();

            if (data.status === 'ok') {
                const news = data.articles.map(article => ({
                    title: article.title,
                    description: article.description,
                    url: article.url,
                    publishedAt: new Date(article.publishedAt),
                    source: article.source.name,
                    relevance: this.calculateRelevance(article, figi),
                    sentiment: this.analyzeSentiment(article.title + ' ' + article.description)
                }));

                // Кешируем результат
                this.cache.set(cacheKey, {
                    data: news,
                    timestamp: Date.now()
                });

                return news;
            } else {
                console.error('❌ NewsAPI error:', data.message);
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
        return {
            isInitialized: this.isInitialized,
            hasApiKey: !!this.newsApiKey,
            cacheSize: this.cache.size,
            sources: this.newsSources
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
