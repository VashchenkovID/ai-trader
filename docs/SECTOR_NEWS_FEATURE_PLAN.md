# План реализации: Новости по секторам и политические новости РФ

## Обзор

Реализация системы запроса новостей по секторам экономики и политических новостей, касающихся РФ, на английском и русском языках с автоматической привязкой к акциям.

## Цели

1. **Запрос новостей по секторам**: Получение новостей для всех акций в определенном секторе
2. **Политические новости РФ**: Получение политических новостей, влияющих на российский фондовый рынок
3. **Мультиязычность**: Поддержка русского и английского языков
4. **Автоматическая привязка**: Связывание новостей с соответствующими акциями
5. **Кеширование**: Эффективное хранение и использование новостей
6. **API интеграция**: Расширение существующих API для работы с секторными и политическими новостями

## Текущее состояние

### Существующая инфраструктура

1. **Модель CachedNews** (`server/src/models/CachedNews.js`)
   - ✅ Поддержка поля `language` (ru/en)
   - ✅ Привязка по `figi`
   - ✅ Поля: title, description, url, source, publishedAt, sentiment, relevance, impact
   - ✅ Индексы по figi, publishedAt, language

2. **NewsApiService** (`server/src/services/NewsApiService.js`)
   - ✅ Интеграция с NewsAPI.org
   - ✅ Поддержка параметра `language` в запросах
   - ✅ Rate limiting (1 сек между запросами)
   - ✅ Fallback механизм через FallbackService

3. **SectorClassifier** (`server/src/utils/sectorClassifier.js`)
   - ✅ Классификация инструментов по секторам
   - ✅ Маппинг секторов (technology, finance, energy, consumer, healthcare, etc.)
   - ✅ Методы: `classifySector()`, `groupBySector()`, `getAvailableSectors()`

4. **NewsAnalysisService** (`server/src/services/NewsAnalysisService.js`)
   - ✅ Получение новостей по FIGI
   - ✅ Анализ sentiment и relevance

## Архитектура решения

### 1. База данных

#### 1.1. Расширение модели CachedNews

**Файл**: `server/src/models/CachedNews.js`

Добавить поля:
```javascript
sector: {
    type: DataTypes.STRING(50),
    allowNull: true,
    index: true
},
isSectorNews: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
},
isPoliticalNews: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
},
politicalCategory: {
    type: DataTypes.STRING(50),
    allowNull: true,
    index: true
    // Категории: sanctions, elections, policy, international_relations, economy_policy, etc.
},
relatedFigis: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [] // Массив FIGI акций, к которым относится новость
},
impactLevel: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
    allowNull: true,
    defaultValue: 'medium'
    // Уровень влияния на рынок (особенно важно для политических новостей)
}
```

**Миграция**: `server/migrations/add-sector-news-fields.js`

#### 1.2. Новая таблица: SectorNewsMapping

**Файл**: `server/src/models/SectorNewsMapping.js`

Связь многие-ко-многим между новостями и акциями:
```javascript
{
    id: INTEGER (PK),
    newsId: INTEGER (FK -> CachedNews.id),
    figi: STRING(50) (FK -> CachedInstrument.figi),
    sector: STRING(50),
    relevanceScore: FLOAT, // Оценка релевантности новости для конкретной акции
    createdAt: DATE,
    updatedAt: DATE
}
```

**Индексы**:
- `[newsId, figi]` - уникальный
- `[sector, createdAt]`
- `[figi, createdAt]`
- `[isPoliticalNews, createdAt]` - для политических новостей
- `[politicalCategory, createdAt]` - для фильтрации по категориям

### 2. Сервисы

#### 2.1. SectorNewsService (новый)

**Файл**: `server/src/services/SectorNewsService.js`

**Основные методы**:

```javascript
class SectorNewsService {
    /**
     * Получить новости для сектора
     * @param {string} sector - Название сектора (technology, finance, energy, etc.)
     * @param {Object} options - Опции запроса
     * @param {string} options.language - Язык новостей ('ru' | 'en' | 'both')
     * @param {number} options.days - Количество дней назад
     * @param {number} options.limit - Максимальное количество новостей
     * @returns {Promise<Array>} Массив новостей
     */
    async getSectorNews(sector, options = {}) {
        // 1. Сформировать поисковый запрос для сектора на основе ключевых слов (из SectorClassifier)
        // 2. Запросить новости на нужных языках через NewsApiService.fetchNewsBySector()
        // 3. Сохранить в кеш с пометкой isSectorNews=true и sector
        // 4. Привязать к акциям в секторе асинхронно (через linkNewsToStocks)
    }

    /**
     * Запросить свежие новости для сектора
     * @param {string} sector - Название сектора
     * @param {string} language - Язык ('ru' | 'en')
     * @returns {Promise<Array>} Массив новых новостей
     */
    async fetchFreshSectorNews(sector, language = 'ru') {
        // 1. Получить ключевые слова для сектора из SectorClassifier
        // 2. Сформировать поисковый запрос на основе ключевых слов сектора
        // 3. Запросить новости через NewsApiService.fetchNewsBySector()
        // 4. Обработать новости (классификация, sentiment анализ)
        // 5. Сохранить в кеш с пометкой isSectorNews=true и sector
        // 6. Привязать к акциям в секторе (асинхронно, после сохранения)
    }

    /**
     * Привязать новость к акциям в секторе
     * @param {Object} news - Объект новости
     * @param {string} sector - Сектор
     * @returns {Promise<Array>} Массив привязанных FIGI
     */
    async linkNewsToStocks(news, sector) {
        // 1. Получить все FIGI акций в секторе (через SectorClassifier.getStocksBySector())
        // 2. Проанализировать релевантность новости для каждой акции
        //    (прямое упоминание, ключевые слова, sentiment)
        // 3. Создать связи в SectorNewsMapping только для релевантных акций
        //    (relevanceScore > threshold, например 0.3)
    }

    /**
     * Получить новости для конкретной акции из секторных новостей
     * @param {string} figi - FIGI акции
     * @param {Object} options - Опции
     * @returns {Promise<Array>} Массив новостей
     */
    async getStockNewsFromSector(figi, options = {}) {
        // 1. Определить сектор акции
        // 2. Получить секторные новости
        // 3. Отфильтровать по релевантности
    }

    /**
     * Массовое обновление новостей для всех секторов
     * @param {Object} options - Опции
     * @returns {Promise<Object>} Статистика обновления
     */
    async updateAllSectorsNews(options = {}) {
        // Обновить новости для всех секторов
    }
}
```

**Зависимости**:
- `NewsApiService` - запросы к NewsAPI
- `SectorClassifier` - классификация секторов
- `CacheService` - получение инструментов
- `NewsAnalysisService` - анализ sentiment

