# API Services для Frontend

Этот пакет содержит все необходимые сервисы для работы с backend API нашего торгового приложения.

## 📁 Структура файлов

```
src/services/
├── apiService.ts      # Основной API сервис с методами для всех эндпоинтов
├── apiUtils.ts        # Утилиты для работы с API (форматирование, валидация, кеширование)
├── apiConstants.ts    # Константы и типы для API
├── index.ts          # Главный файл экспорта
└── README.md         # Документация
```

## 🚀 Быстрый старт

```typescript
import { apiService, ApiUtils, API_CONSTANTS } from './services';

// Получить статус системы
const systemStatus = await apiService.getSystemStatus();

// Получить портфель
const portfolio = await apiService.getPortfolio();

// Выполнить сделку
const tradeResult = await apiService.executeTrade('BUY', 'BBG004730N88', 10, 100.50);

// Форматирование данных
const formattedPrice = ApiUtils.formatCurrency(1000.50); // "1 000,50 ₽"
const formattedDate = ApiUtils.formatDate(new Date()); // "01.01.2024, 12:00"
```

## 📚 Основные сервисы

### 1. apiService.ts

Основной сервис с методами для всех API эндпоинтов, сгруппированными по функциональности:

#### Системные роуты
- `getSystemStatus()` - статус всех компонентов системы
- `getHealthStatus()` - health check

#### Торговые роуты
- `getPortfolio()` - получить портфель
- `getTradingStats()` - статистика торговли
- `getTradingTrades()` - история сделок
- `executeTrade()` - выполнить сделку

#### Рекомендации
- `getRecommendations()` - торговые рекомендации
- `getInstruments()` - доступные инструменты

#### Управление режимами
- `getTradingMode()` - текущий режим торговли
- `switchTradingMode()` - переключить режим

#### Риск-менеджмент
- `getRiskManagementStatus()` - статус риск-менеджмента
- `getRiskManagementStats()` - детальная статистика
- `updateRiskManagementLimits()` - обновить лимиты

#### AI сервисы
- `getAIStatus()` - статус AI
- `getAIRecommendation()` - получить рекомендацию
- `trainAllAI()` - обучить все AI сети

#### И многое другое...

### 2. apiUtils.ts

Утилиты для работы с API:

#### Форматирование
```typescript
ApiUtils.formatCurrency(1000.50); // "1 000,50 ₽"
ApiUtils.formatPercentage(0.15); // "15.0%"
ApiUtils.formatDate(new Date()); // "01.01.2024, 12:00"
```

#### Валидация
```typescript
ApiUtils.isValidFigi('BBG004730N88'); // true
ApiUtils.isValidQuantity(10); // true
ApiUtils.isValidPrice(100.50); // true
```

#### Обработка ошибок
```typescript
try {
  const data = await apiService.getPortfolio();
} catch (error) {
  const errorMessage = ApiUtils.handleApiError(error);
  console.error(errorMessage);
}
```

#### Кеширование
```typescript
const data = await useApiHooks.withCache(
  'portfolio',
  () => apiService.getPortfolio(),
  5 * 60 * 1000 // 5 минут
);
```

### 3. apiConstants.ts

Константы и типы для API:

#### Основные константы
```typescript
API_CONSTANTS.TRADING_MODES.PAPER; // 'paper'
API_CONSTANTS.RECOMMENDATIONS.BUY; // 'BUY'
API_CONSTANTS.STATUS.OK; // 'ok'
```

#### Утилиты для констант
```typescript
ApiConstantsUtils.getStatusColor('ok'); // '#10B981'
ApiConstantsUtils.getRecommendationIcon('BUY'); // '📈'
ApiConstantsUtils.isValidFigi('BBG004730N88'); // true
```

## 🎯 Примеры использования

### Получение данных с обработкой ошибок

```typescript
import { apiService, ApiUtils } from './services';

const fetchPortfolio = async () => {
  try {
    const portfolio = await apiService.getPortfolio();
    console.log('Портфель:', portfolio);
    return portfolio;
  } catch (error) {
    const errorMessage = ApiUtils.handleApiError(error);
    console.error('Ошибка получения портфеля:', errorMessage);
    return null;
  }
};
```

### Работа с рекомендациями

