import CachedInstrument from '../models/CachedInstrument.js';
import CachedCandle from '../models/CachedCandle.js';
import TinkoffApiService from './TinkoffApiService.js';
// import DividendService from './DividendService.js'; // Временно отключено
import { Op } from 'sequelize';

class CacheService {
    constructor() {
        this.cacheTimeout = 24 * 60 * 60 * 1000; // 24 hours in milliseconds (оптимизировано для низкой нагрузки)
        this.isInitialized = false;
        this.lastFetchMap = new Map(); // key: `${figi}:${interval}` -> timestamp
        this.cacheInstrumentsInProgress = false; // Флаг для предотвращения параллельных вызовов
        this.lastCacheUpdate = 0; // Время последнего обновления кеша
        this.cacheUpdateCooldown = 5 * 60 * 1000; // Минимальный интервал между обновлениями (5 минут)
    }

    /**
     * Проверка, является ли FIGI тестовым
     * Тестовые FIGI начинаются с TEST_FIGI_ или TEST_
     */
    isTestFigi(figi) {
        if (!figi || typeof figi !== 'string') {
            return false;
        }
        return figi.startsWith('TEST_FIGI_') || figi.startsWith('TEST_');
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        try {
            this.isInitialized = true;
        } catch (error) {
            console.error('❌ Ошибка инициализации CacheService:', error);
            throw error;
        }
    }

    // Кеширование инструментов (акций) - УПРОЩЕННАЯ ВЕРСИЯ
    async cacheInstruments() {
        // Защита от параллельных вызовов и слишком частых обновлений
        if (this.cacheInstrumentsInProgress) {
            return [];
        }
        
        const now = Date.now();
        if (now - this.lastCacheUpdate < this.cacheUpdateCooldown) {
            const secondsAgo = Math.round((now - this.lastCacheUpdate) / 1000);
            return [];
        }
        
        // Устанавливаем флаги ДО начала выполнения, чтобы другие вызовы видели их
        this.cacheInstrumentsInProgress = true;
        this.lastCacheUpdate = now; // Устанавливаем время обновления сразу
        
        try {
            const response = await TinkoffApiService.getStocks();

            if (!response.instruments) {
                response.instruments = [];
            }

            let cachedCount = 0;
            // Дедупликация инструментов по FIGI
            // Фильтрация по стране уже выполнена в TinkoffApiService.getStocks()
            const seenFigi = new Set();
            const instruments = response.instruments
                .filter(i => i && i.figi && i.ticker)
                .filter(i => {
                    if (seenFigi.has(i.figi)) return false;
                    seenFigi.add(i.figi);
                    return true;
                });
            

            // Попробуем получить последние цены пачкой заранее
            let priceMap = {};
            try {
                const figis = Array.from(new Set(instruments.filter(i => i.figi).map(i => i.figi)));
                if (figis.length) {
                    const lastPricesResp = await TinkoffApiService.getLastPrices(figis);
                    (lastPricesResp.lastPrices || []).forEach(lp => {
                        if (lp.price) {
                            const units = parseFloat(lp.price.units || 0);
                            const nano = parseFloat(lp.price.nano || 0);
                            priceMap[lp.figi] = { value: units + nano / 1e9, time: lp.time ? new Date(lp.time) : new Date() };
                        }
                    });
                }
            } catch (e) {
                console.warn('Could not prefetch last prices:', e.message);
            }


            for (const instrument of instruments) {
                try {
                    // Пропускаем инструменты без FIGI или тикера
                    if (!instrument.figi || !instrument.ticker) {
                        continue;
                    }

                    let dividendYield = null;

                    const priceEntry = priceMap[instrument.figi];
                    
                    let instrumentType = 'share'; // По умолчанию для getStocks()
                    if (instrument.instrumentKind) {
                        // Преобразуем 'INSTRUMENT_TYPE_SHARE' -> 'share'
                        const kind = instrument.instrumentKind.toLowerCase();
                        if (kind.includes('share')) instrumentType = 'share';
                        else if (kind.includes('bond')) instrumentType = 'bond';
                        else if (kind.includes('etf')) instrumentType = 'etf';
                        else if (kind.includes('currency')) instrumentType = 'currency';
                        else if (kind.includes('future')) instrumentType = 'future';
                        else if (kind.includes('option')) instrumentType = 'option';
                    } else if (instrument.instrumentType) {
                        instrumentType = instrument.instrumentType.toLowerCase();
                    }
                    
                    let isAccessible = true; // По умолчанию доступен
                    
                    // Если apiTradeAvailableFlag = false, инструмент недоступен через API
                    if (instrument.apiTradeAvailableFlag === false) {
                        isAccessible = false;
                    }
                    
                    // Если buyAvailableFlag = false, инструмент недоступен для покупки
                    if (instrument.buyAvailableFlag === false) {
                        isAccessible = false;
                    }
                    
                    if (instrument.forQualInvestorFlag === true || instrument.forQualifiedInvestorFlag === true) {
                        isAccessible = false;
                    }
                    
                    await CachedInstrument.upsert({
                        figi: instrument.figi,
                        ticker: instrument.ticker,
                        name: instrument.name,
                        currency: instrument.currency,
                        lot: instrument.lot,
                        minPriceIncrement: instrument.minPriceIncrement,
                        sector: instrument.sector || 'other',
                        lastPrice: priceEntry?.value ?? null,
                        lastPriceTime: priceEntry?.time ?? null,
                        dividendYield: dividendYield,
                        instrumentType: instrumentType,
                        isAccessible: isAccessible,
                        apiData: instrument,
                        lastUpdated: new Date()
                    });

                    // Добавляем инструмент в приоритетный список для дивидендов
                    // DividendService.addPriorityInstrument(instrument.figi); // Временно отключено

                    cachedCount++;

                    // Небольшая задержка чтобы не перегружать API
                    await new Promise(resolve => setTimeout(resolve, 100));

                } catch (error) {
                    console.error(`Error caching instrument ${instrument.ticker}:`, error.message);
                }
            }

            return response.instruments;
        } catch (error) {
            console.error('Error caching instruments:', error);
            // Не бросаем ошибку, чтобы сервер мог запуститься
            return [];
        } finally {
            // Сбрасываем флаг в любом случае
            this.cacheInstrumentsInProgress = false;
        }
    }

