import * as tf from '@tensorflow/tfjs';
import ModelManager from '../utils/ModelManager.js';
import CacheService from './CacheService.js';
import OptimizedDataService from './OptimizedDataService.js';
import { getService } from './GlobalServiceManager.js';
import ServiceManager from './ServiceManager.js';

/**
 * Сервис Meta-Learning (обучение обучению)
 * Позволяет быстро адаптировать модели к новым задачам и рыночным условиям
 */
class MetaLearningService {
    constructor() {
        this.metaModel = null;
        this.knowledgeBase = [];
        this.isInitialized = false;
        this.isTraining = false;
        this.isAdapting = false;
        this.trainingFigiLocks = new Set();
        this.lastAdaptationTime = null;
        this.currentTask = null;
        this.config = {
            metaLearningRate: 0.001,
            adaptationRate: 0.01,
            metaBatchSize: 16,
            supportSetSize: 32,
            querySetSize: 16,
            taskEmbeddingSize: 64
        };
    }

    /**
     * Инициализация Meta-Learning системы
     */
    async initialize() {
        try {
            // Сначала пытаемся загрузить существующую мета-модель
            await this.loadMetaModel();
            
            // Если модель не загружена, создаем новую
            if (!this.metaModel) {
                this.metaModel = this.createMetaModel();
                // Сохраняем созданную модель
                try {
                    const ModelManager = (await import('../utils/ModelManager.js')).default;
                    const success = await ModelManager.saveModel(this.metaModel, 'meta_model/meta_model');
                    if (success) {
                        console.log(`✅ Saved newly created meta-model`);
                    } else {
                        console.warn(`⚠️ Failed to save newly created meta-model`);
                    }
                } catch (saveError) {
                    console.warn(`⚠️ Error saving newly created meta-model:`, saveError.message);
                }
            }
            
            // Загружаем базу знаний
            await this.loadKnowledgeBase();
            
            this.isInitialized = true;
        } catch (error) {
            const LoggerService = (await import('./LoggerService.js')).default;
            LoggerService.error('Failed to initialize Meta-Learning Service', {
                service: 'MetaLearningService',
                operation: 'initialize',
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
            throw error;
        }
    }

    /**
     * Создание мета-модели
     */
    createMetaModel() {
        console.log(`🧠 Создание мета-модели (MetaLearningService)...`);
        console.log(`   📊 Размер эмбеддинга задачи: ${this.config.taskEmbeddingSize}`);
        
        // L2 регуляризация для предотвращения переобучения
        const l2Regularizer = tf.regularizers.l2({ l2: 0.001 });
        
        const model = tf.sequential({
            layers: [
                tf.layers.dense({
                    units: 128,
                    activation: 'relu',
                    inputShape: [this.config.taskEmbeddingSize],
                    kernelInitializer: 'heUniform',
                    kernelRegularizer: l2Regularizer // L2 регуляризация
                }),
                tf.layers.dropout({ rate: 0.25 }), // Актуализированный dropout
                tf.layers.dense({ 
                    units: 64, 
                    activation: 'relu',
                    kernelInitializer: 'heUniform',
                    kernelRegularizer: l2Regularizer // L2 регуляризация
                }),
                tf.layers.dropout({ rate: 0.2 }), // Актуализированный dropout
                tf.layers.dense({ 
                    units: 32, 
                    activation: 'relu',
                    kernelInitializer: 'heUniform',
                    kernelRegularizer: l2Regularizer // L2 регуляризация
                }),
                tf.layers.dense({ 
                    units: 10, 
                    activation: 'linear',
                    kernelInitializer: 'glorotUniform'
                    // Выходной слой без L2 для сохранения предсказательной способности
                }) // Параметры адаптации
            ]
        });

        model.compile({
            optimizer: tf.train.adam(this.config.metaLearningRate),
            loss: 'meanSquaredError',
            metrics: ['mae']
        });

        const totalParams = model.countParams();
        console.log(`   ✅ Мета-модель успешно создана: ${model.layers.length} слоев, ${totalParams.toLocaleString()} параметров`);
        console.log(`   📐 Архитектура: Dense(128) -> Dense(64) -> Dense(32) -> Dense(10)`);
        console.log(`   ⚙️  Параметры: metaLearningRate=${this.config.metaLearningRate}, loss=meanSquaredError`);

        return model;
    }

    /**
     * Создание эмбеддинга задачи
     */
    createTaskEmbedding(marketData, taskType, performance) {
        const embedding = new Array(this.config.taskEmbeddingSize).fill(0);
        
        // Рыночные характеристики (5 значений)
        embedding[0] = marketData.volatility || 0;
        embedding[1] = marketData.trend || 0;
        embedding[2] = marketData.volume_ratio || 1;
        embedding[3] = marketData.rsi || 50;
        embedding[4] = marketData.macd || 0;
        
        // Временные характеристики (3 значения)
        const now = new Date();
        embedding[5] = now.getHours() / 23;
        embedding[6] = now.getDay() / 6;
        embedding[7] = now.getMonth() / 11;
        
        // Производительность (4 значения)
        embedding[8] = performance.accuracy || 0;
        embedding[9] = performance.sharpe || 0;
        embedding[10] = performance.maxDrawdown || 0;
        embedding[11] = performance.winRate || 0;
        
        // Тип задачи (5 значений) - one-hot кодирование
        const taskTypes = ['price_prediction', 'trend_classification', 'volatility_forecasting', 'sentiment_analysis', 'risk_assessment'];
        const taskIndex = taskTypes.indexOf(taskType);
        if (taskIndex >= 0) {
            embedding[12 + taskIndex] = 1;
        }
        
        // Дополнение до 64 значений нулями (более стабильно чем случайный шум)
        for (let i = 17; i < this.config.taskEmbeddingSize; i++) {
            embedding[i] = 0; // Нулевое заполнение для стабильности
        }
        
        return embedding;
    }

    /**
     * Обучение Meta-Learning (алиас для adaptToTask)
     */
    async train(figi, options = {}) {
        // Получаем TrainingStatusService один раз
        const trainingStatusService = getService('TrainingStatusService');
        
        try {
            // Глобальный лок для Meta
            if (this.isTraining) {
                console.warn(`⚠️ Meta-learning already in progress, skipping new start for ${figi}`);
                return { success: false, error: 'Meta-learning already in progress' };
            }
            
            // Обновляем текущую задачу и время
            this.currentTask = `Обучение для ${figi}`;
            this.lastAdaptationTime = new Date().toISOString();
            this.isAdapting = true;
            
            // Per-FIGI лок
            if (this.trainingFigiLocks.has(figi)) {
                console.warn(`⚠️ Meta-learning already running for ${figi}, skipping duplicate start`);
                return { success: false, error: 'Meta-learning already running for this FIGI' };
            }
            this.isTraining = true;
            this.isAdapting = true;
            this.trainingFigiLocks.add(figi);
            
            // Обновляем текущую задачу и время
            this.currentTask = `Обучение для ${figi}`;
            this.lastAdaptationTime = new Date().toISOString();
            
            // Обновляем статус обучения
            if (trainingStatusService) {
                trainingStatusService.startTraining('metaLearning', 1);
            }
            
            // Получаем данные для задачи (skipUpdate = true - режим обучения, не делаем запросы к API)
            const candles = await CacheService.getCandles(figi, 'DAY', 30, true);
            if (candles.length < 10) {
                throw new Error(`Insufficient data: ${candles.length} candles`);
            }
            
            // Подготовим реальные фичи/метки для support-set
            const { features, labels } = await OptimizedDataService.prepareTrainingData(candles, 20, 3, figi);
            if (!features.length) {
                throw new Error('No features prepared for meta-learning');
            }

            const inputSize = features[0].length;
            const supportCount = Math.min(features.length, options.supportSetSize || this.config.supportSetSize);
            const supportSet = Array.from({ length: supportCount }).map((_, i) => ({
                features: features[i],
                labels: [labels[i]]
            }));

            // Создаем задачу
            const taskData = {
                figi,
                candles,
                taskType: 'price_prediction',
                marketData: candles.slice(-10),
                performance: { accuracy: 0.5, profit: 0 },
                supportSet
            };

            // Базовая модель под реальный размер признаков
            const baseModel = this.createBaseModel(inputSize);

            // Адаптируемся к задаче
            const result = await this.adaptToTask(taskData, baseModel, options.adaptationSteps || 5);
            
            // Обновляем время завершения адаптации
            this.lastAdaptationTime = new Date().toISOString();
            this.currentTask = `Завершено: ${figi}`;
            
            // Завершаем обучение
            if (trainingStatusService) {
                trainingStatusService.completeTraining('metaLearning', true);
            }
            
            return {
                success: true,
                figi,
                result,
                adaptationSteps: options.adaptationSteps || 5
            };
            
        } catch (error) {
            console.error(`❌ Meta-learning failed for ${figi}:`, error);
            
            // Завершаем обучение с ошибкой
            if (trainingStatusService) {
                trainingStatusService.completeTraining('metaLearning', false);
            }
            
            // Отправляем алерт в Telegram
            try {
                const OptimizedTelegramService = (await import('./OptimizedTelegramService.js')).default;
                if (OptimizedTelegramService.isInitialized) {
                    await OptimizedTelegramService.sendAlert(
                        'META_LEARNING_TRAINING_ERROR',
                        `❌ <b>ОШИБКА META-LEARNING ОБУЧЕНИЯ</b>\n\n📈 Инструмент: <b>${figi}</b>\n🔍 Ошибка: ${error.message}\n⏰ Время: ${new Date().toLocaleString('ru-RU')}`,
                        'error'
                    );
                }
            } catch (telegramError) {
                console.error('❌ Failed to send meta-learning training error alert:', telegramError.message);
            }
            
            throw error;
        }
        finally {
            this.isTraining = false;
            this.isAdapting = false;
            try { this.trainingFigiLocks.delete(figi); } catch {}
        }
    }

    /**
     * Создание базовой модели для адаптации
     */
    createBaseModel(inputSize = 10) {
        // L2 регуляризация для предотвращения переобучения
        const l2Regularizer = tf.regularizers.l2({ l2: 0.001 });
        
        const model = tf.sequential({
            layers: [
                tf.layers.dense({
                    inputShape: [inputSize],
                    units: 32,
                    activation: 'relu',
                    kernelRegularizer: l2Regularizer // L2 регуляризация
                }),
                tf.layers.dropout({ rate: 0.2 }), // Добавляем dropout для регуляризации
                tf.layers.dense({
                    units: 16,
                    activation: 'relu',
                    kernelRegularizer: l2Regularizer // L2 регуляризация
                }),
                tf.layers.dense({
                    units: 1,
                    activation: 'linear'
                    // Выходной слой без L2 для сохранения предсказательной способности
                })
            ]
        });
        
        model.compile({
            optimizer: tf.train.adam(0.001),
            loss: 'meanSquaredError',
            metrics: ['mae']
        });
        
        return model;
    }

    /**
     * Адаптация к задаче
     */
    async adaptToTask(taskData, targetModel, adaptationSteps = 5) {
        try {
            if (!this.isInitialized) {
                throw new Error('Meta-Learning not initialized');
            }


            // Создаем эмбеддинг задачи
            const taskEmbedding = this.createTaskEmbedding(
                taskData.marketData,
                taskData.taskType,
                taskData.performance
            );
            
            // Получаем параметры адаптации от мета-модели
            const adaptationParams = await this.getAdaptationParameters(taskEmbedding);
            
            // Применяем адаптацию к целевой модели
            const adaptedModel = await this.applyAdaptation(targetModel, adaptationParams);
            
            // Выполняем несколько шагов градиентного спуска
            for (let step = 0; step < adaptationSteps; step++) {
                await this.performAdaptationStep(adaptedModel, taskData.supportSet);
            }
            
            // Сохраняем задачу в базу знаний
            await this.saveTaskToKnowledgeBase(taskData, adaptationParams);
            
            return adaptedModel;
            
        } catch (error) {
            console.error('❌ Task adaptation failed:', error);
            // Временный алерт в Telegram
            try {
                const OptimizedTelegramService = (await import('./OptimizedTelegramService.js')).default;
                await OptimizedTelegramService.sendAlert('META_LEARNING_ERROR', {
                    error: error.message,
                    context: 'Task Adaptation',
                    timestamp: new Date().toISOString()
                });
            } catch (telegramError) {
                console.error('Failed to send Telegram alert:', telegramError);
            }
            throw error;
        }
    }

    /**
     * Получение параметров адаптации от мета-модели
     */
    async getAdaptationParameters(taskEmbedding) {
        // Убеждаемся, что taskEmbedding - массив, и создаем тензор с явной формой
        const embeddingArray = Array.isArray(taskEmbedding[0]) ? taskEmbedding : [taskEmbedding];
        const inputTensor = tf.tensor2d(embeddingArray, [embeddingArray.length, embeddingArray[0].length]);
        const prediction = this.metaModel.predict(inputTensor);
        const params = await prediction.data();
        
        inputTensor.dispose();
        prediction.dispose();
        
        return Array.from(params);
    }

    /**
     * Применение адаптации к модели
     */
    async applyAdaptation(targetModel, adaptationParams) {
        if (!targetModel) {
            throw new Error('Target model is null - cannot apply adaptation');
        }
        
        // Получаем текущие веса модели
        const currentWeights = targetModel.getWeights();
        
        // Применяем адаптацию к каждому слою
        const adaptedWeights = await Promise.all(currentWeights.map(async (weight, layerIndex) => {
            // Используем параметр адаптации для этого слоя
            const adaptationFactor = adaptationParams[layerIndex % adaptationParams.length];
            
            // Получаем данные весов как плоский массив
            const weightData = await weight.data();
            const weightArray = Array.from(weightData);
            
            // Применяем адаптацию ко всем весам слоя
            const adaptedData = weightArray.map(value => 
                value * (1 + adaptationFactor * 0.1) // Небольшая адаптация
            );
            
            // Создаем новый тензор с той же формой
            return tf.tensor(adaptedData, weight.shape, weight.dtype);
        }));
        
        // Создаем новую модель с адаптированными весами под тот же input size
        const inputSize = targetModel.inputs?.[0]?.shape?.[1] || 10;
        const adaptedModel = this.createBaseModel(inputSize);
        adaptedModel.setWeights(adaptedWeights);
        
        return adaptedModel;
    }

    /**
     * Выполнение шага адаптации
     */
    async performAdaptationStep(model, supportSet) {
        if (!supportSet || supportSet.length === 0) return;
        
        // Подготавливаем данные
        const features = supportSet.map(item => item.features);
        const labels = supportSet.map(item => item.labels);
        
        // Убеждаемся, что features и labels - массивы массивов, и указываем форму явно
        const featuresShape = [features.length, features[0]?.length || 0];
        const labelsShape = [labels.length, Array.isArray(labels[0]) ? labels[0].length : 1];
        const xs = tf.tensor2d(features, featuresShape);
        const labelsArray = labels.map(l => Array.isArray(l) ? l : [l]);
        const ys = tf.tensor2d(labelsArray, labelsShape);
        
        // Один шаг обучения
        await model.fit(xs, ys, {
            epochs: 1,
            verbose: 0,
            batchSize: Math.min(8, features.length)
        });
        
        xs.dispose();
        ys.dispose();
    }

    /**
     * Обучение мета-модели
     */
    async trainMetaModel(tasks) {
        try {

            const metaFeatures = [];
            const metaLabels = [];
            
            for (const task of tasks) {
                const taskEmbedding = this.createTaskEmbedding(
                    task.marketData,
                    task.taskType,
                    task.performance
                );
                
                metaFeatures.push(taskEmbedding);
                metaLabels.push(task.adaptationParams || new Array(10).fill(0));
            }
            
            // Убеждаемся, что metaFeatures и metaLabels - массивы массивов, и указываем форму явно
            const featuresShape = [metaFeatures.length, metaFeatures[0]?.length || 0];
            const labelsShape = [metaLabels.length, Array.isArray(metaLabels[0]) ? metaLabels[0].length : 1];
            const featuresTensor = tf.tensor2d(metaFeatures, featuresShape);
            const labelsArray = metaLabels.map(l => Array.isArray(l) ? l : [l]);
            const labelsTensor = tf.tensor2d(labelsArray, labelsShape);
            
            // Обучение мета-модели
            const history = await this.metaModel.fit(featuresTensor, labelsTensor, {
                epochs: 10,
                batchSize: this.config.metaBatchSize,
                validationSplit: 0.2,
                verbose: 0,
                callbacks: {
                    onEpochEnd: (epoch, logs) => {
                        this.broadcastMetaTrainingProgress(epoch, logs);
                    }
                }
            });
            
            featuresTensor.dispose();
            labelsTensor.dispose();
            
            return history;
            
        } catch (error) {
            console.error('❌ Meta-model training failed:', error);
            // Временный алерт в Telegram
            try {
                const OptimizedTelegramService = (await import('./OptimizedTelegramService.js')).default;
                await OptimizedTelegramService.sendAlert('META_LEARNING_TRAINING_ERROR', {
                    error: error.message,
                    context: 'Meta-Model Training',
                    timestamp: new Date().toISOString()
                });
            } catch (telegramError) {
                console.error('Failed to send Telegram alert:', telegramError);
            }
            throw error;
        }
    }

    /**
     * Поиск похожих задач
     */
    async findSimilarTasks(marketData, taskType, performance, limit = 10) {
        try {
            const queryEmbedding = this.createTaskEmbedding(marketData, taskType, performance);
            
            const similarTasks = this.knowledgeBase
                .map(task => ({
                    ...task,
                    similarity: this.calculateSimilarity(queryEmbedding, task.embedding)
                }))
                .sort((a, b) => b.similarity - a.similarity)
                .slice(0, limit);
            
            return similarTasks;
            
        } catch (error) {
            console.error('❌ Similar tasks search failed:', error);
            return [];
        }
    }

    /**
     * Расчет схожести задач
     */
    calculateSimilarity(embedding1, embedding2) {
        if (embedding1.length !== embedding2.length) return 0;
        
        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;
        
        for (let i = 0; i < embedding1.length; i++) {
            dotProduct += embedding1[i] * embedding2[i];
            norm1 += embedding1[i] * embedding1[i];
            norm2 += embedding2[i] * embedding2[i];
        }
        
        const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
        return denominator > 0 ? dotProduct / denominator : 0;
    }

    /**
     * Сохранение задачи в базу знаний
     */
    async saveTaskToKnowledgeBase(taskData, adaptationParams) {
        const taskEmbedding = this.createTaskEmbedding(
            taskData.marketData,
            taskData.taskType,
            taskData.performance
        );
        
        const task = {
            id: Date.now(),
            embedding: taskEmbedding,
            marketData: taskData.marketData,
            taskType: taskData.taskType,
            performance: taskData.performance,
            adaptationParams,
            timestamp: new Date().toISOString()
        };
        
        this.knowledgeBase.push(task);
        
        // Ограничиваем размер базы знаний
        if (this.knowledgeBase.length > 1000) {
            this.knowledgeBase = this.knowledgeBase.slice(-1000);
        }
        
        // Сохраняем на диск
        await this.saveKnowledgeBase();
        
    }

    /**
     * Сохранение базы знаний на диск
     */
    async saveKnowledgeBase() {
        try {
            const fs = await import('fs/promises');
            const path = await import('path');
            
            const knowledgeBaseDir = path.join('./models', 'meta_learning');
            const knowledgeBasePath = path.join(knowledgeBaseDir, 'knowledge_base.json');
            
            // Создаем директорию если не существует
            await fs.mkdir(knowledgeBaseDir, { recursive: true });
            
            // Сохраняем базу знаний
            await fs.writeFile(knowledgeBasePath, JSON.stringify(this.knowledgeBase, null, 2));
            
        } catch (error) {
            console.warn('⚠️ Failed to save knowledge base:', error.message);
        }
    }

    /**
     * Загрузка базы знаний
     */
    async loadKnowledgeBase() {
        try {
            const fs = await import('fs/promises');
            const path = await import('path');
            
            const knowledgeBasePath = path.join('./models', 'meta_learning', 'knowledge_base.json');
            
            // Проверяем существование файла
            try {
                await fs.access(knowledgeBasePath);
                const data = await fs.readFile(knowledgeBasePath, 'utf-8');
                this.knowledgeBase = JSON.parse(data);
            } catch (fileError) {
                // Файл не существует - создаем пустую базу знаний
                this.knowledgeBase = [];
            }
        } catch (error) {
            console.warn('⚠️ Failed to load knowledge base:', error.message);
            this.knowledgeBase = [];
        }
    }

    /**
     * Уведомление о прогрессе мета-обучения
     */
    broadcastMetaTrainingProgress(epoch, logs) {
        try {
            const WebSocketServiceInstance = ServiceManager.getServiceSafe('WebSocketService');
            if (WebSocketServiceInstance && typeof WebSocketServiceInstance.broadcast === 'function') {
                WebSocketServiceInstance.broadcast({
                    type: 'meta_training_progress',
                    data: {
                        epoch,
                        loss: logs.loss,
                        mae: logs.mae,
                        valLoss: logs.val_loss,
                        valMae: logs.val_mae
                    },
                    timestamp: new Date().toISOString()
                });
            }
        } catch (error) {
            // Подавляем ошибки WebSocket - это не критично
        }
    }

    /**
     * Получение статистики
     */
    getStats() {
        return {
            isInitialized: this.isInitialized,
            totalTasks: this.knowledgeBase.length,
            successfulAdaptations: this.knowledgeBase.filter(task => task.adaptationParams).length,
            averageAdaptationTime: this.calculateAverageAdaptationTime(),
            knowledgeBaseSize: this.knowledgeBase.length,
            adaptationRate: this.config.adaptationRate,
            metaLearningRate: this.config.metaLearningRate
        };
    }

    /**
     * Обновление конфигурации
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        
        if (this.metaModel) {
            this.metaModel.compile({
                optimizer: tf.train.adam(this.config.metaLearningRate),
                loss: 'meanSquaredError',
                metrics: ['mae']
            });
        }
        
    }

    /**
     * Получение статуса
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            metaModelLoaded: !!this.metaModel,
            knowledgeBaseSize: this.knowledgeBase.length,
            config: this.config
        };
    }

    /**
     * Сохранение мета-модели
     */
    async saveMetaModel() {
        try {
            if (!this.metaModel) {
                console.warn('⚠️ Meta-model is null, skipping save');
                return;
            }

            // Сохраняем через ModelManager в стандартном формате
            const success = await ModelManager.saveModel(this.metaModel, 'meta_model/meta_model');
            if (!success) {
                console.warn('⚠️ Meta-model save reported failure');
            }
            
            // Также сохраняем базу знаний
            await this.saveKnowledgeBase();
        } catch (error) {
            console.error('❌ Failed to save meta-model:', error);
        }
    }

    /**
     * Загрузка мета-модели
     */
    async loadMetaModel() {
        try {
            // Проверяем, загружена ли уже модель
            if (this.metaModel) {
                return;
            }
            
            // Пытаемся загрузить модель через ModelManager
            const model = await ModelManager.loadModel('meta_model/meta_model');
            
            if (model) {
                // Компилируем модель
                model.compile({
                    optimizer: tf.train.adam(0.001),
                    loss: 'meanSquaredError',
                    metrics: ['mae'] // tfjs ожидает 'mae' вместо 'meanAbsoluteError'
                });
                
                this.metaModel = model;
            } else {
                this.metaModel = this.createMetaModel();
                // Сохраняем созданную модель
                try {
                    const success = await ModelManager.saveModel(this.metaModel, 'meta_model/meta_model');
                    if (success) {
                        console.log(`✅ Saved newly created meta-model (from loadMetaModel)`);
                    } else {
                        console.warn(`⚠️ Failed to save newly created meta-model (from loadMetaModel)`);
                    }
                } catch (saveError) {
                    console.warn(`⚠️ Error saving newly created meta-model (from loadMetaModel):`, saveError.message);
                }
            }
        } catch (error) {
            const LoggerService = (await import('./LoggerService.js')).default;
            LoggerService.error('Failed to load meta-model', {
                service: 'MetaLearningService',
                operation: 'loadMetaModel',
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
            this.metaModel = this.createMetaModel();
            // Сохраняем созданную модель после ошибки
            try {
                const ModelManager = (await import('../utils/ModelManager.js')).default;
                const success = await ModelManager.saveModel(this.metaModel, 'meta_model/meta_model');
                if (success) {
                    console.log(`✅ Saved newly created meta-model (after error)`);
                } else {
                    console.warn(`⚠️ Failed to save newly created meta-model (after error)`);
                }
            } catch (saveError) {
                console.warn(`⚠️ Error saving newly created meta-model (after error):`, saveError.message);
            }
        }
    }

    /**
     * Расчет среднего времени адаптации
     */
    calculateAverageAdaptationTime() {
        const adaptations = this.knowledgeBase.filter(task => 
            task.adaptationParams && task.adaptationTime
        );
        
        if (adaptations.length === 0) return 0;
        
        const totalTime = adaptations.reduce((sum, task) => 
            sum + (task.adaptationTime || 0), 0
        );
        
        return totalTime / adaptations.length;
    }

    /**
     * Остановить адаптацию мета-обучения
     */
    async stopAdaptation() {
        try {

            this.isAdapting = false;
            this.status = 'idle';
            
            // Уведомить через WebSocket
            try {
                const WebSocketServiceInstance = ServiceManager.getServiceSafe('WebSocketService');
                if (WebSocketServiceInstance && typeof WebSocketServiceInstance.broadcast === 'function') {
                    WebSocketServiceInstance.broadcast({
                        type: 'meta_learning_stopped',
                        timestamp: new Date().toISOString()
                    });
                }
            } catch (error) {
                // Подавляем ошибки WebSocket - это не критично
            }
            
            return {
                success: true,
                message: 'Meta-learning adaptation stopped successfully',
                status: this.status
            };
        } catch (error) {
            console.error('❌ Error stopping meta-learning adaptation:', error);
            throw error;
        }
    }
}

export default new MetaLearningService();
