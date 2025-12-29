import CacheService from './CacheService.js';
import TinkoffApiService from './TinkoffApiService.js';
import DividendService from './DividendService.js';
import MacroDataService from './MacroDataService.js';
import FundamentalDataService from './FundamentalDataService.js';
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
            console.log('📊 Initializing Optimized Data Service...');
            
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
            // TinkoffApiService не требует инициализации - это экземпляр
            // await DividendService.initialize(); // Проверим, есть ли у DividendService метод initialize
            // await CompanySyncService.initialize(); // Временно отключено
            // await PortfolioSyncService.initialize(); // Временно отключено
            
            this.isInitialized = true;
            console.log('✅ Optimized Data Service initialized');
        } catch (error) {
            console.error('❌ Failed to initialize Optimized Data Service:', error);
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
        try {
            // Адаптивная проверка данных
            const minRequired = lookbackPeriod + predictionHorizon;
            if (!candles || candles.length < minRequired) {
                // Пытаемся адаптировать параметры для малого количества данных
                if (candles && candles.length >= 10) {
                    const adaptiveLookback = Math.max(5, Math.floor(candles.length / 2));
                    const adaptiveHorizon = Math.max(1, Math.floor(candles.length / 10));
                    
                    console.log(`📊 Adaptive training: ${candles.length} candles, lookback=${adaptiveLookback}, horizon=${adaptiveHorizon}`);
                    
                    // Рекурсивно вызываем с адаптивными параметрами
                    return await this.prepareTrainingData(candles, adaptiveLookback, adaptiveHorizon, figi);
                } else {
                    console.warn(`⚠️ Insufficient data: ${candles?.length || 0} candles, need at least ${minRequired}`);
                    return { features: [], labels: [] };
                }
            }

            // Загружаем все свечи один раз для использования в getMarketFeatures
            // Это предотвращает множественные запросы к кешу
            let allCandles = null;
            if (figi) {
                try {
                    allCandles = await CacheService.getCandles(figi, 'DAY', 365);
                } catch (error) {
                    console.warn(`⚠️ Failed to preload candles for market features: ${error.message}`);
                }
            }

            const features = [];
            const labels = [];
            let expectedFeatureSize = null;
            let skippedSamples = 0;

            for (let i = lookbackPeriod; i < candles.length - predictionHorizon; i++) {
                // Создаем окно данных
                const window = candles.slice(i - lookbackPeriod, i);
                const futureCandle = candles[i + predictionHorizon];
                
                if (window.length === lookbackPeriod && futureCandle) {
                    try {
                        // Подготавливаем фичи, передавая предзагруженные свечи
                        const featureVector = await this.createFeatureVector(window, figi, allCandles);
                        
                        // Проверяем размер фичей для консистентности
                        if (expectedFeatureSize === null) {
                            expectedFeatureSize = featureVector.length;
                        } else if (featureVector.length !== expectedFeatureSize) {
                            console.warn(`⚠️ Feature size mismatch: expected ${expectedFeatureSize}, got ${featureVector.length}, skipping sample ${i}`);
                            skippedSamples++;
                            continue;
                        }
                        
                        // Создаем лейбл
                        // Сначала пробуем использовать исторические сигналы как метки
                        let label = null;
                        if (figi) {
                            label = await this.getLabelFromSignals(figi, futureCandle.time);
                        }
                        
                        // Если сигналов нет, используем стандартную логику (рост > 1%)
                        if (label === null) {
                            const priceChange = ((futureCandle.close - window[window.length - 1].close) / window[window.length - 1].close) * 100;
                            label = priceChange > 1 ? 1 : 0;
                        }
                        
                        features.push(featureVector);
                        labels.push(label);
                    } catch (featureError) {
                        console.warn(`⚠️ Error creating feature vector for sample ${i}:`, featureError.message);
                        skippedSamples++;
                        continue;
                    }
                }
            }

            if (skippedSamples > 0) {
                console.warn(`⚠️ Skipped ${skippedSamples} samples due to inconsistent feature sizes`);
            }

            return { features, labels };
        } catch (error) {
            console.error('❌ Error preparing training data:', error);
            return { features: [], labels: [] };
        }
    }

    /**
     * Создание вектора фичей из окна данных
     */
    async createFeatureVector(window, figi = null, preloadedCandles = null) {
        try {
            const features = [];
            
            // Базовые фичи: цены и объемы
            const prices = window.map(c => c.close);
            const volumes = window.map(c => c.volume);
            const highs = window.map(c => c.high);
            const lows = window.map(c => c.low);
            
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
                console.warn(`⚠️ Prices count mismatch: expected 5, got ${normalizedPrices.length}`);
                while (normalizedPrices.length < 5) {
                    normalizedPrices.push(0);
                }
                if (normalizedPrices.length > 5) {
                    normalizedPrices.splice(5);
                }
            }
            
            if (normalizedVolumes.length !== 5) {
                console.warn(`⚠️ Volumes count mismatch: expected 5, got ${normalizedVolumes.length}`);
                while (normalizedVolumes.length < 5) {
                    normalizedVolumes.push(0);
                }
                if (normalizedVolumes.length > 5) {
                    normalizedVolumes.splice(5);
                }
            }
            
            // Технические индикаторы
            const technicalFeatures = this.calculateTechnicalIndicators(prices, volumes, highs, lows);
            
            // Временные фичи
            const timeFeatures = this.createTimeFeatures(window[window.length - 1].time);
            
            // Рыночные фичи (если доступны) - передаем предзагруженные свечи для оптимизации
            const marketFeatures = await this.getMarketFeatures(figi, window[window.length - 1].time, preloadedCandles);
            
            // Новостные фичи и анализ настроений
            const newsFeatures = await this.getNewsFeatures(figi, window[window.length - 1].time);
            
            // Telegram настроения
            const telegramFeatures = await this.getTelegramFeatures(figi, window[window.length - 1].time);
            
            // Сигналы аналитиков
            const signalsFeatures = await this.getSignalsFeatures(figi, window[window.length - 1].time);
            
            // Макроэкономические фичи
            const macroFeatures = await this.getMacroFeatures(window[window.length - 1].time);
            
            // Фундаментальные фичи (P/E, P/B, EV/EBITDA, ROE, Debt/EBITDA, Operating Margin, Net Margin)
            const fundamentalFeatures = figi 
                ? await FundamentalDataService.getFundamentalFeatures(figi, window[window.length - 1].time)
                : new Array(7).fill(0);
            
            // Объединяем все фичи
            features.push(...normalizedPrices);
            features.push(...normalizedVolumes);
            features.push(...technicalFeatures);
            features.push(...timeFeatures);
            features.push(...marketFeatures);
            features.push(...newsFeatures);
            features.push(...telegramFeatures);
            features.push(...signalsFeatures);
            features.push(...macroFeatures);
            features.push(...fundamentalFeatures);
            
            // Логирование и исправление размеров фичей
            // Полный набор: 5 (prices) + 5 (volumes) + 6 (technical) + 2 (time) + 3 (market) + 2 (news) + 2 (telegram) + 5 (signals) + 8 (macro) + 7 (fundamental) = 45
            const expectedSize = 45;
            if (features.length !== expectedSize) {
                console.warn(`⚠️ Unexpected feature size: ${features.length}, expected ${expectedSize}`);
                
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
                
                console.log(`✅ Fixed feature size to ${features.length}`);
            }
            
            return features;
        } catch (error) {
            console.error('Error creating feature vector:', error);
            // Возвращаем нулевой вектор при ошибке с правильным размером
            // Полный набор: 5 + 5 + 6 + 2 + 3 + 2 + 2 + 5 + 8 + 7 = 45
            return new Array(45).fill(0);
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
            console.error('Error splitting data:', error);
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
            console.log(`🔄 Updating data for ${figi}...`);
            
            // Обновляем свечи
            await CacheService.updateCandles(figi);
            
            // Обновляем дивиденды
            await DividendService.updateDividends(figi);
            
            // Обновляем информацию об инструменте
            // await CompanySyncService.syncInstrument(figi); // Временно отключено
            
            console.log(`✅ Data updated for ${figi}`);
        } catch (error) {
            console.error(`❌ Error updating data for ${figi}:`, error);
            throw error;
        }
    }

    /**
     * Пакетное обновление данных
     */
    async updateAllData() {
        try {
            console.log('🔄 Updating all data...');
            
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
            
            console.log(`✅ Data update completed. ${results.filter(r => r.success).length}/${results.length} successful`);
            return results;
        } catch (error) {
            console.error('❌ Error updating all data:', error);
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
            console.error('Error getting trading hours:', error);
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
            console.error('Error checking market status:', error);
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
            
            // MACD line (1 фича) - только основная линия, убираем signal и histogram
            const macd = this.calculateMACD(prices);
            features.push(macd[0]); // Только MACD line
            
            // Bollinger Bands position (1 фича) - позиция цены относительно BB (0-1)
            const bb = this.calculateBollingerBands(prices);
            const currentPrice = prices[prices.length - 1];
            const bbPosition = bb[1] > 0 ? (currentPrice - bb[0]) / (bb[2] - bb[0]) : 0.5; // Нормализованная позиция
            features.push(Math.max(0, Math.min(1, bbPosition))); // Ограничиваем 0-1
            
            // SMA20 (1 фича) - нормализованная относительно текущей цены
            const sma20 = this.calculateSMA(prices, 20);
            const sma20Ratio = currentPrice > 0 ? sma20 / currentPrice : 1;
            features.push(sma20Ratio);
            
            // EMA12 (1 фича) - нормализованная относительно текущей цены
            const ema12 = this.calculateEMA(prices, 12);
            const ema12Ratio = currentPrice > 0 ? ema12 / currentPrice : 1;
            features.push(ema12Ratio);
            
            // Volume SMA (1 фича) - нормализованная относительно текущего объема
            const volumeSma = this.calculateSMA(volumes, 5);
            const currentVolume = volumes[volumes.length - 1] || 1;
            const volumeRatio = volumeSma > 0 ? currentVolume / volumeSma : 1;
            features.push(Math.min(2, volumeRatio)); // Ограничиваем до 2x
            
            // Всего должно быть 6 фичей (упрощенный набор)
            if (features.length !== 6) {
                console.warn(`⚠️ Technical indicators count mismatch: expected 6, got ${features.length}`);
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
            console.error('Error calculating technical indicators:', error);
            return new Array(6).fill(0);
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
            let candles = preloadedCandles;
            if (!candles || candles.length === 0) {
                // Загружаем только если не переданы предзагруженные свечи
                candles = await CacheService.getCandles(figi, 'DAY', 30);
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
                return [0, 0]; // Нет новостей до указанного времени
            }
            
            // Рассчитываем только самые важные фичи (упрощенный набор)
            const sentiments = filteredNews.map(n => n.sentiment);
            const relevances = filteredNews.map(n => n.relevance);
            
            const avgSentiment = sentiments.reduce((sum, s) => sum + s, 0) / sentiments.length;
            const avgRelevance = relevances.reduce((sum, r) => sum + r, 0) / relevances.length;
            
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
                return [0, 0]; // Нет данных
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
                return new Array(8).fill(0);
            }
            
            // Получаем макро-фичи для указанной даты
            const macroFeatures = await MacroDataService.getMacroFeatures(date, country);
            
            // Убеждаемся, что возвращаем ровно 8 фичей
            if (macroFeatures.length !== 8) {
                console.warn(`⚠️ Macro features count mismatch: expected 8, got ${macroFeatures.length}`);
                // Дополняем или обрезаем до 8
                const fixedFeatures = [...macroFeatures];
                while (fixedFeatures.length < 8) {
                    fixedFeatures.push(0);
                }
                if (fixedFeatures.length > 8) {
                    fixedFeatures.splice(8);
                }
                return fixedFeatures;
            }
            
            return macroFeatures;
            
        } catch (error) {
            console.error('❌ Ошибка получения макро-фичей:', error);
            // Возвращаем 8 нулевых фичей при ошибке
            return new Array(8).fill(0);
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
            const timestampDate = new Date(timestamp);
            const signals = await SignalCacheService.getSignalsByDate(figi, timestampDate);
            
            if (signals.length === 0) {
                return [0, 0, 0, 0, 0]; // Нет сигналов - возвращаем 5 нулевых фичей
            }

            // Конвертируем цены из формата Tinkoff API
            const convertPrice = (priceObj) => {
                if (!priceObj) return 0;
                const units = parseFloat(priceObj.units || 0);
                const nano = parseFloat(priceObj.nano || 0);
                return units + nano / 1e9;
            };

            // Получаем текущую цену из последней свечи (если доступна)
            let currentPrice = 0;
            try {
                const candles = await CacheService.getCandles(figi, 'DAY', 1);
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
                return [0, 0, 0, 0, 0];
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
