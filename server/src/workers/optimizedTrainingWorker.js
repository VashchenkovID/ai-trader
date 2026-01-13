import { parentPort, workerData } from 'worker_threads';
import { Worker } from 'worker_threads';
import { join } from 'path';

// Получаем сервисы из workerData или импортируем их
const { OptimizedDataService, CacheService } = workerData?.services || {};

async function run() {
    try {
        const { mode, payload } = workerData || {};
        
        if (mode === 'single') {
            // Одиночное обучение
            const { figi, options } = payload || {};
            
            const standaloneWorkerPath = join(__dirname, 'standaloneTrainingWorker.js');
            const worker = new Worker(standaloneWorkerPath);
            
            worker.postMessage({
                type: 'train',
                data: { figi, options }
            });
            
            worker.on('message', (msg) => {
                if (msg.type === 'training_complete') {
                    parentPort.postMessage({ type: 'done', data: msg.data });
                    worker.terminate();
                } else if (msg.type === 'training_error') {
                    parentPort.postMessage({ type: 'error', data: { error: msg.data.error } });
                    worker.terminate();
                }
            });
            
            worker.on('error', (error) => {
                parentPort.postMessage({ type: 'error', data: { error: error.message } });
                worker.terminate();
            });
            
        } else if (mode === 'batch') {
            // Пакетное обучение
            const { instruments, options } = payload || {};
            const results = [];
            let successCount = 0;
            let failCount = 0;
            
            for (const instrument of instruments) {
                try {
                    // Определяем тип обучения и выбираем соответствующий воркер
                    let workerPath, workerData;
                    
                    if (payload.trainingType === 'rl') {
                        // RL обучение
                        workerPath = join(__dirname, 'rlTrainingWorker.js');
                        workerData = { figi: instrument.figi, options: instrument.options || {} };
                        
                        const worker = new Worker(workerPath, { workerData });
                        
                        // Ждем завершения RL обучения
                        const result = await new Promise((resolve, reject) => {
                            worker.on('message', (msg) => {
                                if (msg.type === 'done') {
                                    resolve({
                                        figi: instrument.figi,
                                        ticker: instrument.ticker,
                                        success: true,
                                        result: msg.data
                                    });
                                } else if (msg.type === 'error') {
                                    reject(new Error(msg.data.error || msg.data));
                                }
                            });
                            
                            worker.on('error', reject);
                            worker.on('exit', (code) => {
                                if (code !== 0) {
                                    reject(new Error(`Worker stopped with exit code ${code}`));
                                }
                            });
                        });
                        
                        results.push(result);
                        successCount++;
                        continue;
                    } else {
                        // Обычное обучение нейросети
                        workerPath = join(__dirname, 'standaloneTrainingWorker.js');
                        workerData = null; // standalone worker не использует workerData
                        
                        const worker = new Worker(workerPath, workerData ? { workerData } : {});
                        
                        // Получаем данные для обучения из основного процесса
                        const { figi, ticker, epochs = 50, batchSize = 16 } = instrument;
                        
                        // Используем переданные сервисы или импортируем их
                        let dataService = OptimizedDataService;
                        let cacheService = CacheService;
                        
                        if (!dataService || !cacheService) {
                            const { default: ImportedDataService } = await import('../services/OptimizedDataService.js');
                            const { default: ImportedCacheService } = await import('../services/CacheService.js');
                            dataService = ImportedDataService;
                            cacheService = ImportedCacheService;
                        }
                        
                        // Получаем данные для обучения
                        let trainingData;
                        try {
                            // Получаем свечи
                            const candles = await cacheService.getCandles(figi, 'DAY', 30);
                            if (candles.length < 10) {
                                throw new Error(`Insufficient data: ${candles.length} candles`);
                            }
                            
                            // Подготавливаем данные
                            trainingData = await dataService.prepareTrainingData(
                                candles,
                                10, // lookback
                                1,  // horizon
                                figi
                            );
                        } catch (dataError) {
                            console.warn(`⚠️ Failed to get training data for ${figi || ticker}:`, dataError.message);
                            results.push({
                                figi: figi,
                                ticker: ticker,
                                success: false,
                                error: `Failed to get training data: ${dataError.message}`
                            });
                            failCount++;
                            continue;
                        }
                        
                        const { features, labels } = trainingData;
                        
                        if (!features || !labels || features.length === 0) {
                            results.push({
                                figi: figi,
                                ticker: ticker,
                                success: false,
                                error: 'No training data available'
                            });
                            failCount++;
                            continue;
                        }
                        
                        worker.postMessage({
                            type: 'train',
                            data: { features, labels, epochs, batchSize }
                        });
                        
                        // Ждем завершения обучения
                        const result = await new Promise((resolve, reject) => {
                            worker.on('message', (msg) => {
                                if (msg.type === 'training_complete' || msg.type === 'done') {
                                    resolve({
                                        figi: instrument.figi,
                                        ticker: instrument.ticker,
                                        success: true,
                                        result: msg.data
                                    });
                                } else if (msg.type === 'training_error' || msg.type === 'error') {
                                    reject(new Error(msg.data.error || msg.data));
                                }
                            });
                            
                            worker.on('error', (error) => {
                                reject(error);
                            });
                            
                            // Таймаут для обучения (5 минут)
                            setTimeout(() => {
                                worker.terminate();
                                reject(new Error('Training timeout'));
                            }, 5 * 60 * 1000);
                        });
                        
                        results.push(result);
                        successCount++;
                        
                        worker.terminate();
                    }
                    
                } catch (error) {
                    try {
                        const LoggerService = (await import('../services/LoggerService.js')).default;
                        if (LoggerService && LoggerService.isInitialized) {
                            LoggerService.error('Training failed in optimized training worker', {
                                service: 'OptimizedTrainingWorker',
                                operation: 'run',
                                figi: instrument.figi || instrument.ticker,
                                error: { message: error.message, stack: error.stack }
                            });
                        }
                    } catch {
                        // LoggerService недоступен в воркере, игнорируем
                    }
                    
                    // Отправляем алерт в Telegram об ошибке обучения
                    try {
                        const OptimizedTelegramService = (await import('../services/OptimizedTelegramService.js')).default;
                        await OptimizedTelegramService.sendAlert(
                            'WORKER_TRAINING_ERROR',
                            `❌ <b>ОШИБКА ОБУЧЕНИЯ В ВОРКЕРЕ</b>\n\n📈 Инструмент: <b>${instrument.figi || instrument.ticker}</b>\n🔍 Ошибка: ${error.message}\n⏰ Время: ${new Date().toLocaleString('ru-RU')}`,
                            'error'
                        );
                    } catch (telegramError) {
                        try {
                            const LoggerService = (await import('../services/LoggerService.js')).default;
                            if (LoggerService && LoggerService.isInitialized) {
                                LoggerService.error('Failed to send worker training error alert', {
                                    service: 'OptimizedTrainingWorker',
                                    operation: 'run',
                                    error: { message: telegramError.message }
                                });
                            }
                        } catch {
                            // LoggerService недоступен в воркере, игнорируем
                        }
                    }
                    
                    results.push({
                        figi: instrument.figi,
                        ticker: instrument.ticker,
                        success: false,
                        error: error.message
                    });
                    failCount++;
                }
            }
            
            
            parentPort.postMessage({ 
                type: 'done', 
                data: { 
                    success: true,
                    results,
                    summary: {
                        total: instruments.length,
                        success: successCount,
                        failed: failCount
                    }
                } 
            });
        }
        
    } catch (error) {
        try {
            const LoggerService = (await import('../services/LoggerService.js')).default;
            if (LoggerService && LoggerService.isInitialized) {
                LoggerService.error('Optimized training worker error', {
                    service: 'OptimizedTrainingWorker',
                    operation: 'run',
                    error: { message: error.message, stack: error.stack }
                });
            }
        } catch {
            // LoggerService недоступен в воркере, игнорируем
        }
        parentPort.postMessage({ type: 'error', data: { error: error.message } });
    }
}

run();