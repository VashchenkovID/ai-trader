import TinkoffApiService from './TinkoffApiService.js';
import CachedInstrument from '../models/CachedInstrument.js';
import FundamentalDataService from './FundamentalDataService.js';
import LoggerService from './LoggerService.js';

/**
 * Сервис для работы с дивидендами
 */
class DividendService {
    constructor() {
        this.isInitialized = false;
        this.priorityInstruments = new Set();
        // Кеш для результатов дивидендов, чтобы избежать повторных запросов при обучении
        this.dividendsCache = new Map(); // key: figi, value: { data, timestamp }
        this.cacheTTL = 3600000; // 1 час в миллисекундах
        this.maxDividendsCacheSize = 500; // Ограничение размера кеша
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        try {
            this.isInitialized = true;
        } catch (error) {
            console.error('❌ Ошибка инициализации DividendService:', error);
            throw error;
        }
    }

    /**
     * Добавить инструмент в приоритетный список для обновления дивидендов
     */
    addPriorityInstrument(figi) {
        if (figi) {
            this.priorityInstruments.add(figi);
        }
    }

    /**
     * Eviction для dividendsCache: удаляем устаревшие и лишние записи
     */
    _evictDividendsCache() {
        const now = Date.now();
        for (const [key, entry] of this.dividendsCache.entries()) {
            if ((now - (entry.timestamp || 0)) > this.cacheTTL) {
                this.dividendsCache.delete(key);
            }
        }
        if (this.dividendsCache.size > this.maxDividendsCacheSize) {
            const entries = [...this.dividendsCache.entries()]
                .sort((a, b) => (a[1].timestamp || 0) - (b[1].timestamp || 0));
            for (let i = 0; i < this.dividendsCache.size - this.maxDividendsCacheSize; i++) {
                this.dividendsCache.delete(entries[i][0]);
            }
        }
    }

    /**
     * Обновить дивиденды для инструмента
     */
    async updateDividends(figi) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            // Проверяем тип инструмента перед запросом дивидендов
            // Дивиденды можно получать только для акций (share) и ETF (etf)
            const instrument = await CachedInstrument.findOne({ 
                where: { figi },
                attributes: ['figi', 'instrumentType', 'ticker']
            });
            
            if (instrument) {
                const instrumentType = (instrument.instrumentType || '').toLowerCase();
                // Пропускаем обновление для инструментов, которые не могут иметь дивиденды
                if (instrumentType && instrumentType !== 'share' && instrumentType !== 'etf') {
                    // Не логируем, так как это нормальное поведение для фьючерсов, облигаций и т.д.
                    return null;
                }
            }

            // Получаем дивиденды от Tinkoff API
            const dividends = await TinkoffApiService.getDividends(figi);
            
            // Обновляем кеш после получения новых данных
            if (dividends) {
                this._evictDividendsCache();
                this.dividendsCache.set(figi, {
                    data: dividends,
                    timestamp: Date.now()
                });
            }
            
            if (dividends && dividends.dividends) {
                // Обновляем дивидендную доходность в кеше
                const totalDividends = dividends.dividends.reduce((sum, div) => {
                    return sum + (div.dividendNet || 0);
                }, 0);

                // Получаем текущую цену для расчета доходности
                const instrument = await CachedInstrument.findOne({ where: { figi } });
                if (instrument && instrument.lastPrice) {
                    const dividendYield = totalDividends / instrument.lastPrice;
                    
                    await CachedInstrument.update(
                        { dividendYield },
                        { where: { figi } }
                    );
                }
            }

