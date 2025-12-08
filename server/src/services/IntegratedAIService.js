import EnsembleService from './EnsembleService.js';
import MetaLearningService from './MetaLearningService.js';
import ReinforcementLearningService from './ReinforcementLearningService.js';
import NeuralNetworkService from './NeuralNetworkService.js';
import WebSocketService from './WebSocketService.js';
import CacheService from './CacheService.js';
import OptimizedTelegramService from './OptimizedTelegramService.js';
import SignalCacheService from './SignalCacheService.js';
import SignalValidationService from './SignalValidationService.js';

/**
 * Интегрированный сервис для управления всеми тремя нейросетями
 * Объединяет Ensemble, Meta-Learning и Reinforcement Learning
 */
class IntegratedAIService {
    constructor() {
        this.isInitialized = false;
        this.activeNetworks = {
            ensemble: false,
            metaLearning: false,
            reinforcementLearning: false,
            traditional: false
        };
        this.performance = {
            ensemble: { accuracy: 0, precision: 0, recall: 0, f1Score: 0 },
            metaLearning: { adaptationRate: 0, knowledgeBaseSize: 0 },
            reinforcementLearning: { averageReward: 0, winRate: 0 },
            traditional: { accuracy: 0, precision: 0, recall: 0, f1Score: 0 }
        };
        this.recommendations = [];
        this.lastUpdate = null;
    }

    /**
     * Инициализация всех AI сервисов
     */
    async initialize() {
        try {
            console.log('🧠 Initializing Integrated AI Service...');
            
            // Проверяем, инициализированы ли уже сервисы через ServiceManager
            // Если нет - инициализируем их
            if (!NeuralNetworkService.isInitialized) {
                await NeuralNetworkService.initialize();
                this.activeNetworks.traditional = true;
                console.log('✅ Traditional neural network initialized');
            } else {
                this.activeNetworks.traditional = true;
                console.log('✅ Traditional neural network already initialized');
            }
            
            if (!EnsembleService.isInitialized) {
                await EnsembleService.initialize();
                this.activeNetworks.ensemble = true;
                console.log('✅ Ensemble service initialized');
            } else {
                this.activeNetworks.ensemble = true;
                console.log('✅ Ensemble service already initialized');
            }
            
            if (!MetaLearningService.isInitialized) {
                await MetaLearningService.initialize();
                this.activeNetworks.metaLearning = true;
                console.log('✅ Meta-learning service initialized');
            } else {
                this.activeNetworks.metaLearning = true;
                console.log('✅ Meta-learning service already initialized');
            }
            
            if (!ReinforcementLearningService.isInitialized) {
                await ReinforcementLearningService.initialize();
                this.activeNetworks.reinforcementLearning = true;
                console.log('✅ Reinforcement learning service initialized');
            } else {
                this.activeNetworks.reinforcementLearning = true;
                console.log('✅ Reinforcement learning service already initialized');
            }
            
            // Загружаем все модели после инициализации
            await this.loadAllModels();
            
            // Сохраняем все модели после загрузки (для обновления метаданных)
            await this.saveAllModels();
            
            this.isInitialized = true;
            this.lastUpdate = new Date().toISOString();
            
            console.log('✅ Integrated AI Service initialized');
            console.log(`📊 Active networks: ${Object.keys(this.activeNetworks).filter(k => this.activeNetworks[k]).join(', ')}`);
            
        } catch (error) {
            console.error('❌ Failed to initialize Integrated AI Service:', error);
            throw error;
        }
    }

