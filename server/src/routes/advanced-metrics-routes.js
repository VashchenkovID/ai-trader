import express from 'express';
import ProfitabilityTracker from '../services/ProfitabilityTracker.js';
import OptimizedAnalysisService from '../services/OptimizedAnalysisService.js';
import TradingEngine from '../services/TradingEngine.js';

const router = express.Router();

/**
 * Валидация параметров периода
 */
function validatePeriod(period) {
    const validPeriods = ['daily', 'weekly', 'monthly'];
    return validPeriods.includes(period);
}

/**
 * Валидация даты
 */
function validateDate(dateString) {
    if (!dateString) return null;
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? null : date;
}

/**
 * GET /api/advanced-metrics
 * Получение всех продвинутых метрик
 * Query параметры:
 * - period: период анализа ('daily', 'weekly', 'monthly', по умолчанию 'daily')
 * - days: количество дней для анализа (по умолчанию 30)
 */
router.get('/', async (req, res) => {
    try {
        const period = req.query.period || 'daily';
        const days = parseInt(req.query.days) || 30;

        if (!validatePeriod(period)) {
            return res.status(400).json({
                success: false,
                message: `Невалидный период: ${period}. Допустимые значения: daily, weekly, monthly`
            });
        }

        if (days < 1 || days > 365) {
            return res.status(400).json({
                success: false,
                message: 'Количество дней должно быть от 1 до 365'
            });
        }

        // Получаем статистику за период
        const periodMap = {
            'daily': 'day',
            'weekly': 'week',
            'monthly': 'month'
        };

        const analysis = await ProfitabilityTracker.analyzeProfitability(
            periodMap[period],
            days
        );

        // Получаем продвинутые метрики
        const advancedMetrics = ProfitabilityTracker.calculateAdvancedMetrics(
            analysis.stats || [],
            period,
            analysis.metrics || {}
        );

        res.json({
            success: true,
            data: {
                period: period,
                days: days,
                startDate: analysis.startDate,
                endDate: analysis.endDate,
                baseMetrics: analysis.metrics,
                advancedMetrics: advancedMetrics,
                stats: analysis.stats,
                trends: analysis.trends,
                alerts: analysis.alerts
            }
        });
    } catch (error) {
        console.error('Ошибка получения продвинутых метрик:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения продвинутых метрик',
            error: error.message
        });
    }
});

/**
 * GET /api/advanced-metrics/sortino-ratio
 * Получение Sortino Ratio
 * Query параметры:
 * - period: период анализа ('daily', 'weekly', 'monthly', по умолчанию 'daily')
 * - days: количество дней для анализа (по умолчанию 30)
 * - riskFreeRate: безрисковая ставка (опционально, по умолчанию из настроек)
 */
router.get('/sortino-ratio', async (req, res) => {
    try {
        const period = req.query.period || 'daily';
        const days = parseInt(req.query.days) || 30;
        const riskFreeRate = req.query.riskFreeRate ? parseFloat(req.query.riskFreeRate) : null;

        if (!validatePeriod(period)) {
            return res.status(400).json({
                success: false,
                message: `Невалидный период: ${period}`
            });
        }

        const periodMap = {
            'daily': 'day',
            'weekly': 'week',
            'monthly': 'month'
        };

        const analysis = await ProfitabilityTracker.analyzeProfitability(
            periodMap[period],
            days
        );

        const advancedMetrics = ProfitabilityTracker.calculateAdvancedMetrics(
            analysis.stats || [],
            period,
            analysis.metrics || {}
        );

        res.json({
            success: true,
            data: {
                sortinoRatio: advancedMetrics.sortinoRatio || 0,
                period: period,
                days: days,
                riskFreeRate: riskFreeRate || ProfitabilityTracker.trackingSettings?.riskFreeRate || 8,
                startDate: analysis.startDate,
                endDate: analysis.endDate
            }
        });
    } catch (error) {
        console.error('Ошибка получения Sortino Ratio:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения Sortino Ratio',
            error: error.message
        });
    }
});

/**
 * GET /api/advanced-metrics/calmar-ratio
 * Получение Calmar Ratio
 * Query параметры:
 * - period: период анализа ('daily', 'weekly', 'monthly', по умолчанию 'daily')
 * - days: количество дней для анализа (по умолчанию 30)
 */