    // Получение инструмента из кеша с обновлением при необходимости
    async getInstrument(figi, skipUpdate = false) {
        try {
            let instrument = await CachedInstrument.findOne({ where: { figi } });

            // Если skipUpdate = true, просто возвращаем то, что есть в кеше
            if (skipUpdate) {
                return instrument;
            }

            if (!instrument || new Date() - new Date(instrument.lastUpdated) > this.cacheTimeout) {
                // Проверяем флаг перед вызовом cacheInstruments()
                // Если кеш уже обновляется или недавно обновлялся, пропускаем
                if (!this.cacheInstrumentsInProgress) {
                    const now = Date.now();
                    if (now - this.lastCacheUpdate >= this.cacheUpdateCooldown) {
                        try {
                            await this.cacheInstruments();
                            instrument = await CachedInstrument.findOne({ where: { figi } });
                        } catch (cacheError) {
                            console.warn(`Failed to update cache for ${figi}:`, cacheError.message);
                        }
                    }
                }
                
                // Если инструмент все еще не найден, возвращаем null или старые данные
                if (!instrument) {
                    console.warn(`No cached data available for ${figi}`);
                    return null;
                }
            }

            return instrument;
        } catch (error) {
            console.error('Error getting instrument from cache:', error);
            // Не бросаем ошибку, возвращаем null для graceful degradation
            return null;
        }
    }

