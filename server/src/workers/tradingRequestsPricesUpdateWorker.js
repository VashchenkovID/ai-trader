import { parentPort, workerData } from 'worker_threads';
import TinkoffApiService from '../services/TinkoffApiService.js';
import CachedInstrument from '../models/CachedInstrument.js';
import TradingRequest from '../models/TradingRequest.js';
import { Op } from 'sequelize';
import ServiceManager from '../services/ServiceManager.js';
import { setGlobalServiceManager } from '../services/GlobalServiceManager.js';
import ServiceInitializationTracker from '../utils/ServiceInitializationTracker.js';

// Устанавливаем флаг воркера
process.env.WORKER = 'true';

async function performTradingRequestsPricesUpdate() {
    try {
        // Инициализируем ServiceManager для использования в сервисах
        setGlobalServiceManager(ServiceManager);
        
        // Проверяем глобальную инициализацию
        const isServiceManagerGlobal = await ServiceInitializationTracker.isServiceInitializedGlobally('ServiceManager');
        
        if (!isServiceManagerGlobal && !ServiceManager.isInitialized) {
            console.log('🔧 [Trading Requests Worker] ServiceManager not initialized globally, initializing in worker...');
            await ServiceManager.initialize();
        } else if (isServiceManagerGlobal) {
            console.log('ℹ️ [Trading Requests Worker] ServiceManager already initialized globally, skipping full initialization');
        }

        const startTime = Date.now();
        let totalUpdated = 0;
        let totalFailed = 0;
        const readyToExecute = [];

        console.log('📋 [Trading Requests Worker] Starting trading requests prices update...');

        // Получаем активные заявки (PENDING или APPROVED)
        const activeRequests = await TradingRequest.findAll({
            where: {
                status: {
                    [Op.in]: ['PENDING', 'APPROVED']
                },
                expiresAt: {
                    [Op.gt]: new Date()
                }
            },
            attributes: ['id', 'figi', 'ticker', 'name', 'action', 'priceAtRequest', 'quantity', 'status', 'confidence']
        });

        if (activeRequests.length === 0) {
            console.log('⚠️ [Trading Requests Worker] No active trading requests found');
            parentPort.postMessage({
                type: 'done',
                data: {
                    success: true,
                    message: 'No active trading requests to update',
                    totalUpdated: 0,
                    totalFailed: 0,
                    readyToExecute: [],
                    duration: Math.round((Date.now() - startTime) / 1000)
                }
            });
            return;
        }

        // Извлекаем уникальные FIGI
        const figis = [...new Set(activeRequests.map(r => r.figi).filter(f => f))];

        console.log(`📋 [Trading Requests Worker] Updating prices for ${figis.length} instruments with ${activeRequests.length} active requests...`);

        // Оптимизация: загружаем актуальные статусы всех заявок одним запросом вместо N+1
        // Создаем Map для быстрого доступа к статусам по ID заявки
        const requestIds = activeRequests.map(r => r.id);
        const freshStatuses = await TradingRequest.findAll({
            where: {
                id: {
                    [Op.in]: requestIds
                }
            },
            attributes: ['id', 'status']
        });
        
        // Создаем Map для O(1) доступа к статусам
        const statusMap = new Map();
        for (const fresh of freshStatuses) {
            statusMap.set(fresh.id, fresh.status);
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

                // Создаем мапу цен для быстрого доступа
                const priceMap = {};
                for (const priceData of lastPrices) {
                    if (priceData.figi && priceData.price) {
                        const units = parseFloat(priceData.price.units || 0);
                        const nano = parseFloat(priceData.price.nano || 0);
                        priceMap[priceData.figi] = units + nano / 1e9;
                    }
                }

                // Обновляем цены в БД и проверяем условия исполнения
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

                        // Обновляем цену в БД
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

                        // Проверяем условия исполнения для всех заявок этого инструмента
                        const requestsForFigi = activeRequests.filter(r => r.figi === priceData.figi);
                        for (const request of requestsForFigi) {
                            // Получаем актуальный статус из Map (O(1) вместо запроса к БД)
                            const currentStatus = statusMap.get(request.id);
                            
                            // Пропускаем уже исполненные, отклоненные или отмененные заявки
                            // Используем актуальный статус из Map, если доступен, иначе используем статус из загруженных данных
                            const effectiveStatus = currentStatus || request.status;
                            if (['EXECUTED', 'REJECTED', 'CANCELLED'].includes(effectiveStatus)) {
                                continue;
                            }

                            const priceDiff = Math.abs(priceValue - request.priceAtRequest);
                            const priceDiffPercent = (priceDiff / request.priceAtRequest) * 100;
                            
                            // Проверяем, достигнута ли цена заявки (в пределах 1%)
                            const isPriceReached = priceDiffPercent <= 1.0;
                            
                            // Проверяем, приближается ли цена к цене заявки (в пределах 2%)
                            const isPriceApproaching = priceDiffPercent <= 2.0 && priceDiffPercent > 1.0;

                            if (isPriceReached || isPriceApproaching) {
                                readyToExecute.push({
                                    requestId: request.id,
                                    figi: request.figi,
                                    ticker: request.ticker,
                                    name: request.name,
                                    action: request.action,
                                    priceAtRequest: request.priceAtRequest,
                                    currentPrice: priceValue,
                                    priceDiff,
                                    priceDiffPercent,
                                    isPriceReached,
                                    isPriceApproaching,
                                    quantity: request.quantity,
                                    status: effectiveStatus, // Используем актуальный статус из Map
                                    confidence: request.confidence
                                });
                            }
                        }
                    } catch (updateError) {
                        console.error(`❌ [Trading Requests Worker] Error updating price for ${priceData.figi}:`, updateError.message);
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
                        failed: totalFailed,
                        readyToExecute: readyToExecute.length
                    }
                });

                // Небольшая задержка между батчами
                if (batchIndex < batches.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            } catch (batchError) {
                console.error(`❌ [Trading Requests Worker] Error processing batch ${batchIndex + 1}:`, batchError.message);
                totalFailed += batch.length;
            }
        }

        const duration = Math.round((Date.now() - startTime) / 1000);

        // Отправляем результат
        parentPort.postMessage({
            type: 'done',
            data: {
                success: true,
                message: `Trading requests prices update completed in ${duration}s`,
                totalUpdated,
                totalFailed,
                readyToExecute,
                duration,
                requestsCount: activeRequests.length
            }
        });

    } catch (error) {
        console.error('❌ [Trading Requests Worker] Trading requests prices update failed:', error);
        
        parentPort.postMessage({
            type: 'error',
            data: {
                error: error.message,
                success: false
            }
        });
    }
}

// Запускаем обновление цен активных заявок
performTradingRequestsPricesUpdate();

