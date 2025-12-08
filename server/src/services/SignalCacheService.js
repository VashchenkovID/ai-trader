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
            // Пробуем найти в кэше инструментов по instrumentUid (может быть сохранен в apiData)
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

            if (instrument) {
                return instrument.figi;
            }

            // Если не нашли в кэше, пробуем получить через API
            // Определяем тип идентификатора: UUID или FIGI
            const isUuid = this.isUUID(instrumentUid);
            
            try {
                let apiInstrument = null;
                
                if (isUuid) {
                    // Если это UUID, используем метод для UID
                    apiInstrument = await TinkoffApiService.getInstrumentByUid(instrumentUid);
                    
                    if (apiInstrument && apiInstrument.figi) {
                        return apiInstrument.figi;
                    }
                    
                    // Если не нашли через UID, пробуем найти в кэше по другим полям
                    // Может быть instrumentUid сохранен в apiData как uid
                    const instrumentByUid = await CachedInstrument.findOne({
                        where: sequelize.where(
                            sequelize.fn('jsonb_extract_path_text', sequelize.col('apiData'), 'uid'),
                            instrumentUid
                        )
                    });
                    
                    if (instrumentByUid && instrumentByUid.figi) {
                        return instrumentByUid.figi;
                    }
                } else {
                    // Если это не UUID, пробуем как FIGI
                    apiInstrument = await TinkoffApiService.getInstrumentByFigi(instrumentUid);
                    
                    if (apiInstrument && apiInstrument.figi) {
                        return apiInstrument.figi;
                    }
                }
            } catch (apiError) {
                // 404 - это нормально, инструмент просто не найден (не логируем)
                if (apiError.message && apiError.message.includes('404')) {
                    return null;
                }
                // Другие ошибки логируем как предупреждение (только если не 404)
                console.warn(`⚠️ Ошибка получения инструмента ${instrumentUid} через API:`, apiError.message);
            }

            return null;
        } catch (error) {
            // Только критические ошибки логируем как ошибку
            if (!error.message || !error.message.includes('404')) {
                console.error(`❌ Критическая ошибка конвертации instrumentUid ${instrumentUid} в FIGI:`, error.message);
            }
            return null;
        }
    }

    /**
     * Сохранение сигналов в БД
     * @param {Array} signals - Массив сигналов от API
     * @returns {Promise<number>} - Количество сохраненных сигналов
     */
    async saveSignals(signals) {
        if (!Array.isArray(signals) || signals.length === 0) {
            return 0;
        }

        let savedCount = 0;
        let updatedCount = 0;
        let skippedCount = 0;

        for (const signal of signals) {
            try {
                // Конвертируем instrumentUid в FIGI если нужно
                let figi = null;
                
                // Сначала проверяем, есть ли figi в самом сигнале
                if (signal.figi) {
                    figi = signal.figi;
                } else if (signal.instrumentUid) {
                    // Пробуем конвертировать instrumentUid в FIGI
                    figi = await this.convertInstrumentUidToFigi(signal.instrumentUid);
                }

                // Проверяем, существует ли сигнал
                const existingSignal = await CachedSignal.findOne({
                    where: { signalId: signal.signalId }
                });

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

                if (existingSignal) {
                    await existingSignal.update(signalData);
                    updatedCount++;
                } else {
                    await CachedSignal.create(signalData);
                    savedCount++;
                    if (!figi) {
                        skippedCount++; // Считаем как пропущенный, если нет FIGI
                    }
                }
            } catch (error) {
                console.error(`❌ Ошибка сохранения сигнала ${signal.signalId}:`, error.message);
                skippedCount++;
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
            const savedCount = await this.saveSignals(signals);

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

