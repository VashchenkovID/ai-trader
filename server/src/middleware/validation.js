import { ValidationError } from '../utils/errors/AppError.js';
import validator from 'validator';

/**
 * Middleware для валидации запросов
 */

/**
 * Валидация параметров запроса
 */
export const validateQuery = (rules) => {
    return (req, res, next) => {
        const errors = [];
        
        for (const [param, rule] of Object.entries(rules)) {
            const value = req.query[param];
            
            // Проверка обязательных полей
            if (rule.required && (value === undefined || value === null || value === '')) {
                errors.push({
                    field: param,
                    message: `${param} is required`
                });
                continue;
            }
            
            // Если поле не обязательное и отсутствует, пропускаем
            if (!rule.required && (value === undefined || value === null || value === '')) {
                continue;
            }
            
            // Валидация типа
            if (rule.type) {
                if (rule.type === 'number' && isNaN(Number(value))) {
                    errors.push({
                        field: param,
                        message: `${param} must be a number`
                    });
                    continue;
                }
                
                if (rule.type === 'boolean' && !['true', 'false', '1', '0'].includes(String(value).toLowerCase())) {
                    errors.push({
                        field: param,
                        message: `${param} must be a boolean`
                    });
                    continue;
                }
                
                if (rule.type === 'email' && !validator.isEmail(value)) {
                    errors.push({
                        field: param,
                        message: `${param} must be a valid email`
                    });
                    continue;
                }
                
                if (rule.type === 'url' && !validator.isURL(value)) {
                    errors.push({
                        field: param,
                        message: `${param} must be a valid URL`
                    });
                    continue;
                }
            }
            
            // Валидация диапазона для чисел
            if (rule.type === 'number' && value !== undefined) {
                const numValue = Number(value);
                
                if (rule.min !== undefined && numValue < rule.min) {
                    errors.push({
                        field: param,
                        message: `${param} must be at least ${rule.min}`
                    });
                }
                
                if (rule.max !== undefined && numValue > rule.max) {
                    errors.push({
                        field: param,
                        message: `${param} must be at most ${rule.max}`
                    });
                }
            }
            
            // Валидация длины для строк (query параметры всегда строки)
            if (value !== undefined && value !== null && value !== '') {
                const stringValue = String(value);
                if (rule.minLength !== undefined && stringValue.length < rule.minLength) {
                    errors.push({
                        field: param,
                        message: `${param} must be at least ${rule.minLength} characters`
                    });
                }
                
                if (rule.maxLength !== undefined && stringValue.length > rule.maxLength) {
                    errors.push({
                        field: param,
                        message: `${param} must be at most ${rule.maxLength} characters`
                    });
                }
            }
            
            // Валидация по регулярному выражению
            if (rule.pattern && !rule.pattern.test(value)) {
                errors.push({
                    field: param,
                    message: `${param} format is invalid`
                });
            }
            
            // Валидация по списку допустимых значений
            if (rule.enum) {
                // Для query параметров значения всегда строки, поэтому сравниваем как строки
                const stringValue = String(value);
                if (!rule.enum.includes(stringValue)) {
                    errors.push({
                        field: param,
                        message: `${param} must be one of: ${rule.enum.join(', ')}`
                    });
                }
            }
        }
        
        if (errors.length > 0) {
            return next(new ValidationError('Validation failed', errors));
        }
        
        next();
    };
};

/**
 * Валидация тела запроса
 */
