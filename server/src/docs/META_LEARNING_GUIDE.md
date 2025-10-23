# 🧠 Руководство по системе Meta-Learning

## Обзор

Система Meta-Learning (обучение обучению) позволяет быстро адаптировать модели к новым задачам и рыночным условиям, используя знания, полученные из предыдущих задач. Это особенно важно для торговых систем, где рыночные условия постоянно меняются.

## 🏗️ Архитектура

### Компоненты

1. **MetaLearningService** - Основной сервис с мета-моделью
2. **MetaKnowledge Model** - База данных мета-знаний
3. **Task Embedding** - Векторное представление задач
4. **API Routes** - REST API для управления мета-обучением

### Принцип работы

```
Новая задача → Эмбеддинг задачи → Мета-модель → Параметры адаптации → Быстрая адаптация целевой модели
```

## 🎯 Типы задач

### Поддерживаемые типы

1. **price_prediction** - Прогнозирование цен
2. **trend_classification** - Классификация трендов
3. **volatility_forecasting** - Прогнозирование волатильности
4. **sentiment_analysis** - Анализ сентимента
5. **risk_assessment** - Оценка рисков

### Эмбеддинг задачи

64-мерный вектор, включающий:
- **Рыночные характеристики** (5 значений): волатильность, тренд, объем, RSI, MACD
- **Временные характеристики** (3 значения): час, день недели, месяц
- **Производительность** (4 значения): точность, Sharpe ratio, просадка, win rate
- **Тип задачи** (5 значений): one-hot кодирование
- **Дополнение** (47 значений): нули для выравнивания

## 🚀 API Endpoints

### Инициализация

```http
POST /api/meta-learning/initialize
```

Инициализирует систему Meta-Learning.

### Адаптация к задаче

```http
POST /api/meta-learning/adapt
```

**Тело запроса:**
```json
{
    "taskData": {
        "marketData": {
            "volatility": 0.03,
            "trend": 1,
            "volume_ratio": 1.2,
            "rsi": 65,
            "macd": 1.5,
            "market_regime": "bullish"
        },
        "taskType": "price_prediction",
        "performance": {
            "accuracy": 0.75,
            "sharpe": 1.2,
            "maxDrawdown": 0.1,
            "winRate": 0.65
        },
        "supportSet": [
            {
                "features": [1, 2, 3, 4, 5],
                "labels": [1]
            }
        ]
    },
    "targetModel": {
        "inputShape": [10],
        "outputShape": [1]
    },
    "adaptationSteps": 5
}
```

**Ответ:**
```json
{
    "success": true,
    "message": "Адаптация к задаче завершена",
    "data": {
        "taskType": "price_prediction",
        "adaptationSteps": 5,
        "adaptedModel": {
            "inputShape": [10],
            "outputShape": [1]
        }
    }
}
```

### Обучение мета-модели

```http
POST /api/meta-learning/train-meta
```

**Тело запроса:**
```json
{
    "tasks": [
        {
            "marketData": {...},
            "taskType": "price_prediction",
            "performance": {...},
            "adaptationParams": [0.1, 0.2, 0.3, ...]
        }
    ]
}
```

### Поиск похожих задач

```http
POST /api/meta-learning/find-similar
```

**Тело запроса:**
```json
{
    "marketData": {
        "volatility": 0.03,
        "trend": 1,
        "volume_ratio": 1.2,
        "rsi": 65,
        "macd": 1.5
    },
    "taskType": "price_prediction",
    "performance": {
        "accuracy": 0.75,
        "sharpe": 1.2
    }
}
```

**Ответ:**
```json
{
    "success": true,
    "data": {
        "similarTasks": [
            {
                "id": 1,
                "marketRegime": "bullish",
                "taskType": "price_prediction",
                "similarity": 0.95,
                "performance": {...}
            }
        ],
        "count": 1
    }
}
```

### Статистика

```http
GET /api/meta-learning/stats
```

**Ответ:**
```json
{
    "success": true,
    "data": {
        "totalTasks": 50,
        "successfulAdaptations": 45,
        "averageAdaptationTime": 150.5,
        "knowledgeBaseSize": 100,
        "isInitialized": true,
        "adaptationRate": 0.01,
        "metaLearningRate": 0.001
    }
}
```

## ⚙️ Конфигурация

### Параметры мета-обучения

```javascript
{
    metaLearningRate: 0.001,        // Скорость обучения мета-модели
    adaptationRate: 0.01,           // Скорость адаптации
    metaBatchSize: 16,              // Размер батча для мета-обучения
    supportSetSize: 32,             // Размер support set
    querySetSize: 16                // Размер query set
}
```

### Обновление конфигурации

```http
PUT /api/meta-learning/config
```

**Тело запроса:**
```json
{
    "metaLearningRate": 0.0005,
    "adaptationRate": 0.005,
    "metaBatchSize": 32
}
```

## 🧠 Алгоритм Meta-Learning

### 1. Создание эмбеддинга задачи

```javascript
createTaskEmbedding(marketData, taskType, performance) {
    const embedding = [];
    
    // Рыночные характеристики
    embedding.push(marketData.volatility || 0);
    embedding.push(marketData.trend || 0);
    embedding.push(marketData.volume_ratio || 1);
    embedding.push(marketData.rsi || 50);
    embedding.push(marketData.macd || 0);
    
    // Временные характеристики
    const hour = new Date().getHours();
    const dayOfWeek = new Date().getDay();
    embedding.push(hour / 24);
    embedding.push(dayOfWeek / 7);
    
    // Сезонные характеристики
    const month = new Date().getMonth();
    embedding.push(month / 12);
    
    // Производительность
    embedding.push(performance.accuracy || 0);
    embedding.push(performance.sharpe || 0);
    embedding.push(performance.maxDrawdown || 0);
    embedding.push(performance.winRate || 0);
    
    // Тип задачи
    const taskTypeEmbedding = this.encodeTaskType(taskType);
    embedding.push(...taskTypeEmbedding);
    
    // Дополняем до 64 элементов
    while (embedding.length < 64) {
        embedding.push(0);
    }
    
    return embedding.slice(0, 64);
}
```

