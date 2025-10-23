#!/usr/bin/env node

import ApplyRecommendedSettings from './applyRecommendedSettings.js';
import TrainingRecommendations from './trainingRecommendations.js';

async function main() {
    console.log('🚀 Starting recommended intervals application...\n');
    
    try {
        // 1. Анализируем текущее состояние системы
        console.log('📊 Analyzing system state...');
        const analysis = await TrainingRecommendations.analyzeSystemState();
        console.log('✅ System analysis completed\n');
        
        // 2. Получаем персональные рекомендации
        console.log('🎯 Getting personalized recommendations...');
        const recommendations = await TrainingRecommendations.getPersonalizedRecommendations();
        console.log('✅ Recommendations generated\n');
        
        // 3. Показываем рекомендуемые настройки
        console.log('📋 Recommended Settings:');
        console.log('='.repeat(50));
        
        console.log('\n🕐 Scheduler Settings:');
        console.log(`  Cache Update: ${recommendations.schedule.fullTrainingSchedule}`);
        console.log(`  Analysis: ${recommendations.schedule.quickTrainingSchedule}`);
        console.log(`  Quick Training: ${recommendations.schedule.quickTrainingEnabled ? 'Enabled' : 'Disabled'}`);
        console.log(`  Quick Training Limit: ${recommendations.schedule.quickTrainingLimit} instruments`);
        
        console.log('\n🧠 Neural Network Settings:');
        console.log(`  Strategy: ${recommendations.strategy.strategy}`);
        console.log(`  Learning Rate: ${recommendations.hyperparameters.learningRate}`);
        console.log(`  Batch Size: ${recommendations.hyperparameters.batchSize}`);
        console.log(`  Epochs: ${recommendations.hyperparameters.epochs}`);
        console.log(`  Dropout: ${recommendations.hyperparameters.dropout}`);
        
        console.log('\n📊 Data Preparation:');
        console.log(`  Normalization: ${recommendations.dataPreparation.normalization}`);
        console.log(`  Augmentation: ${recommendations.dataPreparation.augmentation ? 'Enabled' : 'Disabled'}`);
        console.log(`  Balancing: ${recommendations.dataPreparation.balancing ? 'Enabled' : 'Disabled'}`);
        console.log(`  Market Context: ${recommendations.dataPreparation.marketContext ? 'Enabled' : 'Disabled'}`);
        
        console.log('\n📈 Monitoring:');
        console.log(`  Accuracy Threshold: ${recommendations.monitoring.accuracyThreshold}`);
        console.log(`  Check Interval: ${Math.round(recommendations.monitoring.performanceCheckInterval / 1000 / 60)} minutes`);
        console.log(`  Alerts: ${recommendations.monitoring.alertOnDegradation ? 'Enabled' : 'Disabled'}`);
        
        console.log('\n' + '='.repeat(50));
        
        // 4. Применяем настройки
        console.log('\n⚙️ Applying recommended settings...');
        const result = await ApplyRecommendedSettings.applyRecommendedSettings();
        
        if (result.success) {
            console.log('✅ Recommended settings applied successfully!');
            console.log('\n🎉 System is now optimized for:');
            console.log(`  - ${recommendations.strategy.strategy} training strategy`);
            console.log(`  - ${recommendations.schedule.quickTrainingSchedule} quick training`);
            console.log(`  - ${recommendations.hyperparameters.learningRate} learning rate`);
            console.log(`  - ${recommendations.hyperparameters.batchSize} batch size`);
            
            console.log('\n📝 Next steps:');
            console.log('  1. Restart the server to apply new settings');
            console.log('  2. Monitor training performance');
            console.log('  3. Adjust settings based on results');
            
        } else {
            console.log('❌ Failed to apply recommended settings:');
            console.log(`   ${result.message}`);
            if (result.error) {
                console.log(`   Error: ${result.error}`);
            }
        }
        
    } catch (error) {
        console.error('❌ Error applying recommended intervals:', error);
        process.exit(1);
    }
}

// Запускаем скрипт
if (import.meta.url === `file://${process.argv[1]}`) {
    main().then(() => {
        console.log('\n🏁 Script completed');
        process.exit(0);
    }).catch((error) => {
        console.error('💥 Script failed:', error);
        process.exit(1);
    });
}

export default main;
