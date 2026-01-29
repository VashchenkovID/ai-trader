# Как протестировать систему мониторинга воркеров

## Быстрый старт

### Вариант 1: Простой тест (без запущенного сервера)

```bash
cd server
node test-worker-monitoring-simple.js
```

Этот тест проверяет базовую функциональность WorkerMonitoringService.

### Вариант 2: Тест через API (требует запущенный сервер)

1. Запустите сервер:
```bash
cd server
npm start
```

2. В другом терминале запустите тест:
```bash
cd server
node test-worker-monitoring-api.js
```

### Вариант 3: Ручное тестирование через curl

#### Проверка статуса воркеров
```bash
curl http://localhost:3001/api/workers/status
```

#### Проверка статистики
```bash
curl http://localhost:3001/api/workers/stats?period=24h
```

#### Проверка истории
```bash
curl http://localhost:3001/api/workers/history?limit=10
```

## Тестирование с реальными воркерами

### 1. Запустите обучение нейросети

Это создаст реальный воркер, который будет отслеживаться:

```bash
curl -X POST http://localhost:3001/api/neural-network/train \
  -H "Content-Type: application/json" \
  -d '{"figi": "BBG000B9XRY4", "options": {"days": 180}}'
```

### 2. Проверьте статус воркеров

```bash
curl http://localhost:3001/api/workers/status
```

Вы должны увидеть воркер типа "training" со статусом "running".

### 3. Отслеживайте прогресс

Повторяйте запрос статуса, чтобы видеть изменение прогресса:
```bash
watch -n 2 'curl -s http://localhost:3001/api/workers/status | jq .'
```

## Проверка WebSocket событий

Откройте консоль браузера на фронтенде и подключитесь к WebSocket:

```javascript
const ws = new WebSocket('ws://localhost:3001');
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type && data.type.startsWith('worker_')) {
    console.log('Worker event:', data);
  }
};
```

Ожидаемые события при обучении:
- `worker_started` - при запуске обучения
- `worker_progress` - при обновлении прогресса (каждую эпоху)
- `worker_completed` - при завершении обучения

## Ожидаемые результаты

### Успешный ответ GET /api/workers/status:
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
        "progress": 45,
        "startTime": "2024-01-01T12:00:00.000Z",
        "duration": 120000,
        "metadata": {
          "figi": "BBG000B9XRY4",
          "epoch": 22
        }
      }
    ],
    "count": 1
  }
}
```

## Устранение проблем

### Ошибка: "Cannot find module"
- Убедитесь, что вы в директории `server/`
- Проверьте, что все зависимости установлены: `npm install`

### Ошибка: "ECONNREFUSED"
- Убедитесь, что сервер запущен на порту 3001
- Проверьте логи сервера на наличие ошибок

### Ошибка: "WorkerMonitoringService not initialized"
- Сервис должен автоматически инициализироваться при первом использовании
- Если проблема сохраняется, проверьте логи сервера

### Нет воркеров в статусе
- Это нормально, если обучение не запущено
- Запустите обучение через API, чтобы создать воркер

## Следующие шаги

После успешного тестирования бэкенда:
1. ✅ Бэкенд готов
2. ⏭️ Создать фронтенд компоненты для отображения воркеров
3. ⏭️ Добавить график работы воркеров
4. ⏭️ Интегрировать в основное приложение

