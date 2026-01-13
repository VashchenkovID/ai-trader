import * as tf from '@tensorflow/tfjs';
import { parentPort, workerData } from 'worker_threads';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Worker для обучения нейросети
class NeuralNetworkWorker {
    constructor() {
        this.model = null;
        this.isTraining = false;
    }

    // Создание модели
    async createModel(inputShape, sequenceLength = 60) {
        try {
            const model = tf.sequential();

            // Reshape input для LSTM
            let featuresPerTimestep, actualSequenceLength;
            
            // Пробуем разные комбинации, чтобы найти подходящую
            for (let fpt = Math.ceil(inputShape / sequenceLength); fpt <= inputShape; fpt++) {
                const asl = Math.floor(inputShape / fpt);
                if (asl * fpt === inputShape) {
                    featuresPerTimestep = fpt;
                    actualSequenceLength = asl;
                    break;
                }
            }
            
            // Если не нашли точное совпадение, используем приближение
            if (!featuresPerTimestep) {
                featuresPerTimestep = Math.ceil(inputShape / sequenceLength);
                actualSequenceLength = Math.floor(inputShape / featuresPerTimestep);
            }
            
            model.add(tf.layers.reshape({
                targetShape: [actualSequenceLength, featuresPerTimestep],
                inputShape: [inputShape]
            }));

            // LSTM слои
            model.add(tf.layers.lstm({
                units: 128,
                returnSequences: true,
                dropout: 0.2,
                recurrentDropout: 0.2,
                kernelInitializer: 'glorotUniform',
                recurrentInitializer: 'glorotUniform'
            }));

            model.add(tf.layers.lstm({
                units: 64,
                returnSequences: false,
                dropout: 0.2,
                recurrentDropout: 0.2,
                kernelInitializer: 'glorotUniform',
                recurrentInitializer: 'glorotUniform'
            }));

            // L2 регуляризация для предотвращения переобучения
            const l2Regularizer = tf.regularizers.l2({ l2: 0.001 });
            
            // Dense слои с L2 регуляризацией
            model.add(tf.layers.dense({ 
                units: 128, 
                activation: 'relu',
                kernelInitializer: 'heUniform',
                kernelRegularizer: l2Regularizer // L2 регуляризация
            }));
            model.add(tf.layers.batchNormalization({
                betaInitializer: 'zeros',
                gammaInitializer: 'ones',
                movingMeanInitializer: 'zeros',
                movingVarianceInitializer: 'ones'
            }));
            model.add(tf.layers.dropout({ rate: 0.3 })); // Актуализированный dropout

            model.add(tf.layers.dense({ 
                units: 64, 
                activation: 'relu',
                kernelInitializer: 'heUniform',
                kernelRegularizer: l2Regularizer // L2 регуляризация
            }));
            model.add(tf.layers.batchNormalization({
                betaInitializer: 'zeros',
                gammaInitializer: 'ones',
                movingMeanInitializer: 'zeros',
                movingVarianceInitializer: 'ones'
            }));
            model.add(tf.layers.dropout({ rate: 0.25 })); // Актуализированный dropout

            model.add(tf.layers.dense({ 
                units: 32, 
                activation: 'relu',
                kernelInitializer: 'heUniform',
                kernelRegularizer: l2Regularizer // L2 регуляризация
            }));
            model.add(tf.layers.dropout({ rate: 0.2 })); // Актуализированный dropout

            // Выходной слой
            model.add(tf.layers.dense({ 
                units: 1, 
                activation: 'sigmoid',
                kernelInitializer: 'glorotUniform'
                // Выходной слой без L2 для сохранения предсказательной способности
            }));

            // Компиляция
            model.compile({
                optimizer: tf.train.adam(0.001),
                loss: 'binaryCrossentropy',
                metrics: ['accuracy']
            });

            return model;
        } catch (error) {
            try {
                const LoggerService = (await import('../services/LoggerService.js')).default;
                if (LoggerService && LoggerService.isInitialized) {
                    LoggerService.error('Error creating model in neural network worker', {
                        service: 'NeuralNetworkWorker',
                        operation: 'createModel',
                        inputShape,
                        sequenceLength,
                        error: { message: error.message, stack: error.stack }
                    });
                }
            } catch {
                // LoggerService недоступен в воркере, игнорируем
            }
            throw error;
        }
    }

