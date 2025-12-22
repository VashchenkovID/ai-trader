import OptimizedDataService from './OptimizedDataService.js';
import CacheService from './CacheService.js';
import TradingEngine from './TradingEngine.js';
import ProfitabilityTracker from './ProfitabilityTracker.js';
import {
    analyzeByDayOfWeek,
    analyzeByMonth
} from '../utils/advancedMetrics.js';

/**
 * Оптимизированный сервис анализа
 * Объединяет функциональность TechnicalIndicatorService, EvaluationMetricsService,
 * PredictionExplanationService, ExplainableAIService
 */
class OptimizedAnalysisService {
    constructor() {
        this.isInitialized = false;
        this.indicatorsCache = new Map();
        this.evaluationCache = new Map();
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        try {
            console.log('📊 Initializing Optimized Analysis Service...');
            
            await OptimizedDataService.initialize();
            await CacheService.initialize();
            
            this.isInitialized = true;
            console.log('✅ Optimized Analysis Service initialized');
        } catch (error) {
            console.error('❌ Failed to initialize Optimized Analysis Service:', error);
            throw error;
        }
    }

    // ============================================================================
    // ТЕХНИЧЕСКИЕ ИНДИКАТОРЫ
    // ============================================================================

    /**
     * Получение всех технических индикаторов
     */
    getAllIndicators(prices, volumes = [], highs = [], lows = []) {
        try {
            const indicators = {};
            
            // Трендовые индикаторы
            indicators.sma_5 = this.calculateSMA(prices, 5);
            indicators.sma_10 = this.calculateSMA(prices, 10);
            indicators.sma_20 = this.calculateSMA(prices, 20);
            indicators.sma_50 = this.calculateSMA(prices, 50);
            
            indicators.ema_12 = this.calculateEMA(prices, 12);
            indicators.ema_26 = this.calculateEMA(prices, 26);
            
            // Осцилляторы
            indicators.rsi = this.calculateRSI(prices);
            indicators.stoch = this.calculateStochastic(highs, lows, prices);
            indicators.williams_r = this.calculateWilliamsR(highs, lows, prices);
            
            // MACD
            const macd = this.calculateMACD(prices);
            indicators.macd = macd.macd;
            indicators.macd_signal = macd.signal;
            indicators.macd_histogram = macd.histogram;
            
            // Bollinger Bands
            const bb = this.calculateBollingerBands(prices);
            indicators.bb_upper = bb.upper;
            indicators.bb_middle = bb.middle;
            indicators.bb_lower = bb.lower;
            indicators.bb_width = bb.width;
            indicators.bb_position = bb.position;
            
            // Объемные индикаторы
            if (volumes.length > 0) {
                indicators.volume_sma = this.calculateSMA(volumes, 10);
                indicators.obv = this.calculateOBV(prices, volumes);
                indicators.vwap = this.calculateVWAP(highs, lows, volumes);
            }
            
            // Волатильность
            indicators.atr = this.calculateATR(highs, lows, prices);
            indicators.volatility = this.calculateVolatility(prices);
            
            return indicators;
        } catch (error) {
            console.error('Error calculating indicators:', error);
            return {};
        }
    }

    /**
     * Подготовка фичей для нейросети
     */
    prepareFeatures(indicators, currentIndex) {
        try {
            const features = [];
            
            // Базовые индикаторы
            features.push(indicators.sma_5 || 0);
            features.push(indicators.sma_10 || 0);
            features.push(indicators.sma_20 || 0);
            features.push(indicators.sma_50 || 0);
            
            features.push(indicators.ema_12 || 0);
            features.push(indicators.ema_26 || 0);
            
            // Осцилляторы
            features.push(indicators.rsi || 0.5);
            features.push(indicators.stoch || 0.5);
            features.push(indicators.williams_r || 0.5);
            
            // MACD
            features.push(indicators.macd || 0);
            features.push(indicators.macd_signal || 0);
            features.push(indicators.macd_histogram || 0);
            
            // Bollinger Bands
            features.push(indicators.bb_upper || 0);
            features.push(indicators.bb_middle || 0);
            features.push(indicators.bb_lower || 0);
            features.push(indicators.bb_width || 0);
            features.push(indicators.bb_position || 0.5);
            
            // Объемные
            features.push(indicators.volume_sma || 0);
            features.push(indicators.obv || 0);
            features.push(indicators.vwap || 0);
            
            // Волатильность
            features.push(indicators.atr || 0);
            features.push(indicators.volatility || 0);
            
            return features;
        } catch (error) {
            console.error('Error preparing features:', error);
            return new Array(20).fill(0);
        }
    }

