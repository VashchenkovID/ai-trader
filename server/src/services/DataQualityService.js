import LoggerService from './LoggerService.js';

/**
 * Сервис для валидации и улучшения качества данных
 * 
 * Функциональность:
 * - Валидация свечей (проверка на NaN, Infinity, логические несоответствия)
 * - Детекция выбросов (outliers)
 * - Заполнение пропусков в данных
 * - Нормализация данных для разных источников
 */
class DataQualityService {
    constructor() {
        this.isInitialized = false;
        this.settings = {
            // Пороги для детекции выбросов
            outlierZScoreThreshold: 3.0, // Z-score > 3 считается выбросом
            outlierIQRMultiplier: 1.5, // IQR multiplier для детекции выбросов
            
            // Минимальные/максимальные значения для валидации
            minPrice: 0.01, // Минимальная цена
            maxPrice: 1000000, // Максимальная цена
            minVolume: 0, // Минимальный объем
            maxVolumeChange: 10, // Максимальное изменение объема (в разах)
            
            // Методы обработки
            gapFillMethod: 'linear', // 'linear', 'forward', 'backward', 'mean'
            outlierHandling: 'mark', // 'mark', 'remove', 'cap', 'ignore'
            
            // Включение/выключение проверок
            validateBeforeProcessing: true,
            detectOutliers: true,
            fillGaps: true,
            normalizeData: true
        };
    }

    async initialize() {
        try {
            LoggerService.info('🔍 Initializing Data Quality Service...');
            this.isInitialized = true;
            LoggerService.info('✅ Data Quality Service initialized');
        } catch (error) {
            LoggerService.error('❌ Failed to initialize Data Quality Service:', error);
            throw error;
        }
    }

