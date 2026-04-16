# Prod Error Fix Plan (по логам 2026-04-11..2026-04-16)

Документ фиксирует **что реально нужно править** по присланным ошибкам, в порядке приоритета.

---

## 1) Краткий вывод по логам

### Критично (чинить в первую очередь)

1. `Scheduler job weekly_generation failed: ... /app/lightning_logs/version_xxx/metrics.csv`
2. `apscheduler ... _runner ... raised an exception` (следствие пункта 1)

### Важно, но не блокер

3. Массовые `Tinkoff API request failed ... HTTP 503 / ConnectTimeout / ReadTimeout`

### Шум/наблюдаемость (не авария)

4. `asyncio ConnectionClosedError ... keepalive ping timeout`

---

## 2) Что править обязательно

## A. Падение `weekly_generation` из-за `metrics.csv` (P0)

### Симптом

- Ежедневно в 08:00 падает `weekly_generation`.
- Следом падает обертка APScheduler.

### Вероятная причина

- В 08:00 одновременно стартуют как минимум:
  - `TRAINING_QUICK_CRON=0 8,10,12,14,16,18 * * *`
  - `WEEKLY_GENERATION_CRON=0 8 * * *`
- Оба training-контура работают с общим `LIGHTNING_LOGS_DIR` и чистят `version_*` через `prune_lightning_raw_dirs`.
- Один job может удалить raw-лог другого во время/сразу после train, что и дает `No such file or directory ... metrics.csv`.

### Где править

- `server_fastapi/app/scheduler.py`
- `server_fastapi/training/run_weekly.py`
- `server_fastapi/training/run_nn.py`
- `server_fastapi/training/logs_rollup.py`
- `server_fastapi/.env` (prod)

### Конкретные правки

- [ ] **Развести расписание**: убрать совпадение `training_quick` и `weekly_generation` по времени (минимум +10-20 минут между ними).
- [ ] **Добавить глобальный lock на training jobs** в scheduler (mutex на `training_*`/`weekly_*` задачи), чтобы они не выполнялись параллельно.
- [ ] **Убрать inline-prune из training run** (или сделать безопасным): чистка `lightning_logs/version_*` должна идти отдельной cron-задачей, а не внутри каждого training job.
- [ ] **Fail-safe вокруг чтения raw-логов**: если `metrics.csv` отсутствует, не падать всем job, а завершать run с деградацией + warning.
- [ ] **(Опционально)** сделать разные raw dirs для разных контуров (`lightning_logs/nn`, `lightning_logs/weekly`) чтобы исключить взаимное удаление.

### Критерий приемки

- `weekly_generation` 3+ дня подряд завершается без `metrics.csv` ошибок.
- В логах нет `apscheduler ... raised an exception` для 08:00 training окна.

---

## B. Tinkoff 503/timeout шторм (P1)

### Симптом

- Всплески `HTTP 503`, `ConnectTimeout`, `ReadTimeout`, handshake timeout.
- Много повторов для `GetLastPrices`, `GetTradingStatus`, `GetPortfolio`, `GetSignals`.

### Факт

- Это в основном внешняя деградация API провайдера, а не внутренняя логическая ошибка сервиса.
- Но текущий код отвечает слишком “шумно” и может перегружать лог/фоновые jobs.

### Где править

- `server_fastapi/app/services/tinkoff_client.py`
- `server_fastapi/app/scheduler.py`
- `server_fastapi/app/core/config.py` (+ env переменные)

### Конкретные правки

- [ ] Ввести **circuit breaker / cooldown** на Tinkoff client (например, при серии сетевых ошибок 1-3 мин не дергать провайдера, отдавать degraded ответ сразу).
- [ ] Разделить retry policy:
  - для `503/502/504` — больше backoff;
  - для `ConnectTimeout/ReadTimeout` — ограниченный retry + jitter.
- [ ] Добавить **rate-limit логов** (dedupe одинаковых ошибок по path за окно), чтобы не засыпать ERROR-уровень.
- [ ] В scheduler-джобах с внешними вызовами возвращать `degraded=true` без падения job, если upstream недоступен.
- [ ] Вынести таймауты/ретраи в env (`TINKOFF_TIMEOUT_*`, `TINKOFF_MAX_RETRIES`, `TINKOFF_CB_*`) для быстрой настройки без релиза.

### Критерий приемки

- При недоступности Tinkoff нет лавины одинаковых ERROR.
- Scheduler не “краснеет” сплошными падениями; jobs завершаются в degraded-режиме.

---

## C. `ConnectionClosedError ... keepalive ping timeout` (P2)

### Симптом

- Периодические ошибки от websocket keepalive timeout.

### Интерпретация

- Чаще всего это разрыв клиентского websocket (вкладка уснула, сеть дернулась, proxy idle timeout).
- Это не равно аварии backend, но сейчас выглядит как ERROR-шум.

### Где править

- `server_fastapi/app/api/v1/system.py` (`/ws/system-status`)
- Лог-конфиг сервиса (уровни для websocket-disconnect noise)

### Конкретные правки

- [ ] Явно ловить и понижать уровень логирования ожидаемых разрывов (`WebSocketDisconnect`, keepalive timeout кейсы) до `INFO/DEBUG`.
- [ ] Добавить heartbeat/ping настройки на уровне reverse proxy (если есть Nginx/Ingress), чтобы idle websocket не рубился слишком агрессивно.
- [ ] Добавить метрику `ws_disconnect_reason` (для наблюдаемости, а не ERROR-спама).

### Критерий приемки

- Ошибки keepalive перестают доминировать ERROR-лог.
- В случае реального сбоя остаются только meaningful websocket ошибки.

---

## 3) Что НЕ надо чинить сейчас

- [ ] `AnalyticsService/GetAnalystRecommendations 404` — это ожидаемый fallback-сценарий для legacy endpoint, не P0.
- [ ] Единичные `ConnectionClosedError` без влияния на API/jobs — не блокер релиза.

---

## 4) Порядок внедрения (реально)

### Шаг 1 (сегодня)

- Развести cron `training_quick` и `weekly_generation`.
- Временно отключить inline-prune raw lightning dirs.
- Проверить утро 08:00 без падения `weekly_generation`.

### Шаг 2 (1-2 дня)

- Ввести training mutex в scheduler.
- Добавить fail-safe обработку отсутствующих `metrics.csv`.

### Шаг 3 (2-3 дня)

- Circuit breaker + rate-limited logging для Tinkoff client.
- Параметризация таймаутов/ретраев через env.

### Шаг 4 (параллельно)

- Понизить websocket disconnect noise и добавить метрики дисконнектов.

---

## 5) Быстрый чеклист в PR

- [ ] Нет конкуренции training jobs в одном time-slot.
- [ ] `weekly_generation` не падает на `metrics.csv`.
- [ ] Tinkoff outage не приводит к log storm.
- [ ] WS keepalive disconnect не логируется как системная авария.
- [ ] Все изменения покрыты smoke-тестом scheduler cron окна 08:00.

