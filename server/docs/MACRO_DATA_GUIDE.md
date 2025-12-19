# Руководство по работе с макроэкономическими данными

## 📋 Обзор

Система макроэкономических данных (`MacroDataService`) предназначена для сбора, хранения и использования макроэкономических индикаторов в качестве дополнительных фичей для нейросетей. Данные автоматически обновляются по расписанию и доступны через REST API.

## 🎯 Основные возможности

- **Автоматический сбор данных** из российских источников (ЦБ РФ, Росстат, Мосбиржа)
- **Хранение данных** в PostgreSQL с поддержкой истории
- **Кеширование** для быстрого доступа
- **Интеграция с нейросетями** через `OptimizedDataService`
- **REST API** для работы с данными
- **Автоматическое обновление** по расписанию через `SchedulerService`

## 📊 Поддерживаемые индикаторы

### Типы индикаторов

1. **`inflation`** - Инфляция (годовая, %)
2. **`interest_rate`** - Ключевая ставка ЦБ РФ (%)
3. **`gdp`** - ВВП (квартальные данные, %)
4. **`unemployment`** - Безработица (месячные данные, %)
5. **`volatility_index`** - Индекс волатильности RVI
6. **`sentiment`** - Индекс настроений инвесторов
7. **`industrial_production`** - Промышленное производство (%)
8. **`retail_sales`** - Розничные продажи (%)
9. **`investments`** - Инвестиции (%)
10. **`exports`** - Экспорт (%)
11. **`imports`** - Импорт (%)
12. **`other`** - Прочие индикаторы

### Источники данных

- **ЦБ РФ** (`cbr`): Ключевая ставка
- **Росстат** (`rosstat`): ВВП, безработица, промышленное производство (через Investing.com)
- **Мосбиржа** (`moex`): Индекс волатильности RVI (через Investing.com)

## 🔌 REST API Endpoints

Все endpoints доступны по префиксу `/api/macro-data`

### 1. Статус сервиса

**GET** `/api/macro-data/status`

Получение статуса `MacroDataService`.

**Ответ:**
```json
{
  "success": true,
  "data": {
    "isInitialized": true,
    "settings": {
      "updateInterval": "0 10 * * *",
      "cacheTtlHours": 1,
      "sources": {
        "cbr": true,
        "rosstat": true,
        "moex": true
      }
    },
    "cacheSize": 150
  }
}
```

### 2. Получение всех индикаторов

**GET** `/api/macro-data/indicators`

Получение списка индикаторов с фильтрацией и пагинацией.

**Query параметры:**
- `indicatorType` (опционально) - фильтр по типу индикатора
- `country` (опционально, по умолчанию `'RUS'`) - код страны
- `startDate` (опционально) - начальная дата (ISO string)
- `endDate` (опционально) - конечная дата (ISO string)
- `limit` (опционально, по умолчанию `100`) - ограничение количества результатов
- `offset` (опционально, по умолчанию `0`) - смещение для пагинации

**Пример запроса:**
```
GET /api/macro-data/indicators?indicatorType=interest_rate&startDate=2024-01-01&limit=50
```

**Ответ:**
```json
{
  "success": true,
  "data": {
    "indicators": [
      {
        "id": 1,
        "indicatorType": "interest_rate",
        "source": "cbr",
        "value": "16.50",
        "period": "2024-12-18T00:00:00.000Z",
        "periodType": "daily",
        "unit": "percent",
        "metadata": {
          "change": 0.5
        },
        "country": "RUS"
      }
    ],
    "total": 150,
    "limit": 50,
    "offset": 0
  }
}
```

### 3. Получение индикаторов определенного типа

**GET** `/api/macro-data/indicators/:type`

Получение индикаторов конкретного типа.

**Параметры пути:**
- `type` - тип индикатора (например, `interest_rate`, `gdp`, `unemployment`)

