import SettingsService from '../services/SettingsService.js';
import TrainingRecommendations from './trainingRecommendations.js';

class ApplyRecommendedSettings {
    constructor() {
        this.recommendations = null;
    }

    // Применить рекомендуемые настройки
    async applyRecommendedSettings() {
        console.log('🎯 Applying recommended training settings...');
        
        try {
            // Получаем персональные рекомендации
            this.recommendations = await TrainingRecommendations.getPersonalizedRecommendations();
            
            // Применяем настройки по категориям
            await this.applySchedulerSettings();
            await this.applyNeuralNetworkSettings();
            await this.applyDataPreparationSettings();
            await this.applyMonitoringSettings();
            
            console.log('✅ Recommended settings applied successfully');
            return {
                success: true,
                message: 'Рекомендуемые настройки успешно применены',
                recommendations: this.recommendations
            };

        } catch (error) {
            console.error('❌ Error applying recommended settings:', error);
            return {
                success: false,
                message: 'Ошибка при применении настроек',
                error: error.message
            };
        }
    }

    // Применить настройки планировщика
    async applySchedulerSettings() {
        const { schedule } = this.recommendations;
        
        console.log('📅 Applying scheduler settings...');
        
        const schedulerSettings = {
            cache_update_interval: '0 */4 * * *', // Каждые 4 часа
            analysis_interval: '0 */1 * * *', // Каждый час
            nn_training_schedule: '0 3 * * 1', // Понедельник в 3:00
            nn_training_interval: schedule.quickTrainingSchedule || '*/30 * * * *'
        };

        for (const [key, value] of Object.entries(schedulerSettings)) {
            await SettingsService.updateSetting(key, value);
            console.log(`  ✓ ${key}: ${value}`);
        }
    }

    // Применить настройки нейросети
    async applyNeuralNetworkSettings() {
        const { hyperparameters, strategy } = this.recommendations;
        
        console.log('🧠 Applying neural network settings...');
        
        const nnSettings = {
            nn_training_days: 180,
            nn_training_limit: 50,
            nn_quick_training_enabled: true,
            nn_quick_training_limit: 15,
            nn_quick_training_days: 30,
            nn_learning_rate: hyperparameters.learningRate || 0.0005,
            nn_batch_size: hyperparameters.batchSize || 16,
            nn_epochs: hyperparameters.epochs || 50,
            nn_dropout_rate: hyperparameters.dropout || 0.2,
            nn_validation_split: hyperparameters.validationSplit || 0.2,
            nn_early_stopping_patience: 10,
            nn_training_strategy: strategy.strategy || 'progressive',
            nn_sequence_length: 60,
            nn_prediction_horizon: 5,
            nn_accuracy_threshold: 0.65
        };

        for (const [key, value] of Object.entries(nnSettings)) {
            await SettingsService.updateSetting(key, value);
            console.log(`  ✓ ${key}: ${value}`);
        }
    }

    // Применить настройки подготовки данных
    async applyDataPreparationSettings() {
        const { dataPreparation } = this.recommendations;
        
        console.log('📊 Applying data preparation settings...');
        
        const dataSettings = {
            data_normalization_method: dataPreparation.normalization || 'minmax',
            data_augmentation_enabled: dataPreparation.augmentation || false,
            data_balancing_enabled: dataPreparation.balancing || true,
            data_feature_selection_enabled: dataPreparation.featureSelection || true,
            data_time_features_enabled: dataPreparation.timeFeatures || true,
            data_market_context_enabled: dataPreparation.marketContext || true
        };

        for (const [key, value] of Object.entries(dataSettings)) {
            await SettingsService.updateSetting(key, value);
            console.log(`  ✓ ${key}: ${value}`);
        }
    }

    // Применить настройки мониторинга
    async applyMonitoringSettings() {
        const { monitoring } = this.recommendations;
        
        console.log('📈 Applying monitoring settings...');
        
        const monitoringSettings = {
            monitoring_accuracy_threshold: monitoring.accuracyThreshold || 0.65,
            monitoring_performance_check_interval: monitoring.performanceCheckInterval || 3600000,
            monitoring_alert_on_degradation: monitoring.alertOnDegradation || true,
            monitoring_alert_on_overfitting: monitoring.alertOnOverfitting || true,
            monitoring_alert_on_data_drift: monitoring.alertOnDataDrift || true,
            monitoring_performance_history_days: monitoring.performanceHistoryDays || 30
        };

        for (const [key, value] of Object.entries(monitoringSettings)) {
            await SettingsService.updateSetting(key, value);
            console.log(`  ✓ ${key}: ${value}`);
        }
    }

    // Получить сводку примененных настроек
    getAppliedSettingsSummary() {
        if (!this.recommendations) {
            return { message: 'Настройки еще не применены' };
        }

        return {
            strategy: this.recommendations.strategy,
            hyperparameters: this.recommendations.hyperparameters,
            schedule: this.recommendations.schedule,
            dataPreparation: this.recommendations.dataPreparation,
            monitoring: this.recommendations.monitoring,
            appliedAt: new Date().toISOString()
        };
    }

