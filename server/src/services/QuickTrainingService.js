import CacheService from './CacheService.js';
import NeuralNetworkService from './NeuralNetworkService.js';
import TrainingState from '../models/TrainingState.js';
import { Op } from 'sequelize';

/**
 * Сервис для быстрого обучения нейросетей
 * Обучает небольшие батчи инструментов (по 10) каждые 2 часа
 */
class QuickTrainingService {
    constructor() {
        this.isTraining = false;
        this.currentBatch = [];
        this.batchSize = 10; // Количество инструментов за один запуск
        this.minHoursSinceLastTraining = 2; // Минимальное время между обучениями одного инструмента
    }

    /**
     * Получить следующие инструменты для быстрого обучения
     * Использует циклическую ротацию
     */
    async getNextInstruments(limit = null) {
        try {
            const batchSize = limit || this.batchSize;
            
            // Получаем все активные инструменты
            const allInstruments = await CacheService.getAllInstruments();
            
            if (!allInstruments || allInstruments.length === 0) {
                console.warn('⚠️ No instruments available for quick training');
                return [];
            }

            // Получаем состояние обучения
            const state = await TrainingState.getOrCreateState('quick');
            
            // Фильтруем инструменты: исключаем те, что были обучены менее 2 часов назад
            const twoHoursAgo = new Date(Date.now() - this.minHoursSinceLastTraining * 60 * 60 * 1000);
            
            // Получаем список инструментов, которые были обучены недавно
            // Для этого можно использовать информацию из моделей или БД
            // Пока используем простую логику: берем инструменты начиная с lastProcessedIndex
            
            const startIndex = state.lastProcessedIndex;
            const selectedInstruments = [];
            
            // Циклически проходим по списку инструментов
            for (let i = 0; i < allInstruments.length && selectedInstruments.length < batchSize; i++) {
                const index = (startIndex + i) % allInstruments.length;
                const instrument = allInstruments[index];
                
                // Проверяем наличие данных (свечей) для обучения
                // Минимум нужно 30 дней данных
                const hasEnoughData = await this.hasEnoughData(instrument.figi);
                
                if (hasEnoughData) {
                    selectedInstruments.push(instrument);
                }
            }
            
            console.log(`📊 Selected ${selectedInstruments.length} instruments for quick training (from index ${startIndex})`);
            
            return selectedInstruments;
        } catch (error) {
            console.error('❌ Error getting next instruments for quick training:', error);
            return [];
        }
    }

    /**
     * Проверяет, есть ли достаточно данных для обучения
     */
    async hasEnoughData(figi) {
        try {
            const CachedCandle = (await import('../models/CachedCandle.js')).default;
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            
            const candleCount = await CachedCandle.count({
                where: {
                    figi: figi,
                    time: {
                        [Op.gte]: thirtyDaysAgo
                    }
                }
            });
            
            // Минимум 20 свечей (примерно 20 торговых дней)
            return candleCount >= 20;
        } catch (error) {
            console.warn(`⚠️ Error checking data for ${figi}:`, error.message);
            return false;
        }
    }

    /**
     * Быстрое обучение батча инструментов
     */
    async trainQuickBatch(instruments) {
        if (!instruments || instruments.length === 0) {
            console.log('⏭️ No instruments to train in quick batch');
            return {
                success: true,
                processed: 0,
                successful: 0,
                errors: 0
            };
        }

        if (this.isTraining) {
            console.warn('⚠️ Quick training already in progress, skipping');
            return {
                success: false,
                message: 'Training already in progress'
            };
        }

        this.isTraining = true;
        const startTime = Date.now();
        let successCount = 0;
        let errorCount = 0;

        try {
            console.log(`🚀 Starting quick training batch: ${instruments.length} instruments`);
            
            // Проверяем, не идет ли полное обучение
            const isFullTrainingActive = await this.isFullTrainingActive();
            if (isFullTrainingActive) {
                console.log('⏭️ Full training is active, skipping quick training');
                return {
                    success: false,
                    message: 'Full training is active'
                };
            }

            for (const instrument of instruments) {
                try {
                    console.log(`🔧 Quick training: ${instrument.ticker} (${instrument.figi})`);
                    
                    // Быстрое обучение только базовой нейросети
                    // Используем оптимизированные параметры: меньше эпох, меньше данных
                    await NeuralNetworkService.trainQuick(instrument.figi, {
                        epochs: 15, // Вместо стандартных 50-100
                        dataDays: 60, // Последние 60 дней вместо всех данных
                        skipValidation: true // Пропускаем валидацию для скорости
                    });
                    
                    successCount++;
                    console.log(`✅ Quick training completed for ${instrument.ticker}`);
                } catch (error) {
                    errorCount++;
                    console.error(`❌ Quick training failed for ${instrument.ticker}:`, error.message);
                    // Продолжаем обучение других инструментов
                }
            }

            const executionTimeSeconds = (Date.now() - startTime) / 1000;
            
            // Обновляем состояние обучения
            await TrainingState.updateAfterTraining('quick', {
                processedCount: instruments.length,
                successCount,
                errorCount,
                executionTimeSeconds
            });

            console.log(`✅ Quick training batch completed: ${successCount} successful, ${errorCount} errors (${executionTimeSeconds.toFixed(1)}s)`);

            return {
                success: true,
                processed: instruments.length,
                successful: successCount,
                errors: errorCount,
                executionTime: executionTimeSeconds
            };
        } catch (error) {
            console.error('❌ Error in quick training batch:', error);
            return {
                success: false,
                error: error.message
            };
        } finally {
            this.isTraining = false;
        }
    }

    /**
     * Проверяет, активно ли полное обучение
     */
    async isFullTrainingActive() {
        try {
            const SchedulerService = (await import('./SchedulerService.js')).default;
            return SchedulerService.isTraining === true;
        } catch (error) {
            console.warn('⚠️ Error checking full training status:', error.message);
            return false;
        }
    }

    /**
     * Выполнить быстрое обучение (главный метод)
     */
    async performQuickTraining() {
        try {
            console.log('⚡ Starting scheduled quick training...');
            
            // Получаем следующие инструменты для обучения
            const instruments = await this.getNextInstruments();
            
            if (instruments.length === 0) {
                console.log('⏭️ No instruments available for quick training');
                return;
            }

            // Обучаем батч
            const result = await this.trainQuickBatch(instruments);
            
            if (result.success) {
                console.log(`✅ Quick training completed: ${result.successful}/${result.processed} successful`);
            } else {
                console.log(`⚠️ Quick training skipped: ${result.message || result.error}`);
            }
        } catch (error) {
            console.error('❌ Error performing quick training:', error);
        }
    }

    /**
     * Получить статистику быстрого обучения
     */
    async getStats() {
        try {
            const state = await TrainingState.getOrCreateState('quick');
            return {
                lastRunTime: state.lastRunTime,
                dailyProcessedCount: state.dailyProcessedCount,
                totalSuccessful: state.totalSuccessfulTrainings,
                totalErrors: state.totalErrors,
                averageExecutionTime: state.averageExecutionTime,
                lastProcessedIndex: state.lastProcessedIndex
            };
        } catch (error) {
            console.error('❌ Error getting quick training stats:', error);
            return null;
        }
    }
}

export default new QuickTrainingService();

