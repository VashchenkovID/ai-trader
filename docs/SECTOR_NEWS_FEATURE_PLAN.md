# План реализации: Привязка финансовых и политических новостей к акциям

## Обзор

Реализация системы получения финансовых и политических новостей из RSS-фидов и автоматической привязки их к акциям с использованием существующей структуры CachedNews и анализа sentiment.

**ВАЖНО**: Используем только RSS-фиды как источник новостей. Новости сохраняются в существующую модель CachedNews с привязкой по FIGI.

## Цели

1. **Получение финансовых новостей**: Парсинг финансовых новостей из RSS-фидов
2. **Получение политических новостей**: Парсинг политических новостей из RSS-фидов
3. **Привязка к акциям**: 
   - Политические новости - привязать ко всем российским акциям
   - Финансовые новости - привязать к акциям по релевантности (название компании, тикер, сектор)
4. **Анализ sentiment**: Использование существующего NewsAnalysisService для анализа тональности
5. **Совместимость структуры**: Использование существующей модели CachedNews без изменений
6. **Кеширование**: Эффективное хранение и использование новостей

## Выбранные источники новостей

### RSS-фиды российских новостных источников

**Преимущества**:
- Полностью бесплатно
- Неограниченное количество запросов
- Прямой доступ к источникам
- Актуальные новости в реальном времени
- Стандартизированный формат (RSS/XML)
- Простая интеграция

**Источники RSS для финансовых новостей**:
- **РБК Финансы**: https://www.rbc.ru/rss/finance.xml
- **РИА Экономика**: https://ria.ru/export/rss2/economy/index.xml
- **РБК Технологии**: https://www.rbc.ru/rss/technology.xml
- **РБК Общие**: https://www.rbc.ru/rss/free.xml
- **Ведомости**: https://www.vedomosti.ru/rss/news
- **Коммерсант**: https://www.kommersant.ru/RSS/news.xml

**Источники RSS для политических новостей**:
- **РИА Политика**: https://ria.ru/export/rss2/politics/index.xml
- **ТАСС**: https://tass.ru/rss/v2.xml
- **Интерфакс**: https://www.interfax.ru/rss.asp
- **РБК Общие**: https://www.rbc.ru/rss/free.xml (содержит политику)
- **Lenta.ru**: https://lenta.ru/rss
- **Meduza**: https://meduza.io/rss/all

**Ограничения**:
- Зависимость от доступности RSS фидов
- Необходимость обработки ошибок парсинга
- Rate limiting для избежания перегрузки серверов (рекомендуется 1 запрос/5 секунд на источник)

**Технические детали**:
- Использовать библиотеку `rss-parser` или `fast-xml-parser` для парсинга RSS/XML
- Кеширование результатов парсинга
- Retry механизм при ошибках
- Параллельные запросы к разным источникам допустимы

## Текущее состояние

### Существующая инфраструктура

1. **Модель CachedNews** (`server/src/models/CachedNews.js`)
   - ✅ Поля: id, figi, title, description, url, source, publishedAt, sentiment, relevance, impact, keywords, language, category
   - ✅ Индексы по figi, publishedAt, language
   - ✅ Sentiment: FLOAT от -1 до 1
   - ✅ Relevance: FLOAT от 0 до 1
   - ✅ Impact: FLOAT от 0 до 1

2. **NewsAnalysisService** (`server/src/services/NewsAnalysisService.js`)
   - ✅ Метод `analyzeSentiment(text)` - анализ тональности с использованием BERT модели
   - ✅ Возвращает значение от -1 до 1
   - ✅ Fallback механизм при ошибках модели
   - ✅ Метод `getCachedNews(figi, days, limit)` - получение новостей по FIGI

3. **SectorClassifier** (`server/src/utils/sectorClassifier.js`)
   - ✅ Классификация инструментов по секторам
   - ✅ Методы: `classifySector()`, `groupBySector()`, `getAvailableSectors()`

4. **CacheService** / **TinkoffApiService**
   - ✅ Получение списка всех инструментов
   - ✅ Получение информации об инструменте по FIGI (название, тикер, сектор)

## Архитектура решения

### 1. База данных

