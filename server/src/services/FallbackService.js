import MonitoringService from './MonitoringService.js';
import CacheService from './CacheService.js';
import RetryService from './RetryService.js';
import LoggerService from './LoggerService.js';

/**
 * Сервис для управления fallback стратегиями
 * Обеспечивает graceful degradation при недоступности внешних API
 */
class FallbackService {
    constructor() {
        this.isInitialized = false;
        
        // Конфигурация fallback стратегий
        this.strategies = {
            TinkoffAPI: {
                enabled: true,
                useCache: true,
                maxCacheAge: 24 * 60 * 60 * 1000, // 24 часа
                notifyUser: true
            },
            NewsAPI: {
                enabled: true,
                useCache: true,
                maxCacheAge: 7 * 24 * 60 * 60 * 1000, // 7 дней
                notifyUser: true
            }
        };
        
        // Статистика использования fallback
        this.stats = {
            TinkoffAPI: { total: 0, cacheHits: 0, failures: 0 },
            NewsAPI: { total: 0, cacheHits: 0, failures: 0 }
        };
    }
    
    /**
     * Инициализация сервиса
     */
    async initialize() {
        try {
            this.isInitialized = true;
        } catch (error) {
            LoggerService.error('Ошибка инициализации FallbackService', {
                service: 'FallbackService',
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
            throw error;
        }
    }
    
    /**
     * Выполнение запроса с fallback на кеш
     * @param {Function} apiCall - Функция для выполнения API запроса
     * @param {Function} cacheCall - Функция для получения данных из кеша
     * @param {Object} options - Опции fallback
     * @returns {Promise<any>} - Результат запроса или кеша
     */
    async executeWithFallback(apiCall, cacheCall, options = {}) {
        const {
            serviceName = 'unknown',
            maxCacheAge = 24 * 60 * 60 * 1000,
            notifyUser = true,
            retryFirst = true
        } = options;
        
        // Обновляем статистику
        if (!this.stats[serviceName]) {
            this.stats[serviceName] = { total: 0, cacheHits: 0, failures: 0 };
        }
        this.stats[serviceName].total++;
        
        try {
            // Сначала пытаемся выполнить API запрос (с retry если включено)
            if (retryFirst) {
                // Используем RetryService для автоматических повторов
                return await RetryService.executeWithRetry(apiCall, {
                    maxRetries: 3,
                    initialDelay: 1000,
                    maxDelay: 10000,
                    serviceName: serviceName,
                    circuitBreaker: true
                });
            } else {
                return await apiCall();
            }
        } catch (error) {
            // API запрос не удался - используем fallback
            LoggerService.warn(`${serviceName} API недоступен, используем fallback на кеш`, {
                service: 'FallbackService',
                serviceName,
                error: {
                    message: error.message
                }
            });
            this.stats[serviceName].failures++;
            
            // Проверяем, открыт ли circuit breaker
            const circuitState = RetryService.getCircuitBreakerState(serviceName);
            if (circuitState.state === 'open') {
                LoggerService.warn(`Circuit breaker открыт для ${serviceName}, принудительно используем кеш`, {
                    service: 'FallbackService',
                    serviceName,
                    circuitState: 'open'
                });
            }
            
            try {
                // Пытаемся получить данные из кеша
                const cachedData = await cacheCall();
                
                if (cachedData) {
                    // Проверяем возраст кеша
                    const cacheAge = this.getCacheAge(cachedData);
                    
                    if (cacheAge <= maxCacheAge) {
                        this.stats[serviceName].cacheHits++;
                        
                        // Создаем алерт о использовании кеша
                        if (notifyUser) {
                            MonitoringService.createAlert(
                                'external_api',
                                'medium',
                                `Используются кешированные данные для ${serviceName}. API недоступен.`,
                                {
                                    service: serviceName,
                                    cacheAge: cacheAge,
                                    error: error.message
                                }
                            );
                        }
                        
                        return {
                            ...cachedData,
                            _fromCache: true,
                            _cacheAge: cacheAge,
                            _originalError: error.message
                        };
                    } else {
                        LoggerService.warn(`Кеш для ${serviceName} устарел`, {
                            service: 'FallbackService',
                            serviceName,
                            cacheAgeHours: Math.round(cacheAge / 1000 / 60 / 60),
                            maxCacheAgeHours: Math.round(maxCacheAge / 1000 / 60 / 60)
                        });
                        throw new Error(`Cache expired: ${cacheAge}ms > ${maxCacheAge}ms`);
                    }
                } else {
                    throw new Error('No cached data available');
                }
            } catch (cacheError) {
                // Кеш тоже не помог
                LoggerService.error(`Fallback на кеш не удался для ${serviceName}`, {
                    service: 'FallbackService',
                    serviceName,
                    error: {
                        message: cacheError.message,
                        stack: cacheError.stack
                    }
                });
                
                // Создаем критический алерт
                const alert = MonitoringService.createAlert(
                    'external_api',
                    'high',
                    `Критическая ошибка: ${serviceName} недоступен и кеш пуст.`,
                    {
                        service: serviceName,
                        apiError: error.message,
                        cacheError: cacheError.message
                    }
                );
                
                // При ошибке MONITORING_EXTERNAL_API блокируем запросы на 5 минут
                // Увеличиваем timeout circuit breaker до 5 минут (300000 мс)
                RetryService.setCircuitBreakerTimeout(serviceName, 5 * 60 * 1000);
                
                LoggerService.warn(`Circuit breaker для ${serviceName} заблокирован на 5 минут из-за критической ошибки (API недоступен и кеш пуст)`, {
                    service: 'FallbackService',
                    serviceName,
                    timeout: '5 minutes'
                });
                
                // Возвращаем упрощенные данные или выбрасываем ошибку
                return this.getSimplifiedData(serviceName, error);
            }
        }
    }
    
    /**
     * Получение возраста кеша из данных
     */
    getCacheAge(data) {
        if (data.lastUpdated) {
            return Date.now() - new Date(data.lastUpdated).getTime();
        }
        if (data.updatedAt) {
            return Date.now() - new Date(data.updatedAt).getTime();
        }
        if (data.timestamp) {
            return Date.now() - new Date(data.timestamp).getTime();
        }
        // Если нет информации о времени, считаем кеш старым
        return Infinity;
    }
    
    /**
     * Получение упрощенных данных при полном отказе
     */
    getSimplifiedData(serviceName, error) {
        // Возвращаем минимальные данные для продолжения работы
        if (serviceName === 'TinkoffAPI') {
            return {
                _fromCache: false,
                _simplified: true,
                _error: error.message,
                data: [],
                message: 'API недоступен, данные отсутствуют'
            };
        }
        
        if (serviceName === 'NewsAPI' || serviceName === 'newsapi') {
            return {
                _fromCache: false,
                _simplified: true,
                _error: error.message,
                articles: [],
                totalResults: 0,
                message: 'API недоступен, новости отсутствуют'
            };
        }
        
        // Общий fallback
        return {
            _fromCache: false,
            _simplified: true,
            _error: error.message,
            data: null,
            message: 'Service unavailable'
        };
    }
    
    /**
     * Получение инструментов с fallback на кеш (deprecated - используйте напрямую в сервисах)
     * Оставлено для обратной совместимости
     */
    async getInstrumentsWithFallback(figi = null) {
        const CachedInstrument = (await import('../models/CachedInstrument.js')).default;
        
        // Прямой доступ к кешу без API вызова (избегаем циклической зависимости)
        if (figi) {
            const cached = await CachedInstrument.findOne({ where: { figi } });
            return cached ? { instruments: [cached] } : null;
        } else {
            const cached = await CachedInstrument.findAll({ limit: 1000 });
            return cached ? { instruments: cached } : null;
        }
    }
    
    /**
     * Получение свечей с fallback на кеш
     */
    async getCandlesWithFallback(figi, interval, from, to) {
        const TinkoffApiService = (await import('./TinkoffApiService.js')).default;
        
        return await this.executeWithFallback(
            // API запрос - используем прямой вызов makeRequest для избежания циклической зависимости
            async () => {
                const fromDate = new Date(from);
                const toDate = new Date(to);
                
                if (fromDate >= toDate) {
                    fromDate.setDate(toDate.getDate() - 31);
                }
                
                const response = await TinkoffApiService.makeRequest('/tinkoff.public.invest.api.contract.v1.MarketDataService/GetCandles', {
                    figi: figi,
                    from: fromDate.toISOString(),
                    to: toDate.toISOString(),
                    interval: `CANDLE_INTERVAL_${interval}`
                });
                return response;
            },
            // Кеш запрос
            async () => {
                const cached = await CacheService.getCandles(figi, interval, null, from, to);
                return cached && cached.length > 0 ? { candles: cached } : null;
            },
            {
                serviceName: 'TinkoffAPI',
                maxCacheAge: 6 * 60 * 60 * 1000, // 6 часов для свечей
                notifyUser: this.strategies.TinkoffAPI.notifyUser
            }
        );
    }
    
    /**
     * Получение новостей с fallback на кеш
     */
    async getNewsWithFallback(query, options = {}) {
        const NewsApiService = (await import('./NewsApiService.js')).default;
        const CachedNews = (await import('../models/CachedNews.js')).default;
        
        return await this.executeWithFallback(
            // API запрос - используем прямой вызов makeRequest для избежания циклической зависимости
            async () => {
                const params = {
                    q: query,
                    language: options.language || 'ru',
                    sortBy: options.sortBy || 'relevancy',
                    pageSize: Math.min(options.pageSize || 50, 100),
                    page: options.page || 1
                };
                
                if (options.from) {
                    params.from = new Date(options.from).toISOString().split('T')[0];
                }
                if (options.to) {
                    params.to = new Date(options.to).toISOString().split('T')[0];
                }
                
                return await NewsApiService.makeRequest('/everything', params);
            },
            // Кеш запрос
            async () => {
                const { Op } = await import('sequelize');
                const cached = await CachedNews.findAll({
                    where: {
                        figi: options.figi || null,
                        publishedAt: {
                            [Op.gte]: options.from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                        }
                    },
                    limit: options.pageSize || 100,
                    order: [['publishedAt', 'DESC']]
                });
                
                if (cached && cached.length > 0) {
                    return {
                        articles: cached.map(item => ({
                            title: item.title,
                            description: item.description,
                            url: item.url,
                            publishedAt: item.publishedAt,
                            source: { name: item.source }
                        })),
                        totalResults: cached.length
                    };
                }
                return null;
            },
            {
                serviceName: 'NewsAPI',
                maxCacheAge: this.strategies.NewsAPI.maxCacheAge,
                notifyUser: this.strategies.NewsAPI.notifyUser
            }
        );
    }
    
    /**
     * Получение статистики fallback
     */
    getStats(serviceName = null) {
        if (serviceName) {
            return this.stats[serviceName] || { total: 0, cacheHits: 0, failures: 0 };
        }
        return this.stats;
    }
    
    /**
     * Получение конфигурации fallback стратегий
     */
    getStrategies() {
        return this.strategies;
    }
    
    /**
     * Обновление конфигурации fallback стратегий
     */
    updateStrategy(serviceName, config) {
        if (this.strategies[serviceName]) {
            this.strategies[serviceName] = { ...this.strategies[serviceName], ...config };
        }
    }
    
    /**
     * Сброс статистики
     */
    resetStats(serviceName = null) {
        if (serviceName) {
            this.stats[serviceName] = { total: 0, cacheHits: 0, failures: 0 };
        } else {
            Object.keys(this.stats).forEach(key => {
                this.stats[key] = { total: 0, cacheHits: 0, failures: 0 };
            });
        }
    }
}

export default new FallbackService();

