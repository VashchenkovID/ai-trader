# Руководство по логированию

## Обзор

Приложение использует централизованный `LoggerService` на основе `winston` для структурированного логирования с контекстом, трассировкой запросов и автоматической ротацией логов.

## Основные возможности

- ✅ **Структурированное логирование** - JSON формат в production, читаемый формат в development
- ✅ **Контекст** - автоматическое добавление `requestId`, `userId`, `service` к каждому логу
- ✅ **Трассировка запросов** - автоматическое логирование всех HTTP запросов
- ✅ **Ротация логов** - автоматическая ротация по размеру (20MB) с хранением до 14-30 файлов
- ✅ **Уровни логирования** - error, warn, info, debug, verbose
- ✅ **Обработка исключений** - автоматическое логирование необработанных исключений и rejections

## Использование

### Базовое использование

```javascript
import LoggerService from '../services/LoggerService.js';

// Логирование информации
LoggerService.info('Сервис инициализирован', {
    service: 'MyService',
    version: '1.0.0'
});

// Логирование ошибки
LoggerService.error('Ошибка при выполнении операции', {
    service: 'MyService',
    operation: 'processData',
    error: error.message,
    stack: error.stack
});

// Логирование предупреждения
LoggerService.warn('Высокое использование памяти', {
    service: 'MyService',
    memoryUsage: '500MB',
    threshold: '400MB'
});

// Логирование отладки
LoggerService.debug('Промежуточное значение', {
    service: 'MyService',
    value: someValue
});
```

### Использование с контекстом запроса

В middleware и route handlers автоматически доступен `requestId`:

```javascript
import LoggerService from '../services/LoggerService.js';

router.get('/api/data', async (req, res) => {
    // requestId автоматически добавлен через middleware
    LoggerService.info('Получение данных', {
        requestId: req.requestId, // Уже доступен через requestTracing middleware
        service: 'DataService',
        userId: req.user?.id
    });
    
    // ... код обработки
});
```

### Создание дочернего логгера с контекстом

Для сервисов рекомендуется создавать дочерний логгер с фиксированным контекстом:

```javascript
import LoggerService from '../services/LoggerService.js';

class MyService {
    constructor() {
        // Создаем дочерний логгер с контекстом сервиса
        this.logger = LoggerService.child({ service: 'MyService' });
    }
    
    async doSomething() {
        // Контекст service: 'MyService' автоматически добавляется ко всем логам
        this.logger.info('Выполнение операции');
        this.logger.debug('Детали операции', { data: someData });
    }
}
```

### Специализированные методы логирования

```javascript
// Логирование HTTP запроса (автоматически вызывается middleware)
LoggerService.logRequest(req, res, duration);

// Логирование ошибки запроса
LoggerService.logRequestError(error, req);

// Логирование медленного запроса
LoggerService.logSlowRequest(req, duration);

// Логирование операции с БД
LoggerService.logDatabase('SELECT * FROM users', {
    duration: '50ms',
    rows: 100
});

// Логирование вызова внешнего API
LoggerService.logApiCall('TinkoffAPI', '/instruments', 'GET', 250, {
    statusCode: 200
});

// Логирование критической ошибки
LoggerService.logCritical('Критическая ошибка системы', {
    service: 'CriticalService',
    impact: 'high'
});
```

## Структура логов

### Формат лога в production (JSON)

```json
{
  "timestamp": "2025-01-27 12:34:56.789",
  "level": "info",
  "message": "Сервис инициализирован",
  "service": "ai-trader",
  "environment": "production",
  "requestId": "req_1234567890_abc123",
  "service": "MyService",
  "version": "1.0.0"
}
```

### Формат лога в development (читаемый)

```
2025-01-27 12:34:56.789 [INFO] [req_1234567890_abc123] [MyService] Сервис инициализирован
{
  "version": "1.0.0"
}
```

## Уровни логирования

- **error** - Ошибки, требующие внимания
- **warn** - Предупреждения о потенциальных проблемах
- **info** - Информационные сообщения (по умолчанию в production)
- **debug** - Отладочная информация (только в development)
- **verbose** - Подробная информация для детальной отладки

