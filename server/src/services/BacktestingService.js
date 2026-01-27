import TradingStrategy from '../models/TradingStrategy.js';
import BacktestResult from '../models/BacktestResult.js';
import CachedCandle from '../models/CachedCandle.js';
import CachedInstrument from '../models/CachedInstrument.js';
import Recommendation from '../models/Recommendation.js';
import CacheService from './CacheService.js';
import SignalCacheService from './SignalCacheService.js';
import RiskManagementService from './RiskManagementService.js';
import {Op} from 'sequelize';
import LoggerService from "./LoggerService.js";

/**
 * Сервис для бэктестинга торговых стратегий
 * Выполняет симуляцию торговли на исторических данных для оценки производительности стратегий
 */
class BacktestingService {
    constructor() {
        this.isInitialized = false;
        this.riskFreeRate = 0.08; // Безрисковая ставка (8% годовых) для расчета Sharpe Ratio
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            this.isInitialized = true;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('❌ Failed to initialize BacktestingService:', {error});
            }
            throw error;
        }
    }

    /**
     * Преобразование цены из формата {units, nano} в число
     */
    convertPriceToNumber(priceObj) {
        if (!priceObj) return null;
        if (typeof priceObj === 'number') return priceObj;
        if (typeof priceObj === 'object' && priceObj.units !== undefined) {
            const units = parseFloat(priceObj.units || 0);
            const nano = parseFloat(priceObj.nano || 0) / 1000000000;
            return units + nano;
        }
        return parseFloat(priceObj) || null;
    }

    /**
     * Симуляция торговли на одном инструменте
     * @param {string} figi - FIGI инструмента
     * @param {Object} strategy - Объект стратегии
     * @param {Date} startDate - Дата начала тестирования
     * @param {Date} endDate - Дата окончания тестирования
     * @param {number} initialCapital - Начальный капитал
     * @returns {Promise<Object>} - Результат симуляции
     */
    async simulateTrading(figi, strategy, startDate, endDate, initialCapital) {
        try {
            // Получаем информацию об инструменте для ticker
            const instrument = await CachedInstrument.findOne({
                where: {figi: figi},
                attributes: ['ticker', 'name']
            });
            const ticker = instrument?.ticker || figi;
            const instrumentName = instrument?.name || figi;

            // Получаем исторические свечи за период напрямую из БД
            const periodCandles = await CachedCandle.findAll({
                where: {
                    figi: figi,
                    interval: 'DAY',
                    time: {
                        [Op.between]: [startDate, endDate]
                    }
                },
                order: [['time', 'ASC']]
            });

            if (periodCandles.length === 0) {
                return {
                    trades: [],
                    equityCurve: [{date: startDate, value: initialCapital}],
                    finalCapital: initialCapital,
                    totalTrades: 0
                };
            }

            // Получаем сигналы за период
            const signals = await SignalCacheService.getSignalsByFigi(figi, {
                from: startDate,
                to: endDate
            });

            // Получаем рекомендации за период (если есть)
            const recommendations = await Recommendation.findAll({
                where: {
                    figi: figi,
                    analysisDate: {
                        [Op.between]: [startDate, endDate]
                    },
                    isActive: true
                },
                order: [['analysisDate', 'ASC']]
            });

            const trades = [];
            const equityCurve = [{date: startDate, value: initialCapital}];
            let availableCapital = initialCapital; // Доступный капитал (без открытых позиций)
            let currentPosition = null; // { figi, entryDate, entryPrice, quantity, stopLoss, targetPrice, signalId, positionCost }

            // Проходим по каждой свече
            for (let i = 0; i < periodCandles.length; i++) {
                const candle = periodCandles[i];
                const candleDate = new Date(candle.time);
                const currentPrice = candle.close;

                // Проверяем выход из позиции (стоп-лосс, тейк-профит)
                if (currentPosition) {
                    let exitReason = null;
                    let exitPrice = currentPrice;

                    // Проверка стоп-лосса
                    if (currentPosition.stopLoss) {
                        if (currentPosition.direction === 'BUY' && currentPrice <= currentPosition.stopLoss) {
                            exitReason = 'stoploss';
                            exitPrice = currentPosition.stopLoss;
                        } else if (currentPosition.direction === 'SELL' && currentPrice >= currentPosition.stopLoss) {
                            exitReason = 'stoploss';
                            exitPrice = currentPosition.stopLoss;
                        }
                    }

                    // Проверка тейк-профита
                    if (!exitReason && currentPosition.targetPrice) {
                        if (currentPosition.direction === 'BUY' && currentPrice >= currentPosition.targetPrice) {
                            exitReason = 'target';
                            exitPrice = currentPosition.targetPrice;
                        } else if (currentPosition.direction === 'SELL' && currentPrice <= currentPosition.targetPrice) {
                            exitReason = 'target';
                            exitPrice = currentPosition.targetPrice;
                        }
                    }

                    // Проверка окончания сигнала
                    if (!exitReason && currentPosition.signalEndDt) {
                        const signalEndDate = new Date(currentPosition.signalEndDt);
                        if (candleDate >= signalEndDate) {
                            exitReason = 'signal_end';
                            exitPrice = currentPrice;
                        }
                    }

                    // Проверка таймаута (для стратегий с targetTimeframe)
                    if (!exitReason && currentPosition.targetTimeframe) {
                        const daysHeld = Math.ceil((candleDate - currentPosition.entryDate) / (1000 * 60 * 60 * 24));
                        if (daysHeld >= currentPosition.targetTimeframe) {
                            exitReason = 'timeout';
                            exitPrice = currentPrice;
                        }
                    }

                    // Выход из позиции
                    if (exitReason) {
                        // Рассчитываем комиссию при выходе
                        let exitCommission = 0;
                        try {
                            const TaxOptimizationService = (await import('./TaxOptimizationService.js')).default;
                            if (TaxOptimizationService && TaxOptimizationService.isInitialized) {
                                const commissionInfo = TaxOptimizationService.calculateCommission(exitPrice, currentPosition.quantity);
                                exitCommission = commissionInfo.amount;
                            } else {
                                // Fallback к простому расчету
                                const TinkoffApiService = (await import('./TinkoffApiService.js')).default;
                                const commissionInfo = TinkoffApiService.calculateCommission(exitPrice, currentPosition.quantity);
                                exitCommission = commissionInfo.amount || 0;
                            }
                        } catch (error) {
                            if (LoggerService.isInitialized) {
                                LoggerService.warn('⚠️ Could not calculate exit commission in backtesting:', {error: error.message});
                            }
                        }

                        const entryCommission = currentPosition.entryCommission || 0;
                        const totalCommission = entryCommission + exitCommission;

                        // PnL с учетом комиссий
                        const grossPnl = currentPosition.direction === 'BUY'
                            ? (exitPrice - currentPosition.entryPrice) * currentPosition.quantity
                            : (currentPosition.entryPrice - exitPrice) * currentPosition.quantity;
                        const pnl = grossPnl - totalCommission;

                        const pnlPercent = currentPosition.direction === 'BUY'
                            ? ((exitPrice - currentPosition.entryPrice) / currentPosition.entryPrice) * 100
                            : ((currentPosition.entryPrice - exitPrice) / currentPosition.entryPrice) * 100;

                        // Возвращаем капитал от позиции (без комиссии входа, она уже учтена) и добавляем PnL
                        const positionCostWithoutCommission = currentPosition.quantity * currentPosition.entryPrice;
                        availableCapital += positionCostWithoutCommission + pnl;
                        const totalCapital = availableCapital;

                        trades.push({
                            figi: figi,
                            ticker: ticker,
                            entryDate: currentPosition.entryDate,
                            exitDate: candleDate,
                            entryPrice: currentPosition.entryPrice,
                            exitPrice: exitPrice,
                            quantity: currentPosition.quantity,
                            direction: currentPosition.direction,
                            pnl: pnl,
                            pnlPercent: pnlPercent,
                            entryCommission: entryCommission,
                            exitCommission: exitCommission,
                            totalCommission: totalCommission,
                            exitReason: exitReason,
                            signalId: currentPosition.signalId
                        });

                        currentPosition = null;
                        equityCurve.push({date: candleDate, value: totalCapital});
                    } else {
                        // Обновляем кривую капитала с учетом unrealized PnL
                        const unrealizedPnL = currentPosition.direction === 'BUY'
                            ? (currentPrice - currentPosition.entryPrice) * currentPosition.quantity
                            : (currentPosition.entryPrice - currentPrice) * currentPosition.quantity;
                        const totalCapital = availableCapital + currentPosition.positionCost + unrealizedPnL;
                        equityCurve.push({
                            date: candleDate,
                            value: totalCapital
                        });
                    }
                }

                // Проверяем вход в позицию (если нет текущей позиции)
                if (!currentPosition) {
                    // Ищем активный сигнал или рекомендацию для входа
                    let entrySignal = null;
                    let entryDirection = null;
                    let entryConfidence = null;
                    let entryScore = null;

                    // Проверяем сигналы Tinkoff API
                    for (const signal of signals) {
                        const signalStart = new Date(signal.createDt);
                        const signalEnd = new Date(signal.endDt);

                        if (candleDate >= signalStart && candleDate <= signalEnd) {
                            const direction = signal.direction === 'SIGNAL_DIRECTION_BUY' ? 'BUY' :
                                signal.direction === 'SIGNAL_DIRECTION_SELL' ? 'SELL' : null;

                            if (direction) {
                                entrySignal = signal;
                                entryDirection = direction;
                                break;
                            }
                        }
                    }

                    // Если нет сигнала, проверяем рекомендации AI
                    if (!entrySignal) {
                        for (const rec of recommendations) {
                            const recDate = new Date(rec.analysisDate);
                            const daysDiff = Math.abs((candleDate - recDate) / (1000 * 60 * 60 * 24));

                            // Рекомендация актуальна в течение 3 дней
                            if (daysDiff <= 3 && rec.recommendation === 'BUY' && rec.confidence >= strategy.minConfidence && rec.score >= strategy.minScore) {
                                entryDirection = 'BUY';
                                entryConfidence = rec.confidence;
                                entryScore = rec.score;
                                break;
                            }
                        }
                    }

                    // Вход в позицию
                    if (entryDirection && (entrySignal || (entryConfidence && entryScore))) {
                        // Рассчитываем размер позиции (максимум 10% от капитала)
                        // Используем текущий капитал с учетом открытых позиций
                        const currentTotalCapital = availableCapital + (currentPosition ? currentPosition.positionCost : 0);
                        const maxPositionSize = currentTotalCapital * 0.1;
                        const positionSize = Math.min(maxPositionSize, currentTotalCapital * (strategy.budgetAllocation / 100));
                        const quantity = Math.floor(positionSize / currentPrice);

                        if (quantity > 0) {
                            // Рассчитываем стоп-лосс
                            let stopLoss = null;
                            let targetPrice = null;

                            if (entrySignal) {
                                // Используем стоп-лосс и целевую цену из сигнала
                                stopLoss = this.convertPriceToNumber(entrySignal.stoploss);
                                targetPrice = this.convertPriceToNumber(entrySignal.targetPrice);
                            } else {
                                // Рассчитываем стоп-лосс на основе стратегии
                                if (strategy.atrMultiplier) {
                                    // Используем динамический стоп-лосс на основе ATR
                                    try {
                                        const candlesForATR = periodCandles.slice(Math.max(0, i - 30), i + 1);
                                        stopLoss = await RiskManagementService.calculateDynamicStopLoss(
                                            figi,
                                            currentPrice,
                                            strategy,
                                            entryDirection
                                        );
                                    } catch (error) {
                                        // Fallback к фиксированному проценту
                                        stopLoss = entryDirection === 'BUY'
                                            ? currentPrice * (1 - strategy.stopLossPercent / 100)
                                            : currentPrice * (1 + strategy.stopLossPercent / 100);
                                    }
                                } else {
                                    // Используем фиксированный процент
                                    stopLoss = entryDirection === 'BUY'
                                        ? currentPrice * (1 - strategy.stopLossPercent / 100)
                                        : currentPrice * (1 + strategy.stopLossPercent / 100);
                                }

                                // Рассчитываем целевую цену
                                targetPrice = entryDirection === 'BUY'
                                    ? currentPrice * (1 + strategy.takeProfitPercent / 100)
                                    : currentPrice * (1 - strategy.takeProfitPercent / 100);
                            }

                            // Определяем targetTimeframe на основе типа стратегии
                            let targetTimeframe = null;
                            if (strategy.timeframe === 'short') {
                                targetTimeframe = 7; // 1 неделя
                            } else if (strategy.timeframe === 'medium') {
                                targetTimeframe = 30; // 1 месяц
                            } else if (strategy.timeframe === 'long') {
                                targetTimeframe = 90; // 3 месяца
                            }

                            // Рассчитываем комиссию при входе
                            let entryCommission = 0;
                            try {
                                const TaxOptimizationService = (await import('./TaxOptimizationService.js')).default;
                                if (TaxOptimizationService && TaxOptimizationService.isInitialized) {
                                    const commissionInfo = TaxOptimizationService.calculateCommission(currentPrice, quantity);
                                    entryCommission = commissionInfo.amount;
                                } else {
                                    // Fallback к простому расчету
                                    const TinkoffApiService = (await import('./TinkoffApiService.js')).default;
                                    const commissionInfo = TinkoffApiService.calculateCommission(currentPrice, quantity);
                                    entryCommission = commissionInfo.amount || 0;
                                }
                            } catch (error) {
                                if (LoggerService.isInitialized) {
                                    LoggerService.warn('⚠️ Could not calculate commission in backtesting:', {error});
                                }
                            }

                            const positionCost = quantity * currentPrice + entryCommission;

                            currentPosition = {
                                figi: figi,
                                ticker: ticker,
                                entryDate: candleDate,
                                entryPrice: currentPrice,
                                quantity: quantity,
                                direction: entryDirection,
                                stopLoss: stopLoss,
                                targetPrice: targetPrice,
                                signalId: entrySignal?.signalId || null,
                                signalEndDt: entrySignal ? new Date(entrySignal.endDt) : null,
                                targetTimeframe: targetTimeframe,
                                positionCost: positionCost,
                                entryCommission: entryCommission
                            };

                            // Резервируем средства для позиции (включая комиссию)
                            availableCapital -= positionCost;

                            // Обновляем кривую капитала (пока без unrealized PnL)
                            equityCurve.push({
                                date: candleDate,
                                value: availableCapital + positionCost
                            });
                        }
                    }
                }
            }

            // Закрываем открытую позицию в конце периода
            if (currentPosition && periodCandles.length > 0) {
                const lastCandle = periodCandles[periodCandles.length - 1];
                const exitPrice = lastCandle.close;

                // Рассчитываем комиссию при выходе
                let exitCommission = 0;
                try {
                    const TaxOptimizationService = (await import('./TaxOptimizationService.js')).default;
                    if (TaxOptimizationService && TaxOptimizationService.isInitialized) {
                        const commissionInfo = TaxOptimizationService.calculateCommission(exitPrice, currentPosition.quantity);
                        exitCommission = commissionInfo.amount;
                    } else {
                        // Fallback к простому расчету
                        const TinkoffApiService = (await import('./TinkoffApiService.js')).default;
                        const commissionInfo = TinkoffApiService.calculateCommission(exitPrice, currentPosition.quantity);
                        exitCommission = commissionInfo.amount || 0;
                    }
                } catch (error) {
                    if (LoggerService.isInitialized) {
                        LoggerService.warn('⚠️ Could not calculate exit commission in backtesting:', {error});
                    }
                }

                const entryCommission = currentPosition.entryCommission || 0;
                const totalCommission = entryCommission + exitCommission;

                // PnL с учетом комиссий
                const grossPnl = currentPosition.direction === 'BUY'
                    ? (exitPrice - currentPosition.entryPrice) * currentPosition.quantity
                    : (currentPosition.entryPrice - exitPrice) * currentPosition.quantity;
                const pnl = grossPnl - totalCommission;

                const pnlPercent = currentPosition.direction === 'BUY'
                    ? ((exitPrice - currentPosition.entryPrice) / currentPosition.entryPrice) * 100
                    : ((currentPosition.entryPrice - exitPrice) / currentPosition.entryPrice) * 100;

                // Возвращаем капитал от позиции (без комиссии входа, она уже учтена) и добавляем PnL
                const positionCostWithoutCommission = currentPosition.quantity * currentPosition.entryPrice;
                availableCapital += positionCostWithoutCommission + pnl;
                const finalCapital = availableCapital;

                trades.push({
                    figi: figi,
                    ticker: ticker,
                    entryDate: currentPosition.entryDate,
                    exitDate: new Date(lastCandle.time),
                    entryPrice: currentPosition.entryPrice,
                    exitPrice: exitPrice,
                    quantity: currentPosition.quantity,
                    direction: currentPosition.direction,
                    pnl: pnl,
                    pnlPercent: pnlPercent,
                    entryCommission: entryCommission,
                    exitCommission: exitCommission,
                    totalCommission: totalCommission,
                    exitReason: 'period_end',
                    signalId: currentPosition.signalId
                });

                equityCurve.push({
                    date: new Date(lastCandle.time),
                    value: finalCapital
                });
            }

            const finalCapital = equityCurve.length > 0
                ? equityCurve[equityCurve.length - 1].value
                : availableCapital;

            return {
                trades: trades,
                equityCurve: equityCurve,
                finalCapital: finalCapital,
                totalTrades: trades.length
            };
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error(`❌ Error simulating trading for ${figi}:`, {error});
            }
            throw error;
        }
    }

    /**
     * Расчет метрик производительности на основе сделок и кривой капитала
     * @param {Array} trades - Массив сделок
     * @param {Array} equityCurve - Кривая капитала [{date, value}]
     * @param {number} initialCapital - Начальный капитал
     * @returns {Object} - Метрики производительности
     */
    calculateMetrics(trades, equityCurve, initialCapital) {
        if (!trades || trades.length === 0) {
            return {
                totalReturn: 0,
                totalProfit: 0,
                totalTrades: 0,
                winRate: 0,
                avgWin: 0,
                avgLoss: 0,
                profitFactor: 0,
                sharpeRatio: 0,
                maxDrawdown: 0,
                maxDrawdownDuration: 0,
                volatility: 0,
                calmarRatio: 0,
                sortinoRatio: 0
            };
        }

        const finalCapital = equityCurve.length > 0 ? equityCurve[equityCurve.length - 1].value : initialCapital;
        const totalReturn = ((finalCapital - initialCapital) / initialCapital) * 100;
        const totalProfit = finalCapital - initialCapital;

        // Статистика по сделкам
        const profitableTrades = trades.filter(t => t.pnl > 0);
        const losingTrades = trades.filter(t => t.pnl < 0);
        const winRate = trades.length > 0 ? (profitableTrades.length / trades.length) * 100 : 0;

        const totalWin = profitableTrades.reduce((sum, t) => sum + t.pnl, 0);
        const totalLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));
        const avgWin = profitableTrades.length > 0 ? totalWin / profitableTrades.length : 0;
        const avgLoss = losingTrades.length > 0 ? totalLoss / losingTrades.length : 0;
        const profitFactor = totalLoss > 0 ? totalWin / totalLoss : (totalWin > 0 ? Infinity : 0);

        // Расчет доходностей для каждого периода
        const returns = [];
        for (let i = 1; i < equityCurve.length; i++) {
            const prevValue = equityCurve[i - 1].value;
            const currValue = equityCurve[i].value;
            if (prevValue > 0) {
                const periodReturn = ((currValue - prevValue) / prevValue) * 100;
                returns.push(periodReturn);
            }
        }

        // Волатильность (стандартное отклонение доходностей)
        const avgReturn = returns.length > 0 ? returns.reduce((sum, r) => sum + r, 0) / returns.length : 0;
        const variance = returns.length > 0
            ? returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
            : 0;
        const volatility = Math.sqrt(variance);

        // Sharpe Ratio (годовая доходность / волатильность)
        const annualReturn = avgReturn * 252; // Предполагаем 252 торговых дня в году
        const sharpeRatio = volatility > 0 ? (annualReturn - this.riskFreeRate * 100) / (volatility * Math.sqrt(252)) : 0;

        // Максимальная просадка
        let maxDrawdown = 0;
        let maxDrawdownDuration = 0;
        let peak = initialCapital;
        let drawdownStart = null;

        for (const point of equityCurve) {
            if (point.value > peak) {
                peak = point.value;
                drawdownStart = null;
            } else {
                const drawdown = ((peak - point.value) / peak) * 100;
                if (drawdown > maxDrawdown) {
                    maxDrawdown = drawdown;
                }
                if (drawdownStart === null) {
                    drawdownStart = point.date;
                }
            }
        }

        // Длительность максимальной просадки (в днях)
        if (drawdownStart && equityCurve.length > 0) {
            const drawdownEnd = equityCurve[equityCurve.length - 1].date;
            const startDate = new Date(drawdownStart);
            const endDate = new Date(drawdownEnd);
            maxDrawdownDuration = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
        }

        // Calmar Ratio (годовая доходность / максимальная просадка)
        const calmarRatio = maxDrawdown > 0 ? annualReturn / maxDrawdown : 0;

        // Sortino Ratio (использует только отрицательные доходности)
        const negativeReturns = returns.filter(r => r < 0);
        const downsideVariance = negativeReturns.length > 0
            ? negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / negativeReturns.length
            : 0;
        const downsideDeviation = Math.sqrt(downsideVariance);
        const sortinoRatio = downsideDeviation > 0
            ? (annualReturn - this.riskFreeRate * 100) / (downsideDeviation * Math.sqrt(252))
            : 0;

        return {
            totalReturn,
            totalProfit,
            totalTrades: trades.length,
            winRate,
            avgWin,
            avgLoss,
            profitFactor: isFinite(profitFactor) ? profitFactor : 0,
            sharpeRatio,
            maxDrawdown,
            maxDrawdownDuration,
            volatility,
            calmarRatio,
            sortinoRatio
        };
    }

    /**
     * Расчет месячных доходностей из кривой капитала
     * @param {Array} equityCurve - Кривая капитала [{date, value}]
     * @returns {Array} - Массив {month, return}
     */
    calculateMonthlyReturns(equityCurve) {
        if (!equityCurve || equityCurve.length === 0) {
            return [];
        }

        const monthlyReturns = [];
        const monthlyData = new Map(); // month -> {startValue, endValue}

        for (const point of equityCurve) {
            const date = new Date(point.date);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

            if (!monthlyData.has(monthKey)) {
                monthlyData.set(monthKey, {
                    startValue: point.value,
                    endValue: point.value,
                    startDate: date
                });
            } else {
                const monthData = monthlyData.get(monthKey);
                monthData.endValue = point.value;
                // Обновляем дату начала, если это первая точка месяца
                if (date < monthData.startDate) {
                    monthData.startDate = date;
                    monthData.startValue = point.value;
                }
            }
        }

        // Рассчитываем доходности для каждого месяца
        for (const [month, data] of monthlyData.entries()) {
            if (data.startValue > 0) {
                const monthlyReturn = ((data.endValue - data.startValue) / data.startValue) * 100;
                monthlyReturns.push({
                    month: month,
                    return: monthlyReturn,
                    startValue: data.startValue,
                    endValue: data.endValue
                });
            }
        }

        return monthlyReturns.sort((a, b) => a.month.localeCompare(b.month));
    }

    /**
     * Полный бэктестинг стратегии на исторических данных
     * @param {number} strategyId - ID стратегии для тестирования
     * @param {Object} options - Опции бэктестинга
     * @param {Date} options.startDate - Дата начала теста (по умолчанию: 6 месяцев назад)
     * @param {Date} options.endDate - Дата окончания теста (по умолчанию: сейчас)
     * @param {number} options.initialCapital - Начальный капитал (по умолчанию: из настроек портфеля)
     * @param {Array<string>} options.instruments - Список FIGI для тестирования (по умолчанию: все активные инструменты)
     * @param {number} options.maxInstruments - Максимальное количество инструментов для тестирования (по умолчанию: 50)
     * @returns {Promise<Object>} - Результат бэктестинга
     */
    async backtestStrategy(strategyId, options = {}) {
        const startTime = Date.now();

        try {
            // Получаем стратегию
            const strategy = await TradingStrategy.findByPk(strategyId);
            if (!strategy) {
                throw new Error(`Strategy with ID ${strategyId} not found`);
            }

            if (!strategy.isActive) {
                throw new Error(`Strategy ${strategy.name} is not active`);
            }

            // Определяем параметры периода
            const endDate = options.endDate || new Date();
            const startDate = options.startDate || (() => {
                const date = new Date(endDate);
                date.setMonth(date.getMonth() - 6); // 6 месяцев назад
                return date;
            })();

            // Определяем начальный капитал
            let initialCapital = options.initialCapital;
            if (!initialCapital) {
                const SettingsService = (await import('./SettingsService.js')).default;
                const portfolioSettings = await SettingsService.getPortfolioSettings();
                initialCapital = portfolioSettings.user_max_portfolio_budget || 1000000;
            }

            // Получаем список инструментов для тестирования
            let instruments = options.instruments || [];
            if (instruments.length === 0) {
                // Получаем все активные инструменты с достаточным количеством данных
                const allInstruments = await CacheService.getAllInstruments();
                const maxInstruments = options.maxInstruments || 50;

                // Фильтруем инструменты с достаточным количеством свечей
                const instrumentsWithData = [];
                for (const instrument of allInstruments.slice(0, maxInstruments * 2)) { // Берем больше для фильтрации
                    const candleCount = await CachedCandle.count({
                        where: {
                            figi: instrument.figi,
                            interval: 'DAY',
                            time: {
                                [Op.between]: [startDate, endDate]
                            }
                        }
                    });

                    if (candleCount >= 20) { // Минимум 20 свечей за период
                        instrumentsWithData.push(instrument.figi);
                        if (instrumentsWithData.length >= maxInstruments) {
                            break;
                        }
                    }
                }

                instruments = instrumentsWithData;
            }

            if (instruments.length === 0) {
                throw new Error('No instruments with sufficient data found for backtesting');
            }

            // Распределяем капитал между инструментами
            const capitalPerInstrument = initialCapital / instruments.length;

            // Симулируем торговлю на каждом инструменте
            const allTrades = [];
            const allEquityCurves = [];
            let totalFinalCapital = 0;
            const instrumentResults = [];

            for (let i = 0; i < instruments.length; i++) {
                const figi = instruments[i];
                try {
                    const result = await this.simulateTrading(
                        figi,
                        strategy,
                        startDate,
                        endDate,
                        capitalPerInstrument
                    );

                    allTrades.push(...result.trades);
                    allEquityCurves.push(...result.equityCurve.map(point => ({
                        ...point,
                        figi: figi
                    })));
                    totalFinalCapital += result.finalCapital;

                    instrumentResults.push({
                        figi: figi,
                        trades: result.trades.length,
                        finalCapital: result.finalCapital,
                        return: ((result.finalCapital - capitalPerInstrument) / capitalPerInstrument) * 100
                    });
                } catch (error) {
                    if (LoggerService.isInitialized) {
                        LoggerService.error(`❌ Error testing ${figi}:`, {error});
                    }
                    // Продолжаем с другими инструментами
                    totalFinalCapital += capitalPerInstrument; // Возвращаем капитал
                }
            }

            // Объединяем кривые капитала по датам
            const combinedEquityCurve = this.combineEquityCurves(allEquityCurves, startDate, endDate, initialCapital);

            // Рассчитываем метрики
            const metrics = this.calculateMetrics(allTrades, combinedEquityCurve, initialCapital);

            // Рассчитываем месячные доходности
            const monthlyReturns = this.calculateMonthlyReturns(combinedEquityCurve);

            // Генерируем предупреждения
            const alerts = this.generateAlerts(metrics, strategy);

            // Генерируем отчет
            const report = this.generateReport({
                strategyId: strategy.id,
                strategyName: strategy.name,
                period: {startDate, endDate},
                metrics,
                trades: allTrades,
                equityCurve: combinedEquityCurve,
                monthlyReturns,
                instrumentResults,
                alerts
            });

            const executionTime = Date.now() - startTime;

            const result = {
                strategyId: strategy.id,
                strategyName: strategy.name,
                period: {startDate, endDate},
                metrics,
                trades: allTrades,
                equityCurve: combinedEquityCurve,
                monthlyReturns,
                instrumentResults,
                alerts,
                report,
                executionTime,
                initialCapital,
                finalCapital: totalFinalCapital
            };

            // Сохраняем результат в БД (если не указано иное)
            if (options.saveToDb !== false) {
                try {
                    await this.saveBacktestResult(result, 'full');
                } catch (saveError) {
                    if (LoggerService.isInitialized) {
                        LoggerService.error(`⚠️ Failed to save result to database:`, {saveError});
                    }
                }
            }

            return result;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error(`❌ Error in backtestStrategy:`, {error});
            }
            throw error;
        }
    }

    /**
     * Объединение кривых капитала от разных инструментов
     * @param {Array} equityCurves - Массив кривых капитала с полем figi
     * @param {Date} startDate - Дата начала
     * @param {Date} endDate - Дата окончания
     * @param {number} initialCapital - Начальный капитал
     * @returns {Array} - Объединенная кривая капитала
     */
    combineEquityCurves(equityCurves, startDate, endDate, initialCapital) {
        // Группируем точки по датам
        const pointsByDate = new Map();

        for (const point of equityCurves) {
            const dateKey = new Date(point.date).toISOString().split('T')[0]; // YYYY-MM-DD

            if (!pointsByDate.has(dateKey)) {
                pointsByDate.set(dateKey, []);
            }
            pointsByDate.get(dateKey).push(point.value);
        }

        // Создаем объединенную кривую
        const combinedCurve = [];
        let currentCapital = initialCapital;

        // Сортируем даты
        const sortedDates = Array.from(pointsByDate.keys()).sort();

        for (const dateKey of sortedDates) {
            const values = pointsByDate.get(dateKey);
            // Суммируем значения от всех инструментов
            const totalValue = values.reduce((sum, val) => sum + val, 0);

            // Обновляем капитал (берем последнее значение дня)
            currentCapital = totalValue;

            combinedCurve.push({
                date: new Date(dateKey),
                value: currentCapital
            });
        }

        // Если кривая пустая, добавляем начальную точку
        if (combinedCurve.length === 0) {
            combinedCurve.push({date: startDate, value: initialCapital});
        }

        return combinedCurve.sort((a, b) => new Date(a.date) - new Date(b.date));
    }

    /**
     * Генерация предупреждений на основе метрик
     * @param {Object} metrics - Метрики производительности
     * @param {Object} strategy - Объект стратегии
     * @returns {Array} - Массив предупреждений
     */
    generateAlerts(metrics, strategy) {
        const alerts = [];

        // Проверка Win Rate
        if (metrics.winRate < 40) {
            alerts.push({
                type: 'warning',
                severity: 'high',
                message: `Низкий Win Rate: ${metrics.winRate.toFixed(2)}% (рекомендуется > 50%)`
            });
        }

        // Проверка Sharpe Ratio
        if (metrics.sharpeRatio < 0.5) {
            alerts.push({
                type: 'warning',
                severity: 'high',
                message: `Низкий Sharpe Ratio: ${metrics.sharpeRatio.toFixed(2)} (рекомендуется > 1.0)`
            });
        }

        // Проверка Max Drawdown
        if (metrics.maxDrawdown > 30) {
            alerts.push({
                type: 'warning',
                severity: 'critical',
                message: `Высокая максимальная просадка: ${metrics.maxDrawdown.toFixed(2)}% (критично > 30%)`
            });
        }

        // Проверка Profit Factor
        if (metrics.profitFactor < 1.0) {
            alerts.push({
                type: 'warning',
                severity: 'high',
                message: `Profit Factor ниже 1.0: ${metrics.profitFactor.toFixed(2)} (убыточная стратегия)`
            });
        }

        // Проверка общей доходности
        if (metrics.totalReturn < 0) {
            alerts.push({
                type: 'error',
                severity: 'critical',
                message: `Отрицательная доходность: ${metrics.totalReturn.toFixed(2)}%`
            });
        }

        // Проверка количества сделок
        if (metrics.totalTrades < 10) {
            alerts.push({
                type: 'info',
                severity: 'low',
                message: `Мало сделок: ${metrics.totalTrades} (рекомендуется > 30 для статистической значимости)`
            });
        }

        return alerts;
    }

    /**
     * Генерация текстового отчета о бэктестинге
     * @param {Object} data - Данные для отчета
     * @returns {string} - Текстовый отчет в формате Markdown
     */
    generateReport(data) {
        const {strategyName, period, metrics, trades, monthlyReturns, instrumentResults, alerts} = data;

        let report = `# Отчет о бэктестинге стратегии "${strategyName}"\n\n`;
        report += `**Период тестирования:** ${period.startDate.toLocaleDateString('ru-RU')} - ${period.endDate.toLocaleDateString('ru-RU')}\n\n`;

        report += `## Основные метрики\n\n`;
        report += `- **Общая доходность:** ${metrics.totalReturn.toFixed(2)}%\n`;
        report += `- **Общая прибыль:** ${metrics.totalProfit.toLocaleString('ru-RU')} ₽\n`;
        report += `- **Количество сделок:** ${metrics.totalTrades}\n`;
        report += `- **Win Rate:** ${metrics.winRate.toFixed(2)}%\n`;
        report += `- **Profit Factor:** ${metrics.profitFactor.toFixed(2)}\n`;
        report += `- **Sharpe Ratio:** ${metrics.sharpeRatio.toFixed(2)}\n`;
        report += `- **Max Drawdown:** ${metrics.maxDrawdown.toFixed(2)}%\n`;
        report += `- **Calmar Ratio:** ${metrics.calmarRatio.toFixed(2)}\n`;
        report += `- **Sortino Ratio:** ${metrics.sortinoRatio.toFixed(2)}\n\n`;

        if (monthlyReturns.length > 0) {
            report += `## Месячные доходности\n\n`;
            report += `| Месяц | Доходность |\n`;
            report += `|-------|------------|\n`;
            for (const monthReturn of monthlyReturns) {
                report += `| ${monthReturn.month} | ${monthReturn.return.toFixed(2)}% |\n`;
            }
            report += `\n`;
        }

        if (instrumentResults.length > 0) {
            report += `## Результаты по инструментам\n\n`;
            report += `| Инструмент | Сделок | Доходность |\n`;
            report += `|------------|--------|------------|\n`;
            for (const result of instrumentResults.slice(0, 10)) { // Показываем топ-10
                report += `| ${result.figi} | ${result.trades} | ${result.return.toFixed(2)}% |\n`;
            }
            if (instrumentResults.length > 10) {
                report += `| ... | ... | ... |\n`;
            }
            report += `\n`;
        }

        if (alerts.length > 0) {
            report += `## Предупреждения\n\n`;
            for (const alert of alerts) {
                const emoji = alert.severity === 'critical' ? '🔴' : alert.severity === 'high' ? '🟠' : '🟡';
                report += `${emoji} **${alert.type.toUpperCase()}:** ${alert.message}\n`;
            }
            report += `\n`;
        }

        report += `---\n`;
        report += `*Отчет сгенерирован автоматически системой бэктестинга*\n`;

        return report;
    }

    /**
     * Сохранение результата бэктестинга в БД
     * @param {Object} result - Результат бэктестинга
     * @param {string} backtestType - Тип бэктестинга ('full' или 'walk_forward')
     * @returns {Promise<BacktestResult>} - Сохраненный результат
     */
    async saveBacktestResult(result, backtestType = 'full') {
        try {
            const backtestResult = await BacktestResult.create({
                strategyId: result.strategyId,
                backtestType: backtestType,
                startDate: result.period.startDate,
                endDate: result.period.endDate,
                initialCapital: result.initialCapital,
                finalCapital: result.finalCapital,
                totalReturn: result.metrics.totalReturn,
                totalTrades: result.metrics.totalTrades,
                winRate: result.metrics.winRate,
                sharpeRatio: result.metrics.sharpeRatio,
                maxDrawdown: result.metrics.maxDrawdown,
                profitFactor: result.metrics.profitFactor,
                calmarRatio: result.metrics.calmarRatio,
                sortinoRatio: result.metrics.sortinoRatio,
                metrics: result.metrics,
                trades: result.trades,
                equityCurve: result.equityCurve,
                monthlyReturns: result.monthlyReturns || [],
                report: result.report || '',
                alerts: result.alerts || [],
                status: 'completed',
                executionTime: result.executionTime || 0
            });

            return backtestResult;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('❌ Error saving backtest result:', {error});
            }
            throw error;
        }
    }

    /**
     * Walk-forward анализ стратегии
     * Разбивает период на несколько окон и анализирует стабильность производительности
     * @param {number} strategyId - ID стратегии для тестирования
     * @param {Object} options - Опции анализа
     * @param {Date} options.startDate - Дата начала анализа (по умолчанию: 12 месяцев назад)
     * @param {Date} options.endDate - Дата окончания анализа (по умолчанию: сейчас)
     * @param {number} options.windowSizeMonths - Размер окна в месяцах (по умолчанию: 3)
     * @param {number} options.stepSizeMonths - Шаг смещения окна в месяцах (по умолчанию: 1)
     * @param {number} options.initialCapital - Начальный капитал для каждого окна
     * @param {Array<string>} options.instruments - Список FIGI для тестирования
     * @returns {Promise<Object>} - Результат walk-forward анализа
     */
    async walkForwardAnalysis(strategyId, options = {}) {
        const startTime = Date.now();

        try {
            // Получаем стратегию
            const strategy = await TradingStrategy.findByPk(strategyId);
            if (!strategy) {
                throw new Error(`Strategy with ID ${strategyId} not found`);
            }

            if (!strategy.isActive) {
                throw new Error(`Strategy ${strategy.name} is not active`);
            }

            // Определяем параметры периода
            const endDate = options.endDate || new Date();
            const startDate = options.startDate || (() => {
                const date = new Date(endDate);
                date.setMonth(date.getMonth() - 12); // 12 месяцев назад
                return date;
            })();

            // Параметры окон
            const windowSizeMonths = options.windowSizeMonths || 3;
            const stepSizeMonths = options.stepSizeMonths || 1;

            // Определяем начальный капитал
            let initialCapital = options.initialCapital;
            if (!initialCapital) {
                const SettingsService = (await import('./SettingsService.js')).default;
                const portfolioSettings = await SettingsService.getPortfolioSettings();
                initialCapital = portfolioSettings.user_max_portfolio_budget || 1000000;
            }

            // Создаем окна для анализа
            const windows = this.createTimeWindows(startDate, endDate, windowSizeMonths, stepSizeMonths);

            if (windows.length === 0) {
                throw new Error('No time windows created. Period too short or invalid parameters.');
            }

            // Выполняем бэктестинг для каждого окна
            const windowResults = [];
            for (let i = 0; i < windows.length; i++) {
                const window = windows[i];
                try {
                    const result = await this.backtestStrategy(strategyId, {
                        startDate: window.startDate,
                        endDate: window.endDate,
                        initialCapital: initialCapital,
                        instruments: options.instruments,
                        maxInstruments: options.maxInstruments,
                        saveToDb: false // Не сохраняем отдельные окна в БД
                    });

                    windowResults.push({
                        windowIndex: i + 1,
                        startDate: window.startDate,
                        endDate: window.endDate,
                        metrics: result.metrics,
                        totalTrades: result.metrics.totalTrades,
                        totalReturn: result.metrics.totalReturn,
                        winRate: result.metrics.winRate,
                        sharpeRatio: result.metrics.sharpeRatio,
                        maxDrawdown: result.metrics.maxDrawdown,
                        profitFactor: result.metrics.profitFactor
                    });

                } catch (windowError) {
                    if (LoggerService.isInitialized) {
                        LoggerService.error(`❌ Error testing window ${i + 1}:`, {windowError});
                    }
                    // Продолжаем с другими окнами
                }
            }

            if (windowResults.length === 0) {
                throw new Error('No successful window results');
            }

            // Анализируем стабильность и деградацию
            const stabilityAnalysis = this.analyzeStability(windowResults);
            const degradationAnalysis = this.analyzeDegradation(windowResults);

            // Генерируем отчет
            const report = this.generateWalkForwardReport({
                strategyId: strategy.id,
                strategyName: strategy.name,
                period: {startDate, endDate},
                windowSizeMonths,
                stepSizeMonths,
                windowResults,
                stabilityAnalysis,
                degradationAnalysis
            });

            // Генерируем предупреждения
            const alerts = this.generateWalkForwardAlerts(stabilityAnalysis, degradationAnalysis);

            const executionTime = Date.now() - startTime;

            const result = {
                strategyId: strategy.id,
                strategyName: strategy.name,
                period: {startDate, endDate},
                windowSizeMonths,
                stepSizeMonths,
                windowResults,
                stabilityAnalysis,
                degradationAnalysis,
                alerts,
                report,
                executionTime
            };

            // Сохраняем результат в БД
            if (options.saveToDb !== false) {
                try {
                    await this.saveWalkForwardResult(result);
                } catch (saveError) {
                    if (LoggerService.isInitialized) {
                        LoggerService.error(`⚠️ Failed to save result to database:`, {saveError});
                    }
                }
            }

            return result;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error(`❌ Error in walkForwardAnalysis:`, {error});
            }
            throw error;
        }
    }

    /**
     * Создание временных окон для walk-forward анализа
     * @param {Date} startDate - Дата начала периода
     * @param {Date} endDate - Дата окончания периода
     * @param {number} windowSizeMonths - Размер окна в месяцах
     * @param {number} stepSizeMonths - Шаг смещения окна в месяцах
     * @returns {Array} - Массив окон {startDate, endDate}
     */
    createTimeWindows(startDate, endDate, windowSizeMonths, stepSizeMonths) {
        const windows = [];
        const currentStart = new Date(startDate);
        const windowSizeMs = windowSizeMonths * 30 * 24 * 60 * 60 * 1000; // Приблизительно

        while (currentStart.getTime() + windowSizeMs <= endDate.getTime()) {
            const windowEnd = new Date(currentStart.getTime() + windowSizeMs);
            if (windowEnd > endDate) {
                windowEnd.setTime(endDate.getTime());
            }

            windows.push({
                startDate: new Date(currentStart),
                endDate: new Date(windowEnd)
            });

            // Перемещаем окно на шаг вперед
            currentStart.setMonth(currentStart.getMonth() + stepSizeMonths);
        }

        return windows;
    }

    /**
     * Анализ стабильности метрик между окнами
     * @param {Array} windowResults - Результаты бэктестинга для каждого окна
     * @returns {Object} - Анализ стабильности
     */
    analyzeStability(windowResults) {
        if (windowResults.length === 0) {
            return {
                averageReturn: 0,
                stdDevReturn: 0,
                consistency: 0,
                averageWinRate: 0,
                averageSharpeRatio: 0,
                averageMaxDrawdown: 0,
                averageProfitFactor: 0
            };
        }

        const returns = windowResults.map(r => r.totalReturn);
        const winRates = windowResults.map(r => r.winRate);
        const sharpeRatios = windowResults.map(r => r.sharpeRatio || 0);
        const maxDrawdowns = windowResults.map(r => r.maxDrawdown);
        const profitFactors = windowResults.map(r => r.profitFactor || 0);

        // Средние значения
        const averageReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        const averageWinRate = winRates.reduce((sum, r) => sum + r, 0) / winRates.length;
        const averageSharpeRatio = sharpeRatios.reduce((sum, r) => sum + r, 0) / sharpeRatios.length;
        const averageMaxDrawdown = maxDrawdowns.reduce((sum, r) => sum + r, 0) / maxDrawdowns.length;
        const averageProfitFactor = profitFactors.reduce((sum, r) => sum + r, 0) / profitFactors.length;

        // Стандартное отклонение
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - averageReturn, 2), 0) / returns.length;
        const stdDevReturn = Math.sqrt(variance);

        // Консистентность (1 - коэффициент вариации, нормализовано)
        const coefficientOfVariation = averageReturn !== 0 ? stdDevReturn / Math.abs(averageReturn) : 1;
        const consistency = Math.max(0, Math.min(1, 1 - coefficientOfVariation));

        return {
            averageReturn,
            stdDevReturn,
            consistency,
            averageWinRate,
            averageSharpeRatio,
            averageMaxDrawdown,
            averageProfitFactor,
            windowCount: windowResults.length
        };
    }

    /**
     * Анализ деградации производительности
     * Сравнивает метрики последних окон с первыми
     * @param {Array} windowResults - Результаты бэктестинга для каждого окна
     * @returns {Object} - Анализ деградации
     */
    analyzeDegradation(windowResults) {
        if (windowResults.length < 3) {
            return {
                isDegrading: false,
                severity: 'none',
                reasons: [],
                firstHalfMetrics: null,
                lastHalfMetrics: null
            };
        }

        // Разделяем окна на первую и вторую половину
        const midPoint = Math.floor(windowResults.length / 2);
        const firstHalf = windowResults.slice(0, midPoint);
        const lastHalf = windowResults.slice(midPoint);

        // Рассчитываем средние метрики для каждой половины
        const firstHalfMetrics = {
            averageReturn: firstHalf.reduce((sum, r) => sum + r.totalReturn, 0) / firstHalf.length,
            averageWinRate: firstHalf.reduce((sum, r) => sum + r.winRate, 0) / firstHalf.length,
            averageSharpeRatio: firstHalf.reduce((sum, r) => sum + (r.sharpeRatio || 0), 0) / firstHalf.length,
            averageMaxDrawdown: firstHalf.reduce((sum, r) => sum + r.maxDrawdown, 0) / firstHalf.length
        };

        const lastHalfMetrics = {
            averageReturn: lastHalf.reduce((sum, r) => sum + r.totalReturn, 0) / lastHalf.length,
            averageWinRate: lastHalf.reduce((sum, r) => sum + r.winRate, 0) / lastHalf.length,
            averageSharpeRatio: lastHalf.reduce((sum, r) => sum + (r.sharpeRatio || 0), 0) / lastHalf.length,
            averageMaxDrawdown: lastHalf.reduce((sum, r) => sum + r.maxDrawdown, 0) / lastHalf.length
        };

        // Анализируем последние 3 окна для критических проверок
        const lastThreeWindows = windowResults.slice(-3);
        const reasons = [];
        let severity = 'none';

        // Критические проверки (автоматическое отключение)
        if (lastThreeWindows.length >= 3) {
            const lastThreeWinRate = lastThreeWindows.reduce((sum, r) => sum + r.winRate, 0) / lastThreeWindows.length;
            const lastThreeSharpe = lastThreeWindows.reduce((sum, r) => sum + (r.sharpeRatio || 0), 0) / lastThreeWindows.length;
            const lastThreeDrawdown = lastThreeWindows.reduce((sum, r) => sum + r.maxDrawdown, 0) / lastThreeWindows.length;
            const lastThreeReturn = lastThreeWindows.reduce((sum, r) => sum + r.totalReturn, 0) / lastThreeWindows.length;

            if (lastThreeWinRate < 40) {
                reasons.push(`Win Rate упал ниже 40% в последних 3 окнах: ${lastThreeWinRate.toFixed(2)}%`);
                severity = 'critical';
            }
            if (lastThreeSharpe < 0.5) {
                reasons.push(`Sharpe Ratio упал ниже 0.5 в последних 3 окнах: ${lastThreeSharpe.toFixed(2)}`);
                severity = 'critical';
            }
            if (lastThreeDrawdown > 30) {
                reasons.push(`Max Drawdown превысил 30% в последних 3 окнах: ${lastThreeDrawdown.toFixed(2)}%`);
                severity = 'critical';
            }
            if (lastThreeReturn < 0) {
                reasons.push(`Total Return отрицательный в последних 3 окнах: ${lastThreeReturn.toFixed(2)}%`);
                severity = 'critical';
            }
        }

        // Предупреждения (требуют внимания)
        if (severity !== 'critical' && lastHalf.length >= 2) {
            const lastTwoWindows = windowResults.slice(-2);
            const lastTwoWinRate = lastTwoWindows.reduce((sum, r) => sum + r.winRate, 0) / lastTwoWindows.length;
            const lastTwoSharpe = lastTwoWindows.reduce((sum, r) => sum + (r.sharpeRatio || 0), 0) / lastTwoWindows.length;
            const lastTwoDrawdown = lastTwoWindows.reduce((sum, r) => sum + r.maxDrawdown, 0) / lastTwoWindows.length;

            if (lastTwoWinRate < 50) {
                reasons.push(`Win Rate упал ниже 50% в последних 2 окнах: ${lastTwoWinRate.toFixed(2)}%`);
                severity = severity === 'none' ? 'warning' : severity;
            }
            if (lastTwoSharpe < 1.0) {
                reasons.push(`Sharpe Ratio упал ниже 1.0 в последних 2 окнах: ${lastTwoSharpe.toFixed(2)}`);
                severity = severity === 'none' ? 'warning' : severity;
            }
            if (lastTwoDrawdown > 20) {
                reasons.push(`Max Drawdown превысил 20% в последних 2 окнах: ${lastTwoDrawdown.toFixed(2)}%`);
                severity = severity === 'none' ? 'warning' : severity;
            }
        }

        // Проверка общей деградации
        const returnDegradation = firstHalfMetrics.averageReturn - lastHalfMetrics.averageReturn;
        const winRateDegradation = firstHalfMetrics.averageWinRate - lastHalfMetrics.averageWinRate;
        const sharpeDegradation = firstHalfMetrics.averageSharpeRatio - lastHalfMetrics.averageSharpeRatio;

        if (returnDegradation > 10 || winRateDegradation > 15 || sharpeDegradation > 1.0) {
            if (severity === 'none') {
                severity = 'warning';
            }
            reasons.push(`Общая деградация метрик: Return -${returnDegradation.toFixed(2)}%, Win Rate -${winRateDegradation.toFixed(2)}%, Sharpe -${sharpeDegradation.toFixed(2)}`);
        }

        return {
            isDegrading: severity !== 'none',
            severity,
            reasons,
            firstHalfMetrics,
            lastHalfMetrics,
            returnDegradation,
            winRateDegradation,
            sharpeDegradation
        };
    }

    /**
     * Генерация отчета по walk-forward анализу
     * @param {Object} data - Данные для отчета
     * @returns {string} - Текстовый отчет в формате Markdown
     */
    generateWalkForwardReport(data) {
        const {
            strategyName,
            period,
            windowSizeMonths,
            stepSizeMonths,
            windowResults,
            stabilityAnalysis,
            degradationAnalysis
        } = data;

        let report = `# Walk-Forward анализ стратегии "${strategyName}"\n\n`;
        report += `**Период анализа:** ${period.startDate.toLocaleDateString('ru-RU')} - ${period.endDate.toLocaleDateString('ru-RU')}\n`;
        report += `**Размер окна:** ${windowSizeMonths} месяцев\n`;
        report += `**Шаг смещения:** ${stepSizeMonths} месяцев\n`;
        report += `**Количество окон:** ${windowResults.length}\n\n`;

        report += `## Анализ стабильности\n\n`;
        report += `- **Средняя доходность:** ${stabilityAnalysis.averageReturn.toFixed(2)}%\n`;
        report += `- **Стандартное отклонение:** ${stabilityAnalysis.stdDevReturn.toFixed(2)}%\n`;
        report += `- **Консистентность:** ${stabilityAnalysis.consistency.toFixed(2)} (${(stabilityAnalysis.consistency * 100).toFixed(0)}%)\n`;
        report += `- **Средний Win Rate:** ${stabilityAnalysis.averageWinRate.toFixed(2)}%\n`;
        report += `- **Средний Sharpe Ratio:** ${stabilityAnalysis.averageSharpeRatio.toFixed(2)}\n`;
        report += `- **Средний Max Drawdown:** ${stabilityAnalysis.averageMaxDrawdown.toFixed(2)}%\n`;
        report += `- **Средний Profit Factor:** ${stabilityAnalysis.averageProfitFactor.toFixed(2)}\n\n`;

        report += `## Анализ деградации\n\n`;
        if (degradationAnalysis.isDegrading) {
            report += `⚠️ **Обнаружена деградация производительности**\n\n`;
            report += `**Уровень серьезности:** ${degradationAnalysis.severity === 'critical' ? '🔴 КРИТИЧЕСКИЙ' : '🟠 ПРЕДУПРЕЖДЕНИЕ'}\n\n`;
            report += `**Причины:**\n`;
            for (const reason of degradationAnalysis.reasons) {
                report += `- ${reason}\n`;
            }
            report += `\n`;
        } else {
            report += `✅ **Деградация не обнаружена**\n\n`;
        }

        if (degradationAnalysis.firstHalfMetrics && degradationAnalysis.lastHalfMetrics) {
            report += `**Сравнение первой и второй половины периода:**\n\n`;
            report += `| Метрика | Первая половина | Вторая половина | Изменение |\n`;
            report += `|---------|-----------------|-----------------|-----------|\n`;
            report += `| Доходность | ${degradationAnalysis.firstHalfMetrics.averageReturn.toFixed(2)}% | ${degradationAnalysis.lastHalfMetrics.averageReturn.toFixed(2)}% | ${degradationAnalysis.returnDegradation > 0 ? '-' : '+'}${Math.abs(degradationAnalysis.returnDegradation).toFixed(2)}% |\n`;
            report += `| Win Rate | ${degradationAnalysis.firstHalfMetrics.averageWinRate.toFixed(2)}% | ${degradationAnalysis.lastHalfMetrics.averageWinRate.toFixed(2)}% | ${degradationAnalysis.winRateDegradation > 0 ? '-' : '+'}${Math.abs(degradationAnalysis.winRateDegradation).toFixed(2)}% |\n`;
            report += `| Sharpe Ratio | ${degradationAnalysis.firstHalfMetrics.averageSharpeRatio.toFixed(2)} | ${degradationAnalysis.lastHalfMetrics.averageSharpeRatio.toFixed(2)} | ${degradationAnalysis.sharpeDegradation > 0 ? '-' : '+'}${Math.abs(degradationAnalysis.sharpeDegradation).toFixed(2)} |\n`;
            report += `| Max Drawdown | ${degradationAnalysis.firstHalfMetrics.averageMaxDrawdown.toFixed(2)}% | ${degradationAnalysis.lastHalfMetrics.averageMaxDrawdown.toFixed(2)}% | ${(degradationAnalysis.lastHalfMetrics.averageMaxDrawdown - degradationAnalysis.firstHalfMetrics.averageMaxDrawdown).toFixed(2)}% |\n\n`;
        }

        report += `## Результаты по окнам\n\n`;
        report += `| Окно | Период | Доходность | Сделок | Win Rate | Sharpe | Max DD |\n`;
        report += `|------|--------|------------|--------|----------|--------|-------|\n`;
        for (const window of windowResults) {
            report += `| ${window.windowIndex} | ${window.startDate.toLocaleDateString('ru-RU')} - ${window.endDate.toLocaleDateString('ru-RU')} | ${window.totalReturn.toFixed(2)}% | ${window.totalTrades} | ${window.winRate.toFixed(2)}% | ${(window.sharpeRatio || 0).toFixed(2)} | ${window.maxDrawdown.toFixed(2)}% |\n`;
        }
        report += `\n`;

        report += `---\n`;
        report += `*Отчет сгенерирован автоматически системой walk-forward анализа*\n`;

        return report;
    }

    /**
     * Генерация предупреждений для walk-forward анализа
     * @param {Object} stabilityAnalysis - Анализ стабильности
     * @param {Object} degradationAnalysis - Анализ деградации
     * @returns {Array} - Массив предупреждений
     */
    generateWalkForwardAlerts(stabilityAnalysis, degradationAnalysis) {
        const alerts = [];

        // Предупреждения о деградации
        if (degradationAnalysis.isDegrading) {
            if (degradationAnalysis.severity === 'critical') {
                alerts.push({
                    type: 'error',
                    severity: 'critical',
                    message: `КРИТИЧЕСКАЯ ДЕГРАДАЦИЯ: ${degradationAnalysis.reasons.join('; ')}`
                });
            } else {
                alerts.push({
                    type: 'warning',
                    severity: 'high',
                    message: `Деградация производительности: ${degradationAnalysis.reasons.join('; ')}`
                });
            }
        }

        // Предупреждения о низкой консистентности
        if (stabilityAnalysis.consistency < 0.6) {
            alerts.push({
                type: 'warning',
                severity: 'medium',
                message: `Низкая консистентность производительности: ${(stabilityAnalysis.consistency * 100).toFixed(0)}% (рекомендуется > 60%)`
            });
        }

        // Предупреждения о средних метриках
        if (stabilityAnalysis.averageWinRate < 50) {
            alerts.push({
                type: 'warning',
                severity: 'medium',
                message: `Средний Win Rate ниже 50%: ${stabilityAnalysis.averageWinRate.toFixed(2)}%`
            });
        }

        if (stabilityAnalysis.averageSharpeRatio < 1.0) {
            alerts.push({
                type: 'warning',
                severity: 'medium',
                message: `Средний Sharpe Ratio ниже 1.0: ${stabilityAnalysis.averageSharpeRatio.toFixed(2)}`
            });
        }

        return alerts;
    }

    /**
     * Сохранение результата walk-forward анализа в БД
     * @param {Object} result - Результат walk-forward анализа
     * @returns {Promise<BacktestResult>} - Сохраненный результат
     */
    async saveWalkForwardResult(result) {
        try {
            // Сохраняем как отдельный результат с типом 'walk_forward'
            const backtestResult = await BacktestResult.create({
                strategyId: result.strategyId,
                backtestType: 'walk_forward',
                startDate: result.period.startDate,
                endDate: result.period.endDate,
                initialCapital: result.windowResults[0]?.initialCapital || 1000000,
                finalCapital: result.windowResults[0]?.initialCapital || 1000000, // Для walk-forward это не применимо
                totalReturn: result.stabilityAnalysis.averageReturn,
                totalTrades: result.windowResults.reduce((sum, w) => sum + w.totalTrades, 0),
                winRate: result.stabilityAnalysis.averageWinRate,
                sharpeRatio: result.stabilityAnalysis.averageSharpeRatio,
                maxDrawdown: result.stabilityAnalysis.averageMaxDrawdown,
                profitFactor: result.stabilityAnalysis.averageProfitFactor,
                calmarRatio: 0,
                sortinoRatio: 0,
                metrics: {
                    stability: result.stabilityAnalysis,
                    degradation: result.degradationAnalysis,
                    windowResults: result.windowResults
                },
                trades: [],
                equityCurve: [],
                monthlyReturns: [],
                report: result.report,
                alerts: result.alerts,
                status: 'completed',
                executionTime: result.executionTime,
                metadata: {
                    windowSizeMonths: result.windowSizeMonths,
                    stepSizeMonths: result.stepSizeMonths,
                    windowCount: result.windowResults.length
                }
            });

            return backtestResult;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('❌ Error saving walk-forward result:', {error});
            }
            throw error;
        }
    }
}

export default new BacktestingService();