    // Получение всех инструментов из кеша
    // ВАЖНО: Этот метод используется для обучения, поэтому возвращает ВСЕ инструменты
    // (включая те, что требуют квалифицированного инвестора)
    // Для рекомендаций используйте getAccessibleInstruments()
    async getAllInstruments(limit = null) {
        try {
            const whereClause = {
                [Op.or]: [
                    { currency: 'RUB' },
                    { currency: 'rub' },
                    { currency: null } // Для старых записей без валюты
                ]
            };
            
            const queryOptions = {
                where: whereClause,
                order: [['ticker', 'ASC']]
            };
            
            // Добавляем лимит только если он явно указан
            if (limit !== null && limit > 0) {
                queryOptions.limit = limit;
            }
            
            const instruments = await CachedInstrument.findAll(queryOptions);

            // ВАЖНО: Не дергаем внешнее API из этого метода.
            // Обновление кеша выполняет планировщик или ручной POST /api/market/refresh.
            return instruments;
        } catch (error) {
            console.error('Error getting all instruments:', error);
            // Возвращаем пустой массив вместо выброса ошибки
            return [];
        }
    }

    // Получение только доступных инструментов (без требования квалифицированного инвестора)
    // Используется для рекомендаций, но НЕ для обучения
    // Обучение должно использовать getAllInstruments() для работы со всеми данными
    async getAccessibleInstruments(limit = null) {
        try {
            const whereClause = {
                [Op.or]: [
                    { currency: 'RUB' },
                    { currency: 'rub' },
                    { currency: null } // Для старых записей без валюты
                ],
                isAccessible: true // Только доступные инструменты (не требуют квалифицированного инвестора)
            };
            
            const queryOptions = {
                where: whereClause,
                order: [['ticker', 'ASC']]
            };
            
            // Добавляем лимит только если он явно указан
            if (limit !== null && limit > 0) {
                queryOptions.limit = limit;
            }
            
            const instruments = await CachedInstrument.findAll(queryOptions);
            return instruments;
        } catch (error) {
            console.error('Error getting accessible instruments:', error);
            // Возвращаем пустой массив вместо выброса ошибки
            return [];
        }
    }