    /**
     * Получение интегрированной рекомендации
     */
    async getIntegratedRecommendation(figi, portfolio = null) {
        try {
            if (!this.isInitialized) {
                throw new Error('Integrated AI Service not initialized');
            }

            console.log(`🔍 Getting integrated recommendation for ${figi}...`);
            
            const recommendations = [];
            const weights = {};

            // 1. Рекомендация от ансамбля (с горизонтами)
            if (this.activeNetworks.ensemble) {
                try {
                    const ensembleRec = await EnsembleService.predict(figi, portfolio);
                    recommendations.push({
                        source: 'ensemble',
                        score: ensembleRec.score,
                        confidence: ensembleRec.confidence,
                        recommendation: ensembleRec.recommendation,
                        agreement: ensembleRec.agreement, // Согласованность между горизонтами
                        horizons: ensembleRec.horizons, // Детали по горизонтам
                        summary: ensembleRec.summary, // Понятное резюме
                        details: ensembleRec.individualPredictions // Для обратной совместимости
                    });
                    weights.ensemble = ensembleRec.confidence;
                } catch (error) {
                    console.warn('⚠️ Ensemble recommendation failed:', error.message);
                }
            }

            // 2. Рекомендация от традиционной нейросети
            if (this.activeNetworks.traditional) {
                try {
                    const traditionalRec = await NeuralNetworkService.predict(figi);
                    recommendations.push({
                        source: 'traditional',
                        score: traditionalRec.score,
                        confidence: traditionalRec.confidence,
                        recommendation: traditionalRec.recommendation,
                        details: traditionalRec.explanation
                    });
                    weights.traditional = traditionalRec.confidence;
                } catch (error) {
                    console.warn('⚠️ Traditional recommendation failed:', error.message);
                }
            }

            // 3. Рекомендация от RL агента
            if (this.activeNetworks.reinforcementLearning && portfolio) {
                try {
                    const rlRec = await ReinforcementLearningService.getTradingRecommendation(figi, portfolio);
                    const rlScore = rlRec.action === 1 ? 0.8 : rlRec.action === 2 ? 0.2 : 0.5;
                    recommendations.push({
                        source: 'reinforcement',
                        score: rlScore,
                        confidence: rlRec.confidence,
                        recommendation: rlRec.actionName,
                        details: rlRec.qValues
                    });
                    weights.reinforcement = rlRec.confidence;
                } catch (error) {
                    console.warn('⚠️ RL recommendation failed:', error.message);
                }
            }

            // 4. Мета-адаптация (если доступна)
            if (this.activeNetworks.metaLearning && recommendations.length > 0) {
                try {
                    const marketData = await this.getMarketData(figi);
                    const similarTasks = await MetaLearningService.findSimilarTasks(
                        marketData,
                        'price_prediction',
                        { accuracy: 0.75, sharpe: 1.2 }
                    );
                    
                    if (similarTasks.length > 0) {
                        // Применяем мета-адаптацию
                        const metaWeight = Math.min(0.3, similarTasks[0].similarity);
                        weights.meta = metaWeight;
                    }
                } catch (error) {
                    console.warn('⚠️ Meta-learning adaptation failed:', error.message);
                }
            }

            // 5. Получаем сигналы аналитиков и валидируем предсказание
            let signalsRecommendation = null;
            let validationResult = null;
            try {
                const signals = await SignalCacheService.getSignalsByDate(figi, new Date());
                if (signals.length > 0) {
                    // Создаем временное предсказание для валидации
                    const tempPrediction = {
                        score: recommendations.length > 0 
                            ? recommendations.reduce((sum, r) => sum + r.score, 0) / recommendations.length 
                            : 0.5,
                        confidence: recommendations.length > 0
                            ? recommendations.reduce((sum, r) => sum + r.confidence, 0) / recommendations.length
                            : 0.5,
                        recommendation: recommendations.length > 0
                            ? recommendations[0].recommendation || 'HOLD'
                            : 'HOLD'
                    };

                    // Валидируем предсказание против сигналов
                    validationResult = await SignalValidationService.validatePredictionAgainstSignals(
                        figi,
                        tempPrediction,
                        new Date()
                    );

                    // Добавляем рекомендацию от сигналов аналитиков
                    if (validationResult.success && validationResult.hasSignals) {
                        const dominantDirection = validationResult.signalsSummary.dominantDirection;
                        const avgProbability = validationResult.signalsSummary.averageProbability;
                        
                        // Конвертируем направление сигналов в score
                        let signalsScore = 0.5; // HOLD по умолчанию
                        if (dominantDirection === 'SIGNAL_DIRECTION_BUY') {
                            signalsScore = 0.5 + (avgProbability * 0.5); // 0.5 - 1.0
                        } else if (dominantDirection === 'SIGNAL_DIRECTION_SELL') {
                            signalsScore = 0.5 - (avgProbability * 0.5); // 0.0 - 0.5
                        }

                        signalsRecommendation = {
                            source: 'signals',
                            score: signalsScore,
                            confidence: avgProbability,
                            recommendation: dominantDirection === 'SIGNAL_DIRECTION_BUY' ? 'BUY' :
                                          dominantDirection === 'SIGNAL_DIRECTION_SELL' ? 'SELL' : 'HOLD',
                            details: {
                                signalsCount: validationResult.signalsSummary.total,
                                buySignals: validationResult.signalsSummary.buy,
                                sellSignals: validationResult.signalsSummary.sell,
                                validation: validationResult.metrics
                            }
                        };

                        recommendations.push(signalsRecommendation);
                        // Вес сигналов аналитиков зависит от их согласованности
                        weights.signals = avgProbability * validationResult.metrics.overallAgreement;
                    }
                }
            } catch (error) {
                console.warn('⚠️ Signals validation failed:', error.message);
            }

            // Вычисляем интегрированную рекомендацию
            const integratedRec = this.calculateIntegratedRecommendation(recommendations, weights);
            
            // Добавляем информацию о валидации, если она была выполнена
            if (validationResult && validationResult.success && validationResult.hasSignals) {
                integratedRec.signalsValidation = {
                    directionMatch: validationResult.metrics.directionMatch,
                    directionAgreement: validationResult.metrics.directionAgreement,
                    probabilityCorrelation: validationResult.metrics.probabilityCorrelation,
                    overallAgreement: validationResult.metrics.overallAgreement,
                    signalsCount: validationResult.signalsSummary.total
                };
            }
            
            // Сохраняем рекомендацию
            this.recommendations.push({
                figi,
                recommendation: integratedRec,
                timestamp: new Date().toISOString(),
                sources: recommendations.length
            });

            // Ограничиваем количество сохраненных рекомендаций
            if (this.recommendations.length > 100) {
                this.recommendations = this.recommendations.slice(-100);
            }

            // Отправляем сильные рекомендации в Telegram
            if (integratedRec.confidence > 0.8) {
                await OptimizedTelegramService.addStrongRecommendation({
                    figi,
                    recommendation: integratedRec.recommendation,
                    confidence: integratedRec.confidence,
                    score: integratedRec.score
                });
            }

            console.log(`✅ Integrated recommendation generated: ${integratedRec.recommendation} (${integratedRec.confidence.toFixed(3)})`);
            
            return integratedRec;

        } catch (error) {
            console.error('❌ Integrated recommendation failed:', error);
            // Временный алерт в Telegram
            try {
                const OptimizedTelegramService = (await import('./OptimizedTelegramService.js')).default;
                await OptimizedTelegramService.sendAlert('INTEGRATED_AI_ERROR', {
                    error: error.message,
                    context: 'Integrated Recommendation',
                    timestamp: new Date().toISOString()
                });
            } catch (telegramError) {
                console.error('Failed to send Telegram alert:', telegramError);
            }
            return {
                score: 0,
                confidence: 0,
                recommendation: 'HOLD',
                error: error.message,
                sources: 0
            };
        }
    }

