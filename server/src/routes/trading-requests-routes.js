import express from 'express';
import TradingRequestService from '../services/TradingRequestService.js';
import ServiceManager from '../services/ServiceManager.js';

const router = express.Router();

/**
 * Все торговые запросы
 */
router.get('/', async (req, res) => {
    try {
        const { status, limit, tradingMode } = req.query;
        const requests = await TradingRequestService.getRequests(
            status || null,
            limit ? parseInt(limit) : 50,
            tradingMode || null
        );
        
        // Форматирование уже выполнено в getRequests через formatModelDates
        res.json({
            success: true,
            data: requests
        });
    } catch (error) {
        console.error('Ошибка получения торговых запросов:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения торговых запросов',
            error: error.message
        });
    }
});

/**
 * Ожидающие запросы
 */
router.get('/pending', async (req, res) => {
    try {
        const requests = await TradingRequestService.getPendingRequests();
        const { formatModelsDates } = await import('../utils/dateFormatter.js');
        
        res.json({
            success: true,
            data: formatModelsDates(requests, ['createdAt', 'updatedAt', 'executedAt', 'approvedAt', 'expiresAt'])
        });
    } catch (error) {
        console.error('Ошибка получения ожидающих запросов:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения ожидающих запросов',
            error: error.message
        });
    }
});

/**
 * Одобренные запросы
 */
router.get('/approved', async (req, res) => {
    try {
        const requests = await TradingRequestService.getApprovedRequests();
        const { formatModelsDates } = await import('../utils/dateFormatter.js');
        
        res.json({
            success: true,
            data: formatModelsDates(requests, ['createdAt', 'updatedAt', 'executedAt', 'approvedAt', 'expiresAt'])
        });
    } catch (error) {
        console.error('Ошибка получения одобренных запросов:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения одобренных запросов',
            error: error.message
        });
    }
});

/**
 * Создание запроса из рекомендации
 * Поддерживает два варианта:
 * 1. recommendationFigi - FIGI для поиска рекомендации в БД
 * 2. recommendationData - полные данные рекомендации (если не найдена в БД)
 */
router.post('/create', async (req, res) => {
    try {
        const { recommendationFigi, recommendationData, options = {} } = req.body;
        
        if (!recommendationFigi && !recommendationData) {
            return res.status(400).json({
                success: false,
                message: 'Either recommendationFigi or recommendationData is required'
            });
        }
        
        // Если recommendationData передан и содержит recommendation, используем его как options.action (если action не указан явно)
        if (recommendationData && recommendationData.recommendation && !options.action) {
            if (recommendationData.recommendation === 'BUY' || recommendationData.recommendation === 'SELL') {
                options.action = recommendationData.recommendation;
            }
        }
        
        let result;
        
        // Если есть recommendationFigi, пытаемся найти в БД
        if (recommendationFigi) {
            try {
                result = await TradingRequestService.createTradingRequest(recommendationFigi, options);
            } catch (error) {
                // Если рекомендация не найдена в БД, но есть данные - используем их
                if (error.message.includes('not found') && recommendationData) {
                    result = await TradingRequestService.createTradingRequestFromData(recommendationData, options);
                } else {
                    throw error;
                }
            }
        } else if (recommendationData) {
            // Используем переданные данные напрямую
            result = await TradingRequestService.createTradingRequestFromData(recommendationData, options);
        }
        
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка создания запроса:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка создания запроса',
            error: error.message
        });
    }
});

/**
 * Массовое создание запросов из рекомендаций
 */
router.post('/create-bulk', async (req, res) => {
    try {
        const { recommendationFigis, options = {} } = req.body;
        
        if (!recommendationFigis || !Array.isArray(recommendationFigis)) {
            return res.status(400).json({
                success: false,
                message: 'recommendationFigis array is required'
            });
        }
        
        const result = await TradingRequestService.createBulkTradingRequests(recommendationFigis, options);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка массового создания запросов:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка массового создания запросов',
            error: error.message
        });
    }
});

