import { parentPort, workerData } from 'worker_threads';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Устанавливаем флаг воркера
process.env.WORKER = 'true';

// Получаем начальные данные из workerData
const initialData = workerData || {};

/**
 * Worker для генерации недельных прогнозов
 * Генерация происходит в отдельном потоке, чтобы не блокировать основной event loop
 */
async function generateForecastsForInstruments(instruments, options = {}) {
    const {
        maxInstruments = 100,
        historicalDays = 90,
        includeMacro = true,
        includeNews = true
    } = options;

    // Динамический импорт сервисов
    const WeeklyForecastService = (await import('../services/WeeklyForecastService.js')).default;
    const CacheService = (await import('../services/CacheService.js')).default;
    const LoggerService = (await import('../services/LoggerService.js')).default;

    // Убеждаемся, что сервисы инициализированы
    if (!WeeklyForecastService.isInitialized) {
        await WeeklyForecastService.initialize();
    }

    if (!CacheService.isInitialized) {
        await CacheService.initialize();
    }

    const results = {
        success: [],
        failed: [],
        skipped: [],
        total: Math.min(instruments.length, maxInstruments)
    };

    const instrumentsToProcess = instruments.slice(0, maxInstruments);

    for (let i = 0; i < instrumentsToProcess.length; i++) {
        const instrument = instrumentsToProcess[i];
        
        try {
            // Отправляем прогресс
            if (parentPort) {
                parentPort.postMessage({
                    type: 'progress',
                    data: {
                        current: i + 1,
                        total: instrumentsToProcess.length,
                        figi: instrument.figi,
                        ticker: instrument.ticker,
                        stage: 'generating'
                    }
                });
            }

            // Проверяем, есть ли уже свежий прогноз
            const activeForecast = await WeeklyForecastService.getActiveForecast(instrument.figi);
            if (activeForecast && WeeklyForecastService.isForecastFresh(activeForecast)) {
                results.skipped.push({
                    figi: instrument.figi,
                    ticker: instrument.ticker,
                    reason: 'fresh_forecast_exists'
                });
                continue;
            }

            // Генерируем новый прогноз
            const result = await WeeklyForecastService.generateForecast(instrument.figi, {
                forceRegenerate: false,
                historicalDays,
                includeMacro,
                includeNews
            });

            if (result.success) {
                results.success.push({
                    figi: instrument.figi,
                    ticker: instrument.ticker,
                    forecastId: result.forecast?.id,
                    cached: result.cached || false
                });
            } else {
                results.failed.push({
                    figi: instrument.figi,
                    ticker: instrument.ticker,
                    reason: result.reason || 'unknown_error'
                });
            }
        } catch (error) {
            results.failed.push({
                figi: instrument.figi,
                ticker: instrument.ticker,
                error: error.message,
                reason: 'exception'
            });

            if (LoggerService.isInitialized) {
                LoggerService.error('Error generating forecast in worker', {
                    service: 'WeeklyForecastGenerationWorker',
                    operation: 'generateForecast',
                    figi: instrument.figi,
                    ticker: instrument.ticker,
                    error: { message: error.message, stack: error.stack }
                });
            }
        }

        // Небольшая задержка между инструментами для снижения нагрузки
        if (i < instrumentsToProcess.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    return results;
}

// Обработка сообщений от основного процесса
if (parentPort) {
    // Если данные уже есть в workerData, запускаем сразу
    if (initialData && initialData.instruments && Array.isArray(initialData.instruments)) {
        (async () => {
            try {
                // Отправляем начальный прогресс
                parentPort.postMessage({
                    type: 'progress',
                    data: {
                        current: 0,
                        total: initialData.instruments.length,
                        stage: 'starting',
                        progress: 0
                    }
                });

                const results = await generateForecastsForInstruments(initialData.instruments, initialData.options);
                
                // Отправляем результаты
                parentPort.postMessage({
                    type: 'done',
                    message: `Генерация завершена: успешно ${results.success.length}, ошибок ${results.failed.length}, пропущено ${results.skipped.length}`,
                    data: results,
                    totalUpdated: results.success.length
                });
            } catch (error) {
                parentPort.postMessage({
                    type: 'error',
                    data: { 
                        error: error.message, 
                        stack: error.stack 
                    }
                });
            }
        })();
    }
    
    parentPort.on('message', async (message) => {
        try {
            // Данные могут быть переданы через message
            const instruments = message.instruments || (message.data && message.data.instruments);
            const options = message.options || (message.data && message.data.options);
            
            if (instruments && Array.isArray(instruments)) {
                // Отправляем начальный прогресс
                parentPort.postMessage({
                    type: 'progress',
                    data: {
                        current: 0,
                        total: instruments.length,
                        stage: 'starting',
                        progress: 0
                    }
                });

                const results = await generateForecastsForInstruments(instruments, options);
                
                // Отправляем результаты (waitForWorkerCompletion ожидает тип 'done')
                parentPort.postMessage({
                    type: 'done',
                    message: `Генерация завершена: успешно ${results.success.length}, ошибок ${results.failed.length}, пропущено ${results.skipped.length}`,
                    data: results,
                    totalUpdated: results.success.length
                });
            } else {
                // Обработка других типов сообщений
                switch (message.type) {
                    case 'ping':
                        parentPort.postMessage({
                            type: 'pong',
                            data: { timestamp: Date.now() }
                        });
                        break;
                        
                    default:
                        parentPort.postMessage({
                            type: 'error',
                            data: { error: `Unknown message format or missing instruments` }
                        });
                }
            }
        } catch (error) {
            parentPort.postMessage({
                type: 'error',
                data: { 
                    error: error.message, 
                    stack: error.stack 
                }
            });
        }
    });
}

// Обработка завершения процесса
process.on('exit', () => {
    // Cleanup если нужно
});

// Обработка ошибок
process.on('unhandledRejection', (error) => {
    if (parentPort) {
        parentPort.postMessage({
            type: 'error',
            data: { 
                error: `Unhandled rejection: ${error.message}`,
                stack: error.stack
            }
        });
    }
    process.exit(1);
});

process.on('uncaughtException', (error) => {
    if (parentPort) {
        parentPort.postMessage({
            type: 'error',
            data: { 
                error: `Uncaught exception: ${error.message}`,
                stack: error.stack
            }
        });
    }
    process.exit(1);
});