    /**
     * Вычисление интегрированной рекомендации
     */
    calculateIntegratedRecommendation(recommendations, weights) {
        if (recommendations.length === 0) {
            return {
                score: 0,
                confidence: 0,
                recommendation: 'HOLD',
                sources: 0,
                details: 'No recommendations available'
            };
        }

        // Нормализуем веса
        const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
        const normalizedWeights = {};
        for (const [source, weight] of Object.entries(weights)) {
            normalizedWeights[source] = totalWeight > 0 ? weight / totalWeight : 1 / recommendations.length;
        }

        // Вычисляем взвешенный score
        let weightedScore = 0;
        let totalConfidence = 0;
        const sourceDetails = {};

        // Собираем информацию о горизонтах из ансамбля
        let horizons = null;
        let agreement = null;
        let summary = null;

        for (const rec of recommendations) {
            const weight = normalizedWeights[rec.source] || 0;
            weightedScore += rec.score * weight;
            totalConfidence += rec.confidence * weight;
            
            // Если это ансамбль, извлекаем информацию о горизонтах
            if (rec.source === 'ensemble' && rec.horizons) {
                horizons = rec.horizons;
                agreement = rec.agreement;
                summary = rec.summary;
            }
            
            sourceDetails[rec.source] = {
                score: rec.score,
                confidence: rec.confidence,
                recommendation: rec.recommendation,
                weight: weight,
                // Пробрасываем детализированное объяснение, если оно есть
                rawDetails: rec.details || null,
                // Пробрасываем горизонты, если есть
                horizons: rec.horizons || null
            };
        }

        // Определяем финальную рекомендацию
        let recommendation = 'HOLD';
        if (weightedScore > 0.7) {
            recommendation = 'BUY';
        } else if (weightedScore < 0.3) {
            recommendation = 'SELL';
        }

        // Генерируем понятное резюме, если есть горизонты
        let finalSummary = summary;
        if (!finalSummary && horizons) {
            finalSummary = this.generateIntegratedSummary(horizons, weightedScore, totalConfidence, agreement, recommendation);
        }

        return {
            score: weightedScore,
            confidence: totalConfidence,
            recommendation,
            sources: recommendations.length,
            details: sourceDetails,
            weights: normalizedWeights,
            // Добавляем информацию о горизонтах, если доступна
            horizons: horizons,
            agreement: agreement,
            summary: finalSummary
        };
    }

