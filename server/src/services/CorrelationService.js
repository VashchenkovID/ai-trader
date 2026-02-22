import CacheService from './CacheService.js';
import CorrelationCache from '../models/CorrelationCache.js';
import Settings from '../models/Settings.js';
import { Op } from 'sequelize';

/**
 * Сервис для расчета и управления корреляциями между инструментами
 * Использует корреляцию Пирсона на основе исторических данных свечей
 */
class CorrelationService {
    constructor() {
        this.isInitialized = false;
        this.settings = {
            defaultPeriod: 30,
            cacheTtl: 24 * 60 * 60 * 1000, // 24 часа
            minDataPoints: 20,
            correlationThreshold: 0.7
        };
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        try {

            // Загружаем настройки
            await this.loadSettings();
            
            // Очищаем устаревшие записи из кеша (если таблица существует)
            try {
                await CorrelationCache.cleanExpired();
            } catch (cleanError) {
                // Если таблица не существует, это не критично - она будет создана при синхронизации
                if (cleanError.name === 'SequelizeDatabaseError' && cleanError.parent?.code === '42P01') {
                    console.warn('⚠️ Таблица correlation_cache не существует, будет создана при синхронизации БД');
                } else {
                    console.warn('⚠️ Не удалось очистить устаревшие записи из кеша корреляций:', cleanError.message);
                }
            }
            
            this.isInitialized = true;
        } catch (error) {
            console.error('❌ Ошибка инициализации CorrelationService:', error);
            throw error;
        }
    }

    /**
     * Загрузка настроек из БД
     */
    async loadSettings() {
        try {
            const cacheTtlHours = await Settings.getSetting('correlation_cache_ttl_hours', 24);
            this.settings = {
                defaultPeriod: await Settings.getSetting('correlation_period', 30),
                cacheTtl: cacheTtlHours * 60 * 60 * 1000, // Конвертируем часы в миллисекунды
                minDataPoints: await Settings.getSetting('correlation_min_data_points', 20),
                correlationThreshold: await Settings.getSetting('correlation_threshold', 0.7)
            };
        } catch (error) {
            console.warn('⚠️ Ошибка загрузки настроек корреляций, используем значения по умолчанию:', error.message);
            // Устанавливаем значения по умолчанию при ошибке
            this.settings = {
                defaultPeriod: 30,
                cacheTtl: 24 * 60 * 60 * 1000,
                minDataPoints: 20,
                correlationThreshold: 0.7
            };
        }
    }

    /**
     * Расчет доходностей из свечей
     * @param {Array} candles - Массив свечей с полями close и time
     * @returns {Array} Массив доходностей в процентах
     */
    calculateReturns(candles) {
        if (!candles || candles.length < 2) {
            return [];
        }

        const returns = [];
        for (let i = 1; i < candles.length; i++) {
            const prevClose = candles[i - 1].close;
            const currentClose = candles[i].close;
            
            if (prevClose > 0 && isFinite(prevClose) && isFinite(currentClose)) {
                const returnPercent = ((currentClose - prevClose) / prevClose) * 100;
                returns.push({
                    return: returnPercent,
                    date: candles[i].time || new Date()
                });
            }
        }

        return returns;
    }

    /**
     * Выравнивание массивов доходностей по датам
     * Удаляет дни, для которых нет данных в обоих массивах
     * @param {Array} returns1 - Массив доходностей первого инструмента
     * @param {Array} returns2 - Массив доходностей второго инструмента
     * @returns {Object} Выровненные массивы доходностей
     */
    alignReturnsByDate(returns1, returns2) {
        // Создаем карту по датам
        const map1 = new Map();
        const map2 = new Map();

        returns1.forEach(r => {
            const dateKey = r.date instanceof Date ? r.date.toISOString().split('T')[0] : r.date;
            map1.set(dateKey, r.return);
        });

        returns2.forEach(r => {
            const dateKey = r.date instanceof Date ? r.date.toISOString().split('T')[0] : r.date;
            map2.set(dateKey, r.return);
        });

        // Находим общие даты
        const commonDates = Array.from(map1.keys()).filter(date => map2.has(date));

        if (commonDates.length < this.settings.minDataPoints) {
            return {
                returns1: [],
                returns2: [],
                dataPoints: 0
            };
        }

        // Создаем выровненные массивы
        const aligned1 = [];
        const aligned2 = [];

        commonDates.forEach(date => {
            aligned1.push(map1.get(date));
            aligned2.push(map2.get(date));
        });

        return {
            returns1: aligned1,
            returns2: aligned2,
            dataPoints: commonDates.length
        };
    }

