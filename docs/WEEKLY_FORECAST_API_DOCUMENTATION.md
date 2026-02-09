# API Документация: Weekly Forecast

## Базовый URL

```
/api/weekly-forecast
```

## Endpoints

### 1. Получение активного прогноза

**GET** `/api/weekly-forecast/:figi`

Получает активный (не завершенный) прогноз для указанного инструмента.

#### Параметры пути

- `figi` (string, required) - FIGI инструмента

#### Query параметры

- `includeCompleted` (boolean, optional) - Включить завершенные прогнозы (по умолчанию: `false`)

#### Пример запроса

```bash
GET /api/weekly-forecast/BBG0013HJJ31?includeCompleted=false
```

#### Пример ответа

```json
{
  "success": true,
  "data": {
    "id": 1,
    "figi": "BBG0013HJJ31",
    "ticker": "SBER",
    "forecastDate": "2024-12-19T10:00:00.000Z",
    "startDate": "2024-12-19T00:00:00.000Z",
    "endDate": "2024-12-26T00:00:00.000Z",
    "forecastData": [
      {
        "date": "2024-12-19",
        "open": 100.5,
        "high": 102.3,
        "low": 99.8,
        "close": 101.2,
        "volume": 1000000,
        "confidence": 0.85
      }
      // ... еще 6 дней
    ],
    "modelVersion": "1734609600000_v1",
    "modelType": "seq2seq",
    "confidenceScore": 0.82,
    "predictedVolatility": 2.5,
    "predictedTrend": "BULLISH",
    "predictedPriceChange": 3.2,
    "isCompleted": false
  }
}
```

#### Коды ошибок

- `404` - Прогноз не найден
- `500` - Внутренняя ошибка сервера

---

### 2. История прогнозов

**GET** `/api/weekly-forecast/:figi/history`

Получает историю прогнозов для указанного инструмента.

#### Параметры пути

- `figi` (string, required) - FIGI инструмента

#### Query параметры

- `limit` (number, optional) - Максимальное количество прогнозов (по умолчанию: `10`)
- `includeCompleted` (boolean, optional) - Включить завершенные прогнозы (по умолчанию: `true`)

#### Пример запроса

```bash
GET /api/weekly-forecast/BBG0013HJJ31/history?limit=20&includeCompleted=true
```

#### Пример ответа

```json
{
  "success": true,
  "data": {
    "forecasts": [
      {
        "id": 1,
        "figi": "BBG0013HJJ31",
        "forecastDate": "2024-12-19T10:00:00.000Z",
        // ... остальные поля
      }
    ],
    "count": 1
  }
}
```

---

### 3. Генерация прогноза

**POST** `/api/weekly-forecast/:figi/generate`

Генерирует новый прогноз для указанного инструмента.

#### Параметры пути

- `figi` (string, required) - FIGI инструмента

#### Body параметры

```json
{
  "forceRegenerate": false  // Принудительная регенерация, даже если есть свежий прогноз
}
```

#### Пример запроса

```bash
POST /api/weekly-forecast/BBG0013HJJ31/generate
Content-Type: application/json

{
  "forceRegenerate": false
}
```

#### Пример ответа

```json
{
  "success": true,
  "data": {
    "forecast": {
      "id": 1,
      // ... полная структура прогноза
    },
    "cached": false
  }
}
```

#### Коды ошибок

- `400` - Ошибка генерации прогноза
- `500` - Внутренняя ошибка сервера

---

### 4. Метрики точности

**GET** `/api/weekly-forecast/:figi/metrics`

Получает метрики точности для завершенных прогнозов.

#### Параметры пути

- `figi` (string, required) - FIGI инструмента

#### Query параметры

- `limit` (number, optional) - Максимальное количество прогнозов для анализа (по умолчанию: `10`)

#### Пример запроса

```bash
GET /api/weekly-forecast/BBG0013HJJ31/metrics?limit=10
```

#### Пример ответа

```json
{
  "success": true,
  "data": {
    "totalForecasts": 5,
    "averageMetrics": {
      "mae": 2.3456,
      "mse": 5.7890,
      "rmse": 2.4062,
      "mape": 2.15,
      "directionAccuracy": 0.75,
      "sampleSize": 35
    },
    "recentMetrics": {
      "mae": 2.1234,
      "mse": 4.5678,
      "rmse": 2.1372,
      "mape": 1.95,
      "directionAccuracy": 0.80,
      "priceError": 14.86,
      "volumeError": 125000,
      "sampleSize": 7
    },
    "allMetrics": [
      {
        "forecastId": 1,
        "forecastDate": "2024-12-12T10:00:00.000Z",
        "completionDate": "2024-12-19T10:00:00.000Z",
        "metrics": {
          "mae": 2.1234,
          "mse": 4.5678,
          "rmse": 2.1372,
          "mape": 1.95,
          "directionAccuracy": 0.80,
          "sampleSize": 7
        }
      }
    ]
  }
}
```

---

### 5. Обновление прогноза реальными данными

**POST** `/api/weekly-forecast/:figi/update`

Обновляет прогноз реальными данными и вычисляет метрики точности.

#### Параметры пути

- `figi` (string, required) - FIGI инструмента

#### Body параметры

```json
{
  "forecastId": 1  // ID конкретного прогноза (опционально, если не указан - обновляется активный)
}
```

#### Пример запроса

```bash
POST /api/weekly-forecast/BBG0013HJJ31/update
Content-Type: application/json

{
  "forecastId": 1
}
```

#### Пример ответа