**НЕ ТРЕБУЕТСЯ ИЗМЕНЕНИЙ** - используем существующую модель CachedNews без модификаций.

Все новости сохраняются в CachedNews с привязкой по `figi`. Одна новость может быть привязана к нескольким акциям (несколько записей с разными figi).

### 2. Сервисы

#### 2.1. RssFeedService (новый)

**Файл**: `server/src/services/RssFeedService.js`

**Основные методы**:

```javascript
class RssFeedService {
    constructor() {
        this.feedUrls = {
            // Финансовые новости
            rbc_finance: 'https://www.rbc.ru/rss/finance.xml',
            rbc_technology: 'https://www.rbc.ru/rss/technology.xml',
            rbc_general: 'https://www.rbc.ru/rss/free.xml',
            ria_economy: 'https://ria.ru/export/rss2/economy/index.xml',
            vedomosti: 'https://www.vedomosti.ru/rss/news',
            kommersant: 'https://www.kommersant.ru/RSS/news.xml',
            
            // Политические новости
            ria_politics: 'https://ria.ru/export/rss2/politics/index.xml',
            tass: 'https://tass.ru/rss/v2.xml',
            interfax: 'https://www.interfax.ru/rss.asp',
            lenta: 'https://lenta.ru/rss',
            meduza: 'https://meduza.io/rss/all'
        };
        this.requestDelay = 5000; // 5 секунд между запросами к одному источнику
    }

    /**
     * Парсинг RSS фида
     * @param {string} feedUrl - URL RSS фида
     * @returns {Promise<Array>} Массив новостей в формате:
     *   {
     *     title: string,
     *     description: string,
     *     url: string,
     *     source: string,
     *     publishedAt: Date,
     *     language: 'ru' | 'en'
     *   }
     */
    async parseFeed(feedUrl) {
        // 1. Получить RSS XML через node-fetch
        // 2. Распарсить через rss-parser
        // 3. Преобразовать в единый формат
        // 4. Нормализовать даты
        // 5. Определить язык (ru/en)
    }

    /**
     * Получить финансовые новости из всех источников
     * @param {Object} options - Опции
     * @param {number} options.limit - Лимит новостей на источник
     * @returns {Promise<Array>} Массив новостей
     */
    async fetchFinanceNews(options = {}) {
        const financeFeeds = [
            this.feedUrls.rbc_finance,
            this.feedUrls.rbc_technology,
            this.feedUrls.rbc_general,
            this.feedUrls.ria_economy,
            this.feedUrls.vedomosti,
            this.feedUrls.kommersant
        ];
        
        // Параллельно запросить все фиды
        // Объединить и отсортировать по дате
        // Дедуплицировать по URL
    }

    /**
     * Получить политические новости из всех источников
     * @param {Object} options - Опции
     * @param {number} options.limit - Лимит новостей на источник
     * @returns {Promise<Array>} Массив новостей
     */
    async fetchPoliticalNews(options = {}) {
        const politicalFeeds = [
            this.feedUrls.ria_politics,
            this.feedUrls.tass,
            this.feedUrls.interfax,
            this.feedUrls.rbc_general,
            this.feedUrls.lenta,
            this.feedUrls.meduza
        ];
        
        // Параллельно запросить все фиды
        // Объединить и отсортировать по дате
        // Дедуплицировать по URL
    }
}
```

**Зависимости**:
- `rss-parser` - парсинг RSS/XML
- `node-fetch` - HTTP запросы

#### 2.2. NewsLinkageService (новый)

**Файл**: `server/src/services/NewsLinkageService.js`

**Основные методы**:

```javascript
class NewsLinkageService {
    constructor() {
        this.newsAnalysisService = null; // Lazy load
        this.sectorClassifier = null; // Lazy load
        this.cacheService = null; // Lazy load
    }

    /**
     * Привязать финансовую новость к акциям
     * @param {Object} news - Объект новости из RSS
     * @returns {Promise<Array<string>>} Массив FIGI акций, к которым привязана новость
     */
    async linkFinanceNewsToStocks(news) {
        // 1. Получить все активные инструменты из БД
        // 2. Для каждой акции:
        //    - Проверить прямое упоминание (название компании, тикер)
        //    - Проверить секторную принадлежность (ключевые слова сектора)
        //    - Рассчитать relevance score
        // 3. Отфильтровать по threshold (relevance > 0.3)
        // 4. Для каждой подходящей акции:
        //    - Проанализировать sentiment через NewsAnalysisService
        //    - Рассчитать impact
        //    - Сохранить в CachedNews с figi акции
    }

    /**
     * Привязать политическую новость ко всем российским акциям
     * @param {Object} news - Объект новости из RSS
     * @returns {Promise<Array<string>>} Массив FIGI акций, к которым привязана новость
     */
    async linkPoliticalNewsToStocks(news) {
        // 1. Получить все российские акции из БД
        // 2. Для каждой акции:
        //    - Проанализировать sentiment через NewsAnalysisService
        //    - Рассчитать relevance (для политических новостей обычно 0.5-0.7)
        //    - Рассчитать impact (зависит от категории новости)
        //    - Сохранить в CachedNews с figi акции
    }

    /**
     * Проверить релевантность новости для акции
     * @param {Object} news - Объект новости
     * @param {Object} stock - Объект акции (name, ticker, sector, figi)
     * @returns {number} Relevance score от 0 до 1
     */
    calculateRelevance(news, stock) {
        let score = 0;
        const text = `${news.title} ${news.description || ''}`.toLowerCase();
        const stockName = stock.name?.toLowerCase() || '';
        const ticker = stock.ticker?.toLowerCase() || '';
        
        // 1. Прямое упоминание названия компании (вес 1.0)
        if (stockName && text.includes(stockName)) {
            score += 1.0;
        }
        
        // 2. Прямое упоминание тикера (вес 0.8)
        if (ticker && text.includes(ticker)) {
            score += 0.8;
        }
        
        // 3. Секторные ключевые слова (вес 0.5)
        if (stock.sector) {
            const sectorKeywords = this.getSectorKeywords(stock.sector);
            const matches = sectorKeywords.filter(kw => 
                text.includes(kw.toLowerCase())
            ).length;
            score += (matches / sectorKeywords.length) * 0.5;
        }
        
        // Нормализуем до 0-1
        return Math.min(1, score / 2.3);
    }

    /**
     * Получить ключевые слова для сектора
     * @param {string} sector - Название сектора
     * @returns {Array<string>} Массив ключевых слов
     */
    getSectorKeywords(sector) {
        // Использовать SectorClassifier для получения ключевых слов
        // Вернуть массив ключевых слов на русском языке
    }

    /**
     * Сохранить новость в CachedNews с привязкой к акции
     * @param {Object} news - Объект новости из RSS
     * @param {string} figi - FIGI акции
     * @param {Object} analysis - Результаты анализа {sentiment, relevance, impact}
     * @returns {Promise<Object>} Сохраненная запись CachedNews
     */
    async saveNewsToCache(news, figi, analysis) {
        // 1. Проверить, не существует ли уже новость с таким URL и figi
        // 2. Если существует - обновить
        // 3. Если нет - создать новую запись
        // 4. Использовать NewsAnalysisService для анализа sentiment если не передан
        // 5. Сохранить в CachedNews со всеми полями:
        //    - figi, title, description, url, source, publishedAt
        //    - sentiment (от NewsAnalysisService.analyzeSentiment)
        //    - relevance (рассчитанная)
        //    - impact (рассчитанная)
        //    - language, category, keywords
    }

    /**
     * Обработать и привязать финансовые новости
     * @param {Array<Object>} newsList - Массив новостей из RSS
     * @returns {Promise<Object>} Статистика: {processed, linked, errors}
     */
    async processAndLinkFinanceNews(newsList) {
        // 1. Для каждой новости:
        //    - Привязать к акциям через linkFinanceNewsToStocks
        //    - Сохранить в кеш
        // 2. Вернуть статистику
    }

    /**
     * Обработать и привязать политические новости
     * @param {Array<Object>} newsList - Массив новостей из RSS
     * @returns {Promise<Object>} Статистика: {processed, linked, errors}
     */
    async processAndLinkPoliticalNews(newsList) {
        // 1. Для каждой новости:
        //    - Привязать ко всем российским акциям через linkPoliticalNewsToStocks
        //    - Сохранить в кеш
        // 2. Вернуть статистику
    }
}
```

