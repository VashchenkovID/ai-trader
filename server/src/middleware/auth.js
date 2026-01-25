import jwt from 'jsonwebtoken';
import User from '../models/User.js';

/**
 * Middleware для проверки JWT токена
 */
export const authenticate = async (req, res, next) => {
    try {
        // Получаем токен из заголовка Authorization
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Токен авторизации не предоставлен'
            });
        }
        
        const token = authHeader.substring(7); // Убираем "Bearer "
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Токен авторизации не предоставлен'
            });
        }
        
        const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
        
        // Проверяем токен
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Находим пользователя
        const user = await User.findByPk(decoded.userId);
        
        if (!user || !user.isActive) {
            return res.status(401).json({
                success: false,
                message: 'Пользователь не найден или неактивен'
            });
        }
        
        // Добавляем информацию о пользователе в запрос
        req.user = {
            id: user.id,
            username: user.username,
            fullName: user.fullName
        };
        
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Недействительный токен'
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Токен истек'
            });
        }
        
        console.error('Ошибка аутентификации:', error);
        return res.status(500).json({
            success: false,
            message: 'Ошибка аутентификации'
        });
    }
};

/**
 * Опциональная аутентификация (не блокирует запрос, если токен отсутствует)
 */
export const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
                const user = await User.findByPk(decoded.userId);
                
                if (user && user.isActive) {
                    req.user = {
                        id: user.id,
                        username: user.username,
                        fullName: user.fullName
                    };
                }
            } catch (error) {
                // Игнорируем ошибки токена для опциональной аутентификации
            }
        }
        
        next();
    } catch (error) {
        next();
    }
};