### 2. Адаптация к задаче

```javascript
async adaptToTask(taskData, targetModel, adaptationSteps = 5) {
    // Создаем эмбеддинг задачи
    const taskEmbedding = this.createTaskEmbedding(
        taskData.marketData,
        taskData.taskType,
        taskData.performance
    );
    
    // Получаем параметры адаптации от мета-модели
    const adaptationParams = await this.getAdaptationParameters(taskEmbedding);
    
    // Применяем адаптацию к целевой модели
    const adaptedModel = await this.applyAdaptation(targetModel, adaptationParams);
    
    // Выполняем несколько шагов градиентного спуска
    for (let step = 0; step < adaptationSteps; step++) {
        await this.performAdaptationStep(adaptedModel, taskData.supportSet);
    }
    
    return adaptedModel;
}
```

### 3. Обучение мета-модели

```javascript
async trainMetaModel(tasks) {
    const metaFeatures = [];
    const metaLabels = [];
    
    for (const task of tasks) {
        const taskEmbedding = this.createTaskEmbedding(
            task.marketData,
            task.taskType,
            task.performance
        );
        
        metaFeatures.push(taskEmbedding);
        metaLabels.push(task.adaptationParams);
    }
    
    const featuresTensor = tf.tensor2d(metaFeatures);
    const labelsTensor = tf.tensor2d(metaLabels);
    
    // Обучение мета-модели
    const history = await this.metaModel.fit(featuresTensor, labelsTensor, {
        epochs: 10,
        batchSize: this.metaBatchSize,
        validationSplit: 0.2,
        verbose: 0
    });
    
    return history;
}
```

## 📊 Мониторинг

### Метрики производительности

- **Total Tasks** - Общее количество задач
- **Successful Adaptations** - Успешные адаптации
- **Average Adaptation Time** - Среднее время адаптации
- **Knowledge Base Size** - Размер базы знаний
- **Adaptation Rate** - Скорость адаптации

### Логи мета-обучения

```
🧠 Инициализация Meta-Learning системы...
✅ Meta-Learning система инициализирована
🔄 Адаптация к новой задаче: price_prediction...
✅ Адаптация завершена за 150ms
```

## 🔧 Использование в коде

### Базовое использование

```javascript
import MetaLearningService from './services/MetaLearningService.js';

// Инициализация
await MetaLearningService.initialize();

// Создание эмбеддинга задачи
const embedding = MetaLearningService.createTaskEmbedding(
    marketData,
    'price_prediction',
    performance
);

// Адаптация к задаче
const adaptedModel = await MetaLearningService.adaptToTask(
    taskData,
    targetModel,
    5
);
```

### Поиск похожих задач

```javascript
// Поиск похожих задач
const similarTasks = await MetaLearningService.findSimilarTasks(
    embedding,
    10
);

console.log(`Найдено ${similarTasks.length} похожих задач`);
```

### Обучение мета-модели

```javascript
// Подготовка задач для обучения
const tasks = [
    {
        marketData: marketData1,
        taskType: 'price_prediction',
        performance: performance1,
        adaptationParams: params1
    },
    // ... больше задач
];

// Обучение мета-модели
const history = await MetaLearningService.trainMetaModel(tasks);
```

## 🧪 Тестирование

### Запуск тестов

```bash
node server/src/test-meta-learning.js
```

### Тестовые сценарии

1. **Инициализация** - Создание мета-модели и загрузка знаний
2. **Эмбеддинг задач** - Создание векторных представлений
3. **Адаптация** - Быстрая адаптация к новым задачам
4. **Поиск похожих** - Поиск релевантных задач
5. **Статистика** - Проверка метрик производительности
6. **Очистка** - Удаление старых знаний

## 🚨 Обработка ошибок

### Типичные ошибки

1. **Ошибки инициализации** - Проблемы с созданием мета-модели
2. **Ошибки адаптации** - Несовместимость моделей
3. **Ошибки эмбеддинга** - Некорректные данные задачи
4. **Ошибки поиска** - Проблемы с базой знаний

### Стратегии восстановления

```javascript
try {
    const adaptedModel = await MetaLearningService.adaptToTask(
        taskData,
        targetModel
    );
} catch (error) {
    console.error('Ошибка адаптации:', error);
    // Fallback к базовой модели, логирование, уведомления
}
```

## 🔮 Планы развития

### Краткосрочные улучшения

1. **Few-shot Learning** - Обучение на малом количестве примеров
2. **Multi-task Learning** - Одновременное решение нескольких задач
3. **Transfer Learning** - Перенос знаний между доменами
4. **Neural Architecture Search** - Автоматический поиск архитектуры

### Долгосрочные планы

1. **Continual Learning** - Непрерывное обучение без забывания
2. **Meta-Reinforcement Learning** - Мета-обучение для RL
3. **Automated ML** - Полностью автоматизированное ML
4. **Quantum Meta-Learning** - Квантовые алгоритмы мета-обучения

## 📚 Связанные документы

- [Reinforcement Learning Guide](./REINFORCEMENT_LEARNING_GUIDE.md)
- [Advanced AI Architecture](./ADVANCED_AI_ARCHITECTURE.md)
- [Company Sync Guide](./COMPANY_SYNC_GUIDE.md)
- [Performance Monitoring Guide](./PERFORMANCE_MONITORING_GUIDE.md)
