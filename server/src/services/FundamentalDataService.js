import { Op } from 'sequelize';
import FundamentalData from '../models/FundamentalData.js';
import Asset from '../models/Asset.js';
import AssetSyncService from './AssetSyncService.js';
import CacheService from './CacheService.js';
import LoggerService from './LoggerService.js';
import TinkoffApiService from './TinkoffApiService.js';

/**
 * Сервис для работы с фундаментальными данными компаний
 * 
 * Основные функции:
 * - Получение и сохранение фундаментальных показателей (P/E, P/B, EV/EBITDA, ROE и т.д.)
 * - Предоставление нормализованных фичей для нейросетей
 * - Кеширование данных
 * - Интеграция с Tinkoff API
 */
class FundamentalDataService {
    constructor() {
        this.isInitialized = false;
        this.dataCache = new Map();
        this.cacheTimestamps = new Map();
        this.cacheTtlHours = 24; // Кеш на 24 часа (данные обновляются редко)
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
                LoggerService.info('Initializing FundamentalDataService', { service: 'FundamentalDataService' });
            }
            
            this.isInitialized = true;
            
            if (LoggerService.isInitialized) {
                LoggerService.info('FundamentalDataService initialized', { service: 'FundamentalDataService' });
            }
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Failed to initialize FundamentalDataService', {
                    service: 'FundamentalDataService',
                    error: { message: error.message, stack: error.stack }
                });
            }
            throw error;
        }
    }

    /**
     * Получение фундаментальных данных для инструмента на конкретную дату
     * @param {string} figi - FIGI инструмента
     * @param {Date} date - Дата
     * @param {boolean} fetchIfMissing - Загружать из Tinkoff API если данных нет в БД
     * @returns {Promise<FundamentalData|null>}
     */
    async getFundamentalData(figi, date, fetchIfMissing = false) {
        try {
            if (!figi || !date) {
                return null;
            }

            // Проверяем кеш
            const cacheKey = `${figi}_${date.toISOString().split('T')[0]}`;
            const cached = this.dataCache.get(cacheKey);
            const cacheTimestamp = this.cacheTimestamps.get(cacheKey);
            
            if (cached && cacheTimestamp) {
                const cacheAge = Date.now() - cacheTimestamp;
                const cacheTtlMs = this.cacheTtlHours * 60 * 60 * 1000;
                
                if (cacheAge < cacheTtlMs) {
                    return cached;
                } else {
                    this.dataCache.delete(cacheKey);
                    this.cacheTimestamps.delete(cacheKey);
                }
            }

            // Ищем в БД (берем ближайшую дату, если точной нет)
            let data = await FundamentalData.findOne({
                where: {
                    figi: figi,
                    period: {
                        [Op.lte]: date
                    }
                },
                order: [['period', 'DESC']],
                limit: 1
            });

            // Если данных нет и нужно загрузить из Tinkoff API
            if (!data && fetchIfMissing) {
                data = await this.fetchFromTinkoff(figi, date);
            }

            // Кешируем результат
            if (data) {
                this.dataCache.set(cacheKey, data);
                this.cacheTimestamps.set(cacheKey, Date.now());
            }

            return data;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error getting fundamental data', {
                    service: 'FundamentalDataService',
                    figi,
                    date,
                    error: { message: error.message }
                });
            }
            return null;
        }
    }

    /**
     * Получение данных из Tinkoff API
     * @param {string} figi - FIGI инструмента
     * @param {Date} date - Дата
     * @returns {Promise<FundamentalData|null>}
     */
    async fetchFromTinkoff(figi, date) {
        try {
            // 1. Ищем актив, в котором в массиве apiData.instruments есть инструмент с нужным FIGI
            const assetUid = await AssetSyncService.getAssetUidByFigi(figi);
            
            if (!assetUid) {
                if (LoggerService.isInitialized) {
                    LoggerService.warn('Cannot fetch from Tinkoff: asset not found in database', {
                        service: 'FundamentalDataService',
                        figi
                    });
                }
                return null;
            }
            
            // Получаем полные данные актива для извлечения ticker
            const asset = await Asset.findOne({
                where: { uid: assetUid }
            });
            
            if (!asset) {
                if (LoggerService.isInitialized) {
                    LoggerService.warn('Cannot fetch from Tinkoff: asset not found after UID lookup', {
                        service: 'FundamentalDataService',
                        figi,
                        assetUid
                    });
                }
                return null;
            }

            // 2. Запрашиваем фундаментальные данные по UID актива
            const fundamentals = await TinkoffApiService.getAssetFundamentals([assetUid]);
            
            // Обрабатываем случай, когда fundamentals может быть пустым массивом
            if (!fundamentals || fundamentals.length === 0) {
                if (LoggerService.isInitialized) {
                    LoggerService.debug('No fundamental data available for asset', {
                        service: 'FundamentalDataService',
                        figi,
                        assetUid
                    });
                }
                return null;
            }

            const data = fundamentals[0];

            // 3. Вычислить Operating Margin
            let operatingMargin = null;
            if (data.ebitdaTtm && data.revenueTtm && data.revenueTtm > 0) {
                operatingMargin = (data.ebitdaTtm / data.revenueTtm) * 100;
            } else if (data.netMarginMrq !== null && data.netMarginMrq !== undefined) {
                // Fallback на Net Margin
                operatingMargin = data.netMarginMrq;
            }

            // 4. Определить период (используем дату из API или текущую дату)
            const period = data.fiscalPeriodEndDate 
                ? new Date(data.fiscalPeriodEndDate) 
                : new Date(date.getFullYear(), date.getMonth() - (date.getMonth() % 3), 1);
            const periodType = 'quarterly'; // Tinkoff API возвращает квартальные данные

            // 5. Получить тикер из кеша или из apiData.instruments
            const cachedInstrument = await CacheService.getInstrument(figi, true);
            let ticker = cachedInstrument?.ticker || null;
            
            // Если не нашли в кеше, ищем в apiData.instruments
            if (!ticker && asset?.apiData) {
                const instruments = asset.apiData.instruments || asset.apiData.instrument || [];
                const instrumentsArray = Array.isArray(instruments) ? instruments : [instruments];
                const foundInstrument = instrumentsArray.find(instr => {
                    return instr?.figi === figi || instr?.FIGI === figi;
                });
                ticker = foundInstrument?.ticker || foundInstrument?.Ticker || null;
            }

            // 6. Сохранить в БД
            const savedData = await this.saveFundamentalData({
                figi,
                ticker,
                period,
                periodType,
                pe: data.peRatioTtm,
                pb: data.priceToBookTtm,
                evEbitda: data.evToEbitdaMrq,
                roe: data.roe,
                debtEbitda: data.totalDebtToEbitdaMrq,
                operatingMargin: operatingMargin,
                netMargin: data.netMarginMrq,
                source: 'tinkoff',
                metadata: {
                    assetUid: asset.uid,
                    roic: data.roic,
                    roa: data.roa,
                    currentRatio: data.currentRatioMrq,
                    freeCashFlow: data.freeCashFlowTtm,
                    dividendYield: data.dividendYieldDailyTtm,
                    beta: data.beta,
                    marketCap: data.marketCapitalization,
                    revenue: data.revenueTtm,
                    ebitda: data.ebitdaTtm,
                    netIncome: data.netIncomeTtm,
                    fetchedAt: new Date().toISOString()
                }
            });

            if (LoggerService.isInitialized) {
                LoggerService.info('Successfully fetched and saved fundamental data from Tinkoff API', {
                    service: 'FundamentalDataService',
                    figi,
                    ticker,
                    indicatorsFound: Object.values({
                        pe: data.peRatioTtm,
                        pb: data.priceToBookTtm,
                        evEbitda: data.evToEbitdaMrq,
                        roe: data.roe,
                        debtEbitda: data.totalDebtToEbitdaMrq,
                        operatingMargin: operatingMargin,
                        netMargin: data.netMarginMrq
                    }).filter(v => v !== null && v !== undefined).length
                });
            }

            return savedData;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error fetching from Tinkoff API', {
                    service: 'FundamentalDataService',
                    figi,
                    error: { message: error.message, stack: error.stack }
                });
            }
            return null;
        }
    }

    /**
     * Сохранение фундаментальных данных
     * @param {Object} data - Данные для сохранения
     * @returns {Promise<FundamentalData>}
     */
    async saveFundamentalData(data) {
        try {
            const {
                figi,
                ticker,
                period,
                periodType = 'quarterly',
                pe,
                pb,
                evEbitda,
                roe,
                debtEbitda,
                operatingMargin,
                netMargin,
                source = 'unknown',
                metadata = {}
            } = data;

            if (!figi || !period) {
                throw new Error('FIGI and period are required');
            }

            // Проверяем, существует ли уже такая запись
            const existing = await FundamentalData.findOne({
                where: {
                    figi: figi,
                    period: period,
                    periodType: periodType
                }
            });

            const dataToSave = {
                figi,
                ticker: ticker || null,
                period,
                periodType,
                pe: pe !== null && pe !== undefined ? parseFloat(pe) : null,
                pb: pb !== null && pb !== undefined ? parseFloat(pb) : null,
                evEbitda: evEbitda !== null && evEbitda !== undefined ? parseFloat(evEbitda) : null,
                roe: roe !== null && roe !== undefined ? parseFloat(roe) : null,
                debtEbitda: debtEbitda !== null && debtEbitda !== undefined ? parseFloat(debtEbitda) : null,
                operatingMargin: operatingMargin !== null && operatingMargin !== undefined ? parseFloat(operatingMargin) : null,
                netMargin: netMargin !== null && netMargin !== undefined ? parseFloat(netMargin) : null,
                source,
                metadata
            };

            if (existing) {
                // Обновляем существующую запись
                await existing.update(dataToSave);
                return existing;
            } else {
                // Создаем новую запись
                const fundamentalData = await FundamentalData.create(dataToSave);
                return fundamentalData;
            }
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error saving fundamental data', {
                    service: 'FundamentalDataService',
                    error: { message: error.message, stack: error.stack }
                });
            }
            throw error;
        }
    }

    /**
     * Получение нормализованных фичей для нейросети
     * @param {string} figi - FIGI инструмента
     * @param {Date} timestamp - Временная метка
     * @returns {Promise<Array<number>>} Массив из 7 нормализованных фичей
     */
    async getFundamentalFeatures(figi, timestamp) {
        try {
            if (!figi || !timestamp) {
                // Возвращаем нулевые значения при отсутствии данных
                return new Array(7).fill(0);
            }

            const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
            
            // Получаем данные только из БД (не делаем запросы к API)
            // Это важно для режима обучения, чтобы не делать запросы к API
            let fundamentalData = await this.getFundamentalData(figi, date, false);
            
            // НЕ делаем fallback к API - используем только данные из БД
            // Если данных нет в БД, возвращаем нули
            if (!fundamentalData) {
                return new Array(7).fill(0);
            }

            // Нормализация показателей согласно плану:
            // P/E: 0-50 → 0-1
            // P/B: 0-10 → 0-1
            // EV/EBITDA: 0-20 → 0-1
            // ROE: 0-50% → 0-1
            // Долг/EBITDA: 0-10 → 0-1
            // Операционная маржа: 0-50% → 0-1
            // Чистая маржа: 0-30% → 0-1

            const normalized = [
                // P/E (0-50 → 0-1)
                fundamentalData.pe !== null ? Math.min(1, Math.max(0, fundamentalData.pe / 50)) : 0,
                // P/B (0-10 → 0-1)
                fundamentalData.pb !== null ? Math.min(1, Math.max(0, fundamentalData.pb / 10)) : 0,
                // EV/EBITDA (0-20 → 0-1)
                fundamentalData.evEbitda !== null ? Math.min(1, Math.max(0, fundamentalData.evEbitda / 20)) : 0,
                // ROE (0-50% → 0-1)
                fundamentalData.roe !== null ? Math.min(1, Math.max(0, fundamentalData.roe / 50)) : 0,
                // Долг/EBITDA (0-10 → 0-1)
                fundamentalData.debtEbitda !== null ? Math.min(1, Math.max(0, fundamentalData.debtEbitda / 10)) : 0,
                // Операционная маржа (0-50% → 0-1)
                fundamentalData.operatingMargin !== null ? Math.min(1, Math.max(0, fundamentalData.operatingMargin / 50)) : 0,
                // Чистая маржа (0-30% → 0-1)
                fundamentalData.netMargin !== null ? Math.min(1, Math.max(0, fundamentalData.netMargin / 30)) : 0
            ];

            return normalized;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error getting fundamental features', {
                    service: 'FundamentalDataService',
                    figi,
                    timestamp,
                    error: { message: error.message }
                });
            }
            // Возвращаем нулевые значения при ошибке
            return new Array(7).fill(0);
        }
    }

    /**
     * Массовое заполнение фундаментальных данных по всем активам из БД
     * Берет все активы из БД, собирает их uid, делит на батчи по 100 и запрашивает данные
     * @param {Object} options - Опции заполнения
     * @param {number} options.delayMs - Задержка между батчами в мс (по умолчанию 1000)
     * @param {boolean} options.forceUpdate - Принудительное обновление существующих данных
     * @returns {Promise<Object>} - Статистика заполнения
     */
    async fillFundamentalDataForAllAssets(options = {}) {
        const {
            delayMs = 1000,
            forceUpdate = false
        } = options;

        const stats = {
            totalAssets: 0,
            totalInstruments: 0,
            processed: 0,
            saved: 0,
            skipped: 0,
            errors: 0,
            noData: 0,
            requestCount: 0
        };

        try {
            if (LoggerService.isInitialized) {
                LoggerService.info('Starting mass fill of fundamental data for all assets', {
                    service: 'FundamentalDataService',
                    delayMs
                });
            }

            // Получаем все активы из БД
            const assets = await Asset.findAll({
                attributes: ['uid', 'apiData']
            });

            stats.totalAssets = assets.length;

            if (assets.length === 0) {
                if (LoggerService.isInitialized) {
                    LoggerService.warn('No assets found in database', {
                        service: 'FundamentalDataService'
                    });
                }
                return stats;
            }

            // Собираем все FIGI и asset_uid из активов
            const assetUidToFigis = new Map(); // asset_uid -> [figi1, figi2, ...]
            const figiToInfo = new Map(); // figi -> {assetUid, ticker}
            
            for (const asset of assets) {
                if (!asset.apiData || !asset.uid) continue;

                const instruments = asset.apiData.instruments || asset.apiData.instrument || [];
                const instrumentsArray = Array.isArray(instruments) ? instruments : [instruments];

                for (const instrument of instrumentsArray) {
                    const figi = instrument?.figi || instrument?.FIGI;
                    if (figi) {
                        if (!assetUidToFigis.has(asset.uid)) {
                            assetUidToFigis.set(asset.uid, []);
                        }
                        assetUidToFigis.get(asset.uid).push(figi);
                        figiToInfo.set(figi, {
                            assetUid: asset.uid,
                            ticker: instrument?.ticker || instrument?.Ticker || null
                        });
                        stats.totalInstruments++;
                    }
                }
            }

            const uniqueAssetUids = Array.from(assetUidToFigis.keys());
            const MAX_UID_PER_REQUEST = 100;
            const requestCount = Math.ceil(uniqueAssetUids.length / MAX_UID_PER_REQUEST);
            stats.requestCount = requestCount;

            // Заранее разбиваем на батчи по 100
            const batches = [];
            for (let i = 0; i < uniqueAssetUids.length; i += MAX_UID_PER_REQUEST) {
                batches.push(uniqueAssetUids.slice(i, i + MAX_UID_PER_REQUEST));
            }


            if (LoggerService.isInitialized) {
                LoggerService.info(`Found ${stats.totalInstruments} instruments across ${stats.totalAssets} assets`, {
                    service: 'FundamentalDataService',
                    uniqueAssetUids: uniqueAssetUids.length,
                    requestCount
                });
            }

            // Обрабатываем каждый батч
            for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
                const assetUidBatch = batches[batchIndex];
                const batchNumber = batchIndex + 1;
                
                try {
                    // Запрашиваем фундаментальные данные для батча asset_uid
                    const fundamentals = await TinkoffApiService.getAssetFundamentals(assetUidBatch);
                    
                    if (!fundamentals || fundamentals.length === 0) {
                        // Нет данных для всех asset_uid в этом батче
                        for (const assetUid of assetUidBatch) {
                            const figis = assetUidToFigis.get(assetUid) || [];
                            stats.processed += figis.length;
                            stats.noData += figis.length;
                        }
                        continue;
                    }
                    
                    // Создаем мапу asset_uid -> fundamental data
                    // Используем порядок запроса для сопоставления
                    const fundamentalsMap = new Map();
                    
                    for (let idx = 0; idx < fundamentals.length && idx < assetUidBatch.length; idx++) {
                        const fund = fundamentals[idx];
                        const assetUid = assetUidBatch[idx];
                        // Пробуем использовать assetUid из ответа, если есть, иначе используем из запроса
                        const uid = fund.assetUid || fund.asset_uid || assetUid;
                        fundamentalsMap.set(uid, fund);
                    }
                    
                    // Обрабатываем каждый asset_uid из батча
                    for (const assetUid of assetUidBatch) {
                        const fundData = fundamentalsMap.get(assetUid);
                        const figis = assetUidToFigis.get(assetUid) || [];
                        
                        if (!fundData) {
                            // Нет данных для этого asset_uid
                            stats.processed += figis.length;
                            stats.noData += figis.length;
                            continue;
                        }
                        
                        // Обрабатываем каждый FIGI для этого asset_uid
                        for (const figi of figis) {
                            try {
                                stats.processed++;
                                
                                const info = figiToInfo.get(figi);
                                if (!info) continue;
                                
                                // Проверяем, есть ли уже данные (если не forceUpdate)
                                if (!forceUpdate) {
                                    const existing = await FundamentalData.findOne({
                                        where: { figi },
                                        order: [['period', 'DESC']]
                                    });
                                    if (existing) {
                                        stats.skipped++;
                                        continue;
                                    }
                                }
                                
                                const date = new Date();

                                // Вычисляем Operating Margin
                                let operatingMargin = null;
                                if (fundData.ebitdaTtm && fundData.revenueTtm && fundData.revenueTtm > 0) {
                                    operatingMargin = (fundData.ebitdaTtm / fundData.revenueTtm) * 100;
                                } else if (fundData.netMarginMrq !== null && fundData.netMarginMrq !== undefined) {
                                    operatingMargin = fundData.netMarginMrq;
                                }

                                // Определяем период
                                const period = fundData.fiscalPeriodEndDate 
                                    ? new Date(fundData.fiscalPeriodEndDate) 
                                    : new Date(date.getFullYear(), date.getMonth() - (date.getMonth() % 3), 1);
                                const periodType = 'quarterly';

                                // Сохраняем данные
                                // Сохраняем все поля из API ответа в metadata
                                const dataToSave = {
                                    figi,
                                    ticker: info.ticker || null,
                                    period,
                                    periodType,
                                    pe: fundData.peRatioTtm,
                                    pb: fundData.priceToBookTtm,
                                    evEbitda: fundData.evToEbitdaMrq,
                                    roe: fundData.roe,
                                    debtEbitda: fundData.totalDebtToEbitdaMrq,
                                    operatingMargin: operatingMargin,
                                    netMargin: fundData.netMarginMrq,
                                    source: 'tinkoff',
                                    metadata: {
                                        // Обязательные поля для связи
                                        assetUid: fundData.assetUid || assetUid,
                                        figi: figi,
                                        // Все остальные поля из API ответа
                                        ...fundData,
                                        // Переопределяем assetUid и figi для ясности
                                        assetUid: fundData.assetUid || assetUid,
                                        figi: figi,
                                        fetchedAt: new Date().toISOString()
                                    }
                                };
                                
                                await this.saveFundamentalData(dataToSave);
                                stats.saved++;

                            } catch (error) {
                                stats.errors++;
                                if (LoggerService.isInitialized) {
                                    LoggerService.error('Error processing instrument in mass fill', {
                                        service: 'FundamentalDataService',
                                        figi,
                                        assetUid,
                                        error: { message: error.message, stack: error.stack }
                                    });
                                }
                            }
                        }
                    }
                    
                    // Задержка между батчами запросов к API
                    if (batchIndex < batches.length - 1 && delayMs > 0) {
                        await new Promise(resolve => setTimeout(resolve, delayMs));
                    }
                } catch (error) {
                    // Ошибка при обработке батча asset_uid
                    const figisInBatch = assetUidBatch.reduce((sum, uid) => sum + (assetUidToFigis.get(uid)?.length || 0), 0);
                    stats.errors += figisInBatch;
                    if (LoggerService.isInitialized) {
                        LoggerService.error('Error processing asset UID batch', {
                            service: 'FundamentalDataService',
                            batchSize: assetUidBatch.length,
                            error: { message: error.message }
                        });
                    }
                }
            }


            if (LoggerService.isInitialized) {
                LoggerService.info('Mass fill of fundamental data completed', {
                    service: 'FundamentalDataService',
                    ...stats
                });
            }

            return stats;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error in mass fill of fundamental data', {
                    service: 'FundamentalDataService',
                    error: { message: error.message, stack: error.stack }
                });
            }
            throw error;
        }
    }

    /**
     * Общий метод массового заполнения: синхронизация активов + заполнение фундаментальных данных
     * 1. Синхронизирует активы (фильтрует по нашим инструментам из БД)
     * 2. Запрашивает фундаментальные данные по всем активам из БД батчами по 100
     * @param {Object} options - Опции заполнения
     * @param {boolean} options.syncAssets - Синхронизировать активы перед заполнением (по умолчанию true)
     * @param {boolean} options.forceUpdateAssets - Принудительное обновление активов
     * @param {number} options.delayMs - Задержка между батчами в мс (по умолчанию 1000)
     * @param {boolean} options.forceUpdateFundamentals - Принудительное обновление фундаментальных данных
     * @returns {Promise<Object>} - Статистика заполнения
     */
    async syncAndFillFundamentalData(options = {}) {
        const {
            syncAssets = true,
            forceUpdateAssets = false,
            delayMs = 1000,
            forceUpdateFundamentals = false
        } = options;

        const result = {
            assetsSync: null,
            fundamentalsFill: null
        };

        try {
            if (LoggerService.isInitialized) {
                LoggerService.info('Starting sync and fill of fundamental data', {
                    service: 'FundamentalDataService',
                    syncAssets,
                    forceUpdateAssets,
                    delayMs,
                    forceUpdateFundamentals
                });
            }

            // Шаг 1: Синхронизация активов (если нужно)
            if (syncAssets) {
                const AssetSyncService = (await import('./AssetSyncService.js')).default;
                if (!AssetSyncService.isInitialized) {
                    await AssetSyncService.initialize();
                }
                
                result.assetsSync = await AssetSyncService.syncRussianShares(forceUpdateAssets);
                
                if (LoggerService.isInitialized) {
                    LoggerService.info('Assets sync completed', {
                        service: 'FundamentalDataService',
                        ...result.assetsSync
                    });
                }
            }

            // Шаг 2: Заполнение фундаментальных данных
            result.fundamentalsFill = await this.fillFundamentalDataForAllAssets({
                delayMs,
                forceUpdate: forceUpdateFundamentals
            });

            if (LoggerService.isInitialized) {
                LoggerService.info('Sync and fill completed', {
                    service: 'FundamentalDataService',
                    assetsSynced: result.assetsSync?.synced || 0,
                    fundamentalsSaved: result.fundamentalsFill?.saved || 0,
                    requestCount: result.fundamentalsFill?.requestCount || 0
                });
            }

            return result;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error in sync and fill of fundamental data', {
                    service: 'FundamentalDataService',
                    error: { message: error.message, stack: error.stack }
                });
            }
            throw error;
        }
    }

    /**
     * Очистка кеша
     */
    clearCache() {
        this.dataCache.clear();
        this.cacheTimestamps.clear();
    }
}

// Создаем singleton
const fundamentalDataService = new FundamentalDataService();

export default fundamentalDataService;