export const validateBody = (rules) => {
    return (req, res, next) => {
        const errors = [];
        
        for (const [field, rule] of Object.entries(rules)) {
            const value = req.body[field];
            
            // Проверка обязательных полей
            if (rule.required && (value === undefined || value === null || value === '')) {
                errors.push({
                    field,
                    message: `${field} is required`
                });
                continue;
            }
            
            // Если поле не обязательное и отсутствует, пропускаем
            if (!rule.required && (value === undefined || value === null || value === '')) {
                continue;
            }
            
            // Валидация типа
            if (rule.type) {
                if (rule.type === 'number' && typeof value !== 'number' && isNaN(Number(value))) {
                    errors.push({
                        field,
                        message: `${field} must be a number`
                    });
                    continue;
                }
                
                if (rule.type === 'boolean' && typeof value !== 'boolean') {
                    errors.push({
                        field,
                        message: `${field} must be a boolean`
                    });
                    continue;
                }
                
                if (rule.type === 'string' && typeof value !== 'string') {
                    errors.push({
                        field,
                        message: `${field} must be a string`
                    });
                    continue;
                }
                
                if (rule.type === 'array' && !Array.isArray(value)) {
                    errors.push({
                        field,
                        message: `${field} must be an array`
                    });
                    continue;
                }
                
                if (rule.type === 'object' && (typeof value !== 'object' || Array.isArray(value) || value === null)) {
                    errors.push({
                        field,
                        message: `${field} must be an object`
                    });
                    continue;
                }
                
                if (rule.type === 'email' && !validator.isEmail(value)) {
                    errors.push({
                        field,
                        message: `${field} must be a valid email`
                    });
                    continue;
                }
                
                if (rule.type === 'url' && !validator.isURL(value)) {
                    errors.push({
                        field,
                        message: `${field} must be a valid URL`
                    });
                    continue;
                }
            }
            
            // Валидация диапазона для чисел
            if ((rule.type === 'number' || typeof value === 'number') && value !== undefined) {
                const numValue = typeof value === 'number' ? value : Number(value);
                
                if (rule.min !== undefined && numValue < rule.min) {
                    errors.push({
                        field,
                        message: `${field} must be at least ${rule.min}`
                    });
                }
                
                if (rule.max !== undefined && numValue > rule.max) {
                    errors.push({
                        field,
                        message: `${field} must be at most ${rule.max}`
                    });
                }
            }
            
            // Валидация длины для строк
            if ((rule.type === 'string' || typeof value === 'string') && value !== undefined) {
                if (rule.minLength !== undefined && value.length < rule.minLength) {
                    errors.push({
                        field,
                        message: `${field} must be at least ${rule.minLength} characters`
                    });
                }
                
                if (rule.maxLength !== undefined && value.length > rule.maxLength) {
                    errors.push({
                        field,
                        message: `${field} must be at most ${rule.maxLength} characters`
                    });
                }
            }
            
            // Валидация длины для массивов
            if ((rule.type === 'array' || Array.isArray(value)) && value !== undefined) {
                if (rule.minItems !== undefined && value.length < rule.minItems) {
                    errors.push({
                        field,
                        message: `${field} must have at least ${rule.minItems} items`
                    });
                }
                
                if (rule.maxItems !== undefined && value.length > rule.maxItems) {
                    errors.push({
                        field,
                        message: `${field} must have at most ${rule.maxItems} items`
                    });
                }
            }
            
            // Валидация по регулярному выражению
            if (rule.pattern && typeof value === 'string' && !rule.pattern.test(value)) {
                errors.push({
                    field,
                    message: `${field} format is invalid`
                });
            }
            
            // Валидация по списку допустимых значений
            if (rule.enum && !rule.enum.includes(value)) {
                errors.push({
                    field,
                    message: `${field} must be one of: ${rule.enum.join(', ')}`
                });
            }
        }
        
        if (errors.length > 0) {
            return next(new ValidationError('Validation failed', errors));
        }
        
        next();
    };
};

/**
 * Валидация параметров URL
 */
export const validateParams = (rules) => {
    return (req, res, next) => {
        const errors = [];
        
        for (const [param, rule] of Object.entries(rules)) {
            const value = req.params[param];
            
            // Проверка обязательных полей
            if (rule.required && (value === undefined || value === null || value === '')) {
                errors.push({
                    field: param,
                    message: `${param} is required`
                });
                continue;
            }
            
            // Если поле не обязательное и отсутствует, пропускаем
            if (!rule.required && (value === undefined || value === null || value === '')) {
                continue;
            }
            
            // Валидация типа
            if (rule.type === 'number' && isNaN(Number(value))) {
                errors.push({
                    field: param,
                    message: `${param} must be a number`
                });
                continue;
            }
            
            // Валидация по регулярному выражению
            if (rule.pattern && !rule.pattern.test(value)) {
                errors.push({
                    field: param,
                    message: `${param} format is invalid`
                });
            }
        }
        
        if (errors.length > 0) {
            return next(new ValidationError('Validation failed', errors));
        }
        
        next();
    };
};

/**
 * Вспомогательная функция для создания правил валидации
 */
export const validationRules = {
    // Числовые правила
    number: (options = {}) => ({ type: 'number', ...options }),
    integer: (options = {}) => ({ type: 'number', ...options }),
    
    // Строковые правила
    string: (options = {}) => ({ type: 'string', ...options }),
    email: (options = {}) => ({ type: 'email', ...options }),
    url: (options = {}) => ({ type: 'url', ...options }),
    
    // Другие типы
    boolean: (options = {}) => ({ type: 'boolean', ...options }),
    array: (options = {}) => ({ type: 'array', ...options }),
    object: (options = {}) => ({ type: 'object', ...options }),
    
    // Специальные правила
    enum: (values, options = {}) => ({ enum: values, ...options }),
    pattern: (regex, options = {}) => ({ pattern: regex, ...options })
};

