import express from 'express';
import PerformanceAnalyzer from '../services/PerformanceAnalyzer.js';
import PerformanceVisualizationService from '../services/PerformanceVisualizationService.js';
import BenchmarkService from '../services/BenchmarkService.js';
import ReportExportService from '../services/ReportExportService.js';
import SectorClassifier from '../utils/sectorClassifier.js';
import path from 'path';

const router = express.Router();

/**
 * Инициализация сервисов
 */
router.use(async (req, res, next) => {
    try {
        await PerformanceAnalyzer.initialize();
        await PerformanceVisualizationService.initialize();
        await BenchmarkService.initialize();
        await ReportExportService.initialize();
        next();
    } catch (error) {
        console.error('Error initializing performance services:', error);
        next(error);
    }
});

/**
 * GET /api/performance/sector-analysis
 * Анализ производительности по секторам
 */
router.get('/sector-analysis', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const analysis = await PerformanceAnalyzer.analyzeSectorPerformance(days);
        res.json({
            success: true,
            data: analysis
        });
    } catch (error) {
        console.error('Error getting sector analysis:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting sector analysis',
            error: error.message
        });
    }
});

/**
 * GET /api/performance/visualization/returns
 * Данные для графика доходности
 */
router.get('/visualization/returns', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const data = await PerformanceVisualizationService.getReturnsChartData(days);
        res.json({
            success: true,
            data: data
        });
    } catch (error) {
        console.error('Error getting returns chart data:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting returns chart data',
            error: error.message
        });
    }
});

/**
 * GET /api/performance/visualization/pnl-distribution
 * Данные для графика распределения PnL
 */
router.get('/visualization/pnl-distribution', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const data = await PerformanceVisualizationService.getPnLDistributionData(days);
        res.json({
            success: true,
            data: data
        });
    } catch (error) {
        console.error('Error getting PnL distribution data:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting PnL distribution data',
            error: error.message
        });
    }
});

/**
 * GET /api/performance/visualization/drawdown
 * Данные для графика drawdown
 */
router.get('/visualization/drawdown', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const data = await PerformanceVisualizationService.getDrawdownChartData(days);
        res.json({
            success: true,
            data: data
        });
    } catch (error) {
        console.error('Error getting drawdown chart data:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting drawdown chart data',
            error: error.message
        });
    }
});

/**
 * GET /api/performance/visualization/heatmap
 * Данные для heatmap производительности
 */
router.get('/visualization/heatmap', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const data = await PerformanceVisualizationService.getPerformanceHeatmapData(days);
        res.json({
            success: true,
            data: data
        });
    } catch (error) {
        console.error('Error getting heatmap data:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting heatmap data',
            error: error.message
        });
    }
});

/**
 * GET /api/performance/visualization/dashboard
 * Данные для дашборда
 */
router.get('/visualization/dashboard', async (req, res) => {
    try {
        const filters = {
            period: parseInt(req.query.period) || 30,
            strategy: req.query.strategy || null,
            sector: req.query.sector || null
        };
        const data = await PerformanceVisualizationService.getDashboardData(filters);
        res.json({
            success: true,
            data: data
        });
    } catch (error) {
        console.error('Error getting dashboard data:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting dashboard data',
            error: error.message
        });
    }
});

/**
 * GET /api/performance/benchmark/list
 * Список доступных бенчмарков
 */
router.get('/benchmark/list', async (req, res) => {
    try {
        const benchmarks = BenchmarkService.getAvailableBenchmarks();
        res.json({
            success: true,
            data: benchmarks
        });
    } catch (error) {
        console.error('Error getting benchmarks list:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting benchmarks list',
            error: error.message
        });
    }
});

/**
 * GET /api/performance/benchmark/:benchmarkId
 * Данные бенчмарка
 */
router.get('/benchmark/:benchmarkId', async (req, res) => {
    try {
        const { benchmarkId } = req.params;
        const days = parseInt(req.query.days) || 30;
        const data = await BenchmarkService.getBenchmarkData(benchmarkId, days);
        res.json({
            success: true,
            data: data
        });
    } catch (error) {
        console.error('Error getting benchmark data:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting benchmark data',
            error: error.message
        });
    }
});

/**
 * GET /api/performance/benchmark/:benchmarkId/compare
 * Сравнение с бенчмарком
 */
