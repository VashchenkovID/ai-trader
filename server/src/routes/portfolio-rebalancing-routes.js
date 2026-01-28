import express from 'express';
import PortfolioRebalancingService from '../services/PortfolioRebalancingService.js';

const router = express.Router();

/**
 * GET /api/portfolio-rebalancing/status
 * Получение статуса сервиса ребалансировки
 */
router.get('/status', async (req, res) => {
    try {
        const status = PortfolioRebalancingService.getStatus();
        
        return res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('Error getting rebalancing status:', error);
        return res.status(500).json({
            success: false,
            message: 'Ошибка получения статуса ребалансировки',
            error: error.message
        });
    }
});

/**
 * GET /api/portfolio-rebalancing/check
 * Проверка необходимости ребалансировки
 */
router.get('/check', async (req, res) => {
    try {
        // Убеждаемся, что сервис инициализирован
        if (!PortfolioRebalancingService.isInitialized) {
            await PortfolioRebalancingService.initialize();
        }
        
        const result = await PortfolioRebalancingService.checkRebalancingNeeded();
        
        return res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Error checking rebalancing:', error);
        return res.status(500).json({
            success: false,
            message: 'Ошибка проверки необходимости ребалансировки',
            error: error.message
        });
    }
});

/**
 * POST /api/portfolio-rebalancing/execute
 * Выполнение ребалансировки портфеля
 * Body параметры (опционально):
 * - dryRun: boolean - режим тестирования без выполнения операций (по умолчанию false)
 */
router.post('/execute', async (req, res) => {
    try {
        // Убеждаемся, что сервис инициализирован
        if (!PortfolioRebalancingService.isInitialized) {
            await PortfolioRebalancingService.initialize();
        }
        
        const { dryRun = false } = req.body;
        
        // Временно устанавливаем режим dry-run, если указан
        const originalDryRun = PortfolioRebalancingService.settings.dryRun;
        if (typeof dryRun === 'boolean') {
            PortfolioRebalancingService.settings.dryRun = dryRun;
        }
        
        try {
            const result = await PortfolioRebalancingService.performRebalancing();
            
            // Восстанавливаем оригинальный режим
            PortfolioRebalancingService.settings.dryRun = originalDryRun;
            
            return res.json({
                success: result.success !== false,
                data: result
            });
        } catch (executeError) {
            // Восстанавливаем оригинальный режим даже при ошибке
            PortfolioRebalancingService.settings.dryRun = originalDryRun;
            throw executeError;
        }
    } catch (error) {
        console.error('Error executing rebalancing:', error);
        return res.status(500).json({
            success: false,
            message: 'Ошибка выполнения ребалансировки',
            error: error.message
        });
    }
});

/**
 * GET /api/portfolio-rebalancing/history
 * Получение истории ребалансировок
 * Query параметры:
 * - limit: количество записей (по умолчанию 50, максимум 500)
 * - offset: смещение для пагинации (по умолчанию 0)
 */
router.get('/history', async (req, res) => {
        try {
            const limit = Math.min(parseInt(req.query.limit) || 50, 500);
            const offset = Math.max(parseInt(req.query.offset) || 0, 0);
            
            // Получаем историю из БД
            const { count, rows } = await PortfolioRebalancing.findAndCountAll({
                limit,
                offset,
                order: [['timestamp', 'DESC']]
            });
            
            // Форматируем даты в строках ISO
            const { formatModelsDates } = await import('../utils/dateFormatter.js');
            const formattedHistory = formatModelsDates(rows, ['timestamp', 'createdAt', 'updatedAt']);
            
            return res.json({
                success: true,
                data: {
                    history: formattedHistory,
                    total: count,
                    limit,
                    offset
                }
            });
    } catch (error) {
        console.error('Error getting rebalancing history:', error);
        return res.status(500).json({
            success: false,
            message: 'Ошибка получения истории ребалансировок',
            error: error.message
        });
    }
});

export default router;

