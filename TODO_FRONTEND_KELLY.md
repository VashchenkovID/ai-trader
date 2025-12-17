# Фронтенд для улучшенной формулы Келли с учетом инструмента

## Анализ текущего состояния

### Текущая реализация (бэкенд)
- **Формула Келли**: Используется общий `winRate` для всех инструментов
- **Местоположение**: `server/src/services/RiskManagementService.js` (метод `calculatePositionSize`)
- **Данные**: Статистика хранится в памяти сервиса (`this.stats`)

### Планируемые изменения (бэкенд)
- Создание модели `InstrumentStats.js` для хранения статистики по каждому инструменту
- Индивидуальный расчет Келли для каждого инструмента с учетом:
  - Win Rate по конкретному инструменту
  - Средняя прибыль/убыток по инструменту
  - Текущая волатильность инструмента

---

## Что нужно добавить на фронтенде

### 1. Новая страница/компонент: "Статистика инструментов" (InstrumentStats)

**Расположение**: `client/src/pages/InstrumentStats.tsx` или `client/src/components/InstrumentStats.tsx`

**Функциональность**:
- Таблица со статистикой по каждому инструменту
- Фильтрация и сортировка
- Экспорт данных

**Отображаемые данные**:
- Ticker/FIGI инструмента
- Win Rate (процент прибыльных сделок)
- Средняя прибыль (в % и RUB)
- Средний убыток (в % и RUB)
- Количество сделок (всего/прибыльных/убыточных)
- Текущая волатильность
- Рассчитанный коэффициент Келли
- Рекомендуемый размер позиции (на основе Келли)
- Дата последнего обновления статистики

**Компоненты**:
```typescript
interface InstrumentStat {
  figi: string;
  ticker: string;
  winRate: number;
  averageWin: number;
  averageLoss: number;
  totalTrades: number;
  profitableTrades: number;
  losingTrades: number;
  volatility: number;
  kellyFraction: number;
  recommendedPositionSize: number;
  lastUpdated: string;
}
```

---

### 2. Расширение страницы "Портфель" (Portfolio.tsx)

**Добавить секцию**: "Статистика по инструментам"

**Функциональность**:
- Карточки с топ-5 инструментов по различным метрикам:
  - Лучший Win Rate
  - Наибольшая средняя прибыль
  - Наименьшая волатильность
  - Самый высокий коэффициент Келли
- График распределения Win Rate по инструментам
- График коэффициентов Келли

**Компонент**: `client/src/components/portfolio/InstrumentStatsCards.tsx`

---

### 3. Расширение страницы "Настройки" (Settings.tsx)

**Добавить вкладку**: "Управление рисками" → "Формула Келли"

**Настройки**:
- Включить/выключить индивидуальный расчет Келли по инструментам
- Коэффициент консервативности (по умолчанию 0.25 - 1/4 от Келли)
- Минимальное количество сделок для расчета статистики по инструменту
- Период для расчета волатильности (7/14/30 дней)
- Автоматическое обновление статистики (включить/выключить)
- Интервал обновления статистики

**Компонент**: `client/src/components/settings/KellySettings.tsx`

---

### 4. Расширение страницы "Торговые заявки" (TradingRequests.tsx)

**Добавить колонки в таблицу**:
- Win Rate инструмента (если доступен)
- Коэффициент Келли для инструмента
- Рекомендуемый размер позиции (на основе Келли)
- Индикатор: использует ли заявка индивидуальный Келли или общий

**Визуализация**:
- Цветовая индикация:
  - 🟢 Зеленый: Win Rate > 60%, Келли > 0.1
  - 🟡 Желтый: Win Rate 40-60%, Келли 0.05-0.1
  - 🔴 Красный: Win Rate < 40%, Келли < 0.05

**Компонент**: Расширить `client/src/components/TradingRequestManager.tsx`

---

### 5. Расширение страницы "Рекомендации" (Recommendations.tsx)

**Добавить информацию в карточку рекомендации**:
- Win Rate по инструменту (если доступен)
- Рекомендуемый размер позиции на основе Келли
- Сравнение: общий Келли vs индивидуальный Келли

**Компонент**: Расширить `client/src/components/recommendations/RecommendationTemplate.tsx`

---

### 6. Новый компонент: "Калькулятор Келли" (KellyCalculator)

**Расположение**: `client/src/components/KellyCalculator.tsx`

**Функциональность**:
- Интерактивный калькулятор для ручного расчета Келли
- Поля ввода:
  - Win Rate (%)
  - Средняя прибыль (%)
  - Средний убыток (%)
- Отображение результатов:
  - Коэффициент Келли
  - Консервативный Келли (1/4)
  - Рекомендуемый размер позиции
  - Визуализация (график/диаграмма)

**Использование**: 
- Добавить в Dashboard как виджет
- Добавить в Settings как инструмент

---

### 7. API Endpoints (нужно добавить на бэкенде)

**Новые эндпоинты для фронтенда**:

```typescript
// Получить статистику по всем инструментам
GET /api/instrument-stats
Query params: ?figi=BBG004730N88&minTrades=10

// Получить статистику по конкретному инструменту
GET /api/instrument-stats/:figi

// Рассчитать Келли для инструмента
POST /api/instrument-stats/calculate-kelly
Body: { figi: string, portfolioValue: number }

// Обновить статистику по инструменту (вручную)
POST /api/instrument-stats/:figi/refresh

// Получить настройки Келли
GET /api/settings/kelly

// Обновить настройки Келли
PUT /api/settings/kelly
Body: { 
  enabled: boolean,
  conservativeFactor: number,
  minTrades: number,
  volatilityPeriod: number
}
```

