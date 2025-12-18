import CorrelationService from './CorrelationService.js';
import CacheService from './CacheService.js';
import CachedCandle from '../models/CachedCandle.js';
import Settings from '../models/Settings.js';

/**
 * Сервис для оптимизации портфеля
 * 
 * Реализует современные методы оптимизации:
 * - Mean-Variance Optimization (Markowitz)
 * - Black-Litterman Model
 * - Risk Parity
 * 
 * Основные функции:
 * - Расчет матрицы ковариаций из корреляций и волатильностей
 * - Расчет ожидаемых доходностей (исторические, AI прогнозы, blended)
 * - Оптимизация распределения капитала между инструментами
 * - Генерация эффективной границы (Efficient Frontier)
 */
class PortfolioOptimizer {
    constructor() {
        this.isInitialized = false;
        this.settings = {
            defaultPeriod: 30, // Период для расчета исторических данных (дни)
            minDataPoints: 20, // Минимальное количество точек данных
            riskFreeRate: 0.08, // Безрисковая ставка (8% годовых)
            defaultRiskAversion: 3.0, // Коэффициент неприятия риска по умолчанию
            tau: 0.05, // Масштабирующий параметр для Black-Litterman
            regularizationFactor: 0.01 // Фактор регуляризации для матрицы ковариаций
        };
        
        // Кеш для матриц (чтобы не пересчитывать каждый раз)
        this.covarianceMatrixCache = new Map();
        this.correlationMatrixCache = new Map();
        this.expectedReturnsCache = new Map();
        
        // Мониторинг производительности
        this.performanceMetrics = {
            optimizationCount: 0,
            totalOptimizationTime: 0,
            averageOptimizationTime: 0,
            lastOptimizationTime: null,
            errors: []
        };
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        try {
            console.log('🚀 Инициализация PortfolioOptimizer...');
            
            // Убеждаемся, что зависимые сервисы инициализированы
            if (!CorrelationService.isInitialized) {
                await CorrelationService.initialize();
            }
            
            if (!CacheService.isInitialized) {
                await CacheService.initialize();
            }
            
            // Загружаем настройки
            await this.loadSettings();
            
            this.isInitialized = true;
            console.log('✅ PortfolioOptimizer инициализирован');
            
        } catch (error) {
            console.error('❌ Ошибка инициализации PortfolioOptimizer:', error);
            throw error;
        }
    }

    /**
     * Загрузка настроек из БД
     */
    async loadSettings() {
        try {
            this.settings = {
                defaultPeriod: await Settings.getSetting('portfolio_optimizer_period', 30),
                minDataPoints: await Settings.getSetting('portfolio_optimizer_min_data_points', 20),
                riskFreeRate: await Settings.getSetting('portfolio_optimizer_risk_free_rate', 0.08),
                defaultRiskAversion: await Settings.getSetting('portfolio_optimizer_risk_aversion', 3.0),
                tau: await Settings.getSetting('portfolio_optimizer_tau', 0.05),
                regularizationFactor: await Settings.getSetting('portfolio_optimizer_regularization', 0.01)
            };
        } catch (error) {
            console.warn('⚠️ Ошибка загрузки настроек PortfolioOptimizer, используем значения по умолчанию:', error.message);
        }
    }

    /**
     * Расчет матрицы ковариаций из корреляций и волатильностей
     * 
     * Формула: Cov(i,j) = Corr(i,j) * Vol(i) * Vol(j)
     * 
     * @param {Array} instruments - Массив инструментов с полями {figi, volatility}
     * @param {Object} correlationMatrix - Матрица корреляций {figi1: {figi2: correlation, ...}, ...}
     * @returns {Object} Матрица ковариаций {figi1: {figi2: covariance, ...}, ...}
     */
    calculateCovarianceMatrix(instruments, correlationMatrix) {
        if (!this.isInitialized) {
            throw new Error('PortfolioOptimizer не инициализирован');
        }

        if (!instruments || !Array.isArray(instruments) || instruments.length === 0) {
            throw new Error('Необходимо предоставить массив инструментов');
        }

        if (!correlationMatrix || typeof correlationMatrix !== 'object') {
            throw new Error('Необходимо предоставить матрицу корреляций');
        }

        // Создаем карту волатильностей для быстрого доступа
        const volatilityMap = new Map();
        for (const instrument of instruments) {
            if (!instrument.figi) {
                console.warn('⚠️ Инструмент без FIGI пропущен');
                continue;
            }
            
            const volatility = instrument.volatility || 0;
            if (volatility <= 0 || !isFinite(volatility)) {
                console.warn(`⚠️ Некорректная волатильность для ${instrument.figi}: ${volatility}`);
                volatilityMap.set(instrument.figi, 0);
            } else {
                volatilityMap.set(instrument.figi, volatility);
            }
        }

        // Создаем матрицу ковариаций
        const covarianceMatrix = {};
        const figis = Array.from(volatilityMap.keys());

        for (const figi1 of figis) {
            covarianceMatrix[figi1] = {};
            const vol1 = volatilityMap.get(figi1);

            for (const figi2 of figis) {
                const vol2 = volatilityMap.get(figi2);

                if (figi1 === figi2) {
                    // Диагональ: ковариация инструмента с самим собой = дисперсия = volatility^2
                    covarianceMatrix[figi1][figi2] = vol1 * vol1;
                } else {
                    // Получаем корреляцию (проверяем оба направления)
                    let correlation = 0;
                    if (correlationMatrix[figi1] && correlationMatrix[figi1][figi2] !== undefined) {
                        correlation = correlationMatrix[figi1][figi2];
                    } else if (correlationMatrix[figi2] && correlationMatrix[figi2][figi1] !== undefined) {
                        correlation = correlationMatrix[figi2][figi1];
                    }

                    // Проверяем валидность корреляции
                    if (!isFinite(correlation) || correlation < -1 || correlation > 1) {
                        correlation = 0;
                    }

                    // Ковариация = корреляция * волатильность1 * волатильность2
                    covarianceMatrix[figi1][figi2] = correlation * vol1 * vol2;
                }
            }
        }

        // Применяем регуляризацию для улучшения обусловленности матрицы
        const regularizationFactor = this.settings.regularizationFactor;
        for (const figi1 of figis) {
            for (const figi2 of figis) {
                if (figi1 === figi2) {
                    // Добавляем небольшое значение к диагонали
                    covarianceMatrix[figi1][figi2] += regularizationFactor * volatilityMap.get(figi1) * volatilityMap.get(figi1);
                }
            }
        }

        return covarianceMatrix;
    }

    /**
     * Расчет ожидаемых доходностей инструментов
     * 
     * @param {Array} instruments - Массив инструментов с полями {figi, ticker}
     * @param {string} method - Метод расчета: 'historical', 'ai_forecast', 'blended'
     * @param {Object} options - Дополнительные опции
     * @returns {Promise<Object>} Объект {figi: expectedReturn}
     */
    async calculateExpectedReturns(instruments, method = 'historical', options = {}) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (!instruments || !Array.isArray(instruments) || instruments.length === 0) {
            throw new Error('Необходимо предоставить массив инструментов');
        }

        const period = options.period || this.settings.defaultPeriod;
        const cacheKey = `${method}_${period}_${instruments.map(i => i.figi).sort().join(',')}`;

        // Проверяем кеш
        if (this.expectedReturnsCache.has(cacheKey)) {
            const cached = this.expectedReturnsCache.get(cacheKey);
            // Кеш действителен 1 час
            if (Date.now() - cached.timestamp < 60 * 60 * 1000) {
                return cached.data;
            }
        }

        let expectedReturns = {};

        switch (method) {
            case 'historical':
                expectedReturns = await this._calculateHistoricalReturns(instruments, period);
                break;
            
            case 'ai_forecast':
                expectedReturns = await this._calculateAIForecastReturns(instruments);
                break;
            
            case 'blended':
                expectedReturns = await this._calculateBlendedReturns(instruments, period, options);
                break;
            
            default:
                throw new Error(`Неизвестный метод расчета доходностей: ${method}`);
        }