    /**
     * Валидация свечей
     * @param {Array} candles - Массив свечей [{time, open, high, low, close, volume}, ...]
     * @returns {Object} - {valid: boolean, errors: Array, warnings: Array, cleanedCandles: Array}
     */
    validateCandles(candles) {
        if (!Array.isArray(candles) || candles.length === 0) {
            return {
                valid: false,
                errors: ['Empty or invalid candles array'],
                warnings: [],
                cleanedCandles: []
            };
        }

        const errors = [];
        const warnings = [];
        const cleanedCandles = [];
        let validCount = 0;

        for (let i = 0; i < candles.length; i++) {
            const candle = candles[i];
            const candleErrors = [];
            const candleWarnings = [];

            // Проверка наличия обязательных полей
            if (!candle.hasOwnProperty('open') || !candle.hasOwnProperty('high') || 
                !candle.hasOwnProperty('low') || !candle.hasOwnProperty('close')) {
                candleErrors.push(`Candle ${i}: Missing required fields (open, high, low, close)`);
            }

            // Проверка на NaN и Infinity
            const priceFields = ['open', 'high', 'low', 'close'];
            for (const field of priceFields) {
                if (candle[field] !== undefined) {
                    if (isNaN(candle[field]) || !isFinite(candle[field])) {
                        candleErrors.push(`Candle ${i}: ${field} is NaN or Infinity`);
                    }
                }
            }

            if (candle.volume !== undefined) {
                if (isNaN(candle.volume) || !isFinite(candle.volume)) {
                    candleErrors.push(`Candle ${i}: volume is NaN or Infinity`);
                }
            }

            // Проверка логических несоответствий
            if (candle.high !== undefined && candle.low !== undefined) {
                if (candle.high < candle.low) {
                    candleErrors.push(`Candle ${i}: high < low (${candle.high} < ${candle.low})`);
                }
            }

            if (candle.open !== undefined && candle.close !== undefined) {
                if (candle.open < candle.low || candle.open > candle.high) {
                    candleWarnings.push(`Candle ${i}: open is outside [low, high] range`);
                }
                if (candle.close < candle.low || candle.close > candle.high) {
                    candleWarnings.push(`Candle ${i}: close is outside [low, high] range`);
                }
            }

            // Проверка диапазонов значений
            for (const field of priceFields) {
                if (candle[field] !== undefined && isFinite(candle[field])) {
                    if (candle[field] < this.settings.minPrice) {
                        candleWarnings.push(`Candle ${i}: ${field} (${candle[field]}) is below minimum (${this.settings.minPrice})`);
                    }
                    if (candle[field] > this.settings.maxPrice) {
                        candleWarnings.push(`Candle ${i}: ${field} (${candle[field]}) is above maximum (${this.settings.maxPrice})`);
                    }
                }
            }

            if (candle.volume !== undefined && isFinite(candle.volume)) {
                if (candle.volume < this.settings.minVolume) {
                    candleWarnings.push(`Candle ${i}: volume (${candle.volume}) is below minimum`);
                }
            }

            // Проверка на аномальные изменения объема
            if (i > 0 && candles[i - 1].volume !== undefined && candle.volume !== undefined) {
                const volumeChange = Math.abs(candle.volume / (candles[i - 1].volume || 1));
                if (volumeChange > this.settings.maxVolumeChange) {
                    candleWarnings.push(`Candle ${i}: volume change (${volumeChange.toFixed(2)}x) exceeds threshold`);
                }
            }

            // Если нет критических ошибок, добавляем свечу
            if (candleErrors.length === 0) {
                cleanedCandles.push(candle);
                validCount++;
            } else {
                errors.push(...candleErrors);
            }

            if (candleWarnings.length > 0) {
                warnings.push(...candleWarnings);
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
            cleanedCandles,
            validCount,
            totalCount: candles.length,
            invalidCount: candles.length - validCount
        };
    }

    /**
     * Детекция выбросов
     * @param {Array} values - Массив числовых значений
     * @param {string} method - Метод детекции: 'zscore' или 'iqr'
     * @returns {Object} - {outliers: Array, indices: Array, stats: Object}
     */
    detectOutliers(values, method = 'iqr') {
        if (!Array.isArray(values) || values.length === 0) {
            return {
                outliers: [],
                indices: [],
                stats: {}
            };
        }

        // Фильтруем валидные значения
        const validValues = values
            .map((v, i) => ({ value: v, index: i }))
            .filter(item => isFinite(item.value) && !isNaN(item.value));

        if (validValues.length < 3) {
            return {
                outliers: [],
                indices: [],
                stats: {}
            };
        }

        const numericValues = validValues.map(item => item.value);
        const outliers = [];
        const outlierIndices = [];

        if (method === 'zscore') {
            // Z-score метод
            const mean = numericValues.reduce((sum, v) => sum + v, 0) / numericValues.length;
            const variance = numericValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / numericValues.length;
            const stdDev = Math.sqrt(variance);

            if (stdDev > 0) {
                for (const item of validValues) {
                    const zScore = Math.abs((item.value - mean) / stdDev);
                    if (zScore > this.settings.outlierZScoreThreshold) {
                        outliers.push(item.value);
                        outlierIndices.push(item.index);
                    }
                }
            }

            return {
                outliers,
                indices: outlierIndices,
                stats: {
                    method: 'zscore',
                    mean,
                    stdDev,
                    threshold: this.settings.outlierZScoreThreshold
                }
            };
        } else {
            // IQR (Interquartile Range) метод
            const sorted = [...numericValues].sort((a, b) => a - b);
            const q1Index = Math.floor(sorted.length * 0.25);
            const q3Index = Math.floor(sorted.length * 0.75);
            const q1 = sorted[q1Index];
            const q3 = sorted[q3Index];
            const iqr = q3 - q1;

            const lowerBound = q1 - this.settings.outlierIQRMultiplier * iqr;
            const upperBound = q3 + this.settings.outlierIQRMultiplier * iqr;

            for (const item of validValues) {
                if (item.value < lowerBound || item.value > upperBound) {
                    outliers.push(item.value);
                    outlierIndices.push(item.index);
                }
            }

            return {
                outliers,
                indices: outlierIndices,
                stats: {
                    method: 'iqr',
                    q1,
                    q3,
                    iqr,
                    lowerBound,
                    upperBound
                }
            };
        }
    }

    /**
     * Заполнение пропусков в данных
     * @param {Array} values - Массив значений (может содержать null, undefined, NaN)
     * @param {string} method - Метод заполнения: 'linear', 'forward', 'backward', 'mean'
     * @returns {Array} - Массив с заполненными пропусками
     */
    fillGaps(values, method = 'linear') {
        if (!Array.isArray(values) || values.length === 0) {
            return [];
        }

        const filled = [...values];
        const gaps = [];

        // Находим пропуски
        for (let i = 0; i < filled.length; i++) {
            if (filled[i] === null || filled[i] === undefined || isNaN(filled[i]) || !isFinite(filled[i])) {
                gaps.push(i);
            }
        }

        if (gaps.length === 0) {
            return filled;
        }

        switch (method) {
            case 'forward':
                // Forward fill: используем предыдущее значение
                for (const gapIndex of gaps) {
                    let fillValue = null;
                    for (let i = gapIndex - 1; i >= 0; i--) {
                        if (filled[i] !== null && filled[i] !== undefined && isFinite(filled[i])) {
                            fillValue = filled[i];
                            break;
                        }
                    }
                    filled[gapIndex] = fillValue !== null ? fillValue : 0;
                }
                break;

            case 'backward':
                // Backward fill: используем следующее значение
                for (const gapIndex of gaps) {
                    let fillValue = null;
                    for (let i = gapIndex + 1; i < filled.length; i++) {
                        if (filled[i] !== null && filled[i] !== undefined && isFinite(filled[i])) {
                            fillValue = filled[i];
                            break;
                        }
                    }
                    filled[gapIndex] = fillValue !== null ? fillValue : 0;
                }
                break;

            case 'mean':
                // Mean fill: используем среднее значение всех валидных значений
                const validValues = filled.filter(v => v !== null && v !== undefined && isFinite(v));
                const mean = validValues.length > 0 
                    ? validValues.reduce((sum, v) => sum + v, 0) / validValues.length 
                    : 0;
                for (const gapIndex of gaps) {
                    filled[gapIndex] = mean;
                }
                break;

            case 'linear':
            default:
                // Linear interpolation: линейная интерполяция между соседними валидными значениями
                for (const gapIndex of gaps) {
                    let leftValue = null;
                    let leftIndex = -1;
                    let rightValue = null;
                    let rightIndex = -1;

                    // Ищем ближайшее валидное значение слева
                    for (let i = gapIndex - 1; i >= 0; i--) {
                        if (filled[i] !== null && filled[i] !== undefined && isFinite(filled[i])) {
                            leftValue = filled[i];
                            leftIndex = i;
                            break;
                        }
                    }

                    // Ищем ближайшее валидное значение справа
                    for (let i = gapIndex + 1; i < filled.length; i++) {
                        if (filled[i] !== null && filled[i] !== undefined && isFinite(filled[i])) {
                            rightValue = filled[i];
                            rightIndex = i;
                            break;
                        }
                    }

                    // Линейная интерполяция
                    if (leftValue !== null && rightValue !== null) {
                        const ratio = (gapIndex - leftIndex) / (rightIndex - leftIndex);
                        filled[gapIndex] = leftValue + (rightValue - leftValue) * ratio;
                    } else if (leftValue !== null) {
                        filled[gapIndex] = leftValue; // Forward fill
                    } else if (rightValue !== null) {
                        filled[gapIndex] = rightValue; // Backward fill
                    } else {
                        filled[gapIndex] = 0; // Fallback
                    }
                }
                break;
        }

        return filled;
    }

    /**
     * Нормализация данных для разных источников
     * @param {Array} values - Массив значений для нормализации
     * @param {string} method - Метод нормализации: 'minmax', 'zscore', 'robust'
     * @returns {Object} - {normalized: Array, stats: Object}
     */
    normalizeData(values, method = 'minmax') {
        if (!Array.isArray(values) || values.length === 0) {
            return {
                normalized: [],
                stats: {}
            };
        }

        // Фильтруем валидные значения
        const validValues = values.filter(v => v !== null && v !== undefined && isFinite(v) && !isNaN(v));

        if (validValues.length === 0) {
            return {
                normalized: values.map(() => 0),
                stats: {}
            };
        }

        const normalized = [];
        let stats = {};

        switch (method) {
            case 'zscore':
                // Z-score нормализация: (x - mean) / std
                const mean = validValues.reduce((sum, v) => sum + v, 0) / validValues.length;
                const variance = validValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / validValues.length;
                const stdDev = Math.sqrt(variance);

                stats = { method: 'zscore', mean, stdDev };

                for (const value of values) {
                    if (value !== null && value !== undefined && isFinite(value) && !isNaN(value)) {
                        normalized.push(stdDev > 0 ? (value - mean) / stdDev : 0);
                    } else {
                        normalized.push(0);
                    }
                }
                break;

            case 'robust':
                // Robust нормализация: (x - median) / IQR
                const sorted = [...validValues].sort((a, b) => a - b);
                const median = sorted[Math.floor(sorted.length / 2)];
                const q1Index = Math.floor(sorted.length * 0.25);
                const q3Index = Math.floor(sorted.length * 0.75);
                const q1 = sorted[q1Index];
                const q3 = sorted[q3Index];
                const iqr = q3 - q1;

                stats = { method: 'robust', median, q1, q3, iqr };

                for (const value of values) {
                    if (value !== null && value !== undefined && isFinite(value) && !isNaN(value)) {
                        normalized.push(iqr > 0 ? (value - median) / iqr : 0);
                    } else {
                        normalized.push(0);
                    }
                }
                break;

            case 'minmax':
            default:
                // Min-Max нормализация: (x - min) / (max - min)
                const min = Math.min(...validValues);
                const max = Math.max(...validValues);
                const range = max - min;

                stats = { method: 'minmax', min, max, range };

                for (const value of values) {
                    if (value !== null && value !== undefined && isFinite(value) && !isNaN(value)) {
                        normalized.push(range > 0 ? (value - min) / range : 0);
                    } else {
                        normalized.push(0);
                    }
                }
                break;
        }

        return { normalized, stats };
    }

    /**
     * Безопасное деление с обработкой edge cases
     * @param {number} numerator - Числитель
     * @param {number} denominator - Знаменатель
     * @param {number} defaultValue - Значение по умолчанию при делении на ноль
     * @returns {number}
     */
    safeDivide(numerator, denominator, defaultValue = 0) {
        if (!isFinite(numerator) || isNaN(numerator)) {
            return defaultValue;
        }
        if (!isFinite(denominator) || isNaN(denominator) || denominator === 0) {
            return defaultValue;
        }
        return numerator / denominator;
    }

    /**
     * Очистка значения от NaN и Infinity
     * @param {number} value - Значение для очистки
     * @param {number} defaultValue - Значение по умолчанию
     * @returns {number}
     */
    cleanValue(value, defaultValue = 0) {
        if (value === null || value === undefined || isNaN(value) || !isFinite(value)) {
            return defaultValue;
        }
        return value;
    }

    /**
     * Полная обработка массива свечей
     * @param {Array} candles - Массив свечей
     * @returns {Object} - Обработанные свечи и статистика
     */
    processCandles(candles) {
        if (!this.settings.validateBeforeProcessing) {
            return {
                candles,
                validation: { valid: true },
                outliers: {},
                gaps: {}
            };
        }

        // 1. Валидация
        const validation = this.validateCandles(candles);
        let processedCandles = validation.cleanedCandles;

        // 2. Детекция выбросов (если включена)
        const outliers = {};
        if (this.settings.detectOutliers && processedCandles.length > 0) {
            const prices = processedCandles.map(c => c.close);
            outliers.prices = this.detectOutliers(prices, 'iqr');
            
            const volumes = processedCandles.map(c => c.volume || 0);
            outliers.volumes = this.detectOutliers(volumes, 'iqr');
        }

        // 3. Заполнение пропусков (если включено)
        if (this.settings.fillGaps && processedCandles.length > 0) {
            const priceFields = ['open', 'high', 'low', 'close'];
            for (const field of priceFields) {
                const values = processedCandles.map(c => c[field]);
                const filled = this.fillGaps(values, this.settings.gapFillMethod);
                for (let i = 0; i < processedCandles.length; i++) {
                    processedCandles[i][field] = filled[i];
                }
            }
        }

        return {
            candles: processedCandles,
            validation,
            outliers,
            processed: true
        };
    }

    /**
     * Winsorization - ограничение выбросов до заданных перцентилей
     * @param {Array} values - Массив значений
     * @param {number} lowerPercentile - Нижний перцентиль (по умолчанию 5)
     * @param {number} upperPercentile - Верхний перцентиль (по умолчанию 95)
     * @returns {Object} - Обработанные значения и статистика
     */
    winsorize(values, lowerPercentile = 5, upperPercentile = 95) {
        if (!Array.isArray(values) || values.length === 0) {
            return {
                values: [],
                stats: {
                    lowerBound: 0,
                    upperBound: 0,
                    cappedCount: 0
                }
            };
        }

        // Фильтруем валидные значения
        const validValues = values
            .map((v, i) => ({ value: v, index: i }))
            .filter(item => typeof item.value === 'number' && isFinite(item.value));

        if (validValues.length === 0) {
            return {
                values: [...values],
                stats: {
                    lowerBound: 0,
                    upperBound: 0,
                    cappedCount: 0
                }
            };
        }

        // Сортируем для вычисления перцентилей
        const sorted = [...validValues].sort((a, b) => a.value - b.value);
        
        const lowerIndex = Math.floor(sorted.length * (lowerPercentile / 100));
        const upperIndex = Math.floor(sorted.length * (upperPercentile / 100));
        
        const lowerBound = sorted[Math.max(0, lowerIndex)].value;
        const upperBound = sorted[Math.min(sorted.length - 1, upperIndex)].value;

        // Применяем Winsorization
        const winsorized = [...values];
        let cappedCount = 0;

        for (let i = 0; i < winsorized.length; i++) {
            const value = winsorized[i];
            if (typeof value === 'number' && isFinite(value)) {
                if (value < lowerBound) {
                    winsorized[i] = lowerBound;
                    cappedCount++;
                } else if (value > upperBound) {
                    winsorized[i] = upperBound;
                    cappedCount++;
                }
            }
        }

        return {
            values: winsorized,
            stats: {
                lowerBound,
                upperBound,
                lowerPercentile,
                upperPercentile,
                cappedCount,
                totalValues: values.length
            }
        };
    }

    /**
     * Обработка выбросов в свечах с использованием Winsorization
     * @param {Array} candles - Массив свечей
     * @param {Object} options - Опции обработки
     * @returns {Object} - Обработанные свечи и статистика
     */
    processOutliers(candles, options = {}) {
        const {
            method = 'winsorize', // 'winsorize', 'remove', 'mark'
            lowerPercentile = 5,
            upperPercentile = 95,
            fields = ['close', 'volume'] // Поля для обработки
        } = options;

        if (!Array.isArray(candles) || candles.length === 0) {
            return {
                candles: [],
                stats: {}
            };
        }

        const processed = candles.map(c => ({ ...c }));
        const stats = {};

        for (const field of fields) {
            const values = processed.map(c => c[field]);
            
            if (method === 'winsorize') {
                const result = this.winsorize(values, lowerPercentile, upperPercentile);
                for (let i = 0; i < processed.length; i++) {
                    processed[i][field] = result.values[i];
                }
                stats[field] = result.stats;
            } else if (method === 'remove') {
                // Удаляем свечи с выбросами
                const outliers = this.detectOutliers(values, 'iqr');
                const validIndices = new Set(
                    Array.from({ length: values.length }, (_, i) => i)
                        .filter(i => !outliers.indices.includes(i))
                );
                return {
                    candles: processed.filter((_, i) => validIndices.has(i)),
                    stats: {
                        removed: processed.length - validIndices.size,
                        field
                    }
                };
            } else if (method === 'mark') {
                // Добавляем флаг isOutlier
                const outliers = this.detectOutliers(values, 'iqr');
                for (let i = 0; i < processed.length; i++) {
                    processed[i][`${field}_isOutlier`] = outliers.indices.includes(i);
                }
                stats[field] = {
                    outliersCount: outliers.outliers.length
                };
            }
        }

        return {
            candles: processed,
            stats
        };
    }

    /**
     * Получение настроек
     */
    getSettings() {
        return { ...this.settings };
    }

    /**
     * Обновление настроек
     */
    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
    }
}

export default new DataQualityService();

