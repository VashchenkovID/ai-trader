import { parentPort, workerData } from 'worker_threads';
import TinkoffApiService from '../services/TinkoffApiService.js';
import CachedInstrument from '../models/CachedInstrument.js';
import TradingEngine from '../services/TradingEngine.js';
import ServiceManager from '../services/ServiceManager.js';
import { setGlobalServiceManager } from '../services/GlobalServiceManager.js';
import ServiceInitializationTracker from '../utils/ServiceInitializationTracker.js';

// Устанавливаем флаг воркера
process.env.WORKER = 'true';

async function performPortfolioPricesUpdate() {
    try {
        // Инициализируем ServiceManager для использования в сервисах
        setGlobalServiceManager(ServiceManager);
        
        // Проверяем глобальную инициализацию
        const isServiceManagerGlobal = await ServiceInitializationTracker.isServiceInitializedGlobally('ServiceManager');
        
        if (!isServiceManagerGlobal && !ServiceManager.isInitialized) {
            console.log('🔧 [Portfolio Worker] ServiceManager not initialized globally, initializing in worker...');
            await ServiceManager.initialize();
        } else if (isServiceManagerGlobal) {
            console.log('ℹ️ [Portfolio Worker] ServiceManager already initialized globally, skipping full initialization');
        }

        const startTime = Date.now();
        let totalUpdated = 0;
        let totalFailed = 0;

        console.log('💰 [Portfolio Worker] Starting portfolio prices update...');

        // Получаем портфель
        const portfolio = await TradingEngine.getPortfolioValue();
        const positions = portfolio?.positions || {};

        // Извлекаем FIGI из позиций
        const figis = Object.keys(positions).filter(figi => {
            const quantity = positions[figi];
            return quantity && typeof quantity === 'number' && quantity > 0;
        });

        if (figis.length === 0) {
            console.log('⚠️ [Portfolio Worker] No active positions found');
            parentPort.postMessage({
                type: 'done',
                data: {
                    success: true,
                    message: 'No active positions to update',
                    totalUpdated: 0,
                    totalFailed: 0,
                    duration: Math.round((Date.now() - startTime) / 1000)
                }
            });
            return;
        }

        console.log(`💰 [Portfolio Worker] Updating prices for ${figis.length} portfolio positions...`);

        // Разбиваем на батчи по 50 инструментов (лимит API)
        const batchSize = 50;
        const batches = [];
        
        for (let i = 0; i < figis.length; i += batchSize) {
            batches.push(figis.slice(i, i + batchSize));
        }

        console.log(`💰 [Portfolio Worker] Processing ${batches.length} batches...`);

        // Обрабатываем каждый батч
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            const batch = batches[batchIndex];

            try {
                // Получаем последние цены для батча
                const priceResponse = await TinkoffApiService.getLastPrices(batch);
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
                        console.error(`❌ [Portfolio Worker] Error updating price for ${priceData.figi}:`, updateError.message);
                        totalFailed++;
                    }
                }

                // Отправляем прогресс
                parentPort.postMessage({
                    type: 'progress',
                    data: {
                        processed: (batchIndex + 1) * batchSize,
                        total: figis.length,
                        updated: totalUpdated,
                        failed: totalFailed
                    }
                });

                // Небольшая задержка между батчами
                if (batchIndex < batches.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            } catch (batchError) {
                console.error(`❌ [Portfolio Worker] Error processing batch ${batchIndex + 1}:`, batchError.message);
                totalFailed += batch.length;
            }
        }

        const duration = Math.round((Date.now() - startTime) / 1000);
        console.log(`✅ [Portfolio Worker] Portfolio prices update completed in ${duration}s. Updated: ${totalUpdated}, Failed: ${totalFailed}`);

        // Отправляем результат
        parentPort.postMessage({
            type: 'done',
            data: {
                success: true,
                message: `Portfolio prices update completed in ${duration}s`,
                totalUpdated,
                totalFailed,
                duration,
                positionsCount: figis.length
            }
        });

    } catch (error) {
        console.error('❌ [Portfolio Worker] Portfolio prices update failed:', error);
        
        parentPort.postMessage({
            type: 'error',
            data: {
                error: error.message,
                success: false
            }
        });
    }
}

// Запускаем обновление цен портфеля
performPortfolioPricesUpdate();

