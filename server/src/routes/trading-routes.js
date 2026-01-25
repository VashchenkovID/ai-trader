import express from 'express';
import TradingEngine from '../services/TradingEngine.js';
import ServiceManager from '../services/ServiceManager.js';
import OptimizedTelegramService from '../services/OptimizedTelegramService.js';
import EntryOptimizationService from '../services/EntryOptimizationService.js';

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

/**
 * GET /api/trading/entry-optimization/:figi
 * Получить рекомендации по оптимизации входа
 */
router.get('/entry-optimization/:figi', async (req, res) => {
    try {
        const { figi } = req.params;
        
        if (!figi) {
            return res.status(400).json({
                success: false,
                message: 'FIGI is required'
            });
        }

        // Инициализируем сервис, если еще не инициализирован
        if (!EntryOptimizationService.isInitialized) {
            await EntryOptimizationService.initialize();
        }

        // Получаем рекомендации
        const entryPrediction = await EntryOptimizationService.predictOptimalEntryTime(figi);
        const orderSize = await EntryOptimizationService.calculateOptimalOrderSize(figi);
        const orderType = await EntryOptimizationService.recommendOrderType(figi);
        
        // Получаем данные о spread'е
        const currentSpread = await EntryOptimizationService.getCurrentSpread(figi);
        const historicalSpread = await EntryOptimizationService.getHistoricalSpread(figi, 30);
        
        // Рассчитываем статистику spread'а
        const spreadValues = historicalSpread.map(s => s.spread);
        const mean = spreadValues.reduce((a, b) => a + b, 0) / spreadValues.length;
        const sorted = [...spreadValues].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        const percentile25 = sorted[Math.floor(sorted.length * 0.25)];
        const percentile75 = sorted[Math.floor(sorted.length * 0.75)];

        // Определяем статус spread'а
        let spreadStatus = 'medium';
        if (currentSpread < percentile25) {
            spreadStatus = 'low';
        } else if (currentSpread > percentile75) {
            spreadStatus = 'high';
        }

        const data = {
            entryPrediction,
            orderSize,
            orderType,
            spread: {
                current: currentSpread,
                historical: {
                    mean,
                    median,
                    percentile25,
                    percentile75
                },
                status: spreadStatus
            }
        };
        
        res.json({
            success: true,
            data: data
        });
    } catch (error) {
        console.error('Error getting entry optimization:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting entry optimization',
            error: error.message
        });
    }
});

/**
 * GET /api/trading/entry-optimization/:figi/spread
 * Получить анализ spread'а для инструмента
 */
router.get('/entry-optimization/:figi/spread', async (req, res) => {
    try {
        const { figi } = req.params;
        const days = parseInt(req.query.days) || 30;
        
        if (!figi) {
            return res.status(400).json({
                success: false,
                message: 'FIGI is required'
            });
        }

        // Инициализируем сервис, если еще не инициализирован
        if (!EntryOptimizationService.isInitialized) {
            await EntryOptimizationService.initialize();
        }

        const currentSpread = await EntryOptimizationService.getCurrentSpread(figi);
        const historicalSpread = await EntryOptimizationService.getHistoricalSpread(figi, days);
        
        res.json({
            success: true,
            data: {
                current: currentSpread,
                historical: historicalSpread
            }
        });
    } catch (error) {
        console.error('Error getting spread analysis:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting spread analysis',
            error: error.message
        });
    }
});

export default router;
