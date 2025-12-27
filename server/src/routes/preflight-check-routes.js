import express from 'express';
import PreflightCheckService from '../services/PreflightCheckService.js';
import ServiceManager from '../services/ServiceManager.js';

const router = express.Router();

/**
 * Запуск проверки готовности
 */
router.post('/run', async (req, res) => {
    try {
        // Убеждаемся, что сервис инициализирован
        if (!PreflightCheckService.isInitialized) {
            await PreflightCheckService.initialize();
        }
        
        const result = await PreflightCheckService.runPreflightChecks();
        
        // Преобразуем результат в формат, ожидаемый фронтендом
        const formattedResult = {
            passed: result.overallStatus === 'passed' || result.overallStatus === 'ready',
            checks: Object.entries(result.checks || {}).map(([name, check]) => ({
                name: name,
                passed: check.status === 'passed' || check.status === 'ok',
                message: check.message || check.status || 'Проверка выполнена'
            }))
        };
        
        res.json({
            success: true,
            results: formattedResult
        });
    } catch (error) {
        console.error('Ошибка запуска проверки готовности:', error);
        // Возвращаем безопасный результат вместо 500 ошибки
        res.json({
            success: true,
            results: {
                passed: false,
                checks: [{
                    name: 'system',
                    passed: false,
                    message: error.message || 'Ошибка выполнения проверки'
                }]
            }
        });
    }
});

/**
 * Статус проверки готовности
 */
router.get('/status', async (req, res) => {
    try {
        const status = await PreflightCheckService.getStatus();
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('Ошибка получения статуса проверки готовности:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статуса проверки готовности',
            error: error.message
        });
    }
});

/**
 * Результаты проверки готовности
 */
router.get('/results', async (req, res) => {
    try {
        const results = await PreflightCheckService.getResults();
        res.json({
            success: true,
            data: results
        });
    } catch (error) {
        console.error('Ошибка получения результатов проверки готовности:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения результатов проверки готовности',
            error: error.message
        });
    }
});

export default router;
