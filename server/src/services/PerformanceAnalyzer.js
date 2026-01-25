import Settings from '../models/Settings.js';
import MigrationStatus from '../models/MigrationStatus.js';
import OptimizedTelegramService from './OptimizedTelegramService.js';
import TradingEngine from './TradingEngine.js';
import ProfitabilityTracker from './ProfitabilityTracker.js';
import CapitalScalingService from './CapitalScalingService.js';
import RiskAdjustmentService from './RiskAdjustmentService.js';
import NeuralNetworkService from './NeuralNetworkService.js';
import SectorClassifier from '../utils/sectorClassifier.js';
import CorrelationService from './CorrelationService.js';
import CachedInstrument from '../models/CachedInstrument.js';
import { Op } from 'sequelize';

/**
 * Сервис для комплексного анализа производительности системы
 * 
 * Основные функции:
 * - Анализ торговых результатов
 * - Анализ эффективности AI моделей
 * - Анализ риск-менеджмента
 * - Сравнительный анализ периодов
 * - Генерация комплексных отчетов
 */
class PerformanceAnalyzer {
    constructor() {
        this.isInitialized = false;
        this.analysisSettings = {};
        this.analysisCache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 минут
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        try {
            
            await this.loadAnalysisSettings();
            
            this.isInitialized = true;
            
        } catch (error) {
            console.error('❌ Ошибка инициализации PerformanceAnalyzer:', error);
            throw error;
        }
    }

    /**
     * Загрузка настроек анализа
     */
    async loadAnalysisSettings() {
        this.analysisSettings = {
            // Основные параметры
            enabled: await Settings.getSetting('performance_analysis_enabled', true),
            cacheEnabled: await Settings.getSetting('performance_cache_enabled', true),
            cacheTimeout: await Settings.getSetting('performance_cache_timeout', 300), // секунды
            
            // Периоды анализа
            shortTerm: await Settings.getSetting('performance_short_term', 7), // дни
            mediumTerm: await Settings.getSetting('performance_medium_term', 30), // дни
            longTerm: await Settings.getSetting('performance_long_term', 90), // дни
            
            // Пороги для классификации
            excellentThreshold: await Settings.getSetting('performance_excellent_threshold', 0.20), // 20%
            goodThreshold: await Settings.getSetting('performance_good_threshold', 0.10), // 10%
            averageThreshold: await Settings.getSetting('performance_average_threshold', 0.05), // 5%
            poorThreshold: await Settings.getSetting('performance_poor_threshold', 0.0), // 0%
            
            // Метрики для анализа
            includeTradingMetrics: await Settings.getSetting('performance_include_trading', true),
            includeAIMetrics: await Settings.getSetting('performance_include_ai', true),
            includeRiskMetrics: await Settings.getSetting('performance_include_risk', true),
            includeScalingMetrics: await Settings.getSetting('performance_include_scaling', true),
            
            // Уведомления
            notifyOnAnalysis: await Settings.getSetting('performance_notify_analysis', true),
            notifyOnTrends: await Settings.getSetting('performance_notify_trends', true),
            notifyOnAlerts: await Settings.getSetting('performance_notify_alerts', true),
            
            // Отчеты
            generateDailyReport: await Settings.getSetting('performance_daily_report', false),
            generateWeeklyReport: await Settings.getSetting('performance_weekly_report', true),
            generateMonthlyReport: await Settings.getSetting('performance_monthly_report', true),
            
            // Интеграция
            integrateWithTelegram: await Settings.getSetting('performance_integrate_telegram', true),
            integrateWithWebSocket: await Settings.getSetting('performance_integrate_websocket', true)
        };
    }

    /**
     * Комплексный анализ производительности
     */
    async analyzePerformance(period = 'medium', customDays = null) {
        try {
            const cacheKey = `analysis_${period}_${customDays || 'default'}`;
            
            // Проверяем кеш
            if (this.analysisSettings.cacheEnabled && this.analysisCache.has(cacheKey)) {
                const cached = this.analysisCache.get(cacheKey);
                if (Date.now() - cached.timestamp < this.cacheTimeout) {
                    return cached.data;
                }
            }

            const days = customDays || this.getPeriodDays(period);
            const analysis = {
                period,
                days,
                timestamp: new Date(),
                summary: {},
                trading: {},
                ai: {},
                risk: {},
                scaling: {},
                trends: {},
                recommendations: [],
                alerts: []
            };

            // Анализ торговых результатов
            if (this.analysisSettings.includeTradingMetrics) {
                analysis.trading = await this.analyzeTradingPerformance(days);
            }

            // Анализ AI моделей
            if (this.analysisSettings.includeAIMetrics) {
                analysis.ai = await this.analyzeAIPerformance(days);
            }

            // Анализ риск-менеджмента
            if (this.analysisSettings.includeRiskMetrics) {
                analysis.risk = await this.analyzeRiskPerformance(days);
            }

            // Анализ масштабирования
            if (this.analysisSettings.includeScalingMetrics) {
                analysis.scaling = await this.analyzeScalingPerformance(days);
            }

            // Общий анализ трендов
            analysis.trends = await this.analyzeTrends(analysis);

            // Генерация рекомендаций
            analysis.recommendations = this.generateRecommendations(analysis);

            // Проверка алертов
            analysis.alerts = this.checkAlerts(analysis);

            // Общая сводка
            analysis.summary = this.generateSummary(analysis);

            // Кешируем результат
            if (this.analysisSettings.cacheEnabled) {
                this.analysisCache.set(cacheKey, {
                    data: analysis,
                    timestamp: Date.now()
                });
            }

            return analysis;

        } catch (error) {
            console.error('❌ Ошибка анализа производительности:', error);
            throw error;
        }
    }

