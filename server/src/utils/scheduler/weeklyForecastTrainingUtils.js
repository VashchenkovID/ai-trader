import LoggerService from '../../services/LoggerService.js';
import CacheService from '../../services/CacheService.js';
import WeeklyForecastService from '../../services/WeeklyForecastService.js';
import WeeklyForecastModelService from '../../services/WeeklyForecastModelService.js';

/**
 * Утилиты для обучения моделей Weekly Forecast
 */

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
        if (candles.length < lookbackDays + forecastDays) {
            throw new Error(`Insufficient historical data: ${candles.length} candles (minimum ${lookbackDays + forecastDays})`);
        }

        // 3. Подготавливаем features
        const features = await WeeklyForecastService.prepareForecastFeatures(figi, candles, {
            includeMacro: true,
            includeNews: true
        });

        // 4. Подготавливаем данные для обучения
        const { sequences, targets } = WeeklyForecastModelService.prepareTrainingData(
            candles,
            features,
            lookbackDays,
            forecastDays
        );

        if (sequences.length === 0) {
            throw new Error('No training sequences generated');
        }

        // 5. Создаем или загружаем модель
        const modelWrapper = await WeeklyForecastService.getOrCreateModel(figi, 'seq2seq');
        const model = modelWrapper.model;

        // 6. Обучаем модель
        if (LoggerService.isInitialized) {
            LoggerService.info('Training model', {
                service: 'WeeklyForecastTrainingUtils',
                operation: 'trainWeeklyForecastModel',
                figi,
                sequencesCount: sequences.length,
                epochs
            });
        }

        const history = await WeeklyForecastModelService.trainModel(model, sequences, targets, {
            epochs,
            batchSize,
            validationSplit: 0.2,
            verbose: 0,
            figi // Передаем figi для идентификации в очереди
        });

        // 7. Сохраняем модель
        const modelVersion = WeeklyForecastService.generateModelVersion();
        await WeeklyForecastModelService.saveModel(model, figi, 'seq2seq', {
            version: modelVersion,
            trainedAt: new Date().toISOString(),
            epochs,
            batchSize,
            sequencesCount: sequences.length,
            historicalDays,
            lookbackDays,
            forecastDays,
            finalLoss: history.history.loss[history.history.loss.length - 1],
            finalValLoss: history.history.val_loss ? history.history.val_loss[history.history.val_loss.length - 1] : null
        });

        // 8. Очищаем кеш модели для этого FIGI, чтобы загрузить новую версию
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
                finalLoss: history.history.loss[history.history.loss.length - 1]
            });
        }

        return {
            success: true,
            figi,
            ticker: instrument.ticker || instrument.name,
            modelVersion,
            sequencesCount: sequences.length,
            epochs,
            finalLoss: history.history.loss[history.history.loss.length - 1],
            finalValLoss: history.history.val_loss ? history.history.val_loss[history.history.val_loss.length - 1] : null
        };
    } catch (error) {
        if (LoggerService.isInitialized) {
            LoggerService.error('Error training Weekly Forecast model', {
                service: 'WeeklyForecastTrainingUtils',
                operation: 'trainWeeklyForecastModel',
                figi,
                error: { message: error.message, stack: error.stack }
            });
        }
        throw error;
    }
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
        maxInstruments = 10,
        trainingOptions = {},
        workerId = null
    } = options;

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
            failed: []
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
                results.failed.push({
                    figi: instrument.figi,
                    ticker: instrument.ticker || instrument.name,
                    error: error.message
                });
            }
        }

        if (LoggerService.isInitialized) {
            LoggerService.info('Weekly Forecast models training completed', {
                service: 'WeeklyForecastTrainingUtils',
                operation: 'trainWeeklyForecastModelsForAllInstruments',
                total: results.total,
                success: results.success.length,
                failed: results.failed.length
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
    }
}