    // Кеширование свечей для инструмента (append/upsert без уничтожения старых записей)
    async cacheCandles(figi, interval = 'DAY', days = 365) {
        try {
            // Пропускаем запросы к API для тестовых FIGI
            if (this.isTestFigi(figi)) {
                return [];
            }

            // Минимальное окно запроса: 30 дней, чтобы избегать пустых ответов
            const minDays = 30;
            const effectiveDays = Math.max(days || 0, minDays);

            // Троттлинг запросов: не чаще раза в 60 секунд на figi+interval
            const key = `${figi}:${interval}`;
            const nowTs = Date.now();
            const lastTs = this.lastFetchMap.get(key) || 0;
            if (nowTs - lastTs < 60000) {
                return [];
            }
            
            this.lastFetchMap.set(key, nowTs);

            const to = new Date();
            const from = new Date();
            from.setDate(from.getDate() - effectiveDays);

            const candlesFromApi = await this.fetchCandlesRangeBatched(figi, interval, from, to);
            if (!Array.isArray(candlesFromApi) || candlesFromApi.length === 0) {
                return [];
            }

            const candleData = candlesFromApi.map(candle => ({
                figi: figi,
                interval: interval,
                open: this.convertToFloat(candle.open),
                close: this.convertToFloat(candle.close),
                high: this.convertToFloat(candle.high),
                low: this.convertToFloat(candle.low),
                volume: candle.volume || 0,
                time: new Date(candle.time)
            }));

            // Получаем существующие таймстемпы для предотвращения дубликатов
            const existing = await CachedCandle.findAll({
                where: {
                    figi,
                    interval,
                    time: { [Op.between]: [from, to] }
                },
                attributes: ['time']
            });
            const existingTimes = new Set(existing.map(e => new Date(e.time).getTime()));

            const toInsert = candleData.filter(c => !existingTimes.has(c.time.getTime()));
            if (toInsert.length > 0) {
                // Используем bulkCreate с ignoreDuplicates для предотвращения ошибок на уровне БД
                try {
                    await CachedCandle.bulkCreate(toInsert, {
                        ignoreDuplicates: true // Игнорируем дубликаты на уровне БД, не логируем ошибки
                    });
                } catch (bulkError) {
                    // Если bulkCreate не поддерживает ignoreDuplicates, используем индивидуальную вставку
                    if (bulkError.message?.includes('ignoreDuplicates') || 
                        bulkError.message?.includes('not supported')) {
                        // Fallback: индивидуальная вставка с обработкой дубликатов
                        let insertedCount = 0;
                        for (const candle of toInsert) {
                            try {
                                await CachedCandle.create(candle);
                                insertedCount++;
                            } catch (createError) {
                                // Игнорируем ошибки уникальности - это нормально, данные уже есть в БД
                                if (createError.name !== 'SequelizeUniqueConstraintError' && 
                                    createError.code !== '23505' &&
                                    !createError.message?.includes('unique') &&
                                    !createError.message?.includes('уникальности')) {
                                    // Логируем только другие ошибки
                                    console.warn(`⚠️ Error inserting candle for ${figi} at ${candle.time}:`, createError.message);
                                }
                            }
                        }
                        if (insertedCount > 0) {
                            console.debug(`✅ Inserted ${insertedCount} candles for ${figi} (${toInsert.length - insertedCount} duplicates skipped)`);
                        }
                    } else {
                        console.error(`❌ Error in bulkCreate for ${figi}:`, bulkError.message);
                    }
                }
                
                // Фаза 3, задача 3.1.2: Инвалидация кеша индикаторов при обновлении данных
                // Инвалидируем кеш для всех обновленных инструментов
                try {
                    const OptimizedAnalysisService = (await import('./OptimizedAnalysisService.js')).default;
                    if (OptimizedAnalysisService && OptimizedAnalysisService.invalidateIndicatorsCache) {
                        OptimizedAnalysisService.invalidateIndicatorsCache(figi, interval);
                    }
                } catch (invalidateError) {
                    // Игнорируем ошибки инвалидации кеша - это не критично
                }
            }

            return toInsert;
        } catch (error) {
            // Игнорируем ошибки уникальности - это нормально, данные уже есть
            if (error.name === 'SequelizeUniqueConstraintError' || 
                error.code === '23505' ||
                error.message?.includes('unique') ||
                error.message?.includes('уникальности')) {
                return [];
            }
            console.error(`Error caching candles for ${figi}:`, error);
            return [];
        }
    }