    /**
     * Расчет корреляции Пирсона между двумя массивами
     * @param {Array} x - Первый массив значений
     * @param {Array} y - Второй массив значений
     * @returns {number} Коэффициент корреляции Пирсона (-1 до +1)
     */
    calculatePearsonCorrelation(x, y) {
        if (!x || !y || x.length !== y.length || x.length < this.settings.minDataPoints) {
            return 0;
        }

        const n = x.length;

        // Рассчитываем средние значения
        const meanX = x.reduce((sum, val) => sum + val, 0) / n;
        const meanY = y.reduce((sum, val) => sum + val, 0) / n;

        // Рассчитываем числитель: Σ((Xi - X̄)(Yi - Ȳ))
        let numerator = 0;
        for (let i = 0; i < n; i++) {
            numerator += (x[i] - meanX) * (y[i] - meanY);
        }

        // Рассчитываем знаменатель: √(Σ(Xi - X̄)² × Σ(Yi - Ȳ)²)
        let sumSqDiffX = 0;
        let sumSqDiffY = 0;

        for (let i = 0; i < n; i++) {
            const diffX = x[i] - meanX;
            const diffY = y[i] - meanY;
            sumSqDiffX += diffX * diffX;
            sumSqDiffY += diffY * diffY;
        }

        const denominator = Math.sqrt(sumSqDiffX * sumSqDiffY);

        // Защита от деления на ноль
        if (denominator === 0 || !isFinite(denominator)) {
            return 0;
        }

        const correlation = numerator / denominator;

        // Проверка на валидность результата
        if (!isFinite(correlation) || correlation < -1 || correlation > 1) {
            return 0;
        }

        return correlation;
    }

    /**
     * Расчет корреляции между двумя инструментами
     * @param {string} figi1 - FIGI первого инструмента
     * @param {string} figi2 - FIGI второго инструмента
     * @param {number} period - Период расчета в днях (по умолчанию из настроек)
     * @returns {Promise<number>} Коэффициент корреляции Пирсона (-1 до +1)
     */
    async calculateCorrelation(figi1, figi2, period = null) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (!figi1 || !figi2 || figi1 === figi2) {
            return 0; // Корреляция инструмента с самим собой = 1, но это не имеет смысла
        }

        const calcPeriod = period || this.settings.defaultPeriod;