    // ============================================================================
    // ОЦЕНКА МОДЕЛИ
    // ============================================================================

    /**
     * Оценка модели нейросети
     */
    async evaluateModel(predictions, actuals, trades = []) {
        try {
            const metrics = {};
            
            // Базовые метрики
            metrics.accuracy = this.calculateAccuracy(predictions, actuals);
            metrics.precision = this.calculatePrecision(predictions, actuals);
            metrics.recall = this.calculateRecall(predictions, actuals);
            metrics.f1Score = this.calculateF1Score(metrics.precision, metrics.recall);
            
            // Confusion Matrix
            metrics.confusionMatrix = this.calculateConfusionMatrix(predictions, actuals);
            
            // Финансовые метрики
            if (trades.length > 0) {
                metrics.financial = this.calculateFinancialMetrics(trades);
            }
            
            // ROC AUC
            metrics.rocAuc = this.calculateROCAUC(predictions, actuals);
            
            // Calibration
            metrics.calibration = this.calculateCalibration(predictions, actuals);
            
            return metrics;
        } catch (error) {
            console.error('Error evaluating model:', error);
            return {
                accuracy: 0,
                precision: 0,
                recall: 0,
                f1Score: 0,
                confusionMatrix: { truePositive: 0, trueNegative: 0, falsePositive: 0, falseNegative: 0 },
                rocAuc: 0.5,
                calibration: 0
            };
        }
    }

    /**
     * Сохранение результатов оценки
     */
    async saveEvaluationResults(figi, evaluation) {
        try {
            // Сохраняем в кеш
            this.evaluationCache.set(figi, {
                ...evaluation,
                timestamp: new Date().toISOString()
            });
            
            console.log(`✅ Evaluation results saved for ${figi}`);
        } catch (error) {
            console.error('Error saving evaluation results:', error);
        }
    }

    // ============================================================================
    // ОБЪЯСНЕНИЕ ПРЕДСКАЗАНИЙ
    // ============================================================================