/**
 * Одобрение запроса
 */
router.post('/:id/approve', async (req, res) => {
    try {
        const { id } = req.params;
        const { comment } = req.body; // Комментарий пользователя (опционально)
        const result = await TradingRequestService.approveRequest(id, comment);
        res.json({
            success: true,
            data: result,
            message: 'Заявка одобрена (пользователь подтвердил выполнение)'
        });
    } catch (error) {
        console.error('Ошибка одобрения запроса:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка одобрения запроса',
            error: error.message
        });
    }
});

/**
 * Отклонение запроса
 */
router.post('/:id/reject', async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const result = await TradingRequestService.rejectRequest(id, reason);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка отклонения запроса:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка отклонения запроса',
            error: error.message
        });
    }
});

/**
 * Отметка заявки как выполненной (пользователь подтверждает выполнение)
 * Исполнение происходит вручную пользователем, мы только фиксируем факт
 */
router.post('/:id/execute', async (req, res) => {
    try {
        const { id } = req.params;
        const { actualPrice, actualAmount } = req.body; // Опциональные параметры
        
        const result = await TradingRequestService.markRequestAsExecuted(id, actualPrice, actualAmount);
        res.json({
            success: true,
            data: result,
            message: 'Заявка отмечена как выполненная'
        });
    } catch (error) {
        console.error('Ошибка отметки заявки как выполненной:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка отметки заявки как выполненной',
            error: error.message
        });
    }
});

/**
 * Отмена запроса
 */
router.post('/:id/cancel', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await TradingRequestService.cancelRequest(id);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка отмены запроса:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка отмены запроса',
            error: error.message
        });
    }
});

/**
 * Массовое одобрение
 */
router.post('/bulk-approve', async (req, res) => {
    try {
        const { ids } = req.body;
        const result = await TradingRequestService.bulkApproveRequests(ids);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка массового одобрения:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка массового одобрения',
            error: error.message
        });
    }
});

/**
 * Массовое отклонение
 */
router.post('/bulk-reject', async (req, res) => {
    try {
        const { ids, reason } = req.body;
        const result = await TradingRequestService.bulkRejectRequests(ids, reason);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка массового отклонения:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка массового отклонения',
            error: error.message
        });
    }
});

/**
 * Статистика запросов
 */
router.get('/stats', async (req, res) => {
    try {
        const { tradingMode } = req.query;
        const stats = await TradingRequestService.getRequestStats(tradingMode || null);
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Ошибка получения статистики запросов:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статистики запросов',
            error: error.message
        });
    }
});

/**
 * Статистика по режимам
 */
router.get('/stats-by-mode', async (req, res) => {
    try {
        const stats = await TradingRequestService.getStatsByMode();
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Ошибка получения статистики по режимам:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статистики по режимам',
            error: error.message
        });
    }
});

/**
 * Очистка завершенных заявок (одобренных и отклоненных)
 */
router.delete('/cleanup', async (req, res) => {
    try {
        const { olderThanDays, tradingMode } = req.query;
        
        const options = {};
        if (olderThanDays) {
            options.olderThanDays = parseInt(olderThanDays);
        }
        if (tradingMode) {
            options.tradingMode = tradingMode;
        }

        const result = await TradingRequestService.cleanupCompletedRequests(options);
        
        res.json({
            success: true,
            message: `Удалено ${result.deletedCount} завершенных заявок`,
            data: result
        });
    } catch (error) {
        console.error('Ошибка очистки завершенных заявок:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка очистки завершенных заявок',
            error: error.message
        });
    }
});

/**
 * Статистика завершенных заявок (перед очисткой)
 */