#### 2.2. PoliticalNewsService (новый)

**Файл**: `server/src/services/PoliticalNewsService.js`

**Основные методы**:

```javascript
class PoliticalNewsService {
    /**
     * Получить политические новости, касающиеся РФ
     * @param {Object} options - Опции запроса
     * @param {string} options.language - Язык новостей ('ru' | 'en' | 'both')
     * @param {string} options.category - Категория политических новостей
     * @param {number} options.days - Количество дней назад
     * @param {number} options.limit - Максимальное количество новостей
     * @returns {Promise<Array>} Массив новостей
     */
    async getPoliticalNews(options = {}) {
        // 1. Сформировать поисковый запрос для политических новостей РФ
        // 2. Запросить новости на нужных языках
        // 3. Классифицировать по категориям
        // 4. Сохранить в кеш
        // 5. Привязать к российским акциям
    }

    /**
     * Запросить свежие политические новости
     * @param {string} language - Язык ('ru' | 'en')
     * @param {string} category - Категория (опционально)
     * @returns {Promise<Array>} Массив новых новостей
     */
    async fetchFreshPoliticalNews(language = 'ru', category = null) {
        // 1. Получить ключевые слова для политических новостей
        // 2. Сформировать поисковый запрос
        // 3. Запросить через NewsApiService
        // 4. Классифицировать и определить уровень влияния
        // 5. Обработать и сохранить
    }

    /**
     * Классифицировать политическую новость по категории
     * @param {Object} news - Объект новости
     * @returns {string} Категория новости
     */
    classifyPoliticalNews(news) {
        // Категории:
        // - sanctions: Санкции
        // - elections: Выборы
        // - policy: Внутренняя политика
        // - international_relations: Международные отношения
        // - economy_policy: Экономическая политика
        // - regulations: Регулирование
        // - trade: Торговые отношения
        // - other: Прочее
    }

    /**
     * Определить уровень влияния политической новости на рынок
     * @param {Object} news - Объект новости
     * @returns {string} Уровень влияния ('low' | 'medium' | 'high' | 'critical')
     */
    determineImpactLevel(news) {
        // Анализ ключевых слов, категории, источника
        // Критичные: санкции, изменения в экономической политике
        // Высокие: выборы, международные отношения
        // Средние: внутренняя политика, регулирование
        // Низкие: общие политические новости
    }

    /**
     * Привязать политическую новость к российским акциям
     * @param {Object} news - Объект новости
     * @param {string} category - Категория новости
     * @returns {Promise<Array>} Массив привязанных FIGI
     */
    async linkPoliticalNewsToStocks(news, category) {
        // 1. Получить все российские акции
        // 2. Проанализировать релевантность новости для каждой акции
        // 3. Учитывать сектор акции и категорию новости
        // 4. Создать связи в SectorNewsMapping
    }

    /**
     * Получить политические новости для конкретной акции
     * @param {string} figi - FIGI акции
     * @param {Object} options - Опции
     * @returns {Promise<Array>} Массив новостей
     */
    async getStockPoliticalNews(figi, options = {}) {
        // 1. Проверить, что акция российская
        // 2. Получить политические новости
        // 3. Отфильтровать по релевантности и сектору акции
    }

    /**
     * Получить новости по категории
     * @param {string} category - Категория политических новостей
     * @param {Object} options - Опции
     * @returns {Promise<Array>} Массив новостей
     */
    async getNewsByCategory(category, options = {}) {
        // Получить новости определенной категории
    }
}
```

**Зависимости**:
- `NewsApiService` - запросы к NewsAPI
- `CacheService` - получение российских инструментов
- `TinkoffApiService` - проверка, что акция российская
- `NewsAnalysisService` - анализ sentiment и relevance

#### 2.3. Расширение NewsApiService

**Файл**: `server/src/services/NewsApiService.js`

Добавить методы:

```javascript
/**
 * Построение поискового запроса для сектора
 * @param {string} sector - Название сектора
 * @param {string} language - Язык ('ru' | 'en')
 * @returns {string} Поисковый запрос
 */
buildSectorSearchQuery(sector, language = 'ru') {
    // Получить ключевые слова сектора из SectorClassifier
    const sectorKeywords = SectorClassifier.getSectorKeywords(sector, language);
    
    // Для русского языка: использовать русские названия секторов
    // Для английского: использовать английские названия
    // Примеры: "нефть и газ", "oil and gas", "металлургия", "metallurgy"
    
    // Комбинировать ключевые слова через OR для широкого поиска
    // Можно добавить тикеры крупных компаний сектора для более точных результатов
    return sectorKeywords.join(' OR ');
}

/**
 * Запрос новостей по сектору
 * Использует endpoint /v2/everything для поиска по ключевым словам
 * @param {string} sector - Сектор
 * @param {Object} options - Опции
 * @param {string} options.language - Язык ('ru' | 'en')
 * @param {string} options.sortBy - Сортировка ('publishedAt' | 'relevancy')
 * @param {Date} options.fromDate - Дата начала
 * @param {Date} options.toDate - Дата окончания
 * @param {number} options.pageSize - Размер страницы (макс 100)
 * @returns {Promise<Array>} Массив новостей
 */
async fetchNewsBySector(sector, options = {}) {
    const query = this.buildSectorSearchQuery(sector, options.language);
    
    // Используем /v2/everything для поиска по ключевым словам
    // sortBy=publishedAt для свежих новостей или sortBy=relevancy для релевантности
    return await this.searchNews(query, {
        language: options.language || 'ru',
        from: options.fromDate,
        to: options.toDate,
        sortBy: options.sortBy || 'relevancy', // 'publishedAt' для свежих, 'relevancy' для релевантных
        pageSize: Math.min(options.pageSize || 100, 100)
    });
}

/**
 * Построение поискового запроса для политических новостей РФ
 * Использует endpoint /v2/everything с параметром q для поиска по ключевым словам
 * @param {string} language - Язык ('ru' | 'en')
 * @param {string} category - Категория (опционально)
 * @returns {string} Поисковый запрос для параметра q
 */
buildPoliticalNewsSearchQuery(language = 'ru', category = null) {
    // Базовые термины для поиска новостей о России
    const baseTerms = {
        ru: ['Россия', 'РФ', 'российский'],
        en: ['Russia', 'Russian']
    };
    
    // Если указана категория, добавляем специфичные термины
    const categoryTerms = this.getPoliticalCategoryTerms(category, language);
    
    // Для русского языка: "Россия" или "РФ"
    // Для английского: "Russia" или "Russian politics" (в кавычках для точной фразы)
    if (language === 'ru') {
        if (category) {
            // Комбинируем: Россия AND (термины категории)
            return `Россия AND (${categoryTerms.join(' OR ')})`;
        }
        return 'Россия'; // Простой поиск по "Россия"
    } else {
        // Для английского языка
        if (category) {
            // Используем кавычки для точных фраз: "Russian politics" AND (термины категории)
            return `"Russian politics" AND (${categoryTerms.join(' OR ')})`;
        }
        return 'Russia'; // Или "Russian politics" для более точного поиска
    }
}

/**
 * Получить ключевые слова для категории политических новостей
 * @param {string} category - Категория
 * @param {string} language - Язык
 * @returns {Array<string>} Массив ключевых слов
 */
getPoliticalCategoryTerms(category, language = 'ru') {
    const terms = {
        // Общая и внутренняя политика
        policy: {
            ru: [
                'Россия', 'РФ', 'российская политика', 'власть', 'Кремль', 
                'Белый дом', 'Госдума', 'Совет Федерации', 'правительство РФ', 'оппозиция',
                'Путин', 'Мишустин', 'Медведев', 'Песков', 'Шойгу', 'Лавров', 'Собянин', 'Набиуллина',
                'выборы', 'закон', 'бюджет', 'Народная программа', 'послание президента', 'отставка', 'назначение'
            ],
            en: [
                'Russia', 'Russian politics', 'Kremlin', 'State Duma', 'Federation Council', 
                'government', 'opposition', 'Putin', 'Mishustin', 'Medvedev', 'Peskov', 
                'Shoigu', 'Lavrov', 'Sobyanin', 'Nabiullina', 'elections', 'law', 'budget'
            ]
        },
        // Внешняя политика и безопасность
        international_relations: {
            ru: [
                'санкции', 'геополитика', 'международные отношения', 'ООН', 'БРИКС', 'ШОС',
                'Украина', 'Донбасс', 'Сирия', 'США', 'Китай', 'Европа', 'НАТО', 'ЕС',
                'СВО', 'спецоперация', 'военные', 'безопасность', 'оборона', 'ВПК', 'Совбез'
            ],
            en: [
                'sanctions', 'geopolitics', 'international relations', 'UN', 'BRICS', 'SCO',
                'Ukraine', 'Donbass', 'Syria', 'USA', 'China', 'Europe', 'NATO', 'EU',
                'military operation', 'military', 'security', 'defense', 'defense industry'
            ]
        },
        // Санкции (отдельная категория как критичная)
        sanctions: {
            ru: ['санкции', 'санкционный', 'эмбарго', 'ограничения', 'запрет', 'блокировка'],
            en: ['sanctions', 'sanction', 'embargo', 'restrictions', 'ban', 'blockade']
        },
        // Выборы
        elections: {
            ru: ['выборы', 'избирательный', 'голосование', 'президентские выборы', 'парламентские выборы'],
            en: ['elections', 'election', 'voting', 'presidential election', 'parliamentary election']
        },
        // Экономическая политика
        economy_policy: {
            ru: [
                'экономическая политика', 'ЦБ', 'Центральный банк', 'Набиуллина', 
                'инфляция', 'курс рубля', 'ключевая ставка', 'ставка ЦБ', 
                'бюджет', 'Минфин', 'Минэкономразвития'
            ],
            en: [
                'economic policy', 'Central Bank of Russia', 'CBR', 'Nabiullina',
                'inflation', 'ruble', 'ruble rate', 'key rate', 'budget', 
                'Ministry of Finance', 'Ministry of Economic Development'
            ]
        },
        // Регулирование
        regulations: {
            ru: ['регулирование', 'надзор', 'контроль', 'лицензия', 'разрешение', 'норматив'],
            en: ['regulation', 'supervision', 'control', 'license', 'permit', 'normative']
        },
        // Торговые отношения
        trade: {
            ru: ['торговля', 'экспорт', 'импорт', 'таможня', 'таможенный', 'торговые отношения'],
            en: ['trade', 'export', 'import', 'customs', 'trade relations', 'commercial']
        }
    };
    
    return terms[category]?.[language] || [];
}

/**
 * Запрос политических новостей, касающихся РФ
 * Использует endpoint /v2/everything с параметрами q и language
 * @param {Object} options - Опции
 * @param {string} options.language - Язык ('ru' | 'en')
 *   - language=ru: ограничит выдачу только источниками на русском языке
 *   - language=en: западная пресса о РФ
 * @param {string} options.category - Категория политических новостей
 * @param {string} options.sortBy - Сортировка ('publishedAt' | 'relevancy')
 *   - publishedAt: самые свежие новости
 *   - relevancy: наиболее релевантные новости
 * @param {Date} options.fromDate - Дата начала
 * @param {Date} options.toDate - Дата окончания
 * @param {number} options.pageSize - Размер страницы (макс 100)
 * @returns {Promise<Array>} Массив новостей
 */
async fetchPoliticalNews(options = {}) {
    const query = this.buildPoliticalNewsSearchQuery(
        options.language || 'ru',
        options.category
    );
    
    // Используем /v2/everything для поиска по ключевым словам
    // Параметр q содержит поисковый запрос (например, "Россия" или "Russia")
    // Параметр language ограничивает источники по языку
    return await this.searchNews(query, {
        language: options.language || 'ru',
        from: options.fromDate,
        to: options.toDate,
        sortBy: options.sortBy || 'relevancy', // 'publishedAt' для свежих, 'relevancy' для релевантных
        pageSize: Math.min(options.pageSize || 100, 100)
    });
}
```

#### 2.4. Расширение SectorClassifier

**Файл**: `server/src/utils/sectorClassifier.js`

Добавить методы:

```javascript
/**
 * Получить ключевые слова для поиска новостей по сектору
 * Включает общие термины сектора и названия компаний из базы данных
 * @param {string} sector - Название сектора
 * @param {string} language - Язык ('ru' | 'en')
 * @returns {Promise<Array<string>>} Массив ключевых слов
 */
async getSectorKeywords(sector, language = 'ru') {
    // 1. Получить базовые ключевые слова сектора
    const baseKeywords = this.getSectorBaseKeywords(sector, language);
    
    // 2. Получить названия компаний из базы данных (Asset/CachedInstrument)
    // Фильтровать по сектору и брать названия компаний, а не тикеры
    const companies = await this.getCompaniesBySector(sector);
    const companyNames = companies.map(c => c.name).filter(Boolean);
    
    // 3. Объединить базовые ключевые слова и названия компаний
    return [...baseKeywords, ...companyNames];
}

/**
 * Получить базовые ключевые слова для сектора
 * @param {string} sector - Название сектора
 * @param {string} language - Язык ('ru' | 'en')
 * @returns {Array<string>} Массив базовых ключевых слов
 */
getSectorBaseKeywords(sector, language = 'ru') {
    const sectorKeywords = {
        energy: {
            ru: ['нефть', 'газ', 'нефтегазовый сектор', 'углеводороды', 'энергетика', 'ОПЕК+', 'экспорт нефти', 'цена на нефть'],
            en: ['oil', 'gas', 'oil and gas', 'hydrocarbons', 'energy', 'OPEC+', 'oil export', 'oil price']
        },
        materials: {
            ru: ['металлургия', 'чёрная металлургия', 'цветная металлургия', 'добыча', 'горная добыча', 'уголь', 'золото', 'сталь', 'никель', 'алюминий'],
            en: ['metallurgy', 'steel industry', 'non-ferrous metals', 'mining', 'coal', 'gold', 'steel', 'nickel', 'aluminum']
        },
        finance: {
            ru: ['банки', 'финансы', 'кредитование', 'ставка ЦБ', 'ключевая ставка', 'инфляция', 'ипотека', 'биржа'],
            en: ['banks', 'finance', 'lending', 'Central Bank rate', 'key rate', 'inflation', 'mortgage', 'exchange']
        },
        technology: {
            ru: ['IT', 'информационные технологии', 'импортозамещение', 'искусственный интеллект', 'AI', 'разработка ПО', 'цифровизация'],
            en: ['IT', 'information technology', 'software development', 'artificial intelligence', 'AI', 'digitalization']
        },
        consumer: {
            ru: ['ритейл', 'розничная торговля', 'потребительский рынок', 'FMCG'],
            en: ['retail', 'retail trade', 'consumer market', 'FMCG']
        },
        industrial: {
            ru: ['химическая промышленность', 'нефтехимия', 'удобрения', 'агрохимия'],
            en: ['chemical industry', 'petrochemistry', 'fertilizers', 'agrochemistry']
        },
        utilities: {
            ru: ['электроэнергетика', 'энергосбыт', 'генерация', 'мощность', 'тарифы'],
            en: ['electric power', 'energy sales', 'generation', 'capacity', 'tariffs']
        },
        transportation: {
            ru: ['транспорт', 'перевозки', 'логистика', 'инфраструктура'],
            en: ['transport', 'transportation', 'logistics', 'infrastructure']
        }
    };
    
    return sectorKeywords[sector]?.[language] || [];
}

/**
 * Получить компании по сектору из базы данных
 * @param {string} sector - Название сектора
 * @returns {Promise<Array>} Массив компаний с полями {name, ticker, figi}
 */
async getCompaniesBySector(sector) {
    const CachedInstrument = (await import('../models/CachedInstrument.js')).default;
    const instruments = await CachedInstrument.findAll({
        where: {
            sector: sector,
            isActive: true
        },
        attributes: ['name', 'ticker', 'figi']
    });
    return instruments.map(i => i.toJSON());
}

/**
 * Получить все FIGI акций в секторе
 * @param {string} sector - Название сектора
 * @returns {Promise<Array<string>>} Массив FIGI
 */
async getStocksBySector(sector) {
    // Запрос к БД для получения всех акций в секторе
}
```

### 3. API Endpoints

#### 3.1. Новые маршруты

**Файл**: `server/src/routes/sector-news-routes.js` (новый)

```javascript
/**
 * GET /api/sector-news/:sector
 * Получить новости для сектора
 * Query params:
 *   - language: 'ru' | 'en' | 'both' (default: 'ru')
 *   - days: number (default: 7)
 *   - limit: number (default: 20)
 */
router.get('/:sector', async (req, res) => {
    // Получить новости для сектора
});

/**
 * GET /api/sector-news/:sector/stocks
 * Получить акции в секторе
 */
router.get('/:sector/stocks', async (req, res) => {
    // Получить список акций в секторе
});

/**
 * POST /api/sector-news/:sector/refresh
 * Обновить новости для сектора
 */
router.post('/:sector/refresh', async (req, res) => {
    // Запросить свежие новости для сектора
});

/**
 * GET /api/sector-news/:figi/from-sector
 * Получить секторные новости для конкретной акции
 */
router.get('/stock/:figi/from-sector', async (req, res) => {
    // Получить секторные новости для акции
});
```

#### 3.3. Новые маршруты для политических новостей

**Файл**: `server/src/routes/political-news-routes.js` (новый)

```javascript
/**
 * GET /api/political-news
 * Получить политические новости, касающиеся РФ
 * Query params:
 *   - language: 'ru' | 'en' | 'both' (default: 'ru')
 *   - category: 'sanctions' | 'elections' | 'policy' | 'international_relations' | 'economy_policy' | 'regulations' | 'trade' (optional)
 *   - days: number (default: 7)
 *   - limit: number (default: 20)
 *   - impactLevel: 'low' | 'medium' | 'high' | 'critical' (optional)
 */
router.get('/', async (req, res) => {
    // Получить политические новости
});

/**
 * GET /api/political-news/categories
 * Получить список категорий политических новостей
 */
router.get('/categories', async (req, res) => {
    // Вернуть список категорий
});

/**
 * GET /api/political-news/category/:category
 * Получить новости по категории
 */
router.get('/category/:category', async (req, res) => {
    // Получить новости определенной категории
});

/**
 * GET /api/political-news/stock/:figi
 * Получить политические новости для конкретной акции
 */
router.get('/stock/:figi', async (req, res) => {
    // Получить политические новости для акции
});

/**
 * POST /api/political-news/refresh
 * Обновить политические новости
 */
router.post('/refresh', async (req, res) => {
    // Запросить свежие политические новости
});
```

#### 3.4. Расширение news-routes

**Файл**: `server/src/routes/news-routes.js`

Добавить параметры `includeSectorNews` и `includePoliticalNews`:

```javascript
/**
 * GET /api/news/:figi?includeSectorNews=true&includePoliticalNews=true
 * Получить новости для инструмента (включая секторные и политические)
 */
router.get('/:figi', async (req, res) => {
    const includeSectorNews = req.query.includeSectorNews === 'true';
    const includePoliticalNews = req.query.includePoliticalNews === 'true';
    // Если includeSectorNews, добавить секторные новости
    // Если includePoliticalNews, добавить политические новости (для российских акций)
});
```

### 4. Планировщик задач

#### 4.1. Scheduler для обновления секторных новостей

**Файл**: `server/src/utils/scheduler/sectorNewsUpdateUtils.js` (новый)