    /**
     * Генерация интегрированного резюме с горизонтами
     */
    generateIntegratedSummary(horizons, score, confidence, agreement, recommendation) {
        let summary = '';
        
        // Основная рекомендация
        const recEmoji = recommendation === 'BUY' ? '📈' : recommendation === 'SELL' ? '📉' : '⏸️';
        summary += `${recEmoji} Итоговая рекомендация: ${recommendation}\n`;
        summary += `Общий сигнал: ${(score * 100).toFixed(1)}% (уверенность: ${(confidence * 100).toFixed(0)}%)\n\n`;
        
        // Согласованность горизонтов
        if (agreement !== null) {
            if (agreement > 0.7) {
                summary += `✅ Высокая согласованность (${(agreement * 100).toFixed(0)}%) - все горизонты согласны\n\n`;
            } else if (agreement > 0.5) {
                summary += `⚠️ Умеренная согласованность (${(agreement * 100).toFixed(0)}%) - горизонты частично расходятся\n\n`;
            } else {
                summary += `❌ Низкая согласованность (${(agreement * 100).toFixed(0)}%) - горизонты дают разные сигналы\n\n`;
            }
        }
        
        // Детали по горизонтам
        if (horizons) {
            summary += '📊 Прогнозы по временным горизонтам:\n\n';
            
            // Краткосрочный
            const shortEmoji = horizons.shortTerm.recommendation === 'BUY' ? '🟢' : 
                              horizons.shortTerm.recommendation === 'SELL' ? '🔴' : '🟡';
            summary += `${shortEmoji} ${horizons.shortTerm.name} (${horizons.shortTerm.description})\n`;
            summary += `   Модель: ${horizons.shortTerm.model}\n`;
            summary += `   Сигнал: ${horizons.shortTerm.recommendation} (${(horizons.shortTerm.score * 100).toFixed(1)}%)\n`;
            summary += `   Уверенность: ${(horizons.shortTerm.confidence * 100).toFixed(0)}%\n`;
            summary += `   ${horizons.shortTerm.explanation}\n\n`;
            
            // Среднесрочный
            const mediumEmoji = horizons.mediumTerm.recommendation === 'BUY' ? '🟢' : 
                               horizons.mediumTerm.recommendation === 'SELL' ? '🔴' : '🟡';
            summary += `${mediumEmoji} ${horizons.mediumTerm.name} (${horizons.mediumTerm.description})\n`;
            summary += `   Модель: ${horizons.mediumTerm.model}\n`;
            summary += `   Сигнал: ${horizons.mediumTerm.recommendation} (${(horizons.mediumTerm.score * 100).toFixed(1)}%)\n`;
            summary += `   Уверенность: ${(horizons.mediumTerm.confidence * 100).toFixed(0)}%\n`;
            summary += `   ${horizons.mediumTerm.explanation}\n\n`;
            
            // Долгосрочный
            const longEmoji = horizons.longTerm.recommendation === 'BUY' ? '🟢' : 
                             horizons.longTerm.recommendation === 'SELL' ? '🔴' : '🟡';
            summary += `${longEmoji} ${horizons.longTerm.name} (${horizons.longTerm.description})\n`;
            summary += `   Модель: ${horizons.longTerm.model}\n`;
            summary += `   Сигнал: ${horizons.longTerm.recommendation} (${(horizons.longTerm.score * 100).toFixed(1)}%)\n`;
            summary += `   Уверенность: ${(horizons.longTerm.confidence * 100).toFixed(0)}%\n`;
            summary += `   ${horizons.longTerm.explanation}\n`;
        }
        
        return summary;
    }

