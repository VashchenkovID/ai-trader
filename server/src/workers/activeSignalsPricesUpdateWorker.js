import { parentPort, workerData } from 'worker_threads';
import TinkoffApiService from '../services/TinkoffApiService.js';
import CachedInstrument from '../models/CachedInstrument.js';
import CachedSignal from '../models/CachedSignal.js';
import { Op } from 'sequelize';
import ServiceManager from '../services/ServiceManager.js';
import { setGlobalServiceManager } from '../services/GlobalServiceManager.js';
// Импортируем ServiceInitializationTracker динамически, чтобы избежать проблем с инициализацией в worker'е
let ServiceInitializationTracker = null;

// Устанавливаем флаг воркера
process.env.WORKER = 'true';

async function performActiveSignalsPricesUpdate() {
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
                    service: 'activeSignalsPricesUpdateWorker',
                    operation: 'performActiveSignalsPricesUpdate',
                    error: { message: trackerError.message }
                });
            }
        }
        
        if (!isServiceManagerGlobal && !ServiceManager.isInitialized) {
            const LoggerService = (await import('../services/LoggerService.js')).default;
            if (LoggerService && LoggerService.isInitialized) {
                LoggerService.info('ServiceManager not initialized globally, initializing in worker', {
                    service: 'activeSignalsPricesUpdateWorker',
                    operation: 'performActiveSignalsPricesUpdate'
                });
            } else {
                console.log('🔧 [Active Signals Worker] ServiceManager not initialized globally, initializing in worker...');
            }
            await ServiceManager.initialize();
        } else if (isServiceManagerGlobal) {
            const LoggerService = (await import('../services/LoggerService.js')).default;
            if (LoggerService && LoggerService.isInitialized) {
                LoggerService.info('ServiceManager already initialized globally, skipping full initialization', {
                    service: 'activeSignalsPricesUpdateWorker',
                    operation: 'performActiveSignalsPricesUpdate'
                });
            } else {
                console.log('ℹ️ [Active Signals Worker] ServiceManager already initialized globally, skipping full initialization');
            }
        }

        const startTime = Date.now();
        let totalUpdated = 0;
        let totalFailed = 0;
        const triggeredSignals = [];

        const LoggerService = (await import('../services/LoggerService.js')).default;
        if (LoggerService && LoggerService.isInitialized) {
            LoggerService.info('Starting active signals prices update', {
                service: 'activeSignalsPricesUpdateWorker',
                operation: 'performActiveSignalsPricesUpdate'
            });
        } else {
            console.log('📊 [Active Signals Worker] Starting active signals prices update...');
        }

        // Получаем активные сигналы (endDt > now)
        const now = new Date();
        const activeSignals = await CachedSignal.findAll({
            where: {
                endDt: {
                    [Op.gt]: now
                },
                figi: {
                    [Op.ne]: null
                }
            },
            attributes: ['id', 'figi', 'signalId', 'strategyName', 'direction', 'targetPrice', 'stoploss', 'initialPrice', 'name']
        });

        if (activeSignals.length === 0) {
            if (LoggerService && LoggerService.isInitialized) {
                LoggerService.info('No active signals found', {
                    service: 'activeSignalsPricesUpdateWorker',
                    operation: 'performActiveSignalsPricesUpdate'
                });
            } else {
                console.log('⚠️ [Active Signals Worker] No active signals found');
            }
            parentPort.postMessage({
                type: 'done',
                data: {
                    success: true,
                    message: 'No active signals to update',
                    totalUpdated: 0,
                    totalFailed: 0,
                    triggeredSignals: [],
                    duration: Math.round((Date.now() - startTime) / 1000)
                }
            });
            return;
        }

        // Извлекаем уникальные FIGI
        const figis = [...new Set(activeSignals.map(s => s.figi).filter(f => f))];

        if (LoggerService && LoggerService.isInitialized) {
            LoggerService.info('Updating prices for instruments', {
                service: 'activeSignalsPricesUpdateWorker',
                operation: 'performActiveSignalsPricesUpdate',
                instrumentsCount: figis.length,
                signalsCount: activeSignals.length
            });
        } else {
            console.log(`📊 [Active Signals Worker] Updating prices for ${figis.length} instruments with ${activeSignals.length} active signals...`);
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

                // Обновляем цены в БД и проверяем достижение целей
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

                        // Проверяем достижение целей для всех сигналов этого инструмента
                        const signalsForFigi = activeSignals.filter(s => s.figi === priceData.figi);
                        for (const signal of signalsForFigi) {
                            // Конвертируем targetPrice и stoploss из JSONB
                            let targetPrice = null;
                            let stoploss = null;
                            
                            if (signal.targetPrice) {
                                if (typeof signal.targetPrice === 'object' && signal.targetPrice.units !== undefined) {
                                    targetPrice = parseFloat(signal.targetPrice.units || 0) + parseFloat(signal.targetPrice.nano || 0) / 1e9;
                                } else if (typeof signal.targetPrice === 'number') {
                                    targetPrice = signal.targetPrice;
                                }
                            }
                            
                            if (signal.stoploss) {
                                if (typeof signal.stoploss === 'object' && signal.stoploss.units !== undefined) {
                                    stoploss = parseFloat(signal.stoploss.units || 0) + parseFloat(signal.stoploss.nano || 0) / 1e9;
                                } else if (typeof signal.stoploss === 'number') {
                                    stoploss = signal.stoploss;
                                }
                            }

                            // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Валидация данных сигнала перед проверкой срабатывания
                            // Для BUY сигналов: targetPrice должна быть выше initialPrice (иначе сигнал некорректен)
                            // Для SELL сигналов: targetPrice должна быть ниже initialPrice (иначе сигнал некорректен)
                            let initialPrice = null;
                            if (signal.initialPrice) {
                                if (typeof signal.initialPrice === 'object' && signal.initialPrice.units !== undefined) {
                                    initialPrice = parseFloat(signal.initialPrice.units || 0) + parseFloat(signal.initialPrice.nano || 0) / 1e9;
                                } else if (typeof signal.initialPrice === 'number') {
                                    initialPrice = signal.initialPrice;
                                }
                            }

                            // Проверяем корректность данных сигнала
                            let signalDataValid = true;
                            if (signal.direction === 'SIGNAL_DIRECTION_BUY') {
                                // Для BUY: targetPrice должна быть выше initialPrice
                                if (targetPrice && initialPrice && targetPrice <= initialPrice) {
                                    if (LoggerService && LoggerService.isInitialized) {
                                        LoggerService.warn('Invalid BUY signal', {
                                            service: 'activeSignalsPricesUpdateWorker',
                                            operation: 'performActiveSignalsPricesUpdate',
                                            signalId: signal.signalId,
                                            targetPrice,
                                            initialPrice
                                        });
                                    } else {
                                        console.warn(`⚠️ [Active Signals Worker] Invalid BUY signal ${signal.signalId}: targetPrice (${targetPrice}) <= initialPrice (${initialPrice}). Skipping trigger check.`);
                                    }
                                    signalDataValid = false;
                                }
                                // Также проверяем, что targetPrice не слишком низкая (меньше текущей цены более чем на 50%)
                                if (targetPrice && priceValue && targetPrice < priceValue * 0.5) {
                                    if (LoggerService && LoggerService.isInitialized) {
                                        LoggerService.warn('Suspicious BUY signal', {
                                            service: 'activeSignalsPricesUpdateWorker',
                                            operation: 'performActiveSignalsPricesUpdate',
                                            signalId: signal.signalId,
                                            targetPrice,
                                            currentPrice: priceValue
                                        });
                                    } else {
                                        console.warn(`⚠️ [Active Signals Worker] Suspicious BUY signal ${signal.signalId}: targetPrice (${targetPrice}) is much lower than current price (${priceValue}). Signal may be corrupted. Skipping trigger check.`);
                                    }
                                    signalDataValid = false;
                                }
                            } else if (signal.direction === 'SIGNAL_DIRECTION_SELL') {
                                // Для SELL: targetPrice должна быть ниже initialPrice
                                if (targetPrice && initialPrice && targetPrice >= initialPrice) {
                                    if (LoggerService && LoggerService.isInitialized) {
                                        LoggerService.warn('Invalid SELL signal', {
                                            service: 'activeSignalsPricesUpdateWorker',
                                            operation: 'performActiveSignalsPricesUpdate',
                                            signalId: signal.signalId,
                                            targetPrice,
                                            initialPrice
                                        });
                                    } else {
                                        console.warn(`⚠️ [Active Signals Worker] Invalid SELL signal ${signal.signalId}: targetPrice (${targetPrice}) >= initialPrice (${initialPrice}). Skipping trigger check.`);
                                    }
                                    signalDataValid = false;
                                }
                                // Также проверяем, что targetPrice не слишком высокая (больше текущей цены более чем на 50%)
                                if (targetPrice && priceValue && targetPrice > priceValue * 1.5) {
                                    if (LoggerService && LoggerService.isInitialized) {
                                        LoggerService.warn('Suspicious SELL signal', {
                                            service: 'activeSignalsPricesUpdateWorker',
                                            operation: 'performActiveSignalsPricesUpdate',
                                            signalId: signal.signalId,
                                            targetPrice,
                                            currentPrice: priceValue
                                        });
                                    } else {
                                        console.warn(`⚠️ [Active Signals Worker] Suspicious SELL signal ${signal.signalId}: targetPrice (${targetPrice}) is much higher than current price (${priceValue}). Signal may be corrupted. Skipping trigger check.`);
                                    }
                                    signalDataValid = false;
                                }
                            }

                            // Пропускаем проверку срабатывания, если данные некорректны
                            if (!signalDataValid) {
                                continue;
                            }

                            // Проверяем достижение целей
                            let triggered = false;
                            let triggerType = null;
                            
                            if (signal.direction === 'SIGNAL_DIRECTION_BUY') {
                                // Для BUY сигналов: достигли targetPrice (вверх) или stoploss (вниз)
                                if (targetPrice && priceValue >= targetPrice) {
                                    triggered = true;
                                    triggerType = 'target_reached';
                                } else if (stoploss && priceValue <= stoploss) {
                                    triggered = true;
                                    triggerType = 'stoploss_triggered';
                                }
                            } else if (signal.direction === 'SIGNAL_DIRECTION_SELL') {
                                // Для SELL сигналов: достигли targetPrice (вниз) или stoploss (вверх)
                                if (targetPrice && priceValue <= targetPrice) {
                                    triggered = true;
                                    triggerType = 'target_reached';
                                } else if (stoploss && priceValue >= stoploss) {
                                    triggered = true;
                                    triggerType = 'stoploss_triggered';
                                }
                            }

                            if (triggered) {
                                triggeredSignals.push({
                                    signalId: signal.signalId,
                                    figi: signal.figi,
                                    strategyName: signal.strategyName,
                                    direction: signal.direction,
                                    name: signal.name,
                                    currentPrice: priceValue,
                                    targetPrice,
                                    stoploss,
                                    triggerType
                                });
                            }
                        }
                    } catch (updateError) {
                        if (LoggerService && LoggerService.isInitialized) {
                            LoggerService.error('Error updating price', {
                                service: 'activeSignalsPricesUpdateWorker',
                                operation: 'performActiveSignalsPricesUpdate',
                                figi: priceData.figi,
                                error: { message: updateError.message }
                            });
                        } else {
                            console.error(`❌ [Active Signals Worker] Error updating price for ${priceData.figi}:`, updateError.message);
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
                        failed: totalFailed,
                        triggeredSignals: triggeredSignals.length
                    }
                });

                // Небольшая задержка между батчами
                if (batchIndex < batches.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            } catch (batchError) {
                if (LoggerService && LoggerService.isInitialized) {
                    LoggerService.error('Error processing batch', {
                        service: 'activeSignalsPricesUpdateWorker',
                        operation: 'performActiveSignalsPricesUpdate',
                        batchIndex: batchIndex + 1,
                        error: { message: batchError.message }
                    });
                } else {
                    console.error(`❌ [Active Signals Worker] Error processing batch ${batchIndex + 1}:`, batchError.message);
                }
                totalFailed += batch.length;
            }
        }

        const duration = Math.round((Date.now() - startTime) / 1000);
        if (LoggerService && LoggerService.isInitialized) {
            LoggerService.info('Active signals prices update completed', {
                service: 'activeSignalsPricesUpdateWorker',
                operation: 'performActiveSignalsPricesUpdate',
                duration,
                totalUpdated,
                totalFailed,
                triggeredCount: triggeredSignals.length
            });
        } else {
            console.log(`✅ [Active Signals Worker] Active signals prices update completed in ${duration}s. Updated: ${totalUpdated}, Failed: ${totalFailed}, Triggered: ${triggeredSignals.length}`);
        }

        // Отправляем результат
        parentPort.postMessage({
            type: 'done',
            data: {
                success: true,
                message: `Active signals prices update completed in ${duration}s`,
                totalUpdated,
                totalFailed,
                triggeredSignals,
                duration,
                signalsCount: activeSignals.length
            }
        });

    } catch (error) {
        const LoggerService = (await import('../services/LoggerService.js')).default;
        if (LoggerService && LoggerService.isInitialized) {
            LoggerService.error('Active signals prices update failed', {
                service: 'activeSignalsPricesUpdateWorker',
                operation: 'performActiveSignalsPricesUpdate',
                error: { message: error.message, stack: error.stack }
            });
        } else {
            console.error('❌ [Active Signals Worker] Active signals prices update failed:', error);
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

// Запускаем обновление цен активных сигналов
performActiveSignalsPricesUpdate();

