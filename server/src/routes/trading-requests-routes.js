import express from 'express';
import TradingRequestService from '../services/TradingRequestService.js';
import ServiceManager from '../services/ServiceManager.js';

const router = express.Router();

/**
 * Все торговые запросы
 */
router.get('/', async (req, res) => {
    try {
        const requests = await TradingRequestService.getAllRequests();
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
        res.json({
            success: true,
            data: requests
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
        res.json({
            success: true,
            data: requests
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
 * Создание запроса
 */
router.post('/create', async (req, res) => {
    try {
        const { figi, operation, quantity, price } = req.body;
        const result = await TradingRequestService.createRequest(figi, operation, quantity, price);
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
 * Массовое создание запросов
 */
router.post('/create-bulk', async (req, res) => {
    try {
        const { requests } = req.body;
        const result = await TradingRequestService.createBulkRequests(requests);
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
        const result = await TradingRequestService.approveRequest(id);
        res.json({
            success: true,
            data: result
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
 * Выполнение запроса
 */
router.post('/:id/execute', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await TradingRequestService.executeRequest(id);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка выполнения запроса:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка выполнения запроса',
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
        const stats = await TradingRequestService.getStats();
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

export default router;