    // Батч-выгрузка свечей из API по диапазону
    async fetchCandlesRangeBatched(figi, interval, from, to) {
        // Пропускаем запросы к API для тестовых FIGI
        if (this.isTestFigi(figi)) {
            return [];
        }

        const chunkDays = 365; // грузим по 1 году
        let cursor = new Date(from);
        const all = [];
        let iterationCount = 0;
        const maxIterations = 10; // Максимум 10 итераций для предотвращения бесконечного цикла
        let rateLimitErrors = 0;
        const maxRateLimitErrors = 3; // Максимум 3 ошибки rate limit подряд

        while (cursor < to && iterationCount < maxIterations) {
            iterationCount++;
            
            const next = new Date(cursor);
            next.setDate(next.getDate() + chunkDays);
            if (next > to) next.setTime(to.getTime());

            try {
                // Добавляем задержку между запросами для избежания rate limit
                if (iterationCount > 1) {
                    await new Promise(resolve => setTimeout(resolve, 1500)); // 1.5 секунды между запросами
                }
                
                const resp = await TinkoffApiService.getCandles(figi, cursor, next, interval);
                const candles = Array.isArray(resp?.candles) ? resp.candles : [];
                
                // Сбрасываем счетчик ошибок rate limit при успешном запросе
                rateLimitErrors = 0;
                
                if (candles.length === 0) {
                    // если пусто, сдвигаем курсор, чтобы не зациклиться
                    cursor.setDate(cursor.getDate() + chunkDays);
                } else {
                    all.push(...candles);
                    // ставим курсор к последней свече + 1 день
                    const lastTime = new Date(candles[candles.length - 1].time);
                    cursor = new Date(lastTime.getTime() + 24 * 60 * 60 * 1000); // +1 день
                }
            } catch (error) {
                // Проверяем, является ли это ошибкой rate limit
                if (error.message && error.message.includes('Rate limit exceeded')) {
                    rateLimitErrors++;
                    console.warn(`⚠️ Rate limit error ${rateLimitErrors}/${maxRateLimitErrors} for ${figi}`);
                    
                    // Если слишком много ошибок rate limit подряд, останавливаемся
                    if (rateLimitErrors >= maxRateLimitErrors) {
                        console.warn(`⚠️ Too many rate limit errors for ${figi}, stopping batch fetch. Returning ${all.length} candles collected so far.`);
                        break;
                    }
                    
                    // При rate limit делаем более длинную паузу перед следующим запросом
                    console.warn(`⏳ Waiting 10 seconds before retrying due to rate limit...`);
                    await new Promise(resolve => setTimeout(resolve, 10000));
                    // Не сдвигаем курсор, пытаемся повторить тот же запрос
                    continue;
                } else {
                    // Проверяем, является ли это ошибкой "Instrument not found" (404)
                    const isNotFoundError = error.message && (
                        error.message.includes('Instrument not found') ||
                        error.message.includes('404') ||
                        (error.error && typeof error.error === 'string' && error.error.includes('"code":5'))
                    );
                    
                    if (isNotFoundError) {
                        // Для тестовых FIGI или несуществующих инструментов просто возвращаем пустой массив
                        return [];
                    }
                    
                    // Для других ошибок просто логируем и продолжаем
                    console.error(`❌ Error fetching candles for ${figi}:`, error.message);
                    cursor.setDate(cursor.getDate() + chunkDays);
                }
            }
        }

        if (iterationCount >= maxIterations) {
            console.warn(`⚠️ Reached max iterations (${maxIterations}) for ${figi}, stopping`);
        }

        return all;
    }

    // Вспомогательная функция для конвертации цен
    convertToFloat(priceObject) {
        if (!priceObject) return 0;
        const units = parseFloat(priceObject.units || 0);
        const nano = parseFloat(priceObject.nano || 0);
        return units + (nano / 1000000000);
    }

    // Обновление свечей для инструмента (алиас для cacheCandles)
    async updateCandles(figi, interval = 'DAY', days = 365) {
        return await this.cacheCandles(figi, interval, days);
    }

