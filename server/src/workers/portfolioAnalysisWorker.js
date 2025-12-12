import { parentPort, workerData } from 'worker_threads';

async function performPortfolioAnalysis() {
    let connection = null;
    try {
        // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Используем DatabaseConnectionManager для получения подключения с ожиданием в очереди
        const DatabaseConnectionManager = (await import('../utils/DatabaseConnectionManager.js')).default;
        const workerId = `portfolio-analysis-${Date.now()}`;
        
        console.log(`📊 [Worker] Requesting database connection (${workerId})...`);
        connection = await DatabaseConnectionManager.acquireConnection(workerId, 60000);
        console.log(`✅ [Worker] Database connection acquired (${connection.connectionId})`);
        
        const { 
            portfolioType, 
            portfolioItems, 
            totalBudget,
            analysisType // 'full' | 'positions-only'
        } = workerData;

        console.log(`📊 [Worker] Starting ${analysisType} portfolio analysis for ${portfolioType} portfolio...`);
        console.log(`📊 [Worker] Portfolio items: ${portfolioItems.length}`);

        // Динамически импортируем необходимые сервисы
        const NeuralNetworkService = (await import('../services/NeuralNetworkService.js')).default;
        const TradingRequest = (await import('../models/TradingRequest.js')).default;
        const PositionStrategy = (await import('../models/PositionStrategy.js')).default;
        const TradingStrategy = (await import('../models/TradingStrategy.js')).default;
        const StrategyAllocationService = (await import('../services/StrategyAllocationService.js')).default;
        const { Op } = await import('sequelize');

        // Инициализируем сервисы если нужно
        if (!NeuralNetworkService.isActive) {
            await NeuralNetworkService.setStatus('active');
        }

        let analysis;
        
        if (analysisType === 'positions-only') {
            // Анализ только позиций портфеля
            const sellRecommendations = [];
            const recommendationsByStrategy = {};
            let portfolioValue = 0;

            for (const item of portfolioItems) {
                try {
                    // Получаем стратегию для позиции
                    let strategyInfo = null;
                    try {
                        const buyRequest = await TradingRequest.findOne({
                            where: {
                                figi: item.figi,
                                action: 'BUY',
                                status: {
                                    [Op.in]: ['APPROVED', 'EXECUTED', 'PENDING']
                                }
                            },
                            order: [['executedAt', 'DESC'], ['createdAt', 'DESC']]
                        });
                        
                        if (buyRequest) {
                            if (buyRequest.strategyId) {
                                strategyInfo = await TradingStrategy.findByPk(buyRequest.strategyId);
                            }
                            
                            if (!strategyInfo) {
                                const positionStrategy = await PositionStrategy.findOne({
                                    where: { positionId: buyRequest.id }
                                });
                                if (positionStrategy && positionStrategy.strategyId) {
                                    strategyInfo = await TradingStrategy.findByPk(positionStrategy.strategyId);
                                }
                            }
                        }
                    } catch (strategyError) {
                        console.warn(`⚠️ [Worker] Could not load strategy for ${item.ticker}:`, strategyError.message);
                    }

                    // Получаем предсказание через IntegratedAIService
                    // В worker'е используем прямой импорт, так как getService не работает в изолированном потоке
                    const IntegratedAIService = (await import('../services/IntegratedAIService.js')).default;
                    
                    if (!IntegratedAIService.isInitialized) {
                        await IntegratedAIService.initialize();
                    }
                    
                    let prediction;
                    if (IntegratedAIService && IntegratedAIService.isInitialized) {
                        const integratedRec = await IntegratedAIService.getIntegratedRecommendation(item.figi);
                        prediction = {
                            score: integratedRec.score || 0,
                            confidence: integratedRec.confidence || integratedRec.score || 0,
                            recommendation: integratedRec.recommendation || 'HOLD',
                            explanation: integratedRec.summary || integratedRec.details || {},
                            summary: integratedRec.summary,
                            details: integratedRec.details || {}
                        };
                    } else {
                        prediction = await NeuralNetworkService.predict(item.figi);
                    }
                    
                    const CacheService = (await import('../services/CacheService.js')).default;
                    const instrument = await CacheService.getInstrument(item.figi);
                    const currentPrice = instrument?.lastPrice || 0;
                    portfolioValue += currentPrice * item.quantity;

                    let reason = 'Hold';
                    if (prediction.score < 0.2) {
                        reason = 'Low prediction score (strong sell signal)';
                    } else if (prediction.score < 0.3) {
                        reason = 'Moderate prediction score (sell signal)';
                    } else if (prediction.score >= 0.7) {
                        reason = 'Hold (good prospects)';
                    }

                    let strategyBudgetInfo = null;
                    if (strategyInfo) {
                        try {
                            const allocation = await StrategyAllocationService.getAvailableBudget(strategyInfo.id);
                            strategyBudgetInfo = {
                                strategyId: strategyInfo.id,
                                strategyName: strategyInfo.name,
                                strategyType: strategyInfo.type,
                                availableBudget: allocation,
                                positionValue: currentPrice * item.quantity
                            };
                        } catch (budgetError) {
                            console.warn(`⚠️ [Worker] Could not get budget info:`, budgetError.message);
                        }
                    }

                    const recommendation = {
                        item,
                        currentPrice,
                        prediction,
                        reason,
                        strategy: strategyInfo ? {
                            id: strategyInfo.id,
                            name: strategyInfo.name,
                            type: strategyInfo.type
                        } : null,
                        strategyBudgetInfo
                    };

                    sellRecommendations.push(recommendation);

                    // Группируем по стратегиям
                    const strategyKey = strategyInfo ? strategyInfo.id : 'no_strategy';
                    if (!recommendationsByStrategy[strategyKey]) {
                        recommendationsByStrategy[strategyKey] = {
                            strategy: strategyInfo ? {
                                id: strategyInfo.id,
                                name: strategyInfo.name,
                                type: strategyInfo.type
                            } : null,
                            recommendations: [],
                            totalValue: 0,
                            sellCount: 0,
                            holdCount: 0
                        };
                    }
                    recommendationsByStrategy[strategyKey].recommendations.push(recommendation);
                    recommendationsByStrategy[strategyKey].totalValue += currentPrice * item.quantity;
                    if (prediction.recommendation === 'SELL' || prediction.score < 0.3) {
                        recommendationsByStrategy[strategyKey].sellCount++;
                    } else {
                        recommendationsByStrategy[strategyKey].holdCount++;
                    }

                    // Отправляем прогресс
                    parentPort.postMessage({
                        type: 'progress',
                        data: {
                            processed: sellRecommendations.length,
                            total: portfolioItems.length,
                            current: item.ticker
                        }
                    });

                } catch (err) {
                    console.warn(`⚠️ [Worker] Could not analyze ${item.ticker}:`, err.message);
                }
            }

            const strategyStats = Object.values(recommendationsByStrategy).map(group => ({
                strategy: group.strategy,
                positionsCount: group.recommendations.length,
                totalValue: group.totalValue,
                sellCount: group.sellCount,
                holdCount: group.holdCount,
                sellPercentage: group.recommendations.length > 0 
                    ? (group.sellCount / group.recommendations.length) * 100 
                    : 0
            }));

            analysis = {
                portfolioType,
                analysisDate: new Date(),
                portfolioValue,
                availableBudget: 0,
                totalPositions: portfolioItems.length,
                sellRecommendations,
                buyRecommendations: [],
                sellRecommendationsCount: sellRecommendations.length,
                buyRecommendationsCount: 0,
                recommendationsByStrategy,
                strategyStats
            };

        } else {
            // Полный анализ портфеля (включая поиск новых инструментов)
            analysis = await NeuralNetworkService.analyzePortfolio(portfolioItems, totalBudget);
        }

        console.log(`✅ [Worker] Portfolio analysis completed`);
        console.log(`   - Sell recommendations: ${analysis.sellRecommendations?.length || 0}`);
        console.log(`   - Buy recommendations: ${analysis.buyRecommendations?.length || 0}`);

        // Отправляем результат
        parentPort.postMessage({
            type: 'done',
            data: {
                success: true,
                analysis
            }
        });

    } catch (error) {
        console.error('❌ [Worker] Portfolio analysis failed:', error);
        
        parentPort.postMessage({
            type: 'error',
            data: {
                success: false,
                error: error.message,
                stack: error.stack
            }
        });
    } finally {
        // Освобождаем подключение к БД
        if (connection && connection.release) {
            connection.release();
            console.log(`🔓 [Worker] Database connection released (${connection.connectionId})`);
        }
    }
}

// Запускаем анализ
performPortfolioAnalysis();