**Зависимости**:
- `NewsAnalysisService` - для анализа sentiment
- `SectorClassifier` - для получения ключевых слов секторов
- `CacheService` / `TinkoffApiService` - для получения списка акций
- `CachedNews` модель - для сохранения

#### 2.3. RssNewsUpdateService (новый)

**Файл**: `server/src/services/RssNewsUpdateService.js`

**Основные методы**:

```javascript
class RssNewsUpdateService {
    constructor() {
        this.rssService = new RssFeedService();
        this.linkageService = new NewsLinkageService();
    }

    /**
     * Обновить финансовые новости и привязать к акциям
     * @param {Object} options - Опции
     * @returns {Promise<Object>} Статистика обновления
     */
    async updateFinanceNews(options = {}) {
        // 1. Получить финансовые новости из RSS через RssFeedService
        // 2. Дедуплицировать по URL (проверить в БД)
        // 3. Обработать и привязать через NewsLinkageService
        // 4. Вернуть статистику
    }

    /**
     * Обновить политические новости и привязать к акциям
     * @param {Object} options - Опции
     * @returns {Promise<Object>} Статистика обновления
     */
    async updatePoliticalNews(options = {}) {
        // 1. Получить политические новости из RSS через RssFeedService
        // 2. Дедуплицировать по URL (проверить в БД)
        // 3. Обработать и привязать через NewsLinkageService
        // 4. Вернуть статистику
    }

    /**
     * Обновить все новости (финансовые + политические)
     * @param {Object} options - Опции
     * @returns {Promise<Object>} Статистика обновления
     */
    async updateAllNews(options = {}) {
        // 1. Параллельно обновить финансовые и политические новости
        // 2. Вернуть объединенную статистику
    }
}
```

### 3. API Endpoints

#### 3.1. Расширение news-routes

**Файл**: `server/src/routes/news-routes.js`

Существующий endpoint `/api/news/:figi` уже работает с CachedNews. Новости, привязанные через RSS, будут автоматически доступны через этот endpoint.

**Опционально**: Добавить endpoint для ручного обновления:

```javascript
/**
 * POST /api/news/refresh
 * Обновить новости из RSS и привязать к акциям
 * Query params:
 *   - type: 'finance' | 'politics' | 'all' (default: 'all')
 */
router.post('/refresh', async (req, res) => {
    // Вызвать RssNewsUpdateService.updateAllNews() или updateFinanceNews() / updatePoliticalNews()
});
```

### 4. Планировщик задач

#### 4.1. Scheduler для обновления новостей

**Файл**: `server/src/utils/scheduler/rssNewsUpdateUtils.js` (новый)

```javascript
/**
 * Обновление финансовых новостей
 * Запускается ежедневно в 6:00, 12:00, 18:00
 */
export async function updateFinanceNews() {
    try {
        const RssNewsUpdateService = (await import('../../services/RssNewsUpdateService.js')).default;
        const stats = await RssNewsUpdateService.updateFinanceNews();
        
        LoggerService.info('Finance news updated', stats);
    } catch (error) {
        LoggerService.error('Error updating finance news', { error });
    }
}

/**
 * Обновление политических новостей
 * Запускается ежедневно в 7:00, 13:00, 19:00
 */
export async function updatePoliticalNews() {
    try {
        const RssNewsUpdateService = (await import('../../services/RssNewsUpdateService.js')).default;
        const stats = await RssNewsUpdateService.updatePoliticalNews();
        
        LoggerService.info('Political news updated', stats);
    } catch (error) {
        LoggerService.error('Error updating political news', { error });
    }
}
```

**Интеграция в SchedulerService**:
- Добавить задачу в `server/src/services/SchedulerService.js`
- Финансовые новости: каждые 6 часов (6:00, 12:00, 18:00)
- Политические новости: каждые 6 часов (7:00, 13:00, 19:00)

### 5. Frontend

**НЕ ТРЕБУЕТСЯ ИЗМЕНЕНИЙ** - существующий endpoint `/api/news/:figi` уже возвращает новости из CachedNews, включая новости, привязанные через RSS.

Существующие компоненты (`EnhancedNewsFeed`, `StockDetailNew`) будут автоматически показывать новые новости.