**Query параметры:**
- `country` (опционально, по умолчанию `'RUS'`) - код страны
- `startDate` (опционально) - начальная дата (ISO string)
- `endDate` (опционально) - конечная дата (ISO string)
- `limit` (опционально, по умолчанию `100`) - ограничение количества результатов

**Пример запроса:**
```
GET /api/macro-data/indicators/interest_rate?startDate=2024-01-01&endDate=2024-12-31
```

**Ответ:**
```json
{
  "success": true,
  "data": {
    "indicatorType": "interest_rate",
    "indicators": [
      {
        "id": 1,
        "indicatorType": "interest_rate",
        "source": "cbr",
        "value": "16.50",
        "period": "2024-12-18T00:00:00.000Z",
        "periodType": "daily",
        "unit": "percent",
        "metadata": {},
        "country": "RUS"
      }
    ],
    "count": 1
  }
}
```

### 4. Получение последних значений

**GET** `/api/macro-data/latest`

Получение последних значений всех индикаторов.

**Query параметры:**
- `country` (опционально, по умолчанию `'RUS'`) - код страны

**Пример запроса:**
```
GET /api/macro-data/latest?country=RUS
```

**Ответ:**
```json
{
  "success": true,
  "data": {
    "country": "RUS",
    "indicators": {
      "inflation": {
        "id": 10,
        "indicatorType": "inflation",
        "value": "5.20",
        "period": "2024-11-01T00:00:00.000Z"
      },
      "interest_rate": {
        "id": 15,
        "indicatorType": "interest_rate",
        "value": "16.50",
        "period": "2024-12-18T00:00:00.000Z"
      }
    },
    "count": 2
  }
}
```

### 5. Получение данных за период

**GET** `/api/macro-data/period`

Получение данных конкретного типа индикатора за период.

**Query параметры (все обязательны):**
- `indicatorType` - тип индикатора
- `startDate` - начальная дата (ISO string)
- `endDate` - конечная дата (ISO string)
- `country` (опционально, по умолчанию `'RUS'`) - код страны

**Пример запроса:**
```
GET /api/macro-data/period?indicatorType=gdp&startDate=2024-01-01&endDate=2024-12-31
```

**Ответ:**
```json
{
  "success": true,
  "data": {
    "indicatorType": "gdp",
    "startDate": "2024-01-01T00:00:00.000Z",
    "endDate": "2024-12-31T00:00:00.000Z",
    "country": "RUS",
    "indicators": [
      {
        "id": 5,
        "indicatorType": "gdp",
        "value": "2.50",
        "period": "2024-12-01T00:00:00.000Z"
      }
    ],
    "count": 1
  }
}
```

### 6. Получение макро-фичей

**GET** `/api/macro-data/features`

Получение нормализованных макро-фичей для конкретной даты (для использования в нейросетях).

**Query параметры:**
- `date` (опционально, по умолчанию текущая дата) - дата (ISO string)
- `country` (опционально, по умолчанию `'RUS'`) - код страны

**Пример запроса:**
```
GET /api/macro-data/features?date=2024-12-18
```

**Ответ:**
```json
{
  "success": true,
  "data": {
    "date": "2024-12-18T00:00:00.000Z",
    "country": "RUS",
    "features": [0.26, 0.1, 0.66, 0.05, 0.25, 0.05, 0.5, 0.5],
    "featureNames": [
      "inflation",
      "inflationChange",
      "interestRate",
      "interestRateChange",
      "gdpGrowth",
      "unemployment",
      "sentimentIndex",
      "volatilityIndex"
    ]
  }
}
```

**Описание фичей:**
- `inflation` - Инфляция (нормализовано 0-1, где 0% = 0, 20% = 1)
- `inflationChange` - Изменение инфляции (нормализовано -1 до 1)
- `interestRate` - Ключевая ставка (нормализовано 0-1, где 0% = 0, 25% = 1)
- `interestRateChange` - Изменение ставки (нормализовано -1 до 1)
- `gdpGrowth` - Рост ВВП (нормализовано -1 до 1, где -10% = -1, +10% = 1)
- `unemployment` - Безработица (нормализовано 0-1, где 0% = 0, 20% = 1)
- `sentimentIndex` - Индекс настроений (0-1)
- `volatilityIndex` - Индекс волатильности (0-1)

