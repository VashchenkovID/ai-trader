import * as tf from '@tensorflow/tfjs';
import OptimizedDataService from './OptimizedDataService.js';
import CacheService from './CacheService.js';
import ModelManager from '../utils/ModelManager.js';
import LoggerService from './LoggerService.js';
import { getService } from './GlobalServiceManager.js';
import ServiceManager from './ServiceManager.js';

/**
 * Оптимизированный сервис обучения нейросетей
 * Объединяет всю логику обучения в одном месте
 */
class OptimizedTrainingService {
    constructor() {
        this.trainingProgress = {
            currentInstrument: null,
            totalInstruments: 0,
            completedInstruments: 0,
            currentStage: null,
            accuracy: 0
        };
        this.workers = new Set(); // Храним все worker'ы для завершения
        this.trainingFigiLocks = new Set(); // Лок на FIGI, чтобы не запускать дубликаты
        this.eventListeners = new Map(); // Хранилище обработчиков событий
        this.isBatchTraining = false; // Флаг для защиты от повторного запуска batchTrainAll
    }

    /**
     * Останавливает все процессы и очищает ресурсы
     */
    async stop() {
        try {
            // Завершаем все worker'ы
            this.workers.forEach(worker => {
                if (worker && worker.terminate) {
                    worker.terminate();
                }
            });
            this.workers.clear();
            
            // Сбрасываем флаги (убрали this.isTraining для поддержки параллельного обучения)
            this.trainingProgress = {
                currentInstrument: null,
                totalInstruments: 0,
                completedInstruments: 0,
                currentStage: null,
                accuracy: 0
            };
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error stopping Optimized Training Service', {
                    service: 'OptimizedTrainingService',
                    operation: 'stop',
                    error: { message: error.message, stack: error.stack }
                });
            }
            throw error;
        }
    }

    /**
     * Основной метод обучения для одного инструмента
     */
    async trainInstrument(figi, options = {}) {
        const {
            days = 180,
            epochs = 30, // Уменьшено с 50 до 30 для предотвращения переобучения
            batchSize = 32, // Увеличено с 16 до 32 для более стабильного обучения
            useAdvancedFeatures = true,
            enableValidation = true,
            useWorker = true
        } = options;

        try {
            // Per-FIGI лок — не позволяем запустить обучение для того же инструмента повторно
            if (this.trainingFigiLocks.has(figi)) {
                return { success: false, figi, error: 'Training already running for this FIGI' };
            }

            // Добавляем лок для этого FIGI (убрали глобальный лок для поддержки параллельного обучения)
            this.trainingProgress.currentInstrument = figi;
            this.trainingFigiLocks.add(figi);

            // 1. Проверяем, существует ли инструмент в кеше
            // skipUpdate = true - режим обучения, не делаем запросы к API
            const instrument = await CacheService.getInstrument(figi, true);
            if (!instrument) {
                const errorMsg = `Instrument ${figi} not found in cache. Please ensure the instrument is cached before training.`;
                return {
                    success: false,
                    figi,
                    error: errorMsg,
                    reason: 'INSTRUMENT_NOT_FOUND'
                };
            }
            
            // 2. Получаем данные
            const candles = await this.getTrainingData(figi, days);
            
            // 3. Адаптивная проверка минимального количества данных
            const minCandles = this.getMinimumCandlesRequired(candles.length);
            if (candles.length < minCandles) {
                const errorMsg = `Insufficient data: ${candles.length} candles (minimum required: ${minCandles}). Instrument: ${instrument.name || figi}`;
                
                // Возвращаем информативный результат вместо исключения
                return {
                    success: false,
                    figi,
                    error: errorMsg,
                    reason: 'INSUFFICIENT_DATA',
                    candlesCount: candles.length,
                    minRequired: minCandles,
                    instrumentName: instrument.name || figi
                };
            }

            // 4. Подготавливаем фичи
            const { features, labels } = await this.prepareFeatures(candles, figi, useAdvancedFeatures);
            if (features.length === 0) {
                throw new Error('No features prepared');
            }

            // 4.0. Проверка качества данных перед обучением
            const dataQuality = this.validateDataQuality(features, labels);
            if (!dataQuality.valid) {
                LoggerService.warn('Data quality issues detected', {
                    service: 'OptimizedTrainingService',
                    operation: 'trainInstrument',
                    figi,
                    issues: dataQuality.issues,
                    warnings: dataQuality.warnings,
                    stats: dataQuality.stats
                });
                
                // Если есть критические проблемы, прерываем обучение
                const criticalIssues = dataQuality.issues.filter(issue => 
                    issue.includes('Empty') || 
                    issue.includes('Mismatch') || 
                    issue.includes('Insufficient samples per class')
                );
                
                if (criticalIssues.length > 0) {
                    return {
                        success: false,
                        figi,
                        error: `Data quality check failed: ${criticalIssues.join('; ')}`,
                        reason: 'DATA_QUALITY_FAILED',
                        dataQuality
                    };
                }
            } else if (dataQuality.warnings.length > 0) {
                LoggerService.info('Data quality warnings', {
                    service: 'OptimizedTrainingService',
                    operation: 'trainInstrument',
                    figi,
                    warnings: dataQuality.warnings
                });
            }

            // 4.1. Разделение на train/validation/test (Фаза 2, задача 2.4.1)
            const { trainValidationTestSplit, timeBasedSplit, stratifiedSplit } = await import('../utils/dataSplitUtils.js');
            const useTimeBasedSplit = options.timeBasedSplit !== false; // По умолчанию true для временных рядов
            const useStratifiedSplit = options.useStratifiedSplit === true; // Опционально: использовать stratified split для балансировки классов
            
            let dataSplit;
            if (useStratifiedSplit && !useTimeBasedSplit) {
                // Используем stratified split для балансировки классов (только если не time-based)
                LoggerService.info('Using stratified split for class balancing', {
                    service: 'OptimizedTrainingService',
                    operation: 'trainInstrument',
                    figi
                });
                dataSplit = stratifiedSplit(features, labels, {
                    trainRatio: options.trainRatio || 0.7,
                    validationRatio: options.validationRatio || 0.15,
                    testRatio: options.testRatio || 0.15
                });
            } else if (useTimeBasedSplit) {
                dataSplit = timeBasedSplit(features, labels, {
                    trainRatio: options.trainRatio || 0.7,
                    validationRatio: options.validationRatio || 0.15,
                    testRatio: options.testRatio || 0.15,
                    gapDays: options.gapDays || 5 // Gap между train и validation для предотвращения data leakage
                });
            } else {
                dataSplit = trainValidationTestSplit(features, labels, {
                    trainRatio: options.trainRatio || 0.7,
                    validationRatio: options.validationRatio || 0.15,
                    testRatio: options.testRatio || 0.15,
                    shuffle: options.shuffle !== false
                });
            }
            
            // Используем train для обучения, validation для валидации во время обучения, test для финальной оценки
            const trainFeatures = dataSplit.train.features;
            const trainLabels = dataSplit.train.labels;
            const validationFeatures = dataSplit.validation.features;
            const validationLabels = dataSplit.validation.labels;
            const testFeatures = dataSplit.test.features;
            const testLabels = dataSplit.test.labels;

            // 5. Пытаемся загрузить существующую модель (тёплый старт), иначе создаем новую
            const inputSize = trainFeatures[0].length;
            
            // Автоматически определяем, нужен ли focal loss на основе дисбаланса классов
            const positiveCount = trainLabels.filter(l => l === 1).length;
            const negativeCount = trainLabels.filter(l => l === 0).length;
            const totalCount = trainLabels.length;
            const classImbalance = Math.abs(positiveCount - negativeCount) / totalCount;
            const useFocalLoss = options.useFocalLoss !== false && classImbalance > 0.3; // Автоматически используем focal loss при дисбалансе > 30%
            
            // Применяем SMOTE при сильном дисбалансе (>70%)
            let finalTrainFeatures = trainFeatures;
            let finalTrainLabels = trainLabels;
            if (options.useSMOTE !== false && classImbalance > 0.7) {
                LoggerService.info('Applying SMOTE due to severe class imbalance', {
                    service: 'OptimizedTrainingService',
                    operation: 'trainInstrument',
                    figi,
                    classImbalance: (classImbalance * 100).toFixed(2) + '%',
                    positiveCount,
                    negativeCount
                });
                
                const smoteResult = this.applySMOTE(trainFeatures, trainLabels, {
                    k: 5,
                    ratio: 0.8 // Целевое соотношение 80% (не полный баланс, чтобы не переобучить)
                });
                
                finalTrainFeatures = smoteResult.features;
                finalTrainLabels = smoteResult.labels;
            }
            
            if (useFocalLoss && classImbalance > 0.3) {
                LoggerService.info('Using focal loss due to class imbalance', {
                    service: 'OptimizedTrainingService',
                    operation: 'trainInstrument',
                    figi,
                    classImbalance: (classImbalance * 100).toFixed(2) + '%',
                    positiveCount,
                    negativeCount
                });
            }

            // 5.0. Вычисление адаптивных параметров обучения
            // Сначала пытаемся загрузить сохраненные лучшие параметры
            const savedParams = await this.loadBestHyperparameters();
            
            const adaptiveParams = this.calculateAdaptiveTrainingParams(
                finalTrainFeatures.length, // Используем финальные фичи (после SMOTE, если применен)
                inputSize,
                classImbalance
            );
            
            // Используем сохраненные параметры, если они есть, иначе адаптивные
            const finalEpochs = options.epochs !== undefined 
                ? options.epochs 
                : (savedParams?.epochs || adaptiveParams.epochs);
            const finalBatchSize = options.batchSize !== undefined 
                ? options.batchSize 
                : (savedParams?.batchSize || adaptiveParams.batchSize);
            const finalLearningRate = savedParams?.learningRate || adaptiveParams.learningRate;
            
            if (savedParams) {
                LoggerService.info('Using saved best hyperparameters', {
                    service: 'OptimizedTrainingService',
                    operation: 'trainInstrument',
                    figi,
                    savedParams
                });
            }
            
            LoggerService.info('Training parameters', {
                service: 'OptimizedTrainingService',
                operation: 'trainInstrument',
                figi,
                epochs: finalEpochs,
                batchSize: finalBatchSize,
                learningRate: finalLearningRate,
                dataSize: trainFeatures.length,
                classImbalance: (classImbalance * 100).toFixed(2) + '%',
                adaptive: options.epochs === undefined || options.batchSize === undefined
            });
            
            let model = await this.loadModel(figi, inputSize);
            if (!model) {
                model = await this.createOptimizedModel(inputSize, useFocalLoss, finalLearningRate);
            } else if (useFocalLoss) {
                // Если модель загружена, но нужен focal loss, перекомпилируем с новой loss функцией
                const focalLoss = this.createFocalLoss(0.25, 2.0);
                model.compile({
                    optimizer: tf.train.adam(finalLearningRate),
                    loss: focalLoss,
                    metrics: ['accuracy'] // F1-score, precision, recall вычисляются вручную
                });
            } else {
                // Обновляем learning rate, если он изменился
                model.compile({
                    optimizer: tf.train.adam(finalLearningRate),
                    loss: 'binaryCrossentropy',
                    metrics: ['accuracy'] // F1-score, precision, recall вычисляются вручную
                });
            }

            // 6. Обучение на train set с валидацией на validation set
            // Используем финальные фичи (после SMOTE, если применен)
            let trainingResult;
            if (useWorker) {
                try {
                    // Для воркера объединяем train и validation (воркер сам разделит через validationSplit)
                    const combinedFeatures = [...finalTrainFeatures, ...validationFeatures];
                    const combinedLabels = [...finalTrainLabels, ...validationLabels];
                    trainingResult = await this.trainModelViaWorker(combinedFeatures, combinedLabels, finalEpochs, finalBatchSize, 'nn');
                } catch (workerError) {
                    if (LoggerService.isInitialized) {
                        LoggerService.error('Worker training failed, falling back to local', {
                            service: 'OptimizedTrainingService',
                            operation: 'trainInstrument',
                            figi,
                            error: { message: workerError.message, stack: workerError.stack }
                        });
                    }
                    // Локальное обучение с явным validation set
                    trainingResult = await this.trainModel(model, [...finalTrainFeatures, ...validationFeatures], [...finalTrainLabels, ...validationLabels], finalEpochs, finalBatchSize);
                }
            } else {
                // Локальное обучение - используем train + validation вместе (trainModel сам разделит через validationData)
                // Но для правильной валидации на validation set, создаем отдельные тензоры
                trainingResult = await this.trainModelWithExplicitValidation(
                    model, 
                    finalTrainFeatures, 
                    finalTrainLabels, 
                    validationFeatures, 
                    validationLabels, 
                    finalEpochs, 
                    finalBatchSize
                );
            }

            // 7. Финальная оценка на test set
            let testResult = null;
            if (enableValidation && testFeatures.length > 0) {
                // Используем calculateMetrics для получения всех метрик
                testResult = await this.calculateMetrics(model, testFeatures, testLabels);
            }
            
            // Для обратной совместимости используем testResult как validationResult
            const validationResult = testResult;

            // 6. Сохраняем модель с метаданными
            const saveMetadata = {
                trainingMetrics: trainingResult ? {
                    finalLoss: trainingResult.finalLoss,
                    finalAccuracy: trainingResult.finalAccuracy
                } : null,
                validationMetrics: validationResult ? {
                    f1: validationResult.f1,
                    precision: validationResult.precision,
                    recall: validationResult.recall,
                    auc: validationResult.auc,
                    accuracy: validationResult.accuracy,
                    directionAccuracy: validationResult.directionAccuracy,
                    classImbalance: validationResult.classImbalance
                } : null,
                trainingParams: {
                    epochs: finalEpochs,
                    batchSize: finalBatchSize,
                    learningRate: finalLearningRate,
                    useFocalLoss,
                    dataSize: trainFeatures.length,
                    featureSize: inputSize
                },
                dataQuality: dataQuality ? {
                    valid: dataQuality.valid,
                    warnings: dataQuality.warnings.length,
                    issues: dataQuality.issues.length
                } : null
            };
            await this.saveModel(figi, model, saveMetadata);
            
            // 6.0. Обновляем модель в NeuralNetworkService для использования в анализе
            try {
                const NeuralNetworkService = (await import('./NeuralNetworkService.js')).default;
                NeuralNetworkService.model = model;
            } catch (nnError) {
                if (LoggerService.isInitialized) {
                    LoggerService.error('Failed to update model in NeuralNetworkService', {
                        service: 'OptimizedTrainingService',
                        operation: 'trainInstrument',
                        figi,
                        error: { message: nnError.message, stack: nnError.stack }
                    });
                }
            }

            // 6.1. Условительное сохранение лучшей модели по F1-score (основная метрика)
            if (validationResult && typeof validationResult.f1 === 'number') {
                const currentF1 = validationResult.f1;
                const bestMeta = await this.loadBestMeta(figi);
                const bestF1 = bestMeta?.bestF1 ?? -Infinity;
                if (currentF1 > bestF1) {
                    await this.saveBestModel(figi, model, currentF1, 'f1');
                }
            }

            // 6.2. Проверка деградации и восстановление best-модели при необходимости
            // Используем F1-score как основную метрику для проверки деградации
            if (validationResult && typeof validationResult.f1 === 'number') {
                const currentMetrics = {
                    f1: validationResult.f1, // Основная метрика
                    accuracy: validationResult.accuracy || 0,
                    precision: validationResult.precision || 0,
                    recall: validationResult.recall || 0,
                    directionAccuracy: validationResult.directionAccuracy || 0,
                    classImbalance: validationResult.classImbalance || 0
                };
                await this.checkDegradationAndRestore(figi, model, currentMetrics);
            }

            // 8. Обновление базовых метрик в ModelMonitoringService после обучения (Фаза 2, задача 2.4.3)
            try {
                const ModelMonitoringService = (await import('./ModelMonitoringService.js')).default;
                if (ModelMonitoringService && ModelMonitoringService.isInitialized) {
                    await ModelMonitoringService.updateBaseline('traditional', figi);
                }
            } catch (monitoringError) {
                if (LoggerService.isInitialized) {
                    LoggerService.warn('Failed to update baseline in ModelMonitoringService', {
                        service: 'OptimizedTrainingService',
                        operation: 'trainInstrument',
                        figi,
                        error: { message: monitoringError.message }
                    });
                }
            }

            // Мониторинг воркера обрабатывается внутри trainModelViaWorker

            // Логируем метрики для анализа
            if (validationResult) {
                LoggerService.info('Training metrics', {
                    service: 'OptimizedTrainingService',
                    operation: 'trainInstrument',
                    figi,
                    metrics: {
                        f1: validationResult.f1?.toFixed(4) || 'N/A',
                        precision: validationResult.precision?.toFixed(4) || 'N/A',
                        recall: validationResult.recall?.toFixed(4) || 'N/A',
                        accuracy: validationResult.accuracy?.toFixed(4) || 'N/A',
                        directionAccuracy: validationResult.directionAccuracy?.toFixed(4) || 'N/A',
                        auc: validationResult.auc?.toFixed(4) || 'N/A',
                        classImbalance: validationResult.classImbalance?.toFixed(4) || 'N/A',
                        classDistribution: validationResult.classDistribution || {}
                    }
                });
            }

            return {
                success: true,
                figi,
                trainingResult,
                validationResult: validationResult || testResult,
                testResult, // Добавляем отдельно test результат
                model,
                featuresCount: features.length,
                trainSize: trainFeatures.length,
                validationSize: validationFeatures.length,
                testSize: testFeatures.length,
                // Основные метрики
                f1: validationResult?.f1 || testResult?.f1 || null,
                accuracy: validationResult?.accuracy || testResult?.accuracy || trainingResult.finalAccuracy || 0,
                directionAccuracy: validationResult?.directionAccuracy || testResult?.directionAccuracy || null,
                // Для обратной совместимости
                testAccuracy: testResult?.accuracy || null,
                testF1: testResult?.f1 || null
            };

        } catch (error) {
            // Мониторинг воркера обрабатывается внутри trainModelViaWorker
            if (LoggerService.isInitialized) {
                LoggerService.error('Training failed', {
                    service: 'OptimizedTrainingService',
                    operation: 'trainInstrument',
                    figi,
                    error: { message: error.message, stack: error.stack }
                });
            }
            
            // Отправляем алерт в Telegram об ошибке обучения
            try {
                const OptimizedTelegramService = (await import('./OptimizedTelegramService.js')).default;
                await OptimizedTelegramService.sendAlert(
                    'TRAINING_ERROR',
                    `❌ <b>ОШИБКА ОБУЧЕНИЯ</b>\n\n📈 Инструмент: <b>${figi}</b>\n🔍 Ошибка: ${error.message}\n⏰ Время: ${new Date().toLocaleString('ru-RU')}`,
                    'error'
                );
            } catch (telegramError) {
                if (LoggerService.isInitialized) {
                    LoggerService.error('Failed to send training error alert', {
                        service: 'OptimizedTrainingService',
                        operation: 'trainInstrument',
                        error: { message: telegramError.message }
                    });
                }
            }
            
            return {
                success: false,
                figi,
                error: error.message
            };
        } finally {
            // Снимаем лок для FIGI (убрали this.isTraining для поддержки параллельного обучения)
            this.trainingProgress.currentInstrument = null;
            try { this.trainingFigiLocks.delete(figi); } catch {}
        }
    }

    /**
     * Пакетное обучение для множества инструментов
     * Поддерживает параллельное обучение до 3 инструментов одновременно
     */
    async trainMultipleInstruments(instruments, options = {}) {
        // Обновляем статус обучения
        const TrainingStatusService = getService('TrainingStatusService');
        if (TrainingStatusService) {
            TrainingStatusService.startTraining('neuralNetwork', instruments.length);
        }
        
        this.trainingProgress.totalInstruments = instruments.length;
        this.trainingProgress.completedInstruments = 0;

        const results = [];
        const errors = [];
        const maxConcurrent = 3; // Максимальное количество параллельных обучений
        let activeTrainings = 0;
        let currentIndex = 0; // Индекс следующего инструмента для обработки
        const allPromises = []; // Массив всех промисов для отслеживания

        // Функция для обработки одного инструмента
        const processInstrument = async (instrument, index) => {
            const figi = typeof instrument === 'string' ? instrument : instrument.figi;
            const name = typeof instrument === 'string' ? figi : instrument.name;
            
            try {
                 
                
                const result = await this.trainInstrument(figi, options);
                
                if (result.success) {
                    results.push(result);
                    this.trainingProgress.completedInstruments++;
                     
                } else {
                    errors.push({ figi, name, error: result.error || 'Training failed' });
                    LoggerService.warn('Training failed', {
                        service: 'OptimizedTrainingService',
                        operation: 'trainInstrument',
                        index: index + 1,
                        total: instruments.length,
                        instrument: name || figi.substring(0, 10),
                        error: result.error
                    });
                }
                
                // Обновляем прогресс в TrainingStatusService
                if (TrainingStatusService) {
                    const progress = ((results.length + errors.length) / instruments.length) * 100;
                    const ticker = typeof instrument === 'string' ? figi.substring(0, 10) : (instrument.ticker || name);
                    TrainingStatusService.updateProgress('neuralNetwork', progress, ticker);
                }
                
                // Уведомляем о прогрессе
                if (result.success && result.accuracy) {
                    this.broadcastProgress(name, result.accuracy);
                }
                
            } catch (error) {
                errors.push({ figi, name, error: error.message });
                LoggerService.error('Error training instrument', {
                    service: 'OptimizedTrainingService',
                    operation: 'trainInstrument',
                    index: index + 1,
                    total: instruments.length,
                    instrument: name || figi.substring(0, 10),
                    error: { message: error.message, stack: error.stack }
                });
                
                if (LoggerService.isInitialized) {
                    LoggerService.error('Failed training for instrument', {
                        service: 'OptimizedTrainingService',
                        operation: 'trainMultipleInstruments',
                        figi,
                        name,
                        error: { message: error.message, stack: error.stack }
                    });
                }
            } finally {
                activeTrainings--;
                
                // Запускаем следующий инструмент, если есть
                // ВАЖНО: используем атомарную операцию для избежания race condition
                if (currentIndex < instruments.length) {
                    const nextIndex = currentIndex++; // Атомарно получаем и инкрементируем
                    const nextInstrument = instruments[nextIndex];
                    activeTrainings++;
                    
                    // Запускаем следующий инструмент и добавляем промис в массив
                    const nextPromise = processInstrument(nextInstrument, nextIndex);
                    allPromises.push(nextPromise);
                    nextPromise.catch(err => {
                        LoggerService.error('Error in parallel training', {
                            service: 'OptimizedTrainingService',
                            operation: 'parallelTraining',
                            index: nextIndex,
                            error: { message: err.message, stack: err.stack }
                        });
                    });
                }
            }
        };

        // Запускаем первые maxConcurrent обучений
         
        
        for (let i = 0; i < Math.min(maxConcurrent, instruments.length); i++) {
            currentIndex = i + 1; // Следующий индекс после текущего
            activeTrainings++;
            const promise = processInstrument(instruments[i], i);
            allPromises.push(promise);
        }

        // Ждем завершения ВСЕХ промисов (включая те, что запускаются в finally)
         
        await Promise.all(allPromises);

        // Дополнительная проверка на случай, если что-то осталось (защита от зацикливания)
        let waitCount = 0;
        const maxWait = 1000; // Максимум 100 секунд ожидания (100 * 100ms)
        while (activeTrainings > 0 && waitCount < maxWait) {
            await new Promise(resolve => setTimeout(resolve, 100));
            waitCount++;
        }
        
        if (activeTrainings > 0) {
            LoggerService.warn('Active trainings still running after timeout', {
                service: 'OptimizedTrainingService',
                operation: 'waitForTraining',
                activeTrainings: activeTrainings,
                timeout: waitCount * 0.1
            });
        } else {
             
        }

        const summary = {
            total: instruments.length,
            successful: results.length,
            failed: errors.length,
            successRate: (results.length / instruments.length) * 100,
            averageAccuracy: this.calculateAverageAccuracy(results),
            results,
            errors
        };

         

        // Завершаем обучение в TrainingStatusService
        if (TrainingStatusService) {
            TrainingStatusService.completeTraining('neuralNetwork', errors.length === 0);
        }

        return summary;
    }

    /**
     * Получение данных для обучения
     */
    async getTrainingData(figi, days) {
        // skipUpdate = true - режим обучения, не делаем запросы к API
        let candles = await CacheService.getCandles(figi, 'DAY', days, true);
        
        // Если данных мало, пытаемся расширить окно (только из кеша)
        if (candles.length < 100) {
            
            // Пробуем разные периоды (skipUpdate = true для всех запросов)
            const periods = [days * 2, days * 3, 365, 720, 1080];
            
            for (const period of periods) {
                const extendedCandles = await CacheService.getCandles(figi, 'DAY', period, true);
                if (extendedCandles.length > candles.length) {
                    candles = extendedCandles;
                }
                
                // Если получили достаточно данных, останавливаемся
                if (candles.length >= 50) break;
            }
        }

        return candles;
    }

    /**
     * Определение минимального количества свечей для обучения
     */
    getMinimumCandlesRequired(availableCandles) {
        // Адаптивная логика в зависимости от доступных данных
        if (availableCandles >= 200) {
            return 50; // Оптимальное требование для больших данных
        } else if (availableCandles >= 100) {
            return 30; // Стандартное требование для достаточных данных
        } else if (availableCandles >= 50) {
            return 20; // Сниженное требование для средних данных
        } else if (availableCandles >= 25) {
            return 15; // Минимальное требование для малых данных
        } else if (availableCandles >= 15) {
            return 10; // Экстремально низкое требование для очень малых данных
        } else {
            return 5; // Абсолютный минимум для обучения
        }
    }

    /**
     * Расчет адаптивного lookback периода
     */
    calculateAdaptiveLookback(candleCount) {
        // Адаптивная логика в зависимости от количества данных
        if (candleCount >= 200) {
            return 60; // Полный lookback для больших данных
        } else if (candleCount >= 100) {
            return 40; // Средний lookback
        } else if (candleCount >= 50) {
            return 25; // Сокращенный lookback
        } else if (candleCount >= 30) {
            return 15; // Минимальный lookback
        } else {
            return Math.max(5, Math.floor(candleCount / 3)); // Экстремально малый lookback
        }
    }

    /**
     * Подготовка фичей (унифицированная)
     */
    async prepareFeatures(candles, figi, useAdvancedFeatures = true) {
        try {
            // Адаптивный lookback в зависимости от количества данных
            const adaptiveLookback = this.calculateAdaptiveLookback(candles.length);
            const predictionHorizon = Math.min(5, Math.floor(candles.length / 10)); // Адаптивный горизонт
            
            // Базовые фичи через OptimizedDataService (уже включают все необходимые фичи)
            const { features, labels } = await OptimizedDataService.prepareTrainingData(
                candles,
                adaptiveLookback,
                predictionHorizon,
                figi
            );

            if (features.length === 0) {
                return { features, labels };
            }

            return { features, labels };
        } catch (error) {
            LoggerService.warn('Error preparing features', {
                service: 'OptimizedTrainingService',
                operation: 'prepareFeatures',
                error: { message: error.message }
            });
            return { features: [], labels: [] };
        }
    }

    /**
     * Получение технических индикаторов
     */
    getTechnicalFeatures(candles, index) {
        try {
            const prices = candles.slice(Math.max(0, index - 20), index + 1).map(c => c.close);
            if (prices.length < 5) return new Array(10).fill(0);

            const windowCandles = candles.slice(Math.max(0, index - 20), index + 1);
            const vols = windowCandles.map(c => c.volume || 0);
            const highs = windowCandles.map(c => c.high);
            const lows = windowCandles.map(c => c.low);
            const indicators = OptimizedDataService.calculateTechnicalIndicators(prices, vols, highs, lows);
            return indicators;
        } catch (error) {
            return new Array(10).fill(0);
        }
    }

    /**
     * Focal Loss для борьбы с дисбалансом классов
     * Фокусируется на сложных примерах, уменьшая вес легких примеров
     * @param {number} alpha - Весовой коэффициент для класса (0.25 по умолчанию)
     * @param {number} gamma - Фокусирующий параметр (2.0 по умолчанию)
     * @returns {Function} Функция потерь для TensorFlow.js
     */
    createFocalLoss(alpha = 0.25, gamma = 2.0) {
        return (yTrue, yPred) => {
            // Ограничиваем предсказания для численной стабильности
            const epsilon = 1e-7;
            const clippedPred = tf.clipByValue(yPred, epsilon, 1 - epsilon);
            
            // Вычисляем p_t: вероятность правильного класса
            // Для yTrue = 1: p_t = yPred, для yTrue = 0: p_t = 1 - yPred
            const ones = tf.onesLike(yTrue);
            const p_t = tf.add(
                tf.mul(yTrue, clippedPred),
                tf.mul(tf.sub(ones, yTrue), tf.sub(ones, clippedPred))
            );
            
            // Вычисляем (1 - p_t)^gamma
            const oneMinusPt = tf.sub(ones, p_t);
            const modulatingFactor = tf.pow(oneMinusPt, gamma);
            
            // Вычисляем alpha_t: весовой коэффициент
            // Для yTrue = 1: alpha, для yTrue = 0: 1 - alpha
            const alphaScalar = tf.scalar(alpha);
            const oneMinusAlpha = tf.scalar(1 - alpha);
            const alpha_t = tf.add(
                tf.mul(yTrue, alphaScalar),
                tf.mul(tf.sub(ones, yTrue), oneMinusAlpha)
            );
            
            // Вычисляем log(p_t)
            const logPt = tf.log(p_t);
            
            // Focal Loss: -alpha_t * (1 - p_t)^gamma * log(p_t)
            const focalLoss = tf.mul(
                tf.mul(tf.neg(alpha_t), modulatingFactor),
                logPt
            );
            
            return tf.mean(focalLoss);
        };
    }

    /**
     * Создание оптимизированной модели
     */
    async createOptimizedModel(inputShape, useFocalLoss = false, learningRate = 0.0005) {
         
        
        // L2 регуляризация для предотвращения переобучения (увеличена с 0.001 до 0.01)
        const l2Regularizer = tf.regularizers.l2({ l2: 0.01 });
        
        const layer1Units = Math.min(128, Math.max(32, inputShape * 2));
        const layer2Units = Math.min(64, Math.max(16, inputShape));
        
         
        
        const model = tf.sequential({
            layers: [
                tf.layers.dense({
                    units: layer1Units,
                    activation: 'relu',
                    inputShape: [inputShape],
                    kernelInitializer: 'heUniform',
                    kernelRegularizer: l2Regularizer // L2 регуляризация
                }),
                tf.layers.batchNormalization({
                    betaInitializer: 'zeros',
                    gammaInitializer: 'ones',
                    movingMeanInitializer: 'zeros',
                    movingVarianceInitializer: 'ones'
                }), // Batch Normalization для стабилизации обучения
                tf.layers.dropout({ rate: 0.3 }), // Увеличен dropout с 0.25 до 0.3 для лучшей регуляризации
                tf.layers.dense({
                    units: layer2Units,
                    activation: 'relu',
                    kernelInitializer: 'heUniform',
                    kernelRegularizer: l2Regularizer // L2 регуляризация
                }),
                tf.layers.batchNormalization({
                    betaInitializer: 'zeros',
                    gammaInitializer: 'ones',
                    movingMeanInitializer: 'zeros',
                    movingVarianceInitializer: 'ones'
                }), // Batch Normalization для стабилизации обучения
                tf.layers.dropout({ rate: 0.25 }), // Увеличен dropout с 0.2 до 0.25
                tf.layers.dense({
                    units: 1,
                    activation: 'sigmoid',
                    kernelInitializer: 'glorotUniform'
                    // Выходной слой без L2 и BatchNorm для сохранения предсказательной способности
                })
            ]
        });

         
        
        // Выбираем функцию потерь: focal loss для дисбаланса классов или стандартный binaryCrossentropy
        const lossFunction = useFocalLoss 
            ? this.createFocalLoss(0.25, 2.0) 
            : 'binaryCrossentropy';
        
        model.compile({
            optimizer: tf.train.adam(learningRate), // Адаптивный learning rate
            loss: lossFunction,
            metrics: ['accuracy'] // TensorFlow.js поддерживает только accuracy из коробки
            // F1-score, precision, recall вычисляются вручную в calculateMetrics()
        });

        const totalParams = model.countParams();
         
        
        return model;
    }

    /**
     * Обучение модели через воркер (избегает клонирования функций TensorFlow.js)
     */
    async trainModelViaWorker(features, labels, epochs, batchSize, modelType = 'nn') {
        return new Promise(async (resolve, reject) => {
            const { Worker } = await import('worker_threads');
            const { join } = await import('path');
            const { fileURLToPath } = await import('url');
            const { dirname } = await import('path');
            
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = dirname(__filename);
            const workerPath = join(__dirname, '../workers/standaloneTrainingWorker.js');
            const worker = new Worker(workerPath);
            
            // Регистрируем воркер в WorkerMonitoringService
            let workerId = null;
            try {
                const WorkerMonitoringService = (await import('./WorkerMonitoringService.js')).default;
                if (!WorkerMonitoringService.isInitialized) {
                    await WorkerMonitoringService.initialize();
                }
                workerId = WorkerMonitoringService.registerWorker(
                    'training',
                    `Training ${modelType} model`,
                    { modelType, epochs, batchSize, featuresCount: features.length }
                );
            } catch (monitoringError) {
                LoggerService.warn('Failed to register worker in monitoring service', {
                    service: 'OptimizedTrainingService',
                    operation: 'registerWorker',
                    error: { message: String(monitoringError) }
                });
            }
            
            // Добавляем worker в список для отслеживания
            this.workers.add(worker);
            
            worker.postMessage({
                type: 'train',
                data: { features, labels, epochs, batchSize, modelType }
            });
            
            worker.on('message', async (msg) => {
                if (msg.type === 'training_complete') {
                    // Завершаем воркер в мониторинге
                    if (workerId) {
                        try {
                            const WorkerMonitoringService = (await import('./WorkerMonitoringService.js')).default;
                            WorkerMonitoringService.completeWorker(workerId, true, { result: msg.data });
                        } catch (monitoringError) {
                            LoggerService.warn('Failed to complete worker in monitoring service', {
                                service: 'OptimizedTrainingService',
                                operation: 'completeWorker',
                                error: { message: String(monitoringError) }
                            });
                        }
                    }
                    
                    this.workers.delete(worker);
                    resolve(msg.data);
                    worker.terminate();
                } else if (msg.type === 'training_error') {
                    // Отмечаем ошибку в мониторинге
                    if (workerId) {
                        try {
                            const WorkerMonitoringService = (await import('./WorkerMonitoringService.js')).default;
                            WorkerMonitoringService.reportWorkerError(workerId, msg.data.error);
                            WorkerMonitoringService.completeWorker(workerId, false, { error: msg.data.error });
                        } catch (monitoringError) {
                            LoggerService.warn('Failed to report worker error in monitoring service', {
                                service: 'OptimizedTrainingService',
                                operation: 'reportWorkerError',
                                error: { message: String(monitoringError) }
                            });
                        }
                    }
                    
                    this.workers.delete(worker);
                    reject(new Error(msg.data.error));
                    worker.terminate();
                } else if (msg.type === 'training_progress') {
                    // Обновляем прогресс в мониторинге
                    if (workerId) {
                        try {
                            const WorkerMonitoringService = (await import('./WorkerMonitoringService.js')).default;
                            const progress = ((msg.data.epoch || 0) / epochs) * 100;
                            WorkerMonitoringService.updateWorkerStatus(workerId, {
                                progress,
                                metadata: {
                                    epoch: msg.data.epoch,
                                    loss: msg.data.loss,
                                    accuracy: msg.data.accuracy,
                                    valLoss: msg.data.valLoss,
                                    valAccuracy: msg.data.valAccuracy
                                }
                            });
                        } catch (monitoringError) {
                            LoggerService.warn('Failed to update worker progress in monitoring service', {
                                service: 'OptimizedTrainingService',
                                operation: 'updateWorkerProgress',
                                error: { message: String(monitoringError) }
                            });
                        }
                    }
                    
                    // Передаем прогресс в основной процесс
                    this.trainingProgress.accuracy = msg.data.accuracy || 0;
                    this.broadcastEpochProgress(msg.data.epoch - 1, {
                        loss: msg.data.loss,
                        acc: msg.data.accuracy,
                        val_loss: msg.data.valLoss,
                        val_acc: msg.data.valAccuracy
                    });
                }
            });
            
            worker.on('error', async (error) => {
                // Отмечаем ошибку в мониторинге
                if (workerId) {
                    try {
                        const WorkerMonitoringService = (await import('./WorkerMonitoringService.js')).default;
                        WorkerMonitoringService.reportWorkerError(workerId, error);
                        WorkerMonitoringService.completeWorker(workerId, false, { error: error.message });
                    } catch (monitoringError) {
                        LoggerService.warn('Failed to report worker error in monitoring service', {
                            service: 'OptimizedTrainingService',
                            operation: 'reportWorkerError',
                            error: { message: String(monitoringError) }
                        });
                    }
                }
                
                this.workers.delete(worker);
                reject(error);
                worker.terminate();
            });
            
            worker.on('exit', async (code) => {
                // Завершаем воркер в мониторинге, если еще не завершен
                if (workerId) {
                    try {
                        const WorkerMonitoringService = (await import('./WorkerMonitoringService.js')).default;
                        const worker = WorkerMonitoringService.getWorker(workerId);
                        if (worker && worker.status === 'running') {
                            WorkerMonitoringService.completeWorker(workerId, code === 0, { exitCode: code });
                        }
                    } catch (monitoringError) {
                        LoggerService.warn('Failed to complete worker in monitoring service', {
                            service: 'OptimizedTrainingService',
                            operation: 'completeWorker',
                            error: { message: String(monitoringError) }
                        });
                    }
                }
                
                this.workers.delete(worker);
                if (code !== 0) {
                    reject(new Error(`Worker stopped with exit code ${code}`));
                }
            });
        });
    }

    /**
     * Обучение модели (оригинальный метод, оставляем для совместимости)
     */
    /**
     * Time-based split данных (хронологическое разделение)
     */
    timeBasedSplit(features, labels, trainRatio = 0.7, valRatio = 0.15) {
        const total = features.length;
        const trainSize = Math.floor(total * trainRatio);
        const valSize = Math.floor(total * valRatio);
        
        // Разделяем хронологически (первые 70% - train, следующие 15% - val, последние 15% - test)
        const trainFeatures = features.slice(0, trainSize);
        const trainLabels = labels.slice(0, trainSize);
        const valFeatures = features.slice(trainSize, trainSize + valSize);
        const valLabels = labels.slice(trainSize, trainSize + valSize);
        const testFeatures = features.slice(trainSize + valSize);
        const testLabels = labels.slice(trainSize + valSize);
        
        return {
            train: { features: trainFeatures, labels: trainLabels },
            val: { features: valFeatures, labels: valLabels },
            test: { features: testFeatures, labels: testLabels }
        };
    }

    /**
     * Расчет class weights для балансировки классов
     */
    calculateClassWeights(labels) {
        const total = labels.length;
        const posCount = labels.filter(l => l === 1).length;
        const negCount = total - posCount;
        
        if (posCount === 0 || negCount === 0) {
            // Если один из классов отсутствует, возвращаем равные веса
            return { 0: 1.0, 1: 1.0 };
        }
        
        // Вычисляем веса обратно пропорционально частоте класса
        // Более редкий класс получает больший вес
        const posWeight = total / (2 * posCount);
        const negWeight = total / (2 * negCount);
        
        // Нормализуем веса (сумма = 2.0)
        const sum = posWeight + negWeight;
        const normalizedPosWeight = (posWeight / sum) * 2;
        const normalizedNegWeight = (negWeight / sum) * 2;
        
        const imbalance = Math.abs(posCount - negCount) / total;
        
        return {
            0: normalizedNegWeight,
            1: normalizedPosWeight
        };
    }

    /**
     * Создание sample weights на основе class weights
     */
    createSampleWeights(labels, classWeights) {
        return labels.map(label => classWeights[label] || 1.0);
    }

    /**
     * Расчет метрик ROC-AUC и F1
     */
    async calculateMetrics(model, features, labels) {
        try {
            // Получаем предсказания
            // Убеждаемся, что features - это массив массивов, и указываем форму явно
            const featuresArray = Array.isArray(features[0]) ? features : [features];
            const featureSize = featuresArray[0]?.length || 0;
            
            // Проверяем совместимость размера фичей с моделью
            if (model.inputs && model.inputs[0] && model.inputs[0].shape) {
                const expectedSize = model.inputs[0].shape[1];
                if (expectedSize !== featureSize) {
                    LoggerService.warn('Feature size mismatch in calculateMetrics', {
                        service: 'OptimizedTrainingService',
                        operation: 'calculateMetrics',
                        expectedSize: expectedSize,
                        gotSize: featureSize
                    });
                    // Возвращаем нулевые метрики при несовместимости
                    return {
                        accuracy: 0,
                        precision: 0,
                        recall: 0,
                        f1: 0,
                        auc: 0,
                        confusionMatrix: { tp: 0, fp: 0, tn: 0, fn: 0 }
                    };
                }
            }
            
            const xs = tf.tensor2d(featuresArray, [featuresArray.length, featureSize]);
            const predictions = await model.predict(xs).data();
            xs.dispose();
            
            // Преобразуем предсказания в вероятности (если нужно)
            const probs = Array.from(predictions);
            const preds = probs.map(p => p >= 0.5 ? 1 : 0);
            
            // Расчет метрик
            let tp = 0, fp = 0, tn = 0, fn = 0;
            for (let i = 0; i < labels.length; i++) {
                const actual = labels[i];
                const pred = preds[i];
                
                if (actual === 1 && pred === 1) tp++;
                else if (actual === 0 && pred === 1) fp++;
                else if (actual === 0 && pred === 0) tn++;
                else if (actual === 1 && pred === 0) fn++;
            }
            
            // Precision, Recall, F1 с защитой от деления на ноль
            const precision = (tp + fp > 0) ? (tp / (tp + fp)) : 0;
            const recall = (tp + fn > 0) ? (tp / (tp + fn)) : 0;
            const f1 = (precision + recall > 0) ? (2 * (precision * recall) / (precision + recall)) : 0;
            
            // ROC-AUC (упрощенный расчет через площадь под кривой)
            const sortedPairs = probs.map((prob, i) => ({ prob, label: labels[i] }))
                .sort((a, b) => b.prob - a.prob);
            
            let auc = 0.5; // По умолчанию 0.5 (случайное угадывание)
            let tpr = 0, fpr = 0;
            let prevTpr = 0, prevFpr = 0;
            const totalPos = labels.filter(l => l === 1).length;
            const totalNeg = labels.filter(l => l === 0).length;
            
            if (totalPos > 0 && totalNeg > 0) {
                for (const pair of sortedPairs) {
                    if (pair.label === 1) {
                        tpr++;
                    } else {
                        fpr++;
                    }
                    
                    const currentTpr = tpr / totalPos;
                    const currentFpr = fpr / totalNeg;
                    
                    // Площадь трапеции
                    auc += (currentFpr - prevFpr) * (currentTpr + prevTpr) / 2;
                    
                    prevTpr = currentTpr;
                    prevFpr = currentFpr;
                }
            } else {
                // Если нет одного из классов, AUC = 0.5 (случайное угадывание)
                auc = 0.5;
            }
            
            // Accuracy с защитой от деления на ноль
            const total = tp + tn + fp + fn;
            const accuracy = total > 0 ? (tp + tn) / total : 0;
            
            // Проверка на дисбаланс классов (используем уже вычисленные totalPos и totalNeg)
            const classImbalance = labels.length > 0 ? Math.abs(totalPos - totalNeg) / labels.length : 0;
            
            // Direction Accuracy: правильность направления (независимо от порога)
            let directionCorrect = 0;
            for (let i = 0; i < labels.length; i++) {
                const actual = labels[i];
                const pred = preds[i];
                // Если оба 1 или оба 0 - направление правильное
                if ((actual === 1 && pred === 1) || (actual === 0 && pred === 0)) {
                    directionCorrect++;
                }
            }
            const directionAccuracy = (labels.length > 0) ? (directionCorrect / labels.length) : 0;
            
            // Защита от NaN и Infinity
            const safeValue = (value) => {
                if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
                    return 0;
                }
                return value;
            };
            
            return {
                // Основные метрики (с защитой от NaN)
                f1: safeValue(f1), // F1-score как основная метрика
                precision: safeValue(precision),
                recall: safeValue(recall),
                auc: safeValue(auc),
                accuracy: safeValue(accuracy), // Accuracy для справки, но не основная метрика
                directionAccuracy: safeValue(directionAccuracy), // Правильность направления
                
                // Дополнительная информация
                confusionMatrix: { tp, fp, tn, fn },
                classImbalance: safeValue(classImbalance), // Дисбаланс классов (0 = сбалансировано, 1 = полностью несбалансировано)
                classDistribution: {
                    positive: totalPos,
                    negative: totalNeg,
                    positiveRatio: labels.length > 0 ? safeValue(totalPos / labels.length) : 0
                }
            };
        } catch (error) {
            LoggerService.error('Error calculating metrics', {
                service: 'OptimizedTrainingService',
                operation: 'calculateMetrics',
                error: { message: error.message, stack: error.stack }
            });
            return {
                precision: 0,
                recall: 0,
                f1: 0,
                auc: 0,
                accuracy: 0,
                confusionMatrix: { tp: 0, fp: 0, tn: 0, fn: 0 }
            };
        }
    }

    async trainModel(model, features, labels, epochs, batchSize) {
        // Time-based split (хронологическое разделение)
        const split = this.timeBasedSplit(features, labels, 0.7, 0.15);
        
        // УБРАНО взвешивание через дублирование для предотвращения переобучения
        // Вместо этого используем исходные данные без дублирования
        // Это предотвращает переобучение и улучшает генерализацию
        const finalTrainFeatures = split.train.features;
        const finalTrainLabels = split.train.labels;
        
        // Расчет class weights для балансировки классов
        // Примечание: TensorFlow.js не поддерживает sampleWeight в model.fit()
        // Используем взвешивание через дублирование данных (уже применено в applyDataWeighting)
        const classWeights = this.calculateClassWeights(finalTrainLabels);
        
        // Валидация данных перед созданием тензоров
        if (finalTrainFeatures.length === 0 || !finalTrainFeatures[0] || !Array.isArray(finalTrainFeatures[0])) {
            throw new Error('Invalid training features: empty or not an array of arrays');
        }
        
        const featureSize = finalTrainFeatures[0].length;
        if (featureSize === 0) {
            throw new Error('Invalid training features: feature vector is empty');
        }
        
        // Проверяем, что все фичи имеют одинаковый размер
        for (let i = 0; i < finalTrainFeatures.length; i++) {
            if (!Array.isArray(finalTrainFeatures[i]) || finalTrainFeatures[i].length !== featureSize) {
                throw new Error(`Invalid training features at index ${i}: expected size ${featureSize}, got ${finalTrainFeatures[i]?.length || 0}`);
            }
            // Проверяем на NaN и Infinity
            for (let j = 0; j < finalTrainFeatures[i].length; j++) {
                const val = finalTrainFeatures[i][j];
                if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) {
                    throw new Error(`Invalid training feature value at [${i}][${j}]: ${val}`);
                }
            }
        }
        
        // Создаем тензоры для обучения с явным указанием формы
        const trainFeaturesShape = [finalTrainFeatures.length, featureSize];
        const xs = tf.tensor2d(finalTrainFeatures, trainFeaturesShape);
        const trainLabelsArray = finalTrainLabels.map(label => [label]);
        const ys = tf.tensor2d(trainLabelsArray, [trainLabelsArray.length, 1]);
        
        // Валидация валидационных данных
        if (split.val.features.length === 0 || !split.val.features[0] || !Array.isArray(split.val.features[0])) {
            throw new Error('Invalid validation features: empty or not an array of arrays');
        }
        
        const valFeatureSize = split.val.features[0].length;
        if (valFeatureSize !== featureSize) {
            throw new Error(`Feature size mismatch: training=${featureSize}, validation=${valFeatureSize}`);
        }
        
        // Создаем тензоры для валидации с явным указанием формы
        const valFeaturesShape = [split.val.features.length, valFeatureSize];
        const valXs = tf.tensor2d(split.val.features, valFeaturesShape);
        const valLabelsArray = split.val.labels.map(label => [label]);
        const valYs = tf.tensor2d(valLabelsArray, [valLabelsArray.length, 1]);

        // Настройки для early stopping и reduce LR on plateau
        let bestValLoss = Infinity;
        let patience = 5; // Уменьшено с 10 до 5 для более раннего остановки при переобучении
        let patienceCount = 0;
        let reduceLRPatience = 5; // Количество эпох без улучшения для снижения LR
        let reduceLRCount = 0;
        let currentLR = 0.001; // Начальный learning rate
        let lrReductionFactor = 0.5; // Коэффициент уменьшения LR
        let minLR = 1e-6; // Минимальный learning rate
        let lrHistory = []; // История изменений LR для отслеживания
        let lrReductionCount = 0; // Количество уменьшений LR
        let maxLRReductions = 3; // Максимальное количество уменьшений LR
        
        // Получаем текущий learning rate из оптимизатора
        // Примечание: В TensorFlow.js learning rate может быть тензором или числом
        const optimizer = model.optimizer;
        if (optimizer) {
            try {
                if (optimizer.learningRate) {
                    // Если learning rate это тензор, получаем его значение
                    if (typeof optimizer.learningRate.data === 'function') {
                        const lrData = await optimizer.learningRate.data();
                        if (lrData && lrData.length > 0) {
                            currentLR = lrData[0];
                        }
                    } else if (typeof optimizer.learningRate === 'number') {
                        // Если learning rate это число, используем его напрямую
                        currentLR = optimizer.learningRate;
                    } else if (optimizer.getLearningRate) {
                        // Если есть метод getLearningRate
                        currentLR = await optimizer.getLearningRate();
                    }
                }
            } catch (e) {
                // Если не удалось получить LR, используем значение по умолчанию (0.001)
                // Не логируем предупреждение, так как это нормально для некоторых оптимизаторов
            }
        }

        const history = await model.fit(xs, ys, {
            epochs,
            batchSize,
            // sampleWeight не поддерживается в TensorFlow.js - используем взвешивание через дублирование данных
            validationData: [valXs, valYs], // Используем time-based validation set
            verbose: 0,
            // Взвешивание реализовано через дублирование важных примеров
            callbacks: {
                onEpochEnd: async (epoch, logs) => {
                    this.trainingProgress.accuracy = logs.acc || 0;
                    this.broadcastEpochProgress(epoch, logs);
                    
                    // Мониторинг переобучения: отслеживаем разницу между train и validation
                    const trainLoss = logs.loss || 0;
                    const trainAccuracy = logs.acc || 0;
                    const valLoss = logs.val_loss || logs.loss;
                    const valAccuracy = logs.val_acc || logs.val_accuracy || logs.acc || 0;
                    
                    // Рассчитываем разницу между train и validation метриками
                    const lossDiff = trainLoss - valLoss; // Отрицательное значение = переобучение
                    const accuracyDiff = trainAccuracy - valAccuracy; // Положительное значение = переобучение
                    
                    // Логируем метрики на каждой эпохе для мониторинга переобучения
                    if (epoch % 5 === 0 || epoch === epochs - 1) { // Каждые 5 эпох или последняя
                        LoggerService.info('Training epoch metrics', {
                            service: 'OptimizedTrainingService',
                            operation: 'trainModel',
                            epoch: epoch + 1,
                            totalEpochs: epochs,
                            metrics: {
                                trainLoss: trainLoss.toFixed(4),
                                valLoss: valLoss.toFixed(4),
                                lossDiff: lossDiff.toFixed(4),
                                trainAccuracy: trainAccuracy.toFixed(4),
                                valAccuracy: valAccuracy.toFixed(4),
                                accuracyDiff: accuracyDiff.toFixed(4),
                                overfittingRisk: lossDiff < -0.1 || accuracyDiff > 0.1 ? 'HIGH' : 
                                               lossDiff < -0.05 || accuracyDiff > 0.05 ? 'MEDIUM' : 'LOW'
                            }
                        });
                    }
                    
                    // Алерт при сильном переобучении
                    if (lossDiff < -0.15 || accuracyDiff > 0.15) {
                        LoggerService.warn('Potential overfitting detected', {
                            service: 'OptimizedTrainingService',
                            operation: 'trainModel',
                            epoch: epoch + 1,
                            trainLoss: trainLoss.toFixed(4),
                            valLoss: valLoss.toFixed(4),
                            trainAccuracy: trainAccuracy.toFixed(4),
                            valAccuracy: valAccuracy.toFixed(4),
                            lossDiff: lossDiff.toFixed(4),
                            accuracyDiff: accuracyDiff.toFixed(4)
                        });
                    }
                    
                    // Early stopping и reduce LR on plateau
                    
                    if (valLoss < bestValLoss) {
                        // Улучшение - сбрасываем счетчики
                        bestValLoss = valLoss;
                        patienceCount = 0;
                        reduceLRCount = 0;
                    } else {
                        // Нет улучшения
                        patienceCount++;
                        reduceLRCount++;
                        
                        // Автоматическое уменьшение LR при обнаружении плато
                        if (reduceLRCount >= reduceLRPatience && lrReductionCount < maxLRReductions) {
                            const oldLR = currentLR; // Сохраняем старое значение
                            const newLR = Math.max(currentLR * lrReductionFactor, minLR);
                            
                            if (newLR < currentLR) {
                                // Перекомпилируем модель с новым LR
                                try {
                                    model.compile({
                                        optimizer: tf.train.adam(newLR),
                                        loss: 'binaryCrossentropy',
                                        metrics: ['accuracy']
                                    });
                                    
                                    currentLR = newLR;
                                    lrReductionCount++;
                                    lrHistory.push({
                                        epoch: epoch + 1,
                                        oldLR: oldLR,
                                        newLR: currentLR,
                                        valLoss: valLoss,
                                        reason: 'plateau_detected'
                                    });
                                    
                                } catch (lrError) {
                                    LoggerService.warn('Не удалось изменить LR', {
                                        service: 'OptimizedTrainingService',
                                        operation: 'changeLearningRate',
                                        error: { message: lrError.message }
                                    });
                                }
                            }
                            
                            reduceLRCount = 0; // Сбрасываем счетчик после уменьшения LR
                        } else if (reduceLRCount >= reduceLRPatience && lrReductionCount >= maxLRReductions) {
                            // Достигнуто максимальное количество уменьшений LR
                            reduceLRCount = 0; // Сбрасываем счетчик
                        }
                        
                        // Early stopping
                        if (patienceCount >= patience) {
                            model.stopTraining = true; // Останавливаем обучение в TensorFlow.js
                        }
                    }
                }
            }
        });

        // Очистка памяти
        xs.dispose();
        ys.dispose();
        valXs.dispose();
        valYs.dispose();

        // Расчет метрик ROC-AUC и F1 на валидации
        const valMetrics = await this.calculateMetrics(model, split.val.features, split.val.labels);
        const testMetrics = await this.calculateMetrics(model, split.test.features, split.test.labels);

        return {
            history: history.history,
            finalAccuracy: history.history.acc[history.history.acc.length - 1],
            finalLoss: history.history.loss[history.history.loss.length - 1],
            valMetrics,
            testMetrics,
            lrHistory: lrHistory, // История изменений LR
            finalLR: currentLR, // Финальный learning rate
            lrReductions: lrReductionCount // Количество уменьшений LR
        };
    }

    /**
     * Обучение модели с явным validation set (Фаза 2, задача 2.4.1)
     */
    async trainModelWithExplicitValidation(model, trainFeatures, trainLabels, validationFeatures, validationLabels, epochs, batchSize) {
        // Создаем тензоры для обучения
        const xs = tf.tensor2d(trainFeatures);
        const ys = tf.tensor2d(trainLabels.map(l => [l]));
        
        // Создаем тензоры для валидации
        const valXs = tf.tensor2d(validationFeatures);
        const valYs = tf.tensor2d(validationLabels.map(l => [l]));
        
        let bestValLoss = Infinity;
        let bestEpoch = 0;
        
        const history = await model.fit(xs, ys, {
            epochs,
            batchSize,
            validationData: [valXs, valYs],
            verbose: 0,
            callbacks: {
                onEpochEnd: (epoch, logs) => {
                    const valLoss = logs.val_loss || logs.loss;
                    if (valLoss < bestValLoss) {
                        bestValLoss = valLoss;
                        bestEpoch = epoch;
                    }
                }
            }
        });
        
        // Освобождаем память
        xs.dispose();
        ys.dispose();
        valXs.dispose();
        valYs.dispose();
        
        return {
            history: history.history,
            finalAccuracy: history.history.acc[history.history.acc.length - 1],
            finalLoss: history.history.loss[history.history.loss.length - 1],
            bestValLoss,
            bestEpoch
        };
    }

    /**
     * Выполнение кросс-валидации (Фаза 2, задача 2.4.2)
     */
    async performCrossValidation(figi, options = {}) {
        const {
            days = 180,
            k = 5,
            epochs = 50,
            batchSize = 16,
            useAdvancedFeatures = true,
            stratified = false
        } = options;

        try {
            // Получаем данные
            const candles = await this.getTrainingData(figi, days);
            const { features, labels } = await this.prepareFeatures(candles, figi, useAdvancedFeatures);
            
            if (features.length === 0) {
                throw new Error('No features prepared');
            }

            // Импортируем утилиты кросс-валидации
            const { performCrossValidation } = await import('../utils/crossValidationUtils.js');
            
            // Функция обучения для одного фолда
            const trainFunction = async (trainFeat, trainLab, testFeat, testLab) => {
                const inputSize = trainFeat[0].length;
                const model = await this.createOptimizedModel(inputSize);
                
                const xs = tf.tensor2d(trainFeat);
                const ys = tf.tensor2d(trainLab.map(l => [l]));
                const testXs = tf.tensor2d(testFeat);
                const testYs = tf.tensor2d(testLab.map(l => [l]));
                
                const history = await model.fit(xs, ys, {
                    epochs,
                    batchSize,
                    validationData: [testXs, testYs],
                    verbose: 0
                });
                
                // Вычисляем метрики на test set
                const predictions = model.predict(testXs);
                const predValues = await predictions.data();
                predictions.dispose();
                
                const correct = predValues.reduce((acc, pred, i) => {
                    return acc + (Math.round(pred) === testLab[i] ? 1 : 0);
                }, 0);
                
                const accuracy = correct / testLab.length;
                
                // Освобождаем память
                xs.dispose();
                ys.dispose();
                testXs.dispose();
                testYs.dispose();
                model.dispose();
                
                return {
                    accuracy,
                    loss: history.history.loss[history.history.loss.length - 1],
                    valLoss: history.history.val_loss[history.history.val_loss.length - 1] || history.history.loss[history.history.loss.length - 1]
                };
            };
            
            // Выполняем кросс-валидацию
            const cvResult = await performCrossValidation(features, labels, trainFunction, {
                k,
                shuffle: true,
                stratified
            });
            
            return {
                success: true,
                figi,
                crossValidation: cvResult
            };
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Cross-validation failed', {
                    service: 'OptimizedTrainingService',
                    operation: 'performCrossValidation',
                    figi,
                    error: { message: error.message, stack: error.stack }
                });
            }
            return {
                success: false,
                figi,
                error: error.message
            };
        }
    }

    /**
     * Валидация модели
     */
    async validateModel(model, features, labels) {
        if (features.length === 0) return null;

        // Убеждаемся, что valFeatures - массив массивов, и указываем форму явно
        const valFeaturesShape = [features.length, features[0]?.length || 0];
        const valXs = tf.tensor2d(features, valFeaturesShape);
        const valLabelsArray = labels.map(label => [label]);
        const valYs = tf.tensor2d(valLabelsArray, [valLabelsArray.length, 1]);

        const predictions = model.predict(valXs);
        const predictedValues = await predictions.data();
        predictions.dispose();

        const actualValues = labels;
        const correct = predictedValues.reduce((acc, pred, i) => {
            return acc + (Math.round(pred) === actualValues[i] ? 1 : 0);
        }, 0);

        const accuracy = correct / features.length;

        valXs.dispose();
        valYs.dispose();

        return { accuracy, correct, total: features.length };
    }

    /**
     * Сохранение модели
     */
    async saveModel(figi, model, metadata = {}) {
        try {
            // Сохраняем модель в файлы для конкретного инструмента
            const fs = await import('fs/promises');
            const path = await import('path');
            const { fileURLToPath } = await import('url');
            
            // Используем правильный путь относительно server директории
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = path.dirname(__filename);
            const modelsDir = path.join(__dirname, '../../models');
            await fs.mkdir(modelsDir, { recursive: true });
            
            // Устанавливаем права доступа на созданную папку
            try {
                await fs.chmod(modelsDir, 0o777);
            } catch (chmodError) {
                // Игнорируем ошибки chmod (может не работать в некоторых окружениях)
            }
            
            // Генерируем версию модели на основе timestamp и метаданных
            const timestamp = Date.now();
            const version = `${timestamp}_${Math.random().toString(36).substring(2, 9)}`;
            
            // Сохраняем архитектуру модели с версионированием
            const modelPath = path.join(modelsDir, `${figi}_model.json`);
            const weightsPath = path.join(modelsDir, `${figi}_weights.json`);
            const metadataPath = path.join(modelsDir, `${figi}_metadata.json`);
            
            // Загружаем существующие метаданные, если есть
            let existingMetadata = {};
            try {
                const existingMetadataContent = await fs.readFile(metadataPath, 'utf-8');
                existingMetadata = JSON.parse(existingMetadataContent);
            } catch (e) {
                // Файл не существует или невалидный - создаем новый
            }
            
            // Обновляем метаданные с версионированием
            const modelMetadata = {
                ...existingMetadata,
                currentVersion: version,
                versions: existingMetadata.versions || [],
                lastUpdated: new Date().toISOString(),
                ...metadata
            };
            
            // Добавляем текущую версию в историю (сохраняем последние 10 версий)
            modelMetadata.versions.push({
                version,
                timestamp,
                date: new Date().toISOString(),
                metadata: { ...metadata }
            });
            
            // Ограничиваем историю версий до 10 последних
            if (modelMetadata.versions.length > 10) {
                modelMetadata.versions = modelMetadata.versions.slice(-10);
            }
            
            const archJson = model.toJSON(null, false);
            const weights = model.getWeights();
            const specs = await Promise.all(weights.map(async (w) => ({
                name: w.name,
                shape: w.shape,
                dtype: w.dtype,
                data: await w.array()
            })));
            
            // Сохраняем архитектуру
            await fs.writeFile(modelPath, JSON.stringify(archJson, null, 2));
            
            // Устанавливаем права на файлы
            try {
                await fs.chmod(modelPath, 0o666);
            } catch (chmodError) {
                // Игнорируем ошибки chmod
            }
            
            // Сохраняем веса
            await fs.writeFile(weightsPath, JSON.stringify({ specs }, null, 2));
            
            // Устанавливаем права на файлы
            try {
                await fs.chmod(weightsPath, 0o666);
            } catch (chmodError) {
                // Игнорируем ошибки chmod
            }
            
            // Сохраняем метаданные с версионированием
            await fs.writeFile(metadataPath, JSON.stringify(modelMetadata, null, 2));
            
            try {
                await fs.chmod(metadataPath, 0o666);
            } catch (chmodError) {
                // Игнорируем ошибки chmod
            }
            
            // Также сохраняем через ModelManager для совместимости
            try {
                await ModelManager.saveModel(model, `neural/${figi}`);
            } catch (modelManagerError) {
                LoggerService.warn('Failed to save model via ModelManager', {
                    service: 'OptimizedTrainingService',
                    operation: 'saveModel',
                    figi: figi,
                    error: { message: modelManagerError.message }
                });
            }
            
            // Также сохраняем в памяти для быстрого доступа
            this.currentModel = { figi, model, version, metadata: modelMetadata };
            
            LoggerService.info('Model saved with versioning', {
                service: 'OptimizedTrainingService',
                operation: 'saveModel',
                figi,
                version,
                totalVersions: modelMetadata.versions.length
            });
            
        } catch (error) {
            LoggerService.warn('Failed to save model', {
                service: 'OptimizedTrainingService',
                operation: 'saveModel',
                error: { message: error.message }
            });
        }
    }

    /**
     * Сохранить лучшую модель и метаданные
     * @param {string} figi - FIGI инструмента
     * @param {Object} model - Модель TensorFlow.js
     * @param {number} bestMetric - Лучшая метрика (F1-score или accuracy)
     * @param {string} metricType - Тип метрики ('f1' или 'accuracy')
     */
    async saveBestModel(figi, model, bestMetric, metricType = 'f1') {
        try {
            const fs = await import('fs/promises');
            const path = await import('path');
            const { fileURLToPath } = await import('url');
            const { default: tf } = await import('@tensorflow/tfjs');

            // Используем правильный путь относительно server директории
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = path.dirname(__filename);
            const modelsDir = path.join(__dirname, '../../models');
            await fs.mkdir(modelsDir, { recursive: true });
            
            // Устанавливаем права доступа на созданную папку
            try {
                await fs.chmod(modelsDir, 0o777);
            } catch (chmodError) {
                // Игнорируем ошибки chmod
            }

            const bestModelPath = path.join(modelsDir, `${figi}_best_model.json`);
            const bestWeightsPath = path.join(modelsDir, `${figi}_best_weights.json`);
            const metaPath = path.join(modelsDir, `${figi}_best_meta.json`);

            // Архитектура
            const archJson = model.toJSON(null, false);
            await fs.writeFile(bestModelPath, JSON.stringify(archJson, null, 2));

            // Веса
            const weights = model.getWeights();
            const specs = await Promise.all(weights.map(async (w) => ({
                name: w.name,
                shape: w.shape,
                dtype: w.dtype,
                data: await w.array()
            })));
            await fs.writeFile(bestWeightsPath, JSON.stringify({ specs }, null, 2));

            // Метаданные
            const metadata = {
                bestF1: metricType === 'f1' ? bestMetric : null,
                bestAccuracy: metricType === 'accuracy' ? bestMetric : null,
                metricType,
                savedAt: new Date().toISOString()
            };
            await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2));
            
            // Устанавливаем права на все файлы
            try {
                await fs.chmod(bestModelPath, 0o666);
                await fs.chmod(bestWeightsPath, 0o666);
                await fs.chmod(metaPath, 0o666);
            } catch (chmodError) {
                // Игнорируем ошибки chmod
            }
        } catch (error) {
            LoggerService.warn('Failed to save best model', {
                service: 'OptimizedTrainingService',
                operation: 'saveBestModel',
                figi: figi,
                error: { message: error.message }
            });
        }
    }

    /**
     * Загрузить метаданные лучшей модели
     */
    async loadBestMeta(figi) {
        try {
            const fs = await import('fs/promises');
            const path = await import('path');
            const metaPath = path.join('./models', `${figi}_best_meta.json`);
            const raw = await fs.readFile(metaPath, 'utf-8');
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    /**
     * Загрузить лучшую модель
     */
    async loadBestModel(figi) {
        try {
            const fs = await import('fs/promises');
            const path = await import('path');
            const { fileURLToPath } = await import('url');
            const { default: tf } = await import('@tensorflow/tfjs');

            // Используем правильный путь относительно server директории
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = path.dirname(__filename);
            const modelsDir = path.join(__dirname, '../../models');
            const bestModelPath = path.join(modelsDir, `${figi}_best_model.json`);
            const bestWeightsPath = path.join(modelsDir, `${figi}_best_weights.json`);

            // Проверяем существование файлов
            const exists = await fs.access(bestModelPath).then(() => true).catch(() => false);
            const weightsExists = await fs.access(bestWeightsPath).then(() => true).catch(() => false);
            
            if (!exists || !weightsExists) {
                return null;
            }

            // Загружаем архитектуру и веса
            const archRaw = await fs.readFile(bestModelPath, 'utf-8');
            const arch = JSON.parse(archRaw);
            const model = await tf.models.modelFromJSON(arch);

            const weightsRaw = await fs.readFile(bestWeightsPath, 'utf-8');
            const weightsData = JSON.parse(weightsRaw);
            const specs = weightsData.specs || weightsData.weights || null;
            
            if (!specs || !Array.isArray(specs) || specs.length === 0) {
                LoggerService.warn('Invalid weights format for best model, skipping load', {
                    service: 'OptimizedTrainingService',
                    operation: 'loadBestModel',
                    figi: figi
                });
                throw new Error('Invalid weights format: specs is not an array');
            }
            
            const tensors = specs.map(s => tf.tensor(s.data, s.shape, s.dtype));
            model.setWeights(tensors);

            // Компилируем загруженную модель
            model.compile({
                optimizer: tf.train.adam(0.001),
                loss: 'binaryCrossentropy',
                metrics: ['accuracy']
            });

            return model;
        } catch (error) {
            LoggerService.warn('Failed to load best model', {
                service: 'OptimizedTrainingService',
                operation: 'loadBestModel',
                figi: figi,
                error: { message: error.message }
            });
            return null;
        }
    }

    /**
     * Проверка деградации модели и восстановление best-модели при необходимости
     */
    async checkDegradationAndRestore(figi, currentModel, currentMetrics = null) {
        try {
            const bestMeta = await this.loadBestMeta(figi);
            
            // Используем F1-score как основную метрику, fallback на accuracy для совместимости
            const bestMetric = bestMeta?.bestF1 ?? bestMeta?.bestAccuracy ?? null;
            const metricType = bestMeta?.metricType || (bestMeta?.bestF1 ? 'f1' : 'accuracy');
            
            if (!bestMetric) {
                // Нет best-модели, текущая модель становится best
                if (currentMetrics && currentMetrics.f1) {
                    await this.saveBestModel(figi, currentModel, currentMetrics.f1, 'f1');
                } else if (currentMetrics && currentMetrics.accuracy) {
                    await this.saveBestModel(figi, currentModel, currentMetrics.accuracy, 'accuracy');
                }
                return { degraded: false, restored: false };
            }

            const degradationThreshold = 0.05; // 5% деградация - порог для восстановления

            // Если есть текущие метрики, сравниваем с best (приоритет F1-score)
            const currentMetric = currentMetrics?.f1 ?? currentMetrics?.accuracy ?? null;
            if (currentMetric !== null) {
                const degradation = bestMetric - currentMetric;

                if (degradation > degradationThreshold) {
                    LoggerService.warn('Model degradation detected', {
                        service: 'OptimizedTrainingService',
                        operation: 'checkDegradation',
                        figi: figi,
                        currentMetric: currentMetric.toFixed(4),
                        bestMetric: bestMetric.toFixed(4),
                        metricType: metricType,
                        degradation: (degradation*100).toFixed(2) + '%',
                        classImbalance: currentMetrics?.classImbalance?.toFixed(4) || 'N/A'
                    });
                    
                    // Восстанавливаем best-модель
                    const bestModel = await this.loadBestModel(figi);
                    if (bestModel) {
                        // Сохраняем текущую деградировавшую модель как backup
                        await this.saveModel(figi, currentModel);
                        
                        // Заменяем текущую модель на best
                        await this.saveModel(figi, bestModel);

                        // Отправляем уведомление о деградации
                        const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
                        if (WebSocketService) {
                            WebSocketService.broadcast({
                                type: 'model_degradation',
                                data: {
                                    figi,
                                    currentMetric,
                                    bestMetric,
                                    metricType,
                                    degradation: degradation * 100,
                                    restored: true
                                },
                                timestamp: new Date().toISOString()
                            });
                        }

                        return { degraded: true, restored: true, bestModel };
                    }
                } else if (currentMetric > bestMetric) {
                    // Текущая модель лучше best - обновляем best
                    const newMetricType = currentMetrics?.f1 ? 'f1' : 'accuracy';
                    await this.saveBestModel(figi, currentModel, currentMetric, newMetricType);
                    return { degraded: false, restored: false, bestUpdated: true };
                }
            }

            return { degraded: false, restored: false };
        } catch (error) {
            LoggerService.error('Error checking degradation', {
                service: 'OptimizedTrainingService',
                operation: 'checkDegradation',
                figi: figi,
                error: { message: error.message, stack: error.stack }
            });
            return { degraded: false, restored: false, error: error.message };
        }
    }

    /**
     * Оценка производительности модели на валидационных данных
     */
    async evaluateModelPerformance(figi, model, validationData = null) {
        try {
            // Если валидационные данные не предоставлены, используем последние данные
            if (!validationData) {
                const candles = await this.getTrainingData(figi, 60);
                if (candles.length < 20) {
                    return null;
                }
                const { features, labels } = await this.prepareFeatures(candles, figi, false);
                const split = this.timeBasedSplit(features, labels, 0.7, 0.15);
                validationData = { features: split.val.features, labels: split.val.labels };
            }

            // Рассчитываем метрики на валидационных данных
            const metrics = await this.calculateMetrics(model, validationData.features, validationData.labels);
            
            return {
                accuracy: metrics.accuracy,
                precision: metrics.precision,
                recall: metrics.recall,
                f1: metrics.f1,
                auc: metrics.auc,
                directionAccuracy: metrics.directionAccuracy,
                confusionMatrix: metrics.confusionMatrix,
                classImbalance: metrics.classImbalance,
                classDistribution: metrics.classDistribution
            };
        } catch (error) {
            LoggerService.error('Error evaluating model performance', {
                service: 'OptimizedTrainingService',
                operation: 'evaluateModelPerformance',
                figi: figi,
                error: { message: error.message, stack: error.stack }
            });
            return null;
        }
    }

    /**
     * Загрузка модели
     */
    async loadModel(figi, inputSize = null) {
        try {
            const fs = await import('fs/promises');
            const path = await import('path');
            const { fileURLToPath } = await import('url');

            // Используем правильный путь относительно server директории
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = path.dirname(__filename);
            const modelsDir = path.join(__dirname, '../../models');
            
            // Попытка 1: Загрузить модель для конкретного FIGI
            const figiModelPath = path.join(modelsDir, `${figi}_model.json`);
            const figiWeightsPath = path.join(modelsDir, `${figi}_weights.json`);
            
            try {
                const exists = await fs.access(figiModelPath).then(() => true).catch(() => false);
                const weightsExists = await fs.access(figiWeightsPath).then(() => true).catch(() => false);
                
                if (exists && weightsExists) {
                    // Загружаем архитектуру и веса для FIGI
                    const archRaw = await fs.readFile(figiModelPath, 'utf-8');
                    const arch = JSON.parse(archRaw);
            const model = await tf.models.modelFromJSON(arch);

                    const weightsRaw = await fs.readFile(figiWeightsPath, 'utf-8');
            const weightsData = JSON.parse(weightsRaw);
            const specs = weightsData.specs || weightsData.weights || null;
            
            if (!specs || !Array.isArray(specs) || specs.length === 0) {
                LoggerService.warn('Invalid weights format, skipping load', {
                    service: 'OptimizedTrainingService',
                    operation: 'loadModel',
                    figi: figi
                });
                throw new Error('Invalid weights format: specs is not an array');
            }
            
            const tensors = specs.map(s => tf.tensor(s.data, s.shape, s.dtype));
            model.setWeights(tensors);

                    // Проверяем совместимость входного размера, если он известен
                    if (inputSize !== null) {
                        const modelInputShape = model.inputs?.[0]?.shape;
                        const modelInputSize = Array.isArray(modelInputShape) ? modelInputShape[1] : null;
                        
                        if (modelInputSize !== null && modelInputSize !== inputSize) {
                            // Удаляем несовместимую модель для освобождения места
                            try {
                                if (await fs.access(figiModelPath).then(() => true).catch(() => false)) {
                                    await fs.unlink(figiModelPath);
                                }
                                if (await fs.access(figiWeightsPath).then(() => true).catch(() => false)) {
                                    await fs.unlink(figiWeightsPath);
                                }
                            } catch (cleanupError) {
                                // Игнорируем ошибки удаления
                            }
                            return null;
                        }
                    }

            // Компилируем загруженную модель
            model.compile({
                        optimizer: tf.train.adam(0.001),
                loss: 'binaryCrossentropy',
                metrics: ['accuracy']
            });

            return model;
                }
            } catch (figiError) {
                LoggerService.warn('Failed to load per-FIGI model', {
                    service: 'OptimizedTrainingService',
                    operation: 'loadModel',
                    figi: figi,
                    error: { message: figiError.message }
                });
            }
            
            // Попытка 2: Загрузить через ModelManager (общая модель)
            try {
                const model = await ModelManager.loadModel(`neural/${figi}`);
                if (model) {
                    // Проверяем совместимость входного размера, если он известен
                    if (inputSize !== null) {
                        const modelInputShape = model.inputs?.[0]?.shape;
                        const modelInputSize = Array.isArray(modelInputShape) ? modelInputShape[1] : null;
                        
                        if (modelInputSize !== null && modelInputSize !== inputSize) {
                            return null;
                        }
                    }
                    
                    return model;
                }
            } catch (modelManagerError) {
                LoggerService.warn('Failed to load model via ModelManager', {
                    service: 'OptimizedTrainingService',
                    operation: 'loadModel',
                    figi: figi,
                    error: { message: modelManagerError.message }
                });
            }
            
            // Попытка 3: Загрузить общую модель (без FIGI)
            const generalModelPath = path.join(modelsDir, 'neural_model.json');
            const generalWeightsPath = path.join(modelsDir, 'neural_weights.json');
            
            try {
                const exists = await fs.access(generalModelPath).then(() => true).catch(() => false);
                const weightsExists = await fs.access(generalWeightsPath).then(() => true).catch(() => false);
                
                if (exists && weightsExists) {
                    const archRaw = await fs.readFile(generalModelPath, 'utf-8');
                    const arch = JSON.parse(archRaw);
                    const model = await tf.models.modelFromJSON(arch);
                    
                    const weightsRaw = await fs.readFile(generalWeightsPath, 'utf-8');
                    const weightsData = JSON.parse(weightsRaw);
                    const specs = weightsData.specs || weightsData.weights || null;
                    
                    if (!specs || !Array.isArray(specs) || specs.length === 0) {
                        LoggerService.warn('Invalid weights format for general model, skipping load', {
                            service: 'OptimizedTrainingService',
                            operation: 'loadModel'
                        });
                        throw new Error('Invalid weights format: specs is not an array');
                    }
                    
                    const tensors = specs.map(s => tf.tensor(s.data, s.shape, s.dtype));
                    model.setWeights(tensors);
                    
                    // Проверяем совместимость входного размера, если он известен
                    if (inputSize !== null) {
                        const modelInputShape = model.inputs?.[0]?.shape;
                        const modelInputSize = Array.isArray(modelInputShape) ? modelInputShape[1] : null;
                        
                        if (modelInputSize !== null && modelInputSize !== inputSize) {
                            // Удаляем несовместимую общую модель
                            try {
                                if (await fs.access(generalModelPath).then(() => true).catch(() => false)) {
                                    await fs.unlink(generalModelPath);
                                }
                                const generalWeightsPath = path.join(modelsDir, 'neural_model_weights.json');
                                if (await fs.access(generalWeightsPath).then(() => true).catch(() => false)) {
                                    await fs.unlink(generalWeightsPath);
                                }
                            } catch (cleanupError) {
                                // Игнорируем ошибки удаления
                            }
                            return null;
                        }
                    }
                    
                    model.compile({
                        optimizer: tf.train.adam(0.001),
                        loss: 'binaryCrossentropy',
                        metrics: ['accuracy']
                    });
                    
                    return model;
                }
            } catch (generalError) {
                LoggerService.warn('Failed to load general model as fallback', {
                    service: 'OptimizedTrainingService',
                    operation: 'loadModel',
                    figi: figi,
                    error: { message: generalError.message }
                });
            }

            // Fallback: модель не найдена, вернем null (будет создана новая)
            return null;
        } catch (error) {
            LoggerService.warn('Failed to load model', {
                service: 'OptimizedTrainingService',
                operation: 'loadModel',
                figi: figi,
                error: { message: error.message }
            });
            return null;
        }
    }

    /**
     * Расчет средней точности
     */
    calculateAverageAccuracy(results) {
        const successfulResults = results.filter(r => r.success && r.accuracy > 0);
        if (successfulResults.length === 0) return 0;
        
        return successfulResults.reduce((sum, r) => sum + r.accuracy, 0) / successfulResults.length;
    }

    /**
     * Уведомление о прогрессе
     */
    broadcastProgress(instrumentName, accuracy) {
        const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
        if (WebSocketService) {
            WebSocketService.broadcast({
                type: 'training_progress',
                data: {
                    instrument: instrumentName,
                    accuracy: accuracy,
                    completed: this.trainingProgress.completedInstruments,
                    total: this.trainingProgress.totalInstruments
                },
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Уведомление о прогрессе эпохи
     */
    broadcastEpochProgress(epoch, logs) {
        const progressData = {
            epoch: epoch + 1,
            epochs: logs.epochs || 50,
            loss: logs.loss || 0,
            accuracy: logs.acc || 0,
            valLoss: logs.val_loss || 0,
            valAccuracy: logs.val_acc || 0
        };

        // Вызываем обработчики событий
        this.emit('training_progress', progressData);

        // Отправляем прогресс через WebSocket используя новый метод
        const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
        if (WebSocketService && typeof WebSocketService.broadcastTrainingProgress === 'function') {
            WebSocketService.broadcastTrainingProgress({
                modelType: 'neural_network',
                instrument: this.currentTrainingInstrument || null,
                currentEpoch: progressData.epoch,
                totalEpochs: progressData.epochs,
                loss: progressData.loss,
                accuracy: progressData.accuracy,
                valLoss: progressData.valLoss,
                valAccuracy: progressData.valAccuracy,
                stage: 'training'
            });
        } else if (WebSocketService) {
            // Fallback к старому формату для совместимости
            WebSocketService.broadcast({
                type: 'training_progress',
                data: progressData,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Получение статуса обучения
     */
    getStatus() {
        return {
            isTraining: this.trainingFigiLocks.size > 0, // Проверяем наличие активных обучений
            activeTrainings: this.trainingFigiLocks.size,
            progress: this.trainingProgress
        };
    }

    /**
     * Получение доступных инструментов для обучения
     */
    async getAvailableInstruments() {
        try {
            const CachedInstrument = (await import('../models/CachedInstrument.js')).default;
            const CachedCandle = (await import('../models/CachedCandle.js')).default;

            const instruments = await CachedInstrument.findAll({
                where: { isActive: true },
                order: [['name', 'ASC']]
            });

            const validInstruments = [];
            
            for (const instrument of instruments) {
                try {
                    const candleCount = await CachedCandle.count({
                        where: { figi: instrument.figi }
                    });

                    // Адаптивные требования к количеству свечей
                    const minCandles = this.getMinimumCandlesRequired(candleCount);
                    
                    if (candleCount >= minCandles) {
                        validInstruments.push({
                            figi: instrument.figi,
                            name: instrument.name,
                            ticker: instrument.ticker,
                            type: instrument.type,
                            candleCount
                        });
                    }
                } catch (error) {
                    if (LoggerService.isInitialized) {
                        LoggerService.error('Error checking instrument for training', {
                            service: 'OptimizedTrainingService',
                            operation: 'getAvailableInstruments',
                            instrumentName: instrument.name,
                            error: { message: error.message, stack: error.stack }
                        });
                    }
                }
            }

            return validInstruments.slice(0, 20);
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error getting available instruments', {
                    service: 'OptimizedTrainingService',
                    operation: 'getAvailableInstruments',
                    error: { message: error.message, stack: error.stack }
                });
            }
            return [];
        }
    }

    /**
     * Получить модель для инструмента
     */
    async getModel(figi) {
        try {
            // Сначала проверяем, есть ли модель в памяти
                    if (this.currentModel && this.currentModel.figi === figi) {
                return this.currentModel.model;
            }

            // Попытка 1: Загрузить через ModelManager (наиболее надежный способ)
            try {
                const ModelManager = (await import('../utils/ModelManager.js')).default;
                const model = await ModelManager.loadModel(`neural/${figi}`);
                if (model) {
                    // Компилируем модель, если она не скомпилирована
                    if (!model.optimizer) {
                        model.compile({
                            optimizer: tf.train.adam(0.001),
                            loss: 'binaryCrossentropy',
                            metrics: ['accuracy']
                        });
                    }
                    return model;
                }
            } catch (modelManagerError) {
                // Продолжаем попытки загрузки другими способами
            }

            // Попытка 2: Загрузить напрямую из файлов используя tf.models.modelFromJSON
            const fs = await import('fs/promises');
            const path = await import('path');
            const { fileURLToPath } = await import('url');
            
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = path.dirname(__filename);
            const modelsDir = path.join(__dirname, '../../models');
            
            const modelPath = path.join(modelsDir, `${figi}_model.json`);
            const weightsPath = path.join(modelsDir, `${figi}_weights.json`);
            
            // Проверяем существование файлов
            try {
                await fs.access(modelPath);
                await fs.access(weightsPath);
            } catch {
                // Модель не найдена - это нормально, если она еще не обучена
                return null;
            }

            // Загружаем модель используя стандартный метод TensorFlow.js
            const archRaw = await fs.readFile(modelPath, 'utf8');
            const arch = JSON.parse(archRaw);
            
            // Используем tf.models.modelFromJSON для автоматической обработки структуры
            const model = await tf.models.modelFromJSON(arch);
            
            // Загружаем веса
            const weightsRaw = await fs.readFile(weightsPath, 'utf8');
            const weightsData = JSON.parse(weightsRaw);
            const specs = weightsData.specs || weightsData.weights || null;
            
            if (specs && Array.isArray(specs) && specs.length > 0) {
                const tensors = specs.map(s => tf.tensor(s.data, s.shape, s.dtype));
                model.setWeights(tensors);
            } else {
                LoggerService.warn('Invalid weights format, model loaded without weights', {
                    service: 'OptimizedTrainingService',
                    operation: 'loadModel',
                    figi: figi
                });
            }
            
            // Компилируем модель, если она не скомпилирована
            if (!model.optimizer) {
                model.compile({
                    optimizer: tf.train.adam(0.001),
                    loss: 'binaryCrossentropy',
                    metrics: ['accuracy']
                });
            }

            return model;
        } catch (error) {
            LoggerService.error('Error loading model', {
                service: 'OptimizedTrainingService',
                operation: 'loadModel',
                figi: figi,
                error: { message: error.message, stack: error.stack }
            });
            // Не выводим полный stack trace для каждого инструмента без модели
            return null;
        }
    }

    /**
     * Предсказание с помощью модели
     */
    async predict(figi, features) {
        try {
            const model = await this.getModel(figi);
            if (!model) {
                throw new Error(`Model not found for ${figi}`);
            }

            // Убеждаемся, что features - массив, и создаем тензор с явной формой
            const featuresArray = Array.isArray(features[0]) ? features : [features];
            const input = tf.tensor2d(featuresArray, [featuresArray.length, featuresArray[0].length]);
            const prediction = model.predict(input);
            const result = await prediction.data();
            
            // Очищаем тензоры
            input.dispose();
            prediction.dispose();
            
            return result[0];
        } catch (error) {
            LoggerService.error('Error predicting', {
                service: 'OptimizedTrainingService',
                operation: 'predict',
                figi: figi,
                error: { message: error.message, stack: error.stack }
            });
            throw error;
        }
    }

    /**
     * Пакетное обучение всех нейросетей
     */
    async batchTrainAll(epochs = 50, batchSize = 16) {
        // Защита от повторного запуска
        if (this.isBatchTraining) {
            LoggerService.warn('Batch training already in progress, skipping duplicate request', {
                service: 'OptimizedTrainingService',
                operation: 'batchTrainAll'
            });
            return {
                success: false,
                message: 'Batch training is already running',
                isRunning: true
            };
        }

        this.isBatchTraining = true;
        const startTime = Date.now();
        
         
        
        const TrainingStatusService = getService('TrainingStatusService');
        try {
            // Получаем все инструменты из кеша
            const instruments = await CacheService.getAllInstruments();
            if (!instruments || instruments.length === 0) {
                throw new Error('No instruments available for training');
            }
            
             
            
            // Используем существующий метод trainMultipleInstruments
            // (статус обучения обновляется внутри trainMultipleInstruments)
            const result = await this.trainMultipleInstruments(instruments, {
                epochs,
                batchSize,
                days: 180,
                useAdvancedFeatures: true,
                enableValidation: true
            });
            
            const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
             
            
            return result;
            
        } catch (error) {
            const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
            LoggerService.error('Batch training failed', {
                service: 'OptimizedTrainingService',
                operation: 'batchTrainAll',
                duration: duration,
                error: { message: error.message, stack: error.stack }
            });
            
            // Завершаем обучение с ошибкой
            if (TrainingStatusService) {
                TrainingStatusService.completeTraining('neuralNetwork', false);
            }
            throw error;
        } finally {
            // Снимаем флаг обучения
            this.isBatchTraining = false;
             
        }
    }

    /**
     * Подбор гиперпараметров на 3-5 FIGI
     * Тестирует различные комбинации epochs, batchSize, predictionHorizon, days
     * Поддерживает как grid search, так и Bayesian Optimization
     */
    async tuneHyperparameters(testFigis = null, options = {}) {
        const useBayesian = options.useBayesian !== false; // По умолчанию используем Bayesian Optimization
        
        if (useBayesian) {
            return await this.tuneHyperparametersBayesian(testFigis, options);
        } else {
            return await this.tuneHyperparametersGrid(testFigis, options);
        }
    }

    /**
     * Grid Search для подбора гиперпараметров (старый метод)
     */
    async tuneHyperparametersGrid(testFigis = null, options = {}) {
        try {
            // Получаем список FIGI для тестирования
            let figis = testFigis;
            if (!figis || figis.length === 0) {
                const instruments = await CacheService.getAllInstruments(10);
                if (!instruments || instruments.length === 0) {
                    throw new Error('No instruments available for hyperparameter tuning');
                }
                // Выбираем 3-5 инструментов для тестирования
                const count = Math.min(5, Math.max(3, instruments.length));
                figis = instruments.slice(0, count).map(inst => inst.figi);
            }

            // Сетка гиперпараметров для тестирования
            const epochsOptions = options.epochsOptions || [30, 50, 70];
            const batchSizeOptions = options.batchSizeOptions || [8, 16, 32];
            const daysOptions = options.daysOptions || [120, 180, 365];
            const horizonOptions = options.horizonOptions || [3, 5, 7];
            const lookbackOptions = options.lookbackOptions || [40, 60, 80]; // Lookback период для тестирования


            const results = [];
            let totalCombinations = epochsOptions.length * batchSizeOptions.length * daysOptions.length * horizonOptions.length * lookbackOptions.length;
            let currentCombination = 0;

            // Тестируем каждую комбинацию гиперпараметров
            for (const epochs of epochsOptions) {
                for (const batchSize of batchSizeOptions) {
                    for (const days of daysOptions) {
                        for (const horizon of horizonOptions) {
                            for (const lookback of lookbackOptions) {
                                currentCombination++;
                                const combination = { epochs, batchSize, days, horizon, lookback };

                                let totalAccuracy = 0;
                                let totalF1 = 0;
                                let totalAuc = 0;
                                let successfulTests = 0;
                                const figiResults = {};

                                // Тестируем на каждом FIGI
                                for (const figi of figis) {
                                    try {
                                        // Получаем данные
                                        const candles = await this.getTrainingData(figi, days);
                                        if (candles.length < 50) {
                                            LoggerService.warn('Insufficient data for training', {
                                                service: 'OptimizedTrainingService',
                                                operation: 'trainInstrument',
                                                figi: figi,
                                                candlesCount: candles.length
                                            });
                                            continue;
                                        }

                                        // Проверяем, что данных достаточно для указанного lookback
                                        if (candles.length < lookback + horizon) {
                                            LoggerService.warn('Insufficient data for hyperparameter tuning', {
                                                service: 'OptimizedTrainingService',
                                                operation: 'tuneHyperparameters',
                                                figi: figi,
                                                need: lookback + horizon,
                                                have: candles.length
                                            });
                                            continue;
                                        }

                                        // Подготавливаем фичи с указанными параметрами
                                        const { features, labels } = await OptimizedDataService.prepareTrainingData(
                                            candles, 
                                            lookback, // lookbackPeriod (из параметров)
                                            horizon, // predictionHorizon (из параметров)
                                            figi
                                        );

                                    if (features.length === 0) {
                                        LoggerService.warn('No features prepared for hyperparameter tuning', {
                                            service: 'OptimizedTrainingService',
                                            operation: 'tuneHyperparameters',
                                            figi: figi
                                        });
                                        continue;
                                    }

                                    // Создаем модель
                                    const model = await this.createOptimizedModel(features[0].length);

                                    // Обучаем модель
                                    const trainingResult = await this.trainModel(model, features, labels, epochs, batchSize);

                                    // Оцениваем производительность
                                    const split = this.timeBasedSplit(features, labels, 0.7, 0.15);
                                    const metrics = await this.calculateMetrics(model, split.val.features, split.val.labels);

                                    // Сохраняем результаты для этого FIGI
                                    figiResults[figi] = {
                                        accuracy: metrics.accuracy,
                                        f1: metrics.f1,
                                        auc: metrics.auc,
                                        precision: metrics.precision,
                                        recall: metrics.recall
                                    };

                                    totalAccuracy += metrics.accuracy;
                                    totalF1 += metrics.f1;
                                    totalAuc += metrics.auc;
                                    successfulTests++;
                                        // Освобождаем память
                                        model.dispose();

                                    } catch (error) {
                                        LoggerService.error('Error testing during hyperparameter tuning', {
                                            service: 'OptimizedTrainingService',
                                            operation: 'tuneHyperparameters',
                                            figi: figi,
                                            error: { message: error.message, stack: error.stack }
                                        });
                                        figiResults[figi] = { error: error.message };
                                    }
                                }

                                // Рассчитываем средние метрики
                                if (successfulTests > 0) {
                                    const avgAccuracy = totalAccuracy / successfulTests;
                                    const avgF1 = totalF1 / successfulTests;
                                    const avgAuc = totalAuc / successfulTests;

                                    results.push({
                                        combination,
                                        metrics: {
                                            accuracy: avgAccuracy,
                                            f1: avgF1,
                                            auc: avgAuc,
                                            successfulTests,
                                            totalTests: figis.length
                                        },
                                        figiResults
                                    });
                                } else {
                                    LoggerService.warn('No successful tests for hyperparameter combination', {
                                        service: 'OptimizedTrainingService',
                                        operation: 'tuneHyperparameters'
                                    });
                                }
                            }
                        }
                    }
                }
            }

            // Сортируем результаты по F1 score (комплексная метрика)
            results.sort((a, b) => b.metrics.f1 - a.metrics.f1);

            // Выбираем лучшую комбинацию
            const bestCombination = results[0];

            // Сохраняем лучшие параметры
            if (bestCombination) {
                await this.saveBestHyperparameters(bestCombination.combination, bestCombination.metrics, figis);
            }

            return {
                best: bestCombination.combination,
                bestMetrics: bestCombination.metrics,
                allResults: results,
                testedFigis: figis,
                method: 'grid_search'
            };

        } catch (error) {
            LoggerService.error('Hyperparameter tuning failed', {
                service: 'OptimizedTrainingService',
                operation: 'tuneHyperparametersGrid',
                error: { message: error.message, stack: error.stack }
            });
            throw error;
        }
    }

    /**
     * Bayesian Optimization для подбора гиперпараметров
     * Более эффективный метод, который использует вероятностную модель для выбора следующих параметров
     */
    async tuneHyperparametersBayesian(testFigis = null, options = {}) {
        try {
            // Получаем список FIGI для тестирования
            let figis = testFigis;
            if (!figis || figis.length === 0) {
                const instruments = await CacheService.getAllInstruments(10);
                if (!instruments || instruments.length === 0) {
                    throw new Error('No instruments available for hyperparameter tuning');
                }
                const count = Math.min(5, Math.max(3, instruments.length));
                figis = instruments.slice(0, count).map(inst => inst.figi);
            }

            // Диапазоны гиперпараметров
            const paramRanges = {
                epochs: options.epochsRange || { min: 20, max: 80, step: 10 },
                batchSize: options.batchSizeRange || { min: 8, max: 64, step: 8 },
                days: options.daysRange || { min: 90, max: 365, step: 30 },
                horizon: options.horizonRange || { min: 3, max: 10, step: 1 },
                lookback: options.lookbackRange || { min: 30, max: 90, step: 10 }
            };

            const maxIterations = options.maxIterations || 20; // Количество итераций Bayesian Optimization
            const initialRandomSamples = options.initialRandomSamples || 5; // Начальные случайные образцы

            const observedParams = []; // Наблюденные параметры
            const observedScores = []; // Наблюденные метрики (F1-score)

            // Функция для нормализации параметров в диапазон [0, 1]
            const normalizeParams = (params) => {
                return {
                    epochs: (params.epochs - paramRanges.epochs.min) / (paramRanges.epochs.max - paramRanges.epochs.min),
                    batchSize: (params.batchSize - paramRanges.batchSize.min) / (paramRanges.batchSize.max - paramRanges.batchSize.min),
                    days: (params.days - paramRanges.days.min) / (paramRanges.days.max - paramRanges.days.min),
                    horizon: (params.horizon - paramRanges.horizon.min) / (paramRanges.horizon.max - paramRanges.horizon.min),
                    lookback: (params.lookback - paramRanges.lookback.min) / (paramRanges.lookback.max - paramRanges.lookback.min)
                };
            };

            // Функция для денормализации параметров
            const denormalizeParams = (normalized) => {
                return {
                    epochs: Math.round(normalized.epochs * (paramRanges.epochs.max - paramRanges.epochs.min) + paramRanges.epochs.min),
                    batchSize: Math.round(normalized.batchSize * (paramRanges.batchSize.max - paramRanges.batchSize.min) + paramRanges.batchSize.min),
                    days: Math.round(normalized.days * (paramRanges.days.max - paramRanges.days.min) + paramRanges.days.min),
                    horizon: Math.round(normalized.horizon * (paramRanges.horizon.max - paramRanges.horizon.min) + paramRanges.horizon.min),
                    lookback: Math.round(normalized.lookback * (paramRanges.lookback.max - paramRanges.lookback.min) + paramRanges.lookback.min)
                };
            };

            // Функция для оценки параметров
            const evaluateParams = async (params) => {
                let totalF1 = 0;
                let successfulTests = 0;

                for (const figi of figis) {
                    try {
                        const candles = await this.getTrainingData(figi, params.days);
                        if (candles.length < params.lookback + params.horizon) {
                            continue;
                        }

                        const { features, labels } = await OptimizedDataService.prepareTrainingData(
                            candles,
                            params.lookback,
                            params.horizon,
                            figi
                        );

                        if (features.length === 0) {
                            continue;
                        }

                        const model = await this.createOptimizedModel(features[0].length);
                        await this.trainModel(model, features, labels, params.epochs, params.batchSize);
                        
                        const split = this.timeBasedSplit(features, labels, 0.7, 0.15);
                        const metrics = await this.calculateMetrics(model, split.val.features, split.val.labels);
                        
                        totalF1 += metrics.f1;
                        successfulTests++;
                        model.dispose();
                    } catch (error) {
                        // Пропускаем ошибки
                        continue;
                    }
                }

                return successfulTests > 0 ? totalF1 / successfulTests : 0;
            };

            // Начальные случайные образцы
            LoggerService.info('Bayesian Optimization: Starting with random samples', {
                service: 'OptimizedTrainingService',
                operation: 'tuneHyperparametersBayesian',
                initialSamples: initialRandomSamples
            });

            for (let i = 0; i < initialRandomSamples; i++) {
                const randomParams = {
                    epochs: Math.round(Math.random() * (paramRanges.epochs.max - paramRanges.epochs.min) + paramRanges.epochs.min),
                    batchSize: Math.round(Math.random() * (paramRanges.batchSize.max - paramRanges.batchSize.min) + paramRanges.batchSize.min),
                    days: Math.round(Math.random() * (paramRanges.days.max - paramRanges.days.min) + paramRanges.days.min),
                    horizon: Math.round(Math.random() * (paramRanges.horizon.max - paramRanges.horizon.min) + paramRanges.horizon.min),
                    lookback: Math.round(Math.random() * (paramRanges.lookback.max - paramRanges.lookback.min) + paramRanges.lookback.min)
                };

                const score = await evaluateParams(randomParams);
                observedParams.push(normalizeParams(randomParams));
                observedScores.push(score);

                LoggerService.info(`Bayesian Optimization: Sample ${i + 1}/${initialRandomSamples}`, {
                    service: 'OptimizedTrainingService',
                    operation: 'tuneHyperparametersBayesian',
                    params: randomParams,
                    score: score.toFixed(4)
                });
            }

            // Bayesian Optimization итерации
            for (let iteration = 0; iteration < maxIterations; iteration++) {
                // Упрощенная версия: используем Expected Improvement (EI)
                // Выбираем следующую точку, которая максимизирует Expected Improvement
                let bestNextParams = null;
                let bestEI = -Infinity;

                // Генерируем кандидатов для следующей итерации
                const numCandidates = 50;
                for (let c = 0; c < numCandidates; c++) {
                    const candidate = {
                        epochs: Math.random(),
                        batchSize: Math.random(),
                        days: Math.random(),
                        horizon: Math.random(),
                        lookback: Math.random()
                    };

                    // Вычисляем Expected Improvement
                    // Упрощенная версия: используем расстояние до лучших наблюдений
                    const bestObservedScore = Math.max(...observedScores);
                    const distances = observedParams.map(obs => {
                        const dist = Math.sqrt(
                            Math.pow(candidate.epochs - obs.epochs, 2) +
                            Math.pow(candidate.batchSize - obs.batchSize, 2) +
                            Math.pow(candidate.days - obs.days, 2) +
                            Math.pow(candidate.horizon - obs.horizon, 2) +
                            Math.pow(candidate.lookback - obs.lookback, 2)
                        );
                        return dist;
                    });
                    const minDistance = Math.min(...distances);

                    // Expected Improvement: чем дальше от наблюдений и чем выше потенциальный score, тем лучше
                    // Упрощенная версия: используем комбинацию расстояния и оптимистичной оценки
                    const ei = minDistance * (1 + Math.random() * 0.5); // Упрощенная оценка

                    if (ei > bestEI) {
                        bestEI = ei;
                        bestNextParams = candidate;
                    }
                }

                // Оцениваем выбранные параметры
                const nextParams = denormalizeParams(bestNextParams);
                const score = await evaluateParams(nextParams);
                observedParams.push(bestNextParams);
                observedScores.push(score);

                LoggerService.info(`Bayesian Optimization: Iteration ${iteration + 1}/${maxIterations}`, {
                    service: 'OptimizedTrainingService',
                    operation: 'tuneHyperparametersBayesian',
                    params: nextParams,
                    score: score.toFixed(4),
                    bestScore: Math.max(...observedScores).toFixed(4)
                });
            }

            // Находим лучшие параметры
            const bestIndex = observedScores.indexOf(Math.max(...observedScores));
            const bestParams = denormalizeParams(observedParams[bestIndex]);
            const bestScore = observedScores[bestIndex];

            // Сохраняем лучшие параметры
            await this.saveBestHyperparameters(bestParams, { f1: bestScore }, figis);

            LoggerService.info('Bayesian Optimization completed', {
                service: 'OptimizedTrainingService',
                operation: 'tuneHyperparametersBayesian',
                bestParams,
                bestScore: bestScore.toFixed(4),
                totalIterations: initialRandomSamples + maxIterations
            });

            return {
                best: bestParams,
                bestMetrics: { f1: bestScore },
                allResults: observedParams.map((p, i) => ({
                    combination: denormalizeParams(p),
                    metrics: { f1: observedScores[i] }
                })),
                testedFigis: figis,
                method: 'bayesian_optimization'
            };

        } catch (error) {
            LoggerService.error('Bayesian Optimization failed', {
                service: 'OptimizedTrainingService',
                operation: 'tuneHyperparametersBayesian',
                error: { message: error.message, stack: error.stack }
            });
            throw error;
        }
    }

    /**
     * Обнаружение дрейфа данных (data drift)
     * Сравнивает текущее распределение данных с базовым распределением
     * @param {Array} currentFeatures - Текущие фичи
     * @param {Array} baselineFeatures - Базовые фичи (из обучающей выборки)
     * @returns {Object} - Результат проверки дрейфа
     */
    detectDataDrift(currentFeatures, baselineFeatures) {
        if (!currentFeatures || !baselineFeatures || 
            currentFeatures.length === 0 || baselineFeatures.length === 0) {
            return {
                hasDrift: false,
                driftScore: 0,
                reason: 'Insufficient data for drift detection'
            };
        }

        const featureSize = currentFeatures[0]?.length || 0;
        if (featureSize === 0 || baselineFeatures[0]?.length !== featureSize) {
            return {
                hasDrift: false,
                driftScore: 0,
                reason: 'Feature size mismatch'
            };
        }

        // Вычисляем статистики для каждой фичи
        const driftScores = [];
        for (let i = 0; i < featureSize; i++) {
            const baselineValues = baselineFeatures.map(f => f[i]).filter(v => isFinite(v) && !isNaN(v));
            const currentValues = currentFeatures.map(f => f[i]).filter(v => isFinite(v) && !isNaN(v));

            if (baselineValues.length === 0 || currentValues.length === 0) {
                continue;
            }

            // Вычисляем среднее и стандартное отклонение
            const baselineMean = baselineValues.reduce((sum, v) => sum + v, 0) / baselineValues.length;
            const currentMean = currentValues.reduce((sum, v) => sum + v, 0) / currentValues.length;

            const baselineStd = Math.sqrt(
                baselineValues.reduce((sum, v) => sum + Math.pow(v - baselineMean, 2), 0) / baselineValues.length
            );
            const currentStd = Math.sqrt(
                currentValues.reduce((sum, v) => sum + Math.pow(v - currentMean, 2), 0) / currentValues.length
            );

            // Вычисляем дрейф как комбинацию изменения среднего и стандартного отклонения
            const meanDrift = baselineStd > 0 ? Math.abs(currentMean - baselineMean) / baselineStd : 0;
            const stdDrift = baselineStd > 0 ? Math.abs(currentStd - baselineStd) / baselineStd : 0;
            
            // Общий дрейф для этой фичи
            const featureDrift = (meanDrift + stdDrift) / 2;
            driftScores.push(featureDrift);
        }

        // Средний дрейф по всем фичам
        const avgDrift = driftScores.length > 0 
            ? driftScores.reduce((sum, s) => sum + s, 0) / driftScores.length 
            : 0;

        // Порог для обнаружения дрейфа (0.3 = 30% изменение)
        const driftThreshold = 0.3;
        const hasDrift = avgDrift > driftThreshold;

        return {
            hasDrift,
            driftScore: avgDrift,
            featureDrifts: driftScores,
            threshold: driftThreshold,
            severity: avgDrift > 0.5 ? 'HIGH' : avgDrift > 0.3 ? 'MEDIUM' : 'LOW'
        };
    }

    /**
     * Триггерное обучение при обнаружении дрейфа данных
     * @param {string} figi - FIGI инструмента
     * @param {Object} options - Опции обучения
     * @returns {Promise<Object>} - Результат обучения
     */
    async triggerTrainingOnDrift(figi, options = {}) {
        try {
            LoggerService.info('Checking for data drift', {
                service: 'OptimizedTrainingService',
                operation: 'triggerTrainingOnDrift',
                figi
            });

            // Получаем текущие данные
            const currentCandles = await this.getTrainingData(figi, 30); // Последние 30 дней
            if (currentCandles.length < 20) {
                return {
                    triggered: false,
                    reason: 'Insufficient current data'
                };
            }

            // Получаем базовые данные (из последнего обучения)
            const baselineCandles = await this.getTrainingData(figi, 180); // Более длинный период для базовой линии
            if (baselineCandles.length < 50) {
                return {
                    triggered: false,
                    reason: 'Insufficient baseline data'
                };
            }

            // Подготавливаем фичи
            const { features: currentFeatures } = await this.prepareFeatures(currentCandles, figi, true);
            const { features: baselineFeatures } = await this.prepareFeatures(
                baselineCandles.slice(-60), // Берем последние 60 свечей из базовой линии
                figi, 
                true
            );

            if (currentFeatures.length === 0 || baselineFeatures.length === 0) {
                return {
                    triggered: false,
                    reason: 'Failed to prepare features'
                };
            }

            // Обнаруживаем дрейф
            const driftResult = this.detectDataDrift(currentFeatures, baselineFeatures);

            if (driftResult.hasDrift) {
                LoggerService.warn('Data drift detected, triggering retraining', {
                    service: 'OptimizedTrainingService',
                    operation: 'triggerTrainingOnDrift',
                    figi,
                    driftScore: driftResult.driftScore.toFixed(4),
                    severity: driftResult.severity
                });

                // Запускаем обучение
                const trainingResult = await this.trainInstrument(figi, {
                    ...options,
                    reason: 'data_drift',
                    driftScore: driftResult.driftScore,
                    severity: driftResult.severity
                });

                return {
                    triggered: true,
                    driftResult,
                    trainingResult
                };
            } else {
                LoggerService.info('No data drift detected', {
                    service: 'OptimizedTrainingService',
                    operation: 'triggerTrainingOnDrift',
                    figi,
                    driftScore: driftResult.driftScore.toFixed(4)
                });

                return {
                    triggered: false,
                    driftResult
                };
            }
        } catch (error) {
            LoggerService.error('Error in trigger training on drift', {
                service: 'OptimizedTrainingService',
                operation: 'triggerTrainingOnDrift',
                figi,
                error: { message: error.message, stack: error.stack }
            });
            throw error;
        }
    }

    /**
     * SMOTE (Synthetic Minority Over-sampling Technique)
     * Генерирует синтетические образцы для балансировки классов
     * @param {Array} features - Массив фичей
     * @param {Array} labels - Массив меток
     * @param {Object} options - Опции SMOTE
     * @returns {Object} - Сбалансированные данные
     */
    applySMOTE(features, labels, options = {}) {
        const {
            k = 5, // Количество ближайших соседей
            ratio = 1.0 // Целевое соотношение классов (1.0 = полный баланс)
        } = options;

        if (features.length === 0 || labels.length === 0) {
            return { features, labels };
        }

        // Разделяем на классы
        const minorityClass = labels.filter(l => l === 1).length < labels.filter(l => l === 0).length ? 1 : 0;
        const majorityClass = 1 - minorityClass;

        const minorityIndices = labels.map((l, i) => l === minorityClass ? i : null).filter(i => i !== null);
        const majorityIndices = labels.map((l, i) => l === majorityClass ? i : null).filter(i => i !== null);

        if (minorityIndices.length === 0 || majorityIndices.length === 0) {
            return { features, labels };
        }

        // Вычисляем, сколько синтетических образцов нужно создать
        const targetCount = Math.floor(majorityIndices.length * ratio);
        const samplesNeeded = Math.max(0, targetCount - minorityIndices.length);

        if (samplesNeeded === 0) {
            return { features, labels };
        }

        const syntheticFeatures = [];
        const syntheticLabels = [];

        // Функция для вычисления расстояния между двумя векторами
        const euclideanDistance = (a, b) => {
            let sum = 0;
            for (let i = 0; i < a.length; i++) {
                sum += Math.pow(a[i] - b[i], 2);
            }
            return Math.sqrt(sum);
        };

        // Находим k ближайших соседей для каждого образца меньшинства
        for (let i = 0; i < samplesNeeded; i++) {
            // Выбираем случайный образец из меньшинства
            const randomIndex = minorityIndices[Math.floor(Math.random() * minorityIndices.length)];
            const sample = features[randomIndex];

            // Находим k ближайших соседей из того же класса
            const distances = minorityIndices.map(idx => ({
                index: idx,
                distance: euclideanDistance(sample, features[idx])
            }));

            distances.sort((a, b) => a.distance - b.distance);
            const nearestNeighbors = distances.slice(1, k + 1); // Исключаем сам образец

            if (nearestNeighbors.length === 0) {
                continue;
            }

            // Выбираем случайного соседа
            const neighbor = nearestNeighbors[Math.floor(Math.random() * nearestNeighbors.length)];
            const neighborSample = features[neighbor.index];

            // Генерируем синтетический образец
            const randomFactor = Math.random(); // От 0 до 1
            const synthetic = sample.map((val, idx) => 
                val + randomFactor * (neighborSample[idx] - val)
            );

            syntheticFeatures.push(synthetic);
            syntheticLabels.push(minorityClass);
        }

        // Объединяем оригинальные и синтетические данные
        const balancedFeatures = [...features, ...syntheticFeatures];
        const balancedLabels = [...labels, ...syntheticLabels];

        LoggerService.info('SMOTE applied', {
            service: 'OptimizedTrainingService',
            operation: 'applySMOTE',
            originalMinorityCount: minorityIndices.length,
            originalMajorityCount: majorityIndices.length,
            syntheticSamples: syntheticFeatures.length,
            finalMinorityCount: balancedLabels.filter(l => l === minorityClass).length,
            finalMajorityCount: balancedLabels.filter(l => l === majorityClass).length
        });

        return {
            features: balancedFeatures,
            labels: balancedLabels
        };
    }

    /**
     * Проверка качества данных перед обучением
     * @param {Array} features - Массив фичей
     * @param {Array} labels - Массив меток
     * @returns {Object} - Результат проверки качества данных
     */
    validateDataQuality(features, labels) {
        const issues = [];
        const warnings = [];
        const stats = {
            totalSamples: features.length,
            featureSize: features.length > 0 ? features[0].length : 0,
            positiveLabels: 0,
            negativeLabels: 0,
            nanFeatures: 0,
            infinityFeatures: 0,
            constantFeatures: [],
            missingValues: 0
        };

        if (features.length === 0 || labels.length === 0) {
            issues.push('Empty dataset');
            return { valid: false, issues, warnings, stats };
        }

        if (features.length !== labels.length) {
            issues.push(`Mismatch: ${features.length} features vs ${labels.length} labels`);
            return { valid: false, issues, warnings, stats };
        }

        // Проверка меток
        for (let i = 0; i < labels.length; i++) {
            if (labels[i] === 1) stats.positiveLabels++;
            else if (labels[i] === 0) stats.negativeLabels++;
            else {
                issues.push(`Invalid label at index ${i}: ${labels[i]} (expected 0 or 1)`);
            }
        }

        // Проверка фичей
        if (stats.featureSize === 0) {
            issues.push('Empty feature vectors');
            return { valid: false, issues, warnings, stats };
        }

        // Проверка на NaN, Infinity и константные фичи
        for (let j = 0; j < stats.featureSize; j++) {
            let hasNaN = false;
            let hasInfinity = false;
            let isConstant = true;
            const firstValue = features[0][j];
            
            for (let i = 0; i < features.length; i++) {
                const value = features[i][j];
                
                if (typeof value !== 'number') {
                    issues.push(`Non-numeric feature at [${i}][${j}]: ${typeof value}`);
                    hasNaN = true;
                } else if (isNaN(value)) {
                    stats.nanFeatures++;
                    hasNaN = true;
                } else if (!isFinite(value)) {
                    stats.infinityFeatures++;
                    hasInfinity = true;
                }
                
                if (value !== firstValue) {
                    isConstant = false;
                }
            }
            
            if (hasNaN) {
                stats.missingValues++;
                issues.push(`Feature ${j} contains NaN values`);
            }
            
            if (hasInfinity) {
                warnings.push(`Feature ${j} contains Infinity values`);
            }
            
            if (isConstant && features.length > 1) {
                stats.constantFeatures.push(j);
                warnings.push(`Feature ${j} is constant (value: ${firstValue})`);
            }
        }

        // Проверка дисбаланса классов
        const classImbalance = Math.abs(stats.positiveLabels - stats.negativeLabels) / labels.length;
        if (classImbalance > 0.7) {
            warnings.push(`Severe class imbalance: ${(classImbalance * 100).toFixed(2)}%`);
        }

        // Проверка минимального количества данных
        if (features.length < 10) {
            issues.push(`Insufficient samples: ${features.length} (minimum: 10)`);
        }

        // Проверка минимального количества данных для каждого класса
        if (stats.positiveLabels < 2 || stats.negativeLabels < 2) {
            issues.push(`Insufficient samples per class: positive=${stats.positiveLabels}, negative=${stats.negativeLabels} (minimum: 2 each)`);
        }

        return {
            valid: issues.length === 0,
            issues,
            warnings,
            stats
        };
    }

    /**
     * Вычисление адаптивных параметров обучения на основе данных
     * @param {number} dataSize - Размер обучающей выборки
     * @param {number} featureSize - Размер вектора фичей
     * @param {number} classImbalance - Дисбаланс классов (0-1)
     * @returns {Object} - Адаптивные параметры обучения
     */
    calculateAdaptiveTrainingParams(dataSize, featureSize, classImbalance = 0) {
        // Адаптивные epochs: больше данных = больше epochs, но с ограничением
        const baseEpochs = 30;
        const dataBasedEpochs = Math.min(50, Math.max(20, Math.floor(dataSize / 50)));
        const epochs = Math.max(baseEpochs, dataBasedEpochs);

        // Адаптивный batch size: зависит от размера данных
        // Для малых данных используем меньший batch size
        let batchSize;
        if (dataSize < 100) {
            batchSize = 16;
        } else if (dataSize < 500) {
            batchSize = 32;
        } else if (dataSize < 2000) {
            batchSize = 64;
        } else {
            batchSize = 128;
        }

        // Адаптивный learning rate: зависит от размера данных и дисбаланса
        // Для малых данных или сильного дисбаланса используем меньший learning rate
        let learningRate = 0.0005; // Базовый learning rate
        if (dataSize < 200 || classImbalance > 0.5) {
            learningRate = 0.0003; // Более консервативный learning rate
        } else if (dataSize > 2000) {
            learningRate = 0.0007; // Немного более агрессивный для больших данных
        }

        return {
            epochs,
            batchSize,
            learningRate
        };
    }

    /**
     * Сохранение лучших гиперпараметров в файл
     * @param {Object} params - Параметры для сохранения
     * @param {Object} metrics - Метрики для сохранения
     * @param {Array} figis - Список FIGI, на которых тестировались параметры
     */
    async saveBestHyperparameters(params, metrics, figis = []) {
        try {
            const fs = await import('fs/promises');
            const path = await import('path');
            const { fileURLToPath } = await import('url');
            
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = path.dirname(__filename);
            const configDir = path.join(__dirname, '../../config');
            const filePath = path.join(configDir, 'best_hyperparameters.json');

            // Создаем директорию, если её нет
            try {
                await fs.access(configDir);
            } catch {
                await fs.mkdir(configDir, { recursive: true });
            }

            const data = {
                params: {
                    epochs: params.epochs,
                    batchSize: params.batchSize,
                    learningRate: params.learningRate || 0.0005,
                    days: params.days,
                    horizon: params.horizon,
                    lookback: params.lookback
                },
                metrics: {
                    f1: metrics.f1 || 0,
                    accuracy: metrics.accuracy || 0,
                    precision: metrics.precision || 0,
                    recall: metrics.recall || 0
                },
                testedFigis: figis,
                savedAt: new Date().toISOString()
            };

            await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
            
            LoggerService.info('Best hyperparameters saved', {
                service: 'OptimizedTrainingService',
                operation: 'saveBestHyperparameters',
                filePath
            });
        } catch (error) {
            LoggerService.error('Failed to save best hyperparameters', {
                service: 'OptimizedTrainingService',
                operation: 'saveBestHyperparameters',
                error: { message: error.message, stack: error.stack }
            });
        }
    }

    /**
     * Загрузка сохраненных лучших гиперпараметров из файла
     * @returns {Promise<Object|null>} - Сохраненные параметры или null
     */
    async loadBestHyperparameters() {
        try {
            const fs = await import('fs/promises');
            const path = await import('path');
            const { fileURLToPath } = await import('url');
            
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = path.dirname(__filename);
            const filePath = path.join(__dirname, '../../config/best_hyperparameters.json');

            const content = await fs.readFile(filePath, 'utf-8');
            const data = JSON.parse(content);
            
            return data.params || null;
        } catch (error) {
            // Файл не существует или ошибка чтения - это нормально
            return null;
        }
    }

    /**
     * Подписка на события (для совместимости с NeuralNetworkService)
     */
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(callback);
    }

    /**
     * Отписка от событий
     */
    off(event, callback) {
        if (this.eventListeners.has(event)) {
            const listeners = this.eventListeners.get(event);
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    /**
     * Вызов обработчиков события
     */
    emit(event, data) {
        if (this.eventListeners.has(event)) {
            const listeners = this.eventListeners.get(event);
            listeners.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    LoggerService.error('Error in event listener', {
                        service: 'OptimizedTrainingService',
                        operation: 'eventListener',
                        event: event,
                        error: { message: error.message, stack: error.stack }
                    });
                }
            });
        }
    }
}

export default new OptimizedTrainingService();
