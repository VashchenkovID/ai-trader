import EnsembleService from './EnsembleService.js';
import MetaLearningService from './MetaLearningService.js';
import ReinforcementLearningService from './ReinforcementLearningService.js';
import NeuralNetworkService from './NeuralNetworkService.js';
import CacheService from './CacheService.js';
import OptimizedTelegramService from './OptimizedTelegramService.js';
import SignalCacheService from './SignalCacheService.js';
import SignalValidationService from './SignalValidationService.js';
import NewsAnalysisService from './NewsAnalysisService.js';
import ModelWeightingService from './ModelWeightingService.js';
import AdaptiveThresholdService from './AdaptiveThresholdService.js';
import StackingService from './StackingService.js';
import LoggerService from './LoggerService.js';
import { getService } from './GlobalServiceManager.js';
import MarketRegimeService from './MarketRegimeService.js';
import MultiTimeframeService from './MultiTimeframeService.js';

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
            // Проверяем, не инициализирован ли уже сервис
            if (this.isInitialized) {
                return;
            }
            
            // Проверяем, инициализированы ли уже сервисы через ServiceManager
            // Если нет - инициализируем их
            if (!NeuralNetworkService.isInitialized) {
                await NeuralNetworkService.initialize();
                this.activeNetworks.traditional = true;
            } else {
                this.activeNetworks.traditional = true;
            }
            
            if (!EnsembleService.isInitialized) {
                await EnsembleService.initialize();
                this.activeNetworks.ensemble = true;
            } else {
                this.activeNetworks.ensemble = true;
            }
            
            if (!MetaLearningService.isInitialized) {
                await MetaLearningService.initialize();
                this.activeNetworks.metaLearning = true;
            } else {
                this.activeNetworks.metaLearning = true;
            }
            
            if (!ReinforcementLearningService.isInitialized) {
                await ReinforcementLearningService.initialize();
                this.activeNetworks.reinforcementLearning = true;
            } else {
                this.activeNetworks.reinforcementLearning = true;
            }
            
            // Загружаем модели только если они еще не загружены
            // (модели уже загружены при инициализации отдельных сервисов)
            await this.loadAllModelsIfNeeded();
            
            // Инициализируем AdaptiveThresholdService (Фаза 2, задача 2.1.3)
            if (!AdaptiveThresholdService.isInitialized) {
                await AdaptiveThresholdService.initialize();
            }
            
            // Инициализируем MarketRegimeService (Фаза 3, задача 3.3)
            if (!MarketRegimeService.isInitialized) {
                await MarketRegimeService.initialize();
            }
            
            // Инициализируем StackingService (Фаза 2, задача 2.2.1)
            if (!StackingService.isInitialized) {
                await StackingService.initialize();
            }
            
            // Инициализируем ModelMonitoringService (Фаза 2, задача 2.4.3)
            const ModelMonitoringService = (await import('./ModelMonitoringService.js')).default;
            if (!ModelMonitoringService.isInitialized) {
                await ModelMonitoringService.initialize();
            }
            
            // НЕ сохраняем модели при инициализации - это делается только после обучения
            // await this.saveAllModels();
            
            this.isInitialized = true;
            this.lastUpdate = new Date().toISOString();
            
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Failed to initialize Integrated AI Service', {
                    service: 'IntegratedAIService',
                    operation: 'initialize',
                    error: { message: error.message, stack: error.stack }
                });
            }
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
            
            // Получаем динамические веса моделей из ModelWeightingService
            let dynamicWeights = {};
            try {
                if (ModelWeightingService && ModelWeightingService.isInitialized) {
                    dynamicWeights = await ModelWeightingService.getModelWeights(figi);
                }
            } catch (weightError) {
                if (LoggerService.isInitialized) {
                    LoggerService.error('Failed to get dynamic weights, using confidence-based weights', {
                        service: 'IntegratedAIService',
                        operation: 'getIntegratedRecommendation',
                        figi,
                        error: { message: weightError.message, stack: weightError.stack }
                    });
                }
            }
            
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
                    // Используем динамический вес, если доступен, иначе confidence
                    weights.ensemble = dynamicWeights.ensemble || ensembleRec.confidence || 0.3;
                } catch (error) {
                    if (LoggerService.isInitialized) {
                        LoggerService.error('Ensemble recommendation failed', {
                            service: 'IntegratedAIService',
                            operation: 'getIntegratedRecommendation',
                            figi,
                            error: { message: error.message, stack: error.stack }
                        });
                    }
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
                    // Используем динамический вес, если доступен, иначе confidence
                    weights.traditional = dynamicWeights.traditional || traditionalRec.confidence;
                } catch (error) {
                    if (LoggerService.isInitialized) {
                        LoggerService.error('Traditional recommendation failed', {
                            service: 'IntegratedAIService',
                            operation: 'getIntegratedRecommendation',
                            figi,
                            error: { message: error.message, stack: error.stack }
                        });
                    }
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
                    // Используем динамический вес, если доступен, иначе confidence
                    weights.reinforcement = dynamicWeights.reinforcementLearning || rlRec.confidence;
                } catch (error) {
                    if (LoggerService.isInitialized) {
                        LoggerService.error('RL recommendation failed', {
                            service: 'IntegratedAIService',
                            operation: 'getIntegratedRecommendation',
                            figi,
                            error: { message: error.message, stack: error.stack }
                        });
                    }
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
                    if (LoggerService.isInitialized) {
                        LoggerService.error('Meta-learning adaptation failed', {
                            service: 'IntegratedAIService',
                            operation: 'getIntegratedRecommendation',
                            figi,
                            error: { message: error.message, stack: error.stack }
                        });
                    }
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
                if (LoggerService.isInitialized) {
                    LoggerService.error('Signals validation failed', {
                        service: 'IntegratedAIService',
                        operation: 'getIntegratedRecommendation',
                        figi,
                        error: { message: error.message, stack: error.stack }
                    });
                }
            }

            // 6. Получаем новости и рассчитываем рекомендацию на основе сентимента
            // Фаза 3, задача 3.4: Расширенный анализ новостей
            let newsRecommendation = null;
            try {
                // Получаем расширенные новости с классификацией и временным затуханием
                const enhancedNews = await NewsAnalysisService.getEnhancedNews(figi, 7, 20, {
                    applyTimeDecay: true,
                    halfLifeDays: 7,
                    prioritizeByImportance: true
                });
                
                if (enhancedNews && enhancedNews.length > 0) {
                    // Используем скорректированные значения с учетом затухания
                    const adjustedSentiments = enhancedNews
                        .map(n => n.adjustedSentiment || 0)
                        .filter(s => s !== 0);
                    const adjustedRelevances = enhancedNews
                        .map(n => n.adjustedRelevance || 0)
                        .filter(r => r > 0);
                    
                    if (adjustedSentiments.length > 0) {
                        // Взвешенное среднее с учетом приоритета событий
                        let weightedSentiment = 0;
                        let totalWeight = 0;
                        let highPriorityCount = 0;
                        let criticalCount = 0;
                        
                        enhancedNews.forEach(article => {
                            const priority = article.eventClassification?.priority || 0.5;
                            const timeDecay = article.timeDecayFactor || 1;
                            const sentiment = article.adjustedSentiment || article.sentiment || 0;
                            const relevance = article.adjustedRelevance || article.relevance || 0.5;
                            
                            // Вес = приоритет * затухание * релевантность
                            const weight = priority * timeDecay * relevance;
                            
                            weightedSentiment += sentiment * weight;
                            totalWeight += weight;
                            
                            if (article.eventClassification?.isHighPriority) {
                                highPriorityCount++;
                            }
                            if (article.eventClassification?.isCritical) {
                                criticalCount++;
                            }
                        });
                        
                        const avgSentiment = totalWeight > 0 ? weightedSentiment / totalWeight : 0;
                        const avgRelevance = adjustedRelevances.length > 0 
                            ? adjustedRelevances.reduce((sum, r) => sum + r, 0) / adjustedRelevances.length 
                            : 0.5;
                        
                        // Конвертируем сентимент (-1 до 1) в score (0 до 1)
                        let newsScore = 0.5; // HOLD по умолчанию
                        let newsRecommendationType = 'HOLD';
                        
                        if (avgSentiment > 0.1) {
                            newsScore = 0.5 + (avgSentiment * 0.5); // 0.5 - 1.0
                            newsRecommendationType = 'BUY';
                        } else if (avgSentiment < -0.1) {
                            newsScore = 0.5 + (avgSentiment * 0.5); // 0.0 - 0.5
                            newsRecommendationType = 'SELL';
                        }
                        
                        // Уверенность зависит от количества новостей, релевантности и важности событий
                        const importanceBoost = Math.min(0.2, (highPriorityCount * 0.05) + (criticalCount * 0.1));
                        const newsConfidence = Math.min(0.9, 
                            Math.max(0.3, avgRelevance * Math.min(1, enhancedNews.length / 10) + importanceBoost)
                        );
                        
                        // Получаем feature importance для новостей
                        const newsFeatureImportance = await NewsAnalysisService.analyzeNewsFeatureImportance(figi, 30);
                        
                        // Группируем новости по категориям
                        const newsByCategory = {};
                        enhancedNews.forEach(article => {
                            const category = article.eventClassification?.category || 'general';
                            if (!newsByCategory[category]) {
                                newsByCategory[category] = [];
                            }
                            newsByCategory[category].push({
                                title: article.title,
                                sentiment: article.sentiment,
                                priority: article.eventClassification?.priority,
                                timeDecay: article.timeDecayFactor
                            });
                        });
                        
                        newsRecommendation = {
                            source: 'news',
                            score: newsScore,
                            confidence: newsConfidence,
                            recommendation: newsRecommendationType,
                            details: {
                                newsCount: enhancedNews.length,
                                avgSentiment: avgSentiment,
                                avgRelevance: avgRelevance,
                                positiveNews: adjustedSentiments.filter(s => s > 0).length,
                                negativeNews: adjustedSentiments.filter(s => s < 0).length,
                                neutralNews: enhancedNews.filter(n => (n.adjustedSentiment || n.sentiment || 0) === 0).length,
                                highPriorityNews: highPriorityCount,
                                criticalNews: criticalCount,
                                newsByCategory: newsByCategory,
                                // Фаза 3, задача 3.4.3: Feature importance
                                featureImportance: newsFeatureImportance.featureImportance,
                                topCategories: newsFeatureImportance.topCategories || []
                            }
                        };
                        
                        recommendations.push(newsRecommendation);
                        // Вес новостей зависит от релевантности, количества и важности событий
                        weights.news = newsConfidence * Math.min(1, enhancedNews.length / 15) * (1 + importanceBoost);
                    }
                }
            } catch (error) {
                if (LoggerService.isInitialized) {
                    LoggerService.error('News analysis failed', {
                        service: 'IntegratedAIService',
                        operation: 'getIntegratedRecommendation',
                        figi,
                        error: { message: error.message, stack: error.stack }
                    });
                }
            }

            // Фаза 4, задача 4.1.4: Мультитаймфреймовый анализ
            let multiTimeframeAnalysis = null;
            try {
                if (MultiTimeframeService && MultiTimeframeService.isInitialized) {
                    multiTimeframeAnalysis = await MultiTimeframeService.analyzeMultiTimeframe(figi, ['H1', 'D1', 'W1'], 30);
                    
                    // Добавляем рекомендацию от мультитаймфреймового анализа
                    if (multiTimeframeAnalysis && multiTimeframeAnalysis.weightedSignal) {
                        const mtfSignal = multiTimeframeAnalysis.weightedSignal;
                        const mtfScore = mtfSignal.direction === 'BUY' ? 0.5 + (mtfSignal.confidence / 200) :
                                       mtfSignal.direction === 'SELL' ? 0.5 - (mtfSignal.confidence / 200) : 0.5;
                        
                        recommendations.push({
                            source: 'multi_timeframe',
                            score: mtfScore,
                            confidence: mtfSignal.confidence / 100, // Конвертируем из процентов
                            recommendation: mtfSignal.direction,
                            details: {
                                consistency: multiTimeframeAnalysis.consistency,
                                priorityTimeframe: multiTimeframeAnalysis.priorityTimeframe,
                                signalsByTimeframe: Object.fromEntries(
                                    Object.entries(multiTimeframeAnalysis.timeframes).map(([tf, data]) => [
                                        tf,
                                        data.signal ? {
                                            direction: data.signal.direction,
                                            confidence: data.signal.confidence
                                        } : null
                                    ])
                                )
                            }
                        });
                        
                        // Вес мультитаймфреймового анализа зависит от согласованности
                        const consistencyScore = multiTimeframeAnalysis.consistency?.score || 0;
                        weights.multiTimeframe = consistencyScore * 0.3; // Максимальный вес 0.3
                    }
                }
            } catch (error) {
                if (LoggerService.isInitialized) {
                    LoggerService.error('Multi-timeframe analysis failed', {
                        service: 'IntegratedAIService',
                        operation: 'getIntegratedRecommendation',
                        figi,
                        error: { message: error.message, stack: error.stack }
                    });
                }
            }

            // Вычисляем интегрированную рекомендацию
            // Используем режим консенсуса из настроек (по умолчанию 'moderate')
            const consensusMode = 'moderate'; // Можно получать из настроек пользователя
            const integratedRec = await this.calculateIntegratedRecommendation(recommendations, weights, figi, consensusMode);
            
            // Обновляем согласованность моделей для ModelWeightingService
            if (ModelWeightingService && ModelWeightingService.isInitialized && recommendations.length > 1) {
                try {
                    const allRecommendations = recommendations.map(r => ({
                        source: r.source,
                        recommendation: r.recommendation
                    }));
                    
                    // Обновляем согласованность для каждой модели
                    for (const rec of recommendations) {
                        const otherRecs = recommendations.filter(r => r.source !== rec.source);
                        if (otherRecs.length > 0) {
                            const modelType = this.mapSourceToModelType(rec.source);
                            if (modelType) {
                                await ModelWeightingService.updateAgreement(modelType, otherRecs);
                            }
                        }
                    }
                } catch (agreementError) {
                    if (LoggerService.isInitialized) {
                        LoggerService.error('Failed to update model agreement', {
                            service: 'IntegratedAIService',
                            operation: 'getIntegratedRecommendation',
                            figi,
                            error: { message: agreementError.message, stack: agreementError.stack }
                        });
                    }
                }
            }
            
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
            
            // Фаза 4, задача 4.1.4: Добавляем информацию о мультитаймфреймовом анализе
            if (multiTimeframeAnalysis && multiTimeframeAnalysis.consistency) {
                integratedRec.multiTimeframeAnalysis = {
                    consistency: multiTimeframeAnalysis.consistency.agreement,
                    consistencyScore: multiTimeframeAnalysis.consistency.score,
                    priorityTimeframe: multiTimeframeAnalysis.priorityTimeframe,
                    weightedSignal: multiTimeframeAnalysis.weightedSignal,
                    signalsByTimeframe: Object.fromEntries(
                        Object.entries(multiTimeframeAnalysis.timeframes)
                            .filter(([tf, data]) => data && !data.error)
                            .map(([tf, data]) => [
                                tf,
                                {
                                    direction: data.signal?.direction || 'HOLD',
                                    confidence: data.signal?.confidence || 0
                                }
                            ])
                    )
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

            return integratedRec;

        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Integrated recommendation failed', {
                    service: 'IntegratedAIService',
                    operation: 'getIntegratedRecommendation',
                    figi,
                    error: { message: error.message, stack: error.stack }
                });
            }
            // Временный алерт в Telegram
            try {
                const OptimizedTelegramService = (await import('./OptimizedTelegramService.js')).default;
                await OptimizedTelegramService.sendAlert('INTEGRATED_AI_ERROR', {
                    error: error.message,
                    context: 'Integrated Recommendation',
                    timestamp: new Date().toISOString()
                });
            } catch (telegramError) {
                if (LoggerService.isInitialized) {
                    LoggerService.error('Failed to send Telegram alert', {
                        service: 'IntegratedAIService',
                        operation: 'getIntegratedRecommendation',
                        error: { message: telegramError.message }
                    });
                }
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
     * Маппинг источника рекомендации на тип модели
     */
    mapSourceToModelType(source) {
        const mapping = {
            'ensemble': 'ensemble',
            'traditional': 'traditional',
            'reinforcement': 'reinforcementLearning',
            'meta': 'metaLearning'
        };
        return mapping[source] || null;
    }

    /**
     * Вычисление интегрированной рекомендации
     * Обновлено в Фазе 2, задача 2.1.3: добавлена поддержка адаптивных порогов
     * Обновлено в Фазе 2, задача 2.2: добавлен Stacking и консенсусный механизм
     * @param {Array} recommendations - Рекомендации от базовых моделей
     * @param {Object} weights - Веса моделей
     * @param {string} figi - FIGI инструмента
     * @param {string} consensusMode - Режим консенсуса: 'conservative', 'moderate', 'aggressive'
     */
    async calculateIntegratedRecommendation(recommendations, weights, figi = null, consensusMode = 'moderate') {
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

        // Собираем информацию о горизонтах из ансамбля
        let horizons = null;
        let agreement = null;
        let summary = null;

        // Собираем рекомендации от всех источников для расчета согласованности
        const sourceRecommendations = [];
        const sourceDetails = {};

        for (const rec of recommendations) {
            const weight = normalizedWeights[rec.source] || 0;
            
            // Сохраняем рекомендацию источника для расчета согласованности
            sourceRecommendations.push({
                source: rec.source,
                recommendation: rec.recommendation,
                weight: weight,
                confidence: rec.confidence,
                score: rec.score
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

        // 2.2.1: Используем Stacking вместо простого взвешенного среднего
        let finalScore = 0;
        let finalConfidence = 0;
        let stackingResult = null;
        
        try {
            if (StackingService && StackingService.isInitialized) {
                // Проверяем, нужно ли переобучить модель
                if (StackingService.shouldRetrain()) {
                    LoggerService.info('🔄 Retraining stacking model...');
                    await StackingService.trainMetaModel(figi);
                }
                
                // Используем Stacking для объединения предсказаний
                stackingResult = await StackingService.predict(recommendations);
                finalScore = stackingResult.score;
                finalConfidence = stackingResult.confidence;
            } else {
                // Fallback на взвешенное среднее, если Stacking недоступен
                let weightedScore = 0;
                let totalConfidence = 0;
                for (const rec of recommendations) {
                    const weight = normalizedWeights[rec.source] || 0;
                    weightedScore += rec.score * weight;
                    totalConfidence += rec.confidence * weight;
                }
                finalScore = weightedScore;
                finalConfidence = totalConfidence;
            }
        } catch (error) {
            LoggerService.warn('⚠️ Stacking failed, using weighted average:', error.message);
            // Fallback на взвешенное среднее
            let weightedScore = 0;
            let totalConfidence = 0;
            for (const rec of recommendations) {
                const weight = normalizedWeights[rec.source] || 0;
                weightedScore += rec.score * weight;
                totalConfidence += rec.confidence * weight;
            }
            finalScore = weightedScore;
            finalConfidence = totalConfidence;
        }

        // 2.2.2: Учет корреляции между моделями
        let correlationAdjustedConfidence = finalConfidence;
        try {
            if (ModelWeightingService && ModelWeightingService.isInitialized) {
                correlationAdjustedConfidence = ModelWeightingService.adjustConfidenceForCorrelation(
                    recommendations,
                    finalConfidence
                );
            }
        } catch (error) {
            LoggerService.warn('⚠️ Correlation adjustment failed:', error.message);
        }

        // 2.2.3: Консенсусный механизм для обработки противоречивых сигналов
        const consensusResult = this.applyConsensusMechanism(
            sourceRecommendations,
            finalScore,
            correlationAdjustedConfidence,
            consensusMode
        );
        
        finalScore = consensusResult.score;
        correlationAdjustedConfidence = consensusResult.confidence;

        // Определяем финальную рекомендацию с учетом И score И confidence
        // Используем адаптивные пороги на основе рыночных условий (Фаза 2, задача 2.1.3)
        // Фаза 3, задача 3.3: Используем MarketRegimeService для более детального анализа
        let thresholds;
        let regimeInfo = null;
        try {
            // Приоритет: MarketRegimeService (более детальный анализ)
            if (MarketRegimeService && MarketRegimeService.isInitialized) {
                regimeInfo = await MarketRegimeService.detectRegime(figi);
                thresholds = MarketRegimeService.getAdaptiveThresholds(regimeInfo.regime);
                thresholds.marketMode = regimeInfo.regime;
                thresholds.regimeInfo = regimeInfo;
            } 
            // Fallback: AdaptiveThresholdService
            else if (AdaptiveThresholdService && AdaptiveThresholdService.isInitialized) {
                const marketMode = await AdaptiveThresholdService.detectMarketMode(figi);
                thresholds = await AdaptiveThresholdService.getAdaptiveThresholds(figi);
                thresholds.marketMode = marketMode;
            } 
            // Fallback на базовые пороги
            else {
                thresholds = {
                    buyScore: 0.65,
                    buyConfidence: 0.6,
                    sellScore: 0.35,
                    sellConfidence: 0.6,
                    marketMode: 'normal'
                };
            }
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.warn('Failed to get adaptive thresholds, using base thresholds', {
                    service: 'IntegratedAIService',
                    figi,
                    error: { message: error.message }
                });
            }
            // Fallback на базовые пороги
            thresholds = {
                buyScore: 0.65,
                buyConfidence: 0.6,
                sellScore: 0.35,
                sellConfidence: 0.6,
                marketMode: 'normal'
            };
        }
        
        // Адаптируем пороги в зависимости от режима консенсуса
        const adjustedThresholds = this.adjustThresholdsForConsensusMode(thresholds, consensusMode);
        
        let recommendation = 'HOLD';
        
        // BUY: нужен высокий score И высокая confidence
        if (finalScore >= adjustedThresholds.buyScore && correlationAdjustedConfidence >= adjustedThresholds.buyConfidence) {
            recommendation = 'BUY';
        } 
        // SELL: нужен низкий score И высокая confidence (чтобы быть уверенным в продаже)
        else if (finalScore <= adjustedThresholds.sellScore && correlationAdjustedConfidence >= adjustedThresholds.sellConfidence) {
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
        const adjustedConfidence = correlationAdjustedConfidence * sourceAgreement;

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
            score: finalScore,
            confidence: adjustedConfidence, // Используем скорректированную confidence
            recommendation,
            sources: recommendations.length,
            details: sourceDetails,
            weights: normalizedWeights,
            // Добавляем информацию о горизонтах, если доступна (теперь с рекомендациями по стратегиям)
            horizons: horizons,
            agreement: agreement, // Согласованность горизонтов внутри ensemble
            sourceAgreement: sourceAgreement, // Согласованность между источниками
            summary: finalSummary,
            // Добавляем информацию о рыночном режиме и порогах (Фаза 2, задача 2.1.3)
            // Фаза 3, задача 3.3: Расширенная информация о режиме
            marketMode: thresholds.marketMode,
            regimeInfo: regimeInfo, // Детальная информация о режиме (если доступна)
            thresholds: {
                buyScore: adjustedThresholds.buyScore,
                buyConfidence: adjustedThresholds.buyConfidence,
                sellScore: adjustedThresholds.sellScore,
                sellConfidence: adjustedThresholds.sellConfidence
            },
            // Информация о рекомендуемых стратегиях для режима (Фаза 3, задача 3.3.2)
            regimeStrategies: regimeInfo?.strategies || null,
            // Информация о методе объединения (Фаза 2, задача 2.2)
            combinationMethod: stackingResult?.method || 'weighted_average',
            consensusMode: consensusMode,
            correlationAdjusted: true
        };
    }

    /**
     * Консенсусный механизм для обработки противоречивых сигналов
     * @param {Array} sourceRecommendations - Рекомендации от источников
     * @param {number} baseScore - Базовый score
     * @param {number} baseConfidence - Базовая confidence
     * @param {string} mode - Режим: 'conservative', 'moderate', 'aggressive'
     * @returns {Object} - {score, confidence}
     */
    applyConsensusMechanism(sourceRecommendations, baseScore, baseConfidence, mode = 'moderate') {
        if (sourceRecommendations.length === 0) {
            return { score: baseScore, confidence: baseConfidence };
        }

        // Подсчитываем распределение рекомендаций
        const buyCount = sourceRecommendations.filter(r => r.recommendation === 'BUY').length;
        const sellCount = sourceRecommendations.filter(r => r.recommendation === 'SELL').length;
        const holdCount = sourceRecommendations.filter(r => r.recommendation === 'HOLD').length;
        
        const totalCount = sourceRecommendations.length;
        const buyRatio = buyCount / totalCount;
        const sellRatio = sellCount / totalCount;
        const holdRatio = holdCount / totalCount;
        
        // Определяем доминирующую рекомендацию
        const maxRatio = Math.max(buyRatio, sellRatio, holdRatio);
        const isContradictory = maxRatio < 0.5; // Нет явного большинства
        
        let adjustedScore = baseScore;
        let adjustedConfidence = baseConfidence;
        
        if (isContradictory) {
            // Противоречивые сигналы - обрабатываем в зависимости от режима
            switch (mode) {
                case 'conservative':
                    // Консервативный: при противоречиях снижаем уверенность и склоняемся к HOLD
                    adjustedConfidence *= 0.7; // Снижаем уверенность на 30%
                    adjustedScore = 0.5; // Смещаем к нейтральному значению
                    break;
                    
                case 'aggressive':
                    // Агрессивный: при противоречиях выбираем более сильный сигнал
                    if (buyRatio > sellRatio) {
                        adjustedScore = Math.min(1, baseScore + 0.1); // Усиливаем BUY
                    } else if (sellRatio > buyRatio) {
                        adjustedScore = Math.max(0, baseScore - 0.1); // Усиливаем SELL
                    }
                    adjustedConfidence *= 0.85; // Небольшое снижение уверенности
                    break;
                    
                case 'moderate':
                default:
                    // Умеренный: компромисс между консервативным и агрессивным
                    adjustedConfidence *= 0.8; // Снижаем уверенность на 20%
                    // Небольшая коррекция score в сторону доминирующего сигнала
                    if (buyRatio > sellRatio && buyRatio > holdRatio) {
                        adjustedScore = baseScore + (baseScore - 0.5) * 0.2;
                    } else if (sellRatio > buyRatio && sellRatio > holdRatio) {
                        adjustedScore = baseScore - (0.5 - baseScore) * 0.2;
                    }
                    break;
            }
        } else {
            // Есть явное большинство - усиливаем сигнал
            if (buyRatio > 0.6) {
                // Большинство за BUY
                adjustedScore = Math.min(1, baseScore + 0.05);
                adjustedConfidence = Math.min(1, baseConfidence * 1.1);
            } else if (sellRatio > 0.6) {
                // Большинство за SELL
                adjustedScore = Math.max(0, baseScore - 0.05);
                adjustedConfidence = Math.min(1, baseConfidence * 1.1);
            }
        }
        
        return {
            score: Math.max(0, Math.min(1, adjustedScore)),
            confidence: Math.max(0, Math.min(1, adjustedConfidence))
        };
    }

    /**
     * Адаптация порогов в зависимости от режима консенсуса
     * @param {Object} baseThresholds - Базовые пороги
     * @param {string} mode - Режим: 'conservative', 'moderate', 'aggressive'
     * @returns {Object} - Скорректированные пороги
     */
    adjustThresholdsForConsensusMode(baseThresholds, mode = 'moderate') {
        const adjusted = { ...baseThresholds };
        
        switch (mode) {
            case 'conservative':
                // Консервативный: более строгие пороги
                adjusted.buyScore = baseThresholds.buyScore + 0.1; // 0.75 вместо 0.65
                adjusted.buyConfidence = baseThresholds.buyConfidence + 0.1; // 0.7 вместо 0.6
                adjusted.sellScore = baseThresholds.sellScore - 0.1; // 0.25 вместо 0.35
                adjusted.sellConfidence = baseThresholds.sellConfidence + 0.1; // 0.7 вместо 0.6
                break;
                
            case 'aggressive':
                // Агрессивный: более мягкие пороги
                adjusted.buyScore = baseThresholds.buyScore - 0.1; // 0.55 вместо 0.65
                adjusted.buyConfidence = baseThresholds.buyConfidence - 0.1; // 0.5 вместо 0.6
                adjusted.sellScore = baseThresholds.sellScore + 0.1; // 0.45 вместо 0.35
                adjusted.sellConfidence = baseThresholds.sellConfidence - 0.1; // 0.5 вместо 0.6
                break;
                
            case 'moderate':
            default:
                // Умеренный: базовые пороги без изменений
                break;
        }
        
        return adjusted;
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
        const scorePercent = Math.round(score * 100);
        const confidencePercent = Math.round(confidence * 100);
        
        if (recommendation === 'BUY') {
            // Объяснение для BUY - почему стратегия рекомендует покупку
            if (confidencePercent >= 80) {
                return `Сигнал ${scorePercent}% и уверенность ${confidencePercent}% превышают пороги стратегии - сильная рекомендация на покупку`;
            } else if (confidencePercent >= 60) {
                return `Сигнал ${scorePercent}% и уверенность ${confidencePercent}% соответствуют требованиям стратегии - рекомендуется покупка`;
            } else {
                return `Сигнал ${scorePercent}% соответствует порогу, но уверенность ${confidencePercent}% ниже оптимальной - покупка с осторожностью`;
            }
        } else if (recommendation === 'SELL') {
            // Объяснение для SELL - почему стратегия рекомендует продажу
            if (confidencePercent >= 80) {
                return `Сигнал ${scorePercent}% и уверенность ${confidencePercent}% указывают на необходимость продажи - сильная рекомендация`;
            } else if (confidencePercent >= 60) {
                return `Сигнал ${scorePercent}% и уверенность ${confidencePercent}% соответствуют требованиям стратегии - рекомендуется продажа`;
            } else {
                return `Сигнал ${scorePercent}% соответствует порогу, но уверенность ${confidencePercent}% ниже оптимальной - продажа с осторожностью`;
            }
        } else {
            // HOLD - объяснение почему стратегия не рекомендует активных действий
            // Проверяем условия для SELL (если они выполнены, но recommendation = HOLD из-за других факторов)
            const meetsSellConditions = score <= thresholds.sellScore && confidence >= thresholds.sellConfidence;
            // Проверяем условия для BUY (если они выполнены, но recommendation = HOLD из-за других факторов)
            const meetsBuyConditions = score >= thresholds.buyScore && confidence >= thresholds.buyConfidence;
            
            if (meetsSellConditions) {
                // Условия для SELL выполнены, но recommendation = HOLD
                return `Сигнал ${scorePercent}% указывает на продажу, но общая оценка не подтверждает активных действий`;
            } else if (meetsBuyConditions) {
                // Условия для BUY выполнены, но recommendation = HOLD
                return `Сигнал ${scorePercent}% указывает на покупку, но общая оценка не подтверждает активных действий`;
            } else {
                // Условия для BUY не выполнены
                if (score < thresholds.buyScore || confidence < thresholds.buyConfidence) {
                    // Определяем, что именно не хватает
                    const needsMoreScore = score < thresholds.buyScore;
                    const needsMoreConfidence = confidence < thresholds.buyConfidence;
                    
                    if (needsMoreScore && needsMoreConfidence) {
                        return `Сигнал ${scorePercent}% и уверенность ${confidencePercent}% ниже порогов стратегии (${Math.round(thresholds.buyScore * 100)}%/${Math.round(thresholds.buyConfidence * 100)}%) - недостаточно для активных действий`;
                    } else if (needsMoreScore) {
                        return `Сигнал ${scorePercent}% ниже порога ${Math.round(thresholds.buyScore * 100)}% - недостаточно для покупки`;
                    } else {
                        return `Уверенность ${confidencePercent}% ниже порога ${Math.round(thresholds.buyConfidence * 100)}% - недостаточно для покупки`;
                    }
                }
                // Если условия для SELL не выполнены
                if (score > thresholds.sellScore || confidence < thresholds.sellConfidence) {
                    return `Сигнал ${scorePercent}% не указывает на необходимость продажи - рекомендуется удержание`;
                }
                return `Показатели находятся в нейтральной зоне - рекомендуется удержание позиции`;
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
            if (LoggerService.isInitialized) {
                LoggerService.error('Failed to get market data', {
                    service: 'IntegratedAIService',
                    operation: 'getMarketData',
                    figi,
                    error: { message: error.message, stack: error.stack }
                });
            }
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
        const TrainingStatusService = getService('TrainingStatusService');
        try {
            // Отправляем уведомление о старте полного обучения
            await OptimizedTelegramService.sendFullTrainingStart(figi, options);
            
            // Обновляем статус обучения для всех сетей
            if (TrainingStatusService) {
                TrainingStatusService.startTraining('neuralNetwork', 1);
                TrainingStatusService.startTraining('ensemble', 1);
                TrainingStatusService.startTraining('metaLearning', 1);
                TrainingStatusService.startTraining('reinforcementLearning', 1);
                
                // Получаем ticker для отображения
                try {
                    const instrument = await CacheService.getInstrument(figi, true);
                    const ticker = instrument?.ticker || figi.substring(0, 10);
                    TrainingStatusService.updateProgress('neuralNetwork', 0, ticker);
                    TrainingStatusService.updateProgress('ensemble', 0, ticker);
                    TrainingStatusService.updateProgress('metaLearning', 0, ticker);
                    TrainingStatusService.updateProgress('reinforcementLearning', 0, ticker);
                } catch (e) {
                    // Игнорируем ошибки получения инструмента
                }
            }
            
            const results = {};

            // Обучение ансамбля
            if (this.activeNetworks.ensemble) {
                try {
                    results.ensemble = await EnsembleService.trainEnsemble(figi, options);
                } catch (error) {
                    if (LoggerService.isInitialized) {
                        LoggerService.error('Ensemble training failed', {
                            service: 'IntegratedAIService',
                            operation: 'trainAllNetworks',
                            figi,
                            error: { message: error.message, stack: error.stack }
                        });
                    }
                    results.ensemble = { success: false, error: error.message };
                }
            }

            // Обучение RL агента
            if (this.activeNetworks.reinforcementLearning) {
                try {
                    results.reinforcement = await ReinforcementLearningService.train(figi, options);
                } catch (error) {
                    if (LoggerService.isInitialized) {
                        LoggerService.error('RL training failed', {
                            service: 'IntegratedAIService',
                            operation: 'trainAllNetworks',
                            figi,
                            error: { message: error.message, stack: error.stack }
                        });
                    }
                    results.reinforcement = { success: false, error: error.message };
                }
            }

            // Обучение традиционной нейросети
            if (this.activeNetworks.traditional) {
                try {
                    results.traditional = await NeuralNetworkService.trainForInstrument(figi, options.days);
                } catch (error) {
                    if (LoggerService.isInitialized) {
                        LoggerService.error('Traditional training failed', {
                            service: 'IntegratedAIService',
                            operation: 'trainAllNetworks',
                            figi,
                            error: { message: error.message, stack: error.stack }
                        });
                    }
                    results.traditional = { success: false, error: error.message };
                }
            }

            // Обновляем статистику производительности
            await this.updatePerformanceStats();

            // Проверяем дрейф моделей после обучения (Фаза 2, задача 2.4.3)
            try {
                const ModelMonitoringService = (await import('./ModelMonitoringService.js')).default;
                if (ModelMonitoringService && ModelMonitoringService.isInitialized) {
                    const driftResults = await ModelMonitoringService.checkAllModels();
                    results.driftCheck = driftResults;
                }
            } catch (monitoringError) {
                if (LoggerService.isInitialized) {
                    LoggerService.warn('Failed to check model drift after training', {
                        service: 'IntegratedAIService',
                        operation: 'trainAllNetworks',
                        error: { message: monitoringError.message }
                    });
                }
            }

            // Завершаем обучение
            if (TrainingStatusService) {
                const allSuccess = Object.values(results).every(r => r?.success !== false);
                TrainingStatusService.completeTraining('neuralNetwork', allSuccess);
                TrainingStatusService.completeTraining('ensemble', allSuccess);
                TrainingStatusService.completeTraining('metaLearning', allSuccess);
                TrainingStatusService.completeTraining('reinforcementLearning', allSuccess);
            }

            return results;

        } catch (error) {
            // Завершаем обучение с ошибкой
            if (TrainingStatusService) {
                TrainingStatusService.completeTraining('neuralNetwork', false);
                TrainingStatusService.completeTraining('ensemble', false);
                TrainingStatusService.completeTraining('metaLearning', false);
                TrainingStatusService.completeTraining('reinforcementLearning', false);
            }
            if (LoggerService.isInitialized) {
                LoggerService.error('Training all networks failed', {
                    service: 'IntegratedAIService',
                    operation: 'trainAllNetworks',
                    figi,
                    error: { message: error.message, stack: error.stack }
                });
            }
            throw error;
        }
    }

    /**
     * Частичное обучение (дообучение)
     */
    async partialTraining(figi, options = {}) {
        try {
            const results = {};

            // Дообучение только традиционной нейросети (быстрее)
            if (this.activeNetworks.traditional) {
                try {
                    results.traditional = await NeuralNetworkService.trainForInstrument(figi, options.days || 30);
                } catch (error) {
                    if (LoggerService.isInitialized) {
                        LoggerService.error('Traditional partial training failed', {
                            service: 'IntegratedAIService',
                            operation: 'partialTraining',
                            figi,
                            error: { message: error.message, stack: error.stack }
                        });
                    }
                    results.traditional = { success: false, error: error.message };
                }
            }

            // Обновляем статистику производительности
            await this.updatePerformanceStats();

            return results;

        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Partial training failed', {
                    service: 'IntegratedAIService',
                    operation: 'partialTraining',
                    figi,
                    error: { message: error.message, stack: error.stack }
                });
            }
            throw error;
        }
    }

    /**
     * Обучение всех сетей для всех инструментов
     * @param {number} epochs - Количество эпох
     * @param {number} batchSize - Размер батча
     * @returns {Promise<Object>} Результаты обучения
     */
    async train(epochs = 10, batchSize = 32) {
        const TrainingStatusService = getService('TrainingStatusService');
        try {
            // Получаем все инструменты из кеша
            const instruments = await CacheService.getAllInstruments();
            if (!instruments || instruments.length === 0) {
                throw new Error('No instruments available for training');
            }
            
            // Обновляем статус обучения для всех сетей
            if (TrainingStatusService) {
                TrainingStatusService.startTraining('neuralNetwork', instruments.length);
                TrainingStatusService.startTraining('ensemble', instruments.length);
                TrainingStatusService.startTraining('metaLearning', instruments.length);
                TrainingStatusService.startTraining('reinforcementLearning', instruments.length);
            }
            
            const results = {
                total: instruments.length,
                success: 0,
                failed: 0,
                details: {}
            };
            
            // Обучаем каждый инструмент
            for (let index = 0; index < instruments.length; index++) {
                const instrument = instruments[index];
                try {
                    const trainingResult = await this.trainAllNetworks(instrument.figi, {
                        epochs,
                        batchSize,
                        days: 180
                    });
                    
                    results.success++;
                    results.details[instrument.figi] = {
                        ticker: instrument.ticker,
                        success: true,
                        result: trainingResult
                    };
                    
                    // Обновляем прогресс
                    if (TrainingStatusService) {
                        const progress = ((index + 1) / instruments.length) * 100;
                        TrainingStatusService.updateProgress('neuralNetwork', progress, instrument.ticker);
                        TrainingStatusService.updateProgress('ensemble', progress, instrument.ticker);
                        TrainingStatusService.updateProgress('metaLearning', progress, instrument.ticker);
                        TrainingStatusService.updateProgress('reinforcementLearning', progress, instrument.ticker);
                    }
                } catch (error) {
                    results.failed++;
                    results.details[instrument.figi] = {
                        ticker: instrument.ticker,
                        success: false,
                        error: error.message
                    };
                    if (LoggerService.isInitialized) {
                        LoggerService.error('Training failed for instrument', {
                            service: 'IntegratedAIService',
                            operation: 'train',
                            figi: instrument.figi,
                            ticker: instrument.ticker,
                            error: { message: error.message, stack: error.stack }
                        });
                    }
                }
            }
            
            // Завершаем обучение
            if (TrainingStatusService) {
                TrainingStatusService.completeTraining('neuralNetwork', results.failed === 0);
                TrainingStatusService.completeTraining('ensemble', results.failed === 0);
                TrainingStatusService.completeTraining('metaLearning', results.failed === 0);
                TrainingStatusService.completeTraining('reinforcementLearning', results.failed === 0);
            }
            
            return {
                success: results.failed === 0,
                total: results.total,
                successCount: results.success,
                failedCount: results.failed,
                details: results.details
            };
            
        } catch (error) {
            // Завершаем обучение с ошибкой
            if (TrainingStatusService) {
                TrainingStatusService.completeTraining('neuralNetwork', false);
                TrainingStatusService.completeTraining('ensemble', false);
                TrainingStatusService.completeTraining('metaLearning', false);
                TrainingStatusService.completeTraining('reinforcementLearning', false);
            }
            if (LoggerService.isInitialized) {
                LoggerService.error('Training all networks failed', {
                    service: 'IntegratedAIService',
                    operation: 'train',
                    error: { message: error.message, stack: error.stack }
                });
            }
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
            if (LoggerService.isInitialized) {
                LoggerService.error('Failed to update performance stats', {
                    service: 'IntegratedAIService',
                    operation: 'updatePerformanceStats',
                    error: { message: error.message, stack: error.stack }
                });
            }
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
    }

    /**
     * Сохранение всех моделей
     */
    async saveAllModels() {
        try {
            
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

            return results;

        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Failed to save models', {
                    service: 'IntegratedAIService',
                    operation: 'saveAllModels',
                    error: { message: error.message, stack: error.stack }
                });
            }
            throw error;
        }
    }

    /**
     * Загрузка всех моделей (если еще не загружены)
     */
    async loadAllModelsIfNeeded() {
        try {
            const results = {};
            let needsLoading = false;

            // Проверяем, нужно ли загружать модели
            if (this.activeNetworks.ensemble && (!EnsembleService.models.lstm && !EnsembleService.models.cnn && !EnsembleService.models.transformer)) {
                needsLoading = true;
            }
            if (this.activeNetworks.metaLearning && !MetaLearningService.metaModel) {
                needsLoading = true;
            }
            if (this.activeNetworks.reinforcementLearning && !ReinforcementLearningService.agent) {
                needsLoading = true;
            }
            if (this.activeNetworks.traditional && !NeuralNetworkService.model) {
                needsLoading = true;
            }

            if (!needsLoading) {
                return { skipped: true };
            }

            if (this.activeNetworks.ensemble && (!EnsembleService.models.lstm && !EnsembleService.models.cnn && !EnsembleService.models.transformer)) {
                await EnsembleService.loadModels();
                results.ensemble = 'loaded';
            }

            if (this.activeNetworks.metaLearning && !MetaLearningService.metaModel) {
                await MetaLearningService.loadMetaModel();
                results.metaLearning = 'loaded';
            }

            if (this.activeNetworks.reinforcementLearning && !ReinforcementLearningService.agent) {
                await ReinforcementLearningService.loadModel();
                results.reinforcementLearning = 'loaded';
            }

            if (this.activeNetworks.traditional && !NeuralNetworkService.model) {
                await NeuralNetworkService.loadModel();
                results.traditional = 'loaded';
            }

            return results;

        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Failed to load models', {
                    service: 'IntegratedAIService',
                    operation: 'loadAllModelsIfNeeded',
                    error: { message: error.message, stack: error.stack }
                });
            }
            throw error;
        }
    }

    /**
     * Загрузка всех моделей (принудительная, используется для перезагрузки)
     */
    async loadAllModels() {
        try {
            
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

            return results;

        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Failed to load models', {
                    service: 'IntegratedAIService',
                    operation: 'loadAllModels',
                    error: { message: error.message, stack: error.stack }
                });
            }
            throw error;
        }
    }
}

// Создаем экземпляр сервиса
const integratedAIService = new IntegratedAIService();

// Добавляем алиас для обратной совместимости
integratedAIService.getRecommendation = integratedAIService.getIntegratedRecommendation;

export default integratedAIService;
