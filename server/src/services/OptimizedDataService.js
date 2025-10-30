import CacheService from './CacheService.js';
import TinkoffApiService from './TinkoffApiService.js';
import DividendService from './DividendService.js';
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
                        // Подготавливаем фичи
                        const featureVector = await this.createFeatureVector(window, figi);
                        
                        // Проверяем размер фичей для консистентности
                        if (expectedFeatureSize === null) {
                            expectedFeatureSize = featureVector.length;
                            console.log(`📏 Expected feature size: ${expectedFeatureSize}`);
                        } else if (featureVector.length !== expectedFeatureSize) {
                            console.warn(`⚠️ Feature size mismatch: expected ${expectedFeatureSize}, got ${featureVector.length}, skipping sample ${i}`);
                            skippedSamples++;
                            continue;
                        }
                        
                        // Создаем лейбл (рост > 1%)
                        const priceChange = ((futureCandle.close - window[window.length - 1].close) / window[window.length - 1].close) * 100;
                        const label = priceChange > 1 ? 1 : 0;
                        
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

            console.log(`✅ Prepared ${features.length} training samples with ${expectedFeatureSize} features each`);
            return { features, labels };
        } catch (error) {
            console.error('❌ Error preparing training data:', error);
            return { features: [], labels: [] };
        }
    }

    /**
     * Создание вектора фичей из окна данных
     */
    async createFeatureVector(window, figi = null) {
        try {
            const features = [];
            
            // Базовые фичи: цены и объемы
            const prices = window.map(c => c.close);
            const volumes = window.map(c => c.volume);
            const highs = window.map(c => c.high);
            const lows = window.map(c => c.low);
            
            // Нормализация цен (берем только последние значения для экономии фичей)
            // Убеждаемся, что у нас есть ровно 10 элементов
            const pricesForFeatures = prices.slice(-10);
            const volumesForFeatures = volumes.slice(-10);
            
            // Дополняем до 10 элементов, если нужно
            while (pricesForFeatures.length < 10) {
                pricesForFeatures.unshift(pricesForFeatures[0] || 0);
            }
            while (volumesForFeatures.length < 10) {
                volumesForFeatures.unshift(volumesForFeatures[0] || 0);
            }
            
            const normalizedPrices = this.normalizePrices(pricesForFeatures);
            const normalizedVolumes = this.normalizeVolumes(volumesForFeatures);
            
            // Убеждаемся, что у нас ровно 10 фичей для цен и объемов
            if (normalizedPrices.length !== 10) {
                console.warn(`⚠️ Prices count mismatch: expected 10, got ${normalizedPrices.length}`);
                while (normalizedPrices.length < 10) {
                    normalizedPrices.push(0);
                }
                if (normalizedPrices.length > 10) {
                    normalizedPrices.splice(10);
                }
            }
            
            if (normalizedVolumes.length !== 10) {
                console.warn(`⚠️ Volumes count mismatch: expected 10, got ${normalizedVolumes.length}`);
                while (normalizedVolumes.length < 10) {
                    normalizedVolumes.push(0);
                }
                if (normalizedVolumes.length > 10) {
                    normalizedVolumes.splice(10);
                }
            }
            
            // Технические индикаторы
            const technicalFeatures = this.calculateTechnicalIndicators(prices, volumes, highs, lows);
            
            // Временные фичи
            const timeFeatures = this.createTimeFeatures(window[window.length - 1].time);
            
            // Рыночные фичи (если доступны)
            const marketFeatures = await this.getMarketFeatures(figi);
            
            // Новостные фичи и анализ настроений
            const newsFeatures = await this.getNewsFeatures(figi, window[window.length - 1].time);
            
            // Telegram настроения
            const telegramFeatures = await this.getTelegramFeatures(figi, window[window.length - 1].time);
            
            // Объединяем все фичи
            features.push(...normalizedPrices);
            features.push(...normalizedVolumes);
            features.push(...technicalFeatures);
            features.push(...timeFeatures);
            features.push(...marketFeatures);
            features.push(...newsFeatures);
            features.push(...telegramFeatures);
            
            // Логирование и исправление размеров фичей
            const expectedSize = 49;
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
            // 10 (prices) + 10 (volumes) + 10 (technical) + 5 (time) + 5 (market) + 5 (news) + 4 (telegram) = 49
            return new Array(49).fill(0);
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
     * Расчет технических индикаторов
     */
    calculateTechnicalIndicators(prices, volumes, highs, lows) {
        try {
            const features = [];
            
            // RSI (1 фича)
            const rsi = this.calculateRSI(prices);
            features.push(rsi);
            
            // MACD (3 фичи)
            const macd = this.calculateMACD(prices);
            features.push(...macd);
            
            // Bollinger Bands (3 фичи)
            const bb = this.calculateBollingerBands(prices);
            features.push(...bb);
            
            // Volume indicators (1 фича)
            const volumeSma = this.calculateSMA(volumes, 5);
            features.push(volumeSma);
            
            // SMA и EMA (2 фичи)
            const sma20 = this.calculateSMA(prices, 20);
            const ema12 = this.calculateEMA(prices, 12);
            features.push(sma20, ema12);
            
            // Всего должно быть 10 фичей
            if (features.length !== 10) {
                console.warn(`⚠️ Technical indicators count mismatch: expected 10, got ${features.length}`);
                // Дополняем или обрезаем до 10
                while (features.length < 10) {
                    features.push(0);
                }
                if (features.length > 10) {
                    features.splice(10);
                }
            }
            
            return features;
        } catch (error) {
            console.error('Error calculating technical indicators:', error);
            return new Array(10).fill(0);
        }
    }

    /**
     * Создание временных фичей
     */
    createTimeFeatures(timestamp) {
        const date = new Date(timestamp);
        return [
            date.getDay() / 6, // День недели (0-1)
            date.getMonth() / 11, // Месяц (0-1)
            date.getDate() / 30, // День месяца (0-1)
            date.getHours() / 23, // Час (0-1)
            date.getMinutes() / 59 // Минута (0-1)
        ];
    }

    /**
     * Получение рыночных фичей
     */
    async getMarketFeatures(figi) {
        try {
            // Получаем реальные рыночные фичи
            const candles = await CacheService.getCandles(figi, 'DAY', 30);
            if (!candles || candles.length < 10) {
                return [0, 0, 0, 0, 0];
            }

            const prices = candles.map(c => c.close);
            const volumes = candles.map(c => c.volume || 0);
            
            // Рассчитываем фичи (все должны быть скалярными значениями)
            const volatility = this.calculateVolatility(prices);
            const trend = this.calculateTrend(prices);
            const volumeRatio = this.calculateVolumeRatio(volumes);
            const priceChange = this.calculatePriceChange(prices);
            const rsi = this.calculateRSI(prices);
            
            // Убеждаемся, что все значения скалярные
            const features = [
                typeof volatility === 'number' ? volatility : 0,
                typeof trend === 'number' ? trend : 0,
                typeof volumeRatio === 'number' ? volumeRatio : 0,
                typeof priceChange === 'number' ? priceChange : 0,
                typeof rsi === 'number' ? rsi : 0
            ];
            
            return features;
        } catch (error) {
            console.error('Error getting market features:', error);
            return [0, 0, 0, 0, 0];
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
     */
    async getNewsFeatures(figi, timestamp) {
        try {
            const NewsAnalysisService = (await import('./NewsAnalysisService.js')).default;
            
            // Получаем новости за последние 7 дней (с кешированием)
            const news = await NewsAnalysisService.fetchNews(figi, { 
                days: 7, 
                limit: 20,
                useCache: true
            });
            
            if (news.length === 0) {
                return [0, 0, 0, 0, 0]; // Нет новостей
            }
            
            // Рассчитываем фичи на основе новостей
            const sentiments = news.map(n => n.sentiment);
            const relevances = news.map(n => n.relevance);
            const impacts = news.map(n => n.impact || 0);
            
            const avgSentiment = sentiments.reduce((sum, s) => sum + s, 0) / sentiments.length;
            const avgRelevance = relevances.reduce((sum, r) => sum + r, 0) / relevances.length;
            const avgImpact = impacts.reduce((sum, i) => sum + i, 0) / impacts.length;
            const sentimentVolatility = this.calculateVolatility(sentiments);
            const positiveNewsRatio = sentiments.filter(s => s > 0.1).length / sentiments.length;
            const highRelevanceRatio = relevances.filter(r => r > 0.7).length / relevances.length;
            
            const features = [
                avgSentiment,      // Средний сентимент
                avgRelevance,      // Средняя релевантность
                avgImpact,         // Среднее влияние
                sentimentVolatility, // Волатильность настроений
                positiveNewsRatio  // Доля позитивных новостей
            ];
            
            // Убеждаемся, что возвращаем ровно 5 фичей
            if (features.length !== 5) {
                console.warn(`⚠️ News features count mismatch: expected 5, got ${features.length}`);
                while (features.length < 5) {
                    features.push(0);
                }
                if (features.length > 5) {
                    features.splice(5);
                }
            }
            
            return features;
            
        } catch (error) {
            console.error('❌ Ошибка получения новостных фичей:', error);
            return [0, 0, 0, 0, 0];
        }
    }

    /**
     * Получение фичей настроений Telegram
     */
    async getTelegramFeatures(figi, timestamp) {
        try {
            const TelegramSentimentService = (await import('./TelegramSentimentService.js')).default;
            
            // Получаем анализ настроений за последние 7 дней
            const sentiment = await TelegramSentimentService.analyzeTelegramSentiment(figi, {
                days: 7,
                limit: 100
            });
            
            if (sentiment.messageCount === 0) {
                return [0, 0, 0, 0]; // Нет данных
            }
            
            // Рассчитываем фичи на основе настроений
            const sentimentValue = sentiment.sentiment || 0;
            const confidence = sentiment.confidence || 0;
            const messageCount = sentiment.messageCount || 0;
            const activeChannels = Object.values(sentiment.channels || {}).filter(c => c.messageCount > 0).length;
            
            const features = [
                sentimentValue,    // Общий сентимент
                confidence,        // Уверенность
                messageCount / 100, // Нормализованное количество сообщений
                activeChannels / 10 // Нормализованное количество активных каналов
            ];
            
            // Убеждаемся, что возвращаем ровно 4 фичи
            if (features.length !== 4) {
                console.warn(`⚠️ Telegram features count mismatch: expected 4, got ${features.length}`);
                while (features.length < 4) {
                    features.push(0);
                }
                if (features.length > 4) {
                    features.splice(4);
                }
            }
            
            return features;
            
        } catch (error) {
            console.error('❌ Ошибка получения Telegram фичей:', error);
            return [0, 0, 0, 0];
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
}

export default new OptimizedDataService();
