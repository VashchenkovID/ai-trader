import { parentPort, workerData } from 'worker_threads';
import CacheService from '../services/CacheService.js';

async function performCacheUpdate() {
    try {
        const { updateInstruments, updateCandles, instrumentsLimit, candlesDays } = workerData;
        const startTime = Date.now();
        let totalUpdated = 0;

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
                
                console.log(`📊 Updating candles for ${instruments.length} instruments...`);
                
                for (let i = 0; i < instruments.length; i++) {
                    const instrument = instruments[i];
                    
                    try {
                        await CacheService.cacheCandles(instrument.figi, 'DAY', candlesDays);
                        totalUpdated++;
                        
                        if (i % 10 === 0) {
                            console.log(`📊 Updated candles for ${i + 1}/${instruments.length} instruments`);
                        }
                    } catch (error) {
                        console.error(`❌ Error updating candles for ${instrument.figi}:`, error.message);
                        // Продолжаем с другими инструментами
                    }
                }
                
                console.log(`✅ Updated candles for ${instruments.length} instruments`);
            } catch (error) {
                console.error('❌ Error updating candles:', error);
                throw error;
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