router.get('/benchmark/:benchmarkId/compare', async (req, res) => {
    try {
        const { benchmarkId } = req.params;
        const days = parseInt(req.query.days) || 30;
        const comparison = await BenchmarkService.compareWithBenchmark(benchmarkId, days);
        res.json({
            success: true,
            data: comparison
        });
    } catch (error) {
        console.error('Error comparing with benchmark:', error);
        res.status(500).json({
            success: false,
            message: 'Error comparing with benchmark',
            error: error.message
        });
    }
});

/**
 * GET /api/performance/report/daily/pdf
 * Генерация ежедневного отчета в PDF
 */
router.get('/report/daily/pdf', async (req, res) => {
    try {
        const date = req.query.date ? new Date(req.query.date) : new Date();
        const filepath = await ReportExportService.generateDailyReportPDF(date);
        res.download(filepath, `daily_report_${date.toISOString().split('T')[0]}.pdf`, (err) => {
            if (err) {
                console.error('Error downloading daily report:', err);
                res.status(500).json({
                    success: false,
                    message: 'Error downloading report',
                    error: err.message
                });
            }
        });
    } catch (error) {
        console.error('Error generating daily report PDF:', error);
        res.status(500).json({
            success: false,
            message: 'Error generating daily report PDF',
            error: error.message
        });
    }
});

/**
 * GET /api/performance/report/weekly/pdf
 * Генерация еженедельного отчета в PDF
 */
router.get('/report/weekly/pdf', async (req, res) => {
    try {
        const date = req.query.date ? new Date(req.query.date) : new Date();
        const filepath = await ReportExportService.generateWeeklyReportPDF(date);
        res.download(filepath, `weekly_report_${date.toISOString().split('T')[0]}.pdf`, (err) => {
            if (err) {
                console.error('Error downloading weekly report:', err);
                res.status(500).json({
                    success: false,
                    message: 'Error downloading report',
                    error: err.message
                });
            }
        });
    } catch (error) {
        console.error('Error generating weekly report PDF:', error);
        res.status(500).json({
            success: false,
            message: 'Error generating weekly report PDF',
            error: error.message
        });
    }
});

/**
 * GET /api/performance/report/monthly/pdf
 * Генерация месячного отчета в PDF
 */
router.get('/report/monthly/pdf', async (req, res) => {
    try {
        const date = req.query.date ? new Date(req.query.date) : new Date();
        const filepath = await ReportExportService.generateMonthlyReportPDF(date);
        res.download(filepath, `monthly_report_${date.toISOString().split('T')[0]}.pdf`, (err) => {
            if (err) {
                console.error('Error downloading monthly report:', err);
                res.status(500).json({
                    success: false,
                    message: 'Error downloading report',
                    error: err.message
                });
            }
        });
    } catch (error) {
        console.error('Error generating monthly report PDF:', error);
        res.status(500).json({
            success: false,
            message: 'Error generating monthly report PDF',
            error: error.message
        });
    }
});

/**
 * GET /api/performance/report/:type/excel
 * Генерация отчета в Excel
 */
router.get('/report/:type/excel', async (req, res) => {
    try {
        const { type } = req.params;
        const days = parseInt(req.query.days) || (type === 'daily' ? 1 : type === 'weekly' ? 7 : 30);
        const filepath = await ReportExportService.generateExcelReport(type, days);
        res.download(filepath, `${type}_report_${new Date().toISOString().split('T')[0]}.xlsx`, (err) => {
            if (err) {
                console.error('Error downloading Excel report:', err);
                res.status(500).json({
                    success: false,
                    message: 'Error downloading report',
                    error: err.message
                });
            }
        });
    } catch (error) {
        console.error('Error generating Excel report:', error);
        res.status(500).json({
            success: false,
            message: 'Error generating Excel report',
            error: error.message
        });
    }
});

/**
 * GET /api/performance/sectors
 * Получение списка секторов
 */
router.get('/sectors', async (req, res) => {
    try {
        const sectors = SectorClassifier.getAvailableSectors();
        res.json({
            success: true,
            data: sectors
        });
    } catch (error) {
        console.error('Error getting sectors:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting sectors',
            error: error.message
        });
    }
});

/**
 * POST /api/performance/sectors/update
 * Массовое обновление секторов
 */
router.post('/sectors/update', async (req, res) => {
    try {
        const batchSize = parseInt(req.body.batchSize) || 100;
        const result = await SectorClassifier.updateAllSectors(batchSize);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Error updating sectors:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating sectors',
            error: error.message
        });
    }
});

export default router;

