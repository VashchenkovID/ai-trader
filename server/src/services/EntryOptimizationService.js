import OptimizedAnalysisService from './OptimizedAnalysisService.js';
import CacheService from './CacheService.js';
import TinkoffApiService from './TinkoffApiService.js';
import SettingsService from './SettingsService.js';
import LoggerService from './LoggerService.js';

/**
 * Сервис для оптимизации входов в позиции
 * 
 * Функциональность:
 * - Проверка нескольких индикаторов (RSI, MACD, Bollinger Bands) для подтверждения сигнала
 * - Ожидание коррекции для лучшей цены входа
 * - Использование лимитных ордеров вместо рыночных
 * - Проверка объема торгов перед входом
 */
class EntryOptimizationService {
    constructor() {
        this.isInitialized = false;
        this.settings = {
            // Пороги для индикаторов
            rsiOversold: 30,        // RSI < 30 - перепроданность (хорошо для BUY)
            rsiOverbought: 70,      // RSI > 70 - перекупленность (хорошо для SELL)
            rsiNeutral: 40,         // RSI 40-60 - нейтральная зона
            rsiNeutralUpper: 60,
            
            // MACD
            macdBullishThreshold: 0, // MACD > 0 - бычий тренд
            macdBearishThreshold: 0, // MACD < 0 - медвежий тренд
            
            // Bollinger Bands
            bbLowerThreshold: 0.05,  // Цена ниже нижней полосы на 5% - перепроданность
            bbUpperThreshold: 0.05,  // Цена выше верхней полосы на 5% - перекупленность
            bbNeutralZone: 0.3,      // Нейтральная зона (30% от ширины полос)
            
            // Ожидание коррекции
            waitForCorrection: true,
            correctionThreshold: 0.02, // Ожидать коррекцию 2% от текущей цены
            maxWaitTime: 24 * 60 * 60 * 1000, // Максимальное время ожидания: 24 часа
            
            // Лимитные ордера
            useLimitOrders: true,
            limitOrderOffset: 0.005, // Лимитный ордер на 0.5% лучше текущей цены
            
            // Проверка объема
            minVolumeRatio: 0.8,    // Минимальный объем относительно среднего (80%)
            volumeCheckPeriod: 20,  // Период для расчета среднего объема (20 свечей)
            
            // Количество подтверждающих индикаторов
            minConfirmingIndicators: 2 // Минимум 2 индикатора должны подтверждать сигнал
        };
    }

    async initialize() {
        try {
            LoggerService.info('🎯 Initializing Entry Optimization Service...');
            
            // Загружаем настройки
            await this.loadSettings();
            
            this.isInitialized = true;
            LoggerService.info('✅ Entry Optimization Service initialized');
        } catch (error) {
            LoggerService.error('❌ Failed to initialize Entry Optimization Service:', error);
            throw error;
        }
    }

