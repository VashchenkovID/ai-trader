import express from 'express';
import OptimizedTelegramService from '../services/OptimizedTelegramService.js';
import ServiceManager from '../services/ServiceManager.js';

const router = express.Router();

/**
 * Статус Telegram
 */
router.get('/status', async (req, res) => {
    try {
        const status = await OptimizedTelegramService.getStatus();
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('Ошибка получения статуса Telegram:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статуса Telegram',
            error: error.message
        });
    }
});

/**
 * Каналы Telegram
 */
router.get('/channels', async (req, res) => {
    try {
        const channels = await OptimizedTelegramService.getChannels();
        res.json({
            success: true,
            data: channels
        });
    } catch (error) {
        console.error('Ошибка получения каналов Telegram:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения каналов Telegram',
            error: error.message
        });
    }
});

/**
 * Добавление канала
 */
router.post('/channels', async (req, res) => {
    try {
        const { channel } = req.body;
        const result = await OptimizedTelegramService.addChannel(channel);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка добавления канала:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка добавления канала',
            error: error.message
        });
    }
});

/**
 * Удаление канала
 */
router.delete('/channels/:channel', async (req, res) => {
    try {
        const { channel } = req.params;
        const result = await OptimizedTelegramService.removeChannel(channel);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка удаления канала:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка удаления канала',
            error: error.message
        });
    }
});

/**
 * Проверка канала
 */
router.get('/channels/:channel/check', async (req, res) => {
    try {
        const { channel } = req.params;
        const result = await OptimizedTelegramService.checkChannel(channel);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка проверки канала:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка проверки канала',
            error: error.message
        });
    }
});

/**
 * Анализ настроений по FIGI
 */
router.get('/sentiment/:figi', async (req, res) => {
    try {
        const { figi } = req.params;
        const sentiment = await OptimizedTelegramService.getSentiment(figi);
        res.json({
            success: true,
            data: sentiment
        });
    } catch (error) {
        console.error('Ошибка получения анализа настроений:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения анализа настроений',
            error: error.message
        });
    }
});

export default router;
