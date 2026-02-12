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
            
            // Устанавливаем права доступа на созданную папку и все промежуточные папки
            try {
                // Устанавливаем права на все папки в пути (от корня models до конечной папки)
                let currentDir = modelDir;
                const dirsToChmod = [];
                
                // Собираем все промежуточные директории
                while (currentDir !== this.modelsDir && currentDir !== path.dirname(currentDir)) {
                    dirsToChmod.push(currentDir);
                    currentDir = path.dirname(currentDir);
                }
                dirsToChmod.push(this.modelsDir);
                
                // Устанавливаем права на все папки
                for (const dir of dirsToChmod) {
                    try {
                        await fs.chmod(dir, 0o777);
                    } catch (err) {
                        // Игнорируем ошибки для отдельных папок
                    }
                }
            } catch (chmodError) {
                // Игнорируем ошибки chmod (может не работать в некоторых окружениях, например Windows)
                console.warn(`⚠️ Failed to set directory permissions for ${modelName}:`, chmodError.message);
            }
        
            
            // Сохраняем модель и веса отдельно для совместимости
            const modelJson = model.toJSON();
            const weights = model.getWeights();
            
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
            
            // Устанавливаем права на файл весов
            try {
                await fs.chmod(`${modelPath}.weights.bin`, 0o666);
            } catch (chmodError) {
                // Игнорируем ошибки chmod
            }
            
            // Сохраняем манифест с топологией и спецификациями весов
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
            
            // Сохраняем манифест (это основной файл модели)
            await fs.writeFile(`${modelPath}.json`, JSON.stringify(manifest, null, 2));
            
            // Устанавливаем права на файл манифеста
            try {
                await fs.chmod(`${modelPath}.json`, 0o666);
            } catch (chmodError) {
                // Игнорируем ошибки chmod
            }
            
            return true;
            
        } catch (error) {
            // Пытаемся использовать LoggerService, если доступен
            try {
                const LoggerService = (await import('../services/LoggerService.js')).default;
                if (LoggerService.isInitialized) {
                    LoggerService.error('Failed to save model', {
                        service: 'ModelManager',
                        operation: 'saveModel',
                        modelName,
                        error: { message: error.message, stack: error.stack }
                    });
                } else {
                    console.error(`❌ Failed to save model ${modelName}:`, error.message);
                }
            } catch (loggerError) {
                console.error(`❌ Failed to save model ${modelName}:`, error.message);
            }
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
                    return null;
                }
            }
            
            
            // Загружаем манифест модели
            const manifestData = await fs.readFile(jsonPath, 'utf8');
            let manifest;
            
            try {
                manifest = JSON.parse(manifestData);
            } catch (error) {
                // Если файл содержит JSON как строку, парсим его
                try {
                    const parsedData = JSON.parse(manifestData);
                    manifest = JSON.parse(parsedData);
                } catch (parseError) {
                    const errorMsg = parseError?.message || String(parseError);
                    console.error(`❌ Failed to parse manifest JSON for ${modelName}:`, errorMsg);
                    throw new Error(`Failed to parse manifest: ${errorMsg}`);
                }
            }
            
            // Создаем модель из топологии
            let modelTopology = manifest.modelTopology || manifest;
            
            // Если modelTopology сохранена как строка, парсим её
            if (typeof modelTopology === 'string') {
                try {
                    modelTopology = JSON.parse(modelTopology);
                } catch (parseError) {
                    const errorMsg = parseError?.message || String(parseError);
                    console.error(`❌ Failed to parse modelTopology for ${modelName}:`, errorMsg);
                    throw new Error(`Failed to parse modelTopology: ${errorMsg}`);
                }
            }
            
            let model;
            try {
                model = await tf.models.modelFromJSON(modelTopology);
            } catch (modelError) {
                const errorMsg = modelError?.message || String(modelError);
                console.error(`❌ Failed to create model from JSON for ${modelName}:`, errorMsg);
                throw new Error(`Failed to create model from JSON: ${errorMsg}`);
            }
            
            // Загружаем веса в зависимости от формата
            let weightTensors = [];
            
            if (weightsPath.endsWith('.bin')) {
                // Бинарный формат
                if (!manifest.weightsManifest || !manifest.weightsManifest[0] || !manifest.weightsManifest[0].weights) {
                    console.error(`❌ Invalid weightsManifest for ${modelName}`);
                    return null;
                }
                
                const weightsBuffer = await fs.readFile(weightsPath);
                const weightsData = new Float32Array(weightsBuffer.buffer, weightsBuffer.byteOffset, weightsBuffer.byteLength / 4);
                
                const weightsSpecs = manifest.weightsManifest[0].weights;
                let offset = 0;
                
                for (const spec of weightsSpecs) {
                    const size = spec.shape.reduce((a, b) => a * b, 1);
                    if (offset + size > weightsData.length) {
                        console.error(`❌ Weights data size mismatch for ${modelName}: expected ${offset + size}, got ${weightsData.length}`);
                        return null;
                    }
                    const data = weightsData.slice(offset, offset + size);
                    const tensor = tf.tensor(Array.from(data), spec.shape, spec.dtype || 'float32');
                    weightTensors.push(tensor);
                    offset += size;
                }
            } else {
                // JSON формат
                const weightsData = await fs.readFile(weightsPath, 'utf8');
                const weightsJson = JSON.parse(weightsData);
                
                if (!weightsJson.specs || !Array.isArray(weightsJson.specs)) {
                    console.error(`❌ Invalid weights JSON format for ${modelName}`);
                    return null;
                }
                
                for (const spec of weightsJson.specs) {
                    const tensor = tf.tensor(spec.data, spec.shape, spec.dtype || 'float32');
                    weightTensors.push(tensor);
                }
            }
            
            // Проверяем, что количество весов совпадает
            if (weightTensors.length !== model.weights.length) {
                console.warn(`⚠️ Weights count mismatch for ${modelName}: model expects ${model.weights.length}, got ${weightTensors.length}`);
            }
            
            model.setWeights(weightTensors);
            
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
