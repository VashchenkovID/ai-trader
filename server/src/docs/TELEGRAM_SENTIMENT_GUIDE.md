# 📱 Руководство по Telegram сентименту

## Обзор

Система анализа сентимента Telegram предназначена для мониторинга настроений инвесторов в российских финансовых каналах Telegram. Это единственный источник социальных данных в системе, оптимизированный для российского рынка.

## 🏗️ Архитектура

### Основные компоненты

1. **TelegramSentimentService** - Основной сервис анализа
2. **SocialSentimentService** - Обертка для совместимости
3. **API Routes** - REST API для взаимодействия
4. **Кеширование** - Оптимизация производительности

### Мониторируемые каналы

```javascript
const financialChannels = [
    '@investor_ru',        // Инвестор.ру
    '@tinkoff_invest',     // Тинькофф Инвестиции
    '@finam_ru',          // Финам
    '@bcs_express',       // БКС Экспресс
    '@investing_ru',      // Инвестиции
    '@moex_official',     // Московская биржа
    '@rbc_investments',   // РБК Инвестиции
    '@gazeta_business',   // Газета.ру Бизнес
    '@vedomosti_invest',  // Ведомости Инвестиции
    '@kommersant_finance' // Коммерсант Финансы
];
```

## 🚀 Использование

### Базовый анализ

```javascript
import TelegramSentimentService from './services/TelegramSentimentService.js';

// Анализ сентимента для компании
const analysis = await TelegramSentimentService.analyzeTelegramSentiment('BBG004730N88', {
    days: 7,        // За последние 7 дней
    limit: 100      // Максимум 100 сообщений
});

console.log('Сентимент:', analysis.sentiment);
console.log('Уверенность:', analysis.confidence);
console.log('Сообщений:', analysis.totalMessages);
```

### Анализ каналов

```javascript
// Анализ конкретных каналов
const channelAnalysis = await TelegramSentimentService.analyzeChannels(
    'Сбербанк', 
    'BBG004730N88', 
    { days: 3 }
);

console.log('Каналов:', channelAnalysis.channels.length);
console.log('Сообщений:', channelAnalysis.totalMessages);
console.log('Средний сентимент:', channelAnalysis.averageSentiment);
```

### Поиск по ключевым словам

```javascript
// Поиск по ключевым словам
const searchAnalysis = await TelegramSentimentService.analyzeSearch(
    'Сбербанк', 
    'BBG004730N88', 
    { days: 5 }
);

console.log('Поисковых запросов:', searchAnalysis.searches.length);
console.log('Найденных сообщений:', searchAnalysis.totalMessages);
```

## 📊 API Endpoints

### POST /api/telegram-sentiment/analyze/:figi

Анализ сентимента для конкретной компании.

**Параметры:**
- `figi` - FIGI компании
- `days` - Количество дней для анализа (по умолчанию 7)
- `limit` - Максимальное количество сообщений

**Ответ:**
```json
{
    "success": true,
    "data": {
        "sentiment": 0.65,
        "engagement": 45.2,
        "totalMessages": 127,
        "channels": 8,
        "searches": 3,
        "confidence": 0.78,
        "breakdown": {
            "channels": { /* ... */ },
            "search": { /* ... */ }
        },
        "timestamp": "2024-01-15T10:30:00.000Z"
    }
}
```

### GET /api/telegram-sentiment/social/:figi

Получение социальных сигналов (совместимость).

**Параметры:**
- `figi` - FIGI компании
- `days` - Количество дней для анализа

### GET /api/telegram-sentiment/channels/:figi

Анализ каналов для конкретной компании.

### GET /api/telegram-sentiment/search/:figi

Поиск по ключевым словам.

**Параметры:**
- `figi` - FIGI компании
- `term` - Поисковый термин (обязательный)

### GET /api/telegram-sentiment/stats

Получение статистики системы.

**Ответ:**
```json
{
    "success": true,
    "data": {
        "telegram": {
            "cacheSize": 15,
            "monitoredChannels": 10,
            "financialKeywords": 15,
            "hasBotToken": false,
            "hasApiCredentials": false
        },
        "social": {
            "cacheSize": 15,
            "platforms": ["telegram"],
            "isActive": true
        },
        "overview": {
            "totalChannels": 10,
            "totalKeywords": 15,
            "cacheSize": 15,
            "isConfigured": false
        }
    }
}
```

### POST /api/telegram-sentiment/clear-cache

Очистка кеша системы.

### GET /api/telegram-sentiment/channels

Получение списка мониторируемых каналов.

## ⚙️ Конфигурация

### Переменные окружения

```bash
# Telegram Bot (опционально)
TELEGRAM_BOT_TOKEN=your_bot_token

# Telegram API (опционально)
TELEGRAM_API_ID=your_api_id
TELEGRAM_API_HASH=your_api_hash
```

### Настройка каналов

Для добавления новых каналов отредактируйте массив `financialChannels` в `TelegramSentimentService.js`:

```javascript
this.financialChannels = [
    '@your_new_channel',
    // ... существующие каналы
];
```

### Настройка ключевых слов

Для добавления новых ключевых слов отредактируйте массив `financialKeywords`:

```javascript
this.financialKeywords = [
    'ваше_ключевое_слово',
    // ... существующие слова
];
```

