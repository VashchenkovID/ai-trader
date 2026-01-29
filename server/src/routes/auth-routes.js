import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validateBody, validationRules } from '../middleware/validation.js';
import { ValidationError, AuthenticationError } from '../utils/errors/AppError.js';
import { getJWTSecret } from '../utils/envValidator.js';

const router = express.Router();

/**
 * POST /api/auth/login
 * Авторизация пользователя
 */
router.post('/login',
    validateBody({
        username: validationRules.string({ required: true, minLength: 1 }),
        password: validationRules.string({ required: true, minLength: 1 })
    }),
    asyncHandler(async (req, res) => {
        const { username, password } = req.body;
        
        // Находим пользователя
        const user = await User.findOne({ where: { username } });
        
        if (!user) {
            // Используем AuthenticationError вместо ValidationError для ошибок авторизации
            throw new AuthenticationError('Неверное имя пользователя или пароль');
        }
        
        if (!user.isActive) {
            throw new AuthenticationError('Пользователь неактивен');
        }
        
        // Проверяем пароль
        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
        
        if (!isPasswordValid) {
            // Логируем для отладки (без пароля)
            console.warn('Login failed:', {
                username,
                userId: user.id,
                passwordLength: password.length,
                passwordHashLength: user.passwordHash.length,
                reason: 'Password mismatch'
            });
            throw new AuthenticationError('Неверное имя пользователя или пароль');
        }
        
        // Обновляем время последнего входа
        await user.update({ lastLogin: new Date() });
        
        // Создаем JWT токен
        const JWT_SECRET = getJWTSecret();
        const token = jwt.sign(
            { userId: user.id, username: user.username },
            JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );
        
        res.json({
            success: true,
            data: {
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    fullName: user.fullName,
                    lastLogin: user.lastLogin
                }
            }
        });
    })
);

/**
 * GET /api/auth/me
 * Получение информации о текущем пользователе
 */
router.get('/me',
    authenticate,
    asyncHandler(async (req, res) => {
        const user = await User.findByPk(req.user.id, {
            attributes: ['id', 'username', 'fullName', 'lastLogin', 'createdAt']
        });
        
        res.json({
            success: true,
            data: user
        });
    })
);

/**
 * POST /api/auth/verify
 * Проверка токена
 */
router.post('/verify',
    asyncHandler(async (req, res) => {
        const { token } = req.body;
        
        if (!token) {
            return res.status(400).json({
                success: false,
                message: 'Токен не предоставлен'
            });
        }
        
        try {
            const JWT_SECRET = getJWTSecret();
            const decoded = jwt.verify(token, JWT_SECRET);
            
            const user = await User.findByPk(decoded.userId, {
                attributes: ['id', 'username', 'fullName', 'lastLogin', 'createdAt']
            });
            
            if (!user || !user.isActive) {
                return res.status(401).json({
                    success: false,
                    message: 'Пользователь не найден или неактивен'
                });
            }
            
            res.json({
                success: true,
                message: 'Токен действителен',
                user: {
                    id: user.id,
                    username: user.username,
                    fullName: user.fullName,
                    lastLogin: user.lastLogin
                }
            });
        } catch (error) {
            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
                return res.status(401).json({
                    success: false,
                    message: 'Токен недействителен или истек'
                });
            }
            throw error;
        }
    })
);

/**
 * POST /api/auth/logout
 * Выход из системы (на клиенте просто удаляется токен)
 */
router.post('/logout',
    authenticate,
    asyncHandler(async (req, res) => {
        res.json({
            success: true,
            message: 'Выход выполнен успешно'
        });
    })
);

export default router;