### 7. Принудительное обновление данных

**POST** `/api/macro-data/update`

Принудительное обновление макроэкономических данных.

**Body параметры (опционально):**
```json
{
  "sources": {
    "cbr": true,
    "rosstat": true,
    "moex": true
  },
  "startDate": "2024-01-01T00:00:00.000Z",
  "endDate": "2024-12-31T00:00:00.000Z"
}
```

**Пример запроса:**
```bash
curl -X POST http://localhost:3000/api/macro-data/update \
  -H "Content-Type: application/json" \
  -d '{"sources": {"cbr": true, "rosstat": true}}'
```

**Ответ:**
```json
{
  "success": true,
  "message": "Обновление данных завершено",
  "data": {
    "cbr": {
      "fetched": 10,
      "saved": 10,
      "errors": []
    },
    "rosstat": {
      "fetched": 3,
      "saved": 3,
      "errors": []
    },
    "moex": {
      "fetched": 0,
      "saved": 0,
      "errors": []
    },
    "total": {
      "fetched": 13,
      "saved": 13
    }
  }
}
```

### 8. Статистика обновлений

**GET** `/api/macro-data/update-stats`

Получение статистики последних обновлений.

**Ответ:**
```json
{
  "success": true,
  "data": {
    "cbr": {
      "fetched": 150,
      "saved": 150,
      "errors": []
    },
    "rosstat": {
      "fetched": 12,
      "saved": 12,
      "errors": []
    },
    "moex": {
      "fetched": 30,
      "saved": 30,
      "errors": []
    },
    "total": {
      "fetched": 192,
      "saved": 192
    }
  }
}
```

### 9. Очистка кеша

**POST** `/api/macro-data/cache/clear`

Очистка кеша макро-данных.

**Ответ:**
```json
{
  "success": true,
  "message": "Кеш макро-данных очищен"
}
```

## ⚙️ Настройки

Настройки макро-данных хранятся в таблице `settings` и доступны через `SettingsService`.

### Основные настройки

1. **`macro_data_update_interval`** - Расписание обновления (cron формат)
   - По умолчанию: `'0 10 * * *'` (ежедневно в 10:00)
   - Примеры:
     - `'0 8 * * *'` - каждый день в 8:00
     - `'0 */6 * * *'` - каждые 6 часов
     - `'0 */12 * * *'` - каждые 12 часов

2. **`macro_data_cache_ttl_hours`** - TTL кеша (часы)
   - По умолчанию: `1` час
   - Диапазон: 1-24 часа

3. **`macro_data_sources`** - Настройки источников (JSON)
   ```json
   {
     "cbr": true,
     "rosstat": true,
     "moex": true,
     "investing": false,
     "tradingEconomics": false
   }
   ```

4. **`macro_data_cbr_enabled`** - Включить получение данных от ЦБ РФ
   - По умолчанию: `true`

5. **`macro_data_rosstat_enabled`** - Включить получение данных от Росстата
   - По умолчанию: `true`

6. **`macro_data_moex_enabled`** - Включить получение данных от Мосбиржи
   - По умолчанию: `true`

## 🔄 Автоматическое обновление

Макро-данные автоматически обновляются по расписанию через `SchedulerService`. Задача `macroDataUpdateTask` выполняется согласно настройке `macro_data_update_interval`.

### Логирование

При каждом обновлении:
- Выводится статистика в консоль
- Отправляются уведомления в Telegram:
  - При успехе - информационное сообщение
  - При ошибках - предупреждение с деталями
  - При критических ошибках - сообщение об ошибке

## 💻 Использование в коде

### Получение макро-фичей для нейросети

