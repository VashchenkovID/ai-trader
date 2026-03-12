import asyncio

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
    list_job_states,
    list_tasks,
    subscribe_status_stream,
    trigger_named_job,
    unsubscribe_status_stream,
)
from app.services.container import AppContainer

router = APIRouter(tags=["system"])


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


@router.get("/system/performance/metrics", summary="Метрики производительности системы")
@router.get("/performance/metrics", summary="Метрики производительности системы")
async def performance_metrics(request: Request) -> SuccessEnvelope[dict[str, object]]:
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


@router.get("/system/tasks/{task_id}", summary="Статус фоновой задачи")
async def system_task(task_id: str) -> SuccessEnvelope[dict[str, object]]:
    task = get_task(task_id)
    if task is None:
        raise AppError("NOT_FOUND", message="Task not found")
    return SuccessEnvelope(data=task)


@router.get("/system/scheduler/status", summary="Статусы cron-задач планировщика")
async def system_scheduler_status() -> SuccessEnvelope[dict[str, object]]:
    return SuccessEnvelope(data={"jobs": list_job_states()})


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