```javascript
/**
 * Обновление новостей для всех секторов
 * Запускается ежедневно в 6:00, 12:00, 18:00
 */
export async function updateSectorNews() {
    const sectors = SectorClassifier.getAvailableSectors();
    const languages = ['ru', 'en'];
    
    for (const sector of sectors) {
        for (const language of languages) {
            try {
                await SectorNewsService.fetchFreshSectorNews(sector, language);
            } catch (error) {
                LoggerService.error('Error updating sector news', {
                    sector,
                    language,
                    error
                });
            }
        }
    }
}

/**
 * Обновление политических новостей, касающихся РФ
 * Запускается ежедневно в 7:00, 13:00, 19:00 (смещено относительно секторных)
 */
export async function updatePoliticalNews() {
    const languages = ['ru', 'en'];
    const categories = [
        'sanctions',
        'elections',
        'policy',
        'international_relations',
        'economy_policy',
        'regulations',
        'trade'
    ];
    
    for (const language of languages) {
        try {
            // Обновляем общие политические новости
            await PoliticalNewsService.fetchFreshPoliticalNews(language);
            
            // Обновляем новости по категориям (приоритетные категории)
            const priorityCategories = ['sanctions', 'economy_policy', 'international_relations'];
            for (const category of priorityCategories) {
                try {
                    await PoliticalNewsService.fetchFreshPoliticalNews(language, category);
                } catch (error) {
                    LoggerService.error('Error updating political news by category', {
                        category,
                        language,
                        error
                    });
                }
            }
        } catch (error) {
            LoggerService.error('Error updating political news', {
                language,
                error
            });
        }
    }
}
```

**Интеграция в SchedulerService**:
- Добавить задачу в `server/src/services/SchedulerService.js`
- Секторные новости: каждые 6 часов (6:00, 12:00, 18:00)
- Политические новости: каждые 6 часов (7:00, 13:00, 19:00) - смещено для распределения нагрузки

### 5. Frontend

#### 5.1. Новый компонент: SectorNewsWidget

**Файл**: `client/src/components/news/SectorNewsWidget.tsx`

```typescript
interface SectorNewsWidgetProps {
    sector: string;
    figi?: string; // Если указан, показывать новости для конкретной акции
    language?: 'ru' | 'en' | 'both';
    maxItems?: number;
}

export const SectorNewsWidget: React.FC<SectorNewsWidgetProps> = ({
    sector,
    figi,
    language = 'ru',
    maxItems = 10
}) => {
    // Компонент для отображения секторных новостей
};
```

#### 5.2. Новый компонент: PoliticalNewsWidget

**Файл**: `client/src/components/news/PoliticalNewsWidget.tsx`

```typescript
interface PoliticalNewsWidgetProps {
    figi?: string; // Если указан, показывать новости для конкретной акции
    language?: 'ru' | 'en' | 'both';
    category?: 'sanctions' | 'elections' | 'policy' | 'international_relations' | 'economy_policy' | 'regulations' | 'trade' | null;
    impactLevel?: 'low' | 'medium' | 'high' | 'critical' | null;
    maxItems?: number;
    showCategories?: boolean; // Показывать фильтр по категориям
}

export const PoliticalNewsWidget: React.FC<PoliticalNewsWidgetProps> = ({
    figi,
    language = 'ru',
    category = null,
    impactLevel = null,
    maxItems = 10,
    showCategories = true
}) => {
    // Компонент для отображения политических новостей
    // - Фильтр по категориям
    // - Фильтр по уровню влияния
    // - Показ релевантности для конкретной акции (если указан figi)
    // - Визуальное выделение критичных новостей
};
```

#### 5.3. Расширение EnhancedNewsFeed

**Файл**: `client/src/components/news/EnhancedNewsFeed.tsx`

Добавить опции показа секторных и политических новостей:
```typescript
interface EnhancedNewsFeedProps {
    // ... существующие props
    includeSectorNews?: boolean;
    sectorNewsLanguage?: 'ru' | 'en' | 'both';
    includePoliticalNews?: boolean; // Для российских акций
    politicalNewsLanguage?: 'ru' | 'en' | 'both';
}
```

#### 5.4. API Service

**Файл**: `client/src/services/services/newsService.ts`

Добавить методы:

```typescript
/**
 * Получить новости для сектора
 */
async getSectorNews(
    sector: string,
    options?: {
        language?: 'ru' | 'en' | 'both';
        days?: number;
        limit?: number;
    }
): Promise<NewsAnalysis> {
    // ...
}

/**
 * Получить секторные новости для акции
 */
async getStockSectorNews(
    figi: string,
    options?: {
        language?: 'ru' | 'en' | 'both';
        limit?: number;
    }
): Promise<NewsAnalysis> {
    // ...
}

/**
 * Получить политические новости, касающиеся РФ
 */
async getPoliticalNews(
    options?: {
        language?: 'ru' | 'en' | 'both';
        category?: 'sanctions' | 'elections' | 'policy' | 'international_relations' | 'economy_policy' | 'regulations' | 'trade';
        impactLevel?: 'low' | 'medium' | 'high' | 'critical';
        days?: number;
        limit?: number;
    }
): Promise<NewsAnalysis> {
    // ...
}

/**
 * Получить политические новости для акции
 */
async getStockPoliticalNews(
    figi: string,
    options?: {
        language?: 'ru' | 'en' | 'both';
        category?: string;
        limit?: number;
    }
): Promise<NewsAnalysis> {
    // ...
}

/**
 * Получить категории политических новостей
 */
async getPoliticalNewsCategories(): Promise<string[]> {
    // ...
}
```

#### 5.5. Интеграция в StockDetailNew

**Файл**: `client/src/pages/StockDetailNew.tsx`

Добавить секции:
- **Секторные новости**: Отдельная вкладка или секция
  - Фильтр по языку
  - Показ релевантности для конкретной акции
  
- **Политические новости** (только для российских акций):
  - Отдельная вкладка или секция
  - Фильтр по категориям (санкции, выборы, экономическая политика и т.д.)
  - Фильтр по уровню влияния
  - Фильтр по языку
  - Визуальное выделение критичных новостей (красная рамка/бейдж)
  - Показ релевантности для конкретной акции

### 6. Ключевые слова для секторов и политических новостей

#### 6.1. Расширение маппинга секторов

**Файл**: `server/src/utils/sectorClassifier.js`

Добавить методы для получения поисковых запросов с использованием названий компаний из базы данных:

```javascript
/**
 * Получить базовые ключевые слова для сектора
 * @param {string} sector - Название сектора
 * @param {string} language - Язык ('ru' | 'en')
 * @returns {Array<string>} Массив базовых ключевых слов
 */
getSectorBaseKeywords(sector, language = 'ru') {
    const sectorKeywords = {
        energy: {
            ru: ['нефть', 'газ', 'нефтегазовый сектор', 'углеводороды', 'энергетика', 'ОПЕК+', 'экспорт нефти', 'цена на нефть'],
            en: ['oil', 'gas', 'oil and gas', 'hydrocarbons', 'energy', 'OPEC+', 'oil export', 'oil price']
        },
        materials: {
            ru: ['металлургия', 'чёрная металлургия', 'цветная металлургия', 'добыча', 'горная добыча', 'уголь', 'золото', 'сталь', 'никель', 'алюминий'],
            en: ['metallurgy', 'steel industry', 'non-ferrous metals', 'mining', 'coal', 'gold', 'steel', 'nickel', 'aluminum']
        },
        finance: {
            ru: ['банки', 'финансы', 'кредитование', 'ставка ЦБ', 'ключевая ставка', 'инфляция', 'ипотека', 'биржа'],
            en: ['banks', 'finance', 'lending', 'Central Bank rate', 'key rate', 'inflation', 'mortgage', 'exchange']
        },
        technology: {
            ru: ['IT', 'информационные технологии', 'импортозамещение', 'искусственный интеллект', 'AI', 'разработка ПО', 'цифровизация'],
            en: ['IT', 'information technology', 'software development', 'artificial intelligence', 'AI', 'digitalization']
        },
        consumer: {
            ru: ['ритейл', 'розничная торговля', 'потребительский рынок', 'FMCG'],
            en: ['retail', 'retail trade', 'consumer market', 'FMCG']
        },
        industrial: {
            ru: ['химическая промышленность', 'нефтехимия', 'удобрения', 'агрохимия'],
            en: ['chemical industry', 'petrochemistry', 'fertilizers', 'agrochemistry']
        },
        utilities: {
            ru: ['электроэнергетика', 'энергосбыт', 'генерация', 'мощность', 'тарифы'],
            en: ['electric power', 'energy sales', 'generation', 'capacity', 'tariffs']
        },
        transportation: {
            ru: ['транспорт', 'перевозки', 'логистика', 'инфраструктура'],
            en: ['transport', 'transportation', 'logistics', 'infrastructure']
        }
    };
    
    return sectorKeywords[sector]?.[language] || [];
}

/**
 * Получить ключевые слова для поиска новостей по сектору
 * Включает общие термины сектора и названия компаний из базы данных
 * @param {string} sector - Название сектора
 * @param {string} language - Язык ('ru' | 'en')
 * @returns {Promise<Array<string>>} Массив ключевых слов
 */
async getSectorKeywords(sector, language = 'ru') {
    // 1. Получить базовые ключевые слова сектора
    const baseKeywords = this.getSectorBaseKeywords(sector, language);
    
    // 2. Получить названия компаний из базы данных (CachedInstrument)
    // Фильтровать по сектору и брать названия компаний, а не тикеры
    const companies = await this.getCompaniesBySector(sector);
    const companyNames = companies
        .map(c => c.name)
        .filter(Boolean)
        .filter(name => name.length > 0); // Фильтруем пустые названия
    
    // 3. Объединить базовые ключевые слова и названия компаний
    return [...baseKeywords, ...companyNames];
}

/**
 * Получить компании по сектору из базы данных
 * @param {string} sector - Название сектора
 * @returns {Promise<Array>} Массив компаний с полями {name, ticker, figi}
 */
async getCompaniesBySector(sector) {
    const CachedInstrument = (await import('../models/CachedInstrument.js')).default;
    const instruments = await CachedInstrument.findAll({
        where: {
            sector: sector,
            isActive: true
        },
        attributes: ['name', 'ticker', 'figi'],
        limit: 50 // Ограничиваем количество для оптимизации запроса
    });
    return instruments.map(i => i.toJSON());
}
```

#### 6.2. Ключевые слова для политических новостей РФ

**Файл**: `server/src/services/PoliticalNewsService.js`

Базовые ключевые слова для поиска политических новостей:

```javascript
getPoliticalNewsKeywords(language = 'ru', category = null) {
    const baseKeywords = {
        ru: [
            'Россия', 'РФ', 'российский', 'Москва', 'Кремль', 
            'правительство', 'президент', 'Путин', 'Госдума',
            'Совет Федерации', 'министерство', 'Минфин', 'ЦБ РФ',
            'Центральный банк', 'российская экономика', 'российский рынок'
        ],
        en: [
            'Russia', 'Russian', 'Moscow', 'Kremlin', 'government',
            'president', 'Putin', 'State Duma', 'Federation Council',
            'ministry', 'Ministry of Finance', 'Central Bank of Russia',
            'CBR', 'Russian economy', 'Russian market'
        ]
    };
    
    const categoryKeywords = {
        sanctions: {
            ru: ['санкции', 'санкционный', 'эмбарго', 'ограничения', 'запрет', 'блокировка'],
            en: ['sanctions', 'sanction', 'embargo', 'restrictions', 'ban', 'blockade']
        },
        elections: {
            ru: ['выборы', 'избирательный', 'голосование', 'президентские выборы', 'парламентские выборы'],
            en: ['elections', 'election', 'voting', 'presidential election', 'parliamentary election']
        },
        policy: {
            ru: ['политика', 'реформа', 'закон', 'законодательство', 'инициатива', 'программа'],
            en: ['policy', 'reform', 'law', 'legislation', 'initiative', 'program']
        },
        international_relations: {
            ru: ['международные отношения', 'дипломатия', 'внешняя политика', 'посол', 'посольство'],
            en: ['international relations', 'diplomacy', 'foreign policy', 'ambassador', 'embassy']
        },
        economy_policy: {
            ru: [
                'экономическая политика', 'ЦБ', 'Центральный банк', 'инфляция', 
                'курс рубля', 'ключевая ставка', 'валютная политика', 'бюджет',
                'налог', 'налогообложение', 'Минэкономразвития'
            ],
            en: [
                'economic policy', 'central bank', 'inflation', 'ruble', 'ruble rate',
                'key rate', 'monetary policy', 'budget', 'tax', 'taxation', 'Ministry of Economic Development'
            ]
        },
        regulations: {
            ru: ['регулирование', 'надзор', 'контроль', 'лицензия', 'разрешение', 'норматив'],
            en: ['regulation', 'supervision', 'control', 'license', 'permit', 'normative']
        },
        trade: {
            ru: ['торговля', 'экспорт', 'импорт', 'таможня', 'таможенный', 'торговые отношения'],
            en: ['trade', 'export', 'import', 'customs', 'trade relations', 'commercial']
        }
    };
    
    let keywords = baseKeywords[language] || [];
    
    if (category && categoryKeywords[category]) {
        keywords = [...keywords, ...categoryKeywords[category][language]];
    }
    
    return keywords;
}
```

