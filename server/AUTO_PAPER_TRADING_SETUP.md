# Настройка автоматической торговли в paper режиме

## Быстрый старт

### 1. Запуск миграций

```bash
cd server
npm run migrate:auto-paper-trading
```

Или через отдельные миграции:

```bash
cd server
node migrations/create-auto-paper-trading-stats-table.js
node migrations/add-auto-paper-trading-fields-to-trading-requests.js
```

### 2. Запуск тестов

```bash
cd server
npm run test:auto-paper-trading
```

### 3. Включение автоматической торговли

После успешного выполнения миграций и тестов, включите автоматическую торговлю через API:

```bash
curl -X POST http://localhost:3001/api/auto-paper-trading/enable
```

Или через фронтенд в настройках системы.

## Проверка статуса

```bash
curl http://localhost:3001/api/auto-paper-trading/status
```

## Структура файлов

### Миграции
- `server/migrations/create-auto-paper-trading-stats-table.js` - создание таблицы статистики
- `server/migrations/add-auto-paper-trading-fields-to-trading-requests.js` - добавление полей в trading_requests

### Сервисы
- `server/src/services/AutoPaperTradingService.js` - основной сервис автоматической торговли
- `server/src/services/RealisticExecutionSimulator.js` - симуляция исполнения ордеров

### Модели
- `server/src/models/AutoPaperTradingStats.js` - модель статистики

### API
- `server/src/routes/auto-paper-trading-routes.js` - API endpoints

### Тесты
- `server/tests/test-auto-paper-trading.js` - тесты функциональности

## Документация

- [Миграции](migrations/README_AUTO_PAPER_TRADING.md)
- [Тесты](tests/README_AUTO_PAPER_TRADING_TESTS.md)
- [Архитектура](../../docs/AUTO_PAPER_TRADING_ARCHITECTURE.md)

## Устранение проблем

### Ошибка "таблица уже существует"
Это нормально - миграции проверяют существование перед созданием. Миграция будет пропущена.

### Ошибка подключения к БД
Убедитесь, что переменные окружения настроены в `.env`:
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `DB_HOST`
- `DB_PORT`

### Тесты не проходят
1. Убедитесь, что миграции выполнены
2. Проверьте, что режим торговли установлен в `paper`
3. Проверьте логи для деталей ошибок

## Следующие шаги

1. ✅ Выполнить миграции
2. ✅ Запустить тесты
3. ✅ Включить автоматическую торговлю
4. ✅ Мониторить работу через API `/api/auto-paper-trading/status`
5. ✅ Анализировать статистику через `/api/auto-paper-trading/stats`