router.get('/cleanup/stats', async (req, res) => {
    try {
        const { tradingMode } = req.query;
        
        const stats = await TradingRequestService.getCompletedRequestsStats(tradingMode || null);
        
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Ошибка получения статистики завершенных заявок:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статистики завершенных заявок',
            error: error.message
        });
    }
});

/**
 * Тестирование Exit Optimization Service
 * POST /api/trading-requests/test-exit-optimization
 * 
 * Поддерживает два режима:
 * 1. С реальной позицией: { positionId: "..." }
 * 2. С мок-данными: { mockPosition: { ... } }
 */
router.post('/test-exit-optimization', async (req, res) => {
    try {
        const { positionId, mockPosition, options = {} } = req.body;
        
        const ExitOptimizationService = (await import('../services/ExitOptimizationService.js')).default;
        
        if (!ExitOptimizationService || !ExitOptimizationService.isInitialized) {
            return res.status(503).json({
                success: false,
                message: 'ExitOptimizationService не инициализирован'
            });
        }

        let position = null;

        // Режим 1: Используем реальную позицию
        if (positionId) {
            position = await TradingRequest.findByPk(positionId);
            if (!position) {
                return res.status(404).json({
                    success: false,
                    message: 'Позиция не найдена'
                });
            }
        }
        // Режим 2: Используем мок-данные
        else if (mockPosition) {
            // Создаем временный объект позиции из мок-данных
            position = {
                id: mockPosition.id || 'test-position-id',
                figi: mockPosition.figi || 'BBG004730N88',
                ticker: mockPosition.ticker || 'SBER',
                name: mockPosition.name || 'Сбербанк',
                action: mockPosition.action || 'BUY',
                priceAtRequest: mockPosition.priceAtRequest || 300,
                actualPrice: mockPosition.actualPrice || mockPosition.priceAtRequest || 300,
                confidence: mockPosition.confidence || 0.7,
                score: mockPosition.score || 0.7,
                stopLoss: mockPosition.stopLoss || null,
                takeProfit: mockPosition.takeProfit || null,
                createdAt: mockPosition.createdAt ? new Date(mockPosition.createdAt) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 дней назад
                status: mockPosition.status || 'EXECUTED',
                tradingMode: mockPosition.tradingMode || 'paper'
            };
        } else {
            return res.status(400).json({
                success: false,
                message: 'Either positionId or mockPosition is required'
            });
        }

        // Получаем текущую цену, если не передана
        const currentPrice = options.currentPrice || null;

        const analysis = await ExitOptimizationService.analyzeExit(position, {
            ...options,
            currentPrice
        });
        
        res.json({
            success: true,
            data: analysis,
            isMock: !!mockPosition
        });
    } catch (error) {
        console.error('Ошибка тестирования Exit Optimization:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка тестирования Exit Optimization',
            error: error.message
        });
    }
});

/**
 * Тестирование Entry Optimization Service
 * POST /api/trading-requests/test-entry-optimization
 */
router.post('/test-entry-optimization', async (req, res) => {
    try {
        const { figi, action, price, confidence, score } = req.body;
        
        if (!figi || !action || !price) {
            return res.status(400).json({
                success: false,
                message: 'figi, action, and price are required'
            });
        }

        const EntryOptimizationService = (await import('../services/EntryOptimizationService.js')).default;
        
        if (!EntryOptimizationService || !EntryOptimizationService.isInitialized) {
            return res.status(503).json({
                success: false,
                message: 'EntryOptimizationService не инициализирован'
            });
        }

        const signal = {
            figi,
            action,
            price: parseFloat(price),
            confidence: confidence ? parseFloat(confidence) : 0.7,
            score: score ? parseFloat(score) : 0.7
        };

        const analysis = await EntryOptimizationService.analyzeEntry(signal, req.body.options || {});
        
        res.json({
            success: true,
            data: analysis
        });
    } catch (error) {
        console.error('Ошибка тестирования Entry Optimization:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка тестирования Entry Optimization',
            error: error.message
        });
    }
});

export default router;