    // Обучение модели
    async trainModel(features, labels, epochs = 50, batchSize = 16) {
        try {
            if (this.isTraining) {
                throw new Error('Training already in progress');
            }

            this.isTraining = true;

            // Создаем модель если её нет
            if (!this.model) {
                this.model = await this.createModel(features[0].length);
            }

            // Конвертируем данные в тензоры
            const featureTensor = tf.tensor2d(features);
            const labelTensor = tf.tensor1d(labels);

            // Обучение
            const history = await this.model.fit(featureTensor, labelTensor, {
                epochs: epochs,
                batchSize: batchSize,
                validationSplit: 0.2,
                callbacks: {
                    onEpochEnd: (epoch, logs) => {
                        // Отправляем прогресс в основной процесс
                        parentPort.postMessage({
                            type: 'training_progress',
                            data: {
                                epoch: epoch + 1,
                                epochs: epochs,
                                loss: logs.loss,
                                accuracy: logs.acc,
                                valLoss: logs.val_loss,
                                valAccuracy: logs.val_acc
                            }
                        });
                    }
                }
            });

            // Освобождаем память
            featureTensor.dispose();
            labelTensor.dispose();
            
            // Отправляем результат
            parentPort.postMessage({
                type: 'training_complete',
                data: {
                    success: true,
                    history: {
                        loss: history.history.loss,
                        accuracy: history.history.acc,
                        valLoss: history.history.val_loss,
                        valAccuracy: history.history.val_acc
                    }
                }
            });

            this.isTraining = false;
            return history;

        } catch (error) {
            this.isTraining = false;
            
            try {
                const LoggerService = (await import('../services/LoggerService.js')).default;
                if (LoggerService && LoggerService.isInitialized) {
                    LoggerService.error('Training failed in neural network worker', {
                        service: 'NeuralNetworkWorker',
                        operation: 'trainModel',
                        samplesCount: features.length,
                        epochs,
                        batchSize,
                        error: { message: error.message, stack: error.stack }
                    });
                }
            } catch {
                // LoggerService недоступен в воркере, игнорируем
            }
            
            parentPort.postMessage({
                type: 'training_error',
                data: {
                    success: false,
                    error: error.message
                }
            });
            
            throw error;
        }
    }

    // Предсказание
    async predict(features) {
        try {
            if (!this.model) {
                throw new Error('Model not trained');
            }

            const featureTensor = tf.tensor2d([features]);
            const prediction = this.model.predict(featureTensor);
            const result = await prediction.data();
            
            featureTensor.dispose();
            prediction.dispose();
            
            return result[0];
        } catch (error) {
            try {
                const LoggerService = (await import('../services/LoggerService.js')).default;
                if (LoggerService && LoggerService.isInitialized) {
                    LoggerService.error('Prediction failed in neural network worker', {
                        service: 'NeuralNetworkWorker',
                        operation: 'predict',
                        error: { message: error.message, stack: error.stack }
                    });
                }
            } catch {
                // LoggerService недоступен в воркере, игнорируем
            }
            throw error;
        }
    }

    // Получение модели для сохранения
    async getModelForSaving() {
        if (!this.model) {
            throw new Error('Model not trained');
        }

        try {
            // Получаем архитектуру модели
            const archJson = this.model.toJSON(null, false);
            
            // Получаем веса модели
            const weights = this.model.getWeights();
            const specs = await Promise.all(weights.map(async (w) => ({
                name: w.name,
                shape: w.shape,
                dtype: w.dtype,
                data: await w.array()
            })));

            return {
                architecture: archJson,
                weights: { specs }
            };
        } catch (error) {
            try {
                const LoggerService = (await import('../services/LoggerService.js')).default;
                if (LoggerService && LoggerService.isInitialized) {
                    LoggerService.error('Error getting model for saving in neural network worker', {
                        service: 'NeuralNetworkWorker',
                        operation: 'getModelForSaving',
                        error: { message: error.message, stack: error.stack }
                    });
                }
            } catch {
                // LoggerService недоступен в воркере, игнорируем
            }
            throw error;
        }
    }

    // Очистка памяти
    dispose() {
        if (this.model) {
            this.model.dispose();
            this.model = null;
        }
    }
}

// Обработка сообщений от основного процесса
const worker = new NeuralNetworkWorker();

parentPort.on('message', async (message) => {
    try {
        switch (message.type) {
            case 'train':
                await worker.trainModel(
                    message.data.features,
                    message.data.labels,
                    message.data.epochs,
                    message.data.batchSize
                );
                break;
                
            case 'predict':
                const prediction = await worker.predict(message.data.features);
                parentPort.postMessage({
                    type: 'prediction_result',
                    data: { prediction }
                });
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
                // Unknown message type
        }
    } catch (error) {
        parentPort.postMessage({
            type: 'error',
            data: { error: error.message }
        });
    }
});

// Обработка завершения процесса
process.on('exit', () => {
    worker.dispose();
});

// Neural Network Worker started
