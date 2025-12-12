import CachedSignal from '../models/CachedSignal.js';
import TinkoffApiService from './TinkoffApiService.js';
import CachedInstrument from '../models/CachedInstrument.js';
import { Op } from 'sequelize';
import sequelize from '../config/database.js';

class SignalCacheService {
    constructor() {
        this.isInitialized = false;
        this.cacheTimeout = 24 * 60 * 60 * 1000; // 24 часа - сигналы обновляются реже чем свечи
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        try {
            this.isInitialized = true;
        } catch (error) {
            console.error('❌ Ошибка инициализации SignalCacheService:', error);
            throw error;
        }
    }

    /**
     * Проверка, является ли строка UUID
     */
    isUUID(str) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidRegex.test(str);
    }

    /**
     * Конвертация instrumentUid в FIGI
     * @param {string} instrumentUid - UID инструмента от Tinkoff API (может быть UUID или FIGI)
     * @returns {Promise<string|null>} - FIGI инструмента или null
     */
    async convertInstrumentUidToFigi(instrumentUid) {
        try {
            // Проверяем, может быть это уже FIGI (начинается с BBG или TCS)
            if (instrumentUid && (instrumentUid.startsWith('BBG') || instrumentUid.startsWith('TCS'))) {
                return instrumentUid;
            }
            
            // Пробуем найти в кэше инструментов по instrumentUid
            // Может быть сохранен как figi или в apiData.uid
            const instrument = await CachedInstrument.findOne({
                where: {
                    [Op.or]: [
                        { figi: instrumentUid }, // На случай если это уже FIGI
                        // Проверяем в apiData, если там есть instrumentUid
                        sequelize.where(
                            sequelize.fn('jsonb_extract_path_text', sequelize.col('apiData'), 'uid'),
                            instrumentUid
                        )
                    ]
                }
            });

            if (instrument && instrument.figi) {
                return instrument.figi;
            }

            // Если не нашли в кэше, пробуем найти через API используя FindInstrument
            // Это более универсальный метод, чем GetInstrumentBy
            try {
                const apiInstrument = await TinkoffApiService.findInstrument(instrumentUid);
                if (apiInstrument && apiInstrument.figi) {
                    return apiInstrument.figi;
                }
            } catch (apiError) {
                // 404 или "Instrument not found" - это нормально, инструмент просто не найден
                if (!apiError.message || (!apiError.message.includes('404') && !apiError.message.includes('Instrument not found'))) {
                    console.warn(`⚠️ Ошибка поиска инструмента ${instrumentUid} через API:`, apiError.message);
                }
            }

            return null;
        } catch (error) {
            console.error(`❌ Ошибка конвертации instrumentUid ${instrumentUid} в FIGI:`, error.message);
            return null;
        }
    }

    /**
     * Сохранение сигналов в БД
     * @param {Array} signals - Массив сигналов от API
     * @param {string} requestedFigi - FIGI, по которому запрашивались сигналы (fallback)
     * @returns {Promise<number>} - Количество сохраненных сигналов
     */
    async saveSignals(signals, requestedFigi = null) {
        if (!Array.isArray(signals) || signals.length === 0) {
            return 0;
        }

        let savedCount = 0;
        let updatedCount = 0;
        let skippedCount = 0;

        for (const signal of signals) {
            try {
                // Определяем FIGI для сигнала
                let figi = null;
                
                // Приоритет 1: Если в сигнале уже есть figi - используем его
                if (signal.figi) {
                    figi = signal.figi;
                }
                // Приоритет 2: Если instrumentUid выглядит как FIGI (начинается с BBG или TCS) - используем его
                else if (signal.instrumentUid && (signal.instrumentUid.startsWith('BBG') || signal.instrumentUid.startsWith('TCS'))) {
                    figi = signal.instrumentUid;
                }
                // Приоритет 3: Пробуем найти в кэше БД (быстро и без API запросов)
                else if (signal.instrumentUid) {
                    // Сначала проверяем кэш БД - может быть instrumentUid уже сохранен как FIGI или в apiData
                    const cachedInstrument = await CachedInstrument.findOne({
                        where: {
                            [Op.or]: [
                                { figi: signal.instrumentUid },
                                sequelize.where(
                                    sequelize.fn('jsonb_extract_path_text', sequelize.col('apiData'), 'uid'),
                                    signal.instrumentUid
                                )
                            ]
                        }
                    });
                    
                    if (cachedInstrument && cachedInstrument.figi) {
                        figi = cachedInstrument.figi;
                    }
                }
                
                // Приоритет 4: Используем requestedFigi как fallback (исходный FIGI из запроса)
                // Это самый надежный вариант, так как мы запрашивали сигналы именно для этого FIGI
                if (!figi && requestedFigi) {
                    figi = requestedFigi;
                }

                const signalData = {
                    signalId: signal.signalId,
                    strategyId: signal.strategyId,
                    strategyName: signal.strategyName,
                    instrumentUid: signal.instrumentUid,
                    figi: figi, // Может быть null, но сохраняем сигнал
                    createDt: new Date(signal.createDt),
                    endDt: new Date(signal.endDt),
                    direction: signal.direction || 'SIGNAL_DIRECTION_UNSPECIFIED',
                    initialPrice: signal.initialPrice,
                    targetPrice: signal.targetPrice,
                    stoploss: signal.stoploss || { units: "0", nano: 0 },
                    probability: signal.probability || 0,
                    name: signal.name || '',
                    info: signal.info || null
                };

                // Используем findOrCreate для предотвращения race condition
                const [cachedSignal, created] = await CachedSignal.findOrCreate({
                    where: { signalId: signal.signalId },
                    defaults: signalData
                });

                if (!created) {
                    // Обновляем существующий сигнал
                    await cachedSignal.update(signalData);
                    updatedCount++;
                } else {
                    savedCount++;
                    if (!figi) {
                        skippedCount++; // Считаем как пропущенный, если нет FIGI
                    }
                }
            } catch (error) {
                // Игнорируем ошибки уникальности (race condition)
                if (error.name === 'SequelizeUniqueConstraintError' || error.message.includes('cached_signals_signalId_key')) {
                    // Сигнал уже существует, пытаемся обновить
                    try {
                        const existingSignal = await CachedSignal.findOne({
                            where: { signalId: signal.signalId }
                        });
                        if (existingSignal) {
                            await existingSignal.update({
                                strategyId: signal.strategyId,
                                strategyName: signal.strategyName,
                                instrumentUid: signal.instrumentUid,
                                figi: figi,
                                createDt: new Date(signal.createDt),
                                endDt: new Date(signal.endDt),
                                direction: signal.direction || 'SIGNAL_DIRECTION_UNSPECIFIED',
                                initialPrice: signal.initialPrice,
                                targetPrice: signal.targetPrice,
                                stoploss: signal.stoploss || { units: "0", nano: 0 },
                                probability: signal.probability || 0,
                                name: signal.name || '',
                                info: signal.info || null
                            });
                            updatedCount++;
                        }
                    } catch (updateError) {
                        // Игнорируем ошибки обновления при race condition
                    }
                } else {
                    console.error(`❌ Ошибка сохранения сигнала ${signal.signalId}:`, error.message);
                    skippedCount++;
                }
            }
        }

        return savedCount + updatedCount;
    }

    /**
     * Обновление FIGI для существующих сигналов с figi = null
     * @returns {Promise<number>} - Количество обновленных сигналов
     */
    async updateMissingFigi() {
        try {
            // Находим все сигналы без FIGI, но с instrumentUid
            const signalsWithoutFigi = await CachedSignal.findAll({
                where: {
                    figi: null,
                    instrumentUid: { [Op.ne]: null }
                },
                limit: 100 // Ограничиваем для производительности
            });

            if (signalsWithoutFigi.length === 0) {
                return 0;
            }

            let updatedCount = 0;
            let errorCount = 0;

            for (const signal of signalsWithoutFigi) {
                try {
                    const figi = await this.convertInstrumentUidToFigi(signal.instrumentUid);
                    
                    if (figi) {
                        await signal.update({ figi: figi });
                        updatedCount++;
                    }
                } catch (error) {
                    errorCount++;
                    console.error(`❌ Ошибка обновления FIGI для сигнала ${signal.signalId}:`, error.message);
                }
            }

            return updatedCount;
        } catch (error) {
            console.error('❌ Ошибка обновления FIGI для сигналов:', error);
            return 0;
        }
    }

    /**
     * Получение сигналов из API и сохранение в БД
     * @param {string} figi - FIGI инструмента
     * @param {Object} options - Опции запроса
     * @param {Date} options.from - Дата начала периода
     * @param {Date} options.to - Дата окончания периода
     * @returns {Promise<Object>} - Результат с количеством сохраненных сигналов
     */
    async fetchAndCacheSignals(figi, options = {}) {
        try {
            const result = await TinkoffApiService.getSignals(figi, options);

            if (!result.success || !result.data || !result.data.signals) {
                console.warn(`⚠️ Не удалось получить сигналы для ${figi}`);
                return { success: false, savedCount: 0 };
            }

            const signals = result.data.signals;
            // Передаем figi как fallback на случай, если в сигналах нет figi или instrumentUid не конвертируется
            const savedCount = await this.saveSignals(signals, figi);

            return {
                success: true,
                savedCount: savedCount,
                totalSignals: signals.length
            };
        } catch (error) {
            console.error(`❌ Ошибка загрузки и кэширования сигналов для ${figi}:`, error);
            return { success: false, savedCount: 0, error: error.message };
        }
    }

    /**
     * Получение сигналов из БД по FIGI и датам
     * @param {string} figi - FIGI инструмента
     * @param {Object} options - Опции запроса
     * @param {Date} options.from - Дата начала периода
     * @param {Date} options.to - Дата окончания периода
     * @param {string} options.direction - Направление сигнала
     * @param {boolean} options.activeOnly - Только активные сигналы (endDt >= now)
     * @returns {Promise<Array>} - Массив сигналов
     */
    async getSignalsByFigi(figi, options = {}) {
        try {
            const where = {
                figi: figi
            };

            // Фильтр по датам
            if (options.from) {
                where.createDt = {
                    [Op.gte]: options.from instanceof Date ? options.from : new Date(options.from)
                };
            }
            if (options.to) {
                where.endDt = {
                    [Op.lte]: options.to instanceof Date ? options.to : new Date(options.to)
                };
            }

            // Фильтр по направлению
            if (options.direction) {
                where.direction = options.direction;
            }

            // Только активные сигналы
            if (options.activeOnly) {
                where.endDt = {
                    ...where.endDt,
                    [Op.gte]: new Date()
                };
            }

            const signals = await CachedSignal.findAll({
                where: where,
                order: [['createDt', 'DESC']],
                limit: options.limit || 100
            });

            return signals;
        } catch (error) {
            console.error(`❌ Ошибка получения сигналов из БД для ${figi}:`, error);
            return [];
        }
    }

    /**
     * Получение сигналов на конкретную дату
     * @param {string} figi - FIGI инструмента
     * @param {Date} date - Дата для получения сигналов
     * @returns {Promise<Array>} - Массив активных сигналов на эту дату
     */
    async getSignalsByDate(figi, date) {
        try {
            const targetDate = date instanceof Date ? date : new Date(date);

            const signals = await CachedSignal.findAll({
                where: {
                    figi: figi,
                    createDt: {
                        [Op.lte]: targetDate
                    },
                    endDt: {
                        [Op.gte]: targetDate
                    }
                },
                order: [['probability', 'DESC']]
            });

            return signals;
        } catch (error) {
            console.error(`❌ Ошибка получения сигналов на дату ${date} для ${figi}:`, error);
            return [];
        }
    }

    /**
     * Проверка необходимости обновления кэша
     * @param {string} figi - FIGI инструмента
     * @returns {Promise<boolean>} - true если нужно обновить
     */
    async shouldUpdateCache(figi) {
        try {
            const lastSignal = await CachedSignal.findOne({
                where: { figi: figi },
                order: [['updatedAt', 'DESC']]
            });

            if (!lastSignal) {
                return true; // Нет сигналов - нужно загрузить
            }

            const timeSinceUpdate = Date.now() - new Date(lastSignal.updatedAt).getTime();
            return timeSinceUpdate > this.cacheTimeout;
        } catch (error) {
            console.error(`❌ Ошибка проверки необходимости обновления кэша для ${figi}:`, error);
            return true; // В случае ошибки лучше обновить
        }
    }
}

export default new SignalCacheService();

