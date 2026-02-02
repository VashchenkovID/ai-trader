import CacheService from './CacheService.js';
import NeuralNetworkService from './NeuralNetworkService.js';
import TrainingState from '../models/TrainingState.js';
import { Op } from 'sequelize';

/**
 * Сервис для быстрого обучения нейросетей
 * Обучает небольшие батчи инструментов каждые 2 часа
 * Обучает все типы нейросетей: Базовая → Ансамбль → Мета-обучение → RL
 * Использует оптимизированные параметры для скорости (меньше эпох, меньше данных)
 */
class QuickTrainingService {
    constructor() {
        this.isTraining = false;
        this.batchSize = 10; // Количество инструментов за один запуск (по умолчанию)
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
    async trainQuickBatch(instruments, trainingDays = 30) {
        if (!instruments || instruments.length === 0) {
            return {
                success: true,
                processed: 0,
                successful: 0,
                errors: 0
            };
        }

        // Проверяем флаг в QuickTrainingService (локальный)
        if (this.isTraining) {
            console.warn('⚠️ [QuickTrainingService] Training already in progress, skipping');
            return {
                success: false,
                message: 'Training already in progress'
            };
        }

        // Проверяем флаг в SchedulerService (глобальный)
        try {
            const SchedulerService = (await import('./SchedulerService.js')).default;
            if (SchedulerService && (SchedulerService.isTraining || SchedulerService.isAnalyzing)) {
                console.warn(`⚠️ [QuickTrainingService] Skipped: SchedulerService.isTraining=${SchedulerService.isTraining}, isAnalyzing=${SchedulerService.isAnalyzing}`);
                return {
                    success: false,
                    message: 'SchedulerService training or analysis in progress'
                };
            }
        } catch (e) {
            // Игнорируем ошибку импорта
        }

        this.isTraining = true;
        const startTime = Date.now();
        let successCount = 0;
        let errorCount = 0;

        try {

            // Проверяем, не идет ли полное обучение
            const isFullTrainingActive = await this.isFullTrainingActive();
            if (isFullTrainingActive) {
                return {
                    success: false,
                    message: 'Full training is active'
                };
            }

            // ПОСЛЕДОВАТЕЛЬНОЕ ОБУЧЕНИЕ ВСЕХ НЕЙРОСЕТЕЙ: Базовая → Ансамбль → Мета-обучение → RL
            // Используем оптимизированные параметры для быстрого обучения
            
            for (const instrument of instruments) {
                let networksTrained = 0;
                let networksFailed = 0;
                
                // Этап 1: Базовая нейросеть
                try {
                    await NeuralNetworkService.trainQuick(instrument.figi, {
                        epochs: 15, // Вместо стандартных 50-100
                        dataDays: trainingDays, // Используем настройку из БД
                        skipValidation: true // Пропускаем валидацию для скорости
                    });
                    networksTrained++;
                } catch (error) {
                    networksFailed++;
                    console.error(`❌ [Quick Base] Training failed for ${instrument.ticker}:`, error.message);
                }
                
                // Этап 2: Ансамбль (с оптимизированными параметрами)
                try {
                    const EnsembleService = (await import('./EnsembleService.js')).default;
                    await EnsembleService.trainEnsemble(instrument.figi, {
                        days: trainingDays,
                        epochs: 20 // Вместо стандартных 50
                    });
                    networksTrained++;
                } catch (error) {
                    networksFailed++;
                    console.error(`❌ [Quick Ensemble] Training failed for ${instrument.ticker}:`, error.message);
                }
                
                // Этап 3: Мета-обучение
                try {
                    const MetaLearningService = (await import('./MetaLearningService.js')).default;
                    await MetaLearningService.train(instrument.figi, {
                        days: trainingDays
                    });
                    networksTrained++;
                } catch (error) {
                    networksFailed++;
                    console.error(`❌ [Quick Meta] Training failed for ${instrument.ticker}:`, error.message);
                }
                
                // Этап 4: Обучение с подкреплением (с оптимизированными параметрами)
                try {
                    const ReinforcementLearningService = (await import('./ReinforcementLearningService.js')).default;
                    await ReinforcementLearningService.train(instrument.figi, {
                        days: trainingDays,
                        episodes: 20 // Вместо стандартных 50
                    });
                    networksTrained++;
                } catch (error) {
                    networksFailed++;
                    console.error(`❌ [Quick RL] Training failed for ${instrument.ticker}:`, error.message);
                }
                
                // Считаем инструмент успешным, если хотя бы одна нейросеть обучилась
                if (networksTrained > 0) {
                    successCount++;
                }
                errorCount += networksFailed;
            }

            const executionTimeSeconds = (Date.now() - startTime) / 1000;
            
            // Обновляем состояние обучения
            await TrainingState.updateAfterTraining('quick', {
                processedCount: instruments.length,
                successCount,
                errorCount,
                executionTimeSeconds
            });


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
        const startTime = Date.now();
        
        try {
            // Получаем настройки из БД
            const SettingsService = (await import('./SettingsService.js')).default;
            const nnSettings = await SettingsService.getNeuralNetworkSettings();
            
            // Используем настройки из БД или значения по умолчанию
            const trainingLimit = nnSettings.nn_quick_training_limit || this.batchSize;
            const trainingDays = nnSettings.nn_quick_training_days || 30;

            // Получаем следующие инструменты для обучения с учетом лимита из настроек
            const instruments = await this.getNextInstruments(trainingLimit);
            
            if (instruments.length === 0) {
                console.warn('⚠️ No instruments available for quick training');
                return;
            }

            // Обучаем батч с учетом настроек дней
            const result = await this.trainQuickBatch(instruments, trainingDays);
            
            // Отправляем уведомление в Telegram
            if (result && result.success) {
                const duration = Math.round((Date.now() - startTime) / 1000);
                await this.sendTelegramNotification(result, duration, instruments.length);
            } else if (result && !result.success) {
                // Отправляем уведомление об ошибке
                const duration = Math.round((Date.now() - startTime) / 1000);
                await this.sendTelegramErrorNotification(result, duration);
            }
        } catch (error) {
            console.error('❌ Error performing quick training:', error);
            // Отправляем уведомление об ошибке
            const duration = Math.round((Date.now() - startTime) / 1000);
            await this.sendTelegramErrorNotification({ error: error.message }, duration);
        }
    }

    /**
     * Отправить уведомление в Telegram о завершении быстрого обучения
     */
    async sendTelegramNotification(result, duration, totalInstruments) {
        try {
            const OptimizedTelegramService = (await import('./OptimizedTelegramService.js')).default;
            const { successful, errors } = result;
            
            // Отправляем уведомление о завершении
            if (successful > 0) {
                await OptimizedTelegramService.sendAlert(
                    'QUICK_TRAINING_COMPLETED',
                    `⚡ <b>БЫСТРОЕ ОБУЧЕНИЕ ЗАВЕРШЕНО</b>\n\n📊 Результаты:\n• Успешно обучено: ${successful} инструментов\n• Ошибок: ${errors || 0}\n• Время выполнения: ${duration} секунд\n• Инструментов в очереди: ${totalInstruments}\n\n🧠 Обучены все типы нейросетей:\n• Базовая нейросеть\n• Ансамбль моделей\n• Мета-обучение\n• Обучение с подкреплением\n\n✅ Нейросети обновлены и готовы к работе`,
                    'success'
                );
            }

            // Отправляем уведомление только при критических ошибках
            if (errors > 5) {
                await OptimizedTelegramService.sendAlert(
                    'QUICK_TRAINING_ERRORS',
                    `⚠️ Быстрое обучение завершено с ошибками:\n• Успешно: ${successful}\n• Ошибок: ${errors}\n• Время: ${duration}с`,
                    'warning'
                );
            }
        } catch (error) {
            console.error('❌ Error sending Telegram notification:', error);
        }
    }

    /**
     * Отправить уведомление об ошибке в Telegram
     */
    async sendTelegramErrorNotification(result, duration) {
        try {
            const OptimizedTelegramService = (await import('./OptimizedTelegramService.js')).default;
            const errorMessage = result.error || result.message || 'Неизвестная ошибка';
            
            await OptimizedTelegramService.sendAlert(
                'QUICK_TRAINING_ERROR',
                `🚨 <b>ОШИБКА БЫСТРОГО ОБУЧЕНИЯ</b>\n\n❌ ${errorMessage}\n\n⏱️ Время до ошибки: ${duration}с`,
                'critical'
            );
        } catch (error) {
            console.error('❌ Error sending Telegram error notification:', error);
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

