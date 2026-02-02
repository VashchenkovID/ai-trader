# Фоновые процессы: покрытие мониторингом воркеров

## Статус покрытия

Документ содержит список всех фоновых процессов системы и их статус покрытия мониторингом воркеров через `WorkerMonitoringService`.

---

## ✅ Процессы, УЖЕ покрытые мониторингом

1. **Обновление кеша** (`performCacheUpdate`)
   - Файл: `server/src/utils/scheduler/cacheUpdateUtils.js`
   - Тип воркера: `cache-update`
   - Статус: ✅ Покрыт

2. **Полное обучение нейросетей** (`performScheduledTraining`)
   - Файл: `server/src/services/SchedulerService.js`
   - Тип воркера: `training`
   - Статус: ✅ Покрыт

3. **Быстрое обучение нейросетей** (`performQuickTraining`)
   - Файл: `server/src/services/QuickTrainingService.js`
   - Тип воркера: `quick-training`
   - Статус: ✅ Покрыт

4. **Анализ портфеля** (`performPortfolioAnalysis`)
   - Файл: `server/src/services/NeuralNetworkService.js`
   - Тип воркера: `portfolio-analysis`
   - Статус: ✅ Покрыт

5. **Оптимизированное обучение**
   - Файл: `server/src/services/OptimizedTrainingService.js`
   - Тип воркера: `optimized-training`
   - Статус: ✅ Покрыт

6. **Обновление опционов** (`performOptionsDataUpdate`)
   - Файл: `server/src/workers/optionsDataUpdateWorker.js`
   - Тип воркера: `options-data-update`
   - Статус: ✅ Покрыт (через `executeWorkerTask`)

7. **Обновление цен акций** (`performPriceUpdate`)
   - Файл: `server/src/utils/scheduler/priceUpdateUtils.js`
   - Тип воркера: `price-update`
   - Статус: ✅ Покрыт (через `executeWorkerTask`)

8. **Обновление цен портфеля** (`performPortfolioPricesUpdate`)
   - Файл: `server/src/utils/scheduler/priceUpdateUtils.js`
   - Тип воркера: `portfolio-prices-update`
   - Статус: ✅ Покрыт (через `executeWorkerTask`)

9. **Обновление цен активных сигналов** (`performActiveSignalsPricesUpdate`)
   - Файл: `server/src/services/SchedulerService.js`
   - Тип воркера: `active-signals-prices-update`
   - Статус: ✅ Покрыт

10. **Обновление цен торговых заявок** (`performTradingRequestsPricesUpdate`)
    - Файл: `server/src/services/SchedulerService.js`
    - Тип воркера: `trading-requests-prices-update`
    - Статус: ✅ Покрыт

11. **Ежедневное обновление новостей** (`performDailyNewsUpdate`)
    - Файл: `server/src/services/SchedulerService.js`
    - Тип воркера: `news-daily-update`
    - Статус: ✅ Покрыт

12. **Еженедельная очистка новостей** (`performNewsCacheCleanup`)
    - Файл: `server/src/services/SchedulerService.js`
    - Тип воркера: `news-cache-cleanup`
    - Статус: ✅ Покрыт

13. **Обновление кеша Telegram** (`performTelegramCacheUpdate`)
    - Файл: `server/src/services/SchedulerService.js`
    - Тип воркера: `telegram-cache-update`
    - Статус: ✅ Покрыт

---

## ❌ Процессы, НЕ покрытые мониторингом

### 🔴 Критичные процессы (высокий приоритет)

*Все критичные процессы теперь покрыты мониторингом*

---

### 🟡 Важные процессы (средний приоритет)

#### 6. Проверка частичного закрытия позиций
- **Метод**: `PartialExitService.checkAndExecutePartialExits()`
- **Расписание**: Каждые 10 минут (вместе с обновлением цен портфеля)
- **Файл**: `server/src/services/SchedulerService.js`
- **Описание**: Проверяет и выполняет частичное закрытие позиций
- **Приоритет**: Высокий (торговые операции)

#### 7. Мониторинг позиций
- **Метод**: `PositionMonitoringService.checkAllPositions()`
- **Расписание**: Каждые 5 минут (`*/5 * * * *`)
- **Файл**: `server/src/services/SchedulerService.js`
- **Описание**: Проверяет все открытые позиции на предмет рисков
- **Приоритет**: Высокий (управление рисками)

