import fetch from 'node-fetch';
import FallbackService from './FallbackService.js';
import SectorClassifier from '../utils/sectorClassifier.js';

/**
 * Сервис для работы с NewsAPI.org
 * Получение новостей через поиск по ключевым словам
 */
class NewsApiService {
    constructor() {
        this.baseUrl = 'https://newsapi.org/v2';
        this.apiKey = process.env.NEWS_API_KEY;
        this.requestDelay = 1000; // 1 секунда между запросами (бесплатный план: 100 запросов/день)
        this.lastRequestTime = 0;
        this.isInitialized = false;
        this.maxQueryLength = 500;
        this.maxQueryParts = 18;
        this.defaultFinancialTerms = [
            'акции', 'биржа', 'котировки', 'дивиденды', 'отчетность',
            'stock', 'shares', 'dividend', 'earnings'
        ];
        this.defaultPoliticalTerms = [
            'санкции', 'геополитика', 'центробанк', 'ключевая ставка', 'инфляция',
            'правительство', 'регулятор', 'политика', 'elections', 'sanctions'
        ];
    }

    _sanitizeQueryPart(value, wrapInQuotes = false) {
        if (value === null || value === undefined) return null;
        const text = String(value)
            .replace(/[()]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (!text || text === '[object Object]') return null;
        return wrapInQuotes ? `"${text}"` : text;
    }

    _normalizeCompanyName(companyName) {
        if (!companyName) return '';
        return String(companyName)
            // \b плохо работает с кириллицей, поэтому используем явные границы по пробелам/началу/концу.
            .replace(/(^|\s)(ПАО|ОАО|ООО|АО|ЗАО|НПО|ГК|Холдинг)(?=\s|$)/gi, ' ')
            .replace(/[«»"]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    _uniqueParts(parts = []) {
        const seen = new Set();
        const result = [];
        for (const rawPart of parts) {
            const part = this._sanitizeQueryPart(rawPart);
            if (!part) continue;
            const normalized = part.toLowerCase();
            if (seen.has(normalized)) continue;
            seen.add(normalized);
            result.push(part);
            if (result.length >= this.maxQueryParts) break;
        }
        return result;
    }

    _buildOrQuery(parts = []) {
        const uniqueParts = this._uniqueParts(parts);
        if (uniqueParts.length === 0) return '';

        let query = uniqueParts.join(' OR ');
        if (query.length <= this.maxQueryLength) return query;

        // Ограничиваем длину запроса, удаляя наименее приоритетные части с конца.
        while (query.length > this.maxQueryLength && uniqueParts.length > 1) {
            uniqueParts.pop();
            query = uniqueParts.join(' OR ');
        }

        return query.slice(0, this.maxQueryLength);
    }

    async initialize() {
        try {
            if (!this.apiKey) {
                throw new Error('NEWS_API_KEY не установлен в переменных окружения');
            }
            this.isInitialized = true;
        } catch (error) {
            console.error('❌ Error initializing NewsApiService:', error);
            throw error;
        }
    }

    /**
     * Выполнение запроса к NewsAPI.org
     * @param {string} endpoint - Эндпоинт API (например, '/everything')
     * @param {object} params - Параметры запроса
     * @returns {Promise<object>} - Ответ от API
     */
    async makeRequest(endpoint, params = {}) {
        // Импортируем RetryService динамически
        const RetryService = (await import('./RetryService.js')).default;
        
        if (!this.isInitialized) {
            await this.initialize();
        }

        // Используем RetryService для автоматических повторов
        return await RetryService.executeWithRetry(async () => {
            // Добавляем задержку между запросами (rate limiting)
            const timeSinceLastRequest = Date.now() - this.lastRequestTime;
            if (timeSinceLastRequest < this.requestDelay) {
                const waitTime = this.requestDelay - timeSinceLastRequest;
                await RetryService.delay(waitTime);
            }

            // Добавляем API ключ к параметрам
            const requestParams = {
                ...params,
                apiKey: this.apiKey
            };

            const queryString = new URLSearchParams(requestParams).toString();
            const url = `${this.baseUrl}${endpoint}?${queryString}`;
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            this.lastRequestTime = Date.now();

            if (!response.ok) {
                let errorText = '';
                try {
                    errorText = await response.text();
                } catch (e) {
                    errorText = `Failed to read error response: ${e.message}`;
                }
                
                // Пробуем распарсить JSON ошибки, если это возможно
                let errorData = null;
                try {
                    errorData = JSON.parse(errorText);
                } catch (e) {
                    // Не JSON, используем как текст
                }
                
                const errorMessage = errorData?.message || errorText || `HTTP ${response.status}`;
                const errorCode = errorData?.code || 'http_error';
                
                const error = new Error(`HTTP error! status: ${response.status}, code: ${errorCode}, details: ${errorMessage}`);
                error.status = response.status;
                error.statusCode = response.status;
                error.response = { status: response.status, statusText: response.statusText };
                throw error;
            }

            let data;
            try {
                data = await response.json();
            } catch (e) {
                console.error(`❌ Ошибка парсинга JSON ответа от NewsAPI.org:`, e.message);
                throw new Error(`Failed to parse JSON response: ${e.message}`);
            }

            // Проверяем на ошибки в ответе NewsAPI
            if (data.status === 'error') {
                const errorMessage = data.message || 'Unknown error';
                const errorCode = data.code || 'unknown';
                
                console.error(`❌ NewsAPI.org Error [${errorCode}]: ${errorMessage}`);
                
                // Специальная обработка ошибки ограничения даты
                if (errorCode === 'parameterInvalid' && errorMessage.includes('too far in the past')) {
                    // Извлекаем минимальную доступную дату из сообщения
                    const dateMatch = errorMessage.match(/(\d{4}-\d{2}-\d{2})/);
                    if (dateMatch) {
                        const minDate = dateMatch[1];
                        throw new Error(`NewsAPI.org: Запрошенная дата слишком далеко в прошлом. Минимальная доступная дата: ${minDate}. Обновите параметр 'from' в запросе.`);
                    }
                }
                
                throw new Error(`NewsAPI.org Error [${errorCode}]: ${errorMessage}`);
            }

            return data;
            }, {
                maxRetries: 3,
                initialDelay: 2000,
                maxDelay: 30000,
                exponentialBase: 2,
                jitter: true,
                retryableStatusCodes: [429, 500, 502, 503, 504],
                retryableErrors: ['TypeError', 'fetch', 'network', 'ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED'],
                serviceName: 'NewsAPI',
                circuitBreaker: true,
                onRetry: (attempt, delay, error) => {
                    if (error.status === 429 || error.statusCode === 429) {
                        console.warn(`⚠️ NewsAPI rate limit. Retrying in ${Math.round(delay/1000)}s... (attempt ${attempt}/3)`);
                    } else {
                        console.warn(`⚠️ NewsAPI error. Retrying in ${Math.round(delay/1000)}s... (attempt ${attempt}/3)`);
                    }
                }
            });
    }

    /**
     * Задержка между запросами
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Поиск новостей по ключевым словам
     * @param {string} query - Поисковый запрос (например, "Сбербанк OR SBER акции")
     * @param {object} options - Дополнительные опции
     * @param {string} options.language - Язык новостей (по умолчанию 'ru')
     * @param {Date} options.from - Дата начала периода
     * @param {Date} options.to - Дата окончания периода
     * @param {string} options.sortBy - Сортировка: 'relevancy', 'popularity', 'publishedAt' (по умолчанию 'relevancy')
     * @param {number} options.pageSize - Количество результатов (по умолчанию 50, максимум 100)
     * @param {number} options.page - Номер страницы (по умолчанию 1)
     * @returns {Promise<Array>} - Массив новостей
     */
    async searchNews(query, options = {}) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            if (!query || query.trim() === '') {
                throw new Error('Поисковый запрос не может быть пустым');
            }

            const params = {
                q: query,
                language: options.language || 'ru',
                sortBy: options.sortBy || 'relevancy',
                pageSize: options.pageSize || 50,
                page: options.page || 1
            };

            // Добавляем даты, если указаны
            // ВАЖНО: NewsAPI.org бесплатный план ограничивает историю
            // Минимальная доступная дата обычно около месяца назад
            if (options.from) {
                const fromDate = new Date(options.from);
                const now = new Date();
                const minAllowedDate = new Date();
                minAllowedDate.setDate(now.getDate() - 30); // 30 дней назад - безопасный период для бесплатного плана
                
                // Если запрашиваемая дата раньше минимальной, используем минимальную
                if (fromDate < minAllowedDate) {
                    params.from = minAllowedDate.toISOString().split('T')[0];
                } else {
                    params.from = fromDate.toISOString().split('T')[0]; // YYYY-MM-DD
                }
            }

            if (options.to) {
                const toDate = new Date(options.to);
                // Убеждаемся, что to не в будущем
                const now = new Date();
                if (toDate > now) {
                    params.to = now.toISOString().split('T')[0];
                } else {
                    params.to = toDate.toISOString().split('T')[0]; // YYYY-MM-DD
                }
            }
            
            // Используем FallbackService для получения новостей с fallback на кеш
            const response = await FallbackService.getNewsWithFallback(query, {
                ...params,
                from: options.from,
                to: options.to,
                pageSize: params.pageSize,
                figi: options.figi
            });

            // NewsAPI возвращает данные в формате:
            // { status: 'ok', totalResults: 123, articles: [...] }
            if (response.status === 'ok' || response.articles) {
                if (response.articles && Array.isArray(response.articles)) {
                    return response.articles;
                } else {
                    return [];
                }
            }
            return [];

        } catch (error) {
            // Если это ошибка о дате, пробрасываем её дальше для более детальной обработки
            if (error.message && error.message.includes('too far in the past')) {
                console.error(`❌ Ошибка ограничения даты в NewsAPI.org:`, error.message);
                throw error; // Пробрасываем, чтобы можно было обработать на верхнем уровне
            }
            
            console.error(`❌ Ошибка поиска новостей в NewsAPI.org:`, error.message);
            // Для других ошибок возвращаем пустой массив, чтобы не прерывать работу
            return [];
        }
    }

    /**
     * Запрос новостей по названию компании и периоду
     * @param {string} companyName - Название компании (например, 'Газпром')
     * @param {Date} fromDate - Дата начала периода
     * @param {Date} toDate - Дата окончания периода
     * @param {object} options - Дополнительные опции
     * @param {string} options.ticker - Тикер акции (опционально)
     * @param {string} options.sector - Сектор/отрасль компании
     * @param {object} options.apiData - Полные данные из API
     * @param {boolean} options.includeFinancialTerms - Включать финансовые термины
     * @param {array} options.aliases - Альтернативные названия компании
     * @param {number} options.pageSize - Размер страницы (максимум 100)
     * @returns {Promise<Array>} - Массив новостей
     */
    async fetchNewsByCompanyName(companyName, fromDate, toDate, options = {}) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            if (!companyName) {
                throw new Error('Название компании обязательно для запроса');
            }

            // Формируем поисковый запрос
            const searchQuery = this.buildSearchQuery(
                options.ticker || null,
                companyName,
                {
                    sector: options.sector,
                    apiData: options.apiData,
                    includeFinancialTerms: options.includeFinancialTerms !== false,
                    aliases: options.aliases
                }
            );
            // Выполняем поиск
            const news = await this.searchNews(searchQuery, {
                language: 'ru',
                from: fromDate,
                to: toDate,
                sortBy: 'relevancy',
                pageSize: Math.min(options.pageSize || 100, 100)
            });

            return news;

        } catch (error) {
            console.error(`❌ Ошибка запроса новостей для "${companyName}":`, error.message);
            throw error;
        }
    }

    /**
     * Формирование поискового запроса для компании по тикеру
     * @param {string} ticker - Тикер акции (например, 'SBER')
     * @param {string} companyName - Название компании (например, 'Сбербанк')
     * @param {object} options - Дополнительные опции
     * @param {string} options.sector - Сектор/отрасль компании
     * @param {object} options.apiData - Полные данные из API (для извлечения дополнительной информации)
     * @param {boolean} options.includeFinancialTerms - Включать финансовые термины (акции, дивиденды и т.д.)
     * @param {array} options.aliases - Альтернативные названия компании
     * @returns {string} - Поисковый запрос
     */
    buildSearchQuery(ticker, companyName = null, options = {}) {
        const {
            sector = null,
            includeFinancialTerms = true,
            includePoliticalTerms = false,
            aliases = [],
            queryType = 'company'
        } = options;

        const parts = [];
        const cleanName = this._normalizeCompanyName(companyName);
        const tickerPart = this._sanitizeQueryPart(ticker);

        // Основные части компании.
        if (cleanName) {
            parts.push(this._sanitizeQueryPart(cleanName, true));
            const shortName = cleanName.split(' ').slice(0, 2).join(' ');
            if (shortName && shortName !== cleanName) {
                parts.push(this._sanitizeQueryPart(shortName, true));
            }
        }
        if (tickerPart) {
            parts.push(tickerPart);
            parts.push(this._sanitizeQueryPart(`${tickerPart} акции`, true));
        }

        // Алиасы компании.
        if (Array.isArray(aliases)) {
            for (const alias of aliases) {
                const normalizedAlias = this._normalizeCompanyName(alias);
                if (normalizedAlias) {
                    parts.push(this._sanitizeQueryPart(normalizedAlias, true));
                }
            }
        }

        // Секторные keywords.
        if (sector) {
            const sectorKeywords = SectorClassifier.getSectorKeywords(sector);
            for (const keyword of sectorKeywords.slice(0, 6)) {
                parts.push(this._sanitizeQueryPart(keyword, true));
            }
        }

        // Финансовые/политические термины в зависимости от типа запроса.
        if (includeFinancialTerms || queryType === 'sector') {
            this.defaultFinancialTerms.forEach(term => parts.push(this._sanitizeQueryPart(term, true)));
        }
        if (includePoliticalTerms || queryType === 'political') {
            this.defaultPoliticalTerms.forEach(term => parts.push(this._sanitizeQueryPart(term, true)));
        }

        const query = this._buildOrQuery(parts);
        if (query) return query;

        return tickerPart || this._sanitizeQueryPart(companyName) || 'рынок акций';
    }
}

export default new NewsApiService();

