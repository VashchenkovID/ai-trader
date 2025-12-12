import * as tf from '@tensorflow/tfjs';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Универсальный менеджер для сохранения и загрузки моделей TensorFlow.js
 * Использует стандартный формат file:// для надежности
 */
class ModelManager {
    constructor() {
        // Используем правильный путь относительно server директории
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        this.modelsDir = path.join(__dirname, '../../models');
        this.ensureModelsDir();
    }

    /**
     * Создание директории для моделей
     */
    async ensureModelsDir() {
        try {
            await fs.mkdir(this.modelsDir, { recursive: true });
        } catch (error) {
            // Директория уже существует
        }
    }

    /**
     * Сохранение модели в стандартном формате TensorFlow.js
     * @param {tf.LayersModel} model - Модель для сохранения
     * @param {string} modelName - Имя модели (например, 'ensemble/lstm')
     * @returns {Promise<boolean>} - Успешность операции
     */
    async saveModel(model, modelName) {
        try {
            if (!model) {
                console.warn(`⚠️ Cannot save null model: ${modelName}`);
                return false;
            }

            const modelPath = path.join(this.modelsDir, modelName);
            const modelDir = path.dirname(modelPath);
            
            // Создаем директорию если не существует
            await fs.mkdir(modelDir, { recursive: true });
            
            // Используем tf.io.fileSystem для Node.js
            console.log(`💾 Saving model ${modelName} to ${modelPath}`);
            console.log(`📊 Model info: layers=${model.layers?.length || 0}, trainable=${model.trainable}`);
            
            // Сохраняем модель и веса отдельно для совместимости
            const modelJson = model.toJSON();
            const weights = model.getWeights();
            
            // Сохраняем архитектуру
            await fs.writeFile(`${modelPath}.json`, JSON.stringify(modelJson, null, 2));
            
            // Сохраняем веса в бинарном формате
            const weightsData = new Float32Array(weights.reduce((acc, w) => acc + w.size, 0));
            let offset = 0;
            const weightsSpecs = [];
            
            for (const weight of weights) {
                const data = await weight.data();
                weightsData.set(data, offset);
                weightsSpecs.push({
                    name: weight.name || `weight_${weightsSpecs.length}`,
                    shape: weight.shape,
                    dtype: weight.dtype
                });
                offset += weight.size;
            }
            
            // Сохраняем бинарные данные весов
            await fs.writeFile(`${modelPath}.weights.bin`, Buffer.from(weightsData.buffer));
            
            // Сохраняем спецификации весов
            const manifest = {
                format: 'layers-model',
                generatedBy: 'IvashkaTradeHelper-ModelManager',
                convertedBy: null,
                modelTopology: modelJson, // Уже объект, не строка
                weightsManifest: [{
                    paths: [`${path.basename(modelPath)}.weights.bin`],
                    weights: weightsSpecs
                }]
            };
            
            await fs.writeFile(`${modelPath}.json`, JSON.stringify(manifest, null, 2));
            
            console.log(`✅ Model ${modelName} saved successfully`);
            return true;
            
        } catch (error) {
            console.error(`❌ Failed to save model ${modelName}:`, error.message);
            return false;
        }
    }

