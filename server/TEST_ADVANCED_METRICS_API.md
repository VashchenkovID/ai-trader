# Тестирование API endpoints для продвинутых метрик

## Структура endpoints

Все endpoints доступны по адресу: `/api/advanced-metrics`

### Доступные endpoints:

1. **GET `/api/advanced-metrics`** - Получение всех продвинутых метрик
   - Query параметры: `period` (daily/weekly/monthly), `days` (1-365)

2. **GET `/api/advanced-metrics/sortino-ratio`** - Sortino Ratio
   - Query параметры: `period`, `days`, `riskFreeRate` (опционально)

3. **GET `/api/advanced-metrics/calmar-ratio`** - Calmar Ratio
   - Query параметры: `period`, `days`

4. **GET `/api/advanced-metrics/information-ratio`** - Information Ratio
   - Query параметры: `period`, `days`
   - Note: Требует данные бенчмарка (пока не реализовано)

5. **GET `/api/advanced-metrics/mae-mfe`** - MAE/MFE
   - Query параметры: `limit` (1-1000)

6. **GET `/api/advanced-metrics/period-analysis`** - Анализ по периодам
   - Query параметры: `period`, `startDate` (ISO string), `endDate` (ISO string)

7. **GET `/api/advanced-metrics/summary`** - Сводка всех метрик
   - Query параметры: `period`, `days`

## Запуск тестов

### Вариант 1: Через Node.js напрямую
```bash
cd server
node test-advanced-metrics-stage4.js
```

### Вариант 2: Через API (если сервер запущен)
```bash
# Запустите сервер в отдельном терминале:
cd server
npm start

# Затем в другом терминале выполните тесты или используйте curl/Postman:
curl http://localhost:3000/api/advanced-metrics?period=daily&days=30
```

## Проверка регистрации маршрутов

Маршруты зарегистрированы в `server/src/routes/optimized-routes.js`:
```javascript
import advancedMetricsRoutes from './advanced-metrics-routes.js';
// ...
router.use('/advanced-metrics', advancedMetricsRoutes);
```

## Примеры запросов

### Получение всех метрик:
```
GET /api/advanced-metrics?period=daily&days=30
```

### Получение Sortino Ratio:
```
GET /api/advanced-metrics/sortino-ratio?period=daily&days=30
```

### Анализ по периодам:
```
GET /api/advanced-metrics/period-analysis?period=daily&startDate=2024-01-01&endDate=2024-01-31
```

### Сводка всех метрик:
```
GET /api/advanced-metrics/summary?period=daily&days=30
```

## Валидация

Endpoints проверяют:
- Период должен быть: `daily`, `weekly` или `monthly`
- Количество дней должно быть от 1 до 365
- Даты должны быть валидными ISO строками
- Лимит для MAE/MFE должен быть от 1 до 1000

При ошибке валидации возвращается статус 400 с описанием ошибки.

