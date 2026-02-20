import * as tf from '@tensorflow/tfjs';
import { parentPort } from 'worker_threads';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Устанавливаем флаг воркера
process.env.WORKER = 'true';

/**
 * Worker для обучения моделей Weekly Forecast (Seq2Seq)
 * Обучение происходит в отдельном потоке, чтобы не блокировать основной event loop
 */
class WeeklyForecastTrainingWorker {
    constructor() {
        this.isTraining = false;
        this.model = null;
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
                recurrentInitializer: 'glorotUniform',
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
                recurrentInitializer: 'glorotUniform',
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
            const decoderLSTM1 = tf.layers.lstm({
                units: 128,
                returnSequences: true,
                dropout: 0.2,
                recurrentDropout: 0.2,
                kernelInitializer: 'glorotUniform',
                recurrentInitializer: 'glorotUniform',
                name: 'decoder_lstm_1'
            }).apply(decoderInput);
            
            // Decoder LSTM Layer 2
            const decoderLSTM2 = tf.layers.lstm({
                units: 128,
                returnSequences: true,
                dropout: 0.2,
                recurrentDropout: 0.2,
                kernelInitializer: 'glorotUniform',
                recurrentInitializer: 'glorotUniform',
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
            
            return model;
        } catch (error) {
            parentPort.postMessage({
                type: 'error',
                data: { error: `Error creating model: ${error.message}` }
            });
            throw error;
        }
    }

    /**
     * Обучение модели
     * @param {Array} sequences - Входные последовательности
     * @param {Array} targets - Целевые последовательности
     * @param {Object} options - Опции обучения
     * @returns {Promise<Object>} История обучения
     */
    async trainModel(sequences, targets, options = {}) {
        const {
            epochs = 50,
            batchSize = 16,
            validationSplit = 0.2,
            verbose = 0,
            inputSequenceLength = 60,
            featureSize = 70,
            outputDays = 7
        } = options;

        // Объявляем переменные тензоров в области видимости функции для доступа в catch
        let encoderInput = null;
        let decoderInput = null;
        let targetTensor = null;

        try {
            if (this.isTraining) {
                throw new Error('Training already in progress');
            }

            this.isTraining = true;

            // Проверяем форму sequences перед конвертацией
            if (sequences.length === 0) {
                throw new Error('Sequences array is empty');
            }

            // Проверяем, что все sequences имеют одинаковую длину
            const expectedSequenceLength = sequences[0].length;
            const expectedFeatureSize = sequences[0][0]?.length || featureSize;

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
            const expectedForecastDays = targets[0]?.length || outputDays;
            for (let i = 0; i < targets.length; i++) {
                if (targets[i].length !== expectedForecastDays) {
                    throw new Error(`Target ${i} has incorrect length: expected ${expectedForecastDays}, got ${targets[i].length}`);
                }
            }

            // Всегда создаем новую модель для каждого обучения
            // Это предотвращает проблемы с disposed переменными при повторном использовании worker'а
            // ВАЖНО: Каждое обучение должно начинаться с новой, необученной модели
            if (this.model) {
                try {
                    this.model.dispose();
                } catch (disposeError) {
                    // Игнорируем ошибки при dispose старой модели
                }
                this.model = null;
            }
            
            // Создаем новую модель с правильными размерами
            this.model = this.createSeq2SeqModel(expectedSequenceLength, expectedFeatureSize, expectedForecastDays);

            // Конвертируем в тензоры
            // Для encoder: [batch, sequenceLength, featureSize]
            encoderInput = tf.tensor3d(sequences);
            
            // Для decoder: используем targets как decoder input (teacher forcing)
            // Decoder input должен иметь форму [batch, forecastDays, featureSize]
            // Используем последний элемент из каждой sequence и дублируем его для всех forecastDays
            decoderInput = tf.tensor3d(sequences.map((seq) => {
                const lastFeatures = seq[seq.length - 1];
                // Создаем массив из forecastDays элементов, каждый равен lastFeatures
                return Array(expectedForecastDays).fill(null).map(() => [...lastFeatures]);
            }));

            // Targets: [batch, forecastDays, 5] (open, high, low, close, volume)
            targetTensor = tf.tensor3d(targets);

            // Обучение
            const history = await this.model.fit(
                [encoderInput, decoderInput],
                targetTensor,
                {
                    epochs,
                    batchSize,
                    validationSplit,
                    verbose,
                    callbacks: {
                        onEpochEnd: (epoch, logs) => {
                            // Отправляем прогресс в основной процесс
                            parentPort.postMessage({
                                type: 'training_progress',
                                data: {
                                    epoch: epoch + 1,
                                    epochs,
                                    loss: logs.loss,
                                    valLoss: logs.val_loss,
                                    mae: logs.mae,
                                    valMae: logs.val_mae
                                }
                            });
                        }
                    }
                }
            );

            // Освобождаем память после обучения
            if (encoderInput && !encoderInput.isDisposed) {
                encoderInput.dispose();
            }
            if (decoderInput && !decoderInput.isDisposed) {
                decoderInput.dispose();
            }
            if (targetTensor && !targetTensor.isDisposed) {
                targetTensor.dispose();
            }

            // Получаем конфигурацию модели ПЕРЕД получением весов
            // Это важно, так как getConfig() может использовать внутренние переменные модели
            const modelConfig = this.model.getConfig();
            
            // Получаем веса модели для передачи в основной процесс
            // ВАЖНО: getWeights() создает новые тензоры, которые являются копиями весов
            const weights = this.model.getWeights();
            
            // Копируем данные весов в обычные массивы JavaScript
            // Это гарантирует, что данные сохранены до dispose модели
            const weightsData = await Promise.all(weights.map(async (w) => {
                try {
                    const data = await w.array();
                    return data;
                } catch (error) {
                    throw new Error(`Error copying weight data: ${error.message}`);
                }
            }));
            
            // Освобождаем веса из памяти GPU/CPU после копирования
            weights.forEach(w => {
                try {
                    w.dispose();
                } catch (disposeError) {
                    // Игнорируем ошибки при dispose весов
                }
            });
            
            // Отправляем результат с весами
            parentPort.postMessage({
                type: 'training_complete',
                data: {
                    history: {
                        loss: history.history.loss,
                        val_loss: history.history.val_loss,
                        mae: history.history.mae,
                        val_mae: history.history.val_mae
                    },
                    weights: weightsData,
                    modelConfig: modelConfig
                }
            });

            // Освобождаем модель ПОСЛЕ отправки данных
            // Это гарантирует, что все данные скопированы до dispose
            this.dispose();
            
            // Принудительная очистка памяти TensorFlow
            try {
                const tf = await import('@tensorflow/tfjs');
                tf.engine().startScope();
                tf.engine().endScope();
            } catch (tfError) {
                // Игнорируем ошибки очистки
            }

            this.isTraining = false;
            return history;
        } catch (error) {
            this.isTraining = false;
            
            // Освобождаем ресурсы при ошибке
            // Важно: проверяем, что тензоры были созданы и не disposed
            try {
                if (encoderInput && typeof encoderInput.dispose === 'function') {
                    if (!encoderInput.isDisposed) {
                        encoderInput.dispose();
                    }
                }
            } catch (e) {
                // Игнорируем ошибки при dispose
            }
            
            try {
                if (decoderInput && typeof decoderInput.dispose === 'function') {
                    if (!decoderInput.isDisposed) {
                        decoderInput.dispose();
                    }
                }
            } catch (e) {
                // Игнорируем ошибки при dispose
            }
            
            try {
                if (targetTensor && typeof targetTensor.dispose === 'function') {
                    if (!targetTensor.isDisposed) {
                        targetTensor.dispose();
                    }
                }
            } catch (e) {
                // Игнорируем ошибки при dispose
            }
            
            // Очищаем модель при ошибке, чтобы предотвратить проблемы при следующем обучении
            // Это гарантирует, что следующее обучение начнется с чистой модели
            if (this.model) {
                try {
                    this.dispose();
                } catch (disposeError) {
                    // Игнорируем ошибки при dispose
                }
            }
            
            parentPort.postMessage({
                type: 'training_error',
                data: { error: error.message, stack: error.stack }
            });
            throw error;
        }
    }

    /**
     * Получение модели для сохранения
     * @returns {Promise<Object>} Данные модели
     */
    async getModelForSaving() {
        if (!this.model) {
            throw new Error('Model not trained yet');
        }

        try {
            // Получаем конфигурацию модели ПЕРЕД получением весов
            const modelConfig = this.model.getConfig();
            
            // Сохраняем веса модели
            // ВАЖНО: getWeights() создает новые тензоры, которые являются копиями весов
            const weights = this.model.getWeights();
            
            // Копируем данные весов в обычные массивы JavaScript
            const weightsData = await Promise.all(weights.map(async (w) => {
                try {
                    const data = await w.array();
                    return data;
                } catch (error) {
                    throw new Error(`Error copying weight data: ${error.message}`);
                }
            }));
            
            // Освобождаем веса из памяти после копирования
            weights.forEach(w => {
                try {
                    w.dispose();
                } catch (disposeError) {
                    // Игнорируем ошибки при dispose весов
                }
            });

            return {
                weights: weightsData,
                config: modelConfig
            };
        } catch (error) {
            parentPort.postMessage({
                type: 'error',
                data: { error: `Error getting model for saving: ${error.message}` }
            });
            throw error;
        }
    }

    /**
     * Освобождение ресурсов
     */
    dispose() {
        if (this.model) {
            try {
                // Проверяем, не disposed ли уже модель
                // Если модель уже disposed, dispose() может выбросить ошибку
                if (this.model.built) {
                    this.model.dispose();
                }
            } catch (disposeError) {
                // Игнорируем ошибки при dispose (модель может быть уже disposed)
                // Это предотвращает падение worker'а при повторном dispose
            }
            this.model = null;
        }
        this.isTraining = false;
    }
}

// Обработка сообщений от основного процесса
const worker = new WeeklyForecastTrainingWorker();

parentPort.on('message', async (message) => {
    try {
        switch (message.type) {
            case 'train':
                await worker.trainModel(
                    message.data.sequences,
                    message.data.targets,
                    message.data.options || {}
                );
                break;
                
            case 'get_model':
                const modelData = await worker.getModelForSaving();
                parentPort.postMessage({
                    type: 'model_data',
                    data: modelData
                });
                break;
                
            case 'dispose':
                worker.dispose();
                process.exit(0);
                break;
                
            default:
                parentPort.postMessage({
                    type: 'error',
                    data: { error: `Unknown message type: ${message.type}` }
                });
        }
    } catch (error) {
        parentPort.postMessage({
            type: 'error',
            data: { error: error.message, stack: error.stack }
        });
    }
});

// Обработка завершения процесса
process.on('exit', () => {
    worker.dispose();
});

