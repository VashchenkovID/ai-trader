/**
 * Сервис адаптивных порогов для рекомендаций
 * Фаза 2, задача 2.1: Система обратной связи
 *
 * Функциональность:
 * - Определение рыночных режимов (тренд, флэт, волатильность)
 * - Расчет адаптивных порогов на основе рыночных условий
 * - Разные пороги для разных режимов
 */

import CacheService from './CacheService.js';
import LoggerService from './LoggerService.js';

class AdaptiveThresholdService {
    constructor() {
        this.isInitialized = false;
        this.settings = {
            // Базовые пороги (используются как отправная точка)
            baseThresholds: {
                buyScore: 0.65,
                buyConfidence: 0.6,
                sellScore: 0.35,
                sellConfidence: 0.6
            },

            // Адаптации для разных режимов
            trendMode: {
                buyScoreMultiplier: 0.9,      // Снижаем порог в тренде
                buyConfidenceMultiplier: 0.9,
                sellScoreMultiplier: 1.1,     // Повышаем порог продажи
                sellConfidenceMultiplier: 1.0
            },

            flatMode: {
                buyScoreMultiplier: 1.1,      // Повышаем порог во флэте
                buyConfidenceMultiplier: 1.1,
                sellScoreMultiplier: 0.9,
                sellConfidenceMultiplier: 1.0
            },

            volatileMode: {
                buyScoreMultiplier: 1.15,     // Значительно повышаем порог при волатильности
                buyConfidenceMultiplier: 1.2,
                sellScoreMultiplier: 0.85,
                sellConfidenceMultiplier: 1.1
            },

            // Параметры определения режима
            trendDetectionPeriod: 20,         // Период для определения тренда (свечей)
            volatilityPeriod: 14,             // Период для расчета волатильности
            volatilityThreshold: 0.02,        // Порог волатильности (2% в день)
            trendStrengthThreshold: 0.015     // Порог силы тренда (1.5% в день)
        };

        // Кэш режимов и порогов
        this.marketModeCache = new Map();
        this.thresholdCache = new Map();
        this.cacheExpiry = 5 * 60 * 1000; // 5 минут
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        try {
            if (this.isInitialized) {
                return;
            }

            // Загружаем настройки
            await this.loadSettings();

            this.isInitialized = true;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('❌ Failed to initialize AdaptiveThresholdService:', error);
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
            const settings = await SettingsService.getAllSettings('adaptive_threshold');

            if (settings && settings.length > 0) {
                for (const setting of settings) {
                    const key = setting.key.replace('adaptive_threshold.', '');
                    const value = setting.value;

                    // Обновляем настройки рекурсивно
                    this._updateNestedSetting(this.settings, key, value);
                }
            }
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.warn('⚠️ Failed to load adaptive threshold settings, using defaults:', error.message);
            }
        }
    }

    /**
     * Получение адаптивных порогов для инструмента
     * @param {string} figi - FIGI инструмента
     * @returns {Promise<Object>} Адаптивные пороги
     */
    async getAdaptiveThresholds(figi) {
        try {
            if (!this.isInitialized) {
                throw new Error('AdaptiveThresholdService not initialized');
            }

            // Проверяем кэш
            const cacheKey = figi;
            const cached = this.thresholdCache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
                return cached.thresholds;
            }

            // Определяем рыночный режим
            const marketMode = await this.detectMarketMode(figi);

            // Рассчитываем адаптивные пороги
            const thresholds = this._calculateThresholds(marketMode);

            // Кэшируем результат
            this.thresholdCache.set(cacheKey, {
                thresholds,
                timestamp: Date.now()
            });

            return thresholds;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Failed to get adaptive thresholds', {
                    service: 'AdaptiveThresholdService',
                    figi,
                    error: {message: error.message}
                });
            }

            // В случае ошибки возвращаем базовые пороги
            return {...this.settings.baseThresholds};
        }
    }

    /**
     * Определение рыночного режима для инструмента
     * @param {string} figi - FIGI инструмента
     * @returns {Promise<string>} Режим: 'trend', 'flat', 'volatile', или 'normal'
     */
    async detectMarketMode(figi) {
        try {
            // Проверяем кэш
            const cacheKey = figi;
            const cached = this.marketModeCache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
                return cached.mode;
            }

            // Получаем свечи
            const candles = await CacheService.getCandles(
                figi,
                'DAY',
                Math.max(this.settings.trendDetectionPeriod, this.settings.volatilityPeriod) + 10
            );

            if (!candles || candles.length < this.settings.trendDetectionPeriod) {
                return 'normal'; // Недостаточно данных
            }

            // Рассчитываем волатильность
            const volatility = this._calculateVolatility(candles);

            // Рассчитываем силу тренда
            const trendStrength = this._calculateTrendStrength(candles);

            // Определяем режим
            let mode = 'normal';

            if (volatility > this.settings.volatilityThreshold) {
                mode = 'volatile';
            } else if (Math.abs(trendStrength) > this.settings.trendStrengthThreshold) {
                mode = trendStrength > 0 ? 'trend' : 'trend'; // Восходящий или нисходящий тренд
            } else {
                mode = 'flat';
            }

            // Кэшируем результат
            this.marketModeCache.set(cacheKey, {
                mode,
                timestamp: Date.now(),
                volatility,
                trendStrength
            });

            return mode;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.warn('Failed to detect market mode, using normal', {
                    service: 'AdaptiveThresholdService',
                    figi,
                    error: {message: error.message}
                });
            }
            return 'normal';
        }
    }

    /**
     * Расчет волатильности
     * @private
     */
    _calculateVolatility(candles) {
        if (!candles || candles.length < this.settings.volatilityPeriod) {
            return 0;
        }

        const returns = [];
        for (let i = 1; i < candles.length && i <= this.settings.volatilityPeriod; i++) {
            const prevClose = candles[i - 1].close;
            const currentClose = candles[i].close;
            if (prevClose > 0) {
                const returnPercent = Math.abs((currentClose - prevClose) / prevClose);
                returns.push(returnPercent);
            }
        }

        if (returns.length === 0) {
            return 0;
        }

        // Средняя волатильность
        const avgVolatility = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        return avgVolatility;
    }

    /**
     * Расчет силы тренда
     * @private
     */
    _calculateTrendStrength(candles) {
        if (!candles || candles.length < this.settings.trendDetectionPeriod) {
            return 0;
        }

        const period = this.settings.trendDetectionPeriod;
        const recentCandles = candles.slice(-period);

        const firstPrice = recentCandles[0].close;
        const lastPrice = recentCandles[recentCandles.length - 1].close;

        if (firstPrice <= 0) {
            return 0;
        }

        // Процентное изменение за период
        const trendStrength = (lastPrice - firstPrice) / firstPrice;

        // Нормализуем на период (приводим к дневной)
        return trendStrength / period;
    }

    /**
     * Расчет адаптивных порогов на основе режима
     * @private
     */
    _calculateThresholds(marketMode) {
        const base = this.settings.baseThresholds;
        let multipliers;

        switch (marketMode) {
            case 'trend':
                multipliers = this.settings.trendMode;
                break;
            case 'flat':
                multipliers = this.settings.flatMode;
                break;
            case 'volatile':
                multipliers = this.settings.volatileMode;
                break;
            default:
                multipliers = {
                    buyScoreMultiplier: 1.0,
                    buyConfidenceMultiplier: 1.0,
                    sellScoreMultiplier: 1.0,
                    sellConfidenceMultiplier: 1.0
                };
        }

        return {
            buyScore: Math.max(0.3, Math.min(0.95, base.buyScore * multipliers.buyScoreMultiplier)),
            buyConfidence: Math.max(0.4, Math.min(0.95, base.buyConfidence * multipliers.buyConfidenceMultiplier)),
            sellScore: Math.max(0.1, Math.min(0.7, base.sellScore * multipliers.sellScoreMultiplier)),
            sellConfidence: Math.max(0.4, Math.min(0.95, base.sellConfidence * multipliers.sellConfidenceMultiplier)),
            marketMode
        };
    }

    /**
     * Обновление вложенных настроек
     * @private
     */
    _updateNestedSetting(obj, key, value) {
        const keys = key.split('.');
        let current = obj;

        for (let i = 0; i < keys.length - 1; i++) {
            if (!current[keys[i]]) {
                current[keys[i]] = {};
            }
            current = current[keys[i]];
        }

        const finalKey = keys[keys.length - 1];
        if (typeof current[finalKey] === 'number') {
            current[finalKey] = parseFloat(value) || current[finalKey];
        } else if (typeof current[finalKey] === 'boolean') {
            current[finalKey] = value === 'true' || value === true;
        } else {
            current[finalKey] = value;
        }
    }

    /**
     * Очистка кэша
     */
    clearCache() {
        this.marketModeCache.clear();
        this.thresholdCache.clear();
    }
}

export default new AdaptiveThresholdService();

