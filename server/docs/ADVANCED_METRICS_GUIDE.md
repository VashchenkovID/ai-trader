# Руководство по продвинутым метрикам производительности

## 📋 Обзор

Система продвинутых метрик производительности предоставляет расширенный анализ эффективности торговых стратегий и портфеля. Включает метрики риска, анализ по периодам и визуализацию данных.

## 🎯 Доступные метрики

### 1. Sortino Ratio
**Описание:** Модификация коэффициента Шарпа, которая учитывает только негативную волатильность (риск снижения).

**Формула:** `(Средняя доходность - Безрисковая ставка) / Отклонение отрицательных доходностей`

**Интерпретация:**
- > 2.0 - Отличная производительность
- 1.0 - 2.0 - Хорошая производительность
- 0.5 - 1.0 - Удовлетворительная производительность
- < 0.5 - Низкая производительность

**API Endpoint:** `GET /api/advanced-metrics/sortino-ratio`

**Пример запроса:**
```bash
curl "http://localhost:3001/api/advanced-metrics/sortino-ratio?period=daily&days=30"
```

### 2. Calmar Ratio
**Описание:** Отношение среднегодовой доходности к максимальной просадке.

**Формула:** `CAGR / Max Drawdown`

**Интерпретация:**
- > 3.0 - Отличная производительность
- 1.0 - 3.0 - Хорошая производительность
- 0.5 - 1.0 - Удовлетворительная производительность
- < 0.5 - Низкая производительность

**API Endpoint:** `GET /api/advanced-metrics/calmar-ratio`

**Пример запроса:**
```bash
curl "http://localhost:3001/api/advanced-metrics/calmar-ratio?period=daily&days=30"
```

### 3. Information Ratio
**Описание:** Измеряет активную доходность портфеля относительно бенчмарка на единицу активного риска.

**Формула:** `(Доходность портфеля - Доходность бенчмарка) / Tracking Error`

**Примечание:** Требует данные бенчмарка (пока не реализовано полностью).

**API Endpoint:** `GET /api/advanced-metrics/information-ratio`

**Пример запроса:**
```bash
curl "http://localhost:3001/api/advanced-metrics/information-ratio?period=daily&days=30"
```

### 4. MAE (Maximum Adverse Excursion)
**Описание:** Максимальное неблагоприятное отклонение цены от точки входа до момента закрытия.

**Использование:** Помогает оценить худший сценарий для позиции и оптимизировать точки входа/выхода.

**API Endpoint:** `GET /api/advanced-metrics/mae-mfe`

**Пример запроса:**
```bash
curl "http://localhost:3001/api/advanced-metrics/mae-mfe?limit=100"
```

### 5. MFE (Maximum Favorable Excursion)
**Описание:** Максимальное благоприятное отклонение цены от точки входа до момента закрытия.

**Использование:** Помогает оценить потенциал прибыли и определить оптимальные точки выхода.

**API Endpoint:** `GET /api/advanced-metrics/mae-mfe`

## 📊 Анализ по периодам

### Анализ по дням недели
Показывает статистику прибыльности по каждому дню недели:
- Общая прибыль
- Количество сделок
- Win Rate
- Средняя прибыль на сделку

**API Endpoint:** `GET /api/advanced-metrics/period-analysis?period=daily`

### Анализ по месяцам
Показывает статистику прибыльности по каждому месяцу:
- Общая прибыль
- Количество сделок
- Win Rate
- Средняя прибыль на сделку

**API Endpoint:** `GET /api/advanced-metrics/period-analysis?period=monthly`

## 🔌 API Endpoints

### Получение всех метрик
```http
GET /api/advanced-metrics?period=daily&days=30
```

**Query параметры:**
- `period` (optional): `daily` | `weekly` | `monthly` (по умолчанию: `daily`)
- `days` (optional): количество дней для анализа (по умолчанию: 30, диапазон: 1-365)

**Ответ:**
```json
{
  "success": true,
  "data": {
    "period": "daily",
    "days": 30,
    "startDate": "2024-01-01T00:00:00.000Z",
    "endDate": "2024-01-31T23:59:59.999Z",
    "baseMetrics": {
      "totalReturn": 15.5,
      "winRate": 65.0,
      "sharpeRatio": 1.2,
      "maxDrawdown": 5.0,
      "averageDailyProfit": 0.5
    },
    "advancedMetrics": {
      "sortinoRatio": 1.8,
      "calmarRatio": 3.1,
      "informationRatio": null,
      "mae": 2.5,
      "mfe": 4.2,
      "maeMfeAvailable": true
    },
    "stats": [...],
    "trends": {...},
    "alerts": [...]
  }
}
```

### Получение Sortino Ratio
```http
GET /api/advanced-metrics/sortino-ratio?period=daily&days=30&riskFreeRate=8
```

