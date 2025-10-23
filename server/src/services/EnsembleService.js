import * as tf from '@tensorflow/tfjs';
import CacheService from './CacheService.js';
import WebSocketService from './WebSocketService.js';
import OptimizedAnalysisService from './OptimizedAnalysisService.js';
import ModelManager from '../utils/ModelManager.js';
import { getService } from './GlobalServiceManager.js';

/**
 * Сервис ансамбля нейросетей
 * Реализует 3 специализированные модели:
 * - Short-term LSTM (40% веса) - Внутридневные паттерны (24 часа)
 * - Medium-term CNN (35% веса) - Графические паттерны (30 дней)  
 * - Long-term Transformer (25% веса) - Контекстный анализ (12 недель)
 */
class EnsembleService {
    constructor() {
        this.models = {
            lstm: null,
            cnn: null,
            transformer: null
        };
        this.weights = {
            lstm: 0.4,
            cnn: 0.35,
            transformer: 0.25
        };
        this.isInitialized = false;
        this.isTraining = false;
        this.performance = {
            lstm: { accuracy: 0, precision: 0, recall: 0, f1Score: 0 },
            cnn: { accuracy: 0, precision: 0, recall: 0, f1Score: 0 },
            transformer: { accuracy: 0, precision: 0, recall: 0, f1Score: 0 }
        };
    }

    /**
     * Инициализация ансамбля
     */
    async initialize() {
        try {
            console.log('🎭 Initializing Ensemble Service...');
            
            // Загружаем модели синхронно при инициализации
            await this.loadModelsInBackground();
            
            this.isInitialized = true;
            console.log('✅ Ensemble Service initialized');
        } catch (error) {
            console.error('❌ Failed to initialize Ensemble Service:', error);
            throw error;
        }
    }

    /**
     * Фоновая загрузка моделей
     */
    async loadModelsInBackground() {
        try {
            console.log('🔄 Loading ensemble models in background...');
            
            // Сначала пытаемся загрузить существующие модели
            await this.loadModels();
            
            // Если не все модели загружены, создаем недостающие
            for (const modelType of ['lstm', 'cnn', 'transformer']) {
                if (!this.models[modelType]) {
                    console.log(`🔨 Creating new ${modelType} model...`);
                    switch (modelType) {
                        case 'lstm':
                            this.models[modelType] = this.createLSTMModel();
                            break;
                        case 'cnn':
                            this.models[modelType] = this.createCNNModel();
                            break;
                        case 'transformer':
                            this.models[modelType] = this.createTransformerModel();
                            break;
                    }
                    
                    // Сразу сохраняем созданную модель
                    if (this.models[modelType]) {
                        console.log(`💾 Saving newly created ${modelType} model...`);
                        const success = await ModelManager.saveModel(this.models[modelType], `ensemble/${modelType}`);
                        if (success) {
                            console.log(`✅ ${modelType} model saved successfully`);
                        } else {
                            console.error(`❌ Failed to save ${modelType} model`);
                        }
                    }
                }
            }
            
            console.log('✅ Ensemble models loaded in background');
        } catch (error) {
            console.warn('⚠️ Background ensemble model loading failed:', error.message);
        }
    }

    /**
     * Обеспечение готовности моделей
     */
    async ensureModelsReady() {
        const maxWaitTime = 30000; // 30 секунд
        const checkInterval = 500; // 0.5 секунды
        let waitTime = 0;

        while (waitTime < maxWaitTime) {
            // Проверяем, все ли модели загружены
            const allModelsReady = ['lstm', 'cnn', 'transformer'].every(
                modelType => this.models[modelType] !== null
            );

            if (allModelsReady) {
                return true;
            }

            // Ждем немного и проверяем снова
            await new Promise(resolve => setTimeout(resolve, checkInterval));
            waitTime += checkInterval;
        }

        // Если модели не загрузились за отведенное время, создаем их синхронно
        console.warn('⚠️ Models not ready, creating synchronously...');
        for (const modelType of ['lstm', 'cnn', 'transformer']) {
            if (!this.models[modelType]) {
                switch (modelType) {
                    case 'lstm':
                        this.models[modelType] = this.createLSTMModel();
                        break;
                    case 'cnn':
                        this.models[modelType] = this.createCNNModel();
                        break;
                    case 'transformer':
                        this.models[modelType] = this.createTransformerModel();
                        break;
                }
            }
        }
    }

