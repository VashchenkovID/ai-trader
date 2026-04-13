import asyncio
from datetime import timedelta

from fastapi import APIRouter, Depends, Query, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_container
from app.core.errors import AppError
from app.core.error_registry import get_error_registry
from app.core.time_utils import iso_now_msk, now_msk
from app.db.models import Candle, Instrument, NewsItem, Recommendation, TradingRequest
from app.db.session import get_db_session
from app.core.config import get_settings
from app.schemas.envelope import SuccessEnvelope
from app.scheduler import (
    get_status_snapshot,
    get_task,
    list_core_training_analysis_jobs,
    list_job_states,
    list_tasks,
    prune_completed_tasks_and_broadcast,
    subscribe_status_stream,
    trigger_named_job,
    unsubscribe_status_stream,
)
from app.services.container import AppContainer

router = APIRouter(tags=["system"])

_KPI_WINDOWS: dict[str, timedelta] = {
    "24h": timedelta(hours=24),
    "7d": timedelta(days=7),
    "30d": timedelta(days=30),
}

_KPI_THRESHOLDS: dict[str, dict[str, float | int | str]] = {
    "coverage": {"good": 0.90, "warn": 0.75, "unit": "ratio", "direction": "higher_better"},
    "taskSuccessRate": {"good": 0.99, "warn": 0.95, "unit": "ratio", "direction": "higher_better"},
    "fallbackRate": {"good": 0.20, "warn": 0.35, "unit": "ratio", "direction": "lower_better"},
    "skippedNoSignalRate": {"good": 0.05, "warn": 0.10, "unit": "ratio", "direction": "lower_better"},
    "latencyP95Ms": {"good": 300_000, "warn": 900_000, "unit": "ms", "direction": "lower_better"},
}

_KPI_DEFINITIONS: list[dict[str, str]] = [
    {
        "key": "coverage",
        "title": "Покрытие сигналами",
        "formula": "recommendations_with_signal / total_instruments",
        "description": "Доля инструментов, где есть финальный сигнал BUY/SELL/HOLD за выбранное окно.",
    },
    {
        "key": "taskSuccessRate",
        "title": "Успешность задач анализа",
        "formula": "completed_tasks / total_tasks",
        "description": "Доля завершенных analysis_market_portfolio задач без ошибки.",
    },
    {
        "key": "fallbackRate",
        "title": "Доля fallback",
        "formula": "(nn_only + llm_only + skipped_no_signal) / total_targets",
        "description": "Чем ниже, тем чаще работает полноценный режим NN+LLM.",
    },
    {
        "key": "fusionModeShare",
        "title": "Распределение режимов fusion",
        "formula": "count(mode)/total_targets",
        "description": "Доли режимов nn_llm / nn_only / llm_only / skipped_no_signal.",
    },
    {
        "key": "latencyP95Ms",
        "title": "P95 длительности анализа",
        "formula": "p95(finished_at - started_at)",
        "description": "95-й перцентиль длительности задач analysis_market_portfolio.",
    },
]


def _safe_ratio(num: int, den: int) -> float:
    if den <= 0:
        return 0.0
    return round(float(num) / float(den), 6)


def _grade_metric(value: float, metric_key: str) -> str:
    threshold = _KPI_THRESHOLDS.get(metric_key) or {}
    good = float(threshold.get("good", 0))
    warn = float(threshold.get("warn", 0))
    direction = str(threshold.get("direction", "higher_better"))
    if direction == "higher_better":
        if value >= good:
            return "good"
        if value >= warn:
            return "warn"
        return "bad"
    if value <= good:
        return "good"
    if value <= warn:
        return "warn"
    return "bad"


def _as_float(value: object, default: float = 0.0) -> float:
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default


@router.get("/metrics", summary="Технические метрики приложения")
async def metrics(request: Request) -> SuccessEnvelope[dict[str, object]]:
    registry = request.app.state.metrics_registry
    return SuccessEnvelope(data={"routes": registry.snapshot()})