## Конфигурация

### Переменные окружения

```env
# Уровень логирования (error, warn, info, debug, verbose)
LOG_LEVEL=info

# Окружение (development, production)
NODE_ENV=production
```

### Файлы логов

Логи сохраняются в директории `server/logs/`:

- `combined.log` - Все логи уровня info и выше
- `error.log` - Только ошибки
- `exceptions.log` - Необработанные исключения
- `rejections.log` - Необработанные Promise rejections

### Ротация логов

- **Максимальный размер файла**: 20MB
- **Количество файлов для combined.log**: 14 (≈14 дней)
- **Количество файлов для error.log**: 30 (≈30 дней)
- **Автоматическая ротация**: При достижении максимального размера

## Миграция с console.log

### До (console.log)

```javascript
console.log('Сервис инициализирован');
console.error('Ошибка:', error);
console.warn('Предупреждение:', message);
```

### После (LoggerService)

```javascript
import LoggerService from '../services/LoggerService.js';

LoggerService.info('Сервис инициализирован', { service: 'MyService' });
LoggerService.error('Ошибка', { error: error.message, stack: error.stack });
LoggerService.warn('Предупреждение', { message });
```

### Автоматическая замена

Для быстрой миграции можно использовать поиск и замену:

1. `console.log(` → `LoggerService.info(`
2. `console.error(` → `LoggerService.error(`
3. `console.warn(` → `LoggerService.warn(`
4. Добавить импорт: `import LoggerService from '../services/LoggerService.js';`

## Best Practices

### 1. Всегда добавляйте контекст

```javascript
// ❌ Плохо
LoggerService.error('Ошибка');

// ✅ Хорошо
LoggerService.error('Ошибка при сохранении данных', {
    service: 'DataService',
    operation: 'save',
    userId: userId,
    error: error.message
});
```

### 2. Используйте дочерние логгеры для сервисов

```javascript
// ✅ Хорошо
class MyService {
    constructor() {
        this.logger = LoggerService.child({ service: 'MyService' });
    }
    
    doSomething() {
        this.logger.info('Операция выполнена'); // service автоматически добавлен
    }
}
```

### 3. Логируйте ошибки с полной информацией

```javascript
// ✅ Хорошо
try {
    // код
} catch (error) {
    LoggerService.error('Ошибка при выполнении операции', {
        service: 'MyService',
        operation: 'processData',
        error: {
            message: error.message,
            stack: error.stack,
            name: error.name
        },
        context: {
            input: sanitizedInput,
            userId: userId
        }
    });
    throw error;
}
```

### 4. Используйте правильные уровни

- **error** - Только для реальных ошибок
- **warn** - Для предупреждений, которые не критичны
- **info** - Для важных событий (инициализация, завершение операций)
- **debug** - Для детальной отладки
- **verbose** - Для очень подробной информации

### 5. Не логируйте чувствительные данные

```javascript
// ❌ Плохо
LoggerService.info('Пользователь авторизован', {
    password: user.password, // НИКОГДА!
    token: user.token // НИКОГДА!
});

// ✅ Хорошо
LoggerService.info('Пользователь авторизован', {
    userId: user.id,
    email: user.email // Если безопасно
});
```

## API Endpoints для мониторинга

Логи можно просматривать через файловую систему или использовать API мониторинга:

- `GET /api/monitoring/metrics` - Метрики приложения
- `GET /api/monitoring/alerts` - Активные алерты
- `GET /api/monitoring/health` - Health check

## Troubleshooting

### Логи не создаются

1. Проверьте права на запись в директорию `server/logs/`
2. Проверьте переменную окружения `LOG_LEVEL`
3. Убедитесь, что `LoggerService` инициализирован в `ServiceManager`

### Слишком много логов

1. Увеличьте `LOG_LEVEL` до `warn` или `error`
2. Проверьте, не логируете ли вы в циклах без необходимости
3. Используйте `debug` вместо `info` для отладочной информации

### Логи занимают много места

1. Проверьте настройки ротации (maxsize, maxFiles)
2. Удалите старые файлы логов вручную
3. Рассмотрите возможность архивации старых логов

