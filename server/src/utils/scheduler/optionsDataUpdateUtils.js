import { executeWorkerTask } from './workerUtils.js';
import OptimizedTelegramService from '../../services/OptimizedTelegramService.js';

/**
 * Утилиты для обновления опционных данных
 */

/**
 * Выполняет обновление опционных данных через worker
 * @param {Object} context - Контекст выполнения
 * @param {Function} context.getWebSocketService - Функция получения WebSocket сервиса
 * @param {Set} context.workersSet - Set для отслеживания workers
 * @param {Object} options - Опции обновления
 * @param {number} options.delayMs - Задержка между запросами (по умолчанию 2000)
 * @param {boolean} options.forceUpdate - Принудительное обновление (по умолчанию false)
 * @returns {Promise<Object>} Результат обновления
 */
export async function performOptionsDataUpdate(context, options = {}) {
    const {
        getWebSocketService,
        workersSet
    } = context;
    
    const {
        delayMs = 2000,
        forceUpdate = false
    } = options;
    
    try {
        console.log('📊 Starting options data update in worker...');
        
        // Отправляем уведомление о начале обновления
        try {
            await OptimizedTelegramService.sendAlert(
                'OPTIONS_DATA_UPDATE_START',
                `📊 <b>Начато обновление опционных данных</b>\n\n` +
                `⏰ Время: ${new Date().toLocaleString('ru-RU')}\n` +
                `🔄 Режим: ${forceUpdate ? 'Принудительное обновление' : 'Обновление только новых'}\n` +
                `⏱️ Задержка между запросами: ${delayMs}мс`,
                'info'
            );
        } catch (telegramError) {
            // Игнорируем ошибки отправки уведомления
            console.warn('Failed to send Telegram notification about options update start:', telegramError.message);
        }
        
        const result = await executeWorkerTask(
            'optionsDataUpdateWorker.js',
            {
                delayMs,
                forceUpdate
            },
            {
                getWebSocketService,
                workersSet,
                broadcastType: 'options_data_update'
            }
        );
        
        console.log(`✅ Options data update completed in ${result.duration}s`);
        
        // Формируем отчет для Telegram
        if (result.stats) {
            const summary = `✅ <b>Обновление опционных данных завершено</b>\n\n` +
                `📊 <b>Статистика:</b>\n` +
                `• Обработано инструментов: ${result.stats.processed} / ${result.stats.total}\n` +
                `• Сохранено опционов: ${result.stats.saved}\n` +
                `• Ошибок: ${result.stats.errors}\n` +
                `• Пропущено: ${result.stats.skipped}\n\n` +
                `⏱️ Время выполнения: ${result.duration}с\n` +
                `⏰ Завершено: ${new Date().toLocaleString('ru-RU')}`;
            
            // Отправляем уведомление в Telegram
            try {
                await OptimizedTelegramService.sendAlert(
                    'OPTIONS_DATA_UPDATE_COMPLETE',
                    summary,
                    result.stats.errors > 0 ? 'warning' : 'info'
                );
            } catch (telegramError) {
                // Игнорируем ошибки отправки уведомления
                console.warn('Failed to send Telegram notification about options update completion:', telegramError.message);
            }
        }
        
        return {
            success: true,
            stats: result.stats,
            summary: result.summary,
            duration: result.duration
        };
    } catch (error) {
        console.error('❌ Error in performOptionsDataUpdate:', error);
        
        // Отправляем уведомление об ошибке в Telegram
        try {
            await OptimizedTelegramService.sendAlert(
                'OPTIONS_DATA_UPDATE_ERROR',
                `❌ <b>Ошибка при обновлении опционных данных</b>\n\n` +
                `📋 <b>Детали:</b>\n` +
                `• Ошибка: ${error.message}\n` +
                `• Время: ${new Date().toLocaleString('ru-RU')}\n\n` +
                `⚠️ Обновление прервано`,
                'error'
            );
        } catch (telegramError) {
            // Игнорируем ошибки отправки уведомления
            console.warn('Failed to send Telegram notification about options update error:', telegramError.message);
        }
        
        throw error;
    }
}