    /**
     * Загрузка модели из стандартного формата TensorFlow.js
     * @param {string} modelName - Имя модели (например, 'ensemble/lstm')
     * @returns {Promise<tf.LayersModel|null>} - Загруженная модель или null
     */
    async loadModel(modelName) {
        try {
            const modelPath = path.join(this.modelsDir, modelName);
            const jsonPath = `${modelPath}.json`;
            const binPath = `${modelPath}.weights.bin`;
            const weightsJsonPath = `${modelPath}_weights.json`;
            
            // Проверяем существование файлов (поддерживаем оба формата)
            let modelExists = false;
            let weightsPath = null;
            
            try {
                await fs.access(jsonPath);
                await fs.access(binPath);
                modelExists = true;
                weightsPath = binPath;
            } catch {
                try {
                    await fs.access(jsonPath);
                    await fs.access(weightsJsonPath);
                    modelExists = true;
                    weightsPath = weightsJsonPath;
                } catch {
                    console.log(`📭 Model files not found for ${modelName}`);
                    return null;
                }
            }
            
            console.log(`📥 Loading model ${modelName} from ${jsonPath}`);
            
            // Загружаем манифест модели
            const manifestData = await fs.readFile(jsonPath, 'utf8');
            let manifest;
            
            try {
                manifest = JSON.parse(manifestData);
            } catch (error) {
                // Если файл содержит JSON как строку, парсим его
                console.log(`🔄 Parsing JSON string for ${modelName}`);
                const parsedData = JSON.parse(manifestData);
                manifest = JSON.parse(parsedData);
            }
            
            // Создаем модель из топологии
            let modelTopology = manifest.modelTopology || manifest;
            
            // Если modelTopology сохранена как строка, парсим её
            if (typeof modelTopology === 'string') {
                console.log(`🔄 Parsing modelTopology from string for ${modelName}`);
                modelTopology = JSON.parse(modelTopology);
            }
            
            const model = await tf.models.modelFromJSON(modelTopology);
            
            // Загружаем веса в зависимости от формата
            let weightTensors = [];
            
            if (weightsPath.endsWith('.bin')) {
                // Бинарный формат
                const weightsBuffer = await fs.readFile(weightsPath);
                const weightsData = new Float32Array(weightsBuffer.buffer);
                
                const weightsSpecs = manifest.weightsManifest[0].weights;
                let offset = 0;
                
                for (const spec of weightsSpecs) {
                    const size = spec.shape.reduce((a, b) => a * b, 1);
                    const data = weightsData.slice(offset, offset + size);
                    const tensor = tf.tensor(Array.from(data), spec.shape, spec.dtype);
                    weightTensors.push(tensor);
                    offset += size;
                }
            } else {
                // JSON формат
                const weightsData = await fs.readFile(weightsPath, 'utf8');
                const weightsJson = JSON.parse(weightsData);
                
                for (const spec of weightsJson.specs) {
                    const tensor = tf.tensor(spec.data, spec.shape, spec.dtype);
                    weightTensors.push(tensor);
                }
            }
            
            model.setWeights(weightTensors);
            
            console.log(`✅ Model ${modelName} loaded successfully`);
            return model;
            
        } catch (error) {
            console.error(`❌ Failed to load model ${modelName}:`, error.message);
            return null;
        }
    }

    /**
     * Проверка существования модели
     * @param {string} modelName - Имя модели
     * @returns {Promise<boolean>} - Существует ли модель
     */
    async modelExists(modelName) {
        try {
            const modelPath = path.join(this.modelsDir, modelName);
            const jsonPath = `${modelPath}.json`;
            const binPath = `${modelPath}.weights.bin`;
            const weightsJsonPath = `${modelPath}_weights.json`;
            
            // Проверяем оба формата
            try {
                await fs.access(jsonPath);
                await fs.access(binPath);
                return true;
            } catch {
                try {
                    await fs.access(jsonPath);
                    await fs.access(weightsJsonPath);
                    return true;
                } catch {
                    return false;
                }
            }
        } catch {
            return false;
        }
    }

    /**
     * Удаление модели
     * @param {string} modelName - Имя модели
     * @returns {Promise<boolean>} - Успешность операции
     */
    async deleteModel(modelName) {
        try {
            const modelPath = path.join(this.modelsDir, modelName);
            const jsonPath = `${modelPath}.json`;
            const binPath = `${modelPath}.weights.bin`;
            
            try {
                await fs.unlink(jsonPath);
                await fs.unlink(binPath);
                console.log(`🗑️ Model ${modelName} deleted successfully`);
                return true;
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    throw error;
                }
                return true; // Файлы уже не существуют
            }
        } catch (error) {
            console.error(`❌ Failed to delete model ${modelName}:`, error.message);
            return false;
        }
    }

    /**
     * Получение списка всех моделей
     * @returns {Promise<string[]>} - Список имен моделей
     */
    async listModels() {
        try {
            const models = [];
            
            const scanDirectory = async (dir, prefix = '') => {
                const items = await fs.readdir(dir, { withFileTypes: true });
                
                for (const item of items) {
                    if (item.isDirectory()) {
                        await scanDirectory(path.join(dir, item.name), prefix + item.name + '/');
                    } else if (item.name.endsWith('.json')) {
                        const modelName = prefix + item.name.replace('.json', '');
                        models.push(modelName);
                    }
                }
            };
            
            await scanDirectory(this.modelsDir);
            return models;
        } catch (error) {
            console.error('❌ Failed to list models:', error.message);
            return [];
        }
    }

    /**
     * Получение информации о модели
     * @param {string} modelName - Имя модели
     * @returns {Promise<Object|null>} - Информация о модели
     */
    async getModelInfo(modelName) {
        try {
            const modelPath = path.join(this.modelsDir, modelName);
            const jsonPath = `${modelPath}.json`;
            
            const stats = await fs.stat(jsonPath);
            const modelJson = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
            
            return {
                name: modelName,
                size: stats.size,
                created: stats.birthtime,
                modified: stats.mtime,
                format: modelJson.format || 'layers-model',
                version: modelJson.generatedBy || 'unknown',
                layers: modelJson.modelTopology?.config?.layers?.length || 0
            };
        } catch (error) {
            console.error(`❌ Failed to get model info for ${modelName}:`, error.message);
            return null;
        }
    }
}

// Экспортируем синглтон
export default new ModelManager();
