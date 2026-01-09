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
     * Вычисление Put/Call Ratio (PCR) для опционов
     * PCR = (количество PUT опционов) / (количество CALL опционов)
     * Если доступны объемы, использует их, иначе использует количество опционов
     * @param {string} baseFigi - FIGI базового актива
     * @param {Date} timestamp - Дата для расчета PCR
     * @param {number} daysBack - Количество дней назад для поиска данных (по умолчанию 7)
     * @returns {Promise<number|null>} - PCR (или null, если недостаточно данных)
     */
    async calculatePCR(baseFigi, timestamp = new Date(), daysBack = 7) {
        try {
            const dateFrom = new Date(timestamp);
            dateFrom.setDate(dateFrom.getDate() - daysBack);

            // Получаем опционы за указанный период
            const options = await OptionsData.findAll({
                where: {
                    baseFigi: baseFigi,
                    timestamp: { [Op.gte]: dateFrom, [Op.lte]: timestamp }
                },
                attributes: ['optionType', 'metadata']
            });

            if (options.length === 0) {
                return null;
            }

            let putCount = 0;
            let callCount = 0;
            let putVolume = 0;
            let callVolume = 0;
            let hasVolumeData = false;

            // Считаем PUT и CALL опционы, а также объемы, если доступны
            for (const option of options) {
                if (option.optionType === 'put') {
                    putCount++;
                    // Пытаемся извлечь объем из metadata
                    if (option.metadata) {
                        const volume = option.metadata.openInterest || option.metadata.volume || option.metadata.lotSize;
                        if (volume && typeof volume === 'number' && volume > 0) {
                            putVolume += volume;
                            hasVolumeData = true;
                        }
                    }
                } else if (option.optionType === 'call') {
                    callCount++;
                    // Пытаемся извлечь объем из metadata
                    if (option.metadata) {
                        const volume = option.metadata.openInterest || option.metadata.volume || option.metadata.lotSize;
                        if (volume && typeof volume === 'number' && volume > 0) {
                            callVolume += volume;
                            hasVolumeData = true;
                        }
                    }
                }
            }

            // Если нет ни PUT, ни CALL опционов, возвращаем null
            if (putCount === 0 && callCount === 0) {
                return null;
            }

            // Если есть данные об объемах, используем их для расчета PCR
            if (hasVolumeData && callVolume > 0) {
                return putVolume / callVolume;
            }

            // Иначе используем количество опционов
            if (callCount === 0) {
                // Если нет CALL опционов, но есть PUT, возвращаем большое значение (например, 10)
                return putCount > 0 ? 10 : null;
            }

            return putCount / callCount;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error calculating PCR', {
                    service: 'OptionsDataService',
                    baseFigi,
                    error: { message: error.message }
                });
            }
            return null;
        }
    }

    /**
     * Вычисление нормализованного Open Interest (OI)
     * OI нормализуется относительно среднего значения за 30 дней
     * @param {string} baseFigi - FIGI базового актива
     * @param {Date} timestamp - Дата для расчета OI
     * @returns {Promise<number>} - Нормализованный OI (0-1, где 0.5 соответствует среднему значению)
     */
    async calculateNormalizedOpenInterest(baseFigi, timestamp = new Date()) {
        try {
            // Получаем опционы за последние 7 дней (текущий OI)
            const date7dAgo = new Date(timestamp);
            date7dAgo.setDate(date7dAgo.getDate() - 7);

            const currentOptions = await OptionsData.findAll({
                where: {
                    baseFigi: baseFigi,
                    timestamp: { [Op.gte]: date7dAgo, [Op.lte]: timestamp }
                },
                attributes: ['metadata']
            });

            // Вычисляем текущий общий OI
            let currentOI = 0;
            for (const option of currentOptions) {
                if (option.metadata) {
                    const oi = option.metadata.openInterest || option.metadata.volume || option.metadata.lotSize;
                    if (oi && typeof oi === 'number' && oi > 0) {
                        currentOI += oi;
                    }
                }
            }

            // Получаем исторические данные за 30 дней для расчета среднего OI
            const date30dAgo = new Date(timestamp);
            date30dAgo.setDate(date30dAgo.getDate() - 30);

            const historicalOptions = await OptionsData.findAll({
                where: {
                    baseFigi: baseFigi,
                    timestamp: { [Op.gte]: date30dAgo, [Op.lte]: timestamp }
                },
                attributes: ['metadata', 'timestamp']
            });

            // Вычисляем средний OI за 30 дней
            const oiValues = [];
            const oiByDate = new Map();

            for (const option of historicalOptions) {
                if (option.metadata) {
                    const dateKey = option.timestamp.toISOString().split('T')[0];
                    const oi = option.metadata.openInterest || option.metadata.volume || option.metadata.lotSize;
                    if (oi && typeof oi === 'number' && oi > 0) {
                        if (!oiByDate.has(dateKey)) {
                            oiByDate.set(dateKey, 0);
                        }
                        oiByDate.set(dateKey, oiByDate.get(dateKey) + oi);
                    }
                }
            }

            // Собираем OI по дням
            for (const [date, dailyOI] of oiByDate) {
                oiValues.push(dailyOI);
            }

            // Если нет исторических данных, возвращаем среднее значение (0.5)
            if (oiValues.length === 0) {
                return currentOI > 0 ? 0.5 : 0; // Если есть текущий OI, но нет истории - среднее
            }

            // Вычисляем средний OI
            const avgOI = oiValues.reduce((sum, oi) => sum + oi, 0) / oiValues.length;

            // Если средний OI = 0, возвращаем 0
            if (avgOI === 0) {
                return 0;
            }

            // Нормализуем: текущий OI относительно среднего
            // OI / avgOI = 1.0 соответствует среднему значению
            // Нормализуем так, чтобы 0.5 соответствовало среднему, 0 - очень низкое, 1 - очень высокое
            const ratio = currentOI / avgOI;
            
            // Используем сигмоиду для нормализации: ratio 0.5 -> 0.25, ratio 1.0 -> 0.5, ratio 2.0 -> 0.75
            // Это обеспечивает более плавную нормализацию
            const normalized = 1 / (1 + Math.exp(-2 * (ratio - 1))); // Сигмоида с центром в 1.0

            return Math.min(1, Math.max(0, normalized));
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error calculating normalized Open Interest', {
                    service: 'OptionsDataService',
                    baseFigi,
                    error: { message: error.message }
                });
            }
            return 0.5; // Среднее значение при ошибке
        }
    }

    /**
     * Получение опционных фичей для нейросети
     * @param {string} baseFigi - FIGI базового актива
     * @param {Date} timestamp - Дата для получения фичей
     * @returns {Promise<Array<number>>} - Массив из 6 фичей: [currentIV, avgIV30d, ivRank, currentPCR, avgPCR30d, normalizedOI]
     */
    async getOptionsFeatures(baseFigi, timestamp = new Date()) {
        try {
            // 1. Получаем текущую IV из ATM опционов
            const atmOptions = await this.getATMOptions(baseFigi, timestamp);
            
            if (atmOptions.length === 0) {
                // Нет опционных данных - возвращаем нули и средние значения
                // Вычисляем OI даже при отсутствии IV (может быть доступен)
                const normalizedOI = await this.calculateNormalizedOpenInterest(baseFigi, timestamp);
                return [0, 0, 0, 0.4, 0.4, normalizedOI]; // [currentIV, avgIV30d, ivRank, currentPCR, avgPCR30d, normalizedOI]
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
                // Нет валидных IV, но можем вернуть OI
                const normalizedOI = await this.calculateNormalizedOpenInterest(baseFigi, timestamp);
                return [0, 0, 0, 0.4, 0.4, normalizedOI];
            }

            const currentIV = validIVs.reduce((sum, iv) => sum + iv, 0) / validIVs.length;

            // 2-5. Получаем опционы за последние 30 дней для расчета IV, PCR и других метрик
            const date30dAgo = new Date(timestamp);
            date30dAgo.setDate(date30dAgo.getDate() - 30);
            
            // Получаем все опционы за последние 30 дней (один запрос для всех расчетов)
            const historicalOptions = await OptionsData.findAll({
                where: {
                    baseFigi: baseFigi,
                    timestamp: { [Op.gte]: date30dAgo, [Op.lte]: timestamp }
                },
                attributes: ['impliedVolatility', 'optionType', 'timestamp', 'metadata'],
                order: [['timestamp', 'ASC']]
            });

            // 2. Вычисляем среднюю IV за 30 дней
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

            // 4. Вычисляем текущий PCR (Put/Call Ratio)
            const currentPCR = await this.calculatePCR(baseFigi, timestamp, 7);
            
            // 5. Вычисляем средний PCR за 30 дней, используя уже загруженные historicalOptions

            let avgPCR30d = 0.8; // По умолчанию 0.8 (среднее значение по рынку)
            
            if (historicalOptions.length > 0) {
                // Группируем опционы по датам для расчета среднего PCR
                const pcrValues = [];
                const datesMap = new Map();
                
                for (const option of historicalOptions) {
                    const dateKey = option.timestamp.toISOString().split('T')[0];
                    if (!datesMap.has(dateKey)) {
                        datesMap.set(dateKey, { puts: 0, calls: 0, putVolume: 0, callVolume: 0, hasVolume: false });
                    }
                    const dayData = datesMap.get(dateKey);
                    
                    if (option.optionType === 'put') {
                        dayData.puts++;
                        if (option.metadata) {
                            const volume = option.metadata.openInterest || option.metadata.volume || option.metadata.lotSize;
                            if (volume && typeof volume === 'number' && volume > 0) {
                                dayData.putVolume += volume;
                                dayData.hasVolume = true;
                            }
                        }
                    } else if (option.optionType === 'call') {
                        dayData.calls++;
                        if (option.metadata) {
                            const volume = option.metadata.openInterest || option.metadata.volume || option.metadata.lotSize;
                            if (volume && typeof volume === 'number' && volume > 0) {
                                dayData.callVolume += volume;
                                dayData.hasVolume = true;
                            }
                        }
                    }
                }
                
                // Вычисляем PCR для каждого дня
                for (const [date, dayData] of datesMap) {
                    if (dayData.hasVolume && dayData.callVolume > 0) {
                        pcrValues.push(dayData.putVolume / dayData.callVolume);
                    } else if (dayData.calls > 0) {
                        pcrValues.push(dayData.puts / dayData.calls);
                    } else if (dayData.puts > 0) {
                        pcrValues.push(10); // Если только PUT опционы
                    }
                }
                
                if (pcrValues.length > 0) {
                    avgPCR30d = pcrValues.reduce((sum, pcr) => sum + pcr, 0) / pcrValues.length;
                } else if (currentPCR !== null) {
                    avgPCR30d = currentPCR;
                }
            } else if (currentPCR !== null) {
                avgPCR30d = currentPCR;
            }

            // Нормализация PCR (0-2 -> 0-1, где 0.8 примерно соответствует среднему рынку)
            // PCR обычно находится в диапазоне 0.5-1.5, редко выше 2
            const normalizedCurrentPCR = currentPCR !== null
                ? Math.min(1, Math.max(0, currentPCR / 2)) // 0-2 -> 0-1
                : 0.4; // Среднее значение по рынку (0.8/2 = 0.4) при отсутствии данных
            
            const normalizedAvgPCR30d = Math.min(1, Math.max(0, avgPCR30d / 2)); // 0-2 -> 0-1

            // 6. Вычисляем нормализованный Open Interest
            const normalizedOI = await this.calculateNormalizedOpenInterest(baseFigi, timestamp);

            return [
                normalizedCurrentIV,
                normalizedAvgIV30d,
                normalizedIVRank,
                normalizedCurrentPCR,
                normalizedAvgPCR30d,
                normalizedOI
            ];
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error getting options features', {
                    service: 'OptionsDataService',
                    baseFigi,
                    error: { message: error.message, stack: error.stack }
                });
            }
            // Возвращаем значения по умолчанию при ошибке (6 фичей: IV, avgIV, ivRank, PCR, avgPCR, OI)
            return [0, 0, 0, 0.4, 0.4, 0.5]; // 0.4 соответствует среднему PCR (0.8), 0.5 - средний OI
        }
    }
}

// Создаем singleton экземпляр
const optionsDataService = new OptionsDataService();

export default optionsDataService;

