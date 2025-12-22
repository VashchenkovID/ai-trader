/**
 * Утилиты для расчета продвинутых метрик производительности
 * 
 * Метрики:
 * - Sortino Ratio (учитывает только негативную волатильность)
 * - Calmar Ratio (доходность / Max Drawdown)
 * - Information Ratio (активная доходность / tracking error)
 * - MAE/MFE (Maximum Adverse/Favorable Excursion)
 * - Анализ по периодам (дни недели, месяцы)
 */

/**
 * Расчет Sortino Ratio
 * Sortino Ratio = (Average Return - Risk-Free Rate) / Downside Deviation
 * 
 * @param {Array<number>} returns - Массив доходностей (в процентах или десятичных долях)
 * @param {number} riskFreeRate - Безрисковая ставка (в процентах, по умолчанию 8% годовых)
 * @param {number} tradingDaysPerYear - Количество торговых дней в году (по умолчанию 252)
 * @returns {number} Sortino Ratio
 */
export function calculateSortinoRatio(returns, riskFreeRate = 8, tradingDaysPerYear = 252) {
    if (!returns || returns.length === 0) {
        return 0;
    }

    // Конвертируем riskFreeRate в дневную ставку
    const dailyRiskFreeRate = riskFreeRate / 100 / tradingDaysPerYear;

    // Фильтруем только отрицательные доходности (downside)
    const negativeReturns = returns.filter(r => r < 0);

    if (negativeReturns.length === 0) {
        // Если нет отрицательных доходностей, Sortino Ratio не определен
        // Возвращаем высокое значение как индикатор отсутствия downside риска
        return Infinity;
    }

    // Рассчитываем среднюю доходность
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;

    // Рассчитываем downside deviation
    const downsideVariance = negativeReturns.reduce((sum, r) => {
        const deviation = r - dailyRiskFreeRate;
        return sum + Math.pow(Math.min(deviation, 0), 2);
    }, 0) / negativeReturns.length;

    const downsideDeviation = Math.sqrt(downsideVariance);

    if (downsideDeviation === 0) {
        return 0;
    }

    // Годовая доходность (если returns в дневных значениях)
    const annualReturn = avgReturn * tradingDaysPerYear;
    const annualRiskFreeRate = riskFreeRate / 100;

    // Sortino Ratio
    const sortinoRatio = (annualReturn - annualRiskFreeRate) / (downsideDeviation * Math.sqrt(tradingDaysPerYear));

    return isFinite(sortinoRatio) ? sortinoRatio : 0;
}

/**
 * Расчет Calmar Ratio
 * Calmar Ratio = Annual Return / Max Drawdown
 * 
 * @param {number} annualReturn - Годовая доходность (в процентах)
 * @param {number} maxDrawdown - Максимальная просадка (в процентах)
 * @returns {number} Calmar Ratio
 */
export function calculateCalmarRatio(annualReturn, maxDrawdown) {
    if (!maxDrawdown || maxDrawdown === 0) {
        return 0;
    }

    const calmarRatio = annualReturn / maxDrawdown;
    return isFinite(calmarRatio) ? calmarRatio : 0;
}

/**
 * Расчет Information Ratio
 * Information Ratio = (Portfolio Return - Benchmark Return) / Tracking Error
 * 
 * @param {Array<number>} portfolioReturns - Доходности портфеля
 * @param {Array<number>} benchmarkReturns - Доходности бенчмарка (должны быть синхронизированы по датам)
 * @returns {number} Information Ratio
 */
export function calculateInformationRatio(portfolioReturns, benchmarkReturns) {
    if (!portfolioReturns || !benchmarkReturns || 
        portfolioReturns.length === 0 || benchmarkReturns.length === 0 ||
        portfolioReturns.length !== benchmarkReturns.length) {
        return 0;
    }

    // Рассчитываем активную доходность (разница между портфелем и бенчмарком)
    const activeReturns = portfolioReturns.map((portfolioReturn, index) => {
        return portfolioReturn - benchmarkReturns[index];
    });

    // Средняя активная доходность
    const avgActiveReturn = activeReturns.reduce((sum, r) => sum + r, 0) / activeReturns.length;

    // Tracking Error (стандартное отклонение активной доходности)
    const variance = activeReturns.reduce((sum, r) => sum + Math.pow(r - avgActiveReturn, 2), 0) / activeReturns.length;
    const trackingError = Math.sqrt(variance);

    if (trackingError === 0) {
        return 0;
    }

    // Information Ratio
    const informationRatio = avgActiveReturn / trackingError;

    return isFinite(informationRatio) ? informationRatio : 0;
}

