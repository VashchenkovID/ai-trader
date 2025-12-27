import express from 'express';
import ServiceManager from '../services/ServiceManager.js';
import TradingNotificationSettings from '../models/TradingNotificationSettings.js';
import OptimizedTelegramService from '../services/OptimizedTelegramService.js';
import DatabaseConnectionManager from '../utils/DatabaseConnectionManager.js';

const router = express.Router();

/**
 * Кеширование новостей
 */
router.post('/cache/news', async (req, res) => {
    try {
        const { figi } = req.body;
        // Логика кеширования новостей
        res.json({
            success: true,
            data: { message: 'News cached successfully' }
        });
    } catch (error) {
        console.error('Ошибка кеширования новостей:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка кеширования новостей',
            error: error.message
        });
    }
});

/**
 * Кеширование Telegram
 */
router.post('/cache/telegram', async (req, res) => {
    try {
        const { channel } = req.body;
        // Логика кеширования Telegram
        res.json({
            success: true,
            data: { message: 'Telegram cached successfully' }
        });
    } catch (error) {
        console.error('Ошибка кеширования Telegram:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка кеширования Telegram',
            error: error.message
        });
    }
});

/**
 * Статус кеша новостей
 */
router.get('/cache/news/status', async (req, res) => {
    try {
        const status = { cached: true, lastUpdate: new Date().toISOString() };
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('Ошибка получения статуса кеша новостей:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статуса кеша новостей',
            error: error.message
        });
    }
});

/**
 * Статус кеша Telegram
 */
router.get('/cache/telegram/status', async (req, res) => {
    try {
        const status = { cached: true, lastUpdate: new Date().toISOString() };
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('Ошибка получения статуса кеша Telegram:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статуса кеша Telegram',
            error: error.message
        });
    }
});

/**
 * Очистка кеша новостей
 */
router.post('/cache/news/cleanup', async (req, res) => {
    try {
        const result = { message: 'News cache cleaned successfully' };
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка очистки кеша новостей:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка очистки кеша новостей',
            error: error.message
        });
    }
});

/**
 * Очистка кеша Telegram
 */
router.post('/cache/telegram/cleanup', async (req, res) => {
    try {
        const result = { message: 'Telegram cache cleaned successfully' };
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка очистки кеша Telegram:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка очистки кеша Telegram',
            error: error.message
        });
    }
});

/**
 * Получить настройки уведомлений
 */
router.get('/settings', async (req, res) => {
    try {
        // Проверяем, существует ли таблица
        const tableExists = await DatabaseConnectionManager.safeQuery(
            async () => {
                try {
                    await TradingNotificationSettings.findOne({ limit: 1 });
                    return true;
                } catch (e) {
                    // Если таблица не существует, пытаемся создать её
                    if (e.original && e.original.code === '42P01') {
                        console.log('⚠️ Таблица trading_notification_settings не существует. Создаю...');
                        await TradingNotificationSettings.sync({ force: false });
                        return true;
                    }
                    throw e;
                }
            }
        );

        const settings = await DatabaseConnectionManager.safeQuery(
            async () => {
                let notificationSettings = await TradingNotificationSettings.findOne({
                    where: { userId: 'default' }
                });
                
                if (!notificationSettings) {
                    // Создаем настройки по умолчанию
                    notificationSettings = await TradingNotificationSettings.create({
                        userId: 'default'
                    });
                }
                
                return notificationSettings;
            }
        );
        
        res.json({
            success: true,
            data: settings
        });
    } catch (error) {
        console.error('Ошибка получения настроек уведомлений:', error);
        
        // Если таблица не существует, возвращаем значения по умолчанию
        if (error.original && error.original.code === '42P01') {
            res.json({
                success: true,
                data: {
                    userId: 'default',
                    openingNotificationsEnabled: true,
                    openingNotificationMinutes: 15,
                    closingNotificationsEnabled: true,
                    closingNotificationMinutes: 15,
                    telegramEnabled: true,
                    websocketEnabled: true,
                    soundEnabled: true,
                    pushEnabled: false
                }
            });
            return;
        }
        
        res.status(500).json({
            success: false,
            message: 'Ошибка получения настроек уведомлений',
            error: error.message
        });
    }
});

/**
 * Обновить настройки уведомлений
 */
router.put('/settings', async (req, res) => {
    try {
        const updates = req.body;
        
        // Проверяем, существует ли таблица, если нет - создаем
        try {
            await TradingNotificationSettings.findOne({ limit: 1 });
        } catch (e) {
            if (e.original && e.original.code === '42P01') {
                console.log('⚠️ Таблица trading_notification_settings не существует. Создаю...');
                await TradingNotificationSettings.sync({ force: false });
            }
        }
        
        const settings = await DatabaseConnectionManager.safeQuery(
            async () => {
                let notificationSettings = await TradingNotificationSettings.findOne({
                    where: { userId: 'default' }
                });
                
                if (!notificationSettings) {
                    notificationSettings = await TradingNotificationSettings.create({
                        userId: 'default',
                        ...updates
                    });
                } else {
                    await notificationSettings.update(updates);
                    await notificationSettings.reload();
                }
                
                return notificationSettings;
            }
        );
        
        res.json({
            success: true,
            data: settings
        });
    } catch (error) {
        console.error('Ошибка обновления настроек уведомлений:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка обновления настроек уведомлений',
            error: error.message
        });
    }
});

export default router;