---

### 8. Расширение Dashboard (Dashboard.tsx)

**Добавить виджеты**:
- Карточка "Топ инструментов по Win Rate"
- Карточка "Средний коэффициент Келли"
- График "Распределение Win Rate по инструментам"
- Алерт: "Инструменты с низким Win Rate требуют внимания"

**Компоненты**:
- `client/src/components/dashboard/InstrumentStatsWidget.tsx`
- `client/src/components/dashboard/KellyMetricsWidget.tsx`

---

### 9. Расширение MetricsMonitoring (MetricsMonitoring.tsx)

**Добавить секцию**: "Метрики формулы Келли"

**Графики**:
- Динамика Win Rate по инструментам (временной ряд)
- Динамика коэффициентов Келли
- Сравнение: общий Келли vs индивидуальный Келли
- Распределение размеров позиций (рекомендуемых vs фактических)

**Компонент**: `client/src/components/metrics/KellyMetrics.tsx`

---

### 10. Типы TypeScript (apiService.ts)

**Добавить интерфейсы**:

```typescript
export interface InstrumentStat {
  figi: string;
  ticker: string;
  winRate: number;
  averageWin: number;
  averageLoss: number;
  totalTrades: number;
  profitableTrades: number;
  losingTrades: number;
  volatility: number;
  kellyFraction: number;
  recommendedPositionSize: number;
  lastUpdated: string;
}

export interface KellySettings {
  enabled: boolean;
  conservativeFactor: number; // 0.25 по умолчанию
  minTrades: number; // Минимум сделок для расчета
  volatilityPeriod: number; // Период для расчета волатильности (дни)
  autoUpdate: boolean;
  updateInterval: number; // Интервал обновления (минуты)
}

export interface KellyCalculation {
  figi: string;
  ticker: string;
  winRate: number;
  averageWin: number;
  averageLoss: number;
  kellyFraction: number;
  conservativeKelly: number;
  recommendedPositionSize: number;
  portfolioValue: number;
}
```

---

## Приоритет реализации

### Высокий приоритет:
1. ✅ API Endpoints для получения статистики
2. ✅ Расширение TradingRequests (отображение Win Rate и Келли)
3. ✅ Расширение Settings (настройки Келли)
4. ✅ Типы TypeScript

### Средний приоритет:
5. ✅ Страница InstrumentStats (полная статистика)
6. ✅ Расширение Portfolio (карточки статистики)
7. ✅ Расширение Recommendations (информация о Келли)

### Низкий приоритет:
8. ✅ Калькулятор Келли (интерактивный инструмент)
9. ✅ Расширение Dashboard (виджеты)
10. ✅ Расширение MetricsMonitoring (графики)

---

## Примеры UI компонентов

### Карточка статистики инструмента:
```tsx
<Card>
  <div className="flex justify-content-between align-items-center">
    <div>
      <h3>{ticker}</h3>
      <p className="text-600">{figi}</p>
    </div>
    <Tag 
      value={`${(winRate * 100).toFixed(1)}%`}
      severity={winRate > 0.6 ? 'success' : winRate > 0.4 ? 'warning' : 'danger'}
    />
  </div>
  <Divider />
  <div className="grid">
    <div className="col-6">
      <small className="text-600">Сделок</small>
      <p className="text-xl font-bold">{totalTrades}</p>
    </div>
    <div className="col-6">
      <small className="text-600">Келли</small>
      <p className="text-xl font-bold">{kellyFraction.toFixed(3)}</p>
    </div>
  </div>
</Card>
```

### Таблица статистики:
```tsx
<DataTable value={instrumentStats} paginator rows={20}>
  <Column field="ticker" header="Тикер" sortable />
  <Column 
    field="winRate" 
    header="Win Rate" 
    sortable
    body={(row) => `${(row.winRate * 100).toFixed(1)}%`}
  />
  <Column field="kellyFraction" header="Келли" sortable />
  <Column field="totalTrades" header="Сделок" sortable />
  <Column field="lastUpdated" header="Обновлено" sortable />
</DataTable>
```

---

## Зависимости

### От бэкенда требуется:
- ✅ Модель `InstrumentStats.js`
- ✅ Методы расчета индивидуального Келли в `RiskManagementService.js`
- ✅ API endpoints для получения статистики
- ✅ API endpoints для настроек Келли
- ✅ Автоматическое обновление статистики (cron job)

### От фронтенда требуется:
- ✅ Использование существующих компонентов PrimeReact
- ✅ Интеграция с WebSocket для обновления статистики в реальном времени
- ✅ Кеширование данных для производительности

---

## Дополнительные улучшения (опционально)

1. **Экспорт статистики**: CSV/Excel экспорт данных по инструментам
2. **Фильтры и поиск**: Расширенный поиск по инструментам
3. **Сравнение инструментов**: Возможность сравнить несколько инструментов
4. **Исторические данные**: График изменения Win Rate и Келли во времени
5. **Уведомления**: Алерты при изменении Win Rate или Келли
6. **Интеграция с TradingRequests**: Автоматическое применение индивидуального Келли при создании заявки

