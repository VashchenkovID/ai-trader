import { Op, fn, col } from 'sequelize';
import MacroIndicator from '../models/MacroIndicator.js';
import Settings from '../models/Settings.js';
import CacheService from './CacheService.js';
import CachedInstrument from '../models/CachedInstrument.js';
import {
    parseCbrXml,
    parseCbrKeyRateXml,
    parseCbrKeyRateHtml,
    parseCbrCurrencyJson,
    parseInvestingInflationHtml,
    parseTradingViewRviHtml,
    parseMoexCommodityJson,
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
            moexCommodity: { fetched: 0, saved: 0, errors: [] },
            marketIndices: { fetched: 0, saved: 0, errors: [] },
            total: { fetched: 0, saved: 0 }
        };
        
        // Конфигурация инструментов сырья для MOEX ISS API
        // Формат кодов: BRH6 (нефть Brent, март 2026), GZH6 (золото, март 2026), SIH6 (серебро, март 2026), и т.д.
        this.commodityInstruments = {
            oil: { baseCode: 'BR', name: 'Нефть Brent', currency: 'USD', unit: 'absolute' },
            gas: { baseCode: 'NG', name: 'Природный газ', currency: 'RUB', unit: 'absolute' },
            gold: { baseCode: 'GZ', name: 'Золото', currency: 'USD', unit: 'absolute' },
            silver: { baseCode: 'SI', name: 'Серебро', currency: 'USD', unit: 'absolute' },
            copper: { baseCode: 'CU', name: 'Медь', currency: 'USD', unit: 'absolute' },
            nickel: { baseCode: 'NI', name: 'Никель', currency: 'USD', unit: 'absolute' },
            aluminum: { baseCode: 'AL', name: 'Алюминий', currency: 'USD', unit: 'absolute' }
        };

        // Конфигурация рыночных индексов
        this.marketIndices = {
            imoex: { ticker: 'IMOEXF', name: 'Индекс МосБиржи', source: 'tinkoff_imoex' },
            rts: { ticker: 'RTSI', name: 'Индекс RTS', source: 'tinkoff_rts' } // RTSI - это правильный тикер для RTS
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
            
            // Загружаем настройки
            await this.loadSettings();
            
            this.isInitialized = true;
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
                    // Получаем предыдущее значение для расчета изменения
                    const previousIndicator = await MacroIndicator.findOne({
                        where: {
                            indicatorType: ind.indicatorType,
                            country: country,
                            period: { [Op.lt]: ind.latestPeriod }
                        },
                        order: [['period', 'DESC']]
                    });
                    
                    // Преобразуем в plain object
                    const plain = latestIndicator.get({ plain: true });
                    
                    // Рассчитываем изменение, если есть предыдущее значение
                    if (previousIndicator && previousIndicator.value) {
                        const currentValue = parseFloat(plain.value);
                        const previousValue = parseFloat(previousIndicator.value);
                        if (!isNaN(currentValue) && !isNaN(previousValue) && previousValue !== 0) {
                            plain.change = ((currentValue - previousValue) / previousValue) * 100;
                        }
                    }
                    
                    latest[ind.indicatorType] = plain;
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
     * @returns {Promise<Array<number>>} Массив из 15 макро-фичей (8 базовых + 3 сырьевых + 2 валютных + 2 индекса)
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

            // Получаем данные о ценах на сырье
            // Используем source для поиска, так как он уникален для каждого типа сырья
            const oilPrice = await MacroIndicator.findOne({
                where: {
                    indicatorType: 'oil_price',
                    country: country,
                    source: 'moex_iss_oil',
                    period: { [Op.lte]: date }
                },
                order: [['period', 'DESC']],
                limit: 1
            });

            const gasPrice = await MacroIndicator.findOne({
                where: {
                    indicatorType: 'oil_price',
                    country: country,
                    source: 'moex_iss_gas',
                    period: { [Op.lte]: date }
                },
                order: [['period', 'DESC']],
                limit: 1
            });

            const goldPrice = await MacroIndicator.findOne({
                where: {
                    indicatorType: 'oil_price',
                    country: country,
                    source: 'moex_iss_gold',
                    period: { [Op.lte]: date }
                },
                order: [['period', 'DESC']],
                limit: 1
            });

            // Получаем курсы валют
            const usdRate = await MacroIndicator.findOne({
                where: {
                    indicatorType: 'currency_rate',
                    country: country,
                    source: 'cbr_usd',
                    period: { [Op.lte]: date }
                },
                order: [['period', 'DESC']],
                limit: 1
            });

            const eurRate = await MacroIndicator.findOne({
                where: {
                    indicatorType: 'currency_rate',
                    country: country,
                    source: 'cbr_eur',
                    period: { [Op.lte]: date }
                },
                order: [['period', 'DESC']],
                limit: 1
            });

            // Извлекаем значения и изменения
            const inflationValue = inflation?.value || 0;
            const inflationChange = inflation?.metadata?.change || 0;
            const interestRateValue = interestRate?.value || 0;
            const interestRateChange = interestRate?.metadata?.change || 0;
            const gdpGrowth = gdp?.metadata?.growth || gdp?.value || 0;
            const unemploymentValue = unemployment?.value || 0;
            const sentimentValue = sentiment?.value || 0.5; // По умолчанию нейтральное
            const volatilityValue = volatilityIndex?.value || 0.5; // По умолчанию среднее

            // Нормализация базовых индикаторов
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

            // Извлекаем цены на сырье
            const oilPriceValue = oilPrice ? parseFloat(oilPrice.value) : null;
            const gasPriceValue = gasPrice ? parseFloat(gasPrice.value) : null;
            const goldPriceValue = goldPrice ? parseFloat(goldPrice.value) : null;

            // Нормализация цен на сырье
            // Нефть: 50-150 USD -> 0-1 (или среднее 0.5 при отсутствии данных)
            const normalizedOil = oilPriceValue !== null && oilPriceValue > 0
                ? Math.min(1, Math.max(0, (oilPriceValue - 50) / 100))
                : 0.5;

            // Газ: 100-500 RUB -> 0-1 (или среднее 0.5 при отсутствии данных)
            const normalizedGas = gasPriceValue !== null && gasPriceValue > 0
                ? Math.min(1, Math.max(0, (gasPriceValue - 100) / 400))
                : 0.5;

            // Золото: 1500-2500 USD -> 0-1 (или среднее 0.5 при отсутствии данных)
            const normalizedGold = goldPriceValue !== null && goldPriceValue > 0
                ? Math.min(1, Math.max(0, (goldPriceValue - 1500) / 1000))
                : 0.5;

            // Добавляем фичи сырья (3 фичи)
            normalized.push(normalizedOil);
            normalized.push(normalizedGas);
            normalized.push(normalizedGold);

            // Извлекаем курсы валют
            const usdRateValue = usdRate ? parseFloat(usdRate.value) : null;
            const eurRateValue = eurRate ? parseFloat(eurRate.value) : null;
            
            // Получаем предыдущие значения для расчета изменений
            let usdRatePrevious = null;
            if (usdRate?.metadata?.previousValue !== undefined && usdRate.metadata.previousValue !== null) {
                usdRatePrevious = parseFloat(usdRate.metadata.previousValue);
            } else if (usdRate) {
                const prevUsd = await MacroIndicator.findOne({
                    where: {
                        indicatorType: 'currency_rate',
                        country: country,
                        source: 'cbr_usd',
                        period: { [Op.lt]: usdRate.period }
                    },
                    order: [['period', 'DESC']],
                    limit: 1
                });
                usdRatePrevious = prevUsd ? parseFloat(prevUsd.value) : null;
            }

            // Нормализация курсов валют
            // USD/RUB: 50-150 -> 0-1 (или среднее 0.5 при отсутствии данных)
            const normalizedUsd = usdRateValue !== null && usdRateValue > 0
                ? Math.min(1, Math.max(0, (usdRateValue - 50) / 100))
                : 0.5;

            // Изменение USD/RUB: -10% до +10% -> -1 до 1
            const usdChange = (usdRateValue !== null && usdRatePrevious !== null && usdRatePrevious > 0)
                ? Math.min(1, Math.max(-1, ((usdRateValue - usdRatePrevious) / usdRatePrevious) * 10)) // Умножаем на 10 для нормализации -10%...+10% -> -1...1
                : 0;

            // Добавляем фичи валют (2 фичи)
            normalized.push(normalizedUsd);
            normalized.push(usdChange);

            // Получаем рыночные индексы
            const imoexIndex = await MacroIndicator.findOne({
                where: {
                    indicatorType: 'oil_price', // Временно используем oil_price
                    country: country,
                    source: 'tinkoff_imoex',
                    period: { [Op.lte]: date }
                },
                order: [['period', 'DESC']],
                limit: 1
            });

            const rtsIndex = await MacroIndicator.findOne({
                where: {
                    indicatorType: 'oil_price', // Временно используем oil_price
                    country: country,
                    source: 'tinkoff_rts',
                    period: { [Op.lte]: date }
                },
                order: [['period', 'DESC']],
                limit: 1
            });

            // Извлекаем значения индексов
            const imoexValue = imoexIndex ? parseFloat(imoexIndex.value) : null;
            const rtsValue = rtsIndex ? parseFloat(rtsIndex.value) : null;

            // Нормализация индексов
            // IMOEX: 2000-5000 -> 0-1 (или среднее 0.5 при отсутствии данных)
            const normalizedImoex = imoexValue !== null && imoexValue > 0
                ? Math.min(1, Math.max(0, (imoexValue - 2000) / 3000))
                : 0.5;

            // RTS: 1000-3000 -> 0-1 (или среднее 0.5 при отсутствии данных)
            const normalizedRts = rtsValue !== null && rtsValue > 0
                ? Math.min(1, Math.max(0, (rtsValue - 1000) / 2000))
                : 0.5;

            // Добавляем фичи индексов (2 фичи)
            normalized.push(normalizedImoex);
            normalized.push(normalizedRts);

            return normalized;
        } catch (error) {
            console.error(`❌ Ошибка получения макро-фичей для ${date}:`, error);
            // Возвращаем нулевые значения при ошибке (теперь 15 фичей: 8 базовых + 3 сырьевых + 2 валютных + 2 индекса)
            return new Array(15).fill(0);
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
            // source уже уникален для каждого типа сырья (moex_iss_oil, moex_iss_gas, etc), поэтому используем его
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

            // 2. Курсы валют (USD/RUB, EUR/RUB)
            try {
                const currencyUrl = 'https://www.cbr-xml-daily.ru/daily_json.js';
                console.log(`📡 Запрос курсов валют от ЦБ РФ: ${currencyUrl}`);
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000);
                
                const currencyResponse = await fetch(currencyUrl, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (currencyResponse.ok) {
                    const currencyJson = await currencyResponse.json();
                    console.log(`📄 Получен JSON от ЦБ РФ для курсов валют`);
                    
                    const currencyRecords = parseCbrCurrencyJson(currencyJson);
                    
                    // Получаем предыдущие значения для каждой валюты
                    for (const record of currencyRecords) {
                        // Ищем предыдущий индикатор для этой валюты
                        const previousDate = new Date(record.date.getTime() - 86400000);
                        const previousIndicator = await MacroIndicator.findOne({
                            where: {
                                indicatorType: 'currency_rate',
                                country: 'RUS',
                                source: `cbr_${record.currencyCode.toLowerCase()}`,
                                period: {
                                    [Op.lte]: previousDate
                                }
                            },
                            order: [['period', 'DESC']],
                            limit: 1
                        });
                        
                        const previousValue = record.previousValue !== null && record.previousValue !== undefined
                            ? record.previousValue
                            : (previousIndicator?.value ? parseFloat(previousIndicator.value) : null);

                        const normalized = this.normalizeIndicator('currency_rate', {
                            value: record.value,
                            date: record.date,
                            source: `cbr_${record.currencyCode.toLowerCase()}`,
                            previousValue: previousValue,
                            metadata: {
                                currencyCode: record.currencyCode,
                                currencyName: record.metadata.currencyName,
                                ...record.metadata
                            }
                        });
                        
                        if (normalized) {
                            normalized.source = `cbr_${record.currencyCode.toLowerCase()}`;
                            normalized.country = 'RUS';
                            normalized.indicatorType = 'currency_rate';
                            
                            // Валидация перед добавлением
                            const validation = this.validateIndicator(normalized);
                            if (validation.valid) {
                                indicators.push(normalized);
                            } else {
                                console.warn(`⚠️ Индикатор курса валюты ${record.currencyCode} не прошел валидацию:`, validation.errors);
                            }
                        }
                    }
                    
                    console.log(`✅ Обработано ${currencyRecords.length} курсов валют от ЦБ РФ`);
                } else {
                    const errorText = await currencyResponse.text().catch(() => 'Не удалось прочитать ответ');
                    console.warn(`⚠️ ЦБ РФ (валюты) вернул статус ${currencyResponse.status}: ${errorText.substring(0, 200)}`);
                }
            } catch (error) {
                if (error.name === 'AbortError') {
                    console.warn('⚠️ Таймаут запроса курсов валют от ЦБ РФ');
                } else {
                    console.warn('⚠️ Ошибка получения курсов валют от ЦБ РФ:', error.message);
                    console.error('Детали ошибки:', error);
                }
            }

            // 3. Инфляция (месячная)
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
                    name: 'ВВП',
                    parser: parseInvestingInflationHtml
                },
                {
                    url: 'https://ru.investing.com/economic-calendar/russian-unemployment-rate-556',
                    indicatorType: 'unemployment',
                    name: 'Безработица',
                    parser: parseInvestingInflationHtml
                },
                {
                    url: 'https://ru.investing.com/economic-calendar/russian-industrial-production-553',
                    indicatorType: 'industrial_production',
                    name: 'Промышленное производство',
                    parser: parseInvestingInflationHtml
                },
                {
                    url: 'https://ru.investing.com/economic-calendar/russian-cpi-1180',
                    indicatorType: 'inflation',
                    name: 'Инфляция (CPI)',
                    parser: parseInvestingInflationHtml
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
                    
                    // Используем указанный парсер или парсер по умолчанию
                    const parser = source.parser || parseInvestingRosstatHtml;
                    const records = parser(htmlText, start, end);
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
                
                const records = parseTradingViewRviHtml(htmlText, start, end);
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
     * Получение активных фьючерсов на сырье из MOEX ISS API
     * @returns {Promise<Object>} Map типов сырья к кодам активных фьючерсов {oil: 'BR-1.24', gas: 'NG-2.24', ...}
     */
    async fetchActiveCommodityFutures() {
        try {
            const futuresMap = {};
            
            // Получаем список всех активных фьючерсов на FORTS
            const url = 'https://iss.moex.com/iss/engines/futures/markets/forts/securities.json?iss.meta=off';
            console.log(`📡 Запрос списка активных фьючерсов от MOEX ISS API: ${url}`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Не удалось прочитать ответ');
                console.warn(`⚠️ MOEX ISS API вернул статус ${response.status}: ${errorText.substring(0, 200)}`);
                return futuresMap;
            }

            const jsonData = await response.json();
            
            if (!jsonData.securities || !jsonData.securities.data) {
                console.warn('⚠️ JSON от MOEX ISS API не содержит данных securities');
                return futuresMap;
            }

            const securities = jsonData.securities.data;
            const columns = jsonData.securities.columns || [];
            const secidIndex = columns.indexOf('SECID');
            const shortnameIndex = columns.indexOf('SHORTNAME');
            const lasttradedateIndex = columns.indexOf('LASTTRADEDATE');

            if (secidIndex === -1) {
                console.warn('⚠️ Не найдена колонка SECID в ответе MOEX ISS API');
                return futuresMap;
            }

            // Группируем фьючерсы по типам сырья
            const futuresByType = {};
            
            for (const row of securities) {
                if (!Array.isArray(row) || row.length <= secidIndex) continue;
                
                const secid = row[secidIndex];
                if (!secid || typeof secid !== 'string') continue;

                // Определяем тип сырья по коду инструмента
                // Формат кодов на MOEX: ALH6 (алюминий, март 2026), GZH6 (золото, март 2026), SIH6 (серебро, март 2026), BRH6 (нефть, март 2026)
                // Используем startsWith для поиска по базовому коду
                for (const [type, config] of Object.entries(this.commodityInstruments)) {
                    if (secid.startsWith(config.baseCode)) {
                        if (!futuresByType[type]) {
                            futuresByType[type] = [];
                        }
                        
                        const lastTradeDate = lasttradedateIndex !== -1 ? row[lasttradedateIndex] : null;
                        const shortname = shortnameIndex !== -1 ? row[shortnameIndex] : secid;
                        
                        futuresByType[type].push({
                            secid: secid,
                            shortname: shortname,
                            lastTradeDate: lastTradeDate ? new Date(lastTradeDate) : null
                        });
                        break;
                    }
                }
            }

            // Для каждого типа сырья находим ближайший активный фьючерс (с самой поздней датой экспирации)
            const now = new Date();
            
            for (const [type, futures] of Object.entries(futuresByType)) {
                if (futures.length === 0) continue;
                
                // Сортируем по дате экспирации (от поздних к ранним)
                const sortedFutures = futures.sort((a, b) => {
                    if (!a.lastTradeDate && !b.lastTradeDate) return 0;
                    if (!a.lastTradeDate) return 1;
                    if (!b.lastTradeDate) return -1;
                    return b.lastTradeDate - a.lastTradeDate;
                });

                // Берем первый активный фьючерс (с самой поздней датой экспирации, которая еще не прошла)
                const activeFuture = sortedFutures.find(f => !f.lastTradeDate || f.lastTradeDate > now) || sortedFutures[0];
                
                if (activeFuture) {
                    futuresMap[type] = activeFuture.secid;
                    console.log(`✅ Найден активный фьючерс для ${type}: ${activeFuture.secid}`);
                }
            }

            console.log(`📊 Найдено ${Object.keys(futuresMap).length} активных фьючерсов на сырье`);
            return futuresMap;
        } catch (error) {
            if (error.name === 'AbortError') {
                console.warn('⚠️ Таймаут запроса к MOEX ISS API для получения списка фьючерсов');
            } else {
                console.warn('⚠️ Ошибка получения списка активных фьючерсов от MOEX ISS API:', error.message);
                console.error('Детали ошибки:', error);
            }
            return {};
        }
    }

    /**
     * Получение данных о ценах на сырье от MOEX ISS API
     * @param {Date} startDate - Начальная дата
     * @param {Date} endDate - Конечная дата
     * @returns {Promise<Array<Object>>} Массив индикаторов
     */
    async fetchMoexCommodityData(startDate = null, endDate = null) {
        if (!this.settings.sources.moex) {
            console.log('ℹ️ Источник Мосбиржи отключен в настройках');
            return [];
        }

        try {
            const indicators = [];
            const now = new Date();
            const start = startDate || new Date(now.getFullYear(), now.getMonth() - 1, 1); // 1 месяц назад по умолчанию
            const end = endDate || now;

            // Форматируем даты для API
            const formatDate = (date) => {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };

            const startDateStr = formatDate(start);
            const endDateStr = formatDate(end);

            // Получаем список активных фьючерсов
            const activeFutures = await this.fetchActiveCommodityFutures();
            
            if (Object.keys(activeFutures).length === 0) {
                console.warn('⚠️ Не найдено активных фьючерсов на сырье');
                return [];
            }

            // Для каждого типа сырья получаем исторические данные
            for (const [commodityType, secid] of Object.entries(activeFutures)) {
                try {
                    const config = this.commodityInstruments[commodityType];
                    if (!config) continue;

                    const url = `https://iss.moex.com/iss/history/engines/futures/markets/forts/securities/${secid}.json?from=${startDateStr}&till=${endDateStr}&iss.meta=off`;
                    console.log(`📡 Запрос исторических данных для ${commodityType} (${secid}): ${url}`);

                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 30000);
                    
                    const response = await fetch(url, {
                        method: 'GET',
                        headers: {
                            'Accept': 'application/json',
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        },
                        signal: controller.signal
                    });

                    clearTimeout(timeoutId);

                    if (!response.ok) {
                        const errorText = await response.text().catch(() => 'Не удалось прочитать ответ');
                        console.warn(`⚠️ MOEX ISS API вернул статус ${response.status} для ${commodityType}: ${errorText.substring(0, 200)}`);
                        continue;
                    }

                    const jsonData = await response.json();
                    
                    // Парсим данные
                    const records = parseMoexCommodityJson(jsonData, commodityType, config.baseCode);
                    
                    if (records.length === 0) {
                        console.log(`ℹ️ Нет данных для ${commodityType} (${secid})`);
                        continue;
                    }

                    // Нормализуем и добавляем индикаторы
                    for (const record of records) {
                        // Получаем предыдущее значение для расчета изменения
                        let previousValue = record.previousValue;
                        if (previousValue === null || previousValue === undefined) {
                            // Пытаемся найти предыдущее значение в БД
                            const previousDate = new Date(record.date.getTime() - 86400000);
                            const previousIndicator = await MacroIndicator.findOne({
                                where: {
                                    indicatorType: 'oil_price',
                                    country: 'RUS',
                                    source: `moex_iss_${commodityType}`,
                                    period: {
                                        [Op.lte]: previousDate
                                    },
                                    metadata: {
                                        commodityType: commodityType
                                    }
                                },
                                order: [['period', 'DESC']],
                                limit: 1
                            });
                            
                            if (previousIndicator) {
                                previousValue = parseFloat(previousIndicator.value);
                            }
                        }

                        const normalized = this.normalizeIndicator('oil_price', {
                            value: record.value,
                            date: record.date,
                            source: `moex_iss_${commodityType}`,
                            previousValue: previousValue,
                            metadata: {
                                ...record.metadata,
                                commodityType: commodityType,
                                commodityCode: config.baseCode,
                                currency: config.currency
                            }
                        });

                        if (normalized) {
                            normalized.source = `moex_iss_${commodityType}`;
                            normalized.country = 'RUS';
                            normalized.indicatorType = 'oil_price';
                            normalized.unit = config.unit;

                            // Валидация перед добавлением
                            const validation = this.validateIndicator(normalized);
                            if (validation.valid) {
                                indicators.push(normalized);
                            } else {
                                console.warn(`⚠️ Индикатор ${commodityType} не прошел валидацию:`, validation.errors);
                            }
                        }
                    }

                    console.log(`✅ Обработано ${records.length} записей для ${commodityType} (${secid})`);
                } catch (error) {
                    console.warn(`⚠️ Ошибка получения данных для ${commodityType}:`, error.message);
                    console.error('Детали ошибки:', error);
                }
            }

            console.log(`✅ Получено ${indicators.length} индикаторов цен на сырье от MOEX ISS API`);
            return indicators;
        } catch (error) {
            console.error('❌ Ошибка получения данных о ценах на сырье от MOEX ISS API:', error);
            return [];
        }
    }

    /**
     * Загрузка индексов в CachedInstrument и получение их свечей
     * @returns {Promise<Object>} Статистика загрузки {loaded: number, errors: Array}
     */
    async loadMarketIndices() {
        try {
            const stats = {
                loaded: 0,
                errors: []
            };

            // Инициализируем сервисы
            if (!CacheService.isInitialized) {
                await CacheService.initialize();
            }

            const TinkoffApiService = (await import('./TinkoffApiService.js')).default;

            console.log('🔄 Начало загрузки рыночных индексов...');

            // Для каждого индекса
            for (const [indexKey, config] of Object.entries(this.marketIndices)) {
                try {
                    // Проверяем, есть ли уже в БД
                    let instrument = await CachedInstrument.findOne({
                        where: {
                            ticker: config.ticker
                        }
                    });

                    if (instrument && instrument.figi) {
                        console.log(`✅ Индекс ${config.ticker} уже есть в БД (FIGI: ${instrument.figi})`);
                        
                        // Обновляем тип на 'index', если нужно
                        if (instrument.instrumentType !== 'index') {
                            await instrument.update({ instrumentType: 'index' });
                            console.log(`   Обновлен тип на 'index'`);
                        }
                    } else {
                        // Ищем через Tinkoff API
                        console.log(`🔍 Поиск индекса ${config.ticker} через Tinkoff API...`);
                        const apiInstrument = await TinkoffApiService.findInstrument(config.ticker);

                        if (!apiInstrument || !apiInstrument.figi) {
                            console.warn(`⚠️ Индекс ${config.ticker} не найден через Tinkoff API`);
                            stats.errors.push(`${config.ticker}: не найден через API`);
                            continue;
                        }

                        // Сохраняем в CachedInstrument
                        const instrumentData = {
                            figi: apiInstrument.figi,
                            ticker: apiInstrument.ticker || config.ticker,
                            name: apiInstrument.name || config.name,
                            currency: apiInstrument.currency || 'RUB',
                            lot: apiInstrument.lot || 1,
                            instrumentType: 'index',
                            apiData: apiInstrument,
                            isActive: true,
                            lastUpdated: new Date()
                        };

                        // Используем upsert для создания или обновления
                        const [cachedInstrument, created] = await CachedInstrument.findOrCreate({
                            where: { figi: apiInstrument.figi },
                            defaults: instrumentData
                        });

                        if (!created) {
                            // Обновляем существующий
                            await cachedInstrument.update(instrumentData);
                        }

                        instrument = cachedInstrument;
                        console.log(`✅ Индекс ${config.ticker} сохранен в БД (FIGI: ${apiInstrument.figi})`);
                        stats.loaded++;
                    }

                    // Загружаем свечи (последние 365 дней для истории)
                    console.log(`📊 Загрузка свечей для индекса ${config.ticker} (FIGI: ${instrument.figi})...`);
                    try {
                        await CacheService.updateCandles(instrument.figi, 'DAY', 365);
                        console.log(`✅ Свечи для ${config.ticker} загружены`);
                    } catch (candleError) {
                        console.warn(`⚠️ Ошибка загрузки свечей для ${config.ticker}:`, candleError.message);
                        stats.errors.push(`${config.ticker}: ошибка загрузки свечей - ${candleError.message}`);
                    }

                } catch (error) {
                    console.error(`❌ Ошибка загрузки индекса ${config.ticker}:`, error);
                    stats.errors.push(`${config.ticker}: ${error.message}`);
                }
            }

            console.log(`✅ Загрузка индексов завершена. Загружено: ${stats.loaded}, Ошибок: ${stats.errors.length}`);
            return stats;

        } catch (error) {
            console.error('❌ Ошибка загрузки рыночных индексов:', error);
            throw error;
        }
    }

    /**
     * Получение данных рыночных индексов через Tinkoff API
     * @param {Date} startDate - Начальная дата
     * @param {Date} endDate - Конечная дата
     * @returns {Promise<Array<Object>>} Массив индикаторов
     */
    async fetchMarketIndexData(startDate = null, endDate = null) {
        try {
            const indicators = [];
            const now = new Date();
            const start = startDate || new Date(now.getFullYear(), now.getMonth() - 1, 1); // 1 месяц назад по умолчанию
            const end = endDate || now;

            // Инициализируем CacheService если нужно
            if (!CacheService.isInitialized) {
                await CacheService.initialize();
            }

            // Для каждого индекса получаем данные
            for (const [indexKey, config] of Object.entries(this.marketIndices)) {
                try {
                    // Находим инструмент по ticker
                    const instrument = await CachedInstrument.findOne({
                        where: {
                            ticker: config.ticker,
                            instrumentType: 'index'
                        }
                    });

                    if (!instrument || !instrument.figi) {
                        console.warn(`⚠️ Индекс ${config.ticker} не найден в БД`);
                        continue;
                    }

                    // Получаем свечи через CacheService (skipUpdate=true, чтобы использовать только кеш)
                    const candles = await CacheService.getCandles(instrument.figi, 'DAY', Math.ceil((end - start) / (1000 * 60 * 60 * 24)), true);

                    if (!candles || candles.length === 0) {
                        console.warn(`⚠️ Нет свечей для индекса ${config.ticker}`);
                        continue;
                    }

                    // Фильтруем свечи по датам
                    const filteredCandles = candles.filter(c => {
                        const candleDate = new Date(c.time);
                        return candleDate >= start && candleDate <= end;
                    });

                    if (filteredCandles.length === 0) {
                        console.warn(`⚠️ Нет свечей для индекса ${config.ticker} в указанном периоде`);
                        continue;
                    }

                    // Сохраняем каждую свечу как индикатор
                    for (const candle of filteredCandles) {
                        const candleDate = new Date(candle.time);
                        const closePrice = parseFloat(candle.close);

                        if (isNaN(closePrice) || closePrice <= 0) {
                            continue;
                        }

                        // Получаем предыдущее значение для расчета изменения
                        const previousIndicator = await MacroIndicator.findOne({
                            where: {
                                indicatorType: 'oil_price', // Временно используем oil_price, пока не добавлен market_index
                                country: 'RUS',
                                source: config.source,
                                period: { [Op.lt]: candleDate }
                            },
                            order: [['period', 'DESC']],
                            limit: 1
                        });

                        const previousValue = previousIndicator ? parseFloat(previousIndicator.value) : null;
                        const change = previousValue ? ((closePrice - previousValue) / previousValue) * 100 : null;

                        const indicatorData = {
                            indicatorType: 'oil_price', // Временно используем oil_price
                            source: config.source,
                            value: closePrice,
                            period: candleDate,
                            periodType: 'daily',
                            unit: 'absolute',
                            country: 'RUS',
                            metadata: {
                                indexName: config.name,
                                ticker: config.ticker,
                                figi: instrument.figi,
                                change: change,
                                previousValue: previousValue
                            }
                        };

                        // Валидация перед добавлением
                        const validation = this.validateIndicator(indicatorData);
                        if (validation.valid) {
                            indicators.push(indicatorData);
                        }
                    }

                    console.log(`✅ Обработано ${filteredCandles.length} записей для индекса ${config.ticker}`);
                } catch (error) {
                    console.warn(`⚠️ Ошибка получения данных для индекса ${config.ticker}:`, error.message);
                    console.error('Детали ошибки:', error);
                }
            }

            console.log(`✅ Получено ${indicators.length} индикаторов рыночных индексов от Tinkoff API`);
            return indicators;
        } catch (error) {
            console.error('❌ Ошибка получения данных рыночных индексов:', error);
            return [];
        }
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
            moexCommodity: { fetched: 0, saved: 0, errors: [] },
            marketIndices: { fetched: 0, saved: 0, errors: [] },
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

            // 3. Мосбиржа (индекс волатильности)
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

                // 3.1. Мосбиржа - цены на сырье (MOEX ISS API)
                try {
                    const commodityIndicators = await this.fetchMoexCommodityData(startDate, endDate);
                    stats.moexCommodity.fetched = commodityIndicators.length;
                    const saved = await this.bulkSaveIndicators(commodityIndicators);
                    stats.moexCommodity.saved = saved;
                    stats.total.fetched += commodityIndicators.length;
                    stats.total.saved += saved;
                } catch (error) {
                    stats.moexCommodity.errors.push(error.message);
                    console.error('❌ Ошибка обновления данных о ценах на сырье от MOEX ISS API:', error);
                }
            }

            // 4. Рыночные индексы (IMOEX, RTS) через Tinkoff API
            try {
                const indexIndicators = await this.fetchMarketIndexData(startDate, endDate);
                stats.marketIndices.fetched = indexIndicators.length;
                const saved = await this.bulkSaveIndicators(indexIndicators);
                stats.marketIndices.saved = saved;
                stats.total.fetched += indexIndicators.length;
                stats.total.saved += saved;
            } catch (error) {
                stats.marketIndices.errors.push(error.message);
                console.error('❌ Ошибка обновления данных рыночных индексов:', error);
            }

            // Очищаем кеш после обновления
            this.clearCache();
            
            // Сохраняем статистику (обновляем существующую структуру)
            this.updateStats.cbr = stats.cbr;
            this.updateStats.rosstat = stats.rosstat;
            this.updateStats.moex = stats.moex;
            this.updateStats.moexCommodity = stats.moexCommodity;
            this.updateStats.marketIndices = stats.marketIndices;
            this.updateStats.total = stats.total;
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

