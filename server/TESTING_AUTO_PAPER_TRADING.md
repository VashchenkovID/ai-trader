# Тестирование автоматической торговли в paper режиме

## Быстрый старт

### Запуск всех тестов
```bash
npm run test:auto-paper-trading:all
```

### Запуск отдельных групп тестов
```bash
# Базовые тесты (быстрая проверка)
npm run test:auto-paper-trading

# Unit тесты
npm run test:auto-paper-trading:unit          # AutoPaperTradingService
npm run test:auto-paper-trading:simulator     # RealisticExecutionSimulator

# Интеграционные тесты
npm run test:auto-paper-trading:integration

# Тесты API
npm run test:auto-paper-trading:routes

# Тесты моделей
npm run test:auto-paper-trading:models
```

## Структура тестов

### 📁 server/tests/
- `test-auto-paper-trading.js` - Базовые тесты (быстрая проверка)

### 📁 server/src/__tests__/services/
- `AutoPaperTradingService.test.js` - Unit тесты основного сервиса
- `RealisticExecutionSimulator.test.js` - Unit тесты симулятора

### 📁 server/src/__tests__/integration/
- `auto-paper-trading.integration.test.js` - Интеграционные тесты

### 📁 server/src/__tests__/routes/
- `auto-paper-trading-routes.test.js` - Тесты API endpoints

### 📁 server/src/__tests__/models/
- `AutoPaperTradingStats.test.js` - Тесты модели статистики

## Покрытие тестами

### AutoPaperTradingService (10 тестов)
✅ Инициализация и загрузка статистики  
✅ Получение текущих настроек  
✅ Проверка canAutoExecute (различные сценарии)  
✅ Включение/выключение сервиса  
✅ Валидация настроек  
✅ Сброс дневной статистики  
✅ Переход на следующую фазу  
✅ Получение статуса  

### RealisticExecutionSimulator (8 тестов)
✅ Инициализация сервиса  
✅ Симуляция исполнения BUY ордера  
✅ Симуляция исполнения SELL ордера  
✅ Определение уровней ликвидности  
✅ Расчет спреда  
✅ Расчет проскальзывания  
✅ Обработка ошибок  
✅ Частичное исполнение  

### Интеграционные тесты (5 тестов)
✅ Полный цикл автоматического исполнения  
✅ Интеграция RealisticExecutionSimulator с TradingEngine  
✅ Сохранение статистики в БД  
✅ Новые поля в TradingRequest  
✅ Обработка новой заявки  

### API Endpoints (7 тестов)
✅ GET /api/auto-paper-trading/status  
✅ POST /api/auto-paper-trading/enable  
✅ POST /api/auto-paper-trading/disable  
✅ GET /api/auto-paper-trading/stats  
✅ PUT /api/auto-paper-trading/settings  
✅ PUT /api/auto-paper-trading/settings (валидация)  
✅ POST /api/auto-paper-trading/advance-phase  

### Модели (4 теста)
✅ getTodayStats  
✅ getStatsForPeriod  
✅ Создание и сохранение статистики  
✅ Уникальность даты  

## Итого: 34+ теста

## Требования

Перед запуском тестов:
1. ✅ База данных настроена и доступна
2. ✅ Миграции выполнены: `npm run migrate:auto-paper-trading`
3. ✅ Переменные окружения настроены в `.env`

## Примеры запуска

### Полное тестирование
```bash
# Все тесты последовательно
npm run test:auto-paper-trading:all
```

### Быстрая проверка
```bash
# Базовые тесты (6 тестов)
npm run test:auto-paper-trading
```

### Детальное тестирование
```bash
# Unit тесты сервисов
npm run test:auto-paper-trading:unit
npm run test:auto-paper-trading:simulator

# Интеграционные тесты
npm run test:auto-paper-trading:integration

# Тесты API
npm run test:auto-paper-trading:routes

# Тесты моделей
npm run test:auto-paper-trading:models
```

## Интерпретация результатов

### ✅ Успешный запуск
```
📊 Результаты: 10/10 тестов пройдено
✅ Все тесты пройдены успешно!
```

### ⚠️ Частичный успех
```
📊 Результаты: 8/10 тестов пройдено
⚠️ Некоторые тесты провалены
```

Проверьте логи выше для деталей ошибок.

### ❌ Критическая ошибка
```
❌ Критическая ошибка: ...
```

Проверьте:
- Подключение к БД
- Выполнение миграций
- Настройки окружения

## Устранение проблем

### Ошибка "таблица не существует"
```bash
npm run migrate:auto-paper-trading
```

### Ошибка подключения к БД
Проверьте `.env`:
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `DB_HOST`
- `DB_PORT`

### Ошибка "режим торговли не paper"
Тесты автоматически переключают режим, но если проблема сохраняется:
1. Проверьте TradingModeManager
2. Убедитесь, что режим можно переключить

### Ошибки в интеграционных тестах
Убедитесь, что все сервисы инициализированы:
- AutoPaperTradingService
- RealisticExecutionSimulator
- TradingRequestService
- TradingEngine

## Дополнительная документация

- [Детальное описание тестов](src/__tests__/README_AUTO_PAPER_TRADING_TESTS.md)
- [Архитектура системы](../../docs/AUTO_PAPER_TRADING_ARCHITECTURE.md)
- [Настройка системы](AUTO_PAPER_TRADING_SETUP.md)
- [Миграции БД](migrations/README_AUTO_PAPER_TRADING.md)

