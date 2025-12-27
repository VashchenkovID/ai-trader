import express from 'express';
import RecoveryService from '../services/RecoveryService.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

/**
 * GET /api/recovery/state
 * Получение состояния восстановления
 */
router.get('/state', asyncHandler(async (req, res) => {
    const state = RecoveryService.getRecoveryState();
    
    res.json({
        success: true,
        data: state
    });
}));

/**
 * GET /api/recovery/stats
 * Получение статистики восстановления
 */
router.get('/stats', asyncHandler(async (req, res) => {
    const stats = RecoveryService.getRecoveryStats();
    
    res.json({
        success: true,
        data: stats
    });
}));

/**
 * POST /api/recovery/health-check
 * Принудительная проверка здоровья всех компонентов
 */
router.post('/health-check', asyncHandler(async (req, res) => {
    await RecoveryService.performHealthChecks();
    const stats = RecoveryService.getRecoveryStats();
    
    res.json({
        success: true,
        message: 'Проверка здоровья выполнена',
        data: stats
    });
}));

/**
 * POST /api/recovery/database/recover
 * Принудительное восстановление подключения к БД
 */
router.post('/database/recover', asyncHandler(async (req, res) => {
    const recovered = await RecoveryService.recoverDatabase();
    
    res.json({
        success: recovered,
        message: recovered 
            ? 'Подключение к БД восстановлено'
            : 'Не удалось восстановить подключение к БД',
        data: RecoveryService.getRecoveryStats().database
    });
}));

/**
 * POST /api/recovery/websocket/recover
 * Принудительное восстановление WebSocket
 */
router.post('/websocket/recover', asyncHandler(async (req, res) => {
    const recovered = await RecoveryService.recoverWebSocket();
    
    res.json({
        success: recovered,
        message: recovered 
            ? 'WebSocket восстановлен'
            : 'Не удалось восстановить WebSocket',
        data: RecoveryService.getRecoveryStats().websocket
    });
}));

/**
 * POST /api/recovery/full
 * Полное восстановление системы
 */
router.post('/full', asyncHandler(async (req, res) => {
    const result = await RecoveryService.performFullRecovery();
    
    res.json({
        success: result.success,
        message: 'Полное восстановление системы выполнено',
        data: result
    });
}));

/**
 * POST /api/recovery/verify-integrity
 * Проверка целостности данных
 */
router.post('/verify-integrity', asyncHandler(async (req, res) => {
    const result = await RecoveryService.verifyDataIntegrity();
    
    res.json({
        success: result.success,
        message: result.success 
            ? 'Целостность данных проверена, проблем не обнаружено'
            : `Обнаружено ${result.issues.length} проблем целостности данных`,
        data: result
    });
}));

export default router;

