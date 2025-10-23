#!/usr/bin/env node

/**
 * Простая проверка сохранения и загрузки моделей
 */

import fs from 'fs/promises';
import path from 'path';

async function checkModels() {
    console.log('🔍 Проверка моделей нейросетей...\n');
    
    const modelPaths = [
        './models/neural-network-model.json',
        './models/neural-network-weights.json',
        './models/ensemble/',
        './models/rl_agent/',
        './models/meta_model/'
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
