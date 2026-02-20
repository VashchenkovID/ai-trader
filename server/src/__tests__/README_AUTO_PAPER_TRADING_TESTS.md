# Тесты для автоматической торговли в paper режиме

## Обзор

Комплексный набор тестов для проверки функциональности автоматической торговли, включающий:
- Unit тесты сервисов
- Интеграционные тесты
- Тесты API endpoints
- Тесты моделей

## Структура тестов

### 1. Unit тесты

#### AutoPaperTradingService.test.js
Тестирует основной сервис автоматической торговли:
- ✅ Инициализация сервиса
- ✅ Получение текущих настроек
- ✅ Проверка canAutoExecute
- ✅ Проверка canAutoExecute с низким confidence
- ✅ Проверка canAutoExecute в неправильном режиме
- ✅ Включение/выключение автоматической торговли
- ✅ Валидация настроек
- ✅ Сброс дневной статистики
- ✅ Переход на следующую фазу
- ✅ Получение статуса

**Запуск:**
```bash
npm run test:auto-paper-trading:unit
```

#### RealisticExecutionSimulator.test.js
Тестирует симулятор исполнения ордеров:
- ✅ Инициализация сервиса
- ✅ Симуляция исполнения BUY ордера
- ✅ Симуляция исполнения SELL ордера
- ✅ Определение уровней ликвидности
- ✅ Расчет спреда
- ✅ Расчет проскальзывания
- ✅ Обработка ошибок
- ✅ Частичное исполнение

**Запуск:**
```bash
npm run test:auto-paper-trading:simulator
```

### 2. Интеграционные тесты

#### auto-paper-trading.integration.test.js
Тестирует взаимодействие между сервисами:
- ✅ Полный цикл автоматического исполнения
- ✅ Интеграция RealisticExecutionSimulator с TradingEngine
- ✅ Сохранение статистики в БД
- ✅ Новые поля в TradingRequest
- ✅ Обработка новой заявки

**Запуск:**
```bash
npm run test:auto-paper-trading:integration
```

### 3. Тесты API endpoints

#### auto-paper-trading-routes.test.js
Тестирует логику API endpoints:
- ✅ GET /api/auto-paper-trading/status
- ✅ POST /api/auto-paper-trading/enable
- ✅ POST /api/auto-paper-trading/disable
- ✅ GET /api/auto-paper-trading/stats
- ✅ PUT /api/auto-paper-trading/settings
- ✅ PUT /api/auto-paper-trading/settings (невалидные данные)
- ✅ POST /api/auto-paper-trading/advance-phase

**Запуск:**
```bash
npm run test:auto-paper-trading:routes
```

### 4. Тесты моделей

#### AutoPaperTradingStats.test.js
Тестирует модель статистики:
- ✅ getTodayStats
- ✅ getStatsForPeriod
- ✅ Создание и сохранение статистики
- ✅ Уникальность даты

**Запуск:**
```bash
npm run test:auto-paper-trading:models
```

## Запуск всех тестов

```bash
npm run test:auto-paper-trading:all
```

Или по отдельности:

```bash
# Базовые тесты (из server/tests)
npm run test:auto-paper-trading

# Unit тесты
npm run test:auto-paper-trading:unit
npm run test:auto-paper-trading:simulator

# Интеграционные тесты
npm run test:auto-paper-trading:integration

# Тесты API
npm run test:auto-paper-trading:routes

# Тесты моделей
npm run test:auto-paper-trading:models
```

## Требования

Перед запуском тестов убедитесь, что:
1. ✅ База данных настроена и доступна
2. ✅ Миграции выполнены (`npm run migrate:auto-paper-trading`)
3. ✅ Переменные окружения настроены в `.env`

## Покрытие тестами

### AutoPaperTradingService
- ✅ Инициализация и загрузка статистики
- ✅ Проверка условий автоматического исполнения
- ✅ Включение/выключение сервиса
- ✅ Валидация настроек
- ✅ Управление фазами
- ✅ Обновление статистики
- ✅ Получение статуса

### RealisticExecutionSimulator
- ✅ Симуляция исполнения для BUY и SELL
- ✅ Расчет спредов по уровням ликвидности
- ✅ Расчет проскальзывания
- ✅ Определение ликвидности инструментов
- ✅ Обработка ошибок с дефолтными значениями
- ✅ Частичное исполнение

### Интеграция
- ✅ Полный цикл от создания заявки до исполнения
- ✅ Интеграция с TradingEngine
- ✅ Сохранение данных в БД
- ✅ Обработка новых заявок

### API Endpoints
- ✅ Все основные endpoints
- ✅ Валидация входных данных
- ✅ Обработка ошибок

### Модели
- ✅ CRUD операции
- ✅ Статические методы
- ✅ Валидация данных

## Результаты тестов

Тесты выводят результаты в консоль:
- ✅ - тест пройден
- ❌ - тест провален
- ⚠️ - предупреждение
- 📊 - информация

В конце выводится общая статистика: `X/Y тестов пройдено`

## Устранение проблем

### Ошибка подключения к БД
Убедитесь, что переменные окружения настроены:
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `DB_HOST`
- `DB_PORT`

### Ошибка "таблица не существует"
Выполните миграции:
```bash
npm run migrate:auto-paper-trading
```

### Ошибка "режим торговли не paper"
Тесты автоматически переключают режим на paper, но если это не работает, проверьте настройки TradingModeManager.

### Ошибки в интеграционных тестах
Убедитесь, что все сервисы инициализированы:
- AutoPaperTradingService
- RealisticExecutionSimulator
- TradingRequestService
- TradingEngine

## Дополнительная информация

- [Архитектура](../../../../docs/AUTO_PAPER_TRADING_ARCHITECTURE.md)
- [Настройка](../../../AUTO_PAPER_TRADING_SETUP.md)
- [Миграции](../../../migrations/README_AUTO_PAPER_TRADING.md)

