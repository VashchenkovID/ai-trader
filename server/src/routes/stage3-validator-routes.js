import express from 'express';
import Stage3Validator from '../services/Stage3Validator.js';
import ServiceManager from '../services/ServiceManager.js';

const router = express.Router();

/**
 * Статус валидатора Stage3
 */
router.get('/status', async (req, res) => {
    try {
        const status = await Stage3Validator.getStatus();
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('Ошибка получения статуса валидатора Stage3:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статуса валидатора Stage3',
            error: error.message
        });
    }
});

/**
 * Валидация Stage3
 */
router.post('/validate', async (req, res) => {
    try {
        const { data } = req.body;
        const result = await Stage3Validator.validate(data);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Ошибка валидации Stage3:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка валидации Stage3',
            error: error.message
        });
    }
});

/**
 * История валидации Stage3
 */
router.get('/history', async (req, res) => {
    try {
        const history = await Stage3Validator.getHistory();
        res.json({
            success: true,
            data: history
        });
    } catch (error) {
        console.error('Ошибка получения истории валидации Stage3:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения истории валидации Stage3',
            error: error.message
        });
    }
});

export default router;
