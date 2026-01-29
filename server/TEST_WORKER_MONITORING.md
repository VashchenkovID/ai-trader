# Тестирование системы мониторинга воркеров

## Способ 1: Тест через API (рекомендуется)

### Предварительные требования
1. Сервер должен быть запущен: `npm start` или `node src/app.js`
2. Node.js 18+ (для поддержки fetch) или используйте curl/Postman

### Запуск теста
```bash
node test-worker-monitoring-api.js
```

### Ручное тестирование через curl

#### 1. Получить статус всех воркеров
```bash
curl http://localhost:3001/api/workers/status
```

#### 2. Получить статистику
```bash
curl http://localhost:3001/api/workers/stats?period=24h
```

#### 3. Получить историю
```bash
curl http://localhost:3001/api/workers/history?limit=10
```

#### 4. Получить временную линию
```bash
curl "http://localhost:3001/api/workers/timeline?startDate=2024-01-01T00:00:00Z&endDate=2024-01-02T00:00:00Z"
```

#### 5. Получить воркеры по типу
```bash
curl http://localhost:3001/api/workers/type/training
```

## Способ 2: Тест сервиса напрямую

### Запуск
```bash
node test-worker-monitoring.js
```

Этот тест проверяет функциональность WorkerMonitoringService напрямую без HTTP.

## Способ 3: Тестирование через реальное обучение

### Запуск обучения через API
```bash
# Запустить обучение (это создаст воркер)
curl -X POST http://localhost:3001/api/neural-network/train \
  -H "Content-Type: application/json" \
  -d '{"figi": "BBG000B9XRY4", "options": {"days": 180}}'

# Проверить статус воркеров
curl http://localhost:3001/api/workers/status
```

## Ожидаемые результаты

### GET /api/workers/status
```json
{
  "success": true,
  "data": {
    "workers": [
      {
        "workerId": "training_1234567890_0",
        "type": "training",
        "name": "Training model for AAPL",
        "status": "running",
        "progress": 25,
        "startTime": "2024-01-01T12:00:00.000Z",
        "duration": 5000,
        "metadata": {
          "figi": "BBG000B9XRY4",
          "epoch": 12
        }
      }
    ],
    "count": 1
  }
}
```

### GET /api/workers/stats
```json
{
  "success": true,
  "data": {
    "period": "24h",
    "active": {
      "total": 1,
      "byType": {
        "training": 1
      },
      "byStatus": {
        "running": 1,
        "paused": 0,
        "completed": 0,
        "error": 0
      }
    },
    "completed": {
      "total": 5,
      "successful": 4,
      "failed": 1,
      "successRate": 80.0,
      "avgDuration": 120000
    }
  }
}
```

## Проверка WebSocket событий

Для проверки WebSocket событий используйте клиент WebSocket:

```javascript
const ws = new WebSocket('ws://localhost:3001');

ws.on('message', (data) => {
  const message = JSON.parse(data);
  if (message.type && message.type.startsWith('worker_')) {
    console.log('Worker event:', message);
  }
});
```

Ожидаемые события:
- `worker_started` - при регистрации воркера
- `worker_progress` - при обновлении прогресса
- `worker_completed` - при завершении воркера
- `worker_error` - при ошибке
- `worker_paused` - при паузе
- `worker_resumed` - при возобновлении
- `worker_status_update` - при изменении статуса

## Устранение проблем

### Ошибка: "WorkerMonitoringService not initialized"
Убедитесь, что сервис инициализирован в ServiceManager.

### Ошибка: "Cannot find module"
Проверьте, что вы находитесь в директории `server/`.

### Ошибка: "ECONNREFUSED"
Убедитесь, что сервер запущен на порту 3001.