**Приоритетные источники для политических новостей**:
- РИА Новости
- ТАСС
- Интерфакс
- РБК
- Ведомости
- Коммерсант
- Reuters (для английских новостей)
- Bloomberg (для английских новостей)

## Этапы реализации

### Этап 1: База данных и модели (2-3 дня)

1. ✅ Создать миграцию для расширения CachedNews (секторные + политические поля)
2. ✅ Создать модель SectorNewsMapping
3. ✅ Создать миграцию для SectorNewsMapping
4. ✅ Обновить индексы (включая индексы для политических новостей)

**Файлы**:
- `server/migrations/add-sector-news-fields.js` (включая политические поля)
- `server/src/models/SectorNewsMapping.js`
- `server/migrations/create-sector-news-mapping.js`

### Этап 2: Backend сервисы (5-6 дней)

1. ✅ Создать SectorNewsService
2. ✅ Создать PoliticalNewsService
3. ✅ Расширить NewsApiService методами для секторов и политических новостей
4. ✅ Расширить SectorClassifier методами для поиска
5. ✅ Добавить анализ релевантности новостей для акций
6. ✅ Добавить классификацию политических новостей по категориям
7. ✅ Добавить определение уровня влияния политических новостей
8. ✅ Интегрировать с существующим NewsAnalysisService

**Файлы**:
- `server/src/services/SectorNewsService.js`
- `server/src/services/PoliticalNewsService.js` (новый)
- Обновить `server/src/services/NewsApiService.js`
- Обновить `server/src/utils/sectorClassifier.js`

### Этап 3: API Endpoints (2-3 дня)

1. ✅ Создать sector-news-routes.js
2. ✅ Создать political-news-routes.js
3. ✅ Расширить news-routes.js (includeSectorNews + includePoliticalNews)
4. ✅ Добавить валидацию и обработку ошибок
5. ✅ Добавить документацию

**Файлы**:
- `server/src/routes/sector-news-routes.js`
- `server/src/routes/political-news-routes.js` (новый)
- Обновить `server/src/routes/news-routes.js`
- Обновить `server/src/app.js` (регистрация роутов)

### Этап 4: Планировщик (1-2 дня)

1. ✅ Создать sectorNewsUpdateUtils.js
2. ✅ Добавить функцию updatePoliticalNews в sectorNewsUpdateUtils.js
3. ✅ Интегрировать в SchedulerService
4. ✅ Настроить расписание обновлений (секторные и политические)
5. ✅ Добавить мониторинг и логирование

**Файлы**:
- `server/src/utils/scheduler/sectorNewsUpdateUtils.js` (включая политические новости)
- Обновить `server/src/services/SchedulerService.js`

### Этап 5: Frontend (4-5 дней)

1. ✅ Создать SectorNewsWidget
2. ✅ Создать PoliticalNewsWidget
3. ✅ Расширить newsService (секторные + политические методы)
4. ✅ Интегрировать в StockDetailNew
5. ✅ Добавить фильтры и сортировку
6. ✅ Добавить визуальное выделение критичных политических новостей
7. ✅ Добавить стили

**Файлы**:
- `client/src/components/news/SectorNewsWidget.tsx`
- `client/src/components/news/SectorNewsWidget.css`
- `client/src/components/news/PoliticalNewsWidget.tsx` (новый)
- `client/src/components/news/PoliticalNewsWidget.css` (новый)
- Обновить `client/src/services/services/newsService.ts`
- Обновить `client/src/pages/StockDetailNew.tsx`

### Этап 6: Тестирование (3-4 дня)

1. ✅ Unit тесты для SectorNewsService
2. ✅ Unit тесты для PoliticalNewsService
3. ✅ Integration тесты для API (секторные + политические)
4. ✅ E2E тесты для frontend
5. ✅ Тестирование производительности
6. ✅ Тестирование с разными секторами и языками
7. ✅ Тестирование классификации политических новостей
8. ✅ Тестирование определения уровня влияния

**Файлы**:
- `server/src/__tests__/services/SectorNewsService.test.js`
- `server/src/__tests__/services/PoliticalNewsService.test.js` (новый)
- `server/src/__tests__/routes/sector-news-routes.test.js`
- `server/src/__tests__/routes/political-news-routes.test.js` (новый)
- `client/src/components/news/__tests__/SectorNewsWidget.test.tsx`
- `client/src/components/news/__tests__/PoliticalNewsWidget.test.tsx` (новый)

### Этап 7: Документация и оптимизация (1-2 дня)

1. ✅ Обновить API документацию
2. ✅ Добавить примеры использования
3. ✅ Оптимизация запросов к БД
4. ✅ Настройка кеширования
5. ✅ Мониторинг и метрики

## Технические детали

### Поисковые запросы для секторов

Для каждого сектора формируется запрос для параметра `q` endpoint `/v2/everything`:
1. Ключевые слова сектора (из SectorClassifier)
2. Названия секторов на соответствующем языке
3. Тикеры крупных компаний сектора (опционально, для более точных результатов)

**Рекомендации по использованию NewsAPI:**
- Использовать endpoint `/v2/everything` для поиска по ключевым словам
- `sortBy=publishedAt` для самых свежих новостей
- `sortBy=relevancy` для наиболее релевантных новостей
- Поиск по тикеру часто выдает новости, где упоминается компания

**Пример для сектора "energy" (нефть и газ) на русском**:
```
GET /v2/everything?q=нефть OR газ OR энергетика OR нефтегаз&language=ru&sortBy=relevancy
```

**Пример для сектора "energy" на английском**:
```
GET /v2/everything?q=oil and gas OR energy OR petroleum&language=en&sortBy=publishedAt
```

**Пример для сектора "technology" на русском**:
```
GET /v2/everything?q=технологии OR IT OR софт OR программное обеспечение&language=ru&sortBy=relevancy
```

**Пример для сектора "technology" на английском**:
```
GET /v2/everything?q=technology OR IT OR software OR tech&language=en&sortBy=publishedAt
```

**Пример с тикером компании**:
```
GET /v2/everything?q=GAZP OR LKOH OR NLMK&language=ru&sortBy=publishedAt
```

### Поисковые запросы для политических новостей РФ

Для политических новостей используется endpoint `/v2/everything` с параметрами:
1. `q` - поисковый запрос (ключевые слова о России)
2. `language` - язык источников (ru для русскоязычных, en для западной прессы)
3. `sortBy` - сортировка (publishedAt для свежих, relevancy для релевантных)

