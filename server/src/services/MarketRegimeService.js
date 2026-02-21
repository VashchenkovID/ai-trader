/**
 * Сервис определения и учета рыночных режимов
 * Фаза 3, задача 3.3: Учет рыночных режимов (P2)
 * 
 * Функциональность:
 * - Классификация режимов (тренд, флэт, высокая волатильность)
 * - Адаптивные пороги в зависимости от режима
 * - Разные стратегии для разных режимов
 * - Учет макроэкономических циклов (сезонность, экономические индикаторы)
 */

import CacheService from './CacheService.js';
import OptimizedAnalysisService from './OptimizedAnalysisService.js';
import LoggerService from './LoggerService.js';

class MarketRegimeService {
    constructor() {
        this.isInitialized = false;
        this.settings = {
            // Параметры классификации режимов
            trendDetectionPeriod: 20,         // Период для определения тренда (свечей)
            volatilityPeriod: 14,             // Период для расчета волатильности
            volatilityThreshold: 0.02,        // Порог высокой волатильности (2% в день)
            trendStrengthThreshold: 0.015,    // Порог силы тренда (1.5% в день)
            flatThreshold: 0.005,             // Порог для определения флэта (0.5% в день)
            
            // Адаптивные пороги для разных режимов
            regimeThresholds: {
                trend: {
                    buyScore: 0.60,           // Снижаем порог в тренде
                    buyConfidence: 0.55,
                    sellScore: 0.40,          // Повышаем порог продажи
                    sellConfidence: 0.65
                },
                flat: {
                    buyScore: 0.70,           // Повышаем порог во флэте
                    buyConfidence: 0.65,
                    sellScore: 0.30,
                    sellConfidence: 0.60
                },
                volatile: {
                    buyScore: 0.75,           // Значительно повышаем порог при волатильности
                    buyConfidence: 0.70,
                    sellScore: 0.25,
                    sellConfidence: 0.65
                },
                normal: {
                    buyScore: 0.65,
                    buyConfidence: 0.60,
                    sellScore: 0.35,
                    sellConfidence: 0.60
                }
            },
            
            // Стратегии для разных режимов
            regimeStrategies: {
                trend: {
                    preferredStrategies: ['momentum', 'trend_following'],
                    avoidStrategies: ['mean_reversion'],
                    positionSizeMultiplier: 1.1,  // Увеличиваем размер позиции в тренде
                    stopLossMultiplier: 1.2       // Увеличиваем стоп-лосс в тренде
                },
                flat: {
                    preferredStrategies: ['mean_reversion', 'range_trading'],
                    avoidStrategies: ['momentum', 'trend_following'],
                    positionSizeMultiplier: 0.9,  // Уменьшаем размер позиции во флэте
                    stopLossMultiplier: 0.8
                },
                volatile: {
                    preferredStrategies: ['conservative', 'risk_management'],
                    avoidStrategies: ['aggressive', 'momentum'],
                    positionSizeMultiplier: 0.7,  // Значительно уменьшаем размер позиции
                    stopLossMultiplier: 1.5       // Увеличиваем стоп-лосс при волатильности
                },
                normal: {
                    preferredStrategies: ['balanced'],
                    avoidStrategies: [],
                    positionSizeMultiplier: 1.0,
                    stopLossMultiplier: 1.0
                }
            },
            
            // Параметры сезонности
            seasonality: {
                enabled: true,
                // Месяцы с исторически высокой волатильностью
                highVolatilityMonths: [9, 10], // Сентябрь, Октябрь
                // Месяцы с исторически низкой волатильностью
                lowVolatilityMonths: [7, 8],   // Июль, Август
                // Дни недели с особенностями
                fridayEffect: true,            // Эффект пятницы (закрытие позиций)
                mondayEffect: true             // Эффект понедельника (открытие недели)
            }
        };
        
        // Кэш режимов
        this.regimeCache = new Map();
        this.cacheExpiry = 5 * 60 * 1000; // 5 минут
        this.maxRegimeCacheSize = 500; // Ограничение размера кеша
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        try {
            if (this.isInitialized) {
                return;
            }

            // Загружаем настройки из базы данных
            await this.loadSettings();

            this.isInitialized = true;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('❌ Failed to initialize MarketRegimeService:', error);
            } else {
                console.error('❌ Failed to initialize MarketRegimeService:', error);
            }
            throw error;
        }
    }

    /**
     * Загрузка настроек из базы данных
     */
    async loadSettings() {
        try {
            const SettingsService = (await import('./SettingsService.js')).default;
            const settings = await SettingsService.getAllSettings('market_regime');
            
            if (settings && settings.length > 0) {
                for (const setting of settings) {
                    const key = setting.key.replace('market_regime.', '');
                    const value = JSON.parse(setting.value);
                    this._setNestedProperty(this.settings, key, value);
                }
            }
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.warn('⚠️ Could not load market regime settings, using defaults:', error.message);
            }
        }
    }

    /**
     * Установка вложенного свойства
     * @private
     */
    _setNestedProperty(obj, path, value) {
        const keys = path.split('.');
        let current = obj;
        for (let i = 0; i < keys.length - 1; i++) {
            if (!current[keys[i]]) {
                current[keys[i]] = {};
            }
            current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = value;
    }

    /**
     * Eviction для regimeCache
     */
    _evictRegimeCache() {
        const now = Date.now();
        for (const [key, entry] of this.regimeCache.entries()) {
            if ((now - (entry.timestamp || 0)) > this.cacheExpiry) this.regimeCache.delete(key);
        }
        if (this.regimeCache.size > this.maxRegimeCacheSize) {
            const entries = [...this.regimeCache.entries()]
                .sort((a, b) => (a[1].timestamp || 0) - (b[1].timestamp || 0));
            for (let i = 0; i < this.regimeCache.size - this.maxRegimeCacheSize; i++) {
                this.regimeCache.delete(entries[i][0]);
            }
        }
    }

    /**
     * Определение рыночного режима для инструмента
     * Фаза 3, задача 3.3.1: Классификация режимов
     * 
     * @param {string} figi - FIGI инструмента
     * @param {Object} options - Дополнительные опции
     * @returns {Promise<Object>} Информация о режиме
     */
    async detectRegime(figi, options = {}) {
        try {
            const { useCache = true, period = null } = options;
            
            // Проверяем кэш
            if (useCache) {
                const cacheKey = figi;
                const cached = this.regimeCache.get(cacheKey);
                if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
                    return cached.regime;
                }
            }

            // Получаем свечи
            const candlesPeriod = period || Math.max(
                this.settings.trendDetectionPeriod, 
                this.settings.volatilityPeriod
            ) + 10;
            
            const candles = await CacheService.getCandles(
                figi, 
                'DAY', 
                candlesPeriod
            );

            if (!candles || candles.length < this.settings.trendDetectionPeriod) {
                return {
                    regime: 'normal',
                    confidence: 0.5,
                    volatility: 0,
                    trendStrength: 0,
                    reason: 'Insufficient data'
                };
            }

            // Рассчитываем индикаторы
            const prices = candles.map(c => c.close);
            const volumes = candles.map(c => c.volume || 0);
            const highs = candles.map(c => c.high);
            const lows = candles.map(c => c.low);

            const indicators = OptimizedAnalysisService.getAllIndicators(
                prices, volumes, highs, lows, figi, 'DAY', candlesPeriod
            );

            // Рассчитываем волатильность
            const volatility = this._calculateVolatility(candles, indicators);
            
            // Рассчитываем силу тренда
            const trendStrength = this._calculateTrendStrength(candles, indicators);
            
            // Определяем режим
            const regime = this._classifyRegime(volatility, trendStrength, indicators);
            
            // Рассчитываем уверенность в определении режима
            const confidence = this._calculateRegimeConfidence(volatility, trendStrength, indicators);
            
            // Учитываем сезонность
            const seasonalityAdjustment = this._getSeasonalityAdjustment();
            
            const regimeInfo = {
                regime: regime.regime,
                confidence: confidence,
                volatility: volatility,
                trendStrength: trendStrength,
                trendDirection: regime.direction, // 'up', 'down', 'none'
                indicators: {
                    rsi: indicators.rsi,
                    macd: indicators.macd,
                    bb_position: indicators.bb_position,
                    atr: indicators.atr
                },
                seasonality: seasonalityAdjustment,
                thresholds: this.settings.regimeThresholds[regime.regime],
                strategies: this.settings.regimeStrategies[regime.regime],
                timestamp: new Date().toISOString()
            };

            // Кэшируем результат
            if (useCache) {
                this._evictRegimeCache();
                this.regimeCache.set(figi, {
                    regime: regimeInfo,
                    timestamp: Date.now()
                });
            }

            return regimeInfo;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error detecting market regime', {
                    service: 'MarketRegimeService',
                    operation: 'detectRegime',
                    figi,
                    error: { message: error.message, stack: error.stack }
                });
            }
            // Возвращаем режим по умолчанию при ошибке
            return {
                regime: 'normal',
                confidence: 0.5,
                volatility: 0,
                trendStrength: 0,
                reason: `Error: ${error.message}`
            };
        }
    }

    /**
     * Расчет волатильности
     * @private
     */
    _calculateVolatility(candles, indicators) {
        if (indicators && indicators.volatility !== undefined) {
            return indicators.volatility;
        }
        
        // Рассчитываем волатильность как стандартное отклонение доходности
        const returns = [];
        for (let i = 1; i < candles.length; i++) {
            const prevPrice = candles[i - 1].close;
            const currPrice = candles[i].close;
            if (prevPrice > 0) {
                returns.push((currPrice - prevPrice) / prevPrice);
            }
        }
        
        if (returns.length === 0) return 0;
        
        const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
        
        return Math.sqrt(variance);
    }

    /**
     * Расчет силы тренда
     * @private
     */
    _calculateTrendStrength(candles, indicators) {
        // Используем ADX-подобный подход
        if (indicators && indicators.sma_20 !== undefined && indicators.sma_50 !== undefined) {
            const sma20 = indicators.sma_20;
            const sma50 = indicators.sma_50;
            
            if (sma50 === 0) return 0;
            
            // Разница между SMA20 и SMA50 в процентах
            const trendStrength = (sma20 - sma50) / sma50;
            return trendStrength;
        }
        
        // Альтернативный расчет: средняя доходность за период
        const prices = candles.map(c => c.close);
        const firstPrice = prices[0];
        const lastPrice = prices[prices.length - 1];
        
        if (firstPrice === 0) return 0;
        
        return (lastPrice - firstPrice) / firstPrice / (prices.length / this.settings.trendDetectionPeriod);
    }

    /**
     * Классификация режима на основе волатильности и силы тренда
     * @private
     */
    _classifyRegime(volatility, trendStrength, indicators) {
        // Высокая волатильность - приоритет
        if (volatility > this.settings.volatilityThreshold) {
            return {
                regime: 'volatile',
                direction: 'none'
            };
        }
        
        // Сильный тренд
        const absTrendStrength = Math.abs(trendStrength);
        if (absTrendStrength > this.settings.trendStrengthThreshold) {
            return {
                regime: 'trend',
                direction: trendStrength > 0 ? 'up' : 'down'
            };
        }
        
        // Флэт (низкая волатильность и слабый тренд)
        if (volatility < this.settings.flatThreshold && absTrendStrength < this.settings.flatThreshold) {
            return {
                regime: 'flat',
                direction: 'none'
            };
        }
        
        // Нормальный режим (по умолчанию)
        return {
            regime: 'normal',
            direction: trendStrength > 0 ? 'up' : (trendStrength < 0 ? 'down' : 'none')
        };
    }

    /**
     * Расчет уверенности в определении режима
     * @private
     */
    _calculateRegimeConfidence(volatility, trendStrength, indicators) {
        let confidence = 0.5; // Базовая уверенность
        
        // Увеличиваем уверенность при экстремальных значениях
        if (volatility > this.settings.volatilityThreshold * 1.5) {
            confidence += 0.2; // Высокая волатильность
        }
        
        if (Math.abs(trendStrength) > this.settings.trendStrengthThreshold * 1.5) {
            confidence += 0.2; // Сильный тренд
        }
        
        // Учитываем согласованность индикаторов
        if (indicators) {
            let agreement = 0;
            let count = 0;
            
            // RSI и тренд
            if (indicators.rsi !== undefined) {
                const rsiTrend = indicators.rsi > 50 ? 1 : -1;
                const priceTrend = trendStrength > 0 ? 1 : -1;
                if (rsiTrend === priceTrend) agreement++;
                count++;
            }
            
            // MACD и тренд
            if (indicators.macd !== undefined) {
                const macdTrend = indicators.macd > 0 ? 1 : -1;
                const priceTrend = trendStrength > 0 ? 1 : -1;
                if (macdTrend === priceTrend) agreement++;
                count++;
            }
            
            if (count > 0) {
                confidence += (agreement / count) * 0.1;
            }
        }
        
        return Math.min(1.0, Math.max(0.0, confidence));
    }

    /**
     * Получение адаптивных порогов для режима
     * Фаза 3, задача 3.3.1: Адаптивные пороги
     * 
     * @param {string} regime - Режим рынка
     * @returns {Object} Пороги для режима
     */
    getAdaptiveThresholds(regime = 'normal') {
        return this.settings.regimeThresholds[regime] || this.settings.regimeThresholds.normal;
    }

    /**
     * Получение рекомендуемых стратегий для режима
     * Фаза 3, задача 3.3.2: Разные стратегии для разных режимов
     * 
     * @param {string} regime - Режим рынка
     * @returns {Object} Информация о стратегиях
     */
    getRegimeStrategies(regime = 'normal') {
        return this.settings.regimeStrategies[regime] || this.settings.regimeStrategies.normal;
    }

    /**
     * Получение корректировок размера позиции и стоп-лосса для режима
     * 
     * @param {string} regime - Режим рынка
     * @returns {Object} Множители для размера позиции и стоп-лосса
     */
    getPositionAdjustments(regime = 'normal') {
        const strategies = this.getRegimeStrategies(regime);
        return {
            positionSizeMultiplier: strategies.positionSizeMultiplier || 1.0,
            stopLossMultiplier: strategies.stopLossMultiplier || 1.0
        };
    }

    /**
     * Учет макроэкономических циклов
     * Фаза 3, задача 3.3.3: Учет макроэкономических циклов
     * 
     * @returns {Object} Корректировки на основе сезонности
     */
    _getSeasonalityAdjustment() {
        if (!this.settings.seasonality.enabled) {
            return {
                volatilityAdjustment: 1.0,
                confidenceAdjustment: 1.0,
                factors: []
            };
        }

        const now = new Date();
        const month = now.getMonth() + 1; // 1-12
        const dayOfWeek = now.getDay(); // 0-6 (0 = воскресенье)
        
        let volatilityAdjustment = 1.0;
        let confidenceAdjustment = 1.0;
        const factors = [];

        // Месячные эффекты
        if (this.settings.seasonality.highVolatilityMonths.includes(month)) {
            volatilityAdjustment *= 1.15; // Увеличиваем волатильность на 15%
            factors.push(`High volatility month (${this._getMonthName(month)})`);
        }
        
        if (this.settings.seasonality.lowVolatilityMonths.includes(month)) {
            volatilityAdjustment *= 0.9; // Уменьшаем волатильность на 10%
            factors.push(`Low volatility month (${this._getMonthName(month)})`);
        }

        // Эффекты дней недели
        if (this.settings.seasonality.fridayEffect && dayOfWeek === 5) {
            // Пятница - закрытие позиций перед выходными
            confidenceAdjustment *= 0.95;
            factors.push('Friday effect (position closing)');
        }
        
        if (this.settings.seasonality.mondayEffect && dayOfWeek === 1) {
            // Понедельник - открытие недели, повышенная волатильность
            volatilityAdjustment *= 1.05;
            factors.push('Monday effect (week opening)');
        }

        return {
            volatilityAdjustment,
            confidenceAdjustment,
            factors,
            month: this._getMonthName(month),
            dayOfWeek: this._getDayName(dayOfWeek)
        };
    }

    /**
     * Получение названия месяца
     * @private
     */
    _getMonthName(month) {
        const months = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        return months[month - 1] || 'Unknown';
    }

    /**
     * Получение названия дня недели
     * @private
     */
    _getDayName(dayOfWeek) {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return days[dayOfWeek] || 'Unknown';
    }

    /**
     * Инвалидация кэша для инструмента
     * 
     * @param {string} figi - FIGI инструмента
     */
    invalidateCache(figi) {
        if (figi) {
            this.regimeCache.delete(figi);
        } else {
            this.regimeCache.clear();
        }
    }

    /**
     * Получение режима для нескольких инструментов (батчинг)
     * 
     * @param {Array<string>} figis - Массив FIGI инструментов
     * @returns {Promise<Map>} Map: figi -> regime info
     */
    async detectRegimesBatch(figis) {
        const regimes = new Map();
        
        // Обрабатываем параллельно
        const promises = figis.map(async (figi) => {
            try {
                const regime = await this.detectRegime(figi);
                return { figi, regime };
            } catch (error) {
                if (LoggerService.isInitialized) {
                    LoggerService.error('Error detecting regime for instrument', {
                        service: 'MarketRegimeService',
                        figi,
                        error: { message: error.message }
                    });
                }
                return { figi, regime: null };
            }
        });
        
        const results = await Promise.all(promises);
        
        for (const { figi, regime } of results) {
            // Добавляем только валидные режимы (без ошибок)
            if (regime && (!regime.reason || !regime.reason.startsWith('Error'))) {
                regimes.set(figi, regime);
            }
        }
        
        return regimes;
    }
}

// Экспортируем singleton
const MarketRegimeServiceInstance = new MarketRegimeService();
export default MarketRegimeServiceInstance;

