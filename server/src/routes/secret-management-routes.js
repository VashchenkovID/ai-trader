import express from 'express';
import SecretManagementService from '../services/SecretManagementService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validateBody, validationRules } from '../middleware/validation.js';

const router = express.Router();

/**
 * GET /api/secret-management/info
 * Получение информации о секретах (с маскированием)
 * Только для отладки, в production должен быть отключен
 */
router.get('/info',
    asyncHandler(async (req, res) => {
        if (process.env.NODE_ENV === 'production') {
            return res.status(403).json({
                success: false,
                message: 'This endpoint is disabled in production'
            });
        }

        const secretsInfo = SecretManagementService.getSecretsInfo();

        res.json({
            success: true,
            data: secretsInfo,
            warning: 'This endpoint should be disabled in production'
        });
    })
);

/**
 * POST /api/secret-management/validate
 * Валидация наличия обязательных секретов
 */
router.post('/validate',
    asyncHandler(async (req, res) => {
        const requiredSecrets = req.body.secrets || [
            'TINKOFF_TOKEN',
            'DB_PASSWORD'
        ];

        const validation = {};
        const missing = [];

        for (const secretName of requiredSecrets) {
            const exists = SecretManagementService.hasSecret(secretName);
            validation[secretName] = {
                exists,
                masked: exists ? SecretManagementService.maskSecret(process.env[secretName]) : null
            };

            if (!exists) {
                missing.push(secretName);
            }
        }

        res.json({
            success: true,
            data: {
                validation,
                allPresent: missing.length === 0,
                missing
            }
        });
    })
);

/**
 * POST /api/secret-management/mask
 * Маскирование данных (для тестирования)
 */
router.post('/mask',
    validateBody({
        data: { required: true } // Принимаем любой тип данных
    }),
    asyncHandler(async (req, res) => {
        const { data } = req.body;
        
        let masked;
        if (typeof data === 'string') {
            masked = SecretManagementService.maskSecretsInString(data);
        } else if (typeof data === 'object') {
            masked = SecretManagementService.maskSecretsInObject(data);
        } else {
            masked = data;
        }

        res.json({
            success: true,
            data: {
                original: data,
                masked
            }
        });
    })
);

/**
 * POST /api/secret-management/check
 * Проверка строки на наличие секретов
 */
router.post('/check',
    validateBody({
        text: validationRules.string({ required: true })
    }),
    asyncHandler(async (req, res) => {
        const { text } = req.body;
        
        const containsSecrets = SecretManagementService.containsSecrets(text);
        const masked = SecretManagementService.maskSecretsInString(text);

        res.json({
            success: true,
            data: {
                containsSecrets,
                original: text,
                masked
            }
        });
    })
);

export default router;

