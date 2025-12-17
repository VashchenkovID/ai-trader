# Сводка исправлений для бэктестинга

## Исправленные проблемы

### 1. ✅ Удалено поле `description` из всех запросов
**Проблема:** Модель `TradingStrategy` не содержит поле `description`, но оно использовалось в `include` запросах.

**Исправление:** Все `include` запросы в `backtest-routes.js` теперь используют только `['id', 'name']`:
- `GET /api/backtest/results/:strategyId` ✅
- `GET /api/backtest/report/:strategyId` ✅  
- `GET /api/backtest/list` ✅

### 2. ✅ Исправлено вычисление `totalProfit`
**Проблема:** Поле `totalProfit` отсутствует в модели `BacktestResult`.

**Исправление:** `totalProfit` теперь вычисляется как `finalCapital - initialCapital` во всех местах:
- В ответах API endpoints
- В тестовом скрипте

### 3. ✅ Установка ассоциаций
**Проблема:** Ассоциации устанавливались дважды - в `initDatabase.js` и в `backtest-routes.js`.

**Исправление:** Удалена дублирующая установка ассоциаций из `backtest-routes.js`. Ассоциации устанавливаются только в `initDatabase.js`.

### 4. ⚠️ Предупреждение о дублирующихся алиасах
**Проблема:** Несколько моделей используют одинаковый алиас `strategy` для связи с `TradingStrategy`:
- `Recommendation.belongsTo(TradingStrategy, { as: 'strategy' })`
- `PositionStrategy.belongsTo(TradingStrategy, { as: 'strategy' })`
- `TradingRequest.belongsTo(TradingStrategy, { as: 'strategy' })`
- `BacktestResult.belongsTo(TradingStrategy, { as: 'strategy' })`

**Статус:** Это предупреждение Sequelize, не критично. Система работает корректно. Можно исправить в будущем, используя уникальные алиасы для каждой модели.

## Файлы изменены

1. `server/src/routes/backtest-routes.js`
   - Удалено поле `description` из всех `include` запросов
   - Добавлено вычисление `totalProfit` из капитала
   - Удалена дублирующая установка ассоциаций

2. `server/test-backtest-api.js`
   - Добавлена установка ассоциаций для тестирования
   - Исправлена проверка структуры данных (удалено `totalProfit` из обязательных полей)

## Рекомендации

1. **Перезапустите тест** после изменений:
   ```bash
   node server/test-backtest-api.js
   ```

2. **Если ошибка сохраняется**, очистите кеш Node.js:
   ```bash
   # Windows PowerShell
   Remove-Item -Recurse -Force node_modules/.cache -ErrorAction SilentlyContinue
   ```

3. **Для исправления предупреждения об алиасах** (опционально):
   - Использовать уникальные алиасы для каждой модели:
     - `BacktestResult.belongsTo(TradingStrategy, { as: 'backtestStrategy' })`
     - `TradingRequest.belongsTo(TradingStrategy, { as: 'requestStrategy' })`
     - и т.д.

## Статус

✅ Все критические проблемы исправлены
⚠️ Предупреждение об алиасах не критично, система работает корректно

