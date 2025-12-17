import express from 'express';
import neuralNetworkRoutes from './neural-network-routes.js';
import ensembleRoutes from './ensemble-routes.js';
import trainingRoutes from './training-routes.js';
import systemRoutes from './system-routes.js';
import tradingRoutes from './trading-routes.js';
import portfolioRoutes from './portfolio-routes.js';
import aiRoutes from './ai-routes.js';
import marketRoutes from './market-routes.js';
import riskManagementRoutes from './risk-management-routes.js';
import capitalScalingRoutes from './capital-scaling-routes.js';
import telegramRoutes from './telegram-routes.js';
import tradingRequestsRoutes from './trading-requests-routes.js';
import strategiesRoutes from './strategies-routes.js';
import tradingModeRoutes from './trading-mode-routes.js';
import switchValidatorRoutes from './switch-validator-routes.js';
import riskAdjustmentRoutes from './risk-adjustment-routes.js';
import performanceAnalyzerRoutes from './performance-analyzer-routes.js';
import capitalAllocationRoutes from './capital-allocation-routes.js';
import stage3ValidatorRoutes from './stage3-validator-routes.js';
import newsRoutes from './news-routes.js';
import profitabilityRoutes from './profitability-routes.js';
import portfolioMigratorRoutes from './portfolio-migrator-routes.js';
import preflightCheckRoutes from './preflight-check-routes.js';
import notificationsRoutes from './notifications-routes.js';
import errorsRoutes from './errors-routes.js';
import instrumentStatsRoutes from './instrument-stats-routes.js';
import ServiceManager from '../services/ServiceManager.js';
import Recommendation from '../models/Recommendation.js';
import { Op } from 'sequelize';

const router = express.Router();

// Подключаем все модули роутов
router.use('/neural-network', neuralNetworkRoutes);
router.use('/ensemble', ensembleRoutes);
router.use('/training', trainingRoutes);
router.use('/system', systemRoutes);
router.use('/trading', tradingRoutes);
router.use('/portfolio', portfolioRoutes);
router.use('/ai', aiRoutes);
router.use('/market', marketRoutes);
router.use('/risk-management', riskManagementRoutes);
router.use('/capital-scaling', capitalScalingRoutes);
router.use('/telegram', telegramRoutes);
router.use('/trading-requests', tradingRequestsRoutes);
router.use('/strategies', strategiesRoutes);
router.use('/trading-mode', tradingModeRoutes);
router.use('/switch-validator', switchValidatorRoutes);
router.use('/risk-adjustment', riskAdjustmentRoutes);
router.use('/performance-analyzer', performanceAnalyzerRoutes);
router.use('/capital-allocation', capitalAllocationRoutes);
router.use('/stage3-validator', stage3ValidatorRoutes);
router.use('/news', newsRoutes);
router.use('/profitability', profitabilityRoutes);
router.use('/portfolio-migrator', portfolioMigratorRoutes);
router.use('/preflight-check', preflightCheckRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/errors', errorsRoutes);
router.use('/instrument-stats', instrumentStatsRoutes);

/**
 * Статистика Meta-Learning
 */
router.get('/meta-learning/stats', async (req, res) => {
    try {
        const MetaLearningService = ServiceManager.getService('MetaLearningService');
        if (!MetaLearningService) {
            return res.status(503).json({
                success: false,
                message: 'Meta-Learning service not available',
                data: {
                    isActive: false,
                    isInitialized: false,
                    adaptationCount: 0,
                    successRate: 0,
                    lastAdaptation: null,
                    currentTask: null,
                    performance: 0,
                    history: []
                }
            });
        }

        const stats = MetaLearningService.getStats();
        const status = MetaLearningService.getStatus();
        
        // Безопасное получение свойств
        const isAdapting = MetaLearningService.isAdapting || false;
        const lastAdaptationTime = MetaLearningService.lastAdaptationTime || new Date().toISOString();
        const currentTask = MetaLearningService.currentTask || 'Нет активной задачи';
        
        // Формируем ответ в формате, ожидаемом фронтендом
        const response = {
            success: true,
            data: {
                isActive: status.isInitialized && isAdapting,
                isInitialized: status.isInitialized || false,
                adaptationCount: stats.successfulAdaptations || 0,
                successRate: stats.totalTasks > 0 && stats.successfulAdaptations > 0
                    ? stats.successfulAdaptations / stats.totalTasks 
                    : 0,
                lastAdaptation: lastAdaptationTime,
                currentTask: currentTask,
                performance: stats.adaptationRate || 0,
                // Дополнительные данные для истории
                totalTasks: stats.totalTasks || 0,
                knowledgeBaseSize: stats.knowledgeBaseSize || 0,
                averageAdaptationTime: stats.averageAdaptationTime || 0
            }
        };

        res.json(response);
    } catch (error) {
        console.error('❌ Error getting meta-learning stats:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статистики Meta-Learning',
            error: error.message,
            data: {
                isActive: false,
                isInitialized: false,
                adaptationCount: 0,
                successRate: 0,
                lastAdaptation: null,
                currentTask: null,
                performance: 0
            }
        });
    }
});