    /**
     * Загрузка настроек из базы данных
     */
    async loadSettings() {
        try {
            // Загружаем настройки из Settings
            const settings = await SettingsService.getAllSettings('entry_optimization');
            
            if (settings && settings.length > 0) {
                for (const setting of settings) {
                    const key = setting.key.replace('entry_optimization.', '');
                    const value = setting.value;
                    
                    // Преобразуем значение в нужный тип
                    if (key.includes('threshold') || key.includes('ratio') || key.includes('offset') || key.includes('percent')) {
                        this.settings[key] = parseFloat(value) || this.settings[key];
                    } else if (key.includes('enabled') || key.includes('wait')) {
                        this.settings[key] = value === 'true' || value === true;
                    } else if (key.includes('time') || key.includes('period')) {
                        this.settings[key] = parseInt(value) || this.settings[key];
                    } else if (key.includes('min')) {
                        this.settings[key] = parseInt(value) || this.settings[key];
                    }
                }
            }
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Failed to load entry optimization settings', {
                    service: 'EntryOptimizationService',
                    operation: 'loadSettings',
                    error: { message: error.message, stack: error.stack }
                });
            }
        }
    }

    /**
     * Анализ сигнала для оптимизации входа
     * @param {Object} signal - Торговый сигнал {figi, action, price, confidence, score}
     * @param {Object} options - Дополнительные опции
     * @returns {Object} - Результат анализа с рекомендациями
     */
    async analyzeEntry(signal, options = {}) {
        try {
            if (!this.isInitialized) {
                throw new Error('EntryOptimizationService не инициализирован');
            }

            const { figi, action, price, confidence, score } = signal;
            
            if (!figi || !action || !price) {
                throw new Error('Недостаточно данных для анализа входа');
            }

            // Получаем исторические данные
            const candles = await CacheService.getCandles(figi, 'DAY', 50);
            if (candles.length < 20) {
                return {
                    canEnter: false,
                    reason: 'Недостаточно исторических данных',
                    recommendation: 'wait',
                    indicators: null
                };
            }

            // Извлекаем данные для расчета индикаторов
            const prices = candles.map(c => c.close);
            const highs = candles.map(c => c.high);
            const lows = candles.map(c => c.low);
            const volumes = candles.map(c => c.volume || 0);

            // Рассчитываем индикаторы
            const indicators = OptimizedAnalysisService.getAllIndicators(prices, volumes, highs, lows);
            
            // Преобразуем RSI из нормализованного значения (0-1) в проценты (0-100)
            // OptimizedAnalysisService возвращает RSI в диапазоне 0-1
            const rsiValue = indicators.rsi != null ? (indicators.rsi * 100) : null;
            
            // Анализируем каждый индикатор
            const analysis = {
                rsi: this.analyzeRSI(rsiValue, action),
                macd: this.analyzeMACD(indicators.macd, indicators.macd_signal, indicators.macd_histogram, action),
                bollinger: this.analyzeBollingerBands(price, indicators.bb_upper, indicators.bb_middle, indicators.bb_lower, action),
                volume: this.analyzeVolume(volumes, this.settings.volumeCheckPeriod),
                correction: this.analyzeCorrection(candles, price, action)
            };

            // Подсчитываем подтверждающие индикаторы
            const confirmingIndicators = [
                analysis.rsi.confirms,
                analysis.macd.confirms,
                analysis.bollinger.confirms
            ].filter(Boolean).length;

            // Определяем, можно ли входить
            const hasEnoughIndicators = confirmingIndicators >= this.settings.minConfirmingIndicators;
            const hasSufficientVolume = analysis.volume.sufficient;
            const shouldWaitForCorrection = analysis.correction.shouldWait && this.settings.waitForCorrection;
            
            const canEnter = hasEnoughIndicators && hasSufficientVolume && !shouldWaitForCorrection;

            // Формируем причину отказа (если есть)
            let rejectionReason = '';
            if (!canEnter) {
                const reasons = [];
                if (!hasEnoughIndicators) {
                    reasons.push(`Недостаточно подтверждающих индикаторов (${confirmingIndicators}/${this.settings.minConfirmingIndicators})`);
                }
                if (!hasSufficientVolume) {
                    reasons.push(`Объем недостаточен (${(analysis.volume.ratio * 100).toFixed(2)}% от среднего, минимум ${(this.settings.minVolumeRatio * 100)}%)`);
                }
                if (shouldWaitForCorrection) {
                    reasons.push(`Ожидание коррекции для лучшей цены входа`);
                }
                rejectionReason = reasons.join('; ');
            }

            // Рекомендация по цене входа
            let recommendedPrice = price;
            let orderType = 'market'; // 'market' или 'limit'
            
            if (this.settings.useLimitOrders && canEnter) {
                // Рассчитываем оптимальную цену для лимитного ордера
                if (action === 'BUY') {
                    // Для покупки - цена немного ниже текущей (чтобы купить дешевле)
                    recommendedPrice = price * (1 - this.settings.limitOrderOffset);
                    orderType = 'limit';
                } else if (action === 'SELL') {
                    // Для продажи - цена немного выше текущей (чтобы продать дороже)
                    recommendedPrice = price * (1 + this.settings.limitOrderOffset);
                    orderType = 'limit';
                }
            }

            // Если нужно ждать коррекции
            if (shouldWaitForCorrection) {
                return {
                    canEnter: false,
                    reason: 'Ожидание коррекции для лучшей цены входа',
                    recommendation: 'wait',
                    waitTime: analysis.correction.estimatedWaitTime,
                    targetPrice: analysis.correction.targetPrice,
                    indicators: analysis,
                    confirmingIndicators,
                    orderType: 'limit',
                    recommendedPrice: analysis.correction.targetPrice
                };
            }

            return {
                canEnter,
                reason: canEnter ? 'Сигнал подтвержден индикаторами и объемом' : rejectionReason,
                recommendation: canEnter ? (orderType === 'limit' ? 'limit_order' : 'enter') : 'wait',
                indicators: analysis,
                confirmingIndicators,
                orderType,
                recommendedPrice,
                confidence: this.calculateAdjustedConfidence(confidence, confirmingIndicators, analysis)
            };
        } catch (error) {
            LoggerService.error('❌ Error analyzing entry:', error);
            return {
                canEnter: false,
                reason: `Ошибка анализа: ${error.message}`,
                recommendation: 'error',
                indicators: null
            };
        }
    }

    /**
     * Анализ RSI
     */
    analyzeRSI(rsi, action) {
        if (!rsi || isNaN(rsi)) {
            return { confirms: false, reason: 'RSI не рассчитан', value: null };
        }

        let confirms = false;
        let reason = '';

        if (action === 'BUY') {
            // Для покупки хорошо, если RSI < 30 (перепроданность) или в нейтральной зоне (40-60)
            if (rsi < this.settings.rsiOversold) {
                confirms = true;
                reason = `RSI перепродан (${rsi.toFixed(2)}) - хорошая возможность для покупки`;
            } else if (rsi >= this.settings.rsiNeutral && rsi <= this.settings.rsiNeutralUpper) {
                confirms = true;
                reason = `RSI в нейтральной зоне (${rsi.toFixed(2)}) - можно входить`;
            } else if (rsi > this.settings.rsiOverbought) {
                confirms = false;
                reason = `RSI перекуплен (${rsi.toFixed(2)}) - не рекомендуется покупать`;
            } else {
                confirms = false;
                reason = `RSI в неопределенной зоне (${rsi.toFixed(2)})`;
            }
        } else if (action === 'SELL') {
            // Для продажи хорошо, если RSI > 70 (перекупленность)
            if (rsi > this.settings.rsiOverbought) {
                confirms = true;
                reason = `RSI перекуплен (${rsi.toFixed(2)}) - хорошая возможность для продажи`;
            } else if (rsi >= this.settings.rsiNeutral && rsi <= this.settings.rsiNeutralUpper) {
                confirms = true;
                reason = `RSI в нейтральной зоне (${rsi.toFixed(2)}) - можно входить`;
            } else if (rsi < this.settings.rsiOversold) {
                confirms = false;
                reason = `RSI перепродан (${rsi.toFixed(2)}) - не рекомендуется продавать`;
            } else {
                confirms = false;
                reason = `RSI в неопределенной зоне (${rsi.toFixed(2)})`;
            }
        }

        return { confirms, reason, value: rsi };
    }

    /**
     * Анализ MACD
     */
    analyzeMACD(macd, signal, histogram, action) {
        if (!macd || isNaN(macd) || !signal || isNaN(signal)) {
            return { confirms: false, reason: 'MACD не рассчитан', value: null };
        }

        let confirms = false;
        let reason = '';

        if (action === 'BUY') {
            // Для покупки хорошо, если MACD > signal (бычий сигнал) и MACD > 0
            if (macd > signal && macd > this.settings.macdBullishThreshold) {
                confirms = true;
                reason = `MACD бычий (${macd.toFixed(4)} > ${signal.toFixed(4)}) - подтверждает покупку`;
            } else if (macd < signal && macd < this.settings.macdBearishThreshold) {
                confirms = false;
                reason = `MACD медвежий (${macd.toFixed(4)} < ${signal.toFixed(4)}) - не подтверждает покупку`;
            } else {
                confirms = false;
                reason = `MACD нейтральный (${macd.toFixed(4)})`;
            }
        } else if (action === 'SELL') {
            // Для продажи хорошо, если MACD < signal (медвежий сигнал) и MACD < 0
            if (macd < signal && macd < this.settings.macdBearishThreshold) {
                confirms = true;
                reason = `MACD медвежий (${macd.toFixed(4)} < ${signal.toFixed(4)}) - подтверждает продажу`;
            } else if (macd > signal && macd > this.settings.macdBullishThreshold) {
                confirms = false;
                reason = `MACD бычий (${macd.toFixed(4)} > ${signal.toFixed(4)}) - не подтверждает продажу`;
            } else {
                confirms = false;
                reason = `MACD нейтральный (${macd.toFixed(4)})`;
            }
        }

        return { confirms, reason, value: macd, signal, histogram };
    }

    /**
     * Анализ Bollinger Bands
     */
    analyzeBollingerBands(price, upper, middle, lower, action) {
        if (!upper || !middle || !lower || isNaN(upper) || isNaN(middle) || isNaN(lower)) {
            return { confirms: false, reason: 'Bollinger Bands не рассчитаны', value: null };
        }

        const bandWidth = upper - lower;
        const pricePosition = (price - lower) / bandWidth; // 0 = нижняя полоса, 1 = верхняя полоса

        let confirms = false;
        let reason = '';

        if (action === 'BUY') {
            // Для покупки хорошо, если цена близко к нижней полосе (перепроданность)
            if (pricePosition < this.settings.bbLowerThreshold) {
                confirms = true;
                reason = `Цена ниже нижней полосы BB (${(pricePosition * 100).toFixed(2)}%) - перепроданность`;
            } else if (pricePosition < this.settings.bbNeutralZone) {
                confirms = true;
                reason = `Цена в нижней части BB (${(pricePosition * 100).toFixed(2)}%) - можно входить`;
            } else if (pricePosition > (1 - this.settings.bbUpperThreshold)) {
                confirms = false;
                reason = `Цена выше верхней полосы BB (${(pricePosition * 100).toFixed(2)}%) - перекупленность`;
            } else {
                confirms = false;
                reason = `Цена в нейтральной зоне BB (${(pricePosition * 100).toFixed(2)}%)`;
            }
        } else if (action === 'SELL') {
            // Для продажи хорошо, если цена близко к верхней полосе (перекупленность)
            if (pricePosition > (1 - this.settings.bbUpperThreshold)) {
                confirms = true;
                reason = `Цена выше верхней полосы BB (${(pricePosition * 100).toFixed(2)}%) - перекупленность`;
            } else if (pricePosition > (1 - this.settings.bbNeutralZone)) {
                confirms = true;
                reason = `Цена в верхней части BB (${(pricePosition * 100).toFixed(2)}%) - можно входить`;
            } else if (pricePosition < this.settings.bbLowerThreshold) {
                confirms = false;
                reason = `Цена ниже нижней полосы BB (${(pricePosition * 100).toFixed(2)}%) - перепроданность`;
            } else {
                confirms = false;
                reason = `Цена в нейтральной зоне BB (${(pricePosition * 100).toFixed(2)}%)`;
            }
        }

        return { confirms, reason, value: { upper, middle, lower, position: pricePosition } };
    }

    /**
     * Анализ объема торгов
     */
    analyzeVolume(volumes, period) {
        if (!volumes || volumes.length < period) {
            return { sufficient: false, reason: 'Недостаточно данных для анализа объема', ratio: null };
        }

        const recentVolumes = volumes.slice(-period);
        const averageVolume = recentVolumes.reduce((sum, v) => sum + v, 0) / recentVolumes.length;
        const currentVolume = volumes[volumes.length - 1] || 0;
        const volumeRatio = averageVolume > 0 ? currentVolume / averageVolume : 0;

        const sufficient = volumeRatio >= this.settings.minVolumeRatio;

        return {
            sufficient,
            reason: sufficient 
                ? `Объем достаточен (${(volumeRatio * 100).toFixed(2)}% от среднего)`
                : `Объем недостаточен (${(volumeRatio * 100).toFixed(2)}% от среднего, минимум ${(this.settings.minVolumeRatio * 100)}%)`,
            ratio: volumeRatio,
            current: currentVolume,
            average: averageVolume
        };
    }

    /**
     * Анализ коррекции для лучшей цены входа
     */
    analyzeCorrection(candles, currentPrice, action) {
        if (candles.length < 5) {
            return { shouldWait: false, reason: 'Недостаточно данных', targetPrice: currentPrice, estimatedWaitTime: 0 };
        }

        // Анализируем последние 5 свечей для определения тренда
        const recentCandles = candles.slice(-5);
        const priceChanges = recentCandles.slice(1).map((c, i) => (c.close - recentCandles[i].close) / recentCandles[i].close);
        const avgChange = priceChanges.reduce((sum, change) => sum + change, 0) / priceChanges.length;

        let shouldWait = false;
        let targetPrice = currentPrice;
        let estimatedWaitTime = 0;

        if (action === 'BUY') {
            // Для покупки ждем, если цена растет (ожидаем коррекции вниз)
            if (avgChange > this.settings.correctionThreshold) {
                shouldWait = true;
                targetPrice = currentPrice * (1 - this.settings.correctionThreshold);
                estimatedWaitTime = Math.min(this.settings.maxWaitTime, 4 * 60 * 60 * 1000); // До 4 часов
            }
        } else if (action === 'SELL') {
            // Для продажи ждем, если цена падает (ожидаем коррекции вверх)
            if (avgChange < -this.settings.correctionThreshold) {
                shouldWait = true;
                targetPrice = currentPrice * (1 + this.settings.correctionThreshold);
                estimatedWaitTime = Math.min(this.settings.maxWaitTime, 4 * 60 * 60 * 1000); // До 4 часов
            }
        }

        return {
            shouldWait,
            reason: shouldWait 
                ? `Ожидание коррекции: цена ${action === 'BUY' ? 'растет' : 'падает'}, целевая цена ${targetPrice.toFixed(2)}`
                : 'Коррекция не требуется',
            targetPrice,
            estimatedWaitTime
        };
    }

    /**
     * Расчет скорректированной уверенности на основе индикаторов
     */
    calculateAdjustedConfidence(baseConfidence, confirmingIndicators, analysis) {
        let adjustedConfidence = baseConfidence;

        // Увеличиваем уверенность за каждый подтверждающий индикатор
        const indicatorBonus = (confirmingIndicators - 1) * 0.05; // +5% за каждый дополнительный индикатор
        adjustedConfidence = Math.min(1.0, baseConfidence + indicatorBonus);

        // Увеличиваем уверенность, если объем достаточен
        if (analysis.volume.sufficient) {
            adjustedConfidence = Math.min(1.0, adjustedConfidence + 0.03); // +3%
        }

        // Уменьшаем уверенность, если нужно ждать коррекции
        if (analysis.correction.shouldWait) {
            adjustedConfidence = Math.max(0.5, adjustedConfidence - 0.05); // -5%
        }

        return Math.round(adjustedConfidence * 100) / 100; // Округляем до 2 знаков
    }

    /**
     * Получение текущих настроек
     */
    getSettings() {
        return { ...this.settings };
    }

    /**
     * Обновление настроек
     */
    async updateSettings(newSettings) {
        try {
            this.settings = { ...this.settings, ...newSettings };
            
            // Сохраняем в базу данных
            for (const [key, value] of Object.entries(newSettings)) {
                await SettingsService.updateSetting(`entry_optimization.${key}`, value);
            }
            
            LoggerService.info('✅ Entry optimization settings updated');
            return true;
        } catch (error) {
            LoggerService.error('❌ Failed to update entry optimization settings:', error);
            throw error;
        }
    }
}

export default new EntryOptimizationService();

