import WeeklyForecast from '../models/WeeklyForecast.js';
import CacheService from './CacheService.js';
import OptimizedDataService from './OptimizedDataService.js';
import MacroDataService from './MacroDataService.js';
import NewsAnalysisService from './NewsAnalysisService.js';
import WeeklyForecastModelService from './WeeklyForecastModelService.js';
import LoggerService from './LoggerService.js';
import { Op } from 'sequelize';

/**
 * Сервис для генерации и управления недельными прогнозами цен
 * 
 * Основные функции:
 * - Генерация прогнозов на 7 дней вперед
 * - Обновление прогнозов реальными данными
 * - Вычисление метрик точности
 * - Адаптивное обучение моделей
 */
class WeeklyForecastService {
    constructor() {
        this.isInitialized = false;
        
        // Кэш моделей в памяти для оптимизации производительности
        this.modelCache = new Map(); // key: `${figi}_${modelType}`, value: { model, version, timestamp }
        this.modelCacheTTL = 60 * 60 * 1000; // 1 час TTL для моделей
        
        // Кэш features для оптимизации
        this.featuresCache = new Map(); // key: `${figi}_${timestamp}`, value: { features, timestamp }
        this.featuresCacheTTL = 5 * 60 * 1000; // 5 минут TTL для features
        
        // Кэш макро-данных и новостей для оптимизации
        this.macroCache = new Map(); // key: `${dateString}`, value: { features, timestamp }
        this.newsCache = new Map(); // key: `${figi}_${dateString}`, value: { features, timestamp }
        this.macroNewsCacheTTL = 60 * 60 * 1000; // 1 час TTL для макро-данных и новостей
        
        // Метрики производительности
        this.performanceMetrics = {
            generateForecast: {
                count: 0,
                totalTime: 0,
                averageTime: 0,
                minTime: Infinity,
                maxTime: 0,
                errors: 0
            },
            updateWithActualData: {
                count: 0,
                totalTime: 0,
                averageTime: 0,
                minTime: Infinity,
                maxTime: 0,
                errors: 0
            },
            adaptModel: {
                count: 0,
                totalTime: 0,
                averageTime: 0,
                minTime: Infinity,
                maxTime: 0,
                errors: 0
            }
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
            // Убеждаемся, что зависимые сервисы инициализированы
            if (!CacheService.isInitialized) {
                await CacheService.initialize();
            }
            
            if (!OptimizedDataService.isInitialized) {
                await OptimizedDataService.initialize();
            }

            if (!WeeklyForecastModelService.isInitialized) {
                await WeeklyForecastModelService.initialize();
            }
            
            if (!MacroDataService.isInitialized) {
                await MacroDataService.initialize();
            }
            
            if (!NewsAnalysisService.isInitialized) {
                await NewsAnalysisService.initialize();
            }

            this.isInitialized = true;
            
            if (LoggerService.isInitialized) {
                LoggerService.warn('WeeklyForecastService initialized', {
                    service: 'WeeklyForecastService',
                    operation: 'initialize'
                });
            }
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error initializing WeeklyForecastService', {
                    service: 'WeeklyForecastService',
                    operation: 'initialize',
                    error: { message: error.message, stack: error.stack }
                });
            }
            throw error;
        }
    }

    /**
     * Генерация недельного прогноза для инструмента
     * @param {string} figi - FIGI инструмента
     * @param {Object} options - Опции генерации
     * @returns {Promise<Object>} Результат генерации прогноза
     */
    async generateForecast(figi, options = {}) {
        // ШАГ 1: Валидация входных данных
        if (!figi || typeof figi !== 'string') {
            throw new Error('FIGI is required and must be a string');
        }
        
        const {
            modelType = 'seq2seq',
            forceRegenerate = false,
            historicalDays = 90,
            includeMacro = true,
            includeNews = true
        } = options;
        
        const startTime = Date.now();
        
        try {
            // Проверка существующего прогноза
            if (!forceRegenerate) {
                const existing = await this.getActiveForecast(figi);
                if (existing && this.isForecastFresh(existing)) {
                    if (LoggerService.isInitialized) {
                        LoggerService.warn('Returning cached forecast (with conversion)', {
                            service: 'WeeklyForecastService',
                            operation: 'generateForecast',
                            figi,
                            forecastId: existing.id,
                            firstCandle: existing.forecastData?.[0]
                        });
                    }
                    return {
                        success: true,
                        forecast: existing,
                        cached: true
                    };
                }
            }
            
            // ШАГ 2: Получение инструмента
            const instrument = await CacheService.getInstrument(figi, true);
            if (!instrument) {
                throw new Error(`Instrument not found: ${figi}`);
            }
            
            // ШАГ 3: Получение исторических данных
            const candles = await CacheService.getCandles(figi, 'DAY', historicalDays, true);
            // Минимум 30 свечей для генерации прогноза (можно работать с меньшим количеством, но качество будет ниже)
            const minimumRequired = 30;
            if (candles.length < minimumRequired) {
                throw new Error(`Insufficient historical data: ${candles.length} candles (minimum ${minimumRequired})`);
            }
            
            // ШАГ 4: Подготовка features
            const features = await this.prepareForecastFeatures(figi, candles, {
                includeMacro,
                includeNews
            });
            
            // ШАГ 5: Загрузка/создание модели
            const modelWrapper = await this.getOrCreateModel(figi, modelType);
            
            // ШАГ 6: Генерация прогноза
            const rawForecast = await this.generateModelForecast(modelWrapper, features);
            
            // Логирование сырого прогноза
            if (LoggerService.isInitialized && rawForecast && rawForecast.length > 0) {
                LoggerService.warn('Raw forecast generated', {
                    service: 'WeeklyForecastService',
                    operation: 'generateForecast',
                    figi,
                    forecastDays: rawForecast.length,
                    firstCandle: rawForecast[0],
                    lastCandle: rawForecast[rawForecast.length - 1],
                    allCandles: rawForecast.map(c => ({
                        open: c.open,
                        high: c.high,
                        low: c.low,
                        close: c.close
                    }))
                });
            }
            
            // ШАГ 7: Постобработка прогноза
            const processedForecast = this.postProcessForecast(
                rawForecast,
                candles,
                instrument
            );
            
            // Логирование обработанного прогноза
            if (LoggerService.isInitialized && processedForecast && processedForecast.candles && processedForecast.candles.length > 0) {
                LoggerService.warn('Processed forecast', {
                    service: 'WeeklyForecastService',
                    operation: 'generateForecast',
                    figi,
                    forecastDays: processedForecast.candles.length,
                    firstCandle: processedForecast.candles[0],
                    lastCandle: processedForecast.candles[processedForecast.candles.length - 1],
                    confidence: processedForecast.confidence,
                    allCandles: processedForecast.candles.map(c => ({
                        open: c.open,
                        high: c.high,
                        low: c.low,
                        close: c.close
                    }))
                });
            }
            
            // ШАГ 8: Вычисление метаданных
            const metadata = this.calculateForecastMetadata(processedForecast);
            
            // ШАГ 9: Сохранение в БД
            const today = new Date();
            const endDate = this.addDays(today, 7);
            
            const forecast = await WeeklyForecast.create({
                figi: instrument.figi,
                ticker: instrument.ticker,
                forecastDate: today,
                startDate: today,
                endDate: endDate,
                forecastData: processedForecast.candles,
                modelVersion: modelWrapper.version || this.generateModelVersion(),
                modelType: modelType,
                confidenceScore: processedForecast.confidence,
                predictedVolatility: metadata.volatility,
                predictedTrend: metadata.trend,
                predictedPriceChange: metadata.priceChange
            });
            
            // ШАГ 10: WebSocket уведомление
            await this.notifyForecastGenerated(forecast);
            
            if (LoggerService.isInitialized) {
                LoggerService.warn('Forecast generated successfully', {
                    service: 'WeeklyForecastService',
                    operation: 'generateForecast',
                    figi,
                    forecastId: forecast.id,
                    confidence: processedForecast.confidence
                });
            }
            
            const executionTime = Date.now() - startTime;
            
            // Обновляем метрики производительности
            const metrics = this.performanceMetrics.generateForecast;
            metrics.count++;
            metrics.totalTime += executionTime;
            metrics.averageTime = metrics.totalTime / metrics.count;
            metrics.minTime = Math.min(metrics.minTime, executionTime);
            metrics.maxTime = Math.max(metrics.maxTime, executionTime);
            
            if (LoggerService.isInitialized) {
                LoggerService.warn('Forecast generated successfully', {
                    service: 'WeeklyForecastService',
                    operation: 'generateForecast',
                    figi,
                    forecastId: forecast.id,
                    confidence: processedForecast.confidence,
                    executionTime: `${executionTime}ms`
                });
            }
            
            const forecastJson = forecast.toJSON();
            return {
                success: true,
                forecast: this.normalizeForecastDates(forecastJson, forecast),
                cached: false,
                executionTime
            };
        } catch (error) {
            const executionTime = Date.now() - startTime;
            const metrics = this.performanceMetrics.generateForecast;
            metrics.errors++;
            
            if (LoggerService.isInitialized) {
                LoggerService.error('Error generating forecast', {
                    service: 'WeeklyForecastService',
                    operation: 'generateForecast',
                    figi,
                    executionTime: `${executionTime}ms`,
                    error: { message: error.message, stack: error.stack }
                });
            }
            throw error;
        }
    }

    /**
     * Нормализация дат в прогнозе в строки ISO
     * @param {Object} forecastJson - JSON объект прогноза
     * @param {Object} forecastModel - Sequelize модель прогноза (для fallback)
     * @returns {Object} Прогноз с нормализованными датами
     */
    normalizeForecastDates(forecastJson, forecastModel = null) {
        if (!forecastJson) return forecastJson;
        
        const normalizeDate = (dateValue, modelValue) => {
            if (!dateValue && dateValue !== 0) return dateValue;
            
            // Если дата пришла как пустой объект {} или невалидный объект
            if (typeof dateValue === 'object' && !(dateValue instanceof Date)) {
                // Проверяем, является ли это пустым объектом
                if (Object.keys(dateValue).length === 0 && modelValue) {
                    try {
                        const date = new Date(modelValue);
                        if (!isNaN(date.getTime())) {
                            return date.toISOString();
                        }
                    } catch (e) {
                        // Игнорируем ошибки
                    }
                }
                // Если это не пустой объект, но и не Date, пробуем преобразовать из модели
                if (modelValue) {
                    try {
                        const date = new Date(modelValue);
                        if (!isNaN(date.getTime())) {
                            return date.toISOString();
                        }
                    } catch (e) {
                        // Игнорируем ошибки
                    }
                }
                return null;
            }
            
            if (dateValue instanceof Date) {
                return dateValue.toISOString();
            }
            if (typeof dateValue === 'string') {
                return dateValue;
            }
            
            // Если modelValue есть, пробуем использовать его
            if (modelValue) {
                try {
                    const date = new Date(modelValue);
                    if (!isNaN(date.getTime())) {
                        return date.toISOString();
                    }
                } catch (e) {
                    // Игнорируем ошибки
                }
            }
            return null;
        };
        
        if (forecastJson.forecastDate) {
            forecastJson.forecastDate = normalizeDate(forecastJson.forecastDate, forecastModel?.forecastDate);
        }
        if (forecastJson.startDate) {
            forecastJson.startDate = normalizeDate(forecastJson.startDate, forecastModel?.startDate);
        }
        if (forecastJson.endDate) {
            forecastJson.endDate = normalizeDate(forecastJson.endDate, forecastModel?.endDate);
        }
        if (forecastJson.completionDate) {
            forecastJson.completionDate = normalizeDate(forecastJson.completionDate, forecastModel?.completionDate);
        }
        if (forecastJson.createdAt) {
            forecastJson.createdAt = normalizeDate(forecastJson.createdAt, forecastModel?.createdAt);
        }
        if (forecastJson.updatedAt) {
            forecastJson.updatedAt = normalizeDate(forecastJson.updatedAt, forecastModel?.updatedAt);
        }
        
        return forecastJson;
    }

    /**
     * Получение активного прогноза для инструмента
     * @param {string} figi - FIGI инструмента
     * @returns {Promise<Object|null>} Активный прогноз или null
     */
    async getActiveForecast(figi) {
        try {
            const forecast = await WeeklyForecast.findOne({
                where: {
                    figi,
                    isCompleted: false
                },
                order: [['forecast_date', 'DESC']]
            });

            if (!forecast) {
                return null;
            }

            const forecastJson = forecast.toJSON();
            const normalized = this.normalizeForecastDates(forecastJson, forecast);
            
            // Конвертируем данные прогноза, если они в неправильном формате
            if (normalized.forecastData && normalized.forecastData.length > 0) {
                try {
                    // Получаем исторические данные для конвертации
                    const candles = await CacheService.getCandles(figi, 'DAY', 90, true);
                    if (candles && candles.length > 0) {
                        const instrument = await CacheService.getInstrument(figi, true);
                        if (instrument) {
                            // Используем postProcessForecast для конвертации данных
                            const processed = this.postProcessForecast(
                                normalized.forecastData,
                                candles,
                                instrument
                            );
                            normalized.forecastData = processed.candles;
                        }
                    }
                } catch (conversionError) {
                    // Если конвертация не удалась, логируем, но не падаем
                    if (LoggerService.isInitialized) {
                        LoggerService.warn('Failed to convert forecast data on load', {
                            service: 'WeeklyForecastService',
                            operation: 'getActiveForecast',
                            figi,
                            error: { message: conversionError.message }
                        });
                    }
                }
            }
            
            return normalized;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error getting active forecast', {
                    service: 'WeeklyForecastService',
                    operation: 'getActiveForecast',
                    figi,
                    error: { message: error.message, stack: error.stack }
                });
            }
            throw error;
        }
    }

    /**
     * Проверка, является ли прогноз свежим (создан не более 24 часов назад)
     * @param {Object} forecast - Прогноз
     * @returns {boolean} true если прогноз свежий
     */
    isForecastFresh(forecast) {
        if (!forecast || !forecast.forecastDate) {
            return false;
        }

        const forecastDate = new Date(forecast.forecastDate);
        const now = new Date();
        const hoursDiff = (now - forecastDate) / (1000 * 60 * 60);

        return hoursDiff < 24;
    }

    /**
     * Подготовка features для модели
     * @param {string} figi - FIGI инструмента
     * @param {Array} candles - Массив свечей
     * @param {Object} options - Опции подготовки
     * @returns {Promise<Array>} Массив features
     */
    async prepareForecastFeatures(figi, candles, options = {}) {
        const { includeMacro = true, includeNews = true } = options;
        
        try {
            if (!candles || candles.length === 0) {
                throw new Error('Candles array is empty');
            }
            
            // Проверяем кэш features (используем хеш последней свечи как ключ)
            const lastCandle = candles[candles.length - 1];
            const cacheKey = `${figi}_${lastCandle.time || lastCandle.date}_${includeMacro}_${includeNews}`;
            const now = Date.now();
            
            const cached = this.featuresCache.get(cacheKey);
            if (cached && (now - cached.timestamp) < this.featuresCacheTTL) {
                if (LoggerService.isInitialized) {
                    LoggerService.warn('Features loaded from cache', {
                        service: 'WeeklyForecastService',
                        operation: 'prepareForecastFeatures',
                        figi
                    });
                }
                return cached.features;
            }
            
            // Извлекаем базовые данные из свечей
            const prices = candles.map(c => c.close || 0);
            const volumes = candles.map(c => c.volume || 0);
            const highs = candles.map(c => c.high || 0);
            const lows = candles.map(c => c.low || 0);
            
            // Вычисляем технические индикаторы для каждой свечи
            const features = [];
            
            // Освобождаем event loop периодически при обработке большого количества свечей
            const BATCH_SIZE = 50; // Обрабатываем по 50 свечей, затем освобождаем event loop
            
            for (let i = 0; i < candles.length; i++) {
                const candleFeatures = [];
                
                // Освобождаем event loop каждые BATCH_SIZE свечей для больших наборов данных
                if (i > 0 && i % BATCH_SIZE === 0 && candles.length > BATCH_SIZE) {
                    await new Promise(resolve => setImmediate(resolve));
                }
                
                // Базовые цены (нормализованные относительно последней цены)
                const lastPrice = prices[prices.length - 1];
                if (lastPrice > 0) {
                    candleFeatures.push((candles[i].open || 0) / lastPrice);
                    candleFeatures.push((candles[i].high || 0) / lastPrice);
                    candleFeatures.push((candles[i].low || 0) / lastPrice);
                    candleFeatures.push((candles[i].close || 0) / lastPrice);
                } else {
                    candleFeatures.push(0, 0, 0, 0);
                }
                
                // Объем (нормализованный)
                const maxVolume = Math.max(...volumes, 1);
                candleFeatures.push((candles[i].volume || 0) / maxVolume);
                
                // Технические индикаторы (используем срез до текущей свечи)
                if (i >= 20) {
                    const slicePrices = prices.slice(0, i + 1);
                    const sliceVolumes = volumes.slice(0, i + 1);
                    const sliceHighs = highs.slice(0, i + 1);
                    const sliceLows = lows.slice(0, i + 1);
                    
                    const indicators = OptimizedDataService.calculateTechnicalIndicators(
                        slicePrices,
                        sliceVolumes,
                        sliceHighs,
                        sliceLows
                    );
                    
                    // Добавляем индикаторы (обычно 6 фичей)
                    if (Array.isArray(indicators)) {
                        candleFeatures.push(...indicators);
                    } else {
                        // Если индикаторы не массив, добавляем нули
                        candleFeatures.push(...Array(6).fill(0));
                    }
                } else {
                    // Недостаточно данных для индикаторов
                    candleFeatures.push(...Array(6).fill(0));
                }
                
                // Макро-данные (если включены)
                if (includeMacro) {
                    try {
                        const candleTime = candles[i].time ? new Date(candles[i].time) : 
                                         candles[i].date ? new Date(candles[i].date) : 
                                         new Date();
                        
                        // Используем дату без времени для кэширования (макро-данные обычно дневные)
                        const dateString = candleTime.toISOString().split('T')[0];
                        const macroCacheKey = dateString;
                        const now = Date.now();
                        
                        // Проверяем кэш
                        let macroFeatures = null;
                        const cachedMacro = this.macroCache.get(macroCacheKey);
                        if (cachedMacro && (now - cachedMacro.timestamp) < this.macroNewsCacheTTL) {
                            macroFeatures = cachedMacro.features;
                        } else {
                            // Получаем макро-фичи для даты свечи (15 фичей)
                            macroFeatures = await OptimizedDataService.getMacroFeatures(candleTime, 'RUS');
                            
                            // Сохраняем в кэш
                            this.macroCache.set(macroCacheKey, {
                                features: macroFeatures,
                                timestamp: now
                            });
                            
                            // Очистка старых записей
                            if (this.macroCache.size > 100) {
                                const oldestKey = Array.from(this.macroCache.entries())
                                    .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
                                this.macroCache.delete(oldestKey);
                            }
                        }
                        
                        // Убеждаемся, что получили массив нужного размера
                        if (Array.isArray(macroFeatures) && macroFeatures.length >= 15) {
                            candleFeatures.push(...macroFeatures.slice(0, 15));
                        } else {
                            // Если не получили данные, используем нули
                            candleFeatures.push(...Array(15).fill(0));
                        }
                    } catch (macroError) {
                        // В случае ошибки используем нули
                        if (LoggerService.isInitialized) {
                            LoggerService.warn('Error getting macro features', {
                                service: 'WeeklyForecastService',
                                operation: 'prepareForecastFeatures',
                                figi,
                                candleIndex: i,
                                error: { message: macroError.message }
                            });
                        }
                        candleFeatures.push(...Array(15).fill(0));
                    }
                } else {
                    candleFeatures.push(...Array(15).fill(0));
                }
                
                // Новости и сентимент (если включены)
                if (includeNews) {
                    try {
                        const candleTime = candles[i].time ? new Date(candles[i].time) : 
                                         candles[i].date ? new Date(candles[i].date) : 
                                         new Date();
                        
                        // Используем дату без времени для кэширования
                        const dateString = candleTime.toISOString().split('T')[0];
                        const newsCacheKey = `${figi}_${dateString}`;
                        const now = Date.now();
                        
                        // Проверяем кэш
                        let newsFeatures = null;
                        const cachedNews = this.newsCache.get(newsCacheKey);
                        if (cachedNews && (now - cachedNews.timestamp) < this.macroNewsCacheTTL) {
                            newsFeatures = cachedNews.features;
                        } else {
                            // Получаем новостные фичи для FIGI и даты свечи (2 фичи: sentiment, relevance)
                            newsFeatures = await OptimizedDataService.getNewsFeatures(figi, candleTime);
                            
                            // Сохраняем в кэш
                            this.newsCache.set(newsCacheKey, {
                                features: newsFeatures,
                                timestamp: now
                            });
                            
                            // Очистка старых записей
                            if (this.newsCache.size > 200) {
                                const oldestKey = Array.from(this.newsCache.entries())
                                    .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
                                this.newsCache.delete(oldestKey);
                            }
                        }
                        
                        // Убеждаемся, что получили массив нужного размера
                        if (Array.isArray(newsFeatures) && newsFeatures.length >= 2) {
                            candleFeatures.push(...newsFeatures.slice(0, 2));
                        } else {
                            // Если не получили данные, используем нейтральные значения
                            candleFeatures.push(0, 0.5); // sentiment=0 (нейтральный), relevance=0.5 (средняя)
                        }
                    } catch (newsError) {
                        // В случае ошибки используем нейтральные значения
                        if (LoggerService.isInitialized) {
                            LoggerService.warn('Error getting news features', {
                                service: 'WeeklyForecastService',
                                operation: 'prepareForecastFeatures',
                                figi,
                                candleIndex: i,
                                error: { message: newsError.message }
                            });
                        }
                        candleFeatures.push(0, 0.5); // sentiment=0 (нейтральный), relevance=0.5 (средняя)
                    }
                } else {
                    candleFeatures.push(0, 0.5); // Нейтральные значения при отключенных новостях
                }
                
                features.push(candleFeatures);
            }
            
            // Дополняем до одинакового размера (70 фичей)
            const targetFeatureSize = 70;
            const normalizedFeatures = features.map(f => {
                while (f.length < targetFeatureSize) {
                    f.push(0);
                }
                return f.slice(0, targetFeatureSize);
            });
            
            // Сохраняем в кэш
            this.featuresCache.set(cacheKey, {
                features: normalizedFeatures,
                timestamp: now
            });
            
            // Очистка старых записей из кэша (если размер превышает лимит)
            if (this.featuresCache.size > 100) {
                const oldestKey = Array.from(this.featuresCache.entries())
                    .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
                this.featuresCache.delete(oldestKey);
            }
            
            return normalizedFeatures;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error preparing forecast features', {
                    service: 'WeeklyForecastService',
                    operation: 'prepareForecastFeatures',
                    figi,
                    error: { message: error.message, stack: error.stack }
                });
            }
            throw error;
        }
    }

    /**
     * Получение или создание модели для инструмента
     * @param {string} figi - FIGI инструмента
     * @param {string} modelType - Тип модели
     * @returns {Promise<Object>} Модель и метаданные
     */
    async getOrCreateModel(figi, modelType = 'seq2seq') {
        try {
            if (!figi || typeof figi !== 'string') {
                throw new Error('FIGI is required and must be a string');
            }
            
            const cacheKey = `${figi}_${modelType}`;
            const now = Date.now();
            
            // Проверяем кэш моделей
            const cached = this.modelCache.get(cacheKey);
            if (cached && (now - cached.timestamp) < this.modelCacheTTL) {
                // Проверяем структуру закэшированной модели
                const cachedModel = cached.model;
                const cachedInputs = cachedModel?.inputs;
                if (cachedInputs && cachedInputs.length === 2) {
                if (LoggerService.isInitialized) {
                    LoggerService.warn('Model loaded from cache', {
                        service: 'WeeklyForecastService',
                        operation: 'getOrCreateModel',
                        figi,
                        modelType,
                        version: cached.version
                    });
                }
                return {
                        model: cachedModel,
                    version: cached.version,
                    isNew: false,
                    modelType
                };
                } else {
                    // Удаляем модель с неправильной структурой из кэша
                    if (cachedModel) {
                        try {
                            cachedModel.dispose();
                        } catch (e) {
                            // Игнорируем ошибки при освобождении
                        }
                    }
                    this.modelCache.delete(cacheKey);
                    if (LoggerService.isInitialized) {
                        LoggerService.warn('Cached model has incorrect structure, removed from cache', {
                            service: 'WeeklyForecastService',
                            operation: 'getOrCreateModel',
                            figi,
                            modelType,
                            expectedInputs: 2,
                            actualInputs: cachedInputs ? cachedInputs.length : 0
                        });
                    }
                }
            }
            
            // Пытаемся загрузить существующую модель
            let model = await WeeklyForecastModelService.loadModel(figi, modelType);
            let isNew = false;
            let version = null;
            let deletedInvalidModelFromStorage = false;
            
            if (model) {
                // Проверяем структуру модели - для Seq2Seq должна быть 2 входа
                const modelInputs = model.inputs;
                if (!modelInputs || modelInputs.length !== 2) {
                    if (LoggerService.isInitialized) {
                        LoggerService.warn('Loaded model has incorrect structure, creating new model', {
                            service: 'WeeklyForecastService',
                            operation: 'getOrCreateModel',
                            figi,
                            modelType,
                            expectedInputs: 2,
                            actualInputs: modelInputs ? modelInputs.length : 0
                        });
                    }
                    // Освобождаем неправильную модель
                    model.dispose();
                    // Удаляем legacy/поврежденную модель из хранилища, чтобы не пытаться грузить её снова
                    deletedInvalidModelFromStorage = await WeeklyForecastModelService.deleteModel(figi, modelType);
                    model = null;
                } else {
                // Проверяем метаданные для получения версии
                const metadata = await WeeklyForecastModelService.loadModelMetadata(figi, modelType);
                version = metadata?.version || this.generateModelVersion();
                
                if (LoggerService.isInitialized) {
                    LoggerService.warn('Model loaded from storage', {
                        service: 'WeeklyForecastService',
                        operation: 'getOrCreateModel',
                        figi,
                        modelType,
                        version
                    });
                }
                }
            }
            
            if (!model) {
                // Создаем новую модель
                model = WeeklyForecastModelService.createSeq2SeqModel(60, 70, 7);
                version = this.generateModelVersion();
                isNew = true;
                
                if (LoggerService.isInitialized) {
                    LoggerService.warn('New model created', {
                        service: 'WeeklyForecastService',
                        operation: 'getOrCreateModel',
                        figi,
                        modelType,
                        version
                    });
                }

                // Если мы удалили некорректную модель из storage, сразу сохраняем новую заготовку
                // Это предотвращает повторную загрузку legacy-структуры после перезапуска процесса.
                if (deletedInvalidModelFromStorage) {
                    const saveSuccess = await WeeklyForecastModelService.saveModel(model, figi, modelType, {
                        version,
                        createdAt: new Date().toISOString(),
                        migratedFromInvalidStructure: true
                    });

                    if (LoggerService.isInitialized) {
                        LoggerService.warn('Recreated model persisted after invalid structure cleanup', {
                            service: 'WeeklyForecastService',
                            operation: 'getOrCreateModel',
                            figi,
                            modelType,
                            version,
                            saveSuccess
                        });
                    }
                }
            }
            
            // Сохраняем в кэш
            this.modelCache.set(cacheKey, {
                model,
                version,
                timestamp: now
            });
            
            // Очистка старых записей из кэша (если размер превышает лимит)
            if (this.modelCache.size > 50) {
                const oldestKey = Array.from(this.modelCache.entries())
                    .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
                this.modelCache.delete(oldestKey);
            }
            
            return {
                model,
                version,
                isNew,
                modelType
            };
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error getting or creating model', {
                    service: 'WeeklyForecastService',
                    operation: 'getOrCreateModel',
                    figi,
                    modelType,
                    error: { message: error.message, stack: error.stack }
                });
            }
            throw error;
        }
    }

    /**
     * Генерация прогноза моделью
     * @param {Object} modelWrapper - Объект с моделью {model, version, ...}
     * @param {Array} features - Features для модели
     * @returns {Promise<Array>} Массив прогнозируемых свечей
     */
    async generateModelForecast(modelWrapper, features) {
        try {
            if (!modelWrapper) {
                throw new Error('Model is required');
            }
            
            const model = modelWrapper.model || modelWrapper;
            
            if (!model) {
                throw new Error('Model is required');
            }
            
            if (!features || features.length === 0) {
                throw new Error('Features array is empty');
            }
            
            // Используем последние 60 дней для прогноза (или все доступные, если меньше)
            // Если данных меньше 60, дополняем первыми доступными свечами
            const requiredLength = 60;
            let inputSequence = features.slice(-requiredLength);
            
            // Если данных меньше требуемого, дополняем первыми доступными свечами
            if (inputSequence.length < requiredLength) {
                const paddingNeeded = requiredLength - inputSequence.length;
                const firstFeature = features[0];
                const padding = Array(paddingNeeded).fill(firstFeature);
                inputSequence = [...padding, ...inputSequence];
                
                if (LoggerService.isInitialized) {
                    LoggerService.warn('Padding input sequence for forecast', {
                        service: 'WeeklyForecastService',
                        operation: 'generateModelForecast',
                        originalLength: features.length,
                        paddedLength: inputSequence.length,
                        paddingSize: paddingNeeded
                    });
                }
            }
            
            // Генерируем прогноз через WeeklyForecastModelService
            const forecast = await WeeklyForecastModelService.generateForecast(
                model,
                inputSequence,
                7
            );
            
            return forecast;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error generating model forecast', {
                    service: 'WeeklyForecastService',
                    operation: 'generateModelForecast',
                    error: { message: error.message, stack: error.stack }
                });
            }
            throw error;
        }
    }

    /**
     * Постобработка сырого прогноза
     * @param {Array} rawForecast - Сырой прогноз
     * @param {Array} historicalCandles - Исторические свечи
     * @param {Object} instrument - Инструмент
     * @returns {Object} Обработанный прогноз с уверенностью
     */
    postProcessForecast(rawForecast, historicalCandles, instrument) {
        if (!rawForecast || rawForecast.length === 0) {
            throw new Error('Raw forecast is empty');
        }
        
        if (!historicalCandles || historicalCandles.length === 0) {
            throw new Error('Historical candles are empty');
        }
        
        const lastPrice = historicalCandles[historicalCandles.length - 1].close || 
                         historicalCandles[historicalCandles.length - 1].closePrice || 0;
        
        if (lastPrice <= 0) {
            throw new Error('Invalid last price');
        }
        
        // Проверяем формат данных
        const firstCandle = rawForecast[0];
        const closeValue = Math.abs(firstCandle?.close || 0);
        const maxOHLC = Math.max(
            Math.abs(firstCandle?.open || 0),
            Math.abs(firstCandle?.high || 0),
            Math.abs(firstCandle?.low || 0)
        );
        
        // Определяем формат данных:
        // 1. Если close большой (>= 10% от lastPrice), а high/low/open маленькие (< 1% от close) - смешанный формат
        //    В этом случае high/low/open могут быть процентами (0.0009 = 0.09%) или нормализованными значениями
        // 2. Если все значения маленькие (< 10% от lastPrice) - все изменения или нормализованные
        // 3. Если все значения большие - все абсолютные
        
        const isCloseAbsolute = closeValue >= lastPrice * 0.1;
        // Если high/low/open в диапазоне -1.0 до 1.0, это проценты в десятичном виде
        // Например: 0.15 = 15%, -0.046 = -4.6%
        const isOHLCPercentage = maxOHLC < 1.0 && Math.abs(firstCandle?.low || 0) < 1.0;
        const isMixedFormat = isCloseAbsolute && isOHLCPercentage;
        const isAllRelative = !isCloseAbsolute && maxOHLC < lastPrice * 0.1;
        
        // Логирование для отладки
        if (LoggerService.isInitialized) {
            LoggerService.warn('Forecast data format detection', {
                service: 'WeeklyForecastService',
                operation: 'postProcessForecast',
                figi: instrument?.figi || 'unknown',
                lastPrice,
                firstCandle: {
                    open: firstCandle?.open,
                    high: firstCandle?.high,
                    low: firstCandle?.low,
                    close: firstCandle?.close
                },
                closeValue,
                maxOHLC,
                isCloseAbsolute,
                isOHLCPercentage,
                isMixedFormat,
                isAllRelative,
                detectedFormat: isMixedFormat ? 'mixed' : (isAllRelative ? 'all_relative' : 'all_absolute')
            });
        }
        
        // Валидация и исправление свечей
        const processedCandles = [];
        let currentClose = lastPrice;
        
        for (let index = 0; index < rawForecast.length; index++) {
            const candle = rawForecast[index];
            let processed = { ...candle };
            
            if (isMixedFormat) {
                // Смешанный формат: close уже абсолютный, high/low/open - проценты в десятичном виде
                // Например: 0.15 = 15%, -0.046 = -4.6%
                // Если close не меняется между свечами, используем currentClose (который обновляется)
                let newClose = candle.close || currentClose;
                
                // Если это первая свеча, используем close из данных или lastPrice
                if (index === 0) {
                    newClose = candle.close || lastPrice;
                } else {
                    // Для последующих свечей используем close из данных, если он есть и отличается
                    // Иначе используем currentClose (закрытие предыдущей свечи)
                    if (candle.close && Math.abs(candle.close - currentClose) > 0.01) {
                        newClose = candle.close;
                    } else {
                        newClose = currentClose;
                    }
                }
                
                const openValue = candle.open || 0;
                const highValue = candle.high || 0;
                const lowValue = candle.low || 0;
                
                const originalValues = { open: openValue, high: highValue, low: lowValue, close: newClose };
                
                processed = {
                    ...candle,
                    // Проценты: close * (1 + value)
                    // Например: 79.038 * (1 + 0.15) = 90.894 для high
                    //           79.038 * (1 - 0.046) = 75.402 для low
                    open: newClose * (1 + openValue),
                    high: newClose * (1 + highValue),
                    low: newClose * (1 + lowValue),
                    close: newClose,
                    volume: Math.max(0, candle.volume || 0)
                };
                
                // Логирование для отладки (только для первых 3 свечей)
                if (LoggerService.isInitialized && index < 3) {
                    LoggerService.warn('Converting mixed format candle', {
                        service: 'WeeklyForecastService',
                        operation: 'postProcessForecast',
                        candleIndex: index,
                        originalValues,
                        convertedValues: {
                            open: processed.open,
                            high: processed.high,
                            low: processed.low,
                            close: processed.close
                        },
                        calculation: {
                            open: `${newClose} * (1 + ${openValue}) = ${processed.open}`,
                            high: `${newClose} * (1 + ${highValue}) = ${processed.high}`,
                            low: `${newClose} * (1 + ${lowValue}) = ${processed.low}`
                        }
                    });
                }
                
                currentClose = newClose;
            } else if (isAllRelative) {
                // Все значения - изменения или нормализованные (нужно умножить на lastPrice)
                // Проверяем, нормализованные ли это (обычно в диапазоне 0.9-1.1) или изменения
                const isNormalized = closeValue > 0.5 && closeValue < 2.0;
                
                if (isNormalized) {
                    // Нормализованные значения - умножаем на lastPrice
                    const newClose = (candle.close || 0) * lastPrice;
                    processed = {
                        ...candle,
                        open: (candle.open || 0) * lastPrice,
                        high: (candle.high || 0) * lastPrice,
                        low: (candle.low || 0) * lastPrice,
                        close: newClose,
                        volume: Math.max(0, candle.volume || 0)
                    };
                    currentClose = newClose;
                } else {
                    // Изменения - прибавляем к currentClose
                    const newClose = currentClose + (candle.close || 0);
                    processed = {
                        ...candle,
                        open: newClose + (candle.open || 0),
                        high: newClose + (candle.high || 0),
                        low: newClose + (candle.low || 0),
                        close: newClose,
                        volume: Math.max(0, candle.volume || 0)
                    };
                    currentClose = newClose;
                }
            } else {
                // Все значения уже абсолютные
                processed = {
                    ...candle,
                    volume: Math.max(0, candle.volume || 0)
                };
                currentClose = processed.close || currentClose;
            }
            
            // Проверка на валидность цен
            if (processed.high < processed.low) {
                [processed.high, processed.low] = [processed.low, processed.high];
            }
            
            if (processed.close < processed.low || processed.close > processed.high) {
                processed.close = Math.max(processed.low, Math.min(processed.high, processed.close));
            }
            
            if (processed.open < processed.low || processed.open > processed.high) {
                processed.open = Math.max(processed.low, Math.min(processed.high, processed.open));
            }
            
            // Проверка на разумность изменений (максимум 10% изменение за день)
            const maxChange = lastPrice * 0.1;
            if (Math.abs(processed.close - lastPrice) > maxChange) {
                processed.close = lastPrice + Math.sign(processed.close - lastPrice) * maxChange;
            }
            
            // Вычисление уверенности для свечи
            processed.confidence = this.calculateCandleConfidence(processed, historicalCandles, index);
            
            // Дата свечи
            const candleDate = this.addDays(new Date(), index + 1);
            processed.date = candleDate.toISOString().split('T')[0];
            
            processedCandles.push(processed);
        }
        
        // Вычисление общей уверенности
        const confidence = processedCandles.reduce((sum, c) => sum + (c.confidence || 0.5), 0) / processedCandles.length;
        
        return {
            candles: processedCandles,
            confidence: Math.max(0, Math.min(1, confidence))
        };
    }
    
    /**
     * Вычисление уверенности для отдельной свечи
     * @param {Object} candle - Свеча
     * @param {Array} historicalCandles - Исторические свечи
     * @param {number} index - Индекс свечи в прогнозе
     * @returns {number} Уверенность (0-1)
     */
    calculateCandleConfidence(candle, historicalCandles, index) {
        // Базовая уверенность уменьшается с каждым днем
        let confidence = 1.0 - (index * 0.1); // Первый день: 1.0, последний: 0.4
        
        // Проверка на разумность цен относительно исторических данных
        const prices = historicalCandles.map(c => c.close || c.closePrice || 0).filter(p => p > 0);
        if (prices.length > 0) {
            const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
            const priceDeviation = Math.abs(candle.close - avgPrice) / avgPrice;
            
            // Если отклонение слишком большое, снижаем уверенность
            if (priceDeviation > 0.2) { // Более 20% отклонение
                confidence *= 0.7;
            } else if (priceDeviation > 0.1) { // Более 10% отклонение
                confidence *= 0.9;
            }
        }
        
        // Проверка на валидность структуры свечи
        if (candle.high < candle.low || candle.close < candle.low || candle.close > candle.high) {
            confidence *= 0.5; // Сильно снижаем уверенность при невалидных данных
        }
        
        return Math.max(0.1, Math.min(1.0, confidence));
    }

    /**
     * Вычисление метаданных прогноза
     * @param {Object} processedForecast - Обработанный прогноз
     * @returns {Object} Метаданные (volatility, trend, priceChange)
     */
    calculateForecastMetadata(processedForecast) {
        if (!processedForecast || !processedForecast.candles || processedForecast.candles.length === 0) {
            return {
                volatility: 0,
                trend: null,
                priceChange: 0
            };
        }
        
        const candles = processedForecast.candles;
        const firstPrice = candles[0].close || candles[0].open || 0;
        const lastPrice = candles[candles.length - 1].close || 0;
        
        // Вычисление волатильности (стандартное отклонение изменений цен)
        const priceChanges = [];
        for (let i = 1; i < candles.length; i++) {
            const prevPrice = candles[i - 1].close || candles[i - 1].open || 0;
            const currPrice = candles[i].close || candles[i].open || 0;
            if (prevPrice > 0) {
                const change = (currPrice - prevPrice) / prevPrice;
                priceChanges.push(change);
            }
        }
        
        let volatility = 0;
        if (priceChanges.length > 0) {
            const mean = priceChanges.reduce((sum, c) => sum + c, 0) / priceChanges.length;
            const variance = priceChanges.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / priceChanges.length;
            volatility = Math.sqrt(variance);
        }
        
        // Определение тренда
        let trend = null;
        if (firstPrice > 0 && lastPrice > 0) {
            const totalChange = (lastPrice - firstPrice) / firstPrice;
            if (totalChange > 0.02) { // Более 2% роста
                trend = 'BULLISH';
            } else if (totalChange < -0.02) { // Более 2% падения
                trend = 'BEARISH';
            } else {
                trend = 'SIDEWAYS';
            }
        }
        
        // Процентное изменение цены за неделю
        let priceChange = 0;
        if (firstPrice > 0) {
            priceChange = ((lastPrice - firstPrice) / firstPrice) * 100;
        }
        
        return {
            volatility: parseFloat(volatility.toFixed(6)),
            trend,
            priceChange: parseFloat(priceChange.toFixed(4))
        };
    }

    /**
     * Уведомление о генерации прогноза через WebSocket
     * @param {Object} forecast - Прогноз
     */
    async notifyForecastGenerated(forecast) {
        try {
            // Логируем событие
            if (LoggerService.isInitialized) {
                LoggerService.warn('Forecast generated', {
                    service: 'WeeklyForecastService',
                    operation: 'notifyForecastGenerated',
                    forecastId: forecast.id,
                    figi: forecast.figi
                });
            }
            
            // Отправляем через WebSocket
            try {
                const WebSocketService = (await import('./WebSocketService.js')).default;
                if (WebSocketService && typeof WebSocketService.broadcast === 'function') {
                    WebSocketService.broadcast({
                        type: 'weekly_forecast_generated',
                        data: {
                            forecastId: forecast.id,
                            figi: forecast.figi,
                            ticker: forecast.ticker,
                            forecastDate: forecast.forecastDate,
                            startDate: forecast.startDate,
                            endDate: forecast.endDate,
                            confidenceScore: forecast.confidenceScore,
                            predictedTrend: forecast.predictedTrend,
                            predictedPriceChange: forecast.predictedPriceChange,
                            timestamp: new Date().toISOString()
                        }
                    });
                }
            } catch (wsError) {
                // WebSocket может быть не инициализирован - это не критично
                if (LoggerService.isInitialized) {
                    LoggerService.warn('Could not send WebSocket notification', {
                        service: 'WeeklyForecastService',
                        operation: 'notifyForecastGenerated',
                        error: { message: wsError.message }
                    });
                }
            }
        } catch (error) {
            // Не прерываем выполнение при ошибке уведомления
            if (LoggerService.isInitialized) {
                LoggerService.error('Error in notifyForecastGenerated', {
                    service: 'WeeklyForecastService',
                    operation: 'notifyForecastGenerated',
                    error: { message: error.message }
                });
            }
        }
    }

    /**
     * Обновление прогноза реальными данными
     * @param {string} figi - FIGI инструмента
     * @param {number|null} forecastId - ID прогноза (опционально)
     * @returns {Promise<Object>} Результат обновления
     */
    async updateWithActualData(figi, forecastId = null) {
        const startTime = Date.now();
        
        try {
            // Получение прогноза
            let forecast;
            if (forecastId) {
                forecast = await WeeklyForecast.findByPk(forecastId);
            } else {
                const activeForecast = await this.getActiveForecast(figi);
                if (activeForecast) {
                    forecast = await WeeklyForecast.findByPk(activeForecast.id);
                }
            }
            
            if (!forecast) {
                throw new Error('Forecast not found');
            }
            
            // Получение реальных данных
            const startDate = new Date(forecast.startDate);
            const endDate = new Date();
            const daysDiff = this.daysBetween(startDate, endDate);
            
            const actualCandles = await CacheService.getCandles(
                figi,
                'DAY',
                Math.min(daysDiff + 1, 30), // Берем немного больше для надежности
                true
            );
            
            if (actualCandles.length === 0) {
                if (LoggerService.isInitialized) {
                    LoggerService.warn('No actual data available yet', {
                        service: 'WeeklyForecastService',
                        operation: 'updateWithActualData',
                        figi,
                        forecastId: forecast.id
                    });
                }
                return {
                    success: false,
                    reason: 'No actual data available yet'
                };
            }
            
            // Сопоставление прогноза с реальностью
            const matchedData = this.matchForecastWithActual(
                forecast.forecastData,
                actualCandles
            );
            
            if (matchedData.matched.length === 0) {
                if (LoggerService.isInitialized) {
                    LoggerService.warn('No matching data found', {
                        service: 'WeeklyForecastService',
                        operation: 'updateWithActualData',
                        figi,
                        forecastId: forecast.id
                    });
                }
                return {
                    success: false,
                    reason: 'No matching data found between forecast and actual'
                };
            }
            
            // Вычисление метрик
            const metrics = this.calculateAccuracyMetrics(matchedData);
            
            // Обновление прогноза
            await forecast.update({
                actualData: matchedData.actual,
                accuracyMetrics: metrics,
                updatedAt: new Date()
            });
            
            // Проверка завершения прогноза
            const now = new Date();
            const forecastEndDate = new Date(forecast.endDate);
            
            if (now >= forecastEndDate) {
                await forecast.update({
                    isCompleted: true,
                    completionDate: now
                });
                
                // Запуск адаптивного обучения (если есть реальные данные)
                if (matchedData.matched.length >= 3) {
                    try {
                        await this.adaptModel(figi, forecast.id);
                    } catch (adaptError) {
                        // Не прерываем выполнение при ошибке адаптации
                        if (LoggerService.isInitialized) {
                            LoggerService.error('Error in adaptive learning', {
                                service: 'WeeklyForecastService',
                                operation: 'updateWithActualData',
                                figi,
                                forecastId: forecast.id,
                                error: { message: adaptError.message }
                            });
                        }
                    }
                }
            }
            
            if (LoggerService.isInitialized) {
                LoggerService.warn('Forecast updated with actual data', {
                    service: 'WeeklyForecastService',
                    operation: 'updateWithActualData',
                    figi,
                    forecastId: forecast.id,
                    matchedDays: matchedData.matched.length,
                    metrics: metrics ? {
                        mae: metrics.mae,
                        mape: metrics.mape,
                        directionAccuracy: metrics.directionAccuracy
                    } : null
                });
            }
            
            const executionTime = Date.now() - startTime;
            
            // Обновляем метрики производительности
            const metrics_perf = this.performanceMetrics.updateWithActualData;
            metrics_perf.count++;
            metrics_perf.totalTime += executionTime;
            metrics_perf.averageTime = metrics_perf.totalTime / metrics_perf.count;
            metrics_perf.minTime = Math.min(metrics_perf.minTime, executionTime);
            metrics_perf.maxTime = Math.max(metrics_perf.maxTime, executionTime);
            
            return {
                success: true,
                forecast: forecast.toJSON(),
                metrics,
                matchedDays: matchedData.matched.length,
                executionTime
            };
        } catch (error) {
            const executionTime = Date.now() - startTime;
            const metrics_perf = this.performanceMetrics.updateWithActualData;
            metrics_perf.errors++;
            
            if (LoggerService.isInitialized) {
                LoggerService.error('Error updating forecast with actual data', {
                    service: 'WeeklyForecastService',
                    operation: 'updateWithActualData',
                    figi,
                    forecastId,
                    executionTime: `${executionTime}ms`,
                    error: { message: error.message, stack: error.stack }
                });
            }
            throw error;
        }
    }

    /**
     * Сопоставление прогноза с реальными данными
     * @param {Array} forecastData - Прогнозируемые данные
     * @param {Array} actualCandles - Реальные свечи
     * @returns {Object} Сопоставленные данные
     */
    matchForecastWithActual(forecastData, actualCandles) {
        if (!forecastData || forecastData.length === 0) {
            throw new Error('Forecast data is empty');
        }
        
        if (!actualCandles || actualCandles.length === 0) {
            throw new Error('Actual candles are empty');
        }
        
        const matched = [];
        const predicted = [];
        const actual = [];
        
        // Сопоставляем данные по датам
        for (let i = 0; i < forecastData.length; i++) {
            const forecastCandle = forecastData[i];
            const forecastDate = forecastCandle.date ? new Date(forecastCandle.date) : null;
            
            // Ищем соответствующую реальную свечу по дате
            let matchedActual = null;
            
            if (forecastDate) {
                // Ищем свечу с той же датой (с точностью до дня)
                matchedActual = actualCandles.find(candle => {
                    const candleDate = candle.time ? new Date(candle.time) : 
                                     candle.date ? new Date(candle.date) : null;
                    if (!candleDate) return false;
                    
                    return candleDate.toISOString().split('T')[0] === 
                           forecastDate.toISOString().split('T')[0];
                });
            }
            
            // Если не нашли по дате, берем по индексу (если есть)
            if (!matchedActual && i < actualCandles.length) {
                matchedActual = actualCandles[i];
            }
            
            if (matchedActual) {
                // Нормализуем формат реальной свечи
                const actualCandle = {
                    date: matchedActual.time ? new Date(matchedActual.time).toISOString().split('T')[0] :
                          matchedActual.date ? (typeof matchedActual.date === 'string' ? matchedActual.date : new Date(matchedActual.date).toISOString().split('T')[0]) :
                          forecastCandle.date,
                    open: matchedActual.open || matchedActual.openPrice || 0,
                    high: matchedActual.high || matchedActual.highPrice || 0,
                    low: matchedActual.low || matchedActual.lowPrice || 0,
                    close: matchedActual.close || matchedActual.closePrice || 0,
                    volume: matchedActual.volume || 0
                };
                
                // Нормализуем формат прогнозируемой свечи
                const predictedCandle = {
                    date: forecastCandle.date,
                    open: forecastCandle.open || 0,
                    high: forecastCandle.high || 0,
                    low: forecastCandle.low || 0,
                    close: forecastCandle.close || 0,
                    volume: forecastCandle.volume || 0
                };
                
                matched.push({
                    date: actualCandle.date,
                    predicted: predictedCandle,
                    actual: actualCandle
                });
                
                predicted.push(predictedCandle);
                actual.push(actualCandle);
            }
        }
        
        return {
            matched,
            predicted,
            actual
        };
    }

    /**
     * Вычисление метрик точности
     * @param {Object} matchedData - Сопоставленные данные
     * @returns {Object} Метрики точности
     */
    calculateAccuracyMetrics(matchedData) {
        if (!matchedData) {
            return null;
        }
        
        const { predicted, actual } = matchedData;
        
        if (!predicted || predicted.length === 0 || !actual || actual.length === 0) {
            return null;
        }
        
        const errors = [];
        const priceErrors = [];
        const volumeErrors = [];
        let directionCorrect = 0;
        
        for (let i = 0; i < Math.min(predicted.length, actual.length); i++) {
            const pred = predicted[i];
            const act = actual[i];
            
            // Проверяем валидность данных
            if (!pred || !act || !pred.close || !act.close || act.close <= 0) {
                continue;
            }
            
            // Ошибка цены закрытия
            const priceError = Math.abs(pred.close - act.close);
            const priceErrorPercent = (priceError / act.close) * 100;
            
            priceErrors.push(priceError);
            volumeErrors.push(Math.abs((pred.volume || 0) - (act.volume || 0)));
            
            errors.push({
                date: act.date || pred.date,
                priceError,
                priceErrorPercent,
                volumeError: Math.abs((pred.volume || 0) - (act.volume || 0))
            });
            
            // Точность направления (рост/падение)
            const predDirection = (pred.close || 0) > (pred.open || 0) ? 1 : 
                                 (pred.close || 0) < (pred.open || 0) ? -1 : 0;
            const actDirection = (act.close || 0) > (act.open || 0) ? 1 : 
                                (act.close || 0) < (act.open || 0) ? -1 : 0;
            
            if (predDirection !== 0 && actDirection !== 0 && predDirection === actDirection) {
                directionCorrect++;
            }
        }
        
        if (errors.length === 0) {
            return null;
        }
        
        // Вычисление метрик
        const mae = priceErrors.reduce((sum, e) => sum + e, 0) / priceErrors.length;
        const mse = priceErrors.reduce((sum, e) => sum + e * e, 0) / priceErrors.length;
        const rmse = Math.sqrt(mse);
        const mape = errors.reduce((sum, e) => sum + e.priceErrorPercent, 0) / errors.length;
        const directionAccuracy = errors.length > 0 ? directionCorrect / errors.length : 0;
        
        return {
            mae: parseFloat(mae.toFixed(4)),
            mse: parseFloat(mse.toFixed(4)),
            rmse: parseFloat(rmse.toFixed(4)),
            mape: parseFloat(mape.toFixed(4)),
            directionAccuracy: parseFloat(directionAccuracy.toFixed(4)),
            priceError: parseFloat(priceErrors.reduce((sum, e) => sum + e, 0).toFixed(4)),
            volumeError: parseFloat(volumeErrors.reduce((sum, e) => sum + e, 0).toFixed(4)),
            sampleSize: errors.length
        };
    }

    /**
     * Адаптивное обучение модели на основе ошибок прогноза
     * @param {string} figi - FIGI инструмента
     * @param {number} forecastId - ID завершенного прогноза
     * @returns {Promise<Object>} Результат адаптации
     */
    async adaptModel(figi, forecastId) {
        const startTime = Date.now();
        
        try {
            // Получение завершенного прогноза
            const forecast = await WeeklyForecast.findByPk(forecastId);
            if (!forecast) {
                throw new Error('Forecast not found');
            }
            
            if (!forecast.isCompleted) {
                if (LoggerService.isInitialized) {
                    LoggerService.warn('Forecast not completed, skipping adaptation', {
                        service: 'WeeklyForecastService',
                        operation: 'adaptModel',
                        figi,
                        forecastId
                    });
                }
                return {
                    success: false,
                    reason: 'Forecast must be completed for adaptation'
                };
            }
            
            if (!forecast.actualData || forecast.actualData.length === 0) {
                if (LoggerService.isInitialized) {
                    LoggerService.warn('No actual data for adaptation', {
                        service: 'WeeklyForecastService',
                        operation: 'adaptModel',
                        figi,
                        forecastId
                    });
                }
                return {
                    success: false,
                    reason: 'No actual data available for adaptation'
                };
            }
            
            // Получение исторических данных, использованных для прогноза
            const historicalCandles = await CacheService.getCandles(
                figi,
                'DAY',
                90,
                true
            );
            
            if (historicalCandles.length < 60) {
                throw new Error(`Insufficient historical data for adaptation: ${historicalCandles.length} candles`);
            }
            
            // Подготовка features для исторических данных
            const features = await this.prepareForecastFeatures(
                figi,
                historicalCandles,
                { includeMacro: false, includeNews: false }
            );
            
            // Используем последние 60 дней как вход
            const inputSequence = features.slice(-60);
            
            // Реальные данные как цель (конвертируем в формат для обучения)
            const targetSequence = forecast.actualData.map(candle => [
                candle.open || 0,
                candle.high || 0,
                candle.low || 0,
                candle.close || 0,
                candle.volume || 0
            ]);
            
            // Загрузка модели
            const modelWrapper = await this.getOrCreateModel(figi, forecast.modelType || 'seq2seq');
            const model = modelWrapper.model;
            
            if (!model) {
                throw new Error('Model not found or could not be created');
            }
            
            // Дообучение модели (fine-tuning)
            // Используем небольшое количество эпох и низкий learning rate
            const sequences = [inputSequence];
            const targets = [targetSequence];
            
            await WeeklyForecastModelService.trainModel(model, sequences, targets, {
                epochs: 3, // Небольшое количество эпох для fine-tuning
                batchSize: 1,
                validationSplit: 0,
                verbose: 0,
                figi // Передаем figi для идентификации в очереди
            });
            
            // Сохранение обновленной модели
            const newVersion = this.generateModelVersion();
            const saveSuccess = await WeeklyForecastModelService.saveModel(
                model,
                figi,
                forecast.modelType || 'seq2seq',
                {
                    version: newVersion,
                    previousVersion: forecast.modelVersion,
                    adaptedFrom: forecastId,
                    adaptedAt: new Date().toISOString(),
                    metrics: forecast.accuracyMetrics
                }
            );
            
            if (!saveSuccess) {
                if (LoggerService.isInitialized) {
                    LoggerService.warn('Failed to save adapted model', {
                        service: 'WeeklyForecastService',
                        operation: 'adaptModel',
                        figi,
                        forecastId
                    });
                }
            }
            
            if (LoggerService.isInitialized) {
                LoggerService.warn('Model adapted successfully', {
                    service: 'WeeklyForecastService',
                    operation: 'adaptModel',
                    figi,
                    forecastId,
                    newVersion,
                    previousVersion: forecast.modelVersion
                });
            }
            
            const executionTime = Date.now() - startTime;
            
            // Обновляем метрики производительности
            const metrics = this.performanceMetrics.adaptModel;
            metrics.count++;
            metrics.totalTime += executionTime;
            metrics.averageTime = metrics.totalTime / metrics.count;
            metrics.minTime = Math.min(metrics.minTime, executionTime);
            metrics.maxTime = Math.max(metrics.maxTime, executionTime);
            
            return {
                success: true,
                newVersion,
                previousVersion: forecast.modelVersion,
                saved: saveSuccess,
                executionTime
            };
        } catch (error) {
            const executionTime = Date.now() - startTime;
            const metrics = this.performanceMetrics.adaptModel;
            metrics.errors++;
            
            if (LoggerService.isInitialized) {
                LoggerService.error('Error adapting model', {
                    service: 'WeeklyForecastService',
                    operation: 'adaptModel',
                    figi,
                    forecastId,
                    executionTime: `${executionTime}ms`,
                    error: { message: error.message, stack: error.stack }
                });
            }
            throw error;
        }
    }
    
    /**
     * Получение метрик производительности
     * @returns {Object} Метрики производительности
     */
    getPerformanceMetrics() {
        return {
            ...this.performanceMetrics,
            cacheStats: {
                modelCacheSize: this.modelCache.size,
                featuresCacheSize: this.featuresCache.size,
                macroCacheSize: this.macroCache.size,
                newsCacheSize: this.newsCache.size,
                modelCacheTTL: this.modelCacheTTL,
                featuresCacheTTL: this.featuresCacheTTL,
                macroNewsCacheTTL: this.macroNewsCacheTTL
            }
        };
    }
    
    /**
     * Очистка кэшей
     */
    clearCaches() {
        this.modelCache.clear();
        this.featuresCache.clear();
        this.macroCache.clear();
        this.newsCache.clear();
        
        if (LoggerService.isInitialized) {
            LoggerService.warn('Caches cleared', {
                service: 'WeeklyForecastService',
                operation: 'clearCaches'
            });
        }
    }

    /**
     * Генерация версии модели
     * @returns {string} Версия модели (timestamp_version)
     */
    generateModelVersion() {
        return `${Date.now()}_v1`;
    }

    /**
     * Добавление дней к дате
     * @param {Date} date - Дата
     * @param {number} days - Количество дней
     * @returns {Date} Новая дата
     */
    addDays(date, days) {
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        return result;
    }

    /**
     * Вычисление количества дней между датами
     * @param {Date} startDate - Начальная дата
     * @param {Date} endDate - Конечная дата
     * @returns {number} Количество дней
     */
    daysBetween(startDate, endDate) {
        const diffTime = Math.abs(endDate - startDate);
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }
}

// Создаем singleton
const weeklyForecastService = new WeeklyForecastService();

export default weeklyForecastService;