    /**
     * Инкрементальное обновление свечей (только новые свечи с последнего обновления)
     */
    async updateCandlesIncremental(figi, interval = 'DAY', days = 30) {
        try {
            // Получаем последнюю свечу из кеша
            const lastCandle = await CachedCandle.findOne({
                where: {
                    figi,
                    interval
                },
                order: [['time', 'DESC']]
            });

            // Если есть последняя свеча, загружаем только новые свечи
            if (lastCandle) {
                const from = new Date(lastCandle.time);
                from.setDate(from.getDate() - 1); // Начинаем с 1 дня до последней свечи (на случай пропусков)
                const to = new Date();
                
                const candlesFromApi = await this.fetchCandlesRangeBatched(figi, interval, from, to);
                if (!Array.isArray(candlesFromApi) || candlesFromApi.length === 0) {
                    return [];
                }

                const candleData = candlesFromApi.map(candle => ({
                    figi: figi,
                    interval: interval,
                    open: this.convertToFloat(candle.open),
                    close: this.convertToFloat(candle.close),
                    high: this.convertToFloat(candle.high),
                    low: this.convertToFloat(candle.low),
                    volume: candle.volume || 0,
                    time: new Date(candle.time)
                }));

                // Получаем существующие таймстемпы для предотвращения дубликатов
                const existing = await CachedCandle.findAll({
                    where: {
                        figi,
                        interval,
                        time: { [Op.between]: [from, to] }
                    },
                    attributes: ['time']
                });
                const existingTimes = new Set(existing.map(e => new Date(e.time).getTime()));

                const toInsert = candleData.filter(c => !existingTimes.has(c.time.getTime()));
                if (toInsert.length > 0) {
                    // Используем bulkCreate с ignoreDuplicates для предотвращения ошибок на уровне БД
                    try {
                        await CachedCandle.bulkCreate(toInsert, {
                            ignoreDuplicates: true // Игнорируем дубликаты на уровне БД, не логируем ошибки
                        });
                    } catch (bulkError) {
                        // Если bulkCreate не поддерживает ignoreDuplicates, используем индивидуальную вставку
                        if (bulkError.message?.includes('ignoreDuplicates') || 
                            bulkError.message?.includes('not supported')) {
                            // Fallback: индивидуальная вставка с обработкой дубликатов
                            let insertedCount = 0;
                            for (const candle of toInsert) {
                                try {
                                    await CachedCandle.create(candle);
                                    insertedCount++;
                                } catch (createError) {
                                    // Игнорируем ошибки уникальности - это нормально при race condition
                                    if (createError.name !== 'SequelizeUniqueConstraintError' && 
                                        createError.code !== '23505' &&
                                        !createError.message?.includes('unique') &&
                                        !createError.message?.includes('уникальности')) {
                                        console.warn(`⚠️ Error inserting candle for ${figi} at ${candle.time}:`, createError.message);
                                    }
                                }
                            }
                            if (insertedCount > 0) {
                                console.debug(`✅ Inserted ${insertedCount} candles for ${figi} (${toInsert.length - insertedCount} duplicates skipped)`);
                            }
                        } else {
                            // Если это не ошибка ignoreDuplicates, логируем
                            console.error(`❌ Error in bulkCreate for ${figi}:`, bulkError.message);
                        }
                    }
                    
                    // Фаза 3, задача 3.1.2: Инвалидация кеша индикаторов при обновлении данных
                    // Инвалидируем кеш для всех обновленных инструментов
                    const uniqueFigis = new Set(toInsert.map(c => c.figi));
                    for (const figi of uniqueFigis) {
                        try {
                            const OptimizedAnalysisService = (await import('./OptimizedAnalysisService.js')).default;
                            if (OptimizedAnalysisService && OptimizedAnalysisService.invalidateIndicatorsCache) {
                                OptimizedAnalysisService.invalidateIndicatorsCache(figi, interval);
                            }
                        } catch (invalidateError) {
                            // Игнорируем ошибки инвалидации кеша
                            console.debug(`Debug: Could not invalidate cache for ${figi}:`, invalidateError.message);
                        }
                    }
                }

                return toInsert;
            } else {
                // Если нет последней свечи, делаем полное кеширование
                return await this.cacheCandles(figi, interval, days);
            }
        } catch (error) {
            console.error(`❌ Error in incremental cache update for ${figi}:`, error);
            return [];
        }
    }

