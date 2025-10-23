import CachedInstrument from '../models/CachedInstrument.js';
import CachedCandle from '../models/CachedCandle.js';
import TinkoffApiService from './TinkoffApiService.js';
// import DividendService from './DividendService.js'; // Временно отключено
import { Op } from 'sequelize';

class CacheService {
    constructor() {
        this.cacheTimeout = 6 * 60 * 60 * 1000; // 6 hours in milliseconds
        this.isInitialized = false;
        this.lastFetchMap = new Map(); // key: `${figi}:${interval}` -> timestamp
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        try {
            console.log('🚀 Инициализация CacheService...');
            this.isInitialized = true;
            console.log('✅ CacheService инициализирован');
        } catch (error) {
            console.error('❌ Ошибка инициализации CacheService:', error);
            throw error;
        }
    }

    // Кеширование инструментов (акций) - УПРОЩЕННАЯ ВЕРСИЯ
    async cacheInstruments() {
        try {
            console.log('Starting instruments cache update...');
            const response = await TinkoffApiService.getStocks();

            if (!response.instruments) {
                console.log('No instruments in response, using empty array');
                response.instruments = [];
            }

            let cachedCount = 0;
            // Дедупликация инструментов по FIGI
            const seenFigi = new Set();
            const instruments = response.instruments
                .filter(i => i && i.figi && i.ticker)
                .filter(i => {
                    if (seenFigi.has(i.figi)) return false;
                    seenFigi.add(i.figi);
                    return true;
                })

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

            for (const instrument of instruments) { // Ограничиваем для теста
                try {
                    // Пропускаем инструменты без FIGI или тикера
                    if (!instrument.figi || !instrument.ticker) {
                        continue;
                    }

                    // Берем только инструменты в рублях (российские)
                    if (!instrument.currency || instrument.currency.toLowerCase() !== 'rub') {
                        continue;
                    }

                    // Пропускаем запрос дивидендов для всех инструментов, чтобы избежать rate limiting
                    // Дивиденды можно запрашивать отдельно по требованию
                    let dividendYield = null;

                    const priceEntry = priceMap[instrument.figi];

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
                        apiData: instrument,
                        lastUpdated: new Date()
                    });

                    // Добавляем инструмент в приоритетный список для дивидендов
                    // DividendService.addPriorityInstrument(instrument.figi); // Временно отключено

                    cachedCount++;
                    console.log(`Cached instrument: ${instrument.ticker}`);

                    // Небольшая задержка чтобы не перегружать API
                    await new Promise(resolve => setTimeout(resolve, 100));

                } catch (error) {
                    console.error(`Error caching instrument ${instrument.ticker}:`, error.message);
                }
            }