/**
 * Расчет MAE (Maximum Adverse Excursion) и MFE (Maximum Favorable Excursion)
 * 
 * MAE - максимальное неблагоприятное отклонение цены от точки входа до момента выхода
 * MFE - максимальное благоприятное отклонение цены от точки входа до момента выхода
 * 
 * @param {Array<Object>} trades - Массив сделок
 *   Каждая сделка должна содержать:
 *   - entryPrice: цена входа
 *   - exitPrice: цена выхода
 *   - entryTime: время входа (Date или timestamp)
 *   - exitTime: время выхода (Date или timestamp)
 * @param {Array<Object>} candles - Массив свечей за период сделки
 *   Каждая свеча должна содержать:
 *   - time: время свечи (Date или timestamp)
 *   - high: максимальная цена
 *   - low: минимальная цена
 * @returns {Object} {mae: number, mfe: number, trades: Array<Object>}
 *   trades содержит MAE и MFE для каждой сделки
 */
export function calculateMAEandMFE(trades, candles) {
    if (!trades || trades.length === 0) {
        return {
            mae: 0,
            mfe: 0,
            trades: []
        };
    }

    const tradesWithMAEMFE = trades.map(trade => {
        // Пытаемся извлечь цены из разных форматов сделок
        let entryPrice = trade.entryPrice;
        let exitPrice = trade.exitPrice;
        
        // Если нет явных цен входа/выхода, пытаемся определить из action и price
        if (!entryPrice && !exitPrice) {
            if (trade.action === 'BUY' && trade.price) {
                entryPrice = trade.price;
            } else if (trade.action === 'SELL' && trade.price) {
                exitPrice = trade.price;
            }
        }
        
        // Если все еще нет цен, используем price как fallback
        entryPrice = entryPrice || trade.price || 0;
        exitPrice = exitPrice || trade.price || 0;
        
        const entryTime = trade.entryTime ? new Date(trade.entryTime) : 
                         (trade.timestamp ? new Date(trade.timestamp) : null);
        const exitTime = trade.exitTime ? new Date(trade.exitTime) : 
                        (trade.timestamp ? new Date(trade.timestamp) : null);

        // Если нет времени, но есть timestamp, используем его для обоих
        const tradeTime = entryTime || exitTime || (trade.timestamp ? new Date(trade.timestamp) : null);

        if ((!entryTime && !exitTime && !tradeTime) || entryPrice === 0) {
            return {
                ...trade,
                mae: 0,
                mfe: 0
            };
        }
        
        // Используем tradeTime для обоих, если отдельные времена не указаны
        const finalEntryTime = entryTime || tradeTime;
        const finalExitTime = exitTime || tradeTime;

        // Фильтруем свечи за период сделки
        const tradeCandles = candles ? candles.filter(candle => {
            const candleTime = candle.time ? new Date(candle.time) : null;
            return candleTime && finalEntryTime && finalExitTime && 
                   candleTime >= finalEntryTime && candleTime <= finalExitTime;
        }) : [];

        if (tradeCandles.length === 0) {
            // Если нет свечей, используем только цены входа/выхода
            // Если нет exitPrice, используем entryPrice (для незавершенных сделок)
            const finalExitPrice = exitPrice || entryPrice;
            const isLong = finalExitPrice >= entryPrice;
            const mae = isLong ? 0 : ((entryPrice - finalExitPrice) / entryPrice) * 100;
            const mfe = isLong ? ((finalExitPrice - entryPrice) / entryPrice) * 100 : 0;

            return {
                ...trade,
                mae: Math.abs(mae),
                mfe: Math.abs(mfe)
            };
        }

        // Определяем направление сделки
        const finalExitPrice = exitPrice || entryPrice;
        const isLong = finalExitPrice >= entryPrice;

        let maxAdverseExcursion = 0; // MAE
        let maxFavorableExcursion = 0; // MFE

        // Проходим по всем свечам и находим максимальные отклонения
        for (const candle of tradeCandles) {
            const high = candle.high || entryPrice;
            const low = candle.low || entryPrice;

            if (isLong) {
                // Для длинной позиции
                // MAE = максимальное падение от entryPrice
                const adverseExcursion = ((entryPrice - low) / entryPrice) * 100;
                maxAdverseExcursion = Math.max(maxAdverseExcursion, adverseExcursion);

                // MFE = максимальный рост от entryPrice
                const favorableExcursion = ((high - entryPrice) / entryPrice) * 100;
                maxFavorableExcursion = Math.max(maxFavorableExcursion, favorableExcursion);
            } else {
                // Для короткой позиции
                // MAE = максимальный рост от entryPrice
                const adverseExcursion = ((high - entryPrice) / entryPrice) * 100;
                maxAdverseExcursion = Math.max(maxAdverseExcursion, adverseExcursion);

                // MFE = максимальное падение от entryPrice
                const favorableExcursion = ((entryPrice - low) / entryPrice) * 100;
                maxFavorableExcursion = Math.max(maxFavorableExcursion, favorableExcursion);
            }
        }

        return {
            ...trade,
            mae: maxAdverseExcursion,
            mfe: maxFavorableExcursion
        };
    });

    // Рассчитываем средние MAE и MFE
    const totalMAE = tradesWithMAEMFE.reduce((sum, t) => sum + (t.mae || 0), 0);
    const totalMFE = tradesWithMAEMFE.reduce((sum, t) => sum + (t.mfe || 0), 0);
    const avgMAE = tradesWithMAEMFE.length > 0 ? totalMAE / tradesWithMAEMFE.length : 0;
    const avgMFE = tradesWithMAEMFE.length > 0 ? totalMFE / tradesWithMAEMFE.length : 0;

    return {
        mae: avgMAE,
        mfe: avgMFE,
        trades: tradesWithMAEMFE
    };
}

