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
        this.minHoursSinceLastTraining = 24; // Минимальное время между обучениями одного инструмента (24 часа = 1 раз в сутки)
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
            
            // Фильтруем инструменты: исключаем те, что были обучены менее 24 часов назад (не более раза в сутки)
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            
            // Получаем список инструментов, которые были обучены недавно
            // Для этого проверяем время последнего обучения через ModelManager
            
            const startIndex = state.lastProcessedIndex;
            const selectedInstruments = [];
            const ModelManager = (await import('../utils/ModelManager.js')).default;
            const modelManager = new ModelManager();
            
            // Циклически проходим по списку инструментов
            for (let i = 0; i < allInstruments.length && selectedInstruments.length < batchSize; i++) {
                const index = (startIndex + i) % allInstruments.length;
                const instrument = allInstruments[index];
                
                // Проверяем наличие данных (свечей) для обучения
                // Минимум нужно 30 дней данных
                const hasEnoughData = await this.hasEnoughData(instrument.figi);
                
                if (!hasEnoughData) {
                    continue;
                }
                
                // Проверяем, когда последний раз обучалась модель для этого инструмента
                // Проверяем базовую модель (основная модель для инструмента)
                let canTrain = true;
                try {
                    const modelName = `neural-network/${instrument.figi}`;
                    const modelInfo = await modelManager.getModelInfo(modelName);
                    
                    if (modelInfo && modelInfo.modified) {
                        const lastTrainingTime = new Date(modelInfo.modified);
                        if (lastTrainingTime > oneDayAgo) {
                            // Модель обучалась менее 24 часов назад - пропускаем
                            canTrain = false;
                        }
                    }
                } catch (error) {
                    // Если не удалось получить информацию о модели, считаем что можно обучать
                    // (модель может не существовать, что нормально для новых инструментов)
                }
                
                if (canTrain) {
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
    async trainQuickBatch(instruments, trainingDays = 30, workerId = null) {
        if (!instruments || instruments.length === 0) {
            return {
                success: true,
                processed: 0,
                successful: 0,
                errors: 0
            };
        }

        const startTime = Date.now();
        let successCount = 0;
        let errorCount = 0;

        try {
            // Обновляем прогресс воркера - начало обучения
            if (workerId) {
                try {
                    const WorkerMonitoringService = (await import('./WorkerMonitoringService.js')).default;
                    if (WorkerMonitoringService.isInitialized) {
                        WorkerMonitoringService.updateWorkerStatus(workerId, {
                            progress: 0,
                            metadata: {
                                totalInstruments: instruments.length,
                                currentInstrument: 0,
                                stage: 'starting'
                            }
                        });
                    }
                } catch (monitoringError) {
                    console.warn('⚠️ Failed to update worker status:', monitoringError.message);
                }
            }

            // ПОСЛЕДОВАТЕЛЬНОЕ ОБУЧЕНИЕ ВСЕХ НЕЙРОСЕТЕЙ: Базовая → Ансамбль → Мета-обучение → RL
            // Используем оптимизированные параметры для быстрого обучения
            
            for (let instrumentIndex = 0; instrumentIndex < instruments.length; instrumentIndex++) {
                const instrument = instruments[instrumentIndex];
                
                // Обновляем прогресс воркера
                if (workerId) {
                    try {
                        const WorkerMonitoringService = (await import('./WorkerMonitoringService.js')).default;
                        if (WorkerMonitoringService.isInitialized) {
                            const progress = Math.floor((instrumentIndex / instruments.length) * 100);
                            WorkerMonitoringService.updateWorkerStatus(workerId, {
                                progress,
                                metadata: {
                                    totalInstruments: instruments.length,
                                    currentInstrument: instrumentIndex + 1,
                                    currentTicker: instrument.ticker || instrument.figi?.substring(0, 10),
                                    figi: instrument.figi,
                                    stage: 'training'
                                }
                            });
                        }
                    } catch (monitoringError) {
                        console.warn('⚠️ Failed to update worker status:', monitoringError.message);
                    }
                }
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
                    const result = await EnsembleService.trainEnsemble(instrument.figi, {
                        days: trainingDays,
                        epochs: 20 // Вместо стандартных 50
                    });
                    
                    // Проверяем, был ли инструмент пропущен из-за недостаточных данных
                    if (result && result.skipped) {
                        console.log(`ℹ️ [Quick Ensemble] Skipped ${instrument.ticker}: ${result.message || 'insufficient data'}`);
                        // Не считаем это ошибкой, просто пропускаем
                    } else if (result && result.success) {
                        networksTrained++;
                    } else {
                        networksFailed++;
                        console.warn(`⚠️ [Quick Ensemble] Training failed for ${instrument.ticker}: ${result?.message || 'unknown error'}`);
                    }
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

            // Обновляем прогресс воркера - завершение
            if (workerId) {
                try {
                    const WorkerMonitoringService = (await import('./WorkerMonitoringService.js')).default;
                    if (WorkerMonitoringService.isInitialized) {
                        WorkerMonitoringService.updateWorkerStatus(workerId, {
                            progress: 100,
                            metadata: {
                                totalInstruments: instruments.length,
                                successful: successCount,
                                errors: errorCount,
                                stage: 'completed'
                            }
                        });
                    }
                } catch (monitoringError) {
                    console.warn('⚠️ Failed to update worker status:', monitoringError.message);
                }
            }

            return {
                success: true,
                processed: instruments.length,
                successful: successCount,
                errors: errorCount,
                executionTime: executionTimeSeconds
            };
        } catch (error) {
            console.error('❌ Error in quick training batch:', error);
            
            // Обновляем воркер с ошибкой
            if (workerId) {
                try {
                    const WorkerMonitoringService = (await import('./WorkerMonitoringService.js')).default;
                    if (WorkerMonitoringService.isInitialized) {
                        WorkerMonitoringService.reportWorkerError(workerId, error.message);
                    }
                } catch (monitoringError) {
                    console.warn('⚠️ Failed to report worker error:', monitoringError.message);
                }
            }
            
            return {
                success: false,
                error: error.message
            };
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
        let workerId = null;
        
        try {
            // Регистрируем воркер в мониторинге
            try {
                const WorkerMonitoringService = (await import('./WorkerMonitoringService.js')).default;
                if (!WorkerMonitoringService.isInitialized) {
                    await WorkerMonitoringService.initialize();
                }
                workerId = WorkerMonitoringService.registerWorker(
                    'quick-training',
                    'Быстрое обучение нейросетей',
                    {
                        stage: 'initializing',
                        totalInstruments: 0
                    }
                );
            } catch (monitoringError) {
                console.warn('⚠️ Failed to register quick training worker:', monitoringError.message);
            }
            
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
                
                // Завершаем воркер, если нет инструментов
                if (workerId) {
                    try {
                        const WorkerMonitoringService = (await import('./WorkerMonitoringService.js')).default;
                        if (WorkerMonitoringService.isInitialized) {
                            WorkerMonitoringService.completeWorker(workerId, true, {
                                reason: 'no_instruments',
                                message: 'No instruments available for training'
                            });
                        }
                    } catch (monitoringError) {
                        console.warn('⚠️ Failed to complete worker:', monitoringError.message);
                    }
                }
                return;
            }

            // Отправляем уведомление о начале обучения с информацией о том, что будет учиться
            try {
                const OptimizedTelegramService = (await import('./OptimizedTelegramService.js')).default;
                // Формируем список всех инструментов
                const allInstrumentNames = instruments.map(inst => inst.ticker || inst.figi?.substring(0, 10)).join(', ');
                
                await OptimizedTelegramService.sendAlert(
                    'QUICK_TRAINING_START',
                    `⚡ <b>БЫСТРОЕ ОБУЧЕНИЕ НАЧАЛОСЬ</b>\n\n` +
                    `📊 <b>Будет обучаться:</b>\n` +
                    `• Инструментов: ${instruments.length}\n` +
                    `• Список инструментов: ${allInstrumentNames}\n` +
                    `• Дней данных: ${trainingDays}\n\n` +
                    `🧠 <b>Типы нейросетей:</b>\n` +
                    `• Базовая нейросеть (15 эпох)\n` +
                    `• Ансамбль моделей (20 эпох)\n` +
                    `• Мета-обучение\n` +
                    `• Обучение с подкреплением (20 эпизодов)\n\n` +
                    `⏰ Время начала: ${new Date().toLocaleString('ru-RU')}`,
                    'info'
                );
            } catch (telegramError) {
                console.warn('⚠️ Failed to send Telegram notification about quick training start:', telegramError.message);
            }

            // Обновляем метаданные воркера с количеством инструментов
            if (workerId) {
                try {
                    const WorkerMonitoringService = (await import('./WorkerMonitoringService.js')).default;
                    if (WorkerMonitoringService.isInitialized) {
                        WorkerMonitoringService.updateWorkerStatus(workerId, {
                            metadata: {
                                totalInstruments: instruments.length,
                                trainingDays,
                                stage: 'preparing'
                            }
                        });
                    }
                } catch (monitoringError) {
                    console.warn('⚠️ Failed to update worker status:', monitoringError.message);
                }
            }

            // Обучаем батч с учетом настроек дней
            const result = await this.trainQuickBatch(instruments, trainingDays, workerId);
            
            // Отправляем уведомление в Telegram
            if (result && result.success) {
                const duration = Math.round((Date.now() - startTime) / 1000);
                await this.sendTelegramNotification(result, duration, instruments.length);
                
                // Завершаем воркер успешно
                if (workerId) {
                    try {
                        const WorkerMonitoringService = (await import('./WorkerMonitoringService.js')).default;
                        if (WorkerMonitoringService.isInitialized) {
                            WorkerMonitoringService.completeWorker(workerId, true, {
                                processed: result.processed,
                                successful: result.successful,
                                errors: result.errors,
                                executionTime: result.executionTime
                            });
                        }
                    } catch (monitoringError) {
                        console.warn('⚠️ Failed to complete worker:', monitoringError.message);
                    }
                }
            } else if (result && !result.success) {
                // Отправляем уведомление об ошибке
                const duration = Math.round((Date.now() - startTime) / 1000);
                await this.sendTelegramErrorNotification(result, duration);
                
                // Завершаем воркер с ошибкой
                if (workerId) {
                    try {
                        const WorkerMonitoringService = (await import('./WorkerMonitoringService.js')).default;
                        if (WorkerMonitoringService.isInitialized) {
                            WorkerMonitoringService.completeWorker(workerId, false, {
                                error: result.error || result.message
                            });
                        }
                    } catch (monitoringError) {
                        console.warn('⚠️ Failed to complete worker:', monitoringError.message);
                    }
                }
            }
        } catch (error) {
            console.error('❌ Error performing quick training:', error);
            // Отправляем уведомление об ошибке
            const duration = Math.round((Date.now() - startTime) / 1000);
            await this.sendTelegramErrorNotification({ error: error.message }, duration);
            
            // Завершаем воркер с ошибкой
            if (workerId) {
                try {
                    const WorkerMonitoringService = (await import('./WorkerMonitoringService.js')).default;
                    if (WorkerMonitoringService.isInitialized) {
                        WorkerMonitoringService.reportWorkerError(workerId, error.message);
                        WorkerMonitoringService.completeWorker(workerId, false, {
                            error: error.message
                        });
                    }
                } catch (monitoringError) {
                    console.warn('⚠️ Failed to report worker error:', monitoringError.message);
                }
            }
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