    /**
     * Создание всех моделей ансамбля
     */
    async createModels() {
        // LSTM для краткосрочного анализа
        this.models.lstm = this.createLSTMModel();
        
        // CNN для среднесрочного анализа
        this.models.cnn = this.createCNNModel();
        
        // Transformer для долгосрочного анализа
        this.models.transformer = this.createTransformerModel();
        
        console.log('✅ All ensemble models created');
    }

    /**
     * Создание конкретной модели по типу
     */
    async createModel(modelType) {
        switch (modelType) {
            case 'lstm':
                return this.createLSTMModel();
            case 'cnn':
                return this.createCNNModel();
            case 'transformer':
                return this.createTransformerModel();
            default:
                throw new Error(`Unknown model type: ${modelType}`);
        }
    }

    /**
     * Создание LSTM модели для краткосрочного анализа
     */
    createLSTMModel() {
        const model = tf.sequential({
            layers: [
                tf.layers.lstm({
                    units: 64,
                    returnSequences: true,
                    inputShape: [24, 10], // 24 часа, 10 фичей
                    dropout: 0.2,
                    recurrentDropout: 0.2,
                    // Заменяем Orthogonal на более быстрые инициализаторы
                    kernelInitializer: 'glorotUniform',
                    recurrentInitializer: 'glorotUniform'
                }),
                tf.layers.lstm({
                    units: 32,
                    returnSequences: false,
                    dropout: 0.2,
                    kernelInitializer: 'glorotUniform',
                    recurrentInitializer: 'glorotUniform'
                }),
                tf.layers.dense({ 
                    units: 16, 
                    activation: 'relu',
                    kernelInitializer: 'heUniform'
                }),
                tf.layers.dropout({ rate: 0.3 }),
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
     * Создание CNN модели для среднесрочного анализа
     */
    createCNNModel() {
        const model = tf.sequential({
            layers: [
                tf.layers.conv1d({
                    filters: 32,
                    kernelSize: 3,
                    activation: 'relu',
                    inputShape: [30, 10], // 30 дней, 10 фичей
                    kernelInitializer: 'heUniform',
                    biasInitializer: 'zeros'
                }),
                tf.layers.maxPooling1d({ poolSize: 2 }),
                tf.layers.conv1d({
                    filters: 64,
                    kernelSize: 3,
                    activation: 'relu',
                    kernelInitializer: 'heUniform',
                    biasInitializer: 'zeros'
                }),
                tf.layers.maxPooling1d({ poolSize: 2 }),
                tf.layers.flatten(),
                tf.layers.dense({ 
                    units: 32, 
                    activation: 'relu',
                    kernelInitializer: 'heUniform'
                }),
                tf.layers.dropout({ rate: 0.3 }),
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
     * Создание Transformer модели для долгосрочного анализа
     */
    createTransformerModel() {
        // Упрощенная версия Transformer для браузера
        const model = tf.sequential({
            layers: [
                tf.layers.flatten({
                    inputShape: [84, 10] // 12 недель * 7 дней, 10 фичей
                }),
                tf.layers.dense({
                    units: 128,
                    activation: 'relu',
                    kernelInitializer: 'heUniform'
                }),
                tf.layers.dropout({ rate: 0.2 }),
                tf.layers.dense({ 
                    units: 64, 
                    activation: 'relu',
                    kernelInitializer: 'heUniform'
                }),
                tf.layers.dropout({ rate: 0.2 }),
                tf.layers.dense({ 
                    units: 32, 
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
     * Обучение ансамбля
     */
    async trainEnsemble(figi, options = {}) {
        const {
            days = 180,
            epochs = 50,
            batchSize = 16
        } = options;

        // Получаем TrainingStatusService один раз
        const trainingStatusService = getService('TrainingStatusService');
        
        try {
            console.log(`🎭 Training ensemble for ${figi}...`);
            this.isTraining = true;
            
            // Обновляем статус обучения
            if (trainingStatusService) {
                trainingStatusService.startTraining('ensemble', 1);
            }

            // Получаем данные
            const candles = await CacheService.getCandles(figi, 'DAY', days);
            console.log(`📊 Retrieved ${candles.length} candles for ${figi}`);
            
            if (candles.length < 100) {
                throw new Error(`Insufficient data: ${candles.length} candles`);
            }
            
            // Проверяем, что данные реальные
            if (candles.length > 0) {
                const sampleCandle = candles[0];
                console.log(`📈 Sample candle data:`, {
                    time: sampleCandle.time,
                    open: sampleCandle.open,
                    close: sampleCandle.close,
                    high: sampleCandle.high,
                    low: sampleCandle.low,
                    volume: sampleCandle.volume
                });
            }

            // Подготавливаем данные для каждой модели
            const lstmData = await this.prepareLSTMData(candles);
            const cnnData = await this.prepareCNNData(candles);
            const transformerData = await this.prepareTransformerData(candles);

            // Обучаем каждую модель
            const lstmResult = await this.trainModel('lstm', lstmData, epochs, batchSize);
            const cnnResult = await this.trainModel('cnn', cnnData, epochs, batchSize);
            const transformerResult = await this.trainModel('transformer', transformerData, epochs, batchSize);

            // Обновляем производительность
            this.performance.lstm = lstmResult;
            this.performance.cnn = cnnResult;
            this.performance.transformer = transformerResult;

            // Адаптивные веса на основе производительности
            await this.updateWeights();

            console.log('✅ Ensemble training completed');
            
            // Завершаем обучение
            if (trainingStatusService) {
                trainingStatusService.completeTraining('ensemble', true);
            }
            
            return {
                success: true,
                performance: this.performance,
                weights: this.weights
            };

        } catch (error) {
            console.error('❌ Ensemble training failed:', error);
            
            // Завершаем обучение с ошибкой
            if (trainingStatusService) {
                trainingStatusService.completeTraining('ensemble', false);
            }
            
            // Отправляем алерт в Telegram об ошибке Ensemble обучения
            try {
                const OptimizedTelegramService = (await import('./OptimizedTelegramService.js')).default;
                if (OptimizedTelegramService.isInitialized) {
                    await OptimizedTelegramService.sendAlert(
                        'ENSEMBLE_TRAINING_ERROR',
                        `❌ <b>ОШИБКА ОБУЧЕНИЯ АНСАМБЛЯ</b>\n\n📈 Инструмент: <b>${figi}</b>\n🔍 Ошибка: ${error.message}\n⏰ Время: ${new Date().toLocaleString('ru-RU')}`,
                        'error'
                    );
                } else {
                    console.log('⚠️ Telegram service not initialized, skipping alert');
                }
            } catch (telegramError) {
                console.error('❌ Failed to send ensemble training error alert:', telegramError.message);
            }
            
            throw error;
        } finally {
            this.isTraining = false;
        }
    }

    /**
     * Обучение отдельной модели
     */
    async trainModel(modelType, data, epochs, batchSize) {
        const { features, labels } = data;
        
        // Проверяем наличие данных
        if (!features || !labels || features.length === 0 || labels.length === 0) {
            throw new Error(`No training data provided for ${modelType}`);
        }
        
        // Инициализируем сервис, если не инициализирован
        if (!this.isInitialized) {
            console.log('🔧 Initializing Ensemble Service...');
            await this.initialize();
        }
        
        let model = this.models[modelType];

        // Если модель не существует, создаем её
        if (!model) {
            console.log(`🔨 Creating new ${modelType} model...`);
            model = await this.createModel(modelType);
            this.models[modelType] = model;
        }

        // Проверяем размерности данных
        console.log(`🔍 Debug ${modelType} data shapes:`);
        console.log(`   Features: ${features.length} samples`);
        console.log(`   Features[0]: ${features[0]?.length} time steps`);
        console.log(`   Features[0][0]: ${features[0]?.[0]?.length} features per step`);
        console.log(`   Labels: ${labels.length} samples`);
        
        // Создаем тензоры с правильными размерностями
        let xs, ys;
        
        if (modelType === 'transformer') {
            // Transformer ожидает 2D данные [samples, features]
            // Преобразуем [samples, time_steps, features] в [samples, time_steps * features]
            const flattenedFeatures = features.map(sample => 
                sample.flat() // Преобразуем [84, 10] в [840]
            );
            xs = tf.tensor2d(flattenedFeatures);
        } else {
            // LSTM и CNN ожидают 3D данные [samples, time_steps, features]
            xs = tf.tensor3d(features);
        }
        
        ys = tf.tensor2d(labels, [labels.length, 1]);
        
        if (modelType === 'transformer') {
            console.log(`   X tensor shape: [${xs.shape[0]}, ${xs.shape[1]}] (2D for transformer)`);
        } else {
            console.log(`   X tensor shape: [${xs.shape[0]}, ${xs.shape[1]}, ${xs.shape[2]}] (3D for ${modelType})`);
        }
        console.log(`   Y tensor shape: [${ys.shape[0]}, ${ys.shape[1]}]`);

        const history = await model.fit(xs, ys, {
            epochs,
            batchSize,
            validationSplit: 0.2,
            verbose: 0,
            callbacks: {
                onEpochEnd: (epoch, logs) => {
                    this.broadcastProgress(modelType, epoch, logs);
                }
            }
        });

        // Очистка памяти
        xs.dispose();
        ys.dispose();

        // Простые метрики без вызова predict
        const finalAccuracy = history.history.acc[history.history.acc.length - 1];
        const finalLoss = history.history.loss[history.history.loss.length - 1];
        
        return {
            accuracy: finalAccuracy,
            loss: finalLoss,
            precision: finalAccuracy, // Упрощенная метрика
            recall: finalAccuracy,    // Упрощенная метрика
            f1Score: finalAccuracy // Упрощенная метрика
        };
    }

    /**
     * Подготовка данных для LSTM (24 часа)
     */
    async prepareLSTMData(candles) {
        const features = [];
        const labels = [];

        for (let i = 24; i < candles.length - 1; i++) {
            const window = candles.slice(i - 24, i);
            const nextCandle = candles[i + 1];
            
            // Подготавливаем фичи
            const windowFeatures = window.map(candle => [
                candle.close,
                candle.volume,
                candle.high,
                candle.low,
                candle.open,
                (candle.high - candle.low) / candle.close, // волатильность
                (candle.close - candle.open) / candle.open, // изменение цены
                candle.volume / (window.reduce((sum, c) => sum + c.volume, 0) / 24), // нормализованный объем
                i % 24 / 24, // час дня
                i % 7 / 7 // день недели
            ]);

            // Создаем лейбл (рост > 1%)
            const currentCandle = candles[i];
            const priceChange = (nextCandle.close - currentCandle.close) / currentCandle.close;
            const label = priceChange > 0.01 ? 1 : 0;

            features.push(windowFeatures);
            labels.push(label);
        }

        return { features, labels };
    }

    /**
     * Подготовка данных для CNN (30 дней)
     */
    async prepareCNNData(candles) {
        const features = [];
        const labels = [];

        for (let i = 30; i < candles.length - 1; i++) {
            const window = candles.slice(i - 30, i);
            const nextCandle = candles[i + 1];
            
            // Подготавливаем фичи
            const windowFeatures = window.map(candle => [
                candle.close,
                candle.volume,
                candle.high,
                candle.low,
                candle.open,
                (candle.high - candle.low) / candle.close,
                (candle.close - candle.open) / candle.open,
                candle.volume / window.reduce((sum, c) => sum + c.volume, 0) / 30,
                i % 30 / 30,
                i % 7 / 7
            ]);

            const currentCandle = candles[i];
            const priceChange = (nextCandle.close - currentCandle.close) / currentCandle.close;
            const label = priceChange > 0.01 ? 1 : 0;

            features.push(windowFeatures);
            labels.push(label);
        }

        return { features, labels };
    }

    /**
     * Подготовка данных для Transformer (12 недель)
     */
    async prepareTransformerData(candles) {
        const features = [];
        const labels = [];

        for (let i = 84; i < candles.length - 1; i++) {
            const window = candles.slice(i - 84, i);
            const nextCandle = candles[i + 1];
            
            // Подготавливаем фичи
            const windowFeatures = window.map(candle => [
                candle.close,
                candle.volume,
                candle.high,
                candle.low,
                candle.open,
                (candle.high - candle.low) / candle.close,
                (candle.close - candle.open) / candle.open,
                candle.volume / window.reduce((sum, c) => sum + c.volume, 0) / 84,
                i % 84 / 84,
                i % 7 / 7
            ]);

            const currentCandle = candles[i];
            const priceChange = (nextCandle.close - currentCandle.close) / currentCandle.close;
            const label = priceChange > 0.01 ? 1 : 0;

            features.push(windowFeatures);
            labels.push(label);
        }

        return { features, labels };
    }

    /**
     * Предсказание ансамбля
     */
    async predict(figi, portfolio = null) {
        try {
            if (!this.isInitialized) {
                throw new Error('Ensemble not initialized');
            }

            // Проверяем готовность моделей, если нет - ждем загрузки
            await this.ensureModelsReady();

            // Получаем последние данные
            const candles = await CacheService.getCandles(figi, 'DAY', 100);
            if (candles.length < 84) {
                return { score: 0, confidence: 0, reason: 'Insufficient data' };
            }

            // Подготавливаем данные для каждой модели
            const lstmData = await this.prepareLSTMData(candles);
            const cnnData = await this.prepareCNNData(candles);
            const transformerData = await this.prepareTransformerData(candles);

            // Получаем предсказания от каждой модели
            const lstmPred = await this.getModelPrediction('lstm', lstmData.features.slice(-1)[0]);
            const cnnPred = await this.getModelPrediction('cnn', cnnData.features.slice(-1)[0]);
            const transformerPred = await this.getModelPrediction('transformer', transformerData.features.slice(-1)[0]);

            // Взвешенное голосование
            const ensembleScore = (
                lstmPred * this.weights.lstm +
                cnnPred * this.weights.cnn +
                transformerPred * this.weights.transformer
            );

            // Рассчитываем уверенность на основе согласованности моделей
            const predictions = [lstmPred, cnnPred, transformerPred];
            const variance = this.calculateVariance(predictions);
            const confidence = Math.max(0, 1 - variance);

            return {
                score: ensembleScore,
                confidence: confidence,
                individualPredictions: {
                    lstm: lstmPred,
                    cnn: cnnPred,
                    transformer: transformerPred
                },
                weights: this.weights,
                recommendation: ensembleScore > 0.7 ? 'BUY' : ensembleScore < 0.3 ? 'SELL' : 'HOLD'
            };

        } catch (error) {
            console.error('❌ Ensemble prediction failed:', error);
            return { score: 0, confidence: 0, error: error.message };
        }
    }

    /**
     * Получение предсказания от отдельной модели
     */
    async getModelPrediction(modelType, features) {
        const model = this.models[modelType];
        const inputShape = this.getModelInputShape(modelType);
        
        const inputTensor = tf.tensor3d([features], [1, ...inputShape]);
        const prediction = model.predict(inputTensor);
        const score = (await prediction.data())[0];
        
        inputTensor.dispose();
        prediction.dispose();
        
        return score;
    }

    /**
     * Получение формы входа для модели
     */
    getModelInputShape(modelType) {
        switch (modelType) {
            case 'lstm': return [24, 10];
            case 'cnn': return [30, 10];
            case 'transformer': return [84, 10];
            default: return [1, 10];
        }
    }

    /**
     * Обновление весов на основе производительности
     */
    async updateWeights() {
        const totalF1 = this.performance.lstm.f1Score + 
                       this.performance.cnn.f1Score + 
                       this.performance.transformer.f1Score;

        if (totalF1 > 0) {
            this.weights.lstm = this.performance.lstm.f1Score / totalF1;
            this.weights.cnn = this.performance.cnn.f1Score / totalF1;
            this.weights.transformer = this.performance.transformer.f1Score / totalF1;
        }

        console.log('🔄 Updated ensemble weights:', this.weights);
    }

    /**
     * Получить статистику ансамбля
     */
    getEnsembleStats() {
        return {
            isInitialized: this.isInitialized,
            isTraining: this.isTraining,
            modelsLoaded: {
                lstm: this.models.lstm !== null,
                cnn: this.models.cnn !== null,
                transformer: this.models.transformer !== null
            },
            weights: this.weights,
            performance: this.performance,
            totalModels: Object.keys(this.models).length,
            activeModels: Object.values(this.models).filter(model => model !== null).length
        };
    }

    /**
     * Расчет дисперсии предсказаний
     */
    calculateVariance(predictions) {
        const mean = predictions.reduce((sum, pred) => sum + pred, 0) / predictions.length;
        const variance = predictions.reduce((sum, pred) => sum + Math.pow(pred - mean, 2), 0) / predictions.length;
        return variance;
    }

    /**
     * Расчет precision
     */
    calculatePrecision(features, labels, model) {
        try {
            if (!features || !labels || features.length === 0) return 0;
            
            let truePositives = 0;
            let falsePositives = 0;
            
            for (let i = 0; i < features.length; i++) {
                const prediction = this.predict(features[i], model);
                const actual = labels[i];
                
                if (prediction > 0.5 && actual > 0.5) {
                    truePositives++;
                } else if (prediction > 0.5 && actual <= 0.5) {
                    falsePositives++;
                }
            }
            
            return truePositives + falsePositives > 0 ? truePositives / (truePositives + falsePositives) : 0;
        } catch (error) {
            console.error('❌ Ошибка расчета precision:', error);
            return 0;
        }
    }

    /**
     * Расчет recall
     */
    calculateRecall(features, labels, model) {
        try {
            if (!features || !labels || features.length === 0) return 0;
            
            let truePositives = 0;
            let falseNegatives = 0;
            
            for (let i = 0; i < features.length; i++) {
                const prediction = this.predict(features[i], model);
                const actual = labels[i];
                
                if (prediction > 0.5 && actual > 0.5) {
                    truePositives++;
                } else if (prediction <= 0.5 && actual > 0.5) {
                    falseNegatives++;
                }
            }
            
            return truePositives + falseNegatives > 0 ? truePositives / (truePositives + falseNegatives) : 0;
        } catch (error) {
            console.error('❌ Ошибка расчета recall:', error);
            return 0;
        }
    }

    /**
     * Расчет F1 Score
     */
    calculateF1Score(features, labels, model) {
        const precision = this.calculatePrecision(features, labels, model);
        const recall = this.calculateRecall(features, labels, model);
        return 2 * (precision * recall) / (precision + recall);
    }

    /**
     * Уведомление о прогрессе
     */
    broadcastProgress(modelType, epoch, logs) {
        WebSocketService.broadcast({
            type: 'ensemble_training_progress',
            data: {
                modelType,
                epoch,
                accuracy: logs.acc,
                loss: logs.loss,
                valAccuracy: logs.val_acc,
                valLoss: logs.val_loss
            },
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Получение статуса ансамбля
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            isTraining: this.isTraining,
            models: {
                lstm: !!this.models.lstm,
                cnn: !!this.models.cnn,
                transformer: !!this.models.transformer
            },
            weights: this.weights,
            performance: this.performance
        };
    }

    /**
     * Сохранение моделей
     */
    async saveModels() {
        try {
            console.log('💾 Saving ensemble models with new ModelManager...');
            
            // Сохраняем каждую модель ансамбля через ModelManager
            for (const [modelType, model] of Object.entries(this.models)) {
                if (model) {
                    const modelName = `ensemble/${modelType}`;
                    const success = await ModelManager.saveModel(model, modelName);
                    if (success) {
                        console.log(`✅ ${modelType} model saved`);
                    } else {
                        console.error(`❌ Failed to save ${modelType} model`);
                    }
                } else {
                    console.warn(`⚠️ ${modelType} model is null, skipping save`);
                }
            }
            
            // Сохраняем метаданные ансамбля
            const fs = await import('fs/promises');
            const path = await import('path');
            const ensembleDir = './models/ensemble';
            await fs.mkdir(ensembleDir, { recursive: true });
            
            const metadata = {
                weights: this.weights,
                performance: this.performance,
                lastTrained: new Date().toISOString(),
                version: '2.0',
                format: 'tensorflow-js-standard'
            };
            
            await fs.writeFile(
                path.join(ensembleDir, 'metadata.json'),
                JSON.stringify(metadata, null, 2)
            );
            
            console.log('✅ Ensemble models saved with new format');
        } catch (error) {
            console.error('❌ Failed to save ensemble models:', error);
        }
    }

    /**
     * Загрузка моделей ансамбля
     */
    async loadModels() {
        try {
            console.log('📥 Loading ensemble models with new ModelManager...');
            
            // Загружаем каждую модель ансамбля через ModelManager
            for (const modelType of ['lstm', 'cnn', 'transformer']) {
                try {
                    const modelName = `ensemble/${modelType}`;
                    const model = await ModelManager.loadModel(modelName);
                    
                    if (model) {
                        // Компилируем модель
                        model.compile({
                            optimizer: tf.train.adam(0.001),
                            loss: 'binaryCrossentropy',
                            metrics: ['accuracy']
                        });
                        
                        this.models[modelType] = model;
                        console.log(`✅ ${modelType} model loaded successfully`);
                    } else {
                        console.warn(`⚠️ Failed to load ${modelType} model, creating new one`);
                        // Создаем новую модель если не удалось загрузить
                        switch (modelType) {
                            case 'lstm':
                                this.models[modelType] = this.createLSTMModel();
                                break;
                            case 'cnn':
                                this.models[modelType] = this.createCNNModel();
                                break;
                            case 'transformer':
                                this.models[modelType] = this.createTransformerModel();
                                break;
                        }
                    }
                } catch (modelError) {
                    console.warn(`⚠️ Error loading ${modelType} model:`, modelError.message);
                    // Создаем новую модель при ошибке
                    switch (modelType) {
                        case 'lstm':
                            this.models[modelType] = this.createLSTMModel();
                            break;
                        case 'cnn':
                            this.models[modelType] = this.createCNNModel();
                            break;
                        case 'transformer':
                            this.models[modelType] = this.createTransformerModel();
                            break;
                    }
                }
            }
            
            console.log('✅ Ensemble models loaded with new format');
        } catch (error) {
            console.error('❌ Failed to load ensemble models:', error);
        }
    }
}

export default new EnsembleService();
