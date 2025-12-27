# Тестирование RecoveryService

## Описание

`RecoveryService` обеспечивает автоматическое восстановление после сбоев:
- Переподключение к базе данных при разрыве соединения
- Переподключение к WebSocket
- Восстановление состояния сервисов
- Проверка целостности данных после сбоя

## API Endpoints

### 1. Получение состояния восстановления

```
GET /api/recovery/state
```

**Описание:** Возвращает полное состояние восстановления всех компонентов.

**Пример ответа:**
```json
{
  "success": true,
  "data": {
    "database": {
      "isHealthy": true,
      "lastCheck": 1234567890,
      "reconnectAttempts": 0,
      "lastError": null
    },
    "websocket": {
      "isHealthy": true,
      "lastCheck": 1234567890,
      "reconnectAttempts": 0,
      "lastError": null
    },
    "services": {
      "isHealthy": true,
      "lastCheck": 1234567890,
      "failedServices": []
    },
    "config": {
      "healthCheckInterval": 30000,
      "maxReconnectAttempts": 5,
      "reconnectDelay": 2000,
      "exponentialBackoff": true
    },
    "isInitialized": true
  }
}
```

### 2. Получение статистики восстановления

```
GET /api/recovery/stats
```

**Описание:** Возвращает статистику восстановления для каждого компонента.

**Пример ответа:**
```json
{
  "success": true,
  "data": {
    "database": {
      "isHealthy": true,
      "reconnectAttempts": 0,
      "lastCheck": 1234567890,
      "lastError": null
    },
    "websocket": {
      "isHealthy": true,
      "reconnectAttempts": 0,
      "lastCheck": 1234567890,
      "lastError": null
    },
    "services": {
      "isHealthy": true,
      "failedServices": [],
      "lastCheck": 1234567890
    }
  }
}
```

### 3. Принудительная проверка здоровья

```
POST /api/recovery/health-check
```

**Описание:** Выполняет принудительную проверку здоровья всех компонентов.

**Пример ответа:**
```json
{
  "success": true,
  "message": "Проверка здоровья выполнена",
  "data": {
    "database": { ... },
    "websocket": { ... },
    "services": { ... }
  }
}
```

### 4. Восстановление подключения к БД

```
POST /api/recovery/database/recover
```

**Описание:** Принудительно восстанавливает подключение к базе данных.

**Пример ответа:**
```json
{
  "success": true,
  "message": "Подключение к БД восстановлено",
  "data": {
    "isHealthy": true,
    "reconnectAttempts": 1,
    "lastCheck": 1234567890,
    "lastError": null
  }
}
```

### 5. Восстановление WebSocket

```
POST /api/recovery/websocket/recover
```

**Описание:** Принудительно восстанавливает WebSocket соединение.

**Пример ответа:**
```json
{
  "success": true,
  "message": "WebSocket восстановлен",
  "data": {
    "isHealthy": true,
    "reconnectAttempts": 1,
    "lastCheck": 1234567890,
    "lastError": null
  }
}
```

### 6. Полное восстановление системы

```
POST /api/recovery/full
```

**Описание:** Выполняет полное восстановление всех компонентов системы.

**Пример ответа:**
```json
{
  "success": true,
  "message": "Полное восстановление системы выполнено",
  "data": {
    "success": true,
    "database": true,
    "websocket": true,
    "services": true
  }
}
```

### 7. Проверка целостности данных

```
POST /api/recovery/verify-integrity
```

**Описание:** Проверяет целостность данных после сбоя.

**Пример ответа:**
```json
{
  "success": true,
  "message": "Целостность данных проверена, проблем не обнаружено",
  "data": {
    "success": true,
    "issues": []
  }
}
```

**Пример ответа при обнаружении проблем:**
```json
{
  "success": false,
  "message": "Обнаружено 2 проблем целостности данных",
  "data": {
    "success": false,
    "issues": [
      {
        "type": "settings",
        "severity": "high",
        "message": "Таблица настроек пуста"
      },
      {
        "type": "instruments",
        "severity": "medium",
        "message": "Кеш инструментов пуст"
      }
    ]
  }
}
```

## Как протестировать

### Вариант 1: Через браузер

1. **Проверьте состояние:**
   ```
   http://localhost:3001/api/recovery/state
   ```

2. **Проверьте статистику:**
   ```
   http://localhost:3001/api/recovery/stats
   ```

3. **Выполните проверку здоровья:**
   ```
   POST http://localhost:3001/api/recovery/health-check
   ```

4. **Проверьте целостность данных:**
   ```
   POST http://localhost:3001/api/recovery/verify-integrity
   ```

### Вариант 2: Через curl

```bash
# 1. Получить состояние
curl http://localhost:3001/api/recovery/state

# 2. Получить статистику
curl http://localhost:3001/api/recovery/stats

# 3. Проверка здоровья
curl -X POST http://localhost:3001/api/recovery/health-check

# 4. Проверка целостности
curl -X POST http://localhost:3001/api/recovery/verify-integrity

# 5. Полное восстановление (только при проблемах)
curl -X POST http://localhost:3001/api/recovery/full
```

### Вариант 3: Через тестовый скрипт

```bash
cd server
node test-recovery-service.js
```

## Автоматическое восстановление

`RecoveryService` автоматически:
- Проверяет здоровье всех компонентов каждые 30 секунд
- Восстанавливает подключение к БД при обнаружении проблем
- Восстанавливает WebSocket при обнаружении проблем
- Проверяет состояние сервисов и переинициализирует их при необходимости
- Создает алерты через `MonitoringService` при критических проблемах

## Логи сервера

При работе RecoveryService вы увидите:

```
🚀 Инициализация RecoveryService...
✅ RecoveryService инициализирован
🔄 Попытка восстановления БД (1/5) через 2000ms...
✅ Подключение к БД восстановлено
⚠️ Обнаружены проблемы с сервисами: CacheService
🔄 Попытка восстановления сервиса CacheService...
✅ Сервис CacheService восстановлен
🔍 Проверка целостности данных...
✅ Целостность данных проверена, проблем не обнаружено
```

## Важные замечания

⚠️ **RecoveryService работает автоматически!**

- Не нужно вызывать endpoints вручную, если нет проблем
- Используйте endpoints только для мониторинга и принудительного восстановления
- Полное восстановление (`/api/recovery/full`) может занять время и использовать ресурсы

