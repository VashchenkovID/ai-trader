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
            const summary = `Обновление опционных данных завершено:
• Обработано инструментов: ${result.stats.processed} / ${result.stats.total}
• Сохранено опционов: ${result.stats.saved}
• Ошибок: ${result.stats.errors}
• Пропущено: ${result.stats.skipped}
• Время выполнения: ${result.duration}с`;
            
            // Отправляем уведомление в Telegram
            await OptimizedTelegramService.sendAlert(
                'OPTIONS_DATA_UPDATE',
                summary,
                result.stats.errors > 0 ? 'warning' : 'info'
            );
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
        await OptimizedTelegramService.sendAlert(
            'OPTIONS_DATA_UPDATE_ERROR',
            `❌ Ошибка при обновлении опционных данных:\n${error.message}`,
            'error'
        );
        
        throw error;
    }
}

