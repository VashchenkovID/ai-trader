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
import ServiceManager from './ServiceManager.js';

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
        this.isStopping = false; // Флаг остановки сервиса
        // Метаданные обучения
        this.lastTrainingTime = null;
        this.lastTrainingDuration = null;
        this.lastTrainingAccuracy = null;
        this.lastTrainingLoss = null;
        this.trainingHistory = [];
        this.totalPredictions = 0;
        this.successfulPredictions = 0;
        this.modelCreatedAt = null; // Время создания/загрузки модели
        // Управление worker процессами для анализа
        this.analysisWorkers = new Set();
        this.isAnalyzing = false; // Флаг выполнения анализа
    }

    /**
     * Устанавливает WebSocketService (передается извне)
     */
    setWebSocketService(webSocketService) {
        this.webSocketService = webSocketService;
    }

    /**
     * Получает WebSocketService
     */
    getWebSocketService() {
        if (!this.webSocketService) {
            // Получаем уже инициализированный экземпляр из глобального ServiceManager
            this.webSocketService = ServiceManager.getServiceSafe('WebSocketService');
            if (!this.webSocketService) {
                // Не логируем предупреждение - это нормальная ситуация, если WebSocket не инициализирован
                return null;
            }
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
                if (!modelData || !modelData.architecture) {
                    console.error('❌ Ошибка: modelData.architecture отсутствует при сохранении общей модели');
                    return;
                }
                
                await fs.writeFile(this.modelFile, typeof modelData.architecture === 'string' 
                    ? modelData.architecture 
                    : JSON.stringify(modelData.architecture, null, 2));

                await fs.writeFile(this.weightsFile, JSON.stringify(modelData.weights, null, 2));

                console.log('✅ Общая модель сохранена (архитектура и веса)');

                // Дополнительно сохраняем через ModelManager в новом формате,
                // чтобы последующие загрузки не падали на fallback и не логировали warning
                try {
                    if (this.model) {
                        const pathModule = await import('path');
                        const modelName = pathModule.basename(this.modelFile, '.json');
                        await ModelManager.saveModel(this.model, `neural/${modelName}`);
                        console.log(`✅ Общая модель также сохранена через ModelManager`);
                    } else {
                        console.warn('⚠️ this.model не установлена, пропускаем сохранение через ModelManager');
                    }
                } catch (modelManagerError) {
                    console.warn(`⚠️ Failed to save general neural model via ModelManager: ${modelManagerError.message}`);
                    console.warn(`⚠️ Stack: ${modelManagerError.stack}`);
                }
            }
        } catch (error) {
            console.error('❌ Ошибка сохранения модели:', error);
        }
    }

    // Загрузка модели из файлов (без tfjs-node): архитектура + веса
    async loadModel(figi = null) {
        try {
            // Проверяем, загружена ли уже модель (если не указан конкретный FIGI)
            if (!figi && this.model) {
                console.log('ℹ️ Neural network model already loaded, skipping reload');
                return true;
            }

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
            
            return false;
        } catch (error) {
            console.error('❌ Ошибка загрузки модели:', error);
            return false;
        }
    }

    /**
     * Быстрое обучение модели с оптимизированными параметрами
     * Используется для периодического обновления моделей в течение дня
     */
    async trainQuick(figi, options = {}) {
        const {
            epochs = 15, // Меньше эпох для скорости
            dataDays = 60, // Меньше данных (последние 60 дней)
            skipValidation = true // Пропускаем валидацию
        } = options;

        try {
            
            // Используем OptimizedTrainingService для быстрого обучения
            const OptimizedTrainingService = (await import('./OptimizedTrainingService.js')).default;
            
            const result = await OptimizedTrainingService.trainInstrument(figi, {
                epochs,
                days: dataDays,
                enableValidation: !skipValidation,
                useWorker: false, // Локальное обучение быстрее для малых батчей
                batchSize: 32
            });

            console.log(`✅ Quick training completed for ${figi}`);
            return result;
        } catch (error) {
            console.error(`❌ Quick training failed for ${figi}:`, error.message);
            throw error;
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


            // Получаем исторические данные (skipUpdate = true - режим обучения, не делаем запросы к API)
            let candles = await CacheService.getCandles(figi, 'DAY', days, true);
            let closingPrices = candles.map(c => c.close);

            // Если данных мало — пытаемся расширить окно до 720 дней (только из кеша)
            let attemptDays = days;
            while (closingPrices.length < 100 && attemptDays < 720) {
                attemptDays = Math.min(720, attemptDays * 2);
                candles = await CacheService.getCandles(figi, 'DAY', attemptDays, true);
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
                    // Сохраняем per-FIGI модель через OptimizedTrainingService (он знает правильный формат)
                    await OptimizedTrainingService.saveModel(figi, trainedModel);
                    // Также сохраняем через наш метод для совместимости
                    await this.saveModel(figi);
                    
                    // Сохраняем также как общую модель (если это единственное обучение или лучшая модель)
                    // Это важно для случаев, когда обучается только один инструмент
                    await this.saveModel(); // Сохраняет общую модель (без параметра figi)
                    console.log(`✅ Общая модель также сохранена на основе ${figi}`);
                    
                    // Обновляем время создания модели
                    this.modelCreatedAt = new Date().toISOString();
                    console.log(`✅ Model saved successfully for ${figi} (both per-FIGI and general)`);
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
            
            // Получаем все инструменты для обучения (лимит игнорируется)
            const instruments = await CacheService.getAllInstruments();
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
                    // Сохраняем метрики для выбора лучшей модели
                    const finalAcc = history?.history?.acc?.length > 0 
                        ? history.history.acc[history.history.acc.length - 1] 
                        : null;
                    const finalLoss = history?.history?.loss?.length > 0 
                        ? history.history.loss[history.history.loss.length - 1] 
                        : null;
                    
                    results.push({ 
                        figi: instrument.figi, 
                        ticker: instrument.ticker, 
                        ok: true, 
                        epochs: history?.params?.epochs || 50,
                        accuracy: finalAcc,
                        loss: finalLoss
                    });
                    
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

            // Сохраняем общую модель после пакетного обучения
            // Выбираем модель с лучшей точностью (accuracy) среди всех успешно обученных
            
            try {
                // Находим модель с лучшей accuracy среди успешно обученных
                const successfulResults = results.filter(r => r.ok && r.accuracy !== null && r.accuracy !== undefined);
                
                if (successfulResults.length > 0) {
                    // Сортируем по accuracy (по убыванию) и берем лучшую
                    successfulResults.sort((a, b) => (b.accuracy || 0) - (a.accuracy || 0));
                    const bestResult = successfulResults[0];
                    
                    console.log(`🏆 Лучшая модель: ${bestResult.ticker} (FIGI: ${bestResult.figi}) с accuracy: ${bestResult.accuracy?.toFixed(4) || 'N/A'}`);
                    
                    // Загружаем лучшую модель
                    const bestModel = await OptimizedTrainingService.getModel(bestResult.figi);
                    if (bestModel) {
                        this.model = bestModel;
                        await this.saveModel(); // Сохраняет общую модель (без параметра figi)
                        console.log(`✅ Общая модель сохранена на основе лучшей модели (${bestResult.ticker}, accuracy: ${bestResult.accuracy?.toFixed(4)})`);
                    } else {
                        console.warn(`⚠️ Не удалось загрузить модель для ${bestResult.ticker}, пробуем использовать this.model...`);
                        if (this.model) {
                            await this.saveModel(); // Сохраняет общую модель (без параметра figi)
                            console.log('✅ Общая модель сохранена (использована текущая this.model)');
                        } else {
                            console.warn('⚠️ this.model не установлена, не можем сохранить общую модель');
                        }
                    }
                } else if (this.model) {
                    // Если нет метрик, но есть модель - используем её
                    console.log('⚠️ Нет метрик для выбора лучшей модели, используем текущую this.model');
                    await this.saveModel(); // Сохраняет общую модель (без параметра figi)
                    console.log('✅ Общая модель сохранена');
                } else {
                    // Пробуем найти любую обученную модель
                    console.log('⚠️ this.model не установлена, ищем любую обученную модель...');
                    const instruments = await CacheService.getAllInstruments(10);
                    for (const instrument of instruments) {
                        const modelFromTraining = await OptimizedTrainingService.getModel(instrument.figi);
                        if (modelFromTraining) {
                            this.model = modelFromTraining;
                            console.log(`✅ Используем модель для ${instrument.ticker} как общую`);
                            await this.saveModel();
                            break;
                        }
                    }
                }
            } catch (err) {
                console.warn('⚠️ Ошибка при выборе и сохранении общей модели:', err.message);
                // Fallback: пробуем сохранить текущую модель
                if (this.model) {
                    try {
                        await this.saveModel();
                        console.log('✅ Общая модель сохранена (fallback)');
                    } catch (saveErr) {
                        console.error('❌ Не удалось сохранить общую модель:', saveErr.message);
                    }
                }
            }

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

            
            // Выбираем подходящую модель для предсказания
            // Пытаемся взять актуальную per-FIGI модель из OptimizedTrainingService (соответствует текущему размеру фичей)
            // Если не удалось — не используем устаревшую this.model с другой размерностью, а мягко возвращаем ошибку
            let model = null;
            try {
                // Используем прямой импорт, так как метод может вызываться из worker'а
                const OptimizedTrainingService = (await import('./OptimizedTrainingService.js')).default;
                const loadedModel = await OptimizedTrainingService.loadModel(figi, featureVector.length);
                if (loadedModel) {
                    model = loadedModel;
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
            const boundedScore = Math.min(0.99, Math.max(0.01, finalScore)); // избегаем 0/1 для более гладкой шкалы
            const boundedConfidence = Math.min(0.99, Math.max(0.01, score));

            // Получаем текущую цену
            const currentPrice = closingPrices[closingPrices.length - 1];

            // Генерируем объяснение предсказания
            const explanation = await this.generateExplanation(
                {
                    score: boundedScore,
                    confidence: boundedConfidence,
                    recommendation: boundedScore > 0.7 ? 'BUY' : boundedScore < 0.3 ? 'SELL' : 'HOLD',
                    dividendImpact: dividendBonus
                },
                indicators,
                {
                    candlesCount: candles.length,
                    dividendYield
                }
            );

            return {
                score: boundedScore,
                confidence: boundedConfidence,
                dividendImpact: dividendBonus,
                recommendation: boundedScore > 0.7 ? 'BUY' : boundedScore < 0.3 ? 'SELL' : 'HOLD',
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


            // Используем worker/OptimizedTrainingService для предсказания по последнему сэмплу
            const score = await OptimizedTrainingService.predict(figi, featureVector);

            const dividendBonus = dividendYield * 0.1;
            const finalScore = Math.min(1, score + dividendBonus);
            const boundedScore = Math.min(0.99, Math.max(0.01, finalScore));
            const boundedConfidence = Math.min(0.99, Math.max(0.01, score));
            
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
                    score: boundedScore,
                    confidence: boundedConfidence,
                    recommendation: boundedScore > 0.7 ? 'BUY' : boundedScore < 0.3 ? 'SELL' : 'HOLD',
                    dividendImpact: dividendBonus
                },
                indicators,
                {
                    candlesCount: candles.length,
                    dividendYield
                }
            );
            
            return {
                score: boundedScore,
                confidence: boundedConfidence,
                dividendImpact: dividendBonus,
                recommendation: boundedScore > 0.7 ? 'BUY' : boundedScore < 0.3 ? 'SELL' : 'HOLD',
                explanation: explanation
            };
        } catch (error) {
            console.error('❌ Error in predictFromCandles:', error);
            return { score: 0, confidence: 0, error: error.message };
        }
    }

    // Анализ всего портфеля
    /**
     * Запуск анализа портфеля через worker thread
     */
    async analyzePortfolioViaWorker(portfolioItems, totalBudget = null, analysisType = 'full') {
        // Проверяем, не идет ли уже анализ
        if (this.isAnalyzing) {
            throw new Error('Portfolio analysis is already in progress');
        }

        this.isAnalyzing = true;

        try {
            // ВАРИАНТ 2: Используем DatabaseConnectionManager без лишних authenticate()
            const DatabaseConnectionManager = (await import('../utils/DatabaseConnectionManager.js')).default;
            const requesterId = `analyze-portfolio-${Date.now()}`;
            
            console.log(`📊 Requesting database connection before creating worker (${requesterId})...`);
            const connection = await DatabaseConnectionManager.acquireConnection(requesterId, 60000);
            console.log(`✅ Database connection acquired (${connection.connectionId}), creating worker...`);
            
            // Освобождаем подключение сразу после проверки, worker получит свое
            connection.release();
            
            const { Worker } = await import('worker_threads');
            const { fileURLToPath } = await import('url');
            const { dirname, join } = await import('path');
            
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = dirname(__filename);
            const workerPath = join(__dirname, '../workers/portfolioAnalysisWorker.js');
            
            // Определяем portfolioType на основе данных
            let portfolioType = 'virtual';
            if (portfolioItems.length > 0 && portfolioItems[0].averagePrice !== undefined && portfolioItems[0].averagePrice > 0) {
                portfolioType = 'real';
            }
            
            
            const worker = new Worker(workerPath, {
                workerData: {
                    portfolioType,
                    portfolioItems,
                    totalBudget,
                    analysisType
                }
            });
            
            // Добавляем worker в список для отслеживания
            this.analysisWorkers.add(worker);
            
            // Обрабатываем результат
            const result = await new Promise((resolve, reject) => {
                worker.on('message', (msg) => {
                    if (msg.type === 'done') {
                        resolve(msg.data.analysis);
                    } else if (msg.type === 'error') {
                        reject(new Error(msg.data.error));
                    } else if (msg.type === 'progress') {
                        // Отправляем прогресс через WebSocket
                        const webSocketService = this.getWebSocketService();
                        if (webSocketService && typeof webSocketService.broadcast === 'function') {
                            webSocketService.broadcast({
                                type: 'analysis_progress',
                                data: msg.data,
                                timestamp: new Date().toISOString()
                            });
                        }
                    }
                });
                
                worker.on('error', (error) => {
                    console.error('❌ [Worker] Error:', error);
                    reject(error);
                });
                
                worker.on('exit', (code) => {
                    this.analysisWorkers.delete(worker);
                    // Не считаем ошибкой завершение worker'а при остановке сервиса
                    if (code !== 0 && !this.isStopping) {
                        reject(new Error(`Worker stopped with exit code ${code}`));
                    } else if (code !== 0 && this.isStopping) {
                        // При остановке просто логируем, но не считаем ошибкой
                        console.log(`ℹ️ Worker stopped during service shutdown (exit code ${code})`);
                    }
                });
            });
            
            // Удаляем worker из списка после завершения
            this.analysisWorkers.delete(worker);
            worker.terminate();
            
            console.log(`✅ [Worker] Portfolio analysis completed`);
            return result;
            
        } catch (error) {
            console.error('❌ [Worker] Portfolio analysis failed:', error);
            throw error;
        } finally {
            this.isAnalyzing = false;
        }
    }

    async analyzePortfolio(portfolioItems, totalBudget = null) {
        // Проверяем и загружаем модель, если нужно
        if (!this.model) {
            const loaded = await this.loadModel();
            if (!loaded) {
                // Пробуем найти любую обученную модель через OptimizedTrainingService
                try {
                    const instruments = await CacheService.getAllInstruments(10);
                    for (const instrument of instruments) {
                        try {
                            const modelFromTraining = await OptimizedTrainingService.getModel(instrument.figi);
                            if (modelFromTraining) {
                                this.model = modelFromTraining;
                                console.log(`✅ Loaded model from OptimizedTrainingService for ${instrument.figi}`);
                                break;
                            }
                        } catch (err) {
                            // Продолжаем поиск
                        }
                    }
                } catch (err) {
                    console.warn('Could not load model from OptimizedTrainingService:', err.message);
                }
            }
            
            if (!this.model) {
                throw new Error('No trained model available. Please train a model first.');
            }
        }
        
        // Активируем нейросеть, если она неактивна
        if (!this.isActive) {
            console.log('⚠️ Neural network is not active, activating...');
            await this.setStatus('active');
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

        console.log(`💰 Price range: ${minPrice} - ${maxPrice === Infinity ? 'unlimited' : maxPrice}`);

        let processedCount = 0;
        let validPredictions = 0;

        // Анализируем все инструменты без ограничений
        for (const instrument of instruments) {
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

                // Используем IntegratedAIService для получения актуального предсказания (как на странице нейросетей)
                let prediction;
                try {
                    // Используем прямой импорт, так как метод может вызываться из worker'а
                    const IntegratedAIService = (await import('./IntegratedAIService.js')).default;
                    
                    // Проверяем и инициализируем, если нужно
                    if (!IntegratedAIService.isInitialized) {
                        console.log(`🔄 IntegratedAIService not initialized, initializing...`);
                        try {
                            await IntegratedAIService.initialize();
                        } catch (initError) {
                            console.warn(`⚠️ Failed to initialize IntegratedAIService:`, initError.message);
                        }
                    }
                    
                    if (IntegratedAIService.isInitialized) {
                        const integratedRec = await IntegratedAIService.getIntegratedRecommendation(instrument.figi);
                        // Формируем explanation в едином формате: объект с summary и details
                        let explanation = {};
                        if (integratedRec.summary) {
                            // Если summary - строка, создаем объект
                            if (typeof integratedRec.summary === 'string') {
                                explanation = {
                                    summary: integratedRec.summary,
                                    details: integratedRec.details || {}
                                };
                            } else {
                                // Если summary - объект, используем его
                                explanation = integratedRec.summary;
                            }
                        } else if (integratedRec.details) {
                            explanation = {
                                summary: 'Анализ на основе интегрированной AI системы',
                                details: integratedRec.details
                            };
                        } else {
                            explanation = {
                                summary: 'Анализ на основе интегрированной AI системы',
                                details: {}
                            };
                        }
                        
                        prediction = {
                            score: integratedRec.score || 0,
                            confidence: integratedRec.confidence || integratedRec.score || 0,
                            recommendation: integratedRec.recommendation || 'HOLD',
                            explanation: explanation,
                            summary: typeof integratedRec.summary === 'string' ? integratedRec.summary : (integratedRec.summary?.summary || ''),
                            details: integratedRec.details || {},
                            horizons: integratedRec.horizons || null, // Сохраняем горизонты отдельно
                            agreement: integratedRec.agreement || null
                        };
                    } else {
                        // Fallback к обычному предсказанию
                        console.log(`⚠️ IntegratedAIService not available, using NeuralNetwork for ${instrument.ticker}`);
                        prediction = await this.predict(instrument.figi, instrument.dividendYield);
                    }
                } catch (integratedError) {
                    // Fallback к обычному предсказанию при ошибке
                    console.warn(`⚠️ IntegratedAI failed for ${instrument.ticker}, using NeuralNetwork:`, integratedError.message);
                    prediction = await this.predict(instrument.figi, instrument.dividendYield);
                }

                // Сохраняем ВСЕ рекомендации (BUY, SELL, HOLD) без фильтрации по score
                validPredictions++;
                
                // Для HOLD рекомендаций особенно важно иметь валидную цену
                // Если candidatePrice отсутствует или равна 0, пытаемся получить через API
                let currentPrice = candidatePrice;
                if ((!currentPrice || currentPrice === 0 || isNaN(currentPrice)) && prediction.recommendation === 'HOLD') {
                    console.log(`🔄 [HOLD] Price missing for ${instrument.ticker}, fetching from API...`);
                    try {
                        currentPrice = await this.getCurrentPrice(instrument.figi);
                        if (currentPrice && currentPrice > 0) {
                            console.log(`✅ [HOLD] Got price from API for ${instrument.ticker}: ${currentPrice}`);
                            // Обновляем кеш инструмента
                            const CachedInstrument = (await import('../models/CachedInstrument.js')).default;
                            await CachedInstrument.update(
                                { lastPrice: currentPrice, lastPriceTime: new Date() },
                                { where: { figi: instrument.figi } }
                            );
                        }
                    } catch (priceError) {
                        console.warn(`⚠️ [HOLD] Could not fetch price for ${instrument.ticker}:`, priceError.message);
                    }
                }
                
                const recommendation = prediction.recommendation || 'HOLD';
                
                // Определяем стратегию для рекомендации и рассчитываем размер позиции с учетом стратегии
                let suggestedStrategy = null;
                let suggestedQuantity = 0;
                let estimatedCost = 0;
                
                try {
                    const StrategyAllocationService = (await import('./StrategyAllocationService.js')).default;
                    suggestedStrategy = await StrategyAllocationService.getStrategyForRecommendation(
                        prediction.confidence || confidence, 
                        prediction.score || score
                    );
                    
                    if (suggestedStrategy && recommendation === 'BUY') {
                        // Рассчитываем размер позиции с учетом стратегии
                        const positionSize = await StrategyAllocationService.calculatePositionSize(
                            suggestedStrategy.id,
                            { confidence: prediction.confidence || confidence, score: prediction.score || score },
                            totalBudget
                        );
                        suggestedQuantity = Math.floor(positionSize.amount / Math.max(currentPrice, 1));
                        estimatedCost = suggestedQuantity * currentPrice;
                    } else {
                        // Fallback к обычному расчету
                        suggestedQuantity = Math.floor(analysis.availableBudget / Math.max(currentPrice, 1));
                        estimatedCost = suggestedQuantity * currentPrice;
                    }
                } catch (strategyError) {
                    // Fallback к обычному расчету при ошибке
                    suggestedQuantity = Math.floor(analysis.availableBudget / Math.max(currentPrice, 1));
                    estimatedCost = suggestedQuantity * currentPrice;
                }
                
                // Распределяем рекомендации по соответствующим массивам
                if (recommendation === 'BUY') {
                    analysis.buyRecommendations.push({
                        instrument,
                        prediction: {
                            ...prediction,
                            strategyId: suggestedStrategy?.id || null
                        },
                        currentPrice,
                        suggestedQuantity,
                        estimatedCost
                    });
                    console.log(`✅ Added BUY recommendation for ${instrument.ticker}: score=${prediction.score.toFixed(3)}, strategy=${suggestedStrategy?.name || 'none'}`);
                } else if (recommendation === 'SELL') {
                    // SELL рекомендации для новых инструментов (не из портфеля)
                    analysis.sellRecommendations.push({
                        instrument,
                        prediction,
                        currentPrice
                    });
                    console.log(`✅ Added SELL recommendation for ${instrument.ticker}: score=${prediction.score.toFixed(3)}`);
                } else {
                    // HOLD рекомендации - добавляем в buyRecommendations с пометкой HOLD
                    // Это позволит сохранить их в БД как отдельные записи
                    analysis.buyRecommendations.push({
                        instrument,
                        prediction: {
                            ...prediction,
                            recommendation: 'HOLD'
                        },
                        currentPrice,
                        suggestedQuantity: 0,
                        estimatedCost: 0
                    });
                    console.log(`✅ Added HOLD recommendation for ${instrument.ticker}: score=${prediction.score.toFixed(3)}`);
                }
            } catch (error) {
                console.warn(`Could not analyze ${instrument.ticker}:`, error.message);
            }
        }


        // Анализ текущего портфеля на продажу
        console.log(`💼 Analyzing ${portfolioItems.length} portfolio items for sell recommendations`);
        
        // Загружаем модели для работы со стратегиями
        const TradingRequest = (await import('../models/TradingRequest.js')).default;
        const PositionStrategy = (await import('../models/PositionStrategy.js')).default;
        const TradingStrategy = (await import('../models/TradingStrategy.js')).default;
        const StrategyAllocationService = (await import('./StrategyAllocationService.js')).default;
        const { Op } = await import('sequelize');
        
        const recommendationsByStrategy = {}; // Группировка по стратегиям
        
        // Оптимизация N+1: загружаем все данные одним запросом
        const figis = portfolioItems.map(item => item.figi);
        
        // Убеждаемся, что все ассоциации установлены перед использованием
        try {
            const { ensureAssociations } = await import('../utils/ensureAssociations.js');
            await ensureAssociations();
        } catch (assocError) {
            console.warn('⚠️ Could not ensure associations in analyzePortfolio:', assocError.message);
        }
        
        // Загружаем все BUY заявки для всех FIGI одним запросом
        const allBuyRequests = await TradingRequest.findAll({
            where: {
                figi: { [Op.in]: figis },
                action: 'BUY',
                status: { [Op.in]: ['APPROVED', 'EXECUTED', 'PENDING'] }
            },
            order: [['figi', 'ASC'], ['executedAt', 'DESC'], ['createdAt', 'DESC']],
            include: [{
                model: TradingStrategy,
                as: 'strategy',
                required: false
            }]
        });
        
        // Группируем заявки по FIGI, берем последнюю для каждого FIGI
        const buyRequestsByFigi = new Map();
        const requestIds = new Set();
        for (const request of allBuyRequests) {
            if (!buyRequestsByFigi.has(request.figi)) {
                buyRequestsByFigi.set(request.figi, request);
                requestIds.add(request.id);
            }
        }
        
        // Загружаем все PositionStrategy для всех заявок одним запросом
        const allPositionStrategies = await PositionStrategy.findAll({
            where: {
                positionId: { [Op.in]: Array.from(requestIds) }
            },
            include: [{
                model: TradingStrategy,
                as: 'strategy',
                required: false
            }]
        });
        
        // Создаем мапу PositionStrategy по positionId
        const positionStrategyByRequestId = new Map();
        for (const ps of allPositionStrategies) {
            positionStrategyByRequestId.set(ps.positionId, ps);
        }
        
        // Загружаем все стратегии одним запросом (на случай если не загрузились через include)
        const strategyIds = new Set();
        for (const request of allBuyRequests) {
            if (request.strategyId) strategyIds.add(request.strategyId);
        }
        for (const ps of allPositionStrategies) {
            if (ps.strategyId) strategyIds.add(ps.strategyId);
        }
        
        const allStrategies = await TradingStrategy.findAll({
            where: { id: { [Op.in]: Array.from(strategyIds) } }
        });
        const strategiesById = new Map();
        for (const strategy of allStrategies) {
            strategiesById.set(strategy.id, strategy);
        }
        
        // Загружаем все цены одним запросом (если метод getCurrentPrice поддерживает батчинг)
        // Пока оставляем как есть, но можно оптимизировать если есть метод getCurrentPrices()
        
        for (const item of portfolioItems) {
            try {
                // Получаем стратегию для позиции из предзагруженных данных
                let positionStrategy = null;
                let strategyInfo = null;
                try {
                    const buyRequest = buyRequestsByFigi.get(item.figi);
                    
                    if (buyRequest) {
                        // Сначала проверяем strategyId в самой заявке
                        if (buyRequest.strategyId) {
                            strategyInfo = buyRequest.strategy || strategiesById.get(buyRequest.strategyId);
                        }
                        
                        // Если не найдено, пытаемся найти через PositionStrategy
                        if (!strategyInfo) {
                            positionStrategy = positionStrategyByRequestId.get(buyRequest.id);
                            if (positionStrategy && positionStrategy.strategyId) {
                                strategyInfo = positionStrategy.strategy || strategiesById.get(positionStrategy.strategyId);
                            }
                        }
                    }
                } catch (strategyError) {
                    console.warn(`⚠️ Could not load strategy for ${item.ticker}:`, strategyError.message);
                }

                // Используем IntegratedAIService для получения актуального предсказания (как на странице нейросетей)
                let prediction;
                try {
                    // Используем прямой импорт, так как метод может вызываться из worker'а
                    const IntegratedAIService = (await import('./IntegratedAIService.js')).default;
                    
                    // Проверяем и инициализируем, если нужно
                    if (!IntegratedAIService.isInitialized) {
                        console.log(`🔄 IntegratedAIService not initialized, initializing...`);
                        try {
                            await IntegratedAIService.initialize();
                        } catch (initError) {
                            console.warn(`⚠️ Failed to initialize IntegratedAIService:`, initError.message);
                        }
                    }
                    
                    if (IntegratedAIService.isInitialized) {
                        const integratedRec = await IntegratedAIService.getIntegratedRecommendation(item.figi);
                        // Формируем explanation в едином формате: объект с summary и details
                        let explanation = {};
                        if (integratedRec.summary) {
                            // Если summary - строка, создаем объект
                            if (typeof integratedRec.summary === 'string') {
                                explanation = {
                                    summary: integratedRec.summary,
                                    details: integratedRec.details || {}
                                };
                            } else {
                                // Если summary - объект, используем его
                                explanation = integratedRec.summary;
                            }
                        } else if (integratedRec.details) {
                            explanation = {
                                summary: 'Анализ на основе интегрированной AI системы',
                                details: integratedRec.details
                            };
                        } else {
                            explanation = {
                                summary: 'Анализ на основе интегрированной AI системы',
                                details: {}
                            };
                        }
                        
                        prediction = {
                            score: integratedRec.score || 0,
                            confidence: integratedRec.confidence || integratedRec.score || 0,
                            recommendation: integratedRec.recommendation || 'HOLD',
                            explanation: explanation,
                            summary: typeof integratedRec.summary === 'string' ? integratedRec.summary : (integratedRec.summary?.summary || ''),
                            details: integratedRec.details || {},
                            horizons: integratedRec.horizons || null,
                            agreement: integratedRec.agreement || null
                        };
                    } else {
                        // Fallback к обычному предсказанию
                        console.log(`⚠️ IntegratedAIService not available, using NeuralNetwork for portfolio ${item.ticker}`);
                        prediction = await this.predict(item.figi);
                    }
                } catch (integratedError) {
                    // Fallback к обычному предсказанию при ошибке
                    console.warn(`⚠️ IntegratedAI failed for portfolio ${item.ticker}, using NeuralNetwork:`, integratedError.message);
                    prediction = await this.predict(item.figi);
                }

                // Добавляем запись для каждой позиции, классифицируя причину
                let reason = 'Hold';
                if (prediction.score < 0.2) {
                    reason = 'Low prediction score (strong sell signal)';
                } else if (prediction.score < 0.3) {
                    reason = 'Moderate prediction score (sell signal)';
                } else if (prediction.score >= 0.7) {
                    reason = 'Hold (good prospects)';
                }

                // Если есть стратегия, добавляем информацию о бюджете стратегии
                let strategyBudgetInfo = null;
                if (strategyInfo) {
                    try {
                        const allocation = await StrategyAllocationService.getAvailableBudget(strategyInfo.id);
                        const currentPrice = await this.getCurrentPrice(item.figi);
                        strategyBudgetInfo = {
                            strategyId: strategyInfo.id,
                            strategyName: strategyInfo.name,
                            strategyType: strategyInfo.type,
                            availableBudget: allocation,
                            positionValue: currentPrice * item.quantity
                        };
                    } catch (budgetError) {
                        console.warn(`⚠️ Could not get budget info for strategy ${strategyInfo.id}:`, budgetError.message);
                    }
                }

                // Получаем текущую цену ДО формирования объекта recommendation
                const currentPrice = await this.getCurrentPrice(item.figi);
                
                const recommendation = {
                    item,
                    instrument: item, // Добавляем instrument для совместимости
                    prediction,
                    currentPrice: currentPrice, // Сохраняем цену в объекте recommendation
                    reason,
                    strategy: strategyInfo ? {
                        id: strategyInfo.id,
                        name: strategyInfo.name,
                        type: strategyInfo.type
                    } : null,
                    strategyBudgetInfo
                };

                analysis.sellRecommendations.push(recommendation);

                // Группируем по стратегиям
                const strategyKey = strategyInfo ? strategyInfo.id : 'no_strategy';
                if (!recommendationsByStrategy[strategyKey]) {
                    recommendationsByStrategy[strategyKey] = {
                        strategy: strategyInfo ? {
                            id: strategyInfo.id,
                            name: strategyInfo.name,
                            type: strategyInfo.type
                        } : null,
                        recommendations: [],
                        totalValue: 0,
                        sellCount: 0,
                        holdCount: 0
                    };
                }
                recommendationsByStrategy[strategyKey].recommendations.push(recommendation);
                recommendationsByStrategy[strategyKey].totalValue += currentPrice * item.quantity;
                if (prediction.recommendation === 'SELL' || prediction.score < 0.3) {
                    recommendationsByStrategy[strategyKey].sellCount++;
                } else {
                    recommendationsByStrategy[strategyKey].holdCount++;
                }

                if (prediction.score < 0.3) {
                    console.log(`✅ Added SELL recommendation for ${item.ticker}: score=${prediction.score.toFixed(3)} (${prediction.recommendation})${strategyInfo ? ` [${strategyInfo.name}]` : ''}`);
                } else {
                    console.log(`ℹ️ Added HOLD entry for ${item.ticker}: score=${prediction.score.toFixed(3)} (${prediction.recommendation})${strategyInfo ? ` [${strategyInfo.name}]` : ''}`);
                }

                // Расчет текущей стоимости портфеля
                analysis.portfolioValue += currentPrice * item.quantity;

            } catch (error) {
                console.warn(`Could not analyze portfolio item ${item.ticker}:`, error.message);
            }
        }

        console.log(`📉 Sell recommendations: ${analysis.sellRecommendations.length}`);

        analysis.availableBudget = totalBudget - analysis.portfolioValue;

        // Рассчитываем статистику по стратегиям для позиций портфеля
        const strategyStats = Object.values(recommendationsByStrategy).map(group => ({
            strategy: group.strategy,
            positionsCount: group.recommendations.length,
            totalValue: group.totalValue,
            sellCount: group.sellCount,
            holdCount: group.holdCount,
            sellPercentage: group.recommendations.length > 0 
                ? (group.sellCount / group.recommendations.length) * 100 
                : 0
        }));

        // Добавляем группировку и статистику по стратегиям в результат
        analysis.recommendationsByStrategy = recommendationsByStrategy;
        analysis.strategyStats = strategyStats;

        // Сортируем рекомендации по уверенности (от высокой к низкой)
        analysis.buyRecommendations.sort((a, b) => b.prediction.score - a.prediction.score);
        analysis.sellRecommendations.sort((a, b) => a.prediction.score - b.prediction.score);

        return analysis;
    }

    /**
     * Анализ портфеля с сохранением в БД
     * Выполняется автоматически раз в час
     */
    async analyzePortfolioAndSave(portfolioType = 'virtual') {
        const startTime = Date.now();
        let analysisRecord = null;

        try {

            // Создаем запись в БД со статусом pending
            const PortfolioAnalysis = (await import('../models/PortfolioAnalysis.js')).default;
            analysisRecord = await PortfolioAnalysis.create({
                portfolioType,
                status: 'pending',
                analysisDate: new Date()
            });

            // Получаем портфель в зависимости от типа
            const TradingEngine = (await import('./TradingEngine.js')).default;
            const CacheService = (await import('./CacheService.js')).default;
            let portfolioItems = [];

            if (portfolioType === 'real') {
                // Реальный портфель
                const portfolio = await TradingEngine.getRealPortfolioValue();
                const positions = portfolio?.positions || [];
                
                if (Array.isArray(positions)) {
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
                }
            } else {
                // Виртуальный портфель (virtual/paper)
                const portfolio = await TradingEngine.getPortfolioValue();
                const positions = portfolio?.positions || {};
                
                if (typeof positions === 'object' && !Array.isArray(positions)) {
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
            }


            // Получаем настройки портфеля
            const SettingsService = (await import('./SettingsService.js')).default;
            const portfolioSettings = await SettingsService.getPortfolioSettings();
            const totalBudget = portfolioSettings.user_max_portfolio_budget || 1000000;

            // ВАЖНО: Убеждаемся, что IntegratedAIService инициализирован перед анализом
            // Это гарантирует, что везде используются одинаковые предсказания
            // Используем прямой импорт, так как метод может вызываться из worker'а
            const IntegratedAIService = (await import('./IntegratedAIService.js')).default;
            
            if (!IntegratedAIService.isInitialized) {
                console.log('🔄 IntegratedAIService not initialized, initializing before analysis...');
                try {
                    await IntegratedAIService.initialize();
                    console.log('✅ IntegratedAIService initialized successfully');
                } catch (initError) {
                    console.error('❌ Failed to initialize IntegratedAIService:', initError);
                    throw new Error(`Cannot perform analysis: IntegratedAIService initialization failed: ${initError.message}`);
                }
            }

            // Проверяем, активна ли нейросеть, и активируем если нужно
            if (!this.isActive) {
                console.log('⚠️ Neural network is not active, activating...');
                await this.setStatus('active');
            }

            // Пытаемся загрузить модель, если она не загружена
            if (!this.model) {
                console.log('📥 Model not loaded, attempting to load...');
                
                // Пробуем загрузить общую модель
                const loaded = await this.loadModel();
                if (!loaded) {
                    // Пробуем найти любую обученную модель через OptimizedTrainingService
                    try {
                        // Получаем список инструментов и пробуем загрузить модель для первого
                        const instruments = await CacheService.getAllInstruments(10);
                        for (const instrument of instruments) {
                            try {
                                const modelFromTraining = await OptimizedTrainingService.getModel(instrument.figi);
                                if (modelFromTraining) {
                                    this.model = modelFromTraining;
                                    console.log(`✅ Loaded model from OptimizedTrainingService for ${instrument.figi}`);
                                    break;
                                }
                            } catch (err) {
                                // Продолжаем поиск
                            }
                        }
                    } catch (err) {
                        console.warn('Could not load model from OptimizedTrainingService:', err.message);
                    }
                }
                
                if (!this.model) {
                    throw new Error('No trained model available. Please train a model first.');
                }
            }

            // Выполняем анализ через worker
            const analysis = await this.analyzePortfolioViaWorker(portfolioItems, totalBudget, 'full');

            const processingTime = Date.now() - startTime;

            // Сохраняем результаты в БД
            await analysisRecord.update({
                status: 'completed',
                portfolioValue: analysis.portfolioValue || 0,
                availableBudget: analysis.availableBudget || 0,
                totalPositions: portfolioItems.length,
                sellRecommendations: analysis.sellRecommendations || [],
                buyRecommendations: analysis.buyRecommendations || [],
                sellRecommendationsCount: analysis.sellRecommendations?.length || 0,
                buyRecommendationsCount: analysis.buyRecommendations?.length || 0,
                processingTime,
                metadata: {
                    mode: portfolioType,
                    analyzedAt: new Date().toISOString()
                }
            });

            // Сохраняем рекомендации в таблицу Recommendations для отображения на странице рекомендаций
            try {
                await this.saveRecommendationsToDatabase(analysis.buyRecommendations || [], analysis.sellRecommendations || []);
                console.log(`✅ Saved ${(analysis.buyRecommendations?.length || 0) + (analysis.sellRecommendations?.length || 0)} recommendations to Recommendations table`);
            } catch (recErr) {
                console.warn('⚠️ Failed to save recommendations to Recommendations table:', recErr.message);
                // Не прерываем выполнение, анализ сохранен в PortfolioAnalysis
            }

            console.log(`✅ Portfolio analysis completed and saved for ${portfolioType} portfolio:`);
            console.log(`   - Sell recommendations: ${analysis.sellRecommendations?.length || 0}`);
            console.log(`   - Buy recommendations: ${analysis.buyRecommendations?.length || 0}`);
            console.log(`   - Processing time: ${processingTime}ms`);

            return analysisRecord;

        } catch (error) {
            console.error(`❌ Error analyzing ${portfolioType} portfolio:`, error);
            
            // Обновляем запись с ошибкой
            if (analysisRecord) {
                try {
                    await analysisRecord.update({
                        status: 'failed',
                        error: error.message,
                        processingTime: Date.now() - startTime
                    });
                } catch (updateError) {
                    console.error('Failed to update analysis record with error:', updateError);
                }
            }

            throw error;
        }
    }

    /**
     * Анализ только позиций портфеля (без сканирования всего рынка)
     * Сохраняет SELL/HOLD рекомендации в Recommendation
     */
    async analyzePortfolioPositionsOnly(portfolioType = 'virtual', saveToDb = true) {
        console.log(`🔍 [POSITIONS-ONLY] Starting positions-only analysis (portfolioType: ${portfolioType}, saveToDb: ${saveToDb})`);
        const startTime = Date.now();
        const TradingEngine = (await import('./TradingEngine.js')).default;
        const CacheService = (await import('./CacheService.js')).default;

        // Собираем позиции портфеля
        let portfolioItems = [];
        try {
            if (portfolioType === 'real') {
                const portfolio = await TradingEngine.getRealPortfolioValue();
                const positions = portfolio?.positions || [];
                if (Array.isArray(positions)) {
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
                }
            } else {
                const portfolio = await TradingEngine.getPortfolioValue();
                const positions = portfolio?.positions || {};
                if (typeof positions === 'object' && !Array.isArray(positions)) {
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
            }
        } catch (err) {
            console.error('❌ Failed to load portfolio positions:', err);
            throw err;
        }

        console.log(`📊 Positions-only analysis: ${portfolioItems.length} items (${portfolioType})`);

        // Проверяем, не идет ли уже анализ
        if (this.isAnalyzing) {
            throw new Error('Portfolio analysis is already in progress');
        }

        // Выполняем анализ через worker
        const result = await this.analyzePortfolioViaWorker(portfolioItems, null, 'positions-only');
        
        // Сохраняем результаты в БД если требуется
        if (saveToDb) {
            try {
                console.log(`💾 [POSITIONS-ONLY] Saving ${result.sellRecommendations.length} recommendations to DB...`);
                await this.saveRecommendationsToDatabase([], result.sellRecommendations);
                console.log(`✅ [POSITIONS-ONLY] Successfully saved ${result.sellRecommendations.length} position recommendations to DB`);
            } catch (dbErr) {
                console.error('❌ [POSITIONS-ONLY] Failed to save position recommendations:', dbErr);
                throw dbErr;
            }
        }

        const processingTime = Date.now() - startTime;
        console.log(`✅ [POSITIONS-ONLY] Analysis completed in ${processingTime}ms`);
        console.log(`   - Sell recommendations: ${result.sellRecommendations?.length || 0}`);
        console.log(`   - Strategy stats: ${result.strategyStats?.length || 0} strategies`);

        return result;
    }

    // Вспомогательные методы
    async getCurrentPrice(figi) {
        const PositionStrategy = (await import('../models/PositionStrategy.js')).default;
        const TradingStrategy = (await import('../models/TradingStrategy.js')).default;
        const StrategyAllocationService = (await import('./StrategyAllocationService.js')).default;
        const { Op } = await import('sequelize');

        // Анализируем только позиции, без BUY по рынку
        const sellRecommendations = [];
        const recommendationsByStrategy = {}; // Группировка по стратегиям
        let portfolioValue = 0;
        
        for (const item of portfolioItems) {
            try {
                // Получаем стратегию для позиции
                let positionStrategy = null;
                let strategyInfo = null;
                try {
                    // Ищем последнюю BUY заявку для этого FIGI
                    const buyRequest = await TradingRequest.findOne({
                        where: {
                            figi: item.figi,
                            action: 'BUY',
                            status: {
                                [Op.in]: ['APPROVED', 'EXECUTED', 'PENDING']
                            }
                        },
                        order: [['executedAt', 'DESC'], ['createdAt', 'DESC']]
                    });
                    
                    if (buyRequest) {
                        // Сначала проверяем strategyId в самой заявке
                        if (buyRequest.strategyId) {
                            strategyInfo = await TradingStrategy.findByPk(buyRequest.strategyId);
                        }
                        
                        // Если не найдено, пытаемся найти через PositionStrategy
                        if (!strategyInfo) {
                            positionStrategy = await PositionStrategy.findOne({
                                where: { positionId: buyRequest.id }
                            });
                            if (positionStrategy && positionStrategy.strategyId) {
                                strategyInfo = await TradingStrategy.findByPk(positionStrategy.strategyId);
                            }
                        }
                    }
                } catch (strategyError) {
                    console.warn(`⚠️ Could not load strategy for ${item.ticker}:`, strategyError.message);
                }

                // Используем IntegratedAIService для получения актуального предсказания (как на странице нейросетей)
                let prediction;
                try {
                    // Используем прямой импорт, так как метод может вызываться из worker'а
                    const IntegratedAIService = (await import('./IntegratedAIService.js')).default;
                    
                    // Проверяем и инициализируем, если нужно
                    if (!IntegratedAIService.isInitialized) {
                        console.log(`🔄 IntegratedAIService not initialized, initializing...`);
                        try {
                            await IntegratedAIService.initialize();
                        } catch (initError) {
                            console.warn(`⚠️ Failed to initialize IntegratedAIService:`, initError.message);
                        }
                    }
                    
                    if (IntegratedAIService.isInitialized) {
                        const integratedRec = await IntegratedAIService.getIntegratedRecommendation(item.figi);
                        // Формируем explanation в едином формате: объект с summary и details
                        let explanation = {};
                        if (integratedRec.summary) {
                            // Если summary - строка, создаем объект
                            if (typeof integratedRec.summary === 'string') {
                                explanation = {
                                    summary: integratedRec.summary,
                                    details: integratedRec.details || {}
                                };
                            } else {
                                // Если summary - объект, используем его
                                explanation = integratedRec.summary;
                            }
                        } else if (integratedRec.details) {
                            explanation = {
                                summary: 'Анализ на основе интегрированной AI системы',
                                details: integratedRec.details
                            };
                        } else {
                            explanation = {
                                summary: 'Анализ на основе интегрированной AI системы',
                                details: {}
                            };
                        }
                        
                        prediction = {
                            score: integratedRec.score || 0,
                            confidence: integratedRec.confidence || integratedRec.score || 0,
                            recommendation: integratedRec.recommendation || 'HOLD',
                            explanation: explanation,
                            summary: typeof integratedRec.summary === 'string' ? integratedRec.summary : (integratedRec.summary?.summary || ''),
                            details: integratedRec.details || {},
                            horizons: integratedRec.horizons || null,
                            agreement: integratedRec.agreement || null
                        };
                        console.log(`🔍 [IntegratedAI] ${item.ticker}: score=${prediction.score.toFixed(3)}, confidence=${prediction.confidence.toFixed(3)}, recommendation=${prediction.recommendation}`);
                    } else {
                        // Fallback к обычному предсказанию
                        console.log(`⚠️ IntegratedAIService not available, using NeuralNetwork for ${item.ticker}`);
                        prediction = await this.predict(item.figi);
                    }
                } catch (integratedError) {
                    // Fallback к обычному предсказанию при ошибке
                    console.warn(`⚠️ IntegratedAI failed for ${item.ticker}, using NeuralNetwork:`, integratedError.message);
                    prediction = await this.predict(item.figi);
                }
                
                const currentPrice = await this.getCurrentPrice(item.figi);
                portfolioValue += currentPrice * item.quantity;

                // Определяем причину рекомендации с учетом стратегии
                let reason = 'Hold';
                if (prediction.score < 0.2) {
                    reason = 'Low prediction score (strong sell signal)';
                } else if (prediction.score < 0.3) {
                    reason = 'Moderate prediction score (sell signal)';
                } else if (prediction.score >= 0.7) {
                    reason = 'Hold (good prospects)';
                }

                // Если есть стратегия, добавляем информацию о бюджете стратегии
                let strategyBudgetInfo = null;
                if (strategyInfo) {
                    try {
                        const allocation = await StrategyAllocationService.getAvailableBudget(strategyInfo.id);
                        strategyBudgetInfo = {
                            strategyId: strategyInfo.id,
                            strategyName: strategyInfo.name,
                            strategyType: strategyInfo.type,
                            availableBudget: allocation,
                            positionValue: currentPrice * item.quantity
                        };
                    } catch (budgetError) {
                        console.warn(`⚠️ Could not get budget info for strategy ${strategyInfo.id}:`, budgetError.message);
                    }
                }

                const recommendation = {
                    item,
                    instrument: item, // Добавляем instrument для совместимости
                    currentPrice,
                    prediction,
                    reason,
                    strategy: strategyInfo ? {
                        id: strategyInfo.id,
                        name: strategyInfo.name,
                        type: strategyInfo.type
                    } : null,
                    strategyBudgetInfo
                };

                sellRecommendations.push(recommendation);

                // Группируем по стратегиям
                const strategyKey = strategyInfo ? strategyInfo.id : 'no_strategy';
                if (!recommendationsByStrategy[strategyKey]) {
                    recommendationsByStrategy[strategyKey] = {
                        strategy: strategyInfo ? {
                            id: strategyInfo.id,
                            name: strategyInfo.name,
                            type: strategyInfo.type
                        } : null,
                        recommendations: [],
                        totalValue: 0,
                        sellCount: 0,
                        holdCount: 0
                    };
                }
                recommendationsByStrategy[strategyKey].recommendations.push(recommendation);
                recommendationsByStrategy[strategyKey].totalValue += currentPrice * item.quantity;
                if (prediction.recommendation === 'SELL' || prediction.score < 0.3) {
                    recommendationsByStrategy[strategyKey].sellCount++;
                } else {
                    recommendationsByStrategy[strategyKey].holdCount++;
                }

                console.log(`🔍 ${item.ticker}: score=${prediction.score.toFixed(3)} rec=${prediction.recommendation}${strategyInfo ? ` [${strategyInfo.name}]` : ' [No strategy]'}`);
            } catch (err) {
                console.warn(`Could not analyze ${item.ticker}:`, err.message);
            }
        }

        // Рассчитываем статистику по стратегиям
        const strategyStats = Object.values(recommendationsByStrategy).map(group => ({
            strategy: group.strategy,
            positionsCount: group.recommendations.length,
            totalValue: group.totalValue,
            sellCount: group.sellCount,
            holdCount: group.holdCount,
            sellPercentage: group.recommendations.length > 0 
                ? (group.sellCount / group.recommendations.length) * 100 
                : 0
        }));

        const result = {
            portfolioType,
            analysisDate: new Date(),
            portfolioValue,
            availableBudget: 0,
            totalPositions: portfolioItems.length,
            sellRecommendations,
            buyRecommendations: [],
            sellRecommendationsCount: sellRecommendations.length,
            buyRecommendationsCount: 0,
            recommendationsByStrategy, // Группировка по стратегиям
            strategyStats, // Статистика по стратегиям
            processingTime: Date.now() - startTime
        };

        if (saveToDb) {
            try {
                console.log(`💾 [POSITIONS-ONLY] Saving ${sellRecommendations.length} recommendations to DB...`);
                await this.saveRecommendationsToDatabase([], sellRecommendations);
                console.log(`✅ [POSITIONS-ONLY] Successfully saved ${sellRecommendations.length} position recommendations to DB`);
            } catch (dbErr) {
                console.error('❌ [POSITIONS-ONLY] Failed to save position recommendations:', dbErr);
                throw dbErr; // Пробрасываем ошибку, чтобы пользователь знал о проблеме
            }
        }

        return result;
    }

    // Вспомогательные методы
    async getCurrentPrice(figi) {
        // Сначала пробуем взять цену из кеша инструментов
        try {
            const instrument = await CacheService.getInstrument(figi);
            if (instrument && typeof instrument.lastPrice === 'number' && instrument.lastPrice > 0) {
                return instrument.lastPrice;
            }
        } catch (e) {}

        // Фолбек к последней свече
        try {
            const candles = await CacheService.getCandles(figi, 'DAY', 1);
            if (candles && candles.length > 0 && candles[candles.length - 1].close > 0) {
                return candles[candles.length - 1].close;
            }
        } catch (e) {}

        // Если цена не найдена в кеше и свечах, пытаемся получить через API
        try {
            const TinkoffApiService = (await import('./TinkoffApiService.js')).default;
            const lastPrices = await TinkoffApiService.getLastPrices([figi]);
            if (lastPrices && lastPrices[figi] && typeof lastPrices[figi] === 'number' && lastPrices[figi] > 0) {
                // Обновляем кеш инструмента
                const CachedInstrument = (await import('../models/CachedInstrument.js')).default;
                await CachedInstrument.update(
                    { lastPrice: lastPrices[figi], lastPriceTime: new Date() },
                    { where: { figi } }
                );
                return lastPrices[figi];
            }
        } catch (apiError) {
            // Игнорируем ошибки API
        }

        return 0;
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
                // Безопасная отправка ошибки через WebSocket
                try {
                    const webSocketService = this.getWebSocketService();
                    if (webSocketService && typeof webSocketService.broadcastError === 'function') {
                        webSocketService.broadcastError(error);
                    }
                } catch (wsError) {
                    console.warn('Failed to broadcast error via WebSocket:', wsError.message);
                }
                // Ошибки теперь обрабатываются в IntegratedAIService
            }
        }, 30 * 60 * 1000); // 30 минут

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

        // ВАЖНО: Убеждаемся, что IntegratedAIService инициализирован перед анализом
        // Это гарантирует, что везде используются одинаковые предсказания
        // Используем прямой импорт, так как метод может вызываться из worker'а
        const IntegratedAIService = (await import('./IntegratedAIService.js')).default;
        
        if (!IntegratedAIService.isInitialized) {
            console.log('🔄 IntegratedAIService not initialized, initializing before market analysis...');
            try {
                await IntegratedAIService.initialize();
                console.log('✅ IntegratedAIService initialized successfully');
            } catch (initError) {
                console.error('❌ Failed to initialize IntegratedAIService:', initError);
                console.log('⚠️ Market analysis will continue with fallback methods');
            }
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

        // Отправляем уведомление о старте анализа
        try {
            if (OptimizedTelegramService && OptimizedTelegramService.isInitialized) {
                await OptimizedTelegramService.sendAlert('MARKET_ANALYSIS_START', 
                    `🔍 Запущен анализ рынка и портфеля\n` +
                    `Время: ${new Date().toLocaleString('ru-RU')}\n` +
                    `Статус: Анализ начат...`
                );
            }
        } catch (telegramError) {
            console.warn('Failed to send Telegram notification about analysis start:', telegramError.message);
        }

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

            // Выполняем анализ через worker
            const analysis = await this.analyzePortfolioViaWorker(portfolioItems, totalBudget, 'full');

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

            // Отправляем уведомление о завершении анализа
            try {
                if (OptimizedTelegramService && OptimizedTelegramService.isInitialized) {
                    const buyCount = analysis.buyRecommendations?.length || 0;
                    const sellCount = analysis.sellRecommendations?.length || 0;
                    const portfolioValue = analysis.portfolioValue || 0;
                    const availableBudget = analysis.availableBudget || 0;
                    
                    let message = `✅ Анализ рынка завершен\n\n`;
                    message += `📊 Результаты:\n`;
                    message += `• Рекомендаций на покупку: ${buyCount}\n`;
                    message += `• Рекомендаций на продажу: ${sellCount}\n`;
                    message += `• Стоимость портфеля: ${portfolioValue.toFixed(2)} ₽\n`;
                    message += `• Доступный бюджет: ${availableBudget.toFixed(2)} ₽\n`;
                    message += `\nВремя: ${new Date().toLocaleString('ru-RU')}`;
                    
                    await OptimizedTelegramService.sendAlert('MARKET_ANALYSIS_COMPLETE', message);
                }
            } catch (telegramError) {
                console.warn('Failed to send Telegram notification about analysis completion:', telegramError.message);
            }

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
    // Вспомогательная функция для извлечения данных из Sequelize модели или обычного объекта
    getInstrumentData(instrument) {
        if (!instrument) return null;
        
        // Если это Sequelize модель, преобразуем в обычный объект
        if (instrument.toJSON && typeof instrument.toJSON === 'function') {
            return instrument.toJSON();
        }
        
        // Если есть dataValues, используем их
        if (instrument.dataValues) {
            return instrument.dataValues;
        }
        
        // Иначе возвращаем как есть (обычный объект)
        return instrument;
    }

    async saveRecommendationsToDatabase(buyRecommendations, sellRecommendations) {
        try {
            const Recommendation = (await import('../models/Recommendation.js')).default;
            
            // Сохраняем BUY и HOLD рекомендации (все из buyRecommendations)
            for (const rec of buyRecommendations) {
                // Проверяем наличие instrument
                if (!rec.instrument) {
                    console.warn('⚠️ Skipping recommendation: missing instrument', rec);
                    continue;
                }
                
                // Получаем данные инструмента из Sequelize модели или обычного объекта
                const instrumentData = this.getInstrumentData(rec.instrument);
                if (!instrumentData || !instrumentData.figi) {
                    console.warn('⚠️ Skipping recommendation: missing figi', {
                        instrument: rec.instrument,
                        instrumentData: instrumentData
                    });
                    continue;
                }
                
                const figi = instrumentData.figi;
                
                // Правильно извлекаем confidence и score из prediction
                // ВАЖНО: score и confidence должны быть разными значениями!
                const score = typeof rec.prediction?.score === 'number' && !isNaN(rec.prediction.score) 
                    ? Math.max(0, Math.min(1, rec.prediction.score)) // Ограничиваем 0-1
                    : 0;
                
                // Для confidence используем значение из prediction, если оно есть и валидно
                // Если confidence отсутствует или равен 0, используем score * 0.8 (немного ниже score)
                // Это предотвращает ситуацию, когда confidence = score = 0.99
                let confidence;
                if (typeof rec.prediction?.confidence === 'number' && !isNaN(rec.prediction.confidence) && rec.prediction.confidence > 0) {
                    confidence = Math.max(0, Math.min(1, rec.prediction.confidence));
                } else {
                    // Если confidence отсутствует, используем score с небольшим коэффициентом
                    confidence = Math.max(0, Math.min(1, score * 0.9)); // 90% от score
                }
                
                // Формируем explanation в едином формате: объект с summary и details
                let explanation = {};
                if (rec.prediction?.explanation) {
                    if (typeof rec.prediction.explanation === 'string') {
                        // Если explanation - строка, преобразуем в объект
                        explanation = {
                            summary: rec.prediction.explanation,
                            details: rec.prediction.details || {}
                        };
                    } else if (typeof rec.prediction.explanation === 'object') {
                        // Если explanation - объект, проверяем структуру
                        if (rec.prediction.explanation.summary !== undefined) {
                            explanation = rec.prediction.explanation;
                        } else {
                            // Если нет summary, создаем его из объекта
                            explanation = {
                                summary: JSON.stringify(rec.prediction.explanation),
                                details: rec.prediction.explanation
                            };
                        }
                    }
                } else if (rec.prediction?.summary) {
                    // Если есть summary (строка или объект)
                    const summaryValue = typeof rec.prediction.summary === 'string' 
                        ? rec.prediction.summary 
                        : rec.prediction.summary.summary || JSON.stringify(rec.prediction.summary);
                    explanation = {
                        summary: summaryValue,
                        details: rec.prediction.details || {}
                    };
                } else {
                    explanation = {
                        summary: 'Анализ на основе интегрированной AI системы',
                        details: {}
                    };
                }
                
                // Формируем analysis с данными о горизонтах
                let analysis = {};
                if (rec.prediction?.horizons) {
                    // Сохраняем структурированные данные о горизонтах в analysis
                    // Включаем рекомендации по стратегиям, если они есть
                    analysis = {
                        horizons: {
                            shortTerm: {
                                name: rec.prediction.horizons.shortTerm?.name || 'Краткосрочный прогноз',
                                description: rec.prediction.horizons.shortTerm?.description || 'Прогноз на 1-3 дня',
                                model: rec.prediction.horizons.shortTerm?.model || 'LSTM',
                                score: rec.prediction.horizons.shortTerm?.score || 0,
                                confidence: rec.prediction.horizons.shortTerm?.confidence || 0,
                                recommendation: rec.prediction.horizons.shortTerm?.recommendation || 'HOLD',
                                weight: rec.prediction.horizons.shortTerm?.weight || 0,
                                horizonDays: rec.prediction.horizons.shortTerm?.horizonDays || 1,
                                // Добавляем рекомендации по стратегиям, если они есть
                                strategies: rec.prediction.horizons.shortTerm?.strategies || null
                            },
                            mediumTerm: {
                                name: rec.prediction.horizons.mediumTerm?.name || 'Среднесрочный прогноз',
                                description: rec.prediction.horizons.mediumTerm?.description || 'Прогноз на 1-4 недели',
                                model: rec.prediction.horizons.mediumTerm?.model || 'CNN',
                                score: rec.prediction.horizons.mediumTerm?.score || 0,
                                confidence: rec.prediction.horizons.mediumTerm?.confidence || 0,
                                recommendation: rec.prediction.horizons.mediumTerm?.recommendation || 'HOLD',
                                weight: rec.prediction.horizons.mediumTerm?.weight || 0,
                                horizonDays: rec.prediction.horizons.mediumTerm?.horizonDays || 21,
                                // Добавляем рекомендации по стратегиям, если они есть
                                strategies: rec.prediction.horizons.mediumTerm?.strategies || null
                            },
                            longTerm: {
                                name: rec.prediction.horizons.longTerm?.name || 'Долгосрочный прогноз',
                                description: rec.prediction.horizons.longTerm?.description || 'Прогноз на 2-3 месяца',
                                model: rec.prediction.horizons.longTerm?.model || 'Transformer',
                                score: rec.prediction.horizons.longTerm?.score || 0,
                                confidence: rec.prediction.horizons.longTerm?.confidence || 0,
                                recommendation: rec.prediction.horizons.longTerm?.recommendation || 'HOLD',
                                weight: rec.prediction.horizons.longTerm?.weight || 0,
                                horizonDays: rec.prediction.horizons.longTerm?.horizonDays || 84,
                                // Добавляем рекомендации по стратегиям, если они есть
                                strategies: rec.prediction.horizons.longTerm?.strategies || null
                            }
                        },
                        agreement: rec.prediction.agreement || null
                    };
                }
                
                // Добавляем details в explanation, если они есть и еще не добавлены
                if (rec.prediction?.details && !explanation.details) {
                    explanation.details = rec.prediction.details;
                }

                const recommendation = rec.prediction?.recommendation || 'BUY';
                
                console.log(`💾 Saving ${recommendation} recommendation for ${instrumentData.ticker || figi}: score=${score.toFixed(3)}, confidence=${confidence.toFixed(3)}`);

                // Определяем стратегию для рекомендации
                // Сначала проверяем, есть ли стратегия в самой рекомендации (для позиций портфеля)
                let strategyId = null;
                let strategy = null;
                if (rec.strategy && rec.strategy.id) {
                    strategyId = rec.strategy.id;
                    try {
                        const TradingStrategy = (await import('../models/TradingStrategy.js')).default;
                        strategy = await TradingStrategy.findByPk(strategyId);
                    } catch (e) {
                        // Игнорируем ошибки загрузки стратегии
                    }
                } else {
                    // Если стратегии нет в рекомендации, определяем её автоматически (для новых BUY)
                    try {
                        const StrategyAllocationService = (await import('./StrategyAllocationService.js')).default;
                        strategy = await StrategyAllocationService.getStrategyForRecommendation({ confidence, score });
                        if (strategy) {
                            strategyId = strategy.id;
                        }
                    } catch (strategyError) {
                        // Игнорируем ошибки определения стратегии
                    }
                }

                // Получаем текущую цену с fallback на instrumentData.lastPrice
                // Используем утилиту для надежного извлечения из Sequelize модели
                const { getField } = await import('../utils/sequelizeUtils.js');
                let currentPrice = rec.currentPrice;
                
                // Проверяем и нормализуем цену из rec.currentPrice
                if (!currentPrice || typeof currentPrice !== 'number' || isNaN(currentPrice) || currentPrice <= 0) {
                    // Пытаемся получить из instrumentData используя утилиту
                    const lastPrice = getField(rec.instrument, 'lastPrice');
                    const averagePrice = getField(rec.instrument, 'averagePrice');
                    
                    if (lastPrice && typeof lastPrice === 'number' && !isNaN(lastPrice) && lastPrice > 0) {
                        currentPrice = lastPrice;
                    } else if (averagePrice && typeof averagePrice === 'number' && !isNaN(averagePrice) && averagePrice > 0) {
                        currentPrice = averagePrice;
                    } else {
                        // Пробуем получить из instrumentData напрямую
                        const instrumentDataLastPrice = instrumentData.lastPrice;
                        const instrumentDataAveragePrice = instrumentData.averagePrice;
                        
                        if (instrumentDataLastPrice && typeof instrumentDataLastPrice === 'number' && !isNaN(instrumentDataLastPrice) && instrumentDataLastPrice > 0) {
                            currentPrice = instrumentDataLastPrice;
                        } else if (instrumentDataAveragePrice && typeof instrumentDataAveragePrice === 'number' && !isNaN(instrumentDataAveragePrice) && instrumentDataAveragePrice > 0) {
                            currentPrice = instrumentDataAveragePrice;
                        } else {
                            currentPrice = null;
                        }
                    }
                }
                
                // Если цена все еще отсутствует, пытаемся получить через API
                // ВАЖНО: Для HOLD рекомендаций особенно важно получить цену, так как она может отсутствовать в кеше
                if (!currentPrice || currentPrice === 0 || isNaN(currentPrice)) {
                    try {
                        const TinkoffApiService = (await import('./TinkoffApiService.js')).default;
                        const lastPrices = await TinkoffApiService.getLastPrices([figi]);
                        if (lastPrices && lastPrices[figi] && typeof lastPrices[figi] === 'number' && !isNaN(lastPrices[figi]) && lastPrices[figi] > 0) {
                            currentPrice = lastPrices[figi];
                            // Обновляем кеш инструмента
                            const CachedInstrument = (await import('../models/CachedInstrument.js')).default;
                            await CachedInstrument.update(
                                { lastPrice: currentPrice, lastPriceTime: new Date() },
                                { where: { figi } }
                            );
                        } else if (recommendation === 'HOLD') {
                            console.warn(`⚠️ Cannot save HOLD recommendation without price for ${figi} (${instrumentData.ticker || 'UNKNOWN'})`);
                        }
                    } catch (priceError) {
                        if (recommendation === 'HOLD') {
                            console.warn(`⚠️ Price fetch failed for HOLD recommendation ${figi} (${instrumentData.ticker || 'UNKNOWN'}):`, priceError.message);
                        }
                    }
                }
                
                // Для HOLD рекомендаций без цены - логируем предупреждение, но все равно сохраняем
                // Пользователь должен видеть рекомендацию, даже если цена временно недоступна
                if (recommendation === 'HOLD' && (!currentPrice || currentPrice === 0 || isNaN(currentPrice))) {
                    console.warn(`⚠️ Saving HOLD recommendation for ${figi} (${instrumentData.ticker || 'UNKNOWN'}) WITHOUT price - price will be 0`);
                    // Устанавливаем цену в 0, чтобы рекомендация была сохранена
                    // На фронтенде кнопка "Купить" будет отключена для таких рекомендаций
                    currentPrice = 0;
                }
                
                // Рассчитываем targetPrice, stopLoss и takeProfit
                // Используем динамический стоп-лосс на основе ATR, если доступен
                let targetPrice, stopLoss, takeProfit;
                
                if (currentPrice && currentPrice > 0) {
                    // Пытаемся использовать динамический стоп-лосс на основе ATR
                    try {
                        const RiskManagementService = (await import('./RiskManagementService.js')).default;
                        if (RiskManagementService && RiskManagementService.isInitialized && strategy) {
                            stopLoss = await RiskManagementService.calculateDynamicStopLoss(
                                figi,
                                currentPrice,
                                strategy,
                                recommendation === 'SELL' ? 'SELL' : 'BUY'
                            );
                        } else {
                            // Fallback к фиксированным процентам
                            if (recommendation === 'BUY') {
                                stopLoss = currentPrice * (1 - (strategy?.stopLossPercent || 10) / 100);
                            } else if (recommendation === 'SELL') {
                                stopLoss = currentPrice * (1 + (strategy?.stopLossPercent || 10) / 100);
                            } else {
                                stopLoss = currentPrice * (1 - (strategy?.stopLossPercent || 5) / 100);
                            }
                        }
                    } catch (error) {
                        // Fallback к фиксированным процентам при ошибке
                        if (recommendation === 'BUY') {
                            stopLoss = currentPrice * 0.9; // -10% как стоп-лосс
                        } else if (recommendation === 'SELL') {
                            stopLoss = currentPrice * 1.1; // +10% как стоп-лосс
                        } else {
                            stopLoss = currentPrice * 0.95; // -5% как стоп-лосс
                        }
                    }
                    
                    // Рассчитываем targetPrice и takeProfit
                    if (recommendation === 'BUY') {
                        targetPrice = currentPrice * 1.1; // +10% как цель
                        takeProfit = currentPrice * 1.2; // +20% как тейк-профит
                    } else if (recommendation === 'SELL') {
                        targetPrice = currentPrice * 0.9; // -10% как цель
                        takeProfit = currentPrice * 0.8; // -20% как тейк-профит
                    } else {
                        // HOLD - нейтральные значения
                        targetPrice = currentPrice * 1.05; // +5% как цель
                        takeProfit = currentPrice * 1.1; // +10% как тейк-профит
                    }
                } else {
                    targetPrice = null;
                    stopLoss = null;
                    takeProfit = null;
                }

                const recommendationData = {
                    figi: figi,
                    ticker: instrumentData.ticker || 'UNKNOWN',
                    name: instrumentData.name || 'Unknown',
                    recommendation: recommendation,
                    confidence: confidence,
                    score: score,
                    explanation: explanation,
                    analysis: analysis, // Сохраняем структурированные данные о горизонтах
                    analysisDate: new Date(), // Обновляем дату анализа
                    modelVersion: '1.0',
                    priceAtAnalysis: currentPrice || 0,
                    targetPrice: targetPrice,
                    stopLoss: stopLoss,
                    takeProfit: takeProfit,
                    sector: instrumentData.sector || 'Unknown',
                    marketCap: instrumentData.marketCap || 'Unknown',
                    isActive: true,
                    strategyId: strategyId // Добавляем ID стратегии
                };

                // Используем upsert для обновления существующей записи или создания новой
                const [savedRecommendation, created] = await Recommendation.upsert(recommendationData, {
                    returning: true
                });
                
                if (created) {
                    console.log(`✅ Created ${recommendation} recommendation for ${instrumentData.ticker || figi}`);
                } else {
                    console.log(`🔄 Updated ${recommendation} recommendation for ${instrumentData.ticker || figi}`);
                }
                
                // Отправляем торговый сигнал через WebSocket для BUY/SELL рекомендаций (только для новых)
                if (created && savedRecommendation && (savedRecommendation.recommendation === 'BUY' || savedRecommendation.recommendation === 'SELL')) {
                    try {
                        const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
                        if (WebSocketService && typeof WebSocketService.broadcastTradingSignal === 'function') {
                            WebSocketService.broadcastTradingSignal({
                                figi: savedRecommendation.figi,
                                ticker: savedRecommendation.ticker,
                                name: savedRecommendation.name,
                                signalType: savedRecommendation.recommendation,
                                confidence: savedRecommendation.confidence,
                                entryPrice: savedRecommendation.priceAtAnalysis || currentPrice || 0,
                                stopLoss: savedRecommendation.stopLoss,
                                takeProfit: savedRecommendation.takeProfit || savedRecommendation.targetPrice
                            });
                        }
                    } catch (wsError) {
                        console.warn('⚠️ Could not broadcast trading signal:', wsError.message);
                    }

                    // Автоматическое создание заявки для высокоуверенных сигналов (только для новых)
                    try {
                        const SettingsService = (await import('./SettingsService.js')).default;
                        const TradingRequestService = (await import('./TradingRequestService.js')).default;
                        const settings = await SettingsService.getSettings();
                        const autoTradeEnabled = settings.auto_trade_enabled !== false; // По умолчанию включено
                        const minConfidence = settings.auto_trade_min_confidence || 0.85;
                        const minScore = settings.auto_trade_min_score || 0.8;
                        const minAgreement = settings.auto_trade_min_agreement || 0.9;

                        if (autoTradeEnabled && 
                            savedRecommendation.confidence >= minConfidence && 
                            savedRecommendation.score >= minScore) {
                            
                            // Получаем agreement из IntegratedAIService
                            let agreement = null;
                            try {
                                const IntegratedAIService = (await import('./IntegratedAIService.js')).default;
                                if (IntegratedAIService.isInitialized) {
                                    const integratedRec = await IntegratedAIService.getIntegratedRecommendation(savedRecommendation.figi);
                                    agreement = integratedRec.agreement || null;
                                }
                            } catch (error) {
                                console.warn('⚠️ Could not get agreement for auto-trade:', error.message);
                            }

                            const meetsAgreement = agreement === null || agreement >= minAgreement;

                            if (meetsAgreement) {
                                // Автоматически создаем заявку
                                console.log(`🤖 Auto-creating trading request for ${savedRecommendation.ticker} (confidence=${savedRecommendation.confidence.toFixed(2)}, score=${savedRecommendation.score.toFixed(2)})`);
                                await TradingRequestService.createTradingRequest(savedRecommendation.figi, {
                                    strategyId: strategyId || undefined
                                });
                            }
                        }
                    } catch (autoTradeError) {
                        console.warn('⚠️ Could not auto-create trading request:', autoTradeError.message);
                        // Не прерываем выполнение, если не удалось создать заявку
                    }
                }
            }

            // Сохраняем SELL рекомендации (в том числе HOLD для позиций)
            for (const rec of sellRecommendations) {
                let instrument = rec.instrument || rec.item;
                if (!instrument) {
                    console.warn('⚠️ Skipping SELL recommendation: missing instrument/item');
                    continue;
                }
                
                // Получаем данные инструмента из Sequelize модели или обычного объекта
                let instrumentData = this.getInstrumentData(instrument);
                if (!instrumentData || !instrumentData.figi) {
                    console.warn('⚠️ Skipping SELL recommendation: missing figi', {
                        instrument: instrument,
                        instrumentData: instrumentData
                    });
                    continue;
                }
                
                const figi = instrumentData.figi;
                
                // ВАЖНО: Для SELL рекомендаций из портфеля instrument может быть обычным объектом (item)
                // Нужно загрузить инструмент из кеша, чтобы получить доступ к lastPrice
                if (!instrument.toJSON || !instrument.dataValues) {
                    try {
                        const CacheService = ServiceManager.getService('CacheService');
                        const cachedInstrument = await CacheService.getInstrument(figi);
                        if (cachedInstrument) {
                            instrument = cachedInstrument; // Используем Sequelize модель из кеша
                            instrumentData = this.getInstrumentData(instrument); // Обновляем instrumentData
                        }
                    } catch (cacheError) {
                        // Игнорируем ошибки загрузки из кеша
                    }
                }

                // Правильно извлекаем score и confidence из prediction
                // ВАЖНО: score и confidence должны быть разными значениями!
                const score = typeof rec.prediction?.score === 'number' && !isNaN(rec.prediction.score)
                    ? Math.max(0, Math.min(1, rec.prediction.score)) // Ограничиваем 0-1
                    : 0;
                
                // Для confidence используем значение из prediction, если оно есть и валидно
                // Если confidence отсутствует или равен 0, используем score * 0.8 (немного ниже score)
                // Это предотвращает ситуацию, когда confidence = score = 0.99
                let confidence;
                if (typeof rec.prediction?.confidence === 'number' && !isNaN(rec.prediction.confidence) && rec.prediction.confidence > 0) {
                    confidence = Math.max(0, Math.min(1, rec.prediction.confidence));
                } else {
                    // Если confidence отсутствует, используем score с небольшим коэффициентом
                    confidence = Math.max(0, Math.min(1, score * 0.9)); // 90% от score
                }
                // Получаем текущую цену с fallback на instrumentData.lastPrice
                // Используем утилиту для надежного извлечения из Sequelize модели
                const { getField: getFieldSell } = await import('../utils/sequelizeUtils.js');
                let currentPrice = rec.currentPrice;
                
                // Проверяем и нормализуем цену из rec.currentPrice
                if (!currentPrice || typeof currentPrice !== 'number' || isNaN(currentPrice) || currentPrice <= 0) {
                    // Пытаемся получить из instrument используя утилиту (надежнее чем instrumentData)
                    const lastPrice = getFieldSell(instrument, 'lastPrice');
                    const averagePrice = getFieldSell(instrument, 'averagePrice');
                    
                    if (lastPrice && typeof lastPrice === 'number' && !isNaN(lastPrice) && lastPrice > 0) {
                        currentPrice = lastPrice;
                    } else if (averagePrice && typeof averagePrice === 'number' && !isNaN(averagePrice) && averagePrice > 0) {
                        currentPrice = averagePrice;
                    } else {
                        // Fallback на instrumentData (может быть уже преобразованным объектом)
                        currentPrice = instrumentData.lastPrice || instrumentData.averagePrice || null;
                    }
                }
                
                // Если цена все еще отсутствует, пытаемся получить через API
                if (!currentPrice || currentPrice === 0 || isNaN(currentPrice)) {
                    try {
                        const TinkoffApiService = (await import('./TinkoffApiService.js')).default;
                        const lastPrices = await TinkoffApiService.getLastPrices([figi]);
                        if (lastPrices && lastPrices[figi] && typeof lastPrices[figi] === 'number' && !isNaN(lastPrices[figi]) && lastPrices[figi] > 0) {
                            currentPrice = lastPrices[figi];
                            // Обновляем кеш инструмента
                            const CachedInstrument = (await import('../models/CachedInstrument.js')).default;
                            await CachedInstrument.update(
                                { lastPrice: currentPrice, lastPriceTime: new Date() },
                                { where: { figi } }
                            );
                        }
                    } catch (priceError) {
                        // Игнорируем ошибки получения цены через API
                    }
                }
                
                // Если цена все еще отсутствует, используем 0 (но это нежелательно)
                if (!currentPrice || currentPrice === 0 || isNaN(currentPrice)) {
                    currentPrice = 0;
                }
                
                // Определяем recommendation на основе score, если не указан явно
                let recommendation = rec.prediction?.recommendation;
                if (!recommendation) {
                    // Для позиций портфеля: SELL если score < 0.3, иначе HOLD
                    recommendation = score < 0.3 ? 'SELL' : 'HOLD';
                }

                // Формируем explanation в едином формате: объект с summary и details
                let explanation = {};
                if (rec.prediction?.explanation) {
                    if (typeof rec.prediction.explanation === 'string') {
                        // Если explanation - строка, преобразуем в объект
                        explanation = {
                            summary: rec.prediction.explanation,
                            details: rec.prediction.details || {}
                        };
                    } else if (typeof rec.prediction.explanation === 'object') {
                        // Если explanation - объект, проверяем структуру
                        if (rec.prediction.explanation.summary !== undefined) {
                            explanation = rec.prediction.explanation;
                        } else {
                            // Если нет summary, создаем его из объекта
                            explanation = {
                                summary: JSON.stringify(rec.prediction.explanation),
                                details: rec.prediction.explanation
                            };
                        }
                    }
                } else if (rec.prediction?.summary) {
                    // Если есть summary (строка или объект)
                    const summaryValue = typeof rec.prediction.summary === 'string' 
                        ? rec.prediction.summary 
                        : rec.prediction.summary.summary || JSON.stringify(rec.prediction.summary);
                    explanation = {
                        summary: summaryValue,
                        details: rec.prediction.details || {}
                    };
                } else {
                    explanation = {
                        summary: 'Анализ на основе интегрированной AI системы',
                        details: {}
                    };
                }
                
                // Формируем analysis с данными о горизонтах
                let analysis = {};
                if (rec.prediction?.horizons) {
                    // Сохраняем структурированные данные о горизонтах в analysis
                    // Включаем рекомендации по стратегиям, если они есть
                    analysis = {
                        horizons: {
                            shortTerm: {
                                name: rec.prediction.horizons.shortTerm?.name || 'Краткосрочный прогноз',
                                description: rec.prediction.horizons.shortTerm?.description || 'Прогноз на 1-3 дня',
                                model: rec.prediction.horizons.shortTerm?.model || 'LSTM',
                                score: rec.prediction.horizons.shortTerm?.score || 0,
                                confidence: rec.prediction.horizons.shortTerm?.confidence || 0,
                                recommendation: rec.prediction.horizons.shortTerm?.recommendation || 'HOLD',
                                weight: rec.prediction.horizons.shortTerm?.weight || 0,
                                horizonDays: rec.prediction.horizons.shortTerm?.horizonDays || 1,
                                // Добавляем рекомендации по стратегиям, если они есть
                                strategies: rec.prediction.horizons.shortTerm?.strategies || null
                            },
                            mediumTerm: {
                                name: rec.prediction.horizons.mediumTerm?.name || 'Среднесрочный прогноз',
                                description: rec.prediction.horizons.mediumTerm?.description || 'Прогноз на 1-4 недели',
                                model: rec.prediction.horizons.mediumTerm?.model || 'CNN',
                                score: rec.prediction.horizons.mediumTerm?.score || 0,
                                confidence: rec.prediction.horizons.mediumTerm?.confidence || 0,
                                recommendation: rec.prediction.horizons.mediumTerm?.recommendation || 'HOLD',
                                weight: rec.prediction.horizons.mediumTerm?.weight || 0,
                                horizonDays: rec.prediction.horizons.mediumTerm?.horizonDays || 21,
                                // Добавляем рекомендации по стратегиям, если они есть
                                strategies: rec.prediction.horizons.mediumTerm?.strategies || null
                            },
                            longTerm: {
                                name: rec.prediction.horizons.longTerm?.name || 'Долгосрочный прогноз',
                                description: rec.prediction.horizons.longTerm?.description || 'Прогноз на 2-3 месяца',
                                model: rec.prediction.horizons.longTerm?.model || 'Transformer',
                                score: rec.prediction.horizons.longTerm?.score || 0,
                                confidence: rec.prediction.horizons.longTerm?.confidence || 0,
                                recommendation: rec.prediction.horizons.longTerm?.recommendation || 'HOLD',
                                weight: rec.prediction.horizons.longTerm?.weight || 0,
                                horizonDays: rec.prediction.horizons.longTerm?.horizonDays || 84,
                                // Добавляем рекомендации по стратегиям, если они есть
                                strategies: rec.prediction.horizons.longTerm?.strategies || null
                            }
                        },
                        agreement: rec.prediction.agreement || null
                    };
                }
                
                // Добавляем details в explanation, если они есть и еще не добавлены
                if (rec.prediction?.details && !explanation.details) {
                    explanation.details = rec.prediction.details;
                }


                // Определяем стратегию для SELL рекомендации (из позиции портфеля)
                let strategyId = null;
                let strategy = null;
                if (rec.strategy && rec.strategy.id) {
                    // Используем стратегию из рекомендации (если позиция была куплена по стратегии)
                    strategyId = rec.strategy.id;
                    try {
                        const TradingStrategy = (await import('../models/TradingStrategy.js')).default;
                        strategy = await TradingStrategy.findByPk(strategyId);
                    } catch (e) {
                        // Игнорируем ошибки загрузки стратегии
                    }
                }

                // Рассчитываем стоп-лосс: используем динамический ATR-based стоп-лосс, если доступен
                let stopLoss = null;
                if (currentPrice && currentPrice > 0) {
                    try {
                        const RiskManagementService = (await import('./RiskManagementService.js')).default;
                        if (RiskManagementService && RiskManagementService.isInitialized && strategy) {
                            // Используем динамический стоп-лосс на основе ATR
                            stopLoss = await RiskManagementService.calculateDynamicStopLoss(
                                figi,
                                currentPrice,
                                strategy,
                                'SELL'
                            );
                        } else {
                            // Fallback к фиксированному проценту
                            stopLoss = currentPrice * (1 + (strategy?.stopLossPercent || 10) / 100);
                        }
                    } catch (error) {
                        // Fallback к фиксированному проценту при ошибке
                        stopLoss = currentPrice * 1.1; // +10% как стоп-лосс
                    }
                }

                const recommendationData = {
                    figi: figi,
                    ticker: instrumentData.ticker || 'UNKNOWN',
                    name: instrumentData.name || 'Unknown',
                    recommendation: recommendation,
                    confidence: confidence,
                    score: score,
                    explanation: explanation,
                    analysis: analysis, // Сохраняем структурированные данные о горизонтах
                    analysisDate: new Date(), // Обновляем дату анализа
                    modelVersion: '1.0',
                    priceAtAnalysis: currentPrice || 0,
                    targetPrice: currentPrice && currentPrice > 0 ? currentPrice * 0.9 : null, // -10% как цель
                    stopLoss: stopLoss,
                    takeProfit: currentPrice && currentPrice > 0 ? currentPrice * 0.8 : null, // -20% как тейк-профит
                    sector: instrumentData.sector || 'Unknown',
                    marketCap: instrumentData.marketCap || 'Unknown',
                    isActive: true,
                    strategyId: strategyId // Добавляем ID стратегии для позиций портфеля
                };

                // Используем upsert для обновления существующей записи или создания новой
                const [savedRecommendation, created] = await Recommendation.upsert(recommendationData, {
                    returning: true
                });
                
                if (created) {
                    console.log(`✅ Created ${recommendation} recommendation for ${instrumentData.ticker || figi}`);
                } else {
                    console.log(`🔄 Updated ${recommendation} recommendation for ${instrumentData.ticker || figi}`);
                }
                
                // Отправляем торговый сигнал через WebSocket для BUY/SELL рекомендаций (только для новых)
                if (created && savedRecommendation && (savedRecommendation.recommendation === 'BUY' || savedRecommendation.recommendation === 'SELL')) {
                    try {
                        const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
                        if (WebSocketService && typeof WebSocketService.broadcastTradingSignal === 'function') {
                            WebSocketService.broadcastTradingSignal({
                                figi: savedRecommendation.figi,
                                ticker: savedRecommendation.ticker,
                                name: savedRecommendation.name,
                                signalType: savedRecommendation.recommendation,
                                confidence: savedRecommendation.confidence,
                                entryPrice: savedRecommendation.priceAtAnalysis || currentPrice || 0,
                                stopLoss: savedRecommendation.stopLoss,
                                takeProfit: savedRecommendation.takeProfit || savedRecommendation.targetPrice
                            });
                        }
                    } catch (wsError) {
                        console.warn('⚠️ Could not broadcast trading signal:', wsError.message);
                    }
                }
            }

            const buyCount = buyRecommendations.filter(r => r.prediction?.recommendation === 'BUY').length;
            const holdCount = buyRecommendations.filter(r => r.prediction?.recommendation === 'HOLD').length;
            const sellCount = sellRecommendations.length;
            
            console.log(`💾 Saved recommendations to database:`);
            console.log(`   ✅ BUY: ${buyCount}`);
            console.log(`   ⏸️ HOLD: ${holdCount}`);
            console.log(`   ❌ SELL: ${sellCount}`);
            console.log(`   📊 Total: ${buyRecommendations.length + sellRecommendations.length}`);

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
        let loaded = await this.loadModel();
        
        // Если общая модель не найдена, пробуем загрузить любую per-FIGI модель из файлов
        if (!loaded || !this.model) {
            console.log('📥 Общая модель не найдена, сканируем папку models для поиска per-FIGI моделей...');
            try {
                // Сканируем папку models напрямую
                const files = await fs.readdir(this.modelPath);
                const modelFiles = files.filter(f => f.endsWith('_model.json') && !f.includes('_best_'));
                
                console.log(`📂 Найдено ${modelFiles.length} per-FIGI моделей в папке models`);
                
                if (modelFiles.length > 0) {
                    // Берем первую найденную модель
                    const firstModelFile = modelFiles[0];
                    const figi = firstModelFile.replace('_model.json', '');
                    
                    console.log(`📥 Пытаемся загрузить модель для FIGI: ${figi}`);
                    loaded = await this.loadModel(figi);
                    
                    if (loaded && this.model) {
                        console.log(`✅ Загружена per-FIGI модель для ${figi} как общая модель`);
                    } else {
                        // Пробуем через OptimizedTrainingService
                        console.log('📥 Пробуем загрузить через OptimizedTrainingService...');
                        const instruments = await CacheService.getAllInstruments(20);
                        
                        for (const instrument of instruments) {
                            try {
                                const modelFromTraining = await OptimizedTrainingService.getModel(instrument.figi);
                                if (modelFromTraining) {
                                    this.model = modelFromTraining;
                                    loaded = true;
                                    console.log(`✅ Загружена модель для ${instrument.ticker} (${instrument.figi}) через OptimizedTrainingService`);
                                    break;
                                }
                            } catch (err) {
                                // Продолжаем поиск
                            }
                        }
                    }
                } else {
                    // Если файлов нет, пробуем через OptimizedTrainingService
                    console.log('📥 Файлов моделей не найдено, пробуем через OptimizedTrainingService...');
                    const instruments = await CacheService.getAllInstruments(20);
                    
                    for (const instrument of instruments) {
                        try {
                            const modelFromTraining = await OptimizedTrainingService.getModel(instrument.figi);
                            if (modelFromTraining) {
                                this.model = modelFromTraining;
                                loaded = true;
                                console.log(`✅ Загружена модель для ${instrument.ticker} (${instrument.figi})`);
                                break;
                            }
                        } catch (err) {
                            // Продолжаем поиск
                        }
                    }
                }
                
                if (!loaded || !this.model) {
                    console.log('⚠️ Обученные модели не найдены ни в файлах, ни в OptimizedTrainingService');
                }
            } catch (err) {
                console.warn('⚠️ Ошибка при поиске моделей:', err.message);
            }
        }
        
        if (loaded && this.model) {
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
            
            // Активируем нейросеть, если модель загружена
            if (!this.isActive) {
                await this.setStatus('active');
                console.log('✅ Нейросеть автоматически активирована');
            }
        } else {
            console.log('⚠️ Модель не найдена, будет создана при первом обучении');
            // Не создаем модель заранее, так как размер входных данных зависит от prepareTrainingData
            // Модель будет создана автоматически при обучении с правильным размером входных данных
            console.log('📝 Модель будет создана при обучении с адаптивным размером входных данных');
        }
        
        // Устанавливаем флаг инициализации
        this.isInitialized = true;
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
            
            // Устанавливаем флаг остановки перед очисткой ресурсов
            this.isStopping = true;
            
            // Очищаем интервал анализа
            if (this.analysisInterval) {
                clearInterval(this.analysisInterval);
                this.analysisInterval = null;
            }
            
            // Сбрасываем флаги
            this.isTraining = false;
            this.isBatchTraining = false;
            this.status = 'idle';
            this.isAnalyzing = false;
            
            // Завершаем все worker процессы анализа
            if (this.analysisWorkers && this.analysisWorkers.size > 0) {
                console.log(`🛑 Terminating ${this.analysisWorkers.size} analysis worker(s)...`);
                this.analysisWorkers.forEach(worker => {
                    if (worker && worker.terminate) {
                        try {
                            worker.terminate();
                        } catch (error) {
                            console.warn('⚠️ Error terminating worker:', error.message);
                        }
                    }
                });
                this.analysisWorkers.clear();
            }
            
            console.log('✅ Neural Network Service stopped');
        } catch (error) {
            console.error('❌ Error stopping Neural Network Service:', error);
            // Не пробрасываем ошибку дальше при остановке
        } finally {
            this.isStopping = false;
        }
    }
}

export default new NeuralNetworkService();