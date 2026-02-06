import { parentPort, workerData } from 'worker_threads';
import TinkoffApiService from '../services/TinkoffApiService.js';
import CachedInstrument from '../models/CachedInstrument.js';
import TradingEngine from '../services/TradingEngine.js';
import ServiceManager from '../services/ServiceManager.js';
import { setGlobalServiceManager } from '../services/GlobalServiceManager.js';
// Импортируем ServiceInitializationTracker динамически, чтобы избежать проблем с инициализацией в worker'е
let ServiceInitializationTracker = null;

// Устанавливаем флаг воркера
process.env.WORKER = 'true';

async function performPortfolioPricesUpdate() {
    try {
        // Инициализируем ServiceManager для использования в сервисах
        setGlobalServiceManager(ServiceManager);
        
        // Проверяем глобальную инициализацию (динамический импорт для избежания проблем в worker'е)
        let isServiceManagerGlobal = false;
        try {
            if (!ServiceInitializationTracker) {
                ServiceInitializationTracker = (await import('../utils/ServiceInitializationTracker.js')).default;
            }
            if (ServiceInitializationTracker && typeof ServiceInitializationTracker.isServiceInitializedGlobally === 'function') {
                isServiceManagerGlobal = await ServiceInitializationTracker.isServiceInitializedGlobally('ServiceManager');
            }
        } catch (trackerError) {
            // Игнорируем ошибки трекера - это не критично
            const LoggerService = (await import('../services/LoggerService.js')).default;
            if (LoggerService && LoggerService.isInitialized) {
                LoggerService.warn('ServiceInitializationTracker error', {
                    service: 'portfolioPricesUpdateWorker',
                    operation: 'performPortfolioPricesUpdate',
                    error: { message: trackerError.message }
                });
            }
        }
        
        if (!isServiceManagerGlobal && !ServiceManager.isInitialized) {
            await ServiceManager.initialize();
        }

        const startTime = Date.now();
        let totalUpdated = 0;
        let totalFailed = 0;


        // Получаем портфель
        const portfolio = await TradingEngine.getPortfolioValue();
        const positions = portfolio?.positions || {};

        // Извлекаем FIGI из позиций
        const figis = Object.keys(positions).filter(figi => {
            const quantity = positions[figi];
            return quantity && typeof quantity === 'number' && quantity > 0;
        });

        if (figis.length === 0) {
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


        // Разбиваем на батчи по 50 инструментов (лимит API)
        const batchSize = 50;
        const batches = [];
        
        for (let i = 0; i < figis.length; i += batchSize) {
            batches.push(figis.slice(i, i + batchSize));
        }


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
                        const LoggerService = (await import('../services/LoggerService.js')).default;
                        if (LoggerService && LoggerService.isInitialized) {
                            LoggerService.error('Error updating price', {
                                service: 'portfolioPricesUpdateWorker',
                                operation: 'performPortfolioPricesUpdate',
                                figi: priceData.figi,
                                error: { message: updateError.message }
                            });
                        } else {
                            console.error(`❌ [Portfolio Worker] Error updating price for ${priceData.figi}:`, updateError.message);
                        }
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
                const LoggerService = (await import('../services/LoggerService.js')).default;
                if (LoggerService && LoggerService.isInitialized) {
                    LoggerService.error('Error processing batch', {
                        service: 'portfolioPricesUpdateWorker',
                        operation: 'performPortfolioPricesUpdate',
                        batchIndex: batchIndex + 1,
                        error: { message: batchError.message }
                    });
                } else {
                    console.error(`❌ [Portfolio Worker] Error processing batch ${batchIndex + 1}:`, batchError.message);
                }
                totalFailed += batch.length;
            }
        }

        const duration = Math.round((Date.now() - startTime) / 1000);

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
        const LoggerService = (await import('../services/LoggerService.js')).default;
        if (LoggerService && LoggerService.isInitialized) {
            LoggerService.error('Portfolio prices update failed', {
                service: 'portfolioPricesUpdateWorker',
                operation: 'performPortfolioPricesUpdate',
                error: { message: error.message, stack: error.stack }
            });
        } else {
            console.error('❌ [Portfolio Worker] Portfolio prices update failed:', error);
        }
        
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