        // Сохраняем в кеш
        this.expectedReturnsCache.set(cacheKey, {
            data: expectedReturns,
            timestamp: Date.now()
        });

        return expectedReturns;
    }

    /**
     * Расчет ожидаемых доходностей на основе исторических данных
     * 
     * @private
     * @param {Array} instruments - Массив инструментов
     * @param {number} period - Период в днях
     * @returns {Promise<Object>} Объект {figi: expectedReturn}
     */
    async _calculateHistoricalReturns(instruments, period) {
        const expectedReturns = {};
        const annualizationFactor = 252; // Торговых дней в году

        for (const instrument of instruments) {
            try {
                if (!instrument.figi) {
                    continue;
                }

                // Получаем исторические свечи
                const candles = await CacheService.getCandles(instrument.figi, 'DAY', period + 10);
                
                if (!candles || candles.length < this.settings.minDataPoints) {
                    console.warn(`⚠️ Недостаточно данных для расчета доходности ${instrument.figi}`);
                    expectedReturns[instrument.figi] = 0;
                    continue;
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

                if (returns.length < this.settings.minDataPoints) {
                    console.warn(`⚠️ Недостаточно доходностей для ${instrument.figi}`);
                    expectedReturns[instrument.figi] = 0;
                    continue;
                }

                // Средняя дневная доходность
                const meanDailyReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
                
                // Годовая ожидаемая доходность (простая экстраполяция)
                const annualizedReturn = meanDailyReturn * annualizationFactor;
                
                // Конвертируем в проценты
                expectedReturns[instrument.figi] = annualizedReturn * 100;

            } catch (error) {
                console.warn(`⚠️ Ошибка расчета исторической доходности для ${instrument.figi}:`, error.message);
                expectedReturns[instrument.figi] = 0;
            }
        }

        return expectedReturns;
    }

    /**
     * Расчет ожидаемых доходностей на основе прогнозов AI
     * 
     * @private
     * @param {Array} instruments - Массив инструментов
     * @returns {Promise<Object>} Объект {figi: expectedReturn}
     */
    async _calculateAIForecastReturns(instruments) {
        const expectedReturns = {};
        const Recommendation = (await import('../models/Recommendation.js')).default;
        const { Op } = await import('sequelize');

        // Получаем последние рекомендации для каждого инструмента
        for (const instrument of instruments) {
            try {
                if (!instrument.figi) {
                    continue;
                }

                // Получаем последнюю активную рекомендацию
                const recommendation = await Recommendation.findOne({
                    where: {
                        figi: instrument.figi,
                        isActive: true
                    },
                    order: [['analysisDate', 'DESC']]
                });

                if (!recommendation) {
                    // Если нет рекомендации, используем 0 или историческую доходность
                    expectedReturns[instrument.figi] = 0;
                    continue;
                }

                // Используем прогноз из рекомендации
                // recommendation может быть: 'BUY', 'SELL', 'HOLD'
                // confidence и score для взвешивания
                let forecastReturn = 0;

                if (recommendation.recommendation === 'BUY') {
                    // Для BUY используем положительную ожидаемую доходность
                    // Базовая доходность * confidence * score
                    const baseReturn = 0.15; // 15% годовых как базовая ожидаемая доходность для BUY
                    forecastReturn = baseReturn * (recommendation.confidence || 0.5) * (recommendation.score || 0.5);
                } else if (recommendation.recommendation === 'SELL') {
                    // Для SELL используем отрицательную ожидаемую доходность
                    const baseReturn = -0.10; // -10% годовых
                    forecastReturn = baseReturn * (recommendation.confidence || 0.5) * (recommendation.score || 0.5);
                } else {
                    // Для HOLD используем небольшую доходность или 0
                    forecastReturn = 0;
                }

                // Конвертируем в проценты
                expectedReturns[instrument.figi] = forecastReturn * 100;

            } catch (error) {
                console.warn(`⚠️ Ошибка расчета AI доходности для ${instrument.figi}:`, error.message);
                expectedReturns[instrument.figi] = 0;
            }
        }

        return expectedReturns;
    }

    /**
     * Расчет blended ожидаемых доходностей (комбинация исторических и AI прогнозов)
     * 
     * @private
     * @param {Array} instruments - Массив инструментов
     * @param {number} period - Период для исторических данных
     * @param {Object} options - Опции {historicalWeight: 0.5, aiWeight: 0.5}
     * @returns {Promise<Object>} Объект {figi: expectedReturn}
     */
    async _calculateBlendedReturns(instruments, period, options = {}) {
        const historicalWeight = options.historicalWeight || 0.5;
        const aiWeight = options.aiWeight || 0.5;

        // Рассчитываем оба типа доходностей
        const historicalReturns = await this._calculateHistoricalReturns(instruments, period);
        const aiReturns = await this._calculateAIForecastReturns(instruments);

        // Объединяем с весами
        const blendedReturns = {};
        for (const instrument of instruments) {
            if (!instrument.figi) {
                continue;
            }

            const historical = historicalReturns[instrument.figi] || 0;
            const ai = aiReturns[instrument.figi] || 0;

            // Взвешенное среднее
            blendedReturns[instrument.figi] = historicalWeight * historical + aiWeight * ai;
        }

        return blendedReturns;
    }

    /**
     * Получение матрицы корреляций для списка инструментов
     * 
     * @param {Array} instruments - Массив инструментов с полями {figi}
     * @param {number} period - Период расчета в днях
     * @returns {Promise<Object>} Матрица корреляций {figi1: {figi2: correlation, ...}, ...}
     */
    async getCorrelationMatrix(instruments, period = null) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (!instruments || !Array.isArray(instruments) || instruments.length === 0) {
            throw new Error('Необходимо предоставить массив инструментов');
        }

        const calcPeriod = period || this.settings.defaultPeriod;
        const figis = instruments.map(i => i.figi).filter(Boolean).sort();
        const cacheKey = `${calcPeriod}_${figis.join(',')}`;

        // Проверяем кеш
        if (this.correlationMatrixCache.has(cacheKey)) {
            const cached = this.correlationMatrixCache.get(cacheKey);
            // Кеш действителен 1 час
            if (Date.now() - cached.timestamp < 60 * 60 * 1000) {
                return cached.data;
            }
        }

        // Используем CorrelationService для получения матрицы
        const correlationMatrix = await CorrelationService.getCorrelationMatrix(figis, calcPeriod);

        // Сохраняем в кеш
        this.correlationMatrixCache.set(cacheKey, {
            data: correlationMatrix,
            timestamp: Date.now()
        });

        return correlationMatrix;
    }

    /**
     * Расчет волатильности инструмента на основе исторических данных
     * 
     * @param {string} figi - FIGI инструмента
     * @param {number} period - Период расчета в днях
     * @returns {Promise<number>} Волатильность (стандартное отклонение доходностей) в процентах
     */
    async calculateVolatility(figi, period = null) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        const calcPeriod = period || this.settings.defaultPeriod;

        try {
            // Получаем исторические свечи
            const candles = await CacheService.getCandles(figi, 'DAY', calcPeriod + 10);
            
            if (!candles || candles.length < this.settings.minDataPoints) {
                console.warn(`⚠️ Недостаточно данных для расчета волатильности ${figi}`);
                return 0;
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

            if (returns.length < this.settings.minDataPoints) {
                console.warn(`⚠️ Недостаточно доходностей для расчета волатильности ${figi}`);
                return 0;
            }

            // Средняя доходность
            const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;

            // Дисперсия
            const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length;

            // Стандартное отклонение (волатильность)
            const volatility = Math.sqrt(variance);

            // Годовая волатильность (умножаем на корень из количества торговых дней)
            const annualizedVolatility = volatility * Math.sqrt(252);

            // Конвертируем в проценты
            return annualizedVolatility * 100;

        } catch (error) {
            console.warn(`⚠️ Ошибка расчета волатильности для ${figi}:`, error.message);
            return 0;
        }
    }

    /**
     * Получение волатильностей для списка инструментов
     * 
     * @param {Array} instruments - Массив инструментов с полями {figi}
     * @param {number} period - Период расчета в днях
     * @returns {Promise<Object>} Объект {figi: volatility}
     */
    async getVolatilities(instruments, period = null) {
        const volatilities = {};

        // Рассчитываем волатильности параллельно для всех инструментов
        const promises = instruments.map(async (instrument) => {
            if (!instrument.figi) {
                return null;
            }

            const volatility = await this.calculateVolatility(instrument.figi, period);
            return { figi: instrument.figi, volatility };
        });

        const results = await Promise.all(promises);

        for (const result of results) {
            if (result) {
                volatilities[result.figi] = result.volatility;
            }
        }

        return volatilities;
    }

    /**
     * Очистка кеша
     */
    clearCache() {
        this.covarianceMatrixCache.clear();
        this.correlationMatrixCache.clear();
        this.expectedReturnsCache.clear();
        console.log('✅ Кеш PortfolioOptimizer очищен');
    }

    /**
     * Проекция весов на ограничения
     * 
     * @private
     * @param {Array<number>} weights - Вектор весов
     * @param {Object} constraints - Ограничения
     * @returns {Array<number>} Проецированные веса
     */
    _projectWeights(weights, constraints) {
        const n = weights.length;
        const projected = [...weights];

        // 1. Применяем ограничения на отдельные позиции
        for (let i = 0; i < n; i++) {
            // Long-only: w_i >= 0
            if (projected[i] < 0) {
                projected[i] = 0;
            }

            // Максимальный размер позиции
            if (constraints.maxPositionSize !== undefined && projected[i] > constraints.maxPositionSize) {
                projected[i] = constraints.maxPositionSize;
            }

            // Минимальный размер позиции
            if (constraints.minPositionSize !== undefined && projected[i] > 0 && projected[i] < constraints.minPositionSize) {
                projected[i] = 0; // Если меньше минимума, обнуляем
            }
        }

        // 2. Нормализуем так, чтобы сумма была равна 1
        const sum = projected.reduce((s, w) => s + w, 0);
        if (sum > 0) {
            for (let i = 0; i < n; i++) {
                projected[i] = projected[i] / sum;
            }
        } else {
            // Если все веса нулевые, используем равномерное распределение
            const equalWeight = 1.0 / n;
            for (let i = 0; i < n; i++) {
                projected[i] = equalWeight;
            }
        }

        // 3. Применяем ограничения на секторы (если есть информация о секторах)
        if (constraints.maxSectorExposure !== undefined && constraints.instruments) {
            const sectorWeights = {};
            for (let i = 0; i < n; i++) {
                const sector = constraints.instruments[i]?.sector || 'Unknown';
                sectorWeights[sector] = (sectorWeights[sector] || 0) + projected[i];
            }

            // Если какой-то сектор превышает лимит, уменьшаем веса
            for (const [sector, weight] of Object.entries(sectorWeights)) {
                if (weight > constraints.maxSectorExposure) {
                    const scale = constraints.maxSectorExposure / weight;
                    for (let i = 0; i < n; i++) {
                        if ((constraints.instruments[i]?.sector || 'Unknown') === sector) {
                            projected[i] *= scale;
                        }
                    }
                }
            }

            // Снова нормализуем
            const sumAfter = projected.reduce((s, w) => s + w, 0);
            if (sumAfter > 0) {
                for (let i = 0; i < n; i++) {
                    projected[i] = projected[i] / sumAfter;
                }
            }
        }

        // 4. Ограничение на количество позиций
        if (constraints.maxPositions !== undefined && constraints.maxPositions < n) {
            // Оставляем только топ-N позиций по весу
            const indexed = projected.map((w, i) => ({ weight: w, index: i }));
            indexed.sort((a, b) => b.weight - a.weight);
            
            const newWeights = new Array(n).fill(0);
            let sumTop = 0;
            for (let i = 0; i < constraints.maxPositions; i++) {
                newWeights[indexed[i].index] = indexed[i].weight;
                sumTop += indexed[i].weight;
            }

            // Нормализуем топ позиции
            if (sumTop > 0) {
                for (let i = 0; i < n; i++) {
                    projected[i] = newWeights[i] / sumTop;
                }
            }
        }

        return projected;
    }

    /**
     * Простой градиентный спуск с проекцией для решения QP задачи
     * 
     * @private
     * @param {Array<number>} expectedReturns - Вектор ожидаемых доходностей
     * @param {Object} covarianceMatrix - Матрица ковариаций
     * @param {Object} constraints - Ограничения
     * @param {number} riskAversion - Коэффициент неприятия риска
     * @param {number} targetReturn - Целевая доходность (опционально)
     * @returns {Object} {weights, iterations, converged}
     */
    _solveQuadraticProgram(expectedReturns, covarianceMatrix, constraints, riskAversion, targetReturn = null) {
        const n = expectedReturns.length;
        const figis = Object.keys(covarianceMatrix);
        
        if (figis.length !== n) {
            throw new Error('Размерность вектора доходностей не совпадает с размерностью матрицы ковариаций');
        }

        // Инициализация: равномерное распределение
        let weights = new Array(n).fill(1.0 / n);
        const maxIterations = 1000;
        const tolerance = 1e-6;
        const learningRate = 0.01;

        for (let iteration = 0; iteration < maxIterations; iteration++) {
            // Вычисляем градиент целевой функции
            // Для maximize: μ^T * w - (λ/2) * w^T * Σ * w
            // Градиент: μ - λ * Σ * w
            const gradient = new Array(n).fill(0);

            // Вычисляем Σ * w
            const sigmaW = new Array(n).fill(0);
            for (let i = 0; i < n; i++) {
                for (let j = 0; j < n; j++) {
                    sigmaW[i] += covarianceMatrix[figis[i]][figis[j]] * weights[j];
                }
            }

            // Вычисляем градиент
            for (let i = 0; i < n; i++) {
                gradient[i] = expectedReturns[i] - riskAversion * sigmaW[i];
            }

            // Если задана целевая доходность, добавляем штраф за отклонение
            if (targetReturn !== null) {
                const currentReturn = expectedReturns.reduce((sum, r, i) => sum + r * weights[i], 0);
                const returnDiff = currentReturn - targetReturn;
                
                // Если доходность ниже целевой, увеличиваем градиент
                if (returnDiff < 0) {
                    for (let i = 0; i < n; i++) {
                        gradient[i] += 10 * expectedReturns[i] * Math.abs(returnDiff);
                    }
                }
            }

            // Обновляем веса: w_new = w_old + learningRate * gradient
            const newWeights = weights.map((w, i) => w + learningRate * gradient[i]);

            // Проецируем на ограничения
            const projectedWeights = this._projectWeights(newWeights, constraints);

            // Проверяем сходимость
            let maxChange = 0;
            for (let i = 0; i < n; i++) {
                const change = Math.abs(projectedWeights[i] - weights[i]);
                if (change > maxChange) {
                    maxChange = change;
                }
            }

            weights = projectedWeights;

            if (maxChange < tolerance) {
                return {
                    weights: weights.reduce((obj, w, i) => {
                        obj[figis[i]] = w;
                        return obj;
                    }, {}),
                    iterations: iteration + 1,
                    converged: true
                };
            }
        }

        // Если не сошлось, возвращаем последний результат
        return {
            weights: weights.reduce((obj, w, i) => {
                obj[figis[i]] = w;
                return obj;
            }, {}),
            iterations: maxIterations,
            converged: false
        };
    }

    /**
     * Применение ограничений к весам портфеля
     * 
     * @param {Object} weights - Объект {figi: weight}
     * @param {Object} constraints - Ограничения
     * @returns {Object} Веса с примененными ограничениями
     */
    applyConstraints(weights, constraints) {
        if (!weights || typeof weights !== 'object') {
            throw new Error('Необходимо предоставить объект весов');
        }

        const figis = Object.keys(weights);
        const weightsArray = figis.map(figi => weights[figi]);
        
        const projectedArray = this._projectWeights(weightsArray, {
            ...constraints,
            instruments: constraints.instruments || figis.map(figi => ({ figi }))
        });

        const result = {};
        for (let i = 0; i < figis.length; i++) {
            result[figis[i]] = projectedArray[i];
        }

        return result;
    }

    /**
     * Mean-Variance Optimization (Markowitz)
     * 
     * @param {Object} options - Параметры оптимизации
     * @returns {Promise<Object>} Результат оптимизации
     */
    async meanVarianceOptimization(options = {}) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        const {
            instruments,
            correlationMatrix,
            totalCapital = 1000000,
            riskFreeRate = null,
            targetReturn = null,
            maxPositionSize = 0.1,
            minPositionSize = 0.01,
            constraints = {}
        } = options;

        if (!instruments || !Array.isArray(instruments) || instruments.length === 0) {
            throw new Error('Необходимо предоставить массив инструментов');
        }

        if (!correlationMatrix || typeof correlationMatrix !== 'object') {
            throw new Error('Необходимо предоставить матрицу корреляций');
        }

        const warnings = [];

        try {
            // 1. Получаем ожидаемые доходности
            const expectedReturnsMethod = options.expectedReturnsMethod || 'historical';
            const expectedReturnsObj = await this.calculateExpectedReturns(instruments, expectedReturnsMethod);
            
            // Конвертируем в массив в порядке инструментов
            const figis = instruments.map(i => i.figi);
            const expectedReturns = figis.map(figi => (expectedReturnsObj[figi] || 0) / 100); // Конвертируем из процентов

            // 2. Получаем волатильности
            const volatilitiesObj = await this.getVolatilities(instruments);
            const volatilities = figis.map(figi => (volatilitiesObj[figi] || 0) / 100); // Конвертируем из процентов

            // 3. Обновляем инструменты с волатильностями
            const instrumentsWithVol = instruments.map((inst, i) => ({
                ...inst,
                volatility: volatilities[i],
                expectedReturn: expectedReturns[i]
            }));

            // 4. Рассчитываем матрицу ковариаций
            const covarianceMatrix = this.calculateCovarianceMatrix(instrumentsWithVol, correlationMatrix);

            // 5. Настройки ограничений
            const calcRiskFreeRate = riskFreeRate !== null ? riskFreeRate : this.settings.riskFreeRate;
            const riskAversion = options.riskAversion || this.settings.defaultRiskAversion;
            
            const optimizationConstraints = {
                maxPositionSize: constraints.maxPositionSize || maxPositionSize,
                minPositionSize: constraints.minPositionSize || minPositionSize,
                maxSectorExposure: constraints.maxSectorExposure,
                maxPositions: constraints.maxPositions || instruments.length,
                instruments: instrumentsWithVol
            };

            // 6. Решаем задачу оптимизации
            const solution = this._solveQuadraticProgram(
                expectedReturns,
                covarianceMatrix,
                optimizationConstraints,
                riskAversion,
                targetReturn ? targetReturn / 100 : null // Конвертируем из процентов
            );

            if (!solution.converged) {
                warnings.push('Оптимизация не сошлась за максимальное количество итераций');
            }

            // 7. Рассчитываем метрики портфеля
            const portfolioWeights = solution.weights;
            const weightsArray = figis.map(figi => portfolioWeights[figi] || 0);

            // Ожидаемая доходность портфеля: μ^T * w
            const portfolioReturn = expectedReturns.reduce((sum, r, i) => sum + r * weightsArray[i], 0);

            // Волатильность портфеля: sqrt(w^T * Σ * w)
            let portfolioVariance = 0;
            for (let i = 0; i < figis.length; i++) {
                for (let j = 0; j < figis.length; j++) {
                    portfolioVariance += weightsArray[i] * covarianceMatrix[figis[i]][figis[j]] * weightsArray[j];
                }
            }
            const portfolioVolatility = Math.sqrt(portfolioVariance);

            // Sharpe Ratio: (return - riskFreeRate) / volatility
            const sharpeRatio = portfolioVolatility > 0 
                ? (portfolioReturn - calcRiskFreeRate) / portfolioVolatility 
                : 0;

            // 8. Генерируем эффективную границу (если запрошено)
            let efficientFrontier = [];
            if (options.generateFrontier) {
                efficientFrontier = await this.generateEfficientFrontier(
                    instrumentsWithVol,
                    correlationMatrix,
                    options.frontierSteps || 20
                );
            }

            const duration = Date.now() - startTime;
            
            // Обновляем метрики производительности
            this.performanceMetrics.optimizationCount++;
            this.performanceMetrics.totalOptimizationTime += duration;
            this.performanceMetrics.averageOptimizationTime = 
                this.performanceMetrics.totalOptimizationTime / this.performanceMetrics.optimizationCount;
            this.performanceMetrics.lastOptimizationTime = duration;

            return {
                weights: portfolioWeights,
                expectedReturn: portfolioReturn * 100, // Конвертируем обратно в проценты
                portfolioVolatility: portfolioVolatility * 100, // Конвертируем обратно в проценты
                sharpeRatio: sharpeRatio,
                optimizationMethod: 'mean_variance',
                constraints: optimizationConstraints,
                warnings: warnings,
                iterations: solution.iterations,
                converged: solution.converged,
                efficientFrontier: efficientFrontier,
                riskFreeRate: calcRiskFreeRate * 100,
                riskAversion: riskAversion,
                executionTime: duration // Время выполнения в миллисекундах
            };

        } catch (error) {
            const duration = Date.now() - startTime;
            
            // Сохраняем ошибку в метриках
            this.performanceMetrics.errors.push({
                method: 'mean_variance',
                error: error.message,
                timestamp: new Date(),
                duration: duration
            });

            // Ограничиваем размер массива ошибок
            if (this.performanceMetrics.errors.length > 100) {
                this.performanceMetrics.errors.shift();
            }

            console.error('❌ Ошибка Mean-Variance оптимизации:', error);
            throw error;
        }
    }

    /**
     * Генерация эффективной границы (Efficient Frontier)
     * 
     * @param {Array} instruments - Массив инструментов с волатильностями
     * @param {Object} correlationMatrix - Матрица корреляций
     * @param {number} steps - Количество точек на границе
     * @returns {Promise<Array>} Массив точек {return, risk, sharpe, weights}
     */
    async generateEfficientFrontier(instruments, correlationMatrix, steps = 20) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        try {
            // Получаем ожидаемые доходности
            const expectedReturnsObj = await this.calculateExpectedReturns(instruments, 'historical');
            const figis = instruments.map(i => i.figi);
            const expectedReturns = figis.map(figi => (expectedReturnsObj[figi] || 0) / 100);

            // Получаем волатильности
            const volatilitiesObj = await this.getVolatilities(instruments);
            const volatilities = figis.map(figi => (volatilitiesObj[figi] || 0) / 100);

            const instrumentsWithVol = instruments.map((inst, i) => ({
                ...inst,
                volatility: volatilities[i]
            }));

            // Рассчитываем матрицу ковариаций
            const covarianceMatrix = this.calculateCovarianceMatrix(instrumentsWithVol, correlationMatrix);

            // Находим минимальную и максимальную ожидаемую доходность
            const minReturn = Math.min(...expectedReturns);
            const maxReturn = Math.max(...expectedReturns);
            const returnRange = maxReturn - minReturn;

            const frontier = [];
            const riskFreeRate = this.settings.riskFreeRate;

            // Генерируем точки для разных целевых доходностей
            for (let i = 0; i < steps; i++) {
                const targetReturn = minReturn + (returnRange * i) / (steps - 1);

                try {
                    const solution = this._solveQuadraticProgram(
                        expectedReturns,
                        covarianceMatrix,
                        {
                            maxPositionSize: 0.1,
                            minPositionSize: 0.01,
                            maxPositions: instruments.length,
                            instruments: instrumentsWithVol
                        },
                        this.settings.defaultRiskAversion,
                        targetReturn
                    );

                    const weightsArray = figis.map(figi => solution.weights[figi] || 0);

                    // Рассчитываем риск портфеля
                    let portfolioVariance = 0;
                    for (let i = 0; i < figis.length; i++) {
                        for (let j = 0; j < figis.length; j++) {
                            portfolioVariance += weightsArray[i] * covarianceMatrix[figis[i]][figis[j]] * weightsArray[j];
                        }
                    }
                    const portfolioRisk = Math.sqrt(portfolioVariance);

                    // Рассчитываем Sharpe Ratio
                    const sharpeRatio = portfolioRisk > 0 
                        ? (targetReturn - riskFreeRate) / portfolioRisk 
                        : 0;

                    frontier.push({
                        return: targetReturn * 100, // Конвертируем в проценты
                        risk: portfolioRisk * 100, // Конвертируем в проценты
                        sharpe: sharpeRatio,
                        weights: solution.weights
                    });
                } catch (error) {
                    console.warn(`⚠️ Ошибка генерации точки эффективной границы для доходности ${targetReturn}:`, error.message);
                }
            }

            // Сортируем по риску
            frontier.sort((a, b) => a.risk - b.risk);

            return frontier;

        } catch (error) {
            console.error('❌ Ошибка генерации эффективной границы:', error);
            return [];
        }
    }

    /**
     * Умножение матрицы на вектор
     * 
     * @private
     * @param {Object} matrix - Матрица {figi1: {figi2: value, ...}, ...}
     * @param {Array<number>} vector - Вектор значений
     * @param {Array<string>} figis - Порядок FIGI для соответствия индексам
     * @returns {Array<number>} Результат умножения
     */
    _matrixVectorMultiply(matrix, vector, figis) {
        const result = new Array(figis.length).fill(0);
        
        for (let i = 0; i < figis.length; i++) {
            for (let j = 0; j < figis.length; j++) {
                result[i] += (matrix[figis[i]]?.[figis[j]] || 0) * vector[j];
            }
        }
        
        return result;
    }

    /**
     * Умножение матрицы на матрицу
     * 
     * @private
     * @param {Object} matrix1 - Первая матрица
     * @param {Object} matrix2 - Вторая матрица
     * @param {Array<string>} figis - Порядок FIGI
     * @returns {Object} Результат умножения
     */
    _matrixMultiply(matrix1, matrix2, figis) {
        const result = {};
        
        for (const figi1 of figis) {
            result[figi1] = {};
            for (const figi2 of figis) {
                let sum = 0;
                for (const figi3 of figis) {
                    sum += (matrix1[figi1]?.[figi3] || 0) * (matrix2[figi3]?.[figi2] || 0);
                }
                result[figi1][figi2] = sum;
            }
        }
        
        return result;
    }

    /**
     * Инверсия матрицы (метод Гаусса-Жордана)
     * 
     * @private
     * @param {Object} matrix - Матрица для инверсии
     * @param {Array<string>} figis - Порядок FIGI
     * @returns {Object} Инвертированная матрица
     */
    _invertMatrix(matrix, figis) {
        const n = figis.length;
        
        // Преобразуем в двумерный массив
        const A = [];
        for (let i = 0; i < n; i++) {
            A[i] = [];
            for (let j = 0; j < n; j++) {
                A[i][j] = matrix[figis[i]]?.[figis[j]] || 0;
            }
        }
        
        // Создаем единичную матрицу
        const I = [];
        for (let i = 0; i < n; i++) {
            I[i] = [];
            for (let j = 0; j < n; j++) {
                I[i][j] = (i === j) ? 1 : 0;
            }
        }
        
        // Метод Гаусса-Жордана
        for (let i = 0; i < n; i++) {
            // Ищем максимальный элемент в столбце
            let maxRow = i;
            for (let k = i + 1; k < n; k++) {
                if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) {
                    maxRow = k;
                }
            }
            
            // Меняем строки местами
            [A[i], A[maxRow]] = [A[maxRow], A[i]];
            [I[i], I[maxRow]] = [I[maxRow], I[i]];
            
            // Проверяем на вырожденность
            if (Math.abs(A[i][i]) < 1e-10) {
                throw new Error('Матрица вырождена или плохо обусловлена');
            }
            
            // Нормализуем строку
            const pivot = A[i][i];
            for (let j = 0; j < n; j++) {
                A[i][j] /= pivot;
                I[i][j] /= pivot;
            }
            
            // Исключаем столбец
            for (let k = 0; k < n; k++) {
                if (k !== i) {
                    const factor = A[k][i];
                    for (let j = 0; j < n; j++) {
                        A[k][j] -= factor * A[i][j];
                        I[k][j] -= factor * I[i][j];
                    }
                }
            }
        }
        
        // Преобразуем обратно в объект
        const result = {};
        for (let i = 0; i < n; i++) {
            result[figis[i]] = {};
            for (let j = 0; j < n; j++) {
                result[figis[i]][figis[j]] = I[i][j];
            }
        }
        
        return result;
    }

    /**
     * Формирование views из прогнозов AI
     * 
     * @private
     * @param {Array} instruments - Массив инструментов
     * @returns {Promise<Object>} {P: матрица мнений, Q: вектор доходностей, Omega: матрица уверенности}
     */
    async _formViewsFromAI(instruments) {
        const Recommendation = (await import('../models/Recommendation.js')).default;
        const figis = instruments.map(i => i.figi).filter(Boolean);
        
        const views = [];
        const viewReturns = [];
        const viewConfidences = [];
        
        // Получаем рекомендации для каждого инструмента
        for (let i = 0; i < figis.length; i++) {
            try {
                const recommendation = await Recommendation.findOne({
                    where: {
                        figi: figis[i],
                        isActive: true
                    },
                    order: [['analysisDate', 'DESC']]
                });

                if (recommendation && recommendation.recommendation !== 'HOLD') {
                    // Создаем view для этого инструмента
                    const viewVector = new Array(figis.length).fill(0);
                    viewVector[i] = 1; // Этот инструмент в мнении
                    
                    // Ожидаемая доходность из рекомендации
                    let expectedReturn = 0;
                    if (recommendation.recommendation === 'BUY') {
                        const baseReturn = 0.15; // 15% годовых
                        expectedReturn = baseReturn * (recommendation.confidence || 0.5) * (recommendation.score || 0.5);
                    } else if (recommendation.recommendation === 'SELL') {
                        const baseReturn = -0.10; // -10% годовых
                        expectedReturn = baseReturn * (recommendation.confidence || 0.5) * (recommendation.score || 0.5);
                    }
                    
                    // Уверенность в мнении (на основе confidence и score)
                    const confidence = (recommendation.confidence || 0.5) * (recommendation.score || 0.5);
                    
                    views.push(viewVector);
                    viewReturns.push(expectedReturn);
                    viewConfidences.push(confidence);
                }
            } catch (error) {
                console.warn(`⚠️ Ошибка получения рекомендации для ${figis[i]}:`, error.message);
            }
        }

        if (views.length === 0) {
            // Если нет views, возвращаем пустые структуры
            return {
                P: [],
                Q: [],
                Omega: []
            };
        }

        // Формируем матрицу P (views x instruments)
        const P = views;
        
        // Формируем вектор Q (ожидаемые доходности из views)
        const Q = viewReturns;
        
        // Формируем матрицу Omega (диагональная матрица уверенности)
        // Omega[i][i] = 1 / confidence[i] (меньше уверенность -> больше неопределенность)
        const Omega = [];
        for (let i = 0; i < views.length; i++) {
            Omega[i] = [];
            for (let j = 0; j < views.length; j++) {
                if (i === j) {
                    // Диагональ: неопределенность обратно пропорциональна уверенности
                    // Минимальная неопределенность = 0.01, максимальная = 1.0
                    const uncertainty = Math.max(0.01, Math.min(1.0, 1.0 - viewConfidences[i]));
                    Omega[i][j] = uncertainty;
                } else {
                    Omega[i][j] = 0;
                }
            }
        }

        return { P, Q, Omega };
    }

    /**
     * Расчет подразумеваемых доходностей (Implied Returns)
     * 
     * @private
     * @param {Object} covarianceMatrix - Матрица ковариаций
     * @param {Array<number>} marketWeights - Рыночные веса (или равномерные, если не указаны)
     * @param {number} riskAversion - Коэффициент неприятия риска
     * @param {Array<string>} figis - Порядок FIGI
     * @returns {Array<number>} Вектор подразумеваемых доходностей
     */
    _calculateImpliedReturns(covarianceMatrix, marketWeights, riskAversion, figis) {
        // Если рыночные веса не указаны, используем равномерное распределение
        const weights = marketWeights || new Array(figis.length).fill(1.0 / figis.length);
        
        // Вычисляем Σ * w_market
        const sigmaW = this._matrixVectorMultiply(covarianceMatrix, weights, figis);
        
        // Подразумеваемые доходности: Π = λ * Σ * w_market
        const impliedReturns = sigmaW.map(val => riskAversion * val);
        
        return impliedReturns;
    }

    /**
     * Black-Litterman Optimization
     * 
     * @param {Object} options - Параметры оптимизации
     * @returns {Promise<Object>} Результат оптимизации
     */
    async blackLittermanOptimization(options = {}) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        const {
            instruments,
            correlationMatrix,
            marketCapWeights = null, // Рыночные веса (если доступны)
            views = null, // Внешние views (если не указаны, формируются из AI)
            totalCapital = 1000000,
            riskFreeRate = null,
            targetReturn = null,
            maxPositionSize = 0.1,
            minPositionSize = 0.01,
            constraints = {},
            tau = null, // Масштабирующий параметр
            riskAversion = null
        } = options;

        if (!instruments || !Array.isArray(instruments) || instruments.length === 0) {
            throw new Error('Необходимо предоставить массив инструментов');
        }

        if (!correlationMatrix || typeof correlationMatrix !== 'object') {
            throw new Error('Необходимо предоставить матрицу корреляций');
        }

        const warnings = [];

        try {
            const figis = instruments.map(i => i.figi).filter(Boolean);
            const calcTau = tau !== null ? tau : this.settings.tau;
            const calcRiskAversion = riskAversion !== null ? riskAversion : this.settings.defaultRiskAversion;
            const calcRiskFreeRate = riskFreeRate !== null ? riskFreeRate : this.settings.riskFreeRate;

            // 1. Получаем волатильности
            const volatilitiesObj = await this.getVolatilities(instruments);
            const volatilities = figis.map(figi => (volatilitiesObj[figi] || 0) / 100);

            const instrumentsWithVol = instruments.map((inst, i) => ({
                ...inst,
                volatility: volatilities[i]
            }));

            // 2. Рассчитываем матрицу ковариаций
            const covarianceMatrix = this.calculateCovarianceMatrix(instrumentsWithVol, correlationMatrix);

            // 3. Получаем или формируем views
            let P, Q, Omega;
            if (views && views.P && views.Q && views.Omega) {
                // Используем предоставленные views
                P = views.P;
                Q = views.Q;
                Omega = views.Omega;
            } else {
                // Формируем views из прогнозов AI
                const aiViews = await this._formViewsFromAI(instruments);
                P = aiViews.P;
                Q = aiViews.Q;
                Omega = aiViews.Omega;
            }

            // 4. Рассчитываем подразумеваемые доходности
            const marketWeightsArray = marketCapWeights 
                ? figis.map(figi => marketCapWeights[figi] || 0)
                : null;
            
            const impliedReturns = this._calculateImpliedReturns(
                covarianceMatrix,
                marketWeightsArray,
                calcRiskAversion,
                figis
            );

            // 5. Объединяем мнения с рыночными ожиданиями
            let blExpectedReturns;
            
            if (P.length === 0 || Q.length === 0) {
                // Если нет views, используем только подразумеваемые доходности
                warnings.push('Нет views от AI, используются только подразумеваемые доходности');
                blExpectedReturns = impliedReturns;
            } else {
                // Black-Litterman формула:
                // μ_BL = [(τΣ)^(-1) + P^T * Ω^(-1) * P]^(-1) * [(τΣ)^(-1) * Π + P^T * Ω^(-1) * Q]
                
                try {
                    // Вычисляем τ * Σ
                    const tauSigma = {};
                    for (const figi1 of figis) {
                        tauSigma[figi1] = {};
                        for (const figi2 of figis) {
                            tauSigma[figi1][figi2] = calcTau * covarianceMatrix[figi1][figi2];
                        }
                    }

                    // Инвертируем τΣ
                    const tauSigmaInv = this._invertMatrix(tauSigma, figis);

                    // Вычисляем P^T * Ω^(-1) * P
                    // Сначала инвертируем Omega (диагональная матрица)
                    const omegaInv = [];
                    for (let i = 0; i < Omega.length; i++) {
                        omegaInv[i] = [];
                        for (let j = 0; j < Omega.length; j++) {
                            if (i === j && Omega[i][j] > 0) {
                                omegaInv[i][j] = 1.0 / Omega[i][j];
                            } else {
                                omegaInv[i][j] = 0;
                            }
                        }
                    }

                    // P^T * Omega^(-1) * P
                    const PT = []; // Транспонированная P
                    for (let j = 0; j < figis.length; j++) {
                        PT[j] = [];
                        for (let i = 0; i < P.length; i++) {
                            PT[j][i] = P[i][j] || 0;
                        }
                    }

                    // Вычисляем P^T * Omega^(-1)
                    const PTOmegaInv = [];
                    for (let i = 0; i < figis.length; i++) {
                        PTOmegaInv[i] = [];
                        for (let j = 0; j < P.length; j++) {
                            let sum = 0;
                            for (let k = 0; k < Omega.length; k++) {
                                sum += PT[i][k] * omegaInv[k][j];
                            }
                            PTOmegaInv[i][j] = sum;
                        }
                    }

                    // Вычисляем P^T * Omega^(-1) * P
                    const PTOmegaInvP = {};
                    for (const figi1 of figis) {
                        PTOmegaInvP[figi1] = {};
                        for (const figi2 of figis) {
                            let sum = 0;
                            const idx1 = figis.indexOf(figi1);
                            const idx2 = figis.indexOf(figi2);
                            for (let k = 0; k < P.length; k++) {
                                sum += PTOmegaInv[idx1][k] * (P[k][idx2] || 0);
                            }
                            PTOmegaInvP[figi1][figi2] = sum;
                        }
                    }

                    // Вычисляем (τΣ)^(-1) + P^T * Ω^(-1) * P
                    const M = {};
                    for (const figi1 of figis) {
                        M[figi1] = {};
                        for (const figi2 of figis) {
                            M[figi1][figi2] = tauSigmaInv[figi1][figi2] + PTOmegaInvP[figi1][figi2];
                        }
                    }

                    // Инвертируем M
                    const MInv = this._invertMatrix(M, figis);

                    // Вычисляем (τΣ)^(-1) * Π
                    const tauSigmaInvPi = this._matrixVectorMultiply(tauSigmaInv, impliedReturns, figis);

                    // Вычисляем P^T * Ω^(-1) * Q
                    const PTOmegaInvQ = [];
                    for (let i = 0; i < figis.length; i++) {
                        let sum = 0;
                        for (let j = 0; j < P.length; j++) {
                            sum += PTOmegaInv[i][j] * Q[j];
                        }
                        PTOmegaInvQ[i] = sum;
                    }

                    // Вычисляем (τΣ)^(-1) * Π + P^T * Ω^(-1) * Q
                    const combined = tauSigmaInvPi.map((val, i) => val + PTOmegaInvQ[i]);

                    // Финальный результат: μ_BL = M^(-1) * combined
                    blExpectedReturns = this._matrixVectorMultiply(MInv, combined, figis);

                } catch (error) {
                    console.warn('⚠️ Ошибка вычисления Black-Litterman доходностей, используем подразумеваемые:', error.message);
                    warnings.push('Ошибка вычисления Black-Litterman, используются подразумеваемые доходности');
                    blExpectedReturns = impliedReturns;
                }
            }

            // 6. Обновляем ковариационную матрицу (опционально)
            // Σ_BL = Σ + [(τΣ)^(-1) + P^T * Ω^(-1) * P]^(-1)
            // Для простоты используем исходную матрицу ковариаций
            let blCovarianceMatrix = covarianceMatrix;
            
            if (P.length > 0) {
                try {
                    // Вычисляем дополнительную неопределенность
                    // Это упрощенная версия - в полной версии нужно вычислять M^(-1)
                    // Для простоты оставляем исходную матрицу
                } catch (error) {
                    console.warn('⚠️ Ошибка обновления ковариационной матрицы, используем исходную:', error.message);
                }
            }

            // 7. Выполняем Mean-Variance оптимизацию с BL параметрами
            const optimizationConstraints = {
                maxPositionSize: constraints.maxPositionSize || maxPositionSize,
                minPositionSize: constraints.minPositionSize || minPositionSize,
                maxSectorExposure: constraints.maxSectorExposure,
                maxPositions: constraints.maxPositions || instruments.length,
                instruments: instrumentsWithVol
            };

            // Конвертируем BL доходности в формат для оптимизации
            const blExpectedReturnsObj = {};
            for (let i = 0; i < figis.length; i++) {
                blExpectedReturnsObj[figis[i]] = blExpectedReturns[i] * 100; // Конвертируем в проценты
            }

            // Используем существующий метод оптимизации с BL параметрами
            const solution = this._solveQuadraticProgram(
                blExpectedReturns.map(r => r), // Уже в десятичном формате
                blCovarianceMatrix,
                optimizationConstraints,
                calcRiskAversion,
                targetReturn ? targetReturn / 100 : null
            );

            if (!solution.converged) {
                warnings.push('Оптимизация не сошлась за максимальное количество итераций');
            }

            // 8. Рассчитываем метрики портфеля
            const portfolioWeights = solution.weights;
            const weightsArray = figis.map(figi => portfolioWeights[figi] || 0);

            const portfolioReturn = blExpectedReturns.reduce((sum, r, i) => sum + r * weightsArray[i], 0);

            let portfolioVariance = 0;
            for (let i = 0; i < figis.length; i++) {
                for (let j = 0; j < figis.length; j++) {
                    portfolioVariance += weightsArray[i] * blCovarianceMatrix[figis[i]][figis[j]] * weightsArray[j];
                }
            }
            const portfolioVolatility = Math.sqrt(portfolioVariance);

            const sharpeRatio = portfolioVolatility > 0 
                ? (portfolioReturn - calcRiskFreeRate) / portfolioVolatility 
                : 0;

            return {
                weights: portfolioWeights,
                expectedReturn: portfolioReturn * 100,
                portfolioVolatility: portfolioVolatility * 100,
                sharpeRatio: sharpeRatio,
                optimizationMethod: 'black_litterman',
                constraints: optimizationConstraints,
                warnings: warnings,
                iterations: solution.iterations,
                converged: solution.converged,
                riskFreeRate: calcRiskFreeRate * 100,
                riskAversion: calcRiskAversion,
                tau: calcTau,
                viewsCount: P.length,
                impliedReturns: impliedReturns.map(r => r * 100), // Конвертируем в проценты
                blExpectedReturns: blExpectedReturns.map(r => r * 100) // Конвертируем в проценты
            };

        } catch (error) {
            console.error('❌ Ошибка Black-Litterman оптимизации:', error);
            throw error;
        }
    }

    /**
     * Расчет вклада в риск (Marginal Contribution to Risk)
     * 
     * @private
     * @param {Object} covarianceMatrix - Матрица ковариаций
     * @param {Array<number>} weights - Вектор весов портфеля
     * @param {Array<string>} figis - Порядок FIGI
     * @returns {Object} {contributions: Array, portfolioRisk: number, totalRisk: number}
     */
    _calculateRiskContributions(covarianceMatrix, weights, figis) {
        // Вычисляем Σ * w
        const sigmaW = this._matrixVectorMultiply(covarianceMatrix, weights, figis);
        
        // Вычисляем волатильность портфеля: sqrt(w^T * Σ * w)
        let portfolioVariance = 0;
        for (let i = 0; i < figis.length; i++) {
            portfolioVariance += weights[i] * sigmaW[i];
        }
        const portfolioRisk = Math.sqrt(Math.max(0, portfolioVariance));
        
        // Вычисляем вклад каждого инструмента в риск
        // MC_i = w_i * (Σ * w)_i / portfolioRisk
        const contributions = [];
        for (let i = 0; i < figis.length; i++) {
            const contribution = portfolioRisk > 0 
                ? (weights[i] * sigmaW[i]) / portfolioRisk 
                : 0;
            contributions.push(contribution);
        }
        
        // Целевой вклад (равный для всех)
        const targetContribution = portfolioRisk > 0 ? portfolioRisk / figis.length : 0;
        
        return {
            contributions,
            portfolioRisk,
            targetContribution,
            totalRisk: portfolioRisk
        };
    }

    /**
     * Risk Parity Optimization
     * 
     * Итеративный алгоритм для выравнивания вкладов в риск
     * 
     * @param {Object} options - Параметры оптимизации
     * @returns {Promise<Object>} Результат оптимизации
     */
    async riskParityOptimization(options = {}) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        const {
            instruments,
            correlationMatrix,
            totalCapital = 1000000,
            riskFreeRate = null,
            maxPositionSize = 0.1,
            minPositionSize = 0.01,
            constraints = {},
            maxIterations = 200,
            tolerance = 1e-3
        } = options;

        if (!instruments || !Array.isArray(instruments) || instruments.length === 0) {
            throw new Error('Необходимо предоставить массив инструментов');
        }

        if (!correlationMatrix || typeof correlationMatrix !== 'object') {
            throw new Error('Необходимо предоставить матрицу корреляций');
        }

        const warnings = [];

        try {
            const figis = instruments.map(i => i.figi).filter(Boolean);
            const calcRiskFreeRate = riskFreeRate !== null ? riskFreeRate : this.settings.riskFreeRate;

            // 1. Получаем волатильности
            const volatilitiesObj = await this.getVolatilities(instruments);
            const volatilities = figis.map(figi => (volatilitiesObj[figi] || 0) / 100);

            const instrumentsWithVol = instruments.map((inst, i) => ({
                ...inst,
                volatility: volatilities[i]
            }));

            // 2. Рассчитываем матрицу ковариаций
            const covarianceMatrix = this.calculateCovarianceMatrix(instrumentsWithVol, correlationMatrix);

            // 3. Инициализация: равные веса
            let weights = new Array(figis.length).fill(1.0 / figis.length);
            
            // Применяем начальные ограничения
            const optimizationConstraints = {
                maxPositionSize: constraints.maxPositionSize || maxPositionSize,
                minPositionSize: constraints.minPositionSize || minPositionSize,
                maxSectorExposure: constraints.maxSectorExposure,
                maxPositions: constraints.maxPositions || instruments.length,
                instruments: instrumentsWithVol
            };
            
            weights = this._projectWeights(weights, optimizationConstraints);

            // 4. Итеративный алгоритм выравнивания вкладов в риск
            // Используем улучшенный алгоритм с адаптивной скоростью обучения
            let converged = false;
            let iteration = 0;
            let learningRate = 0.2; // Начальная скорость обучения
            const minLearningRate = 0.01;
            const maxLearningRate = 0.5;
            let previousMaxDeviation = Infinity;
            let previousUniformity = 0;

            for (iteration = 0; iteration < maxIterations; iteration++) {
                // Вычисляем текущие вклады в риск
                const riskContributions = this._calculateRiskContributions(
                    covarianceMatrix,
                    weights,
                    figis
                );

                // Проверяем сходимость: все вклады должны быть примерно равны
                const targetContribution = riskContributions.targetContribution;
                let maxDeviation = 0;
                let totalDeviation = 0;
                
                for (let i = 0; i < figis.length; i++) {
                    const deviation = Math.abs(riskContributions.contributions[i] - targetContribution);
                    totalDeviation += deviation;
                    if (deviation > maxDeviation) {
                        maxDeviation = deviation;
                    }
                }

                // Нормализуем отклонение относительно целевого вклада
                const normalizedDeviation = targetContribution > 0 
                    ? maxDeviation / targetContribution 
                    : maxDeviation;

                // Вычисляем равномерность вкладов (метрика качества)
                const meanContribution = riskContributions.contributions.reduce((sum, c) => sum + c, 0) / riskContributions.contributions.length;
                const variance = riskContributions.contributions.reduce((sum, c) => sum + Math.pow(c - meanContribution, 2), 0) / riskContributions.contributions.length;
                const stdDev = Math.sqrt(variance);
                const currentUniformity = meanContribution > 0 
                    ? Math.max(0, Math.min(1, 1 - (stdDev / meanContribution))) 
                    : 0;

                // Адаптивная скорость обучения: уменьшаем, если отклонение растет
                const deviationChange = maxDeviation - previousMaxDeviation;
                if (deviationChange > 0) {
                    learningRate = Math.max(minLearningRate, learningRate * 0.9);
                } else {
                    learningRate = Math.min(maxLearningRate, learningRate * 1.05);
                }

                // Улучшенный критерий сходимости:
                // 1. Нормализованное отклонение меньше tolerance
                // 2. ИЛИ равномерность выше 80% и стабильна (изменение < 0.5%)
                // 3. ИЛИ отклонение стабилизировалось (изменение < 0.5% от текущего значения)
                const deviationStabilized = iteration > 10 && Math.abs(deviationChange) < maxDeviation * 0.005;
                const uniformityStable = iteration > 10 && Math.abs(currentUniformity - previousUniformity) < 0.005;

                if (normalizedDeviation < tolerance || 
                    (currentUniformity > 0.80 && uniformityStable) ||
                    (deviationStabilized && currentUniformity > 0.75)) {
                    converged = true;
                    break;
                }

                // Обновляем предыдущие значения
                previousMaxDeviation = maxDeviation;
                previousUniformity = currentUniformity;

                // Улучшенная корректировка весов
                // Используем более стабильный метод: корректируем веса пропорционально отношению целевого вклада к текущему
                const newWeights = [];
                const adjustments = [];
                
                for (let i = 0; i < figis.length; i++) {
                    const currentContribution = riskContributions.contributions[i];
                    const target = targetContribution;
                    
                    if (riskContributions.portfolioRisk > 0 && target > 0 && currentContribution > 0) {
                        // Используем квадратный корень для более плавной корректировки
                        const ratio = Math.sqrt(target / currentContribution);
                        adjustments.push(ratio);
                    } else {
                        adjustments.push(1);
                    }
                }

                // Применяем корректировки с адаптивной скоростью обучения
                for (let i = 0; i < figis.length; i++) {
                    const adjustment = adjustments[i];
                    // Более консервативная корректировка для больших отклонений
                    const smoothAdjustment = 1 + learningRate * (adjustment - 1);
                    newWeights[i] = weights[i] * smoothAdjustment;
                }

                // Проецируем на ограничения
                weights = this._projectWeights(newWeights, optimizationConstraints);
                
                // Дополнительная проверка: если веса не изменились значительно, считаем сходимость
                if (iteration > 10) {
                    let weightsChanged = false;
                    for (let i = 0; i < figis.length; i++) {
                        if (Math.abs(newWeights[i] - weights[i]) > 1e-6) {
                            weightsChanged = true;
                            break;
                        }
                    }
                    if (!weightsChanged && normalizedDeviation < tolerance * 2) {
                        converged = true;
                        break;
                    }
                }
            }

            if (!converged) {
                warnings.push(`Алгоритм не сошёлся за ${maxIterations} итераций`);
            }

            // 5. Финальный расчет метрик
            const finalRiskContributions = this._calculateRiskContributions(
                covarianceMatrix,
                weights,
                figis
            );

            // Преобразуем веса в объект
            const portfolioWeights = {};
            for (let i = 0; i < figis.length; i++) {
                portfolioWeights[figis[i]] = weights[i];
            }

            // Рассчитываем ожидаемую доходность портфеля (используем исторические доходности)
            const expectedReturnsObj = await this.calculateExpectedReturns(instruments, 'historical');
            const expectedReturns = figis.map(figi => (expectedReturnsObj[figi] || 0) / 100);
            const portfolioReturn = expectedReturns.reduce((sum, r, i) => sum + r * weights[i], 0);

            // Sharpe Ratio
            const sharpeRatio = finalRiskContributions.portfolioRisk > 0 
                ? (portfolioReturn - calcRiskFreeRate) / finalRiskContributions.portfolioRisk 
                : 0;

            // Вычисляем равномерность вкладов (чем ближе к 1, тем равномернее)
            const contributions = finalRiskContributions.contributions;
            const meanContribution = contributions.reduce((sum, c) => sum + c, 0) / contributions.length;
            const variance = contributions.reduce((sum, c) => sum + Math.pow(c - meanContribution, 2), 0) / contributions.length;
            const stdDev = Math.sqrt(variance);
            const uniformity = meanContribution > 0 
                ? 1 - (stdDev / meanContribution) 
                : 0;

            return {
                weights: portfolioWeights,
                expectedReturn: portfolioReturn * 100, // Конвертируем в проценты
                portfolioVolatility: finalRiskContributions.portfolioRisk * 100, // Конвертируем в проценты
                sharpeRatio: sharpeRatio,
                optimizationMethod: 'risk_parity',
                constraints: optimizationConstraints,
                warnings: warnings,
                iterations: iteration + 1,
                converged: converged,
                riskFreeRate: calcRiskFreeRate * 100,
                riskContributions: contributions.map(c => c * 100), // Конвертируем в проценты
                targetContribution: finalRiskContributions.targetContribution * 100, // Конвертируем в проценты
                uniformity: Math.max(0, Math.min(1, uniformity)), // Нормализуем в [0, 1]
                maxDeviation: Math.max(...contributions.map(c => Math.abs(c - finalRiskContributions.targetContribution))) * 100
            };

        } catch (error) {
            console.error('❌ Ошибка Risk Parity оптимизации:', error);
            throw error;
        }
    }

    /**
     * Получение статуса сервиса
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            settings: this.settings,
            cacheSize: {
                covariance: this.covarianceMatrixCache.size,
                correlation: this.correlationMatrixCache.size,
                expectedReturns: this.expectedReturnsCache.size
            },
            performance: {
                optimizationCount: this.performanceMetrics.optimizationCount,
                averageOptimizationTime: this.performanceMetrics.averageOptimizationTime,
                lastOptimizationTime: this.performanceMetrics.lastOptimizationTime,
                errorCount: this.performanceMetrics.errors.length,
                recentErrors: this.performanceMetrics.errors.slice(-5) // Последние 5 ошибок
            }
        };
    }

    /**
     * Получение метрик производительности
     */
    getPerformanceMetrics() {
        return {
            ...this.performanceMetrics,
            cacheHitRate: this._calculateCacheHitRate()
        };
    }

    /**
     * Расчет процента попаданий в кеш (упрощенный)
     * @private
     */
    _calculateCacheHitRate() {
        // Упрощенный расчет - можно улучшить, добавив счетчики попаданий/промахов
        const totalCacheSize = this.covarianceMatrixCache.size + 
                              this.correlationMatrixCache.size + 
                              this.expectedReturnsCache.size;
        return totalCacheSize > 0 ? Math.min(100, (totalCacheSize / 100) * 10) : 0;
    }

    /**
     * Сброс метрик производительности
     */
    resetPerformanceMetrics() {
        this.performanceMetrics = {
            optimizationCount: 0,
            totalOptimizationTime: 0,
            averageOptimizationTime: 0,
            lastOptimizationTime: null,
            errors: []
        };
    }
}

export default new PortfolioOptimizer();