#### 8. Проверка деградации моделей
- **Метод**: `checkDegradationAndRestoreAll()`
- **Расписание**: Каждые 6 часов (`0 */6 * * *`)
- **Файл**: `server/src/services/SchedulerService.js`
- **Описание**: Проверяет качество моделей и автоматически восстанавливает при деградации
- **Приоритет**: Высокий (качество предсказаний)

#### 9. Обновление предсказаний в рекомендациях
- **Метод**: `updateRecommendationsPredictions()`
- **Расписание**: Каждые 30 минут (`*/30 * * * *`)
- **Файл**: `server/src/services/SchedulerService.js`
- **Описание**: Обновляет предсказания нейросетей в рекомендациях
- **Приоритет**: Средний

#### 10. Обновление сигналов аналитиков
- **Метод**: `performSignalsUpdate()`
- **Расписание**: Каждый день в 6:00 (`0 6 * * *`)
- **Файл**: `server/src/services/SchedulerService.js`
- **Описание**: Обновляет сигналы аналитиков раз в день
- **Приоритет**: Средний

#### 11. Проверка трейлинг-стопов
- **Метод**: `checkTrailingStops()`
- **Расписание**: Каждые 5 минут (`*/5 * * * *`)
- **Файл**: `server/src/services/SchedulerService.js`
- **Описание**: Проверяет и обновляет трейлинг-стопы для позиций
- **Приоритет**: Высокий (управление рисками)

#### 12. Ребалансировка портфеля
- **Метод**: `performPortfolioRebalancing()`
- **Расписание**: Каждый день в 2:00 (`0 2 * * *`)
- **Файл**: `server/src/services/SchedulerService.js`
- **Описание**: Автоматическая ребалансировка портфеля
- **Приоритет**: Высокий (управление портфелем)

---

### 🟢 Периодические процессы (низкий приоритет)

#### 13. Очистка старых свечей
- **Метод**: `performCleanup()`
- **Расписание**: Каждый день в 2:00 (`0 2 * * *`)
- **Файл**: `server/src/services/SchedulerService.js`
- **Описание**: Удаляет старые свечи из базы данных
- **Приоритет**: Низкий

#### 14. Обновление торговых часов
- **Метод**: `TradingHoursService.checkAndSendNotifications()`
- **Расписание**: Каждые 5 минут (`*/5 * * * *`)
- **Файл**: `server/src/services/SchedulerService.js`
- **Описание**: Проверяет торговые часы и отправляет уведомления
- **Приоритет**: Низкий

#### 15. Обновление кеша торговых часов
- **Метод**: `TradingHoursCacheService.updateTradingHoursCache()`
- **Расписание**: Каждые 15 минут (`*/15 * * * *`)
- **Файл**: `server/src/services/SchedulerService.js`
- **Описание**: Обновляет кеш торговых часов
- **Приоритет**: Низкий

#### 16. Ежедневный отчет
- **Метод**: `DailyReportService.generateDailyReport()`
- **Расписание**: Каждый день в 20:00 (настраивается)
- **Файл**: `server/src/services/SchedulerService.js`
- **Описание**: Генерирует и отправляет ежедневный отчет в Telegram
- **Приоритет**: Низкий

#### 17. Автоматическая очистка данных
- **Метод**: `DataCleanupService.performCleanup()`
- **Расписание**: Каждый день в 2:00 (`0 2 * * *`)
- **Файл**: `server/src/services/SchedulerService.js`
- **Описание**: Автоматическая очистка устаревших данных
- **Приоритет**: Низкий

#### 18. Перебалансировка стратегий
- **Метод**: `StrategyAllocationService.rebalanceStrategies()`
- **Расписание**: Каждое воскресенье в 3:00 (`0 3 * * 0`)
- **Файл**: `server/src/services/SchedulerService.js`
- **Описание**: Автоматическая перебалансировка стратегий
- **Приоритет**: Средний

#### 19. Предрасчет корреляций
- **Метод**: `performCorrelationPrecalculation()`
- **Расписание**: Каждое воскресенье в 2:00 (`0 2 * * 0`)
- **Файл**: `server/src/services/SchedulerService.js`
- **Описание**: Предварительный расчет корреляций для популярных инструментов
- **Приоритет**: Низкий

