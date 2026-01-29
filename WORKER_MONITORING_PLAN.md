# План системы мониторинга воркеров

## Цель
Создать систему отслеживания статуса воркеров на фронтенде с возможностью видеть:
- Какие воркеры работают
- Какие воркеры на паузе
- График работы воркеров во времени
- Статистику использования воркеров

## Архитектура

### 1. Бэкенд - WorkerMonitoringService
**Файл:** `server/src/services/WorkerMonitoringService.js`

**Функционал:**
- Отслеживание всех активных воркеров в системе
- Регистрация событий воркеров (старт, пауза, завершение, ошибка)
- Хранение истории работы воркеров
- Метрики производительности (время работы, использование CPU/памяти)

**Структура данных:**
```javascript
{
  workerId: string,           // Уникальный ID воркера
  type: string,                // Тип воркера (training, analysis, price-update, etc.)
  name: string,               // Человекочитаемое имя
  status: 'running' | 'paused' | 'completed' | 'error' | 'idle',
  startTime: Date,            // Время начала работы
  endTime: Date | null,       // Время завершения
  duration: number,           // Длительность в мс
  progress: number,           // Прогресс 0-100
  metadata: {                 // Дополнительные данные
    figi?: string,
    instrument?: string,
    currentStage?: string,
    error?: string
  },
  resourceUsage: {            // Использование ресурсов
    cpu?: number,
    memory?: number
  }
}
```

**API методы:**
- `registerWorker(workerId, type, name, metadata)` - Регистрация нового воркера
- `updateWorkerStatus(workerId, status, progress, metadata)` - Обновление статуса
- `completeWorker(workerId, success, result)` - Завершение воркера
- `pauseWorker(workerId)` - Пауза воркера
- `resumeWorker(workerId)` - Возобновление воркера
- `getActiveWorkers()` - Получить все активные воркеры
- `getWorkerHistory(workerId, limit)` - История работы воркера
- `getWorkersByType(type)` - Воркеры по типу
- `getWorkerStats(period)` - Статистика за период

### 2. Бэкенд - API роуты
**Файл:** `server/src/routes/worker-monitoring-routes.js`

**Эндпоинты:**
- `GET /api/workers/status` - Текущий статус всех воркеров
- `GET /api/workers/:workerId` - Детальная информация о воркере
- `GET /api/workers/history/:workerId?limit=50` - История работы
- `GET /api/workers/stats?period=24h` - Статистика за период
- `POST /api/workers/:workerId/pause` - Поставить воркер на паузу
- `POST /api/workers/:workerId/resume` - Возобновить воркер
- `GET /api/workers/timeline?startDate&endDate` - Временная линия работы воркеров

### 3. Бэкенд - WebSocket события
**Интеграция в WebSocketService:**
- `worker_started` - Воркер запущен
- `worker_progress` - Обновление прогресса
- `worker_completed` - Воркер завершен
- `worker_error` - Ошибка воркера
- `worker_paused` - Воркер поставлен на паузу
- `worker_resumed` - Воркер возобновлен
- `worker_status_update` - Общее обновление статуса

### 4. Бэкенд - Интеграция с существующими сервисами

**OptimizedTrainingService:**
- Регистрация воркеров обучения при запуске
- Обновление прогресса через WorkerMonitoringService
- Завершение воркеров при завершении обучения

**NeuralNetworkService:**
- Регистрация воркеров анализа портфеля
- Отслеживание статуса анализа

**SchedulerService:**
- Регистрация периодических воркеров (обновление цен, кеша и т.д.)

### 5. Фронтенд - Компоненты

#### 5.1 WorkerStatusDashboard
**Файл:** `client/src/components/workers/WorkerStatusDashboard.tsx`

**Функционал:**
- Список всех активных воркеров с их статусами
- Фильтрация по типу воркера
- Поиск по имени/ID
- Действия: пауза/возобновление

**Компоненты:**
- WorkerStatusCard - карточка статуса воркера
- WorkerProgressBar - прогресс-бар воркера
- WorkerActions - кнопки управления

