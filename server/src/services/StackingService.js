import * as tf from '@tensorflow/tfjs';
import Recommendation from '../models/Recommendation.js';
import LoggerService from './LoggerService.js';
import { Op } from 'sequelize';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Сервис для Stacking (мета-обучения поверх базовых моделей)
 * 
 * Функциональность:
 * - Обучение мета-модели на исторических результатах базовых моделей
 * - Использование предсказаний базовых моделей как фичи для мета-модели
 * - Автоматическое переобучение на новых данных
 */
class StackingService {
    constructor() {
        this.isInitialized = false;
        this.metaModel = null;
        this.modelPath = path.join(__dirname, '../../models');
        this.modelFile = path.join(this.modelPath, 'stacking-meta-model.json');
        this.weightsFile = path.join(this.modelPath, 'stacking-meta-weights.json');
        this.isTraining = false; // Флаг для предотвращения одновременных попыток обучения
        
        this.settings = {
            // Минимальное количество исторических данных для обучения
            minTrainingSamples: 50,
            
            // Период для сбора исторических данных (дней)
            historyWindowDays: 90,
            
            // Параметры модели
            hiddenUnits: [32, 16],
            dropoutRate: 0.2,
            learningRate: 0.001,
            epochs: 50,
            batchSize: 16,
            validationSplit: 0.2,
            
            // Автоматическое переобучение
            autoRetrain: true,
            retrainIntervalDays: 7, // Переобучение раз в неделю
            
            // Последнее обучение
            lastTrainingDate: null
        };
        
        // Кэш для быстрого доступа
        this.predictionCache = new Map();
        this.cacheExpiry = 60 * 60 * 1000; // 1 час
    }

    async initialize() {
        try {
            LoggerService.info('📚 Initializing Stacking Service...');
            
            // Создаем директорию для моделей, если её нет
            try {
                await fs.mkdir(this.modelPath, { recursive: true });
            } catch (error) {
                // Директория уже существует
            }
            
            // Загружаем настройки
            await this.loadSettings();
            
            // Пытаемся загрузить существующую модель
            await this.loadModel();
            
            // Если модель не загружена, создаем новую с дефолтными параметрами
            // Модель будет обучена позже, когда накопится достаточно данных
            if (!this.metaModel) {
                LoggerService.info('📚 No existing stacking model found, creating new model structure');
                // Создаем модель с дефолтным размером входа (10 фичей: 5 источников * 2)
                const defaultInputSize = 10; // 5 источников (ensemble, traditional, reinforcement, signals, news) * 2 (score + confidence)
                this.metaModel = this.createMetaModel(defaultInputSize);
                LoggerService.info('✅ New stacking model structure created (will be trained when data is available)');
            }
            
            this.isInitialized = true;
            LoggerService.info('✅ Stacking Service initialized');
        } catch (error) {
            LoggerService.error('❌ Failed to initialize Stacking Service:', error);
            throw error;
        }
    }

    /**
     * Загрузка настроек
     */
    async loadSettings() {
        // Можно загружать из базы данных через SettingsService
        // Пока используем дефолтные настройки
    }

    /**
     * Создание мета-модели
     * @param {number} inputSize - Количество базовых моделей (фичи)
     */
    createMetaModel(inputSize) {
        console.log(`🧠 Создание мета-модели (StackingService)...`);
        console.log(`   📊 Входной размер: ${inputSize} (количество базовых моделей)`);
        
        const l2Regularizer = tf.regularizers.l2({ l2: 0.001 });
        
        const model = tf.sequential({
            layers: [
                tf.layers.dense({
                    inputShape: [inputSize],
                    units: this.settings.hiddenUnits[0],
                    activation: 'relu',
                    kernelRegularizer: l2Regularizer
                }),
                tf.layers.dropout({ rate: this.settings.dropoutRate }),
                tf.layers.dense({
                    units: this.settings.hiddenUnits[1],
                    activation: 'relu',
                    kernelRegularizer: l2Regularizer
                }),
                tf.layers.dropout({ rate: this.settings.dropoutRate }),
                tf.layers.dense({
                    units: 1,
                    activation: 'sigmoid' // Выход: вероятность BUY (0-1)
                })
            ]
        });
        
        model.compile({
            optimizer: tf.train.adam(this.settings.learningRate),
            loss: 'binaryCrossentropy',
            metrics: ['accuracy']
        });
        
        const totalParams = model.countParams();
        console.log(`   ✅ Мета-модель успешно создана: ${model.layers.length} слоев, ${totalParams.toLocaleString()} параметров`);
        console.log(`   📐 Архитектура: Dense(${this.settings.hiddenUnits[0]}) -> Dense(${this.settings.hiddenUnits[1]}) -> Dense(1)`);
        console.log(`   ⚙️  Параметры: learningRate=${this.settings.learningRate}, dropout=${this.settings.dropoutRate}`);
        
        return model;
    }