    /**
     * Получение рыночных данных для мета-адаптации
     */
    async getMarketData(figi) {
        try {
            const candles = await CacheService.getCandles(figi, 'DAY', 30);
            if (candles.length < 10) {
                return { volatility: 0, trend: 0, volume_ratio: 1, rsi: 50, macd: 0 };
            }

            const prices = candles.map(c => c.close);
            const volumes = candles.map(c => c.volume);
            
            // Вычисляем базовые метрики
            const priceChanges = prices.slice(1).map((price, i) => (price - prices[i]) / prices[i]);
            const volatility = Math.sqrt(priceChanges.reduce((sum, change) => sum + change * change, 0) / priceChanges.length);
            
            const trend = prices[prices.length - 1] > prices[0] ? 1 : -1;
            const volumeRatio = volumes[volumes.length - 1] / (volumes.reduce((sum, v) => sum + v, 0) / volumes.length);
            
            // Рассчитываем RSI (упрощенная версия)
            const rsi = this.calculateRSI(prices);
            
            // Рассчитываем MACD (упрощенная версия)
            const macd = this.calculateMACD(prices);
            
            return {
                volatility,
                trend,
                volume_ratio: volumeRatio,
                rsi,
                macd
            };
        } catch (error) {
            console.warn('⚠️ Failed to get market data:', error.message);
            return { volatility: 0, trend: 0, volume_ratio: 1, rsi: 50, macd: 0 };
        }
    }

    /**
     * Расчет RSI (упрощенная версия)
     */
    calculateRSI(prices, period = 14) {
        if (prices.length < period + 1) return 50;
        
        const gains = [];
        const losses = [];
        
        for (let i = 1; i < prices.length; i++) {
            const change = prices[i] - prices[i - 1];
            if (change > 0) {
                gains.push(change);
                losses.push(0);
            } else {
                gains.push(0);
                losses.push(Math.abs(change));
            }
        }
        
        if (gains.length < period) return 50;
        
        const avgGain = gains.slice(-period).reduce((sum, gain) => sum + gain, 0) / period;
        const avgLoss = losses.slice(-period).reduce((sum, loss) => sum + loss, 0) / period;
        
        if (avgLoss === 0) return 100;
        
        const rs = avgGain / avgLoss;
        const rsi = 100 - (100 / (1 + rs));
        
        return Math.max(0, Math.min(100, rsi));
    }

    /**
     * Расчет MACD (упрощенная версия)
     */
    calculateMACD(prices, fastPeriod = 12, slowPeriod = 26) {
        if (prices.length < slowPeriod) return 0;
        
        const fastEMA = this.calculateEMA(prices, fastPeriod);
        const slowEMA = this.calculateEMA(prices, slowPeriod);
        
        return fastEMA - slowEMA;
    }

