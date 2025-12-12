#!/usr/bin/env node

/**
 * Простая проверка сохранения и загрузки моделей
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

async function checkModels() {
    console.log('🔍 Проверка моделей нейросетей...\n');
    
    // Используем правильный путь относительно server директории
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const modelsDir = path.join(__dirname, '..', 'models');
    
    const modelPaths = [
        path.join(modelsDir, 'neural-network-model.json'),
        path.join(modelsDir, 'neural-network-weights.json'),
        path.join(modelsDir, 'ensemble'),
        path.join(modelsDir, 'rl_agent'),
        path.join(modelsDir, 'meta_model')
    ];
    
    for (const modelPath of modelPaths) {
        try {
            const stats = await fs.stat(modelPath);
            console.log(`✅ ${modelPath} - ${stats.isDirectory() ? 'папка' : 'файл'} найден`);
        } catch (error) {
            console.log(`❌ ${modelPath} - не найден`);
        }
    }
    
    console.log('\n📊 Проверка методов сохранения в сервисах:');
    
    // Проверяем наличие методов в файлах
    const services = [
        'NeuralNetworkService.js',
        'EnsembleNeuralNetworkService.js', 
        'ReinforcementLearningService.js',
        'MetaLearningService.js'
    ];
    
    for (const service of services) {
        try {
            const content = await fs.readFile(`./src/services/${service}`, 'utf8');
            const hasSave = content.includes('saveModel') || content.includes('saveModels') || content.includes('saveMetaModel');
            const hasLoad = content.includes('loadModel') || content.includes('loadModels') || content.includes('loadMetaModel');
            const hasInit = content.includes('initialize()');
            
            console.log(`📄 ${service}:`);
            console.log(`  Сохранение: ${hasSave ? '✅' : '❌'}`);
            console.log(`  Загрузка: ${hasLoad ? '✅' : '❌'}`);
            console.log(`  Инициализация: ${hasInit ? '✅' : '❌'}`);
            console.log('');
        } catch (error) {
            console.log(`❌ Не удалось прочитать ${service}`);
        }
    }
}

checkModels().then(() => {
    console.log('🏁 Проверка завершена');
    process.exit(0);
}).catch(error => {
    console.error('💥 Ошибка:', error);
    process.exit(1);
});