```javascript
import MacroDataService from './services/MacroDataService.js';

// Получить макро-фичи для конкретной даты
const date = new Date('2024-12-18');
const features = await MacroDataService.getMacroFeatures(date, 'RUS');
// Возвращает массив из 8 нормализованных фичей
```

### Получение конкретного индикатора

```javascript
// Получить ключевую ставку на конкретную дату
const indicator = await MacroDataService.getIndicator('interest_rate', date, 'RUS');
if (indicator) {
    console.log(`Ключевая ставка: ${indicator.value}%`);
}
```

### Получение данных за период

```javascript
const startDate = new Date('2024-01-01');
const endDate = new Date('2024-12-31');
const indicators = await MacroDataService.getIndicatorsForPeriod(
    'interest_rate',
    startDate,
    endDate,
    'RUS'
);
```

### Принудительное обновление

```javascript
// Обновить все данные
const stats = await MacroDataService.updateAllData();

// Обновить данные за конкретный период
const stats = await MacroDataService.updateAllData(
    new Date('2024-01-01'),
    new Date('2024-12-31')
);
```

## 🔍 Интеграция с OptimizedDataService

Макро-фичи автоматически добавляются в вектор фичей при создании `createFeatureVector()` в `OptimizedDataService`.

**Размер фичей:** 38 (было 30, добавлено 8 макро-фичей)

**Порядок фичей:**
1. 5 фичей: нормализованные цены
2. 5 фичей: нормализованные объемы
3. 6 фичей: технические индикаторы
4. 2 фичи: временные фичи
5. 3 фичи: рыночные фичи
6. 2 фичи: новостные фичи
7. 2 фичи: Telegram фичи
8. 5 фичей: сигналы аналитиков
9. **8 фичей: макроэкономические фичи** ← новые

## 📈 Примеры использования

### Пример 1: Получение текущей ключевой ставки

```bash
curl http://localhost:3000/api/macro-data/indicators/interest_rate?limit=1
```

### Пример 2: Получение макро-фичей для обучения

```bash
curl http://localhost:3000/api/macro-data/features?date=2024-12-18
```

### Пример 3: Обновление данных за последний месяц

```bash
curl -X POST http://localhost:3000/api/macro-data/update \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2024-11-01T00:00:00.000Z",
    "endDate": "2024-12-01T00:00:00.000Z"
  }'
```

## ⚠️ Обработка ошибок

Все endpoints возвращают стандартный формат ответа:

**Успех:**
```json
{
  "success": true,
  "data": { ... }
}
```

**Ошибка:**
```json
{
  "success": false,
  "message": "Описание ошибки",
  "error": "Детали ошибки"
}
```

## 🔐 Безопасность

- Все endpoints требуют авторизации (если настроена в Express)
- Валидация входных параметров
- Защита от SQL-инъекций через Sequelize ORM
- Ограничение размера запросов через `limit` параметр

## 📝 Примечания

1. **Частота обновления данных:**
   - ЦБ РФ: ежедневно (ключевая ставка)
   - Росстат: ежемесячно/квартально (ВВП, безработица, промышленное производство)
   - Мосбиржа: ежедневно (индекс волатильности)

2. **Кеширование:**
   - Данные кешируются в памяти на время `cacheTtlHours`
   - Кеш автоматически очищается при обновлении данных
   - Можно очистить вручную через API endpoint

3. **Отсутствующие данные:**
   - Если данные отсутствуют на конкретную дату, используются последние доступные данные
   - Если данных нет вообще, возвращаются нулевые значения (для макро-фичей)

4. **Точность данных:**
   - Все значения хранятся с точностью до сотых (`DECIMAL(10, 2)`)
   - Значения автоматически округляются при сохранении

## 🚀 Дальнейшие улучшения

- Добавление дополнительных источников данных
- Расширение списка индикаторов
- Прогнозирование макроиндикаторов с помощью ML
- Визуализация данных в UI
- Экспорт данных в различных форматах