@router.get("/errors/demo", summary="Демо генерации ошибки")
async def demo_error(code: str = Query(default="INVALID_STATE_TRANSITION", min_length=3)) -> None:
    raise AppError(code)


@router.get("/system/status", summary="Сводный статус подсистем")
async def system_status(request: Request) -> SuccessEnvelope[dict[str, object]]:
    routes = request.app.state.metrics_registry.snapshot()
    snapshot = await get_status_snapshot()
    workers = snapshot.get("workers", {})
    scheduler_jobs = snapshot.get("scheduler", {})
    system = snapshot.get("system", {})
    active_training = any(
        str(v.get("status")) == "running"
        for k, v in scheduler_jobs.items()
        if k.startswith("training_") or k.startswith("weekly_")
    )
    active_analysis = any(
        str(v.get("status")) == "running"
        for k, v in scheduler_jobs.items()
        if "analysis" in k or "market" in k
    )
    return SuccessEnvelope(
        data={
            "neuralNetwork": {"status": "running" if active_training else "idle"},
            "websocket": {"status": "ready", "subscribers": len(snapshot.get("tasks", []))},
            "trading": {"status": "running" if active_analysis else "idle"},
            "tradingEngine": {"status": "running" if active_analysis else "idle"},
            "database": {"status": "connected"},
            "ensemble": {"status": "ready" if scheduler_jobs else "degraded"},
            "requestsObserved": sum(int(item["count"]) for item in routes.values()) if routes else 0,
            "workers": workers,
            "resources": {
                "cpuPercent": system.get("cpuPercent"),
                "ramPercent": system.get("ramPercent"),
                "pid": system.get("pid"),
            },
            "schedulerJobs": scheduler_jobs,
            "timestamp": now_msk(),
        }
    )


@router.get("/system/health", summary="Проверка состояния системы")
async def system_health() -> SuccessEnvelope[dict[str, object]]:
    return SuccessEnvelope(
        data={
            "status": "healthy",
            "timestamp": now_msk(),
            "version": "0.1.0",
        }
    )


@router.get("/system/settings", summary="Системные настройки")
async def system_settings(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=200, ge=1, le=1000),
    container: AppContainer = Depends(get_container),
) -> SuccessEnvelope[dict[str, object]]:
    items, total = container.settings_service.get_all(offset=offset, limit=limit)
    return SuccessEnvelope(data={"items": items, "meta": {"offset": offset, "limit": limit, "total": total}})


def _performance_metrics_payload(request: Request) -> SuccessEnvelope[dict[str, object]]:
    routes = request.app.state.metrics_registry.snapshot()
    route_count = sum(int(item["count"]) for item in routes.values()) if routes else 0
    error_count = sum(int(item["errorCount"]) for item in routes.values()) if routes else 0
    return SuccessEnvelope(
        data={
            "responseTime": 0,
            "throughput": route_count,
            "errorRate": 0 if route_count == 0 else round(error_count / route_count, 4),
            "cacheHitRate": 0,
        }
    )


@router.get(
    "/system/performance/metrics",
    summary="Метрики производительности системы",
)
async def performance_metrics(request: Request) -> SuccessEnvelope[dict[str, object]]:
    """Канонический путь; алиас `/performance/metrics` помечен deprecated."""
    return _performance_metrics_payload(request)


@router.get(
    "/performance/metrics",
    summary="Метрики производительности (deprecated)",
    deprecated=True,
    description="Используйте GET /api/v1/system/performance/metrics. Путь сохранён для обратной совместимости.",
)
async def performance_metrics_deprecated_alias(request: Request) -> SuccessEnvelope[dict[str, object]]:
    return _performance_metrics_payload(request)