### 6. Ключевые слова для определения релевантности

#### 6.1. Расширение SectorClassifier

**Файл**: `server/src/utils/sectorClassifier.js`

Добавить метод:

```javascript
/**
 * Получить ключевые слова для сектора (на русском языке)
 * @param {string} sector - Название сектора
 * @returns {Array<string>} Массив ключевых слов
 */
getSectorKeywords(sector) {
    const sectorKeywords = {
        energy: ['нефть', 'газ', 'нефтегазовый', 'энергетика', 'ОПЕК', 'нефтедобыча'],
        materials: ['металлургия', 'сталь', 'никель', 'алюминий', 'добыча', 'уголь', 'золото'],
        finance: ['банк', 'финансы', 'кредит', 'ставка', 'ЦБ', 'инфляция', 'ипотека'],
        technology: ['IT', 'технологии', 'софт', 'программное', 'цифровизация', 'AI'],
        consumer: ['ритейл', 'торговля', 'потребительский', 'FMCG'],
        industrial: ['химия', 'нефтехимия', 'удобрения', 'агрохимия'],
        utilities: ['энергетика', 'электроэнергия', 'генерация', 'тарифы'],
        transportation: ['транспорт', 'логистика', 'перевозки']
    };
    
    return sectorKeywords[sector] || [];
}
```

#### 6.2. Ключевые слова для политических новостей

**Файл**: `server/src/services/NewsLinkageService.js`

Для политических новостей relevance рассчитывается одинаково для всех акций (обычно 0.5-0.7), так как политические новости влияют на весь рынок.

## Этапы реализации

### Этап 1: Backend сервисы (4-5 дней)

1. ✅ Создать RssFeedService (парсинг RSS фидов)
2. ✅ Создать NewsLinkageService (привязка новостей к акциям)
3. ✅ Создать RssNewsUpdateService (оркестрация обновления)
4. ✅ Интегрировать с NewsAnalysisService для анализа sentiment
5. ✅ Реализовать расчет relevance и impact
6. ✅ Реализовать дедупликацию по URL

**Файлы**:
- `server/src/services/RssFeedService.js` (новый)
- `server/src/services/NewsLinkageService.js` (новый)
- `server/src/services/RssNewsUpdateService.js` (новый)
- Обновить `server/src/utils/sectorClassifier.js` (добавить getSectorKeywords)

**Зависимости для установки**:
```bash
npm install rss-parser fast-xml-parser
```

### Этап 2: Планировщик (1 день)

1. ✅ Создать rssNewsUpdateUtils.js
2. ✅ Интегрировать в SchedulerService
3. ✅ Настроить расписание обновлений
4. ✅ Добавить мониторинг и логирование

**Файлы**:
- `server/src/utils/scheduler/rssNewsUpdateUtils.js` (новый)
- Обновить `server/src/services/SchedulerService.js`

### Этап 3: Тестирование (2-3 дня)

1. ✅ Unit тесты для RssFeedService
2. ✅ Unit тесты для NewsLinkageService
3. ✅ Unit тесты для RssNewsUpdateService
4. ✅ Integration тесты (проверка привязки к акциям)
5. ✅ Тестирование анализа sentiment
6. ✅ Тестирование расчета relevance
7. ✅ Тестирование дедупликации

**Файлы**:
- `server/src/__tests__/services/RssFeedService.test.js` (новый)
- `server/src/__tests__/services/NewsLinkageService.test.js` (новый)
- `server/src/__tests__/services/RssNewsUpdateService.test.js` (новый)

### Этап 4: Документация и оптимизация (1 день)

1. ✅ Обновить API документацию
2. ✅ Добавить примеры использования
3. ✅ Оптимизация запросов к БД
4. ✅ Мониторинг и метрики

## Технические детали

### Формат данных из RSS

RSS фиды возвращают данные в формате:
```xml
<item>
  <title>Заголовок новости</title>
  <description>Описание новости</description>
  <link>https://example.com/news/123</link>
  <pubDate>Mon, 20 Feb 2024 10:00:00 +0300</pubDate>
</item>
```