router.get('/calmar-ratio', async (req, res) => {
    try {
        const period = req.query.period || 'daily';
        const days = parseInt(req.query.days) || 30;

        if (!validatePeriod(period)) {
            return res.status(400).json({
                success: false,
                message: `Невалидный период: ${period}`
            });
        }

        const periodMap = {
            'daily': 'day',
            'weekly': 'week',
            'monthly': 'month'
        };

        const analysis = await ProfitabilityTracker.analyzeProfitability(
            periodMap[period],
            days
        );

        const advancedMetrics = ProfitabilityTracker.calculateAdvancedMetrics(
            analysis.stats || [],
            period,
            analysis.metrics || {}
        );

        res.json({
            success: true,
            data: {
                calmarRatio: advancedMetrics.calmarRatio || 0,
                period: period,
                days: days,
                annualReturn: analysis.metrics?.totalReturn || 0,
                maxDrawdown: analysis.metrics?.maxDrawdown || 0,
                startDate: analysis.startDate,
                endDate: analysis.endDate
            }
        });
    } catch (error) {
        console.error('Ошибка получения Calmar Ratio:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения Calmar Ratio',
            error: error.message
        });
    }
});

/**
 * GET /api/advanced-metrics/information-ratio
 * Получение Information Ratio
 * Query параметры:
 * - period: период анализа ('daily', 'weekly', 'monthly', по умолчанию 'daily')
 * - days: количество дней для анализа (по умолчанию 30)
 * Note: Требует данные бенчмарка (пока не реализовано)
 */
router.get('/information-ratio', async (req, res) => {
    try {
        const period = req.query.period || 'daily';
        const days = parseInt(req.query.days) || 30;

        if (!validatePeriod(period)) {
            return res.status(400).json({
                success: false,
                message: `Невалидный период: ${period}`
            });
        }

        const periodMap = {
            'daily': 'day',
            'weekly': 'week',
            'monthly': 'month'
        };

        const analysis = await ProfitabilityTracker.analyzeProfitability(
            periodMap[period],
            days
        );

        const advancedMetrics = ProfitabilityTracker.calculateAdvancedMetrics(
            analysis.stats || [],
            period,
            analysis.metrics || {}
        );

        res.json({
            success: true,
            data: {
                informationRatio: advancedMetrics.informationRatio,
                period: period,
                days: days,
                message: advancedMetrics.informationRatio === null ? 
                    'Information Ratio требует данные бенчмарка (пока не реализовано)' : 
                    'Information Ratio рассчитан успешно',
                startDate: analysis.startDate,
                endDate: analysis.endDate
            }
        });
    } catch (error) {
        console.error('Ошибка получения Information Ratio:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения Information Ratio',
            error: error.message
        });
    }
});

/**
 * GET /api/advanced-metrics/mae-mfe
 * Получение MAE (Maximum Adverse Excursion) и MFE (Maximum Favorable Excursion)
 * Query параметры:
 * - limit: ограничение количества сделок для анализа (по умолчанию 100)
 */
router.get('/mae-mfe', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;

        if (limit < 1 || limit > 1000) {
            return res.status(400).json({
                success: false,
                message: 'Лимит должен быть от 1 до 1000'
            });
        }

        // Получаем сделки из TradingEngine
        const trades = TradingEngine.virtualPortfolio?.trades || [];
        
        if (trades.length === 0) {
            return res.json({
                success: true,
                data: {
                    mae: 0,
                    mfe: 0,
                    maeMfeAvailable: false,
                    message: 'Нет данных о сделках для расчета MAE/MFE',
                    totalTrades: 0
                }
            });
        }

        // Ограничиваем количество сделок
        const limitedTrades = trades.slice(-limit);

        // Получаем продвинутые метрики (MAE/MFE рассчитываются из сделок)
        const periodMap = {
            'daily': 'day',
            'weekly': 'week',
            'monthly': 'month'
        };

        const analysis = await ProfitabilityTracker.analyzeProfitability('day', 30);
        const advancedMetrics = ProfitabilityTracker.calculateAdvancedMetrics(
            analysis.stats || [],
            'daily',
            analysis.metrics || {}
        );

        res.json({
            success: true,
            data: {
                mae: advancedMetrics.mae || 0,
                mfe: advancedMetrics.mfe || 0,
                maeMfeAvailable: advancedMetrics.maeMfeAvailable || false,
                totalTrades: trades.length,
                analyzedTrades: limitedTrades.length,
                message: advancedMetrics.maeMfeAvailable ? 
                    'MAE/MFE рассчитаны успешно' : 
                    'MAE/MFE требуют детальные данные о свечах для каждой сделки'
            }
        });
    } catch (error) {
        console.error('Ошибка получения MAE/MFE:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения MAE/MFE',
            error: error.message
        });
    }
});

