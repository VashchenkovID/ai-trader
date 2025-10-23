# 🤖 Руководство по системе Reinforcement Learning

## Обзор

Система Reinforcement Learning использует Deep Q-Network (DQN) для обучения торговым стратегиям через взаимодействие с рыночной средой. Агент учится принимать оптимальные решения о покупке, продаже или удержании позиций на основе рыночных данных.

## 🏗️ Архитектура

### Компоненты

1. **ReinforcementLearningService** - Основной сервис с DQN агентом
2. **RLDataProvider** - Провайдер рыночных данных и технических индикаторов
3. **RLExperience Model** - Модель для хранения опыта агента
4. **API Routes** - REST API для управления обучением

### Архитектура DQN

```
Входной слой (20 признаков)
    ↓
Dense(128) + ReLU + Dropout(0.2)
    ↓
Dense(64) + ReLU + Dropout(0.2)
    ↓
Dense(32) + ReLU
    ↓
Выходной слой (3 действия: HOLD, BUY, SELL)
```

## 🎯 Принцип работы

### 1. Состояние (State)

Вектор из 20 признаков:
- **Технические индикаторы**: RSI, MACD, Bollinger Bands, SMA, EMA, Stochastic
- **Рыночные условия**: волатильность, тренд, momentum, объем
- **Портфель**: наличные, позиция, PnL, общая стоимость
- **Новостной сентимент**: тональность новостей

### 2. Действия (Actions)

- **0: HOLD** - Удержание позиции
- **1: BUY** - Покупка акций
- **2: SELL** - Продажа акций

### 3. Награда (Reward)

```javascript
reward = pnl * 0.01                    // Базовая награда за прибыль
       - 0.001 * (action !== 0)        // Штраф за частые сделки
       + 0.1 * correctDecision         // Бонус за правильные решения
       - 0.1 * (drawdown > 0.1)        // Штраф за большие просадки
       + 0.05 * riskManagement         // Бонус за управление рисками
```

### 4. Обучение

- **ε-greedy стратегия**: баланс между исследованием и эксплуатацией
- **Experience Replay**: переиспользование прошлого опыта
- **Target Network**: стабилизация обучения
- **Double DQN**: уменьшение переоценки Q-значений

## 🚀 API Endpoints

### Инициализация

```http
POST /api/reinforcement-learning/initialize
```

Инициализирует RL агента с новой архитектурой.

### Обучение

```http
POST /api/reinforcement-learning/train
```

**Тело запроса:**
```json
{
    "figi": "BBG004730N88",
    "episodes": 50,
    "days": 30
}
```

**Ответ:**
```json
{
    "success": true,
    "message": "Обучение завершено. Эпизодов: 50",
    "data": {
        "results": [...],
        "stats": {
            "totalEpisodes": 50,
            "averageReward": 125.5,
            "bestReward": 250.0,
            "epsilon": 0.1,
            "memorySize": 1000
        }
    }
}
```

### Получение рекомендации

```http
POST /api/reinforcement-learning/recommendation
```

**Тело запроса:**
```json
{
    "figi": "BBG004730N88",
    "portfolio": {
        "cash": 10000,
        "position": 0,
        "total_value": 10000
    }
}
```

**Ответ:**
```json
{
    "success": true,
    "data": {
        "recommendation": {
            "action": 1,
            "actionName": "BUY",
            "confidence": 0.85,
            "state": [...],
            "timestamp": "2024-01-15T10:30:00.000Z"
        },
        "marketData": {
            "price": 250.5,
            "volume": 1000000,
            "rsi": 65.2,
            "macd": 1.5,
            "volatility": 0.03,
            "trend": 1,
            "market_regime": "bullish"
        },
        "newsSentiment": 0.7
    }
}
```

### Статистика обучения

```http
GET /api/reinforcement-learning/stats
```

**Ответ:**
```json
{
    "success": true,
    "data": {
        "totalEpisodes": 100,
        "totalReward": 12500.0,
        "averageReward": 125.0,
        "bestReward": 500.0,
        "winRate": 0.65,
        "averageEpisodeLength": 150,
        "epsilon": 0.05,
        "memorySize": 5000,
        "isTraining": false,
        "currentEpisode": 100
    }
}
```

### Тестирование

```http
POST /api/reinforcement-learning/test
```

**Тело запроса:**
```json
{
    "figi": "BBG004730N88",
    "episodes": 10,
    "days": 30
}
```

### Визуализация

```http
GET /api/reinforcement-learning/visualization/{figi}?days=30
```

## ⚙️ Конфигурация

### Параметры агента

```javascript
{
    stateSize: 20,              // Размер вектора состояния
    actionSize: 3,              // Количество действий
    learningRate: 0.001,        // Скорость обучения
    gamma: 0.95,                // Коэффициент дисконтирования
    epsilon: 1.0,               // Начальная вероятность случайного действия
    epsilonMin: 0.01,           // Минимальная вероятность
    epsilonDecay: 0.995,        // Скорость уменьшения epsilon
    batchSize: 32,              // Размер батча для обучения
    maxMemorySize: 10000,       // Максимальный размер памяти
    updateTargetFreq: 100       // Частота обновления целевой сети
}
```

### Обновление конфигурации

