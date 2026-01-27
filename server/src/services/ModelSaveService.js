import {fileURLToPath} from 'url';
import {join} from 'path';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);

/**
 * Улучшенный сервис для сохранения моделей с проверками и валидацией
 */
class ModelSaveService {
    constructor() {
        this.modelsDir = './models';
        this.backupDir = './models/backups';
        this.validationEnabled = true;
    }

    /**
     * Сохранение модели с проверками
     */
    async saveModelWithValidation(model, modelName, metadata = {}) {
        try {

            // Создаем директории
            await this.ensureDirectories();

            // Создаем backup существующей модели
            await this.createBackup(modelName);

            // Валидируем модель перед сохранением
            if (this.validationEnabled) {
                await this.validateModel(model);
            }

            // Сохраняем модель
            const saveResult = await this.saveModelFiles(model, modelName, metadata);

            // Проверяем сохранение
            await this.validateSavedModel(modelName);

            return saveResult;

        } catch (error) {
            console.error(`❌ Failed to save model ${modelName}:`, error);

            // Пытаемся восстановить из backup
            await this.restoreFromBackup(modelName);
            throw error;
        }
    }

    /**
     * Создание backup существующей модели
     */
    async createBackup(modelName) {
        try {
            const modelPath = join(this.modelsDir, `${modelName}.json`);
            const weightsPath = join(this.modelsDir, `${modelName}_weights.json`);

            // Проверяем существование файлов
            const modelExists = await this.fileExists(modelPath);
            const weightsExist = await this.fileExists(weightsPath);

            if (modelExists || weightsExist) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const backupDir = join(this.backupDir, `${modelName}_${timestamp}`);
                await fs.mkdir(backupDir, {recursive: true});

                if (modelExists) {
                    await fs.copyFile(modelPath, join(backupDir, 'model.json'));
                }
                if (weightsExist) {
                    await fs.copyFile(weightsPath, join(backupDir, 'weights.json'));
                }

            }
        } catch (error) {
            console.warn(`⚠️ Failed to create backup for ${modelName}:`, error.message);
        }
    }

    /**
     * Валидация модели перед сохранением
     */
    async validateModel(model) {
        if (!model) {
            throw new Error('Model is null or undefined');
        }

        if (!model.toJSON) {
            throw new Error('Model does not have toJSON method');
        }

        if (!model.getWeights) {
            throw new Error('Model does not have getWeights method');
        }

        // Проверяем архитектуру
        const archJson = model.toJSON(null, false);
        if (!archJson || !archJson.layers) {
            throw new Error('Invalid model architecture');
        }

        // Проверяем веса
        const weights = model.getWeights();
        if (!weights || weights.length === 0) {
            throw new Error('Model has no weights');
        }

    }

    /**
     * Сохранение файлов модели
     */
    async saveModelFiles(model, modelName, metadata) {
        const modelPath = join(this.modelsDir, `${modelName}.json`);
        const weightsPath = join(this.modelsDir, `${modelName}_weights.json`);
        const metadataPath = join(this.modelsDir, `${modelName}_metadata.json`);

        // Сохраняем архитектуру
        const archJson = model.toJSON(null, false);
        await fs.writeFile(modelPath, JSON.stringify(archJson, null, 2));

        // Сохраняем веса
        const weights = model.getWeights();
        const specs = await Promise.all(weights.map(async (w) => ({
            name: w.name,
            shape: w.shape,
            dtype: w.dtype,
            data: await w.array()
        })));

        await fs.writeFile(weightsPath, JSON.stringify({specs}, null, 2));

        // Сохраняем метаданные
        const fullMetadata = {
            ...metadata,
            savedAt: new Date().toISOString(),
            version: '2.0',
            format: 'tensorflow-js-standard',
            layersCount: archJson.layers.length,
            weightsCount: weights.length
        };

        await fs.writeFile(metadataPath, JSON.stringify(fullMetadata, null, 2));

        return {
            modelPath,
            weightsPath,
            metadataPath,
            layersCount: archJson.layers.length,
            weightsCount: weights.length
        };
    }

    /**
     * Валидация сохраненной модели
     */
    async validateSavedModel(modelName) {
        const modelPath = join(this.modelsDir, `${modelName}.json`);
        const weightsPath = join(this.modelsDir, `${modelName}_weights.json`);

        // Проверяем существование файлов
        const modelExists = await this.fileExists(modelPath);
        const weightsExist = await this.fileExists(weightsPath);

        if (!modelExists) {
            throw new Error(`Model file not found: ${modelPath}`);
        }

        if (!weightsExist) {
            throw new Error(`Weights file not found: ${weightsPath}`);
        }

        // Проверяем размеры файлов
        const modelStats = await fs.stat(modelPath);
        const weightsStats = await fs.stat(weightsPath);

        if (modelStats.size === 0) {
            throw new Error(`Model file is empty: ${modelPath}`);
        }

        if (weightsStats.size === 0) {
            throw new Error(`Weights file is empty: ${weightsPath}`);
        }

    }

    /**
     * Восстановление из backup
     */
    async restoreFromBackup(modelName) {
        try {
            const backupDirs = await fs.readdir(this.backupDir);
            const modelBackups = backupDirs.filter(dir => dir.startsWith(`${modelName}_`));

            if (modelBackups.length === 0) {
                console.warn(`⚠️ No backups found for ${modelName}`);
                return;
            }

            // Берем последний backup
            const latestBackup = modelBackups.sort().pop();
            const backupPath = join(this.backupDir, latestBackup);

            const modelPath = join(this.modelsDir, `${modelName}.json`);
            const weightsPath = join(this.modelsDir, `${modelName}_weights.json`);

            // Восстанавливаем файлы
            await fs.copyFile(join(backupPath, 'model.json'), modelPath);
            await fs.copyFile(join(backupPath, 'weights.json'), weightsPath);

        } catch (error) {
            console.error(`❌ Failed to restore from backup:`, error);
        }
    }

    /**
     * Создание необходимых директорий
     */
    async ensureDirectories() {
        await fs.mkdir(this.modelsDir, {recursive: true});
        await fs.mkdir(this.backupDir, {recursive: true});
    }

    /**
     * Проверка существования файла
     */
    async fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Очистка старых backup'ов
     */
    async cleanupOldBackups(maxAge = 7 * 24 * 60 * 60 * 1000) { // 7 дней
        try {
            const backupDirs = await fs.readdir(this.backupDir);
            const now = Date.now();

            for (const dir of backupDirs) {
                const dirPath = join(this.backupDir, dir);
                const stats = await fs.stat(dirPath);

                if (now - stats.mtime.getTime() > maxAge) {
                    await fs.rm(dirPath, {recursive: true});
                }
            }
        } catch (error) {
            console.warn('⚠️ Failed to cleanup old backups:', error.message);
        }
    }
}

export default new ModelSaveService();