@router.get("/system/performance/baseline", summary="Базовые целевые показатели производительности")
async def performance_baseline(request: Request) -> SuccessEnvelope[dict[str, object]]:
    routes = request.app.state.metrics_registry.snapshot()
    route_count = sum(int(item["count"]) for item in routes.values()) if routes else 0
    error_count = sum(int(item["errorCount"]) for item in routes.values()) if routes else 0
    return SuccessEnvelope(
        data={
            "baseline": {
                "requestCount": route_count,
                "errorCount": error_count,
                "errorRate": 0 if route_count == 0 else round(error_count / route_count, 4),
                "observedRoutes": len(routes),
            },
            "targets": {
                "p95LatencyMs": 500,
                "errorRate": 0.01,
            },
            "timestamp": now_msk(),
        }
    )


class OpsModeBody(BaseModel):
    mode: str = Field(..., description="normal | shadow | canary | rollback")


class CanaryBody(BaseModel):
    percent: int = Field(..., ge=0, le=100, description="Доля canary-трафика в процентах")


@router.get("/system/ops/status", summary="Текущий операционный режим cutover")
async def ops_status(container: AppContainer = Depends(get_container)) -> SuccessEnvelope[dict[str, object]]:
    return SuccessEnvelope(data=container.ops_service.get_status())


@router.post("/system/ops/mode", summary="Переключить операционный режим cutover")
async def ops_set_mode(
    body: OpsModeBody,
    container: AppContainer = Depends(get_container),
) -> SuccessEnvelope[dict[str, object]]:
    try:
        data = container.ops_service.set_mode(body.mode)
    except ValueError as e:
        raise AppError("BAD_REQUEST", message=str(e))
    return SuccessEnvelope(data=data)


@router.post("/system/ops/canary", summary="Включить canary и задать процент")
async def ops_set_canary(
    body: CanaryBody,
    container: AppContainer = Depends(get_container),
) -> SuccessEnvelope[dict[str, object]]:
    try:
        data = container.ops_service.set_canary_percent(body.percent)
    except ValueError as e:
        raise AppError("BAD_REQUEST", message=str(e))
    return SuccessEnvelope(data=data)


@router.post("/system/ops/rollback", summary="Экстренный rollback режим (блокирует write)")
async def ops_rollback(container: AppContainer = Depends(get_container)) -> SuccessEnvelope[dict[str, object]]:
    data = container.ops_service.set_mode("rollback")
    return SuccessEnvelope(data=data)


@router.post("/system/ops/backup", summary="Создать snapshot перед cutover/rollback")
async def ops_backup(
    container: AppContainer = Depends(get_container),
    db_session: AsyncSession = Depends(get_db_session),
) -> SuccessEnvelope[dict[str, object]]:
    async def _safe_count(stmt) -> int:
        try:
            return int(await db_session.scalar(stmt) or 0)
        except Exception:
            return 0

    payload = {
        "counts": {
            "instruments": await _safe_count(select(func.count(Instrument.id))),
            "recommendations": await _safe_count(select(func.count(Recommendation.id))),
            "tradingRequests": await _safe_count(select(func.count(TradingRequest.id))),
            "candles": await _safe_count(select(func.count(Candle.id))),
            "newsItems": await _safe_count(select(func.count(NewsItem.id))),
        },
        "generatedAt": iso_now_msk(),
    }
    path = container.ops_service.create_backup_snapshot(get_settings().cutover_backup_dir, payload)
    return SuccessEnvelope(data={"backupPath": path, "snapshot": payload})


class TriggerResponse(SuccessEnvelope[dict[str, object]]):
    pass


@router.get("/system/tasks", summary="Список фоновых задач")
async def system_tasks(limit: int = Query(default=100, ge=1, le=1000)) -> SuccessEnvelope[dict[str, object]]:
    return SuccessEnvelope(data={"items": list_tasks(limit=limit), "meta": {"limit": limit}})


