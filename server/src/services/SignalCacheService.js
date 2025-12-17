import CachedSignal from '../models/CachedSignal.js';
import TinkoffApiService from './TinkoffApiService.js';
import CachedInstrument from '../models/CachedInstrument.js';
import { Op } from 'sequelize';
import sequelize from '../config/database.js';
import OptimizedTelegramService from './OptimizedTelegramService.js';

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
        
        // Группируем сигналы по инструменту для групповой отправки
        const signalsByFigi = new Map(); // figi -> { newSignals: [], updatedSignals: [] }

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
                    
                    // Группируем для отправки (только актуальные)
                    if (!cachedSignal.telegramSent && figi) {
                        if (!signalsByFigi.has(figi)) {
                            signalsByFigi.set(figi, { newSignals: [], updatedSignals: [] });
                        }
                        signalsByFigi.get(figi).updatedSignals.push(cachedSignal);
                    }
                } else {
                    savedCount++;
                    if (!figi) {
                        skippedCount++; // Считаем как пропущенный, если нет FIGI
                    } else {
                        // Группируем для отправки
                        if (!signalsByFigi.has(figi)) {
                            signalsByFigi.set(figi, { newSignals: [], updatedSignals: [] });
                        }
                        signalsByFigi.get(figi).newSignals.push(cachedSignal);
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
                            
                            // Группируем для отправки (только актуальные)
                            if (!existingSignal.telegramSent && figi) {
                                if (!signalsByFigi.has(figi)) {
                                    signalsByFigi.set(figi, { newSignals: [], updatedSignals: [] });
                                }
                                signalsByFigi.get(figi).updatedSignals.push(existingSignal);
                            }
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

        // Отправляем группированные уведомления по инструментам
        await this.sendGroupedSignalsToTelegram(signalsByFigi);

        return savedCount + updatedCount;
    }

    /**
     * Отправка группированных сигналов в Telegram
     * Отправляет сводку по каждому инструменту вместо отдельных сообщений
     * @param {Map} signalsByFigi - Map с ключом figi и значением { newSignals: [], updatedSignals: [] }
     */
    async sendGroupedSignalsToTelegram(signalsByFigi) {
        if (!signalsByFigi || signalsByFigi.size === 0) {
            return;
        }

        // Проверяем, инициализирован ли Telegram сервис
        if (!OptimizedTelegramService.isInitialized) {
            return;
        }

        const CachedInstrument = (await import('../models/CachedInstrument.js')).default;

        for (const [figi, signalGroups] of signalsByFigi.entries()) {
            try {
                const newSignals = signalGroups.newSignals || [];
                const updatedSignals = signalGroups.updatedSignals || [];
                
                // Фильтруем только актуальные сигналы (не старше 1 дня)
                const now = Date.now();
                const maxAge = 1 * 24 * 60 * 60 * 1000; // 1 день (24 часа)
                const maxTimeSinceEnd = 1 * 24 * 60 * 60 * 1000; // 1 день после окончания

                const filterActualSignals = (signals) => {
                    return signals.filter(signal => {
                        const signalAge = now - new Date(signal.createDt).getTime();
                        if (signalAge > maxAge) {
                            // Помечаем как отправленный, но не отправляем
                            signal.update({
                                telegramSent: true,
                                telegramSentAt: new Date()
                            }).catch(() => {});
                            return false;
                        }

                        const endDt = new Date(signal.endDt);
                        const timeSinceEnd = now - endDt.getTime();
                        if (timeSinceEnd > maxTimeSinceEnd) {
                            // Помечаем как отправленный, но не отправляем
                            signal.update({
                                telegramSent: true,
                                telegramSentAt: new Date()
                            }).catch(() => {});
                            return false;
                        }

                        return true;
                    });
                };

                const actualNewSignals = filterActualSignals(newSignals);
                const actualUpdatedSignals = filterActualSignals(updatedSignals);
                const totalActualSignals = actualNewSignals.length + actualUpdatedSignals.length;

                if (totalActualSignals === 0) {
                    continue; // Нет актуальных сигналов для этого инструмента
                }

                // Получаем информацию об инструменте
                const instrument = await CachedInstrument.findOne({
                    where: { figi: figi },
                    attributes: ['ticker', 'name']
                });

                const ticker = instrument?.ticker || figi;
                const instrumentName = instrument?.name || 'Неизвестный инструмент';

                // Формируем сводное сообщение
                let message = `📊 <b>НОВЫЕ СИГНАЛЫ ДЛЯ ИНСТРУМЕНТА</b>\n\n`;
                message += `📈 <b>Инструмент:</b> ${ticker} (${instrumentName})\n`;
                message += `🔔 <b>Всего новых сигналов:</b> ${totalActualSignals}\n`;
                
                if (actualNewSignals.length > 0) {
                    message += `✅ Новых: ${actualNewSignals.length}\n`;
                }
                if (actualUpdatedSignals.length > 0) {
                    message += `🔄 Обновленных: ${actualUpdatedSignals.length}\n`;
                }
                
                message += `\n`;

                // Добавляем краткую информацию о первых 3 сигналах (самых актуальных)
                const topSignals = [...actualNewSignals, ...actualUpdatedSignals]
                    .sort((a, b) => new Date(b.createDt) - new Date(a.createDt))
                    .slice(0, 3);

                if (topSignals.length > 0) {
                    message += `📋 <b>Последние сигналы:</b>\n`;
                    for (const signal of topSignals) {
                        const direction = signal.direction === 'SIGNAL_DIRECTION_BUY' ? '🟢 ПОКУПКА' : 
                                       signal.direction === 'SIGNAL_DIRECTION_SELL' ? '🔴 ПРОДАЖА' : '⚪';
                        const signalName = signal.name || 'Сигнал';
                        const probability = signal.probability ? `${signal.probability}%` : 'N/A';
                        message += `• ${direction} ${signalName} (вероятность: ${probability})\n`;
                    }
                    
                    if (totalActualSignals > 3) {
                        message += `\n... и еще ${totalActualSignals - 3} сигналов\n`;
                    }
                }

                message += `\n⏰ Время: ${new Date().toLocaleString('ru-RU')}`;

                // Отправляем группированное сообщение
                await OptimizedTelegramService.sendAlert('TRADING_SIGNAL', message, 'info');

                // Помечаем все сигналы как отправленные
                const allSignals = [...actualNewSignals, ...actualUpdatedSignals];
                for (const signal of allSignals) {
                    await signal.update({
                        telegramSent: true,
                        telegramSentAt: new Date()
                    });
                }

                console.log(`✅ Отправлена сводка по ${totalActualSignals} сигналам для ${ticker} (${figi})`);
            } catch (error) {
                console.error(`❌ Ошибка отправки группированных сигналов для ${figi}:`, error.message);
            }
        }
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
     * Получение всех сигналов из БД (или последних N)
     * @param {object} options - Опции фильтрации
     * @param {number} options.limit - Лимит записей (по умолчанию 100)
     * @param {Date} options.from - Дата начала периода
     * @param {Date} options.to - Дата окончания периода
     * @param {string} options.direction - Направление сигнала
     * @param {boolean} options.activeOnly - Только активные сигналы (endDt >= now)
     * @returns {Promise<Array>} - Массив сигналов
     */
    async getAllSignals(options = {}) {
        try {
            const where = {};

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

            // Получаем уникальные FIGI для загрузки информации об инструментах
            const figis = [...new Set(signals.map(s => s.figi).filter(f => f))];
            
            // Загружаем информацию об инструментах
            const instruments = await CachedInstrument.findAll({
                where: {
                    figi: {
                        [Op.in]: figis
                    }
                },
                attributes: ['figi', 'ticker', 'name']
            });

            // Создаем мапу для быстрого доступа
            const instrumentMap = new Map();
            instruments.forEach(instr => {
                instrumentMap.set(instr.figi, {
                    ticker: instr.ticker,
                    name: instr.name
                });
            });

            // Добавляем ticker и name к сигналам
            const signalsWithInstrument = signals.map(signal => {
                const signalData = signal.toJSON();
                const instrumentInfo = instrumentMap.get(signalData.figi);
                if (instrumentInfo) {
                    signalData.ticker = instrumentInfo.ticker;
                    signalData.instrumentName = instrumentInfo.name; // Название инструмента
                }
                // signalData.name остается как название сигнала из модели
                return signalData;
            });

            return signalsWithInstrument;
        } catch (error) {
            console.error('❌ Ошибка получения всех сигналов из БД:', error);
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
     * Отправка нового сигнала в Telegram
     * @param {CachedSignal} signal - Объект сигнала
     * @param {string} figi - FIGI инструмента
     */
    async sendSignalToTelegram(signal, figi) {
        try {
            // Проверяем, не отправлен ли уже сигнал
            if (signal.telegramSent) {
                return;
            }

            // Проверяем, инициализирован ли Telegram сервис
            if (!OptimizedTelegramService.isInitialized) {
                return;
            }

            // Фильтрация: отправляем только актуальные сигналы
            // 1. Сигнал должен быть создан не более 1 дня назад (новые сигналы)
            const signalAge = Date.now() - new Date(signal.createDt).getTime();
            const maxAge = 1 * 24 * 60 * 60 * 1000; // 1 день (24 часа)
            if (signalAge > maxAge) {
                // Старый сигнал - помечаем как отправленный, но не отправляем
                await signal.update({
                    telegramSent: true,
                    telegramSentAt: new Date()
                });
                const hoursAgo = Math.floor(signalAge / (60 * 60 * 1000));
                console.log(`⏭️ Skipped old signal ${signal.signalId}: created ${hoursAgo} hours ago`);
                return;
            }

            // 2. Сигнал должен быть еще активен (endDt в будущем или недавно истек)
            const endDt = new Date(signal.endDt);
            const now = new Date();
            const timeSinceEnd = now.getTime() - endDt.getTime();
            const maxTimeSinceEnd = 1 * 24 * 60 * 60 * 1000; // Максимум 1 день после окончания
            
            if (timeSinceEnd > maxTimeSinceEnd) {
                // Сигнал истек давно - помечаем как отправленный, но не отправляем
                await signal.update({
                    telegramSent: true,
                    telegramSentAt: new Date()
                });
                console.log(`⏭️ Skipped expired signal ${signal.signalId}: ended ${Math.floor(timeSinceEnd / (24 * 60 * 60 * 1000))} days ago`);
                return;
            }

            // Получаем информацию об инструменте
            let ticker = null;
            let instrumentName = null;
            
            if (figi) {
                const instrument = await CachedInstrument.findOne({
                    where: { figi: figi },
                    attributes: ['ticker', 'name']
                });
                
                if (instrument) {
                    ticker = instrument.ticker;
                    instrumentName = instrument.name;
                }
            }

            // Форматируем сообщение
            const message = this.formatSignalMessage(signal, ticker, instrumentName, figi);

            // Отправляем сообщение
            await OptimizedTelegramService.sendAlert('TRADING_SIGNAL', message, 'info');

            // Отмечаем сигнал как отправленный
            await signal.update({
                telegramSent: true,
                telegramSentAt: new Date()
            });

            console.log(`✅ Новый сигнал отправлен в Telegram: ${signal.signalId}`);
        } catch (error) {
            console.error(`❌ Ошибка отправки сигнала в Telegram:`, error);
            // Не бросаем ошибку, чтобы не прерывать сохранение сигналов
        }
    }

    /**
     * Форматирование сообщения о сигнале для Telegram
     * @param {CachedSignal} signal - Объект сигнала
     * @param {string} ticker - Тикер инструмента
     * @param {string} instrumentName - Название инструмента
     * @param {string} figi - FIGI инструмента
     * @returns {string} - Форматированное сообщение
     */
    formatSignalMessage(signal, ticker, instrumentName, figi) {
        // Преобразуем цену из формата {units, nano} в число
        const formatPrice = (priceObj) => {
            if (!priceObj) return 'N/A';
            if (typeof priceObj === 'number') return priceObj.toFixed(2);
            const units = parseFloat(priceObj.units || 0);
            const nano = parseFloat(priceObj.nano || 0) / 1000000000;
            return (units + nano).toFixed(2);
        };

        // Определяем направление сигнала
        const direction = signal.direction === 'SIGNAL_DIRECTION_BUY' ? '📈 ПОКУПКА' : 
                         signal.direction === 'SIGNAL_DIRECTION_SELL' ? '📉 ПРОДАЖА' : 
                         '❓ НЕИЗВЕСТНО';

        const directionEmoji = signal.direction === 'SIGNAL_DIRECTION_BUY' ? '🟢' : 
                              signal.direction === 'SIGNAL_DIRECTION_SELL' ? '🔴' : 
                              '⚪';

        const initialPrice = formatPrice(signal.initialPrice);
        const targetPrice = formatPrice(signal.targetPrice);
        const stoploss = signal.stoploss ? formatPrice(signal.stoploss) : 'N/A';

        // Вычисляем потенциальную прибыль/убыток
        let potentialProfit = 'N/A';
        if (signal.direction === 'SIGNAL_DIRECTION_BUY' && initialPrice && targetPrice) {
            const profit = ((parseFloat(targetPrice) - parseFloat(initialPrice)) / parseFloat(initialPrice) * 100).toFixed(2);
            potentialProfit = `+${profit}%`;
        } else if (signal.direction === 'SIGNAL_DIRECTION_SELL' && initialPrice && targetPrice) {
            const profit = ((parseFloat(initialPrice) - parseFloat(targetPrice)) / parseFloat(initialPrice) * 100).toFixed(2);
            potentialProfit = `+${profit}%`;
        }

        const instrumentDisplay = ticker ? `${ticker}${instrumentName ? ` (${instrumentName})` : ''}` : (figi || 'Неизвестный инструмент');

        let message = `${directionEmoji} <b>НОВЫЙ ТОРГОВЫЙ СИГНАЛ</b>\n\n`;
        message += `📊 <b>Инструмент:</b> ${instrumentDisplay}\n`;
        message += `📈 <b>Направление:</b> ${direction}\n`;
        message += `🎯 <b>Стратегия:</b> ${signal.strategyName}\n`;
        message += `📝 <b>Название сигнала:</b> ${signal.name}\n\n`;
        
        message += `💰 <b>Цены:</b>\n`;
        message += `• Входная: <b>${initialPrice} ₽</b>\n`;
        message += `• Целевая: <b>${targetPrice} ₽</b>\n`;
        if (stoploss !== 'N/A') {
            message += `• Стоп-лосс: <b>${stoploss} ₽</b>\n`;
        }
        message += `• Потенциальная прибыль: <b>${potentialProfit}</b>\n\n`;

        message += `📊 <b>Вероятность успеха:</b> <b>${signal.probability}%</b>\n`;
        message += `📅 <b>Действителен до:</b> ${new Date(signal.endDt).toLocaleString('ru-RU')}\n`;

        if (signal.info) {
            message += `\nℹ️ <b>Дополнительная информация:</b>\n${signal.info}`;
        }

        return message;
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