После парсинга преобразуем в:
```javascript
{
  title: string,
  description: string,
  url: string,
  source: string, // Название источника (rbc, ria, tass, etc.)
  publishedAt: Date,
  language: 'ru' | 'en'
}
```

### Привязка финансовых новостей к акциям

**Алгоритм**:

1. Получить все активные инструменты из БД (CachedInstrument)
2. Для каждой новости:
   - Для каждой акции рассчитать relevance score:
     - Прямое упоминание названия компании: +1.0
     - Прямое упоминание тикера: +0.8
     - Совпадение ключевых слов сектора: +0.5 (пропорционально количеству совпадений)
   - Нормализовать score до 0-1
   - Если relevance > 0.3 - привязать новость к акции
3. Для привязанных новостей:
   - Проанализировать sentiment через `NewsAnalysisService.analyzeSentiment()`
   - Рассчитать impact на основе sentiment и relevance
   - Сохранить в CachedNews с figi акции

**Пример**:
- Новость: "Сбербанк объявил о росте прибыли"
- Акция: SBER (Сбербанк, сектор: finance)
- Relevance: 1.0 (прямое упоминание) + 0.5 (сектор finance) = 1.5 → нормализовано = 0.65
- Привязываем к SBER

### Привязка политических новостей к акциям

**Алгоритм**:

1. Получить все российские акции из БД
2. Для каждой новости:
   - Привязать ко всем российским акциям
   - Relevance для политических новостей: 0.5-0.7 (в зависимости от категории)
   - Проанализировать sentiment через `NewsAnalysisService.analyzeSentiment()`
   - Рассчитать impact на основе категории новости:
     - Санкции, экономическая политика: impact = 0.7-0.9
     - Выборы, международные отношения: impact = 0.5-0.7
     - Внутренняя политика: impact = 0.3-0.5
   - Сохранить в CachedNews с figi каждой акции

**Пример**:
- Новость: "Новые санкции против российских банков"
- Привязываем ко всем российским акциям
- Relevance: 0.6 (политическая новость)
- Impact: 0.8 (санкции - высокое влияние)
- Sentiment: -0.7 (отрицательный)

### Анализ sentiment

Используем существующий `NewsAnalysisService.analyzeSentiment(text)`:

```javascript
// В NewsLinkageService
const NewsAnalysisService = (await import('./NewsAnalysisService.js')).default;
const sentiment = await NewsAnalysisService.analyzeSentiment(
    `${news.title} ${news.description || ''}`
);
// sentiment: число от -1 до 1
```

### Расчет relevance

**Для финансовых новостей**:
```javascript
relevance = (
    directMention * 1.0 +
    tickerMention * 0.8 +
    sectorKeywordsMatch * 0.5
) / 2.3
```

**Для политических новостей**:
```javascript
// Зависит от категории
relevance = {
    'sanctions': 0.7,
    'economy_policy': 0.7,
    'international_relations': 0.6,
    'elections': 0.5,
    'policy': 0.5,
    'other': 0.5
}[category] || 0.5
```

### Расчет impact

```javascript
// Зависит от sentiment и relevance
impact = Math.abs(sentiment) * relevance * categoryMultiplier

// categoryMultiplier для политических новостей:
const categoryMultiplier = {
    'sanctions': 1.2,
    'economy_policy': 1.1,
    'international_relations': 1.0,
    'elections': 0.9,
    'policy': 0.8,
    'other': 0.7
}[category] || 1.0
```

### Дедупликация

Перед сохранением проверяем:
1. Существует ли уже новость с таким URL и figi в CachedNews
2. Если существует - обновляем (обновляем sentiment, relevance, impact если они изменились)
3. Если нет - создаем новую запись

**Проверка**:
```javascript
const existing = await CachedNews.findOne({
    where: {
        url: news.url,
        figi: figi
    }
});
```

### Кеширование

Используем существующий механизм кеширования CachedNews:
- Новости хранятся в БД с полями `cachedAt` и `expiresAt`
- Время жизни: 24 часа (как в текущей модели)
- При запросе через `NewsAnalysisService.getCachedNews()` автоматически фильтруются по expiresAt

### Rate Limiting

**RSS фиды**:
- Неограниченное количество запросов
- Рекомендуется: 1 запрос/5 секунд на источник
- Параллельные запросы к разным источникам допустимы