    // Получение свечей из кеша (с догрузкой при дефиците)
    async getCandles(figi, interval = 'DAY', days = 365, skipUpdate = false) {
        try {
            // Для тестовых FIGI возвращаем пустой массив без запросов к API
            if (this.isTestFigi(figi)) {
                // Проверяем, есть ли данные в кеше
                const from = new Date();
                from.setDate(from.getDate() - days);
                const candles = await CachedCandle.findAll({
                    where: {
                        figi: figi,
                        interval: interval,
                        time: {
                            [Op.gte]: from
                        }
                    },
                    order: [['time', 'ASC']]
                });
                return candles;
            }

            const from = new Date();
            from.setDate(from.getDate() - days);

            let candles = await CachedCandle.findAll({
                where: {
                    figi: figi,
                    interval: interval,
                    time: {
                        [Op.gte]: from
                    }
                },
                order: [['time', 'ASC']]
            });

            // Если skipUpdate = true (режим обучения), не делаем запросы к API - используем только кеш
            if (skipUpdate) {
                return candles;
            }

            // Если данных нет или их мало/обрезаны, догружаем историю (только для реальных FIGI)
            const minRequired = Math.max(100, Math.floor(days * 0.8)); // Минимум 80% от запрошенных дней
            const earliest = candles[0]?.time ? new Date(candles[0].time) : null;
            const rangeInsufficient = candles.length < minRequired || (earliest && earliest > from);
            if ((candles.length === 0 || rangeInsufficient) && !this.isTestFigi(figi)) {
                // Увеличиваем период для догрузки, но не более 730 дней (2 года)
                const extendDays = Math.min(days * 2, 730);
                await this.cacheCandles(figi, interval, extendDays);
                candles = await CachedCandle.findAll({
                    where: {
                        figi: figi,
                        interval: interval,
                        time: {
                            [Op.gte]: from
                        }
                    },
                    order: [['time', 'ASC']]
                });
            }

            return candles;
        } catch (error) {
            console.error('Error getting candles from cache:', error);
            return [];
        }
    }

    /**
     * Обновление всего кеша (инструменты, свечи, сигналы)
     * Вызывает SchedulerService.performCacheUpdate() для полного обновления
     */
    async updateCache() {
        try {
            const SchedulerService = (await import('./SchedulerService.js')).default;
            const result = await SchedulerService.performCacheUpdate();
            
            // После обновления кеша также обновляем сигналы
            try {
                await SchedulerService.performSignalsUpdate();
            } catch (signalsError) {
                console.warn('⚠️ Ошибка обновления сигналов (не критично):', signalsError.message);
                // Не прерываем процесс, если обновление сигналов не удалось
            }
            
            return result;
        } catch (error) {
            console.error('❌ Ошибка обновления кеша:', error);
            throw error;
        }
    }

    /**
     * Получить статистику кеша
     * Возвращает количество инструментов, свечей и сигналов
     */
    async getCacheStats() {
        try {
            const CachedSignal = (await import('../models/CachedSignal.js')).default;
            
            const [totalInstruments, activeInstruments, totalCandles, totalSignals] = await Promise.all([
                CachedInstrument.count(),
                CachedInstrument.count({ where: { isActive: true } }),
                CachedCandle.count(),
                CachedSignal.count().catch(() => 0) // Если ошибка, возвращаем 0
            ]);

            // Получаем информацию о последнем обновлении
            const lastUpdatedInstrument = await CachedInstrument.findOne({
                order: [['lastUpdated', 'DESC']],
                attributes: ['lastUpdated']
            });

            return {
                instruments: {
                    total: totalInstruments,
                    active: activeInstruments,
                    inactive: totalInstruments - activeInstruments
                },
                candles: {
                    total: totalCandles
                },
                signals: {
                    total: totalSignals
                },
                lastUpdated: lastUpdatedInstrument?.lastUpdated ? new Date(lastUpdatedInstrument.lastUpdated).toISOString() : null,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('❌ Ошибка получения статистики кеша:', error);
            return {
                instruments: { total: 0, active: 0, inactive: 0 },
                candles: { total: 0 },
                signals: { total: 0 },
                lastUpdated: null,
                timestamp: new Date().toISOString(),
                error: error.message
            };
        }
    }
}

export default new CacheService();