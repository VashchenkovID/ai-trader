# 📊 Руководство по синхронизации компаний

## Обзор

Система синхронизации компаний автоматически получает список российских акций от Тинькофф API и сохраняет их в базу данных для использования в новостном анализе и других сервисах.

## 🏗️ Архитектура

### Компоненты

1. **Company Model** (`models/Company.js`) - Модель данных для хранения информации о компаниях
2. **CompanySyncService** (`services/CompanySyncService.js`) - Сервис синхронизации с Тинькофф API
3. **NewsAnalysisService** (обновлен) - Интеграция с базой компаний для поиска новостей
4. **API Routes** (`routes/companies.js`) - REST API для управления компаниями

### Поля модели Company

```javascript
{
    figi: String,           // Уникальный идентификатор инструмента
    ticker: String,         // Тикер акции
    name: String,           // Название компании
    fullName: String,       // Полное название
    sector: String,         // Сектор экономики
    industry: String,       // Отрасль
    currency: String,       // Валюта
    country: String,        // Страна
    exchange: String,       // Биржа
    marketCap: BigInt,      // Рыночная капитализация
    isActive: Boolean,      // Активна ли для торгов
    newsKeywords: Array,    // Ключевые слова для поиска новостей
    aliases: Array,         // Альтернативные названия
    lastNewsUpdate: Date,   // Последнее обновление новостей
    apiData: JSON,          // Полные данные от API
    lastUpdated: Date       // Время последнего обновления
}
```

## 🔄 Процесс синхронизации

### 1. Получение данных от Тинькофф

```javascript
// Получаем все инструменты
const instruments = await TinkoffApiService.getAllInstruments();

// Фильтруем только российские акции
const stocks = instruments.filter(instrument => 
    instrument.instrumentType === 'share' && 
    instrument.currency === 'RUB' &&
    instrument.apiTradeAvailableFlag
);
```

### 2. Обработка и сохранение

```javascript
// Преобразуем данные инструмента в данные компании
const companyData = this.transformInstrumentToCompany(stock);

// Создаем или обновляем запись
const existingCompany = await Company.findOne({
    where: { figi: stock.figi }
});

if (existingCompany) {
    await existingCompany.update(companyData);
} else {
    await Company.create(companyData);
}
```

### 3. Генерация ключевых слов

```javascript
// Автоматическая генерация ключевых слов для поиска новостей
const newsKeywords = [
    ticker,                    // Тикер
    name,                      // Название
    ...nameWords,             // Слова из названия
    sector                     // Сектор
];
```

## 📰 Интеграция с новостным анализом

### Улучшенный поиск новостей

```javascript
// Получаем данные компании с ключевыми словами
const companyData = await this.getCompanyForNewsSearch(figi);

// Формируем расширенный поисковый запрос
const searchQuery = `"${companyData.name}" OR ${companyData.ticker} OR ${companyData.keywords.join(' OR ')}`;

// Ищем новости через NewsAPI
const news = await this.newsapi.v2.everything({
    q: searchQuery,
    language: 'ru',
    sortBy: 'publishedAt'
});
```

### Расчет релевантности

```javascript
// Улучшенный алгоритм релевантности
let relevance = 0;

// Название компании: +0.4
if (text.includes(companyData.name.toLowerCase())) {
    relevance += 0.4;
}

// Тикер: +0.3
if (text.includes(companyData.ticker.toLowerCase())) {
    relevance += 0.3;
}

// Ключевые слова: +0.1 каждое
companyData.keywords.forEach(keyword => {
    if (text.includes(keyword.toLowerCase())) {
        relevance += 0.1;
    }
});

// Альтернативные названия: +0.2
companyData.aliases.forEach(alias => {
    if (text.includes(alias.toLowerCase())) {
        relevance += 0.2;
    }
});
```

## 🚀 API Endpoints

### Синхронизация

```http
POST /api/companies/sync
```

Запускает синхронизацию всех компаний с Тинькофф API.

**Ответ:**
```json
{
    "success": true,
    "message": "Синхронизация компаний завершена",
    "data": {
        "created": 150,
        "updated": 25,
        "errors": 2,
        "total": 175,
        "lastSyncTime": "2024-01-15T10:30:00.000Z"
    }
}
```

### Получение компаний

```http
GET /api/companies?search=Сбербанк&sector=Финансы&limit=20&offset=0
```

**Параметры:**
- `search` - Поиск по названию или тикеру
- `sector` - Фильтр по сектору
- `limit` - Количество записей (по умолчанию 50)
- `offset` - Смещение (по умолчанию 0)

### Получение новостей для компании

```http
GET /api/companies/{figi}/news?limit=20&from=2024-01-01&to=2024-01-15
```