/**
 * Статистика Reinforcement Learning
 */
router.get('/reinforcement-learning/stats', async (req, res) => {
    try {
        const ReinforcementLearningService = ServiceManager.getService('ReinforcementLearningService');
        if (!ReinforcementLearningService) {
            return res.status(503).json({
                success: false,
                message: 'Reinforcement Learning service not available',
                data: {
                    isActive: false,
                    isInitialized: false,
                    episodes: 0,
                    averageReward: 0,
                    epsilon: 0,
                    lastEpisode: null,
                    currentAction: null,
                    qValue: 0,
                    history: []
                }
            });
        }

        const stats = ReinforcementLearningService.getStats();
        
        // Безопасное получение свойств из stats и сервиса
        const episodes = stats.totalEpisodes || stats.episodes || 0;
        const averageReward = stats.averageReward || 0;
        const epsilon = stats.epsilon !== undefined ? stats.epsilon : (ReinforcementLearningService.config?.epsilon || 0.1);
        const bestReward = stats.bestReward !== undefined && stats.bestReward !== -Infinity ? stats.bestReward : 0;
        
        // Получаем реальные данные из сервиса
        const lastEpisode = ReinforcementLearningService.lastEpisodeTime || null;
        const currentAction = ReinforcementLearningService.currentAction || 'Нет данных';
        const qValue = ReinforcementLearningService.currentQValue || 0;
        const totalReward = ReinforcementLearningService.lastTotalReward || 0;
        
        // Формируем ответ в формате, ожидаемом фронтендом
        const response = {
            success: true,
            data: {
                isActive: stats.isTraining || false,
                isInitialized: stats.isInitialized || false,
                episodes: episodes,
                averageReward: averageReward,
                epsilon: epsilon,
                lastEpisode: lastEpisode || new Date().toISOString(),
                currentAction: currentAction,
                qValue: qValue,
                // Дополнительные данные
                totalReward: totalReward,
                bestReward: bestReward,
                winRate: stats.winRate || 0,
                memorySize: stats.memorySize || 0
            }
        };

        res.json(response);
    } catch (error) {
        console.error('❌ Error getting reinforcement-learning stats:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статистики Reinforcement Learning',
            error: error.message,
            data: {
                isActive: false,
                isInitialized: false,
                episodes: 0,
                averageReward: 0,
                epsilon: 0,
                lastEpisode: null,
                currentAction: null,
                qValue: 0
            }
        });
    }
});

// ============================================================================
// РЕКОМЕНДАЦИИ
// ============================================================================
// Примечание: /api/market/recommendations уже существует в market-routes.js
// Здесь добавляем дополнительные роуты для работы с БД напрямую

/**
 * Рекомендации по типу
 * GET /api/recommendations/type/:type
 * (Более специфичный роут должен быть раньше общего /recommendations)
 */
