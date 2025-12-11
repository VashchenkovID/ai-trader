import { parentPort, workerData } from 'worker_threads';
import CacheService from '../services/CacheService.js';
import TinkoffApiService from '../services/TinkoffApiService.js';
import CachedInstrument from '../models/CachedInstrument.js';

async function performPriceUpdate() {
    try {
        const { instrumentsLimit } = workerData;
        const startTime = Date.now();
        let totalUpdated = 0;
        let totalFailed = 0;

        console.log('💰 [Worker] Starting price update...');

        // Получаем список всех активных инструментов из кеша
        const instruments = await CacheService.getAllInstruments(instrumentsLimit);
        
        if (!instruments || instruments.length === 0) {
            console.log('⚠️ [Worker] No instruments found in cache');
            parentPort.postMessage({
                type: 'done',
                data: {
                    success: true,
                    message: 'No instruments to update',
                    totalUpdated: 0,
                    duration: Math.round((Date.now() - startTime) / 1000)
                }
            });
            return;
        }

        console.log(`💰 [Worker] Updating prices for ${instruments.length} instruments...`);

        // Разбиваем на батчи по 50 инструментов (лимит API)
        const batchSize = 50;
        const batches = [];
        
        for (let i = 0; i < instruments.length; i += batchSize) {
            batches.push(instruments.slice(i, i + batchSize));
        }

        console.log(`💰 [Worker] Processing ${batches.length} batches...`);

        // Обрабатываем каждый батч
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            const batch = batches[batchIndex];
            const figis = batch.map(instrument => instrument.figi).filter(figi => figi);

            if (figis.length === 0) {
                continue;
            }

            try {
                // Получаем последние цены для батча
                const priceResponse = await TinkoffApiService.getLastPrices(figis);
                const lastPrices = priceResponse.lastPrices || [];

                // Обновляем цены в БД
                for (const priceData of lastPrices) {
                    try {
                        if (!priceData.figi || !priceData.price) {
                            continue;
                        }

                        // Конвертируем цену из формата {units, nano}
                        const units = parseFloat(priceData.price.units || 0);
                        const nano = parseFloat(priceData.price.nano || 0);
                        const priceValue = units + nano / 1e9;
                        const priceTime = priceData.time ? new Date(priceData.time) : new Date();

                        // Обновляем только цену и время, не трогая другие поля
                        await CachedInstrument.update(
                            {
                                lastPrice: priceValue,
                                lastPriceTime: priceTime
                            },
                            {
                                where: { figi: priceData.figi }
                            }
                        );

                        totalUpdated++;
                    } catch (updateError) {
                        console.error(`❌ [Worker] Error updating price for ${priceData.figi}:`, updateError.message);
                        totalFailed++;
                    }
                }

                // Отправляем прогресс
                parentPort.postMessage({
                    type: 'progress',
                    data: {
                        processed: (batchIndex + 1) * batchSize,
                        total: instruments.length,
                        updated: totalUpdated,
                        failed: totalFailed
                    }
                });

                // Небольшая задержка между батчами
                if (batchIndex < batches.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            } catch (batchError) {
                console.error(`❌ [Worker] Error processing batch ${batchIndex + 1}:`, batchError.message);
                totalFailed += batch.length;
            }
        }

        const duration = Math.round((Date.now() - startTime) / 1000);
        console.log(`✅ [Worker] Price update completed in ${duration}s. Updated: ${totalUpdated}, Failed: ${totalFailed}`);

        // Отправляем результат
        parentPort.postMessage({
            type: 'done',
            data: {
                success: true,
                message: `Price update completed in ${duration}s`,
                totalUpdated,
                totalFailed,
                duration
            }
        });

    } catch (error) {
        console.error('❌ [Worker] Price update failed:', error);
        
        parentPort.postMessage({
            type: 'error',
            data: {
                error: error.message,
                success: false
            }
        });
    }
}

// Запускаем обновление цен
performPriceUpdate();