    /**
     * Объяснение предсказания модели
     */
    async explainPrediction(figi, features, prediction) {
        try {
            const explanation = {
                prediction: prediction,
                confidence: Math.abs(prediction - 0.5) * 2,
                factors: await this.analyzeFeatureImportance(features),
                reasoning: this.generateReasoning(features, prediction),
                timestamp: new Date().toISOString()
            };
            
            return explanation;
        } catch (error) {
            console.error('Error explaining prediction:', error);
            return {
                prediction: prediction,
                confidence: 0.5,
                factors: [],
                reasoning: 'Unable to generate explanation',
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Анализ важности фичей
     */
    async analyzeFeatureImportance(features) {
        try {
            // Простой анализ важности фичей
            const importance = features.map((feature, index) => ({
                index,
                value: feature,
                importance: Math.abs(feature),
                name: this.getFeatureName(index)
            }));
            
            // Сортируем по важности
            importance.sort((a, b) => b.importance - a.importance);
            
            return importance.slice(0, 10); // Топ-10 фичей
        } catch (error) {
            console.error('Error analyzing feature importance:', error);
            return [];
        }
    }

    // ============================================================================
    // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
    // ============================================================================

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
     * Расчет Stochastic
     */
    calculateStochastic(highs, lows, closes, period = 14) {
        if (highs.length < period || lows.length < period || closes.length < period) return 0.5;
        
        const currentClose = closes[closes.length - 1];
        const highestHigh = Math.max(...highs.slice(-period));
        const lowestLow = Math.min(...lows.slice(-period));
        
        if (highestHigh === lowestLow) return 0.5;
        
        return (currentClose - lowestLow) / (highestHigh - lowestLow);
    }

    /**
     * Расчет Williams %R
     */
    calculateWilliamsR(highs, lows, closes, period = 14) {
        if (highs.length < period || lows.length < period || closes.length < period) return -0.5;
        
        const currentClose = closes[closes.length - 1];
        const highestHigh = Math.max(...highs.slice(-period));
        const lowestLow = Math.min(...lows.slice(-period));
        
        if (highestHigh === lowestLow) return -0.5;
        
        return (highestHigh - currentClose) / (highestHigh - lowestLow) - 1;
    }

    /**
     * Расчет MACD
     */
    calculateMACD(prices) {
        if (prices.length < 26) return { macd: 0, signal: 0, histogram: 0 };
        
        const ema12 = this.calculateEMA(prices, 12);
        const ema26 = this.calculateEMA(prices, 26);
        const macd = ema12 - ema26;
        
        // Для сигнальной линии нужна история MACD, упрощаем
        const signal = macd * 0.9; // Упрощенная сигнальная линия
        const histogram = macd - signal;
        
        return { macd, signal, histogram };
    }

    /**
     * Расчет Bollinger Bands
     */
    calculateBollingerBands(prices, period = 20) {
        if (prices.length < period) return { upper: 0, middle: 0, lower: 0, width: 0, position: 0.5 };
        
        const sma = this.calculateSMA(prices, period);
        const variance = prices.slice(-period).reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period;
        const stdDev = Math.sqrt(variance);
        
        const upper = sma + 2 * stdDev;
        const lower = sma - 2 * stdDev;
        const width = (upper - lower) / sma;
        const position = (prices[prices.length - 1] - lower) / (upper - lower);
        
        return { upper, middle: sma, lower, width, position };
    }

    /**
     * Расчет OBV
     */
    calculateOBV(prices, volumes) {
        if (prices.length !== volumes.length || prices.length < 2) return 0;
        
        let obv = 0;
        for (let i = 1; i < prices.length; i++) {
            if (prices[i] > prices[i - 1]) {
                obv += volumes[i];
            } else if (prices[i] < prices[i - 1]) {
                obv -= volumes[i];
            }
        }
        
        return obv;
    }

    /**
     * Расчет VWAP
     */
    calculateVWAP(highs, lows, volumes) {
        if (highs.length !== volumes.length || highs.length === 0) return 0;
        
        let totalVolume = 0;
        let totalValue = 0;
        
        for (let i = 0; i < highs.length; i++) {
            const typicalPrice = (highs[i] + lows[i]) / 2;
            totalValue += typicalPrice * volumes[i];
            totalVolume += volumes[i];
        }
        
        return totalVolume > 0 ? totalValue / totalVolume : 0;
    }

    /**
     * Расчет ATR
     */
    calculateATR(highs, lows, closes, period = 14) {
        if (highs.length < period || lows.length < period || closes.length < period) return 0;
        
        let atr = 0;
        for (let i = 1; i < period; i++) {
            const tr = Math.max(
                highs[i] - lows[i],
                Math.abs(highs[i] - closes[i - 1]),
                Math.abs(lows[i] - closes[i - 1])
            );
            atr += tr;
        }
        
        return atr / (period - 1);
    }

    /**
     * Расчет волатильности
     */
    calculateVolatility(prices, period = 20) {
        if (prices.length < period) return 0;
        
        const returns = [];
        for (let i = 1; i < period; i++) {
            returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
        }
        
        const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
        const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
        
        return Math.sqrt(variance);
    }

    /**
     * Расчет точности
     */
    calculateAccuracy(predictions, actuals) {
        if (predictions.length !== actuals.length) return 0;
        
        const correct = predictions.reduce((count, pred, i) => {
            return count + (Math.round(pred) === actuals[i] ? 1 : 0);
        }, 0);
        
        return correct / predictions.length;
    }

    /**
     * Расчет precision
     */
    calculatePrecision(predictions, actuals) {
        const confusionMatrix = this.calculateConfusionMatrix(predictions, actuals);
        const tp = confusionMatrix.truePositive;
        const fp = confusionMatrix.falsePositive;
        
        return tp + fp > 0 ? tp / (tp + fp) : 0;
    }

    /**
     * Расчет recall
     */
    calculateRecall(predictions, actuals) {
        const confusionMatrix = this.calculateConfusionMatrix(predictions, actuals);
        const tp = confusionMatrix.truePositive;
        const fn = confusionMatrix.falseNegative;
        
        return tp + fn > 0 ? tp / (tp + fn) : 0;
    }

    /**
     * Расчет F1 Score
     */
    calculateF1Score(precision, recall) {
        return precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;
    }

    /**
     * Расчет Confusion Matrix
     */
    calculateConfusionMatrix(predictions, actuals) {
        let tp = 0, tn = 0, fp = 0, fn = 0;
        
        for (let i = 0; i < predictions.length; i++) {
            const pred = Math.round(predictions[i]);
            const actual = actuals[i];
            
            if (pred === 1 && actual === 1) tp++;
            else if (pred === 0 && actual === 0) tn++;
            else if (pred === 1 && actual === 0) fp++;
            else if (pred === 0 && actual === 1) fn++;
        }
        
        return { truePositive: tp, trueNegative: tn, falsePositive: fp, falseNegative: fn };
    }

    /**
     * Расчет финансовых метрик
     */
    calculateFinancialMetrics(trades) {
        try {
            const returns = trades.map(trade => trade.return || 0);
            const totalReturn = returns.reduce((sum, ret) => sum + ret, 0);
            const winRate = trades.filter(trade => trade.return > 0).length / trades.length;
            const avgWin = returns.filter(ret => ret > 0).reduce((sum, ret) => sum + ret, 0) / (returns.filter(ret => ret > 0).length || 1);
            const avgLoss = returns.filter(ret => ret < 0).reduce((sum, ret) => sum + ret, 0) / (returns.filter(ret => ret < 0).length || 1);
            
            return {
                totalReturn,
                winRate,
                avgWin,
                avgLoss,
                profitFactor: Math.abs(avgWin / avgLoss) || 0,
                sharpeRatio: this.calculateSharpeRatio(returns),
                maxDrawdown: this.calculateMaxDrawdown(returns)
            };
        } catch (error) {
            console.error('Error calculating financial metrics:', error);
            return {};
        }
    }

    /**
     * Расчет Sharpe Ratio
     */
    calculateSharpeRatio(returns) {
        if (returns.length === 0) return 0;
        
        const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
        const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
        const stdDev = Math.sqrt(variance);
        
        return stdDev > 0 ? mean / stdDev : 0;
    }

    /**
     * Расчет максимальной просадки
     */
    calculateMaxDrawdown(returns) {
        let maxDrawdown = 0;
        let peak = 0;
        let runningSum = 0;
        
        for (const ret of returns) {
            runningSum += ret;
            if (runningSum > peak) peak = runningSum;
            const drawdown = peak - runningSum;
            if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        }
        
        return maxDrawdown;
    }

    /**
     * Расчет ROC AUC
     */
    calculateROCAUC(predictions, actuals) {
        // Упрощенный расчет ROC AUC
        const sorted = predictions.map((pred, i) => ({ pred, actual: actuals[i] }))
            .sort((a, b) => b.pred - a.pred);
        
        let auc = 0;
        let truePositives = 0;
        let falsePositives = 0;
        const totalPositives = actuals.filter(a => a === 1).length;
        const totalNegatives = actuals.filter(a => a === 0).length;
        
        for (const item of sorted) {
            if (item.actual === 1) {
                truePositives++;
            } else {
                falsePositives++;
                auc += truePositives;
            }
        }
        
        return totalPositives > 0 && totalNegatives > 0 ? auc / (totalPositives * totalNegatives) : 0.5;
    }

    /**
     * Расчет калибровки
     */
    calculateCalibration(predictions, actuals) {
        // Упрощенный расчет калибровки
        const bins = 10;
        const binSize = 1.0 / bins;
        let calibration = 0;
        
        for (let i = 0; i < bins; i++) {
            const binStart = i * binSize;
            const binEnd = (i + 1) * binSize;
            
            const binPredictions = predictions.filter(p => p >= binStart && p < binEnd);
            const binActuals = binPredictions.map((_, idx) => actuals[predictions.indexOf(binPredictions[idx])]);
            
            if (binPredictions.length > 0) {
                const avgPrediction = binPredictions.reduce((sum, p) => sum + p, 0) / binPredictions.length;
                const avgActual = binActuals.reduce((sum, a) => sum + a, 0) / binActuals.length;
                calibration += Math.abs(avgPrediction - avgActual);
            }
        }
        
        return 1 - (calibration / bins);
    }

    /**
     * Генерация объяснения
     */
    generateReasoning(features, prediction) {
        const confidence = Math.abs(prediction - 0.5) * 2;
        
        if (confidence > 0.8) {
            return prediction > 0.5 ? 
                'Высокая уверенность в росте цены' : 
                'Высокая уверенность в падении цены';
        } else if (confidence > 0.6) {
            return prediction > 0.5 ? 
                'Умеренная уверенность в росте цены' : 
                'Умеренная уверенность в падении цены';
        } else {
            return 'Низкая уверенность в прогнозе';
        }
    }

    /**
     * Получение имени фичи
     */
    getFeatureName(index) {
        const names = [
            'SMA_5', 'SMA_10', 'SMA_20', 'SMA_50',
            'EMA_12', 'EMA_26', 'RSI', 'Stochastic',
            'Williams_R', 'MACD', 'MACD_Signal', 'MACD_Histogram',
            'BB_Upper', 'BB_Middle', 'BB_Lower', 'BB_Width', 'BB_Position',
            'Volume_SMA', 'OBV', 'VWAP', 'ATR', 'Volatility'
        ];
        
        return names[index] || `Feature_${index}`;
    }

    // ============================================================================
    // АНАЛИЗ ПРОИЗВОДИТЕЛЬНОСТИ ПО ПЕРИОДАМ
    // ============================================================================

    /**
     * Анализ производительности по периодам (дни недели, месяцы)
     * @param {string} period - Период анализа ('daily', 'weekly', 'monthly')
     * @param {Date} startDate - Начальная дата (опционально)
     * @param {Date} endDate - Конечная дата (опционально)
     * @returns {Object} Результаты анализа по периодам
     */
    async analyzePeriodPerformance(period = 'daily', startDate = null, endDate = null) {
        try {
            // Получаем сделки из TradingEngine
            const trades = TradingEngine.virtualPortfolio?.trades || [];
            
            if (trades.length === 0) {
                return {
                    success: false,
                    message: 'Нет данных о сделках для анализа',
                    byDayOfWeek: null,
                    byMonth: null,
                    bestDay: null,
                    worstDay: null,
                    bestMonth: null,
                    worstMonth: null,
                    summary: null
                };
            }

            // Фильтруем сделки по датам, если указаны
            let filteredTrades = trades;
            if (startDate || endDate) {
                // Нормализуем даты для сравнения (только дата, без времени)
                const normalizedStartDate = startDate ? new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()) : null;
                const normalizedEndDate = endDate ? new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59, 999) : null;
                
                filteredTrades = trades.filter(trade => {
                    const tradeDate = trade.timestamp ? new Date(trade.timestamp) : 
                                   trade.date ? new Date(trade.date) : null;
                    
                    if (!tradeDate || isNaN(tradeDate.getTime())) {
                        return false;
                    }

                    // Нормализуем дату сделки для сравнения
                    const normalizedTradeDate = new Date(tradeDate.getFullYear(), tradeDate.getMonth(), tradeDate.getDate());

                    if (normalizedStartDate && normalizedTradeDate < normalizedStartDate) {
                        return false;
                    }
                    if (normalizedEndDate && normalizedTradeDate > normalizedEndDate) {
                        return false;
                    }
                    return true;
                });
            }

            // Если указаны даты и нет сделок в периоде, возвращаем ошибку
            // Но если даты не указаны, используем все сделки
            if ((startDate || endDate) && filteredTrades.length === 0) {
                return {
                    success: false,
                    message: 'Нет сделок в указанном периоде',
                    byDayOfWeek: null,
                    byMonth: null,
                    bestDay: null,
                    worstDay: null,
                    bestMonth: null,
                    worstMonth: null,
                    summary: null
                };
            }
            
            // Если нет сделок вообще, возвращаем ошибку
            if (filteredTrades.length === 0) {
                return {
                    success: false,
                    message: 'Нет данных о сделках для анализа',
                    byDayOfWeek: null,
                    byMonth: null,
                    bestDay: null,
                    worstDay: null,
                    bestMonth: null,
                    worstMonth: null,
                    summary: null
                };
            }

            // Получаем статистику из ProfitabilityTracker для фильтрации по периоду
            let stats = [];
            try {
                const periodStartDate = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
                const periodEndDate = endDate || new Date();
                
                // Пытаемся получить статистику за период
                if (period === 'daily') {
                    stats = ProfitabilityTracker.getDailyStatsForPeriod(periodStartDate, periodEndDate);
                } else if (period === 'weekly') {
                    stats = ProfitabilityTracker.getWeeklyStatsForPeriod(periodStartDate, periodEndDate);
                } else if (period === 'monthly') {
                    stats = ProfitabilityTracker.getMonthlyStatsForPeriod(periodStartDate, periodEndDate);
                }
            } catch (error) {
                console.warn('⚠️ Не удалось получить статистику из ProfitabilityTracker:', error.message);
                // Продолжаем без статистики
            }

            // Фильтруем сделки по периоду статистики, если статистика доступна
            let periodTrades = filteredTrades;
            if (stats && stats.length > 0) {
                periodTrades = ProfitabilityTracker.filterTradesByPeriod(filteredTrades, period, stats);
            }

            // Анализ по дням недели
            const dayOfWeekAnalysis = analyzeByDayOfWeek(periodTrades);
            
            // Анализ по месяцам
            const monthAnalysisRaw = analyzeByMonth(periodTrades);
            
            // Преобразуем объект месяцев в массив для удобства работы
            const monthAnalysis = this.formatMonthResults(monthAnalysisRaw);

            // Определяем лучший и худший день недели (используем уже вычисленные значения)
            const bestDay = dayOfWeekAnalysis.bestDay ? {
                period: dayOfWeekAnalysis.bestDay.day,
                profit: dayOfWeekAnalysis.bestDay.profit,
                trades: dayOfWeekAnalysis[dayOfWeekAnalysis.bestDay.day]?.trades || 0,
                winRate: dayOfWeekAnalysis[dayOfWeekAnalysis.bestDay.day]?.winRate || 0,
                avgProfit: dayOfWeekAnalysis[dayOfWeekAnalysis.bestDay.day]?.avgProfit || 0
            } : null;
            
            const worstDay = dayOfWeekAnalysis.worstDay ? {
                period: dayOfWeekAnalysis.worstDay.day,
                profit: dayOfWeekAnalysis.worstDay.profit,
                trades: dayOfWeekAnalysis[dayOfWeekAnalysis.worstDay.day]?.trades || 0,
                winRate: dayOfWeekAnalysis[dayOfWeekAnalysis.worstDay.day]?.winRate || 0,
                avgProfit: dayOfWeekAnalysis[dayOfWeekAnalysis.worstDay.day]?.avgProfit || 0
            } : null;

            // Определяем лучший и худший месяц (месяцы - это массив)
            const bestMonth = this.findBestPeriod(monthAnalysis, 'month');
            const worstMonth = this.findWorstPeriod(monthAnalysis, 'month');

            // Формируем сводку
            const summary = this.generatePeriodSummary(periodTrades, dayOfWeekAnalysis, monthAnalysis);

            const result = {
                success: true,
                period: period,
                totalTrades: periodTrades.length,
                byDayOfWeek: this.formatDayOfWeekResults(dayOfWeekAnalysis),
                byMonth: monthAnalysis,
                bestDay: bestDay,
                worstDay: worstDay,
                bestMonth: bestMonth,
                worstMonth: worstMonth,
                summary: summary
            };
            
            // Добавляем даты только если они были переданы
            if (startDate) {
                result.startDate = startDate;
            }
            if (endDate) {
                result.endDate = endDate;
            }
            
            return result;
        } catch (error) {
            console.error('❌ Ошибка анализа производительности по периодам:', error);
            return {
                success: false,
                message: `Ошибка анализа: ${error.message}`,
                byDayOfWeek: null,
                byMonth: null,
                bestDay: null,
                worstDay: null,
                bestMonth: null,
                worstMonth: null,
                summary: null
            };
        }
    }

    /**
     * Поиск лучшего периода (для массивов, например месяцев)
     */
    findBestPeriod(analysis, type) {
        if (!analysis || !Array.isArray(analysis) || analysis.length === 0) return null;

        let best = null;
        let bestProfit = -Infinity;

        for (const item of analysis) {
            const profit = item.totalProfit || 0;
            const trades = item.totalTrades || 0;
            if (profit > bestProfit && trades > 0) {
                bestProfit = profit;
                best = {
                    period: `${item.month} ${item.year}`,
                    profit: profit,
                    trades: trades,
                    winRate: item.winRate || 0,
                    avgProfit: trades > 0 ? profit / trades : 0
                };
            }
        }

        return best;
    }

    /**
     * Поиск худшего периода (для массивов, например месяцев)
     */
    findWorstPeriod(analysis, type) {
        if (!analysis || !Array.isArray(analysis) || analysis.length === 0) return null;

        let worst = null;
        let worstProfit = Infinity;

        for (const item of analysis) {
            const profit = item.totalProfit || 0;
            const trades = item.totalTrades || 0;
            if (profit < worstProfit && trades > 0) {
                worstProfit = profit;
                worst = {
                    period: `${item.month} ${item.year}`,
                    profit: profit,
                    trades: trades,
                    winRate: item.winRate || 0,
                    avgProfit: trades > 0 ? profit / trades : 0
                };
            }
        }

        return worst;
    }

    /**
     * Форматирование результатов по месяцам (преобразование объекта в массив)
     */
    formatMonthResults(monthAnalysisRaw) {
        if (!monthAnalysisRaw || typeof monthAnalysisRaw !== 'object') {
            return [];
        }

        // Если это уже массив, возвращаем как есть
        if (Array.isArray(monthAnalysisRaw)) {
            return monthAnalysisRaw;
        }

        // Преобразуем объект в массив
        const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                           'july', 'august', 'september', 'october', 'november', 'december'];
        const monthNamesRu = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
                             'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
        
        const result = [];
        
        // Собираем все месяцы с данными
        const monthsWithData = new Map();
        
        for (const [monthName, monthData] of Object.entries(monthAnalysisRaw)) {
            if (monthNames.includes(monthName) && monthData && typeof monthData === 'object') {
                const monthIndex = monthNames.indexOf(monthName);
                const year = new Date().getFullYear(); // Можно улучшить, определяя год из сделок
                
                monthsWithData.set(`${year}-${monthIndex.toString().padStart(2, '0')}`, {
                    year: year,
                    month: monthNamesRu[monthIndex],
                    monthIndex: monthIndex,
                    totalProfit: monthData.profit || 0,
                    totalTrades: monthData.trades || 0,
                    winTrades: monthData.profitableTrades || 0,
                    winRate: monthData.winRate || 0,
                    avgProfit: monthData.avgProfit || 0
                });
            }
        }
        
        // Сортируем по году и месяцу
        const sortedKeys = Array.from(monthsWithData.keys()).sort();
        for (const key of sortedKeys) {
            result.push(monthsWithData.get(key));
        }
        
        return result;
    }

