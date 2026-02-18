import * as tf from '@tensorflow/tfjs';
import LoggerService from '../../services/LoggerService.js';
import CacheService from '../../services/CacheService.js';
import WeeklyForecastService from '../../services/WeeklyForecastService.js';
import WeeklyForecastModelService from '../../services/WeeklyForecastModelService.js';

/**
 * Утилиты для обучения моделей Weekly Forecast
 */

// Флаг блокировки быстрого обучения во время полного обучения
let _isFullWeeklyForecastTrainingActive = false;

/**
 * Обучает модель Weekly Forecast для указанного инструмента
 * @param {string} figi - FIGI инструмента
 * @param {Object} options - Опции обучения
 * @param {number} options.historicalDays - Количество дней исторических данных (по умолчанию: 365)
 * @param {number} options.lookbackDays - Количество дней для lookback (по умолчанию: 60)
 * @param {number} options.forecastDays - Количество дней прогноза (по умолчанию: 7)
 * @param {number} options.epochs - Количество эпох обучения (по умолчанию: 50)
 * @param {number} options.batchSize - Размер батча (по умолчанию: 16)
 * @returns {Promise<Object>} Результат обучения
 */
export async function trainWeeklyForecastModel(figi, options = {}) {
    const {
        historicalDays = 365,
        lookbackDays = 60,
        forecastDays = 7,
        epochs = 50,
        batchSize = 16
    } = options;

    try {
        if (!figi || typeof figi !== 'string') {
            throw new Error('FIGI is required and must be a string');
        }

        if (LoggerService.isInitialized) {
            LoggerService.info('Starting Weekly Forecast model training', {
                service: 'WeeklyForecastTrainingUtils',
                operation: 'trainWeeklyForecastModel',
                figi,
                historicalDays,
                lookbackDays,
                forecastDays,
                epochs,
                batchSize
            });
        }

        // 1. Получаем инструмент
        const instrument = await CacheService.getInstrument(figi, true);
        if (!instrument) {
            throw new Error(`Instrument not found: ${figi}`);
        }

        // 2. Получаем исторические данные
        const candles = await CacheService.getCandles(figi, 'DAY', historicalDays, true);
        const minimumRequired = lookbackDays + forecastDays;
        
        // Адаптивные параметры, если данных недостаточно
        let actualLookbackDays = lookbackDays;
        let actualForecastDays = forecastDays;
        let adaptiveMode = false;
        
        if (candles.length < minimumRequired) {
            // Пытаемся адаптировать параметры под доступные данные
            // Минимум: хотя бы 10 дней для lookback и 3 дня для forecast
            const minLookback = 10;
            const minForecast = 3;
            const minTotal = minLookback + minForecast;
            
            if (candles.length < minTotal) {
                // Данных слишком мало даже для минимального обучения
                const error = new Error(`Insufficient historical data: ${candles.length} candles (minimum ${minTotal} for adaptive training, ${minimumRequired} for standard)`);
                error.code = 'INSUFFICIENT_DATA';
                throw error;
            }
            
            // Адаптируем параметры: используем доступные данные оптимально
            // Важно: нужно оставить место для создания хотя бы одной последовательности
            // Цикл в prepareTrainingData: for (let i = lookbackDays; i < candles.length - forecastDays; i++)
            // Для создания хотя бы одной последовательности нужно: lookbackDays < candles.length - forecastDays
            // То есть: lookbackDays + forecastDays < candles.length
            
            // Сначала определяем forecast (минимум 3, максимум 20% от данных)
            actualForecastDays = Math.max(minForecast, Math.min(forecastDays, Math.floor(candles.length * 0.2)));
            
            // Затем определяем lookback так, чтобы осталось место для хотя бы одной последовательности
            // Нужно: lookbackDays < candles.length - forecastDays
            // Оставляем минимум 1 день для создания последовательности
            const maxLookback = candles.length - actualForecastDays - 1;
            actualLookbackDays = Math.max(minLookback, Math.min(lookbackDays, maxLookback));
            
            // Если после адаптации все еще недостаточно места, уменьшаем forecast
            if (actualLookbackDays + actualForecastDays >= candles.length) {
                actualForecastDays = Math.max(minForecast, candles.length - actualLookbackDays - 1);
            }
            
            // Финальная проверка: должно быть место для хотя бы одной последовательности
            if (actualLookbackDays >= candles.length - actualForecastDays) {
                // Если все еще нет места, делаем минимальные параметры
                actualForecastDays = minForecast;
                actualLookbackDays = Math.max(minLookback, candles.length - actualForecastDays - 1);
            }
            
            adaptiveMode = true;
            
            if (LoggerService.isInitialized) {
                LoggerService.warn('Using adaptive training parameters due to insufficient data', {
                    service: 'WeeklyForecastTrainingUtils',
                    operation: 'trainWeeklyForecastModel',
                    figi,
                    availableCandles: candles.length,
                    originalLookback: lookbackDays,
                    originalForecast: forecastDays,
                    adaptiveLookback: actualLookbackDays,
                    adaptiveForecast: actualForecastDays
                });
            }
        }

        // 3. Подготавливаем features
        const features = await WeeklyForecastService.prepareForecastFeatures(figi, candles, {
            includeMacro: true,
            includeNews: true
        });

        // 4. Проверяем, что будет создана хотя бы одна последовательность
        // Цикл в prepareTrainingData: for (let i = lookbackDays; i < candles.length - forecastDays; i++)
        // Для создания последовательностей нужно: lookbackDays < candles.length - forecastDays
        const minCandlesForSequence = actualLookbackDays + actualForecastDays + 1;
        if (candles.length < minCandlesForSequence) {
            const error = new Error(`Insufficient data for sequence generation: ${candles.length} candles (need at least ${minCandlesForSequence} for lookback=${actualLookbackDays}, forecast=${actualForecastDays})`);
            error.code = 'INSUFFICIENT_DATA';
            throw error;
        }
        
        // 5. Подготавливаем данные для обучения (используем адаптивные параметры, если применимо)
        let sequences, targets;
        try {
            const trainingData = WeeklyForecastModelService.prepareTrainingData(
            candles,
            features,
                actualLookbackDays,
                actualForecastDays
        );
            sequences = trainingData.sequences;
            targets = trainingData.targets;
        } catch (error) {
            // Если prepareTrainingData выбросил ошибку, это может быть из-за недостатка данных
            if (error.message.includes('Insufficient data') || error.message.includes('length mismatch')) {
                const adaptedError = new Error(`Failed to prepare training data: ${error.message}. Available: ${candles.length} candles, lookback: ${actualLookbackDays}, forecast: ${actualForecastDays}`);
                adaptedError.code = 'INSUFFICIENT_DATA';
                throw adaptedError;
            }
            throw error;
        }

        if (sequences.length === 0) {
            const error = new Error(`No training sequences generated: ${candles.length} candles, lookback=${actualLookbackDays}, forecast=${actualForecastDays}. Need at least ${actualLookbackDays + actualForecastDays + 1} candles for one sequence.`);
            error.code = 'INSUFFICIENT_DATA';
            throw error;
        }

        // 5. Создаем или загружаем модель
        const modelWrapper = await WeeklyForecastService.getOrCreateModel(figi, 'seq2seq');
        const model = modelWrapper.model;

        // 7. Обучаем модель через worker (не блокирует event loop)
        if (LoggerService.isInitialized) {
            LoggerService.info('Training model via worker', {
                service: 'WeeklyForecastTrainingUtils',
                operation: 'trainWeeklyForecastModel',
                figi,
                sequencesCount: sequences.length,
                epochs
            });
        }

        // Используем worker для обучения, чтобы не блокировать event loop
        // Worker создает и обучает модель в отдельном потоке, затем возвращает веса
        let history = await WeeklyForecastModelService.trainModelViaWorker(sequences, targets, {
            epochs,
            batchSize,
            validationSplit: 0.2,
            verbose: 0,
            figi, // Передаем figi для идентификации
            onProgress: (progress) => {
                // Можно добавить дополнительную обработку прогресса, если нужно
                if (LoggerService.isInitialized && progress.epoch % 10 === 0) {
                    LoggerService.info(`Training progress: epoch ${progress.epoch}/${progress.epochs}`, {
                        service: 'WeeklyForecastTrainingUtils',
                        operation: 'trainWeeklyForecastModel',
                        figi,
                        loss: progress.loss,
                        valLoss: progress.valLoss
                    });
                }
            }
        });
        
        // Проверяем, что history содержит необходимые данные
        if (!history || !history.history) {
            if (LoggerService.isInitialized) {
                LoggerService.warn('No history received from worker, training model directly', {
                    service: 'WeeklyForecastTrainingUtils',
                    operation: 'trainWeeklyForecastModel',
                    figi
                });
            }
            // Обучаем модель напрямую, если history не получен
            history = await WeeklyForecastModelService.trainModel(model, sequences, targets, {
                epochs,
                batchSize,
                validationSplit: 0.2,
                verbose: 0,
                figi
            });
        }
        
        // Применяем веса из worker'а к модели в основном процессе
        if (history.weights && history.weights.length > 0) {
            try {
                // Конвертируем веса обратно в тензоры и применяем к модели
                const weightTensors = history.weights.map(w => tf.tensor(w));
                model.setWeights(weightTensors);
                
                // Освобождаем память
                weightTensors.forEach(t => t.dispose());
                
                if (LoggerService.isInitialized) {
                    LoggerService.info('Model weights applied from worker', {
                        service: 'WeeklyForecastTrainingUtils',
                        operation: 'trainWeeklyForecastModel',
                        figi
                    });
                }
            } catch (weightError) {
                if (LoggerService.isInitialized) {
                    LoggerService.warn('Failed to apply weights from worker, training model directly', {
                        service: 'WeeklyForecastTrainingUtils',
                        operation: 'trainWeeklyForecastModel',
                        figi,
                        error: { message: weightError.message }
                    });
                }
                // Если не удалось применить веса, обучаем модель напрямую (блокирует event loop)
                const directHistory = await WeeklyForecastModelService.trainModel(model, sequences, targets, {
                    epochs: 1, // Одна эпоха для применения весов
                    batchSize,
                    validationSplit: 0,
                    verbose: 0,
                    figi
                });
                // Обновляем history, если получен новый
                if (directHistory && directHistory.history) {
                    history = directHistory;
                }
            }
        } else {
            // Если веса не получены, обучаем модель напрямую (блокирует event loop)
            if (LoggerService.isInitialized) {
                LoggerService.warn('No weights received from worker, training model directly', {
                    service: 'WeeklyForecastTrainingUtils',
                    operation: 'trainWeeklyForecastModel',
                    figi
                });
            }
            const directHistory = await WeeklyForecastModelService.trainModel(model, sequences, targets, {
                epochs,
                batchSize,
                validationSplit: 0.2,
                verbose: 0,
                figi
            });
            // Обновляем history, если получен новый
            if (directHistory && directHistory.history) {
                history = directHistory;
            }
        }

        // Проверяем, что history содержит необходимые данные для сохранения
        if (!history) {
            throw new Error('Training completed but no history received');
        }
        
        // Убеждаемся, что history.history существует
        if (!history.history) {
            // Если history не имеет структуры history, создаем минимальную структуру
            history.history = {
                loss: [],
                val_loss: []
            };
            if (LoggerService.isInitialized) {
                LoggerService.warn('History structure is incomplete, using empty arrays', {
                    service: 'WeeklyForecastTrainingUtils',
                    operation: 'trainWeeklyForecastModel',
                    figi,
                    historyKeys: Object.keys(history)
                });
            }
        }

        // 8. Сохраняем модель
        const modelVersion = WeeklyForecastService.generateModelVersion();
        const saveSuccess = await WeeklyForecastModelService.saveModel(model, figi, 'seq2seq', {
            version: modelVersion,
            trainedAt: new Date().toISOString(),
            epochs,
            batchSize,
            sequencesCount: sequences.length,
            historicalDays,
            lookbackDays: actualLookbackDays,
            forecastDays: actualForecastDays,
            adaptiveMode: adaptiveMode, // Флаг, что использовались адаптивные параметры
            originalLookbackDays: adaptiveMode ? lookbackDays : undefined,
            originalForecastDays: adaptiveMode ? forecastDays : undefined,
            finalLoss: (history.history.loss && Array.isArray(history.history.loss) && history.history.loss.length > 0) 
                ? history.history.loss[history.history.loss.length - 1] 
                : null,
            finalValLoss: (history.history.val_loss && Array.isArray(history.history.val_loss) && history.history.val_loss.length > 0)
                ? history.history.val_loss[history.history.val_loss.length - 1]
                : null
        });
        
        if (!saveSuccess) {
            throw new Error(`Failed to save model for ${figi}. Model training completed but save operation failed.`);
        }

        // 9. Очищаем кеш модели для этого FIGI, чтобы загрузить новую версию
        const cacheKey = `${figi}_seq2seq`;
        if (WeeklyForecastService.modelCache) {
            WeeklyForecastService.modelCache.delete(cacheKey);
        }

        if (LoggerService.isInitialized) {
            LoggerService.info('Weekly Forecast model training completed', {
                service: 'WeeklyForecastTrainingUtils',
                operation: 'trainWeeklyForecastModel',
                figi,
                modelVersion,
                sequencesCount: sequences.length,
                finalLoss: (history.history.loss && Array.isArray(history.history.loss) && history.history.loss.length > 0) 
                    ? history.history.loss[history.history.loss.length - 1] 
                    : null,
                adaptiveMode: adaptiveMode,
                lookbackDays: actualLookbackDays,
                forecastDays: actualForecastDays
            });
        }

        return {
            success: true,
            figi,
            ticker: instrument.ticker || instrument.name,
            modelVersion,
            sequencesCount: sequences.length,
            epochs,
            lookbackDays: actualLookbackDays,
            forecastDays: actualForecastDays,
            adaptiveMode: adaptiveMode,
            finalLoss: (history.history.loss && Array.isArray(history.history.loss) && history.history.loss.length > 0) 
                ? history.history.loss[history.history.loss.length - 1] 
                : null,
            finalValLoss: (history.history.val_loss && Array.isArray(history.history.val_loss) && history.history.val_loss.length > 0)
                ? history.history.val_loss[history.history.val_loss.length - 1]
                : null
        };
    } catch (error) {
        // Если это ошибка недостаточных данных, логируем как предупреждение
        if (error.code === 'INSUFFICIENT_DATA' || error.message.includes('Insufficient historical data')) {
            if (LoggerService.isInitialized) {
                LoggerService.warn('Insufficient historical data for Weekly Forecast training', {
                    service: 'WeeklyForecastTrainingUtils',
                    operation: 'trainWeeklyForecastModel',
                    figi,
                    reason: error.message
                });
            }
        } else {
            // Для других ошибок логируем как ошибку
        if (LoggerService.isInitialized) {
            LoggerService.error('Error training Weekly Forecast model', {
                service: 'WeeklyForecastTrainingUtils',
                operation: 'trainWeeklyForecastModel',
                figi,
                error: { message: error.message, stack: error.stack }
            });
            }
        }
        throw error;
    }
}

