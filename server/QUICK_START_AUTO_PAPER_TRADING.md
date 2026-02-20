# Быстрый старт автоматической торговли

## Шаг 1: Проверка миграций

Убедитесь, что миграции выполнены (они должны выполниться автоматически при запуске `initDatabase`, но можно проверить):

```bash
cd server
npm run migrate:auto-paper-trading
```

Или если миграции уже выполнены через `initDatabase`, можно пропустить этот шаг.

## Шаг 2: Запуск сервера

```bash
cd server
npm start
```

Или для разработки с автоперезагрузкой:

```bash
npm run dev
```

Сервер запустится на порту `3001` (или из переменной окружения `PORT`).

## Шаг 3: Проверка статуса

После запуска сервера проверьте статус автоматической торговли:

```bash
curl http://localhost:3001/api/auto-paper-trading/status
```

Или через браузер:
```
http://localhost:3001/api/auto-paper-trading/status
```

**Ожидаемый ответ:**
```json
{
  "success": true,
  "data": {
    "isInitialized": true,
    "isEnabled": false,  // По умолчанию выключено
    "currentPhase": "phase1",
    "stats": {
      "dailyTrades": 0,
      "dailyPnL": 0,
      "totalTrades": 0
    },
    "settings": {
      "minConfidence": 0.8,
      "maxDailyTrades": 5,
      ...
    }
  }
}
```

## Шаг 4: Включение автоматической торговли

**Важно:** По умолчанию автоматическая торговля **выключена**. Нужно включить её вручную:

```bash
curl -X POST http://localhost:3001/api/auto-paper-trading/enable
```

Или через браузер/Postman:
- Метод: `POST`
- URL: `http://localhost:3001/api/auto-paper-trading/enable`

**Ответ:**
```json
{
  "success": true,
  "message": "Auto paper trading enabled"
}
```

## Шаг 5: Проверка работы

### 5.1. Проверка статуса после включения

```bash
curl http://localhost:3001/api/auto-paper-trading/status
```

Теперь `isEnabled` должен быть `true`.

### 5.2. Просмотр статистики

```bash
curl http://localhost:3001/api/auto-paper-trading/stats
```

### 5.3. Создание тестовой заявки

Автоматическая торговля будет обрабатывать новые заявки в режиме `paper` автоматически, если они соответствуют условиям:

- Режим торговли: `paper`
- Статус: `PENDING`
- Confidence >= `minConfidence` (по умолчанию 0.8 для phase1)
- Проходят проверку RiskManagementService

## Что происходит автоматически

После включения автоматической торговли:

1. ✅ **Новые заявки** в режиме `paper` со статусом `PENDING` будут автоматически проверяться
2. ✅ **Соответствующие заявки** будут автоматически исполняться
3. ✅ **Статистика** обновляется после каждой сделки
4. ✅ **Ежедневный сброс** статистики в 00:00
5. ✅ **Проверка перехода на следующую фазу** в 01:00

## Настройки

### Просмотр текущих настроек

```bash
curl http://localhost:3001/api/auto-paper-trading/status
```

Настройки находятся в `data.settings`.

### Изменение настроек

```bash
curl -X PUT http://localhost:3001/api/auto-paper-trading/settings \
  -H "Content-Type: application/json" \
  -d '{
    "minConfidence": 0.75,
    "maxDailyTrades": 10
  }'
```

**Валидные параметры:**
- `minConfidence`: 0.5 - 0.95
- `maxDailyTrades`: 1 - 50
- `maxPositionSize`: 0.01 - 0.1
- `maxDailyLoss`: 0.01 - 0.2

## Управление фазами

### Просмотр текущей фазы

```bash
curl http://localhost:3001/api/auto-paper-trading/status
```

Фаза находится в `data.currentPhase` (phase1, phase2, phase3).

### Ручной переход на следующую фазу

```bash
curl -X POST http://localhost:3001/api/auto-paper-trading/advance-phase
```

**Внимание:** Обычно переход происходит автоматически при выполнении условий.

## Выключение автоматической торговли

```bash
curl -X POST http://localhost:3001/api/auto-paper-trading/disable
```

## Проверка работы в реальном времени

### Логи сервера

Следите за логами сервера - там будут сообщения о:
- Инициализации сервиса
- Обработке заявок
- Автоматическом исполнении
- Ошибках (если есть)

### Мониторинг через API

Периодически проверяйте статус:

```bash
# Каждые 30 секунд
watch -n 30 'curl -s http://localhost:3001/api/auto-paper-trading/status | jq'
```

## Важные замечания

1. **Режим торговли должен быть `paper`** - автоматическая торговля работает только в paper режиме
2. **По умолчанию выключено** - нужно явно включить через API
3. **Фаза 1 (по умолчанию)** - самые строгие ограничения:
   - maxDailyTrades: 5
   - minConfidence: 0.8
   - maxPositionSize: 0.03 (3%)
4. **Миграции выполнены** - таблицы и поля должны существовать в БД

## Устранение проблем

### Ошибка "таблица не существует"

Выполните миграции:
```bash
npm run migrate:auto-paper-trading
```

### Ошибка "режим торговли не paper"

Проверьте текущий режим:
```bash
curl http://localhost:3001/api/trading-mode/current
```

Если нужно переключить на paper:
```bash
curl -X POST http://localhost:3001/api/trading-mode/switch \
  -H "Content-Type: application/json" \
  -d '{"mode": "paper"}'
```

### Автоматическая торговля не работает

1. Проверьте, что она включена: `isEnabled: true`
2. Проверьте, что режим торговли: `paper`
3. Проверьте логи сервера на наличие ошибок
4. Убедитесь, что есть заявки со статусом `PENDING` в режиме `paper`

## Дополнительная информация

- [Архитектура](../../docs/AUTO_PAPER_TRADING_ARCHITECTURE.md)
- [Тестирование](TESTING_AUTO_PAPER_TRADING.md)
- [Настройка](AUTO_PAPER_TRADING_SETUP.md)

