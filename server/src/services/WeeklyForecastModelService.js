import * as tf from '@tensorflow/tfjs';
import ModelManager from '../utils/ModelManager.js';
import LoggerService from './LoggerService.js';
import tensorFlowTrainingQueue from '../utils/TensorFlowTrainingQueue.js';

/**
 * Сервис для работы с моделями недельных прогнозов
 * Реализует Seq2Seq (Encoder-Decoder) архитектуру для прогнозирования цен на 7 дней вперед
 */
class WeeklyForecastModelService {
    constructor() {
        this.isInitialized = false;
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            this.isInitialized = true;
            
            if (LoggerService.isInitialized) {
                LoggerService.warn('WeeklyForecastModelService initialized', {
                    service: 'WeeklyForecastModelService',
                    operation: 'initialize'
                });
            }
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error initializing WeeklyForecastModelService', {
                    service: 'WeeklyForecastModelService',
                    operation: 'initialize',
                    error: { message: error.message, stack: error.stack }
                });
            }
            throw error;
        }
    }

    /**
     * Создание Seq2Seq модели (Encoder-Decoder)
     * @param {number} inputSequenceLength - Длина входной последовательности (по умолчанию 60 дней)
     * @param {number} featureSize - Размер feature вектора (количество фичей на день)
     * @param {number} outputDays - Количество дней прогноза (по умолчанию 7)
     * @returns {tf.LayersModel} Созданная модель
     */
    createSeq2SeqModel(inputSequenceLength = 60, featureSize = 70, outputDays = 7) {
        try {
            // Encoder Input
            const encoderInput = tf.input({ 
                shape: [inputSequenceLength, featureSize],
                name: 'encoder_input'
            });
            
            // Encoder LSTM Layer 1
            const encoderLSTM1 = tf.layers.lstm({
                units: 128,
                returnSequences: true,
                dropout: 0.2,
                recurrentDropout: 0.2,
                kernelInitializer: 'glorotUniform',
                recurrentInitializer: 'glorotUniform', // Заменено с 'orthogonal' для ускорения
                name: 'encoder_lstm_1'
            }).apply(encoderInput);
            
            // Encoder LSTM Layer 2 (возвращает состояния для decoder)
            const encoderLSTM2 = tf.layers.lstm({
                units: 128,
                returnSequences: true,
                returnState: true,
                dropout: 0.2,
                recurrentDropout: 0.2,
                kernelInitializer: 'glorotUniform',
                recurrentInitializer: 'glorotUniform', // Заменено с 'orthogonal' для ускорения
                name: 'encoder_lstm_2'
            }).apply(encoderLSTM1);
            
            // Извлекаем выход и состояния encoder
            const encoderOutput = encoderLSTM2[0];
            const stateH = encoderLSTM2[1];
            const stateC = encoderLSTM2[2];
            
            // Упрощенный Attention механизм (через Dense слой)
            const attention = tf.layers.dense({
                units: 128,
                activation: 'tanh',
                name: 'attention'
            }).apply(encoderOutput);
            
            // Decoder Input (для обучения используется teacher forcing, для inference - предыдущие предсказания)
            const decoderInput = tf.input({ 
                shape: [outputDays, featureSize],
                name: 'decoder_input'
            });
            
            // Decoder LSTM Layer 1
            // Примечание: initialState передается только при inference, не при обучении
            const decoderLSTM1 = tf.layers.lstm({
                units: 128,
                returnSequences: true,
                dropout: 0.2,
                recurrentDropout: 0.2,
                kernelInitializer: 'glorotUniform',
                recurrentInitializer: 'glorotUniform', // Заменено с 'orthogonal' для ускорения
                name: 'decoder_lstm_1'
            }).apply(decoderInput);
            
            // Decoder LSTM Layer 2
            const decoderLSTM2 = tf.layers.lstm({
                units: 128,
                returnSequences: true,
                dropout: 0.2,
                recurrentDropout: 0.2,
                kernelInitializer: 'glorotUniform',
                recurrentInitializer: 'glorotUniform', // Заменено с 'orthogonal' для ускорения
                name: 'decoder_lstm_2'
            }).apply(decoderLSTM1);
            
            // TimeDistributed Dense для каждой свечи (open, high, low, close, volume)
            const timeDistributed = tf.layers.timeDistributed({
                layer: tf.layers.dense({ 
                    units: 5, // open, high, low, close, volume
                    activation: 'linear',
                    name: 'candle_output'
                })
            }).apply(decoderLSTM2);
            
            // Создаем модель
            const model = tf.model({
                inputs: [encoderInput, decoderInput],
                outputs: timeDistributed,
                name: 'weekly_forecast_seq2seq'
            });
            
            // Компилируем модель
            model.compile({
                optimizer: tf.train.adam(0.001),
                loss: 'meanSquaredError',
                metrics: ['mae']
            });
            
            const totalParams = model.countParams();
            
            if (LoggerService.isInitialized) {
                LoggerService.warn('Seq2Seq model created', {
                    service: 'WeeklyForecastModelService',
                    operation: 'createSeq2SeqModel',
                    inputSequenceLength,
                    featureSize,
                    outputDays,
                    totalParams
                });
            }
            
            return model;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error creating Seq2Seq model', {
                    service: 'WeeklyForecastModelService',
                    operation: 'createSeq2SeqModel',
                    error: { message: error.message, stack: error.stack }
                });
            }
            throw error;
        }
    }

    /**
     * Подготовка данных для обучения Seq2Seq модели
     * @param {Array} candles - Массив свечей (исторические данные)
     * @param {Array} features - Массив features для каждой свечи
     * @param {number} lookbackDays - Количество дней для входной последовательности (по умолчанию 60)
     * @param {number} forecastDays - Количество дней для прогноза (по умолчанию 7)
     * @returns {Object} Объект с sequences (входные последовательности) и targets (целевые последовательности)
     */
    prepareTrainingData(candles, features, lookbackDays = 60, forecastDays = 7) {
        try {
            if (!candles || candles.length === 0) {
                throw new Error('Candles array is empty');
            }
            
            if (!features || features.length === 0) {
                throw new Error('Features array is empty');
            }
            
            if (candles.length !== features.length) {
                throw new Error(`Candles and features length mismatch: ${candles.length} vs ${features.length}`);
            }
            
            if (candles.length < lookbackDays + forecastDays) {
                throw new Error(`Insufficient data: need at least ${lookbackDays + forecastDays} candles, got ${candles.length}`);
            }
            
            const sequences = [];
            const targets = [];
            
            // Создаем скользящее окно для обучения
            for (let i = lookbackDays; i < candles.length - forecastDays; i++) {
                // Входная последовательность (последние lookbackDays дней)
                const inputSequence = features.slice(i - lookbackDays, i);
                
                // Целевая последовательность (следующие forecastDays дней)
                const targetSequence = candles.slice(i, i + forecastDays).map(candle => [
                    candle.open || 0,
                    candle.high || 0,
                    candle.low || 0,
                    candle.close || 0,
                    candle.volume || 0
                ]);
                
                sequences.push(inputSequence);
                targets.push(targetSequence);
            }
            
            if (LoggerService.isInitialized) {
                LoggerService.warn('Training data prepared', {
                    service: 'WeeklyForecastModelService',
                    operation: 'prepareTrainingData',
                    sequencesCount: sequences.length,
                    lookbackDays,
                    forecastDays
                });
            }
            
            return { sequences, targets };
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error preparing training data', {
                    service: 'WeeklyForecastModelService',
                    operation: 'prepareTrainingData',
                    error: { message: error.message, stack: error.stack }
                });
            }
            throw error;
        }
    }

    /**
     * Обучение модели
     * @param {tf.LayersModel} model - Модель для обучения
     * @param {Array} sequences - Входные последовательности
     * @param {Array} targets - Целевые последовательности
     * @param {Object} options - Опции обучения
     * @param {string} [options.figi] - FIGI инструмента (для идентификации в очереди)
     * @returns {Promise<Object>} История обучения
     */
    async trainModel(model, sequences, targets, options = {}) {
        const {
            epochs = 50,
            batchSize = 16,
            validationSplit = 0.2,
            verbose = 0,
            figi = null
        } = options;
        
        try {
            if (!model) {
                throw new Error('Model is required');
            }
            
            if (!sequences || sequences.length === 0) {
                throw new Error('Sequences array is empty');
            }
            
            if (!targets || targets.length === 0) {
                throw new Error('Targets array is empty');
            }
            
            if (sequences.length !== targets.length) {
                throw new Error(`Sequences and targets length mismatch: ${sequences.length} vs ${targets.length}`);
            }
            
            // Проверяем форму sequences перед конвертацией
            if (sequences.length === 0) {
                throw new Error('Sequences array is empty');
            }
            
            // Проверяем, что все sequences имеют одинаковую длину
            const expectedSequenceLength = sequences[0].length;
            const expectedFeatureSize = sequences[0][0]?.length || 70;
            
            for (let i = 0; i < sequences.length; i++) {
                if (sequences[i].length !== expectedSequenceLength) {
                    throw new Error(`Sequence ${i} has incorrect length: expected ${expectedSequenceLength}, got ${sequences[i].length}`);
                }
                for (let j = 0; j < sequences[i].length; j++) {
                    if (sequences[i][j].length !== expectedFeatureSize) {
                        throw new Error(`Sequence ${i}, step ${j} has incorrect feature size: expected ${expectedFeatureSize}, got ${sequences[i][j].length}`);
                    }
                }
            }
            
            // Проверяем форму targets
            const expectedForecastDays = targets[0]?.length || 7;
            for (let i = 0; i < targets.length; i++) {
                if (targets[i].length !== expectedForecastDays) {
                    throw new Error(`Target ${i} has incorrect length: expected ${expectedForecastDays}, got ${targets[i].length}`);
                }
            }
            
            // Конвертируем в тензоры
            // Для encoder: [batch, sequenceLength, featureSize]
            const encoderInput = tf.tensor3d(sequences);
            
            // Проверяем форму encoderInput
            const encoderShape = encoderInput.shape;
            if (encoderShape.length !== 3) {
                throw new Error(`Encoder input must be 3D tensor, got shape: [${encoderShape.join(', ')}]`);
            }
            
            // Для decoder: используем targets как decoder input (teacher forcing)
            // Decoder input должен иметь форму [batch, forecastDays, featureSize]
            // Используем последний элемент из каждой sequence и дублируем его для всех forecastDays
            const decoderInput = tf.tensor3d(sequences.map((seq) => {
                const lastFeatures = seq[seq.length - 1];
                // Создаем массив из forecastDays элементов, каждый равен lastFeatures
                return Array(expectedForecastDays).fill(null).map(() => [...lastFeatures]);
            }));
            
            // Targets: [batch, forecastDays, 5] (open, high, low, close, volume)
            const targetTensor = tf.tensor3d(targets);
            
            // Проверяем формы перед обучением
            const decoderShape = decoderInput.shape;
            const targetShape = targetTensor.shape;
            
            // Проверяем структуру модели - должна иметь 2 входа для Seq2Seq
            const modelInputs = model.inputs;
            if (!modelInputs || modelInputs.length !== 2) {
                throw new Error(`Model input structure mismatch: expected 2 inputs (encoder and decoder), but model has ${modelInputs ? modelInputs.length : 0} inputs. Model may need to be recreated.`);
            }
            
            if (LoggerService.isInitialized) {
                LoggerService.info('Tensor shapes before training', {
                    service: 'WeeklyForecastModelService',
                    operation: 'trainModel',
                    encoderShape: `[${encoderShape.join(', ')}]`,
                    decoderShape: `[${decoderShape.join(', ')}]`,
                    targetShape: `[${targetShape.join(', ')}]`,
                    modelInputsCount: modelInputs.length
                });
            }
            
            // Обучение через очередь, чтобы избежать одновременных вызовов fit()
            const identifier = `weekly_forecast_${figi || 'unknown'}`;
            const history = await tensorFlowTrainingQueue.enqueue(
                async () => {
                    try {
                        // Убеждаемся, что передаем входы как массив для multi-input модели
                        const inputs = [encoderInput, decoderInput];
                        
                        // Дополнительная проверка перед вызовом fit()
                        if (LoggerService.isInitialized) {
                            LoggerService.info('Calling model.fit() with inputs', {
                                service: 'WeeklyForecastModelService',
                                operation: 'trainModel',
                                inputsCount: inputs.length,
                                encoderShape: encoderInput.shape,
                                decoderShape: decoderInput.shape,
                                targetShape: targetTensor.shape,
                                modelInputsCount: modelInputs.length,
                                modelInputShapes: modelInputs.map(inp => inp.shape)
                            });
                        }
                        
                    return await model.fit(
                            inputs,
                        targetTensor,
                        {
                            epochs,
                            batchSize,
                            validationSplit,
                            verbose,
                            callbacks: {
                                onEpochEnd: async (epoch, logs) => {
                                    if (LoggerService.isInitialized && verbose > 0) {
                                        LoggerService.warn(`Training epoch ${epoch + 1}/${epochs}`, {
                                            service: 'WeeklyForecastModelService',
                                            operation: 'trainModel',
                                            epoch: epoch + 1,
                                            loss: logs.loss,
                                            valLoss: logs.val_loss,
                                            mae: logs.mae,
                                            valMae: logs.val_mae
                                        });
                                    }
                                    
                                    // Освобождаем event loop между эпохами, чтобы не блокировать другие запросы
                                    // Это критично для производительности сервера во время длительного обучения
                                    if (epoch < epochs - 1) {
                                        await new Promise(resolve => setImmediate(resolve));
                                    }
                                }
                            }
                        }
                    );
                    } catch (fitError) {
                        // Логируем детальную информацию об ошибке
                        if (LoggerService.isInitialized) {
                            LoggerService.error('Error in model.fit()', {
                                service: 'WeeklyForecastModelService',
                                operation: 'trainModel',
                                error: {
                                    message: fitError.message,
                                    stack: fitError.stack
                                },
                                encoderShape: encoderInput.shape,
                                decoderShape: decoderInput.shape,
                                targetShape: targetTensor.shape,
                                modelInputsCount: modelInputs.length,
                                modelInputShapes: modelInputs.map(inp => inp.shape)
                            });
                        }
                        throw fitError;
                    }
                },
                identifier
            );
            
            // Освобождаем память
            encoderInput.dispose();
            decoderInput.dispose();
            targetTensor.dispose();
            
            if (LoggerService.isInitialized) {
                LoggerService.warn('Model training completed', {
                    service: 'WeeklyForecastModelService',
                    operation: 'trainModel',
                    epochs,
                    finalLoss: history.history.loss[history.history.loss.length - 1],
                    finalValLoss: history.history.val_loss ? history.history.val_loss[history.history.val_loss.length - 1] : null
                });
            }
            
            return history;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error training model', {
                    service: 'WeeklyForecastModelService',
                    operation: 'trainModel',
                    error: { message: error.message, stack: error.stack }
                });
            }
            throw error;
        }
    }

    /**
     * Обучение модели через worker (не блокирует event loop)
     * @param {Array} sequences - Входные последовательности
     * @param {Array} targets - Целевые последовательности
     * @param {Object} options - Опции обучения
     * @param {string} [options.figi] - FIGI инструмента (для идентификации)
     * @param {Function} [options.onProgress] - Callback для прогресса обучения
     * @returns {Promise<Object>} История обучения
     */
    async trainModelViaWorker(sequences, targets, options = {}) {
        const {
            epochs = 50,
            batchSize = 16,
            validationSplit = 0.2,
            verbose = 0,
            figi = null,
            onProgress = null
        } = options;

        return new Promise(async (resolve, reject) => {
            const { Worker } = await import('worker_threads');
            const { join } = await import('path');
            const { fileURLToPath } = await import('url');
            const { dirname } = await import('path');
            
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = dirname(__filename);
            const workerPath = join(__dirname, '../workers/weeklyForecastTrainingWorker.js');
            const worker = new Worker(workerPath);
            
            // Регистрируем воркер в WorkerMonitoringService
            let workerId = null;
            try {
                const WorkerMonitoringService = (await import('./WorkerMonitoringService.js')).default;
                if (!WorkerMonitoringService.isInitialized) {
                    await WorkerMonitoringService.initialize();
                }
                workerId = WorkerMonitoringService.registerWorker(
                    'weekly-forecast-training',
                    `Training Weekly Forecast model${figi ? `: ${figi}` : ''}`,
                    { figi, epochs, batchSize, sequencesCount: sequences.length }
                );
            } catch (monitoringError) {
                if (LoggerService.isInitialized) {
                    LoggerService.warn('Failed to register worker in monitoring service', {
                        service: 'WeeklyForecastModelService',
                        operation: 'trainModelViaWorker',
                        error: { message: String(monitoringError) }
                    });
                }
            }
            
            worker.postMessage({
                type: 'train',
                data: {
                    sequences,
                    targets,
                    options: {
                        epochs,
                        batchSize,
                        validationSplit,
                        verbose
                    }
                }
            });
            
            worker.on('message', async (msg) => {
                if (msg.type === 'training_complete') {
                    // Завершаем воркер в мониторинге
                    if (workerId) {
                        try {
                            const WorkerMonitoringService = (await import('./WorkerMonitoringService.js')).default;
                            WorkerMonitoringService.completeWorker(workerId, true, { 
                                finalLoss: msg.data.history.loss[msg.data.history.loss.length - 1],
                                finalValLoss: msg.data.history.val_loss ? msg.data.history.val_loss[msg.data.history.val_loss.length - 1] : null
                            });
                        } catch (monitoringError) {
                            // Игнорируем ошибки мониторинга
                        }
                    }
                    
                    // Создаем объект истории в формате, который ожидается
                    const history = {
                        history: msg.data.history,
                        weights: msg.data.weights, // Веса обученной модели
                        modelConfig: msg.data.modelConfig // Конфигурация модели
                    };
                    
                    resolve(history);
                    // Даем время на освобождение памяти перед завершением worker
                    setTimeout(() => {
                        worker.terminate();
                    }, 100);
                } else if (msg.type === 'training_error') {
                    // Отмечаем ошибку в мониторинге
                    if (workerId) {
                        try {
                            const WorkerMonitoringService = (await import('./WorkerMonitoringService.js')).default;
                            WorkerMonitoringService.reportWorkerError(workerId, msg.data.error);
                            WorkerMonitoringService.completeWorker(workerId, false, { error: msg.data.error });
                        } catch (monitoringError) {
                            // Игнорируем ошибки мониторинга
                        }
                    }
                    
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
                                    epochs: msg.data.epochs,
                                    loss: msg.data.loss,
                                    valLoss: msg.data.valLoss,
                                    mae: msg.data.mae,
                                    valMae: msg.data.valMae
                                }
                            });
                        } catch (monitoringError) {
                            // Игнорируем ошибки мониторинга
                        }
                    }
                    
                    // Вызываем callback прогресса, если он указан
                    if (onProgress) {
                        onProgress({
                            epoch: msg.data.epoch,
                            epochs: msg.data.epochs,
                            loss: msg.data.loss,
                            valLoss: msg.data.valLoss,
                            mae: msg.data.mae,
                            valMae: msg.data.valMae
                        });
                    }
                    
                    // Логируем прогресс
                    if (LoggerService.isInitialized && verbose > 0) {
                        LoggerService.warn(`Training epoch ${msg.data.epoch}/${msg.data.epochs}`, {
                            service: 'WeeklyForecastModelService',
                            operation: 'trainModelViaWorker',
                            epoch: msg.data.epoch,
                            loss: msg.data.loss,
                            valLoss: msg.data.valLoss,
                            mae: msg.data.mae,
                            valMae: msg.data.valMae
                        });
                    }
                } else if (msg.type === 'error') {
                    // Отмечаем ошибку в мониторинге
                    if (workerId) {
                        try {
                            const WorkerMonitoringService = (await import('./WorkerMonitoringService.js')).default;
                            WorkerMonitoringService.reportWorkerError(workerId, msg.data.error);
                            WorkerMonitoringService.completeWorker(workerId, false, { error: msg.data.error });
                        } catch (monitoringError) {
                            // Игнорируем ошибки мониторинга
                        }
                    }
                    
                    reject(new Error(msg.data.error));
                    // Даем время на освобождение памяти перед завершением worker
                    setTimeout(() => {
                        worker.terminate();
                    }, 100);
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
                        // Игнорируем ошибки мониторинга
                    }
                }
                
                reject(error);
                // Даем время на освобождение памяти перед завершением worker
                setTimeout(() => {
                    worker.terminate();
                }, 100);
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
                        // Игнорируем ошибки мониторинга
                    }
                }
                
                if (code !== 0) {
                    reject(new Error(`Worker stopped with exit code ${code}`));
                }
                
                // Принудительная очистка памяти после завершения worker
                try {
                    const tf = await import('@tensorflow/tfjs');
                    // Очищаем неиспользуемые тензоры
                    tf.engine().startScope();
                    tf.engine().endScope();
                } catch (tfError) {
                    // Игнорируем ошибки очистки
                }
            });
        });
    }

    /**
     * Генерация прогноза моделью
     * @param {tf.LayersModel} model - Обученная модель
     * @param {Array} inputSequence - Входная последовательность features
     * @param {number} forecastDays - Количество дней для прогноза (по умолчанию 7)
     * @returns {Promise<Array>} Массив прогнозируемых свечей
     */
    async generateForecast(model, inputSequence, forecastDays = 7) {
        try {
            if (!model) {
                throw new Error('Model is required');
            }
            
            if (!inputSequence || inputSequence.length === 0) {
                throw new Error('Input sequence is empty');
            }
            
            // Подготавливаем encoder input
            const encoderInput = tf.tensor3d([inputSequence]);
            
            // Для decoder input используем последние features (будет использоваться для инициализации)
            const lastFeatures = inputSequence[inputSequence.length - 1];
            const decoderInput = tf.tensor3d([Array(forecastDays).fill(lastFeatures)]);
            
            // Генерируем прогноз
            const prediction = model.predict([encoderInput, decoderInput]);
            const predictionArray = await prediction.array();
            
            // Преобразуем в формат свечей
            const forecast = predictionArray[0].map((day, index) => ({
                date: null, // Будет установлено позже
                open: day[0] || 0,
                high: day[1] || 0,
                low: day[2] || 0,
                close: day[3] || 0,
                volume: Math.max(0, day[4] || 0), // Объем не может быть отрицательным
                confidence: 0.5 // Будет вычислено позже
            }));
            
            // Освобождаем память
            encoderInput.dispose();
            decoderInput.dispose();
            prediction.dispose();
            
            return forecast;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error generating forecast', {
                    service: 'WeeklyForecastModelService',
                    operation: 'generateForecast',
                    error: { message: error.message, stack: error.stack }
                });
            }
            throw error;
        }
    }

    /**
     * Сохранение модели
     * @param {tf.LayersModel} model - Модель для сохранения
     * @param {string} figi - FIGI инструмента
     * @param {string} modelType - Тип модели (по умолчанию 'seq2seq')
     * @param {Object} metadata - Дополнительные метаданные
     * @returns {Promise<boolean>} Успешность операции
     */
    async saveModel(model, figi, modelType = 'seq2seq', metadata = {}) {
        // Валидация до try-catch, чтобы ошибка точно была выброшена
        if (!model || model === null || model === undefined) {
            throw new Error('Model is required');
        }
        
        try {
            
            const modelPath = `weekly_forecast/${figi}/${modelType}`;
            const success = await ModelManager.saveModel(model, modelPath);
            
            if (success && Object.keys(metadata).length > 0) {
                // Сохраняем метаданные отдельно
                const fs = await import('fs/promises');
                const path = await import('path');
                const { fileURLToPath } = await import('url');
                
                const __filename = fileURLToPath(import.meta.url);
                const __dirname = path.dirname(__filename);
                const modelsDir = path.join(__dirname, '../../models');
                const metadataPath = path.join(modelsDir, `weekly_forecast/${figi}/${modelType}_metadata.json`);
                const metadataDir = path.dirname(metadataPath);
                
                // Создаем директорию с рекурсивным созданием родительских папок
                await fs.mkdir(metadataDir, { recursive: true });
                
                // Устанавливаем права доступа на созданные папки
                try {
                    await fs.chmod(metadataDir, 0o777);
                    // Также устанавливаем права на родительские папки
                    const weeklyForecastDir = path.join(modelsDir, 'weekly_forecast');
                    await fs.chmod(weeklyForecastDir, 0o777);
                    const figiDir = path.join(weeklyForecastDir, figi);
                    await fs.chmod(figiDir, 0o777);
                    await fs.chmod(modelsDir, 0o777);
                } catch (chmodError) {
                    // Игнорируем ошибки chmod (может не работать в некоторых окружениях, например Windows)
                    if (LoggerService.isInitialized) {
                        LoggerService.warn('Failed to set directory permissions', {
                            service: 'WeeklyForecastModelService',
                            operation: 'saveModel',
                            error: chmodError.message
                        });
                    }
                }
                
                await fs.writeFile(metadataPath, JSON.stringify({
                    ...metadata,
                    savedAt: new Date().toISOString(),
                    figi,
                    modelType
                }, null, 2));
                
                // Устанавливаем права на файл метаданных
                try {
                    await fs.chmod(metadataPath, 0o666);
                } catch (chmodError) {
                    // Игнорируем ошибки chmod
                }
            }
            
            if (LoggerService.isInitialized) {
                if (success) {
                    LoggerService.info('Model saved successfully', {
                        service: 'WeeklyForecastModelService',
                        operation: 'saveModel',
                        figi,
                        modelType,
                        modelPath
                    });
                } else {
                    LoggerService.error('Model save returned false', {
                        service: 'WeeklyForecastModelService',
                        operation: 'saveModel',
                        figi,
                        modelType,
                        modelPath
                    });
                }
            }
            
            return success;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error saving model', {
                    service: 'WeeklyForecastModelService',
                    operation: 'saveModel',
                    figi,
                    modelType,
                    error: { message: error.message, stack: error.stack }
                });
            }
            return false;
        }
    }

    /**
     * Загрузка модели
     * @param {string} figi - FIGI инструмента
     * @param {string} modelType - Тип модели (по умолчанию 'seq2seq')
     * @returns {Promise<tf.LayersModel|null>} Загруженная модель или null
     */
    async loadModel(figi, modelType = 'seq2seq') {
        try {
            const modelPath = `weekly_forecast/${figi}/${modelType}`;
            const model = await ModelManager.loadModel(modelPath);
            
            if (model) {
                // Компилируем модель после загрузки
                model.compile({
                    optimizer: tf.train.adam(0.001),
                    loss: 'meanSquaredError',
                    metrics: ['mae']
                });
                
                if (LoggerService.isInitialized) {
                    LoggerService.warn('Model loaded', {
                        service: 'WeeklyForecastModelService',
                        operation: 'loadModel',
                        figi,
                        modelType
                    });
                }
            }
            
            return model;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error loading model', {
                    service: 'WeeklyForecastModelService',
                    operation: 'loadModel',
                    figi,
                    modelType,
                    error: { message: error.message, stack: error.stack }
                });
            }
            return null;
        }
    }

    /**
     * Загрузка метаданных модели
     * @param {string} figi - FIGI инструмента
     * @param {string} modelType - Тип модели (по умолчанию 'seq2seq')
     * @returns {Promise<Object|null>} Метаданные или null
     */
    async loadModelMetadata(figi, modelType = 'seq2seq') {
        try {
            const fs = await import('fs/promises');
            const path = await import('path');
            const { fileURLToPath } = await import('url');
            
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = path.dirname(__filename);
            const modelsDir = path.join(__dirname, '../../models');
            const metadataPath = path.join(modelsDir, `weekly_forecast/${figi}/${modelType}_metadata.json`);
            
            const metadataContent = await fs.readFile(metadataPath, 'utf8');
            return JSON.parse(metadataContent);
        } catch (error) {
            // Метаданные не обязательны
            return null;
        }
    }
}

// Создаем singleton
const weeklyForecastModelService = new WeeklyForecastModelService();

export default weeklyForecastModelService;