@router.post("/system/tasks/prune-completed", summary="Удалить завершённые задачи из памяти планировщика")
async def system_tasks_prune_completed() -> SuccessEnvelope[dict[str, object]]:
    data = await prune_completed_tasks_and_broadcast()
    return SuccessEnvelope(data=data)


@router.get("/system/tasks/{task_id}", summary="Статус фоновой задачи")
async def system_task(task_id: str) -> SuccessEnvelope[dict[str, object]]:
    task = get_task(task_id)
    if task is None:
        return SuccessEnvelope(
            data={
                "taskId": task_id,
                "taskType": "unknown",
                "status": "not_found",
                "errorCode": "TASK_NOT_FOUND",
                "timing": {
                    "queuedAt": None,
                    "startedAt": None,
                    "finishedAt": None,
                    "durationMs": None,
                },
                "error": "Task not found (possibly evicted or service restarted)",
            }
        )
    return SuccessEnvelope(data=task)


@router.get("/system/scheduler/status", summary="Статусы cron-задач планировщика")
async def system_scheduler_status() -> SuccessEnvelope[dict[str, object]]:
    return SuccessEnvelope(
        data={
            "jobs": list_job_states(),
            "coreTrainingAnalysisJobs": list_core_training_analysis_jobs(),
        }
    )


@router.get("/system/errors/registry", summary="Файловый реестр ошибок приложения")
async def system_errors_registry(limit: int = Query(default=100, ge=1, le=1000)) -> SuccessEnvelope[dict[str, object]]:
    items = await get_error_registry().list_top(limit=limit)
    return SuccessEnvelope(data={"items": items, "meta": {"limit": limit, "total": len(items)}})


@router.post("/system/cache/update", summary="Фоновый запуск cache update")
async def system_cache_update() -> TriggerResponse:
    return TriggerResponse(data=trigger_named_job("cache_update"))


@router.post("/system/cache/full-update", summary="Фоновый запуск полного cache update")
async def system_cache_full_update() -> TriggerResponse:
    return TriggerResponse(data=trigger_named_job("cache_full_update"))


@router.post("/system/data/full-sync-year", summary="Фоновая полная загрузка данных за год")
async def system_data_full_sync_year() -> TriggerResponse:
    return TriggerResponse(data=trigger_named_job("full_db_sync_year"))


@router.post("/system/training/quick", summary="Фоновый запуск быстрого обучения")
async def system_training_quick() -> TriggerResponse:
    return TriggerResponse(data=trigger_named_job("training_quick"))


@router.post("/system/training/full", summary="Фоновый запуск полного обучения")
async def system_training_full() -> TriggerResponse:
    return TriggerResponse(data=trigger_named_job("training_full"))


@router.post("/system/training/weekly-generation", summary="Фоновая генерация weekly forecast")
async def system_training_weekly_generation() -> TriggerResponse:
    return TriggerResponse(data=trigger_named_job("weekly_generation"))


@router.post("/system/training/weekly-update", summary="Фоновое обновление weekly forecast")
async def system_training_weekly_update() -> TriggerResponse:
    return TriggerResponse(data=trigger_named_job("weekly_update"))


@router.post("/assets/sync", summary="Фоновая синхронизация ассетов")
async def assets_sync() -> TriggerResponse:
    return TriggerResponse(data=trigger_named_job("assets_sync"))


@router.post("/fundamental-data/sync-and-fill", summary="Фоновый sync+fill фундаментала")
async def fundamental_sync_and_fill() -> TriggerResponse:
    return TriggerResponse(data=trigger_named_job("fundamental_sync_and_fill"))


@router.post("/fundamental-data/fill-all", summary="Фоновое заполнение фундаментала")
async def fundamental_fill_all() -> TriggerResponse:
    return TriggerResponse(data=trigger_named_job("fundamental_fill_all"))


@router.post("/macro-data/update", summary="Фоновое обновление макро данных")
async def macro_update() -> TriggerResponse:
    return TriggerResponse(data=trigger_named_job("macro_update"))