        try {
            // Используем кеш
            const correlation = await CorrelationCache.getOrCalculate(
                figi1,
                figi2,
                calcPeriod,
                async () => {
                    // Получаем исторические свечи для обоих инструментов
                    const candles1 = await CacheService.getCandles(figi1, 'DAY', calcPeriod + 10); // +10 для запаса
                    const candles2 = await CacheService.getCandles(figi2, 'DAY', calcPeriod + 10);

                    if (!candles1 || !candles2 || candles1.length < this.settings.minDataPoints || candles2.length < this.settings.minDataPoints) {
                        console.warn(`⚠️ Недостаточно данных для расчета корреляции между ${figi1} и ${figi2}`);
                        return 0;
                    }

                    // Рассчитываем доходности
                    const returns1 = this.calculateReturns(candles1);
                    const returns2 = this.calculateReturns(candles2);

                    if (returns1.length < this.settings.minDataPoints || returns2.length < this.settings.minDataPoints) {
                        console.warn(`⚠️ Недостаточно доходностей для расчета корреляции между ${figi1} и ${figi2}`);
                        return 0;
                    }

                    // Выравниваем по датам
                    const aligned = this.alignReturnsByDate(returns1, returns2);

                    if (aligned.dataPoints < this.settings.minDataPoints) {
                        console.warn(`⚠️ Недостаточно общих точек данных для расчета корреляции между ${figi1} и ${figi2}: ${aligned.dataPoints}`);
                        return 0;
                    }

                    // Рассчитываем корреляцию Пирсона
                    const correlation = this.calculatePearsonCorrelation(aligned.returns1, aligned.returns2);

                    return correlation;
                }
            );

            return correlation;
        } catch (error) {
            console.error(`❌ Ошибка расчета корреляции между ${figi1} и ${figi2}:`, error);
            return 0; // Возвращаем 0 при ошибке (нет корреляции)
        }
    }

    /**
     * Расчет суммарной корреляции портфеля
     * @param {Object} portfolio - Объект портфеля с полями positions
     * @param {number} period - Период расчета в днях
     * @returns {Promise<number>} Средняя корреляция портфеля (0 до 1)
     */
    async calculatePortfolioCorrelation(portfolio, period = null) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (!portfolio || !portfolio.positions) {
            return 0;
        }

        const positions = Object.keys(portfolio.positions).filter(figi => portfolio.positions[figi] > 0);

        if (positions.length < 2) {
            return 0; // Нет смысла считать корреляцию для одной позиции
        }

        const calcPeriod = period || this.settings.defaultPeriod;

        try {
            // Рассчитываем корреляции между всеми парами позиций
            const correlations = [];
            const promises = [];

            for (let i = 0; i < positions.length; i++) {
                for (let j = i + 1; j < positions.length; j++) {
                    promises.push(
                        this.calculateCorrelation(positions[i], positions[j], calcPeriod)
                            .then(corr => {
                                correlations.push(Math.abs(corr)); // Используем абсолютное значение
                            })
                            .catch(error => {
                                console.warn(`⚠️ Ошибка расчета корреляции для пары ${positions[i]}-${positions[j]}:`, error.message);
                            })
                    );
                }
            }

            await Promise.all(promises);

            if (correlations.length === 0) {
                return 0;
            }

            // Рассчитываем среднюю корреляцию
            const avgCorrelation = correlations.reduce((sum, corr) => sum + corr, 0) / correlations.length;

            return avgCorrelation;
        } catch (error) {
            console.error('❌ Ошибка расчета корреляции портфеля:', error);
            return 0;
        }
    }

    /**
     * Получение матрицы корреляций для набора инструментов
     * @param {Array<string>} figis - Массив FIGI инструментов
     * @param {number} period - Период расчета в днях
     * @returns {Promise<Object>} Матрица корреляций в формате {figi1: {figi2: correlation, ...}, ...}
     */
    async getCorrelationMatrix(figis, period = null) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (!figis || figis.length < 2) {
            return {};
        }

        const calcPeriod = period || this.settings.defaultPeriod;
        const matrix = {};

        // Инициализируем матрицу
        for (const figi of figis) {
            matrix[figi] = {};
            matrix[figi][figi] = 1.0; // Корреляция инструмента с самим собой = 1
        }

        // Рассчитываем корреляции для всех пар
        const promises = [];

        for (let i = 0; i < figis.length; i++) {
            for (let j = i + 1; j < figis.length; j++) {
                const figi1 = figis[i];
                const figi2 = figis[j];

                promises.push(
                    this.calculateCorrelation(figi1, figi2, calcPeriod)
                        .then(correlation => {
                            matrix[figi1][figi2] = correlation;
                            matrix[figi2][figi1] = correlation; // Симметричность
                        })
                        .catch(error => {
                            console.warn(`⚠️ Ошибка расчета корреляции для пары ${figi1}-${figi2}:`, error.message);
                            matrix[figi1][figi2] = 0;
                            matrix[figi2][figi1] = 0;
                        })
                );
            }
        }

        await Promise.all(promises);

        return matrix;
    }

    /**
     * Получение оценки корреляции для инструмента относительно портфеля
     * @param {string} figi - FIGI инструмента
     * @param {Object} portfolio - Объект портфеля
     * @param {number} period - Период расчета в днях
     * @returns {Promise<Object>} Объект с оценкой корреляции
     */
    async getCorrelationScore(figi, portfolio, period = null) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (!portfolio || !portfolio.positions) {
            return {
                avgCorrelation: 0,
                maxCorrelation: 0,
                correlationScore: 1.0, // Высокий приоритет при пустом портфеле
                correlatedPositions: []
            };
        }

        const positions = Object.keys(portfolio.positions).filter(p => p !== figi && portfolio.positions[p] > 0);

        if (positions.length === 0) {
            return {
                avgCorrelation: 0,
                maxCorrelation: 0,
                correlationScore: 1.0,
                correlatedPositions: []
            };
        }

        const calcPeriod = period || this.settings.defaultPeriod;
        const correlations = [];

        // Рассчитываем корреляции со всеми позициями портфеля
        for (const positionFigi of positions) {
            try {
                const correlation = await this.calculateCorrelation(figi, positionFigi, calcPeriod);
                correlations.push({
                    figi: positionFigi,
                    correlation: correlation,
                    absCorrelation: Math.abs(correlation)
                });
            } catch (error) {
                console.warn(`⚠️ Ошибка расчета корреляции для ${figi}-${positionFigi}:`, error.message);
            }
        }

        if (correlations.length === 0) {
            return {
                avgCorrelation: 0,
                maxCorrelation: 0,
                correlationScore: 1.0,
                correlatedPositions: []
            };
        }

        // Рассчитываем метрики
        const avgCorrelation = correlations.reduce((sum, c) => sum + c.absCorrelation, 0) / correlations.length;
        const maxCorrelation = Math.max(...correlations.map(c => c.absCorrelation));
        const correlatedPositions = correlations
            .filter(c => c.absCorrelation >= this.settings.correlationThreshold)
            .map(c => c.figi);

        // Приоритет обратно пропорционален корреляции
        // Инструменты с низкой корреляцией получают высокий приоритет
        const correlationScore = Math.max(0, 1 - (avgCorrelation / this.settings.correlationThreshold));

        return {
            avgCorrelation,
            maxCorrelation,
            correlationScore,
            correlatedPositions,
            allCorrelations: correlations
        };
    }

    /**
     * Предварительный расчет корреляций для набора инструментов
     * Используется для оптимизации производительности
     * @param {Array<string>} figis - Массив FIGI инструментов
     * @param {number} period - Период расчета в днях
     * @returns {Promise<Object>} Статистика предварительного расчета
     */
    async precalculateCorrelations(figis, period = null) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (!figis || figis.length < 2) {
            return {
                calculated: 0,
                cached: 0,
                errors: 0
            };
        }

        const calcPeriod = period || this.settings.defaultPeriod;
        let calculated = 0;
        let cached = 0;
        let errors = 0;


        const withTimeout = (promise, timeoutMs, label) => {
            return Promise.race([
                promise,
                new Promise((_, reject) => {
                    setTimeout(() => reject(new Error(`${label} timeout after ${timeoutMs}ms`)), timeoutMs);
                })
            ]);
        };

        // Формируем список всех пар и обрабатываем с ограниченным параллелизмом,
        // чтобы не перегружать БД и не "подвешивать" джоб на больших массивах.
        const pairs = [];
        for (let i = 0; i < figis.length; i++) {
            for (let j = i + 1; j < figis.length; j++) {
                pairs.push([figis[i], figis[j]]);
            }
        }

        const maxConcurrency = 10;
        for (let offset = 0; offset < pairs.length; offset += maxConcurrency) {
            const batch = pairs.slice(offset, offset + maxConcurrency);

            await Promise.all(
                batch.map(async ([figi1, figi2]) => {
                    try {
                        // Проверяем кеш перед расчетом
                        const cachedCorr = await withTimeout(
                            CorrelationCache.findOne({
                                where: {
                                    figi1: figi1 < figi2 ? figi1 : figi2,
                                    figi2: figi1 < figi2 ? figi2 : figi1,
                                    period: calcPeriod,
                                    expiresAt: {
                                        [Op.gt]: new Date()
                                    }
                                }
                            }),
                            30000,
                            `Correlation cache lookup for ${figi1}-${figi2}`
                        );

                        if (cachedCorr) {
                            cached++;
                        } else {
                            await withTimeout(
                                this.calculateCorrelation(figi1, figi2, calcPeriod),
                                45000,
                                `Correlation calculation for ${figi1}-${figi2}`
                            );
                            calculated++;
                        }
                    } catch (error) {
                        console.error(`❌ Ошибка предварительного расчета корреляции для ${figi1}-${figi2}:`, error.message);
                        errors++;
                    }
                })
            );

            if (offset + maxConcurrency < pairs.length) {
                await new Promise(resolve => setImmediate(resolve));
            }
        }


        return {
            calculated,
            cached,
            errors,
            total: pairs.length
        };
    }
}

export default new CorrelationService();