/**
 * Анализ производительности по дням недели
 * 
 * @param {Array<Object>} trades - Массив сделок
 *   Каждая сделка должна содержать:
 *   - timestamp или date: время сделки
 *   - pnl или profit: прибыль/убыток
 * @returns {Object} Статистика по дням недели
 */
export function analyzeByDayOfWeek(trades) {
    if (!trades || trades.length === 0) {
        return {
            monday: { profit: 0, trades: 0, winRate: 0, avgProfit: 0 },
            tuesday: { profit: 0, trades: 0, winRate: 0, avgProfit: 0 },
            wednesday: { profit: 0, trades: 0, winRate: 0, avgProfit: 0 },
            thursday: { profit: 0, trades: 0, winRate: 0, avgProfit: 0 },
            friday: { profit: 0, trades: 0, winRate: 0, avgProfit: 0 },
            saturday: { profit: 0, trades: 0, winRate: 0, avgProfit: 0 },
            sunday: { profit: 0, trades: 0, winRate: 0, avgProfit: 0 },
            bestDay: null,
            worstDay: null
        };
    }

    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayStats = {
        monday: { profit: 0, trades: 0, profitableTrades: 0, losses: [] },
        tuesday: { profit: 0, trades: 0, profitableTrades: 0, losses: [] },
        wednesday: { profit: 0, trades: 0, profitableTrades: 0, losses: [] },
        thursday: { profit: 0, trades: 0, profitableTrades: 0, losses: [] },
        friday: { profit: 0, trades: 0, profitableTrades: 0, losses: [] },
        saturday: { profit: 0, trades: 0, profitableTrades: 0, losses: [] },
        sunday: { profit: 0, trades: 0, profitableTrades: 0, losses: [] }
    };

    // Обрабатываем каждую сделку
    for (const trade of trades) {
        const tradeDate = trade.timestamp ? new Date(trade.timestamp) : 
                         trade.date ? new Date(trade.date) : null;
        
        if (!tradeDate || isNaN(tradeDate.getTime())) {
            continue;
        }

        const dayOfWeek = dayNames[tradeDate.getDay()];
        const pnl = trade.pnl || trade.profit || 0;

        if (dayStats[dayOfWeek]) {
            dayStats[dayOfWeek].profit += pnl;
            dayStats[dayOfWeek].trades += 1;
            if (pnl > 0) {
                dayStats[dayOfWeek].profitableTrades += 1;
            }
        }
    }

    // Рассчитываем финальную статистику
    const result = {};
    let bestDay = null;
    let worstDay = null;
    let bestProfit = -Infinity;
    let worstProfit = Infinity;

    for (const dayName of dayNames) {
        const stats = dayStats[dayName];
        const winRate = stats.trades > 0 ? (stats.profitableTrades / stats.trades) * 100 : 0;
        const avgProfit = stats.trades > 0 ? stats.profit / stats.trades : 0;

        result[dayName] = {
            profit: stats.profit,
            trades: stats.trades,
            winRate: winRate,
            avgProfit: avgProfit
        };

        // Отслеживаем лучший и худший день
        if (stats.trades > 0) {
            if (stats.profit > bestProfit) {
                bestProfit = stats.profit;
                bestDay = dayName;
            }
            if (stats.profit < worstProfit) {
                worstProfit = stats.profit;
                worstDay = dayName;
            }
        }
    }

    result.bestDay = bestDay ? { day: bestDay, profit: bestProfit } : null;
    result.worstDay = worstDay ? { day: worstDay, profit: worstProfit } : null;

    return result;
}