            return dividends;
        } catch (error) {
            console.error(`Ошибка обновления дивидендов для ${figi}:`, error);
            return null;
        }
    }

    /**
     * Получить дивиденды для инструмента
     */
    async getDividends(figi, from, to) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            return await TinkoffApiService.getDividends(figi, from, to);
        } catch (error) {
            console.error(`Ошибка получения дивидендов для ${figi}:`, error);
            return null;
        }
    }

    /**
     * Обновить дивиденды для всех приоритетных инструментов
     */
    async updatePriorityDividends() {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            const results = [];
            for (const figi of this.priorityInstruments) {
                try {
                    const result = await this.updateDividends(figi);
                    results.push({ figi, success: true, data: result });
                } catch (error) {
                    results.push({ figi, success: false, error: error.message });
                }
            }

            return results;
        } catch (error) {
            console.error('Ошибка обновления приоритетных дивидендов:', error);
            return [];
        }
    }

    /**
     * Вычисление дивидендного покрытия
     * Дивидендное покрытие = прибыль / дивиденды
     * Используется для оценки способности компании выплачивать дивиденды
     * @param {string} figi - FIGI инструмента
     * @param {Date} timestamp - Дата для расчета
     * @returns {Promise<number|null>} - Дивидендное покрытие (или null, если данных недостаточно)
     */
    async calculateDividendCoverage(figi, timestamp = new Date()) {
        try {
            // Инициализируем FundamentalDataService, если не инициализирован
            if (!FundamentalDataService.isInitialized) {
                await FundamentalDataService.initialize();
            }

            // Получаем последние фундаментальные данные
            const fundamentalData = await FundamentalDataService.getFundamentalData(
                figi,
                timestamp,
                false // не запрашивать из API, только из БД
            );

            if (!fundamentalData) {
                return null;
            }

            // Получаем дивидендную доходность
            const dividendYield = fundamentalData.metadata?.dividendYield || null;
            const netMargin = fundamentalData.netMargin; // в процентах (0-100)
            const netIncome = fundamentalData.metadata?.netIncome || null;

            // Если нет дивидендной доходности, покрытие нельзя вычислить
            if (!dividendYield || dividendYield <= 0) {
                return null;
            }

            // Вариант 1: Если есть netIncome, используем его
            // dividendCoverage = netIncome / (dividendYield * marketCap)
            // Но marketCap может быть неточным, поэтому используем упрощенный подход

            // Вариант 2: Упрощенный подход через netMargin
            // Дивидендное покрытие = netMargin / (dividendYield * 100)
            // Это приблизительная оценка: если netMargin = 20%, а dividendYield = 5%,
            // то покрытие = 20 / 5 = 4 (компания может выплатить дивиденды 4 раза)
            if (netMargin !== null && netMargin > 0) {
                // Преобразуем dividendYield из десятичной в проценты, если нужно
                const dividendYieldPercent = dividendYield > 1 ? dividendYield : dividendYield * 100;
                const coverage = netMargin / dividendYieldPercent;
                return coverage;
            }

            return null;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error calculating dividend coverage', {
                    service: 'DividendService',
                    figi,
                    error: { message: error.message }
                });
            }
            return null;
        }
    }

    /**
     * Анализ стабильности дивидендных выплат
     * Оценивает, насколько стабильно компания выплачивает дивиденды
     * @param {string} figi - FIGI инструмента
     * @param {Date} timestamp - Дата для анализа
     * @param {number} years - Количество лет для анализа (по умолчанию 3)
     * @returns {Promise<number>} - Оценка стабильности (0-1, где 1 - максимальная стабильность)
     */
    async calculateDividendStability(figi, timestamp = new Date(), years = 3) {
        try {
            // Получаем историю дивидендов за последние годы
            const dateFrom = new Date(timestamp);
            dateFrom.setFullYear(dateFrom.getFullYear() - years);

            // Проверяем кеш перед запросом к API
            let dividendsResponse = null;
            const cacheKey = figi;
            const cached = this.dividendsCache.get(cacheKey);
            const now = Date.now();
            
            if (cached && (now - cached.timestamp) < this.cacheTTL) {
                // Используем кешированные данные
                dividendsResponse = cached.data;
            } else {
                // Делаем запрос к API и кешируем результат
                dividendsResponse = await TinkoffApiService.getDividends(figi);
                if (dividendsResponse) {
                    this._evictDividendsCache();
                    this.dividendsCache.set(cacheKey, {
                        data: dividendsResponse,
                        timestamp: now
                    });
                }
            }
            
            if (!dividendsResponse || !dividendsResponse.dividends || dividendsResponse.dividends.length === 0) {
                // Нет данных о дивидендах - стабильность 0
                return 0;
            }

            const dividends = dividendsResponse.dividends;
            
            // Фильтруем дивиденды за указанный период
            const recentDividends = dividends.filter(div => {
                if (!div.lastBuyDate && !div.paymentDate) return false;
                const divDate = div.lastBuyDate || div.paymentDate;
                return new Date(divDate) >= dateFrom;
            });

            if (recentDividends.length === 0) {
                return 0;
            }

            // Сортируем по дате
            recentDividends.sort((a, b) => {
                const dateA = new Date(a.lastBuyDate || a.paymentDate || 0);
                const dateB = new Date(b.lastBuyDate || b.paymentDate || 0);
                return dateA - dateB;
            });

            // Анализируем стабильность по нескольким критериям:
            // 1. Регулярность выплат (есть ли пропуски)
            // 2. Равномерность сумм (насколько стабильны суммы)
            // 3. Тренд (растут ли дивиденды)

            // Критерий 1: Регулярность выплат
            // Для российских компаний обычно выплаты раз в год или раз в полгода
            const paymentsPerYear = recentDividends.length / years;
            const regularityScore = Math.min(1, paymentsPerYear / 2); // Ожидаем минимум 2 выплаты в год

            // Критерий 2: Равномерность сумм
            const amounts = recentDividends.map(div => div.dividendNet || div.dividendGross || 0).filter(a => a > 0);
            if (amounts.length === 0) {
                return 0;
            }

            const avgAmount = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
            const variance = amounts.reduce((sum, a) => sum + Math.pow(a - avgAmount, 2), 0) / amounts.length;
            const stdDev = Math.sqrt(variance);
            const coefficientOfVariation = avgAmount > 0 ? stdDev / avgAmount : 1;
            // Чем меньше коэффициент вариации, тем стабильнее выплаты
            const uniformityScore = Math.max(0, 1 - coefficientOfVariation); // 0-1, где 1 - идеальная равномерность

            // Критерий 3: Тренд (растущие дивиденды - хорошо, падающие - плохо)
            let trendScore = 0.5; // Нейтральный тренд по умолчанию
            if (amounts.length >= 2) {
                const firstHalf = amounts.slice(0, Math.floor(amounts.length / 2));
                const secondHalf = amounts.slice(Math.floor(amounts.length / 2));
                const firstAvg = firstHalf.reduce((sum, a) => sum + a, 0) / firstHalf.length;
                const secondAvg = secondHalf.reduce((sum, a) => sum + a, 0) / secondHalf.length;
                
                if (firstAvg > 0) {
                    const growthRate = (secondAvg - firstAvg) / firstAvg;
                    // Растущие дивиденды (+20% и более) = 1.0, стабильные (0%) = 0.8, падающие (-20% и более) = 0.2
                    if (growthRate >= 0.2) {
                        trendScore = 1.0;
                    } else if (growthRate >= 0) {
                        trendScore = 0.8 + (growthRate / 0.2) * 0.2; // 0.8 - 1.0
                    } else if (growthRate >= -0.2) {
                        trendScore = 0.5 + (growthRate + 0.2) / 0.2 * 0.3; // 0.5 - 0.8
                    } else {
                        trendScore = Math.max(0.2, 0.5 + growthRate / 0.2 * 0.3); // 0.2 - 0.5
                    }
                }
            }

            // Итоговая оценка стабильности (взвешенная сумма)
            const stability = (
                regularityScore * 0.3 +      // 30% - регулярность
                uniformityScore * 0.4 +      // 40% - равномерность
                trendScore * 0.3             // 30% - тренд
            );

            return Math.min(1, Math.max(0, stability));
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error calculating dividend stability', {
                    service: 'DividendService',
                    figi,
                    error: { message: error.message }
                });
            }
            return 0;
        }
    }

    /**
     * Получение дивидендных фичей для нейросети
     * @param {string} figi - FIGI инструмента
     * @param {Date} timestamp - Дата для получения фичей
     * @returns {Promise<Array<number>>} - Массив из 2 фичей: [dividendCoverage, dividendStability]
     */
    async getDividendFeatures(figi, timestamp = new Date()) {
        try {
            // 1. Вычисляем дивидендное покрытие
            const dividendCoverage = await this.calculateDividendCoverage(figi, timestamp);
            
            // 2. Вычисляем стабильность выплат
            const dividendStability = await this.calculateDividendStability(figi, timestamp, 3);

            // Нормализация дивидендного покрытия (0-5 → 0-1)
            // Покрытие > 5 считается очень хорошим, покрытие < 1 - плохим
            const normalizedCoverage = dividendCoverage !== null
                ? Math.min(1, Math.max(0, dividendCoverage / 5)) // 0-5 → 0-1
                : 0.2; // Среднее значение при отсутствии данных (покрытие 1 = 0.2 после нормализации)

            // Стабильность уже в диапазоне 0-1
            const normalizedStability = Math.min(1, Math.max(0, dividendStability));

            return [
                normalizedCoverage,
                normalizedStability
            ];
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error getting dividend features', {
                    service: 'DividendService',
                    figi,
                    error: { message: error.message, stack: error.stack }
                });
            }
            // Возвращаем значения по умолчанию при ошибке
            return [0.2, 0.5]; // Средние значения
        }
    }

    /**
     * Получить статус сервиса
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            priorityInstrumentsCount: this.priorityInstruments.size,
            priorityInstruments: Array.from(this.priorityInstruments)
        };
    }
}

// Создаем singleton экземпляр
const dividendService = new DividendService();

export default dividendService;
