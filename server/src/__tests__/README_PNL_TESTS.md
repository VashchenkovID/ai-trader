# Тесты для расчета PnL

## Запуск тестов

```bash
cd server
npm test -- PnLCalculationService
npm test -- CashFlow
npm test -- portfolio-pnl
npm test -- pnl-calculation.integration
```

Или все тесты сразу:
```bash
npm test
```

## Структура тестов

### 1. Unit тесты для PnLCalculationService
**Файл:** `__tests__/services/PnLCalculationService.test.js`

Проверяет:
- Расчет реализованной прибыли от закрытых сделок
- Расчет нереализованной прибыли от открытых позиций
- Обработку пустых массивов
- Правильность расчетов для прибыльных и убыточных сделок
- Win rate и средние значения

### 2. Unit тесты для CashFlow модели
**Файл:** `__tests__/models/CashFlow.test.js`

Проверяет:
- Создание записей о депозитах и выводах
- Статические методы (getTotalDeposits, getTotalWithdrawals, getNetCashFlow)
- Фильтрацию по датам
- Валидацию данных

### 3. Тесты API endpoints
**Файл:** `__tests__/routes/portfolio-pnl.test.js`

Проверяет:
- Логику работы с API endpoints (без полного HTTP стека)
- Валидацию входных данных
- Взаимодействие с сервисами

### 4. Интеграционные тесты
**Файл:** `__tests__/integration/pnl-calculation.integration.test.js`

Проверяет:
- Полный цикл расчета PnL с учетом CashFlow
- Взаимодействие между сервисами и моделями
- Множественные вводы/выводы средств

## Примечания

- Тесты используют моки для изоляции компонентов
- Интеграционные тесты могут требовать настройки тестовой БД
- Некоторые тесты требуют установки `supertest` для полного HTTP тестирования:
  ```bash
  npm install --save-dev supertest
  ```

## Примеры использования в тестах

### Мокирование сервисов
```javascript
jest.spyOn(PnLCalculationService, 'calculateTotalPnL').mockResolvedValue(mockData);
```

### Проверка расчетов
```javascript
expect(result.total).toBe(70000);
expect(result.realized.total).toBe(50000);
expect(result.unrealized.total).toBe(20000);
```

### Проверка CashFlow
```javascript
const totalDeposits = await CashFlow.getTotalDeposits('real');
expect(totalDeposits).toBe(500000);
```


