# Cutover And Rollback Runbook

## Статус миграции (на 2026-03-06)

- Реализован операционный контур в API: `GET/POST /api/v1/system/ops/*`.
- Добавлены режимы `normal | shadow | canary | rollback` и write-gates на middleware.
- Добавлен backup snapshot endpoint: `POST /api/v1/system/ops/backup`.
- Практический production-cutover еще не проводился; runbook готов для dry-run.

## Pre-cutover checklist

- Contract tests green.
- P0 integration tests green.
- Observability dashboards ready.
- Rollback artifacts prepared.

## Cutover steps (dry-run / production)

1. Enable shadow traffic.
2. Compare error/latency deltas.
3. Start canary (10% -> 50% -> 100%).
4. Validate critical flows in real-time.
5. Freeze non-critical deploys for 24h.

### Команды управления режимом

- Shadow: `POST /api/v1/system/ops/mode` body `{ "mode": "shadow" }`
- Canary: `POST /api/v1/system/ops/canary` body `{ "percent": 10 }`
- Rollback: `POST /api/v1/system/ops/rollback`
- Проверка режима: `GET /api/v1/system/ops/status`
- Snapshot: `POST /api/v1/system/ops/backup`

## Rollback triggers

- P0 flow regression.
- 5xx spike above threshold.
- Data corruption risk.
- Unrecoverable dependency failure.

## Rollback steps

1. Route traffic back to Node.
2. Disable FastAPI write endpoints.
3. Execute data consistency checks.
4. Create incident report with root cause.

### Техническое применение rollback в FastAPI

1. Включить режим rollback через `POST /api/v1/system/ops/rollback`.
2. Убедиться, что write-операции возвращают `503 SERVICE_UNAVAILABLE`.
3. Снять snapshot `POST /api/v1/system/ops/backup`.
4. После стабилизации вернуть `normal` через `POST /api/v1/system/ops/mode`.

## Плейбук "день cutover" (PowerShell)

Ниже — практический сценарий dry-run/production-cutover для одного оператора.

### 0) Подготовка

```powershell
cd "c:\Users\Фронтендер3000\projects\ai-trader\server_fastapi"
.\.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Проверка базовой доступности:

```powershell
Invoke-RestMethod -Method GET -Uri "http://localhost:8000/health"
Invoke-RestMethod -Method GET -Uri "http://localhost:8000/api/v1/system/ops/status"
```

Ожидаемо: `status=ok`, `mode=normal`.

### 1) Снять pre-cutover snapshot

```powershell
$backup = Invoke-RestMethod -Method POST -Uri "http://localhost:8000/api/v1/system/ops/backup"
$backup.data.backupPath
```

Ожидаемо: путь к JSON snapshot, содержащий `counts` по ключевым таблицам.

### 2) Shadow режим (write block)

```powershell
Invoke-RestMethod -Method POST -Uri "http://localhost:8000/api/v1/system/ops/mode" -ContentType "application/json" -Body '{"mode":"shadow"}'
```

Проверка, что write-операции блокируются:

```powershell
try {
  Invoke-RestMethod -Method POST -Uri "http://localhost:8000/api/v1/recommendation-pipeline/run"
} catch {
  $_.Exception.Response.StatusCode.value__
}
```

Ожидаемо: HTTP `503`, режим `shadow`.

### 3) Canary rollout

10%:

```powershell
Invoke-RestMethod -Method POST -Uri "http://localhost:8000/api/v1/system/ops/canary" -ContentType "application/json" -Body '{"percent":10}'
```

50%:

```powershell
Invoke-RestMethod -Method POST -Uri "http://localhost:8000/api/v1/system/ops/canary" -ContentType "application/json" -Body '{"percent":50}'
```

100%:

```powershell
Invoke-RestMethod -Method POST -Uri "http://localhost:8000/api/v1/system/ops/canary" -ContentType "application/json" -Body '{"percent":100}'
```

После каждого шага:

```powershell
Invoke-RestMethod -Method GET -Uri "http://localhost:8000/api/v1/system/ops/status"
Invoke-RestMethod -Method GET -Uri "http://localhost:8000/api/v1/metrics"
Invoke-RestMethod -Method GET -Uri "http://localhost:8000/api/v1/system/performance/metrics"
```

Критерии продолжения:
- нет всплеска `5xx`;
- нет деградации latency выше согласованного порога;
- критичные флоу проходят smoke-проверку.

### 4) Финализация cutover

Перевести в штатный режим:

```powershell
Invoke-RestMethod -Method POST -Uri "http://localhost:8000/api/v1/system/ops/mode" -ContentType "application/json" -Body '{"mode":"normal"}'
Invoke-RestMethod -Method GET -Uri "http://localhost:8000/api/v1/system/ops/status"
```

Ожидаемо: `mode=normal`, `writeEnabled=true`.

### 5) Аварийный rollback (если сработал триггер)

```powershell
Invoke-RestMethod -Method POST -Uri "http://localhost:8000/api/v1/system/ops/rollback"
Invoke-RestMethod -Method POST -Uri "http://localhost:8000/api/v1/system/ops/backup"
Invoke-RestMethod -Method GET -Uri "http://localhost:8000/api/v1/system/ops/status"
```

Ожидаемо: `mode=rollback`, write-операции блокируются (`503`), snapshot сохранён.