**Query параметры:**
- `period` (optional): `daily` | `weekly` | `monthly`
- `days` (optional): количество дней (по умолчанию: 30)
- `riskFreeRate` (optional): безрисковая ставка в процентах

### Получение Calmar Ratio
```http
GET /api/advanced-metrics/calmar-ratio?period=daily&days=30
```

### Получение Information Ratio
```http
GET /api/advanced-metrics/information-ratio?period=daily&days=30
```

### Получение MAE/MFE
```http
GET /api/advanced-metrics/mae-mfe?limit=100
```

**Query параметры:**
- `limit` (optional): ограничение количества сделок для анализа (по умолчанию: 100, диапазон: 1-1000)

### Получение анализа по периодам
```http
GET /api/advanced-metrics/period-analysis?period=daily&startDate=2024-01-01&endDate=2024-01-31
```

**Query параметры:**
- `period` (optional): `daily` | `weekly` | `monthly`
- `startDate` (optional): начальная дата (ISO string)
- `endDate` (optional): конечная дата (ISO string)

### Получение сводки всех метрик
```http
GET /api/advanced-metrics/summary?period=daily&days=30
```

## 🖥️ Использование в UI

### Доступ к компоненту
Компонент доступен по адресу: `/advanced-metrics`

### Функциональность
1. **Обзор метрик:** Отображение базовых и продвинутых метрик в виде карточек
2. **Графики:** Визуализация коэффициентов и метрик
3. **MAE/MFE:** Отдельная вкладка с анализом максимальных отклонений
4. **Анализ по периодам:**
   - Графики по дням недели и месяцам
   - Таблицы с детальной статистикой
   - Лучшие и худшие периоды

### Фильтры
- **Период:** День, Неделя, Месяц
- **Количество дней:** 7, 30, 90, 180, 365
- **Диапазон дат:** Начальная и конечная дата

### Экспорт данных
Кнопка "Экспорт" позволяет сохранить все данные в JSON формате.

## ⚙️ Настройки

### Безрисковая ставка
Настраивается через `Settings`:
- Ключ: `profit_risk_free_rate`
- Значение по умолчанию: 8% (годовых)
- Тип: `number`

### Интервал обновления
Метрики рассчитываются на основе данных из `ProfitabilityTracker`, который обновляется автоматически при торговых операциях.

## 📝 Примеры использования

### Пример 1: Получение Sortino Ratio за последние 30 дней
```javascript
const response = await fetch('/api/advanced-metrics/sortino-ratio?period=daily&days=30');
const data = await response.json();
console.log('Sortino Ratio:', data.data.sortinoRatio);
```

### Пример 2: Анализ производительности по дням недели
```javascript
const response = await fetch('/api/advanced-metrics/period-analysis?period=daily');
const data = await response.json();
console.log('Лучший день:', data.data.bestDay);
console.log('Худший день:', data.data.worstDay);
```

### Пример 3: Получение полной сводки
```javascript
const response = await fetch('/api/advanced-metrics/summary?period=daily&days=30');
const data = await response.json();
console.log('Базовые метрики:', data.data.baseMetrics);
console.log('Продвинутые метрики:', data.data.advancedMetrics);
console.log('Анализ по периодам:', data.data.periodAnalysis);
```

## 🔍 Интерпретация результатов

### Sortino Ratio vs Sharpe Ratio
- **Sortino Ratio** фокусируется только на негативной волатильности, что делает его более подходящим для оценки риска снижения
- **Sharpe Ratio** учитывает всю волатильность, включая положительные отклонения

### Calmar Ratio
- Показывает, сколько доходности генерируется на единицу максимального риска
- Высокий Calmar Ratio указывает на эффективное управление рисками

### MAE/MFE
- **MAE** помогает определить оптимальные стоп-лоссы
- **MFE** помогает определить оптимальные тейк-профиты
- Соотношение MFE/MAE показывает эффективность управления позициями

### Анализ по периодам
- Выявление лучших/худших дней недели помогает оптимизировать торговую стратегию
- Анализ по месяцам выявляет сезонные паттерны

## ⚠️ Ограничения

1. **Information Ratio:** Требует данные бенчмарка (пока не реализовано полностью)
2. **MAE/MFE:** Требует детальные данные о свечах для каждой сделки (используется упрощенный расчет, если свечи недоступны)
3. **Минимальные данные:** Для корректного расчета метрик требуется минимум 20-30 дней данных

## 🚀 Дальнейшие улучшения

1. Добавление поддержки бенчмарков для Information Ratio
2. Интеграция с внешними источниками данных для получения свечей для MAE/MFE
3. Добавление исторических графиков метрик
4. Сравнение метрик разных стратегий
5. Экспорт в CSV/Excel форматы

