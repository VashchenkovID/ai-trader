import { parentPort, workerData } from 'worker_threads';
import OptionsDataService from '../services/OptionsDataService.js';
import sequelize from '../config/database.js';

/**
 * Проверка и восстановление соединения с БД
 */
async function ensureDatabaseConnection() {
    try {
        if (sequelize.connectionManager && sequelize.connectionManager.pool) {
            const pool = sequelize.connectionManager.pool;
            if (pool._draining) {
                console.warn('⚠️ Connection pool is draining, waiting for cleanup...');
                return false;
            }
            return true;
        }
        
        console.warn('⚠️ Connection pool not available in worker, attempting to restore...');
        await sequelize.authenticate();
        return true;
    } catch (error) {
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries) {
            const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 10000);
            retryCount++;
            
            console.warn(`⚠️ Database connection issue in worker, retry ${retryCount}/${maxRetries} after ${backoffDelay}ms...`);
            
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
            
            try {
                await sequelize.authenticate();
                console.log('✅ Database connection restored in worker');
                return true;
            } catch (reconnectError) {
                if (retryCount >= maxRetries) {
                    console.error('❌ Failed to reconnect to database in worker after retries:', reconnectError.message);
                    return false;
                }
            }
        }
        
        return false;
    }
}

async function performOptionsDataUpdate() {
    try {
        // Проверяем соединение с БД перед началом работы
        await ensureDatabaseConnection();
        
        const { 
            delayMs = 2000,
            forceUpdate = false
        } = workerData;
        
        const startTime = Date.now();
        
        console.log('📊 Starting options data update in worker...');
        
        // Убеждаемся, что сервис инициализирован
        if (!OptionsDataService.isInitialized) {
            await OptionsDataService.initialize();
        }
        
        // Отправляем сообщение о начале работы
        if (parentPort) {
            parentPort.postMessage({
                type: 'progress',
                data: {
                    progress: 0,
                    stage: 'Инициализация',
                    message: 'Начало обновления опционных данных'
                }
            });
        }
        
        // Выполняем массовое обновление опционов
        const updateStats = await OptionsDataService.updateOptionsForAllInstruments({
            delayMs,
            forceUpdate,
            onProgress: (progress, stage, message) => {
                // Отправляем прогресс в главный поток
                if (parentPort) {
                    parentPort.postMessage({
                        type: 'progress',
                        data: {
                            progress: progress || 0,
                            stage: stage || 'Обработка',
                            message: message || `Обработано: ${progress}%`
                        }
                    });
                }
            }
        });
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        // Формируем отчет
        const summary = `Обновление опционных данных завершено:
• Обработано инструментов: ${updateStats.processed} / ${updateStats.total}
• Сохранено опционов: ${updateStats.saved}
• Ошибок: ${updateStats.errors}
• Пропущено: ${updateStats.skipped}
• Время выполнения: ${duration}с`;
        
        console.log(`✅ Options data update completed in ${duration}s:\n${summary}`);
        
        // Отправляем результат в главный поток
        if (parentPort) {
            parentPort.postMessage({
                type: 'done',
                data: {
                    success: true,
                    stats: updateStats,
                    summary,
                    duration: parseFloat(duration)
                }
            });
        }
        
        return {
            success: true,
            stats: updateStats,
            summary,
            duration: parseFloat(duration)
        };
    } catch (error) {
        console.error('❌ Error in options data update worker:', error);
        
        // Отправляем ошибку в главный поток
        if (parentPort) {
            parentPort.postMessage({
                type: 'error',
                data: {
                    error: error.message,
                    stack: error.stack
                }
            });
        }
        
        throw error;
    }
}

// Запускаем обновление опционных данных
performOptionsDataUpdate()
    .then(() => {
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Fatal error in options data update worker:', error);
        process.exit(1);
    });

