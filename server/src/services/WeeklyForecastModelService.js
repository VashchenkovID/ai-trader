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
            
            // Конвертируем в тензоры
            // Для encoder: [batch, sequenceLength, featureSize]
            const encoderInput = tf.tensor3d(sequences);
            
            // Для decoder: используем targets как decoder input (teacher forcing)
            // В реальном inference будем использовать предыдущие предсказания
            const decoderInput = tf.tensor3d(sequences.map((seq, idx) => {
                // Для decoder input используем последние forecastDays дней из sequence
                // или дублируем последний элемент
                const lastFeatures = seq[seq.length - 1];
                return Array(7).fill(lastFeatures);
            }));
            
            // Targets: [batch, forecastDays, 5] (open, high, low, close, volume)
            const targetTensor = tf.tensor3d(targets);
            
            // Обучение через очередь, чтобы избежать одновременных вызовов fit()
            const identifier = `weekly_forecast_${figi || 'unknown'}`;
            const history = await tensorFlowTrainingQueue.enqueue(
                async () => {
                    return await model.fit(
                        [encoderInput, decoderInput],
                        targetTensor,
                        {
                            epochs,
                            batchSize,
                            validationSplit,
                            verbose,
                            callbacks: {
                                onEpochEnd: (epoch, logs) => {
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
                                }
                            }
                        }
                    );
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
                
                await fs.mkdir(path.dirname(metadataPath), { recursive: true });
                await fs.writeFile(metadataPath, JSON.stringify({
                    ...metadata,
                    savedAt: new Date().toISOString(),
                    figi,
                    modelType
                }, null, 2));
            }
            
            if (LoggerService.isInitialized) {
                LoggerService.warn('Model saved', {
                    service: 'WeeklyForecastModelService',
                    operation: 'saveModel',
                    figi,
                    modelType,
                    success
                });
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

