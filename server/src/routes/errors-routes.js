import express from 'express';
import OptimizedTelegramService from '../services/OptimizedTelegramService.js';
import ServiceManager from '../services/ServiceManager.js';

const router = express.Router();

/**
 * Обработка ошибок
 */
router.post('/', async (req, res) => {
    try {
        const { error, context, severity = 'error' } = req.body;
        
        // Логируем только реальные ошибки
        if (error && error !== 'undefined') {
            console.error('Received error:', error);
            console.error('Context:', context);
            console.error('Severity:', severity);
        } else {
            console.log('⚠️ Ignoring undefined error report');
        }
        
        // Отправляем алерт в Telegram только если есть реальная ошибка
        if (error && error !== 'undefined' && OptimizedTelegramService && OptimizedTelegramService.isInitialized) {
            const contextStr = context ? JSON.stringify(context) : 'Не указан';
            const errorStr = error || 'Неизвестная ошибка';
            
            await OptimizedTelegramService.sendAlert(
                'SYSTEM_ERROR',
                `❌ <b>СИСТЕМНАЯ ОШИБКА</b>\n\n🔍 Ошибка: ${errorStr}\n📊 Контекст: ${contextStr}\n⚠️ Уровень: ${severity}\n⏰ Время: ${new Date().toLocaleString('ru-RU')}`,
                severity
            );
        }
        
        res.json({
            success: true,
            data: { message: 'Error logged successfully' }
        });
    } catch (error) {
        console.error('Ошибка обработки ошибки:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка обработки ошибки',
            error: error.message
        });
    }
});

export default router;
