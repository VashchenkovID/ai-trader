import { Op } from 'sequelize';
import sequelize from '../config/database.js';
import OptionsData from '../models/OptionsData.js';
import Asset from '../models/Asset.js';
import CachedInstrument from '../models/CachedInstrument.js';
import CacheService from './CacheService.js';
import TinkoffApiService from './TinkoffApiService.js';
import LoggerService from './LoggerService.js';
import AssetSyncService from './AssetSyncService.js';
import {
    calculateImpliedVolatility,
    convertPriceFromTinkoff,
    calculateTimeToExpiration
} from '../utils/blackScholes.js';

/**
 * Сервис для работы с опционными данными и вычисления Implied Volatility (IV)
 * 
 * Основные функции:
 * - Получение опционов из Tinkoff API
 * - Вычисление Implied Volatility через модель Блэка-Шоулза
 * - Сохранение и кеширование данных об опционах
 * - Предоставление опционных фичей для нейросетей
 */
class OptionsDataService {
    constructor() {
        this.isInitialized = false;
        
        // Безрисковая процентная ставка (можно получать из настроек или макро-данных)
        // По умолчанию используем ключевую ставку ЦБ РФ (примерно 16% в 2024)
        this.defaultRiskFreeRate = 0.16;
        
        // Кеш в памяти для часто запрашиваемых данных
        this.dataCache = new Map();
        this.cacheTimestamps = new Map();
        this.cacheTimeout = 30 * 60 * 1000; // 30 минут
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            if (LoggerService.isInitialized) {
                LoggerService.info('Initializing OptionsDataService', {
                    service: 'OptionsDataService'
                });
            }

            // Можно загрузить настройки безрисковой ставки из Settings
            // Пока используем значение по умолчанию

            this.isInitialized = true;

            if (LoggerService.isInitialized) {
                LoggerService.info('OptionsDataService initialized', {
                    service: 'OptionsDataService'
                });
            }
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Failed to initialize OptionsDataService', {
                    service: 'OptionsDataService',
                    error: { message: error.message, stack: error.stack }
                });
            }
            throw error;
        }
    }


    /**
     * Расчет исторической волатильности на основе доходностей
     * Используется как fallback, когда цена опциона недоступна
     * @param {string} baseFigi - FIGI базового актива
     * @param {number} period - Период расчета в днях (по умолчанию 30)
     * @returns {Promise<number|null>} - Историческая волатильность в процентах (0-100) или null
     */
    async calculateHistoricalVolatility(baseFigi, period = 30) {
        try {
            // Получаем свечи напрямую из БД, минуя автоматическое кеширование
            // чтобы избежать ошибок уникальности при попытке кеширования
            const { Op } = await import('sequelize');
            const CachedCandle = (await import('../models/CachedCandle.js')).default;
            
            const from = new Date();
            from.setDate(from.getDate() - (period + 10));
            
            const candles = await CachedCandle.findAll({
                where: {
                    figi: baseFigi,
                    interval: 'DAY',
                    time: {
                        [Op.gte]: from
                    }
                },
                order: [['time', 'ASC']],
                limit: period + 10
            });
            
            if (!candles || candles.length < 10) {
                // Если данных недостаточно, пробуем получить через CacheService
                // но игнорируем ошибки кеширования
                try {
                    const cachedCandles = await CacheService.getCandles(baseFigi, 'DAY', period + 10);
                    if (cachedCandles && cachedCandles.length >= 10) {
                        // Используем полученные данные
                        const returns = this.calculateReturnsFromCandles(cachedCandles);
                        if (returns.length >= 10) {
                            return this.calculateVolatilityFromReturns(returns);
                        }
                    }
                } catch (cacheError) {
                    // Игнорируем ошибки кеширования (например, уникальность ключа)
                    // Продолжаем с существующими данными или возвращаем null
                    // Убрали debug логирование для уменьшения шума в логах
                }
                
                return null;
            }

            // Рассчитываем доходности
            const returns = [];
            for (let i = 1; i < candles.length; i++) {
                const prevClose = candles[i - 1].close;
                const currentClose = candles[i].close;
                
                if (prevClose > 0 && isFinite(prevClose) && isFinite(currentClose)) {
                    const dailyReturn = (currentClose - prevClose) / prevClose;
                    returns.push(dailyReturn);
                }
            }

            if (returns.length < 10) {
                return null;
            }

            // Средняя доходность
            const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;

            // Дисперсия
            const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length;

            // Стандартное отклонение (волатильность) в процентах
            // Умножаем на sqrt(252) для годовой волатильности (252 торговых дня в году)
            const volatility = Math.sqrt(variance) * Math.sqrt(252) * 100;

            return volatility;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error calculating historical volatility', {
                    service: 'OptionsDataService',
                    baseFigi,
                    error: { message: error.message }
                });
            }
            return null;
        }
    }

    /**
     * Расчет доходностей из свечей
     * @param {Array} candles - Массив свечей
     * @returns {Array<number>} - Массив доходностей
     */
    calculateReturnsFromCandles(candles) {
        const returns = [];
        for (let i = 1; i < candles.length; i++) {
            const prevClose = candles[i - 1].close;
            const currentClose = candles[i].close;
            
            if (prevClose > 0 && isFinite(prevClose) && isFinite(currentClose)) {
                const dailyReturn = (currentClose - prevClose) / prevClose;
                returns.push(dailyReturn);
            }
        }
        return returns;
    }

    /**
     * Расчет волатильности из доходностей
     * @param {Array<number>} returns - Массив доходностей
     * @returns {number} - Волатильность в процентах (0-100)
     */
    calculateVolatilityFromReturns(returns) {
        if (returns.length < 10) {
            return null;
        }

        // Средняя доходность
        const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;

        // Дисперсия
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length;

        // Стандартное отклонение (волатильность) в процентах
        // Умножаем на sqrt(252) для годовой волатильности (252 торговых дня в году)
        const volatility = Math.sqrt(variance) * Math.sqrt(252) * 100;

        return volatility;
    }

    /**
     * Получение опционов из Tinkoff API и сохранение в БД
     * @param {string} baseFigi - FIGI базового актива
     * @param {boolean} forceUpdate - Принудительное обновление
     * @returns {Promise<Array>} - Массив сохраненных записей опционов
     */
    async fetchAndSaveOptions(baseFigi, forceUpdate = false) {
        try {
            // Получаем asset_uid по FIGI
            const assetUid = await AssetSyncService.getAssetUidByFigi(baseFigi);
            if (!assetUid) {
                if (LoggerService.isInitialized) {
                    LoggerService.warn('Asset UID not found for FIGI', {
                        service: 'OptionsDataService',
                        baseFigi
                    });
                }
                return [];
            }

            // Получаем текущую цену базового актива
            const instrument = await CacheService.getInstrument(baseFigi, true);
            if (!instrument || !instrument.lastPrice) {
                if (LoggerService.isInitialized) {
                    LoggerService.warn('Instrument price not found', {
                        service: 'OptionsDataService',
                        baseFigi
                    });
                }
                return [];
            }

            const underlyingPrice = instrument.lastPrice;
            
            // Рассчитываем историческую волатильность для fallback
            const historicalVolatility = await this.calculateHistoricalVolatility(baseFigi, 30);

            // Получаем опционы из API
            const options = await TinkoffApiService.getOptionsBy({
                basicAssetUid: assetUid
            });

            if (!options || options.length === 0) {
                // Убрали debug логирование для уменьшения шума в логах
                return [];
            }

            // Получаем безрисковую ставку (можно получить из макро-данных или Settings)
            const riskFreeRate = this.defaultRiskFreeRate;

            const savedOptions = [];
            const currentDate = new Date();

            for (const option of options) {
                try {
                    // Определяем тип опциона (call или put)
                    // В ответе Tinkoff API может быть поле optionType или определяем по названию
                    let optionType = 'call'; // По умолчанию
                    if (option.optionType) {
                        optionType = option.optionType.toLowerCase().includes('put') ? 'put' : 'call';
                    } else if (option.name) {
                        // Пробуем определить по названию (обычно содержит CALL или PUT)
                        const nameUpper = option.name.toUpperCase();
                        optionType = nameUpper.includes('PUT') ? 'put' : 'call';
                    }

                    // Получаем цену страйка
                    const strikePrice = convertPriceFromTinkoff(option.strikePrice);
                    if (!strikePrice || strikePrice <= 0) continue;

                    // Получаем дату экспирации
                    const expirationDate = option.expirationDate 
                        ? new Date(option.expirationDate) 
                        : null;
                    if (!expirationDate || expirationDate <= currentDate) continue;

                    // Вычисляем время до экспирации
                    const timeToExpiration = calculateTimeToExpiration(expirationDate, currentDate);
                    if (timeToExpiration <= 0) continue;

                    // Получаем цену опциона (если доступна)
                    const optionPrice = convertPriceFromTinkoff(option.lastPrice || option.currentPrice);
                    
                    // Вычисляем IV, если есть цена опциона
                    let impliedVolatility = null;
                    let ivSource = null; // 'black_scholes' или 'historical'
                    
                    if (optionPrice && optionPrice > 0) {
                        // Пытаемся вычислить IV через модель Блэка-Шоулза
                        impliedVolatility = calculateImpliedVolatility(
                            optionPrice,
                            underlyingPrice,
                            strikePrice,
                            timeToExpiration,
                            riskFreeRate,
                            optionType
                        );

                        // Конвертируем из десятичного вида в проценты (0.2 -> 20)
                        if (impliedVolatility !== null) {
                            impliedVolatility = impliedVolatility * 100;
                            ivSource = 'black_scholes';
                        }
                    }
                    
                    // Если не удалось вычислить IV через Black-Scholes, используем историческую волатильность
                    if (impliedVolatility === null && historicalVolatility !== null && historicalVolatility > 0) {
                        impliedVolatility = historicalVolatility;
                        ivSource = 'historical';
                        // Убрали debug логирование для уменьшения шума в логах
                    }

                    // Сохраняем или обновляем запись
                    const [savedOption, created] = await OptionsData.findOrCreate({
                        where: {
                            baseFigi: baseFigi,
                            expirationDate: expirationDate,
                            strikePrice: strikePrice,
                            optionType: optionType
                        },
                        defaults: {
                            figi: option.uid || option.figi || null,
                            baseFigi: baseFigi,
                            ticker: option.ticker || null,
                            name: option.name || null,
                            optionType: optionType,
                            strikePrice: strikePrice,
                            expirationDate: expirationDate,
                            currentPrice: optionPrice,
                            underlyingPrice: underlyingPrice,
                            impliedVolatility: impliedVolatility,
                            timeToExpiration: timeToExpiration,
                            riskFreeRate: riskFreeRate,
                            timestamp: currentDate,
                            source: 'tinkoff',
                            metadata: {
                                ...option,
                                ivSource: ivSource, // Отмечаем источник IV
                                historicalVolatilityUsed: ivSource === 'historical'
                            }
                        }
                    });

                    // Если запись уже существует и нужно обновить
                    if (!created && forceUpdate) {
                        // Обновляем метаданные, сохраняя ivSource
                        const updatedMetadata = {
                            ...(savedOption.metadata || {}),
                            ...option,
                            ivSource: ivSource,
                            historicalVolatilityUsed: ivSource === 'historical'
                        };
                        
                        await savedOption.update({
                            currentPrice: optionPrice,
                            underlyingPrice: underlyingPrice,
                            impliedVolatility: impliedVolatility,
                            timeToExpiration: timeToExpiration,
                            timestamp: currentDate,
                            metadata: updatedMetadata
                        });
                    }
                    
                    // Если запись существует, но IV = null, пытаемся пересчитать
                    if (!created && !forceUpdate && savedOption.impliedVolatility === null && impliedVolatility !== null) {
                        const updatedMetadata = {
                            ...(savedOption.metadata || {}),
                            ivSource: ivSource,
                            historicalVolatilityUsed: ivSource === 'historical',
                            updatedAt: currentDate.toISOString()
                        };
                        
                        await savedOption.update({
                            impliedVolatility: impliedVolatility,
                            underlyingPrice: underlyingPrice,
                            metadata: updatedMetadata
                        });
                    }

                    savedOptions.push(savedOption);
                } catch (optionError) {
                    if (LoggerService.isInitialized) {
                        LoggerService.error('Error processing option', {
                            service: 'OptionsDataService',
                            baseFigi,
                            option: option.uid || option.figi,
                            error: { message: optionError.message }
                        });
                    }
                }
            }

            if (LoggerService.isInitialized) {
                LoggerService.info('Options fetched and saved', {
                    service: 'OptionsDataService',
                    baseFigi,
                    count: savedOptions.length
                });
            }

            return savedOptions;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error fetching and saving options', {
                    service: 'OptionsDataService',
                    baseFigi,
                    error: { message: error.message, stack: error.stack }
                });
            }
            return [];
        }
    }

    /**
     * Обновление IV для опционов, у которых IV = null
     * Использует историческую волатильность как fallback
     * @param {string} baseFigi - FIGI базового актива (опционально, если не указан - обрабатывает все)
     * @returns {Promise<number>} - Количество обновленных записей
     */
    async updateMissingIV(baseFigi = null) {
        try {
            const whereClause = {
                impliedVolatility: null
            };
            
            if (baseFigi) {
                whereClause.baseFigi = baseFigi;
            }
            
            // Находим опционы с null IV
            const optionsWithoutIV = await OptionsData.findAll({
                where: whereClause,
                limit: 1000 // Ограничение для безопасности
            });
            
            if (optionsWithoutIV.length === 0) {
                return 0;
            }
            
            // Группируем по baseFigi для оптимизации
            const optionsByFigi = {};
            for (const option of optionsWithoutIV) {
                if (!optionsByFigi[option.baseFigi]) {
                    optionsByFigi[option.baseFigi] = [];
                }
                optionsByFigi[option.baseFigi].push(option);
            }
            
            let updatedCount = 0;
            
            // Обрабатываем каждую группу
            for (const [figi, options] of Object.entries(optionsByFigi)) {
                try {
                    // Вычисляем историческую волатильность один раз для всех опционов инструмента
                    const historicalVolatility = await this.calculateHistoricalVolatility(figi, 30);
                    
                    if (historicalVolatility !== null && historicalVolatility > 0) {
                        // Обновляем все опционы этого инструмента
                        for (const option of options) {
                            const updatedMetadata = {
                                ...(option.metadata || {}),
                                ivSource: 'historical',
                                historicalVolatilityUsed: true,
                                updatedAt: new Date().toISOString()
                            };
                            
                            await option.update({
                                impliedVolatility: historicalVolatility,
                                metadata: updatedMetadata
                            });
                            updatedCount++;
                        }
                    }
                } catch (figiError) {
                    if (LoggerService.isInitialized) {
                        LoggerService.error('Error updating IV for baseFigi', {
                            service: 'OptionsDataService',
                            baseFigi: figi,
                            error: { message: figiError.message }
                        });
                    }
                }
            }
            
            if (LoggerService.isInitialized && updatedCount > 0) {
                LoggerService.info('Updated missing IV values', {
                    service: 'OptionsDataService',
                    updatedCount,
                    baseFigi: baseFigi || 'all'
                });
            }
            
            return updatedCount;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error updating missing IV', {
                    service: 'OptionsDataService',
                    baseFigi,
                    error: { message: error.message, stack: error.stack }
                });
            }
            return 0;
        }
    }

    /**
     * Получение ATM (at-the-money) опционов для вычисления IV
     * @param {string} baseFigi - FIGI базового актива
     * @param {Date} timestamp - Дата для фильтрации
     * @returns {Promise<Array>} - Массив ATM опционов с IV
     */
    async getATMOptions(baseFigi, timestamp = new Date()) {
        try {
            // Получаем текущую цену базового актива
            const instrument = await CacheService.getInstrument(baseFigi, true);
            if (!instrument || !instrument.lastPrice) {
                return [];
            }

            const currentPrice = instrument.lastPrice;

            // Получаем опционы за последние 7 дней (для актуальности)
            const dateFrom = new Date(timestamp);
            dateFrom.setDate(dateFrom.getDate() - 7);

            // Получаем опционы, отсортированные по близости к текущей цене
            const options = await OptionsData.findAll({
                where: {
                    baseFigi: baseFigi,
                    timestamp: { [Op.gte]: dateFrom },
                    impliedVolatility: { [Op.ne]: null }
                },
                order: [
                    // Сортируем по близости страйка к текущей цене
                    sequelize.literal(`ABS("strikePrice"::numeric - ${currentPrice}) ASC`),
                    ['expirationDate', 'ASC'] // Ближайшие экспирации первыми
                ],
                limit: 20 // Берем ближайшие к ATM
            });

            // Фильтруем ATM опционы (страйк в пределах ±5% от текущей цены)
            const atThreshold = currentPrice * 0.05;
            const atmOptions = options.filter(opt => {
                const strikeDiff = Math.abs(opt.strikePrice - currentPrice);
                return strikeDiff <= atThreshold;
            });

            return atmOptions;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error getting ATM options', {
                    service: 'OptionsDataService',
                    baseFigi,
                    error: { message: error.message }
                });
            }
            return [];
        }
    }

    /**
     * Массовое обновление опционов для всех активных инструментов
     * @param {Object} options - Опции обновления
     * @param {number} options.delayMs - Задержка между запросами в миллисекундах (по умолчанию 2000)
     * @param {boolean} options.forceUpdate - Принудительное обновление существующих записей
     * @param {number} options.limit - Ограничение количества инструментов для обработки (null = все)
     * @returns {Promise<Object>} - Статистика обновления
     */
    async updateOptionsForAllInstruments(options = {}) {
        const {
            delayMs = 2000,
            forceUpdate = false,
            limit = null
        } = options;

        const stats = {
            processed: 0,
            saved: 0,
            errors: 0,
            skipped: 0,
            total: 0
        };

        try {
            // Получаем список активных инструментов
            const CachedInstrument = (await import('../models/CachedInstrument.js')).default;
            const instruments = await CachedInstrument.findAll({
                where: { isActive: true },
                limit: limit || undefined,
                attributes: ['figi', 'ticker', 'name']
            });

            stats.total = instruments.length;

            if (instruments.length === 0) {
                if (LoggerService.isInitialized) {
                    LoggerService.warn('No active instruments found for options update', {
                        service: 'OptionsDataService'
                    });
                }
                return stats;
            }

            if (LoggerService.isInitialized) {
                LoggerService.info('Starting mass options update', {
                    service: 'OptionsDataService',
                    totalInstruments: instruments.length,
                    delayMs,
                    forceUpdate
                });
            }

            // Обрабатываем каждый инструмент
            for (const instrument of instruments) {
                try {
                    const savedOptions = await this.fetchAndSaveOptions(
                        instrument.figi,
                        forceUpdate
                    );

                    stats.processed++;
                    stats.saved += savedOptions.length;

                    // Задержка между запросами для избежания rate limiting
                    if (delayMs > 0) {
                        await new Promise(resolve => setTimeout(resolve, delayMs));
                    }
                } catch (error) {
                    stats.errors++;
                    if (LoggerService.isInitialized) {
                        LoggerService.error('Error updating options for instrument', {
                            service: 'OptionsDataService',
                            figi: instrument.figi,
                            ticker: instrument.ticker,
                            error: { message: error.message }
                        });
                    }
                }
            }

            if (LoggerService.isInitialized) {
                LoggerService.info('Mass options update completed', {
                    service: 'OptionsDataService',
                    ...stats
                });
            }

            return stats;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error in mass options update', {
                    service: 'OptionsDataService',
                    error: { message: error.message, stack: error.stack }
                });
            }
            throw error;
        }
    }

    /**
     * Получение опционных фичей для нейросети
     * @param {string} baseFigi - FIGI базового актива
     * @param {Date} timestamp - Дата для получения фичей
     * @returns {Promise<Array<number>>} - Массив из 3 фичей: [currentIV, avgIV30d, ivRank]
     */
    async getOptionsFeatures(baseFigi, timestamp = new Date()) {
        try {
            // 1. Получаем текущую IV из ATM опционов
            const atmOptions = await this.getATMOptions(baseFigi, timestamp);
            
            if (atmOptions.length === 0) {
                // Нет опционных данных - используем fallback на историческую волатильность
                // Возвращаем нули и флаг доступности
                return [0, 0, 0, 0]; // [currentIV, avgIV30d, ivRank, hasOptionsData]
            }

            // Вычисляем среднюю IV из ATM опционов
            const validIVs = atmOptions
                .map(opt => {
                    const iv = opt.impliedVolatility;
                    // Конвертируем в число, если это строка
                    return typeof iv === 'string' ? parseFloat(iv) : iv;
                })
                .filter(iv => iv !== null && iv !== undefined && !isNaN(iv) && iv > 0);

            if (validIVs.length === 0) {
                return [0, 0, 0, 0];
            }

            const currentIV = validIVs.reduce((sum, iv) => sum + iv, 0) / validIVs.length;

            // 2. Получаем среднюю IV за 30 дней
            const date30dAgo = new Date(timestamp);
            date30dAgo.setDate(date30dAgo.getDate() - 30);

            const historicalOptions = await OptionsData.findAll({
                where: {
                    baseFigi: baseFigi,
                    timestamp: { [Op.gte]: date30dAgo, [Op.lte]: timestamp },
                    impliedVolatility: { [Op.ne]: null }
                },
                attributes: ['impliedVolatility', 'timestamp'],
                order: [['timestamp', 'ASC']]
            });

            const historicalIVs = historicalOptions
                .map(opt => {
                    const iv = opt.impliedVolatility;
                    // Конвертируем в число, если это строка
                    return typeof iv === 'string' ? parseFloat(iv) : iv;
                })
                .filter(iv => iv !== null && iv !== undefined && !isNaN(iv) && iv > 0);

            const avgIV30d = historicalIVs.length > 0
                ? historicalIVs.reduce((sum, iv) => sum + iv, 0) / historicalIVs.length
                : currentIV;

            // 3. Вычисляем IV Rank (процентиль текущей IV относительно исторических значений)
            let ivRank = 0.5; // По умолчанию 50%
            if (historicalIVs.length > 0) {
                const sortedIVs = [...historicalIVs].sort((a, b) => a - b);
                const rank = sortedIVs.filter(iv => iv < currentIV).length;
                ivRank = rank / sortedIVs.length;
            }

            // Нормализация фичей (0-100% -> 0-1)
            const normalizedCurrentIV = Math.min(1, Math.max(0, currentIV / 100));
            const normalizedAvgIV30d = Math.min(1, Math.max(0, avgIV30d / 100));
            const normalizedIVRank = Math.min(1, Math.max(0, ivRank));

            // Флаг доступности опционных данных
            const hasOptionsData = 1;

            return [
                normalizedCurrentIV,
                normalizedAvgIV30d,
                normalizedIVRank,
                hasOptionsData
            ];
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error getting options features', {
                    service: 'OptionsDataService',
                    baseFigi,
                    error: { message: error.message, stack: error.stack }
                });
            }
            // Возвращаем нули при ошибке
            return [0, 0, 0, 0];
        }
    }
}

// Создаем singleton экземпляр
const optionsDataService = new OptionsDataService();

export default optionsDataService;

