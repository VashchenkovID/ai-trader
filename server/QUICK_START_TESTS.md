# Быстрый старт тестов

## ⚠️ ВАЖНО: Перед запуском тестов выполните миграции!

### Шаг 1: Выполните миграции

```bash
cd server
node migrations/create-auto-paper-trading-stats-table.js
node migrations/add-auto-paper-trading-fields-to-trading-requests.js
```

Или через скрипт:
```bash
cd server
node scripts/run-auto-paper-trading-migrations.js
```

### Шаг 2: Запустите тесты

```bash
# Все тесты
npm run test:auto-paper-trading:all

# Или отдельные группы
npm run test:auto-paper-trading:unit
npm run test:auto-paper-trading:simulator
npm run test:auto-paper-trading:integration
npm run test:auto-paper-trading:routes
npm run test:auto-paper-trading:models
```

## Что было исправлено

1. ✅ Исправлены пути импорта в тестах
2. ✅ Исправлено использование CacheService в RealisticExecutionSimulator
3. ✅ Добавлена поддержка `marketData.dailyVolume` в getLiquidityLevel

## Ожидаемые результаты

После выполнения миграций все тесты должны пройти успешно:
- ✅ Unit тесты: 10/10
- ✅ Simulator тесты: 8/8
- ✅ Integration тесты: 5/5
- ✅ Routes тесты: 7/7
- ✅ Models тесты: 4/4

## Если миграции уже выполнены через initDatabase

Если вы запускали `initDatabase`, миграции должны быть выполнены автоматически. 
Проверьте наличие таблиц:

```sql
-- Проверка таблицы статистики
SELECT * FROM information_schema.tables WHERE table_name = 'auto_paper_trading_stats';

-- Проверка полей в trading_requests
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'trading_requests' 
AND column_name IN ('autoExecuted', 'executionSimulation', 'autoExecutionPhase');
```

Если таблицы/поля отсутствуют, выполните миграции вручную.

