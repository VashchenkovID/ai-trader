/**
 * API routes для недельных прогнозов цен
 */

import express from 'express';
import WeeklyForecastService from '../services/WeeklyForecastService.js';
import WeeklyForecast from '../models/WeeklyForecast.js';
import { Op } from 'sequelize';
import LoggerService from '../services/LoggerService.js';

const router = express.Router();

/**
 * GET /api/weekly-forecast/:figi
 * Получение активного прогноза для инструмента
 */
router.get('/:figi', async (req, res) => {
    try {
        const { figi } = req.params;
        const { includeCompleted = false } = req.query;

        // Убеждаемся, что сервис инициализирован
        if (!WeeklyForecastService.isInitialized) {
            await WeeklyForecastService.initialize();
        }

        // Получаем активный прогноз
        const forecast = await WeeklyForecastService.getActiveForecast(figi, {
            includeCompleted: includeCompleted === 'true'
        });

        if (!forecast) {
            return res.status(404).json({
                success: false,
                error: 'Прогноз не найден',
                figi
            });
        }

        res.json({
            success: true,
            data: forecast
        });
    } catch (error) {
        if (LoggerService.isInitialized) {
            LoggerService.error('Error getting weekly forecast', {
                service: 'WeeklyForecastRoutes',
                operation: 'GET /:figi',
                figi: req.params.figi,
                error: { message: error.message, stack: error.stack }
            });
        }
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/weekly-forecast/:figi/history
 * Получение истории прогнозов для инструмента
 */
router.get('/:figi/history', async (req, res) => {
    try {
        const { figi } = req.params;
        const { limit = 10, includeCompleted = true } = req.query;

        const where = { figi };
        if (includeCompleted !== 'true') {
            where.isCompleted = false;
        }

        const forecasts = await WeeklyForecast.findAll({
            where,
            order: [['forecastDate', 'DESC']],
            limit: parseInt(limit)
        });

        // Нормализуем даты в строках для всех прогнозов
        const normalizedForecasts = forecasts.map(forecast => {
            const forecastJson = forecast.toJSON();
            // Нормализуем даты в строки ISO
            const normalizeDate = (dateValue, modelValue) => {
                if (!dateValue && dateValue !== 0) return dateValue;
                
                // Если дата пришла как пустой объект {} или невалидный объект
                if (typeof dateValue === 'object' && !(dateValue instanceof Date)) {
                    // Проверяем, является ли это пустым объектом
                    if (Object.keys(dateValue).length === 0 && modelValue) {
                        try {
                            const date = new Date(modelValue);
                            if (!isNaN(date.getTime())) {
                                return date.toISOString();
                            }
                        } catch (e) {
                            // Игнорируем ошибки
                        }
                    }
                    // Если это не пустой объект, но и не Date, пробуем преобразовать из модели
                    if (modelValue) {
                        try {
                            const date = new Date(modelValue);
                            if (!isNaN(date.getTime())) {
                                return date.toISOString();
                            }
                        } catch (e) {
                            // Игнорируем ошибки
                        }
                    }
                    return null;
                }
                
                if (dateValue instanceof Date) {
                    return dateValue.toISOString();
                }
                if (typeof dateValue === 'string') {
                    return dateValue;
                }
                
                // Если modelValue есть, пробуем использовать его
                if (modelValue) {
                    try {
                        const date = new Date(modelValue);
                        if (!isNaN(date.getTime())) {
                            return date.toISOString();
                        }
                    } catch (e) {
                        // Игнорируем ошибки
                    }
                }
                return null;
            };
            
            if (forecastJson.forecastDate) {
                forecastJson.forecastDate = normalizeDate(forecastJson.forecastDate, forecast.forecastDate);
            }
            if (forecastJson.startDate) {
                forecastJson.startDate = normalizeDate(forecastJson.startDate, forecast.startDate);
            }
            if (forecastJson.endDate) {
                forecastJson.endDate = normalizeDate(forecastJson.endDate, forecast.endDate);
            }
            if (forecastJson.completionDate) {
                forecastJson.completionDate = normalizeDate(forecastJson.completionDate, forecast.completionDate);
            }
            if (forecastJson.createdAt) {
                forecastJson.createdAt = normalizeDate(forecastJson.createdAt, forecast.createdAt);
            }
            if (forecastJson.updatedAt) {
                forecastJson.updatedAt = normalizeDate(forecastJson.updatedAt, forecast.updatedAt);
            }
            
            return forecastJson;
        });

        res.json({
            success: true,
            data: {
                forecasts: normalizedForecasts,
                count: normalizedForecasts.length
            }
        });
    } catch (error) {
        if (LoggerService.isInitialized) {
            LoggerService.error('Error getting forecast history', {
                service: 'WeeklyForecastRoutes',
                operation: 'GET /:figi/history',
                figi: req.params.figi,
                error: { message: error.message, stack: error.stack }
            });
        }
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/weekly-forecast/:figi/generate
 * Генерация нового прогноза для инструмента
 */
router.post('/:figi/generate', async (req, res) => {
    try {
        const { figi } = req.params;
        const { forceRegenerate = false } = req.body;

        // Убеждаемся, что сервис инициализирован
        if (!WeeklyForecastService.isInitialized) {
            await WeeklyForecastService.initialize();
        }

        // Генерируем прогноз
        const result = await WeeklyForecastService.generateForecast(figi, {
            forceRegenerate: forceRegenerate === true || forceRegenerate === 'true'
        });

        if (!result.success) {
            return res.status(400).json({
                success: false,
                error: result.error || 'Ошибка генерации прогноза'
            });
        }

        res.json({
            success: true,
            data: {
                forecast: result.forecast,
                cached: result.cached || false
            }
        });
    } catch (error) {
        if (LoggerService.isInitialized) {
            LoggerService.error('Error generating forecast', {
                service: 'WeeklyForecastRoutes',
                operation: 'POST /:figi/generate',
                figi: req.params.figi,
                error: { message: error.message, stack: error.stack }
            });
        }
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/weekly-forecast/:figi/metrics
 * Получение метрик точности для завершенных прогнозов
 */
router.get('/:figi/metrics', async (req, res) => {
    try {
        const { figi } = req.params;
        const { limit = 10 } = req.query;

        // Получаем завершенные прогнозы с метриками
        const forecasts = await WeeklyForecast.findAll({
            where: {
                figi,
                isCompleted: true,
                accuracyMetrics: { [Op.ne]: null }
            },
            order: [['completionDate', 'DESC']],
            limit: parseInt(limit)
        });

        // Агрегируем метрики
        const metrics = {
            totalForecasts: forecasts.length,
            averageMetrics: null,
            recentMetrics: forecasts.length > 0 ? forecasts[0].accuracyMetrics : null,
            allMetrics: forecasts.map(f => ({
                forecastId: f.id,
                forecastDate: f.forecastDate,
                completionDate: f.completionDate,
                metrics: f.accuracyMetrics
            }))
        };

        // Вычисляем средние метрики
        if (forecasts.length > 0) {
            const validMetrics = forecasts
                .map(f => f.accuracyMetrics)
                .filter(m => m !== null);

            if (validMetrics.length > 0) {
                metrics.averageMetrics = {
                    mae: validMetrics.reduce((sum, m) => sum + (parseFloat(m.mae) || 0), 0) / validMetrics.length,
                    mse: validMetrics.reduce((sum, m) => sum + (parseFloat(m.mse) || 0), 0) / validMetrics.length,
                    rmse: validMetrics.reduce((sum, m) => sum + (parseFloat(m.rmse) || 0), 0) / validMetrics.length,
                    mape: validMetrics.reduce((sum, m) => sum + (parseFloat(m.mape) || 0), 0) / validMetrics.length,
                    directionAccuracy: validMetrics.reduce((sum, m) => sum + (parseFloat(m.directionAccuracy) || 0), 0) / validMetrics.length,
                    sampleSize: validMetrics.reduce((sum, m) => sum + (m.sampleSize || 0), 0) / validMetrics.length
                };
            }
        }

        res.json({
            success: true,
            data: metrics
        });
    } catch (error) {
        if (LoggerService.isInitialized) {
            LoggerService.error('Error getting forecast metrics', {
                service: 'WeeklyForecastRoutes',
                operation: 'GET /:figi/metrics',
                figi: req.params.figi,
                error: { message: error.message, stack: error.stack }
            });
        }
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/weekly-forecast/:figi/update
 * Обновление прогноза реальными данными
 */
router.post('/:figi/update', async (req, res) => {
    try {
        const { figi } = req.params;
        const { forecastId } = req.body;

        // Убеждаемся, что сервис инициализирован
        if (!WeeklyForecastService.isInitialized) {
            await WeeklyForecastService.initialize();
        }

        // Обновляем прогноз
        const result = await WeeklyForecastService.updateWithActualData(figi, forecastId || null);

        if (!result.success) {
            return res.status(400).json({
                success: false,
                error: result.reason || 'Ошибка обновления прогноза'
            });
        }

        res.json({
            success: true,
            data: {
                forecast: result.forecast,
                metrics: result.metrics,
                matchedDays: result.matchedDays
            }
        });
    } catch (error) {
        if (LoggerService.isInitialized) {
            LoggerService.error('Error updating forecast', {
                service: 'WeeklyForecastRoutes',
                operation: 'POST /:figi/update',
                figi: req.params.figi,
                error: { message: error.message, stack: error.stack }
            });
        }
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/weekly-forecast/:figi/:forecastId
 * Получение конкретного прогноза по ID
 */
router.get('/:figi/:forecastId', async (req, res) => {
    try {
        const { figi, forecastId } = req.params;

        const forecast = await WeeklyForecast.findOne({
            where: {
                id: parseInt(forecastId),
                figi
            }
        });

        if (!forecast) {
            return res.status(404).json({
                success: false,
                error: 'Прогноз не найден'
            });
        }

        res.json({
            success: true,
            data: forecast
        });
    } catch (error) {
        if (LoggerService.isInitialized) {
            LoggerService.error('Error getting forecast by ID', {
                service: 'WeeklyForecastRoutes',
                operation: 'GET /:figi/:forecastId',
                figi: req.params.figi,
                forecastId: req.params.forecastId,
                error: { message: error.message, stack: error.stack }
            });
        }
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/weekly-forecast/performance/metrics
 * Получение метрик производительности сервиса
 */
router.get('/performance/metrics', async (req, res) => {
    try {
        // Убеждаемся, что сервис инициализирован
        if (!WeeklyForecastService.isInitialized) {
            await WeeklyForecastService.initialize();
        }

        const metrics = WeeklyForecastService.getPerformanceMetrics();

        res.json({
            success: true,
            data: metrics
        });
    } catch (error) {
        if (LoggerService.isInitialized) {
            LoggerService.error('Error getting performance metrics', {
                service: 'WeeklyForecastRoutes',
                operation: 'GET /performance/metrics',
                error: { message: error.message, stack: error.stack }
            });
        }
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/weekly-forecast/train
 * Ручной запуск обучения моделей Weekly Forecast
 */
router.post('/train', async (req, res) => {
    let workerId = null;
    try {
        const { figi = null, maxInstruments = null, trainingOptions = {} } = req.body;

        // Проверяем, не идет ли полное обучение
        try {
            const { getGlobalServiceManager } = await import('../services/GlobalServiceManager.js');
            const globalServiceManager = getGlobalServiceManager();
            const SchedulerService = globalServiceManager?.getServiceSafe('SchedulerService');
            if (SchedulerService && SchedulerService.isTraining) {
                const LoggerService = (await import('../services/LoggerService.js')).default;
                if (LoggerService.isInitialized) {
                    LoggerService.info('Weekly Forecast training skipped: full training is in progress', {
                        service: 'WeeklyForecastRoutes',
                        operation: 'POST /train'
                    });
                }
                
                // Отправляем уведомление в Telegram
                try {
                    const OptimizedTelegramService = (await import('../services/OptimizedTelegramService.js')).default;
                    if (OptimizedTelegramService.isInitialized) {
                        await OptimizedTelegramService.sendAlert(
                            'WEEKLY_FORECAST_TRAINING_SKIPPED',
                            `⏸️ <b>ОБУЧЕНИЕ WEEKLY FORECAST ПРОПУЩЕНО</b>\n\n⏰ Время: ${new Date().toLocaleString('ru-RU')}\n📊 Причина: Идет полное обучение\n\n🔄 Обучение Weekly Forecast будет выполнено после завершения полного обучения`,
                            'info'
                        );
                    }
                } catch (telegramError) {
                    // Игнорируем ошибки отправки уведомлений
                }
                
                return res.status(409).json({
                    success: false,
                    skipped: true,
                    reason: 'full_training_in_progress',
                    message: 'Weekly Forecast training skipped because full training is in progress'
                });
            }
        } catch (schedulerError) {
            // Если не удалось проверить статус, продолжаем (не блокируем обучение)
            const LoggerService = (await import('../services/LoggerService.js')).default;
            if (LoggerService.isInitialized) {
                LoggerService.warn('Failed to check full training status', {
                    service: 'WeeklyForecastRoutes',
                    operation: 'POST /train',
                    error: { message: schedulerError.message }
                });
            }
        }

        // Регистрируем воркер для мониторинга
        try {
            const WorkerMonitoringService = (await import('../services/WorkerMonitoringService.js')).default;
            if (!WorkerMonitoringService.isInitialized) {
                await WorkerMonitoringService.initialize();
            }
            workerId = WorkerMonitoringService.registerWorker(
                'weekly-forecast-training',
                figi ? `Обучение Weekly Forecast: ${figi}` : 'Обучение Weekly Forecast (все инструменты)',
                {
                    stage: 'initializing',
                    trainingType: 'manual',
                    figi: figi || null
                }
            );
        } catch (monitoringError) {
            LoggerService.warn('Failed to register worker in monitoring service', {
                service: 'WeeklyForecastRoutes',
                operation: 'POST /train',
                error: { message: String(monitoringError) }
            });
        }

        // Отправляем ответ сразу, обучение выполняется асинхронно
        // Важно: ответ отправляется до начала обучения, чтобы не блокировать клиента
        res.json({
            success: true,
            message: 'Обучение запущено',
            workerId, // Возвращаем workerId для отслеживания на фронтенде
            status: 'started'
        });

        // Выполняем обучение асинхронно (не блокируем ответ)
        (async () => {
            try {
                // Импортируем утилиту обучения
                const { trainWeeklyForecastModelsForAllInstruments, trainWeeklyForecastModel } = await import('../utils/scheduler/weeklyForecastTrainingUtils.js');

                let result;

                if (figi) {
                    // Обучение для конкретного инструмента
                    if (workerId) {
                        const WorkerMonitoringService = (await import('../services/WorkerMonitoringService.js')).default;
                        WorkerMonitoringService.updateWorkerStatus(workerId, {
                            progress: 10,
                            metadata: {
                                stage: 'training',
                                figi
                            }
                        });
                    }
                    
                    result = await trainWeeklyForecastModel(figi, trainingOptions);
                    
                    if (workerId) {
                        const WorkerMonitoringService = (await import('../services/WorkerMonitoringService.js')).default;
                        WorkerMonitoringService.updateWorkerStatus(workerId, {
                            progress: 100,
                            metadata: {
                                stage: 'completed',
                                figi,
                                modelVersion: result.modelVersion
                            }
                        });
                        WorkerMonitoringService.completeWorker(workerId, true, {
                            figi,
                            modelVersion: result.modelVersion,
                            sequencesCount: result.sequencesCount
                        });
                    }
                } else {
                    // Обучение для всех инструментов
                    if (workerId) {
                        const WorkerMonitoringService = (await import('../services/WorkerMonitoringService.js')).default;
                        WorkerMonitoringService.updateWorkerStatus(workerId, {
                            progress: 5,
                            metadata: {
                                stage: 'training',
                                currentInstrument: 0,
                                totalInstruments: 0
                            }
                        });
                    }
                    
                    result = await trainWeeklyForecastModelsForAllInstruments({
                        maxInstruments,
                        trainingOptions,
                        workerId // Передаем workerId для обновления прогресса
                    });
                    
                    if (workerId) {
                        const WorkerMonitoringService = (await import('../services/WorkerMonitoringService.js')).default;
                        WorkerMonitoringService.updateWorkerStatus(workerId, {
                            progress: 100,
                            metadata: {
                                stage: 'completed',
                                total: result.total,
                                success: result.success.length,
                                failed: result.failed.length
                            }
                        });
                        WorkerMonitoringService.completeWorker(workerId, true, {
                            total: result.total,
                            success: result.success.length,
                            failed: result.failed.length
                        });
                    }
                }

                if (LoggerService.isInitialized) {
                    LoggerService.info('Weekly Forecast training completed', {
                        service: 'WeeklyForecastRoutes',
                        operation: 'POST /train',
                        workerId,
                        figi: figi || 'all',
                        result: figi ? { modelVersion: result.modelVersion } : { total: result.total, success: result.success.length, failed: result.failed.length }
                    });
                }
            } catch (asyncError) {
                if (workerId) {
                    const WorkerMonitoringService = (await import('../services/WorkerMonitoringService.js')).default;
                    WorkerMonitoringService.completeWorker(workerId, false, {
                        error: { message: asyncError.message }
                    });
                }
                if (LoggerService.isInitialized) {
                    LoggerService.error('Error in async Weekly Forecast training', {
                        service: 'WeeklyForecastRoutes',
                        operation: 'POST /train (async)',
                        workerId,
                        error: { message: asyncError.message, stack: asyncError.stack }
                    });
                }
            }
        })();
    } catch (error) {
        // Обрабатываем ошибки, которые произошли до отправки ответа
        if (workerId) {
            try {
                const WorkerMonitoringService = (await import('../services/WorkerMonitoringService.js')).default;
                WorkerMonitoringService.completeWorker(workerId, false, {
                    error: { message: error.message }
                });
            } catch (workerError) {
                // Игнорируем ошибки при завершении воркера
            }
        }
        if (LoggerService.isInitialized) {
            LoggerService.error('Error training Weekly Forecast models', {
                service: 'WeeklyForecastRoutes',
                operation: 'POST /train',
                error: { message: error.message, stack: error.stack }
            });
        }
        // Отправляем ответ только если он еще не отправлен
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
});

export default router;