    /**
     * Сбор исторических данных для обучения
     * @param {string} figi - FIGI инструмента (опционально)
     * @returns {Promise<{features: Array, labels: Array}>}
     */
    async collectTrainingData(figi = null) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - this.settings.historyWindowDays);
            
            // Получаем исторические рекомендации
            const where = {
                analysisDate: {
                    [Op.gte]: cutoffDate
                },
                isActive: true
            };
            
            if (figi) {
                where.figi = figi;
            }
            
            const recommendations = await Recommendation.findAll({
                where,
                order: [['analysisDate', 'ASC']]
            });
            
            if (recommendations.length < this.settings.minTrainingSamples) {
                LoggerService.warn(`⚠️ Insufficient training data: ${recommendations.length} samples (need ${this.settings.minTrainingSamples})`);
                return { features: [], labels: [] };
            }
            
            const features = [];
            const labels = [];
            
            // Для каждой рекомендации извлекаем предсказания базовых моделей из analysis
            for (const rec of recommendations) {
                try {
                    let analysis = rec.analysis;
                    if (typeof analysis === 'string') {
                        analysis = JSON.parse(analysis);
                    }
                    analysis = analysis || {};
                    
                    const details = analysis.details || {};
                    
                    // Извлекаем предсказания от разных источников
                    const basePredictions = [];
                    
                    // Ensemble
                    if (details.ensemble) {
                        basePredictions.push(details.ensemble.score || 0.5);
                    } else {
                        basePredictions.push(0.5); // По умолчанию нейтральное значение
                    }
                    
                    // Traditional
                    if (details.traditional) {
                        basePredictions.push(details.traditional.score || 0.5);
                    } else {
                        basePredictions.push(0.5);
                    }
                    
                    // Reinforcement Learning
                    if (details.reinforcement) {
                        basePredictions.push(details.reinforcement.score || 0.5);
                    } else {
                        basePredictions.push(0.5);
                    }
                    
                    // Signals
                    if (details.signals) {
                        basePredictions.push(details.signals.score || 0.5);
                    } else {
                        basePredictions.push(0.5);
                    }
                    
                    // News
                    if (details.news) {
                        basePredictions.push(details.news.score || 0.5);
                    } else {
                        basePredictions.push(0.5);
                    }
                    
                    // Добавляем confidence каждого источника
                    if (details.ensemble) {
                        basePredictions.push(details.ensemble.confidence || 0.5);
                    } else {
                        basePredictions.push(0.5);
                    }
                    
                    if (details.traditional) {
                        basePredictions.push(details.traditional.confidence || 0.5);
                    } else {
                        basePredictions.push(0.5);
                    }
                    
                    if (details.reinforcement) {
                        basePredictions.push(details.reinforcement.confidence || 0.5);
                    } else {
                        basePredictions.push(0.5);
                    }
                    
                    // Метка: была ли рекомендация правильной
                    // Для этого нужно проверить фактический результат
                    // Пока используем score как приближение (если score > 0.5 и recommendation = BUY, то label = 1)
                    let label = 0.5; // По умолчанию нейтрально
                    
                    if (rec.recommendation === 'BUY' && rec.score > 0.5) {
                        label = 1.0;
                    } else if (rec.recommendation === 'SELL' && rec.score < 0.5) {
                        label = 0.0;
                    } else {
                        label = 0.5; // HOLD или неопределенность
                    }
                    
                    // Более точная метка: используем фактическую доходность, если доступна
                    // Пока используем упрощенный подход
                    
                    features.push(basePredictions);
                    labels.push(label);
                    
                } catch (error) {
                    LoggerService.warn(`⚠️ Failed to process recommendation ${rec.figi}:`, error.message);
                    continue;
                }
            }
            
            return { features, labels };
            
        } catch (error) {
            LoggerService.error('❌ Failed to collect training data:', error);
            return { features: [], labels: [] };
        }
    }

    /**
     * Обучение мета-модели
     * @param {string} figi - FIGI инструмента (опционально, но для stacking лучше null - все инструменты)
     */
    async trainMetaModel(figi = null) {
        // Предотвращаем одновременные попытки обучения
        if (this.isTraining) {
            LoggerService.warn('⚠️ Stacking model training already in progress, skipping...');
            return { success: false, reason: 'Training already in progress' };
        }
        
        this.isTraining = true;
        
        try {
            LoggerService.info('🧠 Training stacking meta-model...');
            
            // Для stacking модели лучше использовать данные от всех инструментов, а не одного
            // Это позволяет модели лучше обобщать
            const trainingFigi = null; // Всегда используем все инструменты для stacking
            
            // Собираем данные
            const { features, labels } = await this.collectTrainingData(trainingFigi);
            
            if (features.length < this.settings.minTrainingSamples) {
                LoggerService.warn(`⚠️ Insufficient data for training: ${features.length} samples (need ${this.settings.minTrainingSamples})`);
                return { success: false, reason: 'Insufficient data' };
            }
            
            // Создаем модель, если её нет
            const inputSize = features[0].length;
            if (!this.metaModel) {
                this.metaModel = this.createMetaModel(inputSize);
            }
            
            // Конвертируем в тензоры
            const xs = tf.tensor2d(features);
            const ys = tf.tensor1d(labels);
            
            // Обучение
            const history = await this.metaModel.fit(xs, ys, {
                epochs: this.settings.epochs,
                batchSize: this.settings.batchSize,
                validationSplit: this.settings.validationSplit,
                verbose: 0,
                callbacks: {
                    onEpochEnd: (epoch, logs) => {
                        if (epoch % 10 === 0) {
                            LoggerService.info(`   Epoch ${epoch + 1}/${this.settings.epochs} - loss: ${logs.loss.toFixed(4)}, acc: ${logs.acc.toFixed(4)}`);
                        }
                    }
                }
            });
            
            // Освобождаем память
            xs.dispose();
            ys.dispose();
            
            // Сохраняем модель
            await this.saveModel();
            
            this.settings.lastTrainingDate = new Date();
            
            LoggerService.info('✅ Stacking meta-model training completed');
            
            return {
                success: true,
                samples: features.length,
                finalLoss: history.history.loss[history.history.loss.length - 1],
                finalAccuracy: history.history.acc[history.history.acc.length - 1]
            };
            
        } catch (error) {
            LoggerService.error('❌ Failed to train stacking meta-model:', error);
            return { success: false, error: error.message };
        } finally {
            this.isTraining = false;
        }
    }

    /**
     * Предсказание с использованием мета-модели
     * @param {Array} basePredictions - Предсказания от базовых моделей
     * @returns {Promise<{score: number, confidence: number}>}
     */
    async predict(basePredictions) {
        try {
            // Если модель не обучена, используем простое взвешенное среднее
            if (!this.metaModel) {
                const avgScore = basePredictions.reduce((sum, p) => sum + (p.score || 0.5), 0) / basePredictions.length;
                const avgConfidence = basePredictions.reduce((sum, p) => sum + (p.confidence || 0.5), 0) / basePredictions.length;
                return {
                    score: avgScore,
                    confidence: avgConfidence,
                    method: 'weighted_average' // Fallback метод
                };
            }
            
            // Подготавливаем фичи для мета-модели
            const features = [];
            
            // Определяем ожидаемый размер входных данных модели
            let expectedInputSize = 10; // По умолчанию 5 источников * 2 (score + confidence)
            if (this.metaModel && this.metaModel.inputs && this.metaModel.inputs[0] && this.metaModel.inputs[0].shape) {
                expectedInputSize = this.metaModel.inputs[0].shape[1];
            }
            
            // Определяем количество источников на основе размера модели
            const numSources = expectedInputSize / 2; // Каждый источник дает 2 признака (score + confidence)
            const sources = ['ensemble', 'traditional', 'reinforcement', 'signals', 'news'].slice(0, numSources);
            
            // Извлекаем score и confidence от каждого источника
            for (const source of sources) {
                const pred = basePredictions.find(p => p.source === source);
                features.push(pred ? (pred.score || 0.5) : 0.5);
            }
            
            // Добавляем confidence
            for (const source of sources) {
                const pred = basePredictions.find(p => p.source === source);
                features.push(pred ? (pred.confidence || 0.5) : 0.5);
            }
            
            // Предсказание
            // Проверяем, что модель валидна и имеет правильную структуру
            if (!this.metaModel || typeof this.metaModel.predict !== 'function') {
                throw new Error('Meta model is not initialized or invalid');
            }
            
            // Проверяем размерность входных данных
            if (features.length !== expectedInputSize) {
                throw new Error(`Invalid features length: expected ${expectedInputSize}, got ${features.length}`);
            }
            
            const inputTensor = tf.tensor2d([features]);
            
            // Проверяем совместимость размерности с моделью
            if (this.metaModel.inputs && this.metaModel.inputs[0] && this.metaModel.inputs[0].shape) {
                const expectedInputShape = this.metaModel.inputs[0].shape[1];
                if (expectedInputShape !== features.length) {
                    inputTensor.dispose();
                    throw new Error(`Input shape mismatch: model expects ${expectedInputShape}, got ${features.length}`);
                }
            }
            
            const prediction = this.metaModel.predict(inputTensor);
            const predictionValue = await prediction.data();
            inputTensor.dispose();
            prediction.dispose();
            
            const score = predictionValue[0];
            
            // Рассчитываем confidence на основе согласованности базовых моделей
            const confidences = basePredictions.map(p => p.confidence || 0.5);
            const avgConfidence = confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
            
            // Корректируем confidence с учетом согласованности
            const variance = this.calculateVariance(basePredictions.map(p => p.score || 0.5));
            const adjustedConfidence = avgConfidence * (1 - variance);
            
            return {
                score: Math.max(0, Math.min(1, score)),
                confidence: Math.max(0, Math.min(1, adjustedConfidence)),
                method: 'stacking'
            };
            
        } catch (error) {
            // Детальное логирование ошибки
            LoggerService.error('❌ Failed to predict with stacking model', {
                service: 'StackingService',
                operation: 'predict',
                error: {
                    message: error.message,
                    stack: error.stack,
                    name: error.name
                },
                metaModelExists: !!this.metaModel,
                basePredictionsCount: basePredictions?.length || 0,
                basePredictions: basePredictions?.map(p => ({ source: p.source, score: p.score, confidence: p.confidence })) || []
            });
            
            // Fallback на простое среднее
            const avgScore = basePredictions.reduce((sum, p) => sum + (p.score || 0.5), 0) / basePredictions.length;
            const avgConfidence = basePredictions.reduce((sum, p) => sum + (p.confidence || 0.5), 0) / basePredictions.length;
            return {
                score: avgScore,
                confidence: avgConfidence,
                method: 'weighted_average',
                error: error.message
            };
        }
    }

    /**
     * Расчет дисперсии
     */
    calculateVariance(values) {
        if (values.length === 0) return 0;
        const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
        const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
        return variance;
    }

    /**
     * Сохранение модели
     */
    async saveModel() {
        try {
            if (!this.metaModel) {
                return;
            }
            
            // Сохраняем архитектуру модели (используем toJSON(null, false) для совместимости)
            const modelJson = this.metaModel.toJSON(null, false);
            await fs.writeFile(this.modelFile, JSON.stringify(modelJson, null, 2));
            
            // Сохраняем веса
            const weights = await this.metaModel.getWeights();
            const weightsData = await Promise.all(weights.map(w => w.data()));
            const weightsShapes = weights.map(w => w.shape);
            
            await fs.writeFile(this.weightsFile, JSON.stringify({
                weights: weightsData.map(w => Array.from(w)),
                shapes: weightsShapes
            }, null, 2));
            
            LoggerService.info('✅ Stacking model saved');
            
        } catch (error) {
            LoggerService.error('❌ Failed to save stacking model:', error);
        }
    }

    /**
     * Загрузка модели
     */
    async loadModel() {
        try {
            // Проверяем наличие файлов
            try {
                await fs.access(this.modelFile);
                await fs.access(this.weightsFile);
            } catch {
                LoggerService.info('📚 No existing stacking model found, will train on first use');
                return;
            }
            
            // Загружаем архитектуру
            const modelJson = JSON.parse(await fs.readFile(this.modelFile, 'utf-8'));
            
            // modelFromJSON принимает объект модели напрямую (результат toJSON(null, false))
            // Если файл был сохранен в старом формате с modelTopology, извлекаем его
            const modelTopology = (modelJson && 'modelTopology' in modelJson) 
                ? modelJson.modelTopology 
                : modelJson;
            
            // Создаем модель из JSON
            this.metaModel = await tf.models.modelFromJSON(modelTopology);
            
            // Загружаем веса
            const weightsData = JSON.parse(await fs.readFile(this.weightsFile, 'utf-8'));
            const weights = weightsData.weights.map((w, i) => 
                tf.tensor(w, weightsData.shapes[i])
            );
            
            this.metaModel.setWeights(weights);
            
            // Компилируем модель
            this.metaModel.compile({
                optimizer: tf.train.adam(this.settings.learningRate),
                loss: 'binaryCrossentropy',
                metrics: ['accuracy']
            });
            
            LoggerService.info('✅ Stacking model loaded');
            
        } catch (error) {
            LoggerService.warn('⚠️ Failed to load stacking model:', {
                service: 'StackingService',
                operation: 'loadModel',
                error: {
                    message: error?.message || String(error),
                    name: error?.name
                }
            });
            // Продолжаем без модели, будет использован fallback
        }
    }

    /**
     * Проверка необходимости переобучения
     * Проверяет не только время, но и наличие достаточных данных
     */
    async shouldRetrain() {
        if (!this.settings.autoRetrain) {
            return false;
        }
        
        // Если уже идет обучение, не запускаем еще одно
        if (this.isTraining) {
            return false;
        }
        
        // Проверяем наличие достаточных данных ДО принятия решения о переобучении
        const { features } = await this.collectTrainingData(null); // null = все инструменты
        if (features.length < this.settings.minTrainingSamples) {
            return false; // Недостаточно данных для обучения
        }
        
        if (!this.settings.lastTrainingDate) {
            return true; // Никогда не обучалась, но данных достаточно
        }
        
        const daysSinceTraining = (Date.now() - new Date(this.settings.lastTrainingDate).getTime()) / (1000 * 60 * 60 * 24);
        return daysSinceTraining >= this.settings.retrainIntervalDays;
    }

    /**
     * Получение статуса
     */
    getStatus() {
        // Синхронная проверка времени (без проверки данных)
        let shouldRetrainByTime = false;
        if (this.settings.autoRetrain) {
            if (!this.settings.lastTrainingDate) {
                shouldRetrainByTime = true;
            } else {
                const daysSinceTraining = (Date.now() - new Date(this.settings.lastTrainingDate).getTime()) / (1000 * 60 * 60 * 24);
                shouldRetrainByTime = daysSinceTraining >= this.settings.retrainIntervalDays;
            }
        }
        
        return {
            isInitialized: this.isInitialized,
            hasModel: this.metaModel !== null,
            lastTrainingDate: this.settings.lastTrainingDate,
            isTraining: this.isTraining,
            shouldRetrainByTime: shouldRetrainByTime,
            // Примечание: полная проверка shouldRetrain() теперь async и проверяет данные
        };
    }
}

export default new StackingService();