**Параметры:**
- `limit` - Количество новостей (по умолчанию 20)
- `from` - Дата начала (YYYY-MM-DD)
- `to` - Дата окончания (YYYY-MM-DD)

### Анализ новостей

```http
POST /api/companies/{figi}/news/analyze
```

**Тело запроса:**
```json
{
    "limit": 20,
    "from": "2024-01-01",
    "to": "2024-01-15"
}
```

**Ответ:**
```json
{
    "success": true,
    "data": {
        "figi": "BBG004730N88",
        "companyName": "Сбербанк",
        "newsCount": 15,
        "sentiment": {
            "overall": 0.65,
            "confidence": 0.8,
            "positive": 0.7,
            "negative": 0.3
        },
        "keywords": ["прибыль", "рост", "дивиденды"],
        "priceImpact": {
            "score": 0.75,
            "level": "Высокое"
        }
    }
}
```

### Статистика

```http
GET /api/companies/stats/overview
```

**Ответ:**
```json
{
    "success": true,
    "data": {
        "total": 200,
        "active": 185,
        "inactive": 15,
        "bySector": [
            { "sector": "Финансы", "count": 45 },
            { "sector": "Энергетика", "count": 35 },
            { "sector": "Технологии", "count": 25 }
        ],
        "lastSyncTime": "2024-01-15T10:30:00.000Z"
    }
}
```

## ⚙️ Конфигурация

### Автоматическая синхронизация

```javascript
// Запуск автоматической синхронизации (каждые 24 часа)
CompanySyncService.startAutoSync();

// Остановка
CompanySyncService.stopAutoSync();
```

### Настройка интервала

```javascript
// Изменение интервала синхронизации (в миллисекундах)
CompanySyncService.syncInterval = 12 * 60 * 60 * 1000; // 12 часов
```

## 🔧 Использование в коде

### Получение компании по FIGI

```javascript
import CompanySyncService from './services/CompanySyncService.js';

const company = await CompanySyncService.getCompanyByFigi('BBG004730N88');
console.log(company.name); // "Сбербанк"
```

### Поиск компаний

```javascript
// Поиск по названию
const companies = await CompanySyncService.searchCompanies('Сбербанк');

// Получение по сектору
const financeCompanies = await CompanySyncService.getCompaniesBySector('Финансы');
```

### Получение новостей

```javascript
import NewsAnalysisService from './services/NewsAnalysisService.js';

// Простое получение новостей
const news = await NewsAnalysisService.fetchNews('BBG004730N88', {
    limit: 10,
    from: '2024-01-01',
    to: '2024-01-15'
});

// Полный анализ новостей
const analysis = await NewsAnalysisService.analyzeNews('BBG004730N88', {
    limit: 20
});
```

## 🧪 Тестирование

### Запуск тестов

```bash
node server/src/test-company-sync.js
```

### Тестовые сценарии

1. **Синхронизация компаний** - Получение и сохранение данных от Тинькофф
2. **Поиск компаний** - Тестирование поиска по названию и сектору
3. **Получение новостей** - Тестирование интеграции с NewsAPI
4. **Статистика** - Проверка корректности статистических данных

## 📈 Мониторинг

### Логи синхронизации

```
🔄 Начинаем синхронизацию компаний с Тинькофф API...
📊 Получено 500 инструментов от Тинькофф
📈 Найдено 200 российских акций
✅ Синхронизация завершена: создано 150, обновлено 25, ошибок 2
```

### Метрики производительности

- Время синхронизации
- Количество обработанных компаний
- Количество ошибок
- Размер базы данных

## 🚨 Обработка ошибок

### Типичные ошибки

1. **Ошибки API Тинькофф** - Fallback к кешированным данным
2. **Ошибки NewsAPI** - Использование моковых данных
3. **Ошибки базы данных** - Логирование и повторные попытки

### Стратегии восстановления

```javascript
try {
    const result = await CompanySyncService.syncAllCompanies();
} catch (error) {
    console.error('Ошибка синхронизации:', error);
    // Логирование, уведомления, fallback стратегии
}
```

## 🔮 Планы развития

### Краткосрочные улучшения

1. **Кеширование** - Кеширование часто запрашиваемых компаний
2. **Индексы** - Оптимизация индексов базы данных
3. **Валидация** - Проверка корректности данных

### Долгосрочные планы

1. **Многоязычность** - Поддержка компаний других стран
2. **Исторические данные** - Отслеживание изменений компаний
3. **ML интеграция** - Использование ML для улучшения ключевых слов

## 📚 Связанные документы

- [NewsAPI Integration Guide](./NEWS_API_INTEGRATION.md)
- [Advanced AI Architecture](./ADVANCED_AI_ARCHITECTURE.md)
- [Performance Monitoring Guide](./PERFORMANCE_MONITORING_GUIDE.md)
