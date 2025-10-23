import OptimizedDataService from './OptimizedDataService.js';
import CacheService from './CacheService.js';

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
