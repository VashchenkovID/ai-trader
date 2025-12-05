import * as tf from '@tensorflow/tfjs';
import OptimizedDataService from './OptimizedDataService.js';
import CacheService from './CacheService.js';
import OptimizedTelegramService from './OptimizedTelegramService.js';
import WebSocketService from './WebSocketService.js';
import SettingsService from './SettingsService.js';
import OptimizedTrainingService from './OptimizedTrainingService.js';
import ModelManager from '../utils/ModelManager.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getService } from './GlobalServiceManager.js';

class NeuralNetworkService {
    constructor() {
        this.model = null;
        this.isTraining = false;
        this.isActive = false;
        this.status = 'off'; // 'off', 'training', 'active'
        this.analysisInterval = null;
        this.oldStatus = 'off';
        this.webSocketService = null; // Кэшируем WebSocketService
        this.modelPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../models');
        this.modelFile = path.join(this.modelPath, 'neural-network-model.json');
        this.weightsFile = path.join(this.modelPath, 'neural-network-weights.json');
        this.isBatchTraining = false;
        // Метаданные обучения
        this.lastTrainingTime = null;
        this.lastTrainingDuration = null;
        this.lastTrainingAccuracy = null;
        this.lastTrainingLoss = null;
        this.trainingHistory = [];
        this.totalPredictions = 0;
        this.successfulPredictions = 0;
        this.modelCreatedAt = null; // Время создания/загрузки модели
    }

    /**
     * Устанавливает WebSocketService (передается извне)
     */
    setWebSocketService(webSocketService) {
        this.webSocketService = webSocketService;
        console.log('🔌 WebSocketService set in NeuralNetworkService');
    }

    /**
     * Получает WebSocketService
     */
    getWebSocketService() {
        if (!this.webSocketService) {
            console.warn('⚠️ WebSocketService not set, getting from global ServiceManager');
            // Получаем уже инициализированный экземпляр из глобального ServiceManager
            this.webSocketService = getService('WebSocketService');
            if (!this.webSocketService) {
                console.warn('⚠️ WebSocketService not available, skipping broadcast');
                return null;
            }
            console.log('🔌 WebSocketService retrieved from global ServiceManager');
        }
        return this.webSocketService;
    }

    // Создание архитектуры модели
    async createModel(inputShape, sequenceLength = 60) {
        try {
            // Получаем настройки из базы данных
            const nnSettings = await SettingsService.getNeuralNetworkSettings();
            const dropoutRate = nnSettings.nn_dropout_rate || 0.2;
            const learningRate = nnSettings.nn_learning_rate || 0.0005;
            
            console.log(`🏗️ Creating model with input shape: ${inputShape}`);
            
            const model = tf.sequential();

            // Reshape input для LSTM (batch_size, timesteps, features)
            // Вычисляем оптимальные размеры для reshape
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
            
            console.log(`📊 Reshape: inputShape=${inputShape}, sequenceLength=${sequenceLength}`);
            console.log(`📊 Reshape: featuresPerTimestep=${featuresPerTimestep}, actualSequenceLength=${actualSequenceLength}`);
            console.log(`📊 Проверка: ${actualSequenceLength} * ${featuresPerTimestep} = ${actualSequenceLength * featuresPerTimestep} (inputShape=${inputShape})`);
            
            model.add(tf.layers.reshape({
                targetShape: [actualSequenceLength, featuresPerTimestep],
                inputShape: [inputShape]
            }));

            // LSTM слои для временных последовательностей
            model.add(tf.layers.lstm({
                units: 128,
                returnSequences: true,
                dropout: dropoutRate,
                recurrentDropout: dropoutRate,
                // Заменяем Orthogonal на более быстрые инициализаторы
                kernelInitializer: 'glorotUniform',
                recurrentInitializer: 'glorotUniform'
            }));

            model.add(tf.layers.lstm({
                units: 64,
                returnSequences: false,
                dropout: dropoutRate,
                recurrentDropout: dropoutRate,
                kernelInitializer: 'glorotUniform',
                recurrentInitializer: 'glorotUniform'
            }));

            // L2 регуляризация для предотвращения переобучения
            const l2Regularizer = tf.regularizers.l2({ l2: 0.001 });
            
            // Dense слои для обработки извлеченных признаков с L2 регуляризацией
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
            model.add(tf.layers.dropout({ rate: Math.min(0.3, dropoutRate + 0.1) })); // Актуализированный dropout

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
            model.add(tf.layers.dropout({ rate: Math.max(0.2, dropoutRate) })); // Актуализированный dropout

            model.add(tf.layers.dense({ 
                units: 32, 
                activation: 'relu',
                kernelInitializer: 'heUniform',
                kernelRegularizer: l2Regularizer // L2 регуляризация
            }));
            model.add(tf.layers.dropout({ rate: Math.max(0.15, dropoutRate - 0.05) })); // Актуализированный dropout

            // Выходной слой (бинарная классификация)
            model.add(tf.layers.dense({ 
                units: 1, 
                activation: 'sigmoid',
                kernelInitializer: 'glorotUniform'
                // Выходной слой без L2 для сохранения предсказательной способности
            }));

            // Компиляция модели с настраиваемыми параметрами
            console.log('🔧 Compiling model...');
            model.compile({
                optimizer: tf.train.adam(learningRate),
                loss: 'binaryCrossentropy',
                metrics: ['accuracy']
            });

            console.log('✅ Model created and compiled successfully');
            return model;
        } catch (error) {
            console.error('❌ Error creating model:', error);
            // Временный алерт в Telegram
            try {
                await OptimizedTelegramService.sendAlert('NEURAL_NETWORK_ERROR', {
                    error: error.message,
                    context: 'Model Creation',
                    timestamp: new Date().toISOString()
                });
            } catch (telegramError) {
                console.error('Failed to send Telegram alert:', telegramError);
            }
            throw error;
        }
    }

