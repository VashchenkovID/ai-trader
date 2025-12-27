# Руководство по обработке ошибок и валидации

## Обработка ошибок

### Кастомные классы ошибок

Используйте кастомные классы ошибок для более точной обработки:

```javascript
import { 
    ValidationError, 
    NotFoundError, 
    DatabaseError,
    ExternalApiError 
} from '../utils/errors/AppError.js';

// Валидация
throw new ValidationError('Invalid input', [{ field: 'email', message: 'Invalid email' }]);

// Не найдено
throw new NotFoundError('User');

// База данных
throw new DatabaseError('Failed to save', originalError);

// Внешний API
throw new ExternalApiError('Tinkoff', 'API request failed', originalError);
```

### Использование asyncHandler

Оберните async функции в `asyncHandler` для автоматической обработки ошибок:

```javascript
import { asyncHandler } from '../middleware/errorHandler.js';

router.get('/users/:id', asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) {
        throw new NotFoundError('User');
    }
    res.json({ success: true, data: user });
}));
```

### Структура ответа об ошибке

Все ошибки возвращаются в едином формате:

```json
{
    "success": false,
    "message": "Error message",
    "details": [
        {
            "field": "email",
            "message": "Invalid email"
        }
    ]
}
```

## Валидация

### Валидация query параметров

```javascript
import { validateQuery, validationRules } from '../middleware/validation.js';

router.get('/users', 
    validateQuery({
        page: validationRules.number({ min: 1, required: false }),
        limit: validationRules.number({ min: 1, max: 100, required: false }),
        status: validationRules.enum(['active', 'inactive'], { required: false })
    }),
    asyncHandler(async (req, res) => {
        // req.query уже валидирован
        const { page = 1, limit = 10, status } = req.query;
        // ...
    })
);
```

### Валидация body

```javascript
import { validateBody, validationRules } from '../middleware/validation.js';

router.post('/users',
    validateBody({
        email: validationRules.email({ required: true }),
        name: validationRules.string({ minLength: 2, maxLength: 100, required: true }),
        age: validationRules.number({ min: 0, max: 150, required: false })
    }),
    asyncHandler(async (req, res) => {
        // req.body уже валидирован
        const { email, name, age } = req.body;
        // ...
    })
);
```

### Валидация params

```javascript
import { validateParams, validationRules } from '../middleware/validation.js';

router.get('/users/:id',
    validateParams({
        id: validationRules.number({ required: true, min: 1 })
    }),
    asyncHandler(async (req, res) => {
        // req.params.id уже валидирован как число
        const userId = parseInt(req.params.id);
        // ...
    })
);
```

### Доступные правила валидации

#### Числовые правила
```javascript
validationRules.number({
    required: true,
    min: 0,
    max: 100
})
```

#### Строковые правила
```javascript
validationRules.string({
    required: true,
    minLength: 2,
    maxLength: 100
})
```

#### Email
```javascript
validationRules.email({ required: true })
```

#### URL
```javascript
validationRules.url({ required: true })
```

#### Boolean
```javascript
validationRules.boolean({ required: true })
```

#### Array
```javascript
validationRules.array({
    required: true,
    minItems: 1,
    maxItems: 10
})
```

#### Enum
```javascript
validationRules.enum(['active', 'inactive', 'pending'], { required: true })
```

#### Pattern (регулярное выражение)
```javascript
validationRules.pattern(/^[A-Z]{3}$/, { required: true })
```

## Примеры использования

### Полный пример роута с валидацией

```javascript
import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validateBody, validateQuery, validationRules } from '../middleware/validation.js';
import { NotFoundError, ValidationError } from '../utils/errors/AppError.js';

const router = express.Router();

// GET /api/users?page=1&limit=10&status=active
router.get('/users',
    validateQuery({
        page: validationRules.number({ min: 1, required: false }),
        limit: validationRules.number({ min: 1, max: 100, required: false }),
        status: validationRules.enum(['active', 'inactive'], { required: false })
    }),
    asyncHandler(async (req, res) => {
        const { page = 1, limit = 10, status } = req.query;
        
        const users = await User.findAll({
            where: status ? { status } : {},
            limit: parseInt(limit),
            offset: (parseInt(page) - 1) * parseInt(limit)
        });
        
        res.json({
            success: true,
            data: users
        });
    })
);

// POST /api/users
router.post('/users',
    validateBody({
        email: validationRules.email({ required: true }),
        name: validationRules.string({ minLength: 2, maxLength: 100, required: true }),
        age: validationRules.number({ min: 0, max: 150, required: false })
    }),
    asyncHandler(async (req, res) => {
        const { email, name, age } = req.body;
        
        const user = await User.create({ email, name, age });
        
        res.status(201).json({
            success: true,
            data: user
        });
    })
);

// GET /api/users/:id
router.get('/users/:id',
    validateParams({
        id: validationRules.number({ required: true, min: 1 })
    }),
    asyncHandler(async (req, res) => {
        const userId = parseInt(req.params.id);
        const user = await User.findById(userId);
        
        if (!user) {
            throw new NotFoundError('User');
        }
        
        res.json({
            success: true,
            data: user
        });
    })
);

export default router;
```

## HTTP статус коды

- `400` - Bad Request (валидация, неверный формат)
- `401` - Unauthorized (требуется аутентификация)
- `403` - Forbidden (нет доступа)
- `404` - Not Found (ресурс не найден)
- `409` - Conflict (конфликт, например, дубликат)
- `500` - Internal Server Error (ошибка сервера)
- `502` - Bad Gateway (ошибка внешнего API)
- `503` - Service Unavailable (сервис недоступен)
- `504` - Gateway Timeout (таймаут)

## Логирование

Все ошибки автоматически логируются:
- Критические ошибки (500+) - полное логирование с stack trace
- Клиентские ошибки (400-499) - краткое логирование
- Алерты создаются для критических ошибок
- Уведомления в Telegram для критических ошибок

## Мониторинг

Все ошибки автоматически:
- Учитываются в метриках MonitoringService
- Создают алерты при критических ошибках
- Отправляются в Telegram (если настроено)