```http
PUT /api/reinforcement-learning/config
```

**Тело запроса:**
```json
{
    "learningRate": 0.0005,
    "gamma": 0.9,
    "epsilonMin": 0.005,
    "batchSize": 64
}
```

## 🧠 Алгоритм обучения

### 1. Инициализация

```javascript
// Создание основной и целевой сетей
this.agent = this.createDQN();
this.targetAgent = this.createDQN();
this.targetAgent.setWeights(this.agent.getWeights());
```

### 2. Эпизод обучения

```javascript
while (stepCount < maxSteps) {
    // Выбор действия (ε-greedy)
    const action = await this.chooseAction(state, true);
    
    // Выполнение действия
    const newPortfolio = this.executeAction(action, portfolio, marketData);
    
    // Получение награды
    const reward = this.calculateReward(action, marketData, newPortfolio, portfolio);
    
    // Сохранение опыта
    this.storeExperience(state, action, reward, nextState, done);
    
    // Обучение
    if (this.memory.length >= this.batchSize) {
        await this.train();
    }
}
```

### 3. Обучение сети

```javascript
// Выборка случайного батча
const batch = this.sampleBatch();

// Вычисление целевых Q-значений
const targets = await this.computeTargets(states, actions, rewards, nextStates, dones);

// Обучение модели
const history = await this.agent.fit(statesTensor, targetsTensor, {
    epochs: 1,
    verbose: 0
});
```

## 📊 Мониторинг обучения

### Метрики производительности

- **Total Episodes** - Общее количество эпизодов
- **Average Reward** - Средняя награда за эпизод
- **Best Reward** - Лучшая награда
- **Win Rate** - Процент прибыльных эпизодов
- **Epsilon** - Текущая вероятность случайного действия
- **Memory Size** - Размер памяти опыта

### Логи обучения

```
🎯 Запуск эпизода 1...
✅ Эпизод 1 завершен. Награда: 125.50, Шагов: 150
🎯 Запуск эпизода 2...
✅ Эпизод 2 завершен. Награда: 98.30, Шагов: 120
...
```

## 🔧 Использование в коде

### Базовое использование

```javascript
import ReinforcementLearningService from './services/ReinforcementLearningService.js';
import RLDataProvider from './services/RLDataProvider.js';

// Инициализация
await ReinforcementLearningService.initialize();

// Инициализация данных
await RLDataProvider.initialize('BBG004730N88', 30);

// Получение рекомендации
const recommendation = await ReinforcementLearningService.getTradingRecommendation(
    RLDataProvider.getCurrentData(),
    { cash: 10000, position: 0, total_value: 10000 },
    RLDataProvider.getNewsSentiment()
);
```

### Обучение агента

```javascript
// Запуск обучения
const results = [];
for (let i = 0; i < 50; i++) {
    RLDataProvider.reset();
    const result = await ReinforcementLearningService.runEpisode(
        RLDataProvider,
        { cash: 10000, position: 0, total_value: 10000 }
    );
    results.push(result);
}
```

### Сохранение и загрузка модели

```javascript
// Сохранение
await ReinforcementLearningService.saveModel();

// Загрузка
await ReinforcementLearningService.loadModel();
```

## 🧪 Тестирование

### Запуск тестов

```bash
node server/src/test-reinforcement-learning.js
```

### Тестовые сценарии

1. **Инициализация** - Создание агента и провайдера данных
2. **Получение данных** - Тестирование рыночных данных
3. **Рекомендации** - Получение торговых рекомендаций
4. **Обучение** - Запуск эпизодов обучения
5. **Статистика** - Проверка метрик производительности
6. **Сохранение** - Тестирование сохранения модели

## 🚨 Обработка ошибок

### Типичные ошибки

1. **Ошибки инициализации** - Проверка доступности TensorFlow.js
2. **Ошибки данных** - Валидация рыночных данных
3. **Ошибки обучения** - Обработка NaN значений
4. **Ошибки памяти** - Ограничение размера памяти

### Стратегии восстановления

```javascript
try {
    await ReinforcementLearningService.runEpisode(dataProvider, portfolio);
} catch (error) {
    console.error('Ошибка эпизода:', error);
    // Сброс состояния, логирование, уведомления
}
```

## 🔮 Планы развития

### Краткосрочные улучшения

1. **Prioritized Experience Replay** - Приоритизация важного опыта
2. **Dueling DQN** - Разделение оценки состояния и действий
3. **Multi-step Learning** - Обучение на последовательностях
4. **Curriculum Learning** - Постепенное усложнение задач

### Долгосрочные планы

1. **Actor-Critic методы** - A2C, A3C, PPO
2. **Multi-agent системы** - Конкуренция агентов
3. **Hierarchical RL** - Многоуровневое обучение
4. **Meta-Learning** - Быстрая адаптация к новым условиям

## 📚 Связанные документы

- [Advanced AI Architecture](./ADVANCED_AI_ARCHITECTURE.md)
- [Company Sync Guide](./COMPANY_SYNC_GUIDE.md)
- [Performance Monitoring Guide](./PERFORMANCE_MONITORING_GUIDE.md)
- [Evaluation System Guide](./EVALUATION_SYSTEM_GUIDE.md)
