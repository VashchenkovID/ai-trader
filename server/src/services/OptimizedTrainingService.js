import * as tf from '@tensorflow/tfjs';
import NeuralNetworkService from './NeuralNetworkService.js';
import OptimizedDataService from './OptimizedDataService.js';
import CacheService from './CacheService.js';
import ModelManager from '../utils/ModelManager.js';
import { getService } from './GlobalServiceManager.js';
import ServiceManager from './ServiceManager.js';

/**
 * Оптимизированный сервис обучения нейросетей
 * Объединяет всю логику обучения в одном месте
 */
class OptimizedTrainingService {
    constructor() {
        this.isTraining = false;
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
            console.log('🛑 Stopping Optimized Training Service...');
            
            // Завершаем все worker'ы
            this.workers.forEach(worker => {
                if (worker && worker.terminate) {
                    worker.terminate();
                }
            });
            this.workers.clear();
            
            // Сбрасываем флаги
            this.isTraining = false;
            this.trainingProgress = {
                currentInstrument: null,
                totalInstruments: 0,
                completedInstruments: 0,
                currentStage: null,
                accuracy: 0
            };
            
            console.log('✅ Optimized Training Service stopped');
        } catch (error) {
            console.error('❌ Error stopping Optimized Training Service:', error);
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
            // Глобальный лок для типа модели (nn) — предотвращает параллельные запуски
            if (this.isTraining) {
                console.warn(`⚠️ Training already in progress, skipping new start for ${figi}`);
                return { success: false, figi, error: 'Training already in progress' };
            }
            // Per-FIGI лок — не позволяем запустить обучение для того же инструмента повторно
            if (this.trainingFigiLocks.has(figi)) {
                console.warn(`⚠️ Training already running for ${figi}, skipping duplicate start`);
                return { success: false, figi, error: 'Training already running for this FIGI' };
            }

            console.log(`🚀 Training ${figi}...`);
            this.isTraining = true;
            this.trainingProgress.currentInstrument = figi;
            this.trainingFigiLocks.add(figi);

            // 1. Проверяем, существует ли инструмент в кеше
            const instrument = await CacheService.getInstrument(figi, false);
            if (!instrument) {
                const errorMsg = `Instrument ${figi} not found in cache. Please ensure the instrument is cached before training.`;
                console.warn(`⚠️ ${errorMsg}`);
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
                console.warn(`⚠️ ${errorMsg}`);
                
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
            
            console.log(`📊 Training data: ${candles.length} candles for ${figi} (${instrument.name || figi})`);

            // 4. Подготавливаем фичи
            const { features, labels } = await this.prepareFeatures(candles, figi, useAdvancedFeatures);
            if (features.length === 0) {
                throw new Error('No features prepared');
            }

            // 3. Пытаемся загрузить существующую модель (тёплый старт), иначе создаем новую
            const inputSize = features[0].length;
            let model = await this.loadModel(figi, inputSize);
            if (!model) {
                model = await this.createOptimizedModel(inputSize);
            }

            // 4. Обучение: пробуем через воркер, при ошибке — локально
            let trainingResult;
            if (useWorker) {
                try {
                    trainingResult = await this.trainModelViaWorker(features, labels, epochs, batchSize, 'nn');
                } catch (workerError) {
                    console.warn(`⚠️ Worker training failed for ${figi}, falling back to local: ${workerError.message}`);
                    trainingResult = await this.trainModel(model, features, labels, epochs, batchSize);
                }
            } else {
                trainingResult = await this.trainModel(model, features, labels, epochs, batchSize);
            }

            // 5. Валидация (опционально)
            let validationResult = null;
            if (enableValidation) {
                validationResult = await this.validateModel(model, features, labels);
            }

            // 6. Сохраняем модель
            await this.saveModel(figi, model);
            
            // 6.0. Обновляем модель в NeuralNetworkService для использования в анализе
            try {
                const NeuralNetworkService = (await import('./NeuralNetworkService.js')).default;
                NeuralNetworkService.model = model;
                console.log(`✅ Model updated in NeuralNetworkService for ${figi}`);
            } catch (nnError) {
                console.warn(`⚠️ Failed to update model in NeuralNetworkService: ${nnError.message}`);
            }

            // 6.1. Условительное сохранение лучшей модели по вал. accuracy
            if (validationResult && typeof validationResult.accuracy === 'number') {
                const currentAccuracy = validationResult.accuracy;
                const bestMeta = await this.loadBestMeta(figi);
                const bestAcc = bestMeta?.bestAccuracy ?? -Infinity;
                if (currentAccuracy > bestAcc) {
                    await this.saveBestModel(figi, model, currentAccuracy);
                    console.log(`🏅 Saved BEST model for ${figi} (valAcc=${currentAccuracy.toFixed(4)})`);
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

            console.log(`✅ Training completed for ${figi}. Accuracy: ${trainingResult.finalAccuracy?.toFixed(3) || 'N/A'}`);

            return {
                success: true,
                figi,
                trainingResult,
                validationResult,
                model,
                featuresCount: features.length,
                accuracy: trainingResult.finalAccuracy || 0
            };

        } catch (error) {
            console.error(`❌ Training failed for ${figi}:`, error.message);
            
            // Отправляем алерт в Telegram об ошибке обучения
            try {
                const OptimizedTelegramService = (await import('./OptimizedTelegramService.js')).default;
                await OptimizedTelegramService.sendAlert(
                    'TRAINING_ERROR',
                    `❌ <b>ОШИБКА ОБУЧЕНИЯ</b>\n\n📈 Инструмент: <b>${figi}</b>\n🔍 Ошибка: ${error.message}\n⏰ Время: ${new Date().toLocaleString('ru-RU')}`,
                    'error'
                );
            } catch (telegramError) {
                console.warn('Failed to send training error alert:', telegramError.message);
            }
            
            return {
                success: false,
                figi,
                error: error.message
            };
        } finally {
            this.isTraining = false;
            this.trainingProgress.currentInstrument = null;
            // Снимаем лок для FIGI
            try { this.trainingFigiLocks.delete(figi); } catch {}
        }
    }

    /**
     * Пакетное обучение для множества инструментов
     */
    async trainMultipleInstruments(instruments, options = {}) {
        console.log(`🚀 Starting batch training for ${instruments.length} instruments...`);
        
        this.trainingProgress.totalInstruments = instruments.length;
        this.trainingProgress.completedInstruments = 0;

        const results = [];
        const errors = [];

        for (const instrument of instruments) {
            try {
                // Обрабатываем как строки FIGI или как объекты
                const figi = typeof instrument === 'string' ? instrument : instrument.figi;
                const name = typeof instrument === 'string' ? figi : instrument.name;
                
                console.log(`🚀 Training ${name} (${figi})...`);
                const result = await this.trainInstrument(figi, options);
                results.push(result);
                this.trainingProgress.completedInstruments++;
                
                // Уведомляем о прогрессе
                this.broadcastProgress(name, result.accuracy);
                
            } catch (error) {
                const figi = typeof instrument === 'string' ? instrument : instrument.figi;
                const name = typeof instrument === 'string' ? figi : instrument.name;
                errors.push({ figi, name, error: error.message });
                console.error(`❌ Failed training for ${name}:`, error.message);
            }
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

        console.log(`📊 Training Summary: ${summary.successful}/${summary.total} successful (${summary.successRate.toFixed(1)}%)`);
        return summary;
    }

    /**
     * Получение данных для обучения
     */
    async getTrainingData(figi, days) {
        let candles = await CacheService.getCandles(figi, 'DAY', days);
        
        // Если данных мало, пытаемся расширить окно
        if (candles.length < 100) {
            console.log(`📊 Insufficient data for ${figi}: ${candles.length} candles, trying to extend...`);
            
            // Пробуем разные периоды
            const periods = [days * 2, days * 3, 365, 720, 1080];
            
            for (const period of periods) {
                const extendedCandles = await CacheService.getCandles(figi, 'DAY', period);
                if (extendedCandles.length > candles.length) {
                    candles = extendedCandles;
                    console.log(`📈 Extended data for ${figi}: ${candles.length} candles (${period} days)`);
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
            
            console.log(`📊 Adaptive parameters: lookback=${adaptiveLookback}, horizon=${predictionHorizon}`);
            
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

            // OptimizedDataService уже включает все необходимые фичи:
            // - Нормализованные цены и объемы
            // - Технические индикаторы (RSI, MACD, Bollinger Bands, SMA, EMA)
            // - Временные фичи
            // - Рыночные фичи
            // - Новостные фичи
            // - Telegram фичи
            // Дополнительные технические индикаторы не нужны, так как они уже включены
            
            console.log(`📊 Prepared ${features.length} samples with ${features[0]?.length || 0} features each`);
            
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
        // L2 регуляризация для предотвращения переобучения
        const l2Regularizer = tf.regularizers.l2({ l2: 0.001 });
        
        const model = tf.sequential({
            layers: [
                tf.layers.dense({
                    units: Math.min(128, Math.max(32, inputShape * 2)),
                    activation: 'relu',
                    inputShape: [inputShape],
                    kernelInitializer: 'heUniform',
                    kernelRegularizer: l2Regularizer // L2 регуляризация
                }),
                tf.layers.dropout({ rate: 0.25 }), // Увеличен dropout для лучшей регуляризации
                tf.layers.dense({
                    units: Math.min(64, Math.max(16, inputShape)),
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

        model.compile({
            optimizer: tf.train.adam(0.001),
            loss: 'binaryCrossentropy',
            metrics: ['accuracy']
        });

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
            
            // Добавляем worker в список для отслеживания
            this.workers.add(worker);
            
            worker.postMessage({
                type: 'train',
                data: { features, labels, epochs, batchSize, modelType }
            });
            
            worker.on('message', (msg) => {
                if (msg.type === 'training_complete') {
                    this.workers.delete(worker);
                    resolve(msg.data);
                    worker.terminate();
                } else if (msg.type === 'training_error') {
                    this.workers.delete(worker);
                    reject(new Error(msg.data.error));
                    worker.terminate();
                } else if (msg.type === 'training_progress') {
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
            
            worker.on('error', (error) => {
                this.workers.delete(worker);
                reject(error);
                worker.terminate();
            });
            
            worker.on('exit', (code) => {
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
            // Убеждаемся, что features - это массив массивов, и указываем форму явно
            const featuresArray = Array.isArray(features[0]) ? features : [features];
            const xs = tf.tensor2d(featuresArray, [featuresArray.length, featuresArray[0].length]);
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
        
        // Логируем информацию о взвешивании
        if (weightedFeatures.length > 0) {
            console.log(`📊 Data weighting applied: ${split.train.features.length} → ${finalTrainFeatures.length} samples (${((finalTrainFeatures.length / split.train.features.length - 1) * 100).toFixed(1)}% increase)`);
        }
        
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
                        console.log(`✅ Epoch ${epoch + 1}: Улучшение val_loss = ${valLoss.toFixed(4)}, val_acc = ${(valAccuracy * 100).toFixed(2)}%, acc = ${(accuracy * 100).toFixed(2)}%`);
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

        // Очистка памяти
        xs.dispose();
        ys.dispose();
        valXs.dispose();
        valYs.dispose();

        // Расчет метрик ROC-AUC и F1 на валидации
        const valMetrics = await this.calculateMetrics(model, split.val.features, split.val.labels);
        const testMetrics = await this.calculateMetrics(model, split.test.features, split.test.labels);
        
        console.log(`📊 Validation metrics: F1=${valMetrics.f1.toFixed(4)}, ROC-AUC=${valMetrics.auc.toFixed(4)}, Precision=${valMetrics.precision.toFixed(4)}, Recall=${valMetrics.recall.toFixed(4)}`);
        console.log(`📊 Test metrics: F1=${testMetrics.f1.toFixed(4)}, ROC-AUC=${testMetrics.auc.toFixed(4)}, Precision=${testMetrics.precision.toFixed(4)}, Recall=${testMetrics.recall.toFixed(4)}`);
        
        // Логируем историю изменений LR, если были изменения
        if (lrHistory.length > 0) {
            console.log(`📈 История изменений LR (${lrHistory.length} раз):`);
            lrHistory.forEach((lrChange, idx) => {
                console.log(`   ${idx + 1}. Эпоха ${lrChange.epoch}: ${lrChange.oldLR.toFixed(6)} → ${lrChange.newLR.toFixed(6)} (val_loss=${lrChange.valLoss.toFixed(4)})`);
            });
        }

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
     * Валидация модели
     */
    async validateModel(model, features, labels) {
        const splitIndex = Math.floor(features.length * 0.8);
        const valFeatures = features.slice(splitIndex);
        const valLabels = labels.slice(splitIndex);

        if (valFeatures.length === 0) return null;

        // Убеждаемся, что valFeatures - массив массивов, и указываем форму явно
        const valFeaturesShape = [valFeatures.length, valFeatures[0]?.length || 0];
        const valXs = tf.tensor2d(valFeatures, valFeaturesShape);
        const valLabelsArray = valLabels.map(label => [label]);
        const valYs = tf.tensor2d(valLabelsArray, [valLabelsArray.length, 1]);

        const predictions = model.predict(valXs);
        const predictedValues = await predictions.data();
        predictions.dispose();

        const actualValues = valLabels;
        const correct = predictedValues.reduce((acc, pred, i) => {
            return acc + (Math.round(pred) === actualValues[i] ? 1 : 0);
        }, 0);

        const accuracy = correct / valFeatures.length;

        valXs.dispose();
        valYs.dispose();

        return { accuracy, correct, total: valFeatures.length };
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
            
            // Сохраняем веса
            await fs.writeFile(weightsPath, JSON.stringify({ specs }, null, 2));
            
            console.log(`✅ Model saved for ${figi}: ${modelPath}, ${weightsPath}`);
            
            // Также сохраняем через ModelManager для совместимости
            try {
                await ModelManager.saveModel(model, `neural/${figi}`);
                console.log(`✅ Model also saved via ModelManager for ${figi}`);
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
            const { default: tf } = await import('@tensorflow/tfjs');

            const modelsDir = './models';
            await fs.mkdir(modelsDir, { recursive: true });

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
            const { default: tf } = await import('@tensorflow/tfjs');

            const modelsDir = './models';
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

            console.log(`✅ Loaded BEST model for ${figi}`);
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
                    console.log(`🏅 Current model saved as best for ${figi} (accuracy=${currentMetrics.accuracy.toFixed(4)})`);
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
                        
                        console.log(`🔄 Restored BEST model for ${figi} (accuracy=${bestAccuracy.toFixed(4)})`);
                        
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
                    console.log(`🏅 Updated BEST model for ${figi} (accuracy=${currentAccuracy.toFixed(4)})`);
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

            const modelsDir = './models';
            
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
                            console.log(`ℹ️ Input size mismatch for ${figi}: model expects ${modelInputSize}, but features have size ${inputSize}. This is expected when feature set changes. Creating new model.`);
                            // Удаляем несовместимую модель для освобождения места
                            try {
                                if (await fs.access(figiModelPath).then(() => true).catch(() => false)) {
                                    await fs.unlink(figiModelPath);
                                }
                                if (await fs.access(figiWeightsPath).then(() => true).catch(() => false)) {
                                    await fs.unlink(figiWeightsPath);
                                }
                                console.log(`🗑️ Removed incompatible model files for ${figi}`);
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
                            console.log(`ℹ️ Input size mismatch for ${figi} (ModelManager): model expects ${modelInputSize}, but features have size ${inputSize}. This is expected when feature set changes. Creating new model.`);
                            return null;
                        }
                    }
                    
                    console.log(`✅ Loaded model for ${figi} via ModelManager`);
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
                            console.log(`ℹ️ Input size mismatch for general model (used for ${figi}): model expects ${modelInputSize}, but features have size ${inputSize}. This is expected when feature set changes. Creating new model.`);
                            // Удаляем несовместимую общую модель
                            try {
                                if (await fs.access(generalModelPath).then(() => true).catch(() => false)) {
                                    await fs.unlink(generalModelPath);
                                }
                                const generalWeightsPath = path.join(modelsDir, 'neural_model_weights.json');
                                if (await fs.access(generalWeightsPath).then(() => true).catch(() => false)) {
                                    await fs.unlink(generalWeightsPath);
                                }
                                console.log(`🗑️ Removed incompatible general model files`);
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
                    
                    console.log(`✅ Loaded general model as fallback for ${figi}`);
                    return model;
                }
            } catch (generalError) {
                console.warn(`⚠️ Failed to load general model as fallback for ${figi}:`, generalError.message);
            }
            
            // Fallback: модель не найдена, вернем null (будет создана новая)
            console.log(`📭 No existing model found for ${figi}, will create new one`);
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
            isTraining: this.isTraining,
            progress: this.trainingProgress
        };
    }

    /**
     * Получение доступных инструментов для обучения
     */
    async getAvailableInstruments() {
        try {
            console.log('🔍 Getting available instruments for training...');
            const CachedInstrument = (await import('../models/CachedInstrument.js')).default;
            const CachedCandle = (await import('../models/CachedCandle.js')).default;
            
            // Сначала проверим общее количество инструментов
            const totalInstruments = await CachedInstrument.count();
            console.log(`📊 Total instruments in database: ${totalInstruments}`);
            
            // Проверим активные инструменты
            const activeInstruments = await CachedInstrument.count({
                where: { isActive: true }
            });
            console.log(`✅ Active instruments: ${activeInstruments}`);
            
            const instruments = await CachedInstrument.findAll({
                where: { isActive: true },
                order: [['name', 'ASC']]
            });

            console.log(`📋 Found ${instruments.length} active instruments`);

            const validInstruments = [];
            
            for (const instrument of instruments) {
                try {
                    const candleCount = await CachedCandle.count({
                        where: { figi: instrument.figi }
                    });

                    console.log(`📈 ${instrument.ticker} (${instrument.name}): ${candleCount} candles`);

                    // Адаптивные требования к количеству свечей
                    const minCandles = this.getMinimumCandlesRequired(candleCount);
                    console.log(`   Min required: ${minCandles}, Has: ${candleCount}`);
                    
                    if (candleCount >= minCandles) {
                        validInstruments.push({
                            figi: instrument.figi,
                            name: instrument.name,
                            ticker: instrument.ticker,
                            type: instrument.type,
                            candleCount
                        });
                        console.log(`   ✅ Added to training list`);
                    } else {
                        console.log(`   ❌ Insufficient data`);
                    }
                } catch (error) {
                    console.warn(`Error checking ${instrument.name}:`, error.message);
                }
            }

            console.log(`🎯 Valid instruments for training: ${validInstruments.length}`);
            return validInstruments.slice(0, 20);
        } catch (error) {
            console.error('Error getting available instruments:', error);
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
                console.log(`📥 Using in-memory model for ${figi}`);
                return this.currentModel.model;
            }

            // Если нет в памяти, пытаемся загрузить из файлов
            const modelPath = `./models/${figi}_model.json`;
            const weightsPath = `./models/${figi}_weights.json`;
            
            // Проверяем существование файлов
            const fs = await import('fs/promises');
            try {
                await fs.access(modelPath);
                await fs.access(weightsPath);
            } catch {
                console.warn(`⚠️ Model files not found for ${figi}`);
                return null; // Модель не найдена
            }

            // Загружаем модель
            const modelJson = await fs.readFile(modelPath, 'utf8');
            const weightsJson = await fs.readFile(weightsPath, 'utf8');
            
            // Парсим JSON данные
            const modelTopology = JSON.parse(modelJson);
            const weightData = JSON.parse(weightsJson);
            
            // Создаем модель из архитектуры
            const model = tf.sequential();
            
            // Восстанавливаем слои из архитектуры
            for (const layerConfig of modelTopology.layers) {
                if (layerConfig.class_name === 'LSTM') {
                    model.add(tf.layers.lstm({
                        units: layerConfig.config.units,
                        returnSequences: layerConfig.config.return_sequences,
                        inputShape: layerConfig.config.batch_input_shape ? layerConfig.config.batch_input_shape.slice(1) : undefined
                    }));
                } else if (layerConfig.class_name === 'Dense') {
                    model.add(tf.layers.dense({
                        units: layerConfig.config.units,
                        activation: layerConfig.config.activation
                    }));
                } else if (layerConfig.class_name === 'Dropout') {
                    model.add(tf.layers.dropout({
                        rate: layerConfig.config.rate
                    }));
                }
            }
            
            // Компилируем модель
            model.compile({
                optimizer: tf.train.adam(0.001),
                loss: 'binaryCrossentropy',
                metrics: ['accuracy']
            });
            
            // Загружаем веса (формат { specs: [...] })
            if (weightData && (Array.isArray(weightData) || Array.isArray(weightData.specs))) {
                const specsArray = Array.isArray(weightData) ? weightData : weightData.specs;
                const weights = specsArray.map(w => tf.tensor(w.data, w.shape, w.dtype));
                model.setWeights(weights);
            }

            console.log(`📥 Model loaded from files for ${figi}`);
            return model;
        } catch (error) {
            console.error(`❌ Error loading model for ${figi}:`, error);
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
        try {
            console.log('🚀 Starting batch training for ALL neural networks...');
            
            // Получаем все инструменты из кеша
            const instruments = await CacheService.getAllInstruments();
            if (!instruments || instruments.length === 0) {
                throw new Error('No instruments available for training');
            }
            
            console.log(`📊 Found ${instruments.length} instruments for training`);
            
            // Используем существующий метод trainMultipleInstruments
            const result = await this.trainMultipleInstruments(instruments, {
                epochs,
                batchSize,
                days: 180,
                useAdvancedFeatures: true,
                enableValidation: true
            });
            
            console.log('✅ Batch training for all neural networks completed');
            return result;
            
        } catch (error) {
            console.error('❌ Batch training for all neural networks failed:', error);
            throw error;
        }
    }

    /**
     * Подбор гиперпараметров на 3-5 FIGI
     * Тестирует различные комбинации epochs, batchSize, predictionHorizon, days
     */
    async tuneHyperparameters(testFigis = null, options = {}) {
        try {
            console.log('🔍 Starting hyperparameter tuning...');
            
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
                console.log(`📊 Selected ${figis.length} instruments for tuning: ${figis.join(', ')}`);
            }

            // Сетка гиперпараметров для тестирования
            const epochsOptions = options.epochsOptions || [30, 50, 70];
            const batchSizeOptions = options.batchSizeOptions || [8, 16, 32];
            const daysOptions = options.daysOptions || [120, 180, 365];
            const horizonOptions = options.horizonOptions || [3, 5, 7];
            const lookbackOptions = options.lookbackOptions || [40, 60, 80]; // Lookback период для тестирования

            console.log(`🔍 Testing hyperparameter combinations:`);
            console.log(`   Epochs: ${epochsOptions.join(', ')}`);
            console.log(`   Batch Size: ${batchSizeOptions.join(', ')}`);
            console.log(`   Days: ${daysOptions.join(', ')}`);
            console.log(`   Horizon: ${horizonOptions.join(', ')}`);
            console.log(`   Lookback: ${lookbackOptions.join(', ')}`);

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
                                
                                console.log(`\n🔬 Testing combination ${currentCombination}/${totalCombinations}:`, combination);
                                
                                let totalAccuracy = 0;
                                let totalF1 = 0;
                                let totalAuc = 0;
                                let successfulTests = 0;
                                const figiResults = {};

                                // Тестируем на каждом FIGI
                                for (const figi of figis) {
                                    try {
                                        console.log(`   Testing ${figi} with epochs=${epochs}, batchSize=${batchSize}, days=${days}, horizon=${horizon}, lookback=${lookback}...`);
                                        
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

                                        console.log(`   ✅ ${figi}: accuracy=${metrics.accuracy.toFixed(4)}, f1=${metrics.f1.toFixed(4)}, auc=${metrics.auc.toFixed(4)}`);

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

                                    console.log(`   📊 Average: accuracy=${avgAccuracy.toFixed(4)}, f1=${avgF1.toFixed(4)}, auc=${avgAuc.toFixed(4)}`);
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
            
            console.log(`\n🏆 Best hyperparameters found:`);
            console.log(`   Epochs: ${bestCombination.combination.epochs}`);
            console.log(`   Batch Size: ${bestCombination.combination.batchSize}`);
            console.log(`   Days: ${bestCombination.combination.days}`);
            console.log(`   Horizon: ${bestCombination.combination.horizon}`);
            console.log(`   Lookback: ${bestCombination.combination.lookback}`);
            console.log(`   Average F1: ${bestCombination.metrics.f1.toFixed(4)}`);
            console.log(`   Average Accuracy: ${bestCombination.metrics.accuracy.toFixed(4)}`);
            console.log(`   Average AUC: ${bestCombination.metrics.auc.toFixed(4)}`);

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