#### 5.2 WorkerTimelineChart
**Файл:** `client/src/components/workers/WorkerTimelineChart.tsx`

**Функционал:**
- График работы воркеров во времени (Gantt-подобный)
- Визуализация периодов работы/паузы
- Масштабирование по времени
- Фильтрация по типам воркеров

**Библиотека:** Chart.js или Recharts для временной шкалы

#### 5.3 WorkerStatsPanel
**Файл:** `client/src/components/workers/WorkerStatsPanel.tsx`

**Функционал:**
- Статистика использования воркеров
- Графики: количество активных воркеров по времени
- Метрики: среднее время работы, успешность выполнения
- Топ воркеров по времени работы

#### 5.4 WorkerDetailsModal
**Файл:** `client/src/components/workers/WorkerDetailsModal.tsx`

**Функционал:**
- Детальная информация о воркере
- История выполнения
- Логи воркера (если доступны)
- График прогресса

### 6. Фронтенд - API сервис
**Файл:** `client/src/services/workerMonitoringApi.ts`

**Методы:**
- `getWorkersStatus()` - Получить статус всех воркеров
- `getWorkerDetails(workerId)` - Детали воркера
- `getWorkerHistory(workerId, limit)` - История
- `getWorkerStats(period)` - Статистика
- `pauseWorker(workerId)` - Пауза
- `resumeWorker(workerId)` - Возобновление
- `getWorkerTimeline(startDate, endDate)` - Временная линия

### 7. Фронтенд - WebSocket интеграция
**Интеграция в WebSocketContext:**
- Подписка на события воркеров
- Автоматическое обновление UI при изменении статуса
- Обработка событий прогресса

### 8. Фронтенд - Страница мониторинга
**Файл:** `client/src/pages/WorkerMonitoring/WorkerMonitoring.tsx`

**Структура:**
- Вкладка "Текущий статус" - WorkerStatusDashboard
- Вкладка "График работы" - WorkerTimelineChart
- Вкладка "Статистика" - WorkerStatsPanel

## Этапы реализации

### Этап 1: Бэкенд - Базовый мониторинг
1. Создать WorkerMonitoringService
2. Реализовать регистрацию и отслеживание воркеров
3. Добавить API роуты для получения статуса
4. Интегрировать в OptimizedTrainingService

### Этап 2: Бэкенд - WebSocket события
1. Добавить события в WebSocketService
2. Отправка событий при изменении статуса воркеров
3. Интеграция в существующие сервисы

### Этап 3: Фронтенд - Базовый UI
1. Создать WorkerStatusDashboard
2. Интегрировать API для получения статуса
3. Отображение списка воркеров с их статусами

### Этап 4: Фронтенд - График работы
1. Создать WorkerTimelineChart
2. Реализовать временную шкалу
3. Визуализация периодов работы/паузы

### Этап 5: Фронтенд - Статистика и детали
1. Создать WorkerStatsPanel
2. Создать WorkerDetailsModal
3. Добавить графики статистики

### Этап 6: Интеграция и тестирование
1. Интегрировать во все сервисы с воркерами
2. Тестирование в реальных условиях
3. Оптимизация производительности

## Дополнительные возможности

### Расширенный мониторинг
- Мониторинг использования ресурсов (CPU, память)
- Алерты при превышении лимитов
- Автоматическая пауза при проблемах

### История и аналитика
- Сохранение истории в БД
- Аналитика производительности
- Рекомендации по оптимизации

### Управление
- Приоритеты воркеров
- Очередь выполнения
- Автоматическое перезапуск при ошибках

## Технические детали

### Хранение данных
- Активные воркеры: в памяти (Map/Set)
- История: БД (таблица worker_history)
- Статистика: кеш + периодический расчет

### Производительность
- Кеширование статуса воркеров
- Батчинг обновлений через WebSocket
- Оптимизация запросов к БД

### Безопасность
- Проверка прав доступа к управлению воркерами
- Валидация входных данных
- Защита от DoS через ограничение запросов

