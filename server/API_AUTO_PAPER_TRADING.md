# API для автоматической торговли

## Базовый URL

```
http://localhost:3001/api/auto-paper-trading
```

## Endpoints

### 1. GET /status

Получить статус автоматической торговли.

**Запрос:**
```bash
GET /api/auto-paper-trading/status
```

**Ответ:**
```json
{
  "success": true,
  "data": {
    "isInitialized": true,
    "isEnabled": false,
    "currentPhase": "phase1",
    "stats": {
      "dailyTrades": 0,
      "dailyPnL": 0,
      "totalTrades": 0,
      "lastTradeTime": null
    },
    "settings": {
      "minConfidence": 0.8,
      "maxDailyTrades": 5,
      "maxPositionSize": 0.03,
      "minTimeBetweenTrades": 300,
      "maxDailyLoss": 0.05
    }
  }
}
```

---

### 2. POST /enable

Включить автоматическую торговлю.

**Запрос:**
```bash
POST /api/auto-paper-trading/enable
```

**Ответ:**
```json
{
  "success": true,
  "message": "Auto paper trading enabled"
}
```

**Что происходит:**
- Устанавливается флаг `isEnabled = true`
- Обрабатываются все свежие заявки (созданные в последние 4 часа) со статусом `PENDING`

---

### 3. POST /disable

Выключить автоматическую торговлю.

**Запрос:**
```bash
POST /api/auto-paper-trading/disable
```

**Ответ:**
```json
{
  "success": true,
  "message": "Auto paper trading disabled"
}
```

---

### 4. GET /stats

Получить статистику за период.

**Запрос:**
```bash
GET /api/auto-paper-trading/stats
```

**Опциональные параметры:**
- `startDate` (query): Дата начала периода (YYYY-MM-DD)
- `endDate` (query): Дата окончания периода (YYYY-MM-DD)

**Пример:**
```bash
GET /api/auto-paper-trading/stats?startDate=2024-01-01&endDate=2024-01-31
```

**Ответ:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "date": "2024-01-15",
      "dailyTrades": 3,
      "dailyPnL": 1500.50,
      "totalTrades": 45,
      "currentPhase": "phase1",
      "settings": {...}
    }
  ]
}
```

---

### 5. PUT /settings

Обновить настройки автоматической торговли.

**Запрос:**
```bash
PUT /api/auto-paper-trading/settings
Content-Type: application/json

{
  "minConfidence": 0.75,
  "maxDailyTrades": 10,
  "maxPositionSize": 0.04
}
```

**Валидные параметры:**
- `minConfidence`: число от 0.5 до 0.95
- `maxDailyTrades`: число от 1 до 50
- `maxPositionSize`: число от 0.01 до 0.1
- `minTimeBetweenTrades`: число (секунды)
- `maxDailyLoss`: число от 0.01 до 0.2

**Ответ (успех):**
```json
{
  "success": true,
  "message": "Settings updated"
}
```

**Ответ (ошибка валидации):**
```json
{
  "success": false,
  "message": "Invalid settings",
  "errors": [
    "minConfidence must be between 0.5 and 0.95",
    "maxDailyTrades must be between 1 and 50"
  ]
}
```

---

### 6. POST /advance-phase

Перейти на следующую фазу автоматической торговли.

**Запрос:**
```bash
POST /api/auto-paper-trading/advance-phase
```

**Ответ:**
```json
{
  "success": true,
  "message": "Advanced to next phase",
  "currentPhase": "phase2"
}
```

**Фазы:**
- `phase1`: Консервативная (5 сделок/день, minConfidence 0.8)
- `phase2`: Умеренная (10 сделок/день, minConfidence 0.75)
- `phase3`: Активная (15 сделок/день, minConfidence 0.7)

**Внимание:** Обычно переход происходит автоматически при выполнении условий. Ручной переход возможен, но не рекомендуется без проверки критериев.

---

## Примеры использования

### Полный цикл включения и проверки

```bash
# 1. Проверка статуса
curl http://localhost:3001/api/auto-paper-trading/status

# 2. Включение
curl -X POST http://localhost:3001/api/auto-paper-trading/enable

# 3. Проверка, что включено
curl http://localhost:3001/api/auto-paper-trading/status

# 4. Просмотр статистики
curl http://localhost:3001/api/auto-paper-trading/stats

# 5. Изменение настроек
curl -X PUT http://localhost:3001/api/auto-paper-trading/settings \
  -H "Content-Type: application/json" \
  -d '{"minConfidence": 0.75, "maxDailyTrades": 10}'

# 6. Выключение (если нужно)
curl -X POST http://localhost:3001/api/auto-paper-trading/disable
```

### Мониторинг в реальном времени

```bash
# Следить за статусом каждые 10 секунд
watch -n 10 'curl -s http://localhost:3001/api/auto-paper-trading/status | jq'
```

### Проверка статистики за период

```bash
curl "http://localhost:3001/api/auto-paper-trading/stats?startDate=2024-01-01&endDate=2024-01-31"
```

## Коды ошибок

- `200` - Успех
- `400` - Ошибка валидации (неверные параметры)
- `500` - Внутренняя ошибка сервера

## Безопасность

Все endpoints требуют, чтобы:
1. Сервер был запущен
2. База данных была доступна
3. Миграции были выполнены

В будущем можно добавить аутентификацию для защиты endpoints.

