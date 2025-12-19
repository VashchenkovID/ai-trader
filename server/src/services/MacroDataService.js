import { Op, fn, col } from 'sequelize';
import MacroIndicator from '../models/MacroIndicator.js';
import Settings from '../models/Settings.js';
import {
    parseCbrXml,
    parseCbrKeyRateXml,
    parseCbrKeyRateHtml,
    parseInvestingRosstatHtml,
    parseInvestingRviHtml,
    normalizeIndicator as normalizeIndicatorUtil,
    validateIndicator as validateIndicatorUtil,
    calculateChange
} from '../utils/macroDataParsers.js';

/**
 * Сервис для работы с макроэкономическими данными
 * 
 * Основные функции:
 * - Получение данных из внешних источников (ЦБ РФ, Росстат, Мосбиржа)
 * - Сохранение и кеширование данных
 * - Предоставление макро-фичей для нейросетей
 * - Автоматическое обновление данных
 */
class MacroDataService {
    constructor() {
        this.isInitialized = false;
        this.settings = {
            updateInterval: '0 10 * * *', // Ежедневно в 10:00 AM
            cacheTtlHours: 1, // TTL кеша в часах
            sources: {
                cbr: true,
                rosstat: true,
                moex: true,
                investing: false, // Fallback
                tradingEconomics: false // Платный
            }
        };
        
        // Кеш в памяти для часто запрашиваемых данных
        this.dataCache = new Map();
        this.cacheTimestamps = new Map();
        this.lastUpdate = null;
        this.updateStats = {
            cbr: { fetched: 0, saved: 0, errors: [] },
            rosstat: { fetched: 0, saved: 0, errors: [] },
            moex: { fetched: 0, saved: 0, errors: [] },
            total: { fetched: 0, saved: 0 }
        };
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            console.log('🚀 Инициализация MacroDataService...');
            
            // Загружаем настройки
            await this.loadSettings();
            
            this.isInitialized = true;
            console.log('✅ MacroDataService инициализирован');
        } catch (error) {
            console.error('❌ Ошибка инициализации MacroDataService:', error);
            throw error;
        }
    }

    /**
     * Загрузка настроек из Settings
     */
    async loadSettings() {
        try {
            // Интервал обновления
            const updateInterval = await Settings.getSetting('macro_data_update_interval');
            if (updateInterval) {
                this.settings.updateInterval = updateInterval;
            }

            // TTL кеша
            const cacheTtl = await Settings.getSetting('macro_data_cache_ttl_hours');
            if (cacheTtl !== null) {
                this.settings.cacheTtlHours = cacheTtl;
            }

            // Настройки источников
            const sourcesConfig = await Settings.getSetting('macro_data_sources');
            if (sourcesConfig && typeof sourcesConfig === 'object') {
                this.settings.sources = { ...this.settings.sources, ...sourcesConfig };
            }

            console.log('📊 Настройки MacroDataService загружены:', {
                updateInterval: this.settings.updateInterval,
                cacheTtlHours: this.settings.cacheTtlHours,
                sources: this.settings.sources
            });
        } catch (error) {
            console.warn('⚠️ Ошибка загрузки настроек MacroDataService, используем значения по умолчанию:', error.message);
        }
    }

    /**
     * Получение индикатора на конкретную дату
     * @param {string} indicatorType - Тип индикатора
     * @param {Date} date - Дата
     * @param {string} country - Код страны (по умолчанию 'RUS')
     * @returns {Promise<MacroIndicator|null>}
     */
    async getIndicator(indicatorType, date, country = 'RUS') {
        try {
            // Проверяем валидность даты
            if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
                console.warn(`⚠️ Невалидная дата для индикатора ${indicatorType}:`, date);
                return null;
            }
            
            // Проверяем кеш (используем дату без времени для более эффективного кеширования)
            const dateKey = date.toISOString().split('T')[0]; // Только дата без времени
            const cacheKey = `${indicatorType}_${dateKey}_${country}`;
            const cached = this.dataCache.get(cacheKey);
            const cacheTimestamp = this.cacheTimestamps.get(cacheKey);
            
            if (cached && cacheTimestamp) {
                const cacheAge = Date.now() - cacheTimestamp;
                const cacheTtlMs = this.settings.cacheTtlHours * 60 * 60 * 1000;
                
                if (cacheAge < cacheTtlMs) {
                    return cached;
                } else {
                    // Удаляем устаревший кеш
                    this.dataCache.delete(cacheKey);
                    this.cacheTimestamps.delete(cacheKey);
                }
            }

            // Ищем в БД (берем ближайшую дату, если точной нет)
            const indicator = await MacroIndicator.findOne({
                where: {
                    indicatorType: indicatorType,
                    country: country,
                    period: {
                        [Op.lte]: date
                    }
                },
                order: [['period', 'DESC']],
                limit: 1
            });

            // Сохраняем в кеш
            if (indicator) {
                this.dataCache.set(cacheKey, indicator);
                this.cacheTimestamps.set(cacheKey, Date.now());
            }

            return indicator;
        } catch (error) {
            console.error(`❌ Ошибка получения индикатора ${indicatorType} на ${date}:`, error);
            return null;
        }
    }

    /**
     * Получение индикаторов за период
     * @param {string} indicatorType - Тип индикатора
     * @param {Date} startDate - Начальная дата
     * @param {Date} endDate - Конечная дата
     * @param {string} country - Код страны (по умолчанию 'RUS')
     * @returns {Promise<MacroIndicator[]>}
     */
    async getIndicatorsForPeriod(indicatorType, startDate, endDate, country = 'RUS') {
        try {
            const indicators = await MacroIndicator.findAll({
                where: {
                    indicatorType: indicatorType,
                    country: country,
                    period: {
                        [Op.between]: [startDate, endDate]
                    }
                },
                order: [['period', 'ASC']]
            });

            return indicators;
        } catch (error) {
            console.error(`❌ Ошибка получения индикаторов ${indicatorType} за период:`, error);
            return [];
        }
    }

    /**
     * Получение последних значений всех индикаторов
     * @param {string} country - Код страны (по умолчанию 'RUS')
     * @returns {Promise<Object>}
     */
    async getLatestIndicators(country = 'RUS') {
        try {
            // Получаем максимальную дату для каждого типа индикатора
            const indicators = await MacroIndicator.findAll({
                where: {
                    country: country
                },
                group: ['indicatorType'],
                attributes: [
                    'indicatorType',
                    [fn('MAX', col('period')), 'latestPeriod']
                ],
                raw: true
            });

            const latest = {};
            for (const ind of indicators) {
                const latestIndicator = await MacroIndicator.findOne({
                    where: {
                        indicatorType: ind.indicatorType,
                        country: country,
                        period: ind.latestPeriod
                    },
                    order: [['period', 'DESC']]
                });
                
                if (latestIndicator) {
                    latest[ind.indicatorType] = latestIndicator;
                }
            }

            return latest;
        } catch (error) {
            console.error(`❌ Ошибка получения последних индикаторов:`, error);
            return {};
        }
    }

    /**
     * Получение макро-фичей для конкретной даты (для нейросетей)
     * @param {Date} date - Дата
     * @param {string} country - Код страны (по умолчанию 'RUS')
     * @returns {Promise<Array<number>>} Массив из 8 макро-фичей
     */
    async getMacroFeatures(date, country = 'RUS') {
        try {
            // Получаем последние доступные данные на указанную дату
            const inflation = await this.getIndicator('inflation', date, country);
            const interestRate = await this.getIndicator('interest_rate', date, country);
            const gdp = await this.getIndicator('gdp', date, country);
            const unemployment = await this.getIndicator('unemployment', date, country);
            const sentiment = await this.getIndicator('sentiment', date, country);
            const volatilityIndex = await this.getIndicator('volatility_index', date, country);

            // Извлекаем значения и изменения
            const inflationValue = inflation?.value || 0;
            const inflationChange = inflation?.metadata?.change || 0;
            const interestRateValue = interestRate?.value || 0;
            const interestRateChange = interestRate?.metadata?.change || 0;
            const gdpGrowth = gdp?.metadata?.growth || gdp?.value || 0;
            const unemploymentValue = unemployment?.value || 0;
            const sentimentValue = sentiment?.value || 0.5; // По умолчанию нейтральное
            const volatilityValue = volatilityIndex?.value || 0.5; // По умолчанию среднее

            // Нормализация (упрощенная, можно улучшить)
            const normalized = [
                Math.min(1, Math.max(0, inflationValue / 20)), // Инфляция: 0-20% -> 0-1
                Math.min(1, Math.max(-1, inflationChange / 2)), // Изменение инфляции: -2% до +2% -> -1 до 1
                Math.min(1, Math.max(0, interestRateValue / 25)), // Ставка: 0-25% -> 0-1
                Math.min(1, Math.max(-1, interestRateChange / 2)), // Изменение ставки: -2% до +2% -> -1 до 1
                Math.min(1, Math.max(-1, gdpGrowth / 10)), // Рост ВВП: -10% до +10% -> -1 до 1
                Math.min(1, Math.max(0, unemploymentValue / 20)), // Безработица: 0-20% -> 0-1
                Math.min(1, Math.max(0, sentimentValue)), // Индекс настроений: уже 0-1
                Math.min(1, Math.max(0, volatilityValue)) // Индекс волатильности: уже 0-1
            ];

            return normalized;
        } catch (error) {
            console.error(`❌ Ошибка получения макро-фичей для ${date}:`, error);
            // Возвращаем нулевые значения при ошибке
            return new Array(8).fill(0);
        }
    }

    /**
     * Сохранение индикатора в БД
     * @param {Object} indicatorData - Данные индикатора
     * @returns {Promise<MacroIndicator>}
     */
    async saveIndicator(indicatorData) {
        try {
            const {
                indicatorType,
                source,
                value,
                period,
                periodType = 'monthly',
                unit = 'percent',
                metadata = {},
                country = 'RUS'
            } = indicatorData;

            // Проверяем, существует ли уже такой индикатор
            const existing = await MacroIndicator.findOne({
                where: {
                    indicatorType: indicatorType,
                    period: period,
                    source: source,
                    country: country
                }
            });

            // Округляем значение до 2 знаков после запятой для точности
            const roundedValue = typeof value === 'number' ? Math.round(value * 100) / 100 : parseFloat(value);
            
            if (existing) {
                // Обновляем существующий
                await existing.update({
                    value: roundedValue,
                    periodType: periodType,
                    unit: unit,
                    metadata: metadata
                });
                return existing;
            } else {
                // Создаем новый
                const indicator = await MacroIndicator.create({
                    indicatorType: indicatorType,
                    source: source,
                    value: roundedValue,
                    period: period,
                    periodType: periodType,
                    unit: unit,
                    metadata: metadata,
                    country: country
                });
                return indicator;
            }
        } catch (error) {
            console.error('❌ Ошибка сохранения индикатора:', error);
            throw error;
        }
    }

    /**
     * Массовое сохранение индикаторов
     * @param {Array<Object>} indicators - Массив данных индикаторов
     * @returns {Promise<number>} Количество сохраненных индикаторов
     */
    async bulkSaveIndicators(indicators) {
        try {
            let savedCount = 0;
            
            for (const indicatorData of indicators) {
                try {
                    await this.saveIndicator(indicatorData);
                    savedCount++;
                } catch (error) {
                    console.warn(`⚠️ Не удалось сохранить индикатор:`, error.message);
                }
            }

            return savedCount;
        } catch (error) {
            console.error('❌ Ошибка массового сохранения индикаторов:', error);
            throw error;
        }
    }

    /**
     * Очистка кеша
     */
    clearCache() {
        this.dataCache.clear();
        this.cacheTimestamps.clear();
        console.log('✅ Кеш MacroDataService очищен');
    }

    /**
     * Получение данных от ЦБ РФ
     * @param {Date} startDate - Начальная дата
     * @param {Date} endDate - Конечная дата
     * @returns {Promise<Array<Object>>} Массив индикаторов
     */
    async fetchCbrData(startDate = null, endDate = null) {
        if (!this.settings.sources.cbr) {
            console.log('ℹ️ Источник ЦБ РФ отключен в настройках');
            return [];
        }

        try {
            const indicators = [];
            const now = new Date();
            const start = startDate || new Date(now.getFullYear(), now.getMonth() - 1, 1); // Месяц назад
            const end = endDate || now;

            // Форматируем даты для API ЦБ РФ (dd.MM.yyyy)
            const formatDate = (date) => {
                const day = String(date.getDate()).padStart(2, '0');
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const year = date.getFullYear();
                return `${day}.${month}.${year}`;
            };

            // 1. Ключевая ставка
            // Используем официальный API ЦБ РФ или парсим HTML страницу
            try {
                let records = [];
                
                // Сначала пробуем официальный API endpoint
                const formatDateForApi = (date) => {
                    const year = date.getFullYear();
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const day = String(date.getDate()).padStart(2, '0');
                    return `${year}-${month}-${day}`;
                };
                
                const apiUrl = `https://www.cbr.ru/DailyInfoWebServ/DailyInfo.asmx/KeyRate?fromDate=${formatDateForApi(start)}&toDate=${formatDateForApi(end)}`;
                console.log(`📡 Запрос к API ЦБ РФ (ключевая ставка): ${apiUrl}`);
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000);
                
                try {
                    const apiResponse = await fetch(apiUrl, {
                        method: 'GET',
                        headers: {
                            'Accept': 'application/xml, text/xml',
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        },
                        signal: controller.signal
                    });

                    clearTimeout(timeoutId);

                    if (apiResponse.ok) {
                        const xmlText = await apiResponse.text();
                        console.log(`📄 Получен XML от API ЦБ РФ, длина: ${xmlText.length} символов`);
                        
                        if (xmlText.length > 100) {
                            records = parseCbrKeyRateXml(xmlText);
                            console.log(`📊 Распарсено ${records.length} записей из API ЦБ РФ`);
                        }
                    }
                } catch (apiError) {
                    console.warn(`⚠️ API ЦБ РФ недоступен, пробуем парсить HTML страницу:`, apiError.message);
                }

                // Если API не сработал, парсим HTML страницу
                if (records.length === 0) {
                    // Форматируем даты для URL (DD.MM.YYYY)
                    const formatDateForUrl = (date) => {
                        const day = String(date.getDate()).padStart(2, '0');
                        const month = String(date.getMonth() + 1).padStart(2, '0');
                        const year = date.getFullYear();
                        return `${day}.${month}.${year}`;
                    };
                    
                    // Используем параметры запроса для фильтрации по датам
                    const htmlUrl = `https://cbr.ru/hd_base/KeyRate/?UniDbQuery.Posted=True&UniDbQuery.From=${formatDateForUrl(start)}&UniDbQuery.To=${formatDateForUrl(end)}`;
                    console.log(`📡 Парсинг HTML страницы ЦБ РФ: ${htmlUrl}`);
                    
                    const htmlController = new AbortController();
                    const htmlTimeoutId = setTimeout(() => htmlController.abort(), 15000);
                    
                    const htmlResponse = await fetch(htmlUrl, {
                        method: 'GET',
                        headers: {
                            'Accept': 'text/html,application/xhtml+xml',
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        },
                        signal: htmlController.signal
                    });

                    clearTimeout(htmlTimeoutId);

                    if (htmlResponse.ok) {
                        const htmlText = await htmlResponse.text();
                        console.log(`📄 Получен HTML от ЦБ РФ, длина: ${htmlText.length} символов`);
                        
                        records = parseCbrKeyRateHtml(htmlText, start, end);
                        console.log(`📊 Распарсено ${records.length} записей из HTML ЦБ РФ`);
                    } else {
                        const errorText = await htmlResponse.text().catch(() => 'Не удалось прочитать ответ');
                        console.warn(`⚠️ ЦБ РФ вернул статус ${htmlResponse.status}: ${errorText.substring(0, 200)}`);
                        throw new Error(`HTTP ${htmlResponse.status}: ${htmlResponse.statusText}`);
                    }
                }

                if (records.length > 0) {
                    // Получаем предыдущее значение для расчета изменения
                    const previousIndicator = await this.getIndicator('interest_rate', new Date(start.getTime() - 86400000), 'RUS');
                    const previousValue = previousIndicator?.value || null;

                    for (const record of records) {
                        const normalized = this.normalizeIndicator('interest_rate', {
                            value: record.value,
                            date: record.date,
                            source: 'cbr',
                            previousValue: previousValue
                        });
                        if (normalized) {
                            normalized.source = 'cbr';
                            normalized.country = 'RUS';
                            
                            // Валидация перед добавлением
                            const validation = this.validateIndicator(normalized);
                            if (validation.valid) {
                                indicators.push(normalized);
                            } else {
                                console.warn(`⚠️ Индикатор не прошел валидацию:`, validation.errors);
                            }
                        }
                    }
                }
            } catch (error) {
                if (error.name === 'AbortError') {
                    console.warn('⚠️ Таймаут запроса к ЦБ РФ');
                } else {
                    console.warn('⚠️ Ошибка получения ключевой ставки от ЦБ РФ:', error.message);
                    console.error('Детали ошибки:', error);
                }
            }

            // 2. Инфляция (месячная)
            try {
                // ЦБ РФ публикует инфляцию ежемесячно
                // Используем упрощенный подход - получаем последние данные
                const inflationUrl = `https://www.cbr.ru/statistics/macro_itm/inflation/`;
                // Примечание: Для инфляции может потребоваться парсинг HTML или использование другого API
                // Пока пропускаем, так как инфляцию можно получить от Росстата
            } catch (error) {
                console.warn('⚠️ Ошибка получения инфляции от ЦБ РФ:', error.message);
            }

            console.log(`✅ Получено ${indicators.length} индикаторов от ЦБ РФ`);
            return indicators;
        } catch (error) {
            console.error('❌ Ошибка получения данных от ЦБ РФ:', error);
            return [];
        }
    }

    /**
     * Получение данных от Росстата через Investing.com
     * @param {Date} startDate - Начальная дата
     * @param {Date} endDate - Конечная дата
     * @returns {Promise<Array<Object>>} Массив индикаторов
     */
    async fetchRosstatData(startDate = null, endDate = null) {
        if (!this.settings.sources.rosstat) {
            console.log('ℹ️ Источник Росстата отключен в настройках');
            return [];
        }

        try {
            const indicators = [];
            const now = new Date();
            const start = startDate || new Date(now.getFullYear(), now.getMonth() - 3, 1); // 3 месяца назад
            const end = endDate || now;

            // Investing.com HTML парсинг для данных Росстата
            const rosstatSources = [
                {
                    url: 'https://ru.investing.com/economic-calendar/russian-monthly-gdp-407',
                    indicatorType: 'gdp',
                    name: 'ВВП'
                },
                {
                    url: 'https://ru.investing.com/economic-calendar/russian-unemployment-rate-556',
                    indicatorType: 'unemployment',
                    name: 'Безработица'
                },
                {
                    url: 'https://ru.investing.com/economic-calendar/russian-industrial-production-553',
                    indicatorType: 'industrial_production',
                    name: 'Промышленное производство'
                }
            ];

            for (const source of rosstatSources) {
                try {
                    console.log(`📡 Парсинг HTML страницы Investing.com (${source.name}): ${source.url}`);
                    
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 20000);
                    
                    const response = await fetch(source.url, {
                        method: 'GET',
                        headers: {
                            'Accept': 'text/html,application/xhtml+xml',
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
                            'Accept-Encoding': 'gzip, deflate, br',
                            'Referer': 'https://ru.investing.com/'
                        },
                        signal: controller.signal
                    });

                    clearTimeout(timeoutId);

                    if (!response.ok) {
                        const errorText = await response.text().catch(() => 'Не удалось прочитать ответ');
                        console.warn(`⚠️ Investing.com (${source.name}) вернул статус ${response.status}: ${errorText.substring(0, 200)}`);
                        continue;
                    }

                    const htmlText = await response.text();
                    console.log(`📄 Получен HTML от Investing.com (${source.name}), длина: ${htmlText.length} символов`);
                    
                    const records = parseInvestingRosstatHtml(htmlText, start, end);
                    console.log(`📊 Распарсено записей от Investing.com (${source.name}): ${records.length}`);

                    if (records.length > 0) {
                        // Получаем предыдущее значение для расчета изменения (если не было в metadata)
                        const previousIndicator = await this.getIndicator(source.indicatorType, new Date(records[0].date.getTime() - 86400000), 'RUS');
                        const previousValue = records[0].metadata.previousValue !== null ? records[0].metadata.previousValue : (previousIndicator?.value || null);

                        for (const record of records) {
                            const normalized = this.normalizeIndicator(source.indicatorType, {
                                value: record.value,
                                date: record.date,
                                source: 'rosstat',
                                previousValue: previousValue,
                                metadata: record.metadata
                            });
                            if (normalized) {
                                normalized.source = 'rosstat';
                                normalized.country = 'RUS';
                                
                                // Валидация перед добавлением
                                const validation = this.validateIndicator(normalized);
                                if (validation.valid) {
                                    indicators.push(normalized);
                                } else {
                                    console.warn(`⚠️ Индикатор ${source.name} не прошел валидацию:`, validation.errors);
                                }
                            }
                        }
                    }
                } catch (error) {
                    if (error.name === 'AbortError') {
                        console.warn(`⚠️ Таймаут запроса к Investing.com (${source.name})`);
                    } else {
                        console.warn(`⚠️ Ошибка получения данных ${source.name} от Investing.com:`, error.message);
                        console.error('Детали ошибки:', error);
                    }
                }
            }

            console.log(`✅ Получено ${indicators.length} индикаторов от Росстата (через Investing.com)`);
            return indicators;
        } catch (error) {
            console.error('❌ Ошибка получения данных от Росстата:', error);
            return [];
        }
    }

    /**
     * Получение данных от Мосбиржи
     * @param {Date} startDate - Начальная дата
     * @param {Date} endDate - Конечная дата
     * @returns {Promise<Array<Object>>} Массив индикаторов
     */
    async fetchMoexData(startDate = null, endDate = null) {
        if (!this.settings.sources.moex) {
            console.log('ℹ️ Источник Мосбиржи отключен в настройках');
            return [];
        }

        try {
            const indicators = [];
            const now = new Date();
            const start = startDate || new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const end = endDate || now;

            // Investing.com HTML парсинг для индекса волатильности (RVI)
            try {
                const rviUrl = `https://ru.investing.com/indices/russian-vix`;
                console.log(`📡 Парсинг HTML страницы Investing.com: ${rviUrl}`);
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 20000);
                
                const response = await fetch(rviUrl, {
                    method: 'GET',
                    headers: {
                        'Accept': 'text/html,application/xhtml+xml',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'Referer': 'https://ru.investing.com/'
                    },
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    const errorText = await response.text().catch(() => 'Не удалось прочитать ответ');
                    console.warn(`⚠️ Investing.com вернул статус ${response.status}: ${errorText.substring(0, 200)}`);
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const htmlText = await response.text();
                console.log(`📄 Получен HTML от Investing.com, длина: ${htmlText.length} символов`);
                
                const records = parseInvestingRviHtml(htmlText, start, end);
                console.log(`📊 Распарсено записей от Investing.com: ${records.length}`);

                if (records.length > 0) {
                    // Получаем предыдущее значение для расчета изменения
                    const previousIndicator = await this.getIndicator('volatility_index', new Date(start.getTime() - 86400000), 'RUS');
                    const previousValue = previousIndicator?.value || null;

                    for (const record of records) {
                        const normalized = this.normalizeIndicator('volatility_index', {
                            value: record.value,
                            date: record.date,
                            source: 'moex',
                            previousValue: previousValue,
                            metadata: record.metadata
                        });
                        if (normalized) {
                            normalized.source = 'investing';
                            normalized.country = 'RUS';
                            
                            // Валидация перед добавлением
                            const validation = this.validateIndicator(normalized);
                            if (validation.valid) {
                                indicators.push(normalized);
                            } else {
                                console.warn(`⚠️ Индикатор не прошел валидацию:`, validation.errors);
                            }
                        }
                    }
                }
            } catch (error) {
                if (error.name === 'AbortError') {
                    console.warn('⚠️ Таймаут запроса к Investing.com');
                } else {
                    console.warn('⚠️ Ошибка получения индекса волатильности от Investing.com:', error.message);
                    console.error('Детали ошибки:', error);
                }
            }

            console.log(`✅ Получено ${indicators.length} индикаторов от Investing.com`);
            return indicators;
        } catch (error) {
            console.error('❌ Ошибка получения данных от Мосбиржи:', error);
            return [];
        }
    }

    /**
     * Нормализация индикатора (внутренний метод)
     * @private
     */
    normalizeIndicator(indicatorType, rawData) {
        return normalizeIndicatorUtil(indicatorType, rawData);
    }

    /**
     * Валидация индикатора
     * @param {Object} indicator - Данные индикатора
     * @returns {Object} {valid: boolean, errors: Array<string>}
     */
    validateIndicator(indicator) {
        return validateIndicatorUtil(indicator);
    }

    /**
     * Обновление всех данных из всех источников
     * @param {Date} startDate - Начальная дата (опционально)
     * @param {Date} endDate - Конечная дата (опционально)
     * @returns {Promise<Object>} Статистика обновления
     */
    async updateAllData(startDate = null, endDate = null) {
        const stats = {
            cbr: { fetched: 0, saved: 0, errors: [] },
            rosstat: { fetched: 0, saved: 0, errors: [] },
            moex: { fetched: 0, saved: 0, errors: [] },
            total: { fetched: 0, saved: 0 }
        };

        try {
            console.log('🔄 Начало обновления макроэкономических данных...');

            // 1. ЦБ РФ
            if (this.settings.sources.cbr) {
                try {
                    const cbrIndicators = await this.fetchCbrData(startDate, endDate);
                    stats.cbr.fetched = cbrIndicators.length;
                    const saved = await this.bulkSaveIndicators(cbrIndicators);
                    stats.cbr.saved = saved;
                    stats.total.fetched += cbrIndicators.length;
                    stats.total.saved += saved;
                } catch (error) {
                    stats.cbr.errors.push(error.message);
                    console.error('❌ Ошибка обновления данных ЦБ РФ:', error);
                }
            }

            // 2. Росстат
            if (this.settings.sources.rosstat) {
                try {
                    const rosstatIndicators = await this.fetchRosstatData(startDate, endDate);
                    stats.rosstat.fetched = rosstatIndicators.length;
                    const saved = await this.bulkSaveIndicators(rosstatIndicators);
                    stats.rosstat.saved = saved;
                    stats.total.fetched += rosstatIndicators.length;
                    stats.total.saved += saved;
                } catch (error) {
                    stats.rosstat.errors.push(error.message);
                    console.error('❌ Ошибка обновления данных Росстата:', error);
                }
            }

            // 3. Мосбиржа
            if (this.settings.sources.moex) {
                try {
                    const moexIndicators = await this.fetchMoexData(startDate, endDate);
                    stats.moex.fetched = moexIndicators.length;
                    const saved = await this.bulkSaveIndicators(moexIndicators);
                    stats.moex.saved = saved;
                    stats.total.fetched += moexIndicators.length;
                    stats.total.saved += saved;
                } catch (error) {
                    stats.moex.errors.push(error.message);
                    console.error('❌ Ошибка обновления данных Мосбиржи:', error);
                }
            }

            // Очищаем кеш после обновления
            this.clearCache();
            
            // Сохраняем статистику
            this.updateStats = stats;
            this.lastUpdate = new Date();

            console.log('✅ Обновление макроэкономических данных завершено:', stats);
            return stats;
        } catch (error) {
            console.error('❌ Критическая ошибка обновления данных:', error);
            throw error;
        }
    }

    /**
     * Получение статуса сервиса
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            settings: this.settings,
            cacheSize: this.dataCache.size
        };
    }
}

export default new MacroDataService();

