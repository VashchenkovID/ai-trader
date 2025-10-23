import express from 'express';
import PerformanceAnalyzer from '../services/PerformanceAnalyzer.js';
import ServiceManager from '../services/ServiceManager.js';

const router = express.Router();

/**
 * Статус анализатора производительности
 */
router.get('/status', async (req, res) => {
    try {
        const status = await PerformanceAnalyzer.getStatus();
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('Ошибка получения статуса анализатора производительности:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статуса анализатора производительности',
            error: error.message
        });
    }
});

/**
 * Анализ производительности
 */
router.get('/analysis', async (req, res) => {
    try {
        const analysis = await PerformanceAnalyzer.getAnalysis();
        res.json({
            success: true,
            data: analysis
        });
    } catch (error) {
        console.error('Ошибка получения анализа производительности:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения анализа производительности',
            error: error.message
        });
    }
});

/**
 * Отчет о производительности
 */
router.get('/report', async (req, res) => {
    try {
        const report = await PerformanceAnalyzer.getReport();
        res.json({
            success: true,
            data: report
        });
    } catch (error) {
        console.error('Ошибка получения отчета о производительности:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения отчета о производительности',
            error: error.message
        });
    }
});

/**
 * Очистка кеша анализатора производительности
 */
router.post('/clear-cache', async (req, res) => {
    try {
        const result = await PerformanceAnalyzer.clearCache();
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка очистки кеша анализатора производительности:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка очистки кеша анализатора производительности',
            error: error.message
        });
    }
});

export default router;