    // Сбросить настройки к значениям по умолчанию
    async resetToDefaults() {
        console.log('🔄 Resetting settings to defaults...');
        
        try {
            const defaultSettings = {
                // Планировщик
                cache_update_interval: '0 */6 * * *',
                analysis_interval: '0 */2 * * *',
                nn_training_schedule: '0 3 * * 1',
                nn_training_interval: '*/15 * * * *',
                
                // Нейросеть
                nn_training_days: 180,
                nn_training_limit: 50,
                nn_quick_training_enabled: true,
                nn_quick_training_limit: 10,
                nn_quick_training_days: 30,
                nn_learning_rate: 0.001,
                nn_batch_size: 32,
                nn_epochs: 50,
                nn_dropout_rate: 0.2,
                nn_validation_split: 0.2,
                nn_early_stopping_patience: 10,
                nn_training_strategy: 'progressive',
                nn_sequence_length: 60,
                nn_prediction_horizon: 5,
                nn_accuracy_threshold: 0.6
            };

            for (const [key, value] of Object.entries(defaultSettings)) {
                await SettingsService.updateSetting(key, value);
                console.log(`  ✓ Reset ${key}: ${value}`);
            }

            console.log('✅ Settings reset to defaults');
            return { success: true, message: 'Настройки сброшены к значениям по умолчанию' };

        } catch (error) {
            console.error('❌ Error resetting settings:', error);
            return { success: false, message: 'Ошибка при сбросе настроек', error: error.message };
        }
    }

    // Проверить текущие настройки
    async checkCurrentSettings() {
        console.log('🔍 Checking current settings...');
        
        try {
            const schedulerSettings = await SettingsService.getSchedulerSettings();
            const nnSettings = await SettingsService.getNeuralNetworkSettings();
            
            return {
                scheduler: schedulerSettings,
                neuralNetwork: nnSettings,
                checkedAt: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Error checking settings:', error);
            return { error: error.message };
        }
    }

    // Сравнить текущие настройки с рекомендуемыми
    async compareWithRecommendations() {
        console.log('📊 Comparing current settings with recommendations...');
        
        try {
            const currentSettings = await this.checkCurrentSettings();
            const recommendations = await TrainingRecommendations.getPersonalizedRecommendations();
            
            const comparison = {
                scheduler: this.compareSchedulerSettings(currentSettings.scheduler, recommendations.schedule),
                neuralNetwork: this.compareNeuralNetworkSettings(currentSettings.neuralNetwork, recommendations.hyperparameters),
                dataPreparation: this.compareDataPreparationSettings(recommendations.dataPreparation),
                monitoring: this.compareMonitoringSettings(recommendations.monitoring)
            };

            return {
                current: currentSettings,
                recommendations: recommendations,
                comparison: comparison,
                comparedAt: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Error comparing settings:', error);
            return { error: error.message };
        }
    }

    // Вспомогательные методы для сравнения
    compareSchedulerSettings(current, recommended) {
        return {
            cache_update_interval: {
                current: current.cache_update_interval,
                recommended: '0 */4 * * *',
                match: current.cache_update_interval === '0 */4 * * *'
            },
            analysis_interval: {
                current: current.analysis_interval,
                recommended: '0 */1 * * *',
                match: current.analysis_interval === '0 */1 * * *'
            },
            nn_training_interval: {
                current: current.nn_training_interval,
                recommended: recommended.quickTrainingSchedule,
                match: current.nn_training_interval === recommended.quickTrainingSchedule
            }
        };
    }

    compareNeuralNetworkSettings(current, recommended) {
        return {
            learning_rate: {
                current: current.nn_learning_rate,
                recommended: recommended.learningRate,
                match: Math.abs(current.nn_learning_rate - recommended.learningRate) < 0.0001
            },
            batch_size: {
                current: current.nn_batch_size,
                recommended: recommended.batchSize,
                match: current.nn_batch_size === recommended.batchSize
            },
            epochs: {
                current: current.nn_epochs,
                recommended: recommended.epochs,
                match: current.nn_epochs === recommended.epochs
            },
            dropout_rate: {
                current: current.nn_dropout_rate,
                recommended: recommended.dropout,
                match: Math.abs(current.nn_dropout_rate - recommended.dropout) < 0.01
            }
        };
    }

    compareDataPreparationSettings(recommended) {
        return {
            normalization: {
                recommended: recommended.normalization,
                status: 'Новая настройка'
            },
            augmentation: {
                recommended: recommended.augmentation,
                status: 'Новая настройка'
            },
            balancing: {
                recommended: recommended.balancing,
                status: 'Новая настройка'
            }
        };
    }

    compareMonitoringSettings(recommended) {
        return {
            accuracy_threshold: {
                recommended: recommended.accuracyThreshold,
                status: 'Новая настройка'
            },
            performance_check_interval: {
                recommended: recommended.performanceCheckInterval,
                status: 'Новая настройка'
            }
        };
    }
}

export default new ApplyRecommendedSettings();