@router.post("/macro-data/load-indices", summary="Фоновая загрузка рыночных индексов")
async def macro_load_indices() -> TriggerResponse:
    return TriggerResponse(data=trigger_named_job("macro_load_indices"))


@router.post("/signals/update", summary="Фоновое обновление сигналов")
async def signals_update() -> TriggerResponse:
    return TriggerResponse(data=trigger_named_job("signals_update"))


@router.post("/options-data/update-all", summary="Фоновое обновление опционных данных")
async def options_update_all() -> TriggerResponse:
    return TriggerResponse(data=trigger_named_job("options_update"))


@router.post("/trading-windows/update", summary="Фоновое обновление торговых окон")
async def trading_windows_update() -> TriggerResponse:
    return TriggerResponse(data=trigger_named_job("trading_windows_update"))


@router.post("/system/price-loops/portfolio", summary="Фоновый price-loop портфеля")
async def portfolio_prices_update() -> TriggerResponse:
    return TriggerResponse(data=trigger_named_job("portfolio_prices_update"))


@router.post("/system/price-loops/signals", summary="Фоновый price-loop активных сигналов")
async def signals_prices_update() -> TriggerResponse:
    return TriggerResponse(data=trigger_named_job("active_signals_prices_update"))


@router.post("/system/price-loops/trading-requests", summary="Фоновый price-loop торговых заявок")
async def trading_requests_prices_update() -> TriggerResponse:
    return TriggerResponse(data=trigger_named_job("trading_requests_prices_update"))


@router.post("/system/analysis/market-portfolio", summary="Фоновый анализ рынка и портфеля")
async def analysis_market_portfolio() -> TriggerResponse:
    return TriggerResponse(data=trigger_named_job("analysis_market_portfolio"))


@router.post(
    "/system/analysis/portfolio-positions",
    summary="Фоновый анализ открытых позиций по всем портфелям (BUY/SELL/HOLD)",
)
async def analysis_portfolio_positions() -> TriggerResponse:
    return TriggerResponse(data=trigger_named_job("analysis_portfolio_positions"))


