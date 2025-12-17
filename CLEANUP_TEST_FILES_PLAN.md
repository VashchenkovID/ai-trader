# План очистки тестовых файлов и методов

## 📋 Обзор

Данный документ содержит план удаления всех тестовых файлов и методов, которые используются исключительно для тестирования и не задействованы в основном коде приложения.

---

## 🗑️ Файлы для удаления

### 1. Тестовые скрипты бэктестинга (server/)

- ✅ `server/test-backtest-api.js` - Тестирование API endpoints бэктестинга
- ✅ `server/test-backtest-integration.js` - Тестирование интеграции бэктестинга в SchedulerService
- ✅ `server/test-walkforward.js` - Тестирование walk-forward анализа
- ✅ `server/test-backtesting-basic.js` - Тестирование базовой функциональности бэктестинга

### 2. Тестовые скрипты корреляций (server/src/)

- ✅ `server/src/test-correlation-quick.js` - Быстрый тест системы корреляций
- ✅ `server/src/test-correlation-system.js` - Полный тест системы контроля корреляций

### 3. Тестовые утилиты (server/src/utils/)

- ✅ `server/src/utils/testCronInitialization.js` - Тестирование инициализации cron задач
- ✅ `server/src/utils/testSequelizeUtils.js` - Утилиты для создания mock-объектов Sequelize (используются только внутри файла)
- ✅ `server/src/utils/testTelegramSend.js` - Тестирование отправки сообщений в Telegram
- ✅ `server/src/utils/testAutoTradeLogic.js` - Тестирование логики автоматической торговли
- ✅ `server/src/utils/testAutoTrade.js` - Тестирование автоматической торговли
- ✅ `server/src/utils/testTrailingStops.js` - Тестирование трейлинг-стопов
- ✅ `server/src/utils/testSettingsAPI.js` - Тестирование API настроек
- ✅ `server/src/utils/testSettings.js` - Тестирование настроек
- ✅ `server/src/utils/testNeuralNetworkTraining.js` - Тестирование обучения нейросети
- ✅ `server/src/utils/testNeuralNetwork.js` - Тестирование нейросети
- ✅ `server/src/utils/testDividendsSimple.js` - Простое тестирование дивидендов
- ✅ `server/src/utils/testDividendAPI.js` - Тестирование API дивидендов
- ✅ `server/src/utils/testCandles.js` - Тестирование данных свечей
- ✅ `server/src/utils/testAnalysis.js` - Тестирование анализа рынка

### 4. Тестовые файлы клиента (client/src/utils/)

- ✅ `client/src/utils/testWebSocket.js` - Тестирование WebSocket соединения

### 5. Документация по тестированию

- ✅ `server/BACKTEST_API_TESTING.md` - Документация по тестированию API бэктестинга
- ✅ `server/BACKTEST_FIXES_SUMMARY.md` - Сводка исправлений для бэктестинга
- ✅ `server/docs/AUTO_TRADE_TEST_CASES.md` - Тест-кейсы для автоматического создания заявок

---

## 🔍 Методы и функции для проверки

### Методы из testSequelizeUtils.js

Следующие функции используются **только внутри** `testSequelizeUtils.js` и не импортируются в других файлах:

- ✅ `createMockSequelizeModel(data)` - Создание mock Sequelize модели
- ✅ `createMockSequelizeModelWithAssociations(data, associations)` - Создание mock модели с ассоциациями
- ✅ `createMockRawObject(data)` - Создание mock raw объекта
- ✅ `createMockPlainObject(data)` - Создание mock plain объекта
- ✅ `test(name, fn)` - Вспомогательная функция для тестирования

**Статус:** Эти методы используются только внутри тестового файла, поэтому файл можно удалить целиком.

---

## ⚠️ Файлы, которые НЕ нужно удалять

### Производственные утилиты (не тестовые)

- ❌ `server/src/check-models.js` - Проверка моделей (используется в production)
- ❌ `server/src/analyze-training-data.js` - Анализ данных обучения (используется в production)
- ❌ `server/src/utils/diagnose.js` - Диагностика системы (используется в production)
- ❌ `server/src/utils/sequelizeUtils.js` - Утилиты Sequelize (используются в production)

### Документация (не тестовая)

- ❌ `server/docs/REINFORCEMENT_LEARNING_GUIDE.md` - Содержит упоминания тестов, но это документация, не тестовый файл

---

## 📊 Статистика

- **Всего тестовых файлов для удаления:** 23
  - Тестовые скрипты: 6
  - Тестовые утилиты: 14
  - Тестовые файлы клиента: 1
  - Документация по тестированию: 3

- **Методов для удаления:** 5 (все из testSequelizeUtils.js, файл удаляется целиком)

---

## ✅ План выполнения

### Этап 1: Удаление тестовых скриптов бэктестинга
1. Удалить `server/test-backtest-api.js`
2. Удалить `server/test-backtest-integration.js`
3. Удалить `server/test-walkforward.js`
4. Удалить `server/test-backtesting-basic.js`

### Этап 2: Удаление тестовых скриптов корреляций
1. Удалить `server/src/test-correlation-quick.js`
2. Удалить `server/src/test-correlation-system.js`

### Этап 3: Удаление тестовых утилит
1. Удалить все файлы `test*.js` из `server/src/utils/` (14 файлов)

### Этап 4: Удаление тестовых файлов клиента
1. Удалить `client/src/utils/testWebSocket.js`

### Этап 5: Удаление документации по тестированию
1. Удалить `server/BACKTEST_API_TESTING.md`
2. Удалить `server/BACKTEST_FIXES_SUMMARY.md`
3. Удалить `server/docs/AUTO_TRADE_TEST_CASES.md`

### Этап 6: Очистка конфигурационных файлов
1. Удалить скрипты из `server/package.json`:
   - `"test:correlation": "node src/test-correlation-system.js"`
   - `"test:correlation:quick": "node src/test-correlation-quick.js"`

---

## 🔄 Проверка после удаления

После удаления всех файлов необходимо проверить:

1. ✅ Нет импортов удаленных файлов в основном коде
2. ✅ Нет ссылок на удаленные файлы в документации (кроме этой)
3. ✅ Нет ссылок на удаленные файлы в `package.json`
4. ✅ Приложение запускается без ошибок
5. ✅ Все production утилиты работают корректно

---

## 📝 Примечания

- Все тестовые файлы являются самостоятельными скриптами и не импортируются в основном коде
- Методы из `testSequelizeUtils.js` используются только внутри этого файла
- Документация по тестированию может быть восстановлена из истории Git при необходимости
- В `server/package.json` найдены скрипты, ссылающиеся на тестовые файлы корреляций - их необходимо удалить
- После удаления рекомендуется проверить, что в `package.json` нет других скриптов, ссылающихся на удаленные файлы