```typescript
import { apiService, ApiUtils, API_CONSTANTS } from './services';

const fetchRecommendations = async () => {
  try {
    const recommendations = await apiService.getRecommendations();
    
    return recommendations.map(rec => ({
      ...rec,
      formattedPrice: ApiUtils.formatCurrency(rec.priceAtAnalysis),
      formattedConfidence: ApiUtils.formatPercentage(rec.confidence),
      color: ApiConstantsUtils.getRecommendationColor(rec.recommendation),
      icon: ApiConstantsUtils.getRecommendationIcon(rec.recommendation)
    }));
  } catch (error) {
    console.error('Ошибка получения рекомендаций:', error);
    return [];
  }
};
```

### Переключение режима торговли

```typescript
import { apiService, ApiUtils } from './services';

const switchToMicroCapital = async () => {
  try {
    // Проверяем готовность
    const readiness = await apiService.checkMicroCapitalReadiness();
    
    if (readiness.canSwitch) {
      // Переключаем режим
      await apiService.switchTradingMode('micro');
      console.log('Режим переключен на микро-капитал');
    } else {
      console.log('Не готов к переключению:', readiness.recommendations);
    }
  } catch (error) {
    console.error('Ошибка переключения режима:', error);
  }
};
```

### Работа с WebSocket

```typescript
import { useWebSocket } from '../hooks/useWebSocket';

const Dashboard = () => {
  const { isConnected, lastMessage, sendMessage } = useWebSocket('ws://localhost:3001');

  useEffect(() => {
    if (lastMessage) {
      switch (lastMessage.type) {
        case 'portfolio_update':
          // Обновить портфель
          break;
        case 'recommendation':
          // Показать новую рекомендацию
          break;
        case 'risk_alert':
          // Показать алерт о риске
          break;
      }
    }
  }, [lastMessage]);

  return (
    <div>
      <div>Статус: {isConnected ? 'Подключен' : 'Отключен'}</div>
      {/* Остальной интерфейс */}
    </div>
  );
};
```

## 🔧 Настройка

### Переменные окружения

Создайте файл `.env` в корне проекта:

```env
REACT_APP_API_URL=http://localhost:3001
```

### Настройка таймаутов

```typescript
import { API_CONSTANTS } from './services';

// Использовать разные таймауты для разных запросов
const quickData = await apiService.getSystemStatus(); // 5 секунд
const normalData = await apiService.getPortfolio(); // 10 секунд
const longData = await apiService.trainAllAI('BBG004730N88'); // 30 секунд
```

## 📊 Типизация

Все методы API полностью типизированы:

```typescript
import type { 
  Portfolio, 
  TradingStats, 
  Recommendation,
  TradingMode 
} from './services';

const portfolio: Portfolio = await apiService.getPortfolio();
const stats: TradingStats = await apiService.getTradingStats();
const recommendations: Recommendation[] = await apiService.getRecommendations();
```

## 🚨 Обработка ошибок

Все методы API автоматически обрабатывают ошибки и возвращают понятные сообщения:

```typescript
try {
  const data = await apiService.getPortfolio();
} catch (error) {
  // Автоматическая обработка ошибок
  const message = ApiUtils.handleApiError(error);
  // message будет содержать понятное описание ошибки
}
```

## 🔄 Кеширование

Используйте встроенное кеширование для оптимизации производительности:

```typescript
// Кеширование на 5 минут
const portfolio = await useApiHooks.withCache(
  'portfolio',
  () => apiService.getPortfolio(),
  5 * 60 * 1000
);
```

## 📈 Мониторинг

Все API запросы логируются в консоль для отладки:

```typescript
// Включить детальное логирование
localStorage.setItem('debug', 'api:*');
```

## 🤝 Поддержка

При возникновении проблем:

1. Проверьте консоль браузера на ошибки
2. Убедитесь, что backend сервер запущен
3. Проверьте правильность URL в переменных окружения
4. Используйте встроенные утилиты для отладки

## 📝 Changelog

### v1.0.0
- Первоначальная версия
- Поддержка всех API эндпоинтов
- Полная типизация TypeScript
- Утилиты для форматирования и валидации
- Встроенное кеширование
- Обработка ошибок
