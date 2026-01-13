import * as tf from '@tensorflow/tfjs';
import CacheService from './CacheService.js';
import OptimizedAnalysisService from './OptimizedAnalysisService.js';
import ModelManager from '../utils/ModelManager.js';
import LoggerService from './LoggerService.js';
import { getService } from './GlobalServiceManager.js';
import ServiceManager from './ServiceManager.js';

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
        this.trainingFigiLocks = new Set();
        this.performance = {
            lstm: { accuracy: 0, precision: 0, recall: 0, f1Score: 0 },
            cnn: { accuracy: 0, precision: 0, recall: 0, f1Score: 0 },
            transformer: { accuracy: 0, precision: 0, recall: 0, f1Score: 0 }
        };
        // Отслеживание времени последнего обновления моделей
        this.lastUpdate = {
            lstm: null,
            cnn: null,
            transformer: null
        };
        // История весов для расчета стабильности
        this.weightHistory = {
            lstm: [],
            cnn: [],
            transformer: []
        };
    }

    /**
     * Инициализация ансамбля
     */
    async initialize() {
        try {
            // Загружаем модели синхронно при инициализации
            await this.loadModelsInBackground();
            
            this.isInitialized = true;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Failed to initialize Ensemble Service', {
                    service: 'EnsembleService',
                    operation: 'initialize',
                    error: { message: error.message, stack: error.stack }
                });
            }
            throw error;
        }
    }

    /**
     * Фоновая загрузка моделей
     */
    async loadModelsInBackground() {
        try {
            
            // Сначала пытаемся загрузить существующие модели
            await this.loadModels();
            
            // Если не все модели загружены, создаем недостающие
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
                    
                    // Сразу сохраняем созданную модель
                    if (this.models[modelType]) {
                        const success = await ModelManager.saveModel(this.models[modelType], `ensemble/${modelType}`);
                        if (!success) {
                            if (LoggerService.isInitialized) {
                                LoggerService.error('Failed to save ensemble model', {
                                    service: 'EnsembleService',
                                    operation: 'loadModelsInBackground',
                                    modelType,
                                    error: { message: 'ModelManager.saveModel returned false' }
                                });
                            }
                        }
                    }
                }
            }
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Background ensemble model loading failed', {
                    service: 'EnsembleService',
                    operation: 'loadModelsInBackground',
                    error: { message: error.message, stack: error.stack }
                });
            }
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
                // L2 регуляризация для предотвращения переобучения
                tf.layers.dense({ 
                    units: 16, 
                    activation: 'relu',
                    kernelInitializer: 'heUniform',
                    kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }) // L2 регуляризация
                }),
                tf.layers.dropout({ rate: 0.3 }), // Актуализированный dropout
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
                    biasInitializer: 'zeros',
                    kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }) // Добавляем L2 регуляризацию
                }),
                tf.layers.batchNormalization(), // Добавляем batch normalization для стабильности
                tf.layers.maxPooling1d({ poolSize: 2 }),
                tf.layers.conv1d({
                    filters: 64,
                    kernelSize: 3,
                    activation: 'relu',
                    kernelInitializer: 'heUniform',
                    biasInitializer: 'zeros',
                    kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }) // Добавляем L2 регуляризацию
                }),
                tf.layers.batchNormalization(), // Добавляем batch normalization
                tf.layers.maxPooling1d({ poolSize: 2 }),
                tf.layers.flatten(),
                // L2 регуляризация для предотвращения переобучения
                tf.layers.dense({ 
                    units: 64, // Увеличиваем размер для лучшей способности к обучению
                    activation: 'relu',
                    kernelInitializer: 'heUniform',
                    kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }) // L2 регуляризация
                }),
                tf.layers.batchNormalization(), // Добавляем batch normalization
                tf.layers.dropout({ rate: 0.25 }), // Немного уменьшаем dropout
                tf.layers.dense({ 
                    units: 32, // Добавляем промежуточный слой
                    activation: 'relu',
                    kernelInitializer: 'heUniform',
                    kernelRegularizer: tf.regularizers.l2({ l2: 0.001 })
                }),
                tf.layers.dropout({ rate: 0.2 }),
                tf.layers.dense({ 
                    units: 1, 
                    activation: 'sigmoid',
                    kernelInitializer: 'glorotUniform'
                    // Выходной слой без L2 для сохранения предсказательной способности
                })
            ]
        });

        model.compile({
            optimizer: tf.train.adam(0.001), // Можно попробовать увеличить LR до 0.002
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
                // L2 регуляризация для предотвращения переобучения
                tf.layers.dense({
                    units: 128,
                    activation: 'relu',
                    kernelInitializer: 'heUniform',
                    kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }) // L2 регуляризация
                }),
                tf.layers.dropout({ rate: 0.25 }), // Актуализированный dropout
                tf.layers.dense({ 
                    units: 64, 
                    activation: 'relu',
                    kernelInitializer: 'heUniform',
                    kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }) // L2 регуляризация
                }),
                tf.layers.dropout({ rate: 0.2 }), // Актуализированный dropout
                tf.layers.dense({ 
                    units: 32, 
                    activation: 'relu',
                    kernelInitializer: 'heUniform',
                    kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }) // L2 регуляризация
                }),
                tf.layers.dropout({ rate: 0.15 }), // Актуализированный dropout
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
            // Глобальный лок для ансамбля
            if (this.isTraining) {
                return { success: false, error: 'Ensemble training already in progress' };
            }
            // Per-FIGI лок
            if (this.trainingFigiLocks.has(figi)) {
                return { success: false, error: 'Ensemble training already running for this FIGI' };
            }

            this.isTraining = true;
            this.trainingFigiLocks.add(figi);
            
            // Обновляем статус обучения с текущим инструментом
            if (trainingStatusService) {
                trainingStatusService.startTraining('ensemble', 1);
                // Получаем ticker для отображения
                try {
                    const instrument = await CacheService.getInstrument(figi, true);
                    const ticker = instrument?.ticker || figi.substring(0, 10);
                    trainingStatusService.updateProgress('ensemble', 0, ticker);
                } catch (e) {
                    trainingStatusService.updateProgress('ensemble', 0, figi.substring(0, 10));
                }
            }

            // Получаем данные (skipUpdate = true - режим обучения, не делаем запросы к API)
            const candles = await CacheService.getCandles(figi, 'DAY', days, true);
            
            // Адаптивная проверка данных
            // Минимальные требования для каждой модели:
            // - LSTM: минимум 24 + 1 = 25 свечей (окно 24 часа)
            // - CNN: минимум 30 + 1 = 31 свечей (окно 30 дней)
            // - Transformer: минимум 84 + 1 = 85 свечей (окно 84 дня)
            const minRequired = 25; // Минимум для LSTM
            const minForCNN = 31;
            const minForTransformer = 85;
            
            if (candles.length < minRequired) {
                throw new Error(`Insufficient data: ${candles.length} candles (minimum ${minRequired} required for LSTM)`);
            }
            
            // Определяем, какие модели можем обучить
            const canTrainLSTM = candles.length >= minRequired;
            const canTrainCNN = candles.length >= minForCNN;
            const canTrainTransformer = candles.length >= minForTransformer;
            
            
            if (!canTrainLSTM && !canTrainCNN && !canTrainTransformer) {
                throw new Error(`Insufficient data: ${candles.length} candles (minimum ${minRequired} required)`);
            }
            
            // Проверяем, что данные реальные

            // Подготавливаем и обучаем только те модели, для которых достаточно данных
            const results = {};
            const totalModels = [canTrainLSTM, canTrainCNN, canTrainTransformer].filter(Boolean).length;
            let completedModels = 0;
            
            if (canTrainLSTM) {
                try {
                    // Обновляем прогресс - начало обучения LSTM
                    if (trainingStatusService) {
                        const progress = Math.floor((completedModels / totalModels) * 100);
                        trainingStatusService.updateProgress('ensemble', progress, figi.substring(0, 10));
                    }
                    
                    const lstmData = await this.prepareLSTMData(candles);
                    if (lstmData.features.length > 0) {
                        const lstmResult = await this.trainModel('lstm', lstmData, epochs, batchSize, trainingStatusService, totalModels, completedModels, figi);
                        this.performance.lstm = lstmResult;
                        this.lastUpdate.lstm = new Date().toISOString();
                        // Сохраняем историю весов для стабильности
                        this.weightHistory.lstm.push({
                            weight: this.weights.lstm,
                            timestamp: new Date().toISOString()
                        });
                        // Ограничиваем историю последними 10 значениями
                        if (this.weightHistory.lstm.length > 10) {
                            this.weightHistory.lstm.shift();
                        }
                        results.lstm = lstmResult;
                        completedModels++;
                    }
                } catch (error) {
                    if (LoggerService.isInitialized) {
                        LoggerService.error('LSTM training failed in ensemble', {
                            service: 'EnsembleService',
                            operation: 'trainEnsemble',
                            figi,
                            error: { message: error.message, stack: error.stack }
                        });
                    }
                }
            } else {
            }
            
            if (canTrainCNN) {
                try {
                    // Обновляем прогресс - начало обучения CNN
                    if (trainingStatusService) {
                        const progress = Math.floor((completedModels / totalModels) * 100);
                        trainingStatusService.updateProgress('ensemble', progress, figi.substring(0, 10));
                    }
                    
                    const cnnData = await this.prepareCNNData(candles);
                    if (cnnData.features.length > 0) {
                        const cnnResult = await this.trainModel('cnn', cnnData, epochs, batchSize, trainingStatusService, totalModels, completedModels, figi);
                        this.performance.cnn = cnnResult;
                        this.lastUpdate.cnn = new Date().toISOString();
                        // Сохраняем историю весов для стабильности
                        this.weightHistory.cnn.push({
                            weight: this.weights.cnn,
                            timestamp: new Date().toISOString()
                        });
                        // Ограничиваем историю последними 10 значениями
                        if (this.weightHistory.cnn.length > 10) {
                            this.weightHistory.cnn.shift();
                        }
                        results.cnn = cnnResult;
                        completedModels++;
                    }
                } catch (error) {
                    if (LoggerService.isInitialized) {
                        LoggerService.error('CNN training failed in ensemble', {
                            service: 'EnsembleService',
                            operation: 'trainEnsemble',
                            figi,
                            error: { message: error.message, stack: error.stack }
                        });
                    }
                }
            } else {
            }
            
            if (canTrainTransformer) {
                try {
                    // Обновляем прогресс - начало обучения Transformer
                    if (trainingStatusService) {
                        const progress = Math.floor((completedModels / totalModels) * 100);
                        trainingStatusService.updateProgress('ensemble', progress, figi.substring(0, 10));
                    }
                    
                    const transformerData = await this.prepareTransformerData(candles);
                    if (transformerData.features.length > 0) {
                        const transformerResult = await this.trainModel('transformer', transformerData, epochs, batchSize, trainingStatusService, totalModels, completedModels, figi);
                        this.performance.transformer = transformerResult;
                        this.lastUpdate.transformer = new Date().toISOString();
                        // Сохраняем историю весов для стабильности
                        this.weightHistory.transformer.push({
                            weight: this.weights.transformer,
                            timestamp: new Date().toISOString()
                        });
                        // Ограничиваем историю последними 10 значениями
                        if (this.weightHistory.transformer.length > 10) {
                            this.weightHistory.transformer.shift();
                        }
                        results.transformer = transformerResult;
                        completedModels++;
                    }
                } catch (error) {
                    if (LoggerService.isInitialized) {
                        LoggerService.error('Transformer training failed in ensemble', {
                            service: 'EnsembleService',
                            operation: 'trainEnsemble',
                            figi,
                            error: { message: error.message, stack: error.stack }
                        });
                    }
                }
            } else {
            }
            
            // Обновляем прогресс перед завершением
            if (trainingStatusService) {
                trainingStatusService.updateProgress('ensemble', 95, figi.substring(0, 10));
            }
            
            // Проверяем, что хотя бы одна модель обучилась
            if (Object.keys(results).length === 0) {
                throw new Error(`Failed to train any model: insufficient data or training errors`);
            }

            // Адаптивные веса на основе производительности
            await this.updateWeights();

            
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
            if (LoggerService.isInitialized) {
                LoggerService.error('Ensemble training failed', {
                    service: 'EnsembleService',
                    operation: 'trainEnsemble',
                    figi,
                    error: { message: error.message, stack: error.stack }
                });
            }
            
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
                if (LoggerService.isInitialized) {
                    LoggerService.error('Failed to send ensemble training error alert', {
                        service: 'EnsembleService',
                        operation: 'trainEnsemble',
                        error: { message: telegramError.message }
                    });
                }
            }
            
            throw error;
        } finally {
            this.isTraining = false;
            try { this.trainingFigiLocks.delete(figi); } catch {}
        }
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
     * Обучение отдельной модели
     */
    async trainModel(modelType, data, epochs, batchSize, trainingStatusService = null, totalModels = 1, modelIndex = 0, figi = null) {
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
        
        // Диагностика данных для CNN
        if (modelType === 'cnn' && features.length > 0) {
            const sampleFeature = features[0];
            const sampleValues = sampleFeature.flat();
            const minVal = Math.min(...sampleValues);
            const maxVal = Math.max(...sampleValues);
            const meanVal = sampleValues.reduce((a, b) => a + b, 0) / sampleValues.length;
            const stdVal = Math.sqrt(sampleValues.reduce((sum, val) => sum + Math.pow(val - meanVal, 2), 0) / sampleValues.length);
            
            console.log(`📊 ${modelType} Data statistics: min=${minVal.toFixed(4)}, max=${maxVal.toFixed(4)}, mean=${meanVal.toFixed(4)}, std=${stdVal.toFixed(4)}`);
            
            // Проверка на NaN и Infinity
            const hasNaN = sampleValues.some(v => isNaN(v));
            const hasInf = sampleValues.some(v => !isFinite(v));
            if (hasNaN || hasInf) {
                console.warn(`⚠️ ${modelType}: Обнаружены некорректные значения (NaN: ${hasNaN}, Infinity: ${hasInf})`);
            }
            
            // Проверка распределения labels
            const posCount = labels.filter(l => l === 1).length;
            const negCount = labels.filter(l => l === 0).length;
            console.log(`📊 ${modelType} Labels distribution: pos=${posCount}, neg=${negCount}, ratio=${(posCount / labels.length * 100).toFixed(1)}%`);
        }
        
        // Создаем тензоры с правильными размерностями
        let xs, ys;
        
        if (modelType === 'transformer') {
            // Transformer ожидает 3D данные [samples, time_steps, features]
            // Модель имеет inputShape: [84, 10] и flatten слой, который преобразует [batch, 84, 10] в [batch, 840]
            // Но входные данные должны быть 3D: [samples, 84, 10]
            xs = tf.tensor3d(features);
        } else {
            // LSTM и CNN ожидают 3D данные [samples, time_steps, features]
            xs = tf.tensor3d(features);
        }
        
        ys = tf.tensor2d(labels, [labels.length, 1]);
        
        // Расчет class weights для балансировки классов
        const classWeights = this.calculateClassWeights(labels);
        // Примечание: TensorFlow.js не поддерживает sampleWeight в model.fit()
        // Используем взвешивание через дублирование данных
        
        if (modelType === 'transformer') {
            console.log(`   X tensor shape: [${xs.shape[0]}, ${xs.shape[1]}, ${xs.shape[2]}] (3D for transformer: [samples, time_steps, features])`);
        } else {
            console.log(`   X tensor shape: [${xs.shape[0]}, ${xs.shape[1]}, ${xs.shape[2]}] (3D for ${modelType})`);
        }
        console.log(`   Y tensor shape: [${ys.shape[0]}, ${ys.shape[1]}]`);

        // Настройки для отслеживания лучшей модели
        let bestValLoss = Infinity;
        let bestEpoch = 0; // Эпоха с лучшим val_loss
        let bestModelWeights = null; // Веса лучшей модели
        let initialLoss = null; // Начальный loss для отслеживания прогресса
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

        const history = await model.fit(xs, ys, {
            epochs,
            batchSize,
            // sampleWeight не поддерживается в TensorFlow.js - используем взвешивание через дублирование данных
            validationSplit: 0.2,
            verbose: 0,
            callbacks: {
                onEpochEnd: async (epoch, logs) => {
                    this.broadcastProgress(modelType, epoch, logs);
                    
                    // Обновляем прогресс обучения в TrainingStatusService
                    if (trainingStatusService) {
                        // Прогресс модели = (modelIndex / totalModels) * 100 + (epoch / epochs) * (100 / totalModels)
                        const modelProgress = (modelIndex / totalModels) * 100;
                        const epochProgress = ((epoch + 1) / epochs) * (100 / totalModels);
                        const totalProgress = Math.min(95, Math.floor(modelProgress + epochProgress));
                        trainingStatusService.updateProgress('ensemble', totalProgress, figi?.substring(0, 10) || null);
                    }
                    
                    // Сохраняем начальный loss для отслеживания прогресса
                    if (initialLoss === null) {
                        initialLoss = logs.loss;
                        console.log(`📊 ${modelType} Initial loss: ${initialLoss.toFixed(4)}, val_loss: ${(logs.val_loss || logs.loss).toFixed(4)}`);
                    }
                    
                    const valLoss = logs.val_loss || logs.loss;
                    const trainLoss = logs.loss;
                    const accuracy = logs.acc || 0;
                    const valAccuracy = logs.val_acc || 0;
                    
                    
                    if (valLoss < bestValLoss) {
                        // Улучшение - сохраняем веса лучшей модели
                        const improvement = bestValLoss === Infinity ? 0 : ((bestValLoss - valLoss) / bestValLoss * 100).toFixed(2);
                        bestValLoss = valLoss;
                        bestEpoch = epoch + 1;
                        reduceLRCount = 0;
                        
                        // Сохраняем веса текущей модели как лучшие
                        try {
                            const weights = model.getWeights();
                            bestModelWeights = weights.map(w => w.clone());
                            console.log(`✅ ${modelType} Epoch ${epoch + 1}: Улучшение val_loss = ${valLoss.toFixed(4)}, val_acc = ${(valAccuracy * 100).toFixed(2)}%, acc = ${(accuracy * 100).toFixed(2)}% (улучшение на ${improvement}%, лучший на эпохе ${bestEpoch}) - веса сохранены`);
                        } catch (error) {
                            console.warn(`⚠️ ${modelType} Epoch ${epoch + 1}: Не удалось сохранить веса: ${error.message}`);
                        }
                    } else {
                        // Нет улучшения
                        reduceLRCount++;
                        
                        const noImprovement = ((valLoss - bestValLoss) / bestValLoss * 100).toFixed(2);
                        console.log(`⏸️ ${modelType} Epoch ${epoch + 1}: Нет улучшения (val_loss=${valLoss.toFixed(4)}, лучший=${bestValLoss.toFixed(4)} на эпохе ${bestEpoch}, хуже на ${noImprovement}%)`);
                        
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
                                    
                                    console.log(`📉 ${modelType} Epoch ${epoch + 1}: Автоматическое уменьшение LR: ${oldLR.toFixed(6)} → ${currentLR.toFixed(6)} (плато ${reduceLRCount} эпох, уменьшение #${lrReductionCount})`);
                                } catch (lrError) {
                                    if (LoggerService.isInitialized) {
                                        LoggerService.error('Failed to change learning rate', {
                                            service: 'EnsembleService',
                                            operation: 'trainModel',
                                            modelType,
                                            epoch: epoch + 1,
                                            error: { message: lrError.message, stack: lrError.stack }
                                        });
                                    }
                                }
                            }
                            
                            reduceLRCount = 0; // Сбрасываем счетчик после уменьшения LR
                        } else if (reduceLRCount >= reduceLRPatience && lrReductionCount >= maxLRReductions) {
                            // Достигнуто максимальное количество уменьшений LR
                            reduceLRCount = 0; // Сбрасываем счетчик
                        }
                    }
                }
            }
        });

        // Очистка памяти
        xs.dispose();
        ys.dispose();

        // Восстанавливаем веса лучшей модели
        if (bestModelWeights && bestEpoch > 0) {
            try {
                model.setWeights(bestModelWeights);
                // Очищаем клонированные веса
                bestModelWeights.forEach(w => w.dispose());
                bestModelWeights = null;
            } catch (error) {
                if (LoggerService.isInitialized) {
                    LoggerService.error('Failed to restore best model weights', {
                        service: 'EnsembleService',
                        operation: 'trainModel',
                        modelType,
                        bestEpoch,
                        error: { message: error.message, stack: error.stack }
                    });
                }
            }
        }

        // Используем метрики лучшей модели
        const finalAccuracy = history.history.acc[bestEpoch - 1] || history.history.acc[history.history.acc.length - 1];
        const finalValAccuracy = history.history.val_acc ? (history.history.val_acc[bestEpoch - 1] || history.history.val_acc[history.history.val_acc.length - 1]) : finalAccuracy;
        const finalLoss = bestValLoss !== Infinity ? bestValLoss : history.history.loss[history.history.loss.length - 1];
        
        const totalImprovement = initialLoss ? ((initialLoss - finalLoss) / initialLoss * 100).toFixed(2) : 'N/A';
        
        return {
            accuracy: finalAccuracy,
            valAccuracy: finalValAccuracy,
            loss: finalLoss,
            bestEpoch: bestEpoch,
            totalImprovement: totalImprovement,
            precision: finalAccuracy, // Упрощенная метрика
            recall: finalAccuracy,    // Упрощенная метрика
            f1Score: finalAccuracy, // Упрощенная метрика
            lrHistory: lrHistory, // История изменений LR
            finalLR: currentLR, // Финальный learning rate
            lrReductions: lrReductionCount // Количество уменьшений LR
        };
    }

    /**
     * Подготовка данных для LSTM (фиксированный размер окна: 24 свечи)
     */
    async prepareLSTMData(candles) {
        const features = [];
        const labels = [];

        const windowSize = 24; // Фиксированный размер окна для LSTM
        if (candles.length < windowSize + 1) {
            return { features, labels };
        }
        
        for (let i = windowSize; i < candles.length - 1; i++) {
            const window = candles.slice(i - windowSize, i);
            const nextCandle = candles[i + 1];
            
            // Подготавливаем фичи (всегда 24 свечи)
            const windowFeatures = window.map((candle, idx) => [
                candle.close,
                candle.volume,
                candle.high,
                candle.low,
                candle.open,
                (candle.high - candle.low) / (candle.close || 1), // волатильность
                (candle.close - candle.open) / (candle.open || 1), // изменение цены
                candle.volume / (window.reduce((sum, c) => sum + c.volume, 0) / window.length || 1), // нормализованный объем
                idx / windowSize, // позиция в окне
                i % 7 / 7 // день недели
            ]);

            // Создаем лейбл (рост > 1%)
            const currentCandle = candles[i];
            const priceChange = (nextCandle.close - currentCandle.close) / (currentCandle.close || 1);
            const label = priceChange > 0.01 ? 1 : 0;

            features.push(windowFeatures);
            labels.push(label);
        }

        return { features, labels };
    }

    /**
     * Подготовка данных для CNN (фиксированный размер окна: 30 свечей)
     */
    async prepareCNNData(candles) {
        const features = [];
        const labels = [];

        const windowSize = 30; // Фиксированный размер окна для CNN
        if (candles.length < windowSize + 1) {
            return { features, labels };
        }

        // Нормализация данных для CNN
        const allValues = [];
        for (let i = windowSize; i < candles.length - 1; i++) {
            const window = candles.slice(i - windowSize, i);
            window.forEach(candle => {
                allValues.push(candle.close, candle.volume, candle.high, candle.low, candle.open);
            });
        }
        
        const mean = allValues.length > 0 ? allValues.reduce((a, b) => a + b, 0) / allValues.length : 0;
        const std = allValues.length > 0 
            ? Math.sqrt(allValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / allValues.length)
            : 1;
        const maxVol = candles.length > 0 ? Math.max(...candles.map(c => c.volume)) : 1;
        const minVol = candles.length > 0 ? Math.min(...candles.map(c => c.volume)) : 0;
        const volRange = maxVol - minVol || 1;

        for (let i = windowSize; i < candles.length - 1; i++) {
            const window = candles.slice(i - windowSize, i);
            const nextCandle = candles[i + 1];
            
            // Подготавливаем фичи с нормализацией (всегда 30 свечей)
            const windowFeatures = window.map((candle, idx) => {
                // Z-score нормализация для цен
                const normalizedClose = (candle.close - mean) / (std || 1);
                const normalizedHigh = (candle.high - mean) / (std || 1);
                const normalizedLow = (candle.low - mean) / (std || 1);
                const normalizedOpen = (candle.open - mean) / (std || 1);
                
                // Min-max нормализация для объема
                const normalizedVolume = (candle.volume - minVol) / volRange;
                
                return [
                    normalizedClose,
                    normalizedVolume,
                    normalizedHigh,
                    normalizedLow,
                    normalizedOpen,
                    (candle.high - candle.low) / (candle.close || 1), // волатильность
                    (candle.close - candle.open) / (candle.open || 1), // изменение цены
                    candle.volume / (window.reduce((sum, c) => sum + c.volume, 0) / window.length || 1), // нормализованный объем
                    idx / windowSize, // позиция в окне (0-1)
                    i % 7 / 7 // день недели (0-1)
                ];
            });

            const currentCandle = candles[i];
            const priceChange = (nextCandle.close - currentCandle.close) / (currentCandle.close || 1);
            const label = priceChange > 0.01 ? 1 : 0;

            features.push(windowFeatures);
            labels.push(label);
        }

        return { features, labels };
    }

    /**
     * Подготовка данных для Transformer (фиксированный размер окна: 84 свечи)
     */
    async prepareTransformerData(candles) {
        const features = [];
        const labels = [];

        const windowSize = 84; // Фиксированный размер окна для Transformer
        if (candles.length < windowSize + 1) {
            return { features, labels };
        }

        for (let i = windowSize; i < candles.length - 1; i++) {
            const window = candles.slice(i - windowSize, i);
            const nextCandle = candles[i + 1];
            
            // Подготавливаем фичи (всегда 84 свечи)
            const windowFeatures = window.map((candle, idx) => [
                candle.close,
                candle.volume,
                candle.high,
                candle.low,
                candle.open,
                (candle.high - candle.low) / (candle.close || 1),
                (candle.close - candle.open) / (candle.open || 1),
                candle.volume / (window.reduce((sum, c) => sum + c.volume, 0) / window.length || 1),
                idx / windowSize,
                i % 7 / 7
            ]);

            const currentCandle = candles[i];
            const priceChange = (nextCandle.close - currentCandle.close) / (currentCandle.close || 1);
            const label = priceChange > 0.01 ? 1 : 0;

            features.push(windowFeatures);
            labels.push(label);
        }

        return { features, labels };
    }

    /**
     * Упрощенное предсказание на основе технических индикаторов
     * Используется когда недостаточно данных для нейросетевых моделей
     */
    async simpleTechnicalPrediction(candles) {
        // Если данных нет или очень мало, возвращаем консервативную рекомендацию
        if (!candles || candles.length === 0) {
            return { score: 0.5, confidence: 0.1, recommendation: 'HOLD', method: 'no_data' };
        }
        
        if (candles.length < 3) {
            return { score: 0.5, confidence: 0.2, recommendation: 'HOLD', method: 'minimal_data' };
        }

        try {
            const OptimizedDataService = (await import('./OptimizedDataService.js')).default;
            // OptimizedDataService экспортируется как singleton экземпляр
            
            const closingPrices = candles.map(c => c.close);
            const volumes = candles.map(c => c.volume || 0);
            const highs = candles.map(c => c.high);
            const lows = candles.map(c => c.low);

            // Простая логика на основе индикаторов
            let score = 0.5; // HOLD по умолчанию
            let confidence = 0.3; // Низкая уверенность для упрощенной модели

            // RSI анализ
            try {
                const rsi = OptimizedDataService.calculateRSI(closingPrices);
                if (rsi !== null && rsi !== undefined && !isNaN(rsi)) {
                    // RSI нормализован в [0, 1], где 0 = перепроданность, 1 = перекупленность
                    if (rsi < 0.3) {
                        score += 0.2; // Перепроданность -> BUY сигнал
                    } else if (rsi > 0.7) {
                        score -= 0.2; // Перекупленность -> SELL сигнал
                    }
                }
            } catch (e) {
                // Игнорируем ошибки расчета RSI
            }

            // Тренд на основе SMA
            try {
                const sma5Period = Math.min(5, Math.floor(closingPrices.length / 2));
                const sma20Period = Math.min(20, Math.floor(closingPrices.length / 2));
                const sma5 = sma5Period >= 2 ? OptimizedDataService.calculateSMA(closingPrices, sma5Period) : null;
                const sma20 = sma20Period >= 2 ? OptimizedDataService.calculateSMA(closingPrices, sma20Period) : null;
                const currentPrice = closingPrices[closingPrices.length - 1];

                if (sma5 && sma20 && currentPrice) {
                    if (currentPrice > sma5 && sma5 > sma20) {
                        score += 0.15; // Восходящий тренд
                    } else if (currentPrice < sma5 && sma5 < sma20) {
                        score -= 0.15; // Нисходящий тренд
                    }
                } else if (sma5 && currentPrice) {
                    // Если есть только SMA5, используем его
                    if (currentPrice > sma5) {
                        score += 0.1; // Краткосрочный восходящий тренд
                    } else {
                        score -= 0.1; // Краткосрочный нисходящий тренд
                    }
                }
            } catch (e) {
                // Игнорируем ошибки расчета SMA
            }

            // MACD анализ
            try {
                const macd = OptimizedDataService.calculateMACD(closingPrices);
                if (macd && Array.isArray(macd) && macd.length >= 2) {
                    const macdLine = macd[0];
                    const macdSignal = macd[1];
                    if (macdLine !== null && macdSignal !== null && !isNaN(macdLine) && !isNaN(macdSignal)) {
                        if (macdLine > macdSignal) {
                            score += 0.1; // Бычий сигнал
                        } else {
                            score -= 0.1; // Медвежий сигнал
                        }
                    }
                }
            } catch (e) {
                // Игнорируем ошибки расчета MACD
            }

            // Простой анализ тренда на основе последних цен
            if (closingPrices.length >= 3) {
                const recentPrices = closingPrices.slice(-3);
                const trend = recentPrices[2] - recentPrices[0];
                const avgPrice = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
                if (avgPrice > 0) {
                    const trendPercent = trend / avgPrice;
                    score += Math.max(-0.1, Math.min(0.1, trendPercent * 5)); // Ограничиваем влияние тренда
                }
            }

            // Нормализуем score в диапазон [0.01, 0.99] для избежания экстремальных значений
            score = Math.max(0.01, Math.min(0.99, score));

            // Определяем рекомендацию
            const recommendation = score > 0.6 ? 'BUY' : score < 0.4 ? 'SELL' : 'HOLD';

            return {
                score,
                confidence,
                recommendation,
                method: 'technical_indicators'
            };
        } catch (error) {
            console.warn('⚠️ Error in simple technical prediction:', error.message);
            return { score: 0.5, confidence: 0.1, recommendation: 'HOLD', method: 'fallback' };
        }
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
            // Запрашиваем больше данных (200 дней), чтобы получить максимум доступных свечей
            // skipUpdate = true - используем только БД, без запросов к API
            let candles = await CacheService.getCandles(figi, 'DAY', 200, true);
            
            // Минимальные требования для моделей:
            // LSTM: минимум 25 свечей (окно 24 + 1 для лейбла)
            // CNN: минимум 31 свеча (окно 30 + 1 для лейбла)
            // Transformer: минимум 85 свечей (окно 84 + 1 для лейбла)
            const minRequiredForLSTM = 25;
            const minRequiredForCNN = 31;
            const minRequiredForTransformer = 85;
            const minRequired = Math.max(minRequiredForLSTM, minRequiredForCNN, minRequiredForTransformer);
            
            // Если данных недостаточно, пытаемся расширить период для получения большего количества данных из кеша
            if (candles.length < minRequired) {
                // Пробуем разные периоды (skipUpdate = true для всех запросов - только БД)
                const periods = [365, 730, 1080];
                for (const period of periods) {
                    const extendedCandles = await CacheService.getCandles(figi, 'DAY', period, true);
                    if (extendedCandles.length > candles.length) {
                        candles = extendedCandles;
                    }
                    // Если получили достаточно данных, останавливаемся
                    if (candles.length >= minRequired) break;
                }
            }
            
            // Работаем с тем количеством данных, которое есть
            if (candles.length === 0) {
                console.warn(`⚠️ No candles available for ${figi}, using simple technical prediction with minimal data`);
                // Возвращаем консервативную рекомендацию на основе упрощенной модели
                const simplePred = await this.simpleTechnicalPrediction([]);
                return {
                    score: simplePred.score,
                    confidence: 0.1, // Очень низкая уверенность при отсутствии данных
                    recommendation: 'HOLD', // Консервативная рекомендация
                    agreement: 0,
                    horizons: {
                        shortTerm: {
                            name: 'Краткосрочный прогноз',
                            description: 'Прогноз на 1-3 дня',
                            model: 'Technical Indicators',
                            score: simplePred.score,
                            confidence: 0.1,
                            recommendation: 'HOLD',
                            weight: this.weights.lstm,
                            horizonDays: 1,
                            explanation: 'Недостаточно данных для анализа. Рекомендуется воздержаться от торговли.'
                        },
                        mediumTerm: {
                            name: 'Среднесрочный прогноз',
                            description: 'Прогноз на 1-4 недели',
                            model: 'Technical Indicators',
                            score: simplePred.score,
                            confidence: 0.1,
                            recommendation: 'HOLD',
                            weight: this.weights.cnn,
                            horizonDays: 21,
                            explanation: 'Недостаточно данных для анализа. Рекомендуется воздержаться от торговли.'
                        },
                        longTerm: {
                            name: 'Долгосрочный прогноз',
                            description: 'Прогноз на 2-3 месяца',
                            model: 'Technical Indicators',
                            score: simplePred.score,
                            confidence: 0.1,
                            recommendation: 'HOLD',
                            weight: this.weights.transformer,
                            horizonDays: 84,
                            explanation: 'Недостаточно данных для анализа. Рекомендуется воздержаться от торговли.'
                        }
                    },
                    individualPredictions: {
                        lstm: simplePred.score,
                        cnn: simplePred.score,
                        transformer: simplePred.score
                    },
                    weights: this.weights,
                    summary: `Недостаточно данных для анализа инструмента ${figi}. Рекомендуется воздержаться от торговли до появления достаточного количества исторических данных.`
                };
            }
            
            if (candles.length < minRequired) {
                console.warn(`⚠️ Very few candles for ${figi}: ${candles.length} < ${minRequired}. Some models may not work.`);
            }

            // Проверяем минимальные требования для фиксированных размеров окон моделей
            // Модели ожидают фиксированные размеры: LSTM=24, CNN=30, Transformer=84
            // Используем уже объявленные переменные minRequiredForLSTM, minRequiredForCNN, minRequiredForTransformer
            
            const hasEnoughDataForLSTM = candles.length >= minRequiredForLSTM;
            const hasEnoughDataForCNN = candles.length >= minRequiredForCNN;
            const hasEnoughDataForTransformer = candles.length >= minRequiredForTransformer;

            let lstmPred = 0.5;
            let cnnPred = 0.5;
            let transformerPred = 0.5;
            let useSimpleModel = false;

            // Если данных недостаточно для всех моделей, используем упрощенную модель
            if (!hasEnoughDataForLSTM && !hasEnoughDataForCNN && !hasEnoughDataForTransformer) {
                console.log(`📊 Insufficient data for neural networks (${candles.length} candles, need ${minRequiredForLSTM}/${minRequiredForCNN}/${minRequiredForTransformer}), using simple technical prediction`);
                const simplePred = await this.simpleTechnicalPrediction(candles);
                lstmPred = simplePred.score;
                cnnPred = simplePred.score;
                transformerPred = simplePred.score;
                useSimpleModel = true;
            } else {
                // Подготавливаем данные для каждой модели только если данных достаточно для фиксированных размеров
                // Используем стандартные методы подготовки данных (не адаптивные), так как модели ожидают фиксированные размеры
                
                if (hasEnoughDataForLSTM) {
                    const lstmData = await this.prepareLSTMData(candles);
                    if (lstmData.features && lstmData.features.length > 0) {
                        const lstmFeatures = lstmData.features[lstmData.features.length - 1];
                        // Проверяем размер фичей перед вызовом модели
                        const lstmInputShape = this.getModelInputShape('lstm');
                        const expectedLSTMElements = lstmInputShape[0] * lstmInputShape[1];
                        const actualLSTMElements = lstmFeatures.length * (lstmFeatures[0]?.length || 0);
                        
                        if (actualLSTMElements === expectedLSTMElements && lstmFeatures.length === lstmInputShape[0]) {
                            lstmPred = await this.getModelPrediction('lstm', lstmFeatures);
                        } else {
                            // Размеры не совпадают - используем упрощенную модель
                            console.log(`📊 LSTM features shape mismatch (${actualLSTMElements} vs ${expectedLSTMElements}), using simple technical prediction`);
                            const simplePred = await this.simpleTechnicalPrediction(candles);
                            lstmPred = simplePred.score;
                        }
                    }
                } else if (candles.length >= 3) {
                    // Fallback на упрощенную модель для LSTM
                    const simplePred = await this.simpleTechnicalPrediction(candles);
                    lstmPred = simplePred.score;
                }

                if (hasEnoughDataForCNN) {
                    const cnnData = await this.prepareCNNData(candles);
                    if (cnnData.features && cnnData.features.length > 0) {
                        const cnnFeatures = cnnData.features[cnnData.features.length - 1];
                        // Проверяем размер фичей перед вызовом модели
                        const cnnInputShape = this.getModelInputShape('cnn');
                        const expectedCNNElements = cnnInputShape[0] * cnnInputShape[1];
                        const actualCNNElements = cnnFeatures.length * (cnnFeatures[0]?.length || 0);
                        
                        if (actualCNNElements === expectedCNNElements && cnnFeatures.length === cnnInputShape[0]) {
                            cnnPred = await this.getModelPrediction('cnn', cnnFeatures);
                        } else {
                            // Размеры не совпадают - используем упрощенную модель
                            console.log(`📊 CNN features shape mismatch (${actualCNNElements} vs ${expectedCNNElements}), using simple technical prediction`);
                            const simplePred = await this.simpleTechnicalPrediction(candles);
                            cnnPred = simplePred.score;
                        }
                    }
                } else if (candles.length >= 3) {
                    // Fallback на упрощенную модель для CNN
                    const simplePred = await this.simpleTechnicalPrediction(candles);
                    cnnPred = simplePred.score;
                }

                if (hasEnoughDataForTransformer) {
                    const transformerData = await this.prepareTransformerData(candles);
                    if (transformerData.features && transformerData.features.length > 0) {
                        const transformerFeatures = transformerData.features[transformerData.features.length - 1];
                        // Проверяем размер фичей перед вызовом модели
                        const transformerInputShape = this.getModelInputShape('transformer');
                        const expectedTransformerElements = transformerInputShape[0] * transformerInputShape[1];
                        const actualTransformerElements = transformerFeatures.length * (transformerFeatures[0]?.length || 0);
                        
                        if (actualTransformerElements === expectedTransformerElements && transformerFeatures.length === transformerInputShape[0]) {
                            transformerPred = await this.getModelPrediction('transformer', transformerFeatures);
                        } else {
                            // Размеры не совпадают - используем упрощенную модель
                            console.log(`📊 Transformer features shape mismatch (${actualTransformerElements} vs ${expectedTransformerElements}), using simple technical prediction`);
                            const simplePred = await this.simpleTechnicalPrediction(candles);
                            transformerPred = simplePred.score;
                        }
                    }
                } else if (candles.length >= 3) {
                    // Fallback на упрощенную модель для Transformer
                    const simplePred = await this.simpleTechnicalPrediction(candles);
                    transformerPred = simplePred.score;
                }
            }

            // Взвешенное голосование
            const ensembleScore = (
                lstmPred * this.weights.lstm +
                cnnPred * this.weights.cnn +
                transformerPred * this.weights.transformer
            );

            // Рассчитываем уверенность на основе согласованности моделей и количества данных
            const predictions = [lstmPred, cnnPred, transformerPred];
            const variance = this.calculateVariance(predictions);
            let confidence = Math.max(0, 1 - variance);
            
            // Снижаем уверенность при использовании упрощенных моделей или недостатке данных
            if (useSimpleModel) {
                confidence = Math.min(confidence, 0.3); // Максимум 30% уверенности для упрощенных моделей
            } else {
                // Снижаем уверенность пропорционально недостатку данных
                const dataCompleteness = Math.min(1, candles.length / minRequired);
                confidence = confidence * (0.5 + 0.5 * dataCompleteness); // От 50% до 100% уверенности
            }

            // Формируем понятные предсказания по горизонтам
            const shortTermModel = hasEnoughDataForLSTM ? 'LSTM' : 'Technical Indicators';
            const mediumTermModel = hasEnoughDataForCNN ? 'CNN' : 'Technical Indicators';
            const longTermModel = hasEnoughDataForTransformer ? 'Transformer' : 'Technical Indicators';

            // Рассчитываем confidence для каждого горизонта на основе реальных метрик
            // Если accuracy не установлен или равен 0, используем базовую confidence с учетом согласованности
            const calculateHorizonConfidence = (modelType, hasEnoughData, prediction, overallConfidence) => {
                if (!hasEnoughData) {
                    return 0.3; // Низкая уверенность для упрощенных моделей
                }
                
                const performance = this.performance[modelType];
                // Проверяем, что accuracy установлен и больше 0 (не начальное значение)
                if (performance && performance.accuracy && performance.accuracy > 0) {
                    // Используем реальную accuracy модели
                    return Math.max(0.3, Math.min(0.95, performance.accuracy));
                }
                
                // Если accuracy не установлен, рассчитываем confidence на основе:
                // 1. Общей confidence ансамбля
                // 2. Согласованности с другими моделями
                // 3. Уверенности в предсказании (чем ближе к 0.5, тем ниже confidence)
                const predictionConfidence = 1 - Math.abs(prediction - 0.5) * 2; // Максимум при prediction = 0.5, минимум при 0 или 1
                const baseConfidence = overallConfidence * 0.7 + predictionConfidence * 0.3;
                
                // Ограничиваем в разумных пределах
                return Math.max(0.35, Math.min(0.75, baseConfidence));
            };

            const horizons = {
                shortTerm: {
                    name: 'Краткосрочный прогноз',
                    description: 'Прогноз на 1-3 дня',
                    model: shortTermModel,
                    score: Math.max(0.01, Math.min(0.99, lstmPred)), // Ограничиваем score для избежания экстремальных значений
                    confidence: calculateHorizonConfidence('lstm', hasEnoughDataForLSTM, lstmPred, confidence),
                    recommendation: lstmPred > 0.7 ? 'BUY' : lstmPred < 0.3 ? 'SELL' : 'HOLD',
                    weight: this.weights.lstm,
                    horizonDays: 1,
                    explanation: hasEnoughDataForLSTM 
                        ? this.getHorizonExplanation('short', lstmPred)
                        : 'Упрощенный анализ на основе технических индикаторов (недостаточно данных для LSTM)'
                },
                mediumTerm: {
                    name: 'Среднесрочный прогноз',
                    description: 'Прогноз на 1-4 недели',
                    model: mediumTermModel,
                    score: Math.max(0.01, Math.min(0.99, cnnPred)), // Ограничиваем score для избежания экстремальных значений
                    confidence: calculateHorizonConfidence('cnn', hasEnoughDataForCNN, cnnPred, confidence),
                    recommendation: cnnPred > 0.7 ? 'BUY' : cnnPred < 0.3 ? 'SELL' : 'HOLD',
                    weight: this.weights.cnn,
                    horizonDays: 21,
                    explanation: hasEnoughDataForCNN 
                        ? this.getHorizonExplanation('medium', cnnPred)
                        : 'Упрощенный анализ на основе технических индикаторов (недостаточно данных для CNN)'
                },
                longTerm: {
                    name: 'Долгосрочный прогноз',
                    description: 'Прогноз на 2-3 месяца',
                    model: longTermModel,
                    score: Math.max(0.01, Math.min(0.99, transformerPred)), // Ограничиваем score для избежания экстремальных значений (включая 100%)
                    confidence: calculateHorizonConfidence('transformer', hasEnoughDataForTransformer, transformerPred, confidence),
                    recommendation: transformerPred > 0.7 ? 'BUY' : transformerPred < 0.3 ? 'SELL' : 'HOLD',
                    weight: this.weights.transformer,
                    horizonDays: 84,
                    explanation: hasEnoughDataForTransformer 
                        ? this.getHorizonExplanation('long', transformerPred)
                        : 'Упрощенный анализ на основе технических индикаторов (недостаточно данных для Transformer)'
                }
            };

            // Общее предсказание с объяснением
            const overallRecommendation = ensembleScore > 0.7 ? 'BUY' : ensembleScore < 0.3 ? 'SELL' : 'HOLD';
            const agreement = this.calculateAgreement(horizons);
            
            return {
                score: ensembleScore,
                confidence: confidence,
                recommendation: overallRecommendation,
                agreement: agreement, // Согласованность между горизонтами (0-1)
                horizons: horizons,
                // Для обратной совместимости
                individualPredictions: {
                    lstm: lstmPred,
                    cnn: cnnPred,
                    transformer: transformerPred
                },
                weights: this.weights,
                summary: this.generatePredictionSummary(horizons, ensembleScore, confidence, agreement)
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
        if (!model) {
            console.warn(`⚠️ Model ${modelType} not loaded`);
            return 0.5; // Возвращаем нейтральное значение
        }
        
        const inputShape = this.getModelInputShape(modelType);
        
        // Проверяем формат features
        if (!features || !Array.isArray(features)) {
            console.error(`❌ Invalid features format for ${modelType}:`, typeof features, features);
            return 0.5;
        }
        
        // Проверяем, что features - это 2D массив (массив массивов)
        const is2DArray = Array.isArray(features[0]);
        if (!is2DArray) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Features should be 2D array', {
                    service: 'EnsembleService',
                    operation: 'predict',
                    modelType,
                    error: { message: 'Features should be 2D array, got 1D array' }
                });
            }
            return 0.5;
        }
        
        // Проверяем размерность
        const expectedElements = inputShape[0] * inputShape[1];
        const actualElements = features.length * features[0].length;
        
        if (actualElements !== expectedElements) {
            console.error(`❌ Features shape mismatch for ${modelType}: expected ${expectedElements} elements (${inputShape[0]}x${inputShape[1]}), got ${actualElements} (${features.length}x${features[0].length})`);
            return 0.5;
        }
        
        try {
            // Проверяем, обучена ли модель (проверяем веса)
            // Если модель только что создана и не обучена, веса будут случайными
            const weights = model.getWeights();
            const hasTrainedWeights = weights && weights.length > 0 && 
                weights.some(w => {
                    const data = w.dataSync();
                    return data.some(v => Math.abs(v) > 0.001); // Проверяем, что есть ненулевые веса
                });
            
            if (!hasTrainedWeights) {
                return 0.5; // Возвращаем нейтральное значение для необученной модели
            }
            
            // Формируем тензор: [1, time_steps, features_per_step]
            const inputTensor = tf.tensor3d([features], [1, ...inputShape]);
            const prediction = model.predict(inputTensor);
            let score = (await prediction.data())[0];
            
            inputTensor.dispose();
            prediction.dispose();
            
            // Проверяем на валидность значения
            if (!isFinite(score) || isNaN(score)) {
                console.warn(`⚠️ Model ${modelType} returned invalid score: ${score}, using fallback`);
                return 0.5;
            }
            
            // Ограничиваем score в диапазоне [0.01, 0.99] для избежания экстремальных значений
            // Это предотвращает показ 100% сигнала, который может быть артефактом модели
            score = Math.max(0.01, Math.min(0.99, score));
            
            // Дополнительная проверка: если score очень близок к границам (0.99 или 0.01),
            // это может быть признаком переобучения или артефакта модели
            // Смягчаем такие значения
            if (score >= 0.95) {
                score = 0.95; // Максимум 95% вместо 99%
            } else if (score <= 0.05) {
                score = 0.05; // Минимум 5% вместо 1%
            }
            
            return score;
        } catch (error) {
            console.error(`❌ Error in getModelPrediction for ${modelType}:`, error.message);
            console.error(`   Features length: ${features.length}, first element length: ${features[0]?.length}`);
            console.error(`   Expected shape: [1, ${inputShape[0]}, ${inputShape[1]}]`);
            return 0.5; // Возвращаем нейтральное значение при ошибке
        }
    }

    /**
     * Простой ансамбль: MLP + правила тренда/волатильности
     */
    async predictSimple(figi, portfolio = null) {
        try {
            // Получаем данные (skipUpdate = true - используем только БД)
            const candles = await CacheService.getCandles(figi, 'DAY', 60, true);
            if (candles.length < 20) {
                return { score: 0, confidence: 0, reason: 'Insufficient data' };
            }

            // 1. MLP предсказание (используем OptimizedTrainingService)
            let mlpScore = 0.5;
            let mlpConfidence = 0;
            try {
                const OptimizedTrainingService = getService('OptimizedTrainingService');
                if (OptimizedTrainingService) {
                    // Получаем последние фичи
                    const { features } = await OptimizedTrainingService.prepareFeatures(candles, figi, false);
                    if (features && features.length > 0) {
                        const model = await OptimizedTrainingService.loadModel(figi);
                        if (model) {
                            const xs = tf.tensor2d([features[features.length - 1]]);
                            const prediction = model.predict(xs);
                            mlpScore = (await prediction.data())[0];
                            mlpConfidence = 0.7; // Базовая уверенность для MLP
                            
                            xs.dispose();
                            prediction.dispose();
                        }
                    }
                }
            } catch (mlpError) {
                console.warn(`⚠️ MLP prediction failed for ${figi}:`, mlpError.message);
            }

            // 2. Правила тренда
            const trendScore = this.calculateTrendRule(candles);
            // Уверенность тренда зависит от силы тренда
            const trendStrength = Math.abs(trendScore - 0.5) * 2; // 0-1, где 1 = сильный тренд
            const trendConfidence = 0.4 + (trendStrength * 0.3); // 0.4-0.7

            // 3. Правила волатильности
            const volatilityScore = this.calculateVolatilityRule(candles);
            // Уверенность волатильности зависит от четкости сигнала
            const volatilitySignalStrength = Math.abs(volatilityScore - 0.5) * 2; // 0-1
            const volatilityConfidence = 0.3 + (volatilitySignalStrength * 0.3); // 0.3-0.6

            // Адаптивные веса на основе уверенности компонентов
            const baseWeights = {
                mlp: 0.5,        // Базовый вес для MLP
                trend: 0.3,      // Базовый вес для правил тренда
                volatility: 0.2  // Базовый вес для правил волатильности
            };

            // Нормализуем веса с учетом уверенности
            const confidenceWeights = {
                mlp: baseWeights.mlp * mlpConfidence,
                trend: baseWeights.trend * trendConfidence,
                volatility: baseWeights.volatility * volatilityConfidence
            };

            // Нормализуем веса так, чтобы сумма была равна 1
            const totalWeight = confidenceWeights.mlp + confidenceWeights.trend + confidenceWeights.volatility;
            const weights = {
                mlp: totalWeight > 0 ? confidenceWeights.mlp / totalWeight : baseWeights.mlp,
                trend: totalWeight > 0 ? confidenceWeights.trend / totalWeight : baseWeights.trend,
                volatility: totalWeight > 0 ? confidenceWeights.volatility / totalWeight : baseWeights.volatility
            };

            const ensembleScore = (
                mlpScore * weights.mlp +
                trendScore * weights.trend +
                volatilityScore * weights.volatility
            );

            // Уверенность на основе согласованности
            const predictions = [mlpScore, trendScore, volatilityScore];
            const variance = this.calculateVariance(predictions);
            const confidence = Math.max(0, 1 - variance) * 0.8; // Немного снижаем уверенность для простого ансамбля

            return {
                score: ensembleScore,
                confidence: confidence,
                components: {
                    mlp: { score: mlpScore, confidence: mlpConfidence },
                    trend: { score: trendScore, confidence: trendConfidence },
                    volatility: { score: volatilityScore, confidence: volatilityConfidence }
                },
                weights: weights,
                recommendation: ensembleScore > 0.7 ? 'BUY' : ensembleScore < 0.3 ? 'SELL' : 'HOLD'
            };

        } catch (error) {
            console.error('❌ Simple ensemble prediction failed:', error);
            return { score: 0, confidence: 0, error: error.message };
        }
    }

    /**
     * Расчет правила тренда
     */
    calculateTrendRule(candles) {
        if (candles.length < 20) return 0.5;

        const prices = candles.map(c => c.close);
        
        // Краткосрочный тренд (последние 5 дней)
        const shortTerm = prices.slice(-5);
        const shortAvg = shortTerm.reduce((sum, p) => sum + p, 0) / shortTerm.length;
        
        // Среднесрочный тренд (последние 20 дней)
        const mediumTerm = prices.slice(-20);
        const mediumAvg = mediumTerm.reduce((sum, p) => sum + p, 0) / mediumTerm.length;
        
        // Долгосрочный тренд (все данные)
        const longAvg = prices.reduce((sum, p) => sum + p, 0) / prices.length;
        
        const currentPrice = prices[prices.length - 1];
        
        // Правила тренда
        let score = 0.5; // Нейтральное значение
        
        // Сильный восходящий тренд: цена выше всех средних
        if (currentPrice > shortAvg && shortAvg > mediumAvg && mediumAvg > longAvg) {
            score = 0.8; // Сильный сигнал на покупку
        }
        // Восходящий тренд: цена выше средних
        else if (currentPrice > mediumAvg && mediumAvg > longAvg) {
            score = 0.65; // Умеренный сигнал на покупку
        }
        // Сильный нисходящий тренд: цена ниже всех средних
        else if (currentPrice < shortAvg && shortAvg < mediumAvg && mediumAvg < longAvg) {
            score = 0.2; // Сильный сигнал на продажу
        }
        // Нисходящий тренд: цена ниже средних
        else if (currentPrice < mediumAvg && mediumAvg < longAvg) {
            score = 0.35; // Умеренный сигнал на продажу
        }
        // Боковой тренд: смешанные сигналы
        else {
            score = 0.5; // Нейтральный сигнал
        }
        
        return Math.max(0, Math.min(1, score));
    }

    /**
     * Расчет правила волатильности
     */
    calculateVolatilityRule(candles) {
        if (candles.length < 20) return 0.5;

        const prices = candles.map(c => c.close);
        
        // Расчет волатильности (стандартное отклонение доходности)
        const returns = [];
        for (let i = 1; i < prices.length; i++) {
            returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
        }
        
        const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
        const volatility = Math.sqrt(variance);
        
        // Расчет RSI (упрощенная версия)
        const gains = returns.filter(r => r > 0);
        const losses = returns.filter(r => r < 0).map(r => Math.abs(r));
        const avgGain = gains.length > 0 ? gains.reduce((sum, g) => sum + g, 0) / gains.length : 0;
        const avgLoss = losses.length > 0 ? losses.reduce((sum, l) => sum + l, 0) / losses.length : 0;
        const rs = avgLoss > 0 ? avgGain / avgLoss : 100;
        const rsi = 100 - (100 / (1 + rs));
        
        // Правила волатильности
        let score = 0.5; // Нейтральное значение
        
        // Низкая волатильность + перепроданность (RSI < 30) = сигнал на покупку
        if (volatility < 0.02 && rsi < 30) {
            score = 0.75; // Сильный сигнал на покупку
        }
        // Низкая волатильность + перекупленность (RSI > 70) = сигнал на продажу
        else if (volatility < 0.02 && rsi > 70) {
            score = 0.25; // Сильный сигнал на продажу
        }
        // Высокая волатильность = нейтральный сигнал (рискованно)
        else if (volatility > 0.05) {
            score = 0.5; // Нейтральный сигнал при высокой волатильности
        }
        // Средняя волатильность + перепроданность = слабый сигнал на покупку
        else if (rsi < 40) {
            score = 0.6; // Слабый сигнал на покупку
        }
        // Средняя волатильность + перекупленность = слабый сигнал на продажу
        else if (rsi > 60) {
            score = 0.4; // Слабый сигнал на продажу
        }
        
        return Math.max(0, Math.min(1, score));
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
        // Собираем только те модели, которые были обучены
        const trainedModels = [];
        const weights = {};
        
        if (this.performance.lstm && this.performance.lstm.f1Score > 0) {
            trainedModels.push({ type: 'lstm', f1Score: this.performance.lstm.f1Score });
        }
        if (this.performance.cnn && this.performance.cnn.f1Score > 0) {
            trainedModels.push({ type: 'cnn', f1Score: this.performance.cnn.f1Score });
        }
        if (this.performance.transformer && this.performance.transformer.f1Score > 0) {
            trainedModels.push({ type: 'transformer', f1Score: this.performance.transformer.f1Score });
        }
        
        if (trainedModels.length === 0) {
            // Если ни одна модель не обучена, используем равные веса для доступных моделей
            const availableModels = [];
            if (this.models.lstm) availableModels.push('lstm');
            if (this.models.cnn) availableModels.push('cnn');
            if (this.models.transformer) availableModels.push('transformer');
            
            if (availableModels.length > 0) {
                const equalWeight = 1.0 / availableModels.length;
                availableModels.forEach(type => {
                    weights[type] = equalWeight;
                });
            } else {
                console.warn(`⚠️ No models available for weighting`);
                return;
            }
        } else {
            // Вычисляем общий F1-score для обученных моделей
            const totalF1 = trainedModels.reduce((sum, m) => sum + m.f1Score, 0);
            
            if (totalF1 > 0) {
                // Распределяем веса пропорционально F1-score
                trainedModels.forEach(model => {
                    weights[model.type] = model.f1Score / totalF1;
                });
                
                // Обнуляем веса для необученных моделей
                ['lstm', 'cnn', 'transformer'].forEach(type => {
                    if (!weights[type]) {
                        weights[type] = 0;
                    }
                });
            } else {
                // Если F1-score всех моделей = 0, используем равные веса
                const equalWeight = 1.0 / trainedModels.length;
                trainedModels.forEach(model => {
                    weights[model.type] = equalWeight;
                });
                ['lstm', 'cnn', 'transformer'].forEach(type => {
                    if (!weights[type]) {
                        weights[type] = 0;
                    }
                });
            }
        }
        
        // Обновляем веса
        this.weights = {
            lstm: weights.lstm || 0,
            cnn: weights.cnn || 0,
            transformer: weights.transformer || 0
        };
        
        // Нормализуем веса (сумма должна быть 1.0)
        const totalWeight = this.weights.lstm + this.weights.cnn + this.weights.transformer;
        if (totalWeight > 0) {
            this.weights.lstm /= totalWeight;
            this.weights.cnn /= totalWeight;
            this.weights.transformer /= totalWeight;
        }
        
        console.log('🔄 Updated ensemble weights:', this.weights);
    }

    /**
     * Получить статистику ансамбля
     */
    getEnsembleStats() {
        // Вычисляем стабильность на основе истории весов
        const calculateStability = (history) => {
            if (history.length < 2) return 0.5; // Если недостаточно данных, средняя стабильность
            const weights = history.map(h => h.weight);
            const mean = weights.reduce((sum, w) => sum + w, 0) / weights.length;
            const variance = weights.reduce((sum, w) => sum + Math.pow(w - mean, 2), 0) / weights.length;
            const stdDev = Math.sqrt(variance);
            // Стабильность обратно пропорциональна стандартному отклонению
            // Нормализуем к [0, 1], где 1 = максимальная стабильность (stdDev = 0)
            return Math.max(0, Math.min(1, 1 - (stdDev * 10))); // Умножаем на 10 для масштабирования
        };

        // Формируем массив моделей для фронтенда
        const modelsArray = [
            {
                name: 'LSTM',
                type: 'LSTM',
                status: this.models.lstm !== null ? 'active' : 'idle',
                accuracy: this.performance.lstm?.accuracy || 0,
                weight: this.weights.lstm || 0,
                lastUpdate: this.lastUpdate.lstm || null,
                isTraining: this.isTraining,
                precision: this.performance.lstm?.precision || 0,
                recall: this.performance.lstm?.recall || 0,
                f1Score: this.performance.lstm?.f1Score || 0
            },
            {
                name: 'CNN',
                type: 'CNN',
                status: this.models.cnn !== null ? 'active' : 'idle',
                accuracy: this.performance.cnn?.accuracy || 0,
                weight: this.weights.cnn || 0,
                lastUpdate: this.lastUpdate.cnn || null,
                isTraining: this.isTraining,
                precision: this.performance.cnn?.precision || 0,
                recall: this.performance.cnn?.recall || 0,
                f1Score: this.performance.cnn?.f1Score || 0
            },
            {
                name: 'Transformer',
                type: 'Transformer',
                status: this.models.transformer !== null ? 'active' : 'idle',
                accuracy: this.performance.transformer?.accuracy || 0,
                weight: this.weights.transformer || 0,
                lastUpdate: this.lastUpdate.transformer || null,
                isTraining: this.isTraining,
                precision: this.performance.transformer?.precision || 0,
                recall: this.performance.transformer?.recall || 0,
                f1Score: this.performance.transformer?.f1Score || 0
            }
        ];

        // Вычисляем метрики ансамбля
        const activeModels = modelsArray.filter(m => m.status === 'active');
        const totalWeight = modelsArray.reduce((sum, m) => sum + m.weight, 0);
        
        // Общая точность (средневзвешенная)
        const overallAccuracy = activeModels.length > 0
            ? modelsArray.reduce((sum, m) => sum + (m.accuracy * m.weight), 0) / (totalWeight || 1)
            : 0;

        // Разнообразие (дисперсия точности моделей)
        const accuracies = activeModels.map(m => m.accuracy);
        const meanAccuracy = accuracies.length > 0 
            ? accuracies.reduce((sum, acc) => sum + acc, 0) / accuracies.length 
            : 0;
        const variance = accuracies.length > 0
            ? accuracies.reduce((sum, acc) => sum + Math.pow(acc - meanAccuracy, 2), 0) / accuracies.length
            : 0;
        const diversity = Math.min(1, Math.sqrt(variance)); // Нормализуем к [0, 1]

        // Стабильность (на основе стабильности весов - если веса не меняются, стабильность высокая)
        const stabilities = [
            calculateStability(this.weightHistory.lstm),
            calculateStability(this.weightHistory.cnn),
            calculateStability(this.weightHistory.transformer)
        ].filter(s => s > 0); // Убираем нулевые значения
        const stability = stabilities.length > 0
            ? stabilities.reduce((sum, s) => sum + s, 0) / stabilities.length
            : 0.5; // Если нет истории, средняя стабильность

        // Производительность (комбинация точности и F1-score)
        const avgF1Score = activeModels.length > 0
            ? activeModels.reduce((sum, m) => sum + (m.f1Score || 0), 0) / activeModels.length
            : 0;
        const performance = (overallAccuracy * 0.6 + avgF1Score * 0.4);

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
            activeModels: Object.values(this.models).filter(model => model !== null).length,
            // Данные для фронтенда
            models: modelsArray,
            metrics: {
                overallAccuracy: overallAccuracy || 0,
                diversity: diversity || 0,
                stability: stability || 0,
                performance: performance || 0
            }
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
     * Расчет согласованности между горизонтами (0-1, где 1 = полное согласие)
     */
    calculateAgreement(horizons) {
        const recommendations = [
            horizons.shortTerm.recommendation,
            horizons.mediumTerm.recommendation,
            horizons.longTerm.recommendation
        ];
        
        // Подсчитываем количество одинаковых рекомендаций
        const buyCount = recommendations.filter(r => r === 'BUY').length;
        const sellCount = recommendations.filter(r => r === 'SELL').length;
        const holdCount = recommendations.filter(r => r === 'HOLD').length;
        
        // Максимальное совпадение
        const maxMatch = Math.max(buyCount, sellCount, holdCount);
        
        // Согласованность = доля моделей с одинаковой рекомендацией
        return maxMatch / 3;
    }

    /**
     * Генерация объяснения для горизонта
     */
    getHorizonExplanation(horizon, score) {
        const explanations = {
            short: {
                high: 'Краткосрочные паттерны указывают на быстрый рост цены в ближайшие дни',
                medium: 'Краткосрочные паттерны показывают умеренное движение цены',
                low: 'Краткосрочные паттерны указывают на возможное падение цены'
            },
            medium: {
                high: 'Среднесрочные графические паттерны формируют восходящий тренд',
                medium: 'Среднесрочные паттерны показывают боковое движение',
                low: 'Среднесрочные графические паттерны формируют нисходящий тренд'
            },
            long: {
                high: 'Долгосрочный контекстный анализ указывает на позитивный фундаментальный тренд',
                medium: 'Долгосрочный анализ показывает нейтральную динамику',
                low: 'Долгосрочный контекстный анализ указывает на негативный фундаментальный тренд'
            }
        };
        
        const category = score > 0.7 ? 'high' : score < 0.3 ? 'low' : 'medium';
        return explanations[horizon]?.[category] || 'Анализ показывает нейтральную динамику';
    }

    /**
     * Генерация понятного резюме предсказания
     */
    generatePredictionSummary(horizons, ensembleScore, confidence, agreement) {
        const recommendation = ensembleScore > 0.7 ? 'BUY' : ensembleScore < 0.3 ? 'SELL' : 'HOLD';
        
        let summary = '';
        
        // Основная рекомендация
        if (recommendation === 'BUY') {
            summary = '📈 Рекомендация: ПОКУПКА\n';
            summary += `Общий сигнал: ${(ensembleScore * 100).toFixed(1)}% (${(confidence * 100).toFixed(0)}% уверенность)\n\n`;
        } else if (recommendation === 'SELL') {
            summary = '📉 Рекомендация: ПРОДАЖА\n';
            summary += `Общий сигнал: ${(ensembleScore * 100).toFixed(1)}% (${(confidence * 100).toFixed(0)}% уверенность)\n\n`;
        } else {
            summary = '⏸️ Рекомендация: УДЕРЖАНИЕ\n';
            summary += `Общий сигнал: ${(ensembleScore * 100).toFixed(1)}% (${(confidence * 100).toFixed(0)}% уверенность)\n\n`;
        }
        
        // Согласованность
        if (agreement > 0.7) {
            summary += `✅ Высокая согласованность (${(agreement * 100).toFixed(0)}%) - все горизонты согласны\n\n`;
        } else if (agreement > 0.5) {
            summary += `⚠️ Умеренная согласованность (${(agreement * 100).toFixed(0)}%) - горизонты частично расходятся\n\n`;
        } else {
            summary += `❌ Низкая согласованность (${(agreement * 100).toFixed(0)}%) - горизонты дают разные сигналы\n\n`;
        }
        
        // Детали по горизонтам
        summary += '📊 Прогнозы по горизонтам:\n';
        summary += `• Краткосрочный (1-3 дня): ${horizons.shortTerm.recommendation} (${(horizons.shortTerm.score * 100).toFixed(1)}%)\n`;
        summary += `• Среднесрочный (1-4 недели): ${horizons.mediumTerm.recommendation} (${(horizons.mediumTerm.score * 100).toFixed(1)}%)\n`;
        summary += `• Долгосрочный (2-3 месяца): ${horizons.longTerm.recommendation} (${(horizons.longTerm.score * 100).toFixed(1)}%)\n`;
        
        return summary;
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
        // Молча пропускаем, если WebSocketService не доступен
        // Это нормальная ситуация, когда WebSocket не инициализирован или не используется
        try {
            // Используем безопасный метод получения сервиса
            if (!ServiceManager) {
                return;
            }
            
            const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
            if (WebSocketService && typeof WebSocketService.broadcast === 'function') {
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
        } catch (error) {
            // Полностью подавляем все ошибки в этом методе
            // Отсутствие WebSocketService - это нормальная ситуация
            // Не логируем ошибки, чтобы не засорять консоль
        }
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
            const { fileURLToPath } = await import('url');
            
            // Используем правильный путь относительно server директории
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = path.dirname(__filename);
            const modelsDir = path.join(__dirname, '../../models');
            const ensembleDir = path.join(modelsDir, 'ensemble');
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
            // Проверяем, загружены ли уже модели
            const allLoaded = this.models.lstm && this.models.cnn && this.models.transformer;
            if (allLoaded) {
                console.log('ℹ️ Ensemble models already loaded, skipping reload');
                return;
            }

            console.log('📥 Loading ensemble models with new ModelManager...');
            
            // Загружаем каждую модель ансамбля через ModelManager
            for (const modelType of ['lstm', 'cnn', 'transformer']) {
                // Пропускаем, если модель уже загружена
                if (this.models[modelType]) {
                    console.log(`ℹ️ ${modelType} model already loaded, skipping`);
                    continue;
                }

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
