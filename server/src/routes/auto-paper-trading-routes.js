/**
 * API маршруты для управления автоматической торговлей в paper режиме
 */

import express from 'express';
import AutoPaperTradingService from '../services/AutoPaperTradingService.js';
import LoggerService from '../services/LoggerService.js';

const router = express.Router();

/**
 * GET /api/auto-paper-trading/status
 * Получить статус автоматической торговли
 */
router.get('/status', async (req, res) => {
    try {
        if (!AutoPaperTradingService.isInitialized) {
            return res.status(503).json({
                success: false,
                message: 'AutoPaperTradingService not initialized'
            });
        }

        const status = AutoPaperTradingService.getStatus();
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        LoggerService.error('Error getting auto-paper trading status', {
            service: 'AutoPaperTradingRoutes',
            error: error.message
        });
        res.status(500).json({
            success: false,
            message: 'Error getting status',
            error: error.message
        });
    }
});

/**
 * POST /api/auto-paper-trading/enable
 * Включить автоматическую торговлю
 */
router.post('/enable', async (req, res) => {
    try {
        if (!AutoPaperTradingService.isInitialized) {
            return res.status(503).json({
                success: false,
                message: 'AutoPaperTradingService not initialized'
            });
        }

        await AutoPaperTradingService.enable();
        res.json({
            success: true,
            message: 'Auto-paper trading enabled'
        });
    } catch (error) {
        LoggerService.error('Error enabling auto-paper trading', {
            service: 'AutoPaperTradingRoutes',
            error: error.message
        });
        res.status(500).json({
            success: false,
            message: 'Error enabling auto-paper trading',
            error: error.message
        });
    }
});

/**
 * POST /api/auto-paper-trading/disable
 * Выключить автоматическую торговлю
 */
router.post('/disable', async (req, res) => {
    try {
        if (!AutoPaperTradingService.isInitialized) {
            return res.status(503).json({
                success: false,
                message: 'AutoPaperTradingService not initialized'
            });
        }

        await AutoPaperTradingService.disable();
        res.json({
            success: true,
            message: 'Auto-paper trading disabled'
        });
    } catch (error) {
        LoggerService.error('Error disabling auto-paper trading', {
            service: 'AutoPaperTradingRoutes',
            error: error.message
        });
        res.status(500).json({
            success: false,
            message: 'Error disabling auto-paper trading',
            error: error.message
        });
    }
});

/**
 * GET /api/auto-paper-trading/stats
 * Получить статистику автоматической торговли
 */
router.get('/stats', async (req, res) => {
    try {
        if (!AutoPaperTradingService.isInitialized) {
            return res.status(503).json({
                success: false,
                message: 'AutoPaperTradingService not initialized'
            });
        }

        const { startDate, endDate } = req.query;
        const AutoPaperTradingStats = (await import('../models/AutoPaperTradingStats.js')).default;
        
        let stats;
        if (startDate && endDate) {
            stats = await AutoPaperTradingStats.getStatsForPeriod(startDate, endDate);
        } else {
            // Получаем статистику за последние 30 дней
            const endDate = new Date().toISOString().split('T')[0];
            const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            stats = await AutoPaperTradingStats.getStatsForPeriod(startDate, endDate);
        }

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        LoggerService.error('Error getting auto-paper trading stats', {
            service: 'AutoPaperTradingRoutes',
            error: error.message
        });
        res.status(500).json({
            success: false,
            message: 'Error getting stats',
            error: error.message
        });
    }
});

/**
 * PUT /api/auto-paper-trading/settings
 * Обновить настройки
 */
router.put('/settings', async (req, res) => {
    try {
        if (!AutoPaperTradingService.isInitialized) {
            return res.status(503).json({
                success: false,
                message: 'AutoPaperTradingService not initialized'
            });
        }

        const validation = AutoPaperTradingService.validateSettings(req.body);
        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                message: 'Invalid settings',
                errors: validation.errors
            });
        }

        // Сохраняем предыдущие значения для отката
        const previousSettings = { ...AutoPaperTradingService.settings };
        
        try {
            await AutoPaperTradingService.updateSettings(req.body);
            res.json({
                success: true,
                message: 'Settings updated'
            });
        } catch (error) {
            // Откат к предыдущим значениям
            AutoPaperTradingService.settings = previousSettings;
            throw error;
        }
    } catch (error) {
        LoggerService.error('Error updating auto-paper trading settings', {
            service: 'AutoPaperTradingRoutes',
            error: error.message
        });
        res.status(500).json({
            success: false,
            message: 'Error updating settings',
            error: error.message
        });
    }
});

/**
 * POST /api/auto-paper-trading/advance-phase
 * Перейти на следующую фазу (ручное управление)
 */
router.post('/advance-phase', async (req, res) => {
    try {
        if (!AutoPaperTradingService.isInitialized) {
            return res.status(503).json({
                success: false,
                message: 'AutoPaperTradingService not initialized'
            });
        }

        await AutoPaperTradingService.advancePhase();
        res.json({
            success: true,
            message: 'Phase advanced',
            currentPhase: AutoPaperTradingService.stats.currentPhase
        });
    } catch (error) {
        LoggerService.error('Error advancing phase', {
            service: 'AutoPaperTradingRoutes',
            error: error.message
        });
        res.status(500).json({
            success: false,
            message: 'Error advancing phase',
            error: error.message
        });
    }
});

export default router;