**Стратегия**:
- Параллельные запросы к разным RSS источникам
- Последовательные запросы к одному источнику с задержкой
- Агрессивное кеширование для уменьшения запросов

## Риски и митигация

### Риск 1: Недоступность RSS источников
**Митигация**:
- Использование нескольких RSS источников
- Retry механизм с экспоненциальной задержкой
- Fallback на другие источники при недоступности
- Кеширование последних успешных результатов

### Риск 2: Низкая релевантность привязки финансовых новостей
**Митигация**:
- Использование threshold (relevance > 0.3)
- Улучшение алгоритма расчета relevance
- Проверка по названию компании и тикеру
- Пользовательская обратная связь

### Риск 3: Дублирование новостей
**Митигация**:
- Дедупликация по URL перед сохранением
- Проверка существования записи с таким URL и figi
- Обновление существующих записей вместо создания дубликатов

### Риск 4: Изменение структуры RSS фидов
**Митигация**:
- Гибкий парсер RSS (rss-parser поддерживает разные форматы)
- Обработка ошибок парсинга
- Логирование проблемных фидов
- Регулярное тестирование парсинга

### Риск 5: Производительность при массовой привязке
**Митигация**:
- Батчинг операций сохранения в БД
- Асинхронная обработка привязки
- Оптимизация запросов к БД (индексы по figi, url)
- Ограничение количества новостей за раз (например, последние 50)

## Метрики успеха

1. **Покрытие**: 
   - Финансовые новости привязаны к релевантным акциям
   - Политические новости привязаны ко всем российским акциям
2. **Актуальность**: 
   - Новости обновляются минимум 3 раза в день
3. **Релевантность**: 
   - >70% финансовых новостей привязаны к релевантным акциям (relevance > 0.3)
   - Политические новости привязаны ко всем российским акциям
4. **Производительность**: 
   - Время обработки одной новости < 1 секунда
   - Время обновления всех новостей < 5 минут
5. **Качество sentiment**: 
   - Sentiment анализируется для всех новостей
   - Используется существующий NewsAnalysisService
6. **Надежность источников**:
   - <10% ошибок при парсинге RSS фидов
   - Успешное использование fallback механизмов

## Будущие улучшения

1. **ML для релевантности**: Использование ML моделей для более точного определения релевантности
2. **Персонализация**: Рекомендации новостей на основе портфеля пользователя
3. **Уведомления**: Push-уведомления о важных новостях для акций в портфеле
4. **Аналитика**: Дашборд с аналитикой по новостям
5. **Дополнительные RSS источники**: Расширение списка RSS фидов
6. **Улучшение алгоритма relevance**: Более точное определение релевантности с учетом контекста

## Зависимости

### Новые зависимости

```json
{
  "rss-parser": "^3.13.0",
  "fast-xml-parser": "^4.3.2"
}
```

### Переменные окружения

```env
# Опционально: настройки для RSS
RSS_REQUEST_DELAY=5000  # Задержка между запросами к RSS (мс)
RSS_TIMEOUT=10000       # Таймаут для RSS запросов (мс)
RSS_RELEVANCE_THRESHOLD=0.3  # Минимальный relevance для привязки финансовых новостей
```

### Существующие зависимости
- Существующие сервисы: NewsAnalysisService, SectorClassifier, CacheService
- База данных: Sequelize, PostgreSQL
- Модель: CachedNews (без изменений)

## Временная оценка

**Общее время**: 8-10 рабочих дней

- Backend сервисы: 4-5 дней
- Планировщик: 1 день
- Тестирование: 2-3 дня
- Документация: 1 день

## Приоритет

**Высокий** - Улучшает покрытие новостями для акций, используя бесплатные источники и существующую инфраструктуру.

## Примечания

1. **Совместимость**: Все новости сохраняются в существующую модель CachedNews, совместимы с текущим API
2. **Sentiment анализ**: Используется существующий NewsAnalysisService, никаких изменений не требуется
3. **Frontend**: Не требует изменений, существующие компоненты автоматически покажут новые новости
4. **Производительность**: Привязка политических новостей ко всем акциям может быть ресурсоемкой, требуется оптимизация (батчинг, асинхронная обработка)