@router.get("/system/analysis/kpi", summary="KPI-отчет по эффективности анализа NN+LLM")
async def analysis_kpi(
    window: str = Query(default="7d", pattern="^(24h|7d|30d)$"),
    db_session: AsyncSession = Depends(get_db_session),
) -> SuccessEnvelope[dict[str, object]]:
    delta = _KPI_WINDOWS.get(window, _KPI_WINDOWS["7d"])
    since_dt = now_msk() - delta

    instruments_total = int(await db_session.scalar(select(func.count(Instrument.id))) or 0)
    rec_total = int(
        await db_session.scalar(
            select(func.count(Recommendation.id)).where(Recommendation.analysis_date >= since_dt)
        )
        or 0
    )

    rec_with_payload = int(
        await db_session.scalar(
            select(func.count(Recommendation.id)).where(
                Recommendation.analysis_date >= since_dt,
                Recommendation.llm_jury_payload.is_not(None),
            )
        )
        or 0
    )
    rec_with_nn = int(
        await db_session.scalar(
            select(func.count(Recommendation.id)).where(
                Recommendation.analysis_date >= since_dt,
                Recommendation.nn_score.is_not(None),
            )
        )
        or 0
    )

    tasks = list_tasks(limit=1000)
    analysis_tasks = [
        t for t in tasks if str(t.get("taskType") or "") == "analysis_market_portfolio"
    ]
    analysis_tasks = [
        t
        for t in analysis_tasks
        if str(t.get("queuedAt") or "") >= since_dt.isoformat()
    ]
    total_tasks = len(analysis_tasks)
    completed_tasks = sum(1 for t in analysis_tasks if str(t.get("status") or "") == "completed")
    failed_tasks = sum(1 for t in analysis_tasks if str(t.get("status") or "") in {"failed", "timeout"})

    mode_counts = {"nn_llm": 0, "nn_only": 0, "llm_only": 0, "none": 0}
    skipped_no_signal = 0
    llm_unavailable = 0
    llm_daily = 0
    llm_cache_hits = 0
    llm_calls_saved = 0
    canary_processed = 0
    canary_skipped = 0
    durations_ms: list[int] = []

    for task in analysis_tasks:
        started = task.get("startedAt")
        finished = task.get("finishedAt")
        if isinstance(started, str) and isinstance(finished, str) and started and finished:
            try:
                start_dt = started.replace("Z", "+00:00")
                finish_dt = finished.replace("Z", "+00:00")
                from datetime import datetime

                sdt = datetime.fromisoformat(start_dt)
                fdt = datetime.fromisoformat(finish_dt)
                durations_ms.append(max(0, int((fdt - sdt).total_seconds() * 1000)))
            except Exception:
                pass
        result = task.get("result")
        if not isinstance(result, dict):
            continue
        mode_counts["nn_llm"] += int(result.get("fusionBoth") or 0)
        mode_counts["nn_only"] += int(result.get("fusionNnOnly") or 0)
        mode_counts["llm_only"] += int(result.get("fusionLlmOnly") or 0)
        skipped_no_signal += int(result.get("skippedNoSignal") or 0)
        llm_unavailable += int(result.get("skippedUnavailable") or 0)
        llm_daily += int(result.get("skippedDaily") or 0)
        llm_cache_hits += int(result.get("llmCacheHits") or 0)
        llm_calls_saved += int(result.get("llmCallsSaved") or 0)
        canary_processed += int(result.get("canaryProcessed") or 0)
        canary_skipped += int(result.get("canarySkipped") or 0)

    total_targets = mode_counts["nn_llm"] + mode_counts["nn_only"] + mode_counts["llm_only"] + skipped_no_signal
    coverage = _safe_ratio(rec_total, instruments_total)
    task_success = _safe_ratio(completed_tasks, total_tasks)
    fallback_rate = _safe_ratio(
        mode_counts["nn_only"] + mode_counts["llm_only"] + skipped_no_signal,
        total_targets,
    )
    skipped_no_signal_rate = _safe_ratio(skipped_no_signal, total_targets)
    nn_llm_share = _safe_ratio(mode_counts["nn_llm"], total_targets)
    nn_only_share = _safe_ratio(mode_counts["nn_only"], total_targets)
    llm_only_share = _safe_ratio(mode_counts["llm_only"], total_targets)
    skipped_share = _safe_ratio(skipped_no_signal, total_targets)

    sorted_durations = sorted(durations_ms)
    if sorted_durations:
        idx95 = min(len(sorted_durations) - 1, max(0, int(round((len(sorted_durations) - 1) * 0.95))))
        latency_p95_ms = sorted_durations[idx95]
    else:
        latency_p95_ms = 0

    # Прокси-метрики качества до появления полного post-trade контура оценки PnL/hit-rate.
    direction_accuracy_nn = _safe_ratio(mode_counts["nn_llm"] + mode_counts["nn_only"], total_targets)
    direction_accuracy_llm = _safe_ratio(mode_counts["nn_llm"] + mode_counts["llm_only"], total_targets)
    direction_accuracy_fusion = _safe_ratio(
        mode_counts["nn_llm"] + mode_counts["nn_only"] + mode_counts["llm_only"],
        total_targets,
    )
    brier_score_proxy = round(1.0 - min(1.0, max(0.0, direction_accuracy_fusion)), 6)
    ece_proxy = round(abs(direction_accuracy_fusion - task_success), 6)
    marginal_gain_llm_over_nn = round(direction_accuracy_fusion - direction_accuracy_nn, 6)

    # Post-trade feedback loop (первый шаг): агрегаты по исполненным заявкам.
    trade_rows = (
        await db_session.execute(
            select(
                TradingRequest.status,
                TradingRequest.action,
                TradingRequest.actual_amount,
                TradingRequest.budget,
            ).where(TradingRequest.created_at >= since_dt)
        )
    ).all()
    executed_rows = [r for r in trade_rows if str(r[0] or "").upper() == "EXECUTED"]
    win_amount = 0.0
    loss_amount = 0.0
    hit_count = 0
    for status, action, actual_amount, budget in executed_rows:
        amt = _as_float(actual_amount, 0.0)
        bgt = _as_float(budget, 0.0)
        pnl = amt - bgt if str(action or "").upper() == "BUY" else bgt - amt
        if pnl >= 0:
            hit_count += 1
            win_amount += pnl
        else:
            loss_amount += abs(pnl)
    hit_rate_post_trade = _safe_ratio(hit_count, len(executed_rows))
    pnl_per_signal = round((win_amount - loss_amount) / max(1, len(executed_rows)), 6)
    profit_factor = round(win_amount / max(1e-9, loss_amount), 6) if loss_amount > 0 else float(win_amount > 0)

    metric_cards = [
        {"key": "coverage", "value": coverage, "grade": _grade_metric(coverage, "coverage")},
        {
            "key": "taskSuccessRate",
            "value": task_success,
            "grade": _grade_metric(task_success, "taskSuccessRate"),
        },
        {
            "key": "fallbackRate",
            "value": fallback_rate,
            "grade": _grade_metric(fallback_rate, "fallbackRate"),
        },
        {
            "key": "skippedNoSignalRate",
            "value": skipped_no_signal_rate,
            "grade": _grade_metric(skipped_no_signal_rate, "skippedNoSignalRate"),
        },
        {
            "key": "latencyP95Ms",
            "value": latency_p95_ms,
            "grade": _grade_metric(float(latency_p95_ms), "latencyP95Ms"),
        },
    ]

    alerts: list[dict[str, object]] = []
    for card in metric_cards:
        if card["grade"] == "bad":
            alerts.append(
                {
                    "metric": card["key"],
                    "severity": "critical",
                    "message": f"KPI '{card['key']}' вышел за допустимые пределы",
                    "value": card["value"],
                    "window": window,
                }
            )
        elif card["grade"] == "warn":
            alerts.append(
                {
                    "metric": card["key"],
                    "severity": "warning",
                    "message": f"KPI '{card['key']}' близок к границе SLO",
                    "value": card["value"],
                    "window": window,
                }
            )

    return SuccessEnvelope(
        data={
            "window": window,
            "generatedAt": now_msk(),
            "definitions": _KPI_DEFINITIONS,
            "thresholds": _KPI_THRESHOLDS,
            "report": {
                "summary": {
                    "totalInstruments": instruments_total,
                    "recommendationsTotal": rec_total,
                    "recommendationsWithPayload": rec_with_payload,
                    "recommendationsWithNn": rec_with_nn,
                    "tasksTotal": total_tasks,
                    "tasksCompleted": completed_tasks,
                    "tasksFailed": failed_tasks,
                    "latencyP95Ms": latency_p95_ms,
                },
                "quality": {
                    "directionAccuracyNn": direction_accuracy_nn,
                    "directionAccuracyLlm": direction_accuracy_llm,
                    "directionAccuracyFusion": direction_accuracy_fusion,
                    "brierScore": brier_score_proxy,
                    "ece": ece_proxy,
                    "liftVsBaseline": round(direction_accuracy_fusion - 0.5, 6),
                },
                "fusion": {
                    "modeShare": {
                        "nnLlm": nn_llm_share,
                        "nnOnly": nn_only_share,
                        "llmOnly": llm_only_share,
                        "skippedNoSignal": skipped_share,
                    },
                    "fallbackRate": fallback_rate,
                    "marginalGainLlmOverNn": marginal_gain_llm_over_nn,
                    "llmSkippedDaily": llm_daily,
                    "llmSkippedUnavailable": llm_unavailable,
                    "llmCacheHits": llm_cache_hits,
                    "llmCallsSaved": llm_calls_saved,
                    "canaryProcessed": canary_processed,
                    "canarySkipped": canary_skipped,
                },
                "business": {
                    "postTrade": {
                        "executedSignals": len(executed_rows),
                        "hitRate": hit_rate_post_trade,
                        "pnlPerSignal": pnl_per_signal,
                        "profitFactor": profit_factor,
                        "maxDrawdownProxy": round(loss_amount, 6),
                    }
                },
                "operability": {
                    "coverage": coverage,
                    "taskSuccessRate": task_success,
                    "skippedNoSignalRate": skipped_no_signal_rate,
                },
            },
            "alerts": {
                "items": alerts,
                "count": len(alerts),
            },
            "ui": {
                "periodOptions": ["24h", "7d", "30d"],
                "primaryCards": [
                    "coverage",
                    "taskSuccessRate",
                    "fallbackRate",
                    "latencyP95Ms",
                    "directionAccuracyFusion",
                    "marginalGainLlmOverNn",
                    "llmSkippedUnavailable",
                    "alertsCount",
                ],
            },
        }
    )


