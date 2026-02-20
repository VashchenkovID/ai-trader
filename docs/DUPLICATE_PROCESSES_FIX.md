# Исправление дублирования процессов

## Проблема

В системе наблюдалось дублирование процессов (обучения, обновления кеша и т.д.), что приводило к высокой нагрузке на память.

## Найденные проблемы

### 1. Weekly Forecast Training - отсутствие проверки перед запуском

**Проблема**: Функция `trainWeeklyForecastModelsForAllInstruments()` устанавливала флаг `_isFullWeeklyForecastTrainingActive = true` без проверки, не запущено ли уже обучение. Это позволяло запускать несколько процессов обучения параллельно.

**Исправление**: Добавлена проверка флага перед установкой:
```javascript
// КРИТИЧНО: Проверяем, не запущено ли уже обучение
if (_isFullWeeklyForecastTrainingActive) {
    throw new Error('Weekly Forecast training is already in progress...');
}
```

**Файл**: `server/src/utils/scheduler/weeklyForecastTrainingUtils.js`

### 2. Weekly Forecast Training в планировщике - отсутствие проверки флага

**Проблема**: Планировщик проверял только `this.isTraining`, но не проверял флаг `_isFullWeeklyForecastTrainingActive`, что могло привести к параллельным запускам.

**Исправление**: Добавлена проверка флага перед запуском:
```javascript
// КРИТИЧНО: Проверяем, не запущено ли уже обучение Weekly Forecast
const { isFullWeeklyForecastTrainingActive } = await import('../utils/scheduler/weeklyForecastTrainingUtils.js');
if (isFullWeeklyForecastTrainingActive()) {
    LoggerService.info('Weekly Forecast training skipped: already in progress');
    return;
}
```

**Файл**: `server/src/services/SchedulerService.js`

### 3. Обновление кеша - отсутствие защиты от параллельных запусков

**Проблема**: Функция `performCacheUpdate()` могла быть вызвана несколько раз одновременно (например, из планировщика и вручную), что приводило к параллельным обновлениям кеша.

**Исправление**: Добавлен флаг `isCacheUpdateRunning` и проверка перед запуском:
```javascript
// КРИТИЧНО: Проверяем, не запущено ли уже обновление кеша
if (this.isCacheUpdateRunning) {
    return { success: true, message: 'Cache update skipped - already in progress', skipped: true };
}

this.isCacheUpdateRunning = true;
try {
    // ... выполнение обновления ...
} finally {
    this.isCacheUpdateRunning = false;
}
```

**Файл**: `server/src/services/SchedulerService.js`

## Дополнительные проверки

### Проверка других процессов на дублирование

1. **Обучение нейросетей** - есть проверка `this.isTraining` в `SchedulerService`
2. **Обновление цен** - проверка через `shouldUpdateCache()` и временные метки
3. **Анализ портфеля** - есть проверка `this.isAnalyzing`

## Рекомендации

1. **Мониторинг**: Следить за логами на предмет предупреждений о пропуске дублирующихся задач
2. **Тестирование**: Проверить, что при одновременных вызовах запускается только один процесс
3. **Дополнительная защита**: Рассмотреть использование блокировок на уровне БД для критических операций

### 4. Weekly Forecast Training - дублирование обучения для одного инструмента

**Проблема**: Для каждого инструмента запускалось два воркера одновременно, что приводило к ошибкам "LayersVariable decoder_lstm_1/kernel is already disposed." и высокой нагрузке на память.

**Причина**: Функция `trainWeeklyForecastModel()` не проверяла, не запущено ли уже обучение для конкретного инструмента, что позволяло запускать несколько процессов обучения для одного и того же FIGI параллельно.

**Исправление**: Добавлен Map `_activeTrainingByFigi` для отслеживания активных обучений по FIGI:
```javascript
// Map для отслеживания активных обучений по FIGI (защита от дублирования)
const _activeTrainingByFigi = new Map();

// В начале trainWeeklyForecastModel:
if (_activeTrainingByFigi.has(figi)) {
    throw new Error(`Weekly Forecast training is already in progress for ${figi}...`);
}
_activeTrainingByFigi.set(figi, true);

// В finally блоке:
_activeTrainingByFigi.delete(figi);
```

**Файл**: `server/src/utils/scheduler/weeklyForecastTrainingUtils.js`

## Дата исправления

2026-02-20