## 🔧 Интеграция с реальным Telegram API

### Настройка Bot API

1. Создайте бота через @BotFather
2. Получите токен бота
3. Добавьте в переменные окружения:
   ```bash
   TELEGRAM_BOT_TOKEN=your_bot_token
   ```

### Настройка Client API

1. Получите API ID и Hash на https://my.telegram.org
2. Добавьте в переменные окружения:
   ```bash
   TELEGRAM_API_ID=your_api_id
   TELEGRAM_API_HASH=your_api_hash
   ```

### Обновление методов

Замените моковые методы в `TelegramSentimentService.js` на реальные вызовы Telegram API:

```javascript
async getChannelMessages(channel, companyName, options = {}) {
    // Реальная реализация через Telegram API
    const response = await fetch(`https://api.telegram.org/bot${this.telegramBotToken}/getUpdates`);
    // ... обработка ответа
}
```

## 📈 Метрики и мониторинг

### Ключевые метрики

- **Сентимент** - Средний сентимент сообщений (-1 до 1)
- **Engagement** - Средний уровень вовлеченности
- **Confidence** - Уверенность в анализе (0 до 1)
- **Coverage** - Покрытие каналов и поисков

### Кеширование

- **Время жизни кеша**: 30 минут
- **Автоматическая очистка** при переполнении
- **Ручная очистка** через API

### Логирование

```javascript
console.log('📱 Анализ Telegram сентимента для FIGI...');
console.log('✅ Telegram анализ завершен. Сентимент: 0.65');
console.log('⚠️ Ошибка анализа канала @investor_ru: API timeout');
```

## 🧪 Тестирование

### Запуск тестов

```bash
node server/src/test-telegram-sentiment.js
```

### Тестовые сценарии

1. **Базовый анализ** - Проверка основного функционала
2. **Анализ каналов** - Тест мониторинга каналов
3. **Поиск** - Тест поиска по ключевым словам
4. **Совместимость** - Тест интеграции с SocialSentimentService
5. **Кеширование** - Тест производительности кеша
6. **Статистика** - Тест метрик системы
7. **Разные компании** - Тест с различными FIGI

## 🔄 Интеграция с другими сервисами

### MultimodalLearningService

```javascript
// Получение социальных данных для мультимодального обучения
const socialData = await SocialSentimentService.analyzeSocialSentiment(figi);
const features = {
    sentiment: socialData.overall,
    confidence: socialData.confidence,
    engagement: socialData.platforms.telegram.engagement
};
```

### NeuralNetworkService

```javascript
// Использование в обучении нейросети
const socialFeatures = await SocialSentimentService.analyzeSocialSentiment(figi);
const trainingData = {
    price: priceData,
    technical: technicalData,
    social: socialFeatures.overall
};
```

## 🚨 Обработка ошибок

### Типичные ошибки

1. **API недоступен** - Fallback на моковые данные
2. **Превышение лимитов** - Автоматическая задержка
3. **Некорректные данные** - Валидация и фильтрация
4. **Таймауты** - Retry с экспоненциальной задержкой

### Стратегии восстановления

```javascript
try {
    const result = await this.analyzeTelegramSentiment(figi);
    return result;
} catch (error) {
    console.error('❌ Ошибка анализа Telegram:', error);
    return this.getFallbackAnalysis();
}
```

## 📚 Примеры использования

### Полный анализ компании

```javascript
const figi = 'BBG004730N88'; // Сбербанк

// 1. Анализ сентимента
const sentiment = await TelegramSentimentService.analyzeTelegramSentiment(figi, {
    days: 7,
    limit: 100
});

// 2. Анализ каналов
const channels = await TelegramSentimentService.analyzeChannels(
    'Сбербанк', 
    figi, 
    { days: 3 }
);

// 3. Поиск по ключевым словам
const search = await TelegramSentimentService.analyzeSearch(
    'Сбербанк', 
    figi, 
    { days: 5 }
);

// 4. Агрегация результатов
const overallSentiment = (sentiment.sentiment + channels.averageSentiment + search.averageSentiment) / 3;
```

### Мониторинг в реальном времени

```javascript
// Периодический анализ каждые 30 минут
setInterval(async () => {
    const companies = ['BBG004730N88', 'BBG004730ZJ9', 'BBG004730N88'];
    
    for (const figi of companies) {
        const analysis = await TelegramSentimentService.analyzeTelegramSentiment(figi);
        
        if (Math.abs(analysis.sentiment) > 0.7) {
            console.log(`🚨 Сильный сентимент для ${figi}: ${analysis.sentiment}`);
        }
    }
}, 30 * 60 * 1000);
```

## 🎯 Преимущества

1. **Специализация** - Фокус на российском рынке
2. **Производительность** - Оптимизированная архитектура
3. **Надежность** - Fallback на моковые данные
4. **Масштабируемость** - Легкое добавление каналов
5. **Совместимость** - Интеграция с существующими сервисами

## 🔮 Планы развития

1. **Реальная интеграция** с Telegram API
2. **ML-анализ** сентимента
3. **Автоматическое обнаружение** новых каналов
4. **Геотаргетинг** по регионам
5. **Временные паттерны** активности
