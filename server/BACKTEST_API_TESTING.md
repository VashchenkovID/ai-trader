# Тестирование API endpoints для бэктестинга

## Доступные endpoints

### 1. GET /api/backtest/results/:strategyId
Получение последних результатов бэктестинга для стратегии.

**Параметры:**
- `strategyId` (path) - ID стратегии
- `limit` (query, опционально) - количество результатов (по умолчанию 10)
- `backtestType` (query, опционально) - тип бэктестинга: 'full' или 'walk_forward' (по умолчанию 'walk_forward')

**Пример запроса:**
```bash
curl http://localhost:3000/api/backtest/results/1?limit=5&backtestType=walk_forward
```

**Пример ответа:**
```json
{
  "success": true,
  "data": {
    "strategy": {
      "id": 1,
      "name": "Conservative Strategy",
      "description": "..."
    },
    "results": [
      {
        "id": 1,
        "backtestType": "walk_forward",
        "startDate": "2024-01-01T00:00:00.000Z",
        "endDate": "2024-07-01T00:00:00.000Z",
        "totalReturn": 15.5,
        "winRate": 65.2,
        "sharpeRatio": 1.8,
        ...
      }
    ],
    "count": 1
  }
}
```

---

### 2. POST /api/backtest/run/:strategyId
Запуск бэктестинга для конкретной стратегии вручную.

**Параметры:**
- `strategyId` (path) - ID стратегии
- `startDate` (body, опционально) - дата начала в формате ISO (по умолчанию 6 месяцев назад)
- `endDate` (body, опционально) - дата окончания в формате ISO (по умолчанию текущая дата)
- `windowSizeMonths` (body, опционально) - размер окна для walk-forward анализа в месяцах (по умолчанию 2)
- `stepSizeMonths` (body, опционально) - шаг смещения окна в месяцах (по умолчанию 1)
- `backtestType` (body, опционально) - тип бэктестинга: 'full' или 'walk_forward' (по умолчанию 'walk_forward')

**Пример запроса:**
```bash
curl -X POST http://localhost:3000/api/backtest/run/1 \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2024-01-01T00:00:00.000Z",
    "endDate": "2024-07-01T00:00:00.000Z",
    "windowSizeMonths": 2,
    "stepSizeMonths": 1,
    "backtestType": "walk_forward"
  }'
```

**Пример ответа:**
```json
{
  "success": true,
  "data": {
    "strategy": {
      "id": 1,
      "name": "Conservative Strategy"
    },
    "backtestType": "walk_forward",
    "result": {
      "stabilityAnalysis": {...},
      "degradationAnalysis": {...},
      "alerts": [...]
    }
  },
  "message": "Бэктестинг успешно выполнен"
}
```

---

### 3. GET /api/backtest/compare
Сравнение результатов бэктестинга всех стратегий.

**Параметры:**
- `backtestType` (query, опционально) - тип бэктестинга: 'full' или 'walk_forward' (по умолчанию 'walk_forward')
- `limit` (query, опционально) - количество последних результатов для каждой стратегии (по умолчанию 1)

**Пример запроса:**
```bash
curl http://localhost:3000/api/backtest/compare?backtestType=walk_forward
```

**Пример ответа:**
```json
{
  "success": true,
  "data": {
    "backtestType": "walk_forward",
    "comparison": [
      {
        "strategyId": 1,
        "strategyName": "Conservative Strategy",
        "totalReturn": 15.5,
        "winRate": 65.2,
        "sharpeRatio": 1.8,
        ...
      },
      {
        "strategyId": 2,
        "strategyName": "Aggressive Strategy",
        "totalReturn": 12.3,
        "winRate": 58.5,
        ...
      }
    ],
    "count": 2,
    "timestamp": "2024-07-01T12:00:00.000Z"
  }
}
```

---

### 4. GET /api/backtest/report/:strategyId
Получение детального отчета по бэктестингу.

**Параметры:**
- `strategyId` (path) - ID стратегии
- `resultId` (query, опционально) - ID конкретного результата (если не указан, возвращается последний)
- `backtestType` (query, опционально) - тип бэктестинга: 'full' или 'walk_forward' (по умолчанию 'walk_forward')

**Пример запроса:**
```bash
curl http://localhost:3000/api/backtest/report/1?backtestType=walk_forward
```

**Пример ответа:**
```json
{
  "success": true,
  "data": {
    "result": {
      "id": 1,
      "backtestType": "walk_forward",
      "totalReturn": 15.5,
      "winRate": 65.2,
      "equityCurve": [...],
      "trades": [...],
      ...
    },
    "strategy": {
      "id": 1,
      "name": "Conservative Strategy",
      "description": "..."
    },
    "report": "# Walk-Forward анализ стратегии...\n\n..."
  }
}
```

---

### 5. GET /api/backtest/list
Получение списка всех результатов бэктестинга с пагинацией.

**Параметры:**
- `strategyId` (query, опционально) - фильтр по ID стратегии
- `backtestType` (query, опционально) - фильтр по типу бэктестинга
- `status` (query, опционально) - фильтр по статусу: 'completed', 'failed', 'in_progress' (по умолчанию 'completed')
- `limit` (query, опционально) - количество результатов на странице (по умолчанию 50)
- `offset` (query, опционально) - смещение для пагинации (по умолчанию 0)

**Пример запроса:**
```bash
curl http://localhost:3000/api/backtest/list?limit=10&offset=0&status=completed
```

**Пример ответа:**
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "id": 1,
        "strategyId": 1,
        "strategyName": "Conservative Strategy",
        "backtestType": "walk_forward",
        "totalReturn": 15.5,
        ...
      }
    ],
    "pagination": {
      "total": 25,
      "limit": 10,
      "offset": 0,
      "hasMore": true
    }
  }
}
```

---

## Тестирование через скрипт

Запустите тестовый скрипт:

```bash
node server/test-backtest-api.js
```

Скрипт проверит:
- ✅ Получение результатов бэктестинга
- ✅ Сравнение стратегий
- ✅ Список результатов с пагинацией
- ✅ Генерацию отчетов
- ✅ Структуру данных

---

## Тестирование через HTTP запросы

Если сервер запущен на `http://localhost:3000`, используйте следующие команды:

### 1. Получить результаты для стратегии ID=1:
```bash
curl http://localhost:3000/api/backtest/results/1
```

### 2. Запустить бэктестинг для стратегии ID=1:
```bash
curl -X POST http://localhost:3000/api/backtest/run/1 \
  -H "Content-Type: application/json" \
  -d '{"backtestType": "walk_forward"}'
```

### 3. Сравнить все стратегии:
```bash
curl http://localhost:3000/api/backtest/compare
```

### 4. Получить отчет для стратегии ID=1:
```bash
curl http://localhost:3000/api/backtest/report/1
```

### 5. Получить список результатов:
```bash
curl http://localhost:3000/api/backtest/list?limit=10
```

---

## Ожидаемые результаты

- ✅ Все endpoints возвращают JSON с полем `success: true`
- ✅ Ошибки обрабатываются корректно с соответствующими HTTP статусами
- ✅ Данные структурированы и содержат все необходимые поля
- ✅ Пагинация работает корректно
- ✅ Фильтры применяются правильно

---

## Примечания

- Для запуска бэктестинга через POST `/api/backtest/run/:strategyId` требуется наличие исторических данных (свечи, сигналы)
- Бэктестинг может занять некоторое время в зависимости от объема данных
- Результаты сохраняются в БД автоматически при `saveToDb: true`
- Отчеты генерируются автоматически при запросе, если их нет в БД