            console.log(`Successfully cached ${cachedCount} instruments`);
            return response.instruments;
        } catch (error) {
            console.error('Error caching instruments:', error);
            // Не бросаем ошибку, чтобы сервер мог запуститься
            return [];
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
                console.log(`Cache miss or outdated for ${figi}, updating...`);
                try {
                    await this.cacheInstruments();
                    instrument = await CachedInstrument.findOne({ where: { figi } });
                } catch (cacheError) {
                    console.warn(`Failed to update cache for ${figi}:`, cacheError.message);
                    // Возвращаем старые данные, если они есть, или null
                    if (!instrument) {
                        console.warn(`No cached data available for ${figi}`);
                        return null;
                    }
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
    async getAllInstruments(limit = 100) {
        try {
            const instruments = await CachedInstrument.findAll({
                where: { currency: 'rub' },
                limit: limit,
                order: [['ticker', 'ASC']]
            });

            // ВАЖНО: Не дергаем внешнее API из этого метода.
            // Обновление кеша выполняет планировщик или ручной POST /api/market/refresh.
            return instruments;
        } catch (error) {
            console.error('Error getting all instruments:', error);
            // Возвращаем пустой массив вместо выброса ошибки
            return [];
        }
    }

    // Кеширование свечей для инструмента (append/upsert без уничтожения старых записей)
    async cacheCandles(figi, interval = 'DAY', days = 180) {
        try {
            // Минимальное окно запроса: 30 дней, чтобы избегать пустых ответов
            const minDays = 30;
            const effectiveDays = Math.max(days || 0, minDays);

            // Троттлинг запросов: не чаще раза в 60 секунд на figi+interval
            const key = `${figi}:${interval}`;
            const nowTs = Date.now();
            const lastTs = this.lastFetchMap.get(key) || 0;
            if (nowTs - lastTs < 60000) {
                console.log(`⏱️ Skipping frequent fetch for ${key} (last fetch: ${new Date(lastTs).toISOString()})`);
                return [];
            }
            
            console.log(`🔄 Starting cache for ${figi} (${interval}) - ${effectiveDays} days`);
            this.lastFetchMap.set(key, nowTs);

            const to = new Date();
            const from = new Date();
            from.setDate(from.getDate() - effectiveDays);

            const candlesFromApi = await this.fetchCandlesRangeBatched(figi, interval, from, to);
            if (!Array.isArray(candlesFromApi) || candlesFromApi.length === 0) {
                console.log('No candles in response');
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
                await CachedCandle.bulkCreate(toInsert);
                console.log(`Cached ${toInsert.length} new candles for ${figi} (${interval})`);
            } else {
                console.log(`No new candles to cache for ${figi} (${interval})`);
            }

            return toInsert;
        } catch (error) {
            console.error(`Error caching candles for ${figi}:`, error);
            return [];
        }
    }

    // Батч-выгрузка свечей из API по диапазону
    async fetchCandlesRangeBatched(figi, interval, from, to) {
        const chunkDays = 365; // грузим по 1 году
        let cursor = new Date(from);
        const all = [];
        let iterationCount = 0;
        const maxIterations = 10; // Максимум 10 итераций для предотвращения бесконечного цикла

        console.log(`🔄 Fetching candles for ${figi} from ${from.toISOString()} to ${to.toISOString()}`);

        while (cursor < to && iterationCount < maxIterations) {
            iterationCount++;
            
            const next = new Date(cursor);
            next.setDate(next.getDate() + chunkDays);
            if (next > to) next.setTime(to.getTime());

            console.log(`📊 Iteration ${iterationCount}: fetching ${figi} from ${cursor.toISOString()} to ${next.toISOString()}`);

            try {
                const resp = await TinkoffApiService.getCandles(figi, cursor, next, interval);
                const candles = Array.isArray(resp?.candles) ? resp.candles : [];
                
                if (candles.length === 0) {
                    console.log(`⚠️ No candles returned for ${figi}, moving cursor forward`);
                    // если пусто, сдвигаем курсор, чтобы не зациклиться
                    cursor.setDate(cursor.getDate() + chunkDays);
                } else {
                    console.log(`✅ Got ${candles.length} candles for ${figi}`);
                    all.push(...candles);
                    // ставим курсор к последней свече + 1 день
                    const lastTime = new Date(candles[candles.length - 1].time);
                    cursor = new Date(lastTime.getTime() + 24 * 60 * 60 * 1000); // +1 день
                }
            } catch (error) {
                console.error(`❌ Error fetching candles for ${figi}:`, error.message);
                // При ошибке сдвигаем курсор и продолжаем
                cursor.setDate(cursor.getDate() + chunkDays);
            }
        }

        if (iterationCount >= maxIterations) {
            console.warn(`⚠️ Reached max iterations (${maxIterations}) for ${figi}, stopping`);
        }

        console.log(`✅ Total candles fetched for ${figi}: ${all.length}`);
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
    async updateCandles(figi, interval = 'DAY', days = 180) {
        return await this.cacheCandles(figi, interval, days);
    }

    // Получение свечей из кеша (с догрузкой при дефиците)
    async getCandles(figi, interval = 'DAY', days = 180) {
        try {
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

            // Если данных нет или их мало/обрезаны, догружаем историю
            const minRequired = 100;
            const earliest = candles[0]?.time ? new Date(candles[0].time) : null;
            const rangeInsufficient = candles.length < minRequired || (earliest && earliest > from);
            if (candles.length === 0 || rangeInsufficient) {
                const extendDays = days * 3;
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
}

export default new CacheService();