    /**
     * Форматирование результатов по дням недели
     */
    formatDayOfWeekResults(dayOfWeekAnalysis) {
        if (!dayOfWeekAnalysis || typeof dayOfWeekAnalysis !== 'object') {
            return null;
        }

        // Если это массив (старая версия), преобразуем в объект
        if (Array.isArray(dayOfWeekAnalysis)) {
            const result = {};
            const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            dayOfWeekAnalysis.forEach((item, index) => {
                if (index < dayNames.length) {
                    result[dayNames[index]] = {
                        profit: item.totalProfit || item.profit || 0,
                        trades: item.totalTrades || item.trades || 0,
                        winRate: item.winRate || 0,
                        avgProfit: item.avgProfit || 0
                    };
                }
            });
            return result;
        }

        // Если это объект (новая версия), удаляем bestDay и worstDay, оставляем только дни
        const result = {};
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        for (const dayName of dayNames) {
            if (dayOfWeekAnalysis[dayName]) {
                result[dayName] = {
                    profit: dayOfWeekAnalysis[dayName].profit || 0,
                    trades: dayOfWeekAnalysis[dayName].trades || 0,
                    winRate: dayOfWeekAnalysis[dayName].winRate || 0,
                    avgProfit: dayOfWeekAnalysis[dayName].avgProfit || 0
                };
            }
        }
        return result;
    }