    /**
     * Получение количества дней для периода
     */
    getPeriodDays(period) {
        switch (period) {
            case 'short': return this.analysisSettings.shortTerm;
            case 'medium': return this.analysisSettings.mediumTerm;
            case 'long': return this.analysisSettings.longTerm;
            default: return this.analysisSettings.mediumTerm;
        }
    }

    /**
     * Анализ торговых результатов
     */
    async analyzeTradingPerformance(days) {
        try {
            const endDate = new Date();
            const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

            // Получаем данные из TradingEngine
            const trades = TradingEngine.virtualPortfolio?.trades || [];
            const periodTrades = trades.filter(trade => {
                const tradeDate = new Date(trade.timestamp);
                return tradeDate >= startDate && tradeDate <= endDate;
            });

            // Получаем данные из миграций
            const migrations = await MigrationStatus.findAll({
                where: {
                    status: 'completed',
                    endTime: {
                        [Op.between]: [startDate, endDate]
                    }
                }
            });

            // Рассчитываем метрики
            const totalProfit = periodTrades.reduce((sum, trade) => sum + (trade.pnl || 0), 0);
            const totalTrades = periodTrades.length;
            const profitableTrades = periodTrades.filter(trade => (trade.pnl || 0) > 0).length;
            const winRate = totalTrades > 0 ? profitableTrades / totalTrades : 0;

            // Анализ по символам
            const symbolAnalysis = this.analyzeBySymbols(periodTrades);

            // Анализ по времени
            const timeAnalysis = this.analyzeByTime(periodTrades);

            // Анализ волатильности
            const volatility = this.calculateVolatility(periodTrades.map(t => t.pnl || 0));

            // Анализ максимальной просадки
            const drawdown = this.calculateDrawdown(periodTrades);

            return {
                totalProfit,
                totalTrades,
                profitableTrades,
                winRate,
                averageProfit: totalTrades > 0 ? totalProfit / totalTrades : 0,
                volatility,
                maxDrawdown: drawdown.max,
                currentDrawdown: drawdown.current,
                symbolAnalysis,
                timeAnalysis,
                migrations: migrations.length,
                period: { startDate, endDate, days }
            };

        } catch (error) {
            console.error('❌ Ошибка анализа торговых результатов:', error);
            return { error: error.message };
        }
    }

    /**
     * Анализ AI производительности
     */
    async analyzeAIPerformance(days) {
        try {
            // Получаем данные о точности предсказаний
            const predictions = await this.getPredictionData(days);
            
            // Анализируем точность
            const accuracy = this.calculateAccuracy(predictions);
            
            // Анализируем консистентность
            const consistency = this.calculateConsistency(predictions);
            
            // Анализируем адаптивность
            const adaptability = this.calculateAdaptability(predictions);

            return {
                accuracy,
                consistency,
                adaptability,
                totalPredictions: predictions.length,
                correctPredictions: predictions.filter(p => p.correct).length,
                predictions
            };

        } catch (error) {
            console.error('❌ Ошибка анализа AI производительности:', error);
            return { error: error.message };
        }
    }

    /**
     * Анализ риск-менеджмента
     */
    async analyzeRiskPerformance(days) {
        try {
            const riskStatus = await RiskAdjustmentService.getStatus();
            
            // Анализируем эффективность корректировок
            const adjustments = riskStatus.historyCount || 0;
            const currentLevel = riskStatus.currentRiskLevel;
            const riskScore = riskStatus.riskScore || 0;

            // Анализируем соблюдение лимитов
            const limitCompliance = await this.analyzeLimitCompliance(days);

            return {
                currentLevel,
                riskScore,
                adjustments,
                limitCompliance,
                alerts: riskStatus.alerts || [],
                recommendations: riskStatus.recommendations || []
            };

        } catch (error) {
            console.error('❌ Ошибка анализа риск-менеджмента:', error);
            return { error: error.message };
        }
    }

