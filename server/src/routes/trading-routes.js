import express from 'express';
import TradingEngine from '../services/TradingEngine.js';
import ServiceManager from '../services/ServiceManager.js';
import OptimizedTelegramService from '../services/OptimizedTelegramService.js';

const router = express.Router();

/**
 * Статистика торговли
 */
router.get('/stats', async (req, res) => {
    try {
        const stats = await TradingEngine.calculateTradingStats();
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Ошибка получения статистики торговли:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статистики торговли',
            error: error.message
        });
    }
});

/**
 * История сделок
 */
router.get('/trades', async (req, res) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit) : 100;
        const trades = await TradingEngine.getTradeHistory(limit);
        res.json({
            success: true,
            data: trades
        });
    } catch (error) {
        console.error('Ошибка получения истории сделок:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения истории сделок',
            error: error.message
        });
    }
});

/**
 * Выполнение сделки
 */
router.post('/execute', async (req, res) => {
    try {
        const { figi, operation, quantity, price } = req.body;
        
        if (!figi || !operation || !quantity) {
            return res.status(400).json({
                success: false,
                message: 'Missing required parameters: figi, operation, quantity'
            });
        }

        const result = await TradingEngine.executeTrade(figi, operation, quantity, price);
        
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка выполнения сделки:', error);
        
        // Отправляем алерт в Telegram об ошибке
        try {
            if (OptimizedTelegramService && OptimizedTelegramService.isInitialized) {
                await OptimizedTelegramService.sendAlert(
                    'TRADING_EXECUTION_ERROR',
                    `❌ <b>ОШИБКА ВЫПОЛНЕНИЯ СДЕЛКИ</b>\n\n📈 Инструмент: <b>${req.body.figi}</b>\n🔍 Операция: <b>${req.body.operation}</b>\n🔍 Количество: <b>${req.body.quantity}</b>\n🔍 Ошибка: ${error.message}\n⏰ Время: ${new Date().toLocaleString('ru-RU')}`,
                    'error'
                );
            }
        } catch (telegramError) {
            console.warn('Failed to send trading error alert:', telegramError.message);
        }
        
        res.status(500).json({
            success: false,
            message: 'Ошибка выполнения сделки',
            error: error.message
        });
    }
});

/**
 * Статус торговли
 */
router.get('/status', async (req, res) => {
    try {
        const status = await TradingEngine.getStatus();
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('Ошибка получения статуса торговли:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статуса торговли',
            error: error.message
        });
    }
});

/**
 * Режим торговли
 */
router.get('/mode', async (req, res) => {
    try {
        const mode = TradingEngine.modeManager.getCurrentMode();
        res.json({
            success: true,
            data: mode
        });
    } catch (error) {
        console.error('Ошибка получения режима торговли:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения режима торговли',
            error: error.message
        });
    }
});

/**
 * Переключение режима торговли
 */
router.post('/mode/switch', async (req, res) => {
    try {
        const { mode } = req.body;
        
        if (!mode) {
            return res.status(400).json({
                success: false,
                message: 'Mode is required'
            });
        }

        const result = await TradingEngine.switchTradingMode(mode);
        
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка переключения режима торговли:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка переключения режима торговли',
            error: error.message
        });
    }
});

/**
 * Активация торгового движка
 */
router.post('/activate', async (req, res) => {
    try {
        const result = await TradingEngine.activate();
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка активации торгового движка:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка активации торгового движка',
            error: error.message
        });
    }
});

/**
 * Деактивация торгового движка
 */
router.post('/deactivate', async (req, res) => {
    try {
        const result = await TradingEngine.deactivate();
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка деактивации торгового движка:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка деактивации торгового движка',
            error: error.message
        });
    }
});

export default router;
