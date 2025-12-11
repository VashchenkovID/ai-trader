import { parentPort, workerData } from 'worker_threads';
import CacheService from '../services/CacheService.js';
import SignalCacheService from '../services/SignalCacheService.js';

async function performCacheUpdate() {
    try {
        const { 
            updateInstruments, 
            updateCandles, 
            updateSignals,
            instrumentsLimit, 
            candlesDays, 
            incrementalUpdate,
            signalsLimit
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
                        // Получаем активные сигналы для инструмента
                        const result = await SignalCacheService.fetchAndCacheSignals(instrument.figi, {
                            active: true,
                            limit: 100
                        });
                        
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