    /**
     * Анализ масштабирования
     */
    async analyzeScalingPerformance(days) {
        try {
            const scalingStatus = await CapitalScalingService.getStatus();
            
            // Анализируем изменения капитала
            const capitalHistory = await CapitalScalingService.getCapitalHistory(30);
            const periodHistory = capitalHistory.filter(change => {
                const changeDate = new Date(change.timestamp);
                const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
                return changeDate >= cutoffDate;
            });

            // Рассчитываем метрики масштабирования
            const totalIncreases = periodHistory.filter(c => c.type === 'increase').length;
            const totalDecreases = periodHistory.filter(c => c.type === 'decrease').length;
            const netChange = periodHistory.reduce((sum, change) => {
                return sum + (change.changeAmount || 0);
            }, 0);

            return {
                currentLevel: scalingStatus.currentCapitalLevel,
                canIncrease: scalingStatus.canIncrease,
                totalIncreases,
                totalDecreases,
                netChange,
                capitalHistory: periodHistory,
                reasons: scalingStatus.reasons || []
            };

        } catch (error) {
            console.error('❌ Ошибка анализа масштабирования:', error);
            return { error: error.message };
        }
    }

    /**
     * Анализ трендов
     */
    async analyzeTrends(analysis) {
        try {
            const trends = {
                overall: 'stable',
                trading: 'stable',
                ai: 'stable',
                risk: 'stable',
                scaling: 'stable',
                confidence: 0.5
            };

            // Анализ общего тренда
            if (analysis.trading && analysis.trading.totalProfit) {
                const profit = analysis.trading.totalProfit;
                if (profit > this.analysisSettings.excellentThreshold) {
                    trends.overall = 'excellent';
                    trends.confidence = 0.9;
                } else if (profit > this.analysisSettings.goodThreshold) {
                    trends.overall = 'good';
                    trends.confidence = 0.7;
                } else if (profit > this.analysisSettings.averageThreshold) {
                    trends.overall = 'average';
                    trends.confidence = 0.5;
                } else {
                    trends.overall = 'poor';
                    trends.confidence = 0.3;
                }
            }

            // Анализ торгового тренда
            if (analysis.trading && analysis.trading.winRate) {
                if (analysis.trading.winRate > 0.7) {
                    trends.trading = 'excellent';
                } else if (analysis.trading.winRate > 0.6) {
                    trends.trading = 'good';
                } else if (analysis.trading.winRate > 0.5) {
                    trends.trading = 'average';
                } else {
                    trends.trading = 'poor';
                }
            }

            // Анализ AI тренда
            if (analysis.ai && analysis.ai.accuracy) {
                if (analysis.ai.accuracy > 0.8) {
                    trends.ai = 'excellent';
                } else if (analysis.ai.accuracy > 0.7) {
                    trends.ai = 'good';
                } else if (analysis.ai.accuracy > 0.6) {
                    trends.ai = 'average';
                } else {
                    trends.ai = 'poor';
                }
            }

            return trends;

        } catch (error) {
            console.error('❌ Ошибка анализа трендов:', error);
            return { overall: 'unknown', confidence: 0 };
        }
    }

    /**
     * Генерация рекомендаций
     */
    generateRecommendations(analysis) {
        const recommendations = [];

        // Рекомендации по торговле
        if (analysis.trading) {
            if (analysis.trading.winRate < 0.5) {
                recommendations.push({
                    category: 'trading',
                    priority: 'high',
                    message: 'Низкий win rate. Рекомендуется пересмотреть стратегию входа.',
                    action: 'review_entry_strategy'
                });
            }

            if (analysis.trading.maxDrawdown > 0.1) {
                recommendations.push({
                    category: 'risk',
                    priority: 'high',
                    message: 'Высокая просадка. Усилить контроль рисков.',
                    action: 'tighten_risk_controls'
                });
            }

            if (analysis.trading.volatility > 0.05) {
                recommendations.push({
                    category: 'trading',
                    priority: 'medium',
                    message: 'Высокая волатильность. Рассмотреть диверсификацию.',
                    action: 'diversify_portfolio'
                });
            }
        }

        // Рекомендации по AI
        if (analysis.ai && analysis.ai.accuracy < 0.6) {
            recommendations.push({
                category: 'ai',
                priority: 'medium',
                message: 'Низкая точность AI. Рекомендуется дополнительное обучение.',
                action: 'retrain_ai_models'
            });
        }

        // Рекомендации по масштабированию
        if (analysis.scaling) {
            if (analysis.scaling.canIncrease && analysis.trends.overall === 'excellent') {
                recommendations.push({
                    category: 'scaling',
                    priority: 'low',
                    message: 'Отличные результаты. Можно рассмотреть увеличение капитала.',
                    action: 'consider_capital_increase'
                });
            }

            if (analysis.scaling.totalDecreases > analysis.scaling.totalIncreases) {
                recommendations.push({
                    category: 'scaling',
                    priority: 'medium',
                    message: 'Частые снижения капитала. Пересмотреть стратегию.',
                    action: 'review_scaling_strategy'
                });
            }
        }

        return recommendations;
    }

