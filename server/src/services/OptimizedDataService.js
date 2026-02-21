import CacheService from './CacheService.js';
import DividendService from './DividendService.js';
import MacroDataService from './MacroDataService.js';
import FundamentalDataService from './FundamentalDataService.js';
import OptionsDataService from './OptionsDataService.js';
import LoggerService from './LoggerService.js';
// import CompanySyncService from './CompanySyncService.js'; // Временно отключено
// import PortfolioSyncService from './PortfolioSyncService.js'; // Временно отключено

/**
 * Оптимизированный сервис для работы с данными
 * Объединяет функциональность DataPreparationService, DataSplittingService, 
 * DataUpdateService, TradingHoursService, TradingHoursCacheService
 */
class OptimizedDataService {
    constructor() {
        this.isInitialized = false;
        this.dataCache = new Map();
        this.updateIntervals = new Map();
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        try {
            // Инициализируем зависимости
            await CacheService.initialize();
            // Инициализируем MacroDataService для работы с макро-фичами
            if (!MacroDataService.isInitialized) {
                await MacroDataService.initialize();
            }
            // Инициализируем FundamentalDataService для работы с фундаментальными данными
            if (!FundamentalDataService.isInitialized) {
                await FundamentalDataService.initialize();
            }
            // Инициализируем OptionsDataService для работы с опционами и IV
            if (!OptionsDataService.isInitialized) {
                await OptionsDataService.initialize();
            }
            // Инициализируем DividendService для работы с дивидендами
            if (!DividendService.isInitialized) {
                await DividendService.initialize();
            }
            // TinkoffApiService не требует инициализации - это экземпляр
            // await CompanySyncService.initialize(); // Временно отключено
            // await PortfolioSyncService.initialize(); // Временно отключено
            
            this.isInitialized = true;
        } catch (error) {
            const LoggerService = (await import('./LoggerService.js')).default;
            LoggerService.error('Failed to initialize Optimized Data Service', {
                service: 'OptimizedDataService',
                operation: 'initialize',
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
            throw error;
        }
    }

    // ============================================================================
    // ПОДГОТОВКА ДАННЫХ ДЛЯ ОБУЧЕНИЯ
    // ============================================================================

    /**
     * Подготовка данных для обучения нейросети
     */
    async prepareTrainingData(candles, lookbackPeriod = 60, predictionHorizon = 5, figi = null) {
        const startTime = Date.now();
        try {
            // Адаптивная проверка данных
            const minRequired = lookbackPeriod + predictionHorizon;
            if (!candles || candles.length < minRequired) {
                // Пытаемся адаптировать параметры для малого количества данных
                if (candles && candles.length >= 10) {
                    const adaptiveLookback = Math.max(5, Math.floor(candles.length / 2));
                    const adaptiveHorizon = Math.max(1, Math.floor(candles.length / 10));

                    // Рекурсивно вызываем с адаптивными параметрами
                    return await this.prepareTrainingData(candles, adaptiveLookback, adaptiveHorizon, figi);
                } else {
                    const LoggerService = (await import('./LoggerService.js')).default;
                    LoggerService.warn('Insufficient data for training', {
                        service: 'OptimizedDataService',
                        operation: 'prepareTrainingData',
                        figi,
                        candlesCount: candles?.length || 0,
                        minRequired
                    });
                    return { features: [], labels: [] };
                }
            }

            // Загружаем все свечи один раз для использования в getMarketFeatures
            // Это предотвращает множественные запросы к кешу
            // skipUpdate = true - режим обучения, не делаем запросы к API
            let allCandles = null;
            if (figi) {
                try {
                    allCandles = await CacheService.getCandles(figi, 'DAY', 365, true);
                } catch (error) {
                    const LoggerService = (await import('./LoggerService.js')).default;
                    LoggerService.warn('Failed to preload candles for market features', {
                        service: 'OptimizedDataService',
                        operation: 'prepareTrainingData',
                        figi,
                        error: { message: error.message }
                    });
                }
            }

            const features = [];
            const labels = [];
            let expectedFeatureSize = null;
            let skippedSamples = 0;
            
            const totalSamples = candles.length - lookbackPeriod - predictionHorizon;
            let processedSamples = 0;
            const logInterval = Math.max(1, Math.floor(totalSamples / 10)); // Логируем каждые 10%

            for (let i = lookbackPeriod; i < candles.length - predictionHorizon; i++) {
                // Создаем окно данных
                // Преобразуем Sequelize модели в простые объекты, если нужно
                const window = candles.slice(i - lookbackPeriod, i).map(c => {
                    if (c && typeof c.toJSON === 'function') {
                        return c.toJSON();
                    }
                    return c;
                });
                const futureCandle = candles[i + predictionHorizon];
                const futureCandleData = futureCandle && typeof futureCandle.toJSON === 'function' 
                    ? futureCandle.toJSON() 
                    : futureCandle;
                
                if (window.length === lookbackPeriod && futureCandleData) {
                    try {
                        // Логируем прогресс
                        processedSamples++;
                        
                        // Подготавливаем фичи, передавая предзагруженные свечи
                        const featureVector = await this.createFeatureVector(window, figi, allCandles);
                        
                        // Проверяем размер фичей для консистентности
                        if (expectedFeatureSize === null) {
                            expectedFeatureSize = featureVector.length;
                        } else if (featureVector.length !== expectedFeatureSize) {
                            const LoggerService = (await import('./LoggerService.js')).default;
                            LoggerService.warn('Feature size mismatch, skipping sample', {
                                service: 'OptimizedDataService',
                                operation: 'prepareTrainingData',
                                figi,
                                expectedSize: expectedFeatureSize,
                                gotSize: featureVector.length,
                                sampleIndex: i
                            });
                            skippedSamples++;
                            continue;
                        }
                        
                        // Создаем лейбл с адаптивным порогом на основе волатильности
                        const priceChange = ((futureCandleData.close - window[window.length - 1].close) / window[window.length - 1].close) * 100;
                        
                        // Рассчитываем волатильность окна для адаптивного порога
                        const windowPrices = window.map(c => c.close);
                        const volatility = this.calculateVolatility(windowPrices);
                        const volatilityPercent = volatility * 100; // Конвертируем в проценты
                        
                        // Адаптивный порог: минимум 0.5%, максимум 2.0%, зависит от волатильности
                        // Для волатильных инструментов порог выше, для стабильных - ниже
                        const adaptiveThreshold = Math.max(0.5, Math.min(2.0, volatilityPercent * 0.8));
                        
                        // Учитываем направление тренда (простое скользящее среднее)
                        const shortMA = windowPrices.slice(-5).reduce((sum, p) => sum + p, 0) / 5;
                        const longMA = windowPrices.slice(-10).reduce((sum, p) => sum + p, 0) / 10;
                        const trend = (shortMA - longMA) / longMA * 100; // Тренд в процентах
                        const trendBonus = trend > 0 ? -0.2 : 0.2; // Если тренд вверх, снижаем порог для BUY
                        
                        // Финальный порог с учетом тренда
                        const finalThreshold = adaptiveThreshold + trendBonus;
                        
                        // Создаем label: 1 если рост превышает адаптивный порог, иначе 0
                        const label = priceChange > finalThreshold ? 1 : 0;
                        
                        features.push(featureVector);
                        labels.push(label);
                    } catch (featureError) {
                        const LoggerService = (await import('./LoggerService.js')).default;
                        LoggerService.warn('Error creating feature vector', {
                            service: 'OptimizedDataService',
                            operation: 'prepareTrainingData',
                            figi,
                            sampleIndex: i,
                            error: { message: featureError.message }
                        });
                        skippedSamples++;
                        continue;
                    }
                }
            }

            if (skippedSamples > 0) {
                const LoggerService = (await import('./LoggerService.js')).default;
                LoggerService.warn('Skipped samples due to inconsistent feature sizes', {
                    service: 'OptimizedDataService',
                    operation: 'prepareTrainingData',
                    figi,
                    skippedSamples,
                    totalSamples: candles.length
                });
            }

            const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);

            return { features, labels };
        } catch (error) {
            const LoggerService = (await import('./LoggerService.js')).default;
            LoggerService.error('Error preparing training data', {
                service: 'OptimizedDataService',
                operation: 'prepareTrainingData',
                figi,
                error: { message: error.message, stack: error.stack }
            });
            return { features: [], labels: [] };
        }
    }

    /**
     * Создание вектора фичей из окна данных
     */
    async createFeatureVector(candles, figi = null, preloadedCandles = null) {
        try {
            const features = [];
            
            // Проверяем, что candles - это массив
            if (!Array.isArray(candles) || candles.length === 0) {
                throw new Error('candles must be a non-empty array');
            }
            
            // Преобразуем Sequelize модели в простые объекты, если нужно
            const normalizedCandles = candles.map(c => {
                if (c && typeof c.toJSON === 'function') {
                    return c.toJSON();
                }
                return c;
            });
            
            // Валидация свечей - проверяем наличие всех обязательных полей
            let validCandles = normalizedCandles.filter(c => {
                if (!c) return false;
                
                // Преобразуем time в Date, если это строка
                let candleTime = c.time;
                if (candleTime && typeof candleTime === 'string') {
                    candleTime = new Date(candleTime);
                } else if (candleTime && !(candleTime instanceof Date)) {
                    candleTime = new Date(candleTime);
                }
                
                return typeof c.close === 'number' && !isNaN(c.close) && c.close > 0 &&
                    typeof c.volume === 'number' && !isNaN(c.volume) && c.volume >= 0 &&
                    typeof c.high === 'number' && !isNaN(c.high) && c.high > 0 &&
                    typeof c.low === 'number' && !isNaN(c.low) && c.low > 0 &&
                    candleTime && !isNaN(candleTime.getTime()) &&
                    c.high >= c.low &&
                    c.high >= c.close &&
                    c.low <= c.close;
            });
            
            // Обновляем time в валидных свечах, если нужно
            validCandles = validCandles.map(c => {
                if (c.time && typeof c.time === 'string') {
                    c.time = new Date(c.time);
                } else if (c.time && !(c.time instanceof Date)) {
                    c.time = new Date(c.time);
                }
                return c;
            });
            
            if (validCandles.length === 0) {
                throw new Error('No valid candles found - all candles missing required fields or have invalid values');
            }
            
            if (validCandles.length < candles.length) {
                const LoggerService = (await import('./LoggerService.js')).default;
                LoggerService.warn('Filtered out invalid candles', {
                    service: 'OptimizedDataService',
                    operation: 'createFeatureVector',
                    figi,
                    filteredCount: candles.length - validCandles.length,
                    validCount: validCandles.length
                });
            }

            // Обработка выбросов с использованием Winsorization (если доступен DataQualityService)
            try {
                const DataQualityService = (await import('./DataQualityService.js')).default;
                if (DataQualityService && DataQualityService.isInitialized && validCandles.length > 10) {
                    const processed = DataQualityService.processOutliers(validCandles, {
                        method: 'winsorize',
                        lowerPercentile: 5,
                        upperPercentile: 95,
                        fields: ['close', 'volume']
                    });
                    validCandles = processed.candles;
                    // Логируем статистику обработки выбросов только если есть выбросы
                    if (processed.stats.close && processed.stats.close.cappedCount > 0) {
                        const LoggerService = (await import('./LoggerService.js')).default;
                        LoggerService.info('Winsorization applied', {
                            service: 'OptimizedDataService',
                            operation: 'createFeatureVector',
                            figi,
                            priceOutliersCapped: processed.stats.close.cappedCount,
                            volumeOutliersCapped: processed.stats.volume?.cappedCount || 0
                        });
                    }
                }
            } catch (error) {
                // Игнорируем ошибки обработки выбросов - не критично
                const LoggerService = (await import('./LoggerService.js')).default;
                LoggerService.warn('Failed to process outliers', {
                    service: 'OptimizedDataService',
                    operation: 'createFeatureVector',
                    figi,
                    error: { message: error.message }
                });
            }
            
            // Базовые фичи: цены и объемы (используем только валидные свечи)
            const prices = validCandles.map(c => c.close);
            const volumes = validCandles.map(c => c.volume);
            const highs = validCandles.map(c => c.high);
            const lows = validCandles.map(c => c.low);
            
            // Упрощенная нормализация: берем только последние 5 значений (достаточно для тренда)
            const pricesForFeatures = prices.slice(-5);
            const volumesForFeatures = volumes.slice(-5);
            
            // Дополняем до 5 элементов, если нужно
            while (pricesForFeatures.length < 5) {
                pricesForFeatures.unshift(pricesForFeatures[0] || 0);
            }
            while (volumesForFeatures.length < 5) {
                volumesForFeatures.unshift(volumesForFeatures[0] || 0);
            }
            
            const normalizedPrices = this.normalizePrices(pricesForFeatures);
            const normalizedVolumes = this.normalizeVolumes(volumesForFeatures);
            
            // Убеждаемся, что у нас ровно 5 фичей для цен и объемов
            if (normalizedPrices.length !== 5) {
                const LoggerService = (await import('./LoggerService.js')).default;
                LoggerService.warn('Prices count mismatch', {
                    service: 'OptimizedDataService',
                    operation: 'createFeatureVector',
                    figi,
                    expected: 5,
                    got: normalizedPrices.length
                });
                while (normalizedPrices.length < 5) {
                    normalizedPrices.push(0);
                }
                if (normalizedPrices.length > 5) {
                    normalizedPrices.splice(5);
                }
            }
            
            if (normalizedVolumes.length !== 5) {
                const LoggerService = (await import('./LoggerService.js')).default;
                LoggerService.warn('Volumes count mismatch', {
                    service: 'OptimizedDataService',
                    operation: 'createFeatureVector',
                    figi,
                    expected: 5,
                    got: normalizedVolumes.length
                });
                while (normalizedVolumes.length < 5) {
                    normalizedVolumes.push(0);
                }
                if (normalizedVolumes.length > 5) {
                    normalizedVolumes.splice(5);
                }
            }
            
            // Технические индикаторы
            const technicalFeatures = this.calculateTechnicalIndicators(prices, volumes, highs, lows);
            
            // Дополнительные фичи: взаимодействия, тренд, волатильность
            const advancedFeatures = this.createAdvancedFeatures(
                prices, 
                volumes, 
                technicalFeatures, 
                validCandles
            );
            
            // Временные фичи (используем последнюю валидную свечу)
            const lastCandle = validCandles[validCandles.length - 1];
            const lastCandleTime = lastCandle?.time;
            
            // Проверяем валидность времени последней свечи
            let validTimestamp = lastCandleTime;
            if (!validTimestamp || (validTimestamp instanceof Date && isNaN(validTimestamp.getTime()))) {
                // Если время невалидно, используем текущее время
                const LoggerService = (await import('./LoggerService.js')).default;
                LoggerService.warn('Invalid time in last candle, using current time', {
                    service: 'OptimizedDataService',
                    operation: 'createFeatureVector',
                    figi: figi || 'N/A',
                    candlesCount: validCandles.length,
                    lastCandleTime,
                    lastCandle: lastCandle ? {
                        hasTime: !!lastCandle.time,
                        timeType: typeof lastCandle.time,
                        timeValue: lastCandle.time,
                        close: lastCandle.close,
                        volume: lastCandle.volume
                    } : null
                });
                validTimestamp = new Date();
            } else if (!(validTimestamp instanceof Date)) {
                // Если это строка или число, конвертируем в Date
                validTimestamp = new Date(validTimestamp);
                if (isNaN(validTimestamp.getTime())) {
                    const LoggerService = (await import('./LoggerService.js')).default;
                    LoggerService.warn('Invalid time in last candle, using current time', {
                        service: 'OptimizedDataService',
                        operation: 'createFeatureVector',
                        figi: figi || 'N/A',
                        lastCandleTime
                    });
                    validTimestamp = new Date();
                }
            }
            
            const timeFeatures = this.createTimeFeatures(validTimestamp);
            
            // Рыночные фичи (если доступны) - передаем предзагруженные свечи для оптимизации
            const marketFeatures = await this.getMarketFeatures(figi, validTimestamp, preloadedCandles);
            
            // Новостные фичи и анализ настроений
            const newsFeatures = await this.getNewsFeatures(figi, validTimestamp);
            
            // Telegram настроения
            const telegramFeatures = await this.getTelegramFeatures(figi, validTimestamp);
            
            // Сигналы аналитиков
            const signalsFeatures = await this.getSignalsFeatures(figi, validTimestamp);
            
            // Макроэкономические фичи (11 фичей: 8 базовых + 3 сырьевых: нефть, газ, золото)
            const macroFeatures = await this.getMacroFeatures(validTimestamp);
            
            // Фундаментальные фичи (P/E, P/B, EV/EBITDA, ROE, Debt/EBITDA, Operating Margin, Net Margin)
            const fundamentalFeatures = figi 
                ? await FundamentalDataService.getFundamentalFeatures(figi, lastCandleTime)
                : new Array(7).fill(0);
            
            // Опционные фичи (IV текущая, IV средняя за 30 дней, IV rank, PCR текущий, PCR средний за 30 дней, Open Interest)
            // Возвращает 6 фичей: [currentIV, avgIV30d, ivRank, currentPCR, avgPCR30d, normalizedOI]
            const optionsFeatures = figi 
                ? await OptionsDataService.getOptionsFeatures(figi, lastCandleTime)
                : new Array(6).fill(0);
            // Используем все 6 фичей
            const optionsFeaturesForModel = optionsFeatures.slice(0, 6);
            
            // Дивидендные фичи (дивидендное покрытие, стабильность выплат)
            // Возвращает 2 фичи: [dividendCoverage, dividendStability]
            const dividendFeatures = figi
                ? await DividendService.getDividendFeatures(figi, lastCandleTime)
                : new Array(2).fill(0.2); // Средние значения по умолчанию
            
            // Отраслевые фичи (условно, только для соответствующих секторов)
            // Возвращает 4 фичи: [sectorDriver1, sectorDriver2, sectorDriver3, sectorDriver4]
            const sectorFeatures = figi
                ? await this.getSectorFeatures(figi, lastCandleTime)
                : new Array(4).fill(0); // Нули по умолчанию для инструментов без сектора
            
            // Объединяем все фичи
            features.push(...normalizedPrices);
            features.push(...normalizedVolumes);
            features.push(...technicalFeatures);
            features.push(...advancedFeatures);
            features.push(...timeFeatures);
            features.push(...marketFeatures);
            features.push(...newsFeatures);
            features.push(...telegramFeatures);
            features.push(...signalsFeatures);
            features.push(...macroFeatures);
            features.push(...fundamentalFeatures);
            features.push(...optionsFeaturesForModel);
            features.push(...dividendFeatures);
            features.push(...sectorFeatures);
            
            // Логирование и исправление размеров фичей
            // Полный набор: 5 (prices) + 5 (volumes) + 6 (technical) + 6 (advanced: interactions, trend, volatility) + 2 (time) + 3 (market) + 2 (news) + 2 (telegram) + 5 (signals) + 15 (macro: 8 базовых + 3 сырьевых + 2 валютных + 2 индекса) + 7 (fundamental) + 6 (options: IV, avgIV, ivRank, PCR, avgPCR, OI) + 2 (dividend: coverage, stability) + 4 (sector: условно для отраслевых инструментов) = 70
            const expectedSize = 70;
            if (features.length !== expectedSize) {
                const LoggerService = (await import('./LoggerService.js')).default;
                LoggerService.warn('Unexpected feature size', {
                    service: 'OptimizedDataService',
                    operation: 'createFeatureVector',
                    figi,
                    gotSize: features.length,
                    expectedSize
                });
                
                // Исправляем размер фичей
                if (features.length < expectedSize) {
                    // Дополняем нулями
                    while (features.length < expectedSize) {
                        features.push(0);
                    }
                } else {
                    // Обрезаем лишние
                    features.splice(expectedSize);
                }
            }
            
            // Применяем clipping для всех фичей - ограничиваем значения в диапазоне -10 до 10
            // Это предотвращает экстремальные значения, которые могут нарушить обучение
            const clippedFeatures = features.map(f => {
                if (typeof f !== 'number' || isNaN(f) || !isFinite(f)) {
                    return 0;
                }
                return Math.max(-10, Math.min(10, f));
            });
            
            return clippedFeatures;
        } catch (error) {
            const LoggerService = (await import('./LoggerService.js')).default;
            LoggerService.error('Error creating feature vector', {
                service: 'OptimizedDataService',
                operation: 'createFeatureVector',
                figi,
                error: { message: error.message, stack: error.stack }
            });
            // Возвращаем нулевой вектор при ошибке с правильным размером
            // Полный набор: 5 + 5 + 6 + 6 + 2 + 3 + 2 + 2 + 5 + 15 + 7 + 6 + 2 + 4 = 70
            return new Array(70).fill(0);
        }
    }

    // ============================================================================
    // РАЗДЕЛЕНИЕ ДАННЫХ
    // ============================================================================

    /**
     * Разделение данных на train/validation/test
     */
    async splitData(figi, options = {}) {
        try {
            const {
                lookbackPeriod = 60,
                predictionHorizon = 5,
                trainRatio = 0.7,
                valRatio = 0.15,
                testRatio = 0.15
            } = options;

            // Получаем все свечи
            const candles = await CacheService.getCandles(figi, 'DAY', 365);
            
            if (candles.length < 100) {
                throw new Error(`Insufficient data: ${candles.length} candles`);
            }

            // Сортируем по времени
            candles.sort((a, b) => new Date(a.time) - new Date(b.time));

            // Создаем окна данных
            const windows = [];
            for (let i = lookbackPeriod; i < candles.length - predictionHorizon; i++) {
                const input = candles.slice(i - lookbackPeriod, i);
                const output = candles[i + predictionHorizon];
                
                if (input.length === lookbackPeriod && output) {
                    const priceChange = ((output.close - input[input.length - 1].close) / input[input.length - 1].close) * 100;
                    
                    windows.push({
                        input,
                        output,
                        inputDate: input[input.length - 1].time,
                        outputDate: output.time,
                        priceChange
                    });
                }
            }

            if (windows.length < 30) {
                throw new Error(`Insufficient windows: ${windows.length}`);
            }

            // Разделяем данные
            const trainSize = Math.floor(windows.length * trainRatio);
            const valSize = Math.floor(windows.length * valRatio);
            
            const splitData = {
                training: windows.slice(0, trainSize),
                validation: windows.slice(trainSize, trainSize + valSize),
                test: windows.slice(trainSize + valSize),
                summary: {
                    total: windows.length,
                    training: trainSize,
                    validation: valSize,
                    test: windows.length - trainSize - valSize
                }
            };

            return splitData;
        } catch (error) {
            const LoggerService = (await import('./LoggerService.js')).default;
            LoggerService.error('Error splitting data', {
                service: 'OptimizedDataService',
                operation: 'splitData',
                error: { message: error.message, stack: error.stack }
            });
            throw error;
        }
    }

    /**
     * Проверка готовности данных
     */
    async checkDataReadiness(figi) {
        try {
            const candles = await CacheService.getCandles(figi, 'DAY', 365);
            const issues = [];

            if (candles.length < 30) {
                issues.push('Insufficient training data (< 30 candles)');
            }
            if (candles.length < 10) {
                issues.push('Insufficient validation data (< 10 candles)');
            }
            if (candles.length < 10) {
                issues.push('Insufficient test data (< 10 candles)');
            }

            return {
                ready: issues.length === 0,
                issues,
                candleCount: candles.length
            };
        } catch (error) {
            return {
                ready: false,
                issues: ['Error checking data readiness'],
                candleCount: 0
            };
        }
    }

    // ============================================================================
    // ОБНОВЛЕНИЕ ДАННЫХ
    // ============================================================================

    /**
     * Обновление данных для инструмента
     */
    async updateInstrumentData(figi) {
        try {
            // Обновляем свечи
            await CacheService.updateCandles(figi);
            
            // Обновляем дивиденды только для акций и ETF
            // Проверяем тип инструмента перед вызовом updateDividends
            const CachedInstrument = (await import('../models/CachedInstrument.js')).default;
            const instrument = await CachedInstrument.findOne({ 
                where: { figi },
                attributes: ['figi', 'instrumentType']
            });
            
            if (instrument) {
                const instrumentType = (instrument.instrumentType || '').toLowerCase();
                // Обновляем дивиденды только для акций и ETF
                if (!instrumentType || instrumentType === 'share' || instrumentType === 'etf') {
                    await DividendService.updateDividends(figi);
                }
                // Для других типов (future, bond, currency, option) пропускаем обновление дивидендов
            } else {
                // Если инструмент не найден в кеше, все равно пытаемся обновить дивиденды
                // (проверка будет в DividendService)
                await DividendService.updateDividends(figi);
            }

        } catch (error) {
            const LoggerService = (await import('./LoggerService.js')).default;
            LoggerService.error('Error updating data', {
                service: 'OptimizedDataService',
                operation: 'updateData',
                figi,
                error: { message: error.message, stack: error.stack }
            });
            throw error;
        }
    }

    /**
     * Пакетное обновление данных
     */
    async updateAllData() {
        try {
            const instruments = await CacheService.getAllInstruments();
            const results = [];
            
            for (const instrument of instruments) {
                try {
                    await this.updateInstrumentData(instrument.figi);
                    results.push({ figi: instrument.figi, success: true });
                } catch (error) {
                    results.push({ figi: instrument.figi, success: false, error: error.message });
                }
            }
            return results;
        } catch (error) {
            const LoggerService = (await import('./LoggerService.js')).default;
            LoggerService.error('Error updating all data', {
                service: 'OptimizedDataService',
                operation: 'updateAllData',
                error: { message: error.message, stack: error.stack }
            });
            throw error;
        }
    }

    // ============================================================================
    // ТОРГОВЫЕ ЧАСЫ
    // ============================================================================

    /**
     * Получение торговых часов для инструмента
     */
    async getTradingHours(figi) {
        try {
            return await CacheService.getTradingHours(figi);
        } catch (error) {
            const LoggerService = (await import('./LoggerService.js')).default;
            LoggerService.error('Error getting trading hours', {
                service: 'OptimizedDataService',
                operation: 'getTradingHours',
                error: { message: error.message, stack: error.stack }
            });
            return null;
        }
    }

    /**
     * Проверка, открыт ли рынок
     */
    async isMarketOpen(figi) {
        try {
            const tradingHours = await this.getTradingHours(figi);
            if (!tradingHours) return false;
            
            const now = new Date();
            const currentTime = now.getHours() * 60 + now.getMinutes();
            
            return currentTime >= tradingHours.open && currentTime <= tradingHours.close;
        } catch (error) {
            const LoggerService = (await import('./LoggerService.js')).default;
            LoggerService.error('Error checking market status', {
                service: 'OptimizedDataService',
                operation: 'checkMarketStatus',
                error: { message: error.message, stack: error.stack }
            });
            return false;
        }
    }

    // ============================================================================
    // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
    // ============================================================================

    /**
     * Нормализация цен
     */
    normalizePrices(prices) {
        if (prices.length === 0) return [];
        
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const range = max - min;
        
        if (range === 0) return prices.map(() => 0.5);
        
        return prices.map(price => (price - min) / range);
    }

    /**
     * Нормализация объемов
     */
    normalizeVolumes(volumes) {
        if (volumes.length === 0) return [];
        
        const max = Math.max(...volumes);
        if (max === 0) return volumes.map(() => 0);
        
        return volumes.map(volume => volume / max);
    }

    /**
     * Расчет технических индикаторов (упрощенный набор - только устойчивые индикаторы)
     */
    calculateTechnicalIndicators(prices, volumes, highs, lows) {
        try {
            const features = [];
            
            // RSI (1 фича) - устойчивый осциллятор
            const rsi = this.calculateRSI(prices);
            features.push(rsi);
            
            // Bollinger Bands position (1 фича) - позиция цены относительно BB (0-1)
            const bb = this.calculateBollingerBands(prices);
            const currentPrice = prices[prices.length - 1];
            
            // MACD line (1 фича) - только основная линия, убираем signal и histogram
            const macd = this.calculateMACD(prices);
            // MACD может быть большим, нормализуем его через tanh для ограничения диапазона
            const macdValue = macd[0] || 0;
            // Используем сигмоиду для нормализации MACD к диапазону -1 до 1
            // Нормализуем относительно текущей цены для стабильности
            const normalizedMacd = currentPrice > 0 ? Math.tanh(macdValue / currentPrice) * 0.1 : 0;
            features.push(normalizedMacd);
            const bbPosition = bb[1] > 0 ? (currentPrice - bb[0]) / (bb[2] - bb[0]) : 0.5; // Нормализованная позиция
            features.push(Math.max(0, Math.min(1, bbPosition))); // Ограничиваем 0-1
            
            // SMA20 (1 фича) - нормализованная относительно текущей цены (ограничиваем диапазон)
            const sma20 = this.calculateSMA(prices, 20);
            const sma20Ratio = currentPrice > 0 ? sma20 / currentPrice : 1;
            // Ограничиваем отношение в диапазоне 0.5-2.0 (цена может быть от 0.5x до 2x от SMA)
            features.push(Math.max(0.5, Math.min(2.0, sma20Ratio)) / 2.0); // Нормализуем к 0-1
            
            // EMA12 (1 фича) - нормализованная относительно текущей цены (ограничиваем диапазон)
            const ema12 = this.calculateEMA(prices, 12);
            const ema12Ratio = currentPrice > 0 ? ema12 / currentPrice : 1;
            // Ограничиваем отношение в диапазоне 0.5-2.0 (цена может быть от 0.5x до 2x от EMA)
            features.push(Math.max(0.5, Math.min(2.0, ema12Ratio)) / 2.0); // Нормализуем к 0-1
            
            // Volume SMA (1 фича) - нормализованная относительно текущего объема
            const volumeSma = this.calculateSMA(volumes, 5);
            const currentVolume = volumes[volumes.length - 1] || 1;
            const volumeRatio = volumeSma > 0 ? currentVolume / volumeSma : 1;
            features.push(Math.min(2, volumeRatio)); // Ограничиваем до 2x
            
            // Всего должно быть 6 фичей (упрощенный набор)
            if (features.length !== 6) {
                if (LoggerService.isInitialized) {
                    LoggerService.warn('Technical indicators count mismatch', {
                        service: 'OptimizedDataService',
                        operation: 'calculateTechnicalIndicators',
                        expected: 6,
                        got: features.length
                    });
                }
                // Дополняем или обрезаем до 6
                while (features.length < 6) {
                    features.push(0);
                }
                if (features.length > 6) {
                    features.splice(6);
                }
            }
            
            return features;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error calculating technical indicators', {
                    service: 'OptimizedDataService',
                    operation: 'calculateTechnicalIndicators',
                    error: { message: error.message, stack: error.stack }
                });
            }
            return new Array(6).fill(0);
        }
    }

    /**
     * Создание дополнительных фичей: взаимодействия, тренд, волатильность
     * @param {Array} prices - Массив цен
     * @param {Array} volumes - Массив объемов
     * @param {Array} technicalFeatures - Технические индикаторы [rsi, macd, bbPosition, sma20, ema12, volumeSma]
     * @param {Array} candles - Массив свечей
     * @returns {Array} - Массив дополнительных фичей
     */
    createAdvancedFeatures(prices, volumes, technicalFeatures, candles) {
        try {
            const features = [];
            
            if (prices.length < 2 || technicalFeatures.length < 6) {
                return new Array(6).fill(0); // Возвращаем 6 фичей по умолчанию
            }
            
            const currentPrice = prices[prices.length - 1];
            const [rsi, macd, bbPosition, sma20, ema12, volumeSma] = technicalFeatures;
            
            // 1. Взаимодействия между фичами (2 фичи)
            // RSI * MACD - комбинация осциллятора и трендового индикатора
            const rsiMacdInteraction = (rsi / 100) * macd; // Нормализуем RSI к 0-1
            features.push(Math.max(-1, Math.min(1, rsiMacdInteraction)));
            
            // RSI * BB Position - комбинация осциллятора и волатильности
            const rsiBbInteraction = (rsi / 100) * bbPosition;
            features.push(Math.max(-1, Math.min(1, rsiBbInteraction)));
            
            // 2. Фичи тренда (2 фичи)
            // Сила тренда: разница между короткой и длинной MA, нормализованная
            const shortMA = ema12 * currentPrice; // Восстанавливаем из нормализованного значения
            const longMA = sma20 * currentPrice * 2; // Восстанавливаем из нормализованного значения
            const trendStrength = currentPrice > 0 && longMA > 0 
                ? Math.abs(shortMA - longMA) / longMA 
                : 0;
            features.push(Math.min(1, trendStrength)); // Ограничиваем до 1
            
            // Направление тренда: 1 для восходящего, -1 для нисходящего, 0 для бокового
            const trendDirection = shortMA > longMA ? 1 : (shortMA < longMA ? -1 : 0);
            features.push(trendDirection);
            
            // 3. Фичи волатильности (2 фичи)
            // Относительная волатильность: текущая волатильность / историческая волатильность
            if (prices.length >= 20) {
                const recentPrices = prices.slice(-10);
                const historicalPrices = prices.slice(-20);
                
                const currentVolatility = this.calculateVolatility(recentPrices);
                const historicalVolatility = this.calculateVolatility(historicalPrices);
                
                const volatilityRatio = historicalVolatility > 0 
                    ? currentVolatility / historicalVolatility 
                    : 1;
                features.push(Math.min(3, volatilityRatio)); // Ограничиваем до 3x
            } else {
                features.push(1); // Нейтральное значение при недостатке данных
            }
            
            // ATR нормализованный относительно цены
            if (candles && candles.length >= 14) {
                const atr = this.calculateATR(candles, 14);
                const atrRatio = currentPrice > 0 ? atr / currentPrice : 0;
                features.push(Math.min(0.1, atrRatio)); // Ограничиваем до 10% от цены
            } else {
                features.push(0);
            }
            
            // Всего должно быть 6 дополнительных фичей
            if (features.length !== 6) {
                while (features.length < 6) {
                    features.push(0);
                }
                if (features.length > 6) {
                    features.splice(6);
                }
            }
            
            return features;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error creating advanced features', {
                    service: 'OptimizedDataService',
                    operation: 'createAdvancedFeatures',
                    error: { message: error.message, stack: error.stack }
                });
            }
            return new Array(6).fill(0);
        }
    }

    /**
     * Расчет волатильности (стандартное отклонение доходности)
     * @param {Array} prices - Массив цен
     * @returns {number} - Волатильность
     */
    calculateVolatility(prices) {
        try {
            if (!prices || prices.length < 2) {
                return 0;
            }
            
            // Вычисляем доходности
            const returns = [];
            for (let i = 1; i < prices.length; i++) {
                if (prices[i - 1] > 0) {
                    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
                }
            }
            
            if (returns.length === 0) {
                return 0;
            }
            
            // Средняя доходность
            const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
            
            // Дисперсия
            const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length;
            
            // Стандартное отклонение (волатильность)
            return Math.sqrt(variance);
        } catch (error) {
            console.error('Error calculating volatility:', error);
            return 0;
        }
    }

    /**
     * Расчет Average True Range (ATR) - средний истинный диапазон
     * ATR используется для измерения волатильности и расчета динамических стоп-лоссов
     * @param {Array} candles - Массив свечей с полями high, low, close
     * @param {number} period - Период для расчета ATR (по умолчанию 14)
     * @returns {number} - Значение ATR
     */
    calculateATR(candles, period = 14) {
        try {
            if (!candles || candles.length < period + 1) {
                // Если данных недостаточно, возвращаем приблизительное значение на основе доступных данных
                if (candles && candles.length > 0) {
                    const avgRange = candles.reduce((sum, candle, index) => {
                        if (index === 0) return sum;
                        const range = Math.abs(candle.high - candle.low);
                        return sum + range;
                    }, 0) / (candles.length - 1);
                    return avgRange;
                }
                return 0;
            }

            const trueRanges = [];
            
            for (let i = 1; i < candles.length; i++) {
                const current = candles[i];
                const previous = candles[i - 1];
                
                // True Range = максимум из:
                // 1. High - Low
                // 2. |High - Previous Close|
                // 3. |Low - Previous Close|
                const tr1 = current.high - current.low;
                const tr2 = Math.abs(current.high - previous.close);
                const tr3 = Math.abs(current.low - previous.close);
                
                const trueRange = Math.max(tr1, tr2, tr3);
                trueRanges.push(trueRange);
            }
            
            // Если у нас достаточно данных для полного периода, используем скользящее среднее
            if (trueRanges.length >= period) {
                // Берем последние period значений для расчета ATR
                const recentTRs = trueRanges.slice(-period);
                const atr = recentTRs.reduce((sum, tr) => sum + tr, 0) / period;
                return atr;
            } else {
                // Если данных меньше периода, используем простое среднее доступных значений
                const atr = trueRanges.reduce((sum, tr) => sum + tr, 0) / trueRanges.length;
                return atr;
            }
        } catch (error) {
            console.error('Error calculating ATR:', error);
            return 0;
        }
    }

    /**
     * Создание временных фичей (упрощенный набор - только важные)
     */
    createTimeFeatures(timestamp) {
        const date = new Date(timestamp);
        return [
            date.getDay() / 6, // День недели (0-1) - важен для недельных паттернов
            date.getMonth() / 11 // Месяц (0-1) - важен для сезонности
            // Убрали день месяца, час и минуту - менее важны для дневных свечей
        ];
    }

    /**
     * Получение рыночных фичей
     * ВАЖНО: Фильтруем свечи только до переданного timestamp для предотвращения утечки данных
     * @param {string} figi - FIGI инструмента
     * @param {Date|string} timestamp - Максимальная дата свечей (для предотвращения утечки данных)
     */
    async getMarketFeatures(figi, timestamp, preloadedCandles = null) {
        try {
            // Если figi не указан, возвращаем дефолтные значения
            if (!figi) {
                return [0, 0, 0]; // Возвращаем 3 фичи: volatility, trend, rsi
            }
            
            // Используем предзагруженные свечи, если они переданы, иначе загружаем из кеша
            // skipUpdate = true - режим обучения, не делаем запросы к API
            let candles = preloadedCandles;
            if (!candles || candles.length === 0) {
                // Загружаем только если не переданы предзагруженные свечи (только из БД, без обновления)
                candles = await CacheService.getCandles(figi, 'DAY', 30, true);
            }
            
            if (!candles || candles.length < 10) {
                return [0, 0, 0]; // Возвращаем 3 фичи: volatility, trend, rsi
            }

            // Фильтруем свечи только до переданного timestamp (защита от утечки данных)
            let filteredCandles = candles;
            if (timestamp) {
                const timestampDate = new Date(timestamp);
                filteredCandles = candles.filter(c => {
                    const candleDate = new Date(c.time);
                    return candleDate <= timestampDate;
                });
            }

            if (filteredCandles.length < 10) {
                // Если после фильтрации недостаточно данных, возвращаем 3 фичи: volatility, trend, rsi
                return [0, 0, 0];
            }

            const prices = filteredCandles.map(c => c.close);
            const volumes = filteredCandles.map(c => c.volume || 0);
            
            // Рассчитываем только самые важные фичи (упрощенный набор)
            const volatility = this.calculateVolatility(prices);
            const trend = this.calculateTrend(prices);
            const rsi = this.calculateRSI(prices);
            
            // Убеждаемся, что все значения скалярные
            const features = [
                typeof volatility === 'number' ? volatility : 0,
                typeof trend === 'number' ? trend : 0,
                typeof rsi === 'number' ? rsi : 0
            ];
            
            return features;
        } catch (error) {
            console.error('Error getting market features:', error);
            return [0, 0, 0];
        }
    }

    /**
     * Расчет RSI
     */
    calculateRSI(prices, period = 14) {
        if (prices.length < period + 1) return 0.5;
        
        let gains = 0;
        let losses = 0;
        
        for (let i = 1; i <= period; i++) {
            const change = prices[i] - prices[i - 1];
            if (change > 0) gains += change;
            else losses -= change;
        }
        
        const avgGain = gains / period;
        const avgLoss = losses / period;
        
        if (avgLoss === 0) return 1;
        
        const rs = avgGain / avgLoss;
        return 1 - (1 / (1 + rs));
    }

    /**
     * Расчет MACD
     */
    calculateMACD(prices) {
        if (prices.length < 26) return [0, 0, 0];
        
        const ema12 = this.calculateEMA(prices, 12);
        const ema26 = this.calculateEMA(prices, 26);
        const macd = ema12 - ema26;
        const signal = this.calculateEMA([macd], 9);
        const histogram = macd - signal;
        
        return [macd, signal, histogram];
    }

    /**
     * Расчет Bollinger Bands
     */
    calculateBollingerBands(prices, period = 20) {
        if (prices.length < period) return [0, 0, 0];
        
        const sma = this.calculateSMA(prices, period);
        const variance = prices.slice(-period).reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period;
        const stdDev = Math.sqrt(variance);
        
        return [sma - 2 * stdDev, sma, sma + 2 * stdDev];
    }

    /**
     * Расчет SMA
     */
    calculateSMA(data, period) {
        if (data.length < period) return data[data.length - 1] || 0;
        return data.slice(-period).reduce((sum, value) => sum + value, 0) / period;
    }

    /**
     * Расчет EMA
     */
    calculateEMA(data, period) {
        if (data.length === 0) return 0;
        if (data.length === 1) return data[0];
        
        const multiplier = 2 / (period + 1);
        let ema = data[0];
        
        for (let i = 1; i < data.length; i++) {
            ema = (data[i] * multiplier) + (ema * (1 - multiplier));
        }
        
        return ema;
    }

    /**
     * Получение статуса сервиса
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            cacheSize: this.dataCache.size,
            updateIntervals: this.updateIntervals.size
        };
    }

    /**
     * Расчет волатильности
     */
    calculateVolatility(prices) {
        if (prices.length < 2) return 0;
        
        const returns = prices.slice(1).map((price, i) => (price - prices[i]) / prices[i]);
        const variance = returns.reduce((sum, ret) => sum + ret * ret, 0) / returns.length;
        return Math.sqrt(variance);
    }

    /**
     * Расчет тренда
     */
    calculateTrend(prices) {
        if (prices.length < 2) return 0;
        
        const firstPrice = prices[0];
        const lastPrice = prices[prices.length - 1];
        return (lastPrice - firstPrice) / firstPrice;
    }

    /**
     * Расчет соотношения объемов
     */
    calculateVolumeRatio(volumes) {
        if (volumes.length < 2) return 1;
        
        const avgVolume = volumes.reduce((sum, vol) => sum + vol, 0) / volumes.length;
        const lastVolume = volumes[volumes.length - 1];
        return avgVolume > 0 ? lastVolume / avgVolume : 1;
    }

    /**
     * Расчет изменения цены
     */
    calculatePriceChange(prices) {
        if (prices.length < 2) return 0;
        
        const firstPrice = prices[0];
        const lastPrice = prices[prices.length - 1];
        return (lastPrice - firstPrice) / firstPrice;
    }

    /**
     * Расчет RSI
     */
    calculateRSI(prices, period = 14) {
        if (prices.length < period + 1) return 50;
        
        const gains = [];
        const losses = [];
        
        for (let i = 1; i < prices.length; i++) {
            const change = prices[i] - prices[i - 1];
            if (change > 0) {
                gains.push(change);
                losses.push(0);
            } else {
                gains.push(0);
                losses.push(Math.abs(change));
            }
        }
        
        if (gains.length < period) return 50;
        
        const avgGain = gains.slice(-period).reduce((sum, gain) => sum + gain, 0) / period;
        const avgLoss = losses.slice(-period).reduce((sum, loss) => sum + loss, 0) / period;
        
        if (avgLoss === 0) return 100;
        
        const rs = avgGain / avgLoss;
        const rsi = 100 - (100 / (1 + rs));
        
        return Math.max(0, Math.min(100, rsi));
    }

    /**
     * Получение новостных фичей
     * ВАЖНО: Фильтруем новости только до переданного timestamp для предотвращения утечки данных
     */
    async getNewsFeatures(figi, timestamp) {
        try {
            const NewsAnalysisService = (await import('./NewsAnalysisService.js')).default;
            
            // Получаем новости за последние 7 дней только из БД (для обучения)
            const news = await NewsAnalysisService.getCachedNews(figi, 7, 20);
            
            if (news.length === 0) {
                return [0, 0]; // Нет новостей - возвращаем 2 фичи
            }
            
            // Дополнительная фильтрация: исключаем новости после timestamp (защита от утечки данных)
            const timestampDate = new Date(timestamp);
            const filteredNews = news.filter(n => {
                const newsDate = new Date(n.publishedAt);
                return newsDate <= timestampDate;
            });
            
            if (filteredNews.length === 0) {
                // Возвращаем нейтральные значения вместо нулей (0 = нейтральный сентимент, 0.5 = средняя релевантность)
                return [0, 0.5]; // Нет новостей до указанного времени - нейтральные значения
            }
            
            // Сохраняем формат из 2 фич, но используем source-aware взвешивание:
            // company > sector/macro > political.
            const getSourceWeight = (newsItem) => {
                const category = String(newsItem?.category || '').toLowerCase();
                if (category === 'political') return 0.75;
                if (category === 'macro') return 0.85;
                return 1.0;
            };

            let weightedSentiment = 0;
            let weightedRelevance = 0;
            let totalWeight = 0;
            for (const item of filteredNews) {
                const weight = getSourceWeight(item);
                weightedSentiment += (item.sentiment || 0) * weight;
                weightedRelevance += (item.relevance || 0.5) * weight;
                totalWeight += weight;
            }

            const avgSentiment = totalWeight > 0 ? weightedSentiment / totalWeight : 0;
            const avgRelevance = totalWeight > 0 ? weightedRelevance / totalWeight : 0.5;
            
            const features = [
                avgSentiment,      // Средний сентимент
                avgRelevance       // Средняя релевантность (уверенность)
            ];
            
            // Убеждаемся, что возвращаем ровно 2 фичи
            if (features.length !== 2) {
                console.warn(`⚠️ News features count mismatch: expected 2, got ${features.length}`);
                while (features.length < 2) {
                    features.push(0);
                }
                if (features.length > 2) {
                    features.splice(2);
                }
            }
            
            return features;
            
        } catch (error) {
            console.error('❌ Ошибка получения новостных фичей:', error);
            return [0, 0];
        }
    }

    /**
     * Получение фичей настроений Telegram
     * ВАЖНО: Фильтруем сообщения только до переданного timestamp для предотвращения утечки данных
     */
    async getTelegramFeatures(figi, timestamp) {
        try {
            const TelegramSentimentService = (await import('./TelegramSentimentService.js')).default;
            
            // Получаем анализ настроений за последние 7 дней от переданного timestamp (не от текущего момента!)
            const sentiment = await TelegramSentimentService.analyzeTelegramSentiment(figi, {
                days: 7,
                limit: 100,
                maxDate: timestamp // Передаем максимальную дату для фильтрации
            });
            
            if (sentiment.messageCount === 0) {
                // Возвращаем нейтральные значения вместо нулей (0 = нейтральный сентимент, 0.5 = средняя уверенность)
                return [0, 0.5]; // Нет данных - нейтральные значения
            }
            
            // Рассчитываем только самые важные фичи (упрощенный набор)
            const sentimentValue = sentiment.sentiment || 0;
            const confidence = sentiment.confidence || 0;
            
            const features = [
                sentimentValue,    // Общий сентимент
                confidence         // Уверенность
            ];
            
            // Убеждаемся, что возвращаем ровно 2 фичи
            if (features.length !== 2) {
                console.warn(`⚠️ Telegram features count mismatch: expected 2, got ${features.length}`);
                while (features.length < 2) {
                    features.push(0);
                }
                if (features.length > 2) {
                    features.splice(2);
                }
            }
            
            return features;
            
        } catch (error) {
            console.error('❌ Ошибка получения Telegram фичей:', error);
            return [0, 0]; // Возвращаем 2 фичи при ошибке
        }
    }

    /**
     * Получение макроэкономических фичей
     * ВАЖНО: Используем данные только до переданного timestamp для предотвращения утечки данных
     * @param {Date|string} timestamp - Временная метка для получения макро-данных
     * @param {string} country - Код страны (по умолчанию 'RUS')
     * @returns {Promise<Array>} - Массив из 8 макро-фичей
     */
    async getMacroFeatures(timestamp, country = 'RUS') {
        try {
            // Убеждаемся, что MacroDataService инициализирован
            if (!MacroDataService.isInitialized) {
                await MacroDataService.initialize();
            }
            
            // Преобразуем timestamp в Date, если это строка
            const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
            
            // Проверяем валидность даты
            if (!date || isNaN(date.getTime())) {
                console.warn('⚠️ Невалидная дата для макро-фичей:', timestamp);
                return new Array(11).fill(0);
            }
            
            // Получаем макро-фичи для указанной даты (теперь 15 фичей: 8 базовых + 3 сырьевых + 2 валютных + 2 индекса)
            const macroFeatures = await MacroDataService.getMacroFeatures(date, country);
            
            // Убеждаемся, что возвращаем ровно 15 фичей
            if (macroFeatures.length !== 15) {
                console.warn(`⚠️ Macro features count mismatch: expected 15, got ${macroFeatures.length}`);
                // Дополняем или обрезаем до 15
                const fixedFeatures = [...macroFeatures];
                while (fixedFeatures.length < 15) {
                    fixedFeatures.push(0);
                }
                if (fixedFeatures.length > 15) {
                    fixedFeatures.splice(15);
                }
                return fixedFeatures;
            }
            
            return macroFeatures;
            
        } catch (error) {
            console.error('❌ Ошибка получения макро-фичей:', error);
            // Возвращаем 15 нулевых фичей при ошибке (8 базовых + 3 сырьевых + 2 валютных + 2 индекса)
            return new Array(15).fill(0);
        }
    }

    /**
     * Получение отраслевых фичей (драйверы по секторам)
     * Возвращает 4 фичи условно для соответствующих секторов
     * @param {string} figi - FIGI инструмента
     * @param {Date|string} timestamp - Временная метка для получения данных
     * @returns {Promise<Array<number>>} - Массив из 4 фичей: [driver1, driver2, driver3, driver4]
     */
    async getSectorFeatures(figi, timestamp) {
        try {
            if (!figi) {
                return [0, 0, 0, 0]; // Нет FIGI - возвращаем нули
            }

            // Получаем инструмент из кеша для определения сектора
            const instrument = await CacheService.getInstrument(figi, true);
            if (!instrument || !instrument.sector) {
                return [0, 0, 0, 0]; // Нет сектора - возвращаем нули
            }

            const sector = instrument.sector.toLowerCase();
            const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
            const { Op } = await import('sequelize');
            const MacroIndicator = (await import('../models/MacroIndicator.js')).default;

            // Преобразуем сектор к стандартному виду
            let normalizedSector = 'other';
            if (sector.includes('нефт') || sector.includes('газ') || sector.includes('oil') || sector.includes('gas') || sector.includes('energy')) {
                normalizedSector = 'oil_gas';
            } else if (sector.includes('металл') || sector.includes('сталь') || sector.includes('metal') || sector.includes('steel') || sector.includes('mining')) {
                normalizedSector = 'metallurgy';
            } else if (sector.includes('финанс') || sector.includes('банк') || sector.includes('finance') || sector.includes('bank')) {
                normalizedSector = 'finance';
            } else if (sector.includes('it') || sector.includes('технологи') || sector.includes('technology') || sector.includes('software')) {
                normalizedSector = 'it';
            }

            // В зависимости от сектора, получаем соответствующие драйверы
            switch (normalizedSector) {
                case 'oil_gas': {
                    // Нефтегаз: цена нефти, цена газа, изменение нефти, изменение газа
                    const oilPrice = await MacroIndicator.findOne({
                        where: {
                            indicatorType: 'oil_price',
                            country: 'RUS',
                            source: 'moex_iss_oil',
                            period: { [Op.lte]: date }
                        },
                        order: [['period', 'DESC']],
                        limit: 1
                    });

                    const gasPrice = await MacroIndicator.findOne({
                        where: {
                            indicatorType: 'oil_price',
                            country: 'RUS',
                            source: 'moex_iss_gas',
                            period: { [Op.lte]: date }
                        },
                        order: [['period', 'DESC']],
                        limit: 1
                    });

                    const oilValue = oilPrice ? parseFloat(oilPrice.value) : null;
                    const gasValue = gasPrice ? parseFloat(gasPrice.value) : null;

                    // Получаем предыдущие значения для расчета изменений
                    let oilPrevious = null;
                    if (oilPrice) {
                        const prevOil = await MacroIndicator.findOne({
                            where: {
                                indicatorType: 'oil_price',
                                country: 'RUS',
                                source: 'moex_iss_oil',
                                period: { [Op.lt]: oilPrice.period }
                            },
                            order: [['period', 'DESC']],
                            limit: 1
                        });
                        oilPrevious = prevOil ? parseFloat(prevOil.value) : null;
                    }

                    let gasPrevious = null;
                    if (gasPrice) {
                        const prevGas = await MacroIndicator.findOne({
                            where: {
                                indicatorType: 'oil_price',
                                country: 'RUS',
                                source: 'moex_iss_gas',
                                period: { [Op.lt]: gasPrice.period }
                            },
                            order: [['period', 'DESC']],
                            limit: 1
                        });
                        gasPrevious = prevGas ? parseFloat(prevGas.value) : null;
                    }

                    // Нормализация (0-1)
                    const normalizedOil = oilValue !== null && oilValue > 0
                        ? Math.min(1, Math.max(0, (oilValue - 50) / 100)) // 50-150 USD -> 0-1
                        : 0.5;

                    const normalizedGas = gasValue !== null && gasValue > 0
                        ? Math.min(1, Math.max(0, (gasValue - 100) / 400)) // 100-500 RUB -> 0-1
                        : 0.5;

                    // Изменения (-1 до 1)
                    const oilChange = (oilValue !== null && oilPrevious !== null && oilPrevious > 0)
                        ? Math.min(1, Math.max(-1, ((oilValue - oilPrevious) / oilPrevious) * 5)) // -20% до +20% -> -1 до 1
                        : 0;

                    const gasChange = (gasValue !== null && gasPrevious !== null && gasPrevious > 0)
                        ? Math.min(1, Math.max(-1, ((gasValue - gasPrevious) / gasPrevious) * 5))
                        : 0;

                    return [normalizedOil, normalizedGas, oilChange, gasChange];
                }

                case 'metallurgy': {
                    // Металлургия: алюминий, никель, золото, изменение алюминия
                    const aluminumPrice = await MacroIndicator.findOne({
                        where: {
                            indicatorType: 'oil_price',
                            country: 'RUS',
                            source: 'moex_iss_aluminum',
                            period: { [Op.lte]: date }
                        },
                        order: [['period', 'DESC']],
                        limit: 1
                    });

                    const nickelPrice = await MacroIndicator.findOne({
                        where: {
                            indicatorType: 'oil_price',
                            country: 'RUS',
                            source: 'moex_iss_nickel',
                            period: { [Op.lte]: date }
                        },
                        order: [['period', 'DESC']],
                        limit: 1
                    });

                    const goldPrice = await MacroIndicator.findOne({
                        where: {
                            indicatorType: 'oil_price',
                            country: 'RUS',
                            source: 'moex_iss_gold',
                            period: { [Op.lte]: date }
                        },
                        order: [['period', 'DESC']],
                        limit: 1
                    });

                    const aluminumValue = aluminumPrice ? parseFloat(aluminumPrice.value) : null;
                    const nickelValue = nickelPrice ? parseFloat(nickelPrice.value) : null;
                    const goldValue = goldPrice ? parseFloat(goldPrice.value) : null;

                    // Получаем предыдущее значение алюминия для изменения
                    let aluminumPrevious = null;
                    if (aluminumPrice) {
                        const prevAluminum = await MacroIndicator.findOne({
                            where: {
                                indicatorType: 'oil_price',
                                country: 'RUS',
                                source: 'moex_iss_aluminum',
                                period: { [Op.lt]: aluminumPrice.period }
                            },
                            order: [['period', 'DESC']],
                            limit: 1
                        });
                        aluminumPrevious = prevAluminum ? parseFloat(prevAluminum.value) : null;
                    }

                    // Нормализация (0-1)
                    const normalizedAluminum = aluminumValue !== null && aluminumValue > 0
                        ? Math.min(1, Math.max(0, (aluminumValue - 1500) / 2500)) // 1500-4000 USD/т -> 0-1 (примерные диапазоны)
                        : 0.5;

                    const normalizedNickel = nickelValue !== null && nickelValue > 0
                        ? Math.min(1, Math.max(0, (nickelValue - 10000) / 30000)) // 10000-40000 USD/т -> 0-1
                        : 0.5;

                    const normalizedGold = goldValue !== null && goldValue > 0
                        ? Math.min(1, Math.max(0, (goldValue - 1500) / 1000)) // 1500-2500 USD -> 0-1
                        : 0.5;

                    const aluminumChange = (aluminumValue !== null && aluminumPrevious !== null && aluminumPrevious > 0)
                        ? Math.min(1, Math.max(-1, ((aluminumValue - aluminumPrevious) / aluminumPrevious) * 5))
                        : 0;

                    return [normalizedAluminum, normalizedNickel, normalizedGold, aluminumChange];
                }

                case 'finance': {
                    // Финансы: ключевая ставка, изменение ставки, индекс IMOEX, изменение IMOEX
                    const interestRate = await MacroIndicator.findOne({
                        where: {
                            indicatorType: 'interest_rate',
                            country: 'RUS',
                            period: { [Op.lte]: date }
                        },
                        order: [['period', 'DESC']],
                        limit: 1
                    });

                    const imoexIndex = await MacroIndicator.findOne({
                        where: {
                            indicatorType: 'oil_price',
                            country: 'RUS',
                            source: 'tinkoff_imoex',
                            period: { [Op.lte]: date }
                        },
                        order: [['period', 'DESC']],
                        limit: 1
                    });

                    const rateValue = interestRate ? parseFloat(interestRate.value) : null;
                    const imoexValue = imoexIndex ? parseFloat(imoexIndex.value) : null;

                    // Получаем предыдущие значения
                    let ratePrevious = null;
                    if (interestRate?.metadata?.previousValue !== undefined && interestRate.metadata.previousValue !== null) {
                        ratePrevious = parseFloat(interestRate.metadata.previousValue);
                    } else if (interestRate) {
                        const prevRate = await MacroIndicator.findOne({
                            where: {
                                indicatorType: 'interest_rate',
                                country: 'RUS',
                                period: { [Op.lt]: interestRate.period }
                            },
                            order: [['period', 'DESC']],
                            limit: 1
                        });
                        ratePrevious = prevRate ? parseFloat(prevRate.value) : null;
                    }

                    let imoexPrevious = null;
                    if (imoexIndex) {
                        const prevImoex = await MacroIndicator.findOne({
                            where: {
                                indicatorType: 'oil_price',
                                country: 'RUS',
                                source: 'tinkoff_imoex',
                                period: { [Op.lt]: imoexIndex.period }
                            },
                            order: [['period', 'DESC']],
                            limit: 1
                        });
                        imoexPrevious = prevImoex ? parseFloat(prevImoex.value) : null;
                    }

                    // Нормализация (0-1)
                    const normalizedRate = rateValue !== null
                        ? Math.min(1, Math.max(0, rateValue / 25)) // 0-25% -> 0-1
                        : 0.5;

                    const normalizedImoex = imoexValue !== null && imoexValue > 0
                        ? Math.min(1, Math.max(0, (imoexValue - 2000) / 3000)) // 2000-5000 -> 0-1
                        : 0.5;

                    // Изменения (-1 до 1)
                    const rateChange = (rateValue !== null && ratePrevious !== null)
                        ? Math.min(1, Math.max(-1, (rateValue - ratePrevious) / 2)) // -2% до +2% -> -1 до 1
                        : 0;

                    const imoexChange = (imoexValue !== null && imoexPrevious !== null && imoexPrevious > 0)
                        ? Math.min(1, Math.max(-1, ((imoexValue - imoexPrevious) / imoexPrevious) * 10)) // -10% до +10% -> -1 до 1
                        : 0;

                    return [normalizedRate, rateChange, normalizedImoex, imoexChange];
                }

                case 'it': {
                    // IT: индекс IMOEX, индекс RTS, изменение IMOEX, изменение RTS
                    const imoexIndex = await MacroIndicator.findOne({
                        where: {
                            indicatorType: 'oil_price',
                            country: 'RUS',
                            source: 'tinkoff_imoex',
                            period: { [Op.lte]: date }
                        },
                        order: [['period', 'DESC']],
                        limit: 1
                    });

                    const rtsIndex = await MacroIndicator.findOne({
                        where: {
                            indicatorType: 'oil_price',
                            country: 'RUS',
                            source: 'tinkoff_rts',
                            period: { [Op.lte]: date }
                        },
                        order: [['period', 'DESC']],
                        limit: 1
                    });

                    const imoexValue = imoexIndex ? parseFloat(imoexIndex.value) : null;
                    const rtsValue = rtsIndex ? parseFloat(rtsIndex.value) : null;

                    // Получаем предыдущие значения
                    let imoexPrevious = null;
                    if (imoexIndex) {
                        const prevImoex = await MacroIndicator.findOne({
                            where: {
                                indicatorType: 'oil_price',
                                country: 'RUS',
                                source: 'tinkoff_imoex',
                                period: { [Op.lt]: imoexIndex.period }
                            },
                            order: [['period', 'DESC']],
                            limit: 1
                        });
                        imoexPrevious = prevImoex ? parseFloat(prevImoex.value) : null;
                    }

                    let rtsPrevious = null;
                    if (rtsIndex) {
                        const prevRts = await MacroIndicator.findOne({
                            where: {
                                indicatorType: 'oil_price',
                                country: 'RUS',
                                source: 'tinkoff_rts',
                                period: { [Op.lt]: rtsIndex.period }
                            },
                            order: [['period', 'DESC']],
                            limit: 1
                        });
                        rtsPrevious = prevRts ? parseFloat(prevRts.value) : null;
                    }

                    // Нормализация (0-1)
                    const normalizedImoex = imoexValue !== null && imoexValue > 0
                        ? Math.min(1, Math.max(0, (imoexValue - 2000) / 3000)) // 2000-5000 -> 0-1
                        : 0.5;

                    const normalizedRts = rtsValue !== null && rtsValue > 0
                        ? Math.min(1, Math.max(0, (rtsValue - 1000) / 2000)) // 1000-3000 -> 0-1
                        : 0.5;

                    // Изменения (-1 до 1)
                    const imoexChange = (imoexValue !== null && imoexPrevious !== null && imoexPrevious > 0)
                        ? Math.min(1, Math.max(-1, ((imoexValue - imoexPrevious) / imoexPrevious) * 10))
                        : 0;

                    const rtsChange = (rtsValue !== null && rtsPrevious !== null && rtsPrevious > 0)
                        ? Math.min(1, Math.max(-1, ((rtsValue - rtsPrevious) / rtsPrevious) * 10))
                        : 0;

                    return [normalizedImoex, normalizedRts, imoexChange, rtsChange];
                }

                default:
                    // Для других секторов возвращаем нули
                    return [0, 0, 0, 0];
            }
        } catch (error) {
            console.error(`❌ Ошибка получения отраслевых фичей для ${figi}:`, error);
            return [0, 0, 0, 0]; // Возвращаем нули при ошибке
        }
    }

    /**
     * Получение фичей сигналов аналитиков
     * ВАЖНО: Фильтруем сигналы только до переданного timestamp для предотвращения утечки данных
     * @param {string} figi - FIGI инструмента
     * @param {Date|string} timestamp - Временная метка для фильтрации сигналов
     * @returns {Promise<Array>} - Массив из 5 фичей сигналов
     */
    async getSignalsFeatures(figi, timestamp) {
        try {
            if (!figi) {
                return [0, 0, 0, 0, 0]; // Нет FIGI - возвращаем 5 нулевых фичей
            }

            const SignalCacheService = (await import('./SignalCacheService.js')).default;
            
            // Получаем активные сигналы на указанную дату (только до timestamp!)
            // Проверяем валидность timestamp
            let timestampDate;
            if (timestamp) {
                if (timestamp instanceof Date) {
                    timestampDate = timestamp;
                } else {
                    timestampDate = new Date(timestamp);
                }
                // Проверяем, что дата валидна
                if (isNaN(timestampDate.getTime()) || !(timestampDate instanceof Date)) {
                    // Если дата невалидна, используем текущую дату
                    console.warn(`⚠️ Invalid timestamp in getSignalsFeatures for ${figi}, using current date`);
                    timestampDate = new Date();
                }
            } else {
                // Если timestamp не указан, используем текущую дату
                timestampDate = new Date();
            }
            
            // Финальная проверка перед вызовом
            if (isNaN(timestampDate.getTime())) {
                console.error(`❌ Failed to create valid date in getSignalsFeatures for ${figi}, returning default values`);
                return [0, 0.5, 0, 1, 0.5]; // Возвращаем нейтральные значения
            }
            
            const signals = await SignalCacheService.getSignalsByDate(figi, timestampDate);
            
            if (signals.length === 0) {
                // Возвращаем нейтральные значения вместо нулей для лучшей работы модели
                // [направление=0 (нейтральное), вероятность=0.5, количество=0, целевая цена=1 (текущая), время=0.5]
                return [0, 0.5, 0, 1, 0.5]; // Нет сигналов - нейтральные значения
            }

            // Конвертируем цены из формата Tinkoff API
            const convertPrice = (priceObj) => {
                if (!priceObj) return 0;
                const units = parseFloat(priceObj.units || 0);
                const nano = parseFloat(priceObj.nano || 0);
                return units + nano / 1e9;
            };

            // Получаем текущую цену из последней свечи (если доступна)
            // skipUpdate = true - режим обучения, не делаем запросы к API
            let currentPrice = 0;
            try {
                const candles = await CacheService.getCandles(figi, 'DAY', 1, true);
                if (candles && candles.length > 0) {
                    // Берем последнюю свечу до timestamp
                    const filteredCandles = candles.filter(c => new Date(c.time) <= timestampDate);
                    if (filteredCandles.length > 0) {
                        currentPrice = filteredCandles[filteredCandles.length - 1].close;
                    }
                }
            } catch (error) {
                // Если не удалось получить цену, используем initialPrice первого сигнала
                if (signals.length > 0 && signals[0].initialPrice) {
                    currentPrice = convertPrice(signals[0].initialPrice);
                }
            }

            // Рассчитываем фичи
            let buySignalsCount = 0;
            let sellSignalsCount = 0;
            let totalProbability = 0;
            let totalTargetPriceRatio = 0;
            let totalTimeRemaining = 0;
            let validSignalsCount = 0;

            for (const signal of signals) {
                // Направление сигнала
                if (signal.direction === 'SIGNAL_DIRECTION_BUY') {
                    buySignalsCount++;
                } else if (signal.direction === 'SIGNAL_DIRECTION_SELL') {
                    sellSignalsCount++;
                }

                // Вероятность (нормализуем от 0-100 к 0-1)
                const probability = (signal.probability || 0) / 100;
                totalProbability += probability;

                // Целевая цена относительно текущей (если есть текущая цена)
                if (currentPrice > 0 && signal.targetPrice) {
                    const targetPrice = convertPrice(signal.targetPrice);
                    const priceRatio = targetPrice / currentPrice;
                    totalTargetPriceRatio += priceRatio;
                }

                // Время до окончания сигнала (нормализуем: дни / 365)
                const endDate = new Date(signal.endDt);
                const timeRemaining = Math.max(0, (endDate - timestampDate) / (365 * 24 * 60 * 60 * 1000)); // В годах
                totalTimeRemaining += Math.min(1, timeRemaining); // Ограничиваем максимум 1 год

                validSignalsCount++;
            }

            if (validSignalsCount === 0) {
                // Возвращаем нейтральные значения вместо нулей
                return [0, 0.5, 0, 1, 0.5];
            }

            // Нормализуем фичи
            const avgDirection = (buySignalsCount - sellSignalsCount) / Math.max(1, signals.length); // -1 до 1
            const avgProbability = totalProbability / validSignalsCount; // 0 до 1
            const signalsCountNormalized = Math.min(1, signals.length / 10); // Нормализуем: 10 сигналов = 1.0
            const avgTargetPriceRatio = currentPrice > 0 ? (totalTargetPriceRatio / validSignalsCount) : 0; // Отношение целевой к текущей
            const avgTimeRemaining = totalTimeRemaining / validSignalsCount; // 0 до 1

            const features = [
                avgDirection,           // Среднее направление (-1 до 1): положительное = больше BUY
                avgProbability,         // Средняя вероятность (0 до 1)
                signalsCountNormalized, // Количество сигналов (нормализованное 0 до 1)
                avgTargetPriceRatio,    // Среднее отношение целевой цены к текущей
                avgTimeRemaining        // Среднее время до окончания сигналов (0 до 1)
            ];

            // Убеждаемся, что возвращаем ровно 5 фичей
            if (features.length !== 5) {
                console.warn(`⚠️ Signals features count mismatch: expected 5, got ${features.length}`);
                while (features.length < 5) {
                    features.push(0);
                }
                if (features.length > 5) {
                    features.splice(5);
                }
            }

            return features;
            
        } catch (error) {
            console.error('❌ Ошибка получения фичей сигналов:', error);
            return [0, 0, 0, 0, 0]; // Возвращаем 5 нулевых фичей при ошибке
        }
    }

    /**
     * Получение расширенных новостных фичей для портфеля
     */
    async getPortfolioNewsFeatures(portfolio, timestamp) {
        try {
            const NewsAnalysisService = (await import('./NewsAnalysisService.js')).default;
            
            // Получаем агрегированные новости для портфеля
            const portfolioNews = await NewsAnalysisService.getPortfolioNews(portfolio, {
                days: 7,
                limit: 50
            });
            
            if (portfolioNews.length === 0) {
                return [0, 0, 0, 0, 0, 0]; // Нет новостей
            }
            
            // Анализируем новости по секторам
            const sectorSentiments = {};
            const sectorRelevances = {};
            
            portfolioNews.forEach(news => {
                // Простая группировка по источникам (как proxy для секторов)
                const sector = news.source || 'unknown';
                if (!sectorSentiments[sector]) {
                    sectorSentiments[sector] = [];
                    sectorRelevances[sector] = [];
                }
                sectorSentiments[sector].push(news.sentiment);
                sectorRelevances[sector].push(news.relevance);
            });
            
            // Рассчитываем метрики по секторам
            const sectorCount = Object.keys(sectorSentiments).length;
            const avgSectorSentiment = Object.values(sectorSentiments)
                .map(sentiments => sentiments.reduce((sum, s) => sum + s, 0) / sentiments.length)
                .reduce((sum, s) => sum + s, 0) / sectorCount;
            
            const avgSectorRelevance = Object.values(sectorRelevances)
                .map(relevances => relevances.reduce((sum, r) => sum + r, 0) / relevances.length)
                .reduce((sum, r) => sum + r, 0) / sectorCount;
            
            // Общие метрики
            const allSentiments = portfolioNews.map(n => n.sentiment);
            const allRelevances = portfolioNews.map(n => n.relevance);
            
            const overallSentiment = allSentiments.reduce((sum, s) => sum + s, 0) / allSentiments.length;
            const overallRelevance = allRelevances.reduce((sum, r) => sum + r, 0) / allRelevances.length;
            const sentimentDiversity = this.calculateDiversity(allSentiments);
            const newsVolume = Math.min(1, portfolioNews.length / 50); // Нормализация объема
            
            return [
                overallSentiment,    // Общий сентимент портфеля
                overallRelevance,    // Общая релевантность
                avgSectorSentiment,  // Средний сентимент по секторам
                avgSectorRelevance,  // Средняя релевантность по секторам
                sentimentDiversity,  // Разнообразие настроений
                newsVolume          // Объем новостей
            ];
            
        } catch (error) {
            console.error('❌ Ошибка получения новостных фичей портфеля:', error);
            return [0, 0, 0, 0, 0, 0];
        }
    }

    /**
     * Расчет разнообразия настроений
     */
    calculateDiversity(values) {
        if (values.length === 0) return 0;
        
        const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
        const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
        
        return Math.sqrt(variance);
    }

    /**
     * Получение метки для обучения на основе исторических сигналов
     * @param {string} figi - FIGI инструмента
     * @param {Date|string} timestamp - Временная метка для проверки сигналов
     * @returns {Promise<number|null>} - Метка (1 если сигнал сработал, 0 если нет, null если сигналов нет)
     */
    async getLabelFromSignals(figi, timestamp) {
        try {
            if (!figi) return null;

            const SignalCacheService = (await import('./SignalCacheService.js')).default;
            const CacheService = (await import('./CacheService.js')).default;
            
            // Получаем сигналы, которые были активны на эту дату
            const timestampDate = new Date(timestamp);
            const signals = await SignalCacheService.getSignalsByDate(figi, timestampDate);
            
            if (signals.length === 0) {
                return null; // Нет сигналов - используем стандартную логику
            }

            // Получаем цену на момент timestamp
            const candles = await CacheService.getCandles(figi, 'DAY', 365);
            if (!candles || candles.length === 0) {
                return null;
            }

            const relevantCandles = candles.filter(c => {
                const candleDate = new Date(c.time);
                return candleDate <= timestampDate;
            });

            if (relevantCandles.length === 0) {
                return null;
            }

            const currentPrice = relevantCandles[relevantCandles.length - 1].close;

            // Проверяем, сработал ли хотя бы один сигнал
            for (const signal of signals) {
                const initialPrice = signal.initialPrice || 0;
                const targetPrice = signal.targetPrice || 0;
                const stoploss = signal.stoploss || 0;

                if (initialPrice === 0 || targetPrice === 0) {
                    continue;
                }

                let signalWorked = false;

                if (signal.direction === 'SIGNAL_DIRECTION_BUY') {
                    // Для BUY: цена должна достичь targetPrice или выше
                    if (currentPrice >= targetPrice) {
                        signalWorked = true;
                    } else if (stoploss > 0 && currentPrice <= stoploss) {
                        // Сработал стоп-лосс - сигнал не сработал
                        signalWorked = false;
                    }
                } else if (signal.direction === 'SIGNAL_DIRECTION_SELL') {
                    // Для SELL: цена должна достичь targetPrice или ниже
                    if (currentPrice <= targetPrice) {
                        signalWorked = true;
                    } else if (stoploss > 0 && currentPrice >= stoploss) {
                        // Сработал стоп-лосс - сигнал не сработал
                        signalWorked = false;
                    }
                }

                // Если хотя бы один сигнал сработал, возвращаем 1
                if (signalWorked) {
                    return 1;
                }
            }

            // Если ни один сигнал не сработал, возвращаем 0
            // Но только если были сигналы с достаточными данными
            const signalsWithData = signals.filter(s => 
                s.initialPrice && s.targetPrice && s.initialPrice > 0 && s.targetPrice > 0
            );

            if (signalsWithData.length > 0) {
                return 0; // Сигналы были, но не сработали
            }

            return null; // Недостаточно данных для оценки - используем стандартную логику
        } catch (error) {
            console.warn('⚠️ Ошибка получения метки из сигналов:', error.message);
            return null; // При ошибке используем стандартную логику
        }
    }
}

export default new OptimizedDataService();
