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
        
        // Отладочное логирование (безопасно - не логируем полный пароль)
        console.log('Login attempt:', {
            username,
            passwordLength: password ? password.length : 0,
            passwordType: typeof password,
            passwordFirstChar: password ? password.charAt(0) : null,
            passwordLastChar: password ? password.charAt(password.length - 1) : null,
            bodyKeys: Object.keys(req.body),
            contentType: req.get('content-type')
        });
        
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
        // Важно: убеждаемся, что password - это строка
        const passwordString = typeof password === 'string' ? password : String(password);
        
        // Логируем для диагностики (безопасно - не показываем полный пароль)
        console.log('Password check:', {
            passwordLength: passwordString.length,
            passwordType: typeof password,
            passwordFirstChars: passwordString.substring(0, 3),
            passwordLastChars: passwordString.substring(passwordString.length - 3),
            hashLength: user.passwordHash.length
        });
        
        // Пробуем сравнить пароль
        let isPasswordValid = await bcrypt.compare(passwordString, user.passwordHash);
        
        // Если пароль не совпадает и содержит %, пробуем декодировать URL-encoded символы
        if (!isPasswordValid && passwordString.includes('%')) {
            try {
                const decodedPassword = decodeURIComponent(passwordString);
                if (decodedPassword !== passwordString) {
                    console.log('Password contains URL-encoded characters, trying decoded version');
                    const isDecodedValid = await bcrypt.compare(decodedPassword, user.passwordHash);
                    if (isDecodedValid) {
                        console.log('✅ Password matches after URL decoding!');
                        isPasswordValid = true; // Пароль совпадает после декодирования
                        passwordString = decodedPassword; // Используем декодированный пароль
                    }
                }
            } catch (decodeError) {
                // Игнорируем ошибки декодирования
                console.warn('URL decode failed:', decodeError.message);
            }
        }
        
        if (!isPasswordValid) {
            // Логируем для отладки (без пароля)
            console.warn('Login failed - Password mismatch:', {
                username,
                userId: user.id,
                passwordLength: passwordString.length,
                passwordType: typeof password,
                passwordHashLength: user.passwordHash.length,
                passwordHashStart: user.passwordHash.substring(0, 20),
                passwordPreview: `${passwordString.substring(0, 3)}...${passwordString.substring(passwordString.length - 3)}`,
                containsPercent: passwordString.includes('%'),
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