    /**
     * Проверка алертов
     */
    checkAlerts(analysis) {
        const alerts = [];

        // Критические алерты
        if (analysis.trading && analysis.trading.totalProfit < -10000) {
            alerts.push({
                type: 'critical',
                category: 'trading',
                message: 'Критические убытки. Требуется немедленное вмешательство.',
                value: analysis.trading.totalProfit
            });
        }

        if (analysis.trading && analysis.trading.maxDrawdown > 0.2) {
            alerts.push({
                type: 'critical',
                category: 'risk',
                message: 'Критическая просадка. Остановить торговлю.',
                value: analysis.trading.maxDrawdown
            });
        }

        // Предупреждения
        if (analysis.trading && analysis.trading.winRate < 0.4) {
            alerts.push({
                type: 'warning',
                category: 'trading',
                message: 'Очень низкий win rate.',
                value: analysis.trading.winRate
            });
        }

        if (analysis.ai && analysis.ai.accuracy < 0.5) {
            alerts.push({
                type: 'warning',
                category: 'ai',
                message: 'Низкая точность AI моделей.',
                value: analysis.ai.accuracy
            });
        }

        return alerts;
    }

    /**
     * Генерация общей сводки
     */
    generateSummary(analysis) {
        const summary = {
            overallRating: 'unknown',
            keyMetrics: {},
            strengths: [],
            weaknesses: [],
            nextSteps: []
        };

        // Определяем общий рейтинг
        if (analysis.trends.overall === 'excellent') {
            summary.overallRating = 'excellent';
        } else if (analysis.trends.overall === 'good') {
            summary.overallRating = 'good';
        } else if (analysis.trends.overall === 'average') {
            summary.overallRating = 'average';
        } else if (analysis.trends.overall === 'poor') {
            summary.overallRating = 'poor';
        }

        // Ключевые метрики
        if (analysis.trading) {
            summary.keyMetrics.profit = analysis.trading.totalProfit;
            summary.keyMetrics.winRate = analysis.trading.winRate;
            summary.keyMetrics.trades = analysis.trading.totalTrades;
        }

        if (analysis.ai) {
            summary.keyMetrics.accuracy = analysis.ai.accuracy;
        }

        if (analysis.risk) {
            summary.keyMetrics.riskLevel = analysis.risk.currentLevel;
            summary.keyMetrics.riskScore = analysis.risk.riskScore;
        }

        // Сильные стороны
        if (analysis.trading && analysis.trading.winRate > 0.7) {
            summary.strengths.push('Высокий win rate');
        }

        if (analysis.trading && analysis.trading.maxDrawdown < 0.05) {
            summary.strengths.push('Низкая просадка');
        }

        if (analysis.ai && analysis.ai.accuracy > 0.8) {
            summary.strengths.push('Высокая точность AI');
        }

        // Слабые стороны
        if (analysis.trading && analysis.trading.winRate < 0.5) {
            summary.weaknesses.push('Низкий win rate');
        }

        if (analysis.trading && analysis.trading.maxDrawdown > 0.1) {
            summary.weaknesses.push('Высокая просадка');
        }

        if (analysis.ai && analysis.ai.accuracy < 0.6) {
            summary.weaknesses.push('Низкая точность AI');
        }

        // Следующие шаги
        summary.nextSteps = analysis.recommendations.map(rec => rec.message);

        return summary;
    }

    /**
     * Вспомогательные методы для анализа
     */
    analyzeBySymbols(trades) {
        const symbolStats = {};
        
        trades.forEach(trade => {
            const symbol = trade.symbol;
            if (!symbolStats[symbol]) {
                symbolStats[symbol] = {
                    trades: 0,
                    profit: 0,
                    wins: 0
                };
            }
            
            symbolStats[symbol].trades++;
            symbolStats[symbol].profit += trade.pnl || 0;
            if ((trade.pnl || 0) > 0) {
                symbolStats[symbol].wins++;
            }
        });

        // Рассчитываем win rate для каждого символа
        Object.keys(symbolStats).forEach(symbol => {
            const stats = symbolStats[symbol];
            stats.winRate = stats.trades > 0 ? stats.wins / stats.trades : 0;
            stats.averageProfit = stats.trades > 0 ? stats.profit / stats.trades : 0;
        });

        return symbolStats;
    }

    analyzeByTime(trades) {
        const hourlyStats = {};
        
        trades.forEach(trade => {
            const hour = new Date(trade.timestamp).getHours();
            if (!hourlyStats[hour]) {
                hourlyStats[hour] = {
                    trades: 0,
                    profit: 0,
                    wins: 0
                };
            }
            
            hourlyStats[hour].trades++;
            hourlyStats[hour].profit += trade.pnl || 0;
            if ((trade.pnl || 0) > 0) {
                hourlyStats[hour].wins++;
            }
        });

        return hourlyStats;
    }

    calculateVolatility(profits) {
        if (profits.length < 2) return 0;
        
        const mean = profits.reduce((sum, p) => sum + p, 0) / profits.length;
        const variance = profits.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / profits.length;
        return Math.sqrt(variance);
    }