    /**
     * Генерация сводки по периодам
     */
    generatePeriodSummary(trades, dayOfWeekAnalysis, monthAnalysis) {
        const totalProfit = trades.reduce((sum, trade) => sum + (trade.pnl || trade.profit || 0), 0);
        const totalTrades = trades.length;
        const profitableTrades = trades.filter(t => (t.pnl || t.profit || 0) > 0).length;
        const winRate = totalTrades > 0 ? (profitableTrades / totalTrades) * 100 : 0;
        const avgProfit = totalTrades > 0 ? totalProfit / totalTrades : 0;

        // Статистика по дням недели
        let dayStats = null;
        if (dayOfWeekAnalysis) {
            const formatted = this.formatDayOfWeekResults(dayOfWeekAnalysis);
            if (formatted && typeof formatted === 'object' && !Array.isArray(formatted)) {
                const days = Object.values(formatted);
                const totalDayTrades = days.reduce((sum, d) => sum + (d.trades || 0), 0);
                const totalDayProfit = days.reduce((sum, d) => sum + (d.profit || 0), 0);
                
                // Находим самый активный и самый прибыльный день
                let mostActiveDay = null;
                let mostProfitableDay = null;
                let maxTrades = 0;
                let maxProfit = -Infinity;
                
                for (const [dayName, dayData] of Object.entries(formatted)) {
                    if (dayData.trades > maxTrades) {
                        maxTrades = dayData.trades;
                        mostActiveDay = { day: dayName, ...dayData };
                    }
                    if (dayData.profit > maxProfit) {
                        maxProfit = dayData.profit;
                        mostProfitableDay = { day: dayName, ...dayData };
                    }
                }
                
                dayStats = {
                    totalTrades: totalDayTrades,
                    totalProfit: totalDayProfit,
                    avgProfitPerDay: totalDayTrades > 0 ? totalDayProfit / totalDayTrades : 0,
                    mostActiveDay: mostActiveDay,
                    mostProfitableDay: mostProfitableDay
                };
            }
        }

        // Статистика по месяцам
        let monthStats = null;
        if (monthAnalysis && monthAnalysis.length > 0) {
            const totalMonthTrades = monthAnalysis.reduce((sum, m) => sum + m.totalTrades, 0);
            const totalMonthProfit = monthAnalysis.reduce((sum, m) => sum + m.totalProfit, 0);
            monthStats = {
                totalTrades: totalMonthTrades,
                totalProfit: totalMonthProfit,
                avgProfitPerMonth: monthAnalysis.length > 0 ? totalMonthProfit / monthAnalysis.length : 0,
                mostActiveMonth: monthAnalysis.reduce((best, m) => m.totalTrades > (best?.totalTrades || 0) ? m : best, null),
                mostProfitableMonth: monthAnalysis.reduce((best, m) => m.totalProfit > (best?.totalProfit || -Infinity) ? m : best, null)
            };
        }

        return {
            totalProfit: totalProfit,
            totalTrades: totalTrades,
            profitableTrades: profitableTrades,
            winRate: winRate,
            avgProfit: avgProfit,
            dayOfWeek: dayStats,
            month: monthStats
        };
    }

    /**
     * Получение статуса сервиса
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            indicatorsCache: this.indicatorsCache.size,
            evaluationCache: this.evaluationCache.size
        };
    }
}

export default new OptimizedAnalysisService();