/**
 * Анализ производительности по месяцам
 * 
 * @param {Array<Object>} trades - Массив сделок
 *   Каждая сделка должна содержать:
 *   - timestamp или date: время сделки
 *   - pnl или profit: прибыль/убыток
 * @returns {Object} Статистика по месяцам
 */
export function analyzeByMonth(trades) {
    if (!trades || trades.length === 0) {
        const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                           'july', 'august', 'september', 'october', 'november', 'december'];
        const emptyStats = {};
        for (const month of monthNames) {
            emptyStats[month] = { profit: 0, trades: 0, winRate: 0, avgProfit: 0 };
        }
        return {
            ...emptyStats,
            bestMonth: null,
            worstMonth: null
        };
    }

    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                       'july', 'august', 'september', 'october', 'november', 'december'];
    const monthStats = {};

    // Инициализируем статистику для всех месяцев
    for (const month of monthNames) {
        monthStats[month] = { profit: 0, trades: 0, profitableTrades: 0 };
    }

    // Обрабатываем каждую сделку
    for (const trade of trades) {
        const tradeDate = trade.timestamp ? new Date(trade.timestamp) : 
                         trade.date ? new Date(trade.date) : null;
        
        if (!tradeDate || isNaN(tradeDate.getTime())) {
            continue;
        }

        const monthIndex = tradeDate.getMonth();
        const monthName = monthNames[monthIndex];
        const pnl = trade.pnl || trade.profit || 0;

        if (monthStats[monthName]) {
            monthStats[monthName].profit += pnl;
            monthStats[monthName].trades += 1;
            if (pnl > 0) {
                monthStats[monthName].profitableTrades += 1;
            }
        }
    }

    // Рассчитываем финальную статистику
    const result = {};
    let bestMonth = null;
    let worstMonth = null;
    let bestProfit = -Infinity;
    let worstProfit = Infinity;

    for (const monthName of monthNames) {
        const stats = monthStats[monthName];
        const winRate = stats.trades > 0 ? (stats.profitableTrades / stats.trades) * 100 : 0;
        const avgProfit = stats.trades > 0 ? stats.profit / stats.trades : 0;

        result[monthName] = {
            profit: stats.profit,
            trades: stats.trades,
            winRate: winRate,
            avgProfit: avgProfit
        };

        // Отслеживаем лучший и худший месяц
        if (stats.trades > 0) {
            if (stats.profit > bestProfit) {
                bestProfit = stats.profit;
                bestMonth = monthName;
            }
            if (stats.profit < worstProfit) {
                worstProfit = stats.profit;
                worstMonth = monthName;
            }
        }
    }

    result.bestMonth = bestMonth ? { month: bestMonth, profit: bestProfit } : null;
    result.worstMonth = worstMonth ? { month: worstMonth, profit: worstProfit } : null;

    return result;
}