```json
{
  "success": true,
  "data": {
    "forecast": {
      "id": 1,
      "actualData": [
        {
          "date": "2024-12-19",
          "open": 100.3,
          "high": 102.1,
          "low": 99.9,
          "close": 101.0,
          "volume": 950000
        }
      ],
      "accuracyMetrics": {
        "mae": 2.1234,
        "mse": 4.5678,
        "rmse": 2.1372,
        "mape": 1.95,
        "directionAccuracy": 0.80,
        "sampleSize": 7
      }
    },
    "metrics": {
      "mae": 2.1234,
      "mse": 4.5678,
      "rmse": 2.1372,
      "mape": 1.95,
      "directionAccuracy": 0.80,
      "sampleSize": 7
    },
    "matchedDays": 7
  }
}
```

#### Коды ошибок

- `400` - Ошибка обновления (нет реальных данных и т.д.)
- `500` - Внутренняя ошибка сервера

---

### 6. Получение конкретного прогноза по ID

**GET** `/api/weekly-forecast/:figi/:forecastId`

Получает конкретный прогноз по его ID.

#### Параметры пути

- `figi` (string, required) - FIGI инструмента
- `forecastId` (number, required) - ID прогноза

#### Пример запроса

```bash
GET /api/weekly-forecast/BBG0013HJJ31/1
```

#### Пример ответа

```json
{
  "success": true,
  "data": {
    "id": 1,
    // ... полная структура прогноза
  }
}
```

#### Коды ошибок

- `404` - Прогноз не найден
- `500` - Внутренняя ошибка сервера

---

### 7. Метрики производительности

**GET** `/api/weekly-forecast/performance/metrics`

Получает метрики производительности сервиса прогнозов.

#### Пример запроса

```bash
GET /api/weekly-forecast/performance/metrics
```

#### Пример ответа

```json
{
  "success": true,
  "data": {
    "generateForecast": {
      "count": 150,
      "totalTime": 450000,
      "averageTime": 3000,
      "minTime": 1200,
      "maxTime": 8500,
      "errors": 2
    },
    "updateWithActualData": {
      "count": 50,
      "totalTime": 35000,
      "averageTime": 700,
      "minTime": 200,
      "maxTime": 1500,
      "errors": 0
    },
    "adaptModel": {
      "count": 10,
      "totalTime": 120000,
      "averageTime": 12000,
      "minTime": 8000,
      "maxTime": 20000,
      "errors": 1
    },
    "cacheStats": {
      "modelCacheSize": 5,
      "featuresCacheSize": 25,
      "modelCacheTTL": 3600000,
      "featuresCacheTTL": 300000
    }
  }
}
```

---

## Структуры данных

### WeeklyForecast

```typescript
interface WeeklyForecast {
  id: number;
  figi: string;
  ticker: string;
  forecastDate: string; // ISO 8601
  startDate: string; // ISO 8601
  endDate: string; // ISO 8601
  forecastData: WeeklyForecastCandle[];
  modelVersion: string;
  modelType: string;
  confidenceScore: number; // 0-1
  predictedVolatility?: number;
  predictedTrend?: 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
  predictedPriceChange?: number; // процент
  actualData?: WeeklyForecastCandle[];
  accuracyMetrics?: AccuracyMetrics;
  isCompleted: boolean;
  completionDate?: string; // ISO 8601
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}
```

### WeeklyForecastCandle

```typescript
interface WeeklyForecastCandle {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  confidence?: number; // 0-1
}
```

### AccuracyMetrics

```typescript
interface AccuracyMetrics {
  mae: number; // Mean Absolute Error
  mse: number; // Mean Squared Error
  rmse: number; // Root Mean Squared Error
  mape: number; // Mean Absolute Percentage Error
  directionAccuracy: number; // 0-1
  priceError: number;
  volumeError: number;
  sampleSize: number;
}
```

## Обработка ошибок

Все endpoints возвращают единый формат ошибки:

```json
{
  "success": false,
  "error": "Описание ошибки"
}
```

## Коды HTTP статусов

- `200` - Успешный запрос
- `400` - Ошибка валидации или бизнес-логики
- `404` - Ресурс не найден
- `500` - Внутренняя ошибка сервера

## Ограничения

- Максимальное количество прогнозов в истории: 100
- TTL кэша моделей: 1 час
- TTL кэша features: 5 минут
- Максимальный размер кэша моделей: 50
- Максимальный размер кэша features: 100

## Примеры использования

### JavaScript/TypeScript

```typescript
import { weeklyForecastApi } from './services/weeklyForecastApi';

// Получить активный прогноз
const forecast = await weeklyForecastApi.getForecast('BBG0013HJJ31');

// Сгенерировать новый прогноз
const result = await weeklyForecastApi.generateForecast('BBG0013HJJ31', true);

// Получить метрики
const metrics = await weeklyForecastApi.getMetrics('BBG0013HJJ31');

// Обновить прогноз реальными данными
const updateResult = await weeklyForecastApi.updateForecast('BBG0013HJJ31');
```

### cURL

```bash
# Получить прогноз
curl -X GET "http://localhost:3000/api/weekly-forecast/BBG0013HJJ31"

# Сгенерировать прогноз
curl -X POST "http://localhost:3000/api/weekly-forecast/BBG0013HJJ31/generate" \
  -H "Content-Type: application/json" \
  -d '{"forceRegenerate": false}'

# Получить метрики
curl -X GET "http://localhost:3000/api/weekly-forecast/BBG0013HJJ31/metrics"
```

## Версионирование

Текущая версия API: `v1`

Все endpoints находятся под `/api/weekly-forecast/*` и не требуют указания версии в URL.

