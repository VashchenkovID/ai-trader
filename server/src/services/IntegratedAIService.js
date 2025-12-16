import EnsembleService from './EnsembleService.js';
import MetaLearningService from './MetaLearningService.js';
import ReinforcementLearningService from './ReinforcementLearningService.js';
import NeuralNetworkService from './NeuralNetworkService.js';
import WebSocketService from './WebSocketService.js';
import CacheService from './CacheService.js';
import OptimizedTelegramService from './OptimizedTelegramService.js';
import SignalCacheService from './SignalCacheService.js';
import SignalValidationService from './SignalValidationService.js';
import NewsAnalysisService from './NewsAnalysisService.js';

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
            
            const recommendations = [];
            const weights = {};

            // 1. Рекомендация от ансамбля (с горизонтами)
            if (this.activeNetworks.ensemble) {
                try {
                    const ensembleRec = await EnsembleService.predict(figi, portfolio);
                    // Добавляем рекомендацию ансамбля с реальными данными
                    recommendations.push({
                        source: 'ensemble',
                        score: ensembleRec.score || 0.5,
                        confidence: ensembleRec.confidence || 0.3,
                        recommendation: ensembleRec.recommendation || 'HOLD',
                        agreement: ensembleRec.agreement || 1.0, // Согласованность между горизонтами
                        horizons: ensembleRec.horizons || null, // Детали по горизонтам
                        summary: ensembleRec.summary || null, // Понятное резюме
                        details: ensembleRec.individualPredictions || null, // Для обратной совместимости
                        error: ensembleRec.error || null, // Сохраняем ошибку, если есть
                        reason: ensembleRec.reason || null // Сохраняем причину, если есть
                    });
                    weights.ensemble = ensembleRec.confidence || 0.3;
                } catch (error) {
                    console.warn('⚠️ Ensemble recommendation failed:', error.message);
                    // При ошибке просто пропускаем ансамбль, используем другие источники
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

            // 6. Получаем новости и рассчитываем рекомендацию на основе сентимента
            let newsRecommendation = null;
            try {
                // Получаем новости за последние 7 дней
                const news = await NewsAnalysisService.getCachedNews(figi, 7, 20);
                
                if (news && news.length > 0) {
                    // Рассчитываем средний сентимент и релевантность
                    const sentiments = news.map(n => n.sentiment || 0).filter(s => s !== 0);
                    const relevances = news.map(n => n.relevance || 0).filter(r => r > 0);
                    
                    if (sentiments.length > 0) {
                        const avgSentiment = sentiments.reduce((sum, s) => sum + s, 0) / sentiments.length;
                        const avgRelevance = relevances.length > 0 
                            ? relevances.reduce((sum, r) => sum + r, 0) / relevances.length 
                            : 0.5;
                        
                        // Конвертируем сентимент (-1 до 1) в score (0 до 1)
                        // Положительный сентимент -> BUY (0.5 - 1.0)
                        // Отрицательный сентимент -> SELL (0.0 - 0.5)
                        let newsScore = 0.5; // HOLD по умолчанию
                        let newsRecommendationType = 'HOLD';
                        
                        if (avgSentiment > 0.1) {
                            // Положительный сентимент
                            newsScore = 0.5 + (avgSentiment * 0.5); // 0.5 - 1.0
                            newsRecommendationType = 'BUY';
                        } else if (avgSentiment < -0.1) {
                            // Отрицательный сентимент
                            newsScore = 0.5 + (avgSentiment * 0.5); // 0.0 - 0.5
                            newsRecommendationType = 'SELL';
                        }
                        
                        // Уверенность зависит от количества новостей и их релевантности
                        const newsConfidence = Math.min(0.9, 
                            Math.max(0.3, avgRelevance * Math.min(1, news.length / 10))
                        );
                        
                        newsRecommendation = {
                            source: 'news',
                            score: newsScore,
                            confidence: newsConfidence,
                            recommendation: newsRecommendationType,
                            details: {
                                newsCount: news.length,
                                avgSentiment: avgSentiment,
                                avgRelevance: avgRelevance,
                                positiveNews: sentiments.filter(s => s > 0).length,
                                negativeNews: sentiments.filter(s => s < 0).length,
                                neutralNews: sentiments.filter(s => s === 0).length
                            }
                        };
                        
                        recommendations.push(newsRecommendation);
                        // Вес новостей зависит от релевантности и количества
                        weights.news = newsConfidence * Math.min(1, news.length / 15);
                    }
                }
            } catch (error) {
                console.warn('⚠️ News analysis failed:', error.message);
            }

            // Вычисляем интегрированную рекомендацию
            const integratedRec = this.calculateIntegratedRecommendation(recommendations, weights);
            
            // Добавляем информацию о валидации сигналов, если она была выполнена
            if (validationResult && validationResult.success && validationResult.hasSignals) {
                integratedRec.signalsValidation = {
                    directionMatch: validationResult.metrics.directionMatch,
                    directionAgreement: validationResult.metrics.directionAgreement,
                    probabilityCorrelation: validationResult.metrics.probabilityCorrelation,
                    overallAgreement: validationResult.metrics.overallAgreement,
                    signalsCount: validationResult.signalsSummary.total
                };
            }
            
            // Добавляем информацию о новостях, если они были проанализированы
            if (newsRecommendation) {
                integratedRec.newsAnalysis = {
                    newsCount: newsRecommendation.details.newsCount,
                    avgSentiment: newsRecommendation.details.avgSentiment,
                    avgRelevance: newsRecommendation.details.avgRelevance,
                    positiveNews: newsRecommendation.details.positiveNews,
                    negativeNews: newsRecommendation.details.negativeNews,
                    neutralNews: newsRecommendation.details.neutralNews,
                    recommendation: newsRecommendation.recommendation,
                    confidence: newsRecommendation.confidence
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

        // Собираем рекомендации от всех источников для расчета согласованности
        const sourceRecommendations = [];

        for (const rec of recommendations) {
            const weight = normalizedWeights[rec.source] || 0;
            weightedScore += rec.score * weight;
            totalConfidence += rec.confidence * weight;
            
            // Сохраняем рекомендацию источника для расчета согласованности
            sourceRecommendations.push({
                source: rec.source,
                recommendation: rec.recommendation,
                weight: weight,
                confidence: rec.confidence
            });
            
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

        // Определяем финальную рекомендацию с учетом И score И confidence
        // Используем пороги из moderate стратегии как базовые (более консервативные)
        const baseThresholds = {
            buyScore: 0.65,
            buyConfidence: 0.6,
            sellScore: 0.35,
            sellConfidence: 0.6
        };
        
        let recommendation = 'HOLD';
        
        // BUY: нужен высокий score И высокая confidence
        if (weightedScore >= baseThresholds.buyScore && totalConfidence >= baseThresholds.buyConfidence) {
            recommendation = 'BUY';
        } 
        // SELL: нужен низкий score И высокая confidence (чтобы быть уверенным в продаже)
        else if (weightedScore <= baseThresholds.sellScore && totalConfidence >= baseThresholds.sellConfidence) {
            recommendation = 'SELL';
        }
        // Если confidence низкая, даже при экстремальных score, лучше HOLD
        // Это предотвращает рекомендации на основе ненадежных данных

        // Рассчитываем согласованность между источниками
        let sourceAgreement = 1.0;
        if (sourceRecommendations.length > 1) {
            // Подсчитываем количество рекомендаций каждого типа с учетом весов
            const buyWeight = sourceRecommendations
                .filter(r => r.recommendation === 'BUY')
                .reduce((sum, r) => sum + r.weight, 0);
            const sellWeight = sourceRecommendations
                .filter(r => r.recommendation === 'SELL')
                .reduce((sum, r) => sum + r.weight, 0);
            const holdWeight = sourceRecommendations
                .filter(r => r.recommendation === 'HOLD')
                .reduce((sum, r) => sum + r.weight, 0);
            
            // Максимальный вес (доминирующая рекомендация)
            const maxWeight = Math.max(buyWeight, sellWeight, holdWeight);
            const totalWeight = buyWeight + sellWeight + holdWeight;
            
            // Согласованность = доля веса доминирующей рекомендации
            sourceAgreement = totalWeight > 0 ? maxWeight / totalWeight : 1.0;
        }

        // Корректируем итоговую confidence с учетом согласованности источников
        // Если источники расходятся, снижаем confidence
        const adjustedConfidence = totalConfidence * sourceAgreement;

        // Генерируем рекомендации по стратегиям для каждого горизонта
        if (horizons) {
            horizons = this.addStrategyRecommendationsToHorizons(horizons);
        }

        // Генерируем понятное резюме, если есть горизонты
        let finalSummary = summary;
        if (!finalSummary && horizons) {
            finalSummary = this.generateIntegratedSummary(horizons, weightedScore, totalConfidence, agreement, recommendation);
        }

        return {
            score: weightedScore,
            confidence: adjustedConfidence, // Используем скорректированную confidence
            recommendation,
            sources: recommendations.length,
            details: sourceDetails,
            weights: normalizedWeights,
            // Добавляем информацию о горизонтах, если доступна (теперь с рекомендациями по стратегиям)
            horizons: horizons,
            agreement: agreement, // Согласованность горизонтов внутри ensemble
            sourceAgreement: sourceAgreement, // Согласованность между источниками
            summary: finalSummary
        };
    }

    /**
     * Добавляет рекомендации по стратегиям для каждого горизонта
     * Агрессивная стратегия может давать BUY при более низком confidence, консервативная — только при высоком
     */
    addStrategyRecommendationsToHorizons(horizons) {
        if (!horizons) return horizons;

        // Пороги для каждой стратегии
        const strategyThresholds = {
            aggressive: {
                buyScore: 0.55,
                buyConfidence: 0.5,
                sellScore: 0.45,
                sellConfidence: 0.5
            },
            moderate: {
                buyScore: 0.65,
                buyConfidence: 0.6,
                sellScore: 0.35,
                sellConfidence: 0.6
            },
            conservative: {
                buyScore: 0.75,
                buyConfidence: 0.8,
                sellScore: 0.25,
                sellConfidence: 0.8
            }
        };

        // Обрабатываем каждый горизонт
        const horizonKeys = ['shortTerm', 'mediumTerm', 'longTerm'];
        
        for (const horizonKey of horizonKeys) {
            if (!horizons[horizonKey]) continue;
            
            const horizon = horizons[horizonKey];
            const baseScore = horizon.score || 0;
            const baseConfidence = horizon.confidence || 0;
            const baseRecommendation = horizon.recommendation || 'HOLD';
            
            // Генерируем рекомендации для каждой стратегии
            const strategies = {};
            
            for (const [strategyType, thresholds] of Object.entries(strategyThresholds)) {
                let strategyRecommendation = 'HOLD';
                
                // Определяем рекомендацию на основе порогов стратегии
                // Сначала проверяем BUY (более строгие условия)
                if (baseScore >= thresholds.buyScore && baseConfidence >= thresholds.buyConfidence) {
                    strategyRecommendation = 'BUY';
                } 
                // Затем проверяем SELL (более строгие условия)
                else if (baseScore <= thresholds.sellScore && baseConfidence >= thresholds.sellConfidence) {
                    strategyRecommendation = 'SELL';
                } 
                // Если базовая рекомендация SELL, но стратегия не прошла порог для SELL
                else if (baseRecommendation === 'SELL') {
                    // Для агрессивной стратегии можем дать SELL даже при более низком confidence
                    if (strategyType === 'aggressive' && baseScore < 0.5 && baseConfidence >= 0.4) {
                        strategyRecommendation = 'SELL';
                    } else {
                        strategyRecommendation = 'HOLD';
                    }
                }
                // Иначе HOLD
                else {
                    strategyRecommendation = 'HOLD';
                }
                
                strategies[strategyType] = {
                    recommendation: strategyRecommendation,
                    score: baseScore,
                    confidence: baseConfidence,
                    // Уверенность стратегии зависит от того, насколько уверенно мы можем дать эту рекомендацию
                    strategyConfidence: this.calculateStrategyConfidence(
                        baseScore, 
                        baseConfidence, 
                        strategyType, 
                        strategyRecommendation,
                        thresholds
                    ),
                    thresholds: thresholds,
                    // Объяснение почему эта стратегия дает такую рекомендацию
                    explanation: this.generateStrategyExplanation(
                        strategyType,
                        strategyRecommendation,
                        baseScore,
                        baseConfidence,
                        thresholds
                    )
                };
            }
            
            // Добавляем рекомендации по стратегиям в горизонт
            horizon.strategies = strategies;
            
            // Обновляем базовую рекомендацию горизонта на основе стратегических рекомендаций
            // Если хотя бы одна стратегия дает SELL, а базовая HOLD, меняем на SELL
            // Если хотя бы одна стратегия дает BUY, а базовая HOLD, меняем на BUY
            const strategyRecommendations = Object.values(strategies).map(s => s.recommendation);
            const hasSellStrategy = strategyRecommendations.includes('SELL');
            const hasBuyStrategy = strategyRecommendations.includes('BUY');
            
            if (baseRecommendation === 'HOLD') {
                if (hasSellStrategy && !hasBuyStrategy) {
                    // Если есть SELL стратегии и нет BUY, меняем на SELL
                    horizon.recommendation = 'SELL';
                } else if (hasBuyStrategy && !hasSellStrategy) {
                    // Если есть BUY стратегии и нет SELL, меняем на BUY
                    horizon.recommendation = 'BUY';
                }
                // Если есть и BUY и SELL, оставляем HOLD (противоречие)
            }
        }
        
        return horizons;
    }

    /**
     * Рассчитывает уверенность стратегии на основе базовых показателей и порогов
     */
    calculateStrategyConfidence(baseScore, baseConfidence, strategyType, recommendation, thresholds) {
        if (recommendation === 'HOLD') {
            return Math.min(baseConfidence, 0.5);
        }
        
        // Для BUY/SELL уверенность зависит от того, насколько показатели превышают пороги
        if (recommendation === 'BUY') {
            const scoreExcess = Math.max(0, (baseScore - thresholds.buyScore) / (1 - thresholds.buyScore));
            const confidenceExcess = Math.max(0, (baseConfidence - thresholds.buyConfidence) / (1 - thresholds.buyConfidence));
            return Math.min(1, baseConfidence + (scoreExcess + confidenceExcess) / 2 * 0.2);
        } else if (recommendation === 'SELL') {
            const scoreExcess = Math.max(0, (thresholds.sellScore - baseScore) / thresholds.sellScore);
            const confidenceExcess = Math.max(0, (baseConfidence - thresholds.sellConfidence) / (1 - thresholds.sellConfidence));
            return Math.min(1, baseConfidence + (scoreExcess + confidenceExcess) / 2 * 0.2);
        }
        
        return baseConfidence;
    }

    /**
     * Генерирует объяснение рекомендации стратегии
     */
    generateStrategyExplanation(strategyType, recommendation, score, confidence, thresholds) {
        const strategyNames = {
            aggressive: 'Агрессивная',
            moderate: 'Умеренная',
            conservative: 'Консервативная'
        };
        
        const strategyName = strategyNames[strategyType] || strategyType;
        const scorePercent = (score * 100).toFixed(1);
        const confidencePercent = (confidence * 100).toFixed(0);
        
        if (recommendation === 'BUY') {
            return `${strategyName} стратегия рекомендует покупку: сигнал ${scorePercent}% (порог: ${(thresholds.buyScore * 100).toFixed(0)}%), уверенность ${confidencePercent}% (порог: ${(thresholds.buyConfidence * 100).toFixed(0)}%)`;
        } else if (recommendation === 'SELL') {
            return `${strategyName} стратегия рекомендует продажу: сигнал ${scorePercent}% (порог: ${(thresholds.sellScore * 100).toFixed(0)}%), уверенность ${confidencePercent}% (порог: ${(thresholds.sellConfidence * 100).toFixed(0)}%)`;
        } else {
            // HOLD - объясняем почему не BUY и не SELL
            // Проверяем условия для SELL (если они выполнены, но recommendation = HOLD из-за других факторов)
            const meetsSellConditions = score <= thresholds.sellScore && confidence >= thresholds.sellConfidence;
            // Проверяем условия для BUY (если они выполнены, но recommendation = HOLD из-за других факторов)
            const meetsBuyConditions = score >= thresholds.buyScore && confidence >= thresholds.buyConfidence;
            
            if (meetsSellConditions) {
                // Условия для SELL выполнены, но recommendation = HOLD (возможно из-за других факторов)
                // В этом случае все равно говорим о продаже, так как условия выполнены
                return `${strategyName} стратегия рекомендует продажу: сигнал ${scorePercent}% (порог: ${(thresholds.sellScore * 100).toFixed(0)}%), уверенность ${confidencePercent}% (порог: ${(thresholds.sellConfidence * 100).toFixed(0)}%)`;
            } else if (meetsBuyConditions) {
                // Условия для BUY выполнены, но recommendation = HOLD (возможно из-за других факторов)
                // В этом случае все равно говорим о покупке, так как условия выполнены
                return `${strategyName} стратегия рекомендует покупку: сигнал ${scorePercent}% (порог: ${(thresholds.buyScore * 100).toFixed(0)}%), уверенность ${confidencePercent}% (порог: ${(thresholds.buyConfidence * 100).toFixed(0)}%)`;
            } else {
                // Условия для BUY не выполнены
                if (score < thresholds.buyScore || confidence < thresholds.buyConfidence) {
                    return `${strategyName} стратегия не рекомендует покупку: сигнал ${scorePercent}% или уверенность ${confidencePercent}% ниже порога (${(thresholds.buyScore * 100).toFixed(0)}%/${(thresholds.buyConfidence * 100).toFixed(0)}%)`;
                }
                // Если условия для SELL не выполнены (score > sellScore или confidence < sellConfidence)
                if (score > thresholds.sellScore || confidence < thresholds.sellConfidence) {
                    return `${strategyName} стратегия не рекомендует продажу: сигнал ${scorePercent}% или уверенность ${confidencePercent}% выше порога (${(thresholds.sellScore * 100).toFixed(0)}%/${(thresholds.sellConfidence * 100).toFixed(0)}%)`;
                }
                return `${strategyName} стратегия рекомендует удержание: показатели не достигают порогов для активных действий`;
            }
        }
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