@router.post("/system/governance/weekly-backtest", summary="Фоновый weekly backtest")
async def governance_weekly_backtest() -> TriggerResponse:
    return TriggerResponse(data=trigger_named_job("weekly_backtest"))


@router.post("/system/governance/dynamic-budget", summary="Фоновый dynamic budget rebalance")
async def governance_dynamic_budget() -> TriggerResponse:
    return TriggerResponse(data=trigger_named_job("dynamic_budget_rebalance"))


@router.post("/system/governance/rebalancing", summary="Фоновый portfolio rebalancing")
async def governance_rebalancing() -> TriggerResponse:
    return TriggerResponse(data=trigger_named_job("portfolio_rebalancing"))


@router.post("/system/risk/position-monitoring", summary="Фоновый мониторинг позиций")
async def risk_position_monitoring() -> TriggerResponse:
    return TriggerResponse(data=trigger_named_job("position_monitoring"))


@router.post("/system/risk/partial-exit", summary="Фоновая проверка partial-exit")
async def risk_partial_exit() -> TriggerResponse:
    return TriggerResponse(data=trigger_named_job("partial_exit_check"))


@router.post("/system/risk/trailing-stops", summary="Фоновая проверка trailing-stops")
async def risk_trailing_stops() -> TriggerResponse:
    return TriggerResponse(data=trigger_named_job("trailing_stops_check"))


@router.get("/trading-windows/status", summary="Статус обновления торговых окон")
async def trading_windows_status() -> SuccessEnvelope[dict[str, object]]:
    tasks = list_tasks(limit=200)
    latest = next((t for t in tasks if t.get("taskType") == "trading_windows_update"), None)
    return SuccessEnvelope(data={"lastTask": latest})


@router.websocket("/ws/system-status")
async def system_status_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    queue = subscribe_status_stream()
    sequence = 0
    try:
        snapshot = await get_status_snapshot()
        await websocket.send_json(
            {"event": "system.snapshot", "sequence": sequence, "timestamp": iso_now_msk(), "payload": snapshot}
        )
        while True:
            try:
                message = await asyncio.wait_for(queue.get(), timeout=5.0)
                sequence += 1
                message["sequence"] = sequence
                await websocket.send_json(message)
            except asyncio.TimeoutError:
                sequence += 1
                heartbeat = await get_status_snapshot()
                await websocket.send_json(
                    {
                        "event": "system.heartbeat",
                        "sequence": sequence,
                        "timestamp": iso_now_msk(),
                        "payload": heartbeat,
                    }
                )
    except WebSocketDisconnect:
        pass
    finally:
        unsubscribe_status_stream(queue)