/**
 * Проверяет, активно ли полное обучение Weekly Forecast
 * @returns {boolean} true, если полное обучение активно
 */
export function isFullWeeklyForecastTrainingActive() {
    return _isFullWeeklyForecastTrainingActive;
}

/**
 * Обучает модели Weekly Forecast для всех активных инструментов
 * @param {Object} options - Опции обучения
 * @param {Array<string>} options.figiList - Список FIGI для обучения (если не указан, используются все активные)
 * @param {number} options.maxInstruments - Максимальное количество инструментов для обучения за раз (по умолчанию: 10)
 * @param {Object} options.trainingOptions - Опции обучения для каждого инструмента
 * @param {string} options.workerId - ID воркера для мониторинга прогресса
 * @returns {Promise<Object>} Результат обучения
 */
export async function trainWeeklyForecastModelsForAllInstruments(options = {}) {
    const {
        figiList = null,
        maxInstruments = null, // По умолчанию null - обучение всех инструментов без ограничений
        trainingOptions = {},
        workerId = null
    } = options;

    // Устанавливаем флаг блокировки быстрого обучения
    _isFullWeeklyForecastTrainingActive = true;

    try {
        if (LoggerService.isInitialized) {
            LoggerService.info('Starting Weekly Forecast models training for all instruments', {
                service: 'WeeklyForecastTrainingUtils',
                operation: 'trainWeeklyForecastModelsForAllInstruments',
                maxInstruments
            });
        }

        // Получаем список инструментов
        let instruments = [];
        if (figiList && Array.isArray(figiList)) {
            // Используем указанный список
            for (const figi of figiList) {
                const instrument = await CacheService.getInstrument(figi, true);
                if (instrument) {
                    instruments.push(instrument);
                }
            }
        } else {
            // Получаем все активные инструменты из кеша
            const allInstruments = await CacheService.getAllInstruments();
            instruments = allInstruments || [];
        }

        // Ограничиваем количество (только если maxInstruments указан и не null)
        if (maxInstruments !== null && maxInstruments !== undefined && instruments.length > maxInstruments) {
            instruments = instruments.slice(0, maxInstruments);
        }

        if (instruments.length === 0) {
            throw new Error('No instruments found for training');
        }

        // Обновляем статус: получен список инструментов
        if (workerId) {
            try {
                const WorkerMonitoringService = (await import('../../services/WorkerMonitoringService.js')).default;
                WorkerMonitoringService.updateWorkerStatus(workerId, {
                    progress: 10,
                    metadata: {
                        stage: 'training',
                        totalInstruments: instruments.length,
                        currentInstrument: 0,
                        currentTicker: null
                    }
                });
            } catch (monitoringError) {
                // Игнорируем ошибки мониторинга
            }
        }

        const results = {
            total: instruments.length,
            success: [],
            failed: [],
            skipped: [] // Инструменты с недостаточными данными
        };

        // Обучаем модели для каждого инструмента
        for (let i = 0; i < instruments.length; i++) {
            const instrument = instruments[i];
            
            // Обновляем прогресс
            if (workerId) {
                try {
                    const WorkerMonitoringService = (await import('../../services/WorkerMonitoringService.js')).default;
                    const progress = 10 + Math.round((i / instruments.length) * 85);
                    WorkerMonitoringService.updateWorkerStatus(workerId, {
                        progress,
                        metadata: {
                            stage: 'training',
                            totalInstruments: instruments.length,
                            currentInstrument: i + 1,
                            currentTicker: instrument.ticker || instrument.name,
                            currentFigi: instrument.figi
                        }
                    });
                } catch (monitoringError) {
                    // Игнорируем ошибки мониторинга
                }
            }
            
            try {
                const result = await trainWeeklyForecastModel(instrument.figi, trainingOptions);
                results.success.push(result);
            } catch (error) {
                // Если это ошибка недостаточных данных, логируем как предупреждение, а не ошибку
                if (error.code === 'INSUFFICIENT_DATA' || error.message.includes('Insufficient historical data')) {
                    if (LoggerService.isInitialized) {
                        LoggerService.warn('Skipping Weekly Forecast training due to insufficient data', {
                            service: 'WeeklyForecastTrainingUtils',
                            operation: 'trainWeeklyForecastModelsForAllInstruments',
                            figi: instrument.figi,
                            ticker: instrument.ticker || instrument.name,
                            reason: error.message
                        });
                    }
                    // Добавляем в skipped, так как это не ошибка, а нормальная ситуация
                    results.skipped.push({
                        figi: instrument.figi,
                        ticker: instrument.ticker || instrument.name,
                        reason: error.message
                    });
                } else {
                    // Для других ошибок добавляем в failed и логируем как ошибку
                results.failed.push({
                    figi: instrument.figi,
                    ticker: instrument.ticker || instrument.name,
                    error: error.message
                });
                    if (LoggerService.isInitialized) {
                        LoggerService.error('Error training Weekly Forecast model', {
                            service: 'WeeklyForecastTrainingUtils',
                            operation: 'trainWeeklyForecastModelsForAllInstruments',
                            figi: instrument.figi,
                            ticker: instrument.ticker || instrument.name,
                            error: { message: error.message, stack: error.stack }
                        });
                    }
                }
            }
            
            // Освобождаем event loop между инструментами, чтобы не блокировать другие запросы
            // Это критично для производительности сервера во время длительного обучения
            if (i < instruments.length - 1) {
                await new Promise(resolve => setImmediate(resolve));
            }
        }

        if (LoggerService.isInitialized) {
            LoggerService.info('Weekly Forecast models training completed', {
                service: 'WeeklyForecastTrainingUtils',
                operation: 'trainWeeklyForecastModelsForAllInstruments',
                total: results.total,
                success: results.success.length,
                failed: results.failed.length,
                skipped: results.skipped.length
            });
        }

        return results;
    } catch (error) {
        if (LoggerService.isInitialized) {
            LoggerService.error('Error training Weekly Forecast models for all instruments', {
                service: 'WeeklyForecastTrainingUtils',
                operation: 'trainWeeklyForecastModelsForAllInstruments',
                error: { message: error.message, stack: error.stack }
            });
        }
        throw error;
    } finally {
        // Сбрасываем флаг блокировки после завершения обучения
        _isFullWeeklyForecastTrainingActive = false;
        if (LoggerService.isInitialized) {
            LoggerService.info('Full Weekly Forecast training completed, quick training unlocked', {
                service: 'WeeklyForecastTrainingUtils',
                operation: 'trainWeeklyForecastModelsForAllInstruments'
            });
        }
    }
}