**Рекомендации по использованию NewsAPI:**
- Для поиска новостей о России использовать `q=russia` или `q=Россия`
- Для более точного поиска использовать кавычки: `q="Russian politics"`
- Для комбинации условий использовать AND: `q=Russia AND Ukraine`
- `language=ru` ограничит выдачу только источниками на русском языке
- `language=en` даст западную прессу о РФ

**Пример для общих политических новостей на русском**:
```
GET /v2/everything?q=Россия&language=ru&sortBy=relevancy&apiKey=YOUR_API_KEY
```

**Пример для общих политических новостей на английском**:
```
GET /v2/everything?q=Russia&language=en&sortBy=publishedAt&apiKey=YOUR_API_KEY
```

**Пример для категории "санкции" на русском**:
```
GET /v2/everything?q=Россия AND (санкции OR санкционный OR эмбарго)&language=ru&sortBy=relevancy
```

**Пример для категории "санкции" на английском**:
```
GET /v2/everything?q="Russian politics" AND (sanctions OR embargo)&language=en&sortBy=publishedAt
```

**Пример для категории "экономическая политика" на русском**:
```
GET /v2/everything?q=Россия AND (экономическая политика OR ЦБ OR инфляция)&language=ru&sortBy=relevancy
```

**Пример для категории "экономическая политика" на английском**:
```
GET /v2/everything?q=Russia AND (economic policy OR central bank OR inflation)&language=en&sortBy=publishedAt
```

### Релевантность новостей

#### Для секторных новостей

Алгоритм определения релевантности новости для акции:

1. **Прямое упоминание**: Новость содержит название компании или тикер
2. **Секторная принадлежность**: Новость относится к сектору акции
3. **Ключевые слова**: Совпадение ключевых слов из описания компании
4. **Sentiment анализ**: Анализ тональности новости

**Формула релевантности**:
```
relevanceScore = (
    directMention * 1.0 +
    sectorMatch * 0.7 +
    keywordMatch * 0.5 +
    sentimentMatch * 0.3
) / 2.5
```

#### Для политических новостей

Алгоритм определения релевантности политической новости для акции:

1. **Прямое упоминание**: Новость содержит название компании или тикер
2. **Секторная принадлежность**: Новость влияет на сектор акции
3. **Категория новости**: Релевантность категории для сектора
   - Санкции → влияют на все секторы (особенно энергетика, финансы)
   - Экономическая политика → влияет на все секторы
   - Регулирование → влияет на конкретные секторы
4. **Уровень влияния**: Критичные новости имеют больший вес
5. **Sentiment анализ**: Анализ тональности новости

**Формула релевантности для политических новостей**:
```
relevanceScore = (
    directMention * 1.0 +
    sectorImpact * 0.8 +
    categoryRelevance * 0.6 +
    impactLevelWeight * 0.4 +
    sentimentMatch * 0.3
) / 3.1

где:
- impactLevelWeight: critical=1.0, high=0.7, medium=0.4, low=0.2
- categoryRelevance: зависит от соответствия категории и сектора акции
```

**Матрица релевантности категорий для секторов**:
- **Санкции**: Все секторы (высокая релевантность)
- **Экономическая политика**: Все секторы (высокая релевантность)
- **Регулирование**: Финансы, энергетика, технологии (средняя-высокая)
- **Торговые отношения**: Энергетика, материалы, потребительские товары (средняя)
- **Международные отношения**: Все секторы (средняя релевантность)
- **Выборы**: Все секторы (низкая-средняя релевантность)
- **Внутренняя политика**: Все секторы (низкая релевантность)

### Кеширование

1. **Кеш новостей**: 24 часа (как в текущей модели)
2. **Кеш секторных новостей**: 12 часов (более частые обновления)
3. **Кеш политических новостей**: 6 часов (критичные новости требуют частых обновлений)
4. **Кеш привязок**: 6 часов (SectorNewsMapping)

### Rate Limiting

NewsAPI.org ограничения:
- Бесплатный план: 100 запросов/день
- Рекомендуется: 1 запрос/секунду

**Стратегия**:
- Батчинг запросов по секторам
- Приоритизация популярных секторов
- Fallback на кеш при превышении лимитов

## Риски и митигация

### Риск 1: Превышение лимитов NewsAPI
**Митигация**:
- Агрессивное кеширование
- Приоритизация секторов
- Использование FallbackService

### Риск 2: Низкая релевантность новостей
**Митигация**:
- Улучшение алгоритма релевантности
- Ручная модерация для критичных новостей
- Пользовательская обратная связь

### Риск 3: Дублирование новостей
**Митигация**:
- Уникальный индекс по URL
- Дедупликация перед сохранением
- Проверка по заголовку и дате

## Метрики успеха

1. **Покрытие**: 
   - Новости доступны для всех основных секторов
   - Политические новости покрывают все категории
2. **Актуальность**: 
   - Секторные новости обновляются минимум 3 раза в день
   - Политические новости обновляются минимум 3 раза в день
3. **Релевантность**: 
   - >70% секторных новостей релевантны для связанных акций
   - >60% политических новостей релевантны для российских акций
4. **Производительность**: 
   - Время ответа API < 500ms
   - Кеш hit rate > 80%
5. **Использование**: 
   - >50% пользователей просматривают секторные новости
   - >40% пользователей российских акций просматривают политические новости
6. **Качество классификации**: 
   - >85% политических новостей правильно классифицированы по категориям
   - >80% политических новостей имеют правильный уровень влияния

## Будущие улучшения

1. **Мультиязычный анализ**: Автоматический перевод новостей
2. **ML для релевантности**: Использование ML моделей для определения релевантности
3. **Персонализация**: Рекомендации новостей на основе портфеля пользователя
4. **Уведомления**: Push-уведомления о важных секторных новостях
5. **Аналитика**: Дашборд с аналитикой по секторам

## Зависимости

- NewsAPI.org API ключ
- Существующие сервисы: NewsApiService, SectorClassifier, CacheService
- База данных: Sequelize, PostgreSQL

## Временная оценка

**Общее время**: 18-23 рабочих дня (увеличено на 3 дня для политических новостей)

- База данных: 2-3 дня
- Backend: 5-6 дней (добавлен PoliticalNewsService)
- API: 2-3 дня (добавлены политические endpoints)
- Планировщик: 1-2 дня
- Frontend: 4-5 дней (добавлен PoliticalNewsWidget)
- Тестирование: 3-4 дня (добавлены тесты для политических новостей)
- Документация: 1-2 дня

## Приоритет

**Высокий** - Улучшает пользовательский опыт и предоставляет более полную информацию для принятия решений.

