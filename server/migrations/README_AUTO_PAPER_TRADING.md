# Миграции для автоматической торговли в paper режиме

## Описание

Этот документ описывает миграции базы данных, необходимые для работы автоматической торговли в paper режиме.

## Миграции

### 1. create-auto-paper-trading-stats-table.js

Создает таблицу `auto_paper_trading_stats` для хранения статистики автоматической торговли.

**Таблица содержит:**
- `id` - первичный ключ
- `date` - дата статистики (уникальная)
- `dailyTrades` - количество сделок за день
- `dailyPnL` - прибыль/убыток за день
- `totalTrades` - общее количество сделок
- `currentPhase` - текущая фаза (phase1, phase2, phase3)
- `settings` - настройки на дату (JSON)

### 2. add-auto-paper-trading-fields-to-trading-requests.js

Добавляет новые поля в таблицу `trading_requests`:

- `autoExecuted` - флаг автоматического исполнения
- `executionSimulation` - данные симуляции исполнения (JSON)
- `autoExecutionPhase` - фаза автоматического исполнения
- `actualQuantity` - фактически исполненное количество
- `autoExecutionFailed` - флаг ошибки автоматического исполнения
- `executionError` - текст ошибки

## Запуск миграций

### Способ 1: Через скрипт (рекомендуется)

```bash
cd server
npm run migrate:auto-paper-trading
```

### Способ 2: Через отдельные миграции

```bash
cd server
node migrations/create-auto-paper-trading-stats-table.js
node migrations/add-auto-paper-trading-fields-to-trading-requests.js
```

### Способ 3: Через MigrationService

Миграции также могут быть выполнены автоматически через `MigrationService` при старте сервера (если включено в настройках).

## Откат миграций

Для отката миграций используйте функцию `down`:

```javascript
import sequelize from './src/config/database.js';
import { down } from './migrations/create-auto-paper-trading-stats-table.js';

const queryInterface = sequelize.getQueryInterface();
await down(queryInterface, sequelize.Sequelize);
```

## Проверка миграций

После выполнения миграций проверьте:

1. Существование таблицы `auto_paper_trading_stats`:
```sql
SELECT * FROM information_schema.tables WHERE table_name = 'auto_paper_trading_stats';
```

2. Наличие новых полей в `trading_requests`:
```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'trading_requests' 
AND column_name IN ('autoExecuted', 'executionSimulation', 'autoExecutionPhase', 'actualQuantity', 'autoExecutionFailed', 'executionError');
```

## Тестирование

После выполнения миграций запустите тесты:

```bash
cd server
npm run test:auto-paper-trading
```

## Примечания

- Миграции проверяют существование таблиц/полей перед созданием
- Миграции безопасны для повторного запуска
- Все миграции поддерживают откат (rollback)

