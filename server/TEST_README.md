# Тестирование функционала Фазы 1, задача 1.1

## Описание

Тесты для проверки реализованного функционала "Смягчение валидации" из Фазы 1, задачи 1.1.

## Установка зависимостей

```bash
cd server
npm install --save-dev @jest/globals jest @babel/core @babel/preset-env babel-jest
```

## Запуск тестов

### Простой тестовый скрипт (рекомендуется)

```bash
cd server
npm run test:validation-phase1
```

или напрямую:

```bash
cd server
node test-validation-phase1.js
```

### Jest тесты (если установлен Jest)

```bash
cd server
npm run test:validation
```

## Что тестируется

### 1.1.1. Снижение лимитов confidence
- ✅ Micro режим: confidence 60% должна проходить валидацию
- ✅ Real режим: confidence 70% должна проходить валидацию
- ✅ Real режим: не должен требовать score >= 0.7
- ✅ Micro/Real режим: confidence < 40% должна блокировать

### 1.1.2. Превращение блокировок в предупреждения
- ✅ Micro режим: confidence 50% должна возвращать warning
- ✅ Real режим: confidence 65% должна возвращать warning
- ✅ SELL операции должны пропускать валидацию confidence
- ✅ RiskManagementService: confidence 50% должна возвращать warning
- ✅ RiskManagementService: confidence < 40% должна блокировать

### 1.1.3. Увеличение лимитов размера позиций
- ✅ maxPositionSize должна быть 5% вместо 2%
- ✅ maxTotalExposure должна быть 40% вместо 20%

### 1.1.4. Смягчение лимитов убытков
- ✅ maxConsecutiveLosses должна быть 10 вместо 5
- ✅ maxDailyLoss должна быть 10% вместо 5%
- ✅ 7 последовательных убытков должны возвращать warning
- ✅ 10 последовательных убытков должны блокировать
- ✅ Дневной убыток 7% должен возвращать warning
- ✅ Дневной убыток > 10% должен блокировать

## Структура тестов

```
server/
├── test-validation-phase1.js          # Основной тестовый скрипт
├── src/
│   └── __tests__/
│       └── services/
│           ├── TradingRequestService.test.js
│           └── RiskManagementService.test.js
├── jest.config.js                      # Конфигурация Jest
└── babel.config.js                     # Конфигурация Babel
```

## Примечания

- Тесты требуют инициализации сервисов (TradingModeManager, RiskManagementService)
- Некоторые тесты могут требовать подключения к базе данных
- Для изоляции тестов рекомендуется использовать моки для зависимостей

