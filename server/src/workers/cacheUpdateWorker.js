import { parentPort, workerData } from 'worker_threads';
import CacheService from '../services/CacheService.js';
import SignalCacheService from '../services/SignalCacheService.js';
import sequelize from '../config/database.js';

/**
 * Проверка и восстановление соединения с БД
 * ВАЖНО: Worker threads используют тот же экземпляр sequelize, но с изолированным пулом соединений
 * ВАРИАНТ 2 и 3: Улучшенное управление соединениями без лишних authenticate()
 */
async function ensureDatabaseConnection() {
    try {
        // ВАРИАНТ 2: Не используем authenticate() - проверяем только состояние пула
        if (sequelize.connectionManager && sequelize.connectionManager.pool) {
            const pool = sequelize.connectionManager.pool;
            if (pool._draining) {
                console.warn('⚠️ Connection pool is draining, waiting for cleanup...');
                return false;
            }
            // Пул активен, соединение должно быть доступно
            return true;
        }
        
        // Если пула нет, пытаемся восстановить
        console.warn('⚠️ Connection pool not available in worker, attempting to restore...');
        await sequelize.authenticate();
        return true;
    } catch (error) {
        // ВАРИАНТ 6: Retry с exponential backoff
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries) {
            const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 10000); // Максимум 10 секунд
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

async function performCacheUpdate() {
    try {
        // Проверяем соединение с БД перед началом работы
        await ensureDatabaseConnection();
        
        const { 
            updateInstruments, 
            updateCandles, 
            updateSignals,
            instrumentsLimit, 
            candlesDays, 
            incrementalUpdate,
            signalsLimit,
            signalsFrom,
            signalsTo
        } = workerData;
        const startTime = Date.now();
        let totalUpdated = 0;
        let totalCandlesCached = 0;
        let totalSignalsCached = 0;

        console.log('🔄 Starting cache update in worker...');

        // Этап 1: Обновление инструментов
        if (updateInstruments) {
            console.log('📊 Updating instruments...');
            
            try {
                const instruments = await CacheService.cacheInstruments();
                totalUpdated += instruments.length;
                
                console.log(`✅ Cached ${instruments.length} instruments`);
            } catch (error) {
                console.error('❌ Error updating instruments:', error);
                throw error;
            }
        }

        // Этап 2: Обновление свечей
        if (updateCandles) {
            console.log('📊 Updating candles...');
            
            try {
                // Получаем список инструментов для обновления свечей
                const instruments = await CacheService.getAllInstruments(instrumentsLimit);
                
                console.log(`📊 Updating candles for ${instruments.length} instruments (incremental: ${incrementalUpdate || false})...`);
                
                for (let i = 0; i < instruments.length; i++) {
                    const instrument = instruments[i];
                    
                    try {
                        // Периодически проверяем соединение с БД (каждые 50 инструментов)
                        // И добавляем небольшую задержку для снижения нагрузки на БД
                        if (i > 0 && i % 50 === 0) {
                            const connectionOk = await ensureDatabaseConnection();
                            if (!connectionOk) {
                                console.warn(`⚠️ Database connection issue at instrument ${i}, waiting before retry...`);
                                // Небольшая пауза перед продолжением
                                await new Promise(resolve => setTimeout(resolve, 1000));
                            }
                            // Небольшая задержка для снижения нагрузки на БД при большом количестве инструментов
                            await new Promise(resolve => setTimeout(resolve, 100));
                        }
                        
                        let candlesCached = 0;
                        
                        // Используем инкрементальное обновление, если включено
                        if (incrementalUpdate) {
                            const newCandles = await CacheService.updateCandlesIncremental(instrument.figi, 'DAY', candlesDays);
                            candlesCached = newCandles.length;
                        } else {
                            // Полное обновление для новых инструментов или при первом запуске
                            const newCandles = await CacheService.cacheCandles(instrument.figi, 'DAY', candlesDays);
                            candlesCached = newCandles.length;
                        }
                        
                        totalCandlesCached += candlesCached;
                        totalUpdated++;
                        
                        if (i % 10 === 0) {
                            console.log(`📊 Updated candles for ${i + 1}/${instruments.length} instruments (total candles: ${totalCandlesCached})`);
                        }
                    } catch (error) {
                        // Если ошибка связана с БД, пытаемся переподключиться
                        if (error.message && (
                            error.message.includes('Connection') || 
                            error.message.includes('connection') ||
                            error.message.includes('pool') ||
                            error.message.includes('closed')
                        )) {
                            // ВАРИАНТ 3 и 6: Улучшенная обработка ошибок с exponential backoff
                            console.warn(`⚠️ Database connection issue for ${instrument.figi}, attempting to reconnect...`);
                            
                            let retryCount = 0;
                            const maxRetries = 3;
                            let reconnected = false;
                            
                            while (retryCount < maxRetries && !reconnected) {
                                const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 5000); // Максимум 5 секунд
                                retryCount++;
                                await new Promise(resolve => setTimeout(resolve, backoffDelay));
                                
                                try {
                                    await ensureDatabaseConnection();
                                    reconnected = true;
                                    console.log(`✅ Reconnected after ${retryCount} attempt(s)`);
                                } catch (reconnectError) {
                                    if (retryCount >= maxRetries) {
                                        console.error(`❌ Failed to reconnect after ${maxRetries} attempts, skipping ${instrument.figi}`);
                                    }
                                }
                            }
                            
                            if (reconnected) {
                                continue; // Skip current instrument, try next
                            } else {
                                continue; // Skip anyway
                            }
                        }
                        console.error(`❌ Error updating candles for ${instrument.figi}:`, error.message);
                        // Продолжаем с другими инструментами
                    }
                }
                
                console.log(`✅ Updated candles for ${instruments.length} instruments (total candles cached: ${totalCandlesCached})`);
            } catch (error) {
                console.error('❌ Error updating candles:', error);
                throw error;
            }
        }

        // Этап 3: Обновление сигналов
        if (updateSignals) {
            console.log('📊 Updating signals...');
            
            try {
                // Получаем список инструментов для обновления сигналов
                const instruments = await CacheService.getAllInstruments(signalsLimit || instrumentsLimit);
                
                console.log(`📊 Updating signals for ${instruments.length} instruments...`);
                
                for (let i = 0; i < instruments.length; i++) {
                    const instrument = instruments[i];
                    
                    try {
                        // Периодически проверяем соединение с БД (каждые 50 инструментов)
                        // И добавляем небольшую задержку для снижения нагрузки на БД
                        if (i > 0 && i % 50 === 0) {
                            const connectionOk = await ensureDatabaseConnection();
                            if (!connectionOk) {
                                console.warn(`⚠️ Database connection issue at signal ${i}, waiting before retry...`);
                                // Небольшая пауза перед продолжением
                                await new Promise(resolve => setTimeout(resolve, 1000));
                            }
                            // Небольшая задержка для снижения нагрузки на БД при большом количестве инструментов
                            await new Promise(resolve => setTimeout(resolve, 100));
                        }
                        
                        // Формируем опции для запроса сигналов
                        const signalsOptions = {
                            limit: 1000, // Максимальный лимит для получения всех доступных сигналов
                            pageNumber: 0
                        };
                        
                        // Если указаны даты для инкрементального обновления, добавляем их
                        if (signalsFrom) {
                            signalsOptions.from = new Date(signalsFrom);
                        }
                        if (signalsTo) {
                            signalsOptions.to = new Date(signalsTo);
                        }
                        
                        const result = await SignalCacheService.fetchAndCacheSignals(instrument.figi, signalsOptions);
                        
                        if (result.success) {
                            totalSignalsCached += result.savedCount || 0;
                            totalUpdated++;
                        }
                        
                        // Отправляем прогресс каждые 10 инструментов
                        if (i % 10 === 0) {
                            parentPort.postMessage({
                                type: 'progress',
                                data: {
                                    stage: 'signals',
                                    processed: i + 1,
                                    total: instruments.length,
                                    signalsCached: totalSignalsCached
                                }
                            });
                        }
                        
                        // Небольшая задержка чтобы не перегружать API
                        await new Promise(resolve => setTimeout(resolve, 200));
                    } catch (error) {
                        // Если ошибка связана с БД, пытаемся переподключиться
                        if (error.message && (
                            error.message.includes('Connection') || 
                            error.message.includes('connection') ||
                            error.message.includes('pool') ||
                            error.message.includes('closed')
                        )) {
                            // ВАРИАНТ 3 и 6: Улучшенная обработка ошибок с exponential backoff
                            console.warn(`⚠️ Database connection issue for ${instrument.figi}, attempting to reconnect...`);
                            
                            let retryCount = 0;
                            const maxRetries = 3;
                            let reconnected = false;
                            
                            while (retryCount < maxRetries && !reconnected) {
                                const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 5000); // Максимум 5 секунд
                                retryCount++;
                                await new Promise(resolve => setTimeout(resolve, backoffDelay));
                                
                                try {
                                    await ensureDatabaseConnection();
                                    reconnected = true;
                                    console.log(`✅ Reconnected after ${retryCount} attempt(s)`);
                                } catch (reconnectError) {
                                    if (retryCount >= maxRetries) {
                                        console.error(`❌ Failed to reconnect after ${maxRetries} attempts, skipping ${instrument.figi}`);
                                    }
                                }
                            }
                            
                            if (reconnected) {
                                continue; // Skip current instrument, try next
                            } else {
                                continue; // Skip anyway
                            }
                        }
                        console.error(`❌ Error updating signals for ${instrument.figi}:`, error.message);
                        // Продолжаем с другими инструментами
                    }
                }
                
                console.log(`✅ Updated signals for ${instruments.length} instruments (total signals cached: ${totalSignalsCached})`);
            } catch (error) {
                console.error('❌ Error updating signals:', error);
                // Не прерываем выполнение, сигналы не критичны
            }
        }

        const duration = Math.round((Date.now() - startTime) / 1000);
        console.log(`✅ Cache update completed in ${duration}s. Total updated: ${totalUpdated}`);

        // Отправляем результат
        parentPort.postMessage({
            type: 'done',
            data: {
                success: true,
                message: `Cache updated successfully in ${duration}s`,
                totalUpdated,
                totalCandlesCached,
                totalSignalsCached,
                duration
            }
        });

    } catch (error) {
        console.error('❌ Cache update failed:', error);
        
        // Отправляем ошибку
        parentPort.postMessage({
            type: 'error',
            data: {
                error: error.message,
                success: false
            }
        });
    }
}

// Запускаем обновление кеша
performCacheUpdate();