import * as tf from '@tensorflow/tfjs';
import { parentPort, workerData } from 'worker_threads';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Автономный воркер для обучения без импорта сервисов
class StandaloneTrainingWorker {
    constructor() {
        this.isTraining = false;
    }

    // Создание модели
    async createModel(inputShape, sequenceLength = 60) {
        try {
            console.log(`🏗️ Standalone Worker: Creating model with input shape: ${inputShape}`);
            
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
            
            console.log(`📊 Standalone Worker Reshape: inputShape=${inputShape}, sequenceLength=${sequenceLength}`);
            console.log(`📊 Standalone Worker Reshape: featuresPerTimestep=${featuresPerTimestep}, actualSequenceLength=${actualSequenceLength}`);
            
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

            // Dense слои
            model.add(tf.layers.dense({ 
                units: 128, 
                activation: 'relu',
                kernelInitializer: 'heUniform'
            }));
            model.add(tf.layers.batchNormalization({
                betaInitializer: 'zeros',
                gammaInitializer: 'ones',
                movingMeanInitializer: 'zeros',
                movingVarianceInitializer: 'ones'
            }));
            model.add(tf.layers.dropout({ rate: 0.3 }));

            model.add(tf.layers.dense({ 
                units: 64, 
                activation: 'relu',
                kernelInitializer: 'heUniform'
            }));
            model.add(tf.layers.batchNormalization({
                betaInitializer: 'zeros',
                gammaInitializer: 'ones',
                movingMeanInitializer: 'zeros',
                movingVarianceInitializer: 'ones'
            }));
            model.add(tf.layers.dropout({ rate: 0.2 }));

            model.add(tf.layers.dense({ 
                units: 32, 
                activation: 'relu',
                kernelInitializer: 'heUniform'
            }));
            model.add(tf.layers.dropout({ rate: 0.1 }));

            // Выходной слой
            model.add(tf.layers.dense({ 
                units: 1, 
                activation: 'sigmoid',
                kernelInitializer: 'glorotUniform'
            }));

            // Компиляция
            model.compile({
                optimizer: tf.train.adam(0.001),
                loss: 'binaryCrossentropy',
                metrics: ['accuracy']
            });

            console.log('✅ Standalone Worker: Model created and compiled successfully');
            return model;
        } catch (error) {
            console.error('❌ Standalone Worker: Error creating model:', error);
            throw error;
        }
    }

    // Взвешивание данных
    applyDataWeighting(features, labels) {
        const n = features.length;
        
        // Создаем взвешенные данные путем дублирования важных примеров
        const weightedFeatures = [];
        const weightedLabels = [];
        
        if (n > 0) {
            for (let i = 0; i < n; i++) {
                const weight = 0.7 + (0.6 * i) / Math.max(1, n - 1); // от 0.7 до 1.3
                const repetitions = Math.max(1, Math.round(weight)); // количество повторений
                
                // Добавляем пример несколько раз в зависимости от веса
                for (let j = 0; j < repetitions; j++) {
                    weightedFeatures.push(features[i]);
                    weightedLabels.push(labels[i]);
                }
            }
        }
        
        // Используем взвешенные данные
        const finalFeatures = weightedFeatures.length > 0 ? weightedFeatures : features;
        const finalLabels = weightedLabels.length > 0 ? weightedLabels : labels;
        
        // Логируем информацию о взвешивании
        if (weightedFeatures.length > 0) {
            console.log(`📊 Standalone Worker: Data weighting applied: ${features.length} → ${finalFeatures.length} samples (${((finalFeatures.length / features.length - 1) * 100).toFixed(1)}% increase)`);
        }
        
        return { finalFeatures, finalLabels };
    }

    // Обучение модели
    async trainModel(features, labels, epochs = 50, batchSize = 16) {
        try {
            if (this.isTraining) {
                throw new Error('Training already in progress');
            }

            this.isTraining = true;
            console.log(`🚀 Standalone Worker: Starting training with ${features.length} samples`);

            // Создаем модель
            const model = await this.createModel(features[0].length);

            // Применяем взвешивание данных
            const { finalFeatures, finalLabels } = this.applyDataWeighting(features, labels);

            // Конвертируем данные в тензоры
            const xs = tf.tensor2d(finalFeatures);
            const ys = tf.tensor2d(finalLabels.map(label => [label]));

            // Обучение
            const history = await model.fit(xs, ys, {
                epochs: epochs,
                batchSize: batchSize,
                validationSplit: 0.2,
                verbose: 0,
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
            xs.dispose();
            ys.dispose();
            model.dispose();

            console.log('✅ Standalone Worker: Training completed successfully');
            
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
            console.error('❌ Standalone Worker: Training failed:', error);
            this.isTraining = false;
            
            // Отправляем алерт в Telegram об ошибке обучения
            try {
                const OptimizedTelegramService = (await import('../services/OptimizedTelegramService.js')).default;
                await OptimizedTelegramService.sendAlert(
                    'STANDALONE_WORKER_TRAINING_ERROR',
                    `❌ <b>ОШИБКА ОБУЧЕНИЯ В STANDALONE ВОРКЕРЕ</b>\n\n🔍 Ошибка: ${error.message}\n⏰ Время: ${new Date().toLocaleString('ru-RU')}`,
                    'error'
                );
            } catch (telegramError) {
                console.warn('Failed to send standalone worker training error alert:', telegramError.message);
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
}

// Обработка сообщений от основного процесса
const worker = new StandaloneTrainingWorker();

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
                
            default:
                console.log('Unknown message type:', message.type);
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
    console.log('🧠 Standalone Training Worker exiting');
});

console.log('🧠 Standalone Training Worker started');