    calculateDrawdown(trades) {
        let maxDrawdown = 0;
        let currentDrawdown = 0;
        let peak = 0;
        let runningTotal = 0;

        trades.forEach(trade => {
            runningTotal += trade.pnl || 0;
            if (runningTotal > peak) {
                peak = runningTotal;
                currentDrawdown = 0;
            } else {
                currentDrawdown = peak - runningTotal;
                maxDrawdown = Math.max(maxDrawdown, currentDrawdown);
            }
        });

        return { max: maxDrawdown, current: currentDrawdown };
    }

    async getPredictionData(days) {
        try {
            // Получаем данные о предсказаниях из кеша или БД
            const Recommendation = (await import('../models/Recommendation.js')).default;
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);
            
            const predictions = await Recommendation.findAll({
                where: {
                    createdAt: {
                        [Op.gte]: startDate
                    }
                },
                order: [['createdAt', 'DESC']],
                limit: 1000
            });
            
            return predictions.map(pred => ({
                id: pred.id,
                symbol: pred.symbol,
                prediction: pred.prediction,
                confidence: pred.confidence,
                createdAt: pred.createdAt,
                actualPrice: pred.actualPrice,
                accuracy: pred.accuracy
            }));
        } catch (error) {
            console.error('❌ Ошибка получения данных предсказаний:', error);
            return [];
        }
    }

    calculateAccuracy(predictions) {
        if (predictions.length === 0) return 0;
        const correct = predictions.filter(p => p.correct).length;
        return correct / predictions.length;
    }

    calculateConsistency(predictions) {
        if (predictions.length < 2) return 0;
        
        try {
            // Рассчитываем консистентность на основе стабильности предсказаний
            const confidences = predictions.map(p => p.confidence || 0);
            const avgConfidence = confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length;
            
            // Консистентность = средняя уверенность * стабильность
            const variance = confidences.reduce((sum, conf) => sum + Math.pow(conf - avgConfidence, 2), 0) / confidences.length;
            const stability = Math.max(0, 1 - Math.sqrt(variance));
            
            return avgConfidence * stability;
        } catch (error) {
            console.error('❌ Ошибка расчета консистентности:', error);
            return 0;
        }
    }

    calculateAdaptability(predictions) {
        if (predictions.length < 3) return 0;
        
        try {
            // Рассчитываем адаптивность на основе улучшения точности со временем
            const sortedPredictions = predictions.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            const third = Math.floor(sortedPredictions.length / 3);
            
            const firstThird = sortedPredictions.slice(0, third);
            const lastThird = sortedPredictions.slice(-third);
            
            const firstAccuracy = this.calculateAccuracy(firstThird);
            const lastAccuracy = this.calculateAccuracy(lastThird);
            
            // Адаптивность = улучшение точности
            return Math.max(0, lastAccuracy - firstAccuracy);
        } catch (error) {
            console.error('❌ Ошибка расчета адаптивности:', error);
            return 0;
        }
    }

    async analyzeLimitCompliance(days) {
        try {
            // Анализируем соблюдение лимитов на основе торговых данных
            const trades = await this.getTradingData(days);
            const riskSettings = await this.getRiskSettings();
            
            let violations = 0;
            let totalTrades = trades.length;
            
            for (const trade of trades) {
                // Проверяем лимиты
                if (trade.positionSize > riskSettings.maxPositionSize) {
                    violations++;
                }
                if (trade.risk > riskSettings.maxRiskPerTrade) {
                    violations++;
                }
            }
            
            const compliance = totalTrades > 0 ? 1 - (violations / totalTrades) : 1;
            
            return { 
                compliance: Math.max(0, Math.min(1, compliance)), 
                violations,
                totalTrades
            };
        } catch (error) {
            console.error('❌ Ошибка анализа соблюдения лимитов:', error);
            return { compliance: 0.95, violations: 0, totalTrades: 0 };
        }
    }

    /**
     * Получение торговых данных
     */
    async getTradingData(days) {
        try {
            // Получаем данные из TradingEngine
            const trades = await TradingEngine.getTradeHistory(days);
            
            // Проверяем, что trades - массив
            if (!Array.isArray(trades)) {
                console.warn('⚠️ getTradeHistory вернул не массив:', typeof trades);
                return [];
            }
            
            return trades.map(trade => ({
                symbol: trade.symbol,
                action: trade.action,
                quantity: trade.quantity,
                price: trade.price,
                positionSize: trade.positionSize || 0,
                risk: trade.risk || 0,
                timestamp: trade.timestamp
            }));
        } catch (error) {
            console.error('❌ Ошибка получения торговых данных:', error);
            return [];
        }
    }

    /**
     * Получение настроек риска
     */
    async getRiskSettings() {
        try {
            const Settings = (await import('../models/Settings.js')).default;
            
            return {
                maxPositionSize: await Settings.getSetting('risk_max_position_size', 0.05),
                maxRiskPerTrade: await Settings.getSetting('risk_max_risk_per_trade', 0.02),
                maxPortfolioRisk: await Settings.getSetting('risk_max_portfolio_risk', 0.10)
            };
        } catch (error) {
            console.error('❌ Ошибка получения настроек риска:', error);
            return {
                maxPositionSize: 0.05,
                maxRiskPerTrade: 0.02,
                maxPortfolioRisk: 0.10
            };
        }
    }

    /**
     * Генерация отчета
     */
    async generateReport(period = 'medium', customDays = null) {
        try {
            const analysis = await this.analyzePerformance(period, customDays);
            
            const report = {
                title: `Отчет о производительности за ${analysis.days} дней`,
                period: analysis.period,
                generatedAt: analysis.timestamp,
                summary: analysis.summary,
                trading: analysis.trading,
                ai: analysis.ai,
                risk: analysis.risk,
                scaling: analysis.scaling,
                trends: analysis.trends,
                recommendations: analysis.recommendations,
                alerts: analysis.alerts
            };

            // Отправляем уведомление
            if (this.analysisSettings.notifyOnAnalysis) {
                await this.sendAnalysisNotification(report);
            }

            return report;

        } catch (error) {
            console.error('❌ Ошибка генерации отчета:', error);
            throw error;
        }
    }

    /**
     * Отправка уведомления об анализе
     */
    async sendAnalysisNotification(report) {
        try {
            let message = `📊 ОТЧЕТ О ПРОИЗВОДИТЕЛЬНОСТИ\n\n`;
            
            message += `📅 Период: ${report.days} дней\n`;
            message += `⭐ Общий рейтинг: ${report.summary.overallRating}\n\n`;
            
            if (report.trading) {
                message += `💰 Прибыль: ${report.trading.totalProfit?.toFixed(2) || 0} руб.\n`;
                message += `📈 Win Rate: ${(report.trading.winRate * 100)?.toFixed(1) || 0}%\n`;
                message += `📊 Сделок: ${report.trading.totalTrades || 0}\n\n`;
            }
            
            if (report.alerts.length > 0) {
                message += `⚠️ АЛЕРТЫ (${report.alerts.length}):\n`;
                report.alerts.forEach(alert => {
                    message += `• ${alert.message}\n`;
                });
                message += `\n`;
            }
            
            if (report.recommendations.length > 0) {
                message += `💡 РЕКОМЕНДАЦИИ (${report.recommendations.length}):\n`;
                report.recommendations.slice(0, 3).forEach(rec => {
                    message += `• ${rec.message}\n`;
                });
            }

            await OptimizedTelegramService.sendAlert('📊 АНАЛИЗ ПРОИЗВОДИТЕЛЬНОСТИ', message);

        } catch (error) {
            console.error('❌ Ошибка отправки уведомления:', error);
        }
    }

    /**
     * Получение метрик производительности
     */
    async getMetrics() {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            const metrics = {
                neuralNetwork: await this.getNeuralNetworkMetrics(),
                trading: await this.getTradingMetrics(),
                risk: await this.getRiskMetrics(),
                scaling: await this.getScalingMetrics(),
                system: await this.getSystemMetrics(),
                timestamp: new Date().toISOString()
            };

            return metrics;
        } catch (error) {
            console.error('❌ Ошибка получения метрик:', error);
            return {
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Получение метрик нейросети
     */
    async getNeuralNetworkMetrics() {
        try {
            const status = await NeuralNetworkService.getModelStatus();
            return {
                isActive: status.isActive,
                accuracy: status.accuracy,
                lastTraining: status.lastTraining,
                modelAge: status.modelAge
            };
        } catch (error) {
            return { error: error.message };
        }
    }

    /**
     * Получение торговых метрик
     */
    async getTradingMetrics() {
        try {
            const tradingData = await this.getTradingData(30);
            return {
                totalTrades: tradingData.totalTrades,
                winRate: tradingData.winRate,
                totalPnL: tradingData.totalPnL,
                sharpeRatio: tradingData.sharpeRatio
            };
        } catch (error) {
            return { error: error.message };
        }
    }

    /**
     * Получение метрик риск-менеджмента
     */
    async getRiskMetrics() {
        try {
            const riskStatus = await RiskAdjustmentService.getStatus();
            return {
                isActive: riskStatus.isActive,
                currentDrawdown: riskStatus.currentDrawdown,
                maxDrawdown: riskStatus.maxDrawdown,
                adjustmentsCount: riskStatus.historyCount
            };
        } catch (error) {
            return { error: error.message };
        }
    }

    /**
     * Получение метрик масштабирования
     */
    async getScalingMetrics() {
        try {
            const scalingStatus = await CapitalScalingService.getStatus();
            return {
                currentLevel: scalingStatus.currentLevel,
                maxLevel: scalingStatus.maxLevel,
                canIncrease: scalingStatus.canIncrease,
                canDecrease: scalingStatus.canDecrease
            };
        } catch (error) {
            return { error: error.message };
        }
    }

    /**
     * Получение системных метрик
     */
    async getSystemMetrics() {
        try {
            const memoryUsage = process.memoryUsage();
            return {
                uptime: process.uptime(),
                memory: {
                    rss: Math.round(memoryUsage.rss / 1024 / 1024),
                    heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
                    heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024)
                },
                cacheSize: this.analysisCache.size
            };
        } catch (error) {
            return { error: error.message };
        }
    }

    /**
     * Получение статуса сервиса
     */
    async getStatus() {
        try {
            return {
                isInitialized: this.isInitialized,
                settings: this.analysisSettings,
                cacheSize: this.analysisCache.size,
                cacheTimeout: this.cacheTimeout
            };

        } catch (error) {
            console.error('❌ Ошибка получения статуса:', error);
            return {
                isInitialized: this.isInitialized,
                error: error.message
            };
        }
    }

    /**
     * Очистка кеша
     */
    clearCache() {
        this.analysisCache.clear();
        console.log('🧹 Кеш анализа производительности очищен');
    }

    /**
     * Фаза 4.3.1: Анализ производительности по секторам
     * @param {number} days - Период анализа в днях
     * @returns {Promise<Object>} Анализ по секторам
     */
    async analyzeSectorPerformance(days = 30) {
        try {
            const endDate = new Date();
            const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

            // Получаем историю сделок
            const trades = await TradingEngine.getTradeHistory(10000);
            const periodTrades = trades.filter(trade => {
                const tradeDate = new Date(trade.timestamp || trade.date || trade.createdAt);
                return tradeDate >= startDate && tradeDate <= endDate;
            });

            // Группируем сделки по FIGI
            const tradesByFigi = {};
            periodTrades.forEach(trade => {
                const figi = trade.figi || trade.symbol;
                if (!figi) return;
                
                if (!tradesByFigi[figi]) {
                    tradesByFigi[figi] = [];
                }
                tradesByFigi[figi].push(trade);
            });

            // Получаем сектора для всех FIGI
            const figis = Object.keys(tradesByFigi);
            const SectorClassifier = (await import('../utils/sectorClassifier.js')).default;
            const sectorGroups = await SectorClassifier.groupBySector(figis);

            // Анализируем каждый сектор
            const sectorAnalysis = {};
            const totalPortfolioValue = await this.getTotalPortfolioValue();

            for (const [sector, sectorFigis] of Object.entries(sectorGroups)) {
                const sectorTrades = [];
                let sectorProfit = 0;
                let sectorTradesCount = 0;
                let sectorWins = 0;
                const sectorReturns = [];

                for (const figi of sectorFigis) {
                    const trades = tradesByFigi[figi] || [];
                    sectorTrades.push(...trades);
                    
                    trades.forEach(trade => {
                        const pnl = trade.pnl || trade.profit || 0;
                        sectorProfit += pnl;
                        sectorTradesCount++;
                        if (pnl > 0) sectorWins++;
                        
                        // Рассчитываем доходность
                        const price = trade.price || trade.executedPrice || 0;
                        if (price > 0) {
                            sectorReturns.push(pnl / price);
                        }
                    });
                }

                // Рассчитываем метрики сектора
                const winRate = sectorTradesCount > 0 ? sectorWins / sectorTradesCount : 0;
                const avgReturn = sectorReturns.length > 0 
                    ? sectorReturns.reduce((sum, r) => sum + r, 0) / sectorReturns.length 
                    : 0;
                
                // Волатильность (стандартное отклонение доходностей)
                const volatility = this.calculateVolatility(sectorReturns);
                
                // Sharpe Ratio (упрощенный, без безрисковой ставки)
                const sharpeRatio = volatility > 0 ? avgReturn / volatility : 0;

                // Доля портфеля в секторе
                const sectorValue = await this.getSectorPortfolioValue(sectorFigis);
                const portfolioWeight = totalPortfolioValue > 0 
                    ? sectorValue / totalPortfolioValue 
                    : 0;

                sectorAnalysis[sector] = {
                    sector,
                    instruments: sectorFigis.length,
                    trades: sectorTradesCount,
                    profit: sectorProfit,
                    winRate,
                    avgReturn,
                    volatility,
                    sharpeRatio,
                    portfolioWeight,
                    recommendations: this.generateSectorRecommendations(sector, {
                        profit: sectorProfit,
                        winRate,
                        sharpeRatio,
                        portfolioWeight
                    })
                };
            }

            // Анализ корреляций внутри секторов
            const CorrelationService = (await import('./CorrelationService.js')).default;
            const sectorCorrelations = await this.analyzeSectorCorrelations(sectorGroups, CorrelationService);

            // Рекомендации по диверсификации
            const diversificationRecommendations = this.generateDiversificationRecommendations(
                sectorAnalysis,
                sectorCorrelations
            );

            return {
                period: { startDate, endDate, days },
                sectors: sectorAnalysis,
                correlations: sectorCorrelations,
                diversification: diversificationRecommendations,
                summary: {
                    totalSectors: Object.keys(sectorAnalysis).length,
                    totalInstruments: figis.length,
                    totalTrades: periodTrades.length
                }
            };
        } catch (error) {
            console.error('❌ Ошибка анализа по секторам:', error);
            return { error: error.message };
        }
    }

    /**
     * Анализ корреляций внутри секторов
     * @private
     */
    async analyzeSectorCorrelations(sectorGroups, CorrelationService) {
        const correlations = {};

        for (const [sector, figis] of Object.entries(sectorGroups)) {
            if (figis.length < 2) {
                correlations[sector] = { message: 'Недостаточно инструментов для анализа корреляций' };
                continue;
            }

            const sectorCorrelations = {};
            let correlationCount = 0;
            let highCorrelationCount = 0;
            let avgCorrelation = 0;

            for (let i = 0; i < figis.length; i++) {
                for (let j = i + 1; j < figis.length; j++) {
                    try {
                        const correlation = await CorrelationService.calculateCorrelation(figis[i], figis[j], 30);
                        const pairKey = `${figis[i]}_${figis[j]}`;
                        sectorCorrelations[pairKey] = correlation;
                        
                        correlationCount++;
                        avgCorrelation += Math.abs(correlation);
                        
                        if (Math.abs(correlation) > 0.7) {
                            highCorrelationCount++;
                        }
                    } catch (error) {
                        // Игнорируем ошибки
                    }
                }
            }

            correlations[sector] = {
                instruments: figis.length,
                correlationPairs: correlationCount,
                highCorrelationPairs: highCorrelationCount,
                avgCorrelation: correlationCount > 0 ? avgCorrelation / correlationCount : 0,
                correlations: sectorCorrelations,
                riskLevel: highCorrelationCount > correlationCount * 0.5 ? 'high' : 'low'
            };
        }

        return correlations;
    }

    /**
     * Генерация рекомендаций для сектора
     * @private
     */
    generateSectorRecommendations(sector, metrics) {
        const recommendations = [];

        if (metrics.portfolioWeight > 0.4) {
            recommendations.push({
                type: 'overexposure',
                priority: 'high',
                message: `Переинвестирование в сектор ${sector}: ${(metrics.portfolioWeight * 100).toFixed(1)}% портфеля`,
                action: 'reduce_exposure'
            });
        }

        if (metrics.portfolioWeight < 0.05 && metrics.sharpeRatio > 1.0 && metrics.winRate > 0.6) {
            recommendations.push({
                type: 'underexposure',
                priority: 'medium',
                message: `Недоинвестирование в сектор ${sector} с хорошими показателями`,
                action: 'increase_exposure'
            });
        }

        if (metrics.sharpeRatio < 0.5 && metrics.winRate < 0.5) {
            recommendations.push({
                type: 'poor_performance',
                priority: 'high',
                message: `Низкая производительность сектора ${sector}`,
                action: 'review_strategy'
            });
        }

        return recommendations;
    }

    /**
     * Генерация рекомендаций по диверсификации
     * @private
     */
    generateDiversificationRecommendations(sectorAnalysis, sectorCorrelations) {
        const recommendations = [];

        const sectorWeights = Object.values(sectorAnalysis).map(s => s.portfolioWeight);
        const maxWeight = Math.max(...sectorWeights, 0);
        
        if (maxWeight > 0.4) {
            const topSector = Object.values(sectorAnalysis).find(s => s.portfolioWeight === maxWeight);
            recommendations.push({
                type: 'concentration',
                priority: 'high',
                message: `Высокая концентрация в секторе ${topSector?.sector || 'unknown'}: ${(maxWeight * 100).toFixed(1)}%`,
                action: 'diversify_portfolio'
            });
        }

        for (const [sector, corrData] of Object.entries(sectorCorrelations)) {
            if (corrData.riskLevel === 'high') {
                recommendations.push({
                    type: 'high_correlation',
                    priority: 'medium',
                    message: `Высокая корреляция внутри сектора ${sector}`,
                    action: 'reduce_correlation_risk'
                });
            }
        }

        return recommendations;
    }

    /**
     * Получение общей стоимости портфеля
     * @private
     */
    async getTotalPortfolioValue() {
        try {
            const portfolio = await TradingEngine.getPortfolioValue();
            return portfolio?.totalValue || portfolio?.cash || 1000000;
        } catch (error) {
            return 1000000;
        }
    }

    /**
     * Получение стоимости позиций сектора
     * @private
     */
    async getSectorPortfolioValue(figis) {
        try {
            const portfolio = await TradingEngine.getPortfolioValue();
            const positions = portfolio?.positions || {};
            const CachedInstrument = (await import('../models/CachedInstrument.js')).default;
            
            let sectorValue = 0;
            for (const figi of figis) {
                const quantity = positions[figi] || 0;
                if (quantity > 0) {
                    const instrument = await CachedInstrument.findOne({ where: { figi } });
                    const price = instrument?.lastPrice || 0;
                    sectorValue += quantity * price;
                }
            }
            
            return sectorValue;
        } catch (error) {
            return 0;
        }
    }
}

export default new PerformanceAnalyzer();