router.get('/recommendations/type/:type', async (req, res) => {
    try {
        const { type } = req.params;
        if (!['BUY', 'SELL', 'HOLD'].includes(type)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid recommendation type. Must be BUY, SELL, or HOLD'
            });
        }
        
        const TradingStrategy = (await import('../models/TradingStrategy.js')).default;
        const recommendations = await Recommendation.findAll({
            where: { 
                isActive: true,
                recommendation: type
            },
            include: [{
                model: TradingStrategy,
                as: 'strategy',
                required: false
            }],
            order: [['confidence', 'DESC'], ['analysisDate', 'DESC']],
            raw: false // Важно: не использовать raw, чтобы получить связанные данные
        });
        
        // Преобразуем в JSON, чтобы включить связанные данные
        const recommendationsData = recommendations.map(rec => {
            const recData = rec.toJSON();
            // Убеждаемся, что strategy включена в ответ
            if (recData.strategy) {
                recData.strategy = {
                    id: recData.strategy.id,
                    name: recData.strategy.name,
                    type: recData.strategy.type,
                    timeframe: recData.strategy.timeframe
                };
            }
            return recData;
        });
        
        res.json({
            success: true,
            data: recommendationsData
        });
    } catch (error) {
        console.error('Ошибка получения рекомендаций по типу:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения рекомендаций по типу',
            error: error.message
        });
    }
});

/**
 * Топ рекомендации
 * GET /api/recommendations/top?limit=N
 */
router.get('/recommendations/top', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const recommendations = await Recommendation.getTopRecommendations(limit);
        res.json({
            success: true,
            data: recommendations
        });
    } catch (error) {
        console.error('Ошибка получения топ рекомендаций:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения топ рекомендаций',
            error: error.message
        });
    }
});

/**
 * Недавние рекомендации
 * GET /api/recommendations/recent?limit=N
 */
router.get('/recommendations/recent', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const recommendations = await Recommendation.getRecentRecommendations(limit);
        res.json({
            success: true,
            data: recommendations
        });
    } catch (error) {
        console.error('Ошибка получения недавних рекомендаций:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения недавних рекомендаций',
            error: error.message
        });
    }
});

/**
 * Все рекомендации (из БД, альтернатива /market/recommendations из кеша)
 * GET /api/recommendations
 */
router.get('/recommendations', async (req, res) => {
    try {
        const TradingStrategy = (await import('../models/TradingStrategy.js')).default;
        const { Op } = await import('sequelize');
        
        // Получаем все активные рекомендации
        const allRecommendations = await Recommendation.findAll({
            where: { isActive: true },
            include: [{
                model: TradingStrategy,
                as: 'strategy',
                required: false
            }],
            order: [['analysisDate', 'DESC']],
            raw: false
        });
        
        // Группируем по FIGI и берем только самую свежую для каждого FIGI
        const recommendationsMap = new Map();
        for (const rec of allRecommendations) {
            const figi = rec.figi;
            if (!recommendationsMap.has(figi)) {
                recommendationsMap.set(figi, rec);
            } else {
                // Если уже есть запись, сравниваем по дате анализа
                const existing = recommendationsMap.get(figi);
                if (new Date(rec.analysisDate) > new Date(existing.analysisDate)) {
                    recommendationsMap.set(figi, rec);
                }
            }
        }
        
        // Преобразуем в массив и сортируем по дате анализа
        const recommendationsData = Array.from(recommendationsMap.values())
            .map(rec => {
                const recData = rec.toJSON();
                if (recData.strategy) {
                    recData.strategy = {
                        id: recData.strategy.id,
                        name: recData.strategy.name,
                        type: recData.strategy.type,
                        timeframe: recData.strategy.timeframe
                    };
                }
                return recData;
            })
            .sort((a, b) => new Date(b.analysisDate) - new Date(a.analysisDate));
        
        res.json({
            success: true,
            data: recommendationsData
        });
    } catch (error) {
        console.error('Ошибка получения рекомендаций:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения рекомендаций',
            error: error.message
        });
    }
});

// Основные роуты (для обратной совместимости) - они уже подключены через router.use выше

export default router;
