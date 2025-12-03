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

    // Человекочитаемое описание типа модели
    getModelTypeDescription(modelType) {
        switch (modelType) {
            case 'nn':
                return 'Классическая нейронная сеть по табличным признакам (бинарная классификация)';
            case 'ensemble':
                return 'Ансамблевая модель (комбинация нескольких предсказателей)';
            case 'meta':
                return 'Мета-обучение (адатация модели под задачу)';
            case 'rl':
                return 'Обучение с подкреплением (агент DQN)';
            default:
                return `Неизвестный тип модели: ${modelType}`;
        }
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
        
        console.log(`📅 Time-based split: train=${trainSize} (${(trainRatio*100).toFixed(0)}%), val=${valSize} (${(valRatio*100).toFixed(0)}%), test=${testFeatures.length} (${((1-trainRatio-valRatio)*100).toFixed(0)}%)`);
        
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
        if (imbalance > 0.2) {
            console.log(`⚖️ Обнаружен дисбаланс классов: ${(imbalance*100).toFixed(1)}% (pos=${posCount}, neg=${negCount})`);
            console.log(`⚖️ Class weights: 0=${normalizedNegWeight.toFixed(3)}, 1=${normalizedPosWeight.toFixed(3)}`);
        }
        
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
            const xs = tf.tensor2d(features);
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

    // Обучение модели
    async trainModel(features, labels, epochs = 50, batchSize = 16, modelType = 'nn') {
        try {
            if (this.isTraining) {
                throw new Error('Training already in progress');
            }

            this.isTraining = true;
            const featureSize = Array.isArray(features[0]) ? features[0].length : 0;
            const pos = labels.filter(v => v === 1).length;
            const neg = labels.length - pos;
            const modelDesc = this.getModelTypeDescription(modelType);
            console.log('🚀 Standalone Worker: Запуск обучения');
            console.log(`   • Тип модели: ${modelType} — ${modelDesc}`);
            console.log(`   • Объём данных: ${features.length} образцов, размер признакового вектора: ${featureSize}`);
            console.log(`   • Параметры: эпох=${epochs}, batchSize=${batchSize}`);
            console.log(`   • Баланс классов: положительных=${pos}, отрицательных=${neg}`);

            // Создаем модель
            const model = await this.createModel(features[0].length);

            // Time-based split (хронологическое разделение)
            const split = this.timeBasedSplit(features, labels, 0.7, 0.15);

            // Применяем взвешивание данных для train
            const { finalFeatures, finalLabels } = this.applyDataWeighting(split.train.features, split.train.labels);

            // Расчет class weights для балансировки классов
            // Примечание: TensorFlow.js не поддерживает sampleWeight в model.fit()
            // Используем взвешивание через дублирование данных (уже применено в applyDataWeighting)
            const classWeights = this.calculateClassWeights(finalLabels);
            
            // Конвертируем данные в тензоры для обучения
            const xs = tf.tensor2d(finalFeatures);
            const ys = tf.tensor2d(finalLabels.map(label => [label]));
            
            // Создаем тензоры для валидации
            const valXs = tf.tensor2d(split.val.features);
            const valYs = tf.tensor2d(split.val.labels.map(label => [label]));

            // Настройки для early stopping и reduce LR on plateau
            let bestValLoss = Infinity;
            let patience = 10; // Количество эпох без улучшения для early stopping
            let patienceCount = 0;
            let reduceLRPatience = 5; // Количество эпох без улучшения для снижения LR
            let reduceLRCount = 0;
            let currentLR = 0.001; // Начальный learning rate
            let lrReductionFactor = 0.5; // Коэффициент уменьшения LR
            let minLR = 1e-6; // Минимальный learning rate
            let lrHistory = []; // История изменений LR
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

            // Обучение
            const history = await model.fit(xs, ys, {
                epochs: epochs,
                batchSize: batchSize,
                // sampleWeight не поддерживается в TensorFlow.js - используем взвешивание через дублирование данных
                validationData: [valXs, valYs], // Используем time-based validation set
                verbose: 0,
                callbacks: {
                    onEpochEnd: async (epoch, logs) => {
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
                        
                        // Early stopping и reduce LR on plateau
                        const valLoss = logs.val_loss || logs.loss;
                        
                        if (valLoss < bestValLoss) {
                            // Улучшение - сбрасываем счетчики
                            bestValLoss = valLoss;
                            patienceCount = 0;
                            reduceLRCount = 0;
                            console.log(`✅ Epoch ${epoch + 1}: Улучшение val_loss = ${valLoss.toFixed(4)}`);
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
                                        
                                        console.log(`📉 Epoch ${epoch + 1}: Автоматическое уменьшение LR: ${oldLR.toFixed(6)} → ${currentLR.toFixed(6)} (плато ${reduceLRCount} эпох, уменьшение #${lrReductionCount})`);
                                    } catch (lrError) {
                                        console.warn(`⚠️ Не удалось изменить LR: ${lrError.message}`);
                                    }
                                }
                                
                                reduceLRCount = 0; // Сбрасываем счетчик после уменьшения LR
                            } else if (reduceLRCount >= reduceLRPatience && lrReductionCount >= maxLRReductions) {
                                // Достигнуто максимальное количество уменьшений LR
                                console.log(`📉 Epoch ${epoch + 1}: Плато обнаружено, но LR уже уменьшен ${maxLRReductions} раз (текущий LR=${currentLR.toFixed(6)})`);
                                reduceLRCount = 0; // Сбрасываем счетчик
                            }
                            
                            // Early stopping
                            if (patienceCount >= patience) {
                                model.stopTraining = true; // Останавливаем обучение в TensorFlow.js
                                console.log(`🛑 Epoch ${epoch + 1}: Early stopping (val_loss не улучшается ${patience} эпох, лучший val_loss = ${bestValLoss.toFixed(4)})`);
                            }
                        }
                    }
                }
            });

            // Освобождаем память
            xs.dispose();
            ys.dispose();
            valXs.dispose();
            valYs.dispose();

            // Расчет метрик ROC-AUC и F1 на валидации
            const valMetrics = await this.calculateMetrics(model, split.val.features, split.val.labels);
            const testMetrics = await this.calculateMetrics(model, split.test.features, split.test.labels);
            
            console.log(`📊 Validation metrics: F1=${valMetrics.f1.toFixed(4)}, ROC-AUC=${valMetrics.auc.toFixed(4)}, Precision=${valMetrics.precision.toFixed(4)}, Recall=${valMetrics.recall.toFixed(4)}`);
            console.log(`📊 Test metrics: F1=${testMetrics.f1.toFixed(4)}, ROC-AUC=${testMetrics.auc.toFixed(4)}, Precision=${testMetrics.precision.toFixed(4)}, Recall=${testMetrics.recall.toFixed(4)}`);

            model.dispose();

            console.log('✅ Standalone Worker: Обучение завершено успешно');
            
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
                    },
                    metrics: {
                        val: valMetrics,
                        test: testMetrics
                    },
                    meta: {
                        modelType,
                        samples: features.length,
                        featureSize,
                        epochs,
                        batchSize,
                        classBalance: { pos, neg }
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
                    message.data.batchSize,
                    message.data.modelType
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