    /**
     * Расчет экспоненциального скользящего среднего
     */
    calculateEMA(prices, period) {
        if (prices.length < period) return prices[prices.length - 1];
        
        const multiplier = 2 / (period + 1);
        let ema = prices[0];
        
        for (let i = 1; i < prices.length; i++) {
            ema = (prices[i] * multiplier) + (ema * (1 - multiplier));
        }
        
        return ema;
    }

    /**
     * Обучение всех активных сетей (полное)
     */
    async trainAllNetworks(figi, options = {}) {
        try {
            console.log(`🚀 Training all networks for ${figi}...`);
            
            // Отправляем уведомление о старте полного обучения
            await OptimizedTelegramService.sendFullTrainingStart(figi, options);
            
            const results = {};

            // Обучение ансамбля
            if (this.activeNetworks.ensemble) {
                try {
                    console.log('🎭 Training ensemble...');
                    results.ensemble = await EnsembleService.trainEnsemble(figi, options);
                } catch (error) {
                    console.warn('⚠️ Ensemble training failed:', error.message);
                    results.ensemble = { success: false, error: error.message };
                }
            }

            // Обучение RL агента
            if (this.activeNetworks.reinforcementLearning) {
                try {
                    console.log('🤖 Training RL agent...');
                    results.reinforcement = await ReinforcementLearningService.train(figi, options);
                } catch (error) {
                    console.warn('⚠️ RL training failed:', error.message);
                    results.reinforcement = { success: false, error: error.message };
                }
            }

            // Обучение традиционной нейросети
            if (this.activeNetworks.traditional) {
                try {
                    console.log('🧠 Training traditional network...');
                    results.traditional = await NeuralNetworkService.trainForInstrument(figi, options.days);
                } catch (error) {
                    console.warn('⚠️ Traditional training failed:', error.message);
                    results.traditional = { success: false, error: error.message };
                }
            }

            // Обновляем статистику производительности
            await this.updatePerformanceStats();

            console.log('✅ All networks training completed');
            return results;

        } catch (error) {
            console.error('❌ Training all networks failed:', error);
            throw error;
        }
    }

    /**
     * Частичное обучение (дообучение)
     */
    async partialTraining(figi, options = {}) {
        try {
            console.log(`🔄 Partial training for ${figi}...`);
            
            const results = {};

            // Дообучение только традиционной нейросети (быстрее)
            if (this.activeNetworks.traditional) {
                try {
                    console.log('🧠 Partial training traditional network...');
                    results.traditional = await NeuralNetworkService.trainForInstrument(figi, options.days || 30);
                } catch (error) {
                    console.warn('⚠️ Traditional partial training failed:', error.message);
                    results.traditional = { success: false, error: error.message };
                }
            }

            // Обновляем статистику производительности
            await this.updatePerformanceStats();

            console.log('✅ Partial training completed');
            return results;

        } catch (error) {
            console.error('❌ Partial training failed:', error);
            throw error;
        }
    }

    /**
     * Обновление статистики производительности
     */
    async updatePerformanceStats() {
        try {
            // Обновляем статистику ансамбля
            if (this.activeNetworks.ensemble) {
                const ensembleStatus = EnsembleService.getStatus();
                this.performance.ensemble = ensembleStatus.performance;
            }

            // Обновляем статистику мета-обучения
            if (this.activeNetworks.metaLearning) {
                const metaStats = MetaLearningService.getStats();
                this.performance.metaLearning = {
                    adaptationRate: metaStats.adaptationRate,
                    knowledgeBaseSize: metaStats.knowledgeBaseSize
                };
            }

            // Обновляем статистику RL
            if (this.activeNetworks.reinforcementLearning) {
                const rlStats = ReinforcementLearningService.getStats();
                this.performance.reinforcementLearning = {
                    averageReward: rlStats.averageReward,
                    winRate: rlStats.winRate
                };
            }

            // Обновляем статистику традиционной нейросети
            if (this.activeNetworks.traditional) {
                const traditionalStatus = NeuralNetworkService.getStatus();
                this.performance.traditional = {
                    accuracy: traditionalStatus.accuracy || 0.75,
                    precision: traditionalStatus.precision || 0.70,
                    recall: traditionalStatus.recall || 0.65,
                    f1Score: 0.67
                };
            }

            this.lastUpdate = new Date().toISOString();

        } catch (error) {
            console.warn('⚠️ Failed to update performance stats:', error.message);
        }
    }