/**
 * GET /api/advanced-metrics/period-analysis
 * Получение анализа производительности по периодам (дни недели, месяцы)
 * Query параметры:
 * - period: период анализа ('daily', 'weekly', 'monthly', по умолчанию 'daily')
 * - startDate: начальная дата (ISO string, опционально)
 * - endDate: конечная дата (ISO string, опционально)
 */
router.get('/period-analysis', async (req, res) => {
    try {
        const period = req.query.period || 'daily';
        const startDate = validateDate(req.query.startDate);
        const endDate = validateDate(req.query.endDate);

        if (!validatePeriod(period)) {
            return res.status(400).json({
                success: false,
                message: `Невалидный период: ${period}`
            });
        }

        if (startDate && endDate && startDate > endDate) {
            return res.status(400).json({
                success: false,
                message: 'Начальная дата не может быть больше конечной'
            });
        }

        const analysis = await OptimizedAnalysisService.analyzePeriodPerformance(
            period,
            startDate,
            endDate
        );

        if (!analysis.success) {
            return res.status(404).json({
                success: false,
                message: analysis.message || 'Не удалось выполнить анализ по периодам',
                data: analysis
            });
        }

        res.json({
            success: true,
            data: analysis
        });
    } catch (error) {
        console.error('Ошибка получения анализа по периодам:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения анализа по периодам',
            error: error.message
        });
    }
});

/**
 * GET /api/advanced-metrics/summary
 * Получение сводки всех продвинутых метрик
 * Query параметры:
 * - period: период анализа ('daily', 'weekly', 'monthly', по умолчанию 'daily')
 * - days: количество дней для анализа (по умолчанию 30)
 */
router.get('/summary', async (req, res) => {
    try {
        const period = req.query.period || 'daily';
        const days = parseInt(req.query.days) || 30;

        if (!validatePeriod(period)) {
            return res.status(400).json({
                success: false,
                message: `Невалидный период: ${period}`
            });
        }

        const periodMap = {
            'daily': 'day',
            'weekly': 'week',
            'monthly': 'month'
        };

        // Получаем базовую статистику
        const analysis = await ProfitabilityTracker.analyzeProfitability(
            periodMap[period],
            days
        );

        // Получаем продвинутые метрики
        const advancedMetrics = ProfitabilityTracker.calculateAdvancedMetrics(
            analysis.stats || [],
            period,
            analysis.metrics || {}
        );

        // Получаем анализ по периодам
        const periodAnalysis = await OptimizedAnalysisService.analyzePeriodPerformance(
            period,
            analysis.startDate,
            analysis.endDate
        );

        res.json({
            success: true,
            data: {
                period: period,
                days: days,
                startDate: analysis.startDate,
                endDate: analysis.endDate,
                baseMetrics: {
                    totalReturn: analysis.metrics?.totalReturn || 0,
                    winRate: analysis.metrics?.winRate || 0,
                    sharpeRatio: analysis.metrics?.sharpeRatio || 0,
                    maxDrawdown: analysis.metrics?.maxDrawdown || 0,
                    averageDailyProfit: analysis.metrics?.averageDailyProfit || 0
                },
                advancedMetrics: {
                    sortinoRatio: advancedMetrics.sortinoRatio || 0,
                    calmarRatio: advancedMetrics.calmarRatio || 0,
                    informationRatio: advancedMetrics.informationRatio,
                    mae: advancedMetrics.mae || 0,
                    mfe: advancedMetrics.mfe || 0,
                    maeMfeAvailable: advancedMetrics.maeMfeAvailable || false
                },
                periodAnalysis: periodAnalysis.success ? {
                    byDayOfWeek: periodAnalysis.byDayOfWeek,
                    byMonth: periodAnalysis.byMonth,
                    bestDay: periodAnalysis.bestDay,
                    worstDay: periodAnalysis.worstDay,
                    bestMonth: periodAnalysis.bestMonth,
                    worstMonth: periodAnalysis.worstMonth,
                    summary: periodAnalysis.summary
                } : null
            }
        });
    } catch (error) {
        console.error('Ошибка получения сводки продвинутых метрик:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения сводки продвинутых метрик',
            error: error.message
        });
    }
});

export default router;

