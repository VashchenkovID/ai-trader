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
            epochs = 50,
            batchSize = 16,
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

            // 4.1. Разделение на train/validation/test (Фаза 2, задача 2.4.1)
            const { trainValidationTestSplit, timeBasedSplit } = await import('../utils/dataSplitUtils.js');
            const useTimeBasedSplit = options.timeBasedSplit !== false; // По умолчанию true для временных рядов
            
            let dataSplit;
            if (useTimeBasedSplit) {
                dataSplit = timeBasedSplit(features, labels, {
                    trainRatio: options.trainRatio || 0.7,
                    validationRatio: options.validationRatio || 0.15,
                    testRatio: options.testRatio || 0.15
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
            let model = await this.loadModel(figi, inputSize);
            if (!model) {
                model = await this.createOptimizedModel(inputSize);
            }

            // 6. Обучение на train set с валидацией на validation set
            let trainingResult;
            if (useWorker) {
                try {
                    // Для воркера объединяем train и validation (воркер сам разделит через validationSplit)
                    const combinedFeatures = [...trainFeatures, ...validationFeatures];
                    const combinedLabels = [...trainLabels, ...validationLabels];
                    trainingResult = await this.trainModelViaWorker(combinedFeatures, combinedLabels, epochs, batchSize, 'nn');
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
                    trainingResult = await this.trainModel(model, [...trainFeatures, ...validationFeatures], [...trainLabels, ...validationLabels], epochs, batchSize);
                }
            } else {
                // Локальное обучение - используем train + validation вместе (trainModel сам разделит через validationData)
                // Но для правильной валидации на validation set, создаем отдельные тензоры
                trainingResult = await this.trainModelWithExplicitValidation(
                    model, 
                    trainFeatures, 
                    trainLabels, 
                    validationFeatures, 
                    validationLabels, 
                    epochs, 
                    batchSize
                );
            }

            // 7. Финальная оценка на test set
            let testResult = null;
            if (enableValidation && testFeatures.length > 0) {
                testResult = await this.validateModel(model, testFeatures, testLabels);
            }
            
            // Для обратной совместимости используем testResult как validationResult
            const validationResult = testResult;

            // 6. Сохраняем модель
            await this.saveModel(figi, model);
            
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

            // 6.1. Условительное сохранение лучшей модели по вал. accuracy
            if (validationResult && typeof validationResult.accuracy === 'number') {
                const currentAccuracy = validationResult.accuracy;
                const bestMeta = await this.loadBestMeta(figi);
                const bestAcc = bestMeta?.bestAccuracy ?? -Infinity;
                if (currentAccuracy > bestAcc) {
                    await this.saveBestModel(figi, model, currentAccuracy);
                }
            }

            // 6.2. Проверка деградации и восстановление best-модели при необходимости
            if (validationResult && typeof validationResult.accuracy === 'number') {
                const currentMetrics = {
                    accuracy: validationResult.accuracy,
                    precision: validationResult.precision || 0,
                    recall: validationResult.recall || 0,
                    f1: validationResult.f1 || 0
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
                accuracy: trainingResult.finalAccuracy || 0,
                testAccuracy: testResult?.accuracy || null
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
        let currentIndex = 0;

        // Функция для обработки одного инструмента
        const processInstrument = async (instrument, index) => {
            try {
                // Обрабатываем как строки FIGI или как объекты
                const figi = typeof instrument === 'string' ? instrument : instrument.figi;
                const name = typeof instrument === 'string' ? figi : instrument.name;
                
                const result = await this.trainInstrument(figi, options);
                results.push(result);
                this.trainingProgress.completedInstruments++;
                
                // Обновляем прогресс в TrainingStatusService
                if (TrainingStatusService) {
                    const progress = ((results.length + errors.length) / instruments.length) * 100;
                    const ticker = typeof instrument === 'string' ? figi.substring(0, 10) : (instrument.ticker || name);
                    TrainingStatusService.updateProgress('neuralNetwork', progress, ticker);
                }
                
                // Уведомляем о прогрессе
                this.broadcastProgress(name, result.accuracy);
                
            } catch (error) {
                const figi = typeof instrument === 'string' ? instrument : instrument.figi;
                const name = typeof instrument === 'string' ? figi : instrument.name;
                errors.push({ figi, name, error: error.message });
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
                if (currentIndex < instruments.length) {
                    const nextInstrument = instruments[currentIndex++];
                    activeTrainings++;
                    processInstrument(nextInstrument, currentIndex - 1).catch(err => {
                        console.error('Error in parallel training:', err);
                    });
                }
            }
        };

        // Запускаем первые maxConcurrent обучений
        const initialPromises = [];
        for (let i = 0; i < Math.min(maxConcurrent, instruments.length); i++) {
            currentIndex = i + 1;
            activeTrainings++;
            initialPromises.push(processInstrument(instruments[i], i));
        }

        // Ждем завершения всех обучений
        await Promise.all(initialPromises);

        // Ждем завершения оставшихся активных обучений
        while (activeTrainings > 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
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
            console.warn('Error preparing features:', error.message);
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
     * Создание оптимизированной модели
     */
    async createOptimizedModel(inputShape) {
        console.log(`🧠 Создание оптимизированной модели нейросети...`);
        console.log(`   📊 Входной размер: ${inputShape}`);
        
        // L2 регуляризация для предотвращения переобучения
        const l2Regularizer = tf.regularizers.l2({ l2: 0.001 });
        
        const layer1Units = Math.min(128, Math.max(32, inputShape * 2));
        const layer2Units = Math.min(64, Math.max(16, inputShape));
        
        console.log(`   🏗️  Архитектура: Dense(${layer1Units}) -> Dropout(0.25) -> Dense(${layer2Units}) -> Dropout(0.2) -> Dense(1)`);
        
        const model = tf.sequential({
            layers: [
                tf.layers.dense({
                    units: layer1Units,
                    activation: 'relu',
                    inputShape: [inputShape],
                    kernelInitializer: 'heUniform',
                    kernelRegularizer: l2Regularizer // L2 регуляризация
                }),
                tf.layers.dropout({ rate: 0.25 }), // Увеличен dropout для лучшей регуляризации
                tf.layers.dense({
                    units: layer2Units,
                    activation: 'relu',
                    kernelInitializer: 'heUniform',
                    kernelRegularizer: l2Regularizer // L2 регуляризация
                }),
                tf.layers.dropout({ rate: 0.2 }), // Актуализированный dropout
                tf.layers.dense({
                    units: 1,
                    activation: 'sigmoid',
                    kernelInitializer: 'glorotUniform'
                    // Выходной слой без L2 для сохранения предсказательной способности
                })
            ]
        });

        console.log(`   ⚙️  Компиляция модели: optimizer=adam(0.001), loss=binaryCrossentropy, metrics=[accuracy]`);
        
        model.compile({
            optimizer: tf.train.adam(0.001),
            loss: 'binaryCrossentropy',
            metrics: ['accuracy']
        });

        const totalParams = model.countParams();
        console.log(`   ✅ Модель успешно создана: ${model.layers.length} слоев, ${totalParams.toLocaleString()} параметров`);
        
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
                console.warn('Failed to register worker in monitoring service:', monitoringError);
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
                            console.warn('Failed to complete worker in monitoring service:', monitoringError);
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
                            console.warn('Failed to report worker error in monitoring service:', monitoringError);
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
                            console.warn('Failed to update worker progress in monitoring service:', monitoringError);
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
                        console.warn('Failed to report worker error in monitoring service:', monitoringError);
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
                        console.warn('Failed to complete worker in monitoring service:', monitoringError);
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
                    console.warn(`⚠️ Feature size mismatch in calculateMetrics: model expects ${expectedSize}, got ${featureSize}. Skipping metrics calculation.`);
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
            
            // Precision, Recall, F1
            const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
            const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
            const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;
            
            // ROC-AUC (упрощенный расчет через площадь под кривой)
            const sortedPairs = probs.map((prob, i) => ({ prob, label: labels[i] }))
                .sort((a, b) => b.prob - a.prob);
            
            let auc = 0;
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
            }
            
            return {
                precision,
                recall,
                f1,
                auc,
                accuracy: (tp + tn) / (tp + tn + fp + fn),
                confusionMatrix: { tp, fp, tn, fn }
            };
        } catch (error) {
            console.error('Error calculating metrics:', error);
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
        
        // Взвешивание свежих данных для train: более новые примеры получают больший вес
        const n = split.train.features.length;
        const weightedFeatures = [];
        const weightedLabels = [];
        
        if (n > 0) {
            for (let i = 0; i < n; i++) {
                const weight = 0.7 + (0.6 * i) / Math.max(1, n - 1); // от 0.7 до 1.3
                const repetitions = Math.max(1, Math.round(weight)); // количество повторений
                
                // Добавляем пример несколько раз в зависимости от веса
                for (let j = 0; j < repetitions; j++) {
                    weightedFeatures.push(split.train.features[i]);
                    weightedLabels.push(split.train.labels[i]);
                }
            }
        }
        
        // Используем взвешенные данные для обучения
        const finalTrainFeatures = weightedFeatures.length > 0 ? weightedFeatures : split.train.features;
        const finalTrainLabels = weightedLabels.length > 0 ? weightedLabels : split.train.labels;
        
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
        let patience = 10; // Количество эпох без улучшения для early stopping
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
                    
                    // Early stopping и reduce LR on plateau
                    const valLoss = logs.val_loss || logs.loss;
                    const valAccuracy = logs.val_acc || logs.acc || 0;
                    const accuracy = logs.acc || 0;
                    
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
                                    console.warn(`⚠️ Не удалось изменить LR: ${lrError.message}`);
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
    async saveModel(figi, model) {
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
            
            // Сохраняем архитектуру модели
            const modelPath = path.join(modelsDir, `${figi}_model.json`);
            const weightsPath = path.join(modelsDir, `${figi}_weights.json`);
            
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
            
            // Также сохраняем через ModelManager для совместимости
            try {
                await ModelManager.saveModel(model, `neural/${figi}`);
            } catch (modelManagerError) {
                console.warn(`⚠️ Failed to save model via ModelManager for ${figi}: ${modelManagerError.message}`);
            }
            
            // Также сохраняем в памяти для быстрого доступа
            this.currentModel = { figi, model };
            
        } catch (error) {
            console.warn('Failed to save model:', error.message);
        }
    }

    /**
     * Сохранить лучшую модель и метаданные
     */
    async saveBestModel(figi, model, bestAccuracy) {
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
            await fs.writeFile(metaPath, JSON.stringify({
                bestAccuracy,
                savedAt: new Date().toISOString()
            }, null, 2));
            
            // Устанавливаем права на все файлы
            try {
                await fs.chmod(bestModelPath, 0o666);
                await fs.chmod(bestWeightsPath, 0o666);
                await fs.chmod(metaPath, 0o666);
            } catch (chmodError) {
                // Игнорируем ошибки chmod
            }
        } catch (error) {
            console.warn(`⚠️ Failed to save best model for ${figi}:`, error.message);
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
                console.warn(`⚠️ Invalid weights format for best model ${figi}, skipping load`);
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
            console.warn(`⚠️ Failed to load best model for ${figi}:`, error.message);
            return null;
        }
    }

    /**
     * Проверка деградации модели и восстановление best-модели при необходимости
     */
    async checkDegradationAndRestore(figi, currentModel, currentMetrics = null) {
        try {
            const bestMeta = await this.loadBestMeta(figi);
            if (!bestMeta || !bestMeta.bestAccuracy) {
                // Нет best-модели, текущая модель становится best
                if (currentMetrics && currentMetrics.accuracy) {
                    await this.saveBestModel(figi, currentModel, currentMetrics.accuracy);
                }
                return { degraded: false, restored: false };
            }

            const bestAccuracy = bestMeta.bestAccuracy;
            const degradationThreshold = 0.05; // 5% деградация - порог для восстановления

            // Если есть текущие метрики, сравниваем с best
            if (currentMetrics && currentMetrics.accuracy) {
                const currentAccuracy = currentMetrics.accuracy;
                const degradation = bestAccuracy - currentAccuracy;

                if (degradation > degradationThreshold) {
                    console.warn(`⚠️ Model degradation detected for ${figi}: current=${currentAccuracy.toFixed(4)}, best=${bestAccuracy.toFixed(4)}, degradation=${(degradation*100).toFixed(2)}%`);
                    
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
                                    currentAccuracy,
                                    bestAccuracy,
                                    degradation: degradation * 100,
                                    restored: true
                                },
                                timestamp: new Date().toISOString()
                            });
                        }

                        return { degraded: true, restored: true, bestModel };
                    }
                } else if (currentAccuracy > bestAccuracy) {
                    // Текущая модель лучше best - обновляем best
                    await this.saveBestModel(figi, currentModel, currentAccuracy);
                    return { degraded: false, restored: false, bestUpdated: true };
                }
            }

            return { degraded: false, restored: false };
        } catch (error) {
            console.error(`❌ Error checking degradation for ${figi}:`, error.message);
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
                confusionMatrix: metrics.confusionMatrix
            };
        } catch (error) {
            console.error(`❌ Error evaluating model performance for ${figi}:`, error.message);
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
                console.warn(`⚠️ Invalid weights format for ${figi}, skipping load`);
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
                console.warn(`⚠️ Failed to load per-FIGI model for ${figi}:`, figiError.message);
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
                console.warn(`⚠️ Failed to load model via ModelManager for ${figi}:`, modelManagerError.message);
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
                        console.warn(`⚠️ Invalid weights format for general model, skipping load`);
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
                console.warn(`⚠️ Failed to load general model as fallback for ${figi}:`, generalError.message);
            }

            // Fallback: модель не найдена, вернем null (будет создана новая)
            return null;
        } catch (error) {
            console.warn(`⚠️ Failed to load model for ${figi}:`, error.message);
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
                console.warn(`⚠️ Invalid weights format for ${figi}, model loaded without weights`);
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
            console.error(`❌ Error loading model for ${figi}:`, error.message);
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
            console.error(`Error predicting for ${figi}:`, error);
            throw error;
        }
    }

    /**
     * Пакетное обучение всех нейросетей
     */
    async batchTrainAll(epochs = 50, batchSize = 16) {
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
            
            return result;
            
        } catch (error) {
            // Завершаем обучение с ошибкой
            if (TrainingStatusService) {
                TrainingStatusService.completeTraining('neuralNetwork', false);
            }
            throw error;
        }
    }

    /**
     * Подбор гиперпараметров на 3-5 FIGI
     * Тестирует различные комбинации epochs, batchSize, predictionHorizon, days
     */
    async tuneHyperparameters(testFigis = null, options = {}) {
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
                                            console.warn(`   ⚠️ Insufficient data for ${figi}: ${candles.length} candles`);
                                            continue;
                                        }

                                        // Проверяем, что данных достаточно для указанного lookback
                                        if (candles.length < lookback + horizon) {
                                            console.warn(`   ⚠️ Insufficient data for ${figi}: need ${lookback + horizon}, have ${candles.length}`);
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
                                        console.warn(`   ⚠️ No features prepared for ${figi}`);
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
                                        console.error(`   ❌ Error testing ${figi}:`, error.message);
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
                                    console.warn(`   ⚠️ No successful tests for this combination`);
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

            return {
                best: bestCombination.combination,
                bestMetrics: bestCombination.metrics,
                allResults: results,
                testedFigis: figis
            };

        } catch (error) {
            console.error('❌ Hyperparameter tuning failed:', error);
            throw error;
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
                    console.error(`Error in event listener for ${event}:`, error);
                }
            });
        }
    }
}

export default new OptimizedTrainingService();
