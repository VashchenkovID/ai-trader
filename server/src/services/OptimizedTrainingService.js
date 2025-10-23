import * as tf from '@tensorflow/tfjs';
import NeuralNetworkService from './NeuralNetworkService.js';
import OptimizedDataService from './OptimizedDataService.js';
import CacheService from './CacheService.js';
import { getService } from './GlobalServiceManager.js';

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
            enableValidation = true
        } = options;

        try {
            console.log(`🚀 Training ${figi}...`);
            this.isTraining = true;
            this.trainingProgress.currentInstrument = figi;

            // 1. Получаем данные
            const candles = await this.getTrainingData(figi, days);
            
            // Адаптивная проверка минимального количества данных
            const minCandles = this.getMinimumCandlesRequired(candles.length);
            if (candles.length < minCandles) {
                throw new Error(`Insufficient data: ${candles.length} candles (minimum required: ${minCandles})`);
            }
            
            console.log(`📊 Training data: ${candles.length} candles for ${figi}`);

            // 2. Подготавливаем фичи
            const { features, labels } = await this.prepareFeatures(candles, figi, useAdvancedFeatures);
            if (features.length === 0) {
                throw new Error('No features prepared');
            }

            // 3. Пытаемся загрузить существующую модель (тёплый старт), иначе создаем новую
            let model = await this.loadModel(figi);
            if (!model) {
                model = await this.createOptimizedModel(features[0].length);
            }

            // 4. Обучаем модель через воркер (избегаем клонирования функций TensorFlow.js)
            const trainingResult = await this.trainModelViaWorker(features, labels, epochs, batchSize);

            // 5. Валидация (опционально)
            let validationResult = null;
            if (enableValidation) {
                validationResult = await this.validateModel(model, features, labels);
            }

            // 6. Сохраняем модель
            await this.saveModel(figi, model);

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

            const indicators = OptimizedDataService.calculateTechnicalIndicators(prices, [], [], []);
            return indicators;
        } catch (error) {
            return new Array(10).fill(0);
        }
    }

    /**
     * Создание оптимизированной модели
     */
    async createOptimizedModel(inputShape) {
        const model = tf.sequential({
            layers: [
                tf.layers.dense({
                    units: Math.min(128, Math.max(32, inputShape * 2)),
                    activation: 'relu',
                    inputShape: [inputShape],
                    kernelInitializer: 'heUniform'
                }),
                tf.layers.dropout({ rate: 0.2 }),
                tf.layers.dense({
                    units: Math.min(64, Math.max(16, inputShape)),
                    activation: 'relu',
                    kernelInitializer: 'heUniform'
                }),
                tf.layers.dropout({ rate: 0.1 }),
                tf.layers.dense({
                    units: 1,
                    activation: 'sigmoid',
                    kernelInitializer: 'glorotUniform'
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
    async trainModelViaWorker(features, labels, epochs, batchSize) {
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
                data: { features, labels, epochs, batchSize }
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
    async trainModel(model, features, labels, epochs, batchSize) {
        // Взвешивание свежих данных: более новые примеры получают больший вес
        // Линейная шкала от 0.7 для самых старых до 1.3 для самых новых
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
            console.log(`📊 Data weighting applied: ${features.length} → ${finalFeatures.length} samples (${((finalFeatures.length / features.length - 1) * 100).toFixed(1)}% increase)`);
        }
        
        // Создаем тензоры из взвешенных данных
        const xs = tf.tensor2d(finalFeatures);
        const ys = tf.tensor2d(finalLabels.map(label => [label]));

        const history = await model.fit(xs, ys, {
            epochs,
            batchSize,
            validationSplit: 0.2,
            verbose: 0,
            // Взвешивание реализовано через дублирование важных примеров
            callbacks: {
                onEpochEnd: (epoch, logs) => {
                    this.trainingProgress.accuracy = logs.acc || 0;
                    this.broadcastEpochProgress(epoch, logs);
                }
            }
        });

        // Очистка памяти
        xs.dispose();
        ys.dispose();

        return {
            history: history.history,
            finalAccuracy: history.history.acc[history.history.acc.length - 1],
            finalLoss: history.history.loss[history.history.loss.length - 1]
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

        const valXs = tf.tensor2d(valFeatures);
        const valYs = tf.tensor2d(valLabels.map(label => [label]));

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
            
            // Создаем директорию models если не существует
            const modelsDir = './models';
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
     * Загрузка модели
     */
    async loadModel(figi) {
        try {
            const fs = await import('fs/promises');
            const path = await import('path');

            const modelsDir = './models';
            const modelPath = path.join(modelsDir, `${figi}_model.json`);
            const weightsPath = path.join(modelsDir, `${figi}_weights.json`);

            // Проверяем существование файлов
            const exists = await fs.access(modelPath).then(() => true).catch(() => false);
            const weightsExists = await fs.access(weightsPath).then(() => true).catch(() => false);
            if (!exists || !weightsExists) {
                return null;
            }

            // Загружаем архитектуру и веса
            const archRaw = await fs.readFile(modelPath, 'utf-8');
            const arch = JSON.parse(archRaw);

            const { default: tf } = await import('@tensorflow/tfjs');
            const model = await tf.models.modelFromJSON(arch);

            const weightsRaw = await fs.readFile(weightsPath, 'utf-8');
            const { specs } = JSON.parse(weightsRaw);
            const tensors = specs.map(s => tf.tensor(s.data, s.shape, s.dtype));
            model.setWeights(tensors);

            // Компилируем загруженную модель
            model.compile({
                optimizer: (await import('@tensorflow/tfjs')).train.adam(0.001),
                loss: 'binaryCrossentropy',
                metrics: ['accuracy']
            });

            console.log(`✅ Loaded existing model for ${figi}`);
            return model;
        } catch (error) {
            console.warn(`⚠️ Failed to load existing model for ${figi}:`, error.message);
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
        const WebSocketService = getService('WebSocketService');
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
        const WebSocketService = getService('WebSocketService');
        if (WebSocketService) {
            WebSocketService.broadcast({
                type: 'epoch_progress',
                data: {
                    epoch,
                    accuracy: logs.acc,
                    loss: logs.loss,
                    valAccuracy: logs.val_acc,
                    valLoss: logs.val_loss
                },
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
                order: [['name', 'ASC']],
                limit: 100
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
            
            // Загружаем веса
            if (weightData && weightData.length > 0) {
                const weights = weightData.map(w => tf.tensor(w.data, w.shape, w.dtype));
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

            const input = tf.tensor2d([features]);
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
     * Обработчики событий (заглушка для совместимости)
     */
    on(event, callback) {
        // Заглушка для совместимости с NeuralNetworkWorkerService
        console.log(`Event listener registered for: ${event}`);
    }
}

export default new OptimizedTrainingService();