#### 20. Динамическая перебалансировка бюджета
- **Метод**: `performDynamicBudgetRebalance()`
- **Расписание**: Каждое воскресенье в 4:00 (`0 4 * * 0`)
- **Файл**: `server/src/services/SchedulerService.js`
- **Описание**: Динамическое перераспределение бюджета по результативности
- **Приоритет**: Средний

#### 21. Еженедельный бэктестинг
- **Метод**: `performWeeklyBacktesting()`
- **Расписание**: Каждое воскресенье в 5:00 (`0 5 * * 0`)
- **Файл**: `server/src/services/SchedulerService.js`
- **Описание**: Еженедельный бэктестинг стратегий
- **Приоритет**: Средний

#### 22. Обновление макроэкономических данных
- **Метод**: `performMacroDataUpdate()`
- **Расписание**: Каждый день в 10:00 (`0 10 * * *`)
- **Файл**: `server/src/services/SchedulerService.js`
- **Описание**: Обновление макроэкономических данных
- **Приоритет**: Средний

#### 23. Обновление фундаментальных данных
- **Метод**: `performFundamentalDataUpdate()`
- **Расписание**: Каждые 1-е и 15-е число месяца в 2:00 (`0 2 1,15 * *`)
- **Файл**: `server/src/services/SchedulerService.js`
- **Описание**: Обновление квартальных фундаментальных данных
- **Приоритет**: Средний

---

## 📋 План действий

### Фаза 1: Критичные процессы (высокий приоритет)
1. ✅ Обновление цен активных сигналов
2. ✅ Обновление цен торговых заявок
3. ✅ Ежедневное обновление новостей
4. ⚠️ Еженедельная очистка новостей (низкий приоритет)
5. ⚠️ Обновление кеша Telegram (низкий приоритет)

### Фаза 2: Важные процессы (средний приоритет)
6. ✅ Проверка частичного закрытия позиций
7. ✅ Мониторинг позиций
8. ✅ Проверка деградации моделей
9. ⚠️ Обновление предсказаний (низкий приоритет)
10. ⚠️ Обновление сигналов аналитиков (низкий приоритет)
11. ✅ Проверка трейлинг-стопов
12. ✅ Ребалансировка портфеля

### Фаза 3: Периодические процессы (низкий приоритет)
13-23. Опционально, по мере необходимости

---

## 🔧 Как добавить мониторинг для процесса

### Шаблон кода:

```javascript
async performSomeProcess() {
    let workerId = null;
    
    try {
        // Регистрируем воркер в мониторинге
        const WorkerMonitoringService = (await import('./WorkerMonitoringService.js')).default;
        if (!WorkerMonitoringService.isInitialized) {
            await WorkerMonitoringService.initialize();
        }
        workerId = WorkerMonitoringService.registerWorker(
            'process-type', // Тип воркера (добавить в workerTypeTranslator.ts)
            'Название процесса',
            {
                stage: 'initializing',
                // Дополнительные метаданные
            }
        );
        
        // Выполняем процесс
        // ...
        
        // Обновляем прогресс
        if (workerId) {
            WorkerMonitoringService.updateWorkerStatus(workerId, {
                progress: 50,
                metadata: {
                    stage: 'processing',
                    // Дополнительные метаданные
                }
            });
        }
        
        // Завершаем воркер успешно
        if (workerId) {
            WorkerMonitoringService.completeWorker(workerId, true, {
                // Результаты
            });
        }
    } catch (error) {
        // Завершаем воркер с ошибкой
        if (workerId) {
            WorkerMonitoringService.reportWorkerError(workerId, error.message);
            WorkerMonitoringService.completeWorker(workerId, false, {
                error: error.message
            });
        }
        throw error;
    }
}
```

### Не забудьте:
1. Добавить перевод типа воркера в `client/src/utils/workerTypeTranslator.ts`
2. Обновлять прогресс во время выполнения процесса
3. Завершать воркер при успехе или ошибке

---

## 📊 Статистика

- **Всего процессов**: 30
- **Покрыто мониторингом**: 13 (43%)
- **Не покрыто**: 17 (57%)
  - Критичные: 0 ✅
  - Важные: 7
  - Периодические: 10

---

**Последнее обновление**: 2026-02-02
**Версия документа**: 1.1