    // Альтернативная архитектура с вниманием (для экспериментов)
    createAttentionModel(inputShape, sequenceLength = 60) {
        const model = tf.sequential();

        // Reshape input
        // Вычисляем оптимальные размеры для reshape
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
        
        console.log(`📊 Attention Reshape: inputShape=${inputShape}, sequenceLength=${sequenceLength}`);
        console.log(`📊 Attention Reshape: featuresPerTimestep=${featuresPerTimestep}, actualSequenceLength=${actualSequenceLength}`);
        console.log(`📊 Проверка: ${actualSequenceLength} * ${featuresPerTimestep} = ${actualSequenceLength * featuresPerTimestep} (inputShape=${inputShape})`);
        
        model.add(tf.layers.reshape({
            targetShape: [actualSequenceLength, featuresPerTimestep],
            inputShape: [inputShape]
        }));

        // Bidirectional LSTM для лучшего понимания контекста
        model.add(tf.layers.bidirectional({
            layer: tf.layers.lstm({
                units: 64,
                returnSequences: true,
                dropout: 0.2,
                recurrentDropout: 0.2
            })
        }));

        // Attention mechanism (упрощенная версия)
        model.add(tf.layers.lstm({
            units: 32,
            returnSequences: false,
            dropout: 0.2
        }));

        // Dense слои
        model.add(tf.layers.dense({ units: 64, activation: 'relu' }));
        model.add(tf.layers.batchNormalization());
        model.add(tf.layers.dropout({ rate: 0.3 }));

        model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
        model.add(tf.layers.dropout({ rate: 0.2 }));

        // Выходной слой
        model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));

        model.compile({
            optimizer: tf.train.adam(0.0003),
            loss: 'binaryCrossentropy',
            metrics: ['accuracy']
        });

        return model;
    }

    // Сохранение модели в файлы (получение из worker'а)
    async saveModel(figi = null) {
        try {
            await fs.mkdir(this.modelPath, { recursive: true });

            let modelData;
            
            if (figi) {
                // Получаем модель из worker'а
                console.log(`📥 Получаем модель из worker'а для ${figi}...`);
                modelData = await OptimizedTrainingService.getModel(figi);
                
                // Проверяем, что модель была получена
                if (!modelData) {
                    console.warn(`⚠️ Модель для ${figi} не найдена, создаем новую модель...`);
                    // Создаем новую модель с базовыми параметрами
                    this.model = await this.createModel(100, 60); // базовые параметры
                    const weights = this.model.getWeights();
                    modelData = {
                        architecture: this.model.toJSON(null, false),
                        weights: await Promise.all(weights.map(async (w) => ({
                            name: w.name,
                            shape: w.shape,
                            dtype: w.dtype,
                            data: await w.array()
                        })))
                    };
                } else if (typeof modelData.toJSON === 'function') {
                    // Нам вернули инстанс модели tfjs — сериализуем
                    this.model = modelData; // кэшируем на всякий случай
                    const archJson = this.model.toJSON(null, false);
                    const weights = this.model.getWeights();
                    const specs = await Promise.all(weights.map(async (w) => ({
                        name: w.name,
                        shape: w.shape,
                        dtype: w.dtype,
                        data: await w.array()
                    })));
                    modelData = {
                        architecture: archJson,
                        weights: { specs }
                    };
                }
            } else if (this.model) {
                // Используем локальную модель (для обратной совместимости)
                const archJson = this.model.toJSON(null, false);
                const weights = this.model.getWeights();
                const specs = await Promise.all(weights.map(async (w) => ({
                    name: w.name,
                    shape: w.shape,
                    dtype: w.dtype,
                    data: await w.array()
                })));
                
                modelData = {
                    architecture: archJson,
                    weights: { specs }
                };
            } else {
                console.warn('⚠️ Нет модели для сохранения');
                return;
            }

            // Проверяем структуру modelData
            if (!modelData || !modelData.architecture) {
                console.warn('⚠️ Некорректные данные модели, пропускаем сохранение');
                return;
            }

            // Сохраняем модель: если указан FIGI, сохраняем per-FIGI, иначе общую
            if (figi) {
                // Сохраняем per-FIGI модель
                const figiModelFile = path.join(this.modelPath, `${figi}_model.json`);
                const figiWeightsFile = path.join(this.modelPath, `${figi}_weights.json`);
                
                await fs.writeFile(figiModelFile, typeof modelData.architecture === 'string' 
                    ? modelData.architecture 
                    : JSON.stringify(modelData.architecture));
                
                await fs.writeFile(figiWeightsFile, JSON.stringify(modelData.weights));
                
                console.log(`✅ Per-FIGI модель сохранена для ${figi} (архитектура и веса)`);
                
                // Также сохраняем через ModelManager для совместимости
                try {
                    if (this.model) {
                        await ModelManager.saveModel(this.model, `neural/${figi}`);
                    }
                } catch (modelManagerError) {
                    console.warn(`⚠️ Failed to save model via ModelManager for ${figi}:`, modelManagerError.message);
                }
            } else {
                // Сохраняем общую модель (для обратной совместимости)
                await fs.writeFile(this.modelFile, typeof modelData.architecture === 'string' 
                    ? modelData.architecture 
                    : JSON.stringify(modelData.architecture));

                await fs.writeFile(this.weightsFile, JSON.stringify(modelData.weights));

                console.log('✅ Общая модель сохранена (архитектура и веса)');

                // Дополнительно сохраняем через ModelManager в новом формате,
                // чтобы последующие загрузки не падали на fallback и не логировали warning
                try {
                    if (this.model) {
                        const path = await import('path');
                        const modelName = path.basename(this.modelFile, '.json');
                        await ModelManager.saveModel(this.model, `neural/${modelName}`);
                    }
                } catch (modelManagerError) {
                    console.warn(`⚠️ Failed to save general neural model via ModelManager: ${modelManagerError.message}`);
                }
            }
        } catch (error) {
            console.error('❌ Ошибка сохранения модели:', error);
        }
    }

    // Загрузка модели из файлов (без tfjs-node): архитектура + веса
    async loadModel(figi = null) {
        try {
            // Попытка 0: Загрузить модель через OptimizedTrainingService (если есть в памяти)
            if (figi) {
                try {
                    const modelFromTraining = await OptimizedTrainingService.getModel(figi);
                    if (modelFromTraining) {
                        this.model = modelFromTraining;
                        console.log(`✅ Model loaded from OptimizedTrainingService for ${figi}`);
                        
                        // Гарантируем компиляцию после загрузки
                        if (!this.model.optimizer) {
                            this.model.compile({
                                optimizer: tf.train.adam(0.001),
                                loss: 'binaryCrossentropy',
                                metrics: ['accuracy']
                            });
                        }
                        
                        return true;
                    }
                } catch (trainingServiceError) {
                    console.warn(`⚠️ Failed to load model from OptimizedTrainingService: ${trainingServiceError.message}`);
                }
            }
            
            // Попытка 1: Загрузить модель для конкретного FIGI (если указан)
            if (figi) {
                // Пробуем разные пути для поиска модели
                const possiblePaths = [
                    path.join(this.modelPath, `${figi}_model.json`), // Стандартный путь
                    path.join(process.cwd(), 'models', `${figi}_model.json`), // От корня проекта
                    path.join('./models', `${figi}_model.json`) // Относительный путь
                ];
                
                for (const figiModelFile of possiblePaths) {
                    const figiWeightsFile = figiModelFile.replace('_model.json', '_weights.json');
                    
                    try {
                        const modelExists = await fs.access(figiModelFile).then(() => true).catch(() => false);
                        const weightsExist = await fs.access(figiWeightsFile).then(() => true).catch(() => false);
                        
                        if (modelExists && weightsExist) {
                            console.log(`📥 Loading per-FIGI neural model for ${figi} from ${figiModelFile}...`);
                            
                            // Пытаемся загрузить через ModelManager
                            const model = await ModelManager.loadModel(`neural/${figi}`);
                            
                            if (model) {
                                this.model = model;
                                console.log(`✅ Per-FIGI neural model loaded successfully for ${figi} via ModelManager`);
                            } else {
                                // Fallback к прямому чтению файлов
                                try {
                                    const archRaw = await fs.readFile(figiModelFile, 'utf-8');
                                    const arch = JSON.parse(archRaw);
                                    this.model = await tf.models.modelFromJSON(arch);
                                    
                                    const weightsRaw = await fs.readFile(figiWeightsFile, 'utf-8');
                                    const weightsData = JSON.parse(weightsRaw);
                                    const specs = weightsData.specs || weightsData.weights || null;
                                    
                                    if (!specs || !Array.isArray(specs) || specs.length === 0) {
                                        throw new Error('Invalid weights format: specs is not an array');
                                    }
                                    
                                    const tensors = specs.map(s => tf.tensor(s.data, s.shape, s.dtype));
                                    this.model.setWeights(tensors);
                                    
                                    console.log(`✅ Per-FIGI neural model loaded for ${figi} with legacy format`);
                                } catch (legacyError) {
                                    console.warn(`⚠️ Failed to load legacy per-FIGI model for ${figi}: ${legacyError.message}`);
                                    continue; // Пробуем следующий путь
                                }
                            }
                            
                            // Гарантируем компиляцию после загрузки
                            if (!this.model.optimizer) {
                                this.model.compile({
                                    optimizer: tf.train.adam(0.001),
                                    loss: 'binaryCrossentropy',
                                    metrics: ['accuracy']
                                });
                            }
                            
                            return true;
                        }
                    } catch (pathError) {
                        // Пробуем следующий путь
                        continue;
                    }
                }
                
                // Если не нашли модель для конкретного FIGI, продолжаем поиск общей модели
                console.warn(`⚠️ Per-FIGI model not found for ${figi}, trying general model...`);
            }
            
            // Попытка 2: Загрузить общую модель (fallback)
            // Пробуем разные пути для поиска общей модели
            const generalModelNames = [
                'neural-network-model.json',
                'neural_model.json'
            ];
            
            for (const modelFileName of generalModelNames) {
                const possibleModelPaths = [
                    path.join(this.modelPath, modelFileName),
                    path.join(process.cwd(), 'models', modelFileName),
                    path.join('./models', modelFileName)
                ];
                
                for (const modelFile of possibleModelPaths) {
                    const weightsFile = modelFile.replace('_model.json', '_weights.json').replace('model.json', 'weights.json');
                    
                    try {
                        const modelExists = await fs.access(modelFile).then(() => true).catch(() => false);
                        const weightsExist = await fs.access(weightsFile).then(() => true).catch(() => false);
                        
                        if (modelExists && weightsExist) {
                            console.log(`📥 Loading general neural model from ${modelFile}...`);
                            
                            // Пытаемся загрузить модель через ModelManager
                            const modelName = path.basename(modelFile, '.json');
                            const model = await ModelManager.loadModel(`neural/${modelName}`);
                            
                            if (model) {
                                this.model = model;
                                console.log('✅ General neural model loaded successfully with ModelManager');
                            } else {
                                console.warn('⚠️ Failed to load neural model with ModelManager, trying legacy format...');
                                
                                // Fallback к старому формату
                                const archRaw = await fs.readFile(modelFile, 'utf-8');
                                let arch = JSON.parse(archRaw);
                                
                                this.model = await tf.models.modelFromJSON(arch);
                                const weightsRaw = await fs.readFile(weightsFile, 'utf-8');
                                const weightsData = JSON.parse(weightsRaw);
                                const specs = weightsData.specs || weightsData.weights || null;
                                
                                if (!specs || !Array.isArray(specs) || specs.length === 0) {
                                    throw new Error('Invalid weights format: specs is not an array');
                                }
                                
                                const tensors = specs.map(s => tf.tensor(s.data, s.shape, s.dtype));
                                this.model.setWeights(tensors);
                                
                                console.log('✅ General neural model loaded with legacy format');
                            }
                            
                            // Гарантируем компиляцию после загрузки
                            if (!this.model.optimizer) {
                                this.model.compile({
                                    optimizer: tf.train.adam(0.001),
                                    loss: 'binaryCrossentropy',
                                    metrics: ['accuracy']
                                });
                            }
                            
                            console.log('✅ Модель загружена (архитектура и веса)');
                            this.modelCreatedAt = new Date().toISOString();
                            return true;
                        }
                    } catch (pathError) {
                        // Пробуем следующий путь
                        continue;
                    }
                }
            }
            
            console.log('📭 Модель не найдена, будет создана при обучении');
            return false;
        } catch (error) {
            console.error('❌ Ошибка загрузки модели:', error);
            return false;
        }
    }

    // Обучение модели на данных конкретной акции (с использованием worker'а)
    async trainForInstrument(figi, days = 180) {
        try {
            if (!this.isBatchTraining) {
                await this.setStatus('training');
                // Обновляем статус обучения
                const TrainingStatusService = getService('TrainingStatusService');
                if (TrainingStatusService) {
                    TrainingStatusService.startTraining('neuralNetwork', 1);
                }
            }

            console.log(`🚀 Starting training for ${figi} in worker...`);

            // Получаем исторические данные
            let candles = await CacheService.getCandles(figi, 'DAY', days);
            let closingPrices = candles.map(c => c.close);

            // Если данных мало — пытаемся расширить окно до 720 дней
            let attemptDays = days;
            while (closingPrices.length < 100 && attemptDays < 720) {
                attemptDays = Math.min(720, attemptDays * 2);
                candles = await CacheService.getCandles(figi, 'DAY', attemptDays);
                closingPrices = candles.map(c => c.close);
                if (closingPrices.length < 100) break;
            }

            // Адаптивные требования к данным
            const minRequired = Math.max(5, Math.min(30, Math.floor(closingPrices.length / 3)));
            if (closingPrices.length < minRequired) {
                console.warn(`Training skipped: insufficient data for ${figi}. Have ${closingPrices.length} candles, need at least ${minRequired}.`);
                if (!this.isBatchTraining) {
                    this.setStatus('off');
                }
                return { history: { acc: [], loss: [] } };
            }

            // Подготавливаем данные для обучения с дивидендами
            const dynamicLookback = Math.max(5, Math.min(60, Math.floor(closingPrices.length / 2)));
            const { features, labels } = await OptimizedDataService.prepareTrainingData(
                candles,
                dynamicLookback,
                5,
                figi // Передаем FIGI для получения дивидендов
            );

            if (features.length === 0) {
                console.warn(`⚠️ No training data prepared for ${figi}`);
                if (!this.isBatchTraining) {
                    this.setStatus('off');
                }
                return { history: { acc: [], loss: [] } };
            }

            // Проверяем консистентность размеров данных
            const featureSize = features[0]?.length;
            if (!featureSize) {
                console.warn(`⚠️ Invalid feature data for ${figi}`);
                if (!this.isBatchTraining) {
                    this.setStatus('off');
                }
                return { history: { acc: [], loss: [] } };
            }

            // Проверяем, что все фичи имеют одинаковый размер
            const inconsistentFeatures = features.filter(f => f.length !== featureSize);
            if (inconsistentFeatures.length > 0) {
                console.warn(`⚠️ Found ${inconsistentFeatures.length} inconsistent features for ${figi}, filtering them out`);
                const consistentIndices = features.map((f, i) => f.length === featureSize ? i : -1).filter(i => i !== -1);
                const filteredFeatures = consistentIndices.map(i => features[i]);
                const filteredLabels = consistentIndices.map(i => labels[i]);
                
                if (filteredFeatures.length < 10) {
                    console.warn(`⚠️ Too few consistent samples (${filteredFeatures.length}) for ${figi}`);
                    if (!this.isBatchTraining) {
                        this.setStatus('off');
                    }
                    return { history: { acc: [], loss: [] } };
                }
                
                console.log(`✅ Using ${filteredFeatures.length} consistent samples for ${figi}`);
                // Обновляем данные
                features.splice(0, features.length, ...filteredFeatures);
                labels.splice(0, labels.length, ...filteredLabels);
            }

            // Получаем настройки обучения
            const nnSettings = await SettingsService.getNeuralNetworkSettings();
            const epochs = nnSettings.nn_epochs || 50;
            const batchSize = nnSettings.nn_batch_size || 16;

            // Настраиваем обработчики событий от worker'а
            const setupWorkerListeners = () => {
                OptimizedTrainingService.on('training_progress', (data) => {
                    if (data.figi === figi) {
                        const progress = {
                            figi,
                            epoch: data.data.epoch,
                            epochs: data.data.epochs,
                            loss: data.data.loss,
                            accuracy: data.data.accuracy
                        };
                        try {
                            const webSocketService = this.getWebSocketService();
                            if (webSocketService) {
                                webSocketService.broadcast({
                                    type: 'training_progress',
                                    data: progress,
                                    timestamp: new Date().toISOString()
                                });
                            }
                        } catch (error) {
                            console.warn('Failed to broadcast training progress:', error.message);
                        }
                        console.log(`Epoch ${progress.epoch}/${progress.epochs}: loss = ${progress.loss}, accuracy = ${progress.accuracy}`);
                    }
                });
            };

            // Настраиваем обработчики
            setupWorkerListeners();

            // Запускаем обучение в worker'е
            const startTime = Date.now();
            const history = await OptimizedTrainingService.trainInstrument(figi, { epochs, batchSize });
            const trainingDuration = Date.now() - startTime;

            // Сохраняем метаданные обучения
            if (history?.history) {
                const finalAcc = history.history.acc?.length > 0 
                    ? history.history.acc[history.history.acc.length - 1] 
                    : null;
                const finalLoss = history.history.loss?.length > 0 
                    ? history.history.loss[history.history.loss.length - 1] 
                    : null;
                
                this.lastTrainingTime = new Date().toISOString();
                this.lastTrainingDuration = Math.round(trainingDuration / 1000); // в секундах
                this.lastTrainingAccuracy = finalAcc;
                this.lastTrainingLoss = finalLoss;
                this.trainingHistory = history.history;
                
                if (finalAcc !== null) {
                    console.log(`✅ Training completed for ${figi}. Final accuracy: ${finalAcc.toFixed(4)}, loss: ${finalLoss?.toFixed(4) || 'N/A'}`);
                } else {
                    console.log(`✅ Training completed for ${figi}.`);
                }
            }

            // Получаем обученную модель из OptimizedTrainingService и сохраняем
            try {
                const trainedModel = await OptimizedTrainingService.getModel(figi);
                if (trainedModel) {
                    this.model = trainedModel;
                    // Сохраняем модель через OptimizedTrainingService (он знает правильный формат)
                    await OptimizedTrainingService.saveModel(figi, trainedModel);
                    // Также сохраняем через наш метод для совместимости
                    await this.saveModel(figi);
                    // Обновляем время создания модели
                    this.modelCreatedAt = new Date().toISOString();
                    console.log(`✅ Model saved successfully for ${figi}`);
                } else {
                    console.warn(`⚠️ Trained model not found for ${figi} after training`);
                }
            } catch (saveError) {
                console.error(`❌ Error saving model for ${figi}:`, saveError.message);
            }

            // Завершаем обучение
            const TrainingStatusService = getService('TrainingStatusService');
            if (TrainingStatusService) {
                TrainingStatusService.completeTraining('neuralNetwork', true);
            }

            try {
                const webSocketService = this.getWebSocketService();
                if (webSocketService) {
                    webSocketService.broadcast({
                        type: 'training_complete',
                        data: { figi },
                        timestamp: new Date().toISOString()
                    });
                }
            } catch (error) {
                console.warn('Failed to broadcast training complete:', error.message);
            }

            return history;

        } catch (error) {
            console.error('❌ Error training model:', error);
            
            // Завершаем обучение с ошибкой
            const TrainingStatusService = getService('TrainingStatusService');
            if (TrainingStatusService) {
                TrainingStatusService.completeTraining('neuralNetwork', false);
            }
            
            // Временный алерт в Telegram
            try {
                await OptimizedTelegramService.sendAlert('NEURAL_NETWORK_TRAINING_ERROR', {
                    error: error.message,
                    context: 'Model Training',
                    timestamp: new Date().toISOString()
                });
            } catch (telegramError) {
                console.error('Failed to send Telegram alert:', telegramError);
            }
            if (!this.isBatchTraining) {
                this.setStatus('off');
            }
            throw error;
        }
    }


    // Пакетное обучение для списка инструментов
    async trainAll(days = null, limit = null) {
        const startedAt = Date.now();
        const results = [];
        this.isBatchTraining = true;
        this.setStatus('training');
        
        // Очищаем предыдущие ошибки обучения
        // Очистка ошибок обучения теперь не нужна в оптимизированном сервисе

        try {
            // Получаем настройки нейросети
            const nnSettings = await SettingsService.getNeuralNetworkSettings();
            const trainingDays = days || nnSettings.nn_training_days || 180;
            const trainingLimit = limit || nnSettings.nn_training_limit || 50;
            
            const instruments = await CacheService.getAllInstruments(trainingLimit);
            for (let index = 0; index < instruments.length; index++) {
                const instrument = instruments[index];
                try {
                    const webSocketService = this.getWebSocketService();
                    if (webSocketService) {
                        webSocketService.broadcast({
                            type: 'training_progress',
                            data: {
                                stage: 'instrument_start',
                                index: index + 1,
                                total: instruments.length,
                                figi: instrument.figi,
                                ticker: instrument.ticker
                            },
                            timestamp: new Date().toISOString()
                        });
                    }
                } catch (error) {
                    console.warn('Failed to broadcast training progress:', error.message);
                }

                try {
                    const history = await this.trainForInstrument(instrument.figi, days);
                    results.push({ figi: instrument.figi, ticker: instrument.ticker, ok: true, epochs: history?.params?.epochs || 50 });
                    
                    // Очищаем ошибки для этого инструмента при успешном обучении
                    // Очистка ошибок обучения теперь не нужна в оптимизированном сервисе
                } catch (error) {
                    console.warn(`Train failed for ${instrument?.ticker}:`, error.message);
                    results.push({ figi: instrument.figi, ticker: instrument.ticker, ok: false, error: error.message });
                    
                    // Ошибки обучения теперь обрабатываются в IntegratedAIService
                }
            }

            WebSocketService.broadcast({
                type: 'training_all_complete',
                data: { count: results.length, durationSec: Math.round((Date.now() - startedAt) / 1000), results },
                timestamp: new Date().toISOString()
            });

            // Сохраняем модель после пакетного обучения
            await this.saveModel();

            // Отправляем одно сводное уведомление в Telegram (если доступно)
            try {
                // Уведомления о обучении теперь отправляются через IntegratedAIService
            } catch (e) {
                console.warn('Failed to send training summary:', e.message);
            }

            return { results };
        } finally {
            this.setStatus('off');
            this.isBatchTraining = false;
        }
    }

    // Предсказание для конкретной акции
    async predict(figi, dividendYield = 0) {
        try {
            // Получаем последние данные
            const candles = await CacheService.getCandles(figi, 'DAY', 100);
            const closingPrices = candles.map(c => c.close);

            if (closingPrices.length < 60) {
                return { score: 0, confidence: 0, reason: 'Insufficient data' };
            }

            // Технические индикаторы для объяснения
            const volumes = candles.map(c => c.volume || 0);
            const highs = candles.map(c => c.high);
            const lows = candles.map(c => c.low);
            const indicators = OptimizedDataService.calculateTechnicalIndicators(
                closingPrices,
                volumes,
                highs,
                lows
            );

            // Используем новый метод с дивидендами
            // prepareTrainingData возвращает массив сэмплов, берем последний как наиболее свежий
            const { features } = await OptimizedDataService.prepareTrainingData(candles, 60, 5, figi);
            if (!features || features.length === 0) {
                console.error(`❌ No features prepared for prediction (FIGI: ${figi})`);
                return { score: 0, confidence: 0, error: 'No features prepared for prediction' };
            }
            const featureVector = features[features.length - 1];

            console.log(`🔍 Prediction input shape: ${featureVector.length} features`);
            
            // Выбираем подходящую модель для предсказания
            // Пытаемся взять актуальную per-FIGI модель из OptimizedTrainingService (соответствует текущему размеру фичей)
            // Если не удалось — не используем устаревшую this.model с другой размерностью, а мягко возвращаем ошибку
            let model = null;
            try {
                const OptimizedTrainingService = getService('OptimizedTrainingService');
                if (OptimizedTrainingService) {
                    const loadedModel = await OptimizedTrainingService.loadModel(figi, featureVector.length);
                    if (loadedModel) {
                        model = loadedModel;
                    }
                }
            } catch (serviceError) {
                console.warn(`⚠️ Failed to load per-FIGI model for prediction via OptimizedTrainingService: ${serviceError.message}`);
            }

            // Если per-FIGI модель не найдена, пытаемся использовать общую модель
            if (!model && this.model) {
                // Проверяем совместимость размерности
                const modelInputShape = this.model.inputs?.[0]?.shape;
                const modelInputSize = Array.isArray(modelInputShape) ? modelInputShape[1] : null;
                
                if (modelInputSize === null || modelInputSize === featureVector.length) {
                    model = this.model;
                    console.log(`📥 Using general model for prediction (FIGI: ${figi})`);
                } else {
                    console.warn(`⚠️ General model input size mismatch: expected ${modelInputSize}, got ${featureVector.length}`);
                    // Пытаемся создать временную модель с правильным размером для предсказания
                    try {
                        console.log(`🔄 Creating temporary model with input size ${featureVector.length} for prediction`);
                        const tempModel = await this.createModel(featureVector.length, 60);
                        model = tempModel;
                        console.log(`✅ Temporary model created for prediction (FIGI: ${figi})`);
                    } catch (tempModelError) {
                        console.warn(`⚠️ Failed to create temporary model: ${tempModelError.message}`);
                    }
                }
            }

            if (!model) {
                console.error(`❌ No compatible model found for prediction (FIGI: ${figi}, features: ${featureVector.length}). Train model first.`);
                return {
                    score: 0,
                    confidence: 0,
                    error: `Model not trained or incompatible for FIGI ${figi}. Please run optimized training first.`
                };
            }

            // Проверяем совместимость размерности только для выбранной модели
            if (model.inputs && model.inputs[0] && model.inputs[0].shape) {
                const expectedShape = model.inputs[0].shape[1];
                if (expectedShape !== featureVector.length) {
                    console.error(`❌ Prediction input shape mismatch: expected ${expectedShape}, got ${featureVector.length}`);
                    return { score: 0, confidence: 0, error: `Input shape mismatch: expected ${expectedShape}, got ${featureVector.length}` };
                }
            } else {
                console.error(`❌ Model inputs not properly initialized`);
                return { score: 0, confidence: 0, error: `Model inputs not properly initialized` };
            }

            // Предсказание
            const inputTensor = tf.tensor2d([featureVector]);
            const prediction = model.predict(inputTensor);
            const score = (await prediction.data())[0];

            inputTensor.dispose();
            prediction.dispose();

            // Учитываем дивидендную доходность (приоритет 1)
            const dividendBonus = dividendYield * 0.1; // Увеличиваем score на 10% от dividend yield
            const finalScore = Math.min(1, score + dividendBonus);

            // Получаем текущую цену
            const currentPrice = closingPrices[closingPrices.length - 1];

            // Генерируем объяснение предсказания
            const explanation = await this.generateExplanation(
                {
                    score: finalScore,
                    confidence: score,
                    recommendation: finalScore > 0.7 ? 'BUY' : finalScore < 0.3 ? 'SELL' : 'HOLD',
                    dividendImpact: dividendBonus
                },
                indicators,
                {
                    candlesCount: candles.length,
                    dividendYield
                }
            );

            return {
                score: finalScore,
                confidence: score,
                dividendImpact: dividendBonus,
                recommendation: finalScore > 0.7 ? 'BUY' : finalScore < 0.3 ? 'SELL' : 'HOLD',
                currentPrice: currentPrice,
                explanation: explanation
            };

        } catch (error) {
            console.error('Error making prediction:', error);
            return { score: 0, confidence: 0, error: error.message };
        }
    }

    // Историческое предсказание из заранее переданных свечей (с использованием worker'а)
    async predictFromCandles(figi, candles, dividendYield = 0) {
        try {
            const closingPrices = candles.map(c => c.close);
            if (closingPrices.length < 60) {
                return { score: 0, confidence: 0, reason: 'Insufficient data' };
            }

            // Используем новый метод с дивидендами
            const { features } = await OptimizedDataService.prepareTrainingData(candles, 60, 5, figi);
            if (!features || features.length === 0) {
                console.error(`❌ No features prepared for PredictFromCandles (FIGI: ${figi})`);
                return { score: 0, confidence: 0, error: 'No features prepared for prediction' };
            }
            const featureVector = features[features.length - 1];

            console.log(`🔍 PredictFromCandles input shape: ${featureVector.length} features`);

            // Используем worker/OptimizedTrainingService для предсказания по последнему сэмплу
            const score = await OptimizedTrainingService.predict(figi, featureVector);

            const dividendBonus = dividendYield * 0.1;
            const finalScore = Math.min(1, score + dividendBonus);
            
            // Генерируем объяснение предсказания
            const volumes = candles.map(c => c.volume || 0);
            const highs = candles.map(c => c.high);
            const lows = candles.map(c => c.low);
            const indicators = OptimizedDataService.calculateTechnicalIndicators(
                closingPrices,
                volumes,
                highs,
                lows
            );
            const explanation = await this.generateExplanation(
                {
                    score: finalScore,
                    confidence: score,
                    recommendation: finalScore > 0.7 ? 'BUY' : finalScore < 0.3 ? 'SELL' : 'HOLD',
                    dividendImpact: dividendBonus
                },
                indicators,
                {
                    candlesCount: candles.length,
                    dividendYield
                }
            );
            
            return {
                score: finalScore,
                confidence: score,
                dividendImpact: dividendBonus,
                recommendation: finalScore > 0.7 ? 'BUY' : finalScore < 0.3 ? 'SELL' : 'HOLD',
                explanation: explanation
            };
        } catch (error) {
            console.error('❌ Error in predictFromCandles:', error);
            return { score: 0, confidence: 0, error: error.message };
        }
    }

    // Анализ всего портфеля
    async analyzePortfolio(portfolioItems, totalBudget = null) {
        if (!this.isActive) {
            throw new Error('Neural network is not active');
        }

        // Получаем настройки портфеля
        const portfolioSettings = await SettingsService.getPortfolioSettings();
        const budget = totalBudget || portfolioSettings.user_max_portfolio_budget || 1000000;
        const maxPrice = portfolioSettings.max_stock_price || Infinity;
        const minPrice = portfolioSettings.min_stock_price || 0;

        const analysis = {
            buyRecommendations: [],
            sellRecommendations: [],
            portfolioValue: 0,
            availableBudget: budget
        };

        // Анализ акций для покупки
        const instruments = await CacheService.getAllInstruments();
        console.log(`📊 Found ${instruments.length} instruments for analysis`);

        console.log(`💰 Price range: ${minPrice} - ${maxPrice === Infinity ? 'unlimited' : maxPrice}`);

        let processedCount = 0;
        let validPredictions = 0;

        for (const instrument of instruments.slice(0, 50)) { // Ограничиваем для теста
            try {
                processedCount++;
                
                // Фильтрация по ценовому диапазону
                const candidatePrice = typeof instrument.lastPrice === 'number'
                    ? instrument.lastPrice
                    : await this.getCurrentPrice(instrument.figi);

                if ((minPrice && candidatePrice < minPrice) || (isFinite(maxPrice) && candidatePrice > maxPrice)) {
                    console.log(`⏭️ Skipped ${instrument.ticker}: price ${candidatePrice} outside range`);
                    continue;
                }

                const prediction = await this.predict(instrument.figi, instrument.dividendYield);
                console.log(`🔍 ${instrument.ticker}: score=${prediction.score.toFixed(3)}, recommendation=${prediction.recommendation}`);

                // Добавляем ВСЕ рекомендации с уверенностью > 0% для фронтенда
                if (prediction.score > 0) {
                    validPredictions++;
                    // Проверяем бюджет
                    const currentPrice = candidatePrice;
                    const affordableQuantity = Math.floor(analysis.availableBudget / Math.max(currentPrice, 1));

                    if (affordableQuantity > 0) {
                        analysis.buyRecommendations.push({
                            instrument,
                            prediction,
                            currentPrice,
                            suggestedQuantity: affordableQuantity,
                            estimatedCost: affordableQuantity * currentPrice
                        });
                        console.log(`✅ Added BUY recommendation for ${instrument.ticker}: ${prediction.score.toFixed(3)}`);
                    } else {
                        console.log(`💰 Skipped ${instrument.ticker}: no budget (need ${currentPrice}, have ${analysis.availableBudget})`);
                    }
                } else {
                    console.log(`❌ Skipped ${instrument.ticker}: score too low (${prediction.score.toFixed(3)})`);
                }
            } catch (error) {
                console.warn(`Could not analyze ${instrument.ticker}:`, error.message);
            }
        }

        console.log(`📈 Analysis complete: processed ${processedCount}, valid predictions ${validPredictions}, buy recommendations ${analysis.buyRecommendations.length}`);

        // Анализ текущего портфеля на продажу
        console.log(`💼 Analyzing ${portfolioItems.length} portfolio items for sell recommendations`);
        
        for (const item of portfolioItems) {
            try {
                const prediction = await this.predict(item.figi);
                console.log(`🔍 Portfolio ${item.ticker}: score=${prediction.score.toFixed(3)}, recommendation=${prediction.recommendation}`);

                // SELL рекомендации: score < 0.3 (как в других местах кода)
                // Это означает, что модель предсказывает падение цены
                if (prediction.score < 0.3) {
                    analysis.sellRecommendations.push({
                        item,
                        prediction,
                        reason: prediction.score < 0.2 ? 'Low prediction score (strong sell signal)' : 'Moderate prediction score (sell signal)'
                    });
                    console.log(`✅ Added SELL recommendation for ${item.ticker}: score=${prediction.score.toFixed(3)} (${prediction.recommendation})`);
                } else {
                    console.log(`⏭️ Skipped ${item.ticker}: score=${prediction.score.toFixed(3)} (${prediction.recommendation}) - no sell signal`);
                }

                // Расчет текущей стоимости портфеля
                const currentPrice = await this.getCurrentPrice(item.figi);
                analysis.portfolioValue += currentPrice * item.quantity;

            } catch (error) {
                console.warn(`Could not analyze portfolio item ${item.ticker}:`, error.message);
            }
        }

        console.log(`📉 Sell recommendations: ${analysis.sellRecommendations.length}`);

        analysis.availableBudget = totalBudget - analysis.portfolioValue;

        // Сортируем рекомендации по уверенности (от высокой к низкой)
        analysis.buyRecommendations.sort((a, b) => b.prediction.score - a.prediction.score);
        analysis.sellRecommendations.sort((a, b) => a.prediction.score - b.prediction.score);

        return analysis;
    }

    // Вспомогательные методы
    async getCurrentPrice(figi) {
        // Сначала пробуем взять цену из кеша инструментов
        try {
            const instrument = await CacheService.getInstrument(figi);
            if (instrument && typeof instrument.lastPrice === 'number') {
                return instrument.lastPrice;
            }
        } catch (e) {}

        // Фолбек к последней свече
        const candles = await CacheService.getCandles(figi, 'DAY', 1);
        if (!candles || candles.length === 0) {
            return 0;
        }
        return candles[candles.length - 1].close;
    }

    getStatus() {
        return {
            status: this.status,
            isTraining: this.isTraining,
            isActive: this.isActive,
            hasModel: !!this.model
        };
    }

    // Получить метрики нейросети
    async getMetrics() {
        try {
            const status = this.getStatus();
            
            return {
                status: status,
                modelInfo: this.model ? {
                    inputShape: this.model.inputShape,
                    outputShape: this.model.outputShape,
                    totalParams: this.model.countParams(),
                    trainableParams: this.model.countParams(),
                    layers: this.model.layers.length
                } : null,
                trainingHistory: this.trainingHistory || [],
                lastTraining: this.lastTrainingTime ? {
                    time: this.lastTrainingTime,
                    duration: this.lastTrainingDuration,
                    accuracy: this.lastTrainingAccuracy,
                    loss: this.lastTrainingLoss
                } : null,
                performance: {
                    totalPredictions: this.totalPredictions || 0,
                    successfulPredictions: this.successfulPredictions || 0,
                    accuracy: this.totalPredictions > 0 ? (this.successfulPredictions / this.totalPredictions) * 100 : 0
                }
            };
        } catch (error) {
            console.error('Error getting neural network metrics:', error);
            throw error;
        }
    }

    // Получить важность признаков
    async getFeatureImportance(figi = null) {
        try {
            if (!this.model) {
                return {
                    figi: figi || 'all',
                    features: [],
                    totalFeatures: 0,
                    message: 'Модель не загружена',
                    generatedAt: new Date().toISOString()
                };
            }

            // Получаем реальные данные из кеша для анализа
            const candles = await CacheService.getCandles(figi, 'DAY', 100);
            if (!candles || candles.length === 0) {
                return {
                    figi: figi || 'all',
                    features: [],
                    totalFeatures: 0,
                    message: 'Нет данных для анализа',
                    generatedAt: new Date().toISOString()
                };
            }

            // Вычисляем технические индикаторы
            const prices = candles.map(c => c.close);
            const volumes = candles.map(c => c.volume || 0);
            const highs = candles.map(c => c.high);
            const lows = candles.map(c => c.low);
            const technicalData = OptimizedDataService.calculateTechnicalIndicators(prices, volumes, highs, lows);
            
            // Анализируем корреляцию с ценовыми движениями
            const features = [];
            const priceChanges = candles.slice(1).map((candle, i) => 
                (candle.close - candles[i].close) / candles[i].close
            );

            // RSI важность
            if (technicalData.rsi) {
                const rsiCorrelation = this.calculateCorrelation(technicalData.rsi.slice(1), priceChanges);
                features.push({
                    name: 'RSI',
                    importance: Math.abs(rsiCorrelation),
                    description: 'Relative Strength Index',
                    correlation: rsiCorrelation
                });
            }

            // MACD важность
            if (technicalData.macd) {
                const macdCorrelation = this.calculateCorrelation(technicalData.macd.slice(1), priceChanges);
                features.push({
                    name: 'MACD',
                    importance: Math.abs(macdCorrelation),
                    description: 'Moving Average Convergence Divergence',
                    correlation: macdCorrelation
                });
            }

            // Bollinger Bands важность
            if (technicalData.bb_upper && technicalData.bb_lower) {
                const bbPosition = technicalData.bb_upper.map((upper, i) => 
                    (candles[i + 1].close - technicalData.bb_lower[i]) / (upper - technicalData.bb_lower[i])
                );
                const bbCorrelation = this.calculateCorrelation(bbPosition.slice(1), priceChanges);
                features.push({
                    name: 'BB_Position',
                    importance: Math.abs(bbCorrelation),
                    description: 'Bollinger Bands Position',
                    correlation: bbCorrelation
                });
            }

            // Volume важность
            if (technicalData.volume) {
                const volumeCorrelation = this.calculateCorrelation(technicalData.volume.slice(1), priceChanges);
                features.push({
                    name: 'Volume',
                    importance: Math.abs(volumeCorrelation),
                    description: 'Trading Volume',
                    correlation: volumeCorrelation
                });
            }

            // SMA важность
            if (technicalData.sma_20) {
                const smaCorrelation = this.calculateCorrelation(technicalData.sma_20.slice(1), priceChanges);
                features.push({
                    name: 'SMA_20',
                    importance: Math.abs(smaCorrelation),
                    description: 'Simple Moving Average 20',
                    correlation: smaCorrelation
                });
            }

            // EMA важность
            if (technicalData.ema_12) {
                const emaCorrelation = this.calculateCorrelation(technicalData.ema_12.slice(1), priceChanges);
                features.push({
                    name: 'EMA_12',
                    importance: Math.abs(emaCorrelation),
                    description: 'Exponential Moving Average 12',
                    correlation: emaCorrelation
                });
            }

            // Сортируем по важности
            features.sort((a, b) => b.importance - a.importance);

            return {
                figi: figi || 'all',
                features: features,
                totalFeatures: features.length,
                topFeature: features[0] || null,
                dataPoints: candles.length,
                generatedAt: new Date().toISOString()
            };

        } catch (error) {
            console.error('Error getting feature importance:', error);
            throw error;
        }
    }

    // Вспомогательный метод для вычисления корреляции
    calculateCorrelation(x, y) {
        if (x.length !== y.length || x.length === 0) return 0;
        
        const n = x.length;
        const sumX = x.reduce((a, b) => a + b, 0);
        const sumY = y.reduce((a, b) => a + b, 0);
        const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
        const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
        const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);
        
        const numerator = n * sumXY - sumX * sumY;
        const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
        
        return denominator === 0 ? 0 : numerator / denominator;
    }
    async setStatus(status) {
        // Предотвращаем циклические обновления
        if (this.status === status) {
            return;
        }

        this.oldStatus = this.status;
        this.status = status;
        this.isTraining = status === 'training';
        this.isActive = status === 'active';

        console.log(`🧠 Neural network status changed to: ${status}`);

        // Отправляем уведомление через WebSocket
        try {
            const webSocketService = this.getWebSocketService();
            if (webSocketService) {
                webSocketService.broadcastStatus();
            }
        } catch (error) {
            console.warn('Failed to broadcast neural network status:', error.message);
        }

        // Уведомления о смене статуса теперь обрабатываются в IntegratedAIService

        // Запускаем/останавливаем периодический анализ
        if (status === 'active') {
            this.startPeriodicAnalysis();
        } else {
            this.stopPeriodicAnalysis();
        }
    }

    // Запуск периодического анализа
    startPeriodicAnalysis() {
        // Анализ каждые 30 минут
        this.analysisInterval = setInterval(async () => {
            try {
                await this.performMarketAnalysis();
            } catch (error) {
                console.error('Error in periodic analysis:', error);
                WebSocketService.broadcastError(error);
                // Ошибки теперь обрабатываются в IntegratedAIService
            }
        }, 30 * 60 * 1000); // 30 минут

        // Первый анализ сразу после запуска
        setTimeout(() => {
            this.performMarketAnalysis();
        }, 5000);
    }

    // Остановка периодического анализа
    stopPeriodicAnalysis() {
        if (this.analysisInterval) {
            clearInterval(this.analysisInterval);
            this.analysisInterval = null;
        }
    }

    // Анализ рынка и портфеля
    async performMarketAnalysis() {
        if (!this.isActive) {
            console.log('❌ Market analysis skipped: neural network is not active');
            return;
        }

        // Попытка загрузить модель, если она не загружена
        if (!this.model) {
            console.log('📥 Model not loaded, attempting to load general model...');
            const loaded = await this.loadModel();
            if (!loaded) {
                console.log('❌ Market analysis skipped: no trained model available');
                console.log('💡 Tip: Train a model first using the TrainingDebug page or API');
                // Уведомления о невозможности анализа теперь обрабатываются в IntegratedAIService
                return;
            } else {
                console.log('✅ Model loaded successfully, proceeding with analysis');
            }
        }

        // Устанавливаем флаг анализа
        const SchedulerService = (await import('./SchedulerService.js')).default;
        SchedulerService.isAnalyzing = true;

        console.log('🔍 Starting market analysis...');

        try {
            // Получаем портфель в зависимости от текущего режима торговли
            const TradingEngine = (await import('./TradingEngine.js')).default;
            const TradingModeManager = (await import('./TradingModeManager.js')).default;
            
            const currentMode = TradingModeManager.getCurrentMode();
            const mode = currentMode.mode || currentMode;
            console.log(`📊 Current trading mode: ${mode}`);
            
            // Получаем портфель для текущего режима
            const portfolio = await TradingEngine.getPortfolioValue();
            console.log(`📊 Portfolio mode: ${portfolio.mode || mode}`);
            
            // Преобразуем портфель в формат для анализа
            const CacheService = (await import('./CacheService.js')).default;
            let portfolioItems = [];
            
            // Обрабатываем позиции из портфеля
            // Виртуальный портфель: positions = {figi: quantity}
            // Реальный портфель: positions = [{figi, ticker, quantity, ...}]
            const positions = portfolio.positions || {};
            
            if (Array.isArray(positions)) {
                // Реальный портфель (массив объектов)
                console.log(`📊 Real portfolio: ${positions.length} positions`);
                for (const position of positions) {
                    if (position.quantity > 0 && position.figi) {
                        try {
                            const instrument = await CacheService.getInstrument(position.figi);
                            if (instrument) {
                                portfolioItems.push({
                                    figi: position.figi,
                                    ticker: position.ticker || instrument.ticker,
                                    name: instrument.name,
                                    quantity: position.quantity,
                                    averagePrice: position.averagePositionPrice?.value || 0
                                });
                            }
                        } catch (error) {
                            console.warn(`Could not get instrument info for ${position.figi}:`, error.message);
                        }
                    }
                }
            } else if (typeof positions === 'object' && !Array.isArray(positions)) {
                // Виртуальный портфель (объект {figi: quantity})
                const positionsCount = Object.keys(positions).length;
                console.log(`📊 Virtual portfolio: ${positionsCount} positions`);
                for (const [figi, quantity] of Object.entries(positions)) {
                    if (quantity > 0) {
                        try {
                            const instrument = await CacheService.getInstrument(figi);
                            if (instrument) {
                                portfolioItems.push({
                                    figi: instrument.figi,
                                    ticker: instrument.ticker,
                                    name: instrument.name,
                                    quantity: quantity,
                                    averagePrice: 0
                                });
                            }
                        } catch (error) {
                            console.warn(`Could not get instrument info for ${figi}:`, error.message);
                        }
                    }
                }
            }
            
            console.log(`📊 Portfolio items for analysis: ${portfolioItems.length} (mode: ${mode})`);
            
            // Если портфель пустой, пробуем получить из БД (для обратной совместимости)
            if (portfolioItems.length === 0) {
                console.log('📊 Portfolio is empty, checking DB PortfolioItem table...');
                const PortfolioItem = (await import('../models/PortfolioItem.js')).default;
                const dbItems = await PortfolioItem.findAll();
                
                if (dbItems.length > 0) {
                    portfolioItems = dbItems.map(item => ({
                        figi: item.figi,
                        ticker: item.ticker,
                        name: item.name,
                        quantity: item.quantity,
                        averagePrice: item.averagePrice || 0
                    }));
                    console.log(`📊 Found ${portfolioItems.length} items in DB PortfolioItem table`);
                }
            }

            // Получаем настройки портфеля
            const portfolioSettings = await SettingsService.getPortfolioSettings();
            const totalBudget = portfolioSettings.user_max_portfolio_budget || 1000000;

            const analysis = await this.analyzePortfolio(portfolioItems, totalBudget);

            console.log(`📈 Buy recommendations: ${analysis.buyRecommendations?.length || 0}`);
            console.log(`📉 Sell recommendations: ${analysis.sellRecommendations?.length || 0}`);

            // Шлём статус анализа (старт)
            try {
                const webSocketService = this.getWebSocketService();
                if (webSocketService && typeof webSocketService.broadcast === 'function') {
                    webSocketService.broadcast({
                        type: 'analysis_status_update',
                        data: {
                            isAnalyzing: true,
                            lastRunAt: new Date().toISOString()
                        },
                        timestamp: new Date().toISOString()
                    });
                }
            } catch (wsError) {
                console.warn('Failed to broadcast analysis status (start):', wsError.message);
            }

            // Сохраняем рекомендации в базу данных
            await this.saveRecommendationsToDatabase(analysis.buyRecommendations || [], analysis.sellRecommendations || []);

            // Отправляем только СИЛЬНЫЕ рекомендации в Telegram
            let telegramSent = 0;
            
            // Сильные рекомендации теперь отправляются через IntegratedAIService
            for (const recommendation of analysis.buyRecommendations || []) {
                if (recommendation.prediction.score > 0.8) {
                    await OptimizedTelegramService.addStrongRecommendation({
                        figi: recommendation.instrument?.figi,
                        recommendation: 'BUY',
                        confidence: recommendation.prediction.score,
                        score: recommendation.prediction.score
                    });
                }
            }

            for (const recommendation of analysis.sellRecommendations || []) {
                if (recommendation.prediction.score < 0.2) {
                    await OptimizedTelegramService.addStrongRecommendation({
                        figi: recommendation.item?.figi,
                        recommendation: 'SELL',
                        confidence: 1 - recommendation.prediction.score,
                        score: recommendation.prediction.score
                    });
                }
            }

            // Отправляем анализ через WebSocket
            try {
                const webSocketService = this.getWebSocketService();
                if (webSocketService && typeof webSocketService.broadcast === 'function') {
                    webSocketService.broadcast({
                        type: 'analysis_update',
                        data: analysis,
                        timestamp: new Date().toISOString()
                    });
                }
            } catch (wsError) {
                console.warn('Failed to broadcast market analysis via WebSocket:', wsError.message);
            }

            console.log(`✅ Market analysis completed. Telegram notifications sent: ${telegramSent}`);

        } catch (error) {
            console.error('❌ Error performing market analysis:', error);
            // Временный алерт в Telegram
            try {
                await OptimizedTelegramService.sendAlert('NEURAL_NETWORK_ANALYSIS_ERROR', {
                    error: error.message,
                    context: 'Market Analysis',
                    timestamp: new Date().toISOString()
                });
            } catch (telegramError) {
                console.error('Failed to send Telegram alert:', telegramError);
            }
            // Ошибки теперь обрабатываются в IntegratedAIService
            throw error;
        } finally {
            // Сбрасываем флаг анализа
            const SchedulerService = (await import('./SchedulerService.js')).default;
            SchedulerService.isAnalyzing = false;

            // Шлём статус анализа (завершён)
            try {
                const webSocketService = this.getWebSocketService();
                if (webSocketService && typeof webSocketService.broadcast === 'function') {
                    webSocketService.broadcast({
                        type: 'analysis_status_update',
                        data: {
                            isAnalyzing: false,
                            lastRunAt: new Date().toISOString()
                        },
                        timestamp: new Date().toISOString()
                    });
                }
            } catch (wsError) {
                console.warn('Failed to broadcast analysis status (finish):', wsError.message);
            }
        }
    }

    // Сохранение рекомендаций в базу данных
    async saveRecommendationsToDatabase(buyRecommendations, sellRecommendations) {
        try {
            const Recommendation = (await import('../models/Recommendation.js')).default;
            
            // Сохраняем BUY рекомендации
            for (const rec of buyRecommendations) {
                const recommendationData = {
                    figi: rec.instrument.figi,
                    ticker: rec.instrument.ticker,
                    name: rec.instrument.name,
                    recommendation: 'BUY',
                    confidence: rec.prediction.score,
                    score: rec.prediction.score,
                    explanation: rec.prediction.explanation || {
                        summary: 'Анализ на основе нейросети',
                        keyFactors: ['Технический анализ', 'Фундаментальный анализ'],
                        risks: ['Рыночная волатильность'],
                        opportunities: ['Потенциальный рост'],
                        timeframe: '1-3 месяца'
                    },
                    modelVersion: '1.0',
                    priceAtAnalysis: rec.currentPrice,
                    targetPrice: rec.currentPrice * 1.1, // +10% как цель
                    stopLoss: rec.currentPrice * 0.9, // -10% как стоп-лосс
                    takeProfit: rec.currentPrice * 1.2, // +20% как тейк-профит
                    sector: rec.instrument.sector || 'Unknown',
                    marketCap: rec.instrument.marketCap || 'Unknown',
                    isActive: true
                };

                // Ищем существующую рекомендацию
                const existing = await Recommendation.findOne({
                    where: {
                        figi: rec.instrument.figi,
                        isActive: true
                    }
                });

                if (existing) {
                    // Обновляем существующую
                    await existing.update(recommendationData);
                    console.log(`🔄 Updated BUY recommendation for ${rec.instrument.ticker}`);
                } else {
                    // Создаем новую
                    await Recommendation.create(recommendationData);
                    console.log(`✅ Created BUY recommendation for ${rec.instrument.ticker}`);
                }
            }

            // Сохраняем SELL рекомендации
            for (const rec of sellRecommendations) {
                const recommendationData = {
                    figi: rec.instrument.figi,
                    ticker: rec.instrument.ticker,
                    name: rec.instrument.name,
                    recommendation: 'SELL',
                    confidence: 1 - rec.prediction.score, // Инвертируем для SELL
                    score: rec.prediction.score,
                    explanation: rec.prediction.explanation || {
                        summary: 'Анализ на основе нейросети',
                        keyFactors: ['Технический анализ', 'Фундаментальный анализ'],
                        risks: ['Потенциальное падение'],
                        opportunities: ['Защита капитала'],
                        timeframe: '1-3 месяца'
                    },
                    modelVersion: '1.0',
                    priceAtAnalysis: rec.currentPrice,
                    targetPrice: rec.currentPrice * 0.9, // -10% как цель
                    stopLoss: rec.currentPrice * 1.1, // +10% как стоп-лосс
                    takeProfit: rec.currentPrice * 0.8, // -20% как тейк-профит
                    sector: rec.instrument.sector || 'Unknown',
                    marketCap: rec.instrument.marketCap || 'Unknown',
                    isActive: true
                };

                // Ищем существующую рекомендацию
                const existing = await Recommendation.findOne({
                    where: {
                        figi: rec.instrument.figi,
                        isActive: true
                    }
                });

                if (existing) {
                    // Обновляем существующую
                    await existing.update(recommendationData);
                    console.log(`🔄 Updated SELL recommendation for ${rec.instrument.ticker}`);
                } else {
                    // Создаем новую
                    await Recommendation.create(recommendationData);
                    console.log(`✅ Created SELL recommendation for ${rec.instrument.ticker}`);
                }
            }

            console.log(`💾 Saved ${buyRecommendations.length} BUY and ${sellRecommendations.length} SELL recommendations to database`);

            // Отправляем уведомление через WebSocket о новых рекомендациях
            try {
                const webSocketService = this.getWebSocketService();
                if (webSocketService && typeof webSocketService.broadcast === 'function') {
                    webSocketService.broadcast({
                        type: 'recommendations_updated',
                        data: {
                            buyCount: buyRecommendations.length,
                            sellCount: sellRecommendations.length,
                            timestamp: new Date().toISOString()
                        }
                    });
                }
            } catch (wsError) {
                console.warn('Failed to broadcast recommendations update via WebSocket:', wsError.message);
            }

        } catch (error) {
            console.error('❌ Error saving recommendations to database:', error);
        }
    }

    // Инициализация при старте сервера
    async initialize() {
        console.log('🧠 Инициализация нейросети...');
        const loaded = await this.loadModel();
        if (loaded) {
            console.log('✅ Нейросеть готова к работе');
            console.log(`🧠 Model status: ${this.model ? 'loaded' : 'not loaded'}`);
            console.log(`🧠 Model inputs: ${this.model?.inputs?.length || 0}`);
            if (this.model?.inputs?.[0]?.shape) {
                console.log(`🧠 Input shape: ${JSON.stringify(this.model.inputs[0].shape)}`);
            }
            // Устанавливаем время создания модели, если еще не установлено
            if (!this.modelCreatedAt) {
                this.modelCreatedAt = new Date().toISOString();
            }
        } else {
            console.log('⚠️ Модель не найдена, будет создана при первом обучении');
            // Не создаем модель заранее, так как размер входных данных зависит от prepareTrainingData
            // Модель будет создана автоматически при обучении с правильным размером входных данных
            console.log('📝 Модель будет создана при обучении с адаптивным размером входных данных');
        }
    }

    // Возвращает статус модели для системного эндпоинта
    getModelStatus() {
        try {
            const isLoaded = !!this.model;
            const isTraining = !!this.isTraining || this.status === 'training';
            const modelInputs = this.model?.inputs?.length || 0;
            
            // Вычисляем возраст модели (в днях)
            let modelAge = null;
            if (this.modelCreatedAt) {
                const ageMs = Date.now() - new Date(this.modelCreatedAt).getTime();
                modelAge = Math.floor(ageMs / (1000 * 60 * 60 * 24));
            } else if (this.lastTrainingTime) {
                // Если нет времени создания, используем время последнего обучения
                const ageMs = Date.now() - new Date(this.lastTrainingTime).getTime();
                modelAge = Math.floor(ageMs / (1000 * 60 * 60 * 24));
            }
            
            // Вычисляем accuracy из метрик производительности или последнего обучения
            let accuracy = null;
            if (this.totalPredictions > 0) {
                accuracy = this.successfulPredictions / this.totalPredictions;
            } else if (this.lastTrainingAccuracy !== null) {
                accuracy = this.lastTrainingAccuracy;
            }
            
            return {
                isLoaded,
                isTraining,
                isActive: this.isActive,
                modelInputs,
                status: this.status || (isLoaded ? 'ready' : 'not_loaded'),
                accuracy: accuracy,
                lastTraining: this.lastTrainingTime,
                modelAge: modelAge,
                lastTrainingAccuracy: this.lastTrainingAccuracy,
                lastTrainingLoss: this.lastTrainingLoss,
                totalPredictions: this.totalPredictions || 0,
                successfulPredictions: this.successfulPredictions || 0
            };
        } catch (error) {
            console.error('Error in getModelStatus:', error);
            return {
                isLoaded: false,
                isTraining: false,
                isActive: false,
                modelInputs: 0,
                status: 'unknown',
                accuracy: null,
                lastTraining: null,
                modelAge: null
            };
        }
    }

    /**
     * Генерация объяснения предсказания
     */
    async generateExplanation(predictionData, technicalData, marketData) {
        try {
            const { score, confidence, recommendation } = predictionData;
            
            const explanation = {
                summary: this.getRecommendationSummary(recommendation, score),
                confidence: this.getConfidenceLevel(confidence),
                factors: this.analyzeFactors(technicalData, marketData),
                risk: this.assessRisk(score, confidence),
                timestamp: new Date().toISOString()
            };

            return explanation;
        } catch (error) {
            console.error('Error generating explanation:', error);
            return {
                summary: 'Анализ недоступен',
                confidence: 'Низкая',
                factors: [],
                risk: 'Неизвестен',
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Получить краткое описание рекомендации
     */
    getRecommendationSummary(recommendation, score) {
        if (score >= 0.7) {
            return 'Сильная рекомендация к покупке';
        } else if (score >= 0.5) {
            return 'Умеренная рекомендация к покупке';
        } else if (score >= 0.3) {
            return 'Нейтральная рекомендация';
        } else {
            return 'Рекомендация к продаже';
        }
    }

    /**
     * Получить уровень уверенности
     */
    getConfidenceLevel(confidence) {
        if (confidence >= 0.8) return 'Высокая';
        if (confidence >= 0.6) return 'Средняя';
        if (confidence >= 0.4) return 'Низкая';
        return 'Очень низкая';
    }

    /**
     * Анализ факторов
     */
    analyzeFactors(technicalData, marketData) {
        const factors = [];
        
        if (technicalData) {
            factors.push('Технический анализ');
        }
        
        if (marketData) {
            factors.push('Рыночные данные');
        }
        
        factors.push('Нейросетевая модель');
        
        return factors;
    }

    /**
     * Оценка риска
     */
    assessRisk(score, confidence) {
        if (confidence < 0.5) return 'Высокий';
        if (confidence < 0.7) return 'Средний';
        return 'Низкий';
    }

    /**
     * Остановить обучение
     */
    async stopTraining(figi) {
        try {
            console.log(`🛑 Stopping training for ${figi || 'all instruments'}`);
            
            this.isTraining = false;
            this.isBatchTraining = false;
            this.status = 'active';
            
            // Остановить интервал анализа если он запущен
            if (this.analysisInterval) {
                clearInterval(this.analysisInterval);
                this.analysisInterval = null;
            }
            
            // Уведомить через WebSocket
            WebSocketService.broadcast({
                type: 'training_stopped',
                figi: figi,
                timestamp: new Date().toISOString()
            });
            
            return {
                success: true,
                message: 'Training stopped successfully',
                figi: figi,
                status: this.status
            };
        } catch (error) {
            console.error('❌ Error stopping training:', error);
            throw error;
        }
    }

    /**
     * Остановка сервиса
     */
    async stop() {
        try {
            console.log('🛑 Stopping Neural Network Service...');
            
            // Очищаем интервал анализа
            if (this.analysisInterval) {
                clearInterval(this.analysisInterval);
                this.analysisInterval = null;
            }
            
            // Сбрасываем флаги
            this.isTraining = false;
            this.isBatchTraining = false;
            this.status = 'idle';
            
            console.log('✅ Neural Network Service stopped');
        } catch (error) {
            console.error('❌ Error stopping Neural Network Service:', error);
            throw error;
        }
    }
}

export default new NeuralNetworkService();