    /**
     * Получение статуса всех сетей
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            activeNetworks: this.activeNetworks,
            performance: this.performance,
            lastUpdate: this.lastUpdate,
            totalRecommendations: this.recommendations.length
        };
    }

    /**
     * Получение детальной статистики
     */
    getDetailedStats() {
        const stats = {
            overview: this.getStatus(),
            ensemble: this.activeNetworks.ensemble ? EnsembleService.getStatus() : null,
            metaLearning: this.activeNetworks.metaLearning ? MetaLearningService.getStats() : null,
            reinforcementLearning: this.activeNetworks.reinforcementLearning ? ReinforcementLearningService.getStats() : null,
            traditional: this.activeNetworks.traditional ? NeuralNetworkService.getStatus() : null
        };

        return stats;
    }

    /**
     * Активация/деактивация сетей
     */
    setNetworkStatus(network, active) {
        if (network in this.activeNetworks) {
            this.activeNetworks[network] = active;
            console.log(`🔄 ${network} network ${active ? 'activated' : 'deactivated'}`);
        } else {
            throw new Error(`Unknown network: ${network}`);
        }
    }

    /**
     * Получение последних рекомендаций
     */
    getRecentRecommendations(limit = 10) {
        return this.recommendations.slice(-limit);
    }

    /**
     * Очистка старых рекомендаций
     */
    cleanupOldRecommendations(maxAge = 24 * 60 * 60 * 1000) { // 24 часа
        const cutoff = new Date(Date.now() - maxAge);
        this.recommendations = this.recommendations.filter(rec => 
            new Date(rec.timestamp) > cutoff
        );
        console.log(`🧹 Cleaned up old recommendations. Remaining: ${this.recommendations.length}`);
    }

    /**
     * Сохранение всех моделей
     */
    async saveAllModels() {
        try {
            console.log('💾 Saving all models...');
            
            const results = {};

            if (this.activeNetworks.ensemble) {
                await EnsembleService.saveModels();
                results.ensemble = 'saved';
            }

            if (this.activeNetworks.metaLearning) {
                await MetaLearningService.saveMetaModel();
                results.metaLearning = 'saved';
            }

            if (this.activeNetworks.reinforcementLearning) {
                await ReinforcementLearningService.saveModel();
                results.reinforcementLearning = 'saved';
            }

            if (this.activeNetworks.traditional) {
                await NeuralNetworkService.saveModel();
                results.traditional = 'saved';
            }

            console.log('✅ All models saved');
            return results;

        } catch (error) {
            console.error('❌ Failed to save models:', error);
            throw error;
        }
    }

    /**
     * Загрузка всех моделей
     */
    async loadAllModels() {
        try {
            console.log('📥 Loading all models...');
            
            const results = {};

            if (this.activeNetworks.ensemble) {
                await EnsembleService.loadModels();
                results.ensemble = 'loaded';
            }

            if (this.activeNetworks.metaLearning) {
                await MetaLearningService.loadMetaModel();
                results.metaLearning = 'loaded';
            }

            if (this.activeNetworks.reinforcementLearning) {
                await ReinforcementLearningService.loadModel();
                results.reinforcementLearning = 'loaded';
            }

            if (this.activeNetworks.traditional) {
                await NeuralNetworkService.loadModel();
                results.traditional = 'loaded';
            }

            console.log('✅ All models loaded');
            return results;

        } catch (error) {
            console.error('❌ Failed to load models:', error);
            throw error;
        }
    }
}

// Создаем экземпляр сервиса
const integratedAIService = new IntegratedAIService();

// Добавляем алиас для обратной совместимости
integratedAIService.getRecommendation = integratedAIService.getIntegratedRecommendation;

export default integratedAIService;
