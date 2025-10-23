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

// Основные роуты (для обратной совместимости) - они уже подключены через router.use выше

export